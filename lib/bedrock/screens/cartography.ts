import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the map or the paper */
export const CARTOGRAPHY_INPUT: SlotRef = Object.freeze({ container: 'cartography_input', slot: 12 })
/** what is added to it: a compass, paper, a map or a glass pane */
export const CARTOGRAPHY_ADDITIONAL: SlotRef = Object.freeze({ container: 'cartography_additional', slot: 13 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:cartography',
  title: 'Cartography Table',
  slots: Object.freeze([CARTOGRAPHY_INPUT, CARTOGRAPHY_ADDITIONAL, OUTPUT]),
  craftingResultSlot: 2
})

/** The cartography table's screen, of Java's 39 slots. The cursor goes back first, then the input and what is added to it. */
export const CARTOGRAPHY_SCREEN: ScreenDefinition = Object.freeze({
  type: 'cartography',
  containers: Object.freeze({ cartography_input: 'ui', cartography_additional: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, CARTOGRAPHY_INPUT, CARTOGRAPHY_ADDITIONAL])
})
