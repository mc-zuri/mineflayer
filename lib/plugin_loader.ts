import assert from 'assert'
import type { BotOptions, Plugin } from './types/api/index.ts'
import type { BotInternal, InternalPlugin } from './types/internal.ts'

export default inject

function inject (bot: BotInternal, options: BotOptions): void {
  let loaded = false
  const pluginList: Array<Plugin | InternalPlugin> = []
  bot.once('inject_allowed', onInjectAllowed)

  function onInjectAllowed (): void {
    loaded = true
    injectPlugins()
  }

  function loadPlugin (plugin: Plugin | InternalPlugin): void {
    assert.ok(typeof plugin === 'function', 'plugin needs to be a function')

    if (hasPlugin(plugin)) {
      return
    }

    pluginList.push(plugin)

    if (loaded) {
      plugin(bot, options)
    }
  }

  function loadPlugins (plugins: Array<Plugin | InternalPlugin>): void {
    // While type checking if already done in the other function, it's useful to do
    // it here to prevent situations where only half the plugin list is loaded.
    assert.ok(plugins.filter(plugin => typeof plugin === 'function').length === plugins.length, 'plugins need to be an array of functions')

    plugins.forEach((plugin) => {
      loadPlugin(plugin)
    })
  }

  function injectPlugins (): void {
    pluginList.forEach((plugin) => {
      plugin(bot, options)
    })
  }

  function hasPlugin (plugin: Plugin | InternalPlugin): boolean {
    return pluginList.indexOf(plugin) >= 0
  }

  bot.loadPlugin = loadPlugin
  bot.loadPlugins = loadPlugins
  bot.hasPlugin = hasPlugin
}
