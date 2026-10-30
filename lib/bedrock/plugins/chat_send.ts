import { createHash } from 'crypto'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

// What the vanilla client sends for a chat message (a text packet) and a typed command (a command_request), in each
// version's layout. The bot logs in offline: its text carries no XUID.

export type ChatPacket =
  | { name: 'text', params: BedrockServerboundPackets['text'] }
  | { name: 'command_request', params: BedrockServerboundPackets['command_request'] }

/**
 * The command version the vanilla client of 1.19.60 – 1.21.124 runs its commands with (the server parses a command
 * with the overloads of that version): each server build's CommandVersion::CurrentVersion, from the version it is first
 * (docs/bedrock.md tells how they were found).
 */
const COMMAND_VERSIONS: ReadonlyArray<readonly [BedrockVersion, number]> = Object.freeze([
  ['bedrock_1.21.90', 44],
  ['bedrock_1.21.70', 43],
  ['bedrock_1.21.30', 42],
  ['bedrock_1.21.20', 41],
  ['bedrock_1.21.0', 39],
  ['bedrock_1.20.71', 38],
  ['bedrock_1.20.61', 37],
  ['bedrock_1.20.30', 36],
  ['bedrock_1.20.10', 35],
  ['bedrock_1.20.0', 34],
  ['bedrock_1.19.80', 33],
  ['bedrock_1.19.70', 32],
  ['bedrock_1.19.60', 26]
] as const)

/** a line of chat, or a command when it starts with '/' */
export function chatPacket (version: BedrockVersion, username: string, message: string, commandUuid: () => string): ChatPacket {
  return message.startsWith('/') ? commandRequest(version, message, commandUuid()) : chatText(version, username, message)
}

function chatText (version: BedrockVersion, username: string, message: string): ChatPacket {
  const chat = { type: 'chat', needs_translation: false, source_name: username, message, xuid: '', platform_chat_id: '' } as const
  // a server disconnects a client whose text carries a filtered message
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.21.0')) return { name: 'text', params: chat }
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.21.130')) return { name: 'text', params: { ...chat, filtered_message: '' } }
  const authored = { ...chat, category: 'authored', has_filtered_message: false } as const
  // 1.21.130 names the category's types before the type, a server disconnecting the client for other names
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.0')) return { name: 'text', params: { ...authored, chat: 'chat', whisper: 'whisper', announcement: 'announcement' } }
  return { name: 'text', params: authored }
}

function commandRequest (version: BedrockVersion, command: string, uuid: string): ChatPacket {
  const request = { command, origin: { type: 'player', uuid, request_id: '' }, internal: false } as const
  if (isBedrockVersionAtLeast(version, 'bedrock_1.21.130')) {
    return { name: 'command_request', params: { ...request, origin: { ...request.origin, player_entity_id: 0n }, version: 'latest' } }
  }
  const commandVersion = COMMAND_VERSIONS.find(([since]) => isBedrockVersionAtLeast(version, since))?.[1]
  if (commandVersion === undefined) return { name: 'command_request', params: request }
  // the server reads the field as a signed (zigzag) varint, which bedrock-protocol writes unsigned
  return { name: 'command_request', params: { ...request, version: commandVersion * 2 } }
}

/**
 * The n-th command's origin UUID: random-looking as the vanilla client's (a version 4 UUID, a new one per command), but
 * from the username and n, and written as the vanilla client writes a UUID: its two halves as little-endian 64-bit
 * numbers, which bedrock-protocol writes from the string's bytes in order.
 */
export function commandUuid (username: string, n: number): string {
  const bytes = createHash('sha256').update(`${username}\n${n}`).digest().subarray(0, 16)
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Buffer.concat([bytes.subarray(0, 8).reverse(), bytes.subarray(8).reverse()]).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
