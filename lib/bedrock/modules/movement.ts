import assert from 'assert'
import prismarineEntity from 'prismarine-entity'
import type { Entity } from 'prismarine-entity'
import { createMovementState, EYE_HEIGHT, feetFromEye, reportedEyePosition, rulesFor, simulateTick, sneakScaledMove } from 'prismarine-physics/lib/bedrock/index.ts'
import type { BedrockRules, MovementState, TickActions, Vec3Data } from 'prismarine-physics/lib/bedrock/index.ts'
import type { Registry } from 'prismarine-registry'
import { Vec3 } from 'vec3'
import { fromNotchianPitch, fromNotchianYaw, toNotchianPitch, toNotchianYaw } from '../../conversions.ts'
import { euclideanMod } from '../../math.ts'
import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter, TickContext } from '../core/types.ts'
import type { DueWait } from '../core/waits.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockPlayer, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import { authInput } from './auth_input.ts'
import type { Movement, Rotation, Vec3f } from './auth_input.ts'
import { agrees, applied, Corrections, rewindsUnder } from './corrections.ts'
import type { Filing, MovementInput } from './corrections.ts'
import type { Controls } from './input.ts'

const OWNER = 'movement'
const PLAYER_HEIGHT = 1.8
const PLAYER_WIDTH = 0.6
const STILL = Object.freeze({ x: 0, y: 0, z: 0 })
const NO_ACTIONS: TickActions = Object.freeze({ startSprinting: false, stopSprinting: false, startSneaking: false, stopSneaking: false, startJumping: false })
/** a held player: still, moving into nothing, its eye reported over its feet */
const HELD = Object.freeze({ velocity: STILL, horizontalCollision: false, verticalCollision: false, stepSlide: 0, reportedFeetY: null })
/** a teleport this far, or farther, starts the ring again */
const FAR_TELEPORT = 16

type EntityLoader = (registry: Registry) => typeof Entity

/** prismarine-entity's module is its loader, which its typings do not declare (docs/typescript/api-mismatches.md) */
function assertEntityLoader (loader: object): asserts loader is EntityLoader {
  assert.ok(typeof loader === 'function', 'prismarine-entity exports its loader')
}

function isFar (from: Vec3f, to: Vec3f): boolean {
  return (to.x - from.x) ** 2 + (to.y - from.y) ** 2 + (to.z - from.z) ** 2 >= FAR_TELEPORT ** 2
}

function sameVector (a: Vec3f, b: Vec3f): boolean {
  return a.x === b.x && a.y === b.y && a.z === b.z
}

/** Bedrock degrees in (-180, 180]: the vanilla client reports looking east as -90, not 270 */
function bedrockYaw (yaw: number): number {
  return 180 - euclideanMod(180 - toNotchianYaw(yaw), 360)
}

function samePose (a: { position: Vec3f, rotation: Rotation }, b: { position: Vec3f, rotation: Rotation }): boolean {
  return sameVector(a.position, b.position) && a.rotation.yaw === b.rotation.yaw && a.rotation.pitch === b.rotation.pitch
}

interface Sent {
  readonly position: Vec3f
  readonly rotation: Rotation
  readonly feet: Vec3
}

/**
 * The local player: where the server places it (start_game, respawn, move_player) and corrects it, where it looks, how
 * the physics move it each tick, and the auth input it sends every tick once the server shows it.
 */
export class LocalPlayer {
  rotation: Rotation = { yaw: 0, pitch: 0 }
  /** the ring of the last ticks, and what became of the server's corrections */
  readonly corrections = new Corrections()
  private state: MovementState = createMovementState(STILL)
  /** what the tick's movement read, for the ring: from the first tick the player moves */
  private input: MovementInput | undefined
  /** what the tick's movement started */
  private actions: TickActions = NO_ACTIONS
  private readonly bot: BedrockBotInternal
  private readonly controls: Controls
  private readonly rules: BedrockRules
  /** bot.entity from start_game */
  private readonly entity: BedrockPlayer
  /** physicsEnabled as the input pass applied it, and as last set */
  private physicsEnabled: boolean
  private physicsRequested: boolean
  /** start_game's runtime id, its low 32 bits: move_player's is a varint */
  private runtimeId: bigint | undefined
  /** the runtime id as the vanilla client writes it in its own move_player and player_action */
  private sentRuntimeId = 0
  /** where the last teleport put the eye, until an auth input answers it */
  private teleport: Vec3f | undefined
  private lastSent: Sent | undefined
  /** the feet the previous auth input reported, when this tick's moved or turned the player */
  private moved: Vec3 | undefined
  /** looks the input pass took, the last of which the look pass applies */
  private looks: Array<{ readonly rotation: Rotation, readonly wait: DueWait }> = []
  /** looks applied, until an auth input carries them */
  private turned: DueWait[] = []
  /** looks asked for and not sent yet */
  private looking = 0

