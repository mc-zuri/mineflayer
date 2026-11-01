import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { sameItem, stackAction } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, RecipeBook } from '../modules/recipes.ts'
import type { CraftingRecipe, Ingredient } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import { CARTOGRAPHY_ADDITIONAL, CARTOGRAPHY_INPUT, CARTOGRAPHY_SCREEN } from '../screens/cartography.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'cartography'
const BLOCK = 'cartography_table'
const SLOTS: readonly SlotRef[] = Object.freeze([CARTOGRAPHY_INPUT, CARTOGRAPHY_ADDITIONAL])
const SHIFT = 1
const HOTBAR_KEY = 2

/** The cartography table: its screen, and what a click on its output makes of crafting_data's recipes of the table. */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  const book = new RecipeBook(ingredients, version)

  core.observe(OWNER, 'crafting_data', packet => { book.receive(packet) })
  inventory.screens.add(CARTOGRAPHY_SCREEN, { output: async (ctx, click) => { await outputClick(ctx, click) } })

  function holds (ingredient: Ingredient | undefined, stack: Stack | undefined): boolean {
    if (ingredient === undefined) return stack === undefined
    return stack !== undefined && stack.count >= ingredient.count && ingredients.matches(ingredient, stack)
  }

  /** the recipe whose ingredients the slots hold in its order, the input its first, the addition its second or none, as recorded */
  function recipeFor (stackAt: (ref: SlotRef) => Stack | undefined): CraftingRecipe | undefined {
    return book.all().find(({ recipe, cells }) => recipe.block === BLOCK && SLOTS.every((ref, index) => holds(cells[index], stackAt(ref))))
  }

  /** a mouse button takes the result to the cursor, a hotbar key to its slot, unless what it holds blocks it; a shift click moves it to the inventory (as recorded on 1.26.51) */
  async function outputClick (ctx: FrameContext, click: WindowClick): Promise<void> {
    const draft = inventory.draft()
    const found = recipeFor(ref => draft.stackAt(ref))
    if (found === undefined) return
    const { recipe, cells, result } = found
    const to: SlotRef = click.mode === HOTBAR_KEY ? { container: 'hotbar', slot: click.mouseButton } : CURSOR
    const held = draft.stackAt(to)
    const takes = held === undefined || (sameItem(held, result) && held.count + result.count <= draft.stackSize(held))
    const moved: Move[] = click.mode === SHIFT
      ? placesFor(result, HOTBAR_AND_INVENTORY, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
      : takes ? [{ type: 'take', count: result.count, from: OUTPUT, to }] : []
    if (moved.length === 0) return
    const consumed: Move[] = SLOTS.flatMap((from, index) => {
      const cell = cells[index]
      return cell === undefined ? [] : [{ type: 'consume', count: cell.count, from }]
    })
    // the optional action's text is the request's first name: '' renames nothing
    await inventory.request(core, ctx, [
      { type: 'action', action: stackAction(version, 'optional', { recipe_network_id: recipe.networkId, filtered_string_index: 0 }), output: result },
      ...consumed,
      ...moved
    ], { customNames: [''], cause: 'cartography_text' })
  }
}
