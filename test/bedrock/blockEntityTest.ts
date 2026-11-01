import assert from 'assert'
import type { Block } from 'prismarine-block'
import nbt from 'prismarine-nbt'
import type { NBT, Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld, stoneFloor } from './common/world.ts'
import type { BlockAt, BlockProperties } from './common/world.ts'

// Block entities, grouped by how the version's servers send them: in a whole column up to 1.17.40; after the blocks of
// a section asked for from 1.18.0 (in a request whose shape changed at 1.18.11, a section of air without a payload
// from 1.26.40); and in block_entity_data, whose position's y is a varint up to 1.26.0 and a zigzag varint after.

type Point = readonly [number, number, number]
type Compound = Record<string, undefined | Tags[TagType]>
/** a blockEntityData event: the block's name and position, and its block entity (null for no block) */
type Told = readonly [string, string, object | undefined] | null

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

// the columns of the test world: the player's, and the one of the chest recorded on 1.26.60
const COLUMNS = Object.freeze([[0, 0], [0, 1]] as const)

/** a block entity as servers write it: its id, its position and `fields` */
function tagOf (id: string, [x, y, z]: Point, fields: Compound = {}): NBT {
  return { type: 'compound', name: '', value: { id: string(id), ...fields, x: int(x), y: int(y), z: int(z) } }
}

/** a chest's block entity, as servers wrote it up to 1.26.51 */
function chestTag (at: Point): NBT {
  return tagOf('Chest', at, { isMovable: byte(1) })
}

/** the block entity simplified, as `block.blockEntity` gives it */
function chestEntity ([x, y, z]: Point): object {
  return { id: 'Chest', isMovable: 1, x, y, z }
}

/** the block entity of the block at `point`; null where no block shows */
function blockEntityAt (bot: BedrockBot, [x, y, z]: Point): object | undefined | null {
  const block = bot.blockAt(new Vec3(x, y, z))
  return block === null ? null : block.blockEntity
}

/** the blockEntityData events of the frames `step` steps */
async function toldOf (bot: BedrockBot, step: () => Promise<void>): Promise<Told[]> {
  const told: Told[] = []
  const blockEntityData = (block: Block | null): void => { told.push(block === null ? null : [block.name, block.position.toString(), block.blockEntity]) }
  bot.on('blockEntityData', blockEntityData)
  await step()
  bot.off('blockEntityData', blockEntityData)
  return told
}

/** a bot shown the test world's columns, with `blocks` */
async function loaded (codec: BedrockCodec, blocks: readonly BlockAt[] = []): Promise<TestBot & { world: ServerWorld }> {
  const testBot = await bedrockTestBot(codec)
  const world = new ServerWorld(testBot.server)
  world.startGame()
  world.spawn()
  for (const [x, z] of COLUMNS) world.column(x, z, [...stoneFloor(x, z), ...blocks.filter(([bx, , bz]) => bx >> 4 === x && bz >> 4 === z)])
  await world.load(testBot.driver, COLUMNS)
  return { ...testBot, world }
}

/** update_block, as the version writes it */
function updateBlock ({ server }: TestBot, [x, y, z]: Point, stateId: number): void {
  if (isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.210')) server.send('update_block', { position: { x, y, z }, block_runtime_id: stateId, layer: 0 })
  else server.send('update_block', { coordinates: { x, y, z }, block_runtime_id: stateId, block_priority: 3, storage: 0 })
}

/** a varint of a zigzag varint's (positive) value */
function zigzag (value: number): number[] {
  const bytes: number[] = []
  let left = value * 2
  while (left > 0x7f) {
    bytes.push((left & 0x7f) | 0x80)
    left = Math.floor(left / 128)
  }
  return [...bytes, left]
}

/**
 * a subchunk answering section (x, y, z) unasked, as the version's servers answer: air as a section of air on 1.18.0,
 * as all air after, without a payload from 1.26.40
 */
function sendSection ({ server }: TestBot, world: ServerWorld, [x, y, z]: Point, payload: Buffer | undefined): void {
  const version = server.codec.version
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.18.11')) {
    // version 9, one layer of one state
    const air = Buffer.from([9, 1, y, 1, ...zigzag(world.stateId('air'))])
    server.send('subchunk', { dimension: 0, x, y, z, data: payload ?? air, request_result: 'success', heightmap_type: 'no_data' })
  } else if (!isBedrockVersionAtLeast(version, 'bedrock_1.21.90')) {
    const entry = payload === undefined ? { result: 'success_all_air', payload: Buffer.alloc(0) } as const : { result: 'success', payload } as const
    server.send('subchunk', { cache_enabled: false, dimension: 0, origin: { x, y, z }, entries: [{ dx: 0, dy: 0, dz: 0, ...entry, heightmap_type: 'no_data' }] })
  } else {
    const empty = isBedrockVersionAtLeast(version, 'bedrock_1.26.40') ? {} : { payload: Buffer.alloc(0) }
    const entry = payload === undefined ? { result: 'success_all_air', ...empty } as const : { result: 'success', payload } as const
    server.send('subchunk', { cache_enabled: false, dimension: 0, origin: { x, y, z }, entries: [{ dx: 0, dy: 0, dz: 0, ...entry, heightmap_type: 'no_data', render_heightmap_type: 'no_data' }] })
  }
}

