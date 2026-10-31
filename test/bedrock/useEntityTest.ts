import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, spawned, write } from './common/entities.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ManualDriver } from './common/driver.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt, Point3, Rotation } from './common/world.ts'

// The vanilla client at (0.5, y, 0.5), its camera at yaw −90 and pitch 29.197464, using a boat whose box stands at
// (2.7, y, 0.7), recorded on every build, and a villager at (2.5, y, 0.5) holding 64 wheat, recorded on 1.26.20, 1.26.51
// and 1.26.60: the bot must send the same, byte for byte

const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const BOAT = Object.freeze({ width: 1.399999976158142, height: 0.45500001311302185 })
const VILLAGER = Object.freeze({ width: 0.6000000238418579, height: 1.899999976158142 })

/** the client's inventory_transaction item_use_on_entity, the boat entity 6, with an empty hand */
interface RecordedBoatUse {
  from: BedrockVersion
  to: BedrockVersion
  /** the feet's y, the boat's too: 4 up to 1.17.40, whose overworld starts at 0 */
  feetY: number
  click: string
}

const BOAT_USES: readonly RecordedBoatUse[] = [
  {
    // recorded on 1.16.201.2 and 1.16.210.5: the legacy wrapper, then the actions saying they name no network ids
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    feetY: 4,
    click: '1e00030000060000000000003f1fd7b3400000003fc8f819408fc291400000003f'
  },
  {
    // recorded on 1.17.0.2, 1.17.10.4, 1.17.30.4, 1.17.40.6 (1.16.220.2 the same, its boat entity 5)
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.40',
    feetY: 4,
    click: '1e000300060000000000003f1fd7b3400000003fc8f819408fc291400000003f'
  },
  {
    // recorded on every build from 1.18.0.2 to 1.26.20.4 (1.19.0.5, 1.19.63.1 and 1.26.3.1 the same, their boat entity 5)
    from: 'bedrock_1.18.0',
    to: 'bedrock_1.26.20',
    feetY: -60,
    click: '1e000300060000000000003f1c8569c20000003fccf81940aec76dc20000003f'
  },
  {
    // recorded on 1.26.30.5, 1.26.40.5 and 1.26.45.1: an ItemV4, the type and the actions present
    from: 'bedrock_1.26.30',
    to: 'bedrock_1.26.45',
    feetY: -60,
    click: '1e00000103010006000000000000000000000000003f1c8569c20000003fccf81940aec76dc20000003f'
  },
  {
    // recorded on 1.26.50.4 and 1.26.51.1
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    feetY: -60,
    click: '1e0000030006000000000000000000000000003f1c8569c20000003fccf81940aec76dc20000003f'
  },
  {
    // recorded on 1.26.60.5: the hand
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    feetY: -60,
    click: '1e000003000600000000000000000000000000003f1c8569c20000003fccf81940aec76dc20000003f'
  }
]

/** the client holding 64 wheat in hotbar slot 0, using the villager of the runtime id (protocol_item_stacks) */
const VILLAGER_USES: ReadonlyArray<{ version: BedrockVersion, runtime: number, click: string }> = [
  { version: 'bedrock_1.26.20', runtime: 15, click: '1e0003000f0000dc0540000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f' },
  { version: 'bedrock_1.26.51', runtime: 2, click: '1e00000300020000510140000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f' },
  { version: 'bedrock_1.26.60', runtime: 13, click: '1e000003000d000000510140000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f' }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name and section requests */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

interface Setting {
  feetY?: number
  rotation?: Rotation
  blocks?: readonly BlockAt[]
}

/** joined standing at (0.5, feetY, 0.5) on stone, looking as the recorded clients' camera did */
async function joined (version: BedrockVersion, { feetY = -60, rotation = CAMERA, blocks = [] }: Setting = {}): Promise<TestBot & { errors: string[] }> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  // the recorded servers number the blocks by their hashes from 1.20.0
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[0, feetY - 1, 0, 'stone'], ...blocks] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation, game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, errors }
}

