import assert from 'assert'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { WindowClick } from '../../lib/bedrock/modules/clicks.ts'
import type { Move } from '../../lib/bedrock/modules/inventory.ts'
import { stackAction } from '../../lib/bedrock/modules/items.ts'
import type { ActionType, ContainerName, SlotRef } from '../../lib/bedrock/modules/items.ts'
import { CURSOR, OUTPUT } from '../../lib/bedrock/modules/screens.ts'
import type { OpenScreen, ScreenDefinition, ScreenHooks, ScreenLayout, ScreenOpening } from '../../lib/bedrock/modules/screens.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../lib/types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The screens a feature defines, here fixtures of a test's own: the bot loads none of its plugins, so that no real
// screen is defined twice. The recorded values are the vanilla client's against Bedrock Dedicated Server.

const PLANKS = 5
const STONE = 1
const CHEST_AT = Object.freeze({ x: 2, y: 12, z: 0 })
const HOTBAR_0: SlotRef = Object.freeze({ container: 'hotbar', slot: 0 })

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function isInternal (bot: BedrockBot): bot is BedrockBotInternal {
  return '_inventory' in bot
}

function refs (container: ContainerName, from: number, count: number): readonly SlotRef[] {
  return Array.from({ length: count }, (_, index) => ({ container, slot: from + index }))
}

function layout (windowType: string, slots: readonly SlotRef[], craftingResultSlot = -1): ScreenLayout {
  return { windowType, title: windowType, slots, craftingResultSlot }
}

/** a block container's screen: its items in its own window, nothing handed back but the cursor */
function blockContainer (type: ScreenDefinition['type'], windowType: string, size: number, rules: Partial<ScreenDefinition> = {}): ScreenDefinition {
  return { type, containers: { container: 'open' }, shown: 'open', layout: () => layout(windowType, refs('container', 0, size)), animation: 'workbench', handBack: [CURSOR], ...rules }
}

const HOPPER = blockContainer('hopper', 'minecraft:hopper', 5)
/** sized by its window's first content: 27 slots or 54 */
const CHEST: ScreenDefinition = {
  ...blockContainer('container', 'minecraft:chest', 27),
  shown: 'content',
  layout: (_opening, size) => size === 27 || size === 54 ? layout('minecraft:chest', refs('container', 0, size)) : undefined
}
const FURNACE: ScreenDefinition = {
  type: 'furnace',
  containers: { furnace_ingredient: 'open', furnace_fuel: 'open', furnace_output: 'open' },
  shown: 'open',
  layout: () => layout('minecraft:furnace', [{ container: 'furnace_ingredient', slot: 0 }, { container: 'furnace_fuel', slot: 1 }, { container: 'furnace_output', slot: 2 }], 2),
  animation: 'workbench',
  handBack: [CURSOR]
}
const STONECUTTER_INPUT: SlotRef = Object.freeze({ container: 'stonecutter_input', slot: 3 })
/** a UI station: its items in the ui window, its input handed back */
const STONECUTTER: ScreenDefinition = {
  type: 'stonecutter',
  containers: { stonecutter_input: 'ui', creative_output: 'ui' },
  shown: 'open',
  layout: () => layout('minecraft:stonecutter', [STONECUTTER_INPUT, OUTPUT], 1),
  animation: 'workbench',
  handBack: [CURSOR, STONECUTTER_INPUT]
}
const TRADING: ScreenDefinition = {
  type: 'trading',
  containers: { trade2_ingredient1: 'ui', trade2_ingredient2: 'ui', creative_output: 'ui' },
  shown: 'open',
  layout: () => layout('minecraft:villager', [{ container: 'trade2_ingredient1', slot: 4 }, { container: 'trade2_ingredient2', slot: 5 }, OUTPUT], 2),
  animation: 'workbench',
  handBack: [CURSOR],
  closeId: 'none'
}

interface ScreenBot extends TestBot {
  internal: BedrockBotInternal
  inventory: ServerInventory
  errors: string[]
}

/** joined with a chest beside the feet, the screens `define` defines, no plugin of the bot's own loaded */
async function screenBot (version: BedrockVersion, define: (bot: BedrockBotInternal) => void = () => {}, { craft = false, ...options }: { screenAnimations?: boolean, craft?: boolean } = {}): Promise<ScreenBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), {
    ...options,
    loadInternalPlugins: false,
    plugins: {
      craft,
      fixtures: bot => {
        assert.ok(isInternal(bot))
        define(bot)
      }
    }
  })
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[CHEST_AT.x, CHEST_AT.y, CHEST_AT.z, 'chest']] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors }
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

/** a slot as a request names it: its container (and 1.21.20's dynamic id), slot and stack id */
function slotName (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? `${type.container_id}${type.dynamic_container_id === undefined ? '' : `@${type.dynamic_container_id}`}` : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** each request the bot sent since the last call, written as the recorded ones are described: its id, its actions (a legacy type id after a slash) */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => `${id} ${actions.map(action => {
      const type = `${String(action.type_id)}${action.legacy_type_id === undefined ? '' : `/${action.legacy_type_id}`}`
      const to = action.destination === undefined ? '' : ` → ${slotName(action.destination)}`
      return `${type} ${action.count ?? ''} ${action.source === undefined ? '' : slotName(action.source)}${to}`
    }).join(', ')}`)
  }
}

function closes (server: FakeBedrockClient): Array<BedrockServerboundPackets['container_close']> {
  return server.sentOf('container_close')
}

/** the close the vanilla client sends: from 1.21.0 naming the screen's type none */
function close (version: BedrockVersion, id: number | 'none'): BedrockServerboundPackets['container_close'] {
  return atLeast(version, 'bedrock_1.21.0') ? { window_id: id, window_type: 'none', server: false } : { window_id: id, server: false }
}

