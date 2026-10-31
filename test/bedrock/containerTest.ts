import assert from 'assert'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, InventoryWindow, RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt } from './common/world.ts'

// The container screens with the bot's own plugins, as the vanilla client played them against Bedrock Dedicated Server
// in reduced_stations (each build's chest, barrel and shulker box; the other screens and window id 1 on 1.26.51.1), and
// against a scripted server that sends no content (containers_container on 1.26.51.1 and 1.26.60.5).

const PLANKS = 5
// the block runtime id of the recorded planks
const PLANKS_BLOCK = 1921718966
const CHEST_AT = Object.freeze({ x: 2, y: 12, z: 0 })
const BARREL_AT = Object.freeze({ x: -2, y: 12, z: 0 })
const SHULKER_AT = Object.freeze({ x: 0, y: 12, z: -2 })
const ENDER_CHEST_AT = Object.freeze({ x: 0, y: 12, z: 2 })
const TRAPPED_CHEST_AT = Object.freeze({ x: -2, y: 12, z: -2 })
const CRAFTER_AT = Object.freeze({ x: 2, y: 12, z: 2 })
// stone, which the stone floor puts there
const STONE_AT = Object.freeze({ x: 1, y: 12, z: 0 })
// a column the server never sent
const UNSENT_AT = Object.freeze({ x: 1000, y: 12, z: 1000 })
const BLOCKS: readonly BlockAt[] = [
  [CHEST_AT.x, CHEST_AT.y, CHEST_AT.z, 'chest'],
  [BARREL_AT.x, BARREL_AT.y, BARREL_AT.z, 'barrel'],
  [SHULKER_AT.x, SHULKER_AT.y, SHULKER_AT.z, 'undyed_shulker_box'],
  [ENDER_CHEST_AT.x, ENDER_CHEST_AT.y, ENDER_CHEST_AT.z, 'ender_chest'],
  [TRAPPED_CHEST_AT.x, TRAPPED_CHEST_AT.y, TRAPPED_CHEST_AT.z, 'trapped_chest'],
  [CRAFTER_AT.x, CRAFTER_AT.y, CRAFTER_AT.z, 'crafter']
]

interface Point { readonly x: number, readonly y: number, readonly z: number }

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface ContainerBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
}

/** joined beside a chest, a barrel, a shulker box, an ender chest, a trapped chest and a crafter, with the bot's plugins */
async function containerBot (version: BedrockVersion, { windows = true }: { windows?: boolean } = {}): Promise<ContainerBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { plugins: { windows } })
  // the crafter from 1.20.50
  const blocks = BLOCKS.filter(([, , , name]) => name !== 'crafter' || atLeast(version, 'bedrock_1.20.50'))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks })
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

/** each request the bot sent since the last call, as the recorded ones are described: its id, its actions (a legacy type id after a slash) */
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
function close (version: BedrockVersion, id: number | 'first'): BedrockServerboundPackets['container_close'] {
  return atLeast(version, 'bedrock_1.21.0') ? { window_id: id, window_type: 'none', server: false } : { window_id: id, server: false }
}

function openContainer (server: FakeBedrockClient, id: number | 'first', type: 'container' | 'hopper' | 'dispenser' | 'dropper' | 'crafter' | 'workbench', { x, y, z }: Point = CHEST_AT): void {
  server.send('container_open', { window_id: id, window_type: type, coordinates: { x, y, z }, runtime_entity_id: -1n })
}

function empty (size: number): null[] {
  return Array.from({ length: size }, () => null)
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** a window's Java type, title, slots and inventory part */
function shapeOf (window: Window | null): [string | number, string, number, number, number] | null {
  return window === null ? null : [window.type, window.title, window.slots.length, window.inventoryStart, window.inventoryEnd]
}

/** ticks until `promise` settles */
async function settled (driver: TestBot['driver'], promise: Promise<unknown>): Promise<void> {
  let done = false
  const settling = promise.finally(() => { done = true })
  await driver.runUntil(() => done, 120)
  await settling
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
    if (closes(server).length > 0) return frames
    await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
  }
  return Infinity
}

