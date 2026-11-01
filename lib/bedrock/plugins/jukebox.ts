import type { Block } from 'prismarine-block'
import prismarineItem from 'prismarine-item'
import type { Item } from 'prismarine-item'
import type { Vec3f } from '../modules/auth_input.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'jukebox'
const NAMESPACE = 'minecraft:'
/** the items a jukebox takes, by name: a disc fragment is none */
const DISC = /^music_disc_/
// as openBlock waits for the screen
const TOLD_TICKS = 100

function keyOf ({ x, y, z }: Vec3f): string {
  return `${x},${y},${z}`
}

/** A jukebox's disc (Java has no jukebox helper): put in by a use holding it, taken out by another use, as the vanilla client does; the disc read from the block entity. */
export default function jukebox (bot: BedrockBotInternal): void {
  const core = bot._core
  const ItemClass = prismarineItem(bot.registry)
  /** the disc of each jukebox the server told holds one */
  const records = new Map<string, Item>()

  function recordAt (position: Vec3f): Item | null {
    return records.get(keyOf(position)) ?? null
  }

  function isJukebox (member: string, block: Block): void {
    if (block.name !== 'jukebox') throw new Error(`${member}: ${block.name} is not a jukebox`)
  }

  // only a jukebox's block entity has a record
  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const record = value['RecordItem']
    const name = record?.type === 'compound' ? record.value['Name']?.value : undefined
    const item = typeof name === 'string' ? name.replace(NAMESPACE, '') : undefined
    const id = item !== undefined && DISC.test(item) ? bot.registry.itemsByName[item]?.id : undefined
    // a jukebox holds one disc
    if (id === undefined) records.delete(keyOf(position))
    else records.set(keyOf(position), new ItemClass(id, 1))
  })

  /** the vanilla client's use of the jukebox holding a disc: resolves once the server told the jukebox plays it */
  async function playDisc (block: Block, disc: Item | undefined): Promise<void> {
    isJukebox('playDisc', block)
    if (recordAt(block.position) !== null) throw new Error('playDisc: the jukebox holds a disc')
    const held = (disc ?? bot.heldItem)?.name
    if (held === undefined || !DISC.test(held)) throw new Error(`playDisc needs a music disc in the hand, not ${held ?? 'nothing'}`)
    if (disc !== undefined) await bot.equip(disc, 'hand')
    await bot.activateBlock(block)
    await core.waits.until(() => recordAt(block.position) !== null, TOLD_TICKS, `the server put no disc in the jukebox in ${TOLD_TICKS} ticks`)
  }

  /** the vanilla client's use of a jukebox holding a disc, which the server drops as an item: resolves once it told the jukebox holds none */
  async function takeDisc (block: Block): Promise<void> {
    isJukebox('takeDisc', block)
    if (recordAt(block.position) === null) throw new Error('takeDisc: the jukebox holds no disc')
    await bot.activateBlock(block)
    await core.waits.until(() => recordAt(block.position) === null, TOLD_TICKS, `the server took no disc out of the jukebox in ${TOLD_TICKS} ticks`)
  }

  // a jukebox the server told no disc of takes one
  bot._blockUse.addTaker('jukebox', ({ position }, item) => DISC.test(item) && recordAt(position) === null)
  bot.bedrock = {
    ...bot.bedrock,
    jukeboxDisc: block => {
      isJukebox('jukeboxDisc', block)
      return recordAt(block.position)
    },
    playDisc: async (block, disc) => { await playDisc(block, disc ?? undefined) },
    takeDisc: async block => { await takeDisc(block) }
  }
}
