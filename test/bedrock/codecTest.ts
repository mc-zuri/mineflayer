import assert from 'assert'
import { testedBedrockVersions } from '../../lib/bedrock/version.ts'
import { bedrockCodec, blankPacket, roundTrip } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestVersions, FakeBedrockClient } from './common/server.ts'

const READ_BACK = /read back/

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

    it("the fake client's player_spawn, as bedrock-protocol's Client: the first only", () => {
      const client = new FakeBedrockClient(codec)
      let spawns = 0
      client.on('spawn', () => { spawns++ })
      client.send('start_game', { runtime_entity_id: 7n })
      client.send('play_status', { status: 'player_spawn' })
      client.send('play_status', { status: 'player_spawn' })
      assert.strictEqual(spawns, 1)
      assert.deepStrictEqual(client.sent, [{ name: 'set_local_player_as_initialized', params: { runtime_entity_id: 7n } }])
    })

    it("the fake client's player_spawn before start_game, as bedrock-protocol's Client: initialized on start_game", () => {
      const client = new FakeBedrockClient(codec)
      let spawns = 0
      client.on('spawn', () => { spawns++ })
      client.send('play_status', { status: 'player_spawn' })
      assert.strictEqual(spawns, 1)
      assert.deepStrictEqual(client.sent, [])
      client.send('start_game', { runtime_entity_id: 7n })
      assert.deepStrictEqual(client.sent, [{ name: 'set_local_player_as_initialized', params: { runtime_entity_id: 7n } }])
    })

    it('what the fake client writes and sends', () => {
      const client = new FakeBedrockClient(codec)
      // varint64 writes a number, but reads back a bigint
      assert.throws(() => client.write('set_local_player_as_initialized', { runtime_entity_id: 5 }), READ_BACK)
      // @ts-expect-error a mapper name the version does not have: the types already say so
      assert.throws(() => client.send('play_status', { status: 'spawned' }), READ_BACK)
      client.write('set_local_player_as_initialized', { runtime_entity_id: 1n })
      assert.deepStrictEqual(client.sent, [{ name: 'set_local_player_as_initialized', params: { runtime_entity_id: 1n } }])
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
