import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

// the book is its block entity's, in no container a request names
const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:lectern',
  title: 'Lectern',
  slots: Object.freeze([]),
  craftingResultSlot: -1
})

/** The lectern's book screen: no slot of its own, nothing to give back, a close of its plugin's with no animation. */
export const LECTERN_SCREEN: ScreenDefinition = Object.freeze({
  type: 'lectern',
  containers: Object.freeze({}),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'none',
  handBack: Object.freeze([]),
  moves: () => { throw new Error('clickWindow: the lectern window takes no clicks on Bedrock, whose book screen shows no slot') }
})
