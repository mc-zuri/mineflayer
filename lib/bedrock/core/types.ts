import type { BedrockClientboundPackets, BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

/** integer nanoseconds of a monotonic clock */
export type Ns = number

export type ClientboundName = keyof BedrockClientboundPackets
export type ServerboundName = keyof BedrockServerboundPackets

/** where a packet was queued: the packet pass, the input pass or a tick's systems */
export type Phase = 'F2' | 'F3' | 'T3'

export interface OutgoingPacket {
  readonly order: number
  readonly name: ServerboundName
  readonly params: object
  readonly phase: Phase
  readonly tick: number | undefined
  readonly owner: string
}

export interface OutboxWriter {
  queue: <Name extends ServerboundName>(name: Name, params: BedrockServerboundPackets[Name]) => void
}

export type LinkNotice =
  | { readonly kind: 'connected' }
  | { readonly kind: 'error', readonly error: Error }
  | { readonly kind: 'closed', readonly byServer: boolean }

/** what the transport (or a test's fake server) hands the core: nothing is handled until the next packet pass */
export interface InboxWriter {
  packet: (name: string, params: object, size: number, arrivalTime: Ns) => void
  notice: (notice: LinkNotice, arrivalTime: Ns) => void
}

export interface Transport {
  /** the frame's packets, in order, as one batch */
  flush: (batch: readonly OutgoingPacket[]) => void
  close: () => void
}

export interface FrameContext {
  readonly now: Ns
  /** undefined until start_game started the ticks */
  readonly tick: number | undefined
  readonly outbox: OutboxWriter
}

export interface HandlerContext extends FrameContext {
  readonly arrivalTime: Ns
  readonly sequence: number
}

export interface TickContext {
  readonly tick: number
  readonly now: Ns
  /** a rewind replaying a past tick: packets and events are dropped */
  readonly replaying: boolean
  readonly outbox: OutboxWriter
}

/** always: every tick; present: the server shows the player (auth inputs); active: the player moves */
export type Gate = 'always' | 'present' | 'active'
