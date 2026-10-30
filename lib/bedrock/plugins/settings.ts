import type { BedrockBotOptions, ChatLevel, MainHands, ViewDistance } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// bot.settings, as Java's. The one a Bedrock server reads is the view distance, the chunk radius the client asks for;
// the others are checked as Java checks them, and kept.

const CHAT_LEVELS: readonly ChatLevel[] = Object.freeze(['enabled', 'commandsOnly', 'disabled'])
const MAIN_HANDS: readonly MainHands[] = Object.freeze(['left', 'right'])
/** Java's named view distances, in chunks */
const VIEW_DISTANCES: Readonly<Record<string, number>> = Object.freeze({ far: 12, normal: 10, short: 8, tiny: 6 })

/** the chunk radius a view distance asks for: one of Java's names, or a number of chunks */
export function chunkRadiusOf (viewDistance: ViewDistance): number {
  const radius = typeof viewDistance === 'number' ? viewDistance : VIEW_DISTANCES[viewDistance] ?? 0
  if (Number.isInteger(radius) && radius > 0) return radius
  throw new Error(`invalid view distance setting: ${viewDistance}`)
}

export default function inject (bot: BedrockBotInternal, options: BedrockBotOptions): void {
  bot.settings = {
    chat: 'enabled',
    colorsEnabled: true,
    viewDistance: options.viewDistance ?? bot._session.chunkRadius,
    difficulty: 2,
    skinParts: { showCape: true, showJacket: true, showLeftSleeve: true, showRightSleeve: true, showLeftPants: true, showRightPants: true, showHat: true },
    mainHand: 'right'
  }

  bot.setSettings = settings => {
    const merged = { ...bot.settings, ...settings }
    if (!CHAT_LEVELS.includes(merged.chat)) throw new Error(`invalid chat setting: ${merged.chat}`)
    const chunkRadius = chunkRadiusOf(merged.viewDistance)
    if (!MAIN_HANDS.includes(merged.mainHand)) throw new Error(`invalid main hand: ${merged.mainHand}`)
    Object.assign(bot.settings, merged)
    bot._core.command(({ outbox }) => { bot._session.requestChunkRadius(chunkRadius, outbox) })
  }
}
