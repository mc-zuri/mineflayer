// The minecraft-protocol client as mineflayer uses it. Its packet events and writes are typed by the packets of every
// Java version mineflayer accepts (Java.d.ts, generated: `pnpm gen:java-types` in the workspace). There is no
// catch-all string overload, so listening to or writing a packet no version has is a type error.
import type { Client, PacketMeta, SessionObject, States } from 'minecraft-protocol'
import type { MCProtocol } from './Java.d.ts'

/** two packet maps as one: a packet name both have is the union of its types */
type MergePackets<A, B> = {
  [K in keyof A | keyof B]: (K extends keyof A ? A[K] : never) | (K extends keyof B ? B[K] : never)
}

/** the packets the server sends, by name, as minecraft-protocol reads them (login, configuration and play) */
export type ClientboundPackets = MergePackets<MergePackets<
  MCProtocol.Java.Read.Play.Clientbound.Packets,
  MCProtocol.Java.Read.Config.Clientbound.Packets>,
  MCProtocol.Java.Read.Login.Clientbound.Packets>

/** the packets the client sends, by name, as minecraft-protocol writes them (login, configuration and play) */
export type ServerboundPackets = MergePackets<MergePackets<
  MCProtocol.Java.Write.Play.Serverbound.Packets,
  MCProtocol.Java.Write.Config.Serverbound.Packets>,
  MCProtocol.Java.Write.Login.Serverbound.Packets>

/** a chat message minecraft-protocol decoded from a player chat packet (1.19+) or a chat packet */
export interface PlayerChat {
  /** the message the server formatted, as JSON (absent when the server sent none) */
  formattedMessage: string
  /** the message without formatting, 1.19+ */
  plainMessage: string
  /** unsigned formatted content: 1.19 - 1.19.2, when the server modified the message without chat previews */
  unsignedContent?: string
  type: string
  sender: string
  senderName: string
  senderTeam: string
  targetName: string
  verified?: boolean
}

/** a system chat message minecraft-protocol decoded */
export interface SystemChat {
  positionId: number
  formattedMessage: string
}

/** the client's events that are not packets */
export interface ClientEvents {
  connect: () => void
  /** the server's version is known (autoVersion pinged it): the login may start */
  connect_allowed: () => void
  end: (reason: string) => void
  error: (error: Error) => void
  state: (newState: States, oldState: States) => void
  session: (session: SessionObject) => void
  packet: (data: ClientboundPackets[keyof ClientboundPackets], meta: PacketMeta, buffer: Buffer, fullBuffer: Buffer) => void
  raw: (buffer: Buffer, meta: PacketMeta) => void
  playerChat: (data: PlayerChat) => void
  systemChat: (data: SystemChat) => void
}

/** every event the client emits: its packets by name, then its other events */
export type ClientListeners = {
  [Name in keyof ClientboundPackets]: (packet: ClientboundPackets[Name], meta: PacketMeta) => void
} & ClientEvents

type Untyped = 'on' | 'once' | 'off' | 'addListener' | 'removeListener' | 'prependListener' | 'prependOnceListener' | 'emit' | 'write'

export interface TypedClient extends Omit<Client, Untyped> {
  /** set by autoVersion while it pings the server: the login then waits for connect_allowed */
  wait_connect?: boolean
  on<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  once<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  off<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  addListener<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  removeListener<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  prependListener<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  prependOnceListener<Event extends keyof ClientListeners> (event: Event, listener: ClientListeners[Event]): this
  emit<Event extends keyof ClientListeners> (event: Event, ...args: Parameters<ClientListeners[Event]>): boolean
  write<Name extends keyof ServerboundPackets> (name: Name, params: ServerboundPackets[Name]): void
}
