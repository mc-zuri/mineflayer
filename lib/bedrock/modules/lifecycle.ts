import type { BedrockCore } from '../core/core.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { LocalPlayer } from './movement.ts'
import type { NetworkWorld } from './world.ts'

const OWNER = 'lifecycle'
/** how long a respawned player waits for the columns around it */
const LOAD_TICKS = 200
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
/** the vanilla client's face of a player action on no block */
const NO_FACE = -1
const RESPAWN_REQUEST = 2

type Vital = 'health' | 'food' | 'foodSaturation'

/** the player's attributes the bot keeps, by the name update_attributes gives them */
const VITALS: ReadonlyArray<readonly [string, Vital]> = Object.freeze([['minecraft:health', 'health'], ['minecraft:player.hunger', 'food'], ['minecraft:player.saturation', 'foodSaturation']])

/**
 * The player's life after the join: its health, food and saturation, its death, which stops its auth inputs, and its
 * respawn, asked for by the bot and answered as the vanilla client answers it.
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
  /** the ticks a respawned player has waited for the columns around it */
  private loading: number | undefined
  /** spawn is due at the end of the first tick the respawned player moves with health: the next one, once it moves */
  private spawn: 'none' | 'nextTick' | 'due' = 'none'

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
      outbox.queue('player_action', this.respawnAction())
      if (this.dead) this.revive(core)
    })
    core.system(OWNER, { name: 'lifecycle.load', place: { after: 'session.activate' }, gate: 'present', replay: false, run: () => { this.load(core) } })
    core.endOfTick(OWNER, () => {
      if (this.spawn === 'nextTick') this.spawn = 'due'
      else if (this.spawn === 'due' && this.bot.health > 0) {
        this.spawn = 'none'
        core.emit(this.bot, 'spawn')
      }
    })
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

  /** the server shows the player again: up to 1.19.40 it moves at once, from 1.19.50 once the columns around it are loaded */
  private revive (core: BedrockCore): void {
    this.dead = false
    core.activation.present = true
    if (this.atLeast('bedrock_1.19.50')) this.loading = 0
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
    if (notLoaded.length > 0) core.emit(this.bot, 'error', new Error(`the columns ${notLoaded.map(({ x, z }) => `(${x}, ${z})`).join(', ')} around the player were not loaded ${LOAD_TICKS} ticks after it respawned`))
    this.loading = undefined
    // it moves from the next tick
    core.activation.active = true
    this.spawn = 'nextTick'
  }

  /** asked in the input pass, while the player is dead: the vanilla client asks again on each click */
  private requestRespawn (core: BedrockCore): void {
    core.command(({ outbox }) => {
      if (this.dead) outbox.queue('respawn', this.respawnRequest())
    })
  }

  private respawnRequest (): BedrockServerboundPackets['respawn'] {
    if (this.atLeast('bedrock_1.16.220')) return { position: ORIGIN, state: RESPAWN_REQUEST, runtime_entity_id: this.runtimeEntityId }
    return { ...ORIGIN, state: RESPAWN_REQUEST, runtime_entity_id: this.sentRuntimeId() }
  }

  private respawnAction (): BedrockServerboundPackets['player_action'] {
    const action = { runtime_entity_id: this.sentRuntimeId(), action: 'respawn', position: ORIGIN, face: NO_FACE } as const
    return this.atLeast('bedrock_1.19.1') ? { ...action, result_position: ORIGIN } : action
  }

  /** the runtime id as the version writes it: a varint on 1.16.201, a varint64 after */
  private sentRuntimeId (): number | bigint {
    return this.atLeast('bedrock_1.16.210') ? this.runtimeEntityId : Number(BigInt.asIntN(32, this.runtimeEntityId))
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}
