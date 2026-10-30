import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import { testedBedrockVersions } from '../../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../../lib/types/api/index.ts'
import { bedrockCodec, blankPacket } from './codec.ts'
import { bedrockTestBot } from './server.ts'
import type { FakeBedrockClient, TestBot } from './server.ts'
import type { Point3 } from './world.ts'

// The entities' packets as the versions write them, and the bots the entities' tests start.

export type ValueType = 'byte' | 'int' | 'float' | 'string' | 'long'

export const LOCAL_UNIQUE = -8589934591n
export const STILL = Object.freeze({ x: 0, y: 0, z: 0 })
const VALUE_TYPES = Object.freeze({ byte: 0, int: 2, float: 3, string: 4, long: 7 })

export function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return testedBedrockVersions.indexOf(version) >= testedBedrockVersions.indexOf(since)
}

export function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** written with the codec and received as from the wire: a bitfield is written from its _value, and read back whole */
export function write (server: FakeBedrockClient, name: string, fields: object): void {
  server.receive(server.codec.serializer.createPacketBuffer({ name, params: { ...blankPacket(server.codec, name), ...fields } }))
}

/** a metadata entry as the version writes it: from 1.26.40 with its type again */
export function entry (version: BedrockVersion, key: string | number, type: ValueType | number, value?: number | bigint | string | object): object {
  const legacy = atLeast(version, 'bedrock_1.26.40') ? { legacy_type: typeof type === 'number' ? type : VALUE_TYPES[type] } : {}
  return { key, type, ...value === undefined ? {} : { value }, ...legacy }
}

/** 1.16.201 names the flags index and writes them as a long */
export function flags (version: BedrockVersion, bits: bigint): object {
  return version === 'bedrock_1.16.201' ? entry(version, 'index', 'long', bits) : entry(version, 'flags', 'long', { _value: bits })
}

export function boundingBox (version: BedrockVersion, width: number, height: number): object[] {
  return [entry(version, 'boundingbox_width', 'float', width), entry(version, 'boundingbox_height', 'float', height)]
}

/** a runtime id as the add packets write it: a varint on 1.16.201 */
export function runtimeId (version: BedrockVersion, runtime: number): number | bigint {
  return atLeast(version, 'bedrock_1.16.210') ? BigInt(runtime) : runtime
}

/** up to 1.16.210 x, y, z and the speeds */
export function placed (version: BedrockVersion, position: Point3, velocity: Point3): object {
  if (atLeast(version, 'bedrock_1.16.220')) return { position, velocity }
  return { x: position.x, y: position.y, z: position.z, speed_x: velocity.x, speed_y: velocity.y, speed_z: velocity.z }
}

/** a bot the server started the game for, the local player's runtime id `runtime` */
export async function started (version: BedrockVersion, runtime = 1): Promise<TestBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  testBot.server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: BigInt(runtime) })
  await testBot.driver.frame(0)
  return testBot
}

export function spawned (bot: BedrockBot, runtime: number): Entity {
  const entity = bot.entities[runtime]
  assert.ok(entity !== undefined, `no entity ${runtime}`)
  return entity
}

export function positionOf (entity: Entity): Point3 {
  const { x, y, z } = entity.position
  return { x, y, z }
}
