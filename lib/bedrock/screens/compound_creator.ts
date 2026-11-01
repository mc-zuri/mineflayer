import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the nine elements' slots, `ui` 18 – 26 */
export const COMPOUND_CREATOR_INPUTS: readonly SlotRef[] = Object.freeze(Array.from({ length: 9 }, (_, index) => Object.freeze({ container: 'compcreate_input', slot: 18 + index })))

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:compound_creator',
  title: 'Compound Creator',
  slots: Object.freeze([...COMPOUND_CREATOR_INPUTS, OUTPUT]),
  craftingResultSlot: 9
})

/** The Education compound creator's screen, of Java's 46 slots. The cursor goes back first, then the inputs. */
export const COMPOUND_CREATOR_SCREEN: ScreenDefinition = Object.freeze({
  type: 'compound_creator',
  containers: Object.freeze({ compcreate_input: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, ...COMPOUND_CREATOR_INPUTS])
})
