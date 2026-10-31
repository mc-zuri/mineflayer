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
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import { INVENTORY_LAYOUT, INVENTORY_SCREEN } from '../screens/inventory.ts'
import { WORKBENCH_SCREEN } from '../screens/workbench.ts'
import { clickMoves, defaultShiftTargets, HOTBAR_AND_INVENTORY, isSupportedClick, placesFor } from './clicks.ts'
import type { ClickedSlots, WindowClick } from './clicks.ts'
import { consumeAction, destroyAction, dropAction, heldItemOf, itemOf, moveAction, readResponses, readStack, sameItem, sameKind, slotInfo, stackRequest, swapAction, withCount } from './items.ts'
import type { RequestText, ResponseSlot, SlotRef, Stack, StackRequest, StackResponse } from './items.ts'
import { OUTPUT, PLAYER_SLOTS, Screens } from './screens.ts'
import type { Defined, OpenScreen, ScreenDefinition, ScreenHooks, ScreenLayout, ScreenOpening, WindowId, WindowType, WindowTypeName } from './screens.ts'

type StackAction = StackRequest['actions'][number]

const OWNER = 'inventory'
const MS = 1_000_000
const RESPONSE_TICKS = 100
// recorded: 124 to 144 ms after container_open
const OPTIONS_DELAY: Ns = 120 * MS
// recorded at 32 and 16 frames a second: about 228 to 241 ms and 386 to 398 ms
const ANIMATIONS: Readonly<Record<ScreenDefinition['animation'], Ns>> = Object.freeze({ inventory: 240 * MS, workbench: 390 * MS, none: 0 })
// what a component item without max_stack_size stacks to
const DEFAULT_STACK_SIZE = 64
const HOTBAR_START = 36
const OFFHAND = 'offhand:1'
const OUTSIDE = -999

/** a slot of the bot's containers: `inventory:0` – `inventory:35`, `armor:0` – `armor:3`, `offhand:1`, `ui:<slot>`, `open:<slot>` (the open screen's own window) */
type Key = string

type Where = readonly [store: string, first: number]

// the offhand's one item is a request's slot 1
const WINDOWS: Readonly<Record<string, Where>> = Object.freeze({
  inventory: Object.freeze(['inventory', 0] as const),
  armor: Object.freeze(['armor', 0] as const),
  offhand: Object.freeze(['offhand', 1] as const),
  ui: Object.freeze(['ui', 0] as const)
})
const OWN: Where = Object.freeze(['open', 0] as const)

/** Java's window of a layout, by the slot each of its slots shows */
function viewOf ({ slots, after = [] }: ScreenLayout): readonly SlotRef[] {
  return [...slots, ...PLAYER_SLOTS, ...after]
}

function ownsWindow ({ containers }: ScreenDefinition): boolean {
  return Object.values(containers).includes('open')
}

/** a click on an output is its feature's to make */
function isOutput (clicked: SlotRef | undefined, { mode }: WindowClick): boolean {
  return clicked?.container === OUTPUT.container && mode !== 4
}

function changeOf (before: Stack | undefined, after: Stack | undefined): 'item' | 'other' | undefined {
  if (before === undefined || after === undefined) return before === after ? undefined : 'item'
  if (!sameKind(before, after)) return 'item'
  return sameItem(before, after) && before.count === after.count ? undefined : 'other'
}

/** the stack a move takes `count` of, and what it leaves */
function takenFrom (count: number, from: SlotRef, source: Stack | undefined): [Stack, Stack | undefined] {
  if (source === undefined || source.count < count) throw new Error(`${from.container} ${from.slot} has not ${count} items`)
  return [source, source.count === count ? undefined : withCount(source, source.count - count)]
}

/** what a move leaves in the slots it changes, each as it was before any; a new stack is named by the request's id */
function changesOf (move: Move, stackAt: (key: Key) => Stack | undefined, keyOf: (ref: SlotRef) => Key, requestId: number): Array<[Key, Stack | undefined]> {
  if (move.type === 'action') return move.output === undefined ? [] : [[keyOf(OUTPUT), move.output]]
  const fromKey = keyOf(move.from)
  if (move.type === 'drop' || move.type === 'consume' || move.type === 'destroy') return [[fromKey, takenFrom(move.count, move.from, stackAt(fromKey))[1]]]
  const toKey = keyOf(move.to)
  const destination = stackAt(toKey)
  if (move.type === 'swap') return [[fromKey, destination], [toKey, stackAt(fromKey)]]
  const [source, left] = takenFrom(move.count, move.from, stackAt(fromKey))
  if (destination === undefined) return [[fromKey, left], [toKey, { ...withCount(source, move.count), stackId: requestId }]]
  if (!sameItem(source, destination)) throw new Error(`${move.to.container} ${move.to.slot} holds another item`)
  return [[fromKey, left], [toKey, withCount(destination, destination.count + move.count)]]
}

