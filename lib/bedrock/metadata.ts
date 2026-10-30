import assert from 'assert'
import type { EntityMetadataValue } from 'prismarine-entity'
import type { Registry } from 'prismarine-registry'
import type { BedrockClientboundPackets } from '../types/protocol/bedrock-client.ts'

export type MetadataEntries = BedrockClientboundPackets['set_entity_data']['metadata']

type ProtocolNode = string | number | boolean | object | null | undefined

const SNEAKING = 1n
const GLIDING = 32n
/** of flags_extended */
const SLEEPING = 11n
/** of player_flags */
const PLAYER_SLEEPING = 1

function at (node: ProtocolNode, path: ReadonlyArray<string | number>): ProtocolNode {
  return path.reduce<ProtocolNode>((parent, key) => {
    assert.ok(typeof parent === 'object' && parent !== null, `minecraft-data's MetadataDictionary has no ${key}`)
    return Reflect.get(parent, key)
  }, node)
}

/** the metadata keys' numbers by name: the protocol reads a key as its name, entity.metadata keeps it by number */
export function metadataKeyNumbers (registry: Registry): ReadonlyMap<string, number> {
  const fields = at(registry.protocol, ['types', 'MetadataDictionary', 1, 'type', 1])
  assert.ok(Array.isArray(fields), "minecraft-data's MetadataDictionary is no container")
  const key = fields.find(field => at(field, ['name']) === 'key')
  const mappings = at(key, ['type', 1, 'mappings'])
  assert.ok(typeof mappings === 'object' && mappings !== null, "minecraft-data's metadata keys are no mapper")
  return new Map(Object.entries(mappings).map(([number, name]) => [String(name), Number(number)]))
}

export function isSneaking (flags: bigint): boolean {
  return (flags >> SNEAKING & 1n) === 1n
}

export function isGliding (flags: bigint): boolean {
  return (flags >> GLIDING & 1n) === 1n
}

/** A version's metadata as entity.metadata keeps it: by key number, a bitfield as its bigint. */
export class EntityMetadata {
  private readonly numbers: ReadonlyMap<string, number>

  constructor (registry: Registry) {
    this.numbers = metadataKeyNumbers(registry)
  }

  /** the entries by key number; one of a type the protocol does not know has no value, and is left out */
  read (entries: MetadataEntries): EntityMetadataValue[] {
    const values: EntityMetadataValue[] = []
    for (const { key, value } of entries) {
      if (value === undefined) continue
      values[this.number(key)] = typeof value === 'object' && '_value' in value ? value._value : value
    }
    return values
  }

  value (values: readonly EntityMetadataValue[], name: string): EntityMetadataValue | undefined {
    return values[this.number(name)]
  }

  /** 1.16.201 names the flags index */
  flags (values: readonly EntityMetadataValue[]): bigint | undefined {
    return this.bigint(values, this.numbers.has('flags') ? 'flags' : 'index')
  }

  /** a player by its player flags, another entity by its extended flags */
  sleeping (values: readonly EntityMetadataValue[]): boolean {
    const playerFlags = this.value(values, 'player_flags')
    const extended = this.bigint(values, 'flags_extended')
    return (typeof playerFlags === 'number' && (playerFlags >> PLAYER_SLEEPING & 1) === 1) || (extended !== undefined && (extended >> SLEEPING & 1n) === 1n)
  }

  private number (key: string | number): number {
    if (typeof key === 'number') return key
    const number = this.numbers.get(key)
    assert.ok(number !== undefined, `the protocol named a metadata key it does not number: ${key}`)
    return number
  }

  private bigint (values: readonly EntityMetadataValue[], name: string): bigint | undefined {
    const value = this.value(values, name)
    return typeof value === 'bigint' ? value : undefined
  }
}
