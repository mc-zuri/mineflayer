import prismarineItem from 'prismarine-item'
import type { Item } from 'prismarine-item'
import prismarineWindows from 'prismarine-windows'
import type { Window } from 'prismarine-windows'
import type { BedrockCore } from '../core/core.ts'
import type { FrameContext, Ns, OutboxWriter } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import { swingArm } from './block_use.ts'
import type { BedrockVersion, StorageEvents } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets, BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import { clickMoves, HOTBAR_AND_INVENTORY, isSupportedClick, placesFor } from './clicks.ts'
import type { ClickedSlots, WindowClick } from './clicks.ts'
import { consumeAction, dropAction, heldItemOf, itemOf, moveAction, readResponses, readStack, sameItem, sameKind, slotInfo, stackRequest, swapAction, withCount } from './items.ts'
import type { ContainerName, ResponseSlot, SlotRef, Stack, StackRequest, StackResponse } from './items.ts'

type StackAction = StackRequest['actions'][number]

const OWNER = 'inventory'
const MS = 1_000_000
const RESPONSE_TICKS = 100
// recorded: 124 to 144 ms after container_open
const OPTIONS_DELAY: Ns = 120 * MS
// recorded at 32 and 16 frames a second: about 228 to 241 ms and 386 to 398 ms
const ANIMATIONS: Readonly<Record<ScreenType, Ns>> = Object.freeze({ inventory: 240 * MS, workbench: 390 * MS })
// what a component item without max_stack_size stacks to
const DEFAULT_STACK_SIZE = 64
const HOTBAR_START = 36
const OFFHAND = 'offhand:1'
const OUTSIDE = -999

/** a slot of the bot's containers: `inventory:0` – `inventory:35`, `armor:0` – `armor:3`, `offhand:1`, `ui:<slot>` */
type Key = string

export type ScreenType = 'inventory' | 'workbench'

const STORES: Readonly<Record<ContainerName, string>> = Object.freeze({
  hotbar_and_inventory: 'inventory',
  hotbar: 'inventory',
  inventory: 'inventory',
  armor: 'armor',
  offhand: 'offhand',
  cursor: 'ui',
  crafting_input: 'ui',
  creative_output: 'ui'
})

// the offhand's one item is a request's slot 1
const WINDOWS: Readonly<Record<string, readonly [store: string, first: number]>> = Object.freeze({
  inventory: Object.freeze(['inventory', 0] as const),
  armor: Object.freeze(['armor', 0] as const),
  offhand: Object.freeze(['offhand', 1] as const),
  ui: Object.freeze(['ui', 0] as const)
})

function keysOf (store: string, from: number, to: number): Key[] {
  return Array.from({ length: to - from + 1 }, (_, index) => `${store}:${from + index}`)
}

/** Java's window layouts, by the slot each window slot shows */
const INVENTORY_VIEW: readonly Key[] = Object.freeze(['ui:50', ...keysOf('ui', 28, 31), ...keysOf('armor', 0, 3), ...keysOf('inventory', 9, 35), ...keysOf('inventory', 0, 8), OFFHAND])
const CRAFTING_TABLE_VIEW: readonly Key[] = Object.freeze(['ui:50', ...keysOf('ui', 32, 40), ...keysOf('inventory', 9, 35), ...keysOf('inventory', 0, 8)])

const CURSOR: SlotRef = Object.freeze({ container: 'cursor', slot: 0 })
const OUTPUT_KEY = 'ui:50'
const INVENTORY_GRID: readonly SlotRef[] = Object.freeze([28, 29, 30, 31].map(slot => Object.freeze({ container: 'crafting_input', slot })))
const TABLE_GRID: readonly SlotRef[] = Object.freeze([32, 33, 34, 35, 36, 37, 38, 39, 40].map(slot => Object.freeze({ container: 'crafting_input', slot })))

function keyOf ({ container, slot }: SlotRef): Key {
  return `${STORES[container]}:${slot}`
}

