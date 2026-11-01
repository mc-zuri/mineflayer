import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { blockKey, numberOf, textOf } from '../block_entity.ts'
import type { BlockEntity } from '../block_entity.ts'
import type { Vec3f } from '../modules/auth_input.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import { isBedrockVersionAtLeast } from '../version.ts'

const OWNER = 'block_actions'

/** a piston's block entity (PistonArm) tells a move as it starts, in its NewState */
const EXTENDING = 1
const RETRACTING = 3

/** a Bedrock piston's facing_direction by Java's direction (0 down … 5 east): its sides are the reverse of other blocks' */
const PISTON_FACINGS: readonly number[] = Object.freeze([0, 1, 3, 2, 5, 4])

/** the note's sound: its type's number up to 1.16.210, minecraft-data's name of it up to 1.26.20, the server's own from 1.26.30 */
const NOTE_SOUNDS: ReadonlyArray<number | string> = Object.freeze([81, 'Note', 'note'])
/** the note sound's extra data: the instrument above the pitch's byte */
const PITCH_BITS = 8
const PITCH_MASK = 0xff
/** minecraft-data's (Java's) instrument ids by Bedrock's own up to 1.21.42: bell, flute, chime and guitar its 5 to 8; Java's order from 1.21.50 */
const BEDROCK_INSTRUMENTS: readonly number[] = Object.freeze([0, 1, 2, 3, 4, 6, 5, 8, 7])

/** the other half a chest's block entity pairs it with, at its height: null for a single chest or another block */
function pairOf (entity: BlockEntity | undefined, y: number): Vec3 | null {
  const x = entity?.['pairx']
  const z = entity?.['pairz']
  return x?.type === 'int' && z?.type === 'int' ? new Vec3(x.value, y, z.value) : null
}

/** Java's block actions, from what Bedrock's servers tell of moving blocks: a lid's block_event, a piston's block entity, a note's sound. */
export default function blockActions (bot: BedrockBotInternal): void {
  const core = bot._core
  /** the number of players with each lid open, while above 0, by its lid's key */
  const openCounts = new Map<string, number>()
  /** each chest's other half as block_entity_data told it last: null for none */
  const toldPairs = new Map<string, Vec3 | null>()
  /** each piston's NewState as block_entity_data told it last */
  const pistonStates = new Map<string, number>()
  const javaInstruments = isBedrockVersionAtLeast(bot.version, 'bedrock_1.21.50')

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

  function pistonTold (position: Vec3f, newState: number): void {
    const key = blockKey(position)
    // one event per move, however often the block entity is told
    if (pistonStates.get(key) === newState) return
    pistonStates.set(key, newState)
    if (newState !== EXTENDING && newState !== RETRACTING) return
    const block = bot.blockAt(new Vec3(position.x, position.y, position.z))
    if (block === null || (block.name !== 'piston' && block.name !== 'sticky_piston')) return
    const facing = Number(block.getProperties()['facing_direction'])
    core.emit(bot, 'pistonMove', block, newState === EXTENDING ? 0 : 1, PISTON_FACINGS.indexOf(facing))
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    toldPairs.set(blockKey(position), pairOf(value, position.y))
    if (textOf(value, 'id') === 'PistonArm') pistonTold(position, numberOf(value, 'NewState'))
  })

  core.handle(OWNER, 'block_event', ({ position: { x, y, z }, type, data }) => {
    if (type !== 'change_state') return
    const block = bot.blockAt(new Vec3(x, y, z))
    // a note's own block_event has the instrument for its type, as Java's: its sound emits noteHeard
    if (block === null || block.name === 'noteblock') return
    const pair = pairAt(block)
    const key = lidKey(block.position, pair)
    // a double chest's halves may both tell the same count
    if ((openCounts.get(key) ?? 0) === data) return
    if (data > 0) openCounts.set(key, data)
    else openCounts.delete(key)
    core.emit(bot, 'chestLidMove', block, data, pair === null ? null : bot.blockAt(pair))
  })

  // after the sound plugin's soundEffectHeard of it
  core.observe(OWNER, 'level_sound_event', ({ sound_id: sound, position, extra_data: extraData, block_id: blockId }) => {
    if (!NOTE_SOUNDS.includes(sound)) return
    const block = bot.blockAt(new Vec3(position.x, position.y, position.z))
    if (block?.name !== 'noteblock') return
    // block_id up to 1.16.210 is the extra data
    const extra = (extraData ?? blockId)!
    const told = extra >> PITCH_BITS
    const id = javaInstruments ? told : BEDROCK_INSTRUMENTS[told] ?? told
    core.emit(bot, 'noteHeard', block, bot.registry.instruments?.[id] ?? { id, name: '' }, extra & PITCH_MASK)
  })

  // the server tells no close of a lid that is gone, as Java's
  bot.on('blockUpdate', (oldBlock, newBlock) => {
    if (oldBlock?.name === newBlock.name) return
    openCounts.delete(lidKey(newBlock.position, pairAt(newBlock)))
    toldPairs.set(blockKey(newBlock.position), null)
    pistonStates.delete(blockKey(newBlock.position))
  })
}
