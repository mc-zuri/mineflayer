import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter, TickContext } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { LocalPlayer } from './movement.ts'
import { chunkCoordinate } from './world.ts'
import type { NetworkWorld } from './world.ts'

const OWNER = 'session'
/** how long the bot waits for the column under the player, then for the columns around it */
const SHOW_TICKS = 200

/** The connection's life: the server's handshake packets, answered as the vanilla client answers them, and the ends. */
export class Session {
  /** why the bot ends: the kick's reason, or the one bot.end() was given */
  endReason: string | undefined
  loggedIn = false
  private runtimeEntityId = 0n
  private readonly bot: BedrockBotInternal
  private readonly viewDistance: number | undefined
  private readonly world: NetworkWorld
  private readonly player: LocalPlayer
  /** play_status player_spawn, and respawn's ready state: the server spawned the player */
  private readonly spawnSignals = { playerSpawn: false, respawned: false }
  /** the ticks since both spawn signals, without the column under the player */
  private waitedForColumn = 0
  private shownAt = 0
  /** set_local_player_as_initialized's tick, and spawn's, once the player moves */
  private initializeAt: number | undefined
  private spawnAt: number | undefined
  private readonly spawnHooks: Array<() => void> = []

  constructor (bot: BedrockBotInternal, viewDistance: number | undefined, world: NetworkWorld, player: LocalPlayer) {
    this.bot = bot
    this.viewDistance = viewDistance
    this.world = world
    this.player = player
  }

  /** run right after spawn is emitted */
  afterSpawn (run: () => void): void {
    this.spawnHooks.push(run)
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
      if (packet.status === 'player_spawn') this.spawnSignals.playerSpawn = true
    })
    core.observe(OWNER, 'respawn', packet => {
      if (packet.state === 1) this.spawnSignals.respawned = true
    })
    core.handle(OWNER, 'start_game', (packet, ctx) => {
      core.startTicks()
      this.runtimeEntityId = packet.runtime_entity_id
      this.loggedIn = true
      this.answerStartGame(ctx.outbox)
      this.bot.emit('login')
    }, { critical: true })
    core.system(OWNER, { name: 'session.activate', place: { after: 'movement.sendInput' }, gate: 'present', replay: false, run: ctx => { this.activate(core, ctx) } })
    core.endOfTick(OWNER, ({ tick }) => {
      if (tick === this.spawnAt) {
        core.emit(this.bot, 'spawn')
        for (const run of this.spawnHooks) run()
      }
      this.show(core, tick)
    })
  }

  /**
   * The server shows the player once it spawned it and the column under it is shown: its auth inputs start the next
   * tick. Up to 1.17.40 it moves from then; from 1.18.0 its auth inputs are held until the columns around it are loaded.
   */
  private show (core: BedrockCore, tick: number): void {
    if (core.activation.present || !this.spawnSignals.playerSpawn || !this.spawnSignals.respawned) return
    const { x, z } = this.player.feet
    if (!this.world.columnPresent(x, z)) {
      if (++this.waitedForColumn < SHOW_TICKS) return
      core.emit(this.bot, 'error', new Error(`the column (${chunkCoordinate(x)}, ${chunkCoordinate(z)}) under the player was not sent ${SHOW_TICKS} ticks after it spawned`))
    }
    core.activation.present = true
    this.shownAt = tick
    if (!this.atLeast('bedrock_1.18.0')) this.startMoving(core, tick)
  }

  /** after the tick's auth input: the player moves once the columns around it are loaded, then is initialized */
  private activate (core: BedrockCore, { tick, outbox }: TickContext): void {
    if (!core.activation.active) {
      const notLoaded = this.world.notLoadedAround(this.player.feet, 1)
      if (notLoaded.length > 0 && tick - this.shownAt < SHOW_TICKS) return
      if (notLoaded.length > 0) core.emit(this.bot, 'error', new Error(`the columns ${notLoaded.map(({ x, z }) => `(${x}, ${z})`).join(', ')} around the player were not loaded ${SHOW_TICKS} ticks after it showed`))
      this.startMoving(core, tick)
    }
    if (tick !== this.initializeAt) return
    if (this.atLeast('bedrock_1.21.20')) outbox.queue('serverbound_loading_screen', { type: 2 })
    outbox.queue('set_local_player_as_initialized', { runtime_entity_id: this.runtimeEntityId })
  }

  /** the player moves from the next tick; it is initialized when the vanilla client of the version is, and spawns then */
  private startMoving (core: BedrockCore, tick: number): void {
    core.activation.active = true
    const moving = tick + 1
    this.initializeAt = moving + this.initializedAfter()
    this.spawnAt = Math.max(this.initializeAt, moving)
  }

  /** set_local_player_as_initialized's tick, counted from the first the player moves (from 1.21.20 the tick before it) */
  private initializedAfter (): number {
    if (!this.atLeast('bedrock_1.18.0')) return 4
    if (!this.atLeast('bedrock_1.20.61')) return 12
    if (!this.atLeast('bedrock_1.21.20')) return 7
    return -1
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

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}

function kickReason (packet: BedrockClientboundPackets['disconnect']): string {
  // 1.21.20+ servers can hide the message, and send the reason's code
  return packet.message ?? String(packet.reason)
}
