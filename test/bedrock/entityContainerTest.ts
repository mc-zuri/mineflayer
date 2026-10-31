import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import type { Window } from 'prismarine-windows'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, spawned, write } from './common/entities.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersions } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The screens of the entities with a container, opened by bot.openEntity and bot.openContainer, as a scripted server
// opened them for the vanilla client on 1.26.20, 1.26.51 and 1.26.60 (containers_minecart_chest,
// containers_minecart_hopper, containers_chest_boat): container_open naming the entity's runtime id, no content, the
// slots by inventory_slot, the requests naming container. 1.26.51.1's ids below; the recorded item (306) is planks
// here, which every version has. The use itself is useEntityTest's.

const PLANKS = 5
/** south of the player standing at (0.5, 12, 0.5), clear of the stone at (1, 12, 0) */
const BESIDE: Point3 = Object.freeze({ x: 0.5, y: 12, z: 2.5 })
const MINECART = Object.freeze({ width: 0.9800000190734863, height: 0.699999988079071 })
const CHEST_BOAT = Object.freeze({ width: 1.399999976158142, height: 0.45500001311302185 })

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface EntityBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
}

async function entityBot (version: BedrockVersion): Promise<EntityBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors }
}

/** the entity, its box the one given, shown once the frame after ran */
async function show ({ bot, server, driver }: TestBot, runtime: number, type: string, position: Point3, { width, height }: { width: number, height: number }): Promise<Entity> {
  const { version } = bot
  write(server, 'add_entity', addEntity(version, { unique: BigInt(runtime), runtime, type, position, metadata: boundingBox(version, width, height) }))
  await driver.frame(0)
  return spawned(bot, runtime)
}

/** the entities each use named */
function used (server: FakeBedrockClient): Array<bigint | number> {
  return server.sentOf('inventory_transaction').map(({ transaction: { transaction_data: data } }) => {
    assert.ok(data !== undefined && 'entity_runtime_id' in data)
    return data.entity_runtime_id
  })
}

/** the server's answer to the use: the entity's screen, as the scripted server sent it, once the use left */
async function openOnUse ({ server, driver }: TestBot, id: number, type: 'container' | 'hopper' | 'minecart_chest' | 'minecart_hopper' | 'chest_boat', runtime: number): Promise<void> {
  await driver.runUntil(() => used(server).length > 0, 40)
  openEntityScreen(server, id, type, runtime)
}

function openEntityScreen (server: FakeBedrockClient, id: number, type: 'container' | 'hopper' | 'minecart_chest' | 'minecart_hopper' | 'chest_boat', runtime: number): void {
  server.send('container_open', { window_id: id, window_type: type, coordinates: { x: Math.floor(BESIDE.x), y: BESIDE.y, z: Math.floor(BESIDE.z) }, runtime_entity_id: BigInt(runtime) })
}

/** ticks until `promise` settles */
async function settled (driver: TestBot['driver'], promise: Promise<unknown>): Promise<void> {
  let done = false
  const settling = promise.finally(() => { done = true })
  await driver.runUntil(() => done, 150)
  await settling
}

