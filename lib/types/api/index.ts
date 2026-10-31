import type { EventEmitter } from 'events'
import type TypedEmitter from 'typed-emitter'
import type { Client, ClientOptions } from 'minecraft-protocol'
import type { Vec3 } from 'vec3'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { Recipe } from 'prismarine-recipe'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { ChatMessage } from 'prismarine-chat'
import type { world } from 'prismarine-world'
import type { Registry } from 'prismarine-registry'
import type { IndexedData, SupportsFeature } from 'minecraft-data'
import type { NBT, Tags, TagType } from 'prismarine-nbt'

export declare function createBot<Options extends BedrockBotOptions> (options: Options & OnlyKeysOf<Options, BedrockBotOptions>): BedrockBotFor<Options>
export declare function createBot<Version extends string | false = false> (options?: BotOptions & { version?: Version extends BedrockVersion ? never : Version }): BotFor<Version>

/** an excess property check that also holds for a generic Options */
export type OnlyKeysOf<Options, Known> = { [Key in Exclude<keyof Options, keyof Known>]: never }

/** options typed any (a parsed JSON config) can hold any version */
export type BedrockBotFor<Options> = 0 extends (1 & Options) ? Bot | BedrockBot : BedrockBot

export type BotFor<Version extends string | false> =
  Version extends BedrockVersion ? BedrockBot : string extends Version ? Bot | BedrockBot : Bot

export declare function isBedrockBot (bot: Bot | BedrockBot): bot is BedrockBot

/** createBot's options: minecraft-protocol's client options (createBot passes them on), and mineflayer's own */
export interface BotOptions extends Omit<ClientOptions, 'username' | 'version'> {
  /** @default 'Player' */
  username?: string
  /** the server's version (e.g. '1.21.4'); undefined or false: ask the server for it */
  version?: string | false
  logErrors?: boolean
  hideErrors?: boolean
  loadInternalPlugins?: boolean
  plugins?: PluginOptions
  chat?: ChatLevel
  colorsEnabled?: boolean
  viewDistance?: ViewDistance
  mainHand?: MainHands
  difficulty?: number
  chatLengthLimit?: number
  physicsEnabled?: boolean
  /** @default 4 */
  maxCatchupTicks?: number
  client?: Client
  brand?: string
  defaultChatPatterns?: boolean
  respawn?: boolean
}

export type ChatLevel = 'enabled' | 'commandsOnly' | 'disabled'
export type ViewDistance = 'far' | 'normal' | 'short' | 'tiny' | number
export type MainHands = 'left' | 'right'

export interface PluginOptions {
  [plugin: string]: boolean | Plugin
}

export type Plugin = (bot: Bot, options: BotOptions) => void

export interface BedrockBotOptions {
  version: BedrockVersion
  /** @default '127.0.0.1' */
  host?: string
  /** @default 19132 */
  port?: number
  /** @default 'Player' */
  username?: string
  logErrors?: boolean
  hideErrors?: boolean
  loadInternalPlugins?: boolean
  plugins?: BedrockPluginOptions
  /** @default 'raknet-native' (not 'raknet-node': its failed connection crashes the process) */
  raknetBackend?: 'raknet-native' | 'jsp-raknet'
  /** ms @default 9000 */
  connectTimeout?: number
  /** the chunk radius asked of the server: a number of chunks, or Java's far (12), normal (10), short (8), tiny (6) @default 8, from 1.21.90 12 (the vanilla client's) */
  viewDistance?: ViewDistance
  /** whether the physics move the player @default true */
  physicsEnabled?: boolean
  /** whether the player jumps by itself onto a block in its way, as the vanilla client's auto-jump does @default false */
  autoJump?: boolean
  /** add the chat patterns that emit chat and whisper @default true */
  defaultChatPatterns?: boolean
  /** the longest chat packet: a longer line is sent in parts @default 512 */
  chatLengthLimit?: number
  /** whether the bot asks to respawn as soon as the player dies @default true */
  respawn?: boolean
  /** whether a screen closes when its animation ends (from 1.21.120), as the vanilla client mostly does @default true */
  screenAnimations?: boolean
}

export interface BedrockPluginOptions {
  [plugin: string]: boolean | BedrockPlugin
}

export type BedrockPlugin = (bot: BedrockBot, options: BedrockBotOptions) => void

export type BedrockBotEvents = Pick<BotEvents, 'error' | 'inject_allowed' | 'login' | 'game' | 'spawn' | 'respawn' | 'death' | 'health' | 'breath' | 'experience' | 'spawnReset' | 'rain' | 'weatherUpdate' | 'abilities' | 'time' | 'kicked' | 'end' | 'physicsTick' | 'physicTick' | 'move' | 'forcedMove' | 'chunkColumnLoad' | 'blockUpdate'
  | 'scoreboardCreated' | 'scoreboardDeleted' | 'scoreboardTitleChanged' | 'scoreUpdated' | 'scoreRemoved' | 'scoreboardPosition'
  | 'teamCreated' | 'teamRemoved' | 'teamUpdated' | 'teamMemberAdded' | 'teamMemberRemoved'
  | 'title' | 'title_times' | 'title_clear' | 'bossBarCreated' | 'bossBarUpdated' | 'bossBarDeleted'
  | 'soundEffectHeard' | 'hardcodedSoundEffectHeard' | 'particle'
  | 'entitySpawn' | 'entityGone' | 'entityMoved' | 'entityUpdate' | 'entitySwingArm' | 'entityHurt' | 'entityDead' | 'entityTaming' | 'entityTamed'
  | 'entityShakingOffWater' | 'entityEatingGrass' | 'entityWake' | 'entityEat' | 'entityCriticalEffect' | 'entityMagicCriticalEffect' | 'entityCrouch'
  | 'entityUncrouch' | 'entitySleep' | 'entityElytraFlew' | 'entityEffect' | 'entityEffectEnd' | 'entityAttributes' | 'itemDrop' | 'playerCollect'
  | 'playerJoined' | 'playerUpdated' | 'playerLeft' | 'entityAttach' | 'entityDetach' | 'mount' | 'dismount'
  | 'message' | 'messagestr' | 'chat' | 'whisper' | 'actionBar' | 'unmatchedMessage'
  | 'windowOpen' | 'windowClose' | 'heldItemChanged'> & BlockUpdateAtEvents & ChatPatternEvents

