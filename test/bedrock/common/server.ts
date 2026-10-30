import assert from 'assert'
import { createBedrockBot } from '../../../lib/bedrock/loader.ts'
import type { BedrockCore } from '../../../lib/bedrock/core/core.ts'
import type { InboxWriter, OutgoingPacket, ServerboundName, Transport } from '../../../lib/bedrock/core/types.ts'
import { latestSupportedBedrockVersion, testedBedrockVersions } from '../../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockBotOptions, BedrockVersion } from '../../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../../lib/types/bedrock-internal.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { BedrockServerboundPackets } from '../../../lib/types/protocol/bedrock-client.ts'
import { blankPacket, readPacket, roundTrip } from './codec.ts'
import type { BedrockCodec } from './codec.ts'
import { ManualDriver } from './driver.ts'

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
 * The server end of a bot's connection, in a test. What it sends reaches the bot's inbox at the driver's time, and what
 * the bot flushes is recorded; every packet goes through the version's codec both ways, as on the wire.
 */
export class FakeBedrockClient implements Transport {
  readonly codec: BedrockCodec
  /** the packets the bot sent, as it wrote them (they read back alike), a 64-bit [high, low] as its bigint */
  readonly sent: SentPacket[] = []
  /** the packets of each flush, with where the bot queued them */
  readonly batches: OutgoingPacket[][] = []
  closed = false
  private inbox: InboxWriter | undefined
  private now: () => number = () => 0

  constructor (codec: BedrockCodec) {
    this.codec = codec
  }

  connect (inbox: InboxWriter): this {
    this.inbox = inbox
    return this
  }

  /** the time the packets it sends arrive at */
  useClock (now: () => number): void {
    this.now = now
  }

  flush (batch: readonly OutgoingPacket[]): void {
    for (const packet of batch) roundTrip(this.codec, packet.name, packet.params)
    this.batches.push([...batch])
    for (const { name, params } of batch) this.sent.push({ name, params: withBigints(params) })
  }

  close (): void {
    if (this.closed) return
    this.closed = true
    this.notice(false)
  }

  send<Name extends keyof ClientboundPacketsToWrite> (name: Name, fields: Partial<ClientboundPacketsToWrite[Name]> = {}): void {
    const params = roundTrip(this.codec, name, { ...blankPacket(this.codec, name), ...fields })
    this.deliver(name, params, this.codec.serializer.createPacketBuffer({ name, params }).length)
  }

  /** a packet as a server sent it on the wire, such as a recorded one */
  receive (buffer: Buffer): void {
    const { name, params } = readPacket(this.codec, buffer)
    this.deliver(name, params, buffer.length)
  }

  /** the names of the packets the bot queued in tick `tick`, in order */
  inTick (tick: number): string[] {
    return this.batches.flat().filter(packet => packet.tick === tick && packet.phase === 'T3').map(packet => packet.name)
  }

  /** the bot's `name` packets, as it queued them */
  sentOf<Name extends ServerboundName> (name: Name): Array<BedrockServerboundPackets[Name]> {
    // the bot queued them as `name` (and they read back as written)
    return this.batches.flat().filter(packet => packet.name === name).map(packet => packet.params as BedrockServerboundPackets[Name])
  }

  /** the bot's auth input of tick `tick` */
  authInput (tick: number): AuthInput {
    const input = this.sentOf('player_auth_input').find(sent => BigInt(sent.tick) === BigInt(tick))
    assert.ok(input !== undefined, `${this.codec.version}: no auth input of tick ${tick}`)
    return input
  }

  private deliver (name: string, params: object, size: number): void {
    if (this.closed) throw new Error(`${this.codec.version}: ${name} sent to a closed connection`)
    this.inboxOrThrow().packet(name, params, size, this.now())
    // bedrock-protocol closes the connection on a kick
    if (name === 'disconnect') {
      this.closed = true
      this.notice(true)
    }
  }

  private notice (byServer: boolean): void {
    this.inboxOrThrow().notice({ kind: 'closed', byServer }, this.now())
  }

  private inboxOrThrow (): InboxWriter {
    if (this.inbox === undefined) throw new Error('no bot is connected')
    return this.inbox
  }
}

export type AuthInput = BedrockServerboundPackets['player_auth_input']

/** an auth input's flags: those set, in the order of their bits, and how the version writes them */
export function inputFlags ({ input_data: flags }: AuthInput): { written: 'number' | 'bigint' | 'list', set: string[] } {
  assert.ok(flags !== undefined, 'the auth input has no flags')
  if (Array.isArray(flags)) return { written: 'list', set: flags.map(String) }
  const { _value: value, ...named } = flags
  return { written: typeof value === 'bigint' ? 'bigint' : 'number', set: Object.entries(named).filter(([, on]) => on === true).map(([name]) => name) }
}

type Field = string | number | boolean | bigint | object | null | undefined

function bigintsOf (field: Field): Field {
  if (typeof field !== 'object' || field === null) return field
  const value = field.valueOf()
  if (typeof value === 'bigint') return value
  if (Array.isArray(field)) return field.map(bigintsOf)
  const entries: Array<[string, Field]> = Object.entries(field)
  return Object.fromEntries(entries.map(([key, entry]) => [key, bigintsOf(entry)]))
}

function withBigints (params: object): object {
  const plain = bigintsOf(params)
  return typeof plain === 'object' && plain !== null ? plain : params
}

export interface TestBot {
  bot: BedrockBot
  /** the plugins' view of the bot */
  internal: BedrockBotInternal
  server: FakeBedrockClient
  driver: ManualDriver
}

/** a bot connected to a fake server, its first frame stepped */
export async function bedrockTestBot (codec: BedrockCodec, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<TestBot> {
  const server = new FakeBedrockClient(codec)
  let core: BedrockCore | undefined
  const bot = createBedrockBot({ hideErrors: true, ...options, version: codec.version }, {
    connect: inbox => server.connect(inbox),
    drive: bedrockCore => { core = bedrockCore }
  })
  if (core === undefined) throw new Error('the bot was not driven')
  const driver = new ManualDriver(core)
  server.useClock(() => driver.now)
  await driver.frame(0)
  return { bot, internal: bot, server, driver }
}
