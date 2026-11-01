import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import { iterators } from 'prismarine-world'
import { Vec3 } from 'vec3'
import { eyePositionOf, viewDirection } from '../entity.ts'
import { chunkCoordinate } from '../modules/world.ts'
import type { FindBlockOptions } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

/** Java's: a function as it is, else the block types named */
function matcherOf (matching: FindBlockOptions['matching']): (block: Block) => boolean {
  if (typeof matching === 'function') return matching
  const types = Array.isArray(matching) ? matching : [matching]
  return block => types.includes(block.type)
}

/** Java's world queries, over the blocks `bot.blockAt` shows: they read the world between frames, and send nothing */
export default function inject (bot: BedrockBotInternal): void {
  bot.findBlocks = options => {
    const matcher = matcherOf(options.matching)
    const point = (options.point ?? bot.entity.position).floored()
    // Java's: 0 is the default too
    const maxDistance = options.maxDistance || 16
    const count = options.count || 1
    const useExtraInfo = options.useExtraInfo ?? false
    const fullMatcher = typeof useExtraInfo === 'boolean' ? matcher : (block: Block) => matcher(block) && useExtraInfo(block)
    // the registry's block states are start_game's
    const RegistryBlock = prismarineBlock(bot.registry)
    const start = new Vec3(chunkCoordinate(point.x), chunkCoordinate(point.y), chunkCoordinate(point.z))
    const it = new iterators.OctahedronIterator(start, Math.ceil((maxDistance + 8) / 16))
    const [lowest, highest] = [bot.game.minY >> 4, (bot.game.minY + bot.game.height) >> 4]
    // the iterator gives some sections again
    const visited = new Set<string>()
    const blocks: Vec3[] = []
    let startedLayer = 0
    for (let next: Vec3 | null = start; next !== null; next = it.next()) {
      const states = next.y >= lowest && next.y < highest && !visited.has(next.toString()) ? bot._world.sectionStates(next.x, next.y, next.z) : undefined
      if (states !== undefined) {
        if (useExtraInfo === true || states.some(state => matcher(RegistryBlock.fromStateId(state, 0)))) {
          const cursor = new Vec3(0, 0, 0)
          for (cursor.x = next.x * 16; cursor.x < next.x * 16 + 16; cursor.x++) {
            for (cursor.y = next.y * 16; cursor.y < next.y * 16 + 16; cursor.y++) {
              for (cursor.z = next.z * 16; cursor.z < next.z * 16 + 16; cursor.z++) {
                if (fullMatcher(bot.world.getBlock(cursor)) && cursor.distanceTo(point) <= maxDistance) blocks.push(cursor.clone())
              }
            }
          }
        }
        visited.add(next.toString())
      }
      // the iterator's private apothem: the section's distance in sections from the start's, which is 1 for the start too
      const layer = Math.max(1, Math.abs(next.x - start.x) + Math.abs(next.y - start.y) + Math.abs(next.z - start.z))
      // a layer started is finished, as a nearer block may be in it
      if (startedLayer !== layer && blocks.length >= count) break
      startedLayer = layer
    }
    return blocks.sort((a, b) => a.distanceTo(point) - b.distanceTo(point)).slice(0, count)
  }

  bot.findBlock = options => {
    const [found] = bot.findBlocks(options)
    return found === undefined ? null : bot.blockAt(found)
  }

  bot.canSeeBlock = block => {
    const eye = eyePositionOf(bot.entity)
    // Java's: as far as the block's corner, towards its centre
    const range = eye.distanceTo(block.position)
    const direction = block.position.offset(0.5, 0.5, 0.5).minus(eye).normalize()
    const met = bot._world.raycast(eye, direction, range, (seen, ray) => ray.intersect(seen.shapes, seen.position) !== null || seen.position.equals(block.position))
    return met !== null && met.position.equals(block.position)
  }

  bot.blockAtEntityCursor = (entity = bot.entity, maxDistance = 256, matcher = null) => bot._world.raycast(eyePositionOf(entity), viewDirection(entity), maxDistance, matcher)
  bot.blockAtCursor = (maxDistance = 256, matcher = null) => bot.blockAtEntityCursor(bot.entity, maxDistance, matcher)
  bot.blockInSight = (maxSteps = 256, vectorLength = 5 / 16) => bot.blockAtCursor(maxSteps * vectorLength) ?? undefined
}
