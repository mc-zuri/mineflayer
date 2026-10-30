import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter, TickContext } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets, BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { LocalPlayer } from './movement.ts'
import { chunkCoordinate } from './world.ts'
import type { NetworkWorld } from './world.ts'

const OWNER = 'lifecycle'
/** how long a respawned player waits for the columns around it, and a dimension change for what it waits for */
const LOAD_TICKS = 200
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
/** the vanilla client's face of a player action on no block */
const NO_FACE = -1
const RESPAWN_REQUEST = 2
/** show_credits' status: the credits start, then end */
const CREDITS_START = 0
const CREDITS_END = 1
/** serverbound_loading_screen's type: the loading screen shows, then hides */
const LOADING_SCREEN_SHOWN = 1
const LOADING_SCREEN_HIDDEN = 2
/** the ticks from the acknowledgement of a dimension change to the end of its loading screen */
const LOADING_SCREEN_TICKS = 2

type Vital = 'health' | 'food' | 'foodSaturation'

/** the player's attributes the bot keeps, by the name update_attributes gives them */
const VITALS: ReadonlyArray<readonly [string, Vital]> = Object.freeze([['minecraft:health', 'health'], ['minecraft:player.hunger', 'food'], ['minecraft:player.saturation', 'foodSaturation']])

/** a dimension change, until the player moves in the new dimension */
interface Hold {
  /** change_dimension's loading screen (from 1.21.20, when it names one) */
  readonly loadingScreenId: number | undefined
  /** it came to a living player: from 1.19.50 it goes on if the player dies */
  readonly toLiving: boolean
  /** the server's dimension_change_ack came: from 1.19.50 it says the server placed the player */
  serverAck: boolean
  /** move_player or respawn's ready state placed the player: up to 1.19.40 it is shown once placed */
  placed: boolean
  /** the bot's dimension_change_ack was sent */
  acked: boolean
  /** the ticks waited for the server */
  waited: number
  /** the tick the loading screen hides */
  hideAt: number | undefined
}

/**
 * The player's life after the join: its health, food and saturation, its death, which stops its auth inputs, its
 * respawn, asked for by the bot, and its dimension changes, each answered as the vanilla client answers it.
 */
export class Lifecycle {
  private readonly bot: BedrockBotInternal
  private readonly world: NetworkWorld
  private readonly player: LocalPlayer
  private readonly autoRespawn: boolean
  /** start_game's runtime id of the player */
  private runtimeEntityId = 0n
  /** the server told the health: hunger or saturation may come before it, which leaves the player alive */
  private healthTold = false
  /** the join's respawn ready state came: the next ones respawn the player */
  private joined = false
  /** from the death until respawn's ready state: the server does not show the player */
  private dead = false
  /** the ticks a shown player has waited for the columns around it */
  private loading: number | undefined
  /** spawn is due at the end of the first tick the respawned player moves with health: the next one, once it moves */
  private spawn: 'none' | 'nextTick' | 'due' = 'none'
  private hold: Hold | undefined
  /** a respawn asked for by a player that died during a dimension change: it is asked once the change ends */
  private respawnAsked = false

  constructor (bot: BedrockBotInternal, world: NetworkWorld, player: LocalPlayer, { autoRespawn }: { autoRespawn: boolean }) {
    this.bot = bot
    this.world = world
    this.player = player
    this.autoRespawn = autoRespawn
  }

  install (core: BedrockCore): void {
    this.bot.isAlive = true
    this.bot.respawn = () => { this.requestRespawn(core) }
    core.observe(OWNER, 'start_game', packet => { this.runtimeEntityId = packet.runtime_entity_id })
    core.observe(OWNER, 'update_attributes', packet => {
      if (packet.runtime_entity_id !== this.runtimeEntityId) return
      let changed = false
      for (const { name, current } of packet.attributes) {
        const vital = VITALS.find(([named]) => named === name)?.[1]
        if (vital === undefined || this.bot[vital] === current) continue
        if (vital === 'health') this.healthTold = true
        this.bot[vital] = current
        changed = true
      }
      if (changed) this.vitalsChanged(core)
    })
    core.handle(OWNER, 'set_health', packet => {
      if (packet.health === this.bot.health) return
      this.healthTold = true
      this.bot.health = packet.health
      this.vitalsChanged(core)
    })
    core.observe(OWNER, 'respawn', (packet, { outbox }) => {
      if (packet.state !== 1) return
      if (!this.joined) {
        this.joined = true
        return
      }
      outbox.queue('player_action', this.playerAction('respawn', NO_FACE))
      if (this.hold !== undefined) this.hold.placed = true
      if (this.dead) this.revive(core)
    })
    core.handle(OWNER, 'change_dimension', (packet, { outbox }) => { this.changeDimension(core, packet, outbox) })
    core.handle(OWNER, 'player_action', packet => {
      if (packet.action === 'dimension_change_ack' && this.hold !== undefined) this.hold.serverAck = true
    })
    core.observe(OWNER, 'move_player', packet => {
      if (this.hold !== undefined && packet.mode !== 'rotation' && this.player.isLocalPlayer(packet.runtime_id)) this.hold.placed = true
    })
    core.handle(OWNER, 'show_credits', (packet, { outbox }) => {
      // the vanilla client tells the credits ended once they rolled; the bot at once, as Java's
      if (packet.status === CREDITS_START && this.player.isLocalPlayer(packet.runtime_entity_id)) outbox.queue('show_credits', { runtime_entity_id: this.sentRuntimeId(), status: CREDITS_END })
    })
    // the vanilla client asks for the sections of the columns sent while its player is dead, as alive, but while a
    // dimension change hides it
    core.system(OWNER, { name: 'lifecycle.requestSubchunks', place: { after: 'world.requestSubchunks' }, gate: 'always', replay: false, run: ({ outbox }) => { if (this.dead && (this.hold === undefined || this.freezes)) this.world.requestSections(outbox) } })
    core.system(OWNER, { name: 'lifecycle.load', place: { after: 'session.activate' }, gate: 'present', replay: false, run: () => { this.load(core) } })
    core.system(OWNER, { name: 'lifecycle.hold', place: { after: 'lifecycle.load' }, gate: 'always', replay: false, run: ctx => { this.holdPlayer(core, ctx) } })
    core.endOfTick(OWNER, () => {
      if (this.spawn === 'nextTick') this.spawn = 'due'
      else if (this.spawn === 'due' && this.bot.health > 0) {
        this.spawn = 'none'
        core.emit(this.bot, 'spawn')
      }
    })
  }

