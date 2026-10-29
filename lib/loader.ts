import mc from 'minecraft-protocol'
import { EventEmitter } from 'events'
import pluginLoader from './plugin_loader.ts'
import abilities from './plugins/abilities.ts'
import bed from './plugins/bed.ts'
import title from './plugins/title.ts'
import blockActions from './plugins/block_actions.ts'
import blocks from './plugins/blocks.ts'
import book from './plugins/book.ts'
import bossBar from './plugins/boss_bar.ts'
import breath from './plugins/breath.ts'
import chat from './plugins/chat.ts'
import chest from './plugins/chest.ts'
import commandBlock from './plugins/command_block.ts'
import craft from './plugins/craft.ts'
import creative from './plugins/creative.ts'
import digging from './plugins/digging.ts'
import enchantmentTable from './plugins/enchantment_table.ts'
import entities from './plugins/entities.ts'
import experience from './plugins/experience.ts'
import explosion from './plugins/explosion.ts'
import fishing from './plugins/fishing.ts'
import furnace from './plugins/furnace.ts'
import game from './plugins/game.ts'
import health from './plugins/health.ts'
import inventory from './plugins/inventory.ts'
import kick from './plugins/kick.ts'
import physics from './plugins/physics.ts'
import placeBlock from './plugins/place_block.ts'
import rain from './plugins/rain.ts'
import rayTrace from './plugins/ray_trace.ts'
import resourcePack from './plugins/resource_pack.ts'
import scoreboard from './plugins/scoreboard.ts'
import team from './plugins/team.ts'
import settings from './plugins/settings.ts'
import simpleInventory from './plugins/simple_inventory.ts'
import sound from './plugins/sound.ts'
import spawnPoint from './plugins/spawn_point.ts'
import tablist from './plugins/tablist.ts'
import time from './plugins/time.ts'
import villager from './plugins/villager.ts'
import anvil from './plugins/anvil.ts'
import placeEntity from './plugins/place_entity.ts'
import genericPlace from './plugins/generic_place.ts'
import particle from './plugins/particle.ts'
import sequence from './plugins/sequence.ts'
import minecraftData from 'minecraft-data'
import prismarineRegistry from 'prismarine-registry'
import { testedVersions, latestSupportedVersion, oldestSupportedVersion, latestSupportedProtocolVersionOf } from './version.ts'
import Location from './location.ts'
import Painting from './painting.ts'
import ScoreBoard from './scoreboard.ts'
import BossBar from './bossbar.ts'
import Particle from './particle.ts'
import type { SupportsFeature } from 'minecraft-data'
import type { Bot, BotOptions } from './types/api/index.ts'
import type { BotInternal, InternalPlugin } from './types/internal.ts'

const plugins: { [name: string]: InternalPlugin } = {
  abilities,
  bed,
  title,
  block_actions: blockActions,
  blocks,
  book,
  boss_bar: bossBar,
  breath,
  chat,
  chest,
  command_block: commandBlock,
  craft,
  creative,
  digging,
  enchantment_table: enchantmentTable,
  entities,
  experience,
  explosion,
  fishing,
  furnace,
  game,
  health,
  inventory,
  kick,
  physics,
  place_block: placeBlock,
  rain,
  ray_trace: rayTrace,
  resource_pack: resourcePack,
  scoreboard,
  team,
  settings,
  simple_inventory: simpleInventory,
  sound,
  spawn_point: spawnPoint,
  tablist,
  time,
  villager,
  anvil,
  place_entity: placeEntity,
  generic_place: genericPlace,
  particle,
  sequence
}

const latestSupportedProtocolVersion = latestSupportedProtocolVersionOf(minecraftData.versionsByMinecraftVersion.pc)

/** a feature of a version, as minecraft-data has it (whether it has it, or its value) */
const supportFeature = <Feature extends keyof SupportsFeature> (feature: Feature, version: string): SupportsFeature[Feature] => minecraftData(version).supportFeature(feature)

function createBot (botOptions: BotOptions = {}): Bot {
  // The defaults go on the caller's object itself: the plugins and minecraft-protocol share it.
  const options = Object.assign(botOptions, {
    username: botOptions.username ?? 'Player',
    version: botOptions.version ?? false,
    plugins: botOptions.plugins ?? {},
    hideErrors: botOptions.hideErrors ?? false,
    logErrors: botOptions.logErrors ?? true,
    loadInternalPlugins: botOptions.loadInternalPlugins ?? true,
    brand: botOptions.brand ?? 'vanilla',
    respawn: botOptions.respawn ?? true
  })
  // The plugins fill the bot in: it is all of a BotInternal once they are injected.
  const bot: BotInternal = new EventEmitter() as EventEmitter & BotInternal
  bot.end = (reason) => bot._client.end(reason)
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
      return options.plugins[key] || options.loadInternalPlugins
    }).map(([, plugin]) => plugin)
  const externalPlugins = Object.values(options.plugins)
    .filter(plugin => typeof plugin === 'function')
  bot.loadPlugins([...internalPlugins, ...externalPlugins])

  options.validateChannelProtocol = false
  bot._client = options.client ?? mc.createClient(options)
  bot._client.on('connect', () => {
    bot.emit('connect')
  })
  bot._client.on('error', (err) => {
    bot.emit('error', err)
  })
  bot._client.on('end', (reason) => {
    bot.emit('end', reason)
  })
  if (!bot._client.wait_connect) next()
  else bot._client.once('connect_allowed', next)
  function next (): void {
    const serverPingVersion = bot._client.version
    bot.registry = prismarineRegistry(serverPingVersion)
    if (!bot.registry?.version) throw new Error(`Server version '${serverPingVersion}' is not supported, no data for version`)

    const versionData = bot.registry.version
    if (versionData['>'](latestSupportedVersion) && (versionData.version !== latestSupportedProtocolVersion)) {
      throw new Error(`Server version '${serverPingVersion}' is not supported. Latest supported version is '${latestSupportedVersion}'.`)
    } else if (versionData['<'](oldestSupportedVersion)) {
      throw new Error(`Server version '${serverPingVersion}' is not supported. Oldest supported version is '${oldestSupportedVersion}'.`)
    }

    // minecraft-data types them as optional; a version it has data for has them all
    const { version: protocolVersion, majorVersion, minecraftVersion } = versionData
    if (protocolVersion === undefined || majorVersion === undefined || minecraftVersion === undefined) {
      throw new Error(`minecraft-data has no version numbers for server version '${serverPingVersion}'`)
    }
    bot.protocolVersion = protocolVersion
    bot.majorVersion = majorVersion
    bot.version = minecraftVersion
    options.version = minecraftVersion
    bot.supportFeature = bot.registry.supportFeature
    setTimeout(() => bot.emit('inject_allowed'), 0)
  }
  return bot
}

export {
  createBot,
  Location,
  Painting,
  ScoreBoard,
  BossBar,
  Particle,
  latestSupportedVersion,
  oldestSupportedVersion,
  testedVersions,
  supportFeature
}
