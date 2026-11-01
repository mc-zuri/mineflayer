import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import { Vec3 } from 'vec3'
import { placesBlock } from '../modules/block_use.ts'
import type { BlockClick } from '../modules/block_use.ts'
import { sameKind } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { PlaceOptions } from '../../types/internal.ts'

const HOTBAR_START = 36
// Java waits 5 s
const ANSWER_TICKS = 100
/** items that place a block of another name, or plant one (nether wart): not recorded, where the block goes and what the vanilla client predicts */
const OTHER_NAMED: readonly string[] = Object.freeze([
  'redstone', 'string', 'repeater', 'comparator', 'sugar_cane', 'wheat_seeds', 'pumpkin_seeds', 'melon_seeds', 'beetroot_seeds', 'torchflower_seeds',
  'pitcher_pod', 'cocoa_beans', 'sweet_berries', 'glow_berries', 'carrot', 'potato', 'nether_wart',
  'banner', 'powder_snow_bucket', 'water_bucket', 'lava_bucket', 'cod_bucket', 'salmon_bucket', 'pufferfish_bucket', 'tropical_fish_bucket',
  'axolotl_bucket', 'tadpole_bucket'
])

/** a placement the server has not answered */
interface Placement {
  readonly dest: Vec3
  /** the hotbar slot and the stack the click took an item from, which the server gives back to refuse it */
  given: { readonly slot: SlotRef, readonly stack: Stack } | undefined
  /** whether the server's update of the destination put another type of block there */
  placed: boolean | undefined
}

/** Java's: the face's centre, a side face's upper or lower quarter by `half`, or `delta`; none where the pick's point serves */
function cursorOf (face: Vec3, { half, delta }: PlaceOptions): Vec3 | undefined {
  if (delta !== undefined) return delta
  if (half === undefined || face.y !== 0) return undefined
  return new Vec3(0.5 + face.x * 0.5, half === 'top' ? 0.75 : 0.25, 0.5 + face.z * 0.5)
}

/** Java's placeBlock, as the vanilla client's build: the use key pressed with the crosshair on the reference block's face, holding a block's item */
export default function place (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const pending = new Set<Placement>()

  // after blockUpdate: Bedrock servers answer a placement by an update of its destination alone
  bot.world.on('blockUpdate', (oldBlock: Block, newBlock: Block) => {
    const placed = newBlock.type !== oldBlock.type
    const answered = [...pending].filter(({ dest }) => dest.equals(newBlock.position))
    for (const placement of answered) {
      placement.placed = placed
      pending.delete(placement)
    }
    if (placed && answered.length > 0) core.emit(bot, 'blockPlaced', oldBlock, newBlock)
  })

  /** Java's checks: the main hand's item */
  function heldFor (member: string, { offhand }: PlaceOptions): Item {
    if (offhand === true) throw new Error(`${member}: placing from the off-hand is not supported on Bedrock: the vanilla client places what the main hand holds`)
    const held = bot.heldItem
    if (held === null) throw new Error('must be holding an item to place')
    return held
  }

  /** the press, as activateBlock's but a build: resolves with the reference block's position, as Java's, once the use ended */
  async function build (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions, clicked?: (click: BlockClick) => void): Promise<Vec3> {
    await bot._blockUse.use(core, referenceBlock, { direction: faceVector, cursorPos: cursorOf(faceVector, options), kind: 'build', look: options.forceLook !== 'ignore', clicked })
    return referenceBlock.position
  }

  /** the server gives a refused item back: the slot shows the stack the click took an item from again */
  function givenBack ({ given }: Placement): boolean {
    if (given === undefined) return false
    const shown = inventory.stackAt(given.slot)
    return shown !== undefined && sameKind(shown, given.stack) && shown.count === given.stack.count
  }

  async function placeBlockWithOptions (member: string, referenceBlock: Block, faceVector: Vec3, options: PlaceOptions): Promise<void> {
    const { name } = heldFor(member, options)
    const dest = referenceBlock.position.plus(faceVector)
    const refused = (block: Block | null): Error => new Error(`Server refused to place ${name} at ${dest.toString()}: the block is still ${block?.name ?? 'not loaded'}`)
    if (OTHER_NAMED.includes(name)) throw new Error(`${member}: ${name} places a block of another name, which is not supported on Bedrock yet`)
    // the vanilla client predicts an item that places no block fails, and sends no build
    if (!placesBlock(bot.registry, name)) throw refused(bot.blockAt(dest))
    const placement: Placement = { dest, given: undefined, placed: undefined }
    const answered = core.waits.until(() => placement.placed !== undefined || givenBack(placement), ANSWER_TICKS, `Server did not answer the placement at ${dest.toString()} in ${ANSWER_TICKS} ticks`)
    try {
      await Promise.all([build(referenceBlock, faceVector, options, ({ held, after, hotbarSlot }) => {
        placement.given = held === undefined || after === held ? undefined : { slot: inventory.inventoryRef(HOTBAR_START + hotbarSlot), stack: held }
        pending.add(placement)
      }), answered])
    } finally {
      pending.delete(placement)
    }
    if (placement.placed !== true) throw refused(bot.blockAt(dest))
  }

  bot._genericPlace = async (referenceBlock, faceVector, options) => {
    heldFor('_genericPlace', options)
    return await build(referenceBlock, faceVector, options)
  }
  bot._placeBlockWithOptions = async (referenceBlock, faceVector, options) => { await placeBlockWithOptions('_placeBlockWithOptions', referenceBlock, faceVector, options) }
  bot.placeBlock = async (referenceBlock, faceVector) => { await placeBlockWithOptions('placeBlock', referenceBlock, faceVector, { swingArm: 'right' }) }
}
