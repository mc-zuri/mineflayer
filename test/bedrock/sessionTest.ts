import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import { once } from '../../lib/promise_utils.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, SentPacket } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Joined } from './common/world.ts'

// What the bot answers the server's handshake with, as the vanilla client of each version answers it, in the packet
// pass of the frame that received it.

function sentInOneFlush (server: FakeBedrockClient): SentPacket[] {
  assert.strictEqual(server.batches.length, 1)
  return server.sent
}

/** joins, then ticks twice more: the server, where the auth inputs started and the player moved, and the ends of the tick that spawned */
async function joined (codec: BedrockCodec): Promise<{ server: FakeBedrockClient, joined: Joined, spawned: string[] }> {
  const testBot = await bedrockTestBot(codec)
  const { bot, internal, server, driver } = testBot
  const spawned: string[] = []
  bot.on('spawn', () => { spawned.push(`spawn ${internal._core.tick ?? '-'}`) })
  bot.on('physicsTick', () => { if (spawned.length === 1) spawned.push(`physicsTick ${internal._core.tick ?? '-'}`) })
  const joined = await new ServerWorld(server).join(testBot)
  await driver.ticks(2)
  return { server, joined, spawned }
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

  describe('servers whose player moves from its first auth input (up to 1.17.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40')) {
      it(`bedrock ${version}: sends auth inputs from the tick after the column under the spawned player shows, and is initialized after the fifth`, async () => {
        const { server, joined: { firstAuthInput, moving }, spawned } = await joined(bedrockCodec(version))
        assert.deepStrictEqual([firstAuthInput, moving], [2, 2])
        assert.deepStrictEqual([1, 2, 5, 6, 7].map(tick => server.inTick(tick)), [[], ['player_auth_input', 'interact'], ['player_auth_input'], ['player_auth_input', 'set_local_player_as_initialized'], ['player_auth_input']])
        assert.deepStrictEqual(server.sentOf('set_local_player_as_initialized'), [{ runtime_entity_id: 1n }])
        assert.deepStrictEqual(spawned, ['spawn 6', 'physicsTick 6'])
      })
    }
  })

  /** the packets of each tick from the first auth input on (the first's requests aside), and the initialization */
  function joinedTicks (server: FakeBedrockClient, ticks: readonly number[]): string[][] {
    return ticks.map(tick => tick === 2 ? server.inTick(tick).filter(name => name !== 'subchunk_request') : server.inTick(tick))
  }

  describe('servers holding the player until the columns around it are loaded, initialized after the 13th tick it moves (1.18.0 – 1.20.50)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.20.50')) {
      it(`bedrock ${version}: sends auth inputs from the tick after the column under the spawned player shows, and is initialized after the 13th it moves`, async () => {
        const { server, joined: { firstAuthInput, moving }, spawned } = await joined(bedrockCodec(version))
        assert.deepStrictEqual([firstAuthInput, moving], [2, 4])
        // the inventory's interact, which tells the empty hand: up to 1.19.0 after the auth input, from 1.19.10 before it
        const shown = isBedrockVersionAtLeast(version, 'bedrock_1.19.10') ? ['interact', 'player_auth_input'] : ['player_auth_input', 'interact']
        assert.deepStrictEqual(joinedTicks(server, [1, 2, 3, 15, 16, 17]), [[], shown, ['player_auth_input'], ['player_auth_input'], ['player_auth_input', 'set_local_player_as_initialized'], ['player_auth_input']])
        assert.deepStrictEqual(server.sentOf('set_local_player_as_initialized'), [{ runtime_entity_id: 1n }])
        assert.deepStrictEqual(spawned, ['spawn 16', 'physicsTick 16'])
      })
    }
  })

  describe('servers holding the player until the columns around it are loaded, initialized after the 8th tick it moves (1.20.61 – 1.21.2)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.61', 'bedrock_1.21.2')) {
      it(`bedrock ${version}: sends auth inputs from the tick after the column under the spawned player shows, and is initialized after the 8th it moves`, async () => {
        const { server, joined: { firstAuthInput, moving }, spawned } = await joined(bedrockCodec(version))
        assert.deepStrictEqual([firstAuthInput, moving], [2, 4])
        assert.deepStrictEqual(joinedTicks(server, [1, 2, 3, 10, 11, 12]), [[], ['interact', 'player_auth_input'], ['player_auth_input'], ['player_auth_input'], ['player_auth_input', 'set_local_player_as_initialized'], ['player_auth_input']])
        assert.deepStrictEqual(server.sentOf('set_local_player_as_initialized'), [{ runtime_entity_id: 1n }])
        assert.deepStrictEqual(spawned, ['spawn 11', 'physicsTick 11'])
      })
    }
  })

  describe('servers holding the player until the columns around it are loaded, told by the loading screen (1.21.20+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20')) {
      it(`bedrock ${version}: sends auth inputs from the tick after the column under the spawned player shows, and ends the loading screen and is initialized after the last held`, async () => {
        const { server, joined: { firstAuthInput, moving }, spawned } = await joined(bedrockCodec(version))
        assert.deepStrictEqual([firstAuthInput, moving], [2, 4])
        assert.deepStrictEqual(joinedTicks(server, [1, 2, 3, 4]), [[], ['interact', 'player_auth_input'], ['player_auth_input', 'serverbound_loading_screen', 'set_local_player_as_initialized'], ['player_auth_input']])
        assert.deepStrictEqual(server.sentOf('serverbound_loading_screen'), [{ type: 1 }, { type: 2 }])
        assert.deepStrictEqual(server.sentOf('set_local_player_as_initialized'), [{ runtime_entity_id: 1n }])
        assert.deepStrictEqual(spawned, ['spawn 4', 'physicsTick 4'])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('shows the player once respawn says it is ready, play_status having spawned it', async () => {
      const { server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      await world.sendAround()
      server.send('play_status', { status: 'player_spawn' })
      server.send('respawn', { position: { x: 0.5, y: 13.6200103759765625, z: 0.5 }, state: 0, runtime_entity_id: 1n })
      await driver.ticks(3)
      assert.deepStrictEqual(server.sentOf('player_auth_input'), [])
      server.send('respawn', { position: { x: 0.5, y: 13.6200103759765625, z: 0.5 }, state: 1, runtime_entity_id: 1n })
      await driver.ticks(2)
      assert.deepStrictEqual([server.inTick(4), server.inTick(5).slice(0, 2)], [[], ['interact', 'player_auth_input']])
    })

    it('shows the player once play_status spawned it, respawn having said it is ready', async () => {
      const { server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      await world.sendAround()
      server.send('respawn', { position: { x: 0.5, y: 13.6200103759765625, z: 0.5 }, state: 1, runtime_entity_id: 1n })
      await driver.ticks(3)
      assert.deepStrictEqual(server.sentOf('player_auth_input'), [])
      server.send('play_status', { status: 'player_spawn' })
      await driver.ticks(2)
      assert.deepStrictEqual([server.inTick(4), server.inTick(5).slice(0, 2)], [[], ['interact', 'player_auth_input']])
    })

    it('waits 200 ticks for the column under the spawned player, then shows it without, naming the column', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      const world = new ServerWorld(server)
      world.startGame({ x: 40.5, y: 12, z: -7.5 })
      world.column(0, 0)
      await world.sendColumn(0, 0)
      world.spawn()
      await driver.ticks(199)
      assert.deepStrictEqual([errors, server.sentOf('player_auth_input')], [[], []])
      await driver.ticks(2)
      assert.deepStrictEqual(errors, ['the column (2, -1) under the player was not sent 200 ticks after it spawned'])
      assert.deepStrictEqual([server.inTick(200), server.inTick(201)], [[], ['interact', 'player_auth_input', 'subchunk_request']])
    })

    it('holds the player 200 ticks for the columns around it, then moves it without, naming them', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      const world = new ServerWorld(server)
      world.startGame({ x: 40.5, y: 12, z: -7.5 })
      world.spawn()
      world.column(2, -1)
      await world.load(driver, [[2, -1]])
      await driver.ticks(197)
      assert.deepStrictEqual([errors, internal._core.activation.active], [[], false])
      await driver.tick()
      assert.deepStrictEqual(errors, ['the columns (1, -2), (1, -1), (1, 0), (2, -2), (2, 0), (3, -2), (3, -1), (3, 0) around the player were not loaded 200 ticks after it showed'])
      assert.deepStrictEqual([server.inTick(201), internal._core.activation.active], [['player_auth_input', 'serverbound_loading_screen', 'set_local_player_as_initialized'], true])
    })

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