/** a window slot as a click's request names it */
function clickedRefOf (key: Key): SlotRef {
  const [store, slotName] = key.split(':')
  const slot = Number(slotName)
  if (store === 'inventory') return { container: slot < 9 ? 'hotbar' : 'inventory', slot }
  if (store === 'ui') return { container: slot === 50 ? 'creative_output' : 'crafting_input', slot }
  return { container: store === 'armor' ? 'armor' : 'offhand', slot }
}

function isContainerName (name: string): name is ContainerName {
  return Object.hasOwn(STORES, name)
}

function responseKeyOf ({ container, slot }: ResponseSlot): Key | undefined {
  return isContainerName(container) ? keyOf({ container, slot }) : undefined
}

function changeOf (before: Stack | undefined, after: Stack | undefined): 'item' | 'other' | undefined {
  if (before === undefined || after === undefined) return before === after ? undefined : 'item'
  if (!sameKind(before, after)) return 'item'
  return sameItem(before, after) && before.count === after.count ? undefined : 'other'
}

/** the crafting grid of each screen, row by row */
export const GRIDS: Readonly<Record<ScreenType, readonly SlotRef[]>> = Object.freeze({ inventory: INVENTORY_GRID, workbench: TABLE_GRID })

/** the stack a move takes `count` of, and what it leaves */
function takenFrom (count: number, from: SlotRef, source: Stack | undefined): [Stack, Stack | undefined] {
  if (source === undefined || source.count < count) throw new Error(`${from.container} ${from.slot} has not ${count} items`)
  return [source, source.count === count ? undefined : withCount(source, source.count - count)]
}

/** what a move leaves in the slots it changes, each as it was before any; a new stack is named by the request's id */
function changesOf (move: Move, stackAt: (key: Key) => Stack | undefined, requestId: number): Array<[Key, Stack | undefined]> {
  if (move.type === 'action') return move.output === undefined ? [] : [[OUTPUT_KEY, move.output]]
  const fromKey = keyOf(move.from)
  if (move.type === 'drop' || move.type === 'consume') return [[fromKey, takenFrom(move.count, move.from, stackAt(fromKey))[1]]]
  const toKey = keyOf(move.to)
  const destination = stackAt(toKey)
  if (move.type === 'swap') return [[fromKey, destination], [toKey, stackAt(fromKey)]]
  const [source, left] = takenFrom(move.count, move.from, stackAt(fromKey))
  if (destination === undefined) return [[fromKey, left], [toKey, { ...withCount(source, move.count), stackId: requestId }]]
  if (!sameItem(source, destination)) throw new Error(`${move.to.container} ${move.to.slot} holds another item`)
  return [[fromKey, left], [toKey, withCount(destination, destination.count + move.count)]]
}

/** WindowID names the dynamic ids 1 and 100 first and last */
function windowIdOf (id: BedrockClientboundPackets['container_open']['window_id']): number {
  if (id === 'first') return 1
  if (id === 'last') return 100
  return Number(id)
}

/** prismarine-windows' updateSlot empties a slot given null, which its typings do not take */
function showSlot (window: Window, slot: number, item: Item | null): void {
  Reflect.apply(window.updateSlot, window, [slot, item])
}

/** prismarine-windows' loader takes a registry, which its typings do not: the windows' items are then the bot's */
function windowsOf (registry: BedrockBotInternal['registry']): ReturnType<typeof prismarineWindows> {
  return Reflect.apply(prismarineWindows, undefined, [registry])
}

/** `action` writes an action that names no slot, after which the created output holds `output`, if given */
export type Move =
  | { readonly type: 'take' | 'place', readonly count: number, readonly from: SlotRef, readonly to: SlotRef }
  | { readonly type: 'swap', readonly from: SlotRef, readonly to: SlotRef }
  | { readonly type: 'drop', readonly count: number, readonly from: SlotRef }
  | { readonly type: 'consume', readonly count: number, readonly from: SlotRef }
  | { readonly type: 'action', readonly action: StackAction, readonly output?: Stack | undefined }

