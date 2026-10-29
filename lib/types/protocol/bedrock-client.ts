// No catch-all string overload: listening to or writing a packet no Bedrock version has is a type error.
import type { MCProtocol } from './Bedrock.d.ts'

export type BedrockClientboundPackets = MCProtocol.Bedrock.Read.Clientbound.Packets

export type BedrockServerboundPackets = MCProtocol.Bedrock.Write.Serverbound.Packets

export interface BedrockClientEvents {
  close: () => void
  error: (error: Error) => void
  kick: (packet: BedrockClientboundPackets['disconnect']) => void
}

export type BedrockClientListeners = {
  [Name in keyof BedrockClientboundPackets]: (params: BedrockClientboundPackets[Name]) => void
} & BedrockClientEvents

export interface BedrockClient {
  on<Event extends keyof BedrockClientListeners> (event: Event, listener: BedrockClientListeners[Event]): this
  once<Event extends keyof BedrockClientListeners> (event: Event, listener: BedrockClientListeners[Event]): this
  off<Event extends keyof BedrockClientListeners> (event: Event, listener: BedrockClientListeners[Event]): this
  removeListener<Event extends keyof BedrockClientListeners> (event: Event, listener: BedrockClientListeners[Event]): this
  write<Name extends keyof BedrockServerboundPackets> (name: Name, params: BedrockServerboundPackets[Name]): void
  queue<Name extends keyof BedrockServerboundPackets> (name: Name, params: BedrockServerboundPackets[Name]): void
  /** emits close, then removes every listener */
  close (): void
}
