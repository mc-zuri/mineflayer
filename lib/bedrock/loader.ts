import { EventEmitter } from 'events'
import { createClient } from 'bedrock-protocol'
import prismarineRegistry from 'prismarine-registry'
import pluginLoader from './plugin_loader.ts'
import time from './plugins/time.ts'
import { bedrockProtocolVersionOf, isBedrockVersion, isSupportedBedrockVersion, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from './version.ts'
import type { BedrockBot, BedrockBotOptions, Bot } from '../types/api/index.ts'
import type { BedrockBotInternal, BedrockInternalPlugin } from '../types/bedrock-internal.ts'
import type { BedrockClient, BedrockClientboundPackets } from '../types/protocol/bedrock-client.ts'

const plugins: { [name: string]: BedrockInternalPlugin } = {
  time
}

// bedrock-protocol closes the RakNet connection, which tells the server the player left, 40 ms after it emits close:
// a process exiting on end must not exit before that
const END_DELAY_MS = 50

function isBedrockBot (bot: Bot | BedrockBot): bot is BedrockBot {
  return isBedrockVersion(bot.version)
}

function kickReason (packet: BedrockClientboundPackets['disconnect']): string {
  // 1.21.20+ servers can hide the message
  return packet.message ?? String(packet.reason ?? '')
}

function createBedrockBot (botOptions: BedrockBotOptions, testClient?: BedrockClient): BedrockBot {
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
  const { version: protocolVersion, majorVersion } = bot.registry.version
  if (protocolVersion === undefined || majorVersion === undefined) {
    throw new Error(`minecraft-data has no version numbers for Bedrock version '${version}'`)
  }
  bot.version = version
  bot.majorVersion = majorVersion
  bot.protocolVersion = protocolVersion
  bot._warn = function (...message) {
    if (options.hideErrors) return
    console.warn('[mineflayer]', ...message)
  }
  if (options.logErrors) {
    bot.on('error', err => {
      if (!options.hideErrors) {
        console.log(err)
      }
    })
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

  const client: BedrockClient = testClient ?? createClient({
    host: options.host,
    port: options.port,
    username: options.username,
    version: bedrockProtocolVersionOf(version),
    offline: true,
    transport: 'raknet',
    // BDS 1.26.30+ answers no ping, and on a failed ping bedrock-protocol takes its latest version
    skipPing: true,
    conLog: null,
    ...(options.raknetBackend === undefined ? {} : { raknetBackend: options.raknetBackend }),
    ...(options.connectTimeout === undefined ? {} : { connectTimeout: options.connectTimeout })
  })
  bot._client = client

  let loggedIn = false
  let endReason: string | undefined
  client.on('error', (err) => {
    bot.emit('error', err)
  })
  client.on('close', () => {
    setTimeout(() => bot.emit('end', endReason ?? 'socketClosed'), END_DELAY_MS)
  })
  client.on('start_game', () => {
    loggedIn = true
    bot.emit('login')
  })
  client.on('play_status', (packet) => {
    if (packet.status === 'player_spawn') bot.emit('spawn')
  })
  client.on('disconnect', (packet) => {
    endReason = kickReason(packet)
    bot.emit('kicked', endReason, loggedIn)
  })
  bot.end = (reason) => {
    endReason ??= reason
    client.close()
  }
  bot.quit = (reason) => {
    bot.end(reason ?? 'disconnect.quitting')
  }

  setTimeout(() => bot.emit('inject_allowed'), 0)
  return bot
}

export { createBedrockBot, isBedrockBot }