/** WindowID names the dynamic ids 1 and 100 first and last */
function windowIdOf (id: WindowId): number {
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

/** `action` writes an action that names no slot, after which the created output holds `output`, if given; `destroy` is a drop without the swing */
export type Move =
  | { readonly type: 'take' | 'place', readonly count: number, readonly from: SlotRef, readonly to: SlotRef }
  | { readonly type: 'swap', readonly from: SlotRef, readonly to: SlotRef }
  | { readonly type: 'drop', readonly count: number, readonly from: SlotRef }
  | { readonly type: 'consume', readonly count: number, readonly from: SlotRef }
  | { readonly type: 'destroy', readonly count: number, readonly from: SlotRef }
  | { readonly type: 'action', readonly action: StackAction, readonly output?: Stack | undefined }

/** the slots as moves made so far would leave them, on top of the bot's, with the rules of the screen open when it was made */
export class Draft implements ClickedSlots {
  private readonly planned = new Map<Key, Stack | undefined>()
  private readonly base: (key: Key) => Stack | undefined
  private readonly keyOf: (ref: SlotRef) => Key
  private readonly rules: Omit<ClickedSlots, 'stackAt'>

  constructor (base: (key: Key) => Stack | undefined, keyOf: (ref: SlotRef) => Key, rules: Omit<ClickedSlots, 'stackAt'>) {
    this.base = base
    this.keyOf = keyOf
    this.rules = rules
  }

  stackAt (ref: SlotRef): Stack | undefined {
    return this.at(this.keyOf(ref))
  }

  stackSize (stack: Stack): number {
    return this.rules.stackSize(stack)
  }

  enchantCategories (stack: Stack): readonly string[] {
    return this.rules.enchantCategories(stack)
  }

  itemName (stack: Stack): string | undefined {
    return this.rules.itemName(stack)
  }

  shiftTargets (from: SlotRef, stack: Stack): readonly SlotRef[] {
    return this.rules.shiftTargets(from, stack)
  }

  accepts (to: SlotRef, stack: Stack): boolean | undefined {
    return this.rules.accepts(to, stack)
  }

  /** throws where the slots cannot make a move */
  apply (moves: readonly Move[]): void {
    for (const move of moves) for (const [key, stack] of changesOf(move, key => this.at(key), this.keyOf, 0)) this.planned.set(key, stack)
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

interface Screen extends OpenScreen {
  readonly hooks: readonly ScreenHooks[]
  /** each window slot, as a request names it, and its key */
  readonly view: readonly SlotRef[]
  readonly keys: readonly Key[]
  readonly properties: Map<number, number>
}

/** a screen opened, shown at once or at its window's first content */
interface Opened {
  readonly opening: ScreenOpening
  readonly defined: Defined
  readonly properties: Map<number, number>
}

/** a click mode a feature makes (a drag, a double click): its buttons, and the click, made in its input pass */
export interface ClickMode {
  readonly buttons: readonly number[]
  readonly click: (ctx: FrameContext, click: WindowClick, screen: OpenScreen, clicked: SlotRef | undefined) => Promise<void>
}

export interface InventorySettings {
  readonly screenAnimations: boolean
}

/** from 1.26.60 the vanilla client brackets a click placing from the cursor: when its request left; held through a drag */
interface CursorDrag {
  leftAt: Ns | undefined
  held: boolean
}

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
  /** the screens the bot shows: its features add theirs */
  readonly screens = new Screens()
  /** otherData: container_set_data's dropped, of an id no screen opened with */
  readonly stats = { otherWindows: 0, otherScreens: 0, otherData: 0, unknownResponses: 0 }
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
  /** a screen opened, to be shown at its window's first content */
  private unshown: Opened | undefined
  /** container_set_data's of ids not open, by id: a furnace's come before its container_open */
  private readonly unopened = new Map<string, Map<number, number>>()
  private openingCount = 0
  private lastOpening: WindowType | undefined
  private closing: Closing | undefined
  private runtimeId: bigint | undefined
  private equipmentChanged = true
  /** undefined until the player is first shown */
  private equipped: { main: Stack | undefined, offhand: Stack | undefined } | undefined
  private readonly layoutsOpened = new Set<NonNullable<ScreenDefinition['options']>>()
  private readonly layoutsTold = new Set<NonNullable<ScreenDefinition['options']>>()
  private optionsDue: Ns[] = []
  private cursorDrag: CursorDrag | undefined
  private readonly clickModes = new Map<number, ClickMode>()
  /** bot.inventory's slots, by the slot each shows */
  private readonly inventoryKeys: readonly Key[]

  constructor (bot: BedrockBotInternal, settings: InventorySettings) {
    this.bot = bot
    this.settings = settings
    this.Item = prismarineItem(bot.registry)
    this.Window = windowsOf(bot.registry).Window
    // the inventory screen is there without the plugins
    this.screens.add(INVENTORY_SCREEN)
    this.screens.add(WORKBENCH_SCREEN)
    this.inventoryKeys = viewOf(INVENTORY_LAYOUT).map(ref => this.keyOf(ref))
    this.window = this.javaWindow(0, INVENTORY_LAYOUT)
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
    core.handle(OWNER, 'inventory_content', (packet, { now }) => {
      // 1.16.201 names it inventory_id
      const id = String(packet.window_id ?? packet.inventory_id)
      const { unshown } = this
      const sized = unshown !== undefined && String(unshown.opening.id) === id ? unshown : undefined
      const where = sized === undefined ? this.whereOf(id) : OWN
      if (where === undefined) {
        this.stats.otherWindows++
        return
      }
      packet.input.forEach((item, index) => { this.receive(`${where[0]}:${where[1] + index}`, readStack(item)) })
      this.equipmentChanged = true
      if (sized === undefined) return
      this.unshown = undefined
      this.show(core, now, sized, packet.input.length)
    })
    core.handle(OWNER, 'inventory_slot', packet => { this.receiveSlot(packet.window_id, packet.slot, readStack(packet.item)) })
    core.handle(OWNER, 'player_hotbar', packet => { if (packet.select_slot) this.select(core, packet.selected_slot) })
    core.handle(OWNER, 'item_stack_response', packet => { this.answers.push(...readResponses(packet.responses)) })
    core.handle(OWNER, 'container_open', (packet, ctx) => {
      this.openScreen(core, ctx, { id: packet.window_id, type: packet.window_type, position: packet.coordinates, entity: packet.runtime_entity_id })
    })
    core.handle(OWNER, 'container_close', packet => {
      const { screen } = this
      if (this.unshown?.opening.id === packet.window_id) this.unshown = undefined
      if (screen?.opening.id === packet.window_id) this.closed(core, screen)
    })
    core.handle(OWNER, 'container_set_data', packet => { this.setData(packet.window_id, packet.property, packet.value) })
    core.inputPass(OWNER, ctx => {
      this.takeAnswers()
      this.send(core, ctx)
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
  get screenType (): WindowTypeName | undefined {
    return this.closing?.end === undefined ? this.screen?.definition.type : undefined
  }

  /** the screens the server opened, each counted once shown or refused: what openBlock waits for */
  get openings (): number {
    return this.openingCount
  }

  /** the type of the screen last counted in openings */
  get lastOpened (): WindowType | undefined {
    return this.lastOpening
  }

  /** the slots as the bot predicts them, for moves to be planned on, with the open screen's rules */
  draft (): Draft {
    const definition = this.screen?.definition
    const names: Pick<ClickedSlots, 'itemName' | 'enchantCategories'> = {
      enchantCategories: ({ networkId }) => this.bot.registry.items[networkId]?.enchantCategories ?? [],
      itemName: ({ networkId }) => this.bot.registry.items[networkId]?.name
    }
    return new Draft(key => this.slots.get(key), ref => this.keyOf(ref), {
      ...names,
      stackSize: ({ networkId }) => this.bot.registry.items[networkId]?.stackSize ?? DEFAULT_STACK_SIZE,
      shiftTargets: (from, stack) => definition?.shiftTargets?.(from, stack) ?? defaultShiftTargets(from),
      accepts: (to, stack) => definition?.accepts?.(to, stack, names)
    })
  }

  stackAt (ref: SlotRef): Stack | undefined {
    return this.slots.get(this.keyOf(ref))
  }

  /** a slot shown as `stack` until the server sends it, with no request: an edit the server answers otherwise */
  predictSlot (ref: SlotRef, stack: Stack | undefined): void {
    this.set(this.keyOf(ref), stack)
  }

  /** the slot of `window` that shows bot.inventory's slot `inventorySlot`, if it shows it */
  windowSlotOf (window: Window, inventorySlot: number): number | undefined {
    const key = this.inventoryKeys[inventorySlot]
    const keys = window === this.window ? this.inventoryKeys : window === this.screen?.window ? this.screen.keys : []
    const slot = keys.findIndex(shown => shown === key)
    return slot < 0 ? undefined : slot
  }

  /** a slot of the player's windows, the ui's or the open screen's own, as inventory_slot sends it; another window's is counted */
  receiveSlot (id: WindowId, slot: number, stack: Stack | undefined): void {
    const where = this.whereOf(String(id))
    if (where === undefined) {
      this.stats.otherWindows++
      return
    }
    this.receive(`${where[0]}:${where[1] + slot}`, stack)
    this.equipmentChanged = true
  }

  /** the hotbar slot selected: by the server, in the packet pass; by the player, in an input pass */
  select (core: BedrockCore, slot: number): void {
    if (slot === this.quickBarSlot) return
    this.quickBarSlot = slot
    core.emit(this.bot, 'heldItemChanged', this.bot.heldItem)
    this.equipmentChanged = true
  }

  /** a screen another packet opens (update_trade, update_equipment), in its packet pass, as container_open opens one */
  openScreen (core: BedrockCore, { now }: FrameContext, opening: ScreenOpening): void {
    const id = String(opening.id)
    const properties = this.unopened.get(id) ?? new Map<number, number>()
    this.unopened.delete(id)
    // another id's were for no screen
    for (const others of this.unopened.values()) this.stats.otherData += others.size
    this.unopened.clear()
    const defined = this.screens.definedOf(opening.type)
    if (defined === undefined) {
      this.notShown(opening.type)
      return
    }
    this.unshown = undefined
    this.clearOwn()
    const opened: Opened = { opening, defined, properties }
    if (defined.definition.shown === 'open') {
      this.show(core, now, opened, undefined)
      return
    }
    this.screen = undefined
    this.unshown = opened
  }

  /** a click mode clickWindow does not make itself, made by a feature on every screen; throws for one made already */
  addClickMode (mode: number, clickMode: ClickMode): void {
    if (this.clickModes.has(mode) || isSupportedClick({ slot: 0, mouseButton: 0, mode })) throw new Error(`clickWindow makes mode ${mode} already`)
    this.clickModes.set(mode, clickMode)
  }

  /** the moves a click on the open screen's window makes on the slots as `draft` has them, as clickWindow makes them: none for an output or a feature's mode */
  clickMoves (click: WindowClick, draft: Draft): Move[] {
    const { screen, clicked } = this.clicked(click)
    return this.clickModes.has(click.mode) || isOutput(clicked, click) ? [] : this.movesOf(screen, click, clicked, draft)
  }

  /** from 1.26.60, a drag's bracket: started before its first request, then held until released at its end */
  holdCursorDrag (ctx: FrameContext): void {
    if (this.atLeast('bedrock_1.26.60')) this.startCursorDrag(ctx).held = true
  }

  /** the drag's end, in an input pass: its bracket stops in this one, or in that of the frame after its last request left */
  releaseCursorDrag (): void {
    if (this.cursorDrag !== undefined) this.cursorDrag.held = false
  }

  /** made in an input pass, it names its slots and predicts its moves at once, as the vanilla client does; the arm swings for each drop, in the pass */
  async request (core: BedrockCore, { outbox }: FrameContext, moves: readonly Move[], text: RequestText = {}): Promise<void> {
    this.check(moves)
    const { runtimeId, screen } = this
    if (runtimeId !== undefined) for (const move of moves) if (move.type === 'drop') outbox.queue('animate', swingArm(this.bot.version, runtimeId, 'dropitem'))
    const request: PendingRequest = { id: core.requestIds.nextStackRequest(), before: new Map(), response: undefined }
    this.pending.push(request)
    const actions = moves.map(move => {
      const action = this.actionOf(move)
      this.predict(request, move)
      return action
    })
    this.queued.push(stackRequest(this.bot.version, request.id, actions, text))
    if (screen !== undefined) for (const hooks of screen.hooks) hooks.requested?.(request.id, moves, screen)
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
    const mode = this.clickModes.get(click.mode)
    const supported = mode === undefined ? isSupportedClick(click) : mode.buttons.includes(click.mouseButton)
    if (!supported) throw new Error(`clickWindow does not support mode ${click.mode} with mouse button ${click.mouseButton} on Bedrock`)
    await core.call(async ctx => { await this.click(core, ctx, click) })
  }

  /** the open screen and its slot a click is on: none outside the window */
  private clicked (click: WindowClick): { screen: Screen, clicked: SlotRef | undefined } {
    const { screen } = this
    if (screen === undefined) throw new Error('clickWindow needs an open window: on Bedrock the inventory too is a screen (bot.openInventory())')
    if (this.screenType === undefined) throw new Error(`the ${screen.window.type} window is closing`)
    const clicked = screen.view[click.slot]
    if (clicked === undefined && click.slot !== OUTSIDE) throw new Error(`the ${screen.window.type} window has no slot ${click.slot}`)
    return { screen, clicked }
  }

  private movesOf ({ definition }: Screen, click: WindowClick, clicked: SlotRef | undefined, draft: Draft): Move[] {
    return [...definition.moves?.(click, clicked, draft) ?? clickMoves(click, clicked, draft)]
  }

  private async click (core: BedrockCore, ctx: FrameContext, click: WindowClick): Promise<void> {
    const { screen, clicked } = this.clicked(click)
    const mode = this.clickModes.get(click.mode)
    if (mode !== undefined) return await mode.click(ctx, click, screen, clicked)
    if (isOutput(clicked, click)) return await screen.hooks.find(hooks => hooks.output !== undefined)?.output?.(ctx, click, screen)
    const moves = this.movesOf(screen, click, clicked, this.draft())
    if (moves.length === 0) return
    const dragged = click.mode === 0 && this.atLeast('bedrock_1.26.60') && moves.some(move => move.type === 'place' && move.from.container === 'cursor')
    if (dragged) this.startCursorDrag(ctx)
    await this.request(core, ctx, moves)
  }

  private startCursorDrag (ctx: FrameContext): CursorDrag {
    this.stopCursorDrag(ctx)
    if (this.cursorDrag !== undefined) return this.cursorDrag
    ctx.outbox.queue('serverbound_cursor_item_drag', { state: 'start' })
    this.cursorDrag = { leftAt: undefined, held: false }
    return this.cursorDrag
  }

  /** the vanilla client ends the drag in the input pass of the frame after its request left */
  private stopCursorDrag ({ outbox }: FrameContext): void {
    if (this.cursorDrag?.leftAt === undefined || this.cursorDrag.held) return
    outbox.queue('serverbound_cursor_item_drag', { state: 'stop' })
    this.cursorDrag = undefined
  }

  private async openInventory (core: BedrockCore): Promise<Window> {
    // the inventory being closed opens again once the server closed it, as the vanilla client's
    if (this.closing !== undefined) await this.closing.done.catch(() => {})
    const { screen, runtimeId } = this
    if (screen?.window === this.window) return this.window
    if (screen !== undefined) throw new Error(`the inventory cannot open over the ${screen.window.type} window`)
    if (runtimeId === undefined) throw new Error('the inventory cannot open before start_game')
    core.command(({ outbox }) => { outbox.queue('interact', this.interact('open_inventory', runtimeId)) })
    await core.waits.until(() => this.screen?.window === this.window, RESPONSE_TICKS, `the server did not open the inventory in ${RESPONSE_TICKS} ticks`)
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
    const closed = core.waits.until(() => this.screen !== screen, RESPONSE_TICKS, `the server did not close the ${screen.definition.type} screen in ${RESPONSE_TICKS} ticks`)
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
      const animation = ANIMATIONS[screen.definition.animation]
      const animated = animation > 0 && this.atLeast('bedrock_1.21.120') && this.settings.screenAnimations
      closing.end = animated ? ctx.now + animation : ctx.now
      closing.ended = !animated
    })
    return closing
  }

  /** in the screen's order, as the vanilla client does; what has no room is dropped, a request a slot */
  private handBack (core: BedrockCore, ctx: FrameContext, screen: Screen): Array<Promise<void>> {
    const requests: Array<Promise<void>> = []
    for (const from of screen.definition.handBack) {
      const stack = this.stackAt(from)
      if (stack === undefined) continue
      let left = stack.count
      for (const { to, count } of placesFor(stack, HOTBAR_AND_INVENTORY, this.draft())) {
        requests.push(this.request(core, ctx, [{ type: 'place', count, from, to }]))
        left -= count
      }
      if (left > 0) requests.push(this.request(core, ctx, [{ type: 'drop', count: left, from }]))
    }
    return requests
  }

  /** its slots shown and its hooks run before windowOpen, in the packet pass */
  private show (core: BedrockCore, now: Ns, { opening, defined: { definition, hooks }, properties }: Opened, contentSize: number | undefined): void {
    const layout = definition.layout(opening, contentSize)
    if (layout === undefined) {
      this.notShown(opening.type)
      return
    }
    const view = viewOf(layout)
    const window = definition.playerWindow === true ? this.window : this.javaWindow(windowIdOf(opening.id), layout)
    const screen: Screen = { opening, definition, window, view, keys: view.map(ref => this.keyOf(ref)), properties, hooks }
    if (window !== this.window) this.showAll(screen)
    this.screen = screen
    this.tellOptions(core, definition, now)
    for (const run of this.screens.shownHooks) run(screen)
    for (const hook of hooks) hook.shown?.(screen)
    core.emit(this.bot, 'windowOpen', window)
    this.counted(opening.type)
  }

  private javaWindow (id: number, layout: ScreenLayout): Window<StorageEvents> {
    const { slots, craftingResultSlot, windowType, title } = layout
    return new this.Window<StorageEvents>(id, windowType, title, viewOf(layout).length, { start: slots.length, end: slots.length + PLAYER_SLOTS.length - 1 }, craftingResultSlot, true)
  }

  /** where a window id's items go: the player's windows, the ui, or the open screen's own */
  private whereOf (id: string): Where | undefined {
    const { screen } = this
    return WINDOWS[id] ?? (screen !== undefined && String(screen.opening.id) === id && ownsWindow(screen.definition) ? OWN : undefined)
  }

  /** shown or not, an opening is counted for openBlock */
  private counted (type: WindowType): void {
    this.openingCount++
    this.lastOpening = type
  }

  private notShown (type: WindowType): void {
    this.stats.otherScreens++
    this.counted(type)
  }

  /** 1.20.50 – 1.21.101: once a client process, a screen's first opening tells the server the screens opened so far */
  private tellOptions (core: BedrockCore, { options }: ScreenDefinition, now: Ns): void {
    if (options === undefined) return
    this.layoutsOpened.add(options)
    if (this.atLeast('bedrock_1.20.50') && !this.atLeast('bedrock_1.21.111') && core.requestIds.freshProcess && !this.layoutsTold.has(options)) {
      this.layoutsTold.add(options)
      this.optionsDue.push(now + OPTIONS_DELAY)
    }
  }

  private setData (id: WindowId, property: number, value: number): void {
    const { screen, unshown } = this
    if (screen?.opening.id === id) {
      screen.properties.set(property, value)
      for (const hooks of screen.hooks) hooks.data?.(property, value, screen)
      return
    }
    if (unshown?.opening.id === id) {
      unshown.properties.set(property, value)
      return
    }
    const properties = this.unopened.get(String(id)) ?? new Map<number, number>()
    properties.set(property, value)
    this.unopened.set(String(id), properties)
  }

  /** the screen's own window is emptied when it closes or another opens */
  private clearOwn (): void {
    for (const key of [...this.slots.keys()].filter(key => key.startsWith(`${OWN[0]}:`))) this.receive(key, undefined)
  }

  /** by the server, or by the bot alone for a screen whose close is its feature's */
  private closed (core: BedrockCore, screen: Screen): void {
    this.screen = undefined
    this.closing = undefined
    this.clearOwn()
    core.emit(this.bot, 'windowClose', screen.window)
    for (const hooks of screen.hooks) hooks.closed?.(screen)
  }

  private send (core: BedrockCore, ctx: FrameContext): void {
    const { now, outbox } = ctx
    this.stopCursorDrag(ctx)
    for (const due of this.optionsDue.filter(at => at <= now)) {
      outbox.queue('set_player_inventory_options', {
        left_tab: 'search',
        right_tab: 'crafting',
        filtering: false,
        layout: this.layoutsOpened.has('layout') ? 'recipe_book' : 'none',
        crafting_layout: this.layoutsOpened.has('crafting_layout') ? 'recipe_book' : 'none'
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
    const { screen } = closing
    const close = screen.hooks.find(hooks => hooks.close !== undefined)?.close
    if (close !== undefined) {
      close(outbox, screen)
      this.closed(core, screen)
      return
    }
    const id = screen.definition.closeId ?? screen.opening.id
    outbox.queue('container_close', this.atLeast('bedrock_1.21.0') ? { window_id: id, window_type: 'none', server: false } : { window_id: id, server: false })
  }

  private sendRequests (outbox: OutboxWriter, now: Ns): void {
    if (this.queued.length === 0) return
    // the drag's request leaves with the requests queued before it
    if (this.cursorDrag !== undefined) this.cursorDrag.leftAt = now
    const { screen } = this
    if (screen !== undefined) for (const hooks of screen.hooks) hooks.beforeSend?.(outbox, screen)
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
        const key = this.responseKeyOf(slot)
        if (key === undefined) continue
        listed.add(key)
        // a response never makes an item: it counts and numbers those the request moved
        settle(key, stack => slot.count === 0 || stack === undefined ? undefined : this.settled(slot, { ...withCount(stack, slot.count), stackId: slot.stackId }))
      }
    }
    for (const [key, before] of request.before) if (!listed.has(key)) settle(key, () => before)
    request.response = response
    this.pending.splice(index, 1)
  }

  /** what the open screen's features make of a slot a response lists */
  private settled (slot: ResponseSlot, stack: Stack): Stack {
    const { screen } = this
    return screen === undefined ? stack : screen.hooks.reduce((settled, hooks) => hooks.settle?.(slot, settled, screen) ?? settled, stack)
  }

  /** throws before a request takes an id: as well once a close handed the items back, the vanilla client's screen being gone */
  private check (moves: readonly Move[]): void {
    const { screen } = this
    if (screen !== undefined && this.screenType === undefined) throw new Error(`the ${screen.window.type} window is closing`)
    this.draft().apply(moves)
  }

  private keyOf ({ container, slot }: SlotRef): Key {
    const store = this.screens.storeOf(container)
    if (store === undefined) throw new Error(`no screen says where the ${container} container's items are`)
    return `${store}:${slot}`
  }

  /** a container no screen defines is none of the bot's */
  private responseKeyOf ({ container, slot }: ResponseSlot): Key | undefined {
    const store = this.screens.storeOf(container)
    return store === undefined ? undefined : `${store}:${slot}`
  }

  private predict (request: PendingRequest, move: Move): void {
    for (const [key, stack] of changesOf(move, key => this.slots.get(key), ref => this.keyOf(ref), request.id)) {
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
    if (move.type === 'destroy') return destroyAction(version, move.count, source)
    if (move.type === 'consume') return consumeAction(version, move.count, source)
    const destination = slotInfo(version, move.to, this.nameOf(move.to))
    if (move.type === 'swap') return swapAction(version, source, destination)
    return moveAction(version, move.type, move.count, source, destination)
  }

  private nameOf (ref: SlotRef): number {
    const key = this.keyOf(ref)
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
    this.showKey(this.window, this.inventoryKeys, key, item)
    if (this.screen !== undefined && this.screen.window !== this.window) this.showKey(this.screen.window, this.screen.keys, key, item)
  }

  private showKey (window: Window, keys: readonly Key[], key: Key, item: Item | null): void {
    const slot = keys.indexOf(key)
    if (slot >= 0) showSlot(window, slot, item)
  }

  private showAll ({ window, keys }: Screen): void {
    keys.forEach((key, slot) => { showSlot(window, slot, itemOf(this.Item, this.slots.get(key))) })
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
