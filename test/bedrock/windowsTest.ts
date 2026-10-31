import assert from 'assert'
import type { NBT } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import { CURSOR, OUTPUT } from '../../lib/bedrock/modules/screens.ts'
import type { ScreenDefinition } from '../../lib/bedrock/modules/screens.ts'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, Chest } from '../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../lib/types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// Java's window members are made of clickWindow's clicks, whose requests clickTest and screensTest check on every
// version: here, on the latest, the clicks each member makes, against a server that takes each request as the bot
// predicts it. The hopper is a fixture of the test's own (the bot loads none of its plugins but these).

const version = latestSupportedBedrockVersion
const HOPPER_ID = 3
const HOPPER: ScreenDefinition = {
  type: 'hopper',
  containers: { container: 'open' },
  shown: 'open',
  layout: () => ({ windowType: 'minecraft:hopper', title: 'Hopper', slots: [0, 1, 2, 3, 4].map(slot => ({ container: 'container', slot })), craftingResultSlot: -1 }),
  animation: 'workbench',
  handBack: [CURSOR]
}
// the hopper window's slots of the player's hotbar
const HOTBAR = 32
const INVENTORY = 5

function isInternal (bot: BedrockBot): bot is BedrockBotInternal {
  return '_inventory' in bot
}

/** a window with Java's close, withdraw and deposit */
function asChest (window: Window): Chest {
  assert.ok(isChest(window))
  return window
}

function isChest (window: Window): window is Chest {
  return 'withdraw' in window && 'deposit' in window && 'close' in window
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

function refOf (info: SentSlot): SlotRef {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type
  assert.ok(typeof container === 'string' && info.slot !== undefined)
  return { container, slot: info.slot }
}

function nameOf (info: SentSlot): string {
  const { container, slot } = refOf(info)
  return `${container}:${slot}`
}

/** each request the bot sent since the last call: its actions' types, counts and slots */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ actions }) => actions.map(({ type_id: type, count, source, destination }) =>
      [String(type), count, source === undefined ? undefined : nameOf(source), destination === undefined ? undefined : `→ ${nameOf(destination)}`].filter(part => part !== undefined).join(' ')).join(', '))
  }
}

interface WindowBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  idOf: (name: string) => number
  /** steps ticks until `operation` settles, the server answering after each */
  served: <Result>(operation: Promise<Result>) => Promise<Result>
}

/**
 * Joined, with the windows plugin and the hopper; the crafting table's output gives what ui 50 holds to the cursor. The
 * server takes each request as the bot predicts it (a stack made new gets a stack id of its own), opens the inventory
 * screen when asked, and answers each close.
 */
