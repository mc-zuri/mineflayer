import assert from 'assert'
import type { BedrockBotOptions, BedrockPlugin } from '../types/api/index.ts'
import type { BedrockBotInternal, BedrockInternalPlugin } from '../types/bedrock-internal.ts'

export default inject

function inject (bot: BedrockBotInternal, options: BedrockBotOptions): void {
  let loaded = false
  const pluginList: Array<BedrockPlugin | BedrockInternalPlugin> = []
  bot.once('inject_allowed', onInjectAllowed)

  function onInjectAllowed (): void {
    loaded = true
    injectPlugins()
  }

  function loadPlugin (plugin: BedrockPlugin | BedrockInternalPlugin): void {
    assert.ok(typeof plugin === 'function', 'plugin needs to be a function')

    if (hasPlugin(plugin)) {
      return
    }

    pluginList.push(plugin)

    if (loaded) {
      plugin(bot, options)
    }
  }

  function loadPlugins (plugins: Array<BedrockPlugin | BedrockInternalPlugin>): void {
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

  function hasPlugin (plugin: BedrockPlugin | BedrockInternalPlugin): boolean {
    return pluginList.indexOf(plugin) >= 0
  }

  bot.loadPlugin = loadPlugin
  bot.loadPlugins = loadPlugins
  bot.hasPlugin = hasPlugin
}