/** `blockUpdate:(1, 64, 2)`: the block at (1, 64, 2) changed */
export interface BlockUpdateAtEvents {
  [event: `blockUpdate:(${number}, ${number}, ${number})`]: (oldBlock: Block, newBlock: Block) => Promise<void> | void
}

/** `chat:<name>`: the chat pattern or set of that name matched (its messages, or with `parse` their capture groups) */
export interface ChatPatternEvents {
  [event: `chat:${string}`]: (matches: string[] | string[][]) => Promise<void> | void
}

/** the local player: its feet's position */
export interface BedrockPlayer extends Entity {
  isCollidedHorizontally: boolean
  isCollidedVertically: boolean
}

/** prismarine-recipe's `RecipeItem`: `metadata` null for any; `id` -1 for an empty cell */
export interface BedrockRecipeItem {
  id: number
  metadata: number | null
  count: number
}

/** a crafting_data recipe: Java's fields, a cell naming a tag or an alias shown by its first item, and Bedrock's */
export interface BedrockRecipe {
  result: BedrockRecipeItem
  /** a shaped recipe's rows, else null */
  inShape: BedrockRecipeItem[][] | null
  /** always null: what Java leaves in the grid, Bedrock makes as more results */
  outShape: null
  /** a shapeless recipe's, each counted negative, else null */
  ingredients: BedrockRecipeItem[] | null
  delta: BedrockRecipeItem[]
  requiresTable: boolean
  /** crafting_data's recipe id (none for a multi recipe, which is not shown), its type, network id, uuid, priority and block */
  id: string
  type: string
  networkId: number
  uuid: string
  priority: number
  block: string
  /** every result: `result` and those Java leaves in the grid, as the bucket the cake leaves */
  results: BedrockRecipeItem[]
}

/** Java's transfer options as its code reads them: the window open by default, sourceEnd sourceStart + 1, destEnd destStart + 1, count 1, an NBT the items match */
export interface BedrockTransferOptions extends Omit<TransferOptions, 'window' | 'sourceEnd' | 'destEnd' | 'count'> {
  window?: Window
  sourceEnd?: number
  destEnd?: number
  count?: number | null
  nbt?: NBT | null | undefined
}

