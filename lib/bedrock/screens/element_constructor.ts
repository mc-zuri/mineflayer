import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:element_constructor',
  title: 'Element Constructor',
  slots: Object.freeze([OUTPUT]),
  craftingResultSlot: 0
})

/** The Education element constructor's screen, of Java's 37 slots: only its output, which its sliders fill. */
export const ELEMENT_CONSTRUCTOR_SCREEN: ScreenDefinition = Object.freeze({
  type: 'element_constructor',
  containers: Object.freeze({ creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR])
})
