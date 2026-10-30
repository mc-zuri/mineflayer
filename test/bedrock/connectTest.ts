import assert from 'assert'
import { once as onceNode } from 'events'
import { createServer } from 'net'
import minecraftData from 'minecraft-data'
import * as mineflayer from '../../index.ts'
import type { Client } from 'minecraft-protocol'
import type { BedrockBot, BedrockBotOptions, Bot, BotFor, Plugin } from '../../lib/types/api/index.ts'
import { bedrockProtocolVersionOf } from '../../lib/bedrock/version.ts'
import { once } from '../../lib/promise_utils.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false
type Expect<Check extends true> = Check

/** type checks only: never called, as each bot would connect */
function createBotTypes (version: string, config: string, javaClient: Client, javaPlugin: Plugin): void {
  const bedrock = mineflayer.createBot({ version: 'bedrock_1.21.130', host: '127.0.0.1', connectTimeout: 500 })
  const java = mineflayer.createBot({ version: '1.21.4', auth: 'offline' })
  const detected = mineflayer.createBot({ host: '127.0.0.1' })
  const noOptions = mineflayer.createBot()
  const either = mineflayer.createBot({ version })
  const fromJsonConfig = mineflayer.createBot(JSON.parse(config))
  const checks: [
    Expect<Equal<typeof bedrock, BedrockBot>>,
    Expect<Equal<typeof java, Bot>>,
    Expect<Equal<typeof detected, Bot>>,
    Expect<Equal<typeof noOptions, Bot>>,
    Expect<Equal<typeof either, Bot | BedrockBot>>,
    Expect<Equal<typeof fromJsonConfig, Bot | BedrockBot>>
  ] = [true, true, true, true, true, true]
  console.log(checks, bedrock, java, detected, noOptions, either, fromJsonConfig)
  // @ts-expect-error Java's authentication
  mineflayer.createBot({ version: 'bedrock_1.21.130', auth: 'microsoft' })
  // @ts-expect-error a minecraft-protocol client
  mineflayer.createBot({ version: 'bedrock_1.21.130', client: javaClient })
  // @ts-expect-error a Java plugin
  mineflayer.createBot({ version: 'bedrock_1.21.130', plugins: { javaPlugin } })
}

/** a UDP port nothing listens on: one a TCP server just had */
async function freePort (): Promise<number> {
  const server = createServer()
  server.listen(0, '127.0.0.1')
  await onceNode(server, 'listening')
  const address = server.address()
  server.close()
  assert.ok(address !== null && typeof address === 'object')
  return address.port
}

