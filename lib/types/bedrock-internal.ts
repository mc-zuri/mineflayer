import type { BedrockBot, BedrockBotOptions, BedrockPlugin } from './api/index.ts'
import type { BedrockClient } from './protocol/bedrock-client.ts'

export type BedrockInternalPlugin = (bot: BedrockBotInternal, options: BedrockBotOptions) => void

export interface BedrockBotInternal extends BedrockBot {
  _client: BedrockClient
  loadPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => void
  loadPlugins: (plugins: Array<BedrockPlugin | BedrockInternalPlugin>) => void
  hasPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => boolean
  _warn: (...message: string[]) => void
}
