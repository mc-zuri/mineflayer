// The Bedrock packets by name, as read and as written. No catch-all string name: a packet no Bedrock version has is a
// type error.
import type { MCProtocol } from './Bedrock.d.ts'

export type BedrockClientboundPackets = MCProtocol.Bedrock.Read.Clientbound.Packets

export type BedrockServerboundPackets = MCProtocol.Bedrock.Write.Serverbound.Packets
