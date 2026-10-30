import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// bot.experience, as Java's: the player's minecraft:player.level and minecraft:player.experience attributes (the bar's
// progress). Bedrock sends no total: the points are the level's, on Java's curve (which Bedrock's equals), and the
// bar's share of the next level's.

const OWNER = 'experience'
const LEVEL = 'minecraft:player.level'
const PROGRESS = 'minecraft:player.experience'

/** the points from `level` to the next */
function pointsToNextLevel (level: number): number {
  if (level >= 30) return 112 + 9 * (level - 30)
  if (level >= 15) return 37 + 5 * (level - 15)
  return 7 + 2 * level
}

/** the points that reach `level` */
function pointsAtLevel (level: number): number {
  if (level <= 16) return level * level + 6 * level
  if (level <= 31) return 2.5 * level * level - 40.5 * level + 360
  return 4.5 * level * level - 162.5 * level + 2220
}

function experiencePoints (level: number, progress: number): number {
  return pointsAtLevel(level) + Math.round(progress * pointsToNextLevel(level))
}

export default function inject (bot: BedrockBotInternal): void {
  bot.experience = { level: null, points: null, progress: null }
  /** what the server told last: a packet with one of them keeps the other */
  let level = 0
  let progress = 0

  bot._core.observe(OWNER, 'update_attributes', packet => {
    if (!bot._player.isLocalPlayer(packet.runtime_entity_id)) return
    let told = false
    for (const { name, current } of packet.attributes) {
      if (name === LEVEL) level = current
      else if (name === PROGRESS) progress = current
      else continue
      told = true
    }
    // servers send them again with the other attributes
    if (!told || (bot.experience.level === level && bot.experience.progress === progress)) return
    Object.assign(bot.experience, { level, points: experiencePoints(level, progress), progress })
    bot._core.emit(bot, 'experience')
  })
}
