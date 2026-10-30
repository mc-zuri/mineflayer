import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, testedBedrockVersions } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec, blankPacket, readPacket, roundTrip } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestVersions, bedrockTestVersionsFrom, FakeBedrockClient } from './common/server.ts'
import type { ClientboundPacketsToWrite } from './common/server.ts'

const READ_BACK = /read back/
const BLOCKING_TICK_NOT_READ = /8 bytes not read/

/**
 * the vanilla client's mob_equipment with a shield in its hand, and the shield's runtime id in it: the item's data ends
 * with its blocking tick (8 bytes), which only an item of the shield's id has
 */
function shieldInHand (version: BedrockVersion): { shield: number, packet: Buffer } {
  // recorded on 1.16.201, whose protocol has the shield's id
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.16.220')) return { shield: 355, packet: Buffer.from('1f0bc60502ffff010a00030644616d6167650000000000000000', 'hex') }
  // recorded on 1.21.50: up to 1.26.10 alike but for the shield's id
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.20')) {
    return { shield: 380, packet: Buffer.from('1f0af805010000000024ffff010a000003060044616d616765000000000000000000000000000000000000000000000000', 'hex') }
  }
  // recorded on 1.26.60: the item's id is a 16-bit integer
  return { shield: 358, packet: Buffer.from('1f0a6601010000000024ffff010a000003060044616d616765000000000000000000000000000000000000000000000000', 'hex') }
}

/** the item state naming the shield, as item_registry has it */
function registeredShield (runtimeId: number): ClientboundPacketsToWrite['item_registry']['itemstates'][number] {
  return { name: 'minecraft:shield', runtime_id: runtimeId, component_based: false, version: 'legacy', nbt: { type: 'compound', name: '', value: {} } }
}

