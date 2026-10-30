import assert from 'assert'
import type { BedrockClientboundPackets } from '../types/protocol/bedrock-client.ts'
import type { MetadataEntries } from './metadata.ts'

type Packets = BedrockClientboundPackets
type GameMode = Packets['update_player_game_type']['gamemode']

export interface Vector { x: number, y: number, z: number }

/** an entity as an add packet shows it, its rotation in Bedrock's degrees */
export interface Spawn {
  unique: bigint
  key: number
  position: Vector
  velocity: Vector
  yaw: number
  pitch: number
  headYaw: number
  metadata: MetadataEntries
  attributes: Packets['add_entity']['attributes']
}

interface Placed {
  position?: Vector | undefined
  velocity?: Vector | undefined
  x?: number | undefined
  y?: number | undefined
  z?: number | undefined
  speed_x?: number | undefined
  speed_y?: number | undefined
  speed_z?: number | undefined
}

const STILL: Vector = Object.freeze({ x: 0, y: 0, z: 0 })

/** bot.entities' key: the runtime id's low 32 bits, as the packets writing it as a varint carry it */
export function runtimeKey (id: number | bigint): number {
  return Number(BigInt.asUintN(32, BigInt(id)))
}

/** up to 1.16.210 the position and the velocity are x, y, z and speed_x, speed_y, speed_z */
function placed ({ position, velocity, x, y, z, speed_x: speedX, speed_y: speedY, speed_z: speedZ }: Placed): { position: Vector, velocity: Vector } {
  if (position !== undefined && velocity !== undefined) return { position, velocity }
  assert.ok(x !== undefined && y !== undefined && z !== undefined && speedX !== undefined && speedY !== undefined && speedZ !== undefined, 'an add packet without a position')
  return { position: { x, y, z }, velocity: { x: speedX, y: speedY, z: speedZ } }
}

/** the ids are named unique_id and runtime_id from 1.19.10 */
export function addedEntity (packet: Packets['add_entity']): Spawn {
  const unique = packet.unique_id ?? packet.entity_id_self
  const runtime = packet.runtime_id ?? packet.runtime_entity_id
  assert.ok(unique !== undefined && runtime !== undefined, 'add_entity without its ids')
  const { yaw, pitch, head_yaw: headYaw, metadata, attributes } = packet
  return { unique, key: runtimeKey(runtime), ...placed(packet), yaw, pitch, headYaw, metadata, attributes }
}

export function addedItem (packet: Packets['add_item_entity']): Spawn {
  return { unique: packet.entity_id_self, key: runtimeKey(packet.runtime_entity_id), ...placed(packet), yaw: 0, pitch: 0, headYaw: 0, metadata: packet.metadata, attributes: [] }
}

/** block coordinates up to 1.16.210 */
export function addedPainting (packet: Packets['add_painting']): Spawn {
  const { x, y, z } = packet.coordinates
  return { unique: packet.entity_id_self, key: runtimeKey(packet.runtime_entity_id), position: { x, y, z }, velocity: STILL, yaw: 0, pitch: 0, headYaw: 0, metadata: [], attributes: [] }
}

/** a player as add_player shows it, its position the feet */
export interface PlayerSpawn extends Spawn {
  uuid: string
  username: string
  /** from 1.18.30 */
  gamemode: GameMode | undefined
}

/** the unique id is entity_id_self up to 1.18.11, unique_entity_id up to 1.19.1, then an li64 unique_id */
export function addedPlayer (packet: Packets['add_player']): PlayerSpawn {
  const unique = packet.unique_id?.valueOf() ?? packet.unique_entity_id ?? packet.entity_id_self
  const runtime = packet.runtime_id ?? packet.runtime_entity_id
  assert.ok(unique !== undefined && runtime !== undefined, 'add_player without its ids')
  const { uuid, username, gamemode, yaw, pitch, head_yaw: headYaw, metadata } = packet
  return { unique, key: runtimeKey(runtime), ...placed(packet), yaw, pitch, headYaw, metadata, attributes: [], uuid, username, gamemode }
}

export type Listing = { type: 'add', uuid: string, unique: bigint, username: string } | { type: 'remove', uuid: string }

interface ListedRecord {
  type: 'add' | 'remove' | number
  uuid?: string | undefined
  entity_unique_id?: bigint | undefined
  username?: string | undefined
}

/** up to 1.26.30 one type for all the records, from 1.26.40 each record's own */
export function listingsOf ({ records }: Packets['player_list']): Listing[] {
  const typed: ListedRecord[] = Array.isArray(records) ? records : records.records.map(record => ({ type: records.type, ...record }))
  return typed.map(({ type, uuid, entity_unique_id: unique, username }) => {
    assert.ok(uuid !== undefined, 'a player_list record without its uuid')
    if (type === 'remove') return { type, uuid }
    assert.ok(type === 'add' && unique !== undefined && username !== undefined, `a player_list record of type ${type}`)
    return { type, uuid, unique, username }
  })
}

const JAVA_GAMEMODES: Readonly<Record<string, number>> = Object.freeze({ survival: 0, creative: 1, adventure: 2, survival_spectator: 3, creative_spectator: 3, spectator: 3 })

/** Java's number of a game mode: Bedrock's spectators are Java's spectator, and the fallback is the world's */
export function gamemodeOf (mode: GameMode, world: number): number {
  return JAVA_GAMEMODES[mode] ?? world
}