/** the entity, its box the one given, shown once the frame after ran */
async function show ({ bot, server, driver }: TestBot, runtime: number, type: string, position: Point3, { width, height }: { width: number, height: number }): Promise<Entity> {
  const { version } = bot
  write(server, 'add_entity', addEntity(version, { unique: -BigInt(runtime), runtime, type, position, metadata: boundingBox(version, width, height) }))
  await driver.frame(0)
  return spawned(bot, runtime)
}

/** ticks until `promise` settles */
async function settle (driver: ManualDriver, promise: Promise<unknown>): Promise<void> {
  let settled = false
  const done = promise.finally(() => { settled = true })
  await driver.runUntil(() => settled, 20)
  await done
}

/** the points each use clicked, the entity's runtime id, and where the eye looked from */
function clicks (server: FakeBedrockClient): Array<[runtime: bigint | number, point: Point3]> {
  return server.sentOf('inventory_transaction').map(({ transaction: { transaction_data: data } }) => {
    assert.ok(data !== undefined && 'entity_runtime_id' in data)
    return [data.entity_runtime_id, data.click_pos]
  })
}

function openScreen (server: FakeBedrockClient, type: 'inventory' | 'workbench' | 'furnace', runtime: bigint): void {
  server.send('container_open', { window_id: 3, window_type: type, coordinates: { x: 2, y: -60, z: 0 }, runtime_entity_id: runtime })
}