/** a recorded block_entity_data: its bytes, the block it names and its block entity, simplified */
interface Recorded {
  readonly hex: string
  readonly at: Point
  readonly entity: object
}

/** the block entity of a recorded block_entity_data at a block shows in the packet pass, emitting blockEntityData */
async function tellsInThePacketPass (codec: BedrockCodec, chest: Recorded): Promise<void> {
  const testBot = await loaded(codec, [[...chest.at, 'chest']])
  const { bot, server, driver } = testBot
  assert.strictEqual(blockEntityAt(bot, chest.at), undefined)
  const told = await toldOf(bot, async () => {
    server.receive(Buffer.from(chest.hex, 'hex'))
    await driver.frame(0)
  })
  assert.deepStrictEqual(told, [['chest', new Vec3(...chest.at).toString(), chest.entity]])
  assert.deepStrictEqual(blockEntityAt(bot, chest.at), chest.entity)
}

/**
 * at a block set to `block`, a recorded block entity without an id (`partial`) is held as told, one naming its id
 * replaces it, and `partial` again adds its fields to that; the block `changed` keeps it, and air removes it
 */
async function mergesWithoutAnId (codec: BedrockCodec, partial: Recorded, block: string, id: string, [changed, properties]: readonly [string, BlockProperties?]): Promise<void> {
  const testBot = await loaded(codec)
  const { bot, server, driver, world } = testBot
  const [x, y, z] = partial.at
  const told = await toldOf(bot, async () => {
    updateBlock(testBot, partial.at, world.stateId(block))
    server.receive(Buffer.from(partial.hex, 'hex'))
    await driver.frame(0)
    server.send('block_entity_data', { position: { x, y, z }, nbt: tagOf(id, partial.at, { CustomName: string('told') }) })
    await driver.frame(0)
    server.receive(Buffer.from(partial.hex, 'hex'))
    await driver.frame(0)
  })
  const at = new Vec3(x, y, z).toString()
  const withId = { id, x, y, z, CustomName: 'told' }
  assert.deepStrictEqual(told, [[block, at, partial.entity], [block, at, withId], [block, at, { ...withId, ...partial.entity }]])
  updateBlock(testBot, partial.at, world.stateId(changed, properties))
  await driver.frame(0)
  assert.deepStrictEqual(blockEntityAt(bot, partial.at), { ...withId, ...partial.entity })
  const updates: Array<object | undefined> = []
  bot.once(`blockUpdate:(${x}, ${y}, ${z})`, (oldBlock: Block, newBlock: Block) => { updates.push(oldBlock.blockEntity, newBlock.blockEntity) })
  updateBlock(testBot, partial.at, world.stateId('air'))
  await driver.frame(0)
  assert.deepStrictEqual([blockEntityAt(bot, partial.at), ...updates], [undefined, undefined, undefined])
}

// 1.16.201.2 dump_layouts: a chest at (2, 4, 0)
const CHEST_1_16_201: Recorded = {
  hex: '380404000a0008026964054368657374010969734d6f7661626c6501030178040301790803017a0000',
  at: [2, 4, 0],
  entity: chestEntity([2, 4, 0])
}

