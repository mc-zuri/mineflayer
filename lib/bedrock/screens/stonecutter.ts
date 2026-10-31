import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const STONECUTTER_INPUT: SlotRef = Object.freeze({ container: 'stonecutter_input', slot: 3 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:stonecutter',
  title: 'Stonecutter',
  slots: Object.freeze([STONECUTTER_INPUT, OUTPUT]),
  craftingResultSlot: 1
})

/** The stonecutter's screen, of Java's 38 slots. The cursor goes back before its input. */
export const STONECUTTER_SCREEN: ScreenDefinition = Object.freeze({
  type: 'stonecutter',
  containers: Object.freeze({ stonecutter_input: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, STONECUTTER_INPUT])
})