/** the slots as moves made so far would leave them, on top of the bot's */
export class Draft implements Pick<ClickedSlots, 'stackAt' | 'stackSize'> {
  private readonly planned = new Map<Key, Stack | undefined>()
  private readonly base: (key: Key) => Stack | undefined
  private readonly sizes: Pick<ClickedSlots, 'stackSize'>

  constructor (base: (key: Key) => Stack | undefined, sizes: Pick<ClickedSlots, 'stackSize'>) {
    this.base = base
    this.sizes = sizes
  }

  stackAt (ref: SlotRef): Stack | undefined {
    return this.at(keyOf(ref))
  }

  stackSize (stack: Stack): number {
    return this.sizes.stackSize(stack)
  }

  /** throws where the slots cannot make a move */
  apply (moves: readonly Move[]): void {
    for (const move of moves) for (const [key, stack] of changesOf(move, key => this.at(key), 0)) this.planned.set(key, stack)
  }

  private at (key: Key): Stack | undefined {
    return this.planned.has(key) ? this.planned.get(key) : this.base(key)
  }
}

interface PendingRequest {
  readonly id: number
  /** each slot the request's moves changed, as it was before, until the server sends it */
  readonly before: Map<Key, Stack | undefined>
  response: StackResponse | undefined
}

interface Screen {
  readonly id: BedrockClientboundPackets['container_open']['window_id']
  readonly type: ScreenType
  readonly window: Window
  readonly view: readonly Key[]
}

export interface InventorySettings {
  readonly screenAnimations: boolean
}

/** from 1.26.60 the vanilla client brackets a click placing from the cursor: when its request left */
interface CursorDrag {
  leftAt: Ns | undefined
}

/** a click on a crafting output, made in an input pass: the crafting plugin's */
export type OutputClick = (ctx: FrameContext, click: WindowClick, screen: ScreenType) => Promise<void>

interface Closing {
  readonly screen: Screen
  /** when the screen's animation ends, set by the input pass that asked the close, which handed the items back */
  end: Ns | undefined
  ended: boolean
  sent: boolean
  readonly done: Promise<void>
}

/** The player's items as the server sends them and the bot's requests predict them, shown in Java's windows. */
export class Inventory {
  quickBarSlot = 0
  /** with none, a click on a crafting output sends nothing */
  outputClick: OutputClick | undefined
  readonly stats = { otherWindows: 0, otherScreens: 0, unknownResponses: 0 }
  readonly window: Window<StorageEvents>
  private readonly bot: BedrockBotInternal
  private readonly settings: InventorySettings
  private readonly Item: typeof Item
  private readonly Window: ReturnType<typeof prismarineWindows>['Window']
  private readonly slots = new Map<Key, Stack>()
  /** in the order they were made: the last that changed a slot names it */
  private pending: PendingRequest[] = []
  private queued: StackRequest[] = []
  /** the frame's responses, taken in after its input: a click in the frame a response came in names the slots by the request, as the vanilla client's */
  private answers: StackResponse[] = []
  private screen: Screen | undefined
  private closing: Closing | undefined
  private runtimeId: bigint | undefined
  private equipmentChanged = true
  /** undefined until the player is first shown */
  private equipped: { main: Stack | undefined, offhand: Stack | undefined } | undefined
  private readonly screensOpened = new Set<ScreenType>()
  private readonly screensTold = new Set<ScreenType>()
  private optionsDue: Array<{ readonly type: ScreenType, readonly at: Ns }> = []
  private cursorDrag: CursorDrag | undefined
  private readonly clickedSlots: ClickedSlots = {
    stackAt: ref => this.stackAt(ref),
    stackSize: ({ networkId }) => this.bot.registry.items[networkId]?.stackSize ?? DEFAULT_STACK_SIZE,
    enchantCategories: ({ networkId }) => this.bot.registry.items[networkId]?.enchantCategories ?? [],
    itemName: ({ networkId }) => this.bot.registry.items[networkId]?.name
  }

