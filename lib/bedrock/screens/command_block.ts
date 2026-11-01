import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

// the command and its settings are its block entity's, in no container a request names
const LAYOUT: ScreenLayout = Object.freeze({
  windowType: 'minecraft:command_block',
  title: 'Command Block',
  slots: Object.freeze([]),
  craftingResultSlot: -1
})

/** The command block's screen: no slot of its own, nothing to give back, a close of its plugin's with no animation. */
export const COMMAND_BLOCK_SCREEN: ScreenDefinition = Object.freeze({
  type: 'command_block',
  containers: Object.freeze({}),
  shown: 'open',
  layout: () => LAYOUT,
  animation: 'none',
  handBack: Object.freeze([]),
  moves: () => { throw new Error('clickWindow: the command block window takes no clicks on Bedrock, whose screen shows no slot') }
})
