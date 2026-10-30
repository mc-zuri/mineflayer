import type { BedrockCore } from '../bedrock/core/core.ts'
import type { LocalPlayer } from '../bedrock/modules/movement.ts'
import type { NetworkWorld } from '../bedrock/modules/world.ts'
import type { BedrockBot, BedrockBotOptions, BedrockPlugin } from './api/index.ts'

export type BedrockInternalPlugin = (bot: BedrockBotInternal, options: BedrockBotOptions) => void

export interface BedrockBotInternal extends BedrockBot {
  /** the frame loop: the internal plugins register their packet handlers, systems and hooks on it */
  _core: BedrockCore
  /** the world as received, with what the other modules read of it */
  _world: NetworkWorld
  /** the local player, with its ring of past ticks and the counts of the server's corrections */
  _player: LocalPlayer
  loadPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => void
  loadPlugins: (plugins: Array<BedrockPlugin | BedrockInternalPlugin>) => void
  hasPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => boolean
}
