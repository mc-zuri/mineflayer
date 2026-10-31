import type { SlotRef } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const ENCHANTING_INPUT: SlotRef = Object.freeze({ container: 'enchanting_input', slot: 14 })
export const ENCHANTING_LAPIS: SlotRef = Object.freeze({ container: 'enchanting_lapis', slot: 15 })

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:enchanting_table',
  title: 'Enchant',
  slots: Object.freeze([ENCHANTING_INPUT, ENCHANTING_LAPIS]),
  craftingResultSlot: -1
})

/** The enchanting table's screen, of Java's 38 slots. Its item goes back before its lapis lazuli; the cursor first, as the crafting table's. */
export const ENCHANTMENT_SCREEN: ScreenDefinition = Object.freeze({
  type: 'enchantment',
  // the enchant request places the enchanted item from the created output
  containers: Object.freeze({ enchanting_input: 'ui', enchanting_lapis: 'ui', creative_output: 'ui' }),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'inventory',
  handBack: Object.freeze([CURSOR, ENCHANTING_INPUT, ENCHANTING_LAPIS])
})
