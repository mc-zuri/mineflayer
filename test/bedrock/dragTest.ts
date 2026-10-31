import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// Drags (clickWindow mode 5) and double clicks (mode 6) as the vanilla client made them against Bedrock Dedicated
// Server in reduced_stations: the dropper's left drag, the dispenser's right drag and the chest's double click, the same
// moves on all 59 builds but for the ids and the slots a response not yet in names (1.26.51.1's below; 1.26.60.5's ids
// are 3286 lower, its stack ids 2693 higher), and from 1.26.60 bracketed by serverbound_cursor_item_drag.

const PLANKS = 5
const STONE = 1
// the block runtime id of the recorded planks
const PLANKS_BLOCK = 1921718966
const OUTSIDE = -999

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface DragBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
}

async function dragBot (version: BedrockVersion): Promise<DragBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors }
}

function openScreen (server: FakeBedrockClient, id: number, type: 'container' | 'dispenser' | 'dropper' | 'inventory'): void {
  server.send('container_open', { window_id: id, window_type: type, coordinates: { x: 2, y: 12, z: 0 }, runtime_entity_id: -1n })
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

/** a slot as a request names it, without 1.21.20's dynamic id */
function slotOf (info: SentSlot): { container: RespondedSlot['container'], slot: number, stackId: number } {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  if (container === undefined || typeof container === 'number') throw new Error('a request names its container by number')
  return { container, slot: info.slot ?? info.slot_id ?? 0, stackId: Number(info.stack_id) }
}

function describeSlot (info: SentSlot): string {
  const { container, slot, stackId } = slotOf(info)
  return `${container}:${slot}#${stackId}`
}

/** each request as the recorded ones are described here: its id, its actions (no legacy type id) */
function described (request: SentRequest): string {
  return `${request.request_id} ${request.actions.map(({ type_id: type, count, source, destination }) =>
    `${String(type)} ${count ?? ''} ${source === undefined ? '' : describeSlot(source)}${destination === undefined ? '' : ` → ${describeSlot(destination)}`}`).join(', ')}`
}

/** what the bot sent since the last call: each request described, a cursor drag's bracket by its state, a close */
function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sent.length
  return () => {
    const fresh = server.sent.slice(seen).map(({ name }) => name)
    seen = server.sent.length
    const latest = <Packet>(all: Packet[], name: string): Packet[] => all.slice(all.length - fresh.filter(sent => sent === name).length)
    const drags = latest(server.sentOf('serverbound_cursor_item_drag'), 'serverbound_cursor_item_drag')
    const requests = latest(server.sentOf('item_stack_request'), 'item_stack_request')
    return fresh.flatMap(name => {
      if (name === 'serverbound_cursor_item_drag') return [String(drags.shift()?.state)]
      if (name === 'container_close') return ['close']
      return name === 'item_stack_request' ? requests.shift()?.requests.map(described) ?? [] : []
    })
  }
}

/** Bedrock Dedicated Server's side of the slots requests move: each answered with what it left in its two slots, a stack moved in part to an empty slot numbered anew, as recorded */
class Responder {
  private readonly stacks = new Map<string, { count: number, stackId: number }>()
  private readonly server: FakeBedrockClient
  private readonly inventory: ServerInventory
  private nextStackId: number
  private seen: number

  constructor ({ server, inventory }: DragBot, nextStackId: number) {
    this.server = server
    this.inventory = inventory
    this.nextStackId = nextStackId
    this.seen = server.sentOf('item_stack_request').length
  }

  holds (container: RespondedSlot['container'], slot: number, count: number, stackId: number): void {
    this.stacks.set(`${container}:${slot}`, { count, stackId })
  }

  /** the requests sent since the last answer, in order */
  answer (): void {
    const sent = this.server.sentOf('item_stack_request')
    for (const { request_id: id, actions } of sent.slice(this.seen).flatMap(({ requests }) => requests)) this.inventory.respond(id, actions.flatMap(action => this.move(action)))
    this.seen = sent.length
  }