  constructor (bot: BedrockBotInternal, settings: InventorySettings) {
    this.bot = bot
    this.settings = settings
    this.Item = prismarineItem(bot.registry)
    this.Window = windowsOf(bot.registry).Window
    this.window = new this.Window<StorageEvents>(0, 'minecraft:inventory', 'Inventory', INVENTORY_VIEW.length, { start: 9, end: 44 }, 0, true)
  }

  install (core: BedrockCore): void {
    const { bot } = this
    bot.inventory = this.window
    Object.defineProperties(bot, {
      currentWindow: { get: () => this.screen?.window ?? null },
      heldItem: { get: () => this.window.slots[HOTBAR_START + this.quickBarSlot] ?? null },
      quickBarSlot: { get: () => this.quickBarSlot }
    })
    bot.openInventory = async () => await this.openInventory(core)
    bot.closeWindow = async window => { await this.closeWindow(core, window) }
    bot.clickWindow = async (slot, mouseButton, mode) => { await this.clickWindow(core, { slot, mouseButton, mode }) }
    this.window.on('updateSlot', (slot, _oldItem, newItem) => {
      if (slot === HOTBAR_START + this.quickBarSlot) core.emit(bot, 'heldItemChanged', newItem)
    })
    core.observe(OWNER, 'start_game', packet => { this.runtimeId = packet.runtime_entity_id })
    core.handle(OWNER, 'item_registry', packet => {
      const registry = bot.registry
      // a Bedrock version's registry, though prismarine-registry's typings give either edition's
      if ('handleItemRegistry' in registry) registry.handleItemRegistry(packet)
    })
    core.handle(OWNER, 'inventory_content', packet => {
      // 1.16.201 names it inventory_id
      const where = WINDOWS[String(packet.window_id ?? packet.inventory_id)]
      if (where === undefined) {
        this.stats.otherWindows++
        return
      }
      packet.input.forEach((item, index) => { this.receive(`${where[0]}:${where[1] + index}`, readStack(item)) })
      this.equipmentChanged = true
    })
    core.handle(OWNER, 'inventory_slot', packet => {
      const where = WINDOWS[String(packet.window_id)]
      if (where === undefined) {
        this.stats.otherWindows++
        return
      }
      this.receive(`${where[0]}:${where[1] + packet.slot}`, readStack(packet.item))
      this.equipmentChanged = true
    })
    core.handle(OWNER, 'player_hotbar', packet => {
      if (!packet.select_slot || packet.selected_slot === this.quickBarSlot) return
      this.quickBarSlot = packet.selected_slot
      core.emit(bot, 'heldItemChanged', bot.heldItem)
      this.equipmentChanged = true
    })
    core.handle(OWNER, 'item_stack_response', packet => { this.answers.push(...readResponses(packet.responses)) })
    core.handle(OWNER, 'container_open', (packet, ctx) => { this.open(core, packet, ctx.now) })
    core.handle(OWNER, 'container_close', packet => {
      const { screen } = this
      if (screen === undefined || packet.window_id !== screen.id) return
      this.screen = undefined
      this.closing = undefined
      core.emit(bot, 'windowClose', screen.window)
    })
    core.inputPass(OWNER, ctx => {
      this.takeAnswers()
      this.send(ctx)
    })
    // up to 1.19.0 after the tick's auth input, from 1.19.10 before it
    const place = this.atLeast('bedrock_1.19.10') ? { at: 'ActorLegacyTickSystem' as const } : { after: 'lifecycle.hold' }
    core.system(OWNER, { name: 'inventory.equip', place, gate: 'present', replay: false, run: ({ outbox }) => { this.equip(outbox) } })
    core.system(OWNER, { name: 'inventory.request', place: { after: 'inventory.equip' }, gate: 'always', replay: false, run: ({ outbox, now }) => { this.sendRequests(outbox, now) } })
  }

  /** the stack in the selected hotbar slot */
  mainHand (): Stack | undefined {
    return this.slots.get(`inventory:${this.quickBarSlot}`)
  }

  /** the open screen that can still be clicked: none once its close handed the items back */
  get screenType (): ScreenType | undefined {
    return this.closing?.end === undefined ? this.screen?.type : undefined
  }

