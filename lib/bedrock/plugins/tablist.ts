import prismarineChat from 'prismarine-chat'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// Bedrock's tab list has no header or footer (no version has a packet for them): both stay empty, as Java's start. Its
// players are the player list's.
export default function inject (bot: BedrockBotInternal): void {
  const ChatMessage = prismarineChat(bot.registry)
  bot.tablist = { header: new ChatMessage(''), footer: new ChatMessage('') }
}
