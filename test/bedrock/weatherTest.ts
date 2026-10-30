import assert from 'assert'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { StartGame } from './common/world.ts'

// start_game's weather and level_event's are written alike on every version. No recording has weather (the recorded
// worlds' is clear: start_game's rain and lightning levels 0): the rest is written by hand, level_event's data the
// level of 65535.

const EVENTS = ['login', 'rain', 'weatherUpdate'] as const

type Weather = 'start_rain' | 'stop_rain' | 'start_thunder' | 'stop_thunder' | 'sound_click'

function weatherOf (bot: BedrockBot): string {
  return `${String(bot.isRaining)} ${bot.rainState} ${bot.thunderState}`
}

async function loggedIn (codec: BedrockCodec, fields: StartGame = {}): Promise<{ bot: BedrockBot, server: FakeBedrockClient, events: string[], weather: (event: Weather, data: number) => Promise<void> }> {
  const { bot, server, driver } = await bedrockTestBot(codec)
  const events: string[] = []
  for (const name of EVENTS) bot.on(name, () => { events.push(`${name} ${weatherOf(bot)}`) })
  new ServerWorld(server).startGame(undefined, undefined, fields)
  await driver.frame(0)
  return {
    bot,
    server,
    events,
    weather: async (event, data) => {
      server.send('level_event', { event, position: { x: 0, y: 0, z: 0 }, data })
      await driver.frame(0)
    }
  }
}

describe('bedrock weather', () => {
  describe('servers writing start_game\'s weather and level_event alike (every version)', () => {
    for (const version of bedrockTestVersions()) {
      describe(`bedrock ${version}`, () => {
        let codec: BedrockCodec
        before(() => { codec = bedrockCodec(version) })

        it("is clear until start_game, and in the recorded worlds' clear weather, without an event", async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          assert.strictEqual(weatherOf(bot), 'false 0 0')
          const events: string[] = []
          for (const name of EVENTS) bot.on(name, () => { events.push(name) })
          new ServerWorld(server).startGame(undefined, undefined, { rain_level: 0, lightning_level: 0 })
          await driver.frame(0)
          assert.deepStrictEqual([events, weatherOf(bot)], [['login'], 'false 0 0'])
          bot.end()
        })

        it("takes start_game's rain and lightning after login: rain, then weatherUpdate", async () => {
          const { bot, events } = await loggedIn(codec, { rain_level: 1, lightning_level: 0.5 })
          assert.deepStrictEqual(events, ['login false 0 0', 'rain true 1 0.5', 'weatherUpdate true 1 0.5'])
          bot.end()
        })

        it('follows level_event: rain, then weatherUpdate, when it starts or stops raining; weatherUpdate on a thunder level', async () => {
          const { bot, events, weather } = await loggedIn(codec)
          events.length = 0
          await weather('start_rain', 65535)
          await weather('start_thunder', 32767)
          await weather('stop_thunder', 0)
          await weather('stop_rain', 0)
          assert.deepStrictEqual(events, [
            'rain true 1 0', 'weatherUpdate true 1 0',
            `weatherUpdate true 1 ${32767 / 65535}`,
            'weatherUpdate true 1 0',
            'rain false 0 0', 'weatherUpdate false 0 0'
          ])
          bot.end()
        })
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('thunders without rain, rains at a level 0 too, and takes a level above 65535 as full; a level it has emits nothing, nor do other level events', async () => {
      const { bot, events, weather } = await loggedIn(codec)
      events.length = 0
      await weather('start_thunder', 65535)
      await weather('stop_thunder', 0)
      await weather('start_rain', 0)
      await weather('start_rain', 0)
      await weather('start_thunder', 70000)
      await weather('start_thunder', 65535)
      await weather('start_rain', 70000)
      await weather('stop_rain', 0)
      await weather('stop_rain', 0)
      await weather('sound_click', 1)
      assert.deepStrictEqual(events, [
        'weatherUpdate false 0 1', 'weatherUpdate false 0 0',
        'rain true 0 0',
        'weatherUpdate true 0 1',
        'weatherUpdate true 1 1',
        'rain false 0 1', 'weatherUpdate false 0 1'
      ])
      bot.end()
    })

    it("rains from start_game's rain level above 0, and its thunder alone is no rain", async () => {
      const rain = await loggedIn(codec, { rain_level: 0.25, lightning_level: 0 })
      assert.deepStrictEqual(rain.events, ['login false 0 0', 'rain true 0.25 0', 'weatherUpdate true 0.25 0'])
      rain.bot.end()
      const thunder = await loggedIn(codec, { rain_level: 0, lightning_level: 1 })
      assert.deepStrictEqual(thunder.events, ['login false 0 0', 'weatherUpdate false 0 1'])
      thunder.bot.end()
    })
  })
})