export interface BedrockBot extends TypedEmitter<BedrockBotEvents> {
  username: string
  protocolVersion: number
  majorVersion: string
  version: BedrockVersion
  registry: Registry
  /** from start_game */
  entity: BedrockPlayer
  /** the entities the server shows, by runtime id, the local player's too */
  entities: { [id: string]: Entity }
  nearestEntity: (match?: (entity: Entity) => boolean) => Entity | null
  /** Java's: the nearest entity the look ray from the eye meets within maxDistance (3.5), before a block */
  entityAtCursor: (maxDistance?: number) => Entity | null
  /** the entity the local player rides, null on foot */
  vehicle: Entity | null
  /** the player list, by username */
  players: { [username: string]: Player }
  /** the local player's entry of the player list, from start_game */
  player: Player
  /** from start_game; maxPlayers throws: no packet tells it */
  game: GameState
  /** from update_attributes and set_health, once the server tells them */
  health: number
  food: number
  foodSaturation: number
  /** false from the player's death until it has health again */
  isAlive: boolean
  /** from update_attributes, once the server tells them: the points from the level and the bar's progress */
  experience: Experience | ExperienceNotKnown
  /** from set_entity_data's air, once the server tells it */
  oxygenLevel: number
  /** the world's spawn: start_game's, then set_spawn_position's; y 32767 where it has no height */
  spawnPoint: Vec3
  /** from start_game and level_event */
  isRaining: boolean
  rainState: number
  thunderState: number
  /** from update_abilities (adventure_settings up to 1.19.1) and the game mode */
  abilities: Abilities
  /** asks the server to respawn the dead player, in the next frame; nothing while it lives */
  respawn: () => void
  /** Java's; only the view distance reaches the server */
  settings: GameSettings
  /** asks for a new view distance in the next frame */
  setSettings: (options: Partial<GameSettings>) => void
  /** the physics move the player; false holds it where it is, standing still: acts from the next frame */
  physicsEnabled: boolean
  /** the player jumps by itself onto a block in its way, as the vanilla client's auto-jump does: acts from the next frame */
  autoJump: boolean
  time: Time | TimeNotSynced
  /** the controls held: set, each acts from the next frame */
  controlState: ControlStateStatus
  setControlState: (control: ControlState, state: boolean) => void
  getControlState: (control: ControlState) => boolean
  clearControlStates: () => void
  /** resolves once an auth input carried the look (at once when the player looks so already); force does nothing */
  look: (yaw: number, pitch: number, force?: boolean) => Promise<void>
  lookAt: (point: Vec3, force?: boolean) => Promise<void>
  /** resolves at the end of the tick `ticks` ticks from now */
  waitForTicks: (ticks: number) => Promise<void>
  /** the blocks the server sent, as received */
  world: world.WorldSync
  /** null where the bot has no column, or the section was asked for and is not answered yet */
  blockAt: (point: Vec3) => Block | null
  /** resolves once the columns around the player's are loaded; rejects after 200 ticks */
  waitForChunksToLoad: () => Promise<void>
  /** the objectives the server displayed, by name: Bedrock announces an objective only when it displays it */
  scoreboards: { [name: string]: ScoreBoard }
  /** the objective each display slot shows: 0 list, 1 sidebar, 2 belowName (Bedrock has no team sidebars) */
  scoreboard: ScoreBoardPositions
  /** always empty: Bedrock has no teams */
  teams: { [name: string]: Team }
  /** always empty: Bedrock has no teams */
  teamMap: { [name: string]: Team }
  /** header and footer always empty: Bedrock has neither */
  tablist: Tablist
  /** the bars of the boss entities the bot has, in the order they were shown */
  bossBars: BossBar[]
  /** the player's items in Java's inventory window layout, the offhand in slot 45 */
  inventory: Window<StorageEvents>
  /** the screen open, one the bot has a definition for: the inventory, a crafting table, or a feature's */
  currentWindow: Window | null
  heldItem: Item | null
  quickBarSlot: number
  /** opens the inventory screen (its 2 × 2 crafting grid), as the vanilla client does: resolves once the server opened it */
  openInventory: () => Promise<Window<StorageEvents>>
  /** gives back what the screen's definition says (the cursor, a grid, a station's inputs; dropping what has no room), closes the screen, and resolves once the server closed it */
  closeWindow: (window: Window) => Promise<void>
  /** Java's click (modes 0, 1, 2 and 4; on a crafting output the grid's craft), sent as the vanilla client's request: resolves once the server took it */
  clickWindow: (slot: number, mouseButton: number, mode: number) => Promise<void>
  /** Java's clickWindow(slot, 0 or 1, 0) */
  simpleClick: simpleClick
  /** Java's, by clicks on the window given (else the screen open, else bot.inventory, whose screen it opens and closes), each resolving once the server took it */
  transfer: (options: BedrockTransferOptions) => Promise<void>
  /** Java's: the cursor's item onto stacks of it with room in [start, end), else empty slots, else `slot` and the rest dropped */
  putSelectedItemRange: (start: number, end: number, window: Window, slot: number | null) => Promise<void>
  /** Java's: a shift click, or on an output or with no room a click then putSelectedItemRange over the inventory; resolves once the clicks did */
  putAway: (slot: number) => Promise<void>
  /** Java's: clicks the source, the destination, then the source again while the cursor holds an item */
  moveSlotItem: (sourceSlot: number, destSlot: number) => Promise<void>
  /** emits heldItemChanged in the next input pass */
  updateHeldItem: () => void
  /** Java's: clicks where the eye's ray meets the block, else looks at `cursorPos` on `direction`'s face first; resolves once the use ended */
  activateBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<void>
  /** activateBlock, resolving with the screen the server opened (the crafting table's), once the use ended too */
  openBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<Window>
  /** Java's: the crafting table's recipes making the item (of any metadata for null), of which the inventory has the ingredients for `minResultCount` (1) */
  recipesFor: (itemType: number, metadata: number | null | undefined, minResultCount: number | null, craftingTable: Block | boolean | null) => BedrockRecipe[]
  /** Java's: the crafting table's recipes making the item (of any metadata for null) */
  recipesAll: (itemType: number, metadata: number | null | undefined, craftingTable: Block | boolean | null) => BedrockRecipe[]
  /** the recipe book's craft, `count` (1, as null; 0 crafts nothing) times, on the screen open or one it opens (a crafting table's, the inventory's without one) and closes; rejects, sending nothing, without the ingredients */
  craft: (recipe: BedrockRecipe, count?: number | null, craftingTable?: Block | null) => Promise<void>
  /** Bedrock's: the recipe book's select, putting a craft's ingredients (`all`: as many crafts' as the grid takes; those the inventory has, where it lacks some) in the open screen's grid */
  placeRecipe: (recipe: BedrockRecipe, all?: boolean) => Promise<void>
  end: (reason?: string) => void
  quit: (reason?: string) => void
  /** a chat message, or a command (`/…`), sent in the next frame; throws before login */
  chat: Bot['chat']
  /** `/tell <username> <message>`, a name with other characters than letters, digits and `_` quoted */
  whisper: Bot['whisper']
  /** Bedrock has no tab completion: rejects */
  tabComplete: Bot['tabComplete']
  chatAddPattern: Bot['chatAddPattern']
  addChatPattern: Bot['addChatPattern']
  addChatPatternSet: Bot['addChatPatternSet']
  removeChatPattern: Bot['removeChatPattern']
  /** the timeout (ms, default 20000) counts game ticks; rejects when the bot ends */
  awaitMessage: Bot['awaitMessage']
  loadPlugin: (plugin: BedrockPlugin) => void
  loadPlugins: (plugins: BedrockPlugin[]) => void
  hasPlugin: (plugin: BedrockPlugin) => boolean
}

