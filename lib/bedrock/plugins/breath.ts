import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// bot.oxygenLevel, as Java's: the player's air (set_entity_data's air, 300 when full) in Java's 20 bubbles.

const OWNER = 'breath'
const AIR_PER_BUBBLE = 15

export default function inject (bot: BedrockBotInternal): void {
  let air: number | undefined

  bot._core.observe(OWNER, 'set_entity_data', packet => {
    if (!bot._player.isLocalPlayer(packet.runtime_entity_id)) return
    const told = packet.metadata.find(({ key }) => key === 'air')?.value
    // servers send it again with the player's other metadata
    if (typeof told !== 'number' || told === air) return
    air = told
    bot.oxygenLevel = Math.round(air / AIR_PER_BUBBLE)
    bot._core.emit(bot, 'breath')
  })
}
