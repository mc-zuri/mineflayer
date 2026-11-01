import { createHash } from 'crypto'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { sameItem, stackAction, withCount } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, nbtOf, RecipeBook } from '../modules/recipes.ts'
import type { Ingredient } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import { CARTOGRAPHY_ADDITIONAL, CARTOGRAPHY_INPUT, CARTOGRAPHY_SCREEN } from '../screens/cartography.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'cartography'
const BLOCK = 'cartography_table'
const SLOTS: readonly SlotRef[] = Object.freeze([CARTOGRAPHY_INPUT, CARTOGRAPHY_ADDITIONAL])
const SHIFT = 1
const HOTBAR_KEY = 2
/** crafting_data's multi recipe the vanilla client locks a map by, as the codec reads its uuid */
const MAP_LOCKING = '5343c1ca-e434-2260-4b02-70ffebb1b78b'

/** what a click on the output makes: by a recipe's network id, of each slot's count, the result */
interface TableCraft {
  readonly networkId: number
  readonly consumed: ReadonlyArray<number | undefined>
  readonly result: Stack
}

type StackAt = (ref: SlotRef) => Stack | undefined

/** the map's id, which its item names in map_uuid */
function mapIdOf (stack: Stack): bigint | undefined {
  const uuid = nbtOf(stack)['map_uuid']
  if (uuid?.type !== 'long') return undefined
  const { value } = uuid
  // up to 1.16.210 an item's NBT is the network NBT, whose long the codec reads as a bigint, which prismarine-nbt's typings do not give
  if (typeof value === 'bigint') return value
  const [high, low] = value
  return (BigInt(high) << 32n) | BigInt(low >>> 0)
}

/**
 * The n-th locked copy's id for the screen's preview: random-looking as the vanilla client's (below 2^31, a new one per
 * copy), but from the username, the map and n.
 */
function previewMapId (username: string, map: bigint, n: number): bigint {
  return BigInt(createHash('sha256').update(`${username}\n${map}\n${n}`).digest().readUInt32BE(0) >>> 1)
}

/** The cartography table: its screen, and what a click on its output makes of crafting_data's recipes of the table and of a map locked. */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  const book = new RecipeBook(ingredients, version)
  // the protocol data of 1.16.201 and 1.16.210 give map_create_locked_copy no fields
  const previews = isBedrockVersionAtLeast(version, 'bedrock_1.16.220')
  // the map of the locked copy the screen previews
  let previewed: bigint | undefined
  let copies = 0

  core.observe(OWNER, 'crafting_data', packet => { book.receive(packet) })
  inventory.screens.add(CARTOGRAPHY_SCREEN, {
    output: async (ctx, click) => { await outputClick(ctx, click) },
    shown: () => { previewed = undefined },
    // the vanilla client previews the copy once a request leaves the map and a glass pane in the slots, in the click's frame
    requested: (_requestId, _moves, _screen, outbox) => {
      const map = lockableOf(ref => inventory.stackAt(ref))?.id
      if (map !== undefined && map !== previewed && previews) outbox.queue('map_create_locked_copy', { original_map_id: map, new_map_id: previewMapId(bot.username, map, ++copies) })
      previewed = map
    }
  })

  function holds (ingredient: Ingredient | undefined, stack: Stack | undefined): boolean {
    if (ingredient === undefined) return stack === undefined
    return stack !== undefined && stack.count >= ingredient.count && ingredients.matches(ingredient, stack)
  }

  /** a filled map in the input and a glass pane added, as recorded: the map and its id */
  function lockableOf (stackAt: StackAt): { map: Stack, id: bigint } | undefined {
    const [map, pane] = [stackAt(CARTOGRAPHY_INPUT), stackAt(CARTOGRAPHY_ADDITIONAL)]
    if (map === undefined || pane === undefined || ingredients.nameOf(map.networkId) !== 'filled_map' || ingredients.nameOf(pane.networkId) !== 'glass_pane') return undefined
    const id = mapIdOf(map)
    return id === undefined ? undefined : { map, id }
  }

  /** the recipe whose ingredients the slots hold in its order, the input its first, the addition its second or none, as recorded; else the map locked, its NBT the input's */
  function craftFor (stackAt: StackAt): TableCraft | undefined {
    const locking = book.multiOf(MAP_LOCKING)
    const found = book.all().find(({ recipe, cells }) => recipe.block === BLOCK && SLOTS.every((ref, index) => holds(cells[index], stackAt(ref))))
    if (found !== undefined) return { networkId: found.recipe.networkId, consumed: SLOTS.map((_, index) => found.cells[index]?.count), result: found.result }
    const lockable = lockableOf(stackAt)
    if (lockable === undefined || locking === undefined) return undefined
    return { networkId: locking.networkId, consumed: [1, 1], result: withCount(lockable.map, 1) }
  }

  /** a mouse button takes the result to the cursor, a hotbar key to its slot, unless what it holds blocks it; a shift click moves it to the inventory (as recorded on 1.26.51) */
  async function outputClick (ctx: FrameContext, click: WindowClick): Promise<void> {
    const draft = inventory.draft()
    const found = craftFor(ref => draft.stackAt(ref))
    if (found === undefined) return
    const { networkId, consumed, result } = found
    const to: SlotRef = click.mode === HOTBAR_KEY ? { container: 'hotbar', slot: click.mouseButton } : CURSOR
    const held = draft.stackAt(to)
    const takes = held === undefined || (sameItem(held, result) && held.count + result.count <= draft.stackSize(held))
    const moved: Move[] = click.mode === SHIFT
      ? placesFor(result, HOTBAR_AND_INVENTORY, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
      : takes ? [{ type: 'take', count: result.count, from: OUTPUT, to }] : []
    if (moved.length === 0) return
    const consumes: Move[] = SLOTS.flatMap((from, index) => {
      const count = consumed[index]
      return count === undefined ? [] : [{ type: 'consume', count, from }]
    })
    // the optional action's text is the request's first name: '' renames nothing
    await inventory.request(core, ctx, [
      { type: 'action', action: stackAction(version, 'optional', { recipe_network_id: networkId, filtered_string_index: 0 }), output: result },
      ...consumes,
      ...moved
    ], { customNames: [''], cause: 'cartography_text' })
  }
}
