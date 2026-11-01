import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

// the settings are its block entity's, in no container a request names
const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:structure_block',
  title: 'Structure Block',
  slots: Object.freeze([]),
  craftingResultSlot: -1
})

/** The structure block's screen: no slot of its own, nothing to give back, a close of its plugin's with no animation. */
export const STRUCTURE_EDITOR_SCREEN: ScreenDefinition = Object.freeze({
  type: 'structure_editor',
  containers: Object.freeze({}),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'none',
  handBack: Object.freeze([]),
  moves: () => { throw new Error('clickWindow: the structure block window takes no clicks on Bedrock, whose screen shows no slot') }
})
