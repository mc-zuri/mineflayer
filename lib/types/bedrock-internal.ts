import type { BedrockCore } from '../bedrock/core/core.ts'
import type { BedrockBot, BedrockBotOptions, BedrockPlugin } from './api/index.ts'

export type BedrockInternalPlugin = (bot: BedrockBotInternal, options: BedrockBotOptions) => void

export interface BedrockBotInternal extends BedrockBot {
  /** the frame loop: the internal plugins register their packet handlers, systems and hooks on it */
  _core: BedrockCore
  loadPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => void
  loadPlugins: (plugins: Array<BedrockPlugin | BedrockInternalPlugin>) => void
  hasPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => boolean
}
