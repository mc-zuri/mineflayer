import type { SlotRef } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the table's nine slots, its own window's */
export const LAB_TABLE_INPUTS: readonly SlotRef[] = Object.freeze(Array.from({ length: 9 }, (_, slot) => Object.freeze({ container: 'labtable_input', slot })))

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:lab_table',
  title: 'Lab Table',
  slots: LAB_TABLE_INPUTS,
  craftingResultSlot: -1
})

/** The Education lab table's screen, of Java's 45 slots: a block container, whose items stay in it, so only the cursor goes back. */
export const LAB_TABLE_SCREEN: ScreenDefinition = Object.freeze({
  type: 'lab_table',
  containers: Object.freeze({ labtable_input: 'open' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR])
})