  constructor (bot: BedrockBotInternal, controls: Controls, physicsEnabled: boolean) {
    this.bot = bot
    this.controls = controls
    this.rules = rulesFor(bot.version)
    this.physicsEnabled = physicsEnabled
    this.physicsRequested = physicsEnabled
    this.entity = this.createEntity()
  }

  get feet (): Vec3 {
    const { x, y, z } = this.state.position
    return new Vec3(x, y, z)
  }

  install (core: BedrockCore): void {
    this.bot.look = async (yaw, pitch) => { await this.look(core, yaw, pitch) }
    this.bot.lookAt = async point => {
      const delta = point.minus(this.feet.offset(0, EYE_HEIGHT, 0))
      await this.look(core, Math.atan2(-delta.x, -delta.z), Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z)))
    }
    Object.defineProperty(this.bot, 'physicsEnabled', {
      get: () => this.physicsRequested,
      set: (enabled: boolean) => {
        this.physicsRequested = enabled
        core.command(() => { this.physicsEnabled = enabled })
      }
    })
    core.observe(OWNER, 'start_game', packet => {
      this.runtimeId = BigInt.asUintN(32, packet.runtime_entity_id)
      this.sentRuntimeId = Number(BigInt.asIntN(32, packet.runtime_entity_id))
      this.entity.id = Number(packet.runtime_entity_id)
      this.bot.entity = this.entity
      // absent on 1.16.201: one tick
      this.corrections.history.resize(packet.rewind_history_size ?? 0)
      this.corrections.rewinds = rewindsUnder(packet.movement_authority)
      // 1.16.201 names it spawn
      const eye = packet.player_position ?? packet.spawn
      if (eye !== undefined) this.place(feetFromEye(eye))
      this.turn({ yaw: packet.rotation.z, pitch: packet.rotation.x })
    })
    core.handle(OWNER, 'respawn', packet => {
      if (packet.state !== 1) return
      // up to 1.16.210 the position is x, y, z
      const { position, x, y, z } = packet
      if (position !== undefined) this.placeNow(feetFromEye(position))
      if (x !== undefined && y !== undefined && z !== undefined) this.placeNow(feetFromEye({ x, y, z }))
    })
    core.handle(OWNER, 'move_player', packet => {
      if (!this.isLocalPlayer(packet.runtime_id)) return
      this.turn({ yaw: packet.yaw, pitch: packet.pitch })
      if (packet.mode === 'rotation') return
      this.teleportTo(packet)
      core.emit(this.bot, 'forcedMove')
    })
    core.handle(OWNER, 'correct_player_move_prediction', packet => { this.correct(packet) })
    core.handle(OWNER, 'set_entity_motion', packet => {
      if (this.isLocalPlayer(packet.runtime_entity_id)) this.setMotion(packet)
    })
    core.handle(OWNER, 'set_movement_authority', packet => { this.corrections.rewinds = rewindsUnder(packet.movement_authority) })
    core.system(OWNER, { name: 'movement.rewind', place: { at: 'LocalPlayerRewindSystem' }, gate: 'active', replay: false, run: () => { this.rewind(core) } })
    core.system(OWNER, { name: 'movement.simulate', place: { at: 'PredictedMovementSystem' }, gate: 'active', replay: true, run: ctx => { this.simulate(ctx) } })
    core.system(OWNER, { name: 'movement.sendInput', place: { at: 'SendPlayerInputPacketSystem' }, gate: 'present', replay: false, run: ctx => { this.sendInput(core, ctx) } })
    core.endOfTick(OWNER, ({ tick }) => {
      if (this.input !== undefined) this.corrections.history.record(tick, this.input, this.state)
      this.show()
    })
    core.lookPass(OWNER, () => {
      const look = this.looks[this.looks.length - 1]
      if (look === undefined) return
      this.turn(look.rotation)
      this.turned.push(...this.looks.map(({ wait }) => wait))
      this.looks = []
    })
    core.afterTick(OWNER, () => {
      const previous = this.moved
      this.moved = undefined
      if (previous !== undefined) core.emit(this.bot, 'move', previous)
    })
  }

  private createEntity (): BedrockPlayer {
    assertEntityLoader(prismarineEntity)
    const entity = Object.assign(new (prismarineEntity(this.bot.registry))(0), { isCollidedHorizontally: false, isCollidedVertically: false })
    entity.type = 'player'
    entity.name = 'player'
    entity.username = this.bot.username
    entity.height = PLAYER_HEIGHT
    entity.width = PLAYER_WIDTH
    return entity
  }

  private look (core: BedrockCore, yaw: number, pitch: number): Promise<void> {
    // + 0: a pitch of 0 is -0 degrees, whose float has its sign bit set on the wire
    const rotation = { yaw: Math.fround(bedrockYaw(yaw)), pitch: Math.fround(toNotchianPitch(pitch)) + 0 }
    if (this.looking === 0 && rotation.yaw === this.rotation.yaw && rotation.pitch === this.rotation.pitch) return Promise.resolve()
    this.looking++
    const wait = core.waits.untilDue()
    core.command(() => { this.looks.push({ rotation, wait }) })
    return wait.promise
  }

  /** by the runtime id's low 32 bits: move_player's (and 1.16.201's set_entity_motion's) is a varint */
  private isLocalPlayer (runtimeId: number | bigint): boolean {
    return BigInt.asUintN(32, BigInt(runtimeId)) === this.runtimeId
  }

  private turn (rotation: Rotation): void {
    this.rotation = rotation
    this.entity.yaw = fromNotchianYaw(rotation.yaw)
    this.entity.pitch = fromNotchianPitch(rotation.pitch)
  }

  /** the server put the player anew (start_game, respawn): standing still, off the ground */
  private place (feet: Vec3Data): void {
    this.state = createMovementState(feet)
    this.show()
  }

  /** respawn: the ring would lead elsewhere, so it starts again */
  private placeNow (feet: Vec3Data): void {
    this.corrections.history.clear()
    this.place(feet)
  }

  /** a server packet acting at once: the ring would lead elsewhere, so it starts again */
  private writeNow (filing: Filing): void {
    this.corrections.history.clear()
    this.write(filing)
  }

  private write (filing: Filing): void {
    this.state = applied(this.state, filing)
    this.show()
  }

  private show (): void {
    const { position, velocity, onGround, horizontalCollision, verticalCollision } = this.state
    this.entity.position = new Vec3(position.x, position.y, position.z)
    this.entity.velocity = new Vec3(velocity.x, velocity.y, velocity.z)
    this.entity.onGround = onGround
    this.entity.isCollidedHorizontally = horizontalCollision
    this.entity.isCollidedVertically = verticalCollision
  }

  /** a near teleport stamped with a tick of the ring is filed there, for a rewind over that tick to play it again */
  private teleportTo (packet: BedrockClientboundPackets['move_player']): void {
    const teleport: Filing = { kind: 'teleport', position: feetFromEye(packet.position), onGround: packet.on_ground }
    const tick = this.corrections.rewinds && packet.mode !== 'reset' && !isFar(this.state.position, teleport.position) ? Number(packet.tick) : 0
    const record = tick === 0 ? undefined : this.corrections.recordOf(tick)
    if (record === undefined) this.writeNow(teleport)
    else {
      this.corrections.history.file(record.tick, teleport, false)
      this.write(teleport)
    }
    this.teleport = packet.position
  }

  private correct (packet: BedrockClientboundPackets['correct_player_move_prediction']): void {
    // from 1.20.80 the server corrects the vehicle the player drives too
    if (packet.prediction_type === 'vehicle') return
    const { history, stats } = this.corrections
    const correction: Filing = { kind: 'correction', position: feetFromEye(packet.position), velocity: packet.delta, onGround: packet.on_ground }
    if (!this.corrections.rewinds) this.writeNow(correction)
    else if (packet.tick === 0n) stats.unstamped++
    else {
      const record = this.corrections.recordOf(Number(packet.tick))
      if (record === undefined) return
      if (!history.pending && agrees(record.snapshot, correction)) stats.agreed++
      else this.corrections.file(record, correction)
    }
  }

  private setMotion (packet: BedrockClientboundPackets['set_entity_motion']): void {
    const motion: Filing = { kind: 'motion', velocity: packet.velocity }
    // stamped from 1.20.71
    const tick = this.corrections.rewinds ? Number(packet.tick ?? 0n) : 0
    if (tick === 0) this.writeNow(motion)
    else if (sameVector(packet.velocity, this.state.velocity)) this.corrections.stats.echoes++
    else {
      const record = this.corrections.recordOf(tick)
      if (record !== undefined) this.corrections.file(record, motion)
    }
  }

  /**
   * The first system of a tick after a packet was filed on a past one: the ticks since are played again from that tick,
   * with the packets filed on each, and the player is where they lead. A system throwing abandons it.
   */
  private rewind (core: BedrockCore): void {
    const { history, stats } = this.corrections
    const anchor = history.anchor
    if (anchor === undefined) return
    const live = this.state
    this.state = anchor.filings.reduce(applied, anchor.snapshot)
    anchor.snapshot = this.state
    for (const record of history.from(anchor.tick + 1)) {
      if (!core.replay(record.tick)) {
        this.state = live
        history.clear()
        stats.abandoned++
        return
      }
      this.state = record.filings.reduce(applied, this.state)
      record.snapshot = this.state
      stats.replayedTicks++
    }
    history.clearFilings()
    stats.rewinds++
  }

  /**
   * the physics move the player a tick, on the tick's input (a tick played again on the input the ring kept); while
   * physicsEnabled is false the player stands still
   */
  private simulate ({ tick, replaying, outbox }: TickContext): void {
    const input = replaying ? this.recordedInput(tick) : this.liveInput()
    const before = this.state
    const { state, actions } = input === 'held'
      ? { state: { ...before, ...HELD }, actions: NO_ACTIONS }
      : simulateTick(before, input, this.bot._world.physicsWorld(before.position.y), this.rules)
    this.state = state
    if (replaying) return
    this.input = input
    this.actions = actions
    this.sendBesides(outbox, before, actions)
  }

  private recordedInput (tick: number): MovementInput {
    const record = this.corrections.history.get(tick)
    assert.ok(record !== undefined, `no record of tick ${tick} to play again`)
    return record.input
  }

  private liveInput (): MovementInput {
    if (!this.physicsEnabled) return 'held'
    const { direction, keys } = this.controls.cooked
    return {
      move: sneakScaledMove(direction, keys.sneak.level, this.state),
      yaw: this.rotation.yaw,
      jumping: keys.jump.level,
      sneakDown: keys.sneak.level,
      sprintDown: keys.sprint.level,
      // a second forward press (a pathfinder's toggling) starts no sprint: only the sprint key does
      doubleTapSprints: false,
      // the bot keeps no food level yet
      tooHungryToSprint: false,
      teleported: this.teleport !== undefined
    }
  }

  /**
   * what the vanilla client sends before the tick's auth input: on 1.16.201 what the tick started, as player_action; up
   * to 1.20.40 a move_player on the tick it lands
   */
  private sendBesides (outbox: OutboxWriter, before: MovementState, actions: TickActions): void {
    if (!this.atLeast('bedrock_1.16.210')) {
      const started = [['start_sprint', actions.startSprinting], ['stop_sprint', actions.stopSprinting], ['start_sneak', actions.startSneaking], ['stop_sneak', actions.stopSneaking], ['jump', actions.startJumping]] as const
      for (const [action, done] of started) if (done) outbox.queue('player_action', { runtime_entity_id: this.sentRuntimeId, action, position: STILL, face: 0 })
    }
    if (!before.onGround && this.state.onGround && !this.atLeast('bedrock_1.20.50')) {
      const { yaw, pitch } = this.rotation
      outbox.queue('move_player', { runtime_id: this.sentRuntimeId, position: reportedEyePosition(this.state), pitch, yaw, head_yaw: yaw, mode: 'normal', on_ground: true, ridden_runtime_id: 0, tick: 0n })
    }
  }

  private sendInput (core: BedrockCore, { tick, outbox }: TickContext): void {
    const { teleport, rotation, state } = this
    const movement = this.movement()
    const position = teleport ?? reportedEyePosition(state)
    const delta = teleport === undefined ? state.velocity : STILL
    outbox.queue('player_auth_input', authInput(this.bot.version, { tick, rotation, position, delta, active: core.activation.active, movement, teleportAck: teleport !== undefined }))
    if (teleport !== undefined && this.atLeast('bedrock_1.21.70')) outbox.queue('client_camera_aim_assist', { preset_id: '', action: 'clear', allow_aim_assist: false })
    this.teleport = undefined
    if (movement !== undefined) this.controls.clearEdges()
    for (const wait of this.turned) wait.due(tick)
    this.looking -= this.turned.length
    this.turned = []
    const sent = { position, rotation, feet: this.feet }
    if (this.lastSent !== undefined && !samePose(sent, this.lastSent)) this.moved = this.lastSent.feet
    this.lastSent = sent
  }

  /** what moved the player this tick, unless it was held: from the first tick it moves */
  private movement (): Movement | undefined {
    const { input, state } = this
    if (input === undefined || input === 'held') return undefined
    const { keys, direction } = this.controls.cooked
    return { keys, move: input.move, direction, actions: this.actions, horizontalCollision: state.horizontalCollision, verticalCollision: state.verticalCollision }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}
