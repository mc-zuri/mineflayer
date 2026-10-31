import type { Move } from './inventory.ts'
import { sameItem } from './items.ts'
import type { ContainerName, SlotRef, Stack } from './items.ts'

/** Java's click: mode 0 a mouse button (0 left, 1 right), 1 a shift click, 2 a hotbar key (the button its slot), 4 a drop key (1 with ctrl) */
export interface WindowClick {
  readonly slot: number
  readonly mouseButton: number
  readonly mode: number
}

/** the slots as the bot predicts them */
export interface ClickedSlots {
  stackAt: (ref: SlotRef) => Stack | undefined
  stackSize: (stack: Stack) => number
  enchantCategories: (stack: Stack) => readonly string[]
  itemName: (stack: Stack) => string | undefined
}

const BUTTONS: Readonly<Record<number, number>> = Object.freeze({ 0: 2, 1: 2, 2: 9, 4: 2 })

const CURSOR: SlotRef = Object.freeze({ container: 'cursor', slot: 0 })

/** each armor slot takes the items enchanted as worn there */
const WORN: ReadonlyArray<readonly string[]> = Object.freeze([['armor_head', 'cosmetic_head'], ['armor_torso', 'elytra'], ['armor_legs'], ['armor_feet']])
/** the vanilla items allowed in the offhand, which the registry does not tell: the client sends nothing for another, as for an egg */
const OFFHAND: readonly string[] = Object.freeze(['shield', 'arrow', 'totem_of_undying', 'firework_rocket', 'nautilus_shell', 'filled_map'])

function slotsOf (container: ContainerName, from: number, to: number): readonly SlotRef[] {
  return Object.freeze(Array.from({ length: to - from + 1 }, (_, index) => Object.freeze({ container, slot: from + index })))
}

const HOTBAR = slotsOf('hotbar', 0, 8)
const INVENTORY = slotsOf('inventory', 9, 35)
export const HOTBAR_AND_INVENTORY = slotsOf('hotbar_and_inventory', 0, 35)

export function isSupportedClick ({ mouseButton, mode }: WindowClick): boolean {
  return Number.isInteger(mouseButton) && mouseButton >= 0 && mouseButton < (BUTTONS[mode] ?? 0)
}

/** where a stack goes: onto the stacks of its item with room, in order, the rest to the first empty slots, a stack's size each */
export function placesFor (stack: Stack, destinations: readonly SlotRef[], slots: Pick<ClickedSlots, 'stackAt' | 'stackSize'>): Array<{ readonly to: SlotRef, readonly count: number }> {
  const places: Array<{ to: SlotRef, count: number }> = []
  let left = stack.count
  for (const to of destinations) {
    const held = slots.stackAt(to)
    const room = held === undefined || !sameItem(held, stack) ? 0 : slots.stackSize(held) - held.count
    if (room <= 0) continue
    const count = Math.min(left, room)
    places.push({ to, count })
    left -= count
    if (left === 0) return places
  }
  for (const to of destinations.filter(to => slots.stackAt(to) === undefined)) {
    const count = Math.min(left, slots.stackSize(stack))
    places.push({ to, count })
    left -= count
    if (left === 0) return places
  }
  return places
}

/** `count` of `from`'s stack onto `to`: a stack of another item, or onto a full one, swaps with it */
function transfer (from: SlotRef, source: Stack, to: SlotRef, count: number, slots: ClickedSlots): Move[] {
  const destination = slots.stackAt(to)
  if (destination === undefined) return [{ type: 'place', count, from, to }]
  if (!sameItem(source, destination)) return [{ type: 'swap', from, to }]
  const room = slots.stackSize(destination) - destination.count
  if (room > 0) return [{ type: 'place', count: Math.min(count, room), from, to }]
  // swapping a stack with one just like it changes nothing: the vanilla client sends nothing
  return source.count === destination.count ? [] : [{ type: 'swap', from, to }]
}

function mouseClick (clicked: SlotRef, right: boolean, slots: ClickedSlots): Move[] {
  const cursor = slots.stackAt(CURSOR)
  if (cursor !== undefined) return transfer(CURSOR, cursor, clicked, right ? 1 : cursor.count, slots)
  const stack = slots.stackAt(clicked)
  if (stack === undefined) return []
  return [{ type: 'take', count: right ? Math.ceil(stack.count / 2) : stack.count, from: clicked, to: CURSOR }]
}

