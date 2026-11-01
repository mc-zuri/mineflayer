import { Vec3 } from 'vec3'
import type { EntityAttribute } from 'prismarine-entity'
import type { NetworkWorld } from '../modules/world.ts'
import type { Difficulty } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// Java's explosion damages (https://minecraft.wiki/w/Explosion), over the blocks bot.blockAt shows. Bedrock servers
// send no armor attribute, so where Java reduces the damages by the armor the bot gives Java's null for an entity
// without one.

const DAMAGE_MULTIPLIER = 7
const ARMOR = 'generic.armor'
const ARMOR_TOUGHNESS = 'generic.armorToughness'
const DIFFICULTY_VALUES: Readonly<Record<Difficulty, number>> = Object.freeze({ peaceful: 0, easy: 1, normal: 2, hard: 3 })

/** Java's: the share of a player's 0.6 × 1.8 box at `feet` whose samples the explosion's rays reach without a block */
function exposureOf (world: NetworkWorld, feet: Vec3, explosion: Vec3): number {
  const dx = 1 / (0.6 * 2 + 1)
  const dy = 1 / (1.8 * 2 + 1)
  const dz = 1 / (0.6 * 2 + 1)
  const d3 = (1 - Math.floor(1 / dx) * dx) / 2
  const d4 = (1 - Math.floor(1 / dz) * dz) / 2
  let sampled = 0
  let exposed = 0
  const pos = new Vec3(0, 0, 0)
  for (pos.y = feet.y; pos.y <= feet.y + 1.8; pos.y += 1.8 * dy) {
    for (pos.x = feet.x - 0.3 + d3; pos.x <= feet.x + 0.3; pos.x += 0.6 * dx) {
      for (pos.z = feet.z - 0.3 + d4; pos.z <= feet.z + 0.3; pos.z += 0.6 * dz) {
        const dir = pos.minus(explosion)
        const range = dir.norm()
        if (world.raycast(explosion, dir.normalize(), range) === null) exposed++
        sampled++
      }
    }
  }
  return exposed / sampled
}

/** Java's: https://minecraft.wiki/w/Armor#Damage_protection */
function afterArmor (damages: number, armor: number, toughness: number): number {
  const var3 = 2 + toughness / 4
  const var4 = Math.min(Math.max(armor - damages / var3, armor * 0.2), 20)
  return damages * (1 - var4 / 25)
}

/** Java's: the value with the modifiers that add, then those that multiply the base, then the total (https://minecraft.wiki/w/Attribute#Operations) */
function attributeValue ({ value, modifiers }: EntityAttribute): number {
  let x = value
  for (const modifier of modifiers) if (modifier.operation === 0) x += modifier.amount
  let y = x
  for (const modifier of modifiers) if (modifier.operation === 1) y += x * modifier.amount
  for (const modifier of modifiers) if (modifier.operation === 2) y += y * modifier.amount
  return y
}

export default function inject (bot: BedrockBotInternal): void {
  bot.getExplosionDamages = (targetEntity, sourcePos, power, rawDamages = false) => {
    const distance = targetEntity.position.distanceTo(sourcePos)
    const radius = 2 * power
    if (distance >= radius) return 0
    const exposure = exposureOf(bot._world, targetEntity.position, sourcePos)
    const impact = (1 - distance / radius) * exposure
    const damages = Math.floor((impact * impact + impact) * DAMAGE_MULTIPLIER * power + 1)
    if (rawDamages) return damages
    const attributes = targetEntity.attributes ?? {}
    const armor = attributes[ARMOR]
    if (armor === undefined) return null
    // Java's throws without a toughness: none is no toughness
    const toughness = attributes[ARMOR_TOUGHNESS]
    const absorbed = afterArmor(damages, attributeValue(armor), toughness === undefined ? 0 : attributeValue(toughness))
    return Math.floor(targetEntity.type === 'player' ? absorbed * DIFFICULTY_VALUES[bot.game.difficulty] * 0.5 : absorbed)
  }
}