/** a click, what the server sends of the screen's slot before its response, and the response */
interface Step {
  readonly click: readonly [slot: number, mouseButton: number, mode: number]
  readonly slot?: readonly [slot: number, given: Given | null]
  readonly respond: readonly RespondedSlot[]
}

/** the clicks, each answered as recorded in the tick after it left */
async function play ({ bot, driver, inventory }: ContainerBot, window: InventoryWindow, firstRequest: number, steps: readonly Step[]): Promise<void> {
  for (const [index, { click: [slot, mouseButton, mode], slot: sent, respond }] of steps.entries()) {
    const clicked = bot.clickWindow(slot, mouseButton, mode)
    await driver.tick()
    if (sent !== undefined) inventory.slot(window, ...sent)
    inventory.respond(firstRequest - 2 * index, respond)
    await driver.tick()
    await clicked
  }
}

/** 10 planks from hotbar slot 0 into the screen's slot 0 (of the container `name`), then shift clicked back */
function moveShift (name: RespondedSlot['container'], size: number, stackId: number): Step[] {
  const planks: Given = { id: PLANKS, count: 10, stackId, blockRuntimeId: PLANKS_BLOCK }
  return [
    { click: [size + 27, 0, 0], respond: [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 10, stackId }] },
    { click: [0, 0, 0], slot: [0, planks], respond: [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: name, slot: 0, count: 10, stackId }] },
    { click: [0, 0, 1], slot: [0, null], respond: [{ container: name, slot: 0, count: 0, stackId: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 10, stackId }] }
  ]
}

/** 10 planks from hotbar slot 0 into a barrel's slot 0, half of them taken back, and put in hotbar slot 1 */
function takeHalf (stackId: number): Step[] {
  const planks = (count: number): Given => ({ id: PLANKS, count, stackId, blockRuntimeId: PLANKS_BLOCK })
  return [
    { click: [54, 0, 0], respond: [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 10, stackId }] },
    { click: [0, 0, 0], slot: [0, planks(10)], respond: [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'barrel', slot: 0, count: 10, stackId }] },
    { click: [0, 1, 0], slot: [0, planks(5)], respond: [{ container: 'barrel', slot: 0, count: 5, stackId }, { container: 'cursor', slot: 0, count: 5, stackId: stackId + 1 }] },
    { click: [55, 0, 0], respond: [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'hotbar', slot: 1, count: 5, stackId: stackId + 1 }] }
  ]
}

/** a screen of a recording: its window id, the planks' stack id, the client's first request, and its requests */
interface Gesture {
  readonly window: number
  readonly stackId: number
  readonly firstRequest: number
  readonly requests: readonly string[]
}

/** recorded in reduced_stations, of one build of each group: the chest's move_shift, the barrel's take_half, the shulker box's move_shift */
interface Recorded {
  readonly name: string
  readonly from: BedrockVersion
  readonly to: BedrockVersion
  readonly chest: Gesture
  readonly barrel: Gesture
  readonly shulker: Gesture
}