function openContainer (server: FakeBedrockClient, id: number, type: ScreenOpening['type'], { x, y, z } = CHEST_AT): void {
  server.send('container_open', { window_id: id, window_type: type, coordinates: { x, y, z }, runtime_entity_id: -1n })
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

type PassContext = Parameters<Parameters<BedrockBotInternal['_core']['command']>[0]>[0]

/** made in the next input pass, which is stepped */
async function inPass<Result> ({ internal, driver }: Pick<ScreenBot, 'internal' | 'driver'>, run: (ctx: PassContext) => Promise<Result>): Promise<Result> {
  const made = internal._core.call(run)
  await driver.frame(10)
  return await made
}

/** made in the next input pass, not awaited: a request the server is not to answer */
function madeInPass (internal: BedrockBotInternal, run: (ctx: PassContext) => Promise<void>): void {
  internal._core.call(run).catch(() => {})
}

/** ticks until `promise` settles */
async function settled (driver: TestBot['driver'], promise: Promise<unknown>): Promise<void> {
  let done = false
  const settling = promise.finally(() => { done = true })
  await driver.runUntil(() => done, 20)
  await settling
}

/** the frame in which the vanilla client sends container_close, after the close's, at the rate it was recorded at (as inventoryTest's) */
function closeFrame (version: BedrockVersion, animation: 'inventory' | 'workbench'): number {
  const halfRate = atLeast(version, 'bedrock_1.26.60')
  if (animation === 'inventory') return halfRate ? 5 : 9
  return halfRate ? 8 : 14
}

async function framesUntilClose ({ server, driver }: Pick<TestBot, 'server' | 'driver'>, version: BedrockVersion): Promise<number> {
  const before = closes(server).length
  for (let frames = 1; frames <= 20; frames++) {
    await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
    if (closes(server).length > before) return frames
  }
  return Infinity
}

/** recorded in reduced_stations: 10 planks in hotbar slot 0 taken to the cursor, placed in a hopper's slot 0, shift clicked back, then the close */
interface Recorded {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  window: number
  stackId: number
  firstRequest: number
  requests: readonly string[]
  /** a furnace's window in the recording of its properties */
  furnace: number
}

const RECORDED: readonly Recorded[] = [
  {
    // recorded on 1.16.201.2
    name: 'inventory_id, container_id and slot_id, aux items, result',
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    window: 18,
    stackId: 3032,
    firstRequest: -4059,
    requests: ['-4059 take 10 hotbar:0#3032 → cursor:0#0', '-4061 place 10 cursor:0#3032 → container:0#0', '-4063 place 10 container:0#3032 → hotbar_and_inventory:0#0'],
    furnace: 10
  },
  {
    // 1.16.201.2's values in the versions' layouts: slot_type from 1.16.210, items with a count from 1.16.220, a cause from 1.19.30, the close's type from 1.21.0
    name: 'window_id, slot_type, aux items or items',
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.21.2',
    window: 18,
    stackId: 3032,
    firstRequest: -4059,
    requests: ['-4059 take 10 hotbar:0#3032 → cursor:0#0', '-4061 place 10 cursor:0#3032 → container:0#0', '-4063 place 10 container:0#3032 → hotbar_and_inventory:0#0'],
    furnace: 10
  },
  {
    // recorded on 1.21.20.3
    name: 'full container names with dynamic id 0, dynamic_window_id in contents and slots',
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    window: 20,
    stackId: 2643,
    firstRequest: -3349,
    requests: ['-3349 take 10 hotbar@0:0#2643 → cursor@0:0#0', '-3351 place 10 cursor@0:0#2643 → container@0:0#0', '-3353 place 10 container@0:0#2643 → hotbar_and_inventory@0:0#0'],
    furnace: 12
  },
  {
    // recorded on 1.21.30.3
    name: 'full container names, the window\'s container and storage item; inventory_slot\'s byte window id from 1.26.20, ItemV4 contents from 1.26.30',
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.26.30',
    window: 20,
    stackId: 2643,
    firstRequest: -3349,
    requests: ['-3349 take 10 hotbar:0#2643 → cursor:0#0', '-3351 place 10 cursor:0#2643 → container:0#0', '-3353 place 10 container:0#2643 → hotbar_and_inventory:0#0'],
    furnace: 12
  },
  {
    // recorded on 1.26.51.1
    name: 'the action\'s type again, 32-bit stack ids',
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.60',
    window: 20,
    stackId: 97,
    firstRequest: -227,
    requests: ['-227 take/0 10 hotbar:0#97 → cursor:0#0', '-229 place/1 10 cursor:0#97 → container:0#0', '-231 place/1 10 container:0#97 → hotbar_and_inventory:0#0'],
    furnace: 12
  }
]

describe('bedrock screens', () => {
  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      const { window: id, stackId, firstRequest } = recorded
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        const planks: Given = { id: PLANKS, count: 10, stackId, blockRuntimeId: 1921718966 }

        it(`bedrock ${version}: shows a hopper at its opening, moves the planks in and out as the vanilla client, and closes it`, async () => {
          const bot = await screenBot(version, internal => { internal._inventory.screens.add(HOPPER) }, { screenAnimations: false })
          const { bot: { inventory: items }, internal, server, driver, inventory, errors } = bot
          internal._core.requestIds.continueProcess(firstRequest)
          inventory.slot('inventory', 0, planks)
          await driver.tick()
          const requests = requestsSince(server)
          const opened: Window[] = []
          bot.bot.on('windowOpen', window => { opened.push(window) })
          openContainer(server, id, 'hopper')
          // recorded twice
          inventory.content(id, [null, null, null, null, null])
          inventory.content(id, [null, null, null, null, null])
          await driver.frame(10)
          const window = bot.bot.currentWindow
          assert.ok(window !== null)
          assert.deepStrictEqual([opened, window.id, window.type, window.slots.length, window.inventoryStart, window.inventoryEnd, countAndId(window.slots[32])], [[window], id, 'minecraft:hopper', 41, 5, 41, [10, stackId]])

          const take = bot.bot.clickWindow(32, 0, 0)
          await driver.tick()
          inventory.respond(firstRequest, [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 10, stackId }])
          await driver.tick()
          await take
          const place = bot.bot.clickWindow(0, 0, 0)
          await driver.tick()
          // recorded before the response, in its batch
          inventory.slot(id, 0, planks)
          inventory.respond(firstRequest - 2, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'container', slot: 0, count: 10, stackId }])
          await driver.tick()
          await place
          assert.deepStrictEqual([countAndId(window.slots[0]), window.selectedItem, countAndId(window.slots[32])], [[10, stackId], null, null])
          const shift = bot.bot.clickWindow(0, 0, 1)
          await driver.tick()
          inventory.slot(id, 0, null)
          inventory.respond(firstRequest - 4, [{ container: 'container', slot: 0, count: 0, stackId: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 10, stackId }])
          await driver.tick()
          await shift
          assert.deepStrictEqual([window.slots[0], countAndId(window.slots[32]), countAndId(items.slots[36])], [null, [10, stackId], [10, stackId]])

          const closed: Window[] = []
          bot.bot.on('windowClose', window => { closed.push(window) })
          const closing = bot.bot.closeWindow(window)
          await driver.tick()
          server.send('container_close', { window_id: id, server: false })
          await driver.tick()
          await closing
          assert.deepStrictEqual([requests(), closes(server), closed, bot.bot.currentWindow, errors], [recorded.requests, [close(version, id)], [window], null, []])
          bot.bot.end()
        })

        it(`bedrock ${version}: shows a chest at its window's first content, which sizes it, and openBlock resolves then`, async () => {
          const { bot, server, driver, inventory, errors } = await screenBot(version, internal => { internal._inventory.screens.add(CHEST) })
          const chest = bot.blockAt(new Vec3(CHEST_AT.x, CHEST_AT.y, CHEST_AT.z))
          assert.ok(chest !== null)
          let shown: Window | undefined
          const opening = bot.openBlock(chest).then(window => { shown = window })
          await driver.ticks(4)
          const opened: Window[] = []
          bot.on('windowOpen', window => { opened.push(window) })
          openContainer(server, id, 'container')
          await driver.ticks(2)
          // the player's windows' content sizes no screen
          inventory.content('inventory', Array.from({ length: 36 }, () => null))
          await driver.frame(10)
          assert.deepStrictEqual([opened, bot.currentWindow, shown], [[], null, undefined])
          // servers send it two or three times
          inventory.content(id, Array.from({ length: 27 }, (_, slot) => slot === 3 ? planks : null))
          inventory.content(id, Array.from({ length: 27 }, (_, slot) => slot === 3 ? planks : null))
          await driver.frame(10)
          await opening
          assert.ok(shown !== undefined)
          assert.deepStrictEqual([opened, shown === bot.currentWindow, shown.id, shown.type, shown.slots.length, countAndId(shown.slots[3]), errors], [[shown], true, id, 'minecraft:chest', 63, [10, stackId], []])
          bot.end()
        })

        it(`bedrock ${version}: hands a furnace's properties to its feature, those sent before its opening first`, async () => {
          const shown: Array<Array<[number, number]>> = []
          const data: Array<[number, number]> = []
          const furnace = recorded.furnace
          const { bot, internal, driver, server, inventory } = await screenBot(version, internal => {
            internal._inventory.screens.add(FURNACE, {
              shown: screen => { shown.push([...screen.properties]) },
              // as stored
              data: (property, value, screen) => { data.push([property, value === screen.properties.get(property) ? value : -1]) }
            })
          })
          // as recorded, in the opening's batch, before it; and another window's
          inventory.setData(furnace, 0, 1)
          inventory.setData(furnace, 1, 1600)
          inventory.setData(furnace, 2, 1600)
          inventory.setData(furnace + 1, 0, 7)
          openContainer(server, furnace, 'furnace')
          await driver.frame(10)
          inventory.setData(furnace, 0, 2)
          inventory.setData(furnace, 1, 1599)
          inventory.setData(furnace + 1, 1, 8)
          await driver.frame(10)
          // the other window's before this opening were dropped
          server.send('container_close', { window_id: furnace, server: true })
          openContainer(server, furnace + 1, 'furnace')
          await driver.frame(10)
          assert.deepStrictEqual([shown, data, internal._inventory.stats.otherData], [[[[0, 1], [1, 1600], [2, 1600]], [[1, 8]]], [[0, 2], [1, 1599]], 1])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const stone: Given = { id: STONE, count: 3, stackId: 18 }

    describe('defining screens', () => {
      it('defines a type once, and a container in one store', async () => {
        const { bot, internal } = await screenBot(version)
        const { screens } = internal._inventory
        screens.add(HOPPER)
        assert.throws(() => { screens.add(HOPPER) }, { message: 'the hopper screen is defined twice' })
        assert.throws(() => { screens.add({ ...STONECUTTER, type: 'loom', containers: { container: 'ui' } }) }, { message: 'the loom screen has container in the ui store, which is in the open store' })
        // nothing of a refused definition is kept
        assert.throws(() => { screens.add({ ...STONECUTTER, containers: { loom_input: 'ui', cursor: 'open' } }) }, { message: 'the stonecutter screen has cursor in the open store, which is in the ui store' })
        assert.deepStrictEqual([screens.definitionOf('hopper') === HOPPER, screens.definitionOf('stonecutter'), screens.storeOf('loom_input'), screens.storeOf('container'), screens.storeOf('cursor')], [true, undefined, undefined, 'open', 'ui'])
        bot.end()
      })

      it('refuses a move naming a container no screen says where the items of are', async () => {
        const { bot, internal, driver } = await screenBot(version)
        const move: Move = { type: 'place', count: 1, from: CURSOR, to: { container: 'loom_input', slot: 9 } }
        await assert.rejects(inPass({ internal, driver }, async ctx => { await internal._inventory.request(internal._core, ctx, [move]) }), { message: 'no screen says where the loom_input container\'s items are' })
        bot.end()
      })

      it('adds hooks to a type defined, one output and one close each', async () => {
        const { bot, internal } = await screenBot(version)
        const { screens } = internal._inventory
        const output: ScreenHooks['output'] = async () => {}
        assert.throws(() => { screens.extend('hopper', {}) }, { message: 'no hopper screen is defined' })
        screens.add(STONECUTTER, { output })
        screens.extend('stonecutter', { shown: () => {} })
        assert.throws(() => { screens.extend('stonecutter', { output }) }, { message: 'the stonecutter screen has a hook for its output already' })
        screens.extend('stonecutter', { close: () => {} })
        assert.throws(() => { screens.extend('stonecutter', { close: () => {} }) }, { message: 'the stonecutter screen has a hook for its close already' })
        assert.deepStrictEqual(screens.definedOf('stonecutter')?.hooks.length, 3)
        bot.end()
      })

      it('writes each screen\'s actions, from 1.26.40 with the type again, which 1.26.60 shifts from non_implemented on', () => {
        const typed = (type: ActionType, at: BedrockVersion): number | undefined => stackAction(at, type, {}).legacy_type_id
        const types: ActionType[] = ['destroy', 'lab_table_combine', 'beacon_payment', 'mine_block', 'craft_creative', 'optional', 'craft_grindstone_request', 'craft_loom_request', 'non_implemented', 'results_deprecated']
        assert.deepStrictEqual([types.map(type => typed(type, 'bedrock_1.26.40')), types.map(type => typed(type, 'bedrock_1.26.60')), typed('optional', 'bedrock_1.26.30')], [
          [4, 9, 10, 11, 14, 15, 16, 17, 18, 19], [4, 9, 10, 11, 14, 15, 16, 17, 19, 20], undefined
        ])
      })
    })

    describe('opening', () => {
      it('counts a screen whose definition shows none, and openBlock rejects naming it', async () => {
        const { bot, internal, server, driver } = await screenBot(version, internal => { internal._inventory.screens.add(CHEST) })
        const chest = bot.blockAt(new Vec3(CHEST_AT.x, CHEST_AT.y, CHEST_AT.z))
        assert.ok(chest !== null)
        const refused = assert.rejects(bot.openBlock(chest), { message: 'the server opened a container screen, which the bot does not show' })
        await driver.ticks(4)
        openContainer(server, 5, 'container')
        new ServerInventory(server).content(5, [null, null])
        await settled(driver, refused)
        assert.deepStrictEqual([bot.currentWindow, internal._inventory.stats.otherScreens, internal._inventory.openings, internal._inventory.lastOpened], [null, 1, 1, 'container'])
        bot.end()
      })

      it('drops a screen the server closes before its content, and counts content for no screen', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => { internal._inventory.screens.add(CHEST) })
        openContainer(server, 5, 'container')
        server.send('container_close', { window_id: 5, server: true })
        inventory.content(5, Array.from({ length: 27 }, () => null))
        await driver.frame(10)
        assert.deepStrictEqual([bot.currentWindow, internal._inventory.stats.otherWindows, internal._inventory.openings], [null, 1, 0])
        bot.end()
      })

      it('keeps the properties sent while a screen waits for its content', async () => {
        let properties: Array<[number, number]> = []
        const { bot, server, driver, inventory } = await screenBot(version, internal => { internal._inventory.screens.add(CHEST, { shown: screen => { properties = [...screen.properties] } }) })
        openContainer(server, 5, 'container')
        inventory.setData(5, 1, 3)
        inventory.content(5, Array.from({ length: 54 }, () => null))
        await driver.frame(10)
        assert.deepStrictEqual([bot.currentWindow?.slots.length, properties], [90, [[1, 3]]])
        bot.end()
      })

      it('opens a screen another packet opens, its data kept from before, and closes it naming none, as recorded on 1.26.51.1, until the server closes its id', async () => {
        let properties: Array<[number, number]> = []
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => {
          internal._inventory.screens.add(TRADING, { shown: screen => { properties = [...screen.properties] } })
          internal._core.handle('fixtures', 'update_trade', (packet, ctx) => {
            internal._inventory.openScreen(internal._core, ctx, { id: packet.window_id, type: packet.window_type, position: { x: 0, y: 0, z: 0 }, entity: 2n })
          })
        })
        inventory.setData(6, 4, 9)
        server.send('update_trade', { window_id: 6, window_type: 'trading', display_name: 'entity.villager.mason', new_trading_ui: true })
        // a UI station's own window shows nothing
        inventory.content(6, [null, null, null])
        await driver.frame(10)
        const window = bot.currentWindow
        assert.ok(window !== null)
        assert.deepStrictEqual([window.id, window.type, window.slots.length, properties, internal._inventory.stats.otherWindows], [6, 'minecraft:villager', 39, [[4, 9]], 1])
        const closing = bot.closeWindow(window)
        await driver.frames([62.5, 62.5, 62.5, 62.5, 62.5, 62.5, 62.5, 62.5, 62.5])
        server.send('container_close', { window_id: 'none', server: false })
        await driver.frame(10)
        assert.strictEqual(bot.currentWindow, window)
        server.send('container_close', { window_id: 6, server: false })
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([closes(server), bot.currentWindow], [[{ window_id: 'none', window_type: 'none', server: false }], null])
        bot.end()
      })

      it('replaces a screen the server opens over another: one shown at its content shows none until then, one shown at its opening drops one waiting, each with its own window emptied', async () => {
        const { bot, server, driver, inventory } = await screenBot(version, internal => {
          internal._inventory.screens.add(HOPPER)
          internal._inventory.screens.add(CHEST)
        })
        openContainer(server, 6, 'hopper')
        inventory.content(6, [{ id: PLANKS, count: 2, stackId: 7 }])
        await driver.frame(10)
        const first = countAndId(bot.currentWindow?.slots[0])
        openContainer(server, 5, 'container')
        await driver.frame(10)
        const waiting = bot.currentWindow
        openContainer(server, 7, 'hopper')
        inventory.content(5, Array.from({ length: 27 }, () => null))
        // another window's is not the screen's
        inventory.content(9, [{ id: PLANKS, count: 2, stackId: 7 }])
        await driver.frame(10)
        assert.deepStrictEqual([first, waiting, bot.currentWindow?.id, bot.currentWindow?.slots[0]], [[2, 7], null, 7, null])
        bot.end()
      })

      it('tells set_player_inventory_options for no screen that has no options of its own (1.20.50 – 1.21.101)', async () => {
        const { bot, server, driver } = await screenBot('bedrock_1.20.50', internal => { internal._inventory.screens.add(HOPPER) })
        openContainer(server, 3, 'hopper')
        await driver.frames([50, 50, 50, 50, 50])
        assert.deepStrictEqual(server.sentOf('set_player_inventory_options'), [])
        bot.end()
      })

      it('runs every screen\'s shown hooks, then the screen\'s own, before windowOpen', async () => {
        const order: string[] = []
        const { bot, internal, server, driver } = await screenBot(version, internal => {
          internal._inventory.screens.add(HOPPER, { shown: screen => { order.push(`hopper ${screen.window.type}`) } })
          internal._inventory.screens.onShown(screen => { order.push(`every ${screen.opening.type}`) })
        })
        bot.on('windowOpen', () => { order.push('windowOpen') })
        openContainer(server, 3, 'hopper')
        await driver.frame(10)
        assert.deepStrictEqual([order, internal._inventory.screenType], [['every hopper', 'hopper minecraft:hopper', 'windowOpen'], 'hopper'])
        bot.end()
      })

      it('empties the screen\'s own window when it closes: its content after counted, a response naming it ignored', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => { internal._inventory.screens.add(HOPPER) })
        openContainer(server, 3, 'hopper')
        inventory.content(3, [{ id: PLANKS, count: 2, stackId: 7 }])
        await driver.frame(10)
        const window = bot.currentWindow
        assert.deepStrictEqual(countAndId(window?.slots[0]), [2, 7])
        server.send('container_close', { window_id: 3, server: true })
        inventory.slot(3, 0, { id: PLANKS, count: 2, stackId: 7 })
        await driver.frame(10)
        const closed = internal._inventory.stackAt({ container: 'container', slot: 0 })
        // another hopper opens empty
        openContainer(server, 4, 'hopper')
        await driver.frame(10)
        assert.deepStrictEqual([closed, bot.currentWindow?.slots[0], internal._inventory.stats.otherWindows], [undefined, null, 1])
        bot.end()
      })

      it('closes a screen of no close packet at once, and one of the inventory\'s class in its frames from 1.21.120', async () => {
        const sent: string[] = []
        const { bot, server, driver } = await screenBot(version, internal => {
          internal._inventory.screens.add({ ...STONECUTTER, type: 'lectern', containers: {}, layout: () => layout('minecraft:lectern', []), animation: 'none', handBack: [] }, {
            close: outbox => { outbox.queue('lectern_update', { page: 0, page_count: 0, position: CHEST_AT }) }
          })
          internal._inventory.screens.add({ ...STONECUTTER, type: 'enchantment', containers: {}, layout: () => layout('minecraft:enchanting_table', []), animation: 'inventory', handBack: [] })
        })
        bot.on('windowClose', window => { sent.push(String(window.type)) })
        openContainer(server, 2, 'lectern')
        await driver.frame(10)
        const lectern = bot.currentWindow
        assert.ok(lectern !== null)
        await Promise.all([bot.closeWindow(lectern), driver.frame(10)])
        assert.deepStrictEqual([sent, server.sentOf('lectern_update').length, closes(server)], [['minecraft:lectern'], 1, []])
        openContainer(server, 3, 'enchantment')
        await driver.frame(10)
        const table = bot.currentWindow
        assert.ok(table !== null)
        const closing = bot.closeWindow(table)
        await driver.tick()
        const frames = await framesUntilClose({ server, driver }, version)
        server.send('container_close', { window_id: 3, server: false })
        await driver.frame(10)
        await closing
        assert.deepStrictEqual(frames, closeFrame(version, 'inventory'))
        bot.end()
      })
    })

    describe('closing', () => {
      it('hands a UI station\'s input back as recorded on 1.26.51.1, its own window\'s content kept apart', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => { internal._inventory.screens.add(STONECUTTER) }, { screenAnimations: false })
        internal._core.requestIds.continueProcess(-43)
        openContainer(server, 4, 'stonecutter')
        inventory.content('ui', [null, null, null, stone])
        await driver.frame(10)
        const window = bot.currentWindow
        assert.ok(window !== null)
        assert.deepStrictEqual([window.type, window.slots.length, countAndId(window.slots[0])], ['minecraft:stonecutter', 38, [3, 18]])
        const requests = requestsSince(server)
        const closing = bot.closeWindow(window)
        await driver.frame(10)
        assert.deepStrictEqual([requests(), closes(server)], [['-43 place/1 3 stonecutter_input:3#18 → hotbar_and_inventory:0#0'], [close(version, 4)]])
        inventory.respond(-43, [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 3, stackId: 18 }])
        server.send('container_close', { window_id: 4, server: false })
        await driver.frame(10)
        await closing
        assert.deepStrictEqual(countAndId(bot.inventory.slots[36]), [3, 18])
        bot.end()
      })

      it('runs the closed hooks after windowClose', async () => {
        const order: string[] = []
        const { bot, server, driver } = await screenBot(version, internal => { internal._inventory.screens.add(HOPPER, { closed: screen => { order.push(`closed ${screen.window.type}`) } }) })
        bot.on('windowClose', () => { order.push('windowClose') })
        openContainer(server, 3, 'hopper')
        server.send('container_close', { window_id: 3, server: true })
        await driver.frame(10)
        assert.deepStrictEqual(order, ['windowClose', 'closed minecraft:hopper'])
        bot.end()
      })
    })

    describe('clicking', () => {
      async function hopperWith (rules: Partial<ScreenDefinition>, hooks: ScreenHooks = {}): Promise<ScreenBot> {
        const bot = await screenBot(version, internal => { internal._inventory.screens.add({ ...HOPPER, ...rules }, hooks) })
        bot.inventory.slot('inventory', 0, { id: PLANKS, count: 10, stackId: 9 })
        openContainer(bot.server, 3, 'hopper')
        await bot.driver.frame(10)
        return bot
      }

      it('shift clicks where the screen sends the stack, and places a stack only where the screen accepts it', async () => {
        const { bot, server, driver } = await hopperWith({
          // the offhand after the player's slots, which takes planks here
          layout: () => ({ ...layout('minecraft:hopper', refs('container', 0, 5)), after: [{ container: 'offhand', slot: 1 }] }),
          shiftTargets: (from, stack) => from.container === 'hotbar' && stack.count === 10 ? [{ container: 'container', slot: 2 }] : undefined,
          accepts: (to, _stack, names) => {
            if (to.container === 'offhand') return true
            return to.container === 'container' && to.slot === 4 ? names.itemName({ networkId: STONE, count: 1, metadata: 0, stackId: 0, wire: { network_id: STONE } }) !== 'stone' : undefined
          }
        })
        const requests = requestsSince(server)
        bot.clickWindow(32, 0, 1).catch(() => {})
        await driver.tick()
        bot.clickWindow(31, 0, 1).catch(() => {})
        bot.clickWindow(2, 0, 0).catch(() => {})
        bot.clickWindow(4, 0, 0).catch(() => {})
        bot.clickWindow(41, 0, 0).catch(() => {})
        await driver.tick()
        assert.deepStrictEqual(requests(), ['-3 place/1 10 hotbar:0#9 → container:2#0', '-5 take/0 10 container:2#-3 → cursor:0#0', '-7 place/1 10 cursor:0#-5 → offhand:1#0'])
        bot.end()
      })

      it('makes the moves a screen makes of a click, and rejects a click it throws for', async () => {
        const { bot, internal, server, driver } = await hopperWith({
          moves: (click, clicked) => {
            if (click.mode === 2) throw new Error('no hotbar key here')
            return clicked?.container === 'container' ? [{ type: 'take', count: 1, from: { container: 'hotbar', slot: 0 }, to: CURSOR }] : undefined
          }
        })
        const requests = requestsSince(server)
        await assert.rejects(Promise.all([bot.clickWindow(0, 0, 2), driver.tick()]), { message: 'no hotbar key here' })
        bot.clickWindow(1, 1, 0).catch(() => {})
        await driver.tick()
        const planned = await inPass({ internal, driver }, async () => internal._inventory.clickMoves({ slot: 33, mouseButton: 0, mode: 0 }, internal._inventory.draft()))
        // elsewhere, the default's
        assert.deepStrictEqual([requests(), planned], [['-3 take/0 1 hotbar:0#9 → cursor:0#0'], [{ type: 'place', count: 1, from: CURSOR, to: { container: 'hotbar', slot: 1 } }]])
        bot.end()
      })

      it('hands a click on the output to the screen\'s feature, but the drop key\'s; sends nothing with no feature', async () => {
        const clicks: Array<[number, number, string]> = []
        const stonecutterBot = await screenBot(version, internal => {
          internal._inventory.screens.add(STONECUTTER, { output: async (_ctx, click, screen) => { clicks.push([click.mode, click.mouseButton, String(screen.window.type)]) } })
          internal._inventory.screens.add(HOPPER)
        })
        const { bot, server, driver, internal } = stonecutterBot
        openContainer(server, 4, 'stonecutter')
        stonecutterBot.inventory.slot('ui', 50, stone)
        await driver.frame(10)
        const requests = requestsSince(server)
        for (const [mode, button] of [[0, 0], [1, 0], [2, 3], [4, 0]]) await Promise.all([bot.clickWindow(1, button ?? 0, mode ?? 0), driver.tick()])
        const planned = await inPass({ internal, driver }, async () => internal._inventory.clickMoves({ slot: 1, mouseButton: 0, mode: 0 }, internal._inventory.draft()))
        server.send('container_close', { window_id: 4, server: true })
        await driver.frame(10)
        // the crafting table's output, which no feature crafts without the craft plugin
        openContainer(server, 5, 'workbench')
        await driver.frame(10)
        await Promise.all([bot.clickWindow(0, 0, 0), driver.tick()])
        assert.deepStrictEqual([clicks, planned, requests()], [[[0, 0, 'minecraft:stonecutter'], [1, 0, 'minecraft:stonecutter'], [2, 3, 'minecraft:stonecutter']], [], []])
        bot.end()
      })

      it('makes a feature\'s click mode with its buttons, which a click on a draft does not plan', async () => {
        const made: Array<[WindowClick, SlotRef | undefined, string]> = []
        const { bot, internal, server, driver } = await hopperWith({})
        const { _inventory: inventory } = internal
        inventory.addClickMode(5, { buttons: [0, 4], click: async (_ctx, click, screen, clicked) => { made.push([click, clicked, String(screen.window.type)]) } })
        assert.throws(() => { inventory.addClickMode(5, { buttons: [], click: async () => {} }) }, { message: 'clickWindow makes mode 5 already' })
        assert.throws(() => { inventory.addClickMode(1, { buttons: [], click: async () => {} }) }, { message: 'clickWindow makes mode 1 already' })
        await Promise.all([bot.clickWindow(-999, 4, 5), driver.tick()])
        await Promise.all([bot.clickWindow(2, 0, 5), driver.tick()])
        await assert.rejects(bot.clickWindow(2, 1, 5), { message: 'clickWindow does not support mode 5 with mouse button 1 on Bedrock' })
        const planned = await inPass({ internal, driver }, async () => inventory.clickMoves({ slot: 32, mouseButton: 0, mode: 5 }, inventory.draft()))
        const requests = requestsSince(server)
        assert.deepStrictEqual([made, planned, requests()], [[[{ slot: -999, mouseButton: 4, mode: 5 }, undefined, 'minecraft:hopper'], [{ slot: 2, mouseButton: 0, mode: 5 }, { container: 'container', slot: 2 }, 'minecraft:hopper']], [], []])
        bot.end()
      })

      it('plans a click on a draft as clickWindow makes it, the draft\'s earlier moves seen', async () => {
        const { bot, internal, driver } = await hopperWith({})
        const { _inventory: inventory } = internal
        const planned = await inPass({ internal, driver }, async () => {
          const draft = inventory.draft()
          const take = inventory.clickMoves({ slot: 32, mouseButton: 1, mode: 0 }, draft)
          draft.apply(take)
          return [take, inventory.clickMoves({ slot: 0, mouseButton: 0, mode: 0 }, draft)]
        })
        assert.deepStrictEqual(planned, [
          [{ type: 'take', count: 5, from: HOTBAR_0, to: CURSOR }],
          [{ type: 'place', count: 5, from: CURSOR, to: { container: 'container', slot: 0 } }]
        ])
        bot.end()
      })
    })

    describe('requests', () => {
      it('tells a screen\'s features of its requests, and lets them queue packets before the batch', async () => {
        const told: Array<[number, readonly Move[], string]> = []
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => {
          internal._inventory.screens.add(STONECUTTER, {
            requested: (id, moves, screen) => { told.push([id, moves, String(screen.window.type)]) },
            beforeSend: outbox => { outbox.queue('serverbound_stonecutter_set_recipe', { container_id: 4, recipe_index: 0 }) }
          })
        })
        inventory.slot('inventory', 0, stone)
        openContainer(server, 4, 'stonecutter')
        await driver.frame(10)
        const place: Move = { type: 'place', count: 3, from: HOTBAR_0, to: STONECUTTER_INPUT }
        madeInPass(internal, async ctx => { await internal._inventory.request(internal._core, ctx, [place]) })
        await driver.tick()
        const batch = server.batches.at(-1)?.map(({ name }) => name).filter(name => name === 'serverbound_stonecutter_set_recipe' || name === 'item_stack_request')
        assert.deepStrictEqual([told, batch], [[[-3, [place], 'minecraft:stonecutter']], ['serverbound_stonecutter_set_recipe', 'item_stack_request']])
        bot.end()
      })

      it('writes a request\'s custom names and cause, and a destroy without the arm\'s swing', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version)
        inventory.slot('inventory', 0, stone)
        await driver.tick()
        madeInPass(internal, async ctx => { await internal._inventory.request(internal._core, ctx, [{ type: 'destroy', count: 3, from: HOTBAR_0 }], { customNames: ['Stone'], cause: 'anvil_text' }) })
        await driver.tick()
        const [request] = server.sentOf('item_stack_request').at(-1)?.requests ?? []
        assert.ok(request !== undefined && 'cause' in request)
        assert.deepStrictEqual([request.custom_names, request.cause, request.actions, server.sentOf('animate'), bot.inventory.slots[36]], [
          ['Stone'], 'anvil_text', [{ type_id: 'destroy', legacy_type_id: 4, count: 3, source: { slot_type: { container_id: 'hotbar' }, slot: 0, stack_id: 18 } }], [], null
        ])
        bot.end()
      })

      it('lets a screen\'s features settle what a response tells of a slot', async () => {
        const settled: Array<[string, number]> = []
        const { bot, internal, server, driver, inventory } = await screenBot(version, internal => {
          internal._inventory.screens.add(HOPPER, {
            settle: (slot, stack) => {
              settled.push([slot.customName, slot.durabilityCorrection])
              return { ...stack, metadata: 4 }
            }
          })
        })
        inventory.slot('inventory', 0, stone)
        openContainer(server, 3, 'hopper')
        await driver.frame(10)
        bot.clickWindow(32, 0, 0).catch(() => {})
        await driver.tick()
        server.send('item_stack_response', { responses: [{ status: 'ok', request_id: -3, containers: [{ slot_type: { container_id: 'cursor' }, slots: [{ slot: 0, hotbar_slot: 0, count: 3, item_stack_id: 18, custom_name: 'Rock', durability_correction: 2 }] }] }] })
        await driver.tick()
        assert.deepStrictEqual([settled, internal._inventory.stackAt(CURSOR)?.metadata], [[['Rock', 2]], 4])
        bot.end()
      })
    })

    describe('the cursor drag\'s bracket held through a drag (1.26.60)', () => {
      it('starts before the drag\'s first request, and stops at its release once the request left', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version)
        inventory.slot('ui', 0, stone)
        await driver.tick()
        const drags = (): string[] => server.sentOf('serverbound_cursor_item_drag').map(({ state }) => String(state))
        const place = (slot: number, ctx: Parameters<typeof internal._inventory.holdCursorDrag>[0]): Promise<void> => internal._inventory.request(internal._core, ctx, [{ type: 'place', count: 1, from: CURSOR, to: { container: 'inventory', slot } }])
        madeInPass(internal, async ctx => {
          internal._inventory.holdCursorDrag(ctx)
          await place(9, ctx)
        })
        await driver.tick()
        await driver.tick()
        madeInPass(internal, async ctx => {
          internal._inventory.holdCursorDrag(ctx)
          await place(10, ctx)
        })
        await driver.tick()
        await driver.tick()
        const held = drags()
        madeInPass(internal, async () => { internal._inventory.releaseCursorDrag() })
        await driver.frame(10)
        madeInPass(internal, async () => { internal._inventory.releaseCursorDrag() })
        await driver.frame(10)
        assert.deepStrictEqual([held, drags()], [['start'], ['start', 'stop']])
        bot.end()
      })

      it('stops in the frame after the request left when released before', async () => {
        const { bot, internal, server, driver, inventory } = await screenBot(version)
        inventory.slot('ui', 0, stone)
        await driver.tick()
        madeInPass(internal, async ctx => {
          internal._inventory.holdCursorDrag(ctx)
          internal._inventory.releaseCursorDrag()
          await internal._inventory.request(internal._core, ctx, [{ type: 'place', count: 1, from: CURSOR, to: { container: 'inventory', slot: 9 } }])
        })
        await driver.tick()
        const states = server.sentOf('serverbound_cursor_item_drag').map(({ state }) => String(state))
        await driver.frame(10)
        assert.deepStrictEqual([states, server.sentOf('serverbound_cursor_item_drag').map(({ state }) => String(state))], [['start'], ['start', 'stop']])
        bot.end()
      })

      it('has none before 1.26.60', async () => {
        const { bot, internal, server, driver, errors } = await screenBot('bedrock_1.26.51')
        await inPass({ internal, driver }, async ctx => { internal._inventory.holdCursorDrag(ctx) })
        await driver.tick()
        assert.deepStrictEqual([server.sentOf('serverbound_cursor_item_drag'), errors], [[], []])
        bot.end()
      })
    })

    describe('the items feature\'s slots', () => {
      it('finds the slot of a window showing an inventory slot', async () => {
        const { bot, internal, server, driver } = await screenBot(version)
        const { _inventory: inventory } = internal
        openContainer(server, 2, 'workbench')
        await driver.frame(10)
        const table = bot.currentWindow
        assert.ok(table !== null)
        assert.deepStrictEqual([
          inventory.windowSlotOf(bot.inventory, 5), inventory.windowSlotOf(bot.inventory, 45), inventory.windowSlotOf(table, 36), inventory.windowSlotOf(table, 9), inventory.windowSlotOf(table, 5), inventory.windowSlotOf(table, 46)
        ], [5, 45, 37, 10, undefined, undefined])
        server.send('container_close', { window_id: 2, server: true })
        await driver.frame(10)
        const closed = inventory.windowSlotOf(table, 36)
        openContainer(server, 3, 'workbench')
        await driver.frame(10)
        assert.deepStrictEqual([closed, inventory.windowSlotOf(table, 36), bot.currentWindow === table], [undefined, undefined, false])
        bot.end()
      })

      it('shows a slot predicted without a request until the server sends it', async () => {
        const { bot, internal, driver, inventory } = await screenBot(version)
        internal._inventory.predictSlot(HOTBAR_0, { networkId: STONE, count: 2, metadata: 0, stackId: 0, wire: { network_id: STONE, count: 2, metadata: 0, block_runtime_id: 0, has_stack_id: false } })
        const predicted = countAndId(bot.inventory.slots[36])
        inventory.slot('inventory', 0, null)
        await driver.frame(10)
        assert.deepStrictEqual([predicted, bot.inventory.slots[36]], [[2, 0], null])
        bot.end()
      })

      it('numbers the legacy transactions -4, -6, -8 …, and goes on with a process\'s', async () => {
        const { bot, internal } = await screenBot(version)
        const ids = internal._core.requestIds
        const fresh = [ids.nextLegacyTransaction(), ids.nextLegacyTransaction()]
        ids.continueProcess(-21, -30)
        assert.throws(() => { ids.continueProcess(-21, -2) }, { message: '-2 is no legacy transaction id: they are -4, -6, -8 …' })
        assert.throws(() => { ids.continueProcess(-21, -7) }, { message: '-7 is no legacy transaction id: they are -4, -6, -8 …' })
        ids.continueProcess(-23)
        assert.deepStrictEqual([fresh, ids.nextLegacyTransaction(), ids.nextStackRequest()], [[-4, -6], -30, -23])
        bot.end()
      })
    })

    it('crafts on no screen but the inventory and the crafting table', async () => {
      const { bot, server, driver } = await screenBot(version, internal => { internal._inventory.screens.add(HOPPER) }, { craft: true })
      new ServerRecipes(server, bot.registry).send([{ type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: '00000000-0000-0000-0000-000000000001', priority: -1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4 }] }])
      openContainer(server, 3, 'hopper')
      await driver.frame(10)
      const [recipe] = bot.recipesAll(bot.registry.itemsByName['stick']?.id ?? 0, null, false)
      assert.ok(recipe !== undefined)
      const rejected = assert.rejects(bot.placeRecipe(recipe), { message: 'minecraft:stick needs an open crafting screen' })
      await driver.tick()
      await rejected
      bot.end()
    })

    it('reports a window event\'s listener that throws, and calls the others', async () => {
      const { bot, internal, server, driver, errors } = await screenBot(version, internal => {
        internal._inventory.screens.add(FURNACE, { data: (_property, _value, screen: OpenScreen) => { internal._core.emitWindow(screen.window, 'update', []) } })
      })
      openContainer(server, 3, 'furnace')
      await driver.frame(10)
      const heard: string[] = []
      const window = bot.currentWindow
      assert.ok(window !== null)
      window.on('update' as never, () => { throw new Error('a listener threw') })
      window.on('update' as never, () => { heard.push('update') })
      new ServerInventory(server).setData(3, 0, 1)
      await driver.frame(10)
      assert.deepStrictEqual([heard, errors, internal._inventory.stats.otherData], [['update'], ['a listener threw'], 0])
      bot.end()
    })
  })
})