describe('bedrock connection', () => {
  it('createBot gives a Bedrock bot for a bedrock_<version>, as its type says', () => {
    // its checks are the typecheck's
    assert.strictEqual(typeof createBotTypes, 'function')
    type Checks = [
      Expect<Equal<BotFor<'bedrock_1.21.130'>, BedrockBot>>,
      Expect<Equal<BotFor<'1.21.4'>, Bot>>,
      Expect<Equal<BotFor<false>, Bot>>,
      Expect<Equal<BotFor<string>, Bot | BedrockBot>>
    ]
    const checks: Checks = [true, true, true, true]
    assert.deepStrictEqual(checks, [true, true, true, true])
  })

  it('connects with bedrock-protocol, and ends with an error when no server answers', async function () {
    this.timeout(10_000)
    const bot = mineflayer.createBot({ version: 'bedrock_1.21.130', host: '127.0.0.1', port: await freePort(), connectTimeout: 500, hideErrors: true })
    const either: Bot | BedrockBot = bot
    assert.ok(mineflayer.isBedrockBot(either))
    // once(bot, 'end') would reject on the error
    const errored = once(bot, 'error')
    const ended = new Promise<string>(resolve => bot.once('end', resolve))
    const [error] = await errored
    assert.match(String(error), /Connect timed out/)
    assert.strictEqual(await ended, 'socketClosed')
  })

  it("does not take bedrock-protocol's raknet-node backend", () => {
    // @ts-expect-error not a backend a Bedrock bot takes
    const options: BedrockBotOptions = { version: 'bedrock_1.21.130', raknetBackend: 'raknet-node' }
    assert.strictEqual(options.raknetBackend, 'raknet-node')
  })

  it('throws for a Bedrock version mineflayer does not support', () => {
    assert.throws(() => mineflayer.createBot({ version: 'bedrock_1.20.11' }), {
      message: `Bedrock version 'bedrock_1.20.11' is not supported: mineflayer supports ${mineflayer.oldestSupportedBedrockVersion} to ${mineflayer.latestSupportedBedrockVersion}`
    })
  })

  for (const version of bedrockTestVersions()) {
    describe(`bedrock ${version}`, () => {
      let codec: BedrockCodec
      before(() => { codec = bedrockCodec(version) })

      it("has the version's numbers", async () => {
        const { bot } = await bedrockTestBot(codec)
        const data = minecraftData.versionsByMinecraftVersion.bedrock[bedrockProtocolVersionOf(version)]
        assert.strictEqual(bot.version, version)
        assert.strictEqual(bot.protocolVersion, data?.version)
        assert.strictEqual(bot.majorVersion, data?.majorVersion)
        assert.strictEqual(bot.registry.version.type, 'bedrock')
        assert.ok(mineflayer.isBedrockBot(bot))
        bot.end()
      })

      it('logs in on start_game and spawns on play_status player_spawn', async () => {
        const { bot, server } = await bedrockTestBot(codec)
        const events: string[] = []
        bot.on('login', () => { events.push('login') })
        bot.on('spawn', () => { events.push('spawn') })
        server.send('start_game', { runtime_entity_id: 7n })
        server.send('play_status', { status: 'player_spawn' })
        assert.deepStrictEqual(events, ['login', 'spawn'])
        // written by bedrock-protocol, not by the bot
        assert.deepStrictEqual(server.sent, [{ name: 'set_local_player_as_initialized', params: { runtime_entity_id: 7n } }])
        bot.end()
      })

      it('is kicked by a disconnect packet, then ends with its message', async () => {
        const { bot, server } = await bedrockTestBot(codec)
        server.send('start_game', { runtime_entity_id: 1n })
        const kicked = once(bot, 'kicked')
        const ended = once(bot, 'end')
        server.send('disconnect', { hide_disconnect_reason: false, message: 'kicked by the test' })
        assert.deepStrictEqual(await kicked, ['kicked by the test', true])
        assert.deepStrictEqual(await ended, ['kicked by the test'])
      })

      it('is kicked before logging in', async () => {
        const { bot, server } = await bedrockTestBot(codec)
        const kicked = once(bot, 'kicked')
        server.send('disconnect', { hide_disconnect_reason: false, message: 'outdated' })
        assert.deepStrictEqual(await kicked, ['outdated', false])
      })

      it('ends when bot.end() closes the connection', async () => {
        const { bot, server } = await bedrockTestBot(codec)
        const ended = once(bot, 'end')
        bot.end('done')
        assert.deepStrictEqual(await ended, ['done'])
        assert.strictEqual(server.closed, true)
        assert.doesNotThrow(() => bot.end())
      })

      it('ends after the connection closed, and after the event being handled', async () => {
        const { bot, server } = await bedrockTestBot(codec)
        const events: string[] = []
        bot.once('login', () => {
          events.push('quit on login')
          bot.quit()
        })
        bot.once('login', () => { events.push('login') })
        const ended = once(bot, 'end')
        bot.on('end', () => { events.push('end') })
        server.send('start_game', { current_tick: 1n })
        assert.strictEqual(server.closed, true)
        assert.deepStrictEqual(events, ['quit on login', 'login'])
        await ended
        assert.deepStrictEqual(events, ['quit on login', 'login', 'end'])
      })

      it('quits', async () => {
        const { bot } = await bedrockTestBot(codec)
        const ended = once(bot, 'end')
        bot.quit()
        assert.deepStrictEqual(await ended, ['disconnect.quitting'])
      })
    })
  }

  describe('servers that can hide the message of a kick (1.21.20+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20')) {
      it(`bedrock ${version}: is kicked with the kick's reason`, async () => {
        const { bot, server } = await bedrockTestBot(bedrockCodec(version))
        const kicked = once(bot, 'kicked')
        server.send('disconnect', { hide_disconnect_reason: true, reason: 'version_mismatch', message: undefined, filtered_message: undefined })
        assert.deepStrictEqual(await kicked, ['version_mismatch', false])
      })
    }
  })
})