const RECORDED: readonly Recorded[] = [
  {
    // recorded on 1.16.201.2
    name: 'container_id and slot_id, aux items, result',
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    chest: { window: 14, stackId: 3023, firstRequest: -4033, requests: ['-4033 take 10 hotbar:0#3023 → cursor:0#0', '-4035 place 10 cursor:0#3023 → container:0#0', '-4037 place 10 container:0#3023 → hotbar_and_inventory:0#0'] },
    barrel: { window: 15, stackId: 3025, firstRequest: -4039, requests: ['-4039 take 10 hotbar:0#3025 → cursor:0#0', '-4041 place 10 cursor:0#3025 → barrel:0#0', '-4043 take 5 barrel:0#3025 → cursor:0#0', '-4045 place 5 cursor:0#3026 → hotbar:1#0'] },
    shulker: { window: 17, stackId: 3030, firstRequest: -4053, requests: ['-4053 take 10 hotbar:0#3030 → cursor:0#0', '-4055 place 10 cursor:0#3030 → shulker:0#0', '-4057 place 10 shulker:0#3030 → hotbar_and_inventory:0#0'] }
  },
  {
    // recorded on 1.16.210.5; items with a count from 1.16.220, a cause from 1.19.30, the close's type from 1.21.0
    name: 'slot_type, aux items or items',
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.21.2',
    chest: { window: 14, stackId: 3509, firstRequest: -4997, requests: ['-4997 take 10 hotbar:0#3509 → cursor:0#0', '-4999 place 10 cursor:0#3509 → container:0#0', '-5001 place 10 container:0#3509 → hotbar_and_inventory:0#0'] },
    barrel: { window: 15, stackId: 3511, firstRequest: -5003, requests: ['-5003 take 10 hotbar:0#3511 → cursor:0#0', '-5005 place 10 cursor:0#3511 → barrel:0#0', '-5007 take 5 barrel:0#3511 → cursor:0#0', '-5009 place 5 cursor:0#3512 → hotbar:1#0'] },
    shulker: { window: 17, stackId: 3518, firstRequest: -5017, requests: ['-5017 take 10 hotbar:0#3518 → cursor:0#0', '-5019 place 10 cursor:0#3518 → shulker:0#0', '-5021 place 10 shulker:0#3518 → hotbar_and_inventory:0#0'] }
  },
  {
    // recorded on 1.21.20.3
    name: 'full container names with dynamic id 0',
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    chest: { window: 16, stackId: 2632, firstRequest: -3323, requests: ['-3323 take 10 hotbar@0:0#2632 → cursor@0:0#0', '-3325 place 10 cursor@0:0#2632 → container@0:0#0', '-3327 place 10 container@0:0#2632 → hotbar_and_inventory@0:0#0'] },
    barrel: { window: 17, stackId: 2634, firstRequest: -3329, requests: ['-3329 take 10 hotbar@0:0#2634 → cursor@0:0#0', '-3331 place 10 cursor@0:0#2634 → barrel@0:0#0', '-3333 take 5 barrel@0:0#2634 → cursor@0:0#0', '-3335 place 5 cursor@0:0#2635 → hotbar@0:1#0'] },
    shulker: { window: 19, stackId: 2641, firstRequest: -3343, requests: ['-3343 take 10 hotbar@0:0#2641 → cursor@0:0#0', '-3345 place 10 cursor@0:0#2641 → shulker@0:0#0', '-3347 place 10 shulker@0:0#2641 → hotbar_and_inventory@0:0#0'] }
  },
  {
    // recorded on 1.21.30.3; the close after the crafting table's animation from 1.21.120
    name: 'full container names',
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.26.30',
    chest: { window: 16, stackId: 2632, firstRequest: -3323, requests: ['-3323 take 10 hotbar:0#2632 → cursor:0#0', '-3325 place 10 cursor:0#2632 → container:0#0', '-3327 place 10 container:0#2632 → hotbar_and_inventory:0#0'] },
    barrel: { window: 17, stackId: 2634, firstRequest: -3329, requests: ['-3329 take 10 hotbar:0#2634 → cursor:0#0', '-3331 place 10 cursor:0#2634 → barrel:0#0', '-3333 take 5 barrel:0#2634 → cursor:0#0', '-3335 place 5 cursor:0#2635 → hotbar:1#0'] },
    shulker: { window: 19, stackId: 2641, firstRequest: -3343, requests: ['-3343 take 10 hotbar:0#2641 → cursor:0#0', '-3345 place 10 cursor:0#2641 → shulker:0#0', '-3347 place 10 shulker:0#2641 → hotbar_and_inventory:0#0'] }
  },
  {
    // recorded on 1.26.51.1
    name: 'the action\'s type again, 32-bit stack ids',
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.60',
    chest: { window: 16, stackId: 88, firstRequest: -201, requests: ['-201 take/0 10 hotbar:0#88 → cursor:0#0', '-203 place/1 10 cursor:0#88 → container:0#0', '-205 place/1 10 container:0#88 → hotbar_and_inventory:0#0'] },
    barrel: { window: 17, stackId: 90, firstRequest: -207, requests: ['-207 take/0 10 hotbar:0#90 → cursor:0#0', '-209 place/1 10 cursor:0#90 → barrel:0#0', '-211 take/0 5 barrel:0#90 → cursor:0#0', '-213 place/1 5 cursor:0#91 → hotbar:1#0'] },
    shulker: { window: 19, stackId: 95, firstRequest: -221, requests: ['-221 take/0 10 hotbar:0#95 → cursor:0#0', '-223 place/1 10 cursor:0#95 → shulker:0#0', '-225 place/1 10 shulker:0#95 → hotbar_and_inventory:0#0'] }
  }
]

