import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import type { NBT, Tags, TagType } from 'prismarine-nbt'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec, readPacket } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld, stoneFloor } from './common/world.ts'
import type { BlockAt, BlockProperties } from './common/world.ts'

// The lids as the vanilla client saw them against Bedrock Dedicated Server (dump_layouts, 1.16.201.2 – 1.26.60.5):
// a block set by `setblock 2 4 0` (2 -60 0 from 1.18.0) used and its screen closed. The server told block_event
// change_state 1 in the opening's batch and 0 in the close's, for a chest, a barrel (with its open_bit's update_block),
// an undyed shulker box and an ender chest; nothing for a hopper, a dispenser, a dropper or a crafter. No recording
// has a double chest: its halves' pairing is the chest block entity's (pairx, pairz), constructed here.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** a chest's block entity at `at`, paired with the half at (`pair.x`, `pair.z`) if given */
function chestEntity ({ x, y, z }: At, pair?: At): Compound {
  const paired: Compound = pair === undefined ? {} : { pairlead: byte(x < pair.x ? 1 : 0), pairx: int(pair.x), pairz: int(pair.z) }
  return { Findable: byte(0), id: string('Chest'), isMovable: byte(1), ...paired, x: int(x), y: int(y), z: int(z) }
}

function nbtOf (value: Compound): NBT {
  return { type: 'compound', name: '', value }
}

const named = (block: Block | null): string => block === null ? 'null' : `${block.name} (${block.position.x}, ${block.position.y}, ${block.position.z})`

/** the lines pushed, each taken once */
function collected (): { push: (line: string) => void, take: () => string[] } {
  let lines: string[] = []
  return {
    push: line => { lines.push(line) },
    take: () => {
      const fresh = lines
      lines = []
      return fresh
    }
  }
}

interface ActionsBot extends TestBot {
  world: ServerWorld
  errors: string[]
  /** the chestLidMove events since the last call, each as a line */
  moved: () => string[]
  /** the pistonMove events since the last call, each as a line */
  pushed: () => string[]
  /** block_event change_state `data` at `at` */
  lid: (at: At, data: number) => void
  tell: (at: At, value: Compound) => void
  setBlock: (at: At, name: string, properties?: BlockProperties) => void
}

/** joined with `blocks` in the columns around it (those with properties set after the join), the block_actions plugin only */
async function actionsBot (version: BedrockVersion, blocks: readonly BlockAt[]): Promise<ActionsBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { block_actions: true } })
  const { bot, server, driver } = testBot
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks: blocks.map(([x, y, z, name]): BlockAt => [x, y, z, name]) })
  await world.join(testBot)
  const Block = prismarineBlock(bot.registry)
  // a state by its properties: block_network_ids_are_hashes leaves the registry no state ranges to search
  const setBlock = (position: At, name: string, properties: BlockProperties = {}): void => {
    const stateId = Block.fromProperties(name, properties, 0).stateId
    if (isBedrockVersionAtLeast(version, 'bedrock_1.16.210')) server.send('update_block', { position, block_runtime_id: stateId, layer: 0 })
    else server.send('update_block', { coordinates: position, block_runtime_id: stateId, block_priority: 3, storage: 0 })
  }
  const stated = blocks.filter(([, , , , properties]) => properties !== undefined)
  for (const [x, y, z, name, properties] of stated) setBlock({ x, y, z }, name, properties)
  if (stated.length > 0) await driver.frame(0)
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const moved = collected()
  bot.on('chestLidMove', (block, isOpen, block2) => { moved.push(`${named(block)} ${isOpen} ${named(block2)}`) })
  const pushed = collected()
  bot.on('pistonMove', (block, isPulling, direction) => { pushed.push(`${named(block)} ${isPulling} ${direction}`) })
  return {
    ...testBot,
    world,
    errors,
    moved: moved.take,
    pushed: pushed.take,
    lid: (position, data) => { server.send('block_event', { position, type: 'change_state', data }) },
    tell: (position, value) => { server.send('block_entity_data', { position, nbt: nbtOf(value) }) },
    setBlock
  }
}