describe('bedrock using an entity', () => {
  for (const recorded of BOAT_USES) {
    describe(`the vanilla client using a boat (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: sends the use where its pick meets the boat's box in one input pass, and nothing else`, async () => {
          const testBot = await joined(version, { feetY: recorded.feetY })
          const { bot, server, driver, errors } = testBot
          // the boat's feet, where the client's box stands: its add_entity names a point 0.375 over them, which bot.entities keeps
          const boat = await show(testBot, 6, 'minecraft:boat', { x: 2.7, y: recorded.feetY, z: 0.7 }, BOAT)
          const batches = batchesSince(server)
          let used = false
          const use = bot.activateEntity(boat).then(() => { used = true })

          await driver.frame(10)
          assert.deepStrictEqual([batches(), used, errors], [[[recorded.click]], true, []])
          await driver.tick()
          assert.deepStrictEqual(batches(), [['player_auth_input']])
          await use
          bot.end()
        })
      }
    })
  }

  describe('the vanilla client using a villager with wheat in its hand (1.26.20, 1.26.51, 1.26.60)', () => {
    for (const recorded of VILLAGER_USES.filter(({ version }) => bedrockTestVersionsFrom(version, version).length > 0)) {
      it(`bedrock ${recorded.version}: names the held item without its stack id`, async () => {
        const testBot = await joined(recorded.version)
        const { bot, server, driver } = testBot
        new ServerInventory(server).slot('inventory', 0, { id: bot.registry.itemsByName['wheat']?.id ?? 0, count: 64, stackId: 25 })
        const villager = await show(testBot, recorded.runtime, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
        const batches = batchesSince(server)
        const use = bot.activateEntity(villager)
        await driver.frame(10)
        assert.deepStrictEqual(batches(), [[recorded.click]])
        await use
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it("looks at the box's centre first when its pick does not meet the entity, and clicks where the pick meets it then", async () => {
      const testBot = await joined(version, { rotation: { yaw: 90, pitch: 0 } })
      const { bot, server, driver } = testBot
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      const batches = batchesSince(server)
      const use = bot.activateEntity(villager)
      await driver.frame(10)
      assert.deepStrictEqual(batches(), [])
      await settle(driver, use)
      const looked = server.sentOf('player_auth_input').find(({ yaw }) => yaw === -90)
      // from the eye at (0.5, -58.38, 0.5) to (2.5, -59.05, 0.5): 0.67 down, 2 east; the box met on its west face
      assert.deepStrictEqual([looked?.yaw, looked?.pitch, clicks(server)], [-90, 18.521108627319336, [[2n, { x: 2.1000001430511475, y: -58.91599655151367, z: 0.5 }]]])
      bot.end()
    })

    it('clicks the point looked at when the pick meets another entity first, or a block, or reaches no farther', async () => {
      // the stone on the way to the villager south east, nothing on the way to the one 7 south
      const testBot = await joined(version, { blocks: [[1, -59, 3, 'stone']] })
      const { bot, server, driver } = testBot
      const boat = await show(testBot, 2, 'minecraft:boat', { x: 3.5, y: -60, z: 0.5 }, BOAT)
      // in front of the boat, on the way to its centre
      await show(testBot, 3, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      const behindBlock = await show(testBot, 4, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 5.5 }, VILLAGER)
      const far = await show(testBot, 5, 'minecraft:villager_v2', { x: 0.5, y: -60, z: 7.5 }, VILLAGER)
      for (const entity of [boat, behindBlock, far]) await settle(driver, bot.activateEntity(entity))
      assert.deepStrictEqual(clicks(server), [
        [2n, { x: 3.5, y: Math.fround(-60 + 0.455 / 2), z: 0.5 }],
        [4n, { x: 2.5, y: Math.fround(-60 + 0.95), z: 5.5 }],
        [5n, { x: 0.5, y: Math.fround(-60 + 0.95), z: 7.5 }]
      ])
      bot.end()
    })

    it('meets a box on the face toward the eye: its bottom, its east face, its south face', async () => {
      const testBot = await joined(version)
      const { bot, server, driver } = testBot
      const entities = [
        await show(testBot, 2, 'minecraft:villager_v2', { x: 1.5, y: -56, z: 0.5 }, VILLAGER),
        await show(testBot, 3, 'minecraft:villager_v2', { x: -1.5, y: -60, z: 0.5 }, VILLAGER),
        await show(testBot, 4, 'minecraft:villager_v2', { x: 0.5, y: -60, z: -1.5 }, VILLAGER)
      ]
      for (const entity of entities) await settle(driver, bot.activateEntity(entity))
      // up toward the first, its bottom met before the plane of its west face; west to the second; north to the third
      assert.deepStrictEqual(clicks(server), [
        [2n, { x: 1.1846837997436523, y: Math.fround(-56.1), z: 0.5 }],
        [3n, { x: Math.fround(-1.1), y: -58.91599655151367, z: 0.5 }],
        [4n, { x: 0.5, y: -58.91599655151367, z: Math.fround(-1.1) }]
      ])
      bot.end()
    })

    it("activateEntityAt looks at the point first, as Java's, then clicks where the pick meets the entity, or at the point", async () => {
      const testBot = await joined(version)
      const { bot, server, driver } = testBot
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      const far = await show(testBot, 3, 'minecraft:villager_v2', { x: 7.5, y: -60, z: 2.5 }, VILLAGER)
      // behind the first, on the same ray
      await show(testBot, 4, 'minecraft:villager_v2', { x: 4.5, y: -60, z: 0.5 }, VILLAGER)
      const batches = batchesSince(server)
      const use = bot.activateEntityAt(villager, new Vec3(2.5, -58.5, 0.5))
      await driver.frame(10)
      assert.deepStrictEqual(batches(), [])
      await settle(driver, use)
      await settle(driver, bot.activateEntityAt(far, new Vec3(7.2, -59, 2.5)))
      assert.deepStrictEqual(clicks(server), [[2n, { x: 2.1000001430511475, y: -58.47599792480469, z: 0.5 }], [3n, { x: 7.199999809265137, y: -59, z: 2.5 }]])
      bot.end()
    })

    it('names the hotbar slot the server selected, and its item', async () => {
      const testBot = await joined(version)
      const { bot, server, driver } = testBot
      const wheat = bot.registry.itemsByName['wheat']?.id ?? 0
      new ServerInventory(server).slot('inventory', 3, { id: wheat, count: 5 })
      server.send('player_hotbar', { selected_slot: 3, window_id: 'inventory', select_slot: true })
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      await settle(driver, bot.activateEntity(villager))
      const data = server.sentOf('inventory_transaction')[0]?.transaction.transaction_data
      assert.ok(data !== undefined && 'entity_runtime_id' in data)
      assert.deepStrictEqual([data.hotbar_slot, data.held_item.network_id, data.held_item.count], [3, wheat, 5])
      bot.end()
    })

    it("uses an entity once a block's use ended, as a held key cannot be pressed again", async () => {
      const testBot = await joined(version, { blocks: [[2, -60, 0, 'crafting_table']] })
      const { bot, server, driver } = testBot
      // north, out of the pick
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 0.5, y: -60, z: -2.5 }, VILLAGER)
      const table = bot.blockAt(new Vec3(2, -60, 0))
      assert.ok(table !== null)
      const batches = batchesSince(server)
      const uses = [bot.activateBlock(table), bot.activateEntity(villager)]
      await settle(driver, Promise.all(uses))
      const sent = batches().flat().filter(packet => packet !== 'player_auth_input').map(packet => packet.slice(0, 4))
      assert.deepStrictEqual(sent, ['2401', '2c01', '1e00', '2401', '1e00'])
      bot.end()
    })

    it("rejects a use that waited for a block's to end, over the screen the server opened meanwhile", async () => {
      const testBot = await joined(version, { blocks: [[2, -60, 0, 'crafting_table']] })
      const { bot, server, driver } = testBot
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 0.5, y: -60, z: -2.5 }, VILLAGER)
      const table = bot.blockAt(new Vec3(2, -60, 0))
      assert.ok(table !== null)
      const used = bot.openBlock(table)
      const waiting = assert.rejects(bot.activateEntity(villager), { message: 'an entity cannot be used while the minecraft:crafting_table window is open' })
      await driver.frame(10)
      openScreen(server, 'workbench', -1n)
      await settle(driver, waiting)
      await used
      assert.deepStrictEqual(server.sentOf('inventory_transaction').map(({ transaction }) => transaction.transaction_type), ['item_use'])
      bot.end()
    })

    it('rejects a use before the player is shown, over a screen, and of an entity the bot does not have', async () => {
      const unshown = await bedrockTestBot(bedrockCodec(version))
      new ServerWorld(unshown.server).startGame()
      await unshown.driver.frame(10)
      const player = unshown.bot.entity
      const early = assert.rejects(unshown.bot.activateEntity(player), { message: 'an entity cannot be used before the player is shown' })
      await unshown.driver.frame(10)
      await early
      unshown.bot.end()

      const testBot = await joined(version)
      const { bot, server, driver } = testBot
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      write(server, 'remove_entity', { entity_id_self: -2n })
      await driver.tick()
      const gone = assert.rejects(bot.activateEntity(villager), { message: 'the bot has no villager_v2 2' })
      await driver.frame(10)
      await gone
      const shown = await show(testBot, 3, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      openScreen(server, 'inventory', -1n)
      await driver.frame(10)
      const overScreen = assert.rejects(bot.activateEntity(shown), { message: 'an entity cannot be used while the minecraft:inventory window is open' })
      await driver.frame(10)
      await overScreen
      assert.deepStrictEqual(server.sentOf('inventory_transaction'), [])
      bot.end()
    })

    it('opens: resolves with the screen the server opened once shown; rejects one the bot does not show, or none in 100 ticks', async () => {
      const testBot = await joined(version)
      const { internal, server, driver } = testBot
      const villager = await show(testBot, 2, 'minecraft:villager_v2', { x: 2.5, y: -60, z: 0.5 }, VILLAGER)
      const furnace = assert.rejects(internal._entityUse.open(internal._core, villager), { message: 'the server opened a furnace screen, which the bot does not show' })
      await driver.ticks(3)
      openScreen(server, 'furnace', 2n)
      await driver.tick()
      await furnace
      const none = assert.rejects(internal._entityUse.open(internal._core, villager), { message: 'the server did not open the villager_v2 in 100 ticks' })
      await driver.ticks(100)
      await none
      let opened = false
      const opening = internal._entityUse.open(internal._core, villager).then(window => {
        opened = true
        return window
      })
      await driver.ticks(3)
      assert.strictEqual(opened, false)
      openScreen(server, 'inventory', 2n)
      await driver.tick()
      const window = await opening
      assert.deepStrictEqual([window === internal.currentWindow, window.type, clicks(server).length], [true, 'minecraft:inventory', 3])
      internal.end()
    })
  })
})
