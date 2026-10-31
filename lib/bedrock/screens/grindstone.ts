import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const GRINDSTONE_INPUT: SlotRef = Object.freeze({ container: 'grindstone_input', slot: 16 })
export const GRINDSTONE_ADDITIONAL: SlotRef = Object.freeze({ container: 'grindstone_additional', slot: 17 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:grindstone',
  title: 'Repair & Disenchant',
  slots: Object.freeze([GRINDSTONE_INPUT, GRINDSTONE_ADDITIONAL, OUTPUT]),
  craftingResultSlot: 2
})

/** The grindstone's screen, of Java's 39 slots. Its second item goes back before its first, as recorded; the cursor first, as the crafting table's. */
export const GRINDSTONE_SCREEN: ScreenDefinition = Object.freeze({
  type: 'grindstone',
  containers: Object.freeze({ grindstone_input: 'ui', grindstone_additional: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, GRINDSTONE_ADDITIONAL, GRINDSTONE_INPUT])
})
