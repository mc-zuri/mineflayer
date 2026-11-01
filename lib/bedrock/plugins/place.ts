import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import { Vec3 } from 'vec3'
import { addedEntity, addedPainting } from '../entity_packets.ts'
import { placesBlock } from '../modules/block_use.ts'
import type { BlockClick } from '../modules/block_use.ts'
import { sameKind } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { PlaceOptions } from '../../types/internal.ts'

const OWNER = 'place'
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
/** Java's placeEntity fails alike whether the server refused it or spawned nothing */
const NO_ENTITY = 'Failed to place entity'
const BOATS: readonly string[] = Object.freeze(['boat', 'chest_boat'])
const WATER: readonly string[] = Object.freeze(['water', 'flowing_water'])
/** the entities Bedrock names as their items (Java places only the armor stand of them) */
const SAME_NAMED: readonly string[] = Object.freeze(['armor_stand', 'painting', 'minecart', 'chest_minecart', 'hopper_minecart', 'tnt_minecart', 'command_block_minecart'])
/** the mobs whose entities Bedrock names apart from their spawn eggs */
const EGG_MOBS: Readonly<Record<string, string>> = Object.freeze({ evoker: 'evocation_illager', tropical_fish: 'tropicalfish', villager: 'villager_v2', zombie_villager: 'zombie_villager_v2' })

/** the hotbar slot and the stack a build took an item from, which the server gives back to refuse it */
interface Given {
  readonly slot: SlotRef
  readonly stack: Stack
}

/** a placement the server has not answered */
interface Placement {
  readonly dest: Vec3
  given: Given | undefined
  /** whether the server's update of the destination put another type of block there */
  placed: boolean | undefined
}

/** an entity's placement the server has not answered: the entity it spawns, by name, within Java's distance of the destination's corner */
interface EntityPlacement {
  readonly name: string
  readonly dest: Vec3
  readonly maxDistance: number
  given: Given | undefined
  entity: Entity | undefined
}

/** Java's: the face's centre, a side face's upper or lower quarter by `half`, or `delta`; none where the pick's point serves */
function cursorOf (face: Vec3, { half, delta }: PlaceOptions): Vec3 | undefined {
  if (delta !== undefined) return delta
  if (half === undefined || face.y !== 0) return undefined
  return new Vec3(0.5 + face.x * 0.5, half === 'top' ? 0.75 : 0.25, 0.5 + face.z * 0.5)
}

/** the entity an item places, by name: Java's (end crystals, boats, spawn eggs, armor stands), and Bedrock's chest boats, rafts, minecarts and paintings */
function entityOf (member: string, item: string): string {
  if (item === 'spawn_egg') throw new Error(`${member}: spawn_egg without a mob name is not supported on Bedrock`)
  const mob = /^(.+)_spawn_egg$/.exec(item)?.[1]
  if (mob !== undefined) return EGG_MOBS[mob] ?? mob
  if (/(^|_)chest_(boat|raft)$/.test(item)) return 'chest_boat'
  if (/(^|_)(boat|raft)$/.test(item)) return 'boat'
  if (item === 'end_crystal') return 'ender_crystal'
  assert.ok(SAME_NAMED.includes(item), 'Unimplemented')
  return item
}

/** Java's: how far from the destination's corner the entity may spawn */
function maxDistanceOf (entity: string): number {
  if (entity === 'bat') return 4
  return BOATS.includes(entity) ? 3 : 2
}

