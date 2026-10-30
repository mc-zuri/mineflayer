import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import { once } from '../../lib/promise_utils.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, SentPacket } from './common/server.ts'

// What the bot answers the server's handshake with, as the vanilla client of each version answers it, in the packet
// pass of the frame that received it.

function sentInOneFlush (server: FakeBedrockClient): SentPacket[] {
  assert.strictEqual(server.batches.length, 1)
  return server.sent
}

describe('bedrock session', () => {
  for (const version of bedrockTestVersions()) {
    describe(`bedrock ${version}`, () => {
      let codec: BedrockCodec
      before(() => { codec = bedrockCodec(version) })

      it('keeps no chunk cache', async () => {
        const { server, driver } = await bedrockTestBot(codec)
        server.send('play_status', { status: 'login_success' })
        await driver.frame(0)
        assert.deepStrictEqual(sentInOneFlush(server), [{ name: 'client_cache_status', params: { enabled: false } }])
      })

      it('answers start_game as the vanilla client, and logs in', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        const loggedIn = once(bot, 'login')
        server.send('start_game', { runtime_entity_id: 1n })
        await driver.frame(0)
        await loggedIn
        const atLeast = (since: typeof version): boolean => isBedrockVersionAtLeast(version, since)
        const chunkRadius = atLeast('bedrock_1.21.90') ? 12 : 8
        assert.deepStrictEqual(sentInOneFlush(server), [
          { name: 'request_chunk_radius', params: atLeast('bedrock_1.19.80') ? { chunk_radius: chunkRadius, max_radius: 28 } : { chunk_radius: chunkRadius } },
          ...atLeast('bedrock_1.20.61') ? [] : [{ name: 'tick_sync', params: { request_time: 0n, response_time: 0n } }],
          ...atLeast('bedrock_1.21.20') ? [{ name: 'serverbound_loading_screen', params: { type: 1 } }] : []
        ])
      })
    })
  }

  describe('servers listing their resource packs with a status byte (up to 1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: has all packs, then is done`, async () => {
        const { server, driver } = await bedrockTestBot(bedrockCodec(version))
        server.send('resource_packs_info')
        server.send('resource_pack_stack')
        await driver.frame(0)
        assert.deepStrictEqual(sentInOneFlush(server), [
          { name: 'resource_pack_client_response', params: { response_status: 'have_all_packs', resourcepackids: [] } },
          { name: 'resource_pack_client_response', params: { response_status: 'completed', resourcepackids: [] } }
        ])
      })
    }
  })

  describe('servers listing their resource packs with a status and its name (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: has all packs, then is done`, async () => {
        const { server, driver } = await bedrockTestBot(bedrockCodec(version))
        server.send('resource_packs_info')
        server.send('resource_pack_stack')
        await driver.frame(0)
        assert.deepStrictEqual(sentInOneFlush(server), [
          { name: 'resource_pack_client_response', params: { response_status: 'have_all_packs', response_status_name: 'downloadingfinished' } },
          { name: 'resource_pack_client_response', params: { response_status: 'completed', response_status_name: 'resourcepackstackfinished' } }
        ])
      })
    }
  })

  describe('servers asking for a latency answer with unknown_flag (up to 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: echoes the timestamp when asked`, async () => {
        const { server, driver } = await bedrockTestBot(bedrockCodec(version))
        server.send('network_stack_latency', { timestamp: 1234567890123n, unknown_flag: 1 })
        server.send('network_stack_latency', { timestamp: 5n, unknown_flag: 0 })
        await driver.frame(0)
        assert.deepStrictEqual(sentInOneFlush(server), [{ name: 'network_stack_latency', params: { timestamp: 1234567890123n, unknown_flag: 0 } }])
      })
    }
  })

  describe('servers asking for a latency answer with needs_response (1.16.220+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220')) {
      it(`bedrock ${version}: echoes the timestamp when asked`, async () => {
        const { server, driver } = await bedrockTestBot(bedrockCodec(version))
        server.send('network_stack_latency', { timestamp: 1234567890123n, needs_response: 1 })
        server.send('network_stack_latency', { timestamp: 5n, needs_response: 0 })
        await driver.frame(0)
        assert.deepStrictEqual(sentInOneFlush(server), [{ name: 'network_stack_latency', params: { timestamp: 1234567890123n, needs_response: 0 } }])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('asks for the chunk radius it was given', async () => {
      const { server, driver } = await bedrockTestBot(codec, { viewDistance: 5 })
      server.send('start_game', { runtime_entity_id: 1n })
      await driver.frame(0)
      assert.deepStrictEqual(server.sent[0], { name: 'request_chunk_radius', params: { chunk_radius: 5, max_radius: 28 } })
    })

    it('answers in the frame after the packet arrived, all in one flush', async () => {
      const { server, driver } = await bedrockTestBot(codec)
      server.send('play_status', { status: 'login_success' })
      server.send('resource_packs_info')
      assert.strictEqual(server.batches.length, 0)
      await driver.frame(0)
      assert.deepStrictEqual(server.batches.map(batch => batch.map(packet => `${packet.name} ${packet.phase}`)), [['client_cache_status F2', 'resource_pack_client_response F2']])
    })

    it('ends with an error on a second start_game', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      const ended = once(bot, 'end')
      server.send('start_game', { runtime_entity_id: 1n })
      server.send('start_game', { runtime_entity_id: 1n })
      await driver.frame(0)
      assert.deepStrictEqual(errors, ['the ticks already started (a second start_game)', 'the start_game handler threw'])
      assert.strictEqual(server.closed, true)
      await driver.frame(0)
      assert.deepStrictEqual(await ended, ['socketClosed'])
    })

    it('reports player_spawn before start_game', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      server.send('play_status', { status: 'player_spawn' })
      await driver.frame(0)
      assert.deepStrictEqual(errors, ['play_status player_spawn before start_game'])
      bot.end()
    })

    it('reports the connection\'s errors', async () => {
      const { bot, internal, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      internal._core.inbox.notice({ kind: 'error', error: new Error('socket') }, driver.now)
      internal._core.inbox.notice({ kind: 'connected' }, driver.now)
      await driver.frame(0)
      assert.deepStrictEqual(errors, ['socket'])
      bot.end()
    })
  })
})
