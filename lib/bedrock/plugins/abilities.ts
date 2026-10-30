import { isDeepStrictEqual } from 'util'
import type { Abilities, GameMode } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import { PlayerGameMode } from './game.ts'

// bot.abilities, as Java's: the player's ability layers, which update_abilities replaces (from 1.19.10; up to 1.19.1
// servers send adventure_settings, whose flight flags are the base layer's), and the game mode, which the bot applies to
// the base layer itself: servers send no abilities after a game mode change.

const OWNER = 'abilities'
/** the layers by rank: a layer that allows an ability decides it over the layers below */
const LAYER_RANKS: ReadonlyArray<PacketLayer['type']> = Object.freeze(['cache', 'base', 'spectator', 'commands', 'editor', 'loading_screen'])
const BASE_RANK = 1
const FLAGS = Object.freeze([['invulnerable', 'invulnerable'], ['flying', 'flying'], ['may_fly', 'mayFly'], ['instant_build', 'instantBuild']] as const)
const JAVA_DEFAULTS: Readonly<Abilities> = Object.freeze({ invulnerable: false, flying: false, mayFly: false, instantBuild: false, flyingSpeed: 0.05, walkingSpeed: 0.1 })

type PacketLayer = BedrockClientboundPackets['update_abilities']['abilities'][number]
type Flags = Pick<Abilities, 'invulnerable' | 'flying' | 'mayFly' | 'instantBuild'>

/** what a layer decides: the abilities it allows */
interface Layer {
  readonly rank: number
  readonly abilities: Readonly<Partial<Abilities>>
}

function layerOf ({ type, allowed, enabled, fly_speed: flyingSpeed, walk_speed: walkingSpeed }: PacketLayer): Layer {
  const abilities: Partial<Abilities> = {}
  for (const [flag, name] of FLAGS) if (allowed[flag]) abilities[name] = enabled[flag]
  if (allowed.fly_speed) abilities.flyingSpeed = flyingSpeed
  if (allowed.walk_speed) abilities.walkingSpeed = walkingSpeed
  // a layer the version does not name is numbered by its rank
  return { rank: typeof type === 'number' ? type : LAYER_RANKS.indexOf(type), abilities }
}

/** Java's abilities of a game mode: creative keeps the flight it has */
function gameModeFlags (gameMode: GameMode, flying: boolean): Flags {
  if (gameMode === 'creative') return { invulnerable: true, flying, mayFly: true, instantBuild: true }
  if (gameMode === 'spectator') return { invulnerable: true, flying: true, mayFly: true, instantBuild: false }
  return { invulnerable: false, flying: false, mayFly: false, instantBuild: false }
}

export default function inject (bot: BedrockBotInternal): void {
  bot.abilities = { ...JAVA_DEFAULTS }
  /** lowest rank first */
  let layers: readonly Layer[] = []
  /** start_game's unique id of the player, which update_abilities names */
  let uniqueId: bigint | undefined
  /** the game mode, which the abilities follow without the game plugin */
  const player = new PlayerGameMode()
  let gameMode: GameMode | undefined

  /** the layers' abilities, with `abilities` on each abilities packet (`told`), as Java's, and when they change */
  function setLayers (next: readonly Layer[], told: boolean): void {
    layers = [...next].sort((a, b) => a.rank - b.rank)
    const abilities = layers.reduce<Abilities>((below, layer) => ({ ...below, ...layer.abilities }), { ...JAVA_DEFAULTS })
    if (!told && isDeepStrictEqual(abilities, bot.abilities)) return
    bot.abilities = abilities
    bot._core.emit(bot, 'abilities', bot.abilities)
  }

  function setBase (flags: Partial<Flags>, told: boolean): void {
    const base = layers.find(layer => layer.rank === BASE_RANK)
    const others = layers.filter(layer => layer !== base)
    setLayers([...others, { rank: BASE_RANK, abilities: { ...base?.abilities, ...flags } }], told)
  }

  function followGameMode (): void {
    if (player.gameMode === gameMode) return
    gameMode = player.gameMode
    const flying = layers.find(layer => layer.rank === BASE_RANK)?.abilities.flying ?? false
    setBase(gameModeFlags(gameMode, flying), false)
  }

  bot._core.observe(OWNER, 'start_game', packet => {
    uniqueId = packet.entity_id
    player.start(packet)
    followGameMode()
  })
  bot._core.observe(OWNER, 'set_player_game_type', packet => {
    player.set(packet.gamemode)
    followGameMode()
  })
  bot._core.observe(OWNER, 'update_player_game_type', packet => {
    player.update(packet)
    followGameMode()
  })
  bot._core.observe(OWNER, 'set_default_game_type', packet => {
    player.setWorld(packet.gamemode)
    followGameMode()
  })

  bot._core.handle(OWNER, 'update_abilities', packet => {
    // the server tells each player the other players' too
    if (packet.entity_unique_id.valueOf() === uniqueId) setLayers(packet.abilities.map(layerOf), true)
  })

  bot._core.handle(OWNER, 'adventure_settings', ({ flags }) => {
    setBase({ mayFly: flags.allow_flight, flying: flags.flying }, true)
  })
}