interface RecordedLid {
  at: At
  open: string
  close: string
}

interface LidLayout {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  lids: (version: BedrockVersion) => readonly RecordedLid[]
}

const LAYOUTS: readonly LidLayout[] = [
  {
    name: 'block_event\'s y a varint (1.16.201 – 1.26.0)',
    from: oldestSupportedBedrockVersion,
    to: 'bedrock_1.26.0',
    lids: version => [
      // recorded on 1.16.201.2
      { at: { x: 2, y: 4, z: 0 }, open: '1a0404000202', close: '1a0404000200' },
      // the open recorded on 1.26.0.2, the close as 1.16.201.2's
      ...isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? [{ at: { x: 2, y: -60, z: 0 }, open: '1a04c4ffffff0f000202', close: '1a04c4ffffff0f000200' }] : []
    ]
  },
  {
    // recorded on 1.26.10.4 and 1.26.60.5
    name: 'block_event\'s y zigzag (1.26.10+)',
    from: 'bedrock_1.26.10',
    to: latestSupportedBedrockVersion,
    lids: () => [{ at: { x: 2, y: -60, z: 0 }, open: '1a0477000202', close: '1a0477000200' }]
  }
]

describe('bedrock block actions: a lid\'s block_event', () => {
  for (const layout of LAYOUTS) {
    describe(layout.name, () => {
      for (const version of bedrockTestVersionsFrom(layout.from, layout.to)) {
        it(`bedrock ${version}: the recorded opens and close of a chest emit chestLidMove when the count changes; a double chest's halves told by block_entity_data, once for both`, async () => {
          const lids = layout.lids(version)
          // where the overworld starts at 0, 4
          const y = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4
          const [left, right] = [{ x: 5, y, z: 0 }, { x: 6, y, z: 0 }]
          const blocks: BlockAt[] = [...lids.map(({ at }): BlockAt => [at.x, at.y, at.z, 'chest']), [left.x, y, 0, 'chest'], [right.x, y, 0, 'chest']]
          const { bot, server, driver, moved, lid, tell } = await actionsBot(version, blocks)
          const seen: string[][] = []
          for (const { open, close } of lids) {
            for (const bytes of [open, open, close, close, open]) {
              server.receive(Buffer.from(bytes, 'hex'))
              await driver.frame(0)
              seen.push(moved())
            }
          }
          assert.deepStrictEqual(seen, lids.flatMap(({ at: { x, y, z } }) => [[`chest (${x}, ${y}, ${z}) 1 null`], [], [`chest (${x}, ${y}, ${z}) 0 null`], [], [`chest (${x}, ${y}, ${z}) 1 null`]]))
          tell(left, chestEntity(left, right))
          tell(right, chestEntity(right, left))
          lid(right, 1)
          lid(left, 1)
          await driver.frame(0)
          const opened = moved()
          lid(left, 0)
          await driver.frame(0)
          assert.deepStrictEqual([opened, moved()], [[`chest (6, ${y}, 0) 1 chest (5, ${y}, 0)`], [`chest (5, ${y}, 0) 0 chest (6, ${y}, 0)`]])
          assert.deepStrictEqual(server.batches.flat().filter(packet => packet.owner === 'block_actions'), [])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const [barrel, shulkerBox, enderChest, chest] = [{ x: 2, y: -60, z: 0 }, { x: 4, y: -60, z: 0 }, { x: 6, y: -60, z: 0 }, { x: 8, y: -60, z: 0 }]

    it('a barrel (whose open_bit changes keep its count), an undyed shulker box and an ender chest emit as a chest', async () => {
      const blocks: BlockAt[] = [[barrel.x, -60, 0, 'barrel'], [shulkerBox.x, -60, 0, 'undyed_shulker_box'], [enderChest.x, -60, 0, 'ender_chest']]
      const { bot, driver, moved, lid, setBlock } = await actionsBot(version, blocks)
      const seen: string[][] = []
      // as recorded: the barrel's block_event, then its update_block, in one batch
      lid(barrel, 1)
      setBlock(barrel, 'barrel', { facing_direction: 0, open_bit: 1 })
      await driver.frame(0)
      seen.push(moved())
      lid(barrel, 1)
      await driver.frame(0)
      seen.push(moved())
      lid(barrel, 0)
      setBlock(barrel, 'barrel', { facing_direction: 0, open_bit: 0 })
      await driver.frame(0)
      seen.push(moved())
      for (const at of [shulkerBox, enderChest]) {
        lid(at, 1)
        await driver.frame(0)
        lid(at, 0)
        await driver.frame(0)
        seen.push(moved())
      }
      assert.deepStrictEqual(seen, [
        ['barrel (2, -60, 0) 1 null'], [], ['barrel (2, -60, 0) 0 null'],
        ['undyed_shulker_box (4, -60, 0) 1 null', 'undyed_shulker_box (4, -60, 0) 0 null'],
        ['ender_chest (6, -60, 0) 1 null', 'ender_chest (6, -60, 0) 0 null']
      ])
      bot.end()
    })

    it('a lid replaced by another block forgets its count, as Java\'s: the server tells no close of a lid that is gone', async () => {
      const { bot, driver, moved, lid, setBlock } = await actionsBot(version, [[chest.x, -60, 0, 'chest']])
      lid(chest, 1)
      await driver.frame(0)
      setBlock(chest, 'air')
      setBlock(chest, 'chest')
      lid(chest, 1)
      lid(chest, 2)
      await driver.frame(0)
      assert.deepStrictEqual(moved(), ['chest (8, -60, 0) 1 null', 'chest (8, -60, 0) 1 null', 'chest (8, -60, 0) 2 null'])
      bot.end()
    })

    it('a double chest\'s half replaced forgets the pair\'s count and its own pairing', async () => {
      const [left, right] = [{ x: 5, y: -60, z: 0 }, { x: 6, y: -60, z: 0 }]
      const { bot, driver, moved, lid, tell, setBlock } = await actionsBot(version, [[left.x, -60, 0, 'chest'], [right.x, -60, 0, 'chest']])
      tell(left, chestEntity(left, right))
      tell(right, chestEntity(right, left))
      lid(left, 1)
      await driver.frame(0)
      setBlock(right, 'air')
      await driver.frame(0)
      lid(left, 1)
      await driver.frame(0)
      const reopened = moved()
      setBlock(right, 'chest')
      lid(right, 1)
      await driver.frame(0)
      assert.deepStrictEqual([reopened, moved()], [
        ['chest (5, -60, 0) 1 chest (6, -60, 0)', 'chest (5, -60, 0) 1 air (6, -60, 0)'],
        ['chest (6, -60, 0) 1 null']
      ])
      bot.end()
    })

    it('emits nothing for a block the bot has not, nor for block_event\'s sound type', async () => {
      const { bot, server, driver, errors, moved, lid } = await actionsBot(version, [[chest.x, -60, 0, 'chest']])
      lid({ x: 100, y: -60, z: 100 }, 1)
      server.send('block_event', { position: chest, type: 'sound', data: 1 })
      await driver.frame(0)
      assert.deepStrictEqual([moved(), errors], [[], []])
      bot.end()
    })
  })

  describe('a double chest the column brought paired (1.16.201 – 1.17.40, whose columns come whole with their block entities)', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.17.40')) {
      it(`bedrock ${version}: pairs the halves as the column's block entities do, until block_entity_data tells them apart`, async () => {
        const [left, right] = [{ x: 2, y: 4, z: 0 }, { x: 3, y: 4, z: 0 }]
        const { bot, driver, world, moved, lid, tell } = await actionsBot(version, [])
        const column = world.column(0, 0, [...stoneFloor(0, 0), [left.x, 4, 0, 'chest'], [right.x, 4, 0, 'chest']])
        column.addBlockEntity(nbtOf(chestEntity(left, right)))
        column.addBlockEntity(nbtOf(chestEntity(right, left)))
        await world.load(driver, [[0, 0]])
        lid(right, 1)
        lid(left, 1)
        await driver.frame(0)
        const paired = moved()
        // a pairx without its pairz, or one not an int, pairs nothing
        tell(left, { ...chestEntity(left), pairx: int(right.x) })
        tell(right, { ...chestEntity(right), pairx: { type: 'short', value: left.x }, pairz: int(left.z) })
        lid(left, 0)
        // the right half was not told open
        lid(right, 0)
        lid(right, 1)
        await driver.frame(0)
        assert.deepStrictEqual([paired, moved()], [['chest (3, 4, 0) 1 chest (2, 4, 0)'], ['chest (2, 4, 0) 0 null', 'chest (3, 4, 0) 1 null']])
        bot.end()
      })
    }
  })
})

// The pistons as the vanilla client saw them (protocol_entities 1.26.20.4, 1.26.51.1, 1.26.60.5): a piston set by
// `setblock 3 -60 2 piston ["facing_direction"=4]` beside a stone at (4, -60, 2), then a redstone block set beside it
// and removed. No block_event came: the piston's block entity (PistonArm) told NewState 0 at rest, 1 extending (with a
// MovingBlock block entity at the stone's destination, (5, -60, 2): facing 4 pushes east), 2 extended a tick later, 3
// retracting and 0 again. Each block_entity_data below is the recorded one, in the batch it came in.

const RECORDED_PISTON = {
  // 1.26.20.4
  'bedrock_1.26.20': [
    ['380677040a00090e4174746163686564426c6f636b730000090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746500050850726f67726573730000000001055374617465000106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6501030178060301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b730306087704090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746501050850726f67726573730000000001055374617465010106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400'],
    ['380a77040a000109657870616e64696e6701080269640b4d6f76696e67426c6f636b010969734d6f7661626c65010a0b6d6f76696e67426c6f636b08046e616d650f6d696e6563726166743a73746f6e650a0673746174657300030776657273696f6ec2f0a911000a106d6f76696e67426c6f636b457874726108046e616d650d6d696e6563726166743a6169720a0673746174657300030776657273696f6ec2f0a91100030a706973746f6e506f735806030a706973746f6e506f735977030a706973746f6e506f735a040301780a0301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b730000090b427265616b426c6f636b730000050c4c61737450726f67726573730000803f01084e6577537461746502050850726f67726573730000803f01055374617465020106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b730000090b427265616b426c6f636b730000050c4c61737450726f67726573730000803f01084e6577537461746503050850726f67726573730000803f01055374617465030106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b730000090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746500050850726f67726573730000000001055374617465000106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6501030178060301797703017a0400']
  ],
  // 1.26.60.5, the same bytes as 1.26.51.1's: the block entities name their BlockEntityVersion
  'bedrock_1.26.60': [
    ['380677040a00090e4174746163686564426c6f636b7300000312426c6f636b456e7469747956657273696f6e00090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746500050850726f67726573730000000001055374617465000106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6501030178060301797703017a0400'],
    [
      '380677040a00090e4174746163686564426c6f636b7303060877040312426c6f636b456e7469747956657273696f6e00090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746501050850726f67726573730000000001055374617465010106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400',
      '380a77040a000312426c6f636b456e7469747956657273696f6e000109657870616e64696e6701080269640b4d6f76696e67426c6f636b0a0b6d6f76696e67426c6f636b08046e616d650f6d696e6563726166743a73746f6e650a0673746174657300030776657273696f6ec2f0a911000a106d6f76696e67426c6f636b457874726108046e616d650d6d696e6563726166743a6169720a0673746174657300030776657273696f6ec2f0a91100030a706973746f6e506f735806030a706973746f6e506f735977030a706973746f6e506f735a040301780a0301797703017a0400'
    ],
    ['380677040a00090e4174746163686564426c6f636b7300000312426c6f636b456e7469747956657273696f6e00090b427265616b426c6f636b730000050c4c61737450726f67726573730000803f01084e6577537461746502050850726f67726573730000803f01055374617465020106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b7300000312426c6f636b456e7469747956657273696f6e00090b427265616b426c6f636b730000050c4c61737450726f67726573730000803f01084e6577537461746503050850726f67726573730000803f01055374617465030106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6500030178060301797703017a0400'],
    ['380677040a00090e4174746163686564426c6f636b7300000312426c6f636b456e7469747956657273696f6e00090b427265616b426c6f636b730000050c4c61737450726f67726573730000000001084e6577537461746500050850726f67726573730000000001055374617465000106537469636b79000802696409506973746f6e41726d010969734d6f7661626c6501030178060301797703017a0400']
  ]
}

const EXTENDING = 1
const RETRACTING = 3

/** the NBT of each recorded batch's block_entity_data, as the latest version reads it */
function recordedPistonNbt (batches: ReadonlyArray<readonly string[]>): NBT[][] {
  const codec = bedrockCodec(latestSupportedBedrockVersion)
  return batches.map(batch => batch.map(hex => (readPacket(codec, Buffer.from(hex, 'hex')).params as { nbt: NBT }).nbt))
}

/** a piston's block entity telling `newState` */
function pistonArm (newState: number): Compound {
  return { NewState: byte(newState), Progress: { type: 'float', value: 0 }, State: byte(newState), Sticky: byte(0), id: string('PistonArm') }
}

/** the pistonMove events of each batch of `recording`, at a piston at `at` facing east (4): 1.26.20.4's MovingBlock came in a batch of its own */
function pistonMoves ({ x, y, z }: At, recording: keyof typeof RECORDED_PISTON): string[][] {
  const [push, pull] = [[`piston (${x}, ${y}, ${z}) 0 5`], [`piston (${x}, ${y}, ${z}) 1 5`]]
  return recording === 'bedrock_1.26.20' ? [[], push, [], [], pull, []] : [[], push, [], pull, []]
}

describe('bedrock block actions: a piston\'s block entity', () => {
  describe('block_entity_data\'s y a varint (1.16.201 – 1.26.0): the recorded block entities, at the version\'s position', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.26.0')) {
      it(`bedrock ${version}: pistonMove as the piston starts extending and retracting, once each`, async () => {
        // where the overworld starts at 0, 4
        const at = { x: 3, y: isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4, z: 2 }
        const { bot, server, driver, moved, pushed } = await actionsBot(version, [[at.x, at.y, at.z, 'piston', { facing_direction: 4 }], [at.x + 1, at.y, at.z, 'stone']])
        const seen: string[][] = []
        for (const batch of recordedPistonNbt(RECORDED_PISTON['bedrock_1.26.60'])) {
          for (const nbt of batch) server.send('block_entity_data', { position: at, nbt })
          await driver.frame(0)
          seen.push(pushed())
        }
        assert.deepStrictEqual([seen, moved()], [pistonMoves(at, 'bedrock_1.26.60'), []])
        assert.deepStrictEqual(server.batches.flat().filter(packet => packet.owner === 'block_actions'), [])
        bot.end()
      })
    }
  })

  describe('block_entity_data\'s y zigzag (1.26.10+): the recorded bytes', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.10', latestSupportedBedrockVersion)) {
      it(`bedrock ${version}: pistonMove as the piston starts extending and retracting, once each, in 1.26.20's recording then 1.26.60's`, async () => {
        const at = { x: 3, y: -60, z: 2 }
        const { bot, server, driver, moved, pushed } = await actionsBot(version, [[at.x, at.y, at.z, 'piston', { facing_direction: 4 }], [at.x + 1, at.y, at.z, 'stone']])
        const seen: string[][] = []
        for (const batch of [...RECORDED_PISTON['bedrock_1.26.20'], ...RECORDED_PISTON['bedrock_1.26.60']]) {
          for (const hex of batch) server.receive(Buffer.from(hex, 'hex'))
          await driver.frame(0)
          seen.push(pushed())
        }
        assert.deepStrictEqual([seen, moved()], [[...pistonMoves(at, 'bedrock_1.26.20'), ...pistonMoves(at, 'bedrock_1.26.60')], []])
        assert.deepStrictEqual(server.batches.flat().filter(packet => packet.owner === 'block_actions'), [])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion}; not recorded)`, () => {
    const version = latestSupportedBedrockVersion

    it('the direction is Java\'s by each facing_direction, a piston\'s horizontal sides the reverse of other blocks\' (only 4, east, recorded)', async () => {
      const pistons = [0, 1, 2, 3, 4, 5].map(facing => ({ x: facing * 2, y: -60, z: 4, facing }))
      const { bot, driver, pushed, tell } = await actionsBot(version, pistons.map(({ x, y, z, facing }): BlockAt => [x, y, z, 'piston', { facing_direction: facing }]))
      for (const { x, y, z } of pistons) tell({ x, y, z }, pistonArm(EXTENDING))
      await driver.frame(0)
      assert.deepStrictEqual(pushed(), ['piston (0, -60, 4) 0 0', 'piston (2, -60, 4) 0 1', 'piston (4, -60, 4) 0 3', 'piston (6, -60, 4) 0 2', 'piston (8, -60, 4) 0 5', 'piston (10, -60, 4) 0 4'])
      bot.end()
    })

    it('a sticky piston pushes and pulls as a piston; a NewState told again emits nothing', async () => {
      const at = { x: 2, y: -60, z: 2 }
      const { bot, driver, pushed, tell } = await actionsBot(version, [[at.x, at.y, at.z, 'sticky_piston', { facing_direction: 1 }]])
      for (const newState of [EXTENDING, EXTENDING, 2, RETRACTING, RETRACTING]) {
        tell(at, pistonArm(newState))
        await driver.frame(0)
      }
      assert.deepStrictEqual(pushed(), ['sticky_piston (2, -60, 2) 0 1', 'sticky_piston (2, -60, 2) 1 1'])
      bot.end()
    })

    it('a piston replaced by another block forgets its NewState', async () => {
      const at = { x: 2, y: -60, z: 2 }
      const { bot, driver, pushed, tell, setBlock } = await actionsBot(version, [[at.x, at.y, at.z, 'piston', { facing_direction: 4 }]])
      tell(at, pistonArm(EXTENDING))
      await driver.frame(0)
      setBlock(at, 'air')
      setBlock(at, 'piston', { facing_direction: 5 })
      tell(at, pistonArm(EXTENDING))
      await driver.frame(0)
      assert.deepStrictEqual(pushed(), ['piston (2, -60, 2) 0 5', 'piston (2, -60, 2) 0 4'])
      bot.end()
    })

    it('emits nothing for a PistonArm at a block not a piston nor one the bot has, nor for another block entity at a piston', async () => {
      const [stone, piston] = [{ x: 2, y: -60, z: 2 }, { x: 4, y: -60, z: 2 }]
      const { bot, driver, errors, pushed, tell } = await actionsBot(version, [[stone.x, stone.y, stone.z, 'stone'], [piston.x, piston.y, piston.z, 'piston', { facing_direction: 4 }]])
      tell(stone, pistonArm(EXTENDING))
      tell({ x: 100, y: -60, z: 100 }, pistonArm(EXTENDING))
      tell(piston, { ...pistonArm(EXTENDING), id: string('MovingBlock') })
      await driver.frame(0)
      assert.deepStrictEqual([pushed(), errors], [[], []])
      bot.end()
    })
  })
})