export interface BotEvents {
  chat: (
    username: string,
    message: string,
    translate: string | null,
    jsonMsg: ChatMessage,
    matches: string[] | null
  ) => Promise<void> | void
  whisper: (
    username: string,
    message: string,
    translate: string | null,
    jsonMsg: ChatMessage,
    matches: string[] | null
  ) => Promise<void> | void
  actionBar: (jsonMsg: ChatMessage) => Promise<void> | void
  error: (err: Error) => Promise<void> | void
  message: (jsonMsg: ChatMessage, position: string) => Promise<void> | void
  messagestr: (message: string, position: string, jsonMsg: ChatMessage) => Promise<void> | void
  unmatchedMessage: (stringMsg: string, jsonMsg: ChatMessage) => Promise<void> | void
  inject_allowed: () => Promise<void> | void
  connect: () => Promise<void> | void
  login: () => Promise<void> | void
  /** When `respawn` option is disabled, you can call this method manually to respawn. */
  spawn: () => Promise<void> | void
  respawn: () => Promise<void> | void
  game: () => Promise<void> | void
  title: (text: string, type: 'subtitle' | 'title') => Promise<void> | void
  /** in ticks */
  title_times: (fadeIn: number, stay: number, fadeOut: number) => Promise<void> | void
  title_clear: () => Promise<void> | void
  rain: () => Promise<void> | void
  weatherUpdate: () => Promise<void> | void
  time: () => Promise<void> | void
  kicked: (reason: string, loggedIn: boolean) => Promise<void> | void
  end: (reason: string) => Promise<void> | void
  spawnReset: () => Promise<void> | void
  death: () => Promise<void> | void
  health: () => Promise<void> | void
  breath: () => Promise<void> | void
  abilities: (abilities: Abilities) => Promise<void> | void
  entitySwingArm: (entity: Entity) => Promise<void> | void
  entityHurt: (entity: Entity, source?: Entity) => Promise<void> | void
  entityDead: (entity: Entity) => Promise<void> | void
  entityTaming: (entity: Entity) => Promise<void> | void
  entityTamed: (entity: Entity) => Promise<void> | void
  entityShakingOffWater: (entity: Entity) => Promise<void> | void
  entityEatingGrass: (entity: Entity) => Promise<void> | void
  entityHandSwap: (entity: Entity) => Promise<void> | void
  entityWake: (entity: Entity) => Promise<void> | void
  entityEat: (entity: Entity) => Promise<void> | void
  entityCriticalEffect: (entity: Entity) => Promise<void> | void
  entityMagicCriticalEffect: (entity: Entity) => Promise<void> | void
  entityCrouch: (entity: Entity) => Promise<void> | void
  entityUncrouch: (entity: Entity) => Promise<void> | void
  entityEquip: (entity: Entity) => Promise<void> | void
  entitySleep: (entity: Entity) => Promise<void> | void
  entitySpawn: (entity: Entity) => Promise<void> | void
  entityElytraFlew: (entity: Entity) => Promise<void> | void
  usedFirework: () => Promise<void> | void
  itemDrop: (entity: Entity) => Promise<void> | void
  playerCollect: (collector: Entity, collected: Entity) => Promise<void> | void
  entityAttributes: (entity: Entity) => Promise<void> | void
  entityGone: (entity: Entity) => Promise<void> | void
  entityMoved: (entity: Entity) => Promise<void> | void
  entityDetach: (entity: Entity, vehicle: Entity) => Promise<void> | void
  entityAttach: (entity: Entity, vehicle: Entity) => Promise<void> | void
  entityUpdate: (entity: Entity) => Promise<void> | void
  entityEffect: (entity: Entity, effect: Effect) => Promise<void> | void
  entityEffectEnd: (entity: Entity, effect: Effect) => Promise<void> | void
  playerJoined: (player: Player) => Promise<void> | void
  playerUpdated: (player: Player) => Promise<void> | void
  playerLeft: (entity: Player) => Promise<void> | void
  blockUpdate: (oldBlock: Block | null, newBlock: Block) => Promise<void> | void
  'blockUpdate:(x, y, z)': (oldBlock: Block | null, newBlock: Block | null) => Promise<void> | void
  blockEntityData: (block: Block | null) => Promise<void> | void
  signOpen: (block: Block | null) => Promise<void> | void
  chunkColumnLoad: (entity: Vec3) => Promise<void> | void
  chunkColumnUnload: (entity: Vec3) => Promise<void> | void
  soundEffectHeard: (
    soundName: string,
    position: Vec3,
    volume: number,
    pitch: number
  ) => Promise<void> | void
  hardcodedSoundEffectHeard: (
    soundId: number,
    soundCategory: number,
    position: Vec3,
    volume: number,
    pitch: number
  ) => Promise<void> | void
  noteHeard: (block: Block, instrument: Instrument, pitch: number) => Promise<void> | void
  pistonMove: (block: Block, isPulling: number, direction: number) => Promise<void> | void
  chestLidMove: (block: Block, isOpen: number, block2: Block | null) => Promise<void> | void
  blockBreakProgressObserved: (block: Block, destroyStage: number) => Promise<void> | void
  blockBreakProgressEnd: (block: Block) => Promise<void> | void
  diggingCompleted: (block: Block) => Promise<void> | void
  diggingAborted: (block: Block) => Promise<void> | void
  move: (position: Vec3) => Promise<void> | void
  forcedMove: () => Promise<void> | void
  mount: () => Promise<void> | void
  dismount: (vehicle: Entity) => Promise<void> | void
  windowOpen: (window: Window) => Promise<void> | void
  windowClose: (window: Window) => Promise<void> | void
  sleep: () => Promise<void> | void
  wake: () => Promise<void> | void
  experience: () => Promise<void> | void
  physicsTick: () => Promise<void> | void
  physicTick: () => Promise<void> | void
  scoreboardCreated: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreboardDeleted: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreboardTitleChanged: (scoreboard: ScoreBoard) => Promise<void> | void
  scoreUpdated: (scoreboard: ScoreBoard, item: ScoreBoardItem) => Promise<void> | void
  scoreRemoved: (scoreboard: ScoreBoard, item: ScoreBoardItem) => Promise<void> | void
  /** position: the display slot's number (0 list, 1 sidebar, 2 below the name, from 3 a team color's sidebar); previous: the scoreboard it showed before */
  scoreboardPosition: (position: number, scoreboard: ScoreBoard, previous: ScoreBoard | undefined) => Promise<void> | void
  teamCreated: (team: Team) => Promise<void> | void
  teamRemoved: (team: Team) => Promise<void> | void
  teamUpdated: (team: Team) => Promise<void> | void
  teamMemberAdded: (team: Team) => Promise<void> | void
  teamMemberRemoved: (team: Team) => Promise<void> | void
  bossBarCreated: (bossBar: BossBar) => Promise<void> | void
  bossBarDeleted: (bossBar: BossBar) => Promise<void> | void
  bossBarUpdated: (bossBar: BossBar) => Promise<void> | void
  resourcePack: (url: string, hash?: string, uuid?: string) => Promise<void> | void
  heldItemChanged: (newItem: Item | null) => Promise<void> | void
  particle: (particle: Particle) => Promise<void> | void
}