/** a window's Java type, title, slots and inventory part */
function shapeOf (window: Window | null): [string | number, string, number, number, number] | null {
  return window === null ? null : [window.type, window.title, window.slots.length, window.inventoryStart, window.inventoryEnd]
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

/** a slot as a request names it, without 1.21.20's dynamic id */
function describeSlot (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** each request the bot sent, as the recorded ones are described here: its id, its actions (no legacy type id) */
function requests (server: FakeBedrockClient): string[] {
  return server.sentOf('item_stack_request').flatMap(({ requests }) => requests).map(({ request_id: id, actions }) =>
    `${id} ${actions.map(({ type_id: type, count, source, destination }) =>
      `${String(type)} ${count ?? ''} ${source === undefined ? '' : describeSlot(source)}${destination === undefined ? '' : ` → ${describeSlot(destination)}`}`).join(', ')}`)
}

/** the close the vanilla client sends: from 1.21.0 naming the screen's type none */
function close (version: BedrockVersion, id: number): BedrockServerboundPackets['container_close'] {
  return atLeast(version, 'bedrock_1.21.0') ? { window_id: id, window_type: 'none', server: false } : { window_id: id, server: false }
}

/** the frame after the close's in which the vanilla client sends container_close: after the crafting table's animation from 1.21.120, at the rate it was recorded at */
function closeFrame (version: BedrockVersion): number {
  if (!atLeast(version, 'bedrock_1.21.120')) return 0
  return atLeast(version, 'bedrock_1.26.60') ? 8 : 14
}

/** the frames from the close's input pass to container_close's: 0, in the same */
async function framesUntilClose ({ server, driver }: Pick<TestBot, 'server' | 'driver'>, version: BedrockVersion): Promise<number> {
  await driver.tick()
  for (let frames = 0; frames <= 20; frames++) {
    if (server.sentOf('container_close').length > 0) return frames
    await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
  }
  return Infinity
}

describe('bedrock entities\' containers', () => {
  describe('the scripted server\'s chest minecart, its slots named container (1.26.51\'s ids on every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: openEntity uses it, resolves with its chest window when the server opens the screen naming it, shown at the next tick without content, and the screen clicks and closes as a chest's`, async () => {
        const testBot = await entityBot(version)
        const { bot, internal, server, driver, inventory, errors } = testBot
        const minecart = await show(testBot, 1005, 'minecraft:chest_minecart', BESIDE, MINECART)
        internal._core.requestIds.continueProcess(-471)
        const opened: Window[] = []
        bot.on('windowOpen', window => { opened.push(window) })
        const opening = bot.openEntity(minecart)
        await openOnUse(testBot, 3, 'container', 1005)
        // in the opening's batch, past the screen's 27 too
        inventory.slot(3, 0, { id: PLANKS, count: 1, stackId: 2169 })
        inventory.slot(3, 27, { id: PLANKS, count: 28, stackId: 2196 })
        await settled(driver, opening)
        const window = await opening
        assert.deepStrictEqual([used(server), opened, window === bot.currentWindow, window.id, shapeOf(window), countAndId(window.slots[0]), window.slots[27]], [
          [1005n], [window], true, 3, ['minecraft:chest', 'Minecart with Chest', 63, 27, 63], [1, 2169], null
        ])

        const clicked = bot.clickWindow(0, 0, 0)
        await driver.tick()
        inventory.respond(-471, [{ container: 'container', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 2169 }])
        await driver.tick()
        await clicked
        inventory.slot('ui', 0, null)
        const closing = bot.closeWindow(window)
        const frames = await framesUntilClose(testBot, version)
        server.send('container_close', { window_id: 3, server: false })
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([requests(server), frames, server.sentOf('container_close'), bot.currentWindow, errors], [
          ['-471 take 1 container:0#2169 → cursor:0#0'], closeFrame(version), [close(version, 3)], null, []
        ])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('openContainer opens a hopper minecart\'s 5 slots and a chest boat\'s 27 by openEntity, as the scripted server did (windows 3, runtime ids 1007 and 1001), its clicks naming container', async () => {
      const testBot = await entityBot(version)
      const { bot, internal, server, driver, inventory, errors } = testBot
      const hopper = await show(testBot, 1007, 'minecraft:hopper_minecart', BESIDE, MINECART)
      internal._core.requestIds.continueProcess(-579)
      const hopperOpening = bot.openContainer(hopper)
      await openOnUse(testBot, 3, 'hopper', 1007)
      inventory.slot(3, 0, { id: PLANKS, count: 1, stackId: 2238 })
      await settled(driver, hopperOpening)
      const hopperWindow = await hopperOpening
      const clicked = bot.clickWindow(0, 0, 0)
      await driver.tick()
      inventory.respond(-579, [{ container: 'container', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 2238 }])
      await driver.tick()
      await clicked
      server.send('container_close', { window_id: 3, server: true })
      inventory.slot('ui', 0, null)
      await driver.tick()

      const boat = await show(testBot, 1001, 'minecraft:chest_boat', { ...BESIDE, y: BESIDE.y + 0.375 }, CHEST_BOAT)
      const boatOpening = bot.openChest(boat)
      await driver.runUntil(() => used(server).length > 1, 40)
      openEntityScreen(server, 3, 'container', 1001)
      await settled(driver, boatOpening)
      const boatWindow = await boatOpening
      assert.deepStrictEqual([used(server), shapeOf(hopperWindow), shapeOf(boatWindow), 'deposit' in boatWindow, requests(server), errors], [
        [1007n, 1001n],
        ['minecraft:hopper', 'Minecart with Hopper', 41, 5, 41],
        ['minecraft:chest', 'Boat with Chest', 63, 27, 63],
        true,
        ['-579 take 1 container:0#2238 → cursor:0#0'],
        []
      ])
      bot.end()
    })

    it('shows the screens a server may open by the entity\'s type (not recorded) as those of container and hopper, and one naming an entity without a container as the block\'s at its coordinates', async () => {
      const testBot = await entityBot(version)
      const { bot, server, driver } = testBot
      await show(testBot, 1005, 'minecraft:chest_minecart', BESIDE, MINECART)
      await show(testBot, 1007, 'minecraft:hopper_minecart', BESIDE, MINECART)
      await show(testBot, 1001, 'minecraft:chest_boat', BESIDE, CHEST_BOAT)
      await show(testBot, 1008, 'minecraft:pig', BESIDE, MINECART)
      const shown: Array<ReturnType<typeof shapeOf>> = []
      for (const [type, runtime] of [['minecart_chest', 1005], ['minecart_hopper', 1007], ['chest_boat', 1001], ['container', 1008], ['hopper', 1008]] as const) {
        openEntityScreen(server, 2, type, runtime)
        await driver.ticks(2)
        shown.push(shapeOf(bot.currentWindow))
        server.send('container_close', { window_id: 2, server: true })
        await driver.tick()
      }
      assert.deepStrictEqual(shown, [
        ['minecraft:chest', 'Minecart with Chest', 63, 27, 63],
        ['minecraft:hopper', 'Minecart with Hopper', 41, 5, 41],
        ['minecraft:chest', 'Boat with Chest', 63, 27, 63],
        ['minecraft:container', 'Container', 63, 27, 63],
        ['minecraft:hopper', 'Hopper', 41, 5, 41]
      ])
      bot.end()
    })

    it('openEntity rejects when the server opens no screen in 100 ticks, and openContainer on an entity whose screen is no container\'s', async () => {
      const testBot = await entityBot(version)
      const { bot, server, driver } = testBot
      const minecart = await show(testBot, 1005, 'minecraft:chest_minecart', BESIDE, MINECART)
      const unopened = assert.rejects(bot.openEntity(minecart), { message: 'the server did not open the chest_minecart in 100 ticks' })
      await settled(driver, unopened)
      const table = assert.rejects(bot.openContainer(minecart), { message: 'Non-container window used as a container: {"id":4,"type":"minecraft:crafting_table","title":"Crafting"}' })
      await driver.runUntil(() => used(server).length > 1, 40)
      server.send('container_open', { window_id: 4, window_type: 'workbench', coordinates: { x: 0, y: 12, z: 2 }, runtime_entity_id: 1005n })
      await settled(driver, table)
      bot.end()
    })
  })
})
