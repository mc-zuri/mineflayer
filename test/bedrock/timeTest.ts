import assert from 'assert'
import { latestSupportedBedrockVersion, testedBedrockVersions } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, Time, TimeNotSynced } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import type { ManualDriver } from './common/driver.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'

// The packets and values are those servers sent the vanilla Bedrock client, recorded on every version.
// Versions are grouped by how their servers send the time; each group's tests run on each of its versions.

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return testedBedrockVersions.indexOf(version) >= testedBedrockVersions.indexOf(since)
}

/** the dodaylightcycle game rule as the version's servers send it */
function daylightCycle (version: BedrockVersion, value: boolean): { name: string, type: 'bool', value: boolean, editable: boolean } | { name: string, type: 'bool', value: boolean } {
  const rule = { name: atLeast(version, 'bedrock_1.20.71') ? 'doDayLightCycle' : 'dodaylightcycle', type: 'bool' as const, value }
  return atLeast(version, 'bedrock_1.17.0') ? { ...rule, editable: true } : rule
}

function noon (age: bigint, doDaylightCycle: boolean): Time {
  return { doDaylightCycle, bigTime: 6000n, time: 6000, timeOfDay: 6000, day: 0, isDay: true, moonPhase: 0, bigAge: age, age: Number(age) }
}

/** the states bot.time goes through while the packets are handled in a frame: [time, doDaylightCycle] */
async function timeStates (bot: BedrockBot, driver: ManualDriver, send: () => void): Promise<Array<[number | null, boolean | null]>> {
  const states: Array<[number | null, boolean | null]> = []
  bot.on('time', () => {
    const last = states[states.length - 1]
    if (last?.[0] !== bot.time.time || last[1] !== bot.time.doDaylightCycle) states.push([bot.time.time, bot.time.doDaylightCycle])
  })
  send()
  await driver.frame(0)
  return states
}

function sentByTime (server: FakeBedrockClient): string[] {
  return server.batches.flat().filter(packet => packet.owner === 'time').map(packet => packet.name)
}

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

const SET_TIME = {
  noon: '0ae05d',
  1000: '0ad00f',
  1500: '0ab817',
  6062: '0adc5e',
  30000: '0ae0d403'
}

const OVERWORLD_CLOCK_ID = 7194480507151251734n
const CLOCK_STATE = {
  noon: 'd802000196f2e3e1f3bcfbeb63e05d00',
  1000: 'd802000196f2e3e1f3bcfbeb63d00f00',
  1500: 'd802000196f2e3e1f3bcfbeb63b81700',
  6003: 'd802000196f2e3e1f3bcfbeb63e65d00',
  30000: 'd802000196f2e3e1f3bcfbeb63e0d40300'
}
const OVERWORLD_CLOCK = {
  id: OVERWORLD_CLOCK_ID,
  name: 'minecraft:overworld',
  time: 6000,
  paused: false,
  time_markers: [
    { id: 2625810911898139949n, name: 'minecraft:sunrise', time: 23000, period: 24000 },
    { id: 4918950784056990566n, name: 'minecraft:night', time: 13000, period: 24000 },
    { id: 6827470627776846754n, name: 'minecraft:noon', time: 6000, period: 24000 },
    { id: 11262090321339182944n, name: 'minecraft:midnight', time: 18000, period: 24000 },
    { id: 13638948813458750018n, name: 'minecraft:day', time: 1000, period: 24000 },
    { id: 16664792990819124822n, name: 'minecraft:sunset', time: 12000, period: 24000 }
  ]
}