// 1.16.201.2 smoke: a furnace lit at (2, 4, 0), its fuel without its id
const FURNACE_1_16_201: Recorded = {
  hex: '380404000a00080a437573746f6d4e616d65000a084c6173744675656c0105436f756e7401020644616d616765000008044e616d650e6d696e6563726166743a636f616c010b5761735069636b65645570000000',
  at: [2, 4, 0],
  entity: { CustomName: '', LastFuel: { Count: 1, Damage: 0, Name: 'minecraft:coal', WasPickedUp: 0 } }
}

describe('bedrock block entities', () => {
  describe('servers sending whole columns, block_entity_data\'s y a varint (up to 1.17.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40')) {
      it(`bedrock ${version}: reads the block entities after a column's blocks, emitting no blockEntityData`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        world.spawn()
        world.column(0, 0, [...stoneFloor(0, 0), [2, 12, 0, 'chest']]).addBlockEntity(chestTag([2, 12, 0]))
        const told = await toldOf(bot, async () => { await world.load(driver, [[0, 0]]) })
        assert.deepStrictEqual([told, blockEntityAt(bot, [2, 12, 0]), blockEntityAt(bot, [1, 12, 0])], [[], chestEntity([2, 12, 0]), undefined])
      })

      it(`bedrock ${version}: shows the block entity of a block_entity_data in the packet pass, and merges one without its id`, async () => {
        const codec = bedrockCodec(version)
        await tellsInThePacketPass(codec, CHEST_1_16_201)
        await mergesWithoutAnId(codec, FURNACE_1_16_201, 'furnace', 'Furnace', ['lit_furnace'])
      })

      it(`bedrock ${version}: writes a block entity told for a column not shown yet without an event, and shows it with the column`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        world.spawn()
        world.column(0, 0, [...stoneFloor(0, 0), [2, 12, 0, 'chest']])
        const told = await toldOf(bot, async () => {
          await world.sendColumn(0, 0)
          server.send('block_entity_data', { position: { x: 2, y: 12, z: 0 }, nbt: chestTag([2, 12, 0]) })
          await driver.frame(0)
        })
        assert.deepStrictEqual([told, blockEntityAt(bot, [2, 12, 0])], [[], null])
        await driver.tick()
        assert.deepStrictEqual(blockEntityAt(bot, [2, 12, 0]), chestEntity([2, 12, 0]))
      })
    }
  })

  describe('servers sending each section with its block entities (1.18.0; the request\'s shape from 1.18.11 and 1.26.30, air without a payload from 1.26.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0')) {
      it(`bedrock ${version}: reads the block entities after a section's blocks, and the section answered again replaces them`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { bot, server, driver } = testBot
        const world = new ServerWorld(server)
        world.startGame()
        world.spawn()
        // section 0 of 6 states, section 1 with a second layer
        const blocks: BlockAt[] = [[2, 12, 0, 'chest'], [3, 12, 0, 'dirt'], [4, 12, 0, 'cobblestone'], [5, 12, 0, 'lectern'], [3, 20, 0, 'chest']]
        const column = world.column(0, 0, [...stoneFloor(0, 0), ...blocks])
        column.setBlockStateId({ x: 3, y: 20, z: 0, l: 1 }, world.stateId('water'))
        for (const at of [[2, 12, 0], [3, 20, 0]] as const) column.addBlockEntity(chestTag(at))
        const told = await toldOf(bot, async () => { await world.load(driver, [[0, 0]]) })
        assert.deepStrictEqual([told, blockEntityAt(bot, [2, 12, 0]), blockEntityAt(bot, [3, 20, 0])], [[], chestEntity([2, 12, 0]), chestEntity([3, 20, 0])])
        Reflect.deleteProperty(column.blockEntities, '2,12,0')
        const payload = await column.networkEncodeSubChunkNoCache(0)
        const again = await toldOf(bot, async () => {
          sendSection(testBot, world, [0, 0, 0], payload)
          await driver.tick()
        })
        assert.deepStrictEqual([again, blockEntityAt(bot, [2, 12, 0]), blockEntityAt(bot, [3, 20, 0])], [[], undefined, chestEntity([3, 20, 0])])
        sendSection(testBot, world, [0, 1, 0], undefined)
        await driver.tick()
        assert.strictEqual(blockEntityAt(bot, [3, 20, 0]), undefined)
      })
    }
  })

  describe('block_entity_data\'s y a varint, sections asked for (1.18.0 – 1.26.0)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.26.0')) {
      it(`bedrock ${version}: shows the block entity of a block_entity_data in the packet pass, and merges one without its id`, async () => {
        const codec = bedrockCodec(version)
        // 1.18.0.2 dump_layouts: a chest at (2, -60, 0)
        const chest = '3804c4ffffff0f000a0008026964054368657374010969734d6f7661626c6501030178040301797703017a0000'
        await tellsInThePacketPass(codec, { hex: chest, at: [2, -60, 0], entity: chestEntity([2, -60, 0]) })
        await mergesWithoutAnId(codec, FURNACE_1_16_201, 'furnace', 'Furnace', ['lit_furnace'])
      })
    }
  })

  describe('block_entity_data\'s y a zigzag varint (1.26.10+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.10')) {
      it(`bedrock ${version}: shows the block entity of a block_entity_data in the packet pass, and merges one without its id`, async () => {
        const codec = bedrockCodec(version)
        // 1.26.60.5 containers_container: a chest at (2, 12, 30)
        const chest = '3804183c0a0008026964054368657374030178040301791803017a3c010969734d6f7661626c650100'
        await tellsInThePacketPass(codec, { hex: chest, at: [2, 12, 30], entity: chestEntity([2, 12, 30]) })
        // 1.26.60.5 protocol_blocks_ui: a crafter at (2, -60, 0), its slots without its id
        const crafter = '380477000a0003186372616674696e675f7469636b735f72656d61696e696e6700020e64697361626c65645f736c6f7473000000'
        await mergesWithoutAnId(codec, { hex: crafter, at: [2, -60, 0], entity: { crafting_ticks_remaining: 0, disabled_slots: 0 } }, 'crafter', 'Crafter', ['crafter', { triggered_bit: 1 }])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version: BedrockVersion = latestSupportedBedrockVersion

    it('replaces the block entity held by one naming its id, as recorded for a lectern\'s book', async () => {
      const at: Point = [2, -60, 0]
      // 1.26.60.5 protocol_blocks_ui: the lectern placed, a book put on it, then taken
      const lectern = '380477000a000312426c6f636b456e7469747956657273696f6e0008026964074c65637465726e030178040301797703017a0000'
      const withBook = '380477000a000312426c6f636b456e7469747956657273696f6e000a04626f6f6b0105436f756e7401020644616d616765000008044e616d65176d696e6563726166743a7772697461626c655f626f6f6b010b5761735069636b6564557000000107686173426f6f6b0108026964074c65637465726e03047061676500030a746f74616c506167657300030178040301797703017a0000'
      const { bot, server, driver } = await loaded(bedrockCodec(version), [[...at, 'lectern']])
      const entities: Array<object | undefined | null> = []
      for (const hex of [lectern, withBook, lectern]) {
        server.receive(Buffer.from(hex, 'hex'))
        await driver.frame(0)
        entities.push(blockEntityAt(bot, at))
      }
      const empty = { BlockEntityVersion: 0, id: 'Lectern', x: 2, y: -60, z: 0 }
      const book = { Count: 1, Damage: 0, Name: 'minecraft:writable_book', WasPickedUp: 0 }
      assert.deepStrictEqual(entities, [empty, { ...empty, book, hasBook: 1, page: 0, totalPages: 0 }, empty])
    })

    it('reads the block entities after a section of each layout: version 1, 8 and 9, layers of 0 to 8 bits, two layers', async () => {
      const testBot = await loaded(bedrockCodec(version))
      const { bot, driver, world } = testBot
      const chest = zigzag(world.stateId('chest'))
      const water = zigzag(world.stateId('water'))
      // a layer's header: its bits a block, and runtime ids; then its words (none for 0 bits), its palette's size
      // (a zigzag varint, none for 0 bits) and states; every block here is the palette's first
      const layer = (bits: number, palette: readonly number[][]): number[] => {
        if (bits === 0) return [1, ...palette.flat()]
        const words = Math.ceil(4096 / Math.floor(32 / bits))
        return [(bits << 1) | 1, ...new Array<number>(words * 4).fill(0), ...zigzag(palette.length), ...palette.flat()]
      }
      const layouts: ReadonlyArray<readonly [string, number[]]> = [
        ['1, 1 bit', [1, ...layer(1, [chest])]],
        ['8, 0 bits', [8, 1, ...layer(0, [chest])]],
        ['9, 0 bits', [9, 1, 2, ...layer(0, [chest])]],
        ['9, 3 bits', [9, 1, 2, ...layer(3, [chest, water])]],
        ['9, 8 bits, 64 states', [9, 1, 2, ...layer(8, new Array<number[]>(64).fill(chest))]],
        ['9, two layers', [9, 2, 2, ...layer(0, [chest]), ...layer(0, [water])]]
      ]
      const tags = Buffer.concat([chestTag([1, 40, 1]), tagOf('Chest', [15, 47, 15])].map(tag => nbt.writeUncompressed(tag, 'littleVarint')))
      const read: Array<readonly [string, string | undefined, object | undefined | null, object | undefined | null]> = []
      for (const [layout, section] of layouts) {
        sendSection(testBot, world, [0, 2, 0], Buffer.concat([Buffer.from(section), tags]))
        await driver.tick()
        read.push([layout, bot.blockAt(new Vec3(1, 40, 1))?.name, blockEntityAt(bot, [1, 40, 1]), blockEntityAt(bot, [15, 47, 15])])
      }
      assert.deepStrictEqual(read, layouts.map(([layout]) => [layout, 'chest', chestEntity([1, 40, 1]), { id: 'Chest', x: 15, y: 47, z: 15 }]))
    })

    it('shows a section whose block entities fail to read, reporting the error', async () => {
      const testBot = await bedrockTestBot(bedrockCodec(version))
      const { bot, internal, server, driver } = testBot
      const world = new ServerWorld(server)
      world.startGame()
      world.spawn()
      world.column(0, 0, stoneFloor(0, 0))
      await world.sendColumn(0, 0)
      await driver.tick()
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      const tag = nbt.writeUncompressed(chestTag([1, 8, 1]), 'littleVarint')
      // version 9, one layer of a chest, then a compound cut short in its id
      sendSection(testBot, world, [0, 0, 0], Buffer.from([9, 1, 0, 1, ...zigzag(world.stateId('chest')), ...tag.subarray(0, 6)]))
      await driver.tick()
      const read = [errors, internal._world.sectionKnown(0, 8, 0), bot.blockAt(new Vec3(1, 8, 1))?.name, blockEntityAt(bot, [1, 8, 1])]
      assert.deepStrictEqual(read, [['Read error for undefined : Unexpected buffer end while reading VarInt'], true, 'chest', undefined])
    })

    it('emits nothing for a block entity told in a section not answered yet, nor of a column not sent, and the section\'s answer gives its own', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version))
      const world = new ServerWorld(server)
      world.startGame()
      world.spawn()
      world.column(0, 0, [...stoneFloor(0, 0), [2, 12, 0, 'chest'], [3, 12, 0, 'chest']]).addBlockEntity(chestTag([3, 12, 0]))
      const told = await toldOf(bot, async () => {
        server.send('block_entity_data', { position: { x: 40, y: 12, z: 0 }, nbt: chestTag([40, 12, 0]) })
        await world.sendColumn(0, 0)
        await driver.tick()
        for (const at of [[2, 12, 0], [3, 12, 0]] as const) server.send('block_entity_data', { position: { x: at[0], y: at[1], z: at[2] }, nbt: tagOf('Chest', at, { told: byte(1) }) })
        await driver.frame(0)
        assert.deepStrictEqual([internal._world.columnPresent(0, 0), internal._world.sectionKnown(0, 12, 0)], [true, false])
        await world.load(driver, [])
      })
      assert.deepStrictEqual([told, internal._world.stats.unknownColumn], [[], 1])
      assert.deepStrictEqual([blockEntityAt(bot, [2, 12, 0]), blockEntityAt(bot, [3, 12, 0])], [undefined, chestEntity([3, 12, 0])])
    })
  })
})