/** Java's placeBlock and placeEntity, as the vanilla client's build: the use key pressed with the crosshair on the reference block's face, holding a block's or an entity's item */
export default function place (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const pending = new Set<Placement>()
  const spawning = new Set<EntityPlacement>()

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

  /** after the entity's entitySpawn: the first placement waiting for it */
  function spawned (key: number): void {
    if (spawning.size === 0) return
    const entity = bot.entities[key]
    assert.ok(entity !== undefined, `the entity ${key} spawned is not in bot.entities`)
    const placement = [...spawning].find(({ name, dest, maxDistance }) => entity.name === name && entity.position.distanceTo(dest) < maxDistance)
    if (placement === undefined) return
    placement.entity = entity
    spawning.delete(placement)
    core.emit(bot, 'entityPlaced', entity)
  }
  core.observe(OWNER, 'add_entity', packet => { spawned(addedEntity(packet).key) })
  core.observe(OWNER, 'add_painting', packet => { spawned(addedPainting(packet).key) })

  /** Java's checks: the main hand's item */
  function heldFor (member: string, { offhand }: PlaceOptions, missing = 'must be holding an item to place'): Item {
    if (offhand === true) throw new Error(`${member}: placing from the off-hand is not supported on Bedrock: the vanilla client places what the main hand holds`)
    const held = bot.heldItem
    if (held === null) throw new Error(missing)
    return held
  }

  /** the press, as activateBlock's but a build: resolves with the reference block's position, as Java's, once the use ended */
  async function build (referenceBlock: Block, faceVector: Vec3, options: PlaceOptions, clicked?: (click: BlockClick) => void): Promise<Vec3> {
    await bot._blockUse.use(core, referenceBlock, { direction: faceVector, cursorPos: cursorOf(faceVector, options), kind: 'build', look: options.forceLook !== 'ignore', clicked })
    return referenceBlock.position
  }

  function givenOf ({ held, after, hotbarSlot }: BlockClick): Given | undefined {
    return held === undefined || after === held ? undefined : { slot: inventory.inventoryRef(HOTBAR_START + hotbarSlot), stack: held }
  }

  /** the server gives a refused item back: the slot shows the stack the click took an item from again */
  function givenBack ({ given }: { given: Given | undefined }): boolean {
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
      await Promise.all([build(referenceBlock, faceVector, options, click => {
        placement.given = givenOf(click)
        pending.add(placement)
      }), answered])
    } finally {
      pending.delete(placement)
    }
    if (placement.placed !== true) throw refused(bot.blockAt(dest))
  }

  async function placeEntityWithOptions (member: string, referenceBlock: Block, faceVector: Vec3, options: PlaceOptions): Promise<Entity> {
    const name = entityOf(member, heldFor(member, options, 'must be holding an item to place an entity').name)
    // the vanilla client's pick does not meet water: its press there is not recorded
    if (BOATS.includes(name) && WATER.includes(referenceBlock.name)) throw new Error(`${member}: a boat on water is not supported on Bedrock yet`)
    const placement: EntityPlacement = { name, dest: referenceBlock.position.plus(faceVector), maxDistance: maxDistanceOf(name), given: undefined, entity: undefined }
    const answered = core.waits.until(() => placement.entity !== undefined || givenBack(placement), ANSWER_TICKS, NO_ENTITY)
    try {
      await Promise.all([build(referenceBlock, faceVector, options, click => {
        placement.given = givenOf(click)
        spawning.add(placement)
      }), answered])
    } finally {
      spawning.delete(placement)
    }
    if (placement.entity === undefined) throw new Error(NO_ENTITY)
    return placement.entity
  }

  bot._genericPlace = async (referenceBlock, faceVector, options) => {
    heldFor('_genericPlace', options)
    return await build(referenceBlock, faceVector, options)
  }
  bot._placeBlockWithOptions = async (referenceBlock, faceVector, options) => { await placeBlockWithOptions('_placeBlockWithOptions', referenceBlock, faceVector, options) }
  bot.placeBlock = async (referenceBlock, faceVector) => { await placeBlockWithOptions('placeBlock', referenceBlock, faceVector, { swingArm: 'right' }) }
  bot._placeEntityWithOptions = async (referenceBlock, faceVector, options) => await placeEntityWithOptions('_placeEntityWithOptions', referenceBlock, faceVector, options)
  bot.placeEntity = async (referenceBlock, faceVector) => await placeEntityWithOptions('placeEntity', referenceBlock, faceVector, {})
}