describe('bedrock time', () => {
  describe('servers sending set_time', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.26.20')) {
      describe(`bedrock ${version}`, () => {
        let codec: BedrockCodec
        before(() => { codec = bedrockCodec(version) })

        it('has the time once the login brought both it and the age', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          let times = 0
          bot.on('time', () => { times++ })
          const time = (): Time | TimeNotSynced => bot.time
          receive(server, SET_TIME.noon)
          await driver.frame(0)
          assert.strictEqual(time().time, null)
          server.send('start_game', { current_tick: 4304n, gamerules: [daylightCycle(version, false)] })
          await driver.frame(0)
          assert.deepStrictEqual(time(), noon(4304n, false))
          receive(server, SET_TIME.noon)
          server.send('game_rules_changed', { rules: [daylightCycle(version, false)] })
          await driver.frame(0)
          assert.deepStrictEqual(time(), noon(4304n, false))
          assert.strictEqual(times, 3)
          assert.deepStrictEqual(sentByTime(server), [])
          bot.end()
        })

        it('follows time set and gamerule dodaylightcycle', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          const states = await timeStates(bot, driver, () => {
            receive(server, SET_TIME.noon)
            server.send('start_game', { current_tick: 11055n, gamerules: [daylightCycle(version, false)] })
            receive(server, SET_TIME[1000], SET_TIME[1500], SET_TIME.noon)
            server.send('game_rules_changed', { rules: [daylightCycle(version, true)] })
            receive(server, SET_TIME[6062])
            server.send('game_rules_changed', { rules: [daylightCycle(version, false)] })
            receive(server, SET_TIME[30000])
          })
          assert.deepStrictEqual(states, [[6000, false], [1000, false], [1500, false], [6000, false], [6000, true], [6062, true], [6062, false], [30000, false]])
          assert.strictEqual(bot.time.day, 1)
          bot.end()
        })
      })
    }
  })

  describe('servers answering the tick_sync the bot sends on start_game, up to 1.20.50', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.50')) {
      it(`bedrock ${version}: takes the age of the answer, without a time event`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        server.send('start_game', { current_tick: 4304n })
        receive(server, SET_TIME.noon)
        await driver.frame(0)
        let times = 0
        bot.on('time', () => { times++ })
        receive(server, '170000000000000000da10000000000000')
        await driver.frame(0)
        assert.strictEqual(bot.time.age, 4314)
        assert.strictEqual(times, 0)
        bot.end()
      })
    }
  })

  describe('servers sending world clocks', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.30')) {
      describe(`bedrock ${version}`, () => {
        let codec: BedrockCodec
        before(() => { codec = bedrockCodec(version) })

        it("has the overworld clock's time once the login brought both it and the age, before the clocks are named", async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          const time = (): Time | TimeNotSynced => bot.time
          receive(server, CLOCK_STATE.noon)
          await driver.frame(0)
          assert.strictEqual(time().time, null)
          server.send('start_game', { current_tick: 18781n, gamerules: [daylightCycle(version, false)] })
          await driver.frame(0)
          assert.deepStrictEqual(time(), noon(18781n, false))
          server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [OVERWORLD_CLOCK] })
          server.send('game_rules_changed', { rules: [daylightCycle(version, false)] })
          receive(server, CLOCK_STATE.noon)
          await driver.frame(0)
          assert.deepStrictEqual(time(), noon(18781n, false))
          assert.deepStrictEqual(sentByTime(server), [])
          bot.end()
        })

        it('follows time set and gamerule dodaylightcycle: the clock is not paused when the game rule stops the day', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          const states = await timeStates(bot, driver, () => {
            receive(server, CLOCK_STATE.noon)
            server.send('start_game', { current_tick: 5711n, gamerules: [daylightCycle(version, false)] })
            server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [OVERWORLD_CLOCK] })
            receive(server, CLOCK_STATE[1000], CLOCK_STATE[1500], CLOCK_STATE.noon)
            server.send('game_rules_changed', { rules: [daylightCycle(version, true)] })
            receive(server, CLOCK_STATE[6003])
            server.send('game_rules_changed', { rules: [daylightCycle(version, false)] })
            receive(server, CLOCK_STATE[30000])
          })
          assert.deepStrictEqual(states, [[6000, false], [1000, false], [1500, false], [6000, false], [6000, true], [6003, true], [6003, false], [30000, false]])
          bot.end()
        })

        it('stops the day while the clock is paused', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          server.send('start_game', { current_tick: 1n, gamerules: [daylightCycle(version, true)] })
          server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [OVERWORLD_CLOCK] })
          await driver.frame(0)
          assert.strictEqual(bot.time.doDaylightCycle, true)
          server.send('sync_world_clocks', { payload_type: 'sync_state', sync_states: [{ clock_id: OVERWORLD_CLOCK_ID, time: 6000, paused: true }] })
          await driver.frame(0)
          assert.strictEqual(bot.time.doDaylightCycle, false)
          bot.end()
        })

        it('takes the overworld clock among the named ones', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          server.send('start_game', { current_tick: 1n })
          server.send('sync_world_clocks', {
            payload_type: 'initialize_registry',
            sync_states: undefined,
            clocks: [{ id: 3n, name: 'minecraft:the_end', time: 0, paused: true, time_markers: [] }, { ...OVERWORLD_CLOCK, time: 30000 }]
          })
          await driver.frame(0)
          assert.strictEqual(bot.time.time, 30000)
          bot.end()
        })
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('is every field null until the server sent the time', async () => {
      const { bot } = await bedrockTestBot(codec)
      assert.deepStrictEqual(bot.time, {
        doDaylightCycle: null, bigTime: null, time: null, timeOfDay: null, day: null, isDay: null, moonPhase: null, bigAge: null, age: null
      })
      bot.end()
    })

    it('reads an age whose low word is 2^31 or more (negative as [high, low] has it)', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      server.send('start_game', { current_tick: 0x1_8000_0001n })
      receive(server, SET_TIME.noon)
      await driver.frame(0)
      assert.strictEqual(bot.time.bigAge, 0x1_8000_0001n)
      bot.end()
    })

    it('knows night and the moon phase', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      server.send('start_game', { current_tick: 1n })
      server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [{ ...OVERWORLD_CLOCK, time: 13000 + 3 * 24000 }] })
      await driver.frame(0)
      assert.strictEqual(bot.time.timeOfDay, 13000)
      assert.strictEqual(bot.time.day, 3)
      assert.strictEqual(bot.time.isDay, false)
      assert.strictEqual(bot.time.moonPhase, 3)
      bot.end()
    })

    it('advances the age every tick, and the time while the day goes on, without a time event', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      server.send('start_game', { current_tick: 100n, gamerules: [daylightCycle(latestSupportedBedrockVersion, true)] })
      server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [OVERWORLD_CLOCK] })
      await driver.frame(0)
      let times = 0
      bot.on('time', () => { times++ })
      await driver.ticks(3)
      assert.deepStrictEqual([bot.time.age, bot.time.time], [103, 6003])
      server.send('game_rules_changed', { rules: [daylightCycle(latestSupportedBedrockVersion, false)] })
      await driver.frame(0)
      await driver.ticks(2)
      assert.deepStrictEqual([bot.time.age, bot.time.time, times], [105, 6003, 1])
      bot.end()
    })

    it("takes no time from a clock it cannot tell is the overworld's", async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      server.send('start_game', { current_tick: 1n })
      server.send('sync_world_clocks', { payload_type: 'sync_state', sync_states: [{ clock_id: 3n, time: 1, paused: false }, { clock_id: 4n, time: 2, paused: false }] })
      await driver.frame(0)
      assert.strictEqual(bot.time.time, null)
      bot.end()
    })

    it("ignores what does not change the time: other game rules, clock markers, a tick_sync without the server's tick", async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      server.send('start_game', { current_tick: 7n, gamerules: [daylightCycle(latestSupportedBedrockVersion, false)] })
      server.send('sync_world_clocks', { payload_type: 'initialize_registry', sync_states: undefined, clocks: [OVERWORLD_CLOCK] })
      await driver.frame(0)
      let times = 0
      bot.on('time', () => { times++ })
      server.send('game_rules_changed', { rules: [{ name: 'doWeatherCycle', type: 'bool', value: true, editable: true }] })
      server.send('sync_world_clocks', { payload_type: 'add_time_marker', sync_states: undefined, add_clock_id: OVERWORLD_CLOCK_ID, add_time_markers: [] })
      server.send('tick_sync', { request_time: 0n, response_time: 0n })
      await driver.frame(0)
      assert.deepStrictEqual(bot.time, noon(7n, false))
      assert.strictEqual(times, 0)
      bot.end()
    })

    it('advances nothing before the server sent the age', async () => {
      const { bot, internal, driver } = await bedrockTestBot(codec)
      internal._core.startTicks()
      await driver.ticks(2)
      assert.strictEqual(bot.time.age, null)
      bot.end()
    })
  })
})
