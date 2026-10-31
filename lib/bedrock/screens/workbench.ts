import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the crafting table's 3 × 3 grid, row by row */
export const TABLE_GRID: readonly SlotRef[] = Object.freeze([32, 33, 34, 35, 36, 37, 38, 39, 40].map(slot => Object.freeze({ container: 'crafting_input', slot })))

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:crafting_table',
  title: 'Crafting',
  slots: Object.freeze([OUTPUT, ...TABLE_GRID]),
  craftingResultSlot: 0
})

/** The crafting table's screen, of Java's 46 slots. The cursor goes back before its grid. */
export const WORKBENCH_SCREEN: ScreenDefinition = Object.freeze({
  type: 'workbench',
  containers: Object.freeze({ crafting_input: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, ...TABLE_GRID]),
  options: 'crafting_layout'
})