  private move ({ count = 0, source, destination }: SentRequest['actions'][number]): RespondedSlot[] {
    assert.ok(source !== undefined && destination !== undefined)
    const [from, to] = [slotOf(source), slotOf(destination)]
    const moved = this.stacks.get(`${from.container}:${from.slot}`)
    assert.ok(moved !== undefined)
    const left = moved.count - count
    const arrived = this.stacks.get(`${to.container}:${to.slot}`) ?? { count: 0, stackId: left === 0 ? moved.stackId : this.nextStackId++ }
    if (left === 0) this.stacks.delete(`${from.container}:${from.slot}`)
    else this.holds(from.container, from.slot, left, moved.stackId)
    this.holds(to.container, to.slot, arrived.count + count, arrived.stackId)
    return [{ container: from.container, slot: from.slot, count: left, ...left === 0 ? {} : { stackId: moved.stackId } }, { container: to.container, slot: to.slot, count: arrived.count + count, stackId: arrived.stackId }]
  }
}

/** a click, its requests answered in the tick after they left */
async function click ({ bot, driver }: DragBot, responder: Responder, slot: number, mouseButton: number, mode: number): Promise<void> {
  const clicked = bot.clickWindow(slot, mouseButton, mode)
  await driver.tick()
  responder.answer()
  await driver.tick()
  await clicked
}