export interface CommandBlockOptions {
  mode: number,
  trackOutput: boolean,
  conditional: boolean,
  alwaysActive: boolean
}

export interface Bot extends TypedEmitter<BotEvents> {
  username: string
  /** the protocol number of the server's version (e.g. 769 for 1.21.4) */
  protocolVersion: number
  /** the server's major version (e.g. '1.21') */
  majorVersion: string
  /** the server's version (e.g. '1.21.4') */
  version: string
  entity: Entity
  entities: { [id: string]: Entity }
  fireworkRocketDuration: number
  spawnPoint: Vec3
  game: GameState
  player: Player
  players: { [username: string]: Player }
  isRaining: boolean
  rainState: number
  thunderState: number
  chatPatterns: ChatPattern[]
  settings: GameSettings
  experience: Experience
  health: number
  food: number
  foodSaturation: number
  oxygenLevel: number
  physics: PhysicsOptions
  physicsEnabled: boolean
  abilities: Abilities
  time: Time
  quickBarSlot: number
  inventory: Window<StorageEvents>
  targetDigBlock: Block
  isSleeping: boolean
  scoreboards: { [name: string]: ScoreBoard }
  scoreboard: { [slot in DisplaySlot]: ScoreBoard }
  teams: { [name: string]: Team }
  teamMap: { [name: string]: Team }
  controlState: ControlStateStatus
  creative: creativeMethods
  world: world.WorldSync
  _client: Client
  heldItem: Item | null
  usingHeldItem: boolean
  currentWindow: Window | null
  simpleClick: simpleClick
  tablist: Tablist
  registry: Registry

  connect: (options: BotOptions) => void

  supportFeature: IndexedData['supportFeature']

  end: (reason?: string) => void

  blockAt: (point: Vec3, extraInfos?: boolean) => Block | null

  blockInSight: (maxSteps: number, vectorLength: number) => Block | null

  blockAtCursor: (maxDistance?: number, matcher?: Function) => Block | null
  blockAtEntityCursor: (entity?: Entity, maxDistance?: number, matcher?: Function) => Block | null

  canSeeBlock: (block: Block) => boolean

  findBlock: (options: FindBlockOptions) => Block | null

  findBlocks: (options: FindBlockOptions) => Vec3[]

  canDigBlock: (block: Block) => boolean

  recipesFor: (
    itemType: number,
    metadata: number | null,
    minResultCount: number | null,
    craftingTable: Block | boolean | null
  ) => Recipe[]

  recipesAll: (
    itemType: number,
    metadata: number | null,
    craftingTable: Block | boolean | null
  ) => Recipe[]

  quit: (reason?: string) => void

  tabComplete: (
    str: string,
    assumeCommand?: boolean,
    sendBlockInSight?: boolean,
    timeout?: number
  ) => Promise<string[]>

  chat: (message: string) => void

  whisper: (username: string, message: string) => void

  chatAddPattern: (pattern: RegExp, chatType: string, description?: string) => number

  setSettings: (options: Partial<GameSettings>) => void

  loadPlugin: (plugin: Plugin) => void

  loadPlugins: (plugins: Plugin[]) => void

  hasPlugin: (plugin: Plugin) => boolean

  sleep: (bedBlock: Block) => Promise<void>

  isABed: (bedBlock: Block) => boolean

  wake: () => Promise<void>

  elytraFly: () => Promise<void>

  setControlState: (control: ControlState, state: boolean) => void

  getControlState: (control: ControlState) => boolean

  clearControlStates: () => void

  getExplosionDamages: (targetEntity: Entity, position: Vec3, radius: number, rawDamages?: boolean) => number | null

  lookAt: (point: Vec3, force?: boolean) => Promise<void>

