import assert from 'assert'
import prismarineEntity from 'prismarine-entity'
import type { Entity } from 'prismarine-entity'
import type { Registry } from 'prismarine-registry'
import { Vec3 } from 'vec3'
import { fromNotchianPitch, fromNotchianYaw, toNotchianPitch, toNotchianYaw } from '../../conversions.ts'
import { euclideanMod } from '../../math.ts'
import type { BedrockCore } from '../core/core.ts'
import type { TickContext } from '../core/types.ts'
import type { DueWait } from '../core/waits.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockPlayer } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import { authInput } from './auth_input.ts'
import type { Rotation, Vec3f } from './auth_input.ts'
import type { Controls } from './input.ts'

const OWNER = 'movement'
/** the vanilla client's eye, above the feet */
export const EYE_HEIGHT = Math.fround(1.62001)
const PLAYER_HEIGHT = 1.8
const PLAYER_WIDTH = 0.6
const NO_DELTA = Object.freeze({ x: 0, y: 0, z: 0 })

type EntityLoader = (registry: Registry) => typeof Entity

/** prismarine-entity's module is its loader, which its typings do not declare (docs/typescript/api-mismatches.md) */
function assertEntityLoader (loader: object): asserts loader is EntityLoader {
  assert.ok(typeof loader === 'function', 'prismarine-entity exports its loader')
}

function eyeOf (feet: Vec3): Vec3f {
  return { x: Math.fround(feet.x), y: Math.fround(Math.fround(feet.y) + EYE_HEIGHT), z: Math.fround(feet.z) }
}

/** Bedrock degrees in (-180, 180]: the vanilla client reports looking east as -90, not 270 */
function bedrockYaw (yaw: number): number {
  return 180 - euclideanMod(180 - toNotchianYaw(yaw), 360)
}

function samePose (a: { position: Vec3f, rotation: Rotation }, b: { position: Vec3f, rotation: Rotation }): boolean {
  return a.position.x === b.position.x && a.position.y === b.position.y && a.position.z === b.position.z && a.rotation.yaw === b.rotation.yaw && a.rotation.pitch === b.rotation.pitch
}

interface Sent {
  readonly position: Vec3f
  readonly rotation: Rotation
  readonly feet: Vec3
}

/**
 * The local player: where the server places it (start_game, respawn, move_player), where it looks, and the auth input
 * it sends every tick once the server shows it. It stays where the server put it until the physics move it.
 */
export class LocalPlayer {
  /** the feet, as the server last placed them */
  feet = new Vec3(0, 0, 0)
  rotation: Rotation = { yaw: 0, pitch: 0 }
  private readonly bot: BedrockBotInternal
  private readonly controls: Controls
  /** bot.entity from start_game */
  private readonly entity: BedrockPlayer
  /** start_game's runtime id, its low 32 bits: move_player's is a varint */
  private runtimeId: bigint | undefined
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

  constructor (bot: BedrockBotInternal, controls: Controls) {
    this.bot = bot
    this.controls = controls
    this.entity = this.createEntity()
  }

  install (core: BedrockCore): void {
    this.bot.look = async (yaw, pitch) => { await this.look(core, yaw, pitch) }
    this.bot.lookAt = async point => {
      const delta = point.minus(this.feet.offset(0, EYE_HEIGHT, 0))
      await this.look(core, Math.atan2(-delta.x, -delta.z), Math.atan2(delta.y, Math.sqrt(delta.x * delta.x + delta.z * delta.z)))
    }
    core.observe(OWNER, 'start_game', packet => {
      this.runtimeId = BigInt.asUintN(32, packet.runtime_entity_id)
      this.entity.id = Number(packet.runtime_entity_id)
      this.bot.entity = this.entity
      // 1.16.201 names it spawn
      const eye = packet.player_position ?? packet.spawn
      if (eye !== undefined) this.place(eye, false)
      this.turn({ yaw: packet.rotation.z, pitch: packet.rotation.x })
    })
    core.handle(OWNER, 'respawn', packet => {
      if (packet.state !== 1) return
      // up to 1.16.210 the position is x, y, z
      const { position, x, y, z } = packet
      if (position !== undefined) this.place(position, false)
      if (x !== undefined && y !== undefined && z !== undefined) this.place({ x, y, z }, false)
    })
    core.handle(OWNER, 'move_player', packet => {
      if (BigInt.asUintN(32, BigInt(packet.runtime_id)) !== this.runtimeId) return
      this.turn({ yaw: packet.yaw, pitch: packet.pitch })
      if (packet.mode === 'rotation') return
      this.place(packet.position, packet.on_ground)
      this.teleport = packet.position
      core.emit(this.bot, 'forcedMove')
    })
    core.system(OWNER, { name: 'movement.sendInput', place: { at: 'SendPlayerInputPacketSystem' }, gate: 'present', replay: false, run: ctx => { this.sendInput(core, ctx) } })
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

  /** the eye given: the feet below it */
  private place (eye: Vec3f, onGround: boolean): void {
    this.feet = new Vec3(eye.x, Math.fround(eye.y - EYE_HEIGHT), eye.z)
    this.entity.position = this.feet.clone()
    this.entity.onGround = onGround
  }

  private turn (rotation: Rotation): void {
    this.rotation = rotation
    this.entity.yaw = fromNotchianYaw(rotation.yaw)
    this.entity.pitch = fromNotchianPitch(rotation.pitch)
  }

  private sendInput (core: BedrockCore, { tick, outbox }: TickContext): void {
    const { teleport, rotation } = this
    const input = core.activation.active ? this.controls.cooked : undefined
    const position = teleport ?? eyeOf(this.feet)
    outbox.queue('player_auth_input', authInput(this.bot.version, { tick, rotation, position, delta: NO_DELTA, input, teleportAck: teleport !== undefined }))
    if (teleport !== undefined && isBedrockVersionAtLeast(this.bot.version, 'bedrock_1.21.70')) outbox.queue('client_camera_aim_assist', { preset_id: '', action: 'clear', allow_aim_assist: false })
    this.teleport = undefined
    if (input !== undefined) this.controls.clearEdges()
    for (const wait of this.turned) wait.due(tick)
    this.looking -= this.turned.length
    this.turned = []
    const sent = { position, rotation, feet: this.feet.clone() }
    if (this.lastSent !== undefined && !samePose(sent, this.lastSent)) this.moved = this.lastSent.feet
    this.lastSent = sent
  }
}
