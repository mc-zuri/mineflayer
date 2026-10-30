import assert from 'assert'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3, StartGame } from './common/world.ts'

// start_game and set_spawn_position are written alike on every version. The recorded worlds' spawn and the login's
// set_spawn_position are those servers sent the vanilla Bedrock client; no recording has the world's spawn moved, or the
// player's own spawn set: those are written by hand.

/** the login's set_spawn_position, recorded on every version: the player's own spawn, not set */
const LOGIN_SET_SPAWN_POSITION = '2b00ffffffff0fffffffff0fffffffff0f06ffffffff0fffffffff0fffffffff0f'
const UNSET = Object.freeze({ x: -2147483648, y: -2147483648, z: -2147483648 })

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

function spawnPointOf (bot: BedrockBot): Point3 {
  return { x: bot.spawnPoint.x, y: bot.spawnPoint.y, z: bot.spawnPoint.z }
}

async function loggedIn (codec: BedrockCodec, fields: StartGame = {}): Promise<{ bot: BedrockBot, server: FakeBedrockClient, events: string[], frame: () => Promise<void> }> {
  const { bot, server, driver } = await bedrockTestBot(codec)
  const events: string[] = []
  for (const name of ['login', 'game', 'spawnReset'] as const) bot.on(name, () => { events.push(`${name} ${JSON.stringify(spawnPointOf(bot))}`) })
  new ServerWorld(server).startGame(undefined, undefined, fields)
  await driver.frame(0)
  return { bot, server, events, frame: async () => { await driver.frame(0) } }
}

describe('bedrock spawn point', () => {
  describe('servers writing start_game\'s spawn and set_spawn_position alike (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: is (0, 0, 0) until start_game, then its spawn, by login; the login's unset player spawn changes nothing`, async () => {
        const codec = bedrockCodec(version)
        const { bot, server, driver } = await bedrockTestBot(codec)
        assert.deepStrictEqual(spawnPointOf(bot), { x: 0, y: 0, z: 0 })
        const events: string[] = []
        for (const name of ['login', 'game', 'spawnReset'] as const) bot.on(name, () => { events.push(`${name} ${JSON.stringify(spawnPointOf(bot))}`) })
        // the respawns recordings' world
        new ServerWorld(server).startGame(undefined, undefined, { spawn_position: { x: 0, y: 12, z: 10 } })
        receive(server, LOGIN_SET_SPAWN_POSITION)
        await driver.frame(0)
        assert.deepStrictEqual(events, ['login {"x":0,"y":12,"z":10}', 'game {"x":0,"y":12,"z":10}'])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion}, written by hand)`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('keeps the height start_game does not fix (y 32767, as the recorded logins), and follows the world spawn set, with game', async () => {
      const { bot, server, events, frame } = await loggedIn(codec, { spawn_position: { x: 0, y: 32767, z: 0 } })
      events.length = 0
      server.send('set_spawn_position', { spawn_type: 'world', player_position: UNSET, dimension: 0, world_position: { x: 8, y: 70, z: -24 } })
      // a type the version does not name
      server.send('set_spawn_position', { spawn_type: 2, player_position: UNSET, dimension: 0, world_position: { x: 1, y: 2, z: 3 } })
      await frame()
      assert.deepStrictEqual(events, ['game {"x":8,"y":70,"z":-24}'])
      bot.end()
    })

    it("emits spawnReset when the player's own spawn, once set, is unset; setting it changes no spawn point", async () => {
      const { bot, server, events, frame } = await loggedIn(codec, { spawn_position: { x: 0, y: 12, z: 10 } })
      events.length = 0
      server.send('set_spawn_position', { spawn_type: 'player', player_position: { x: 5, y: 64, z: 5 }, dimension: 0, world_position: { x: 0, y: 12, z: 10 } })
      server.send('set_spawn_position', { spawn_type: 'player', player_position: { x: 6, y: 64, z: 5 }, dimension: 0, world_position: { x: 0, y: 12, z: 10 } })
      await frame()
      assert.deepStrictEqual(events, [])
      server.send('set_spawn_position', { spawn_type: 'player', player_position: UNSET, dimension: 3, world_position: UNSET })
      server.send('set_spawn_position', { spawn_type: 'player', player_position: UNSET, dimension: 3, world_position: UNSET })
      // a spawn set where one coordinate is
      for (const point of [{ ...UNSET, x: 5 }, { ...UNSET, y: 64 }, { ...UNSET, z: 5 }]) {
        server.send('set_spawn_position', { spawn_type: 'player', player_position: point, dimension: 0, world_position: UNSET })
        server.send('set_spawn_position', { spawn_type: 'player', player_position: UNSET, dimension: 3, world_position: UNSET })
        // a type the version does not name sets nothing
        server.send('set_spawn_position', { spawn_type: 2, player_position: { x: 5, y: 64, z: 5 }, dimension: 0, world_position: UNSET })
        server.send('set_spawn_position', { spawn_type: 'player', player_position: UNSET, dimension: 3, world_position: UNSET })
      }
      await frame()
      assert.deepStrictEqual(events, Array(4).fill('spawnReset {"x":0,"y":12,"z":10}'))
      bot.end()
    })
  })
})
