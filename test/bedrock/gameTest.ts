import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, GameState } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Dimension, StartGame } from './common/world.ts'

// The packets and values are those servers sent the vanilla Bedrock client, recorded on every version, small ones as
// their bytes. Versions whose servers send alike are a group, and each group's tests run on each of its versions.

/** the recorded player's unique id, which update_player_game_type names */
const UNIQUE_ID = -8589934591n

/** the recorded worlds: flat, peaceful, and the player's game type falling back to the world's, survival */
const RECORDED_START_GAME: StartGame = Object.freeze({ entity_id: UNIQUE_ID, player_gamemode: 'fallback', world_gamemode: 'survival', generator: 2, difficulty: 0 })

const SET_DIFFICULTY = Object.freeze({ peaceful: '3c00', easy: '3c01' })

/** update_player_game_type of the player: its fallback at the login, then /gamemode creative and /gamemode survival */
interface GameTypes { fallback: string, creative: string, survival: string }

const UNSTAMPED: GameTypes = Object.freeze({ fallback: '97010afdffffff3f', creative: '970102fdffffff3f', survival: '970100fdffffff3f' })
const TICK_ZERO: GameTypes = Object.freeze({ fallback: '97010afdffffff3f00', creative: '970102fdffffff3f00', survival: '970100fdffffff3f00' })
/** 1.21.70's ticks */
const STAMPED: GameTypes = Object.freeze({ fallback: '97010afdffffff3f00', creative: '970102fdffffff3f49', survival: '970100fdffffff3faa03' })

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** login and game, game with the game mode it left */
function gameEvents (bot: BedrockBot): string[] {
  const events: string[] = []
  bot.on('login', () => { events.push('login') })
  bot.on('game', () => { events.push(`game ${bot.game.gameMode}`) })
  return events
}

/** the engine start_game names: the server's release (recorded, the build's) */
function engineOf (version: BedrockVersion): string {
  return version.slice('bedrock_'.length)
}

async function loggedIn (codec: BedrockCodec, fields: StartGame = {}, dimension: Dimension = 'overworld'): Promise<{ bot: BedrockBot, server: FakeBedrockClient, events: string[], frame: () => Promise<void> }> {
  const { bot, server, driver } = await bedrockTestBot(codec)
  new ServerWorld(server, { dimension }).startGame(undefined, undefined, { ...RECORDED_START_GAME, ...fields })
  await driver.frame(0)
  return { bot, server, events: gameEvents(bot), frame: async () => { await driver.frame(0) } }
}