  /** the slots as the bot predicts them, for moves to be planned on */
  draft (): Draft {
    return new Draft(key => this.slots.get(key), this.clickedSlots)
  }

  stackAt (ref: SlotRef): Stack | undefined {
    return this.slots.get(keyOf(ref))
  }

  /** made in an input pass, it names its slots and predicts its moves at once, as the vanilla client does; the arm swings for each drop, in the pass */
  async request (core: BedrockCore, { outbox }: FrameContext, moves: readonly Move[]): Promise<void> {
    this.check(moves)
    const { runtimeId } = this
    if (runtimeId !== undefined) for (const move of moves) if (move.type === 'drop') outbox.queue('animate', swingArm(this.bot.version, runtimeId, 'dropitem'))
    const request: PendingRequest = { id: core.requestIds.nextStackRequest(), before: new Map(), response: undefined }
    this.pending.push(request)
    const actions = moves.map(move => {
      const action = this.actionOf(move)
      this.predict(request, move)
      return action
    })
    this.queued.push(stackRequest(this.bot.version, request.id, actions))
    try {
      await core.waits.until(() => request.response !== undefined, RESPONSE_TICKS, `the server did not answer item stack request ${request.id} in ${RESPONSE_TICKS} ticks`)
    } catch (error) {
      // undone, so that it names and tells no slot; an answer coming after is unknown
      this.conclude(request, { requestId: request.id, ok: false, status: 'unanswered', slots: [] })
      throw error
    }
    if (request.response?.ok !== true) throw new Error(`the server refused item stack request ${request.id}: ${request.response?.status}`)
  }

  /** a click names its slots in the input pass it is made in, and its request leaves in the next tick, as the vanilla client's */
  private async clickWindow (core: BedrockCore, click: WindowClick): Promise<void> {
    if (!isSupportedClick(click)) throw new Error(`clickWindow does not support mode ${click.mode} with mouse button ${click.mouseButton} on Bedrock`)
    await core.call(async ctx => { await this.click(core, ctx, click) })
  }

  private async click (core: BedrockCore, ctx: FrameContext, click: WindowClick): Promise<void> {
    const { screen } = this
    if (screen === undefined) throw new Error('clickWindow needs an open window: on Bedrock the inventory too is a screen (bot.openInventory())')
    if (this.screenType === undefined) throw new Error(`the ${screen.window.type} window is closing`)
    const key = screen.view[click.slot]
    if (key === undefined && click.slot !== OUTSIDE) throw new Error(`the ${screen.window.type} window has no slot ${click.slot}`)
    const clicked = key === undefined ? undefined : clickedRefOf(key)
    if (clicked?.container === 'creative_output' && click.mode !== 4) return await this.outputClick?.(ctx, click, screen.type)
    const moves = clickMoves(click, clicked, this.clickedSlots)
    if (moves.length === 0) return
    const dragged = click.mode === 0 && this.atLeast('bedrock_1.26.60') && moves.some(move => move.type === 'place' && move.from.container === 'cursor')
    if (dragged) this.startCursorDrag(ctx)
    await this.request(core, ctx, moves)
  }

  private startCursorDrag (ctx: FrameContext): void {
    this.stopCursorDrag(ctx)
    if (this.cursorDrag !== undefined) return
    ctx.outbox.queue('serverbound_cursor_item_drag', { state: 'start' })
    this.cursorDrag = { leftAt: undefined }
  }

  /** the vanilla client ends the drag in the input pass of the frame after its request left */
  private stopCursorDrag ({ outbox }: FrameContext): void {
    if (this.cursorDrag?.leftAt === undefined) return
    outbox.queue('serverbound_cursor_item_drag', { state: 'stop' })
    this.cursorDrag = undefined
  }

