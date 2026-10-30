import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'session'

/** The connection's life: the server's handshake packets, answered as the vanilla client answers them, and the ends. */
export class Session {
  /** why the bot ends: the kick's reason, or the one bot.end() was given */
  endReason: string | undefined
  loggedIn = false
  runtimeEntityId: bigint | undefined
  private readonly bot: BedrockBotInternal
  private readonly viewDistance: number | undefined

  constructor (bot: BedrockBotInternal, viewDistance: number | undefined) {
    this.bot = bot
    this.viewDistance = viewDistance
  }

  install (core: BedrockCore): void {
    core.onNotice(OWNER, notice => {
      if (notice.kind === 'error') this.bot.emit('error', notice.error)
      if (notice.kind === 'closed') this.bot.emit('end', this.endReason ?? 'socketClosed')
    })
    core.handle(OWNER, 'disconnect', packet => {
      this.endReason = kickReason(packet)
      this.bot.emit('kicked', this.endReason, this.loggedIn)
    })
    core.handle(OWNER, 'resource_packs_info', (_packet, ctx) => { this.answerResourcePacks(ctx.outbox, 'have_all_packs', 'downloadingfinished') })
    core.handle(OWNER, 'resource_pack_stack', (_packet, ctx) => { this.answerResourcePacks(ctx.outbox, 'completed', 'resourcepackstackfinished') })
    core.handle(OWNER, 'network_stack_latency', (packet, ctx) => {
      // the field is named unknown_flag up to 1.16.210
      if ('unknown_flag' in packet && packet.unknown_flag !== 0) ctx.outbox.queue('network_stack_latency', { timestamp: packet.timestamp, unknown_flag: 0 })
      if ('needs_response' in packet && packet.needs_response !== 0) ctx.outbox.queue('network_stack_latency', { timestamp: packet.timestamp, needs_response: 0 })
    })
    core.handle(OWNER, 'play_status', (packet, ctx) => {
      // the bot keeps no client cache of chunks
      if (packet.status === 'login_success') ctx.outbox.queue('client_cache_status', { enabled: false })
      if (packet.status === 'player_spawn') {
        if (this.runtimeEntityId === undefined) throw new Error('play_status player_spawn before start_game')
        ctx.outbox.queue('set_local_player_as_initialized', { runtime_entity_id: this.runtimeEntityId })
        this.bot.emit('spawn')
      }
    })
    core.handle(OWNER, 'start_game', (packet, ctx) => {
      core.startTicks()
      this.runtimeEntityId = packet.runtime_entity_id
      this.loggedIn = true
      this.answerStartGame(ctx.outbox)
      this.bot.emit('login')
    }, { critical: true })
  }

  private answerResourcePacks (outbox: OutboxWriter, status: 'have_all_packs' | 'completed', statusName: string): void {
    if (this.atLeast('bedrock_1.26.40')) outbox.queue('resource_pack_client_response', { response_status: status, response_status_name: statusName })
    else outbox.queue('resource_pack_client_response', { response_status: status, resourcepackids: [] })
  }

  private answerStartGame (outbox: OutboxWriter): void {
    const chunkRadius = this.viewDistance ?? (this.atLeast('bedrock_1.21.90') ? 12 : 8)
    if (this.atLeast('bedrock_1.19.80')) outbox.queue('request_chunk_radius', { chunk_radius: chunkRadius, max_radius: 28 })
    else outbox.queue('request_chunk_radius', { chunk_radius: chunkRadius })
    if (!this.atLeast('bedrock_1.20.61')) outbox.queue('tick_sync', { request_time: 0n, response_time: 0n })
    if (this.atLeast('bedrock_1.21.20')) outbox.queue('serverbound_loading_screen', { type: 1 })
  }

  private atLeast (since: Parameters<typeof isBedrockVersionAtLeast>[1]): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}

function kickReason (packet: BedrockClientboundPackets['disconnect']): string {
  // 1.21.20+ servers can hide the message, and send the reason's code
  return packet.message ?? String(packet.reason)
}