/** the recorded requests with each slot's container renamed, the request ids and the stack ids moved */
function moved (requests: readonly string[], { container = 'container', first = 0, requestIds = 0, stackIds = 0 }: { container?: string, first?: number, requestIds?: number, stackIds?: number }): string[] {
  return requests.map(request => request
    .replace(/^-\d+/, id => String(Number(id) + requestIds))
    .replace(/container:(\d+)/g, (_, slot: string) => `${container}:${first + Number(slot)}`)
    .replace(/#(-?\d+)/g, (_, id: string) => `#${Number(id) < 0 ? Number(id) + requestIds : Number(id) === 0 ? 0 : Number(id) + stackIds}`))
}

/** dropper.spread_left on 1.26.51.1 (window 22): 64 planks taken from hotbar slot 0 (stack id 110), dragged over the 9 slots, the one left put back */
const LEFT_DRAG = [
  '-255 take 64 hotbar:0#110 → cursor:0#0',
  '-257 place 64 cursor:0#110 → container:0#0',
  '-259 place 64 container:0#110 → cursor:0#0', '-261 place 64 cursor:0#-259 → container:0#-259', '-263 place 32 container:0#-261 → container:1#0',
  '-265 place 11 container:0#110 → container:2#0', '-267 place 10 container:1#111 → container:2#-265', '-269 place 1 container:1#-267 → cursor:0#0',
  '-271 place 5 container:0#110 → container:3#0', '-273 place 5 container:1#111 → container:3#-271', '-275 place 5 container:2#112 → container:3#-273', '-277 place 1 cursor:0#113 → container:3#-275',
  '-279 place 4 container:0#110 → container:4#0', '-281 place 4 container:1#111 → container:4#-279', '-283 place 4 container:2#112 → container:4#-281', '-285 place 4 container:3#114 → cursor:0#0',
  '-287 place 2 container:0#110 → container:5#0', '-289 place 2 container:1#111 → container:5#-287', '-291 place 2 container:2#112 → container:5#-289', '-293 place 2 container:3#114 → container:5#-291',
  '-295 place 2 container:4#115 → container:5#-293',
  '-297 place 1 container:0#110 → container:6#0', '-299 place 1 container:1#111 → container:6#-297', '-301 place 1 container:2#112 → container:6#-299', '-303 place 1 container:3#114 → container:6#-301',
  '-305 place 1 container:4#115 → container:6#-303', '-307 place 1 container:5#117 → container:6#-305', '-309 place 3 cursor:0#116 → container:6#-307',
  '-311 place 1 container:0#110 → container:7#0', '-313 place 1 container:1#111 → container:7#-311', '-315 place 1 container:2#112 → container:7#-313', '-317 place 1 container:3#114 → container:7#-315',
  '-319 place 1 container:4#115 → container:7#-317', '-321 place 1 container:5#117 → container:7#-319', '-323 place 1 container:6#118 → container:7#-321', '-325 place 1 cursor:0#116 → container:7#-323',
  '-327 place 1 container:0#110 → container:8#0', '-329 place 1 container:1#111 → container:8#-327', '-331 place 1 container:2#112 → container:8#-329', '-333 place 1 container:3#114 → container:8#-331',
  '-335 place 1 container:4#115 → container:8#-333', '-337 place 1 container:5#117 → container:8#-335', '-339 place 1 container:6#118 → container:8#-337', '-341 place 1 container:7#119 → cursor:0#0',
  '-343 place 1 cursor:0#121 → hotbar:0#0'
]

/** dispenser.spread_right on 1.26.51.1 (window 21): 10 planks taken from hotbar slot 0 (stack id 99), one placed in each slot, the one left put back */
const RIGHT_DRAG = [
  '-233 take 10 hotbar:0#99 → cursor:0#0',
  '-235 place 1 cursor:0#99 → container:0#0', '-237 place 1 cursor:0#99 → container:1#0', '-239 place 1 cursor:0#99 → container:2#0', '-241 place 1 cursor:0#99 → container:3#0',
  '-243 place 1 cursor:0#99 → container:4#0', '-245 place 1 cursor:0#99 → container:5#0', '-247 place 1 cursor:0#99 → container:6#0', '-249 place 1 cursor:0#99 → container:7#0',
  '-251 place 1 cursor:0#99 → container:8#0',
  '-253 place 1 cursor:0#99 → hotbar:0#0'
]

/** chest.double_click on 1.26.51.1 (window 24): half of 12 planks (stack id 125) put in the chest, the rest taken, then the chest's gathered by a double click, all put back */
const DOUBLE_CLICK = [
  '-349 take 6 hotbar:0#125 → cursor:0#0', '-351 place 6 cursor:0#126 → container:0#0',
  '-353 take 6 hotbar:0#125 → cursor:0#0', '-355 take 6 container:0#126 → cursor:0#125',
  '-357 place 12 cursor:0#125 → hotbar:0#0'
]

/** 1.26.60.5's brackets: the drag's held from its first slot's request to its end, a click placing from the cursor its own; none for a take */
function bracketed (requests: readonly string[], ...brackets: ReadonlyArray<readonly [start: number, stop: number]>): string[] {
  return requests.flatMap((request, index) => [
    ...brackets.some(([start]) => start === index) ? ['start'] : [],
    request,
    ...brackets.some(([, stop]) => stop === index) ? ['stop'] : []
  ])
}

function planks (count: number, stackId: number): { id: number, count: number, stackId: number, blockRuntimeId: number } {
  return { id: PLANKS, count, stackId, blockRuntimeId: PLANKS_BLOCK }
}

function empty (size: number): null[] {
  return Array.from({ length: size }, () => null)
}

/** the count of each of a window's slots */
function counts (bot: DragBot['bot'], from: number, to: number): Array<number | undefined> {
  return Array.from({ length: to - from }, (_, index) => bot.currentWindow?.slots[from + index]?.count)
}

describe('bedrock drags and double clicks', () => {
  for (const [name, from, to] of [['no bracket', 'bedrock_1.16.201', 'bedrock_1.26.51'], ['the cursor drag\'s bracket', 'bedrock_1.26.60', 'bedrock_1.26.60']] as const) {
    describe(`${name} (${from.slice(8)} – ${to.slice(8)})`, () => {
      const bracket = from === 'bedrock_1.26.60'

      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: shares 64 planks over a dropper's 9 slots by a left drag, each slot's moves at once, as recorded`, async () => {
          const testBot = await dragBot(version)
          const { bot, internal, server, driver, inventory, errors } = testBot
          inventory.slot('inventory', 0, planks(64, 110))
          openScreen(server, 22, 'dropper')
          inventory.content(22, empty(9))
          internal._core.requestIds.continueProcess(-255)
          await driver.tick()
          const responder = new Responder(testBot, 111)
          responder.holds('hotbar', 0, 64, 110)
          const sent = sentSince(server)
          await click(testBot, responder, 36, 0, 0)
          await click(testBot, responder, OUTSIDE, 0, 5)
          for (let slot = 0; slot < 9; slot++) await click(testBot, responder, slot, 1, 5)
          const dragged = [counts(bot, 0, 9), bot.currentWindow?.selectedItem?.count]
          await click(testBot, responder, OUTSIDE, 2, 5)
          await click(testBot, responder, 36, 0, 0)
          assert.deepStrictEqual([sent(), dragged, bot.currentWindow?.slots[36]?.count, errors], [
            bracket ? bracketed(LEFT_DRAG, [1, 43], [44, 44]) : LEFT_DRAG,
            [[7, 7, 7, 7, 7, 7, 7, 7, 7], 1],
            1,
            []
          ])
          bot.end()
        })

        it(`bedrock ${version}: places one plank in each of a dispenser's slots by a right drag, and gathers a chest's by a double click, as recorded`, async () => {
          const testBot = await dragBot(version)
          const { bot, internal, server, driver, inventory, errors } = testBot
          inventory.slot('inventory', 0, planks(10, 99))
          openScreen(server, 21, 'dispenser')
          inventory.content(21, empty(9))
          internal._core.requestIds.continueProcess(-233)
          await driver.tick()
          const dispenser = new Responder(testBot, 100)
          dispenser.holds('hotbar', 0, 10, 99)
          const sent = sentSince(server)
          await click(testBot, dispenser, 36, 0, 0)
          await click(testBot, dispenser, OUTSIDE, 4, 5)
          for (let slot = 0; slot < 9; slot++) await click(testBot, dispenser, slot, 5, 5)
          await click(testBot, dispenser, OUTSIDE, 6, 5)
          await click(testBot, dispenser, 36, 0, 0)
          const dragged = [sent(), counts(bot, 0, 9), bot.currentWindow?.slots[36]?.count]

          server.send('container_close', { window_id: 21, server: true })
          inventory.slot('inventory', 0, planks(12, 125))
          openScreen(server, 24, 'container')
          inventory.content(24, empty(27))
          internal._core.requestIds.continueProcess(-349)
          await driver.tick()
          const chest = new Responder(testBot, 126)
          chest.holds('hotbar', 0, 12, 125)
          await click(testBot, chest, 54, 1, 0)
          await click(testBot, chest, 0, 0, 0)
          await click(testBot, chest, 54, 0, 0)
          await click(testBot, chest, 54, 0, 6)
          await click(testBot, chest, 54, 0, 0)
          assert.deepStrictEqual([dragged, sent(), bot.currentWindow?.slots[0], bot.currentWindow?.slots[54]?.count, errors], [
            [bracket ? bracketed(RIGHT_DRAG, [1, 9], [10, 10]) : RIGHT_DRAG, [1, 1, 1, 1, 1, 1, 1, 1, 1], 1],
            bracket ? bracketed(DOUBLE_CLICK, [1, 1], [4, 4]) : DOUBLE_CLICK,
            null,
            12,
            []
          ])
          bot.end()
        })
      }
    })
  }

  describe('the bracket of a drag that is not ended (1.26.60 – latest)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60')) {
      it(`bedrock ${version}: stops the bracket of a drag a click placing from the cursor broke before that click's own, and of one the server or a double click broke at once`, async () => {
        const testBot = await dragBot(version)
        const { bot, server, driver, inventory, errors } = testBot
        inventory.slot('inventory', 0, planks(6, 10))
        openScreen(server, 2, 'inventory')
        await driver.tick()
        const responder = new Responder(testBot, 11)
        responder.holds('hotbar', 0, 6, 10)
        const sent = sentSince(server)
        await click(testBot, responder, 36, 0, 0)
        await click(testBot, responder, OUTSIDE, 4, 5)
        await click(testBot, responder, 10, 5, 5)
        // one plank by the right button's click
        await click(testBot, responder, 11, 1, 0)
        await click(testBot, responder, 12, 5, 5)
        const byClick = sent()
        await click(testBot, responder, OUTSIDE, 4, 5)
        await click(testBot, responder, 12, 5, 5)
        inventory.slot('inventory', 12, planks(2, 30))
        responder.holds('inventory', 12, 2, 30)
        await click(testBot, responder, 13, 5, 5)
        const byServer = sent()
        await click(testBot, responder, OUTSIDE, 4, 5)
        await click(testBot, responder, 13, 5, 5)
        await click(testBot, responder, 14, 0, 6)
        await click(testBot, responder, 15, 5, 5)
        assert.deepStrictEqual([byClick, byServer, sent(), bot.inventory.selectedItem?.count, errors], [[
          '-3 take 6 hotbar:0#10 → cursor:0#0',
          'start', '-5 place 1 cursor:0#10 → inventory:10#0',
          'stop', 'start', '-7 place 1 cursor:0#10 → inventory:11#0', 'stop'
        ], [
          'start', '-9 place 1 cursor:0#10 → inventory:12#0', 'stop'
        ], [
          'start', '-11 place 1 cursor:0#10 → inventory:13#0', 'stop',
          '-13 take 1 inventory:10#11 → cursor:0#10', '-15 take 1 inventory:11#12 → cursor:0#-13', '-17 take 2 inventory:12#30 → cursor:0#-15', '-19 take 1 inventory:13#14 → cursor:0#-17'
        ], 7, []])
        bot.end()
      })

      for (const end of ['window.close()', 'the server closing it', 'another screen opening'] as const) {
        it(`bedrock ${version}: stops the bracket of a drag over a screen ended by ${end}, before the close`, async () => {
          const testBot = await dragBot(version)
          const { bot, server, driver, inventory, errors } = testBot
          inventory.slot('inventory', 0, planks(6, 10))
          openScreen(server, 22, 'dropper')
          inventory.content(22, empty(9))
          await driver.tick()
          const responder = new Responder(testBot, 11)
          responder.holds('hotbar', 0, 6, 10)
          const sent = sentSince(server)
          await click(testBot, responder, 36, 0, 0)
          await click(testBot, responder, OUTSIDE, 4, 5)
          await click(testBot, responder, 0, 5, 5)
          const window = bot.currentWindow
          assert.ok(window !== null)
          if (end === 'window.close()') {
            const closing = bot.closeWindow(window)
            await driver.ticks(2)
            responder.answer()
            await driver.ticks(20)
            server.send('container_close', { window_id: 22, server: false })
            await driver.tick()
            await closing
          } else {
            if (end === 'the server closing it') server.send('container_close', { window_id: 22, server: true })
            else openScreen(server, 23, 'dispenser')
            await driver.ticks(2)
          }
          assert.deepStrictEqual([sent(), errors], [[
            '-3 take 6 hotbar:0#10 → cursor:0#0',
            'start', '-5 place 1 cursor:0#10 → container:0#0',
            'stop',
            // the cursor's handed back
            ...end === 'window.close()' ? ['-7 place 5 cursor:0#10 → hotbar_and_inventory:0#0', 'close'] : []
          ], []])
          bot.end()
        })
      }
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('drags on the inventory screen as on a container\'s, as recorded on 1.26.51.1 (clicks_mouse_spread_row)', async () => {
      const testBot = await dragBot(version)
      const { bot, internal, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(64, 32))
      openScreen(server, 12, 'inventory')
      internal._core.requestIds.continueProcess(-61)
      await driver.tick()
      const responder = new Responder(testBot, 33)
      responder.holds('hotbar', 0, 64, 32)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 0)
      await click(testBot, responder, OUTSIDE, 0, 5)
      for (let slot = 9; slot < 18; slot++) await click(testBot, responder, slot, 1, 5)
      await click(testBot, responder, OUTSIDE, 2, 5)
      await click(testBot, responder, 36, 0, 0)
      assert.deepStrictEqual([sent(), counts(bot, 9, 18), errors], [
        bracketed(moved(LEFT_DRAG, { container: 'inventory', first: 9, requestIds: 194, stackIds: -78 }), [1, 43], [44, 44]),
        [7, 7, 7, 7, 7, 7, 7, 7, 7],
        []
      ])
      bot.end()
    })

    it('sends nothing for a slot added to no drag, to one of the other button or of another screen, or outside; nor for a drag of an empty cursor', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(3, 10))
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 11)
      responder.holds('hotbar', 0, 3, 10)
      const sent = sentSince(server)
      await click(testBot, responder, 10, 1, 5)
      await click(testBot, responder, OUTSIDE, 0, 5)
      await click(testBot, responder, 10, 1, 5)
      const none = sent()
      await click(testBot, responder, 36, 0, 0)
      await click(testBot, responder, OUTSIDE, 0, 5)
      await click(testBot, responder, 10, 5, 5)
      // the right button's slot ended the drag
      await click(testBot, responder, 10, 1, 5)
      await click(testBot, responder, OUTSIDE, 4, 5)
      await click(testBot, responder, OUTSIDE, 5, 5)
      // a drag's end ends it
      await click(testBot, responder, OUTSIDE, 6, 5)
      await click(testBot, responder, 10, 5, 5)
      // and the screen's close
      await click(testBot, responder, OUTSIDE, 0, 5)
      server.send('container_close', { window_id: 2, server: true })
      openScreen(server, 3, 'inventory')
      await driver.tick()
      await click(testBot, responder, 10, 1, 5)
      assert.deepStrictEqual([none, sent(), bot.inventory.selectedItem?.count, errors], [[], ['-3 take 3 hotbar:0#10 → cursor:0#0'], 3, []])
      bot.end()
    })

    it('sends nothing for a slot holding an item, already in the drag, that does not take the item (an armor slot, the output), or past the items: a left drag of 3 over 4 slots', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(3, 10))
      inventory.slot('inventory', 9, { id: STONE, count: 1, stackId: 20 })
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 11)
      responder.holds('hotbar', 0, 3, 10)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 0)
      await click(testBot, responder, OUTSIDE, 0, 5)
      for (const slot of [9, 5, 0, 10, 10, 11, 12, 13]) await click(testBot, responder, slot, 1, 5)
      await click(testBot, responder, OUTSIDE, 2, 5)
      assert.deepStrictEqual([sent(), counts(bot, 9, 14), bot.inventory.selectedItem, errors], [[
        '-3 take 3 hotbar:0#10 → cursor:0#0',
        'start',
        '-5 place 3 cursor:0#10 → inventory:10#0',
        '-7 place 3 inventory:10#10 → cursor:0#0', '-9 place 3 cursor:0#-7 → inventory:10#-7', '-11 place 1 inventory:10#-9 → inventory:11#0', '-13 place 1 inventory:10#-11 → cursor:0#-9',
        '-15 place 1 cursor:0#12 → inventory:12#0',
        'stop'
      ], [1, 1, 1, 1, undefined], null, []])
      bot.end()
    })

    it('right drags while the cursor holds an item: 2 planks over 3 slots', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(2, 10))
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 11)
      responder.holds('hotbar', 0, 2, 10)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 0)
      await click(testBot, responder, OUTSIDE, 4, 5)
      for (const slot of [10, 11, 12]) await click(testBot, responder, slot, 5, 5)
      await click(testBot, responder, OUTSIDE, 6, 5)
      assert.deepStrictEqual([sent(), counts(bot, 10, 13), errors], [[
        '-3 take 2 hotbar:0#10 → cursor:0#0',
        'start', '-5 place 1 cursor:0#10 → inventory:10#0', '-7 place 1 cursor:0#10 → inventory:11#0', 'stop'
      ], [1, 1, undefined], []])
      bot.end()
    })

    it('ends a drag whose slots or cursor changed (as Java\'s server ends it at another click): its next slot sends nothing', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(4, 10))
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 11)
      responder.holds('hotbar', 0, 4, 10)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 0)
      for (const changed of [planks(2, 11), { id: STONE, count: 1, stackId: 12 }]) {
        const slot = changed.stackId - 1
        await click(testBot, responder, OUTSIDE, 4, 5)
        await click(testBot, responder, slot, 5, 5)
        inventory.slot('inventory', slot, changed)
        await click(testBot, responder, slot + 1, 5, 5)
      }
      await click(testBot, responder, OUTSIDE, 4, 5)
      await click(testBot, responder, 14, 5, 5)
      // the cursor's plank onto the slot's
      await click(testBot, responder, 14, 0, 0)
      await click(testBot, responder, 15, 5, 5)
      await click(testBot, responder, OUTSIDE, 6, 5)
      assert.deepStrictEqual([sent(), counts(bot, 10, 16), bot.inventory.selectedItem, errors], [[
        '-3 take 4 hotbar:0#10 → cursor:0#0',
        'start', '-5 place 1 cursor:0#10 → inventory:10#0', 'stop',
        'start', '-7 place 1 cursor:0#10 → inventory:11#0', 'stop',
        'start', '-9 place 1 cursor:0#10 → inventory:14#0', 'stop', 'start', '-11 place 1 cursor:0#10 → inventory:14#13', 'stop'
      ], [2, 1, undefined, undefined, 2, undefined], null, []])
      bot.end()
    })

    it('ends a drag whose cursor changed: its next slot sends nothing', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(4, 10))
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 11)
      responder.holds('hotbar', 0, 4, 10)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 0)
      await click(testBot, responder, OUTSIDE, 4, 5)
      await click(testBot, responder, 10, 5, 5)
      inventory.slot('ui', 0, planks(2, 10))
      responder.holds('cursor', 0, 2, 10)
      await click(testBot, responder, 11, 5, 5)
      await click(testBot, responder, OUTSIDE, 0, 5)
      await click(testBot, responder, 12, 1, 5)
      // the cursor the drag emptied
      inventory.slot('ui', 0, planks(1, 30))
      await click(testBot, responder, 13, 1, 5)
      await click(testBot, responder, OUTSIDE, 2, 5)
      assert.deepStrictEqual([sent(), counts(bot, 10, 14), bot.inventory.selectedItem?.count, errors], [[
        '-3 take 4 hotbar:0#10 → cursor:0#0',
        'start', '-5 place 1 cursor:0#10 → inventory:10#0', 'stop',
        'start', '-7 place 2 cursor:0#10 → inventory:12#0', 'stop'
      ], [1, undefined, 2, undefined], 1, []])
      bot.end()
    })

    it('gathers by a double click the stacks of the cursor\'s item, partial ones first in the window\'s order, until it holds a stack, never from the output; nothing on a slot holding an item, outside, or with an empty cursor', async () => {
      const testBot = await dragBot(version)
      const { bot, server, driver, inventory, errors } = testBot
      inventory.slot('inventory', 0, planks(10, 1))
      inventory.slot('inventory', 9, planks(64, 2))
      inventory.slot('inventory', 10, planks(30, 3))
      inventory.slot('inventory', 11, { id: STONE, count: 5, stackId: 4 })
      inventory.slot('inventory', 1, planks(20, 5))
      inventory.slot('ui', 50, planks(4, 6))
      openScreen(server, 2, 'inventory')
      await driver.tick()
      const responder = new Responder(testBot, 7)
      for (const [container, slot, count, stackId] of [['hotbar', 0, 10, 1], ['inventory', 9, 64, 2], ['inventory', 10, 30, 3], ['hotbar', 1, 20, 5]] as const) responder.holds(container, slot, count, stackId)
      const sent = sentSince(server)
      await click(testBot, responder, 36, 0, 6)
      await click(testBot, responder, 36, 0, 0)
      for (const slot of [9, OUTSIDE]) await click(testBot, responder, slot, 0, 6)
      const none = sent()
      await click(testBot, responder, 36, 0, 6)
      const batch = server.sentOf('item_stack_request').at(-1)?.requests.length
      // a full cursor
      await click(testBot, responder, 36, 0, 6)
      assert.deepStrictEqual([none, sent(), batch, bot.inventory.selectedItem?.count, errors], [['-3 take 10 hotbar:0#1 → cursor:0#0'], [
        '-5 take 30 inventory:10#3 → cursor:0#1', '-7 take 20 hotbar:1#5 → cursor:0#-5', '-9 take 4 inventory:9#2 → cursor:0#-7'
      ], 3, 64, []])
      bot.end()
    })

    it('rejects the creative middle drag (buttons 8 – 10) and a double click of the right button', async () => {
      const { bot, server, driver, errors } = await dragBot(version)
      openScreen(server, 2, 'inventory')
      await driver.tick()
      await assert.rejects(bot.clickWindow(OUTSIDE, 8, 5), { message: 'clickWindow does not support mode 5 with mouse button 8 on Bedrock' })
      await assert.rejects(bot.clickWindow(9, 1, 6), { message: 'clickWindow does not support mode 6 with mouse button 1 on Bedrock' })
      assert.deepStrictEqual(errors, [])
      bot.end()
    })
  })
})
