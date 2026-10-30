import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// Bedrock has no teams (no version has a team packet): the maps stay empty, and the team events never come
export default function inject (bot: BedrockBotInternal): void {
  bot.teams = {}
  bot.teamMap = {}
}