describe('bedrock codec', () => {
  describe('fails on what does not read back as written', () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec('bedrock_1.21.130') })

    it('a packet the version does not have', () => {
      const old = bedrockCodec('bedrock_1.16.201')
      // 1.21.20+ only
      assert.throws(() => roundTrip(old, 'serverbound_loading_screen', { type: 1, loading_screen_id: 0 }), /has no serverbound_loading_screen/)
    })

    it('a field the packet does not have', () => {
      assert.throws(() => roundTrip(codec, 'set_time', { time: 1, day: 2 }), READ_BACK)
    })

    it('a field the packet needs', () => {
      assert.throws(() => roundTrip(codec, 'set_time', {}), READ_BACK)
    })

    it('a number in a 64-bit fixed-width field', () => {
      // li64 writes a number as 0
      assert.throws(() => roundTrip(codec, 'tick_sync', { request_time: 5, response_time: 0n }), READ_BACK)
      roundTrip(codec, 'tick_sync', { request_time: 5n, response_time: 0n })
    })

    it('a name a mapper does not have', () => {
      assert.throws(() => roundTrip(codec, 'play_status', { status: 'spawned' }), READ_BACK)
      roundTrip(codec, 'play_status', { status: 'player_spawn' })
    })

    it('a fraction in an integer field', () => {
      assert.throws(() => roundTrip(codec, 'set_time', { time: 1.5 }), READ_BACK)
    })

    it('a value out of the field\'s range', () => {
      assert.throws(() => roundTrip(codec, 'set_time', { time: 2 ** 31 }), READ_BACK)
    })

    it("but not an object's keys in another order than the protocol's", () => {
      roundTrip(codec, 'game_rules_changed', { rules: [{ value: true, type: 'bool', editable: true, name: 'dodaylightcycle' }] })
    })

    it('a float a 32-bit float does not hold', () => {
      const respawn = blankPacket(codec, 'respawn')
      assert.throws(() => roundTrip(codec, 'respawn', { ...respawn, position: { x: 0.1, y: 0, z: 0 } }), READ_BACK)
      roundTrip(codec, 'respawn', { ...respawn, position: { x: 0.5, y: 64, z: -0.25 } })
    })

    it('what the bot flushes and the fake server sends', () => {
      const server = new FakeBedrockClient(codec)
      const packet = { order: 1, name: 'set_local_player_as_initialized' as const, phase: 'F2' as const, tick: undefined, owner: 'test' }
      // varint64 writes a number, but reads back a bigint
      assert.throws(() => { server.flush([{ ...packet, params: { runtime_entity_id: 5 } }]) }, READ_BACK)
      server.connect({ packet: () => {}, notice: () => {} })
      // @ts-expect-error a mapper name the version does not have: the types already say so
      assert.throws(() => { server.send('play_status', { status: 'spawned' }) }, READ_BACK)
      server.flush([{ ...packet, params: { runtime_entity_id: 1n } }])
      assert.deepStrictEqual(server.sent, [{ name: 'set_local_player_as_initialized', params: { runtime_entity_id: 1n } }])
    })

    it('what the fake server sends to no bot, or to a closed connection', () => {
      const server = new FakeBedrockClient(codec)
      assert.throws(() => { server.send('set_time', { time: 1 }) }, { message: 'no bot is connected' })
      server.connect({ packet: () => {}, notice: () => {} })
      server.close()
      server.close()
      assert.throws(() => { server.send('set_time', { time: 1 }) }, { message: 'bedrock_1.21.130: set_time sent to a closed connection' })
    })
  })

  describe("an item's blocking tick, which only the shield has", () => {
    describe("up to 1.16.210, whose protocol has the shield's id", () => {
      for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
        it(`bedrock ${version}: is read with no shield named`, () => {
          readPacket(bedrockCodec(version), shieldInHand(version).packet)
        })
      }
    })

    describe("up to 1.21.50, the shield's id named in start_game's item states", () => {
      for (const version of bedrockTestVersionsFrom('bedrock_1.16.220', 'bedrock_1.21.50')) {
        it(`bedrock ${version}: is read once start_game named the shield, by that connection's codec only`, () => {
          const { shield, packet } = shieldInHand(version)
          const [codec, other] = [bedrockCodec(version), bedrockCodec(version)]
          assert.throws(() => readPacket(codec, packet), BLOCKING_TICK_NOT_READ)
          roundTrip(codec, 'start_game', { ...blankPacket(codec, 'start_game'), itemstates: [{ name: 'minecraft:shield', runtime_id: shield, component_based: false }] })
          readPacket(codec, packet)
          assert.throws(() => readPacket(other, packet), BLOCKING_TICK_NOT_READ)
        })
      }
    })

    describe("from 1.21.60, the shield's id named in item_registry", () => {
      for (const version of bedrockTestVersionsFrom('bedrock_1.21.60')) {
        it(`bedrock ${version}: is read once item_registry named the shield, by that connection's codec only`, () => {
          const { shield, packet } = shieldInHand(version)
          const [codec, other] = [bedrockCodec(version), bedrockCodec(version)]
          assert.throws(() => readPacket(codec, packet), BLOCKING_TICK_NOT_READ)
          roundTrip(codec, 'item_registry', { itemstates: [registeredShield(shield)] })
          readPacket(codec, packet)
          assert.throws(() => readPacket(other, packet), BLOCKING_TICK_NOT_READ)
        })
      }
    })

    it(`is read by the fake server the shield was named to, not by another of the same codec (on ${latestSupportedBedrockVersion})`, () => {
      const codec = bedrockCodec(latestSupportedBedrockVersion)
      const { shield, packet } = shieldInHand(latestSupportedBedrockVersion)
      const [named, other] = [new FakeBedrockClient(codec), new FakeBedrockClient(codec)]
      named.connect({ packet: () => {}, notice: () => {} })
      named.send('item_registry', { itemstates: [registeredShield(shield)] })
      named.receive(packet)
      assert.throws(() => { other.receive(packet) }, BLOCKING_TICK_NOT_READ)
      assert.throws(() => readPacket(codec, packet), BLOCKING_TICK_NOT_READ)
    })
  })

  describe('BEDROCK_VERSIONS', () => {
    it('names versions, or their start (whole parts: 1.26.4 is not 1.26.40)', () => {
      assert.deepStrictEqual(bedrockTestVersions('1.16.201, bedrock_1.26'),
        ['bedrock_1.16.201', ...testedBedrockVersions.filter(version => version.startsWith('bedrock_1.26.'))])
      assert.deepStrictEqual(bedrockTestVersions(''), [...testedBedrockVersions])
    })

    it('throws for a name that is no supported version, rather than running none of its tests', () => {
      assert.throws(() => bedrockTestVersions('1.16.201,1.20.11'), /BEDROCK_VERSIONS: 1.20.11 is no supported Bedrock version/)
      assert.throws(() => bedrockTestVersions('1.26.4'), /1.26.4 is no supported/)
    })
  })

  for (const version of bedrockTestVersions()) {
    describe(`blank packets of ${version}`, () => {
      let codec: BedrockCodec
      before(() => { codec = bedrockCodec(version) })

      for (const name of ['start_game', 'play_status', 'set_time', 'game_rules_changed', 'disconnect', 'tick_sync', 'set_local_player_as_initialized']) {
        it(`${name} reads back as written`, () => {
          roundTrip(codec, name, blankPacket(codec, name))
        })
      }
    })
  }
})
