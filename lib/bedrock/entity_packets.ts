import assert from 'assert'
import type { BedrockClientboundPackets } from '../types/protocol/bedrock-client.ts'
import type { MetadataEntries } from './metadata.ts'

type Packets = BedrockClientboundPackets

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
