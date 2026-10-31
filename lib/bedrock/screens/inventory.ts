import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the inventory screen's 2 × 2 crafting grid, row by row */
export const INVENTORY_GRID: readonly SlotRef[] = Object.freeze([28, 29, 30, 31].map(slot => Object.freeze({ container: 'crafting_input', slot })))
const ARMOR: readonly SlotRef[] = Object.freeze([0, 1, 2, 3].map(slot => Object.freeze({ container: 'armor', slot })))
// the offhand's one item is a request's slot 1
const OFFHAND: SlotRef = Object.freeze({ container: 'offhand', slot: 1 })

export const INVENTORY_LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:inventory',
  title: 'Inventory',
  slots: Object.freeze([OUTPUT, ...INVENTORY_GRID, ...ARMOR]),
  after: Object.freeze([OFFHAND]),
  craftingResultSlot: 0
})

/** The inventory screen: bot.inventory is its window, of Java's 46 slots. Its grid goes back before the cursor. */
export const INVENTORY_SCREEN: ScreenDefinition = Object.freeze({
  type: 'inventory',
  containers: Object.freeze({ crafting_input: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => INVENTORY_LAYOUT,
  playerWindow: true,
  animation: 'inventory',
  handBack: Object.freeze([...INVENTORY_GRID, CURSOR]),
  options: 'layout'
})
