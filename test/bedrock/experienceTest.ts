import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The packets are those servers sent the vanilla Bedrock client, recorded on every version, as their bytes: /xp to
// level 30, and from 1.21.30 the points cooking gave. Versions whose servers send alike are a group, and each group's
// tests run on each of its versions.

type Attributes = ClientboundPacketsToWrite['update_attributes']['attributes']

/** the cooking recordings' player, whose runtime id the level up names */
const COOKING_PLAYER = 12n

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** an attribute as the version's update_attributes writes it */
function attribute (version: BedrockVersion, name: string, current: number, max: number): Attributes[number] {
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  return {
    min: 0,
    max,
    current,
    default: 0,
    name,
    ...atLeast('bedrock_1.19.20') ? { modifiers: [] } : {},
    ...atLeast('bedrock_1.21.30') ? { default_min: 0, default_max: max } : {}
  }
}

const hunger = (version: BedrockVersion): Attributes[number] => attribute(version, 'minecraft:player.hunger', 20, 20)
const level = (version: BedrockVersion, current: number): Attributes[number] => attribute(version, 'minecraft:player.level', current, 24791)
const progress = (version: BedrockVersion, current: number): Attributes[number] => attribute(version, 'minecraft:player.experience', current, 1)

/** the level and the bar, with the hunger, as servers send them: the recorded login's are 0 */
function experienceOf (version: BedrockVersion, current: number, bar: number): Attributes {
  return [hunger(version), level(version, current), progress(version, bar)]
}

async function loggedIn (codec: BedrockCodec, runtimeEntityId = 1n): Promise<{ bot: BedrockBot, server: FakeBedrockClient, events: string[], frame: () => Promise<void> }> {
  const { bot, server, driver } = await bedrockTestBot(codec)
  new ServerWorld(server).startGame(undefined, undefined, { runtime_entity_id: runtimeEntityId })
  await driver.frame(0)
  const events: string[] = []
  bot.on('experience', () => { events.push(`experience ${JSON.stringify(bot.experience)}`) })
  return { bot, server, events, frame: async () => { await driver.frame(0) } }
}

function experience (level: number, points: number, progress: number): string {
  return `experience ${JSON.stringify({ level, points, progress })}`
}

