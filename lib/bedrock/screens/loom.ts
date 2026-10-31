import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

/** the banner */
export const LOOM_INPUT: SlotRef = Object.freeze({ container: 'loom_input', slot: 9 })
export const LOOM_DYE: SlotRef = Object.freeze({ container: 'loom_dye', slot: 10 })
/** the banner pattern item */
export const LOOM_MATERIAL: SlotRef = Object.freeze({ container: 'loom_material', slot: 11 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:loom',
  title: 'Loom',
  slots: Object.freeze([LOOM_INPUT, LOOM_DYE, LOOM_MATERIAL, OUTPUT]),
  craftingResultSlot: 3
})

/** The loom's screen, of Java's 40 slots. The cursor goes back first, then the banner, the pattern item and the dye. */
export const LOOM_SCREEN: ScreenDefinition = Object.freeze({
  type: 'loom',
  containers: Object.freeze({ loom_input: 'ui', loom_dye: 'ui', loom_material: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'workbench',
  handBack: Object.freeze([CURSOR, LOOM_INPUT, LOOM_MATERIAL, LOOM_DYE])
})
