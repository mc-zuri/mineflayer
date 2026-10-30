// What bedrock-protocol's Client has beyond its typings (docs/typescript/api-mismatches.md)
import 'bedrock-protocol'
import type { ParsedPacket, Serializer } from 'bedrock-protocol/src/transforms/serializer.js'

declare module 'bedrock-protocol' {
  interface Options {
    username?: string
    connectTimeout?: number
    /** where to log connection messages; null for nowhere */
    conLog?: ((...message: string[]) => void) | null
    /** the constructor does not start the client: init() does */
    delayedInit?: boolean
    /** whether the client answers play_status player_spawn with set_local_player_as_initialized itself */
    autoInitPlayer?: boolean
  }

  interface Client {
    readonly options: Options
    readonly serializer: Serializer
    /** loads the version's codec and emits connect_allowed */
    init (): void
    connect (): void
    /** sends the buffers sendBuffer queued, as one batch */
    onTick (): void
    on (event: 'packet', listener: (packet: ParsedPacket) => void): this
    on (event: 'status', listener: (status: number) => void): this
    on (event: 'connect_allowed' | 'close', listener: () => void): this
    on (event: 'error', listener: (error: Error) => void): this
  }
}
