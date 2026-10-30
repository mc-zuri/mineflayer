import assert from 'assert'
import { createBedrockBot } from '../../lib/bedrock/loader.ts'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion, ViewDistance } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'

// The chunk radius asked of the server, as the vanilla client of each version asks for it (its answer to start_game,
// recorded on every version: 4510, 45101c, 45181c); asked again after it, which no recording has, as it would be.

const SKIN_PARTS = Object.freeze({ showCape: true, showJacket: true, showLeftSleeve: true, showRightSleeve: true, showLeftPants: true, showRightPants: true, showHat: true })

/** the radii the bot asked for, and where: S the start_game answer, F3 the input pass */
function asked (server: FakeBedrockClient): string[] {
  return server.batches.flat().filter(packet => packet.name === 'request_chunk_radius').map(packet => `${packet.phase === 'F2' ? 'S' : packet.phase} ${JSON.stringify(packet.params)}`)
}

describe('bedrock settings', () => {
  const groups: Array<{ title: string, versions: BedrockVersion[], radius: number, request: (radius: number) => object }> = [{
    title: 'servers asked for 8 chunks (up to 1.19.70)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.70'),
    radius: 8,
    request: radius => ({ chunk_radius: radius })
  }, {
    title: "servers asked for 8 chunks, at most the vanilla client's 28 (1.19.80 - 1.21.80)",
    versions: bedrockTestVersionsFrom('bedrock_1.19.80', 'bedrock_1.21.80'),
    radius: 8,
    request: radius => ({ chunk_radius: radius, max_radius: 28 })
  }, {
    title: "servers asked for 12 chunks, at most the vanilla client's 28 (1.21.90+)",
    versions: bedrockTestVersionsFrom('bedrock_1.21.90'),
    radius: 12,
    request: radius => ({ chunk_radius: radius, max_radius: 28 })
  }]

  for (const { title, versions, radius, request } of groups) {
    describe(title, () => {
      for (const version of versions) {
        it(`bedrock ${version}: has Java's settings, with the vanilla client's view distance, and asks for another one in the next frame`, async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          assert.deepStrictEqual(bot.settings, { chat: 'enabled', colorsEnabled: true, viewDistance: radius, difficulty: 2, skinParts: SKIN_PARTS, mainHand: 'right' })
          server.send('start_game', { runtime_entity_id: 1n })
          await driver.frame(0)
          bot.setSettings({ viewDistance: 'tiny' })
          assert.deepStrictEqual(asked(server), [`S ${JSON.stringify(request(radius))}`])
          await driver.frame(0)
          assert.deepStrictEqual(asked(server), [`S ${JSON.stringify(request(radius))}`, `F3 ${JSON.stringify(request(6))}`])
          assert.strictEqual(bot.settings.viewDistance, 'tiny')
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    async function loggedIn (viewDistance?: ViewDistance): Promise<TestBot> {
      const testBot = await bedrockTestBot(codec, viewDistance === undefined ? {} : { viewDistance })
      testBot.server.send('start_game', { runtime_entity_id: 1n })
      await testBot.driver.frame(0)
      return testBot
    }

    it("asks for Java's named view distances, and a number of chunks", async () => {
      const { bot, server, driver } = await loggedIn()
      for (const viewDistance of ['tiny', 'far', 'normal', 'short', 1] as const) {
        bot.setSettings({ viewDistance })
        await driver.frame(0)
      }
      assert.deepStrictEqual(server.sentOf('request_chunk_radius').map(({ chunk_radius: radius }) => radius), [12, 6, 12, 10, 8, 1])
      bot.end()
    })

    it('asks for no view distance it asked for already, and keeps the other settings without a packet', async () => {
      const { bot, server, driver } = await loggedIn()
      const skinParts = { ...SKIN_PARTS, showCape: false }
      bot.setSettings({ viewDistance: 'far', chat: 'commandsOnly', colorsEnabled: false, difficulty: 3, skinParts, mainHand: 'left' })
      bot.setSettings({})
      await driver.frame(0)
      assert.deepStrictEqual(server.batches.slice(1), [])
      assert.deepStrictEqual(bot.settings, { chat: 'commandsOnly', colorsEnabled: false, viewDistance: 'far', difficulty: 3, skinParts, mainHand: 'left' })
      bot.end()
    })

    it('asks for the view distance of the last call, in call order', async () => {
      const { bot, server, driver } = await loggedIn()
      bot.setSettings({ viewDistance: 4 })
      bot.setSettings({ viewDistance: 12 })
      await driver.frame(0)
      assert.deepStrictEqual(asked(server).slice(1), ['F3 {"chunk_radius":4,"max_radius":28}', 'F3 {"chunk_radius":12,"max_radius":28}'])
      bot.end()
    })

    it('asks for a view distance set before start_game in its answer', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      bot.setSettings({ viewDistance: 'short' })
      await driver.frame(0)
      server.send('start_game', { runtime_entity_id: 1n })
      await driver.frame(0)
      assert.deepStrictEqual(asked(server), ['S {"chunk_radius":8,"max_radius":28}'])
      bot.end()
    })

    it("takes Java's named view distance for the option, and asks for it", async () => {
      const { bot, server } = await loggedIn('normal')
      assert.strictEqual(bot.settings.viewDistance, 'normal')
      assert.deepStrictEqual(asked(server), ['S {"chunk_radius":10,"max_radius":28}'])
      bot.end()
    })

    it('throws for a view distance it cannot ask for, given as the option', () => {
      const seams = { connect: () => ({ flush: () => {}, close: () => {} }), drive: () => {} }
      // @ts-expect-error no such view distance
      assert.throws(() => createBedrockBot({ version: latestSupportedBedrockVersion, viewDistance: 'huge' }, seams), { message: 'invalid view distance setting: huge' })
      for (const viewDistance of [0, 2.5]) assert.throws(() => createBedrockBot({ version: latestSupportedBedrockVersion, viewDistance }, seams), { message: `invalid view distance setting: ${viewDistance}` })
    })

    it('throws for a setting Java throws for, changing none', async () => {
      const { bot, server, driver } = await loggedIn()
      // @ts-expect-error no such chat level
      assert.throws(() => { bot.setSettings({ chat: 'loud', viewDistance: 4 }) }, { message: 'invalid chat setting: loud' })
      // @ts-expect-error no such view distance
      assert.throws(() => { bot.setSettings({ viewDistance: 'huge' }) }, { message: 'invalid view distance setting: huge' })
      for (const viewDistance of [0, -1, 2.5]) assert.throws(() => { bot.setSettings({ viewDistance }) }, { message: `invalid view distance setting: ${viewDistance}` })
      // @ts-expect-error no such hand
      assert.throws(() => { bot.setSettings({ mainHand: 'both', viewDistance: 4 }) }, { message: 'invalid main hand: both' })
      await driver.frame(0)
      assert.deepStrictEqual([bot.settings, server.batches.slice(1)], [{ chat: 'enabled', colorsEnabled: true, viewDistance: 12, difficulty: 2, skinParts: SKIN_PARTS, mainHand: 'right' }, []])
      bot.end()
    })
  })
})
