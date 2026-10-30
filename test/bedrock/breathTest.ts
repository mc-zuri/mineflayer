import assert from 'assert'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The packets are those servers sent the vanilla Bedrock client under water, recorded on every version, as their bytes:
// the player's air (300 when full) going down a point a tick, then up 4 a tick. Versions whose servers send alike are a
// group, and each group's tests run on each of its versions.

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

async function loggedIn (codec: BedrockCodec): Promise<{ bot: BedrockBot, server: FakeBedrockClient, events: number[], frame: () => Promise<void> }> {
  const { bot, server, driver } = await bedrockTestBot(codec)
  new ServerWorld(server).startGame()
  await driver.frame(0)
  const events: number[] = []
  bot.on('breath', () => { events.push(bot.oxygenLevel) })
  return { bot, server, events, frame: async () => { await driver.frame(0) } }
}

describe('bedrock breath', () => {
  const layouts: Array<{ title: string, versions: BedrockVersion[], air: ReadonlyArray<readonly [string, number]> }> = [{
    title: 'servers sending the metadata alone (up to 1.19.30; recorded on 1.18.30)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.30'),
    // 299, 291, 289, 293, 300
    air: [['27010107012b0100', 20], ['2701010701230100', 19], ['2701010701210100', 19], ['2701010701250100', 20], ['27010107012c0100', 20]]
  }, {
    title: "servers sending the entity's properties with it (1.19.40 - 1.26.30; recorded on 1.20.10)",
    versions: bedrockTestVersionsFrom('bedrock_1.19.40', 'bedrock_1.26.30'),
    // 299, 291, 280, 276, 300
    air: [['27010107012b01000000', 20], ['27010107012301000000', 19], ['27010107011801000000', 19], ['27010107011401000000', 18], ['27010107012c01000000', 20]]
  }, {
    title: "servers writing the value's type twice (1.26.40+; recorded on 1.26.60)",
    versions: bedrockTestVersionsFrom('bedrock_1.26.40'),
    // 299, 291, 295, 299, 300
    air: [['2701010701012b01000064', 20], ['270101070101230100006b', 19], ['270101070101270100006c', 20], ['2701010701012b0100006e', 20], ['2701010701012c0100006e', 20]]
  }]

  for (const { title, versions, air } of layouts) {
    describe(title, () => {
      for (const version of versions) {
        it(`bedrock ${version}: has no oxygen level until the server tells the air, then Java's 20 bubbles of 15, breath on each change`, async () => {
          const { bot, server, events, frame } = await loggedIn(bedrockCodec(version))
          assert.strictEqual(bot.oxygenLevel, undefined)
          for (const [hex] of air) {
            receive(server, hex)
            await frame()
          }
          assert.deepStrictEqual(events, air.map(([, oxygenLevel]) => oxygenLevel))
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    it("ignores the air it has already, the player's metadata without it, and another entity's", async () => {
      const { bot, server, events, frame } = await loggedIn(bedrockCodec(latestSupportedBedrockVersion))
      receive(server, '2701010701012b01000064')
      await frame()
      receive(server, '2701010701012b0100006e', '2702010701012301000064')
      server.send('set_entity_data', { runtime_entity_id: 1n, metadata: [], tick: 0n })
      await frame()
      assert.deepStrictEqual([bot.oxygenLevel, events], [20, [20]])
      bot.end()
    })
  })
})
