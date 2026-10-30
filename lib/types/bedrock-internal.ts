import type { Entity } from 'prismarine-entity'
import type { BedrockCore } from '../bedrock/core/core.ts'
import type { LocalPlayer } from '../bedrock/modules/movement.ts'
import type { Session } from '../bedrock/modules/session.ts'
import type { NetworkWorld } from '../bedrock/modules/world.ts'
import type { BedrockBot, BedrockBotOptions, BedrockPlugin } from './api/index.ts'

export type BedrockInternalPlugin = (bot: BedrockBotInternal, options: BedrockBotOptions) => void

/** the entities by the ids the packets name them by, and the packets dropped */
export interface EntityIndex {
  /** by the unique id (remove_entity, set_entity_link, player_list, scores) */
  byUniqueId: (uniqueId: bigint) => Entity | undefined
  byRuntimeId: (runtimeId: number | bigint) => Entity | undefined
  /**
   * packets naming an entity the bot does not have; add_player, removals from the list and game modes of a player not
   * listed; moves and removals of the local player, which are movement's or never happen; adds of a live runtime id;
   * link removals of a rider not riding that vehicle
   */
  stats: { unknownEntity: number, unlisted: number, local: number, replaced: number, unlinked: number }
}

export interface BedrockBotInternal extends BedrockBot {
  /** the frame loop: the internal plugins register their packet handlers, systems and hooks on it */
  _core: BedrockCore
  /** the world as received, with what the other modules read of it */
  _world: NetworkWorld
  /** the local player, with its ring of past ticks and the counts of the server's corrections */
  _player: LocalPlayer
  /** the connection's life, with the hooks run after spawn */
  _session: Session
  _entities: EntityIndex
  loadPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => void
  loadPlugins: (plugins: Array<BedrockPlugin | BedrockInternalPlugin>) => void
  hasPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => boolean
}