describe('bedrock containers', () => {
  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: openContainer opens a chest, shown at its content, the planks go in and out as the vanilla client's, and window.close() closes it after the crafting table's animation`, async () => {
          const bot = await containerBot(version)
          const { bot: { inventory: items }, internal, server, driver, inventory, errors } = bot
          const { window: id, stackId, firstRequest, requests: recordedRequests } = recorded.chest
          inventory.slot('inventory', 0, { id: PLANKS, count: 10, stackId, blockRuntimeId: PLANKS_BLOCK })
          internal._core.requestIds.continueProcess(firstRequest)
          await driver.tick()
          const requests = requestsSince(server)
          const chest = bot.bot.blockAt(new Vec3(CHEST_AT.x, CHEST_AT.y, CHEST_AT.z))
          assert.ok(chest !== null)
          const opened: Window[] = []
          bot.bot.on('windowOpen', window => { opened.push(window) })
          const opening = bot.bot.openContainer(chest)
          await driver.ticks(4)
          openContainer(server, id, 'container')
          // recorded two or three times
          inventory.content(id, empty(27))
          inventory.content(id, empty(27))
          await settled(driver, opening)
          const window = await opening
          assert.deepStrictEqual([opened, window === bot.bot.currentWindow, window.id, shapeOf(window), countAndId(window.slots[54])], [[window], true, id, ['minecraft:chest', 'Chest', 63, 27, 63], [10, stackId]])

          await play(bot, id, firstRequest, moveShift('container', 27, stackId))
          assert.deepStrictEqual([window.slots[0], countAndId(window.slots[54]), countAndId(items.slots[36])], [null, [10, stackId], [10, stackId]])

          const closed: Window[] = []
          bot.bot.on('windowClose', window => { closed.push(window) })
          const closing = window.close()
          const frames = await framesUntilClose(bot, version)
          server.send('container_close', { window_id: id, server: false })
          await driver.frame(10)
          await closing
          assert.deepStrictEqual([requests(), frames, closes(server), closed, bot.bot.currentWindow, errors], [recordedRequests, closeFrame(version), [close(version, id)], [window], null, []])
          bot.bot.end()
        })

        it(`bedrock ${version}: names a barrel's slots barrel and a shulker box's shulker, as the vanilla client`, async () => {
          const bot = await containerBot(version)
          const { bot: { inventory: items }, internal, server, driver, inventory, errors } = bot
          const requests = requestsSince(server)
          const shown: Array<ReturnType<typeof shapeOf>> = []
          for (const [at, gesture, steps] of [[BARREL_AT, recorded.barrel, takeHalf(recorded.barrel.stackId)], [SHULKER_AT, recorded.shulker, moveShift('shulker', 27, recorded.shulker.stackId)]] as const) {
            // each case of the recording starts with these planks alone
            inventory.slot('inventory', 0, { id: PLANKS, count: 10, stackId: gesture.stackId, blockRuntimeId: PLANKS_BLOCK })
            inventory.slot('inventory', 1, null)
            internal._core.requestIds.continueProcess(gesture.firstRequest)
            openContainer(server, gesture.window, 'container', at)
            inventory.content(gesture.window, empty(27))
            await driver.tick()
            shown.push(shapeOf(bot.bot.currentWindow))
            await play(bot, gesture.window, gesture.firstRequest, steps)
            server.send('container_close', { window_id: gesture.window, server: true })
            await driver.tick()
          }
          assert.deepStrictEqual([requests(), shown, countAndId(items.slots[36]), errors], [
            [...recorded.barrel.requests, ...recorded.shulker.requests],
            [['minecraft:generic_9x3', 'Barrel', 63, 27, 63], ['minecraft:shulker_box', 'Shulker Box', 63, 27, 63]],
            [10, recorded.shulker.stackId],
            []
          ])
          bot.bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('shows a trapped chest as a chest, a large chest of its 54 slots, and an ender chest, another block or a block not sent as a container, as Java\'s windows before 1.14', async () => {
      const { bot, server, driver, inventory } = await containerBot(version)
      const shown: Array<ReturnType<typeof shapeOf>> = []
      for (const [id, at, size] of [[2, ENDER_CHEST_AT, 27], [3, TRAPPED_CHEST_AT, 27], [4, CHEST_AT, 54], [5, STONE_AT, 27], [6, UNSENT_AT, 27]] as const) {
        openContainer(server, id, 'container', at)
        inventory.content(id, empty(size))
        await driver.tick()
        shown.push(shapeOf(bot.currentWindow))
        server.send('container_close', { window_id: id, server: true })
        await driver.tick()
      }
      assert.deepStrictEqual(shown, [
        ['minecraft:container', 'Ender Chest', 63, 27, 63],
        ['minecraft:chest', 'Chest', 63, 27, 63],
        ['minecraft:chest', 'Large Chest', 90, 54, 90],
        ['minecraft:container', 'Container', 63, 27, 63],
        ['minecraft:container', 'Container', 63, 27, 63]
      ])
      bot.end()
    })

    it('shift clicks a stack of the hotbar into a large chest, past a full stack of its item into the first empty slot (not recorded: as Java\'s)', async () => {
      const bot = await containerBot(version)
      const { internal, server, driver, inventory, errors } = bot
      const requests = requestsSince(server)
      inventory.slot('inventory', 0, { id: PLANKS, count: 10, stackId: 7 })
      internal._core.requestIds.continueProcess(-3)
      openContainer(server, 2, 'container')
      inventory.content(2, [{ id: PLANKS, count: 64, stackId: 8 }, ...empty(53)])
      await driver.tick()
      await play(bot, 2, -3, [{ click: [81, 0, 1], respond: [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'container', slot: 1, count: 10, stackId: 7 }] }])
      assert.deepStrictEqual([requests(), countAndId(bot.bot.currentWindow?.slots[1]), errors], [['-3 place/1 10 hotbar:0#7 → container:1#0'], [10, 7], []])
      bot.bot.end()
    })

    it('shows the hopper\'s, dispenser\'s, dropper\'s and crafter\'s screens at their content, as recorded on 1.26.51.1 (windows 20, 21, 22, 25)', async () => {
      const { bot, server, driver, inventory } = await containerBot(version)
      const opened: Array<ReturnType<typeof shapeOf>> = []
      bot.on('windowOpen', window => { opened.push(shapeOf(window)) })
      const shown: Array<ReturnType<typeof shapeOf>> = []
      for (const [id, type, size] of [[20, 'hopper', 5], [21, 'dispenser', 9], [22, 'dropper', 9], [25, 'crafter', 9]] as const) {
        openContainer(server, id, type)
        await driver.frame(10)
        shown.push(shapeOf(bot.currentWindow))
        inventory.content(id, empty(size))
        await driver.frame(10)
        server.send('container_close', { window_id: id, server: true })
        await driver.frame(10)
      }
      assert.deepStrictEqual([shown, opened], [[null, null, null, null], [
        ['minecraft:hopper', 'Hopper', 41, 5, 41],
        ['minecraft:dispenser', 'Dispenser', 45, 9, 45],
        ['minecraft:dropper', 'Dropper', 45, 9, 45],
        ['minecraft:crafter_3x3', 'Crafter', 45, 9, 45]
      ]])
      bot.end()
    })

    it('places one item in a crafter\'s slot by a right click, as recorded on 1.26.51.1, and shift clicks a stack of the inventory into a dispenser, onto its stack then into its first empty slot (not recorded: as Java\'s)', async () => {
      const bot = await containerBot(version)
      const { internal, server, driver, inventory, errors } = bot
      const requests = requestsSince(server)
      inventory.slot('inventory', 0, { id: PLANKS, count: 10, stackId: 128, blockRuntimeId: PLANKS_BLOCK })
      internal._core.requestIds.continueProcess(-359)
      openContainer(server, 25, 'crafter', CRAFTER_AT)
      inventory.content(25, empty(9))
      await driver.tick()
      await play(bot, 25, -359, [
        { click: [36, 0, 0], respond: [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 10, stackId: 128 }] },
        { click: [0, 1, 0], slot: [0, { id: PLANKS, count: 1, stackId: 129 }], respond: [{ container: 'cursor', slot: 0, count: 9, stackId: 128 }, { container: 'container', slot: 0, count: 1, stackId: 129 }] }
      ])
      server.send('container_close', { window_id: 25, server: true })
      inventory.slot('ui', 0, null)
      inventory.slot('inventory', 9, { id: PLANKS, count: 60, stackId: 200 })
      openContainer(server, 21, 'dispenser')
      inventory.content(21, [{ id: PLANKS, count: 60, stackId: 201 }, null, null, null, null, null, null, null, null])
      await driver.tick()
      inventory.slot('inventory', 2, { id: PLANKS, count: 3, stackId: 203 })
      await play(bot, 21, -363, [
        { click: [9, 0, 1], respond: [{ container: 'inventory', slot: 9, count: 0 }, { container: 'container', slot: 0, count: 64, stackId: 201 }, { container: 'container', slot: 1, count: 56, stackId: 202 }] },
        // and from the hotbar
        { click: [38, 0, 1], respond: [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'container', slot: 1, count: 59, stackId: 202 }] }
      ])
      const window = bot.bot.currentWindow
      assert.deepStrictEqual([requests(), window?.slots[9], window?.slots[38], countAndId(window?.slots[0]), countAndId(window?.slots[1]), errors], [
        ['-359 take/0 10 hotbar:0#128 → cursor:0#0', '-361 place/1 1 cursor:0#128 → container:0#0', '-363 place/1 4 inventory:9#200 → container:0#201, place/1 56 inventory:9#-363 → container:1#0', '-365 place/1 3 hotbar:2#203 → container:1#202'],
        null, null, [64, 201], [59, 202], []
      ])
      bot.bot.end()
    })

    it('shows a container screen the server sends no content for at the first tick after its opening\'s frame, with 27 slots, as the vanilla client, and its slots as the server sends them, as recorded with a scripted server on 1.26.60.5', async () => {
      const { bot, server, driver, inventory } = await containerBot(version)
      let opened = 0
      bot.on('windowOpen', () => { opened++ })
      openContainer(server, 2, 'container', { x: 2, y: 12, z: 30 })
      // a frame that ticks: not before the next
      await driver.frame(60)
      const before = bot.currentWindow
      await driver.tick()
      inventory.slot(2, 0, { id: 306, count: 1, stackId: 633 })
      await driver.ticks(2)
      assert.deepStrictEqual([before, opened, shapeOf(bot.currentWindow), countAndId(bot.currentWindow?.slots[0])], [null, 1, ['minecraft:container', 'Container', 63, 27, 63], [1, 633]])
      bot.end()
    })

    it('keeps a container\'s slot the server sent after requests, in their responses\' packet pass, over the responses, which come after it, as Bedrock Dedicated Server sent a dropper\'s slots before the responses to a left drag\'s second slot on 1.26.60.5', async () => {
      const { bot, internal, server, driver, inventory } = await containerBot(version)
      const requests = requestsSince(server)
      const planks: Given = { id: PLANKS, count: 10, stackId: 88, blockRuntimeId: PLANKS_BLOCK }
      internal._core.requestIds.continueProcess(-201)
      openContainer(server, 2, 'container')
      inventory.content(2, [planks, ...empty(26)])
      await driver.tick()
      // one frame's clicks, one packet: the stack taken from the chest's slot and put back
      const clicked = [bot.clickWindow(0, 0, 0), bot.clickWindow(0, 0, 0)]
      await driver.tick()
      inventory.slot(2, 0, planks)
      inventory.respond(-201, [{ container: 'container', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 10, stackId: 88 }])
      inventory.respond(-203, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'container', slot: 0, count: 10, stackId: 88 }])
      await driver.tick()
      await Promise.all(clicked)
      assert.deepStrictEqual([requests(), countAndId(bot.currentWindow?.slots[0]), bot.currentWindow?.selectedItem], [
        ['-201 take/0 10 container:0#88 → cursor:0#0', '-203 place/1 10 cursor:0#-201 → container:0#-201'], [10, 88], null
      ])
      bot.end()
    })

    it('settles by its response a container\'s slot the server sent in an earlier frame: a hopper\'s item put in the chest before the server took the request (not recorded)', async () => {
      const { bot, internal, server, driver, inventory } = await containerBot(version)
      const planks = (count: number): Given => ({ id: PLANKS, count, stackId: 88, blockRuntimeId: PLANKS_BLOCK })
      internal._core.requestIds.continueProcess(-201)
      openContainer(server, 2, 'container')
      inventory.content(2, [planks(10), ...empty(26)])
      await driver.tick()
      const clicked = bot.clickWindow(0, 0, 0)
      await driver.tick()
      inventory.slot(2, 0, planks(11))
      await driver.tick()
      inventory.respond(-201, [{ container: 'container', slot: 0, count: 1, stackId: 88 }, { container: 'cursor', slot: 0, count: 10, stackId: 89 }])
      await driver.tick()
      await clicked
      assert.deepStrictEqual([countAndId(bot.currentWindow?.slots[0]), countAndId(bot.currentWindow?.selectedItem)], [[1, 88], [10, 89]])
      bot.end()
    })

    it('settles by its response a slot of the player\'s inventory the server sent in the response\'s packet pass, which Bedrock Dedicated Server does not send again after a request (on 1.26.51, reduced_stations, a request on the hotbar is followed only by its response): an item picked up before the server took the request (not recorded)', async () => {
      const { bot, internal, server, driver, inventory } = await containerBot(version)
      const planks = (count: number): Given => ({ id: PLANKS, count, stackId: 88, blockRuntimeId: PLANKS_BLOCK })
      internal._core.requestIds.continueProcess(-201)
      inventory.slot('inventory', 0, planks(10))
      openContainer(server, 2, 'container')
      inventory.content(2, empty(27))
      await driver.tick()
      const clicked = bot.clickWindow(54, 0, 0)
      await driver.tick()
      inventory.slot('inventory', 0, planks(11))
      inventory.respond(-201, [{ container: 'hotbar', slot: 0, count: 1, stackId: 88 }, { container: 'cursor', slot: 0, count: 10, stackId: 89 }])
      await driver.tick()
      await clicked
      assert.deepStrictEqual([countAndId(bot.currentWindow?.slots[54]), countAndId(bot.currentWindow?.selectedItem)], [[1, 88], [10, 89]])
      bot.end()
    })

    it('gives the screen of window id 1, which the protocol names first, its number, as recorded on 1.26.51.1 (reduced_slots), and closes it by its name, handing back the cursor\'s item (not recorded on a container: as the crafting table\'s)', async () => {
      const { bot, internal, server, driver, inventory } = await containerBot(version)
      const requests = requestsSince(server)
      internal._core.requestIds.continueProcess(-101)
      openContainer(server, 'first', 'container', BARREL_AT)
      inventory.content('first', empty(27))
      inventory.content('first', empty(27))
      inventory.slot('ui', 0, { id: PLANKS, count: 3, stackId: 40 })
      await driver.tick()
      const window = bot.currentWindow
      assert.ok(window !== null)
      const closing = bot.closeWindow(window)
      await driver.ticks(2)
      inventory.respond(-101, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 3, stackId: 40 }])
      await driver.ticks(20)
      server.send('container_close', { window_id: 'first', window_type: 'none', server: false })
      await driver.tick()
      await closing
      assert.deepStrictEqual([window.id, window.type, requests(), closes(server), countAndId(bot.inventory.slots[36]), bot.currentWindow], [
        1, 'minecraft:generic_9x3', ['-101 place/1 3 cursor:0#40 → hotbar_and_inventory:0#0'], [close(version, 'first')], [3, 40], null
      ])
      bot.end()
    })

    it('openChest and openDispenser are openContainer, which opens a shulker box, a barrel and an ender chest too', async () => {
      const { bot, server, driver, inventory } = await containerBot(version)
      const opened: Array<[string | number, boolean]> = []
      for (const [id, at, open] of [[3, SHULKER_AT, 'openChest'], [4, BARREL_AT, 'openContainer'], [5, ENDER_CHEST_AT, 'openContainer']] as const) {
        const block = bot.blockAt(new Vec3(at.x, at.y, at.z))
        assert.ok(block !== null)
        const opening = bot[open](block)
        await driver.ticks(4)
        openContainer(server, id, 'container', at)
        inventory.content(id, empty(27))
        await settled(driver, opening)
        const window = await opening
        opened.push([window.type, 'deposit' in window])
        server.send('container_close', { window_id: id, server: true })
        await driver.tick()
      }
      assert.deepStrictEqual([bot.openDispenser === bot.openContainer, bot.openChest === bot.openContainer, opened], [true, true, [
        ['minecraft:shulker_box', true], ['minecraft:generic_9x3', true], ['minecraft:container', true]
      ]])
      bot.end()
    })

    it('openContainer refuses a block that is no container (Java\'s message: a crafter too), and a window that is not a container\'s, or has no deposit without the windows plugin', async () => {
      const { bot, server, driver } = await containerBot(version)
      const crafter = bot.blockAt(new Vec3(CRAFTER_AT.x, CRAFTER_AT.y, CRAFTER_AT.z))
      const chest = bot.blockAt(new Vec3(CHEST_AT.x, CHEST_AT.y, CHEST_AT.z))
      assert.ok(crafter !== null && chest !== null)
      await assert.rejects(bot.openContainer(crafter), { message: 'containerToOpen is neither a block nor an entity' })
      const table = assert.rejects(bot.openContainer(chest), { message: 'Non-container window used as a container: {"id":4,"type":"minecraft:crafting_table","title":"Crafting"}' })
      await driver.ticks(4)
      openContainer(server, 4, 'workbench')
      await settled(driver, table)
      bot.end()

      const plain = await containerBot(version, { windows: false })
      const plainChest = plain.bot.blockAt(new Vec3(CHEST_AT.x, CHEST_AT.y, CHEST_AT.z))
      assert.ok(plainChest !== null)
      const undeposited = assert.rejects(plain.bot.openContainer(plainChest), { message: 'Non-container window used as a container: {"id":5,"type":"minecraft:chest","title":"Chest"}' })
      await plain.driver.ticks(4)
      openContainer(plain.server, 5, 'container')
      plain.inventory.content(5, empty(27))
      await settled(plain.driver, undeposited)
      plain.bot.end()
    })
  })
})
