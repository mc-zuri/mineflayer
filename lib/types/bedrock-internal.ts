import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Vec3 } from 'vec3'
import type { BedrockCore } from '../bedrock/core/core.ts'
import type { BlockUse } from '../bedrock/modules/block_use.ts'
import type { EntityUse } from '../bedrock/modules/entity_use.ts'
import type { Inventory } from '../bedrock/modules/inventory.ts'
import type { LocalPlayer } from '../bedrock/modules/movement.ts'
import type { Session } from '../bedrock/modules/session.ts'
import type { NetworkWorld } from '../bedrock/modules/world.ts'
import type { BedrockBot, BedrockBotOptions, BedrockPlugin } from './api/index.ts'
import type { PlaceOptions } from './internal.ts'

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
  /** the connection's life: the handshake's answers, the chunk radius asked of the server, and the hooks run after spawn */
  _session: Session
  _entities: EntityIndex
  /** the counts of the messages the vanilla client would not show: a rawtext that is no valid one, a text type it does not know */
  _chat: { stats: { invalidRawText: number, unknownType: number } }
  /** the player's items, the screens and the item stack requests */
  _inventory: Inventory
  /** using a block: the use key's press, its hold and its release */
  _blockUse: BlockUse
  /** using an entity: the use with the pick on it, and the screen it opens */
  _entityUse: EntityUse
  /** placing: the build against a block's face, as Java's (the off-hand unsupported); resolves with the block's position once the use ended */
  _genericPlace: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<Vec3>
  /** placing: the build, resolving once the server put a block at the destination */
  _placeBlockWithOptions: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<void>
  /** placing: the build holding an entity's item, resolving with the entity the server spawned near the destination */
  _placeEntityWithOptions: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<Entity>
  loadPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => void
  loadPlugins: (plugins: Array<BedrockPlugin | BedrockInternalPlugin>) => void
  hasPlugin: (plugin: BedrockPlugin | BedrockInternalPlugin) => boolean
}