  look: (
    yaw: number,
    pitch: number,
    force?: boolean
  ) => Promise<void>

  updateSign: (block: Block, text: string, back?: boolean) => void

  equip: (
    item: Item | number,
    destination: EquipmentDestination | null
  ) => Promise<void>

  unequip: (
    destination: EquipmentDestination | null
  ) => Promise<void>

  tossStack: (item: Item) => Promise<void>

  toss: (
    itemType: number,
    metadata: number | null,
    count: number | null
  ) => Promise<void>

  dig: ((block: Block, forceLook?: boolean | 'ignore') => Promise<void>) & ((block: Block, forceLook: boolean | 'ignore', digFace: 'auto' | Vec3 | 'raycast') => Promise<void>)

  stopDigging: () => void

  digTime: (block: Block) => number

  placeBlock: (referenceBlock: Block, faceVector: Vec3) => Promise<void>

  placeEntity: (referenceBlock: Block, faceVector: Vec3) => Promise<Entity>

  activateBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<void>

  activateEntity: (entity: Entity) => Promise<void>

  activateEntityAt: (entity: Entity, position: Vec3) => Promise<void>

  consume: () => Promise<void>

  fish: () => Promise<void>

  activateItem: (offhand?: boolean) => void

  deactivateItem: () => void

  useOn: (targetEntity: Entity) => void

  attack: (entity: Entity) => void

  swingArm: (hand: 'left' | 'right' | undefined, showHand?: boolean) => void

  mount: (entity: Entity) => void

  dismount: () => void

  moveVehicle: (left: number, forward: number) => void

  setQuickBarSlot: (slot: number) => void

  craft: (
    recipe: Recipe,
    count?: number,
    craftingTable?: Block
  ) => Promise<void>

  writeBook: (
    slot: number,
    pages: string[]
  ) => Promise<void>

  openContainer: (chest: Block | Entity, direction?: Vec3, cursorPos?: Vec3) => Promise<Chest | Dispenser>

  openChest: (chest: Block | Entity, direction?: number, cursorPos?: Vec3) => Promise<Chest>

  openFurnace: (furnace: Block) => Promise<Furnace>

  openDispenser: (dispenser: Block) => Promise<Dispenser>

  openEnchantmentTable: (enchantmentTable: Block) => Promise<EnchantmentTable>

  openAnvil: (anvil: Block) => Promise<Anvil>

  openVillager: (
    villager: Entity
  ) => Promise<Villager>

  trade: (
    villagerInstance: Villager,
    tradeIndex: string | number,
    times?: number
  ) => Promise<void>

  setCommandBlock: (pos: Vec3, command: string, options: CommandBlockOptions) => void

  clickWindow: (
    slot: number,
    mouseButton: number,
    mode: number
  ) => Promise<void>

  putSelectedItemRange: (
    start: number,
    end: number,
    window: Window,
    slot: any
  ) => Promise<void>

  putAway: (slot: number) => Promise<void>

  closeWindow: (window: Window) => Promise<void>

  transfer: (options: TransferOptions) => Promise<void>

  openBlock: (block: Block, direction?: Vec3, cursorPos?: Vec3) => Promise<Window>

  openEntity: (block: Entity, Class: new () => EventEmitter) => Promise<Window>

  moveSlotItem: (
    sourceSlot: number,
    destSlot: number
  ) => Promise<void>

  updateHeldItem: () => void

  getEquipmentDestSlot: (destination: string) => number

  waitForChunksToLoad: () => Promise<void>

  entityAtCursor: (maxDistance?: number) => Entity | null
  nearestEntity: (filter?: (entity: Entity) => boolean) => Entity | null

  waitForTicks: (ticks: number) => Promise<void>

  addChatPattern: (name: string, pattern: RegExp, options?: chatPatternOptions) => number

  addChatPatternSet: (name: string, patterns: RegExp[], options?: chatPatternOptions) => number

  removeChatPattern: (name: string | number) => void

  awaitMessage: (...args: string[] | RegExp[]) => Promise<string>

  acceptResourcePack: () => void

  denyResourcePack: () => void

  respawn: () => void
}

export interface simpleClick {
  leftMouse: (slot: number) => Promise<void>
  rightMouse: (slot: number) => Promise<void>
}

export interface Tablist {
  header: ChatMessage
  footer: ChatMessage
}

export interface chatPatternOptions {
  repeat: boolean
  parse: boolean
}

export interface GameState {
  levelType: LevelType
  gameMode: GameMode
  hardcore: boolean
  dimension: Dimension
  difficulty: Difficulty
  maxPlayers: number
  serverBrand: string
  /** the dimension's lowest block */
  minY: number
  height: number
}

export type LevelType =
  | 'default'
  | 'flat'
  | 'largeBiomes'
  | 'amplified'
  | 'customized'
  | 'buffet'
  | 'default_1_1'
export type GameMode = 'survival' | 'creative' | 'adventure' | 'spectator'
export type Dimension = 'the_nether' | 'overworld' | 'the_end'
export type Difficulty = 'peaceful' | 'easy' | 'normal' | 'hard'

export interface Player {
  uuid: string
  username: string
  displayName: ChatMessage
  gamemode: number
  ping: number
  entity: Entity | null
  skinData: SkinData | undefined
  profileKeys?: {
    publicKey: Buffer
    signature: Buffer
  }
}

export interface SkinData {
  url: string
  model: string | null
  capeUrl?: string
}