  private async openInventory (core: BedrockCore): Promise<Window> {
    // the inventory being closed opens again once the server closed it, as the vanilla client's
    if (this.closing !== undefined) await this.closing.done.catch(() => {})
    const { screen, runtimeId } = this
    if (screen?.type === 'inventory') return this.window
    if (screen !== undefined) throw new Error(`the inventory cannot open over the ${screen.window.type} window`)
    if (runtimeId === undefined) throw new Error('the inventory cannot open before start_game')
    core.command(({ outbox }) => { outbox.queue('interact', this.interact('open_inventory', runtimeId)) })
    await core.waits.until(() => this.screen?.type === 'inventory', RESPONSE_TICKS, `the server did not open the inventory in ${RESPONSE_TICKS} ticks`)
    return this.window
  }

  private async closeWindow (core: BedrockCore, window: Window): Promise<void> {
    const { screen } = this
    if (screen?.window !== window) return
    this.closing ??= this.close(core, screen)
    await this.closing.done
  }

  private close (core: BedrockCore, screen: Screen): Closing {
    let handedBack: Promise<unknown> = Promise.resolve()
    const closed = core.waits.until(() => this.screen !== screen, RESPONSE_TICKS, `the server did not close the ${screen.type} screen in ${RESPONSE_TICKS} ticks`)
    const closing: Closing = {
      screen,
      end: undefined,
      ended: false,
      sent: false,
      // a close the server never answers does not hold back the next
      done: closed.finally(() => { if (this.closing === closing) this.closing = undefined }).then(async () => { await handedBack })
    }
    core.command(ctx => {
      // the server closed it first, and gives the items back itself
      if (this.screen !== screen) return
      handedBack = Promise.all(this.handBack(core, ctx, screen))
      // awaited once the screen closed: a refusal before then is not unhandled
      handedBack.catch(() => {})
      const animated = this.atLeast('bedrock_1.21.120') && this.settings.screenAnimations
      closing.end = animated ? ctx.now + ANIMATIONS[screen.type] : ctx.now
      closing.ended = !animated
    })
    return closing
  }

  /** the inventory screen's grid goes back before the cursor, another screen's after it, as the vanilla client does; what has no room is dropped, a request a slot */
  private handBack (core: BedrockCore, ctx: FrameContext, screen: Screen): Array<Promise<void>> {
    const sources = screen.type === 'inventory' ? [...INVENTORY_GRID, CURSOR] : [CURSOR, ...TABLE_GRID]
    const requests: Array<Promise<void>> = []
    for (const from of sources) {
      const stack = this.stackAt(from)
      if (stack === undefined) continue
      let left = stack.count
      for (const { to, count } of placesFor(stack, HOTBAR_AND_INVENTORY, this.clickedSlots)) {
        requests.push(this.request(core, ctx, [{ type: 'place', count, from, to }]))
        left -= count
      }
      if (left > 0) requests.push(this.request(core, ctx, [{ type: 'drop', count: left, from }]))
    }
    return requests
  }

  private open (core: BedrockCore, packet: BedrockClientboundPackets['container_open'], now: Ns): void {
    const type = packet.window_type
    if (type !== 'inventory' && type !== 'workbench') {
      this.stats.otherScreens++
      return
    }
    const screen: Screen = type === 'inventory'
      ? { id: packet.window_id, type, window: this.window, view: INVENTORY_VIEW }
      : { id: packet.window_id, type, window: new this.Window(windowIdOf(packet.window_id), 'minecraft:crafting_table', 'Crafting', CRAFTING_TABLE_VIEW.length, { start: 10, end: 45 }, 0, true), view: CRAFTING_TABLE_VIEW }
    if (screen.window !== this.window) this.showAll(screen)
    this.screen = screen
    this.screensOpened.add(type)
    // 1.20.50 – 1.21.101: once a client process, a screen's first opening tells the server the screens opened so far
    if (this.atLeast('bedrock_1.20.50') && !this.atLeast('bedrock_1.21.111') && core.requestIds.freshProcess && !this.screensTold.has(type)) {
      this.screensTold.add(type)
      this.optionsDue.push({ type, at: now + OPTIONS_DELAY })
    }
    core.emit(this.bot, 'windowOpen', screen.window)
  }

