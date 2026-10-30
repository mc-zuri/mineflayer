import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion, Difficulty, Dimension, GameMode, GameState, LevelType } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

// bot.game, as Java's: start_game fills it in, then the game type and difficulty packets change it. Bedrock has no
// server brand: the engine start_game names (the server's version) stands for it; and no packet tells the most players
// a server takes.

const OWNER = 'game'
const DIFFICULTIES: readonly Difficulty[] = Object.freeze(['peaceful', 'easy', 'normal', 'hard'])
/** start_game's generator of flat worlds, and of the old limited ones */
const FLAT_GENERATOR = 2
const LEGACY_GENERATOR = 0

/** a game type as the version reads it: its name, or its id where the version names none */
export type BedrockGameType = BedrockClientboundPackets['set_player_game_type']['gamemode']

/**
 * the player's game mode, as the packets tell it: start_game's game type of the player, which may fall back to the
 * world's game mode, then the game type packets
 */
export class PlayerGameMode {
  /** start_game's unique id of the player, which update_player_game_type names */
  private uniqueId: bigint | undefined
  private worldGameMode: GameMode = 'survival'
  private gameType: BedrockGameType = 'fallback'

  get gameMode (): GameMode {
    return bedrockGameMode(this.gameType, this.worldGameMode)
  }

  start (packet: Pick<BedrockClientboundPackets['start_game'], 'entity_id' | 'world_gamemode' | 'player_gamemode'>): void {
    this.uniqueId = packet.entity_id
    this.worldGameMode = bedrockGameMode(packet.world_gamemode, 'survival')
    this.gameType = packet.player_gamemode
  }

  set (gameType: BedrockGameType): void {
    this.gameType = gameType
  }

  /** whether it is the player's: the server tells each player every player's game type */
  update (packet: BedrockClientboundPackets['update_player_game_type']): boolean {
    if (packet.player_unique_id !== this.uniqueId) return false
    this.gameType = packet.gamemode
    return true
  }

  /** whether the player's game mode follows the world's */
  setWorld (gameType: BedrockGameType): boolean {
    this.worldGameMode = bedrockGameMode(gameType, 'survival')
    return this.gameType === 'fallback'
  }
}

/** start_game's dimension: its id up to 1.18.11, its name from 1.18.30 */
export type BedrockDimension = BedrockClientboundPackets['start_game']['dimension']

/** Java's game mode of a game type: both spectator modes are spectator, and fallback is the world's game mode */
export function bedrockGameMode (gameType: BedrockGameType, worldGameMode: GameMode): GameMode {
  switch (gameType) {
    case 'survival':
    case 'creative':
    case 'adventure':
    case 'spectator':
      return gameType
    case 'survival_spectator':
    case 'creative_spectator':
      return 'spectator'
    case 'fallback':
      return worldGameMode
    default:
      // one the version does not name: as Java reads a game mode out of range
      return 'survival'
  }
}

/** Java's name of a dimension; an id no dimension has is the overworld, as the world module takes it */
export function bedrockDimension (dimension: BedrockDimension): Dimension {
  if (dimension === 1 || dimension === 'nether') return 'the_nether'
  if (dimension === 2 || dimension === 'end') return 'the_end'
  return 'overworld'
}

/** the dimension's lowest block and its height: the overworld's grew in 1.18.0 */
function boundsOf (dimension: Dimension, version: BedrockVersion): Pick<GameState, 'minY' | 'height'> {
  if (dimension === 'the_nether') return { minY: 0, height: 128 }
  if (dimension === 'overworld' && isBedrockVersionAtLeast(version, 'bedrock_1.18.0')) return { minY: -64, height: 384 }
  return { minY: 0, height: 256 }
}

function levelTypeOf (generator: number): LevelType {
  if (generator === FLAT_GENERATOR) return 'flat'
  if (generator === LEGACY_GENERATOR) return 'default_1_1'
  return 'default'
}

export default function inject (bot: BedrockBotInternal): void {
  // start_game fills the rest in; not enumerable, so that bot.game spreads and serializes
  bot.game = Object.defineProperty({} as GameState, 'maxPlayers', {
    enumerable: false,
    get: () => { throw new Error('bot.game.maxPlayers is not supported on Bedrock: no packet tells it') }
  })
  const player = new PlayerGameMode()

  function gameModeTold (): void {
    bot.game.gameMode = player.gameMode
    bot._core.emit(bot, 'game')
  }

  function setDifficulty (id: number): void {
    // one the version does not name leaves it
    const difficulty = DIFFICULTIES[id]
    if (difficulty !== undefined) bot.game.difficulty = difficulty
  }

  bot._core.observe(OWNER, 'start_game', packet => {
    player.start(packet)
    const dimension = bedrockDimension(packet.dimension)
    Object.assign(bot.game, {
      levelType: levelTypeOf(packet.generator),
      gameMode: player.gameMode,
      // from 1.20.80
      hardcore: packet.hardcore ?? false,
      dimension,
      ...boundsOf(dimension, bot.version)
    })
    setDifficulty(packet.difficulty)
    // from 1.17.0
    if (packet.engine !== undefined) bot.game.serverBrand = packet.engine
    bot._core.emit(bot, 'login')
    bot._core.emit(bot, 'game')
  })

  bot._core.handle(OWNER, 'set_player_game_type', packet => {
    player.set(packet.gamemode)
    gameModeTold()
  })

  bot._core.handle(OWNER, 'update_player_game_type', packet => { if (player.update(packet)) gameModeTold() })

  bot._core.handle(OWNER, 'set_default_game_type', packet => { if (player.setWorld(packet.gamemode)) gameModeTold() })

  bot._core.handle(OWNER, 'set_difficulty', packet => { setDifficulty(packet.difficulty) })

  /** a dimension change is Java's respawn packet: the ready state after a dead player's, or the credits', is part of it */
  let respawnTold = false
  bot._core.observe(OWNER, 'change_dimension', packet => {
    const dimension = bedrockDimension(packet.dimension)
    Object.assign(bot.game, { dimension, ...boundsOf(dimension, bot.version) })
    respawnTold = packet.respawn || !bot.isAlive
    bot._core.emit(bot, 'respawn')
    bot._core.emit(bot, 'game')
  })

  /** the join's respawn ready state spawns the player; each one after respawns it */
  let spawned = false
  bot._core.observe(OWNER, 'respawn', packet => {
    if (packet.state !== 1) return
    if (spawned && !respawnTold) {
      bot._core.emit(bot, 'respawn')
      bot._core.emit(bot, 'game')
    }
    spawned = true
    respawnTold = false
  })
}
