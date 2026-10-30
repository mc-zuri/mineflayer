// Every packet is written and read back with bedrock-protocol's codec, and must read back as written: bedrock-protocol
// writes a packet, field or value its version does not have without an error, but differently.
import assert from 'assert'
import { createDeserializer, createSerializer } from 'bedrock-protocol/src/transforms/serializer.js'
import type { Deserializer, Serializer } from 'bedrock-protocol/src/transforms/serializer.js'
import { bedrockProtocolVersionOf } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'

export interface BedrockCodec {
  version: BedrockVersion
  serializer: Serializer
  deserializer: Deserializer
  blanks: Map<string, object>
}

export function bedrockCodec (version: BedrockVersion): BedrockCodec {
  return {
    version,
    serializer: createSerializer(bedrockProtocolVersionOf(version)),
    deserializer: createDeserializer(bedrockProtocolVersionOf(version)),
    blanks: new Map()
  }
}

type Field = string | number | boolean | bigint | object | null | undefined

// A bigint is not its number (`5n`), a 64-bit fixed-width field's [high, low] is its bigint, a void field's undefined
// key is no key, and key order does not count. Indented, so that a failure shows the differing lines.
function canonical (params: object | undefined): string {
  return JSON.stringify(params, (_key: string, field: Field) => {
    if (typeof field === 'bigint') return `${field}n`
    if (typeof field !== 'object' || field === null) return field
    if (typeof field.valueOf() === 'bigint') return `${String(field.valueOf())}n`
    if (Array.isArray(field)) return field
    const entries: Array<[string, Field]> = Object.entries(field)
    return Object.fromEntries(entries.sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
  }, 1)
}

export function roundTrip (codec: BedrockCodec, name: string, params: object): object {
  const buffer = codec.serializer.createPacketBuffer({ name, params })
  const where = `${codec.version} ${name} (0x${buffer.subarray(0, 64).toString('hex')}${buffer.length > 64 ? '...' : ''})`
  const read = codec.deserializer.parsePacketBuffer(buffer)
  assert.strictEqual(read.data.name, name, `${where}: read back as packet ${read.data.name}: ${codec.version} has no ${name}`)
  assert.strictEqual(read.metadata.size, buffer.length, `${where}: ${buffer.length - read.metadata.size} bytes not read`)
  assert.ok(read.data.params !== undefined, `${where}: no params read`)
  assert.strictEqual(canonical(read.data.params), canonical(params), `${where}: read back differently`)
  const rewritten = codec.serializer.createPacketBuffer({ name, params: read.data.params })
  assert.ok(rewritten.equals(buffer), `${where}: written again, it is 0x${rewritten.toString('hex')}`)
  return read.data.params
}

export function readPacket (codec: BedrockCodec, buffer: Buffer): { name: string, params: object } {
  const where = `${codec.version} 0x${buffer.subarray(0, 64).toString('hex')}${buffer.length > 64 ? '...' : ''}`
  const read = codec.deserializer.parsePacketBuffer(buffer)
  const { name, params } = read.data
  assert.ok(typeof name === 'string' && params !== undefined, `${where}: ${codec.version} has no packet ${name}`)
  assert.strictEqual(read.metadata.size, buffer.length, `${where}: ${buffer.length - read.metadata.size} bytes not read`)
  assert.ok(codec.serializer.createPacketBuffer({ name, params }).equals(buffer), `${where}: written again, it differs`)
  return { name, params }
}

function varint (value: number): number[] {
  const bytes: number[] = []
  while (value >= 0x80) {
    bytes.push((value & 0x7f) | 0x80)
    value >>>= 7
  }
  bytes.push(value)
  return bytes
}

const MAX_PACKET_ID = 1023
const ZEROES = 4096

/** what the packet's id followed by zero bytes reads as: every field the version has, blank */
export function blankPacket (codec: BedrockCodec, name: string): object {
  const blank = blanksOf(codec).get(name)
  assert.ok(blank !== undefined, `${codec.version} has no blank ${name} packet`)
  return blank
}

function blanksOf (codec: BedrockCodec): Map<string, object> {
  if (codec.blanks.size === 0) {
    const zeroes = Buffer.alloc(ZEROES)
    for (let id = 0; id <= MAX_PACKET_ID; id++) {
      try {
        const read = codec.deserializer.parsePacketBuffer(Buffer.concat([Buffer.from(varint(id)), zeroes]))
        if (typeof read.data.name === 'string' && read.data.params !== undefined) codec.blanks.set(read.data.name, read.data.params)
      } catch {
        // zero bytes are no valid form of some packets
      }
    }
  }
  return codec.blanks
}