  /** from 1.19.50 a dimension change freezes the player, sending its auth inputs; before, it hides it */
  private get freezes (): boolean {
    return this.atLeast('bedrock_1.19.50')
  }

  /** health, then death when it falls to 0, as Java's; the player is alive again once it has health */
  private vitalsChanged (core: BedrockCore): void {
    core.emit(this.bot, 'health')
    if (!this.healthTold) return
    if (this.bot.health > 0) {
      this.bot.isAlive = true
      return
    }
    if (!this.bot.isAlive) return
    this.bot.isAlive = false
    this.die(core)
    core.emit(this.bot, 'death')
    if (this.autoRespawn) this.requestRespawn(core)
  }

  /** the vanilla client stops its auth inputs; respawn's placement starts the ring again. No spawn is due until then */
  private die (core: BedrockCore): void {
    this.dead = true
    core.activation.present = false
    core.activation.active = false
    this.spawn = 'none'
  }

  /**
   * the server shows the player again: up to 1.19.40 it moves at once (the placement ended a dimension change), from
   * 1.19.50 once the columns around it are loaded, or a dimension change it is frozen by ends
   */
  private revive (core: BedrockCore): void {
    this.dead = false
    core.activation.present = true
    if (this.freezes && this.hold !== undefined) return
    this.hold = undefined
    if (this.freezes) this.loading = 0
    else {
      core.activation.active = true
      this.spawn = 'due'
    }
  }

  /** after the tick's auth input, as at the join */
  private load (core: BedrockCore): void {
    if (this.loading === undefined) return
    const notLoaded = this.world.notLoadedAround(this.player.feet, 1)
    if (notLoaded.length > 0 && ++this.loading < LOAD_TICKS) return
    if (notLoaded.length > 0) core.emit(this.bot, 'error', new Error(`the columns ${columnsOf(notLoaded)} around the player were not loaded ${LOAD_TICKS} ticks after it showed again`))
    this.loading = undefined
    this.moveFromNextTick(core)
  }

  /**
   * The vanilla client shows its loading screen at once (from 1.21.20, when the server names one), and holds the player
   * where change_dimension puts its feet: up to 1.19.40 without its auth inputs, from 1.19.50 with them, frozen. A dead
   * player acknowledges it at once up to 1.19.40; from 1.19.50 once respawned, as a living one. One that dies during it
   * from 1.19.50 still acknowledges it, dead, once the columns are loaded.
   */
  private changeDimension (core: BedrockCore, packet: BedrockClientboundPackets['change_dimension'], outbox: OutboxWriter): void {
    const { loading_screen_id: loadingScreenId } = packet
    if (loadingScreenId !== undefined) outbox.queue('serverbound_loading_screen', { type: LOADING_SCREEN_SHOWN, loading_screen_id: loadingScreenId })
    this.hold = { loadingScreenId, toLiving: !this.dead, serverAck: false, placed: false, acked: false, waited: 0, hideAt: undefined }
    this.loading = undefined
    this.spawn = 'none'
    core.activation.active = false
    if (this.freezes) {
      this.player.freeze()
      return
    }
    core.activation.present = false
    if (this.dead) this.acknowledge(this.hold, outbox)
  }

  /** after the tick's auth input, while the player lives or the change goes on for a dead one */
  private holdPlayer (core: BedrockCore, { tick, outbox }: TickContext): void {
    const { hold } = this
    if (hold === undefined || (this.dead && !this.goesOnDead(hold))) return
    if (this.freezes) this.holdFrozen(core, hold, tick, outbox)
    else this.holdHidden(core, hold, outbox)
  }