export interface ChatPattern {
  pattern: RegExp
  type: string
  description: string
}

export interface SkinParts {
  showCape: boolean
  showJacket: boolean
  showLeftSleeve: boolean
  showRightSleeve: boolean
  showLeftPants: boolean
  showRightPants: boolean
  showHat: boolean
}

export interface GameSettings {
  chat: ChatLevel
  colorsEnabled: boolean
  viewDistance: ViewDistance
  difficulty: number
  skinParts: SkinParts
  mainHand: MainHands
}

export interface Experience {
  level: number
  points: number
  progress: number
}

export type ExperienceNotKnown = { [Field in keyof Experience]: null }

export interface Abilities {
  invulnerable: boolean
  flying: boolean
  mayFly: boolean
  instantBuild: boolean
  flyingSpeed: number
  walkingSpeed: number
}

export interface PhysicsOptions {
  maxGroundSpeed: number
  terminalVelocity: number
  walkingAcceleration: number
  gravity: number
  groundFriction: number
  playerApothem: number
  playerHeight: number
  jumpSpeed: number
  yawSpeed: number
  pitchSpeed: number
  sprintSpeed: number
  maxGroundSpeedSoulSand: number
  maxGroundSpeedWater: number
}

export interface Time {
  doDaylightCycle: boolean
  bigTime: bigint
  time: number
  timeOfDay: number
  day: number
  isDay: boolean
  moonPhase: number
  bigAge: bigint
  age: number
}

export type TimeNotSynced = { [Field in keyof Time]: null }

export interface ControlStateStatus {
  forward: boolean
  back: boolean
  left: boolean
  right: boolean
  jump: boolean
  sprint: boolean
  sneak: boolean
}

export type ControlState =
  | 'forward'
  | 'back'
  | 'left'
  | 'right'
  | 'jump'
  | 'sprint'
  | 'sneak'

export interface Effect {
  id: number
  amplifier: number
  duration: number
}

export interface Instrument {
  id: number
  name: 'harp' | 'doubleBass' | 'snareDrum' | 'sticks' | 'bassDrum'
}

export interface FindBlockOptions {
  point?: Vec3
  matching: number | number[] | ((block: Block) => boolean)
  maxDistance?: number
  count?: number
  useExtraInfo?: boolean | ((block: Block) => boolean)
}

export type EquipmentDestination = 'hand' | 'head' | 'torso' | 'legs' | 'feet' | 'off-hand'

export interface TransferOptions {
  window: Window
  itemType: number
  metadata: number | null
  count?: number,
  sourceStart: number
  sourceEnd: number
  destStart: number
  destEnd: number
}

export interface creativeMethods {
  setInventorySlot: (
    slot: number,
    item: Item | null
  ) => Promise<void>

  clearSlot: (slot: number) => Promise<void>

  clearInventory: () => Promise<void>

  flyTo: (destination: Vec3) => Promise<void>

  startFlying: () => void

  stopFlying: () => void
}

export declare class Location {
  floored: Vec3
  blockPoint: Vec3
  chunkCorner: Vec3
  blockIndex: number
  biomeBlockIndex: number
  chunkYIndex: number

  constructor (absoluteVector: Vec3)
}

export declare class Painting {
  id: number
  position: Vec3
  name: string
  direction: Vec3

  constructor (id: number, position: Vec3, name: string, direction: Vec3)
}

export interface StorageEvents {
  open: () => void
  close: () => void
  updateSlot: (slot: number, oldItem: Item | null, newItem: Item | null) => void
}

interface FurnaceEvents extends StorageEvents {
  update: () => void
}

interface ConditionalStorageEvents extends StorageEvents {
  ready: () => void
}

export interface Chest extends Window<StorageEvents> {
  close (): Promise<void>

