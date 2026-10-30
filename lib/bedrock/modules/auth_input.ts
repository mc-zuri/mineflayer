import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion, ControlState } from '../../types/api/index.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

export type AuthInput = BedrockServerboundPackets['player_auth_input']

export interface Vec2f { readonly x: number, readonly z: number }
export interface Vec3f { readonly x: number, readonly y: number, readonly z: number }

/** Bedrock degrees, as floats */
export interface Rotation { readonly yaw: number, readonly pitch: number }

/** a control's state in a tick: whether it is held, and whether it was pressed or released since the last input sent */
export interface Latch { readonly level: boolean, readonly down: boolean, readonly up: boolean }

/** what the input system made of the controls in a tick */
export interface CookedInput {
  /** x left, z forward; scaled while sneaking */
  readonly moveVector: Vec2f
  /** the move vector before the sneak's scale */
  readonly rawMoveVector: Vec2f
  readonly keys: Readonly<Record<ControlState, Latch>>
}

export interface AuthInputState {
  readonly tick: number
  readonly rotation: Rotation
  /** the eye: where the player reports it is */
  readonly position: Vec3f
  readonly delta: Vec3f
  /** the controls, while the player is simulated; none while its auth inputs are held */
  readonly input: CookedInput | undefined
  /** the input answers a teleport */
  readonly teleportAck: boolean
}

type FlagGroup = readonly [since: BedrockVersion, names: readonly string[], before?: BedrockVersion]

/**
 * The input flags of each version, by minecraft-data's names, in the order of their bits (from 1.26.40 of their ids,
 * the last of which, internal_update, is never sent): each group from the first version that has it, up to the version
 * that renamed it.
 */
const INPUT_FLAGS: readonly FlagGroup[] = Object.freeze([
  ['bedrock_1.16.201', ['ascend', 'descend', 'north_jump', 'jump_down', 'sprint_down', 'change_height', 'jumping', 'auto_jumping_in_water', 'sneaking', 'sneak_down', 'up', 'down', 'left', 'right', 'up_left', 'up_right', 'want_up', 'want_down', 'want_down_slow', 'want_up_slow', 'sprinting']],
  ['bedrock_1.16.201', ['ascend_scaffolding', 'descend_scaffolding'], 'bedrock_1.17.10'],
  ['bedrock_1.17.10', ['ascend_block', 'descend_block']],
  ['bedrock_1.16.201', ['sneak_toggle_down', 'persist_sneak']],
  ['bedrock_1.16.210', ['start_sprinting', 'stop_sprinting', 'start_sneaking', 'stop_sneaking', 'start_swimming', 'stop_swimming', 'start_jumping', 'start_gliding', 'stop_gliding', 'item_interact', 'block_action', 'item_stack_request']],
  ['bedrock_1.19.60', ['handled_teleport']],
  ['bedrock_1.19.70', ['emoting']],
  ['bedrock_1.20.10', ['missed_swing', 'start_crawling', 'stop_crawling']],
  ['bedrock_1.20.30', ['start_flying', 'stop_flying']],
  ['bedrock_1.20.40', ['received_server_data']],
  ['bedrock_1.20.61', ['client_predicted_vehicle']],
  ['bedrock_1.20.71', ['paddling_left', 'paddling_right']],
  ['bedrock_1.21.0', ['block_breaking_delay_enabled']],
  ['bedrock_1.21.30', ['horizontal_collision', 'vertical_collision', 'down_left', 'down_right']],
  ['bedrock_1.21.50', ['start_using_item']],
  ['bedrock_1.21.42', ['camera_relative_movement_enabled', 'rot_controlled_by_move_direction', 'start_spin_attack', 'stop_spin_attack']],
  ['bedrock_1.21.50', ['hotbar_only_touch', 'jump_released_raw', 'jump_pressed_raw', 'jump_current_raw', 'sneak_released_raw', 'sneak_pressed_raw', 'sneak_current_raw']]
])

type FlagName = 'up' | 'down' | 'left' | 'right' | 'north_jump' | 'jump_down' | 'jumping' | 'want_up' | 'sprint_down' | 'sneak_down' | 'sneaking' | 'want_down' |
  'handled_teleport' | 'block_breaking_delay_enabled' | 'jump_released_raw' | 'jump_pressed_raw' | 'jump_current_raw' | 'sneak_released_raw' | 'sneak_pressed_raw' | 'sneak_current_raw'

const ZERO_VEC2 = Object.freeze({ x: 0, z: 0 })
const ZERO_VEC3 = Object.freeze({ x: 0, y: 0, z: 0 })

function inputFlagNames (version: BedrockVersion): readonly string[] {
  return INPUT_FLAGS.filter(([since, , before]) => isBedrockVersionAtLeast(version, since) && (before === undefined || !isBedrockVersionAtLeast(version, before)))
    .flatMap(([, names]) => names)
}

