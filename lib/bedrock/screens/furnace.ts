import type { ClickedSlots, WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { sameItem } from '../modules/items.ts'
import type { ContainerName, SlotRef, Stack } from '../modules/items.ts'
import { CURSOR } from '../modules/screens.ts'
import type { ScreenDefinition, ScreenLayout } from '../modules/screens.ts'

export const FURNACE_TYPES = Object.freeze(['furnace', 'blast_furnace', 'smoker'] as const)
export type FurnaceType = typeof FURNACE_TYPES[number]

const INGREDIENTS: Readonly<Record<FurnaceType, ContainerName>> = Object.freeze({ furnace: 'furnace_ingredient', blast_furnace: 'blast_furnace_ingredient', smoker: 'smoker_ingredient' })
const WINDOWS: Readonly<Record<FurnaceType, readonly [windowType: string, title: string]>> = Object.freeze({
  furnace: ['minecraft:furnace', 'Furnace'],
  blast_furnace: ['minecraft:blast_furnace', 'Blast Furnace'],
  smoker: ['minecraft:smoker', 'Smoker']
})
const FUEL: SlotRef = Object.freeze({ container: 'furnace_fuel', slot: 1 })
const OUTPUT: SlotRef = Object.freeze({ container: 'furnace_output', slot: 2 })

// the vanilla game's fuels, which no packet tells, by every version's item names (1.16's flattened ones too); the nether woods do not burn
const FUEL_NAMES: readonly string[] = Object.freeze([
  'coal', 'charcoal', 'coal_block', 'lava_bucket', 'blaze_rod', 'dried_kelp_block', 'stick', 'bowl', 'bamboo', 'scaffolding', 'ladder', 'deadbush',
  'mangrove_roots', 'crafting_table', 'cartography_table', 'fletching_table', 'smithing_table', 'loom', 'bookshelf', 'chiseled_bookshelf', 'lectern',
  'composter', 'barrel', 'chest', 'trapped_chest', 'noteblock', 'jukebox', 'daylight_detector', 'bow', 'crossbow', 'fishing_rod', 'wooden_sword',
  'wooden_shovel', 'wooden_pickaxe', 'wooden_axe', 'wooden_hoe', 'wooden_spear', 'banner', 'planks', 'log', 'log2', 'wood', 'wooden_slab', 'sapling',
  'wool', 'carpet', 'boat', 'chest_boat', 'fence', 'fence_gate', 'trapdoor', 'wooden_door', 'wooden_button', 'wooden_pressure_plate', 'bamboo_block',
  'stripped_bamboo_block', 'bamboo_mosaic', 'bamboo_mosaic_slab', 'bamboo_mosaic_stairs', 'bamboo_raft', 'bamboo_chest_raft'
])
const WOODS = 'oak|spruce|birch|jungle|acacia|dark_oak|mangrove|cherry|bamboo|pale_oak|poplar'
const COLOURS = 'white|orange|magenta|light_blue|yellow|lime|pink|gray|light_gray|silver|cyan|purple|blue|brown|green|red|black'
const FUEL_PATTERNS: readonly RegExp[] = Object.freeze([
  new RegExp(`^(${WOODS})_(planks|log|wood|slab|stairs|fence|fence_gate|trapdoor|door|button|pressure_plate|sign|hanging_sign|shelf|boat|chest_boat|sapling)$`),
  new RegExp(`^stripped_(${WOODS})_(log|wood)$`),
  new RegExp(`^(${COLOURS})_(wool|carpet)$`)
])

/** whether the vanilla client puts the item in a furnace's fuel slot */
export function isFuel (name: string | undefined): boolean {
  return name !== undefined && (FUEL_NAMES.includes(name) || FUEL_PATTERNS.some(pattern => pattern.test(name)))
}

/** a mouse click on a furnace's output never places into it: onto the cursor's stack of its item, all (half with the right button) that fits */
function outputClick (click: WindowClick, slots: ClickedSlots): readonly Move[] | undefined {
  const cursor = slots.stackAt(CURSOR)
  if (cursor === undefined) return undefined
  const output = slots.stackAt(OUTPUT)
  if (output === undefined || !sameItem(output, cursor)) return []
  const count = Math.min(click.mouseButton === 1 ? Math.ceil(output.count / 2) : output.count, slots.stackSize(cursor) - cursor.count)
  return count > 0 ? [{ type: 'take', count, from: OUTPUT, to: CURSOR }] : []
}

/**
 * The furnace's, the blast furnace's and the smoker's screen, of Java's 39 slots: the input, the fuel and the output in
 * the screen's own window. Only the cursor goes back at the close. `itemName` names a stack by the bot's registry.
 */
export function furnaceScreen (type: FurnaceType, itemName: (stack: Stack) => string | undefined): ScreenDefinition {
  const ingredient: SlotRef = Object.freeze({ container: INGREDIENTS[type], slot: 0 })
  const [windowType, title] = WINDOWS[type]
  const layout: ScreenLayout = Object.freeze({ windowType, title, slots: Object.freeze([ingredient, FUEL, OUTPUT]), craftingResultSlot: 2 })
  const own = new Set<string>([ingredient.container, FUEL.container, OUTPUT.container])
  return Object.freeze({
    type,
    containers: Object.freeze({ [ingredient.container]: 'open', [FUEL.container]: 'open', [OUTPUT.container]: 'open' }),
    shown: 'open',
    layout: () => layout,
    animation: 'workbench',
    handBack: Object.freeze([CURSOR]),
    // from the player's slots, a fuel to the fuel slot and anything else to the input
    shiftTargets: (from: SlotRef, stack: Stack) => from.container === 'hotbar' || from.container === 'inventory' ? [isFuel(itemName(stack)) ? FUEL : ingredient] : undefined,
    accepts: (to: SlotRef, stack: Stack, names: Pick<ClickedSlots, 'itemName'>) => to.container === FUEL.container ? isFuel(names.itemName(stack)) : undefined,
    moves: (click: WindowClick, clicked: SlotRef | undefined, slots: ClickedSlots) => {
      if (clicked === undefined || !own.has(clicked.container)) return undefined
      // hotbar keys move nothing over the furnace's slots
      if (click.mode === 2) return []
      return click.mode === 0 && clicked.container === OUTPUT.container ? outputClick(click, slots) : undefined
    }
  })
}
