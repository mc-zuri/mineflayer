import assert from 'assert'
import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockClientboundPackets } from '../../../lib/types/protocol/bedrock-client.ts'
import { readPacket } from './codec.ts'
import type { BedrockCodec } from './codec.ts'

export interface ListedPlayer {
  uuid: string
  uniqueId: bigint
  username: string
}

const PLAYER_LIST = 0x3f
// a record's skin and the rest of it, blank
const BLANK_RECORD = 600

/**
 * A player_list adding the player or removing it (by its uuid), on the wire: a blank record of the version's layout
 * (up to 1.26.30 the packet's type, then the count; from 1.26.40 the count, then each record's type), the player's
 * fields set.
 */
function playerList (codec: BedrockCodec, type: 'add' | 'remove', fields: Partial<ListedPlayer> & { uuid: string }): Buffer {
  const head = isBedrockVersionAtLeast(codec.version, 'bedrock_1.26.40')
    ? [PLAYER_LIST, 1, type === 'add' ? 1 : 0, 0]
    : [PLAYER_LIST, type === 'add' ? 0 : 1, 1]
  const zeroes = Buffer.concat([Buffer.from(head), Buffer.alloc(BLANK_RECORD)])
  // the blank packet reads with every field of its record, as the version writes it
  const params = codec.deserializer.parsePacketBuffer(zeroes).data.params as BedrockClientboundPackets['player_list']
  const { records } = params
  const record = Array.isArray(records) ? records[0] : records.records[0]
  assert.ok(record !== undefined, `${codec.version}: no blank player_list record`)
  Object.assign(record, { uuid: fields.uuid })
  if (fields.uniqueId !== undefined) Object.assign(record, { entity_unique_id: fields.uniqueId, username: fields.username })
  const buffer = codec.serializer.createPacketBuffer({ name: 'player_list', params })
  readPacket(codec, buffer)
  return buffer
}

export function playerListAdd (codec: BedrockCodec, player: ListedPlayer): Buffer {
  return playerList(codec, 'add', player)
}

export function playerListRemove (codec: BedrockCodec, uuid: string): Buffer {
  return playerList(codec, 'remove', { uuid })
}