  /**
   * up to 1.19.40 the server sends no acknowledgement: the vanilla client acknowledges the change once the column under
   * the player is shown, and shows the player once the server placed it too, from the next tick. Up to 1.17.40 the
   * player moves at once; from 1.18.0 once the columns around it are loaded, as at the join
   */
  private holdHidden (core: BedrockCore, hold: Hold, outbox: OutboxWriter): void {
    const { x, z } = this.player.feet
    const shown = this.world.columnPresent(x, z)
    const waited = ++hold.waited >= LOAD_TICKS
    if (!hold.acked && !shown && waited) core.emit(this.bot, 'error', new Error(`the column (${chunkCoordinate(x)}, ${chunkCoordinate(z)}) under the player was not sent ${LOAD_TICKS} ticks after the dimension change`))
    if (!hold.acked && (shown || waited)) this.acknowledge(hold, outbox)
    if (!hold.acked || (!hold.placed && !waited)) return
    if (!hold.placed) core.emit(this.bot, 'error', new Error(`the server did not place the player ${LOAD_TICKS} ticks after the dimension change`))
    this.hold = undefined
    core.activation.present = true
    if (this.atLeast('bedrock_1.18.0')) this.loading = 0
    else this.moveFromNextTick(core)
  }

  /**
   * from 1.19.50 the server acknowledges the change once it placed the player: the vanilla client acknowledges it once
   * the columns around the player are loaded too, and the player moves from the next tick; with a loading screen, from
   * the tick after the screen hides
   */
  private holdFrozen (core: BedrockCore, hold: Hold, tick: number, outbox: OutboxWriter): void {
    if (hold.acked) {
      if (tick !== hold.hideAt) return
      outbox.queue('serverbound_loading_screen', { type: LOADING_SCREEN_HIDDEN, loading_screen_id: hold.loadingScreenId })
      this.unfreeze(core, outbox)
      return
    }
    const notLoaded = this.world.notLoadedAround(this.player.feet, 1)
    if ((!hold.serverAck || notLoaded.length > 0) && ++hold.waited < LOAD_TICKS) return
    if (!hold.serverAck) core.emit(this.bot, 'error', new Error(`the server did not acknowledge the dimension change ${LOAD_TICKS} ticks after it`))
    if (notLoaded.length > 0) core.emit(this.bot, 'error', new Error(`the columns ${columnsOf(notLoaded)} around the player were not loaded ${LOAD_TICKS} ticks after the dimension change`))
    this.acknowledge(hold, outbox)
    if (hold.loadingScreenId === undefined) this.unfreeze(core, outbox)
    else hold.hideAt = tick + LOADING_SCREEN_TICKS
  }

  private acknowledge (hold: Hold, outbox: OutboxWriter): void {
    outbox.queue('player_action', this.playerAction('dimension_change_ack', 0))
    hold.acked = true
  }

  /** a dead player moves once respawned; the respawn it asked for during the change is asked now */
  private unfreeze (core: BedrockCore, outbox: OutboxWriter): void {
    this.hold = undefined
    this.player.release()
    if (!this.dead) this.moveFromNextTick(core)
    else if (this.respawnAsked) outbox.queue('respawn', this.respawnRequest())
    this.respawnAsked = false
  }

  private goesOnDead (hold: Hold): boolean {
    return this.freezes && hold.toLiving
  }

  private moveFromNextTick (core: BedrockCore): void {
    core.activation.active = true
    this.spawn = 'nextTick'
  }

  /**
   * asked in the input pass, while the player is dead: the vanilla client asks again on each click, and shows its death
   * screen to a player that died during a dimension change once the change ended
   */
  private requestRespawn (core: BedrockCore): void {
    core.command(({ outbox }) => {
      if (!this.dead) return
      if (this.hold !== undefined && this.goesOnDead(this.hold)) this.respawnAsked = true
      else outbox.queue('respawn', this.respawnRequest())
    })
  }

  private respawnRequest (): BedrockServerboundPackets['respawn'] {
    if (this.atLeast('bedrock_1.16.220')) return { position: ORIGIN, state: RESPAWN_REQUEST, runtime_entity_id: this.runtimeEntityId }
    return { ...ORIGIN, state: RESPAWN_REQUEST, runtime_entity_id: this.sentRuntimeId() }
  }

  private playerAction (action: 'respawn' | 'dimension_change_ack', face: number): BedrockServerboundPackets['player_action'] {
    const packet = { runtime_entity_id: this.sentRuntimeId(), action, position: ORIGIN, face }
    return this.atLeast('bedrock_1.19.1') ? { ...packet, result_position: ORIGIN } : packet
  }

  /** the runtime id as the version writes it: a varint on 1.16.201, a varint64 after */
  private sentRuntimeId (): number | bigint {
    return this.atLeast('bedrock_1.16.210') ? this.runtimeEntityId : Number(BigInt.asIntN(32, this.runtimeEntityId))
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}

function columnsOf (columns: ReadonlyArray<{ x: number, z: number }>): string {
  return columns.map(({ x, z }) => `(${x}, ${z})`).join(', ')
}