function outsideClick (right: boolean, slots: ClickedSlots): Move[] {
  const cursor = slots.stackAt(CURSOR)
  return cursor === undefined ? [] : [{ type: 'drop', count: right ? 1 : cursor.count, from: CURSOR }]
}

/** the vanilla client moves the slot's stack whatever the cursor holds: from the hotbar to the inventory, back, and from elsewhere to either */
function shiftClick (clicked: SlotRef, slots: ClickedSlots): Move[] {
  const stack = slots.stackAt(clicked)
  if (stack === undefined) return []
  const destinations = clicked.container === 'hotbar' ? INVENTORY : clicked.container === 'inventory' ? HOTBAR : HOTBAR_AND_INVENTORY
  return placesFor(stack, destinations, slots).map(({ to, count }) => ({ type: 'place', count, from: clicked, to }))
}

/** with an item on the cursor, the vanilla client puts it in the key's empty hotbar slot */
function hotbarKey (clicked: SlotRef, key: number, slots: ClickedSlots): Move[] {
  const target: SlotRef = { container: 'hotbar', slot: key }
  const [cursor, hotbar] = [slots.stackAt(CURSOR), slots.stackAt(target)]
  if (cursor !== undefined) return hotbar === undefined ? [{ type: 'place', count: cursor.count, from: CURSOR, to: target }] : []
  if (clicked.container === target.container && clicked.slot === target.slot) return []
  const stack = slots.stackAt(clicked)
  if (stack === undefined) return hotbar === undefined ? [] : [{ type: 'place', count: hotbar.count, from: target, to: clicked }]
  return transfer(clicked, stack, target, stack.count, slots)
}

/** with an item on the cursor, the drop key drops one of it, and ctrl nothing; it never takes from a crafting output */
function dropKey (clicked: SlotRef, stack: boolean, slots: ClickedSlots): Move[] {
  const cursor = slots.stackAt(CURSOR)
  if (cursor !== undefined) return stack ? [] : [{ type: 'drop', count: 1, from: CURSOR }]
  const held = clicked.container === 'creative_output' ? undefined : slots.stackAt(clicked)
  return held === undefined ? [] : [{ type: 'drop', count: stack ? held.count : 1, from: clicked }]
}

function movesOf ({ mouseButton, mode }: WindowClick, clicked: SlotRef | undefined, slots: ClickedSlots): Move[] {
  if (clicked === undefined) return mode === 0 ? outsideClick(mouseButton === 1, slots) : []
  if (mode === 0) return mouseClick(clicked, mouseButton === 1, slots)
  if (mode === 1) return shiftClick(clicked, slots)
  if (mode === 2) return hotbarKey(clicked, mouseButton, slots)
  return dropKey(clicked, mouseButton === 1, slots)
}

/** each slot a move puts a stack in, and the slot that stack comes from */
function arrivals (move: Move): Array<readonly [to: SlotRef, from: SlotRef]> {
  if (move.type === 'drop') return []
  return move.type === 'swap' ? [[move.to, move.from], [move.from, move.to]] : [[move.to, move.from]]
}

/** an armor slot takes only what is worn there, the offhand the items allowed there */
function fits ([to, from]: readonly [SlotRef, SlotRef], slots: ClickedSlots): boolean {
  const stack = slots.stackAt(from)
  if (stack === undefined || (to.container !== 'armor' && to.container !== 'offhand')) return true
  if (to.container === 'offhand') return OFFHAND.includes(String(slots.itemName(stack)))
  return slots.enchantCategories(stack).some(category => WORN[to.slot]?.includes(category))
}

/** a supported click's moves, as the vanilla client makes them; none where it sends nothing, as for an item put in an armor slot it is not worn in, or an egg in the offhand. `clicked` undefined: outside the window */
export function clickMoves (click: WindowClick, clicked: SlotRef | undefined, slots: ClickedSlots): Move[] {
  const moves = movesOf(click, clicked, slots)
  return moves.every(move => arrivals(move).every(arrival => fits(arrival, slots))) ? moves : []
}
