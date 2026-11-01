import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, runtimeId, write } from './common/entities.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The vanilla client at (0.5, -60, 0.5) looking west (yaw -90, pitch 0), holding a painting in hotbar slot 0, hanging it
// on the west face of the stone at (2, -59, 0), recorded on 1.26.20.4, 1.26.51.1 and 1.26.60.5 (protocol_entities,
// protocol.painting): the bot must send the same, byte for byte. No other entity's placement is recorded.

const WEST = new Vec3(-1, 0, 0)
const UP = new Vec3(0, 1, 0)
const PAINTING_UNIQUE = -8589934589n

/** the press, the emptied hand told in the next tick, the use's end, and the server's add_painting */
interface RecordedPainting {
  version: BedrockVersion
  /** the local player's runtime id in the recording */
  runtime: number
  start: string
  swing: string
  click: string
  interact: string
  equipment: string
  stop: string
  /** the painting, runtime id `paintingRuntime` */
  added: string
  paintingRuntime: number
}

const PAINTINGS: readonly RecordedPainting[] = [
  {
    version: 'bedrock_1.26.20',
    runtime: 3,
    start: '24033804750004750008',
    swing: '2c01030000000001056275696c64',
    click: '1e0002010000008a0601000000000a0000000000000000000000000104750008008a0601000000000a000000000000000000000000003f1c8569c20000003f0000000000b91e3f0000003fa19cc481080100',
    interact: '21040000',
    equipment: '1f030000000000000000000000',
    stop: '24033a04750000000000',
    added: '16f9ffffff3f050000fc3f00006ac20000003f0204426f6d62',
    paintingRuntime: 5
  },
  {
    // ItemV4s, and the hand of the click
    version: 'bedrock_1.26.51',
    runtime: 1,
    start: '24013804750004750008',
    swing: '2c01010000000001056275696c64',
    click: '1e000002010001000000680101000000000a0000000000000000000000000000000000000001047500040000680101000000000a000000000000000000000000003f1c8569c20000003f0000000000b91e3f0000003fa19cc481080100',
    interact: '21040000',
    equipment: '1f010000000000000000000000',
    stop: '24013a04750000000000',
    added: '16f9ffffff3f030000fc3f00006ac20000003f0206417a74656332',
    paintingRuntime: 3
  },
  {
    // the swing's hand
    version: 'bedrock_1.26.60',
    runtime: 3,
    start: '24033804750004750008',
    swing: '2c01030000000001056275696c6400',
    click: '1e000002010001000000680101000000000a0000000000000000000000000000000000000001047500040000680101000000000a000000000000000000000000003f1c8569c20000003f0000000000b91e3f0000003fa19cc481080100',
    interact: '21040000',
    equipment: '1f030000000000000000000000',
    stop: '24033a04750000000000',
    added: '16f9ffffff3f050000fc3f00006ac20000003f020957617374656c616e64',
    paintingRuntime: 5
  }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name, and no section request */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

/** the names of the packets the bot sent since `from`, but auth inputs and section requests */
function sentSince (server: FakeBedrockClient, from: number): string[] {
  return server.batches.slice(from).flat().map(({ name }) => name).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request')
}

interface AtStone extends TestBot {
  inventory: ServerInventory
  stone: Block
  /** entitySpawn and entityPlaced, as emitted */
  events: string[]
  errors: string[]
  /** the destination's corner, west of the stone */
  dest: Point3
}

interface Setting {
  feetY?: number
  /** the local player's runtime id */
  runtime?: number
}

/** joined standing at (0.5, feetY, 0.5) looking west, the stone at (2, feetY + 1, 0) before the eye, water and flowing water behind */
async function atStone (version: BedrockVersion, { feetY = -60, runtime = 1 }: Setting = {}): Promise<AtStone> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  // the recorded servers number the blocks by their hashes from 1.20.0
  const world = new ServerWorld(testBot.server, {
    hashes: atLeast(version, 'bedrock_1.20.0'),
    blocks: [[2, feetY + 1, 0, 'stone'], [0, feetY - 1, 0, 'stone'], [1, feetY - 1, 0, 'stone'], [-2, feetY, 0, 'water'], [-2, feetY, 1, 'flowing_water']]
  })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation: { yaw: -90, pitch: 0 }, game: { runtime_entity_id: BigInt(runtime), ...itemStates } })
  const { bot } = testBot
  const events: string[] = []
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  bot.on('entitySpawn', entity => { events.push(`entitySpawn ${entity.id}`) })
  bot.on('entityPlaced', entity => { events.push(`entityPlaced ${entity.id} ${String(entity.name)}`) })
  const stone = bot.blockAt(new Vec3(2, feetY + 1, 0))
  assert.ok(stone !== null, `${version}: the stone's section is not loaded`)
  return { ...testBot, inventory: new ServerInventory(testBot.server), stone, events, errors, dest: { x: 1, y: feetY + 1, z: 0 } }
}

