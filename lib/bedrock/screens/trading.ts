import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the trade's two ingredient slots, as requests name them: the ui window's 4 and 5 */
export const TRADE_INGREDIENTS: readonly [SlotRef, SlotRef] = Object.freeze([
  Object.freeze({ container: 'trade2_ingredient1', slot: 4 }),
  Object.freeze({ container: 'trade2_ingredient2', slot: 5 })
] as const)

/** Java's villager window before 1.14: the ingredients, then the result */
const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:villager',
  title: 'Villager',
  slots: Object.freeze([...TRADE_INGREDIENTS, OUTPUT]),
  craftingResultSlot: 2
})

/** The trading screen, which update_trade opens: its close names no window, and animates as the crafting table's (recorded). */
export const TRADING_SCREEN: ScreenDefinition = Object.freeze({
  type: 'trading',
  containers: Object.freeze({ trade2_ingredient1: 'ui', trade2_ingredient2: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, ...TRADE_INGREDIENTS]),
  closeId: 'none'
})
