import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'resource_packs'

type Status = 'refused' | 'send_packs' | 'have_all_packs' | 'completed'

/** the status's name, which the response carries from 1.26.40 (refused's is the server's label, not recorded) */
const STATUS_NAMES: Readonly<Record<Status, string>> = Object.freeze({
  refused: 'cancel',
  send_packs: 'downloading',
  have_all_packs: 'downloadingfinished',
  completed: 'resourcepackstackfinished'
})

interface Pack {
  /** what the server names the pack by in a download: `<uuid>_<version>` */
  id: string
  uuid: string
  /** where the pack can be fetched from instead, else '' */
  url: string
}

interface Offer {
  decision: 'accept' | 'deny' | undefined
}

interface Download {
  chunkCount: number | undefined
  received: Set<number>
}

/** a texture pack's or a behaviour pack's entry */
interface PackInfo {
  uuid: string
  version: string
  cdn_url?: string | undefined
}

/** the uuid type reads the bytes in order; a pack's uuid is two little-endian 64-bit halves */
function uuidOfHalves (read: string): string {
  const bytes = Buffer.from(read.replaceAll('-', ''), 'hex')
  const hex = Buffer.concat([bytes.subarray(0, 8).reverse(), bytes.subarray(8).reverse()]).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

/**
 * The packs the server offers in the join: each emitted as `resourcePack`, whose listeners may accept them (downloaded
 * over the connection as the vanilla client does) or deny them; by default the bot has them all, as a vanilla client
 * holding them in its cache.
 */
export class ResourcePacks {
  private readonly bot: BedrockBotInternal
  /** the decision the offer's listeners made, while they run */
  private offer: Offer | undefined
  /** the packs asked for, by id */
  private readonly downloads = new Map<string, Download>()

  constructor (bot: BedrockBotInternal) {
    this.bot = bot
  }

  install (core: BedrockCore): void {
    this.bot.acceptResourcePack = () => { this.decide('acceptResourcePack', 'accept') }
    this.bot.denyResourcePack = () => { this.decide('denyResourcePack', 'deny') }
    core.handle(OWNER, 'resource_packs_info', (packet, ctx) => { this.answerOffer(core, packet, ctx.outbox) })
    core.handle(OWNER, 'resource_pack_data_info', (packet, ctx) => {
      // package_id up to 1.16.210
      const id = String(packet.pack_id ?? packet.package_id)
      const download = this.downloads.get(id)
      if (download === undefined) return
      download.chunkCount = packet.chunk_count
      for (let index = 0; index < packet.chunk_count; index++) this.requestChunk(ctx.outbox, id, index)
      this.finishDownloads(ctx.outbox)
    })
    core.handle(OWNER, 'resource_pack_chunk_data', (packet, ctx) => {
      const download = this.downloads.get(String(packet.pack_id ?? packet.package_id))
      if (download === undefined) return
      download.received.add(packet.chunk_index)
      this.finishDownloads(ctx.outbox)
    })
    core.handle(OWNER, 'resource_pack_stack', (_packet, ctx) => { this.respond(ctx.outbox, 'completed', []) })
  }

  private decide (member: string, decision: NonNullable<Offer['decision']>): void {
    if (this.offer === undefined) throw new Error(`${member}: no resource pack is offered now: call it from a resourcePack listener`)
    this.offer.decision = decision
  }

  /** the listeners decide while they run: the answer leaves in this frame, as the join cannot wait for a later one */
  private answerOffer (core: BedrockCore, packet: BedrockClientboundPackets['resource_packs_info'], outbox: OutboxWriter): void {
    const packs = [...packet.texture_packs, ...packet.behaviour_packs ?? []].map(pack => this.packOf(packet, pack))
    const offer: Offer = { decision: undefined }
    this.offer = offer
    for (const pack of packs) core.emit(this.bot, 'resourcePack', pack.url, undefined, pack.uuid)
    this.offer = undefined
    this.downloads.clear()
    // the vanilla client fetches a pack with a URL from it, not over the connection
    const asked = offer.decision === 'accept' ? packs.filter(pack => pack.url === '').map(pack => pack.id) : []
    for (const id of asked) this.downloads.set(id, { chunkCount: undefined, received: new Set() })
    if (offer.decision === 'deny') this.respond(outbox, 'refused', [])
    else if (asked.length > 0) this.respond(outbox, 'send_packs', asked)
    else this.respond(outbox, 'have_all_packs', [])
  }

  private packOf (packet: BedrockClientboundPackets['resource_packs_info'], pack: PackInfo): Pack {
    // the uuid type from 1.21.50, a string before
    const uuid = this.atLeast('bedrock_1.21.50') ? uuidOfHalves(pack.uuid) : pack.uuid
    const id = `${uuid}_${pack.version}`
    // a URL per pack from 1.21.42, in a list by id 1.20.30 – 1.21.30
    const url = pack.cdn_url ?? packet.resource_pack_links?.find(link => link.id === id)?.url ?? ''
    return { id, uuid, url }
  }

  /** after the last chunk of the last pack */
  private finishDownloads (outbox: OutboxWriter): void {
    const done = [...this.downloads.values()].every(({ chunkCount, received }) => chunkCount !== undefined && received.size >= chunkCount)
    if (!done) return
    this.downloads.clear()
    this.respond(outbox, 'have_all_packs', [])
  }

  private requestChunk (outbox: OutboxWriter, id: string, index: number): void {
    if (this.atLeast('bedrock_1.16.220')) outbox.queue('resource_pack_chunk_request', { pack_id: id, chunk_index: index })
    else outbox.queue('resource_pack_chunk_request', { package_id: id, chunk_index: index })
  }

  /** from 1.26.40 with the status's name, and the ids only for send_packs */
  private respond (outbox: OutboxWriter, status: Status, ids: string[]): void {
    if (!this.atLeast('bedrock_1.26.40')) outbox.queue('resource_pack_client_response', { response_status: status, resourcepackids: ids })
    else if (status === 'send_packs') outbox.queue('resource_pack_client_response', { response_status: status, response_status_name: STATUS_NAMES[status], resourcepackids: ids })
    else outbox.queue('resource_pack_client_response', { response_status: status, response_status_name: STATUS_NAMES[status] })
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}