describe('bedrock experience', () => {
  const layouts: Array<{ title: string, versions: BedrockVersion[], level30: string }> = [{
    title: 'servers sending an attribute without its modifiers (up to 1.19.10)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.10'),
    level30: '1d01020000000000aec1460000f04100000000166d696e6563726166743a706c617965722e6c6576656c000000000000803f00000000000000001b6d696e6563726166743a706c617965722e657870657269656e636500'
  }, {
    title: 'servers sending an attribute with its modifiers (1.19.20 - 1.21.20)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.20', 'bedrock_1.21.20'),
    level30: '1d01020000000000aec1460000f04100000000166d696e6563726166743a706c617965722e6c6576656c00000000000000803f00000000000000001b6d696e6563726166743a706c617965722e657870657269656e63650000'
  }, {
    title: 'servers sending an attribute with its default range (1.21.30+)',
    versions: bedrockTestVersionsFrom('bedrock_1.21.30'),
    level30: '1d01020000000000aec1460000f0410000000000aec14600000000166d696e6563726166743a706c617965722e6c6576656c00000000000000803f00000000000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e63650000'
  }]

  for (const { title, versions, level30 } of layouts) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          let codec: BedrockCodec
          before(() => { codec = bedrockCodec(version) })

          it("has Java's experience until the server tells it, then the login's level 0, with one experience event", async () => {
            const { bot, server, events, frame } = await loggedIn(codec)
            assert.deepStrictEqual(bot.experience, { level: null, points: null, progress: null })
            server.send('update_attributes', { runtime_entity_id: 1n, attributes: experienceOf(version, 0, 0), tick: 0n })
            await frame()
            server.send('update_attributes', { runtime_entity_id: 1n, attributes: experienceOf(version, 0, 0), tick: 0n })
            await frame()
            assert.deepStrictEqual(events, [experience(0, 0, 0)])
            bot.end()
          })

          it('follows /xp to level 30: 1395 points', async () => {
            const { bot, server, events, frame } = await loggedIn(codec)
            server.send('update_attributes', { runtime_entity_id: 1n, attributes: experienceOf(version, 0, 0), tick: 0n })
            await frame()
            receive(server, level30)
            await frame()
            assert.deepStrictEqual([bot.experience, events.slice(1)], [{ level: 30, points: 1395, progress: 0 }, [experience(30, 1395, 0)]])
            bot.end()
          })
        })
      }
    })
  }

  describe('servers sending an attribute with its default range (1.21.30+): the points cooking gave, as recorded on 1.26.60', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.30')) {
      it(`bedrock ${version}: a point a packet, each packet naming the bar twice, then a level up`, async () => {
        const codec = bedrockCodec(version)
        const first = await loggedIn(codec)
        first.server.send('update_attributes', { runtime_entity_id: 1n, attributes: experienceOf(version, 0, 0), tick: 0n })
        receive(first.server,
          '1d0102000000000000803f2549123e000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e636500000000000000803f2549123e000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e636500f006',
          '1d0102000000000000803f2549923e000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e636500000000000000803f2549923e000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e636500d90c')
        await first.frame()
        assert.deepStrictEqual(first.events, [experience(0, 0, 0), experience(0, 1, 0.1428571492433548), experience(0, 2, 0.2857142984867096)])
        first.bot.end()

        const { bot, server, events, frame } = await loggedIn(codec, COOKING_PLAYER)
        server.send('update_attributes', { runtime_entity_id: COOKING_PLAYER, attributes: experienceOf(version, 0, 0.8571428656578064), tick: 0n })
        receive(server,
          '1d0c020000000000aec1460000803f0000000000aec14600000000166d696e6563726166743a706c617965722e6c6576656c00000000000000803f00000000000000000000803fb76d5b3f1b6d696e6563726166743a706c617965722e657870657269656e636500c707',
          '1d0c02000000000000803f398ee33d000000000000803fb76d5b3f1b6d696e6563726166743a706c617965722e657870657269656e636500000000000000803f398ee33d000000000000803fb76d5b3f1b6d696e6563726166743a706c617965722e657870657269656e636500df0b')
        await frame()
        assert.deepStrictEqual(events, [experience(0, 6, 0.8571428656578064), experience(1, 7, 0), experience(1, 8, 0.1111111119389534)])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it("counts the points on Java's curve: to the next level 2L + 7 below 15, 5L - 38 below 30, 9L - 158 from 30", async () => {
      const { bot, server, frame } = await loggedIn(codec)
      const points: number[] = []
      for (const told of [0, 1, 10, 14, 20, 29, 40]) {
        server.send('update_attributes', { runtime_entity_id: 1n, attributes: experienceOf(codec.version, told, 0.5), tick: 0n })
        await frame()
        points.push(bot.experience.points ?? -1)
      }
      assert.deepStrictEqual(points, [4, 12, 174, 298, 581, 1342, 3021])
      bot.end()
    })

    it("ignores other attributes and another entity's, and keeps the level a packet without it leaves", async () => {
      const { bot, server, events, frame } = await loggedIn(codec)
      const { version } = codec
      server.send('update_attributes', { runtime_entity_id: 1n, attributes: [hunger(version)], tick: 0n })
      await frame()
      assert.deepStrictEqual([bot.experience, events], [{ level: null, points: null, progress: null }, []])
      server.send('update_attributes', { runtime_entity_id: 1n, attributes: [hunger(version), level(version, 3)], tick: 0n })
      server.send('update_attributes', { runtime_entity_id: 1n, attributes: [hunger(version)], tick: 0n })
      server.send('update_attributes', { runtime_entity_id: 2n, attributes: experienceOf(version, 7, 0.25), tick: 0n })
      await frame()
      server.send('update_attributes', { runtime_entity_id: 1n, attributes: [progress(version, 0.5)], tick: 0n })
      await frame()
      assert.deepStrictEqual(events, [experience(3, 27, 0), experience(3, 34, 0.5)])
      assert.deepStrictEqual(bot.experience, { level: 3, points: 34, progress: 0.5 })
      bot.end()
    })
  })
})
