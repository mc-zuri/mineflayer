import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const ANVIL_INPUT: SlotRef = Object.freeze({ container: 'anvil_input', slot: 1 })
export const ANVIL_MATERIAL: SlotRef = Object.freeze({ container: 'anvil_material', slot: 2 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:anvil',
  title: 'Repair & Name',
  slots: Object.freeze([ANVIL_INPUT, ANVIL_MATERIAL, OUTPUT]),
  craftingResultSlot: 2
})

/** The anvil's screen, of Java's 39 slots. Its item goes back before its material, as recorded; the cursor first, as the crafting table's. */
export const ANVIL_SCREEN: ScreenDefinition = Object.freeze({
  type: 'anvil',
  containers: Object.freeze({ anvil_input: 'ui', anvil_material: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, ANVIL_INPUT, ANVIL_MATERIAL])
})
