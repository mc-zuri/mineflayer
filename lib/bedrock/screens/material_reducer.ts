import type { SlotRef } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const MATERIAL_REDUCER_INPUT: SlotRef = Object.freeze({ container: 'matreduce_input', slot: 8 })
/** what the input reduces to, `ui` 41 – 49 */
export const MATERIAL_REDUCER_OUTPUTS: readonly SlotRef[] = Object.freeze(Array.from({ length: 9 }, (_, index) => Object.freeze({ container: 'matreduce_output', slot: 41 + index })))

const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:material_reducer',
  title: 'Material Reducer',
  slots: Object.freeze([MATERIAL_REDUCER_INPUT, ...MATERIAL_REDUCER_OUTPUTS]),
  craftingResultSlot: -1
})

/**
 * The Education material reducer's screen, of Java's 46 slots, whose clicks `moves` makes: its close destroys what the
 * outputs hold, then gives back the cursor's item and the input's.
 */
export function materialReducerScreen (moves: NonNullable<ScreenDefinition['moves']>): ScreenDefinition {
  return Object.freeze({
    type: 'material_reducer',
    containers: Object.freeze({ matreduce_input: 'ui', matreduce_output: 'ui', creative_output: 'ui' }),
    shown: 'open',
    layout: () => LAYOUT,
    animation: 'workbench',
    destroyed: MATERIAL_REDUCER_OUTPUTS,
    handBack: Object.freeze([CURSOR, MATERIAL_REDUCER_INPUT]),
    // the vanilla client puts nothing in an output
    accepts: (to: SlotRef) => to.container === 'matreduce_output' ? false : undefined,
    moves
  })
}