  private send (ctx: FrameContext): void {
    const { now, outbox } = ctx
    this.stopCursorDrag(ctx)
    for (const due of this.optionsDue.filter(({ at }) => at <= now)) {
      outbox.queue('set_player_inventory_options', {
        left_tab: 'search',
        right_tab: 'crafting',
        filtering: false,
        layout: this.screensOpened.has('inventory') ? 'recipe_book' : 'none',
        crafting_layout: this.screensOpened.has('workbench') ? 'recipe_book' : 'none'
      })
      this.optionsDue = this.optionsDue.filter(other => other !== due)
    }
    const { closing } = this
    if (closing === undefined || closing.sent || closing.end === undefined || now < closing.end) return
    // the vanilla client closes the screen in the frame after its animation ended
    if (!closing.ended) {
      closing.ended = true
      return
    }
    this.sendRequests(outbox, now)
    closing.sent = true
    const close = this.atLeast('bedrock_1.21.0') ? { window_id: closing.screen.id, window_type: 'none' as const, server: false } : { window_id: closing.screen.id, server: false }
    outbox.queue('container_close', close)
  }

  private sendRequests (outbox: OutboxWriter, now: Ns): void {
    if (this.queued.length === 0) return
    // the drag's request leaves with the requests queued before it
    if (this.cursorDrag !== undefined) this.cursorDrag.leftAt = now
    outbox.queue('item_stack_request', { requests: this.queued })
    this.queued = []
  }

  /** the vanilla client tells a new item in the hand, as when first shown, with the entity under the cursor: none */
  private equip (outbox: OutboxWriter): void {
    const { runtimeId, equipped } = this
    if (!this.equipmentChanged || runtimeId === undefined) return
    this.equipmentChanged = false
    const main = this.confirmed(`inventory:${this.quickBarSlot}`)
    const offhand = this.confirmed(OFFHAND)
    const mainChange = equipped === undefined ? 'item' : changeOf(equipped.main, main)
    const offhandChange = changeOf(equipped?.offhand, offhand)
    this.equipped = { main, offhand }
    if (mainChange === 'item') outbox.queue('interact', this.interact('mouse_over_entity', 0n))
    if (mainChange !== undefined && (equipped !== undefined || main !== undefined)) outbox.queue('mob_equipment', this.mobEquipment(runtimeId, main, this.quickBarSlot, this.quickBarSlot, 'inventory'))
    if (offhandChange !== undefined) outbox.queue('mob_equipment', this.mobEquipment(runtimeId, offhand, 1, 0, 'offhand'))
  }

  /** the slot as the server last told it: what the first request still unanswered that changed it found there */
  private confirmed (key: Key): Stack | undefined {
    const request = this.pending.find(pending => pending.before.has(key))
    return request === undefined ? this.slots.get(key) : request.before.get(key)
  }

  private takeAnswers (): void {
    if (this.answers.length === 0) return
    for (const response of this.answers) this.answer(response)
    this.answers = []
    this.equipmentChanged = true
  }

  private answer (response: StackResponse): void {
    const request = this.pending.find(pending => pending.id === response.requestId)
    if (request === undefined) {
      this.stats.unknownResponses++
      return
    }
    // the server answers in request order: one still unanswered before it was skipped
    for (const skipped of this.pending.slice(0, this.pending.indexOf(request))) this.conclude(skipped, { requestId: skipped.id, ok: false, status: `skipped by the answer to ${request.id}`, slots: [] })
    this.conclude(request, response)
  }

  private conclude (request: PendingRequest, response: StackResponse): void {
    const index = this.pending.indexOf(request)
    const later = this.pending.slice(index + 1)
    // a slot a later request changed shows that request's prediction: what it changed it from is settled instead
    const settle = (key: Key, settled: (stack: Stack | undefined) => Stack | undefined): void => {
      const next = later.find(other => other.before.has(key))
      if (next === undefined) this.set(key, settled(this.slots.get(key)))
      else next.before.set(key, settled(next.before.get(key)))
    }
    const listed = new Set<Key>()
    if (response.ok) {
      for (const slot of response.slots) {
        const key = responseKeyOf(slot)
        if (key === undefined) continue
        listed.add(key)
        // a response never makes an item: it counts and numbers those the request moved
        settle(key, stack => slot.count === 0 || stack === undefined ? undefined : { ...withCount(stack, slot.count), stackId: slot.stackId })
      }
    }
    for (const [key, before] of request.before) if (!listed.has(key)) settle(key, () => before)
    request.response = response
    this.pending.splice(index, 1)
  }

