import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'EntityHorse',
  title: 'Horse',
  slots: Object.freeze([0, 1].map(slot => Object.freeze({ container: 'horse_equip', slot }))),
  craftingResultSlot: -1
})

/**
 * The horse's screen, which update_equipment opens: its saddle and armour slots, named horse_equip, in its own window, as
 * a scripted server opened it on 1.26.20, 1.26.51 and 1.26.60. Its close has the inventory's animation, as recorded.
 */
export const HORSE_SCREEN: ScreenDefinition = Object.freeze({
  type: 'horse',
  containers: Object.freeze({ horse_equip: 'open' }),
  shown: 'content',
  layout: () => LAYOUT,
  animation: 'inventory',
  handBack: Object.freeze([CURSOR])
})