describe('bedrock game', () => {
  const groups: Array<{ title: string, versions: BedrockVersion[], fields: (version: BedrockVersion) => StartGame, game: (version: BedrockVersion) => Partial<GameState>, gameTypes: GameTypes }> = [{
    title: 'servers naming no engine, the overworld 256 high from 0 (up to 1.16.220)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.220'),
    fields: () => ({}),
    game: () => ({ minY: 0, height: 256 }),
    gameTypes: UNSTAMPED
  }, {
    title: 'servers naming their engine, the overworld 256 high from 0 (1.17.0 - 1.17.40)',
    versions: bedrockTestVersionsFrom('bedrock_1.17.0', 'bedrock_1.17.40'),
    fields: version => ({ engine: engineOf(version) }),
    game: version => ({ serverBrand: engineOf(version), minY: 0, height: 256 }),
    gameTypes: UNSTAMPED
  }, {
    title: 'servers whose overworld is 384 high from -64, its dimension numbered (1.18.0 - 1.18.11) or named (1.18.30 - 1.20.71)',
    versions: bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.20.71'),
    fields: version => ({ engine: engineOf(version) }),
    game: version => ({ serverBrand: engineOf(version), minY: -64, height: 384 }),
    gameTypes: UNSTAMPED
  }, {
    title: "servers naming whether it is hardcore, and the game type's tick, 0 (1.20.80 - 1.21.60)",
    versions: bedrockTestVersionsFrom('bedrock_1.20.80', 'bedrock_1.21.60'),
    fields: version => ({ engine: engineOf(version), hardcore: false }),
    game: version => ({ serverBrand: engineOf(version), minY: -64, height: 384 }),
    gameTypes: TICK_ZERO
  }, {
    title: 'servers stamping the game type with their tick (1.21.70+)',
    versions: bedrockTestVersionsFrom('bedrock_1.21.70'),
    fields: version => ({ engine: engineOf(version), hardcore: false }),
    game: version => ({ serverBrand: engineOf(version), minY: -64, height: 384 }),
    gameTypes: STAMPED
  }]

  for (const { title, versions, fields, game, gameTypes } of groups) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          let codec: BedrockCodec
          before(() => { codec = bedrockCodec(version) })

          it('has bot.game when it logs in, then emits game; the login\'s difficulty and fallback game type change nothing', async () => {
            const { bot, server, driver } = await bedrockTestBot(codec)
            const events = gameEvents(bot)
            let atLogin: object | undefined
            bot.on('login', () => { atLogin = { ...bot.game } })
            new ServerWorld(server).startGame(undefined, undefined, { ...RECORDED_START_GAME, ...fields(version) })
            receive(server, SET_DIFFICULTY.peaceful, gameTypes.fallback)
            await driver.frame(0)
            const expected = { levelType: 'flat', gameMode: 'survival', hardcore: false, dimension: 'overworld', difficulty: 'peaceful', ...game(version) }
            assert.deepStrictEqual([atLogin, { ...bot.game }], [expected, expected])
            assert.deepStrictEqual(events, ['login', 'game survival', 'game survival'])
            bot.end()
          })

          it('follows /gamemode creative and /gamemode survival, each with game', async () => {
            const { bot, server, events, frame } = await loggedIn(codec, fields(version))
            receive(server, gameTypes.creative)
            await frame()
            assert.strictEqual(bot.game.gameMode, 'creative')
            receive(server, gameTypes.survival)
            await frame()
            assert.deepStrictEqual(events, ['game creative', 'game survival'])
            bot.end()
          })
        })
      }
    })
  }

  describe('servers naming the dimension by its number (up to 1.18.11)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.18.11')) {
      it(`bedrock ${version}: the nether is 128 high, the end 256, from 0; a number no dimension has is the overworld`, async () => {
        const overworld = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? { minY: -64, height: 384 } : { minY: 0, height: 256 }
        const codec = bedrockCodec(version)
        const games: object[] = []
        for (const dimension of ['nether', 'end'] as const) {
          const { bot } = await loggedIn(codec, {}, dimension)
          games.push({ dimension: bot.game.dimension, minY: bot.game.minY, height: bot.game.height })
          bot.end()
        }
        const { bot } = await loggedIn(codec, { dimension: 3 })
        assert.deepStrictEqual([...games, { dimension: bot.game.dimension, minY: bot.game.minY, height: bot.game.height }], [
          { dimension: 'the_nether', minY: 0, height: 128 },
          { dimension: 'the_end', minY: 0, height: 256 },
          { dimension: 'overworld', ...overworld }
        ])
        bot.end()
      })
    }
  })

  describe('servers naming the dimension (1.18.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.30')) {
      it(`bedrock ${version}: the nether is 128 high, the end 256, from 0`, async () => {
        const codec = bedrockCodec(version)
        const games: object[] = []
        for (const dimension of ['nether', 'end'] as const) {
          const { bot } = await loggedIn(codec, {}, dimension)
          games.push({ dimension: bot.game.dimension, minY: bot.game.minY, height: bot.game.height })
          bot.end()
        }
        assert.deepStrictEqual(games, [{ dimension: 'the_nether', minY: 0, height: 128 }, { dimension: 'the_end', minY: 0, height: 256 }])
      })
    }
  })

  describe('servers whose game types have no spectator mode (up to 1.18.11)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.18.11')) {
      it(`bedrock ${version}: the survival and creative spectator game types are spectator`, async () => {
        const { bot, server, events, frame } = await loggedIn(bedrockCodec(version))
        server.send('set_player_game_type', { gamemode: 'survival_spectator' })
        server.send('set_player_game_type', { gamemode: 'adventure' })
        server.send('set_player_game_type', { gamemode: 'creative_spectator' })
        await frame()
        assert.deepStrictEqual(events, ['game spectator', 'game adventure', 'game spectator'])
        bot.end()
      })
    }
  })

  describe('servers whose game types have a spectator mode (1.18.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.30')) {
      it(`bedrock ${version}: the spectator game types are spectator`, async () => {
        const { bot, server, events, frame } = await loggedIn(bedrockCodec(version))
        for (const gamemode of ['spectator', 'adventure', 'survival_spectator', 'creative', 'creative_spectator'] as const) server.send('set_player_game_type', { gamemode })
        await frame()
        assert.deepStrictEqual(events, ['game spectator', 'game adventure', 'game spectator', 'game creative', 'game spectator'])
        bot.end()
      })
    }
  })

  describe('servers naming whether the world is hardcore (1.20.80+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.80')) {
      it(`bedrock ${version}: is hardcore`, async () => {
        const { bot } = await loggedIn(bedrockCodec(version), { hardcore: true })
        assert.strictEqual(bot.game.hardcore, true)
        bot.end()
      })
    }
  })

  /** the bot's answer to start_game, when the player's game type falls back to the world's */
  async function answer (version: BedrockVersion): Promise<string[]> {
    const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
    new ServerWorld(server).startGame(undefined, undefined, RECORDED_START_GAME)
    await driver.frame(0)
    bot.end()
    const [setGameType] = server.sentOf('set_player_game_type')
    assert.ok(setGameType !== undefined)
    assert.strictEqual(server.codec.serializer.createPacketBuffer({ name: 'set_player_game_type', params: setGameType }).toString('hex'), '3e0a')
    assert.strictEqual(server.batches.length, 1)
    return server.sent.map(({ name }) => name)
  }

  describe('servers answered with the fallback game type after the chunk radius and tick_sync (up to 1.20.50)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.50')) {
      it(`bedrock ${version}: says the player falls back to the world's game type`, async () => {
        assert.deepStrictEqual(await answer(version), ['request_chunk_radius', 'tick_sync', 'set_player_game_type'])
      })
    }
  })

  describe('servers answered with the fallback game type after the chunk radius (1.20.61 - 1.21.2)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.61', 'bedrock_1.21.2')) {
      it(`bedrock ${version}: says the player falls back to the world's game type`, async () => {
        assert.deepStrictEqual(await answer(version), ['request_chunk_radius', 'set_player_game_type'])
      })
    }
  })

  describe('servers answered with the fallback game type before the loading screen (1.21.20 - 1.26.10)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20', 'bedrock_1.26.10')) {
      it(`bedrock ${version}: says the player falls back to the world's game type`, async () => {
        assert.deepStrictEqual(await answer(version), ['request_chunk_radius', 'set_player_game_type', 'serverbound_loading_screen'])
      })
    }
  })

  describe('servers answered with the fallback game type first (1.26.20+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.20')) {
      it(`bedrock ${version}: says the player falls back to the world's game type`, async () => {
        assert.deepStrictEqual(await answer(version), ['set_player_game_type', 'request_chunk_radius', 'serverbound_loading_screen'])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('has no bot.game fields before start_game, and maxPlayers throws, naming itself', async () => {
      const { bot } = await bedrockTestBot(codec)
      assert.deepStrictEqual(Object.keys(bot.game), [])
      assert.throws(() => bot.game.maxPlayers, { message: 'bot.game.maxPlayers is not supported on Bedrock: no packet tells it' })
      bot.end()
    })

    it('spreads and serializes bot.game without maxPlayers', async () => {
      const { bot } = await loggedIn(codec, { engine: '1.26.60', hardcore: false })
      const game = { levelType: 'flat', gameMode: 'survival', hardcore: false, dimension: 'overworld', difficulty: 'peaceful', minY: -64, height: 384, serverBrand: '1.26.60' }
      assert.deepStrictEqual({ ...bot.game }, game)
      assert.deepStrictEqual(JSON.parse(JSON.stringify(bot.game)), game)
      assert.throws(() => bot.game.maxPlayers, { message: 'bot.game.maxPlayers is not supported on Bedrock: no packet tells it' })
      bot.end()
    })

    it('takes the player\'s own game type of start_game, and its world\'s when it falls back to it', async () => {
      const modes: string[] = []
      for (const fields of [{ player_gamemode: 'adventure' }, { world_gamemode: 'creative' }, { world_gamemode: 'fallback' }] as const) {
        const { bot } = await loggedIn(codec, fields)
        modes.push(bot.game.gameMode)
        bot.end()
      }
      assert.deepStrictEqual(modes, ['adventure', 'creative', 'survival'])
    })

    it("takes the world's generator for the level type: flat, the old limited worlds' as Java's 1.1, the others default", async () => {
      const levelTypes: string[] = []
      for (const generator of [2, 0, 1, 5]) {
        const { bot } = await loggedIn(codec, { generator })
        levelTypes.push(bot.game.levelType)
        bot.end()
      }
      assert.deepStrictEqual(levelTypes, ['flat', 'default_1_1', 'default', 'default'])
    })

    it('follows set_difficulty without an event, as Java, and keeps a difficulty the version does not name', async () => {
      const { bot, server, events, frame } = await loggedIn(codec, { difficulty: 3 })
      assert.strictEqual(bot.game.difficulty, 'hard')
      receive(server, SET_DIFFICULTY.easy)
      await frame()
      assert.strictEqual(bot.game.difficulty, 'easy')
      receive(server, '3c04')
      await frame()
      assert.deepStrictEqual([bot.game.difficulty, events], ['easy', []])
      bot.end()
    })

    it("follows set_player_game_type, and ignores another player's update_player_game_type", async () => {
      const { bot, server, events, frame } = await loggedIn(codec)
      server.send('update_player_game_type', { gamemode: 'creative', player_unique_id: -4294967295n })
      server.send('set_player_game_type', { gamemode: 'creative' })
      server.send('set_player_game_type', { gamemode: 'fallback' })
      await frame()
      assert.deepStrictEqual(events, ['game creative', 'game survival'])
      bot.end()
    })

    it("takes a game type the version does not name for survival, as Java's game mode out of range", async () => {
      const { bot, server, events, frame } = await loggedIn(codec, { player_gamemode: 'creative' })
      receive(server, '3e0e')
      await frame()
      assert.deepStrictEqual(events, ['game survival'])
      bot.end()
    })

    it("follows the world's game type while the player's falls back to it", async () => {
      const { bot, server, events, frame } = await loggedIn(codec)
      server.send('set_default_game_type', { gamemode: 'creative' })
      server.send('set_player_game_type', { gamemode: 'adventure' })
      server.send('set_default_game_type', { gamemode: 'survival' })
      server.send('set_player_game_type', { gamemode: 'fallback' })
      server.send('set_default_game_type', { gamemode: 'fallback' })
      await frame()
      assert.deepStrictEqual(events, ['game creative', 'game adventure', 'game survival', 'game survival'])
      bot.end()
    })

    it("keeps the player's own game type of start_game when the world's changes", async () => {
      const { bot, server, events, frame } = await loggedIn(codec, { player_gamemode: 'adventure' })
      server.send('set_default_game_type', { gamemode: 'creative' })
      await frame()
      assert.deepStrictEqual([bot.game.gameMode, events], ['adventure', []])
      bot.end()
    })
  })
})
