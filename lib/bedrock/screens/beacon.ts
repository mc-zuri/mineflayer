import type { SlotRef } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the beacon's payment, Java's slot 0 */
export const BEACON_PAYMENT: SlotRef = Object.freeze({ container: 'beacon_payment', slot: 27 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:beacon',
  title: 'Beacon',
  slots: Object.freeze([BEACON_PAYMENT]),
  craftingResultSlot: -1
})

/** The beacon's screen, of Java's 37 slots. The cursor goes back before the payment, as the crafting table's before its grid. */
export const BEACON_SCREEN: ScreenDefinition = Object.freeze({
  type: 'beacon',
  containers: Object.freeze({ beacon_payment: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, BEACON_PAYMENT])
})
