import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { blockKey } from '../block_entity.ts'
import type { BlockEntity } from '../block_entity.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'block_actions'

/** the other half a chest's block entity pairs it with, at its height: null for a single chest or another block */
function pairOf (entity: BlockEntity | undefined, y: number): Vec3 | null {
  const x = entity?.['pairx']
  const z = entity?.['pairz']
  return x?.type === 'int' && z?.type === 'int' ? new Vec3(x.value, y, z.value) : null
}

/** Java's block actions, from what Bedrock's servers tell of moving blocks: a lid's block_event. */
export default function blockActions (bot: BedrockBotInternal): void {
  const core = bot._core
  /** the number of players with each lid open, while above 0, by its lid's key */
  const openCounts = new Map<string, number>()
  /** each chest's other half as block_entity_data told it last: null for none */
  const toldPairs = new Map<string, Vec3 | null>()

  function pairAt (block: Block): Vec3 | null {
    const told = toldPairs.get(blockKey(block.position))
    // else the block entity the server sent with the block's section
    return told !== undefined ? told : pairOf(block.entity?.value, block.position.y)
  }

  /** a double chest's two halves share one lid: its lesser half's key */
  function lidKey (position: Vec3, pair: Vec3 | null): string {
    const key = blockKey(position)
    const other = pair === null ? key : blockKey(pair)
    return other < key ? other : key
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    toldPairs.set(blockKey(position), pairOf(value, position.y))
  })

  core.handle(OWNER, 'block_event', ({ position: { x, y, z }, type, data }) => {
    if (type !== 'change_state') return
    const block = bot.blockAt(new Vec3(x, y, z))
    if (block === null) return
    const pair = pairAt(block)
    const key = lidKey(block.position, pair)
    // a double chest's halves may both tell the same count
    if ((openCounts.get(key) ?? 0) === data) return
    if (data > 0) openCounts.set(key, data)
    else openCounts.delete(key)
    core.emit(bot, 'chestLidMove', block, data, pair === null ? null : bot.blockAt(pair))
  })

  // the server tells no close of a lid that is gone, as Java's
  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (oldBlock?.name === newBlock.name) return
    openCounts.delete(lidKey(newBlock.position, pairAt(newBlock)))
    toldPairs.set(blockKey(newBlock.position), null)
  })
}