/** `count` of `item` in hotbar slot 0, told a tick before */
async function holding (at: AtStone, item: string, count = 1): Promise<void> {
  at.inventory.slot('inventory', 0, { id: at.bot.registry.itemsByName[item]?.id ?? 0, count })
  await at.driver.tick()
}

/** ticks until `promise` settles */
async function settle<Result> (driver: TestBot['driver'], promise: Promise<Result>): Promise<Result> {
  let settled = false
  const done = promise.finally(() => { settled = true })
  await driver.runUntil(() => settled, 120)
  return await done
}

/** add_entity of `type` (without its namespace), as the latest version writes it */
function addAt (server: FakeBedrockClient, runtime: number, type: string, position: Point3): void {
  write(server, 'add_entity', addEntity(latestSupportedBedrockVersion, { unique: BigInt(-runtime), runtime, type: `minecraft:${type}`, position }))
}

describe('bedrock placing an entity', () => {
  for (const recorded of PAINTINGS) {
    describe(`the vanilla client hanging a painting on the stone (${recorded.version.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.version, recorded.version)) {
        it(`bedrock ${version}: builds against the block itself, empties the slot, tells the hand in the next tick, and resolves with the painting the server added, entityPlaced right after its entitySpawn`, async () => {
          const at = await atStone(version, { runtime: recorded.runtime })
          const { bot, server, driver, stone, events, errors } = at
          await holding(at, 'painting')
          const batches = batchesSince(server)
          let painting: Entity | undefined
          const placing = bot.placeEntity(stone, WEST).then(entity => { painting = entity })

          await driver.frame(10)
          assert.deepStrictEqual([batches(), bot.heldItem, errors], [[[recorded.start, recorded.swing, recorded.click]], null, []])
          await driver.tick()
          assert.deepStrictEqual(batches(), [[recorded.interact, recorded.equipment, 'player_auth_input']])
          await driver.ticks(2)
          assert.deepStrictEqual([batches(), painting], [[['player_auth_input'], [recorded.stop, 'player_auth_input']], undefined])
          server.receive(Buffer.from(recorded.added, 'hex'))
          await driver.frame(10)
          const id = recorded.paintingRuntime
          assert.deepStrictEqual([events, painting, painting?.name, errors], [[`entitySpawn ${id}`, `entityPlaced ${id} painting`], bot.entities[id], 'painting', []])
          await placing
          bot.end()
        })
      }
    })
  }

  const paintingLayouts: Array<[string, BedrockVersion, BedrockVersion, (feetY: number) => Point3]> = [
    ['block coordinates (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210', feetY => ({ x: 1, y: feetY + 1, z: 0 })],
    ['a position (1.16.220 – 1.26.60)', 'bedrock_1.16.220', latestSupportedBedrockVersion, feetY => ({ x: 1.96875, y: feetY + 1.5, z: 0.5 })]
  ]
  for (const [layout, from, to, coordinatesAt] of paintingLayouts) {
    describe(`servers adding the painting at ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: builds as recorded from 1.26.20 (no use in the air, the slot emptied), and resolves with the painting added`, async () => {
          // the overworld starts at 0 up to 1.17.40
          const feetY = atLeast(version, 'bedrock_1.18.0') ? -60 : 4
          const at = await atStone(version, { feetY })
          const { bot, server, driver, stone, events, errors } = at
          await holding(at, 'painting')
          const sent = server.batches.length
          const placing = bot.placeEntity(stone, WEST)
          await driver.frame(10)
          const results = server.sentOf('player_action').filter(({ action }) => action === 'start_item_use_on').map(({ result_position: result }) => result)
          assert.deepStrictEqual([results, sentSince(server, sent), bot.heldItem], [atLeast(version, 'bedrock_1.19.1') ? [{ x: 2, y: feetY + 1, z: 0 }] : [], [...atLeast(version, 'bedrock_1.19.1') ? ['player_action'] : [], 'animate', 'inventory_transaction'], null])
          write(server, 'add_painting', { entity_id_self: PAINTING_UNIQUE, runtime_entity_id: runtimeId(version, 5), coordinates: coordinatesAt(feetY), direction: 1, title: 'Wasteland' })
          const painting = await settle(driver, placing)
          assert.deepStrictEqual([events, painting, errors], [['entitySpawn 5', 'entityPlaced 5 painting'], bot.entities[5], []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion}; no such placement is recorded)`, () => {
    const version = latestSupportedBedrockVersion

    it("names the entity by the held item: Java's kinds (an end crystal, boats, spawn eggs, an armor stand) and Bedrock's (chest boats, rafts, minecarts), a spawn egg's mob as Bedrock names it", async () => {
      const at = await atStone(version)
      const { bot, server, driver, stone, dest, events } = at
      const KINDS: Array<[item: string, entity: string]> = [
        ['armor_stand', 'armor_stand'], ['end_crystal', 'ender_crystal'], ['oak_boat', 'boat'], ['boat', 'boat'], ['bamboo_raft', 'boat'],
        ['oak_chest_boat', 'chest_boat'], ['chest_boat', 'chest_boat'], ['bamboo_chest_raft', 'chest_boat'], ['zombie_spawn_egg', 'zombie'],
        ['villager_spawn_egg', 'villager_v2'], ['minecart', 'minecart'], ['command_block_minecart', 'command_block_minecart']
      ]
      const placed: string[] = []
      for (const [index, [item, entity]] of KINDS.entries()) {
        await holding(at, item)
        const placing = bot.placeEntity(stone, WEST)
        await driver.frame(10)
        addAt(server, 10 + index, entity, { x: dest.x + 0.5, y: dest.y, z: dest.z + 0.5 })
        placed.push(`${item}: ${String((await settle(driver, placing)).name)}`)
      }
      // only a boat's reference block may not be water
      await holding(at, 'armor_stand')
      const water = bot.blockAt(new Vec3(-2, -60, 0))
      assert.ok(water !== null)
      const clicks = server.sentOf('inventory_transaction').length
      const standing = bot.placeEntity(water, UP)
      // after looking at the water's top
      await driver.runUntil(() => server.sentOf('inventory_transaction').length > clicks, 20)
      addAt(server, 30, 'armor_stand', { x: -1.5, y: -59, z: 0.5 })
      placed.push(`armor_stand on water: ${String((await settle(driver, standing)).name)}`)
      assert.deepStrictEqual([placed, events.length], [[...KINDS.map(([item, entity]) => `${item}: ${entity}`), 'armor_stand on water: armor_stand'], 2 * KINDS.length + 2])
      bot.end()
    })

    it("waits for its entity: not another's, nor one as far as Java's distance from the destination's corner (2, a boat's 3, a bat's 4)", async () => {
      const at = await atStone(version)
      const { bot, server, driver, stone, dest, events } = at
      const near = (z: number): Point3 => ({ x: dest.x, y: dest.y, z: dest.z + z })
      await holding(at, 'armor_stand')
      let stand: Entity | undefined
      const standing = bot.placeEntity(stone, WEST).then(entity => { stand = entity })
      await driver.frame(10)
      addAt(server, 10, 'pig', near(0))
      addAt(server, 11, 'armor_stand', near(2))
      await driver.ticks(5)
      assert.strictEqual(stand, undefined)
      addAt(server, 12, 'armor_stand', near(1.9))
      await settle(driver, standing)
      for (const [runtime, item, entity, z] of [[13, 'oak_boat', 'boat', 2.9], [14, 'bat_spawn_egg', 'bat', 3.9]] as const) {
        await holding(at, item)
        const placing = bot.placeEntity(stone, WEST)
        await driver.frame(10)
        addAt(server, runtime, entity, near(z))
        assert.strictEqual(await settle(driver, placing), bot.entities[runtime])
      }
      assert.deepStrictEqual([stand, events], [bot.entities[12], [
        'entitySpawn 10', 'entitySpawn 11', 'entitySpawn 12', 'entityPlaced 12 armor_stand',
        'entitySpawn 13', 'entityPlaced 13 boat', 'entitySpawn 14', 'entityPlaced 14 bat'
      ]])
      bot.end()
    })

    it('settles the placements waiting for an entity one spawn each, the first first, two spawns in one packet pass too (_placeEntityWithOptions, as placeEntity)', async () => {
      const at = await atStone(version)
      const { bot, internal, server, driver, stone, dest, events } = at
      await holding(at, 'armor_stand', 2)
      const settled: string[] = []
      const placings = [0, 1].map(async index => { settled.push(`${index}: ${String((await internal._placeEntityWithOptions(stone, WEST, {})).id)}`) })
      await driver.frame(10)
      await driver.ticks(3)
      await driver.frame(10)
      addAt(server, 10, 'armor_stand', dest)
      addAt(server, 11, 'armor_stand', dest)
      await settle(driver, Promise.all(placings))
      assert.deepStrictEqual([settled, events], [['0: 10', '1: 11'], ['entitySpawn 10', 'entityPlaced 10 armor_stand', 'entitySpawn 11', 'entityPlaced 11 armor_stand']])
      await holding(at, 'armor_stand', 2)
      const later = [0, 1].map(async () => await bot.placeEntity(stone, WEST))
      await driver.frame(10)
      await driver.ticks(3)
      await driver.frame(10)
      addAt(server, 12, 'armor_stand', dest)
      await driver.ticks(3)
      addAt(server, 13, 'armor_stand', dest)
      assert.deepStrictEqual(await settle(driver, Promise.all(later)), [bot.entities[12], bot.entities[13]])
      bot.end()
    })

    it("rejects with Java's message when the server gives the item back (not recorded), or spawns none in 100 ticks from the call", async () => {
      const at = await atStone(version)
      const { bot, driver, inventory, stone, dest, server } = at
      const failed = { message: 'Failed to place entity' }
      await holding(at, 'armor_stand')
      let refused = false
      const givenBack = assert.rejects(bot.placeEntity(stone, WEST), failed).finally(() => { refused = true })
      await driver.frame(10)
      assert.strictEqual(bot.heldItem, null)
      inventory.slot('inventory', 0, { id: bot.registry.itemsByName['armor_stand']?.id ?? 0, count: 1 })
      // once the use ended
      await driver.ticks(3)
      assert.strictEqual(refused, true)
      await givenBack
      let settled = false
      const unanswered = assert.rejects(bot.placeEntity(stone, WEST), failed).finally(() => { settled = true })
      await driver.frame(10)
      await driver.ticks(99)
      assert.strictEqual(settled, false)
      await driver.tick()
      await unanswered
      // an entity spawned later is no placement's
      addAt(server, 10, 'armor_stand', dest)
      await driver.frame(10)
      assert.deepStrictEqual(at.events, ['entitySpawn 10'])
      bot.end()
    })

    it("rejects, sending nothing, without an item, holding one that places no entity (Java's assertion), a spawn egg without a mob, from the off-hand, and a boat on water (not recorded)", async () => {
      const at = await atStone(version)
      const { bot, internal, server, driver, stone } = at
      const sent = server.batches.length
      await assert.rejects(bot.placeEntity(stone, WEST), { message: 'must be holding an item to place an entity' })
      for (const item of ['stick', 'dirt']) {
        await holding(at, item)
        await assert.rejects(bot.placeEntity(stone, WEST), { name: 'AssertionError', message: 'Unimplemented' })
      }
      await holding(at, 'spawn_egg')
      await assert.rejects(bot.placeEntity(stone, WEST), { message: 'placeEntity: spawn_egg without a mob name is not supported on Bedrock' })
      await holding(at, 'armor_stand')
      await assert.rejects(internal._placeEntityWithOptions(stone, WEST, { offhand: true }), { message: '_placeEntityWithOptions: placing from the off-hand is not supported on Bedrock: the vanilla client places what the main hand holds' })
      for (const [item, z] of [['oak_boat', 0], ['oak_chest_boat', 1]] as const) {
        await holding(at, item)
        const water = bot.blockAt(new Vec3(-2, -60, z))
        assert.ok(water !== null)
        await assert.rejects(bot.placeEntity(water, UP), { message: 'placeEntity: a boat on water is not supported on Bedrock yet' })
      }
      await driver.frame(10)
      assert.deepStrictEqual(sentSince(server, sent).filter(name => name !== 'interact'), Array(6).fill('mob_equipment'))
      bot.end()
    })
  })
})
