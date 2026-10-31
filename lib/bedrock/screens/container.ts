import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import type { ContainerName, SlotRef, Stack } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout, ScreenOpening, WindowTypeName } from '../modules/screens.ts'

/** what a container block's screen is shown as: its Java window, and the container its slots name in a request */
interface Kind {
  readonly windowType: string
  readonly title: string
  readonly container: ContainerName
}

// prismarine-windows' Bedrock table (Java's before 1.14) has the chest (a trapped chest's too), the shulker box and the
// generic container (an ender chest's); Java 1.14's the barrel
const CHEST: Kind = Object.freeze({ windowType: 'minecraft:chest', title: 'Chest', container: 'container' })
const SHULKER_BOX: Kind = Object.freeze({ windowType: 'minecraft:shulker_box', title: 'Shulker Box', container: 'shulker' })
const OTHER: Kind = Object.freeze({ windowType: 'minecraft:container', title: 'Container', container: 'container' })
const KINDS: Readonly<Record<string, Kind>> = Object.freeze({
  chest: CHEST,
  trapped_chest: CHEST,
  ender_chest: Object.freeze({ ...OTHER, title: 'Ender Chest' }),
  barrel: Object.freeze({ windowType: 'minecraft:generic_9x3', title: 'Barrel', container: 'barrel' })
})
/** the entities with a container, by their Bedrock names: the titles of their screens, a chest's or a hopper's */
const ENTITY_TITLES: Readonly<Record<string, string>> = Object.freeze({
  chest_minecart: 'Minecart with Chest',
  chest_boat: 'Boat with Chest',
  hopper_minecart: 'Minecart with Hopper'
})
const SMALL = 27
// two chests side by side
const LARGE = 54

/** the name of the entity of a runtime id, if the bot has it: a block's screen names -1 */
export type EntityNameOf = (runtimeId: bigint) => string | undefined

function entityTitle (runtimeId: bigint, nameOf: EntityNameOf): string | undefined {
  return ENTITY_TITLES[nameOf(runtimeId) ?? '']
}

function kindOf (block: Block | null): Kind {
  if (block === null) return OTHER
  // undyed_shulker_box, and from 1.20.50 one name a colour
  if (block.name.endsWith('shulker_box')) return SHULKER_BOX
  return KINDS[block.name] ?? OTHER
}

function slotsOf (container: ContainerName, size: number): readonly SlotRef[] {
  return Object.freeze(Array.from({ length: size }, (_, slot) => Object.freeze({ container, slot })))
}

/** a shift click moves a stack of the hotbar or the inventory into the container, as Java's does (not recorded), and one of the container to either (recorded) */
function shiftTargets (from: SlotRef, _stack: Stack, { slots }: ScreenLayout): readonly SlotRef[] | undefined {
  return from.container === 'hotbar' || from.container === 'inventory' ? slots : undefined
}

/**
 * a container screen of `size` slots named `container` in requests, its items in its own window, the cursor handed back,
 * shown at its content; titled by the entity it names, if `nameOf` is given
 */
export function fixedContainerScreen (type: WindowTypeName, windowType: string, title: string, size: number, nameOf?: EntityNameOf): ScreenDefinition {
  const layout: ScreenLayout = Object.freeze({ windowType, title, slots: slotsOf('container', size), craftingResultSlot: -1 })
  return Object.freeze({
    type,
    containers: Object.freeze({ container: 'open' }),
    shown: 'content',
    layout: ({ entity }: ScreenOpening) => {
      const titled = nameOf === undefined ? undefined : entityTitle(entity, nameOf)
      return titled === undefined ? layout : { ...layout, title: titled }
    },
    animation: 'workbench',
    handBack: Object.freeze([CURSOR]),
    shiftTargets
  })
}

/**
 * The screen container_open's `container` opens: a chest's, a trapped chest's, an ender chest's, a barrel's or a shulker
 * box's, by the block at its coordinates, which names its slots `barrel` and `shulker` for the last two; a chest minecart's
 * or a chest boat's, a chest's titled by the entity it names. Sized by its content (a chest beside another sends 54
 * slots), else 27, as the vanilla client shows one a server sends none for.
 */
export function containerScreen (type: WindowTypeName, blockAt: (point: Vec3) => Block | null, nameOf: EntityNameOf): ScreenDefinition {
  const definition: ScreenDefinition = {
    type,
    containers: Object.freeze({ container: 'open', barrel: 'open', shulker: 'open' }),
    shown: 'content',
    layout: ({ position: { x, y, z }, entity }, size = SMALL) => {
      const entityTitled = entityTitle(entity, nameOf)
      const { windowType, title, container } = entityTitled === undefined ? kindOf(blockAt(new Vec3(x, y, z))) : { ...CHEST, title: entityTitled }
      return { windowType, title: size === LARGE ? 'Large Chest' : title, slots: slotsOf(container, size), craftingResultSlot: -1 }
    },
    animation: 'workbench',
    handBack: Object.freeze([CURSOR]),
    shiftTargets
  }
  return Object.freeze(definition)
}
