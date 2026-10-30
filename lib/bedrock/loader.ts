import { EventEmitter } from 'events'
import prismarineRegistry from 'prismarine-registry'
import { BedrockCore } from './core/core.ts'
import type { InboxWriter, Ns, Transport } from './core/types.ts'
import { monotonicClock, startRealtimeDriver } from './drivers/realtime.ts'
import { Controls } from './modules/input.ts'
import { LocalPlayer } from './modules/movement.ts'
import { Session } from './modules/session.ts'
import { NetworkWorld } from './modules/world.ts'
import pluginLoader from './plugin_loader.ts'
import time from './plugins/time.ts'
import { connectBedrockProtocol } from './transport/adapter.ts'
import { bedrockProtocolVersionOf, isBedrockVersion, isSupportedBedrockVersion, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from './version.ts'
import type { BedrockBot, BedrockBotOptions, Bot } from '../types/api/index.ts'
import type { BedrockBotInternal, BedrockInternalPlugin } from '../types/bedrock-internal.ts'

const plugins: Readonly<Record<string, BedrockInternalPlugin>> = Object.freeze({
  time
})

/** how a bot reaches its server and who steps its frames: bedrock-protocol and the wall clock, or a test's fakes */
export interface BedrockBotSeams {
  connect: (inbox: InboxWriter) => Transport
  drive: (core: BedrockCore) => void
}

function isBedrockBot (bot: Bot | BedrockBot): bot is BedrockBot {
  return isBedrockVersion(bot.version)
}

function realSeams (options: BedrockBotOptions & { host: string, port: number, username: string }): BedrockBotSeams {
  const now: () => Ns = monotonicClock()
  return {
    connect: inbox => connectBedrockProtocol({
      host: options.host,
      port: options.port,
      username: options.username,
      version: bedrockProtocolVersionOf(options.version),
      raknetBackend: options.raknetBackend,
      connectTimeout: options.connectTimeout
    }, inbox, now),
    drive: core => { startRealtimeDriver(core, now) }
  }
}

function createBedrockBot (botOptions: BedrockBotOptions, seams?: BedrockBotSeams): BedrockBotInternal {
  const { version } = botOptions
  if (!isSupportedBedrockVersion(version)) {
    throw new Error(`Bedrock version '${version}' is not supported: mineflayer supports ${oldestSupportedBedrockVersion} to ${latestSupportedBedrockVersion}`)
  }
  const options = {
    ...botOptions,
    host: botOptions.host ?? '127.0.0.1',
    port: botOptions.port ?? 19132,
    username: botOptions.username ?? 'Player',
    plugins: botOptions.plugins ?? {},
    hideErrors: botOptions.hideErrors ?? false,
    logErrors: botOptions.logErrors ?? true,
    loadInternalPlugins: botOptions.loadInternalPlugins ?? true
  }

  // the plugins fill the rest in
  const bot: BedrockBotInternal = new EventEmitter() as EventEmitter & BedrockBotInternal
  bot.username = options.username
  bot.registry = prismarineRegistry(version)
  // minecraft-data has both for every supported version (versionTest)
  bot.version = version
  bot.majorVersion = bot.registry.version.majorVersion!
  bot.protocolVersion = bot.registry.version.version!
  if (options.logErrors) {
    bot.on('error', err => {
      if (!options.hideErrors) {
        console.log(err)
      }
    })
  }

  const core = new BedrockCore({
    error: error => { bot.emit('error', error) },
    firstFrame: () => { bot.emit('inject_allowed') },
    tickEnded: () => {
      bot.emit('physicsTick')
      bot.emit('physicTick')
    }
  })
  bot._core = core
  const controls = new Controls(bot)
  const player = new LocalPlayer(bot, controls, options.physicsEnabled ?? true)
  bot._player = player
  bot._world = new NetworkWorld(bot, () => player.feet)
  const session = new Session(bot, options.viewDistance, bot._world, player)
  // a tick ends with the player's movement recorded and shown, then spawn
  player.install(core)
  session.install(core)
  bot._world.install(core)
  controls.install(core)
  bot.waitForTicks = async ticks => {
    // before start_game, the ticks after it
    if (ticks > 0) await core.waits.untilTick((core.tick ?? 0) + ticks)
  }

  pluginLoader(bot, options)
  const internalPlugins = Object.entries(plugins)
    .filter(([key]) => {
      if (typeof options.plugins[key] === 'function') return false
      if (options.plugins[key] === false) return false
      return options.plugins[key] ?? options.loadInternalPlugins
    }).map(([, plugin]) => plugin)
  const externalPlugins = Object.values(options.plugins)
    .filter(plugin => typeof plugin === 'function')
  bot.loadPlugins([...internalPlugins, ...externalPlugins])
  core.seal()

  const { connect, drive } = seams ?? realSeams(options)
  const transport = connect(core.inbox)
  core.attach(transport)
  bot.end = (reason) => {
    session.endReason ??= reason
    transport.close()
  }
  bot.quit = (reason) => {
    bot.end(reason ?? 'disconnect.quitting')
  }
  drive(core)
  return bot
}

export { createBedrockBot, isBedrockBot }