async function windowBot (serve = true): Promise<WindowBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), {
    screenAnimations: false,
    loadInternalPlugins: false,
    plugins: {
      windows: true,
      fixtures: bot => {
        assert.ok(isInternal(bot))
        const inventory = bot._inventory
        inventory.screens.add(HOPPER)
        inventory.screens.extend('workbench', {
          output: async ctx => {
            const made = inventory.stackAt(OUTPUT)
            if (made !== undefined) await inventory.request(bot._core, ctx, [{ type: 'take', count: made.count, from: OUTPUT, to: CURSOR }])
          }
        })
      }
    }
  })
  const { server, driver, internal } = testBot
  const world = new ServerWorld(server, { hashes: true })
  await world.join(testBot, { game: { runtime_entity_id: 1n } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const inventory = new ServerInventory(server)
  let [answered, opened, closed, nextStackId] = [0, 0, 0, 500]
  const answer = (): void => {
    const requests = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    for (const { request_id: id, actions } of requests.slice(answered)) {
      const slots = new Map(actions.flatMap(({ source, destination }) => [source, destination]).filter(info => info !== undefined).map(info => [nameOf(info), refOf(info)]))
      inventory.respond(id, [...slots.values()].map(ref => {
        const stack = internal._inventory.stackAt(ref)
        return { ...ref, count: stack?.count ?? 0, stackId: stack === undefined ? 0 : stack.stackId > 0 ? stack.stackId : nextStackId++ }
      }))
    }
    answered = requests.length
    const asked = server.sentOf('interact').filter(({ action_id: action }) => action === 'open_inventory')
    asked.slice(opened).forEach(() => { server.send('container_open', { window_id: 2, window_type: 'inventory', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n }) })
    opened = asked.length
    const closes = server.sentOf('container_close')
    for (const { window_id: id } of closes.slice(closed)) server.send('container_close', { window_id: id, window_type: 'none', server: false })
    closed = closes.length
  }
  const served = async <Result>(operation: Promise<Result>): Promise<Result> => {
    let done = false
    operation.then(() => { done = true }, () => { done = true })
    const settled = (): boolean => done
    for (let tick = 0; tick < 300 && !settled(); tick++) {
      await driver.tick()
      if (serve) answer()
    }
    return await operation
  }
  return { ...testBot, inventory, errors, idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0, served }
}

/** the hopper opened, holding `items` */
async function openHopper ({ bot, server, inventory, driver }: WindowBot, items: ReadonlyArray<Given | null> = [null, null, null, null, null]): Promise<Window> {
  server.send('container_open', { window_id: HOPPER_ID, window_type: 'hopper', coordinates: { x: 2, y: 12, z: 0 }, runtime_entity_id: -1n })
  inventory.content(HOPPER_ID, items)
  await driver.tick()
  const window = bot.currentWindow
  assert.ok(window !== null && window.type === 'minecraft:hopper')
  return window
}

function counts (window: Window, slots: readonly number[]): Array<[string, number] | null> {
  return slots.map(slot => {
    const item = window.slots[slot]
    return item === null || item === undefined ? null : [item.name, item.count]
  })
}

describe(`bedrock window members (on ${version})`, () => {
  it('transfers one item a click, by the larger half, and the whole stack; then puts the rest back where it was taken', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, errors } = testBot
    const [planks, cobblestone, stone] = [idOf('oak_planks'), idOf('cobblestone'), idOf('stone')]
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    inventory.slot('inventory', 1, { id: cobblestone, count: 64, stackId: 8 })
    inventory.slot('inventory', 2, { id: stone, count: 64, stackId: 9 })
    const window = await openHopper(testBot, [null, { id: cobblestone, count: 10, stackId: 10 }, null, null, null])
    const requests = requestsSince(server)
    const range = { window, metadata: null, sourceStart: HOTBAR, sourceEnd: HOTBAR + 9, destStart: 0, destEnd: 5 }

    await served(bot.transfer({ ...range, itemType: planks, count: 3 }))
    assert.deepStrictEqual(requests(), [
      'take 10 hotbar:0 → cursor:0',
      'place 1 cursor:0 → container:0', 'place 1 cursor:0 → container:0', 'place 1 cursor:0 → container:0',
      'place 7 cursor:0 → hotbar:0'
    ])
    // 10 cobblestone in the hopper: the stack's 54 the left click places leave 10 on the cursor, put back first
    await served(bot.transfer({ ...range, itemType: cobblestone, count: 30, destStart: 1, destEnd: 2 }))
    assert.deepStrictEqual(requests(), [
      'take 64 hotbar:1 → cursor:0',
      'place 54 cursor:0 → container:1',
      'place 10 cursor:0 → hotbar:1',
      'take 32 container:1 → cursor:0',
      ...Array<string>(8).fill('place 1 cursor:0 → container:1'),
      'place 24 cursor:0 → hotbar:1'
    ])
    // the hopper's slot empty: the left click places the whole stack
    await served(bot.transfer({ ...range, itemType: stone, count: 40, destStart: 2, destEnd: 3 }))
    assert.deepStrictEqual(requests(), [
      'take 64 hotbar:2 → cursor:0',
      'place 64 cursor:0 → container:2',
      'take 32 container:2 → cursor:0',
      ...Array<string>(8).fill('place 1 cursor:0 → container:2'),
      'place 24 cursor:0 → hotbar:2'
    ])
    await served(bot.transfer({ ...range, itemType: planks, count: 7 }))
    assert.deepStrictEqual(requests(), ['take 7 hotbar:0 → cursor:0', 'place 7 cursor:0 → container:0'])
    assert.deepStrictEqual([counts(window, [0, 1, 2, HOTBAR, HOTBAR + 1, HOTBAR + 2]), window.selectedItem, errors], [
      [['oak_planks', 10], ['cobblestone', 40], ['stone', 40], null, ['cobblestone', 34], ['stone', 24]], null, []
    ])
    bot.end()
  })

  it('tosses outside the window, one a right click or the whole stack; the count is 1 by default, the ranges one slot', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    const planks = idOf('oak_planks')
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    const window = await openHopper(testBot)
    const requests = requestsSince(server)
    // the larger half would save clicks, but not outside the window
    await served(bot.transfer({ window, itemType: planks, metadata: null, count: 8, sourceStart: HOTBAR, destStart: -999 }))
    await served(bot.transfer({ window, itemType: planks, metadata: null, count: 2, sourceStart: HOTBAR, destStart: -999 }))
    inventory.slot('inventory', 0, { id: planks, count: 5, stackId: 11 })
    await driver.tick()
    await served(bot.transfer({ itemType: planks, metadata: null, sourceStart: HOTBAR, destStart: 4 }))
    assert.deepStrictEqual(requests(), [
      'take 10 hotbar:0 → cursor:0', ...Array<string>(8).fill('drop 1 cursor:0'), 'place 2 cursor:0 → hotbar:0',
      'take 2 hotbar:0 → cursor:0', 'drop 2 cursor:0',
      'take 5 hotbar:0 → cursor:0', 'place 1 cursor:0 → container:4', 'place 4 cursor:0 → hotbar:0'
    ])
    bot.end()
  })

  it('takes only the metadata and NBT asked, swapping the cursor\'s planks of another kind for them', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    const planks = idOf('oak_planks')
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7, metadata: 1 })
    inventory.slot('inventory', 1, { id: planks, count: 10, stackId: 8 })
    inventory.slot('inventory', 2, { id: planks, count: 10, stackId: 9, ints: { mark: 1 } })
    const window = await openHopper(testBot)
    const requests = requestsSince(server)
    const nbt: NBT = { type: 'compound', name: '', value: { mark: { type: 'int', value: 1 } } }
    const range = { window, itemType: planks, count: 1, sourceStart: HOTBAR, sourceEnd: HOTBAR + 9, destStart: 0, destEnd: 5 }
    await served(bot.transfer({ ...range, metadata: 0, nbt }))
    await served(bot.transfer({ ...range, metadata: 1 }))
    inventory.slot('ui', 0, { id: planks, count: 5, stackId: 12 })
    await driver.tick()
    await served(bot.transfer({ ...range, metadata: 0, nbt }))
    inventory.slot('ui', 0, { id: planks, count: 5, stackId: 13 })
    await driver.tick()
    await served(bot.transfer({ ...range, metadata: 1 }))
    assert.deepStrictEqual(requests(), [
      'take 10 hotbar:2 → cursor:0', 'place 1 cursor:0 → container:0', 'place 9 cursor:0 → hotbar:2',
      'take 10 hotbar:0 → cursor:0', 'place 1 cursor:0 → container:1', 'place 9 cursor:0 → hotbar:0',
      'swap cursor:0 → hotbar:2', 'place 1 cursor:0 → container:0', 'place 8 cursor:0 → hotbar:3',
      'swap cursor:0 → hotbar:0', 'place 1 cursor:0 → container:1', 'place 8 cursor:0 → hotbar:4'
    ])
    bot.end()
  })

  it('swaps the cursor\'s other item for the source\'s; puts the rest back by the first source slot, dropping what it then holds', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
    inventory.slot('ui', 0, { id: idOf('egg'), count: 3, stackId: 8 })
    const window = await openHopper(testBot)
    await driver.tick()
    const requests = requestsSince(server)
    await served(bot.transfer({ window, itemType: idOf('oak_planks'), metadata: null, sourceStart: HOTBAR, destStart: 0, destEnd: 5 }))
    assert.deepStrictEqual([requests(), counts(window, [0, HOTBAR]), window.selectedItem], [
      ['swap cursor:0 → hotbar:0', 'place 1 cursor:0 → container:0', 'swap cursor:0 → hotbar:0', 'drop 3 cursor:0'], [['oak_planks', 1], ['oak_planks', 9]], null
    ])
    bot.end()
  })

  it('places onto a stack with room, not a full one, what fits by a left click; one a click where the larger half saves none', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served } = testBot
    const [planks, cobblestone] = [idOf('oak_planks'), idOf('cobblestone')]
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    inventory.slot('inventory', 2, { id: cobblestone, count: 6, stackId: 8 })
    const window = await openHopper(testBot, [{ id: planks, count: 64, stackId: 9 }, { id: planks, count: 60, stackId: 10 }, null, null, null])
    const requests = requestsSince(server)
    const range = { window, metadata: null, sourceStart: HOTBAR, sourceEnd: HOTBAR + 9, destStart: 0, destEnd: 5 }
    await served(bot.transfer({ ...range, itemType: planks, count: 5 }))
    // half of 6 is 3: the larger half's 3 clicks more save none
    await served(bot.transfer({ ...range, itemType: cobblestone, count: 4, destStart: 3, destEnd: 4 }))
    assert.deepStrictEqual(requests(), [
      'take 10 hotbar:0 → cursor:0', 'place 4 cursor:0 → container:1', 'place 1 cursor:0 → container:2', 'place 5 cursor:0 → hotbar:0',
      'take 6 hotbar:2 → cursor:0', ...Array<string>(4).fill('place 1 cursor:0 → container:3'), 'place 2 cursor:0 → hotbar:1'
    ])
    bot.end()
  })

  it('rejects as Java an item it cannot find, an unknown item and a full destination; and an item the cursor did not take', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served } = testBot
    const [planks, stone] = [idOf('oak_planks'), idOf('stone')]
    const stones = { id: stone, count: 64, stackId: 20 }
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    const window = await openHopper(testBot, [stones, stones, stones, stones, stones])
    const range = { window, metadata: null, sourceStart: HOTBAR, sourceEnd: HOTBAR + 9, destStart: 0, destEnd: 5 }
    await assert.rejects(served(bot.transfer({ ...range, itemType: stone })), { message: `Can't find stone in slots [${HOTBAR} - ${HOTBAR + 9}], (item id: ${stone})` })
    await assert.rejects(served(bot.transfer({ ...range, itemType: 100_000 })), { name: 'AssertionError', message: 'Invalid itemType' })
    const requests = requestsSince(server)
    // one slot by default: the inventory's first is empty
    await assert.rejects(served(bot.transfer({ window, metadata: null, sourceStart: HOTBAR, sourceEnd: HOTBAR + 9, itemType: planks, destStart: 4 })), { message: 'destination full' })
    // the cursor's planks stay on it, as Java leaves them
    assert.deepStrictEqual([requests(), counts(window, [HOTBAR]), window.selectedItem?.count], [['take 10 hotbar:0 → cursor:0'], [null], 10])

    const silent = await windowBot(false)
    silent.inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    const hopper = await openHopper(silent)
    const taking = silent.served(silent.bot.transfer({ ...range, window: hopper, itemType: planks }))
    await silent.driver.ticks(2)
    const [{ requests: [taken] = [] } = { requests: [] }] = silent.server.sentOf('item_stack_request')
    assert.ok(taken !== undefined)
    // the server takes the request, but tells of no item on the cursor
    silent.inventory.respond(taken.request_id, [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 0, stackId: 0 }])
    await assert.rejects(taking, { message: `transfer: the cursor did not take the oak_planks of slot ${HOTBAR}` })
    bot.end()
    silent.bot.end()
  })

  it('puts away by a shift click (room on a stack will do), or by a click then onto the inventory: on an output, and with no room, dropping it; an empty slot sends nothing', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    const [planks, stone, table] = [idOf('oak_planks'), idOf('stone'), idOf('crafting_table')]
    const window = await openHopper(testBot, [{ id: planks, count: 10, stackId: 7 }, { id: planks, count: 4, stackId: 8 }, { id: planks, count: 3, stackId: 9 }, null, null])
    const requests = requestsSince(server)
    await served(bot.putAway(0))
    await served(bot.putAway(3))
    const stones = Array<Given>(36).fill({ id: stone, count: 64, stackId: 20 })
    // no empty slot, but a stack with room
    inventory.content('inventory', stones.map((given, slot) => slot === 9 ? { id: planks, count: 10, stackId: 10 } : given))
    await driver.tick()
    await served(bot.putAway(2))
    inventory.content('inventory', stones)
    await driver.tick()
    await served(bot.putAway(1))
    assert.deepStrictEqual([requests(), counts(window, [0, 1, 2]), window.selectedItem], [[
      'place 10 container:0 → hotbar_and_inventory:0', 'place 3 container:2 → hotbar_and_inventory:9', 'take 4 container:1 → cursor:0', 'drop 4 cursor:0'
    ], [null, null, null], null])
    await served(bot.closeWindow(window))

    inventory.content('inventory', Array<Given | null>(36).fill(null))
    inventory.slot('ui', 50, { id: table, count: 1, stackId: 30 })
    server.send('container_open', { window_id: 4, window_type: 'workbench', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
    await driver.tick()
    await served(bot.putAway(0))
    assert.deepStrictEqual(requests(), ['take 1 creative_output:50 → cursor:0', 'place 1 cursor:0 → inventory:9'])
    bot.end()
  })

  it('puts the cursor\'s item onto a stack of it with room, then into empty slots; else into the slot given, dropping the rest', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    const [planks, stone] = [idOf('oak_planks'), idOf('stone')]
    const window = await openHopper(testBot, [null, null, { id: planks, count: 60, stackId: 7 }, null, null])
    const requests = requestsSince(server)
    inventory.slot('ui', 0, { id: planks, count: 10, stackId: 8 })
    await driver.tick()
    await served(bot.putSelectedItemRange(0, 5, window, null))
    const stones = { id: stone, count: 64, stackId: 20 }
    inventory.content(HOPPER_ID, [stones, stones, stones, stones, stones])
    inventory.slot('inventory', 0, { id: planks, count: 60, stackId: 9 })
    inventory.slot('ui', 0, { id: planks, count: 10, stackId: 10 })
    await driver.tick()
    await served(bot.putSelectedItemRange(0, 5, window, HOTBAR))
    assert.deepStrictEqual(requests(), [
      'place 4 cursor:0 → container:2', 'place 6 cursor:0 → container:0',
      'place 4 cursor:0 → hotbar:0', 'drop 6 cursor:0'
    ])
    bot.end()
  })

  it('rejects putting the cursor\'s item in a slot that does not take it, as the vanilla client sends nothing', async () => {
    const { bot, inventory, idOf, served, driver } = await windowBot()
    await served(bot.openInventory())
    inventory.slot('ui', 0, { id: idOf('oak_planks'), count: 10, stackId: 8 })
    await driver.tick()
    await assert.rejects(served(bot.putSelectedItemRange(5, 9, bot.inventory, null)), { message: 'putSelectedItemRange: slot 5 of the minecraft:inventory window does not take the cursor\'s oak_planks' })
    bot.end()
  })

  it('moves a slot\'s item, swapping, on the inventory\'s screen it opens and closes; and closes it after a failure', async () => {
    const { bot, server, inventory, idOf, served } = await windowBot()
    inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
    inventory.slot('inventory', 9, { id: idOf('egg'), count: 3, stackId: 8 })
    const requests = requestsSince(server)
    await served(bot.moveSlotItem(36, 9))
    await served(bot.moveSlotItem(9, 10))
    assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow, counts(bot.inventory, [9, 10, 36])], [[
      'take 10 hotbar:0 → cursor:0', 'swap cursor:0 → inventory:9', 'place 3 cursor:0 → hotbar:0',
      'take 10 inventory:9 → cursor:0', 'place 10 cursor:0 → inventory:10'
    ], 2, null, [null, ['oak_planks', 10], ['egg', 3]]])

    await assert.rejects(served(bot.moveSlotItem(36, 99)), { message: 'the minecraft:inventory window has no slot 99' })
    // the close gave the cursor's back
    assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow], [['take 3 hotbar:0 → cursor:0', 'place 3 cursor:0 → hotbar_and_inventory:0'], 3, null])
    bot.end()
  })

  it('transfers and puts away on the inventory\'s screen, opened and closed for each when none is open', async () => {
    const { bot, server, inventory, idOf, served, driver } = await windowBot()
    const planks = idOf('oak_planks')
    inventory.slot('inventory', 0, { id: planks, count: 10, stackId: 7 })
    await driver.tick()
    const requests = requestsSince(server)
    await served(bot.transfer({ itemType: planks, metadata: null, count: 10, sourceStart: 36, destStart: 9 }))
    await served(bot.putAway(9))
    assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow, counts(bot.inventory, [9, 36])], [
      ['take 10 hotbar:0 → cursor:0', 'place 10 cursor:0 → inventory:9', 'place 10 inventory:9 → hotbar:0'], 2, null, [null, ['oak_planks', 10]]
    ])
    bot.end()
  })

  it('clicks with simpleClick\'s left and right mouse buttons', async () => {
    const { bot, server, inventory, idOf, served } = await windowBot()
    inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
    await served(bot.openInventory())
    const requests = requestsSince(server)
    await served(bot.simpleClick.leftMouse(36))
    await served(bot.simpleClick.rightMouse(37))
    assert.deepStrictEqual(requests(), ['take 10 hotbar:0 → cursor:0', 'place 1 cursor:0 → hotbar:1'])
    bot.end()
  })

  it('rejects a member clicking a window that is not open', async () => {
    const testBot = await windowBot()
    const { bot, idOf, served } = testBot
    const window = await openHopper(testBot)
    const options = { itemType: idOf('oak_planks'), metadata: null, sourceStart: 0, destStart: HOTBAR }
    await assert.rejects(served(bot.transfer({ ...options, window: bot.inventory })), { message: 'transfer needs the minecraft:inventory window open' })
    await served(bot.closeWindow(window))
    await assert.rejects(served(asChest(window).withdraw(options.itemType, null, 1)), { message: 'withdraw needs the minecraft:hopper window open' })
    bot.end()
  })

  it('withdraws and deposits by transfers between the window\'s two parts, a count of null being 1; and rejects a withdraw with the inventory full', async () => {
    const testBot = await windowBot()
    const { bot, server, inventory, idOf, served, driver } = testBot
    const [planks, stone] = [idOf('oak_planks'), idOf('stone')]
    const chest = asChest(await openHopper(testBot, [{ id: planks, count: 10, stackId: 7 }, null, null, null, null]))
    const requests = requestsSince(server)
    await served(chest.withdraw(planks, null, 4))
    await served(chest.deposit(planks, null, 3))
    await served(chest.deposit(planks, 0, null))
    assert.deepStrictEqual([requests(), counts(chest, [0, INVENTORY])], [[
      'take 10 container:0 → cursor:0', ...Array<string>(4).fill('place 1 cursor:0 → inventory:9'), 'place 6 cursor:0 → container:0',
      'take 4 inventory:9 → cursor:0', ...Array<string>(3).fill('place 1 cursor:0 → container:0'), 'place 1 cursor:0 → inventory:9',
      'take 1 inventory:9 → cursor:0', 'place 1 cursor:0 → container:0'
    ], [['oak_planks', 10], null]])
    inventory.content('inventory', Array<Given>(36).fill({ id: stone, count: 64, stackId: 20 }))
    await driver.tick()
    await assert.rejects(served(chest.withdraw(planks, null, 1)), { message: 'Unable to withdraw, Bot inventory is full.' })
    assert.deepStrictEqual(requests(), [])
    bot.end()
  })

  it('closes the window by its close, which resolves as closeWindow; its close event follows windowClose, whoever closed it', async () => {
    const testBot = await windowBot()
    const { bot, server, served, driver } = testBot
    const events: string[] = []
    bot.on('windowClose', window => { events.push(`windowClose ${window.type}`) })
    const chest = asChest(await openHopper(testBot))
    chest.on('close', () => { events.push('close') })
    await served(chest.close())
    assert.deepStrictEqual([events, bot.currentWindow, server.sentOf('container_close').length], [['windowClose minecraft:hopper', 'close'], null, 1])
    const second = asChest(await openHopper(testBot))
    second.on('close', () => { events.push('close by the server') })
    server.send('container_close', { window_id: HOPPER_ID, window_type: 'none', server: true })
    await driver.tick()
    assert.deepStrictEqual(events.slice(2), ['windowClose minecraft:hopper', 'close by the server'])
    bot.end()
  })

  it('emits heldItemChanged for updateHeldItem in the next input pass', async () => {
    const { bot, inventory, idOf, driver } = await windowBot()
    inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
    await driver.tick()
    const held: Array<number | undefined> = []
    bot.on('heldItemChanged', item => { held.push(item?.count) })
    bot.updateHeldItem()
    assert.deepStrictEqual(held, [])
    await driver.frame(10)
    assert.deepStrictEqual(held, [10])
    bot.end()
  })
})
