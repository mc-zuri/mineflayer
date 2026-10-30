import { Vec3 } from 'vec3'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// bot.spawnPoint, as Java's: the world's spawn, where compasses point. start_game tells it, then set_spawn_position of
// the world. Its y is 32767 where the spawn has no height (the highest block there), as in the recorded worlds.

const OWNER = 'spawn_point'
/** each coordinate of a player's own spawn that is not set */
const UNSET = -2147483648

export default function inject (bot: BedrockBotInternal): void {
  bot.spawnPoint = new Vec3(0, 0, 0)
  /** the player's own spawn (a bed's) is set: Java's spawnReset is its unsetting */
  let playerSpawnSet = false

  bot._core.observe(OWNER, 'start_game', ({ spawn_position: { x, y, z } }) => {
    bot.spawnPoint = new Vec3(x, y, z)
  })

  bot._core.handle(OWNER, 'set_spawn_position', packet => {
    if (packet.spawn_type === 'world') {
      const { x, y, z } = packet.world_position
      bot.spawnPoint = new Vec3(x, y, z)
      bot._core.emit(bot, 'game')
    } else if (packet.spawn_type === 'player') {
      const { x, y, z } = packet.player_position
      const set = x !== UNSET || y !== UNSET || z !== UNSET
      if (playerSpawnSet && !set) bot._core.emit(bot, 'spawnReset')
      playerSpawnSet = set
    }
  })
}