/** the flags set: a flag the version does not have is not sent */
function flagsOf (version: BedrockVersion, { input, teleportAck }: AuthInputState): Set<FlagName> {
  const flags = new Set<FlagName>(['block_breaking_delay_enabled'])
  if (teleportAck) flags.add('handled_teleport')
  if (input === undefined) return flags
  const { forward, back, left, right, jump, sprint, sneak } = input.keys
  const reported: Array<[boolean, readonly FlagName[]]> = [
    [forward.level, ['up']],
    [back.level, ['down']],
    [left.level, ['left']],
    [right.level, ['right']],
    [jump.level, ['jump_down', 'jumping', 'want_up']],
    [jump.level && !isBedrockVersionAtLeast(version, 'bedrock_1.21.0'), ['north_jump']],
    [sprint.level, ['sprint_down']],
    [sneak.level, ['sneak_down', 'sneaking', 'want_down']],
    [jump.up, ['jump_released_raw']],
    [jump.down, ['jump_pressed_raw']],
    [jump.level, ['jump_current_raw']],
    [sneak.up, ['sneak_released_raw']],
    [sneak.down, ['sneak_pressed_raw']],
    [sneak.level, ['sneak_current_raw']]
  ]
  for (const [on, names] of reported) if (on) for (const name of names) flags.add(name)
  return flags
}

/** the flags as the version writes them: every name with its bit's value up to 1.26.30, the set ones after */
function inputData (version: BedrockVersion, flags: ReadonlySet<string>): NonNullable<AuthInput['input_data']> {
  const names = inputFlagNames(version)
  // the flags set are flag names
  if (isBedrockVersionAtLeast(version, 'bedrock_1.26.40')) return names.filter((name): name is FlagName => flags.has(name))
  const bits = Object.fromEntries(names.map(name => [name, flags.has(name)]))
  const set = names.flatMap((name, bit) => flags.has(name) ? [bit] : [])
  // 1.16.201's flags are a varint: the value is a number
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.16.210')) return { ...bits, _value: set.reduce((value, bit) => value | (1 << bit), 0) }
  return { ...bits, _value: set.reduce((value, bit) => value | (1n << BigInt(bit)), 0n) }
}

/** where the camera looks, while the player is simulated */
function cameraOrientation ({ yaw, pitch }: Rotation): Vec3f {
  const [yawRadians, pitchRadians] = [yaw * Math.PI / 180, pitch * Math.PI / 180]
  // 0 - x rather than -x: a zero is +0 (-0 has its sign bit set on the wire)
  return {
    x: Math.fround((0 - Math.sin(yawRadians)) * Math.cos(pitchRadians)),
    y: Math.fround(0 - Math.sin(pitchRadians)),
    z: Math.fround(Math.cos(yawRadians) * Math.cos(pitchRadians))
  }
}

/**
 * player_auth_input as the vanilla client of the version writes it: by keyboard and mouse ('touch' on 1.16.201, whose
 * minecraft-data names its mouse so), on the screen, with no item action, block action or vehicle.
 */
export function authInput (version: BedrockVersion, state: AuthInputState): AuthInput {
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  const { tick, rotation, position, delta, input } = state
  const packet: AuthInput = {
    pitch: rotation.pitch,
    yaw: rotation.yaw,
    position,
    move_vector: input?.moveVector ?? ZERO_VEC2,
    head_yaw: rotation.yaw,
    input_data: inputData(version, flagsOf(version, state)),
    input_mode: atLeast('bedrock_1.16.210') ? 'mouse' : 'touch',
    play_mode: 'screen',
    tick: BigInt(tick),
    delta
  }
  if (atLeast('bedrock_1.19.1')) packet.interaction_model = 'touch'
  if (atLeast('bedrock_1.19.70')) packet.analogue_move_vector = ZERO_VEC2
  if (atLeast('bedrock_1.21.42')) {
    packet.interact_rotation = input === undefined ? ZERO_VEC2 : { x: rotation.pitch, z: rotation.yaw }
    packet.camera_orientation = input === undefined ? ZERO_VEC3 : cameraOrientation(rotation)
  }
  if (atLeast('bedrock_1.21.50')) packet.raw_move_vector = input?.rawMoveVector ?? ZERO_VEC2
  if (atLeast('bedrock_1.26.40') && !atLeast('bedrock_1.26.51')) {
    // the vanilla client writes each absent field as present, then absent
    packet.transaction_presence = true
    packet.item_stack_request_presence = true
    packet.block_action_presence = true
    packet.vehicle_rotation_presence = true
    packet.predicted_vehicle_presence = true
  }
  return packet
}