  /** throws before a request takes an id: as well once a close handed the items back, the vanilla client's screen being gone */
  private check (moves: readonly Move[]): void {
    const { screen } = this
    if (screen !== undefined && this.screenType === undefined) throw new Error(`the ${screen.window.type} window is closing`)
    this.draft().apply(moves)
  }

  private predict (request: PendingRequest, move: Move): void {
    for (const [key, stack] of changesOf(move, key => this.slots.get(key), request.id)) {
      if (!request.before.has(key)) request.before.set(key, this.slots.get(key))
      this.set(key, stack)
    }
  }

  /** names its slots as they are before the move */
  private actionOf (move: Move): StackAction {
    const { version } = this.bot
    if (move.type === 'action') return move.action
    const source = slotInfo(version, move.from, this.nameOf(move.from))
    if (move.type === 'drop') return dropAction(version, move.count, source)
    if (move.type === 'consume') return consumeAction(version, move.count, source)
    const destination = slotInfo(version, move.to, this.nameOf(move.to))
    if (move.type === 'swap') return swapAction(version, source, destination)
    return moveAction(version, move.type, move.count, source, destination)
  }

  private nameOf (ref: SlotRef): number {
    const key = keyOf(ref)
    return this.pending.findLast(request => request.before.has(key))?.id ?? this.slots.get(key)?.stackId ?? 0
  }

  /** the server's state now, which no pending request puts back */
  private receive (key: Key, stack: Stack | undefined): void {
    for (const request of this.pending) request.before.delete(key)
    this.set(key, stack)
  }

  private set (key: Key, stack: Stack | undefined): void {
    if (stack === undefined) this.slots.delete(key)
    else this.slots.set(key, stack)
    const item = itemOf(this.Item, stack)
    if (key === 'ui:0') {
      this.window.selectedItem = item
      if (this.screen !== undefined) this.screen.window.selectedItem = item
    }
    this.show(this.window, INVENTORY_VIEW, key, item)
    if (this.screen !== undefined && this.screen.window !== this.window) this.show(this.screen.window, this.screen.view, key, item)
  }

  private show (window: Window, view: readonly Key[], key: Key, item: Item | null): void {
    const slot = view.indexOf(key)
    if (slot >= 0) showSlot(window, slot, item)
  }

  private showAll ({ window, view }: Screen): void {
    view.forEach((key, slot) => { showSlot(window, slot, itemOf(this.Item, this.slots.get(key))) })
    window.selectedItem = itemOf(this.Item, this.slots.get('ui:0'))
  }

  private interact (action: 'mouse_over_entity' | 'open_inventory', target: bigint): BedrockServerboundPackets['interact'] {
    const position = action === 'mouse_over_entity' ? { position: { x: 0, y: 0, z: 0 } } : {}
    if (!this.atLeast('bedrock_1.16.210')) return { action_id: action, target_runtime_entity_id: Number(target), ...position }
    if (!this.atLeast('bedrock_1.21.130')) return { action_id: action, target_entity_id: target, ...position }
    return { action_id: action, target_entity_id: target, has_position: false }
  }

  private mobEquipment (runtimeId: bigint, stack: Stack | undefined, slot: number, selectedSlot: number, window: 'inventory' | 'offhand'): BedrockServerboundPackets['mob_equipment'] {
    const item = heldItemOf(this.bot.version, stack)
    if (!this.atLeast('bedrock_1.16.210')) return { runtime_entity_id: Number(runtimeId), item, slot, selected_slot: selectedSlot, windows_id: window }
    return { runtime_entity_id: runtimeId, item, slot, selected_slot: selectedSlot, window_id: window }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}
