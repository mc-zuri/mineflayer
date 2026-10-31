import type { SlotRef } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the stand's three bottles, Java's slots 0 – 2 */
const BOTTLES: readonly SlotRef[] = Object.freeze([1, 2, 3].map(slot => Object.freeze({ container: 'brewing_result', slot })))
const INGREDIENT: SlotRef = Object.freeze({ container: 'brewing_input', slot: 0 })
const FUEL: SlotRef = Object.freeze({ container: 'brewing_fuel', slot: 4 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:brewing_stand',
  title: 'Brewing Stand',
  slots: Object.freeze([...BOTTLES, INGREDIENT, FUEL]),
  craftingResultSlot: -1
})

/** The brewing stand's screen, of Java's 41 slots: a block container, whose items stay in it, so only the cursor goes back. */
export const BREWING_STAND_SCREEN: ScreenDefinition = Object.freeze({
  type: 'brewing_stand',
  containers: Object.freeze({ brewing_input: 'open', brewing_result: 'open', brewing_fuel: 'open' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR])
})