  deposit (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>

  withdraw (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>
}

export interface Furnace extends Window<FurnaceEvents> {
  fuel: number
  progress: number

  close (): Promise<void>

  takeInput (): Promise<Item>

  takeFuel (): Promise<Item>

  takeOutput (): Promise<Item>

  putInput (
    itemType: number,
    metadata: number | null,
    count: number
  ): Promise<void>

  putFuel (
    itemType: number,
    metadata: number | null,
    count: number
  ): Promise<void>

  inputItem (): Item

  fuelItem (): Item

  outputItem (): Item
}

export interface Dispenser extends Window<StorageEvents> {
  close (): Promise<void>

  deposit (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>

  withdraw (
    itemType: number,
    metadata: number | null,
    count: number | null
  ): Promise<void>
}

export interface EnchantmentTable extends Window<ConditionalStorageEvents> {
  enchantments: Enchantment[]

  close (): Promise<void>

  targetItem (): Item

  enchant (
    choice: string | number
  ): Promise<Item>

  takeTargetItem (): Promise<Item>

  putTargetItem (item: Item): Promise<Item>

  putLapis (item: Item): Promise<Item>
}

export interface Anvil {
  combine (itemOne: Item, itemTwo: Item, name?: string): Promise<void>
  rename (item: Item, name?: string): Promise<void>
}

export interface Enchantment {
  level: number
  expected: { enchant: number, level: number }
}

export interface Villager extends Window<ConditionalStorageEvents> {
  trades: VillagerTrade[]

  close (): Promise<void>
}

export interface VillagerTrade {
  inputItem1: Item
  outputItem: Item
  inputItem2: Item | null
  hasItem2: boolean
  tradeDisabled: boolean
  nbTradeUses: number
  maximumNbTradeUses: number
  xp?: number
  specialPrice?: number
  priceMultiplier?: number
  demand?: number
  realPrice?: number
}

/** a scoreboard's text as the packets give it: legacy text before 1.13, JSON text from 1.13, an NBT component from 1.20.3 */
export type ScoreBoardText = string | Tags[TagType]

export interface ScoreBoard {
  name: string
  title: ChatMessage
  itemsMap: { [name: string]: ScoreBoardItem }
  items: ScoreBoardItem[]

  setTitle (title: ScoreBoardText): void

  /** display: the component 1.20.3+ servers may send to draw in place of the item's name */
  add (name: string, value: number, display?: ScoreBoardText | null): ScoreBoardItem

  /** removes an item; returns it, undefined if the scoreboard did not have it */
  remove (name: string): ScoreBoardItem | undefined
}

/** the scoreboards shown in each display slot, by the slot's number; list / sidebar / belowName name the first three */
export interface ScoreBoardPositions {
  [slot: number]: ScoreBoard | undefined
  readonly list: ScoreBoard | undefined
  readonly sidebar: ScoreBoard | undefined
  readonly belowName: ScoreBoard | undefined
}

/** a bot's ScoreBoard class */
export interface ScoreBoardClass {
  /** packet: the objective's name and title, as a scoreboard_objective packet that adds it gives them */
  new (packet: { name: string, displayText: ScoreBoardText }): ScoreBoard
  positions: ScoreBoardPositions
}

/** mineflayer.ScoreBoard: the ScoreBoard class of a bot (its items' names are formatted by the bot's teams) */
export declare const ScoreBoard: (bot: Pick<Bot, 'registry' | 'teamMap'>) => ScoreBoardClass

export interface ScoreBoardItem {
  name: string
  displayName: ChatMessage
  value: number
}

/** a team's text as the packets give it: legacy text before 1.13, JSON text from 1.13, an NBT component from 1.20.3 */
export type TeamText = string | Tags[TagType]

export interface Team {
  team: string
  name: ChatMessage
  /** the packet's bits: 0x1 friendly fire, 0x2 seeing invisible teammates */
  friendlyFire: number
  nameTagVisibility: string
  collisionRule: string
  color: string
  prefix: ChatMessage
  suffix: ChatMessage
  membersMap: { [name: string]: '' }
  members: string[]

  parseMessage (value: TeamText): ChatMessage

  /** adds a member; returns its value in membersMap */
  add (name: string): ''

  /** removes a member; returns its value in membersMap, undefined if it was not one */
  remove (name: string): '' | undefined

  update (name: TeamText, friendlyFire: number, nameTagVisibility: string, collisionRule: string, formatting: number | undefined, prefix: TeamText, suffix: TeamText): void

  displayName (member: string): ChatMessage
}

export type DisplaySlot =
  | 'list'
  | 'sidebar'
  | 'belowName'
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14
  | 15
  | 16
  | 17
  | 18

export interface BossBar {
  entityUUID: string
  title: ChatMessage
  health: number
  /** the notches the bar is divided in (0, 6, 10, 12 or 20); undefined for a style the bot does not know */
  dividers: number | undefined
  /** undefined for a color the bot does not know */
  color: 'pink' | 'blue' | 'red' | 'green' | 'yellow' | 'purple' | 'white' | undefined
  shouldDarkenSky: boolean
  isDragonBar: boolean
  createFog: boolean
  shouldCreateFog: boolean
  /** the flags' bits: 0x1 darken the sky, 0x2 a dragon bar, 0x4 fog */
  flags: number
}

/** a version's BossBar class */
export interface BossBarClass {
  /** dividers and color: the packet's indexes of the bar's style and color; flags: its flags' bits */
  new (uuid: string, title: string | Tags[TagType], health: number, dividers: number, color: number, flags: number): BossBar
}

/** mineflayer.BossBar: the BossBar class of a version */
export declare const BossBar: (registry: Registry) => BossBarClass

export interface Particle {
  id: number
  /** the registry's name of the particle; undefined for an id the registry does not have */
  name: string | undefined
  position: Vec3
  offset: Vec3
  count: number
  movementSpeed: number
  longDistanceRender: boolean
}

/** a version's Particle class */
export interface ParticleClass {
  /** id: the particle's id, or its name */
  new (id: number | string, position: Vec3, offset: Vec3, count?: number, movementSpeed?: number, longDistanceRender?: boolean): Particle
  /** the particle a world_particles packet shows */
  fromNetwork (packet: object): Particle
}

/** mineflayer.Particle: the Particle class of a version */
export declare const Particle: (registry: Registry) => ParticleClass

export type JavaVersion = `${number}.${number}` | `${number}.${number}.${number}`

/** the versions mineflayer is tested with, oldest first */
export declare const testedVersions: readonly [JavaVersion, ...JavaVersion[]]
export declare const latestSupportedVersion: JavaVersion
export declare const oldestSupportedVersion: JavaVersion

export type BedrockVersion = `bedrock_${string}`

export declare const testedBedrockVersions: readonly [BedrockVersion, ...BedrockVersion[]]
export declare const latestSupportedBedrockVersion: BedrockVersion
export declare const oldestSupportedBedrockVersion: BedrockVersion

/** a feature of a version, as minecraft-data has it (whether it has it, or its value) */
export declare function supportFeature<Feature extends keyof SupportsFeature> (feature: Feature, version: string): SupportsFeature[Feature]
