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
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom, FakeBedrockClient } from './common/server.ts'
import { createBedrockBot } from '../../lib/bedrock/loader.ts'
import type { BedrockCore } from '../../lib/bedrock/core/core.ts'

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

  it('injects its plugins as they load, and emits inject_allowed in its first frame', () => {
    const events: string[] = []
    const server = new FakeBedrockClient(bedrockCodec(mineflayer.latestSupportedBedrockVersion))
    let core: BedrockCore | undefined
    const bot = createBedrockBot({ version: mineflayer.latestSupportedBedrockVersion, plugins: { mine: () => { events.push('plugin') } } }, {
      connect: inbox => server.connect(inbox),
      drive: bedrockCore => { core = bedrockCore }
    })
    bot.on('inject_allowed', () => { events.push('inject_allowed') })
    const later = (): void => { events.push('later plugin') }
    bot.loadPlugin(later)
    bot.loadPlugin(later)
    assert.ok(bot.hasPlugin(later))
    assert.deepStrictEqual(events, ['plugin', 'later plugin'])
    core?.stepFrame(0)
    core?.stepFrame(0)
    assert.deepStrictEqual(events, ['plugin', 'later plugin', 'inject_allowed'])
  })

  it('loads its time plugin unless told not to, or given another', async () => {
    const codec = bedrockCodec(mineflayer.latestSupportedBedrockVersion)
    const withTime = await bedrockTestBot(codec)
    const withoutTime = await bedrockTestBot(codec, { plugins: { time: false } })
    const withoutInternal = await bedrockTestBot(codec, { loadInternalPlugins: false })
    let replaced = false
    const withOtherTime = await bedrockTestBot(codec, { plugins: { time: () => { replaced = true } } })
    assert.deepStrictEqual([withTime, withoutTime, withoutInternal, withOtherTime].map(({ bot }) => bot.time !== undefined), [true, false, false, false])
    assert.strictEqual(replaced, true)
  })

  it('ends each tick with physicsTick (and its old name physicTick), from start_game on', async () => {
    const { bot, server, driver } = await bedrockTestBot(bedrockCodec(mineflayer.latestSupportedBedrockVersion))
    const ticks: string[] = []
    bot.on('physicsTick', () => { ticks.push('physicsTick') })
    bot.on('physicTick', () => { ticks.push('physicTick') })
    await driver.tick()
    assert.deepStrictEqual(ticks, [])
    server.send('start_game', { runtime_entity_id: 1n })
    await driver.frame(0)
    await driver.ticks(2)
    assert.deepStrictEqual(ticks, ['physicsTick', 'physicTick', 'physicsTick', 'physicTick'])
    bot.end()
  })

  it('logs its errors, unless they are hidden', async () => {
    const logged: string[] = []
    const log = console.log
    console.log = (error: Error) => { logged.push(error.message) }
    try {
      for (const hideErrors of [false, true]) {
        const { internal, driver } = await bedrockTestBot(bedrockCodec(mineflayer.latestSupportedBedrockVersion), { hideErrors })
        internal._core.inbox.notice({ kind: 'error', error: new Error(`hidden: ${hideErrors}`) }, driver.now)
        await driver.frame(0)
        internal.end()
      }
    } finally {
      console.log = log
    }
    assert.deepStrictEqual(logged, ['hidden: false'])
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

      it('logs in on start_game, in the packet pass', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        const events: string[] = []
        bot.on('login', () => { events.push('login') })
        server.send('start_game', { runtime_entity_id: 7n })
        assert.deepStrictEqual(events, [])
        await driver.frame(0)
        assert.deepStrictEqual(events, ['login'])
        bot.end()
      })

      it('is kicked by a disconnect packet, then ends with its message', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        server.send('start_game', { runtime_entity_id: 1n })
        const kicked = once(bot, 'kicked')
        const ended = once(bot, 'end')
        server.send('disconnect', { hide_disconnect_reason: false, message: 'kicked by the test' })
        await driver.frame(0)
        assert.deepStrictEqual(await kicked, ['kicked by the test', true])
        assert.deepStrictEqual(await ended, ['kicked by the test'])
      })

      it('is kicked before logging in', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        const kicked = once(bot, 'kicked')
        server.send('disconnect', { hide_disconnect_reason: false, message: 'outdated' })
        await driver.frame(0)
        assert.deepStrictEqual(await kicked, ['outdated', false])
      })

      it('ends when bot.end() closed the connection', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        const ended = once(bot, 'end')
        bot.end('done')
        assert.strictEqual(server.closed, true)
        await driver.frame(0)
        assert.deepStrictEqual(await ended, ['done'])
        assert.doesNotThrow(() => { bot.end() })
      })

      it('ends after the connection closed, and after the event being handled', async () => {
        const { bot, server, driver } = await bedrockTestBot(codec)
        const events: string[] = []
        bot.once('login', () => {
          events.push('quit on login')
          bot.quit()
        })
        bot.once('login', () => { events.push('login') })
        bot.on('end', () => { events.push('end') })
        server.send('start_game', { current_tick: 1n })
        await driver.frame(0)
        assert.strictEqual(server.closed, true)
        assert.deepStrictEqual(events, ['quit on login', 'login'])
        await driver.frame(0)
        assert.deepStrictEqual(events, ['quit on login', 'login', 'end'])
      })

      it('ends with the first reason it was given', async () => {
        const { bot, driver } = await bedrockTestBot(codec)
        const ended = once(bot, 'end')
        bot.end('first')
        bot.end('second')
        await driver.frame(0)
        assert.deepStrictEqual(await ended, ['first'])
      })

      it('quits', async () => {
        const { bot, driver } = await bedrockTestBot(codec)
        const ended = once(bot, 'end')
        bot.quit()
        await driver.frame(0)
        assert.deepStrictEqual(await ended, ['disconnect.quitting'])
      })
    })
  }

  describe('servers that can hide the message of a kick (1.21.20+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20')) {
      it(`bedrock ${version}: is kicked with the kick's reason`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const kicked = once(bot, 'kicked')
        server.send('disconnect', { hide_disconnect_reason: true, reason: 'version_mismatch', message: undefined, filtered_message: undefined })
        await driver.frame(0)
        assert.deepStrictEqual(await kicked, ['version_mismatch', false])
      })
    }
  })
})
