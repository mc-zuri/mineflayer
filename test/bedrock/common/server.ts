import { EventEmitter } from 'events'
import { latestSupportedBedrockVersion, testedBedrockVersions } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { BedrockClient, BedrockServerboundPackets } from '../../../lib/types/protocol/bedrock-client.ts'
import { blankPacket, roundTrip } from './codec.ts'
import type { BedrockCodec } from './codec.ts'

/** BEDROCK_VERSIONS=1.16.201,1.26: 1.16.201 and every 1.26 */
export function bedrockTestVersions (names = process.env['BEDROCK_VERSIONS']): BedrockVersion[] {
  const only = names?.split(',').map(version => version.trim().replace(/^bedrock_/, '')).filter(version => version !== '')
  if (only === undefined || only.length === 0) return [...testedBedrockVersions]
  const named = (version: BedrockVersion, start: string): boolean => `${version}.`.startsWith(`bedrock_${start}.`)
  const unmatched = only.filter(start => !testedBedrockVersions.some(version => named(version, start)))
  if (unmatched.length > 0) throw new Error(`BEDROCK_VERSIONS: ${unmatched.join(', ')} is no supported Bedrock version (${testedBedrockVersions.join(', ')})`)
  return testedBedrockVersions.filter(version => only.some(start => named(version, start)))
}

export function bedrockTestVersionsFrom (oldest: BedrockVersion, latest: BedrockVersion = latestSupportedBedrockVersion): BedrockVersion[] {
  const [from, to] = [testedBedrockVersions.indexOf(oldest), testedBedrockVersions.indexOf(latest)]
  return bedrockTestVersions().filter(version => testedBedrockVersions.indexOf(version) >= from && testedBedrockVersions.indexOf(version) <= to)
}

export type ClientboundPacketsToWrite = MCProtocol.Bedrock.Write.Clientbound.Packets

export interface SentPacket {
  name: string
  params: object
}

/**
 * Every packet goes through the version's codec both ways. It does what bedrock-protocol's Client does on player_spawn
 * (Client.onPlayStatus), disconnect and close.
 */
export class FakeBedrockClient extends EventEmitter implements BedrockClient {
  readonly codec: BedrockCodec
  readonly sent: SentPacket[] = []
  closed = false
  private runtimeEntityId: bigint | undefined
  private initialized = false

  constructor (codec: BedrockCodec) {
    super()
    this.codec = codec
  }

  write<Name extends keyof BedrockServerboundPackets> (name: Name, params: BedrockServerboundPackets[Name]): void {
    this.sent.push({ name, params: roundTrip(this.codec, name, params) })
  }

  queue<Name extends keyof BedrockServerboundPackets> (name: Name, params: BedrockServerboundPackets[Name]): void {
    this.write(name, params)
  }

  close (): void {
    if (this.closed) return
    this.closed = true
    this.emit('close')
    this.removeAllListeners()
  }

  send<Name extends keyof ClientboundPacketsToWrite> (name: Name, fields: Partial<ClientboundPacketsToWrite[Name]> = {}): void {
    this.deliver(name, roundTrip(this.codec, name, { ...blankPacket(this.codec, name), ...fields }))
  }

  private deliver (name: string, params: object): void {
    if (this.closed) throw new Error(`${this.codec.version}: ${name} sent to a closed client`)
    if (name === 'start_game' && 'runtime_entity_id' in params && typeof params.runtime_entity_id === 'bigint') {
      this.runtimeEntityId = params.runtime_entity_id
    }
    if (name === 'play_status' && 'status' in params && params.status === 'player_spawn' && !this.initialized) {
      this.initialized = true
      const initialize = (): void => this.write('set_local_player_as_initialized', { runtime_entity_id: this.runtimeEntityId ?? 0n })
      // on, not once, as bedrock-protocol
      if (this.runtimeEntityId === undefined || this.runtimeEntityId === 0n) this.on('start_game', initialize)
      else initialize()
      this.emit('spawn')
    }
    this.emit(name, params)
    if (name === 'disconnect') {
      this.emit('kick', params)
      this.close()
    }
  }
}
