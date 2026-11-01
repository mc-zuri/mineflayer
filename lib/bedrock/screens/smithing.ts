import type { SlotRef } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { ScreenDefinition } from '../modules/screens.ts'

export const SMITHING_TEMPLATE: SlotRef = Object.freeze({ container: 'smithing_table_template', slot: 53 })
/** the base */
export const SMITHING_INPUT: SlotRef = Object.freeze({ container: 'smithing_table_input', slot: 51 })
/** the addition */
export const SMITHING_MATERIAL: SlotRef = Object.freeze({ container: 'smithing_table_material', slot: 52 })

/** the smithing table's slots before its result: from 1.20.0 the template first, as Java's 1.20 window */
export function smithingInputs (templated: boolean): readonly SlotRef[] {
  return Object.freeze(templated ? [SMITHING_TEMPLATE, SMITHING_INPUT, SMITHING_MATERIAL] : [SMITHING_INPUT, SMITHING_MATERIAL])
}

/** The smithing table's screen, of Java's 39 slots, or 40 with the template. The cursor goes back first, then the base, the addition and the template. */
export function smithingScreen (templated: boolean): ScreenDefinition {
  const inputs = smithingInputs(templated)
  const layout = Object.freeze({ windowType: 'minecraft:smithing', title: 'Upgrade Gear', slots: Object.freeze([...inputs, OUTPUT]), craftingResultSlot: inputs.length })
  return Object.freeze({
    type: 'smithing_table',
    containers: Object.freeze({ smithing_table_template: 'ui', smithing_table_input: 'ui', smithing_table_material: 'ui', creative_output: 'ui' }),
    shown: 'open',
    layout: () => layout,
    animation: 'inventory',
    handBack: Object.freeze([CURSOR, SMITHING_INPUT, SMITHING_MATERIAL, ...inputs.filter(ref => ref === SMITHING_TEMPLATE)])
  })
}
