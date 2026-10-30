import { Client } from 'bedrock-protocol'
import type { Options } from 'bedrock-protocol'
import type { ParsedPacket } from 'bedrock-protocol/src/transforms/serializer.js'
import type { InboxWriter, Ns, OutgoingPacket, Transport } from '../core/types.ts'

/** what the bot uses of bedrock-protocol's Client */
export interface ProtocolClient {
  readonly serializer: { createPacketBuffer: (packet: { name: string, params: object }) => Buffer }
  init: () => void
  connect: () => void
  close: () => void
  sendBuffer: (buffer: Buffer) => void
  onTick: () => void
  on (event: 'packet', listener: (packet: ParsedPacket) => void): this
  on (event: 'status', listener: (status: number) => void): this
  on (event: 'connect_allowed' | 'close', listener: () => void): this
  on (event: 'error', listener: (error: Error) => void): this
}

export interface ProtocolClientOptions {
  host: string
  port: number
  username: string
  version: string
  raknetBackend: Options['raknetBackend'] | undefined
  connectTimeout: number | undefined
}

export function createProtocolClient (options: ProtocolClientOptions): ProtocolClient {
  const { raknetBackend, connectTimeout, ...connection } = options
  return new Client({
    ...connection,
    ...(raknetBackend === undefined ? {} : { raknetBackend }),
    ...(connectTimeout === undefined ? {} : { connectTimeout }),
    offline: true,
    transport: 'raknet',
    conLog: null,
    // the bot answers every game packet itself, in its packet pass: none of createClient's own replies and timers
    delayedInit: true,
    autoInitPlayer: false
  })
}

// the library's own packets of the connection's handshake
const CONNECTION_PACKETS: ReadonlySet<string | number> = new Set(['network_settings', 'server_to_client_handshake'])
const CONNECTING = 1
// bedrock-protocol closes the RakNet connection, which tells the server the player left, 40 ms after it emits close:
// a process exiting on the bot's end must not exit before that
const END_DELAY_MS = 50

/** a connection to the server through bedrock-protocol */
export function connectBedrockProtocol (options: ProtocolClientOptions, inbox: InboxWriter, now: () => Ns): Transport {
  return connectTransport(createProtocolClient(options), inbox, now, (run, ms) => { setTimeout(run, ms) })
}

/**
 * The bot's link to bedrock-protocol: what the client receives goes to the inbox, stamped with its arrival time, and
 * each frame's packets leave as one batch.
 */
export function connectTransport (client: ProtocolClient, inbox: InboxWriter, now: () => Ns, delay: (run: () => void, ms: number) => void): Transport {
  let byServer = false
  client.on('status', status => {
    if (status === CONNECTING) inbox.notice({ kind: 'connected' }, now())
  })
  client.on('packet', ({ data, fullBuffer }) => {
    if (typeof data.name !== 'string' || data.params === undefined || CONNECTION_PACKETS.has(data.name)) return
    if (data.name === 'disconnect') byServer = true
    inbox.packet(data.name, data.params, fullBuffer.length, now())
  })
  client.on('error', error => { inbox.notice({ kind: 'error', error }, now()) })
  client.on('close', () => { delay(() => { inbox.notice({ kind: 'closed', byServer }, now()) }, END_DELAY_MS) })
  client.on('connect_allowed', () => { client.connect() })
  try {
    client.init()
  } catch (error) {
    inbox.notice({ kind: 'error', error: error instanceof Error ? error : new Error(String(error)) }, now())
    client.close()
  }
  return {
    flush (batch: readonly OutgoingPacket[]): void {
      // every packet is written before any is sent: a packet that cannot be written sends none of its batch
      const buffers = batch.map(packet => {
        try {
          return client.serializer.createPacketBuffer({ name: packet.name, params: packet.params })
        } catch (error) {
          throw new Error(`${packet.owner} queued ${packet.name} (${packet.phase}${packet.tick === undefined ? '' : `, tick ${packet.tick}`}), which cannot be written: ${String(error)}`)
        }
      })
      for (const buffer of buffers) client.sendBuffer(buffer)
      client.onTick()
    },
    close (): void {
      client.close()
    }
  }
}
