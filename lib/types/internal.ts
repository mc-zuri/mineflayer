// The plugins' view of the bot: the public Bot, with the minecraft-protocol client typed by its packets and the
// helpers plugins share with each other (named with a leading underscore, not part of the public API).
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { Vec3 } from 'vec3'
import type { Bot, BotOptions, Plugin, Player } from './api/index.ts'
import type { TypedClient } from './protocol/client.ts'

/** how a block or an entity is placed against a block's face */
export interface PlaceOptions {
  /** place with the item in the off hand */
  offhand?: boolean
  /** the half of the face the cursor is on (slabs, stairs) */
  half?: 'top' | 'bottom'
  /** where on the face the cursor is, from the block's corner */
  delta?: Vec3
  /** look at the face first: true snaps the head, false turns it smoothly, 'ignore' does not turn it */
  forceLook?: boolean | 'ignore'
  /** swing that arm after placing */
  swingArm?: 'left' | 'right'
  showHand?: boolean
}

/** one of mineflayer's own plugins, which take the plugins' view of the bot */
export type InternalPlugin = (bot: BotInternal, options: BotOptions) => void

export interface BotInternal extends Omit<Bot, '_client'> {
  _client: TypedClient
  /** the plugin loader takes mineflayer's own plugins as well as the public ones */
  loadPlugin: (plugin: Plugin | InternalPlugin) => void
  loadPlugins: (plugins: Array<Plugin | InternalPlugin>) => void
  hasPlugin: (plugin: Plugin | InternalPlugin) => boolean
  /** logs a warning unless the bot was created with hideErrors */
  _warn: (...message: string[]) => void
  /** blocks: sets a block's state and emits the block update events */
  _updateBlockState: (point: Vec3, stateId: number) => void
  /** blocks: the dimension the bot is in, as the world name the server gave it */
  _getDimensionName: () => string
  /** digging: the block the bot's eyes are in */
  _getBlockAtEyeLevel: () => Block | null
  /** entities: the player with that UUID */
  _playerFromUUID: (uuid: string) => Player | undefined
  /** inventory: puts an item in a window's slot and emits its update events */
  _setSlot: (slotId: number, newItem: Item | null, window?: Window) => void
  /** inventory: asks the server to resend a window's items (1.17.1+) and waits for them */
  _syncWindow: (window: Window) => Promise<void>
  /** inventory: tells the server which hotbar slot is held, if it was not told yet */
  _ensureHasSentCarriedItem: () => void
  /** generic_place: places what the hand holds against a block's face; resolves with where it clicked */
  _genericPlace: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<Vec3>
  /** place_block: places the held block against a block's face and waits for the server to answer */
  _placeBlockWithOptions: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<void>
  /** place_entity: places the held entity item (boat, spawn egg, armor stand, end crystal) and resolves with it */
  _placeEntityWithOptions: (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions) => Promise<Entity>
  /** sequence: the next block interaction sequence number (1.19+) */
  _nextSequence: () => number
  /** physics: sends a reply at the start of the next tick, in arrival order; absent without the physics plugin */
  _replyOnNextTick?: (reply: () => void) => void
}
