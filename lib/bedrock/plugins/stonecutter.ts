import type { Block } from 'prismarine-block'
import type { Window } from 'prismarine-windows'
import type { FrameContext, OutboxWriter } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { ClickedSlots, WindowClick } from '../modules/clicks.ts'
import type { Draft, Move } from '../modules/inventory.ts'
import { craftRecipeAction, resultsAction, sameItem, stackAction, withCount } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, RecipeBook, writtenResult } from '../modules/recipes.ts'
import type { CraftingRecipe, Ingredient } from '../modules/recipes.ts'
import { CURSOR, OUTPUT, PLAYER_SLOTS } from '../modules/screens.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { STONECUTTER_INPUT, STONECUTTER_SCREEN } from '../screens/stonecutter.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockRecipe, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'stonecutter'
const BLOCK = 'stonecutter'
const RESULT_SLOT = 1
const SHIFT = 1

interface StonecutterRecipe extends CraftingRecipe {
  readonly ingredient: Ingredient
}

type Slots = Pick<ClickedSlots, 'stackAt' | 'stackSize'>

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function isInput ({ container }: SlotRef): boolean {
  return container === STONECUTTER_INPUT.container
}

function roomFor (stack: Stack, refs: readonly SlotRef[], slots: Slots): number {
  return refs.reduce((room, ref) => {
    const held = slots.stackAt(ref)
    if (held === undefined) return room + slots.stackSize(stack)
    return sameItem(held, stack) ? room + slots.stackSize(held) - held.count : room
  }, 0)
}

/** the input's count before the moves, from its count after them; a swap leaves it holding a stack */
function inputBefore (after: number, moves: readonly Move[]): number {
  return moves.reduce((count, move) => {
    if (move.type === 'action' || move.type === 'swap') return count
    const taken = isInput(move.from) ? move.count : 0
    const put = 'to' in move && isInput(move.to) ? move.count : 0
    return count + taken - put
  }, after)
}

/** The stonecutter: its screen, the recipe its buttons select, and what a click on its output crafts. */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  const book = new RecipeBook(ingredients, version)
  // from 1.26.60 the vanilla client tells the server the selection: twice the button's index, and 0 twice once the input fills or empties
  const tellsSelection = atLeast(version, 'bedrock_1.26.60')
  // the stonecutter shown last, which a select needs open
  let open: OpenScreen | undefined
  let selected: StonecutterRecipe | undefined
  let resetDue = false

  core.observe(OWNER, 'crafting_data', packet => { book.receive(packet) })
  // the server answers each reset with the selection it keeps, which nothing depends on
  core.handle(OWNER, 'clientbound_stonecutter_set_recipe', () => {})

  function tellSelection (outbox: OutboxWriter, screen: OpenScreen, index: number): void {
    outbox.queue('serverbound_stonecutter_set_recipe', { container_id: screen.window.id, recipe_index: index })
  }

  function resetSelection (outbox: OutboxWriter, screen: OpenScreen): void {
    for (let told = 0; told < 2; told++) tellSelection(outbox, screen, 0)
  }

  inventory.screens.add(STONECUTTER_SCREEN, {
    output: async (ctx, click) => { await outputClick(ctx, click) },
    shown: screen => {
      open = screen
      selected = undefined
      // the screen is shown in the packet pass: the reset leaves in the input pass
      if (tellsSelection) core.command(({ outbox }) => { resetSelection(outbox, screen) })
    },
    requested: (_requestId, moves) => {
      const after = inventory.stackAt(STONECUTTER_INPUT)?.count ?? 0
      const before = inputBefore(after, moves)
      const swapped = moves.some(move => move.type === 'swap' && (isInput(move.from) || isInput(move.to)))
      if (after === 0 || swapped) selected = undefined
      if ((before === 0) !== (after === 0)) resetDue = tellsSelection
    },
    beforeSend: (outbox, screen) => {
      if (resetDue) resetSelection(outbox, screen)
      resetDue = false
    }
  })

  /** in crafting_data's order, which the vanilla client's buttons show them in */
  function cuts (): StonecutterRecipe[] {
    return book.all().flatMap(found => {
      const [ingredient] = found.cells
      return found.recipe.block === BLOCK && ingredient !== undefined ? [{ ...found, ingredient }] : []
    })
  }

  function recipeOf (recipe: BedrockRecipe): StonecutterRecipe {
    const found = cuts().find(cut => cut.recipe === recipe)
    if (found === undefined) throw new Error(`${recipe.id} is not one of the stonecutter's recipes the server sent`)
    return found
  }

  /** the vanilla client's buttons for the input: the recipes taking it */
  function buttonsFor (input: Stack): StonecutterRecipe[] {
    return cuts().filter(({ ingredient }) => ingredients.matches(ingredient, input))
  }

  function takes ({ ingredient }: StonecutterRecipe, stack: Stack | undefined): stack is Stack {
    return stack !== undefined && ingredients.matches(ingredient, stack)
  }

  function openScreen (member: string): OpenScreen {
    if (open === undefined || inventory.screenType !== BLOCK) throw new Error(`${member} needs an open stonecutter`)
    return open
  }

  /** a request's moves, the output named and moved as `destination` gives */
  function craftMoves (draft: Draft, { recipe, result, ingredient }: StonecutterRecipe, times: number, destination: (made: Stack) => Move[]): Move[] {
    const made = withCount(result, result.count * times)
    // up to 1.17.40 the request names no recipe; up to 1.18.11 it tells the result too
    const craft = atLeast(version, 'bedrock_1.18.0') ? craftRecipeAction(version, recipe.networkId, times) : stackAction(version, 'non_implemented', {})
    const told: Move[] = atLeast(version, 'bedrock_1.18.30') ? [] : [{ type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, result)], 1) }]
    const moves: Move[] = [{ type: 'action', action: craft, output: made }, ...told, { type: 'consume', count: ingredient.count * times, from: STONECUTTER_INPUT }]
    draft.apply(moves)
    const moved = destination(made)
    draft.apply(moved)
    return [...moves, ...moved]
  }

  /** a mouse button takes one craft to the cursor, a hotbar key to its slot, unless what it holds blocks it; a shift click crafts what the input allows */
  async function outputClick (ctx: FrameContext, click: WindowClick): Promise<void> {
    const draft = inventory.draft()
    const input = draft.stackAt(STONECUTTER_INPUT)
    if (selected === undefined || !takes(selected, input)) return
    const found = selected
    const { result, ingredient } = found
    const requests: Move[][] = []
    if (click.mode === SHIFT) {
      // up to 1.21.2 a craft a request; from 1.21.20 a stack's worth
      const most = atLeast(version, 'bedrock_1.21.20') ? Math.max(1, Math.floor(draft.stackSize(result) / result.count)) : 1
      for (let left = Math.floor(input.count / ingredient.count); left > 0;) {
        const times = Math.min(left, most, Math.floor(roomFor(result, HOTBAR_AND_INVENTORY, draft) / result.count))
        if (times === 0) break
        requests.push(craftMoves(draft, found, times, made => placesFor(made, HOTBAR_AND_INVENTORY, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))))
        left -= times
      }
    } else {
      const to: SlotRef = click.mode === 2 ? { container: 'hotbar', slot: click.mouseButton } : CURSOR
      const held = draft.stackAt(to)
      if (held !== undefined && (!sameItem(held, result) || held.count + result.count > draft.stackSize(held))) return
      requests.push(craftMoves(draft, found, 1, made => [{ type: 'take', count: made.count, from: OUTPUT, to }]))
    }
    const made = requests.map(async moves => { await inventory.request(core, ctx, moves) })
    // up to 1.21.2 the vanilla client's shift click takes the id of a craft after its last, which it does not send
    if (click.mode === SHIFT && !atLeast(version, 'bedrock_1.21.20')) core.requestIds.nextStackRequest()
    await Promise.all(made)
  }

  async function select (ctx: FrameContext, found: StonecutterRecipe): Promise<void> {
    const screen = openScreen('selectStonecutterRecipe')
    const input = inventory.draft().stackAt(STONECUTTER_INPUT)
    const index = input === undefined ? -1 : buttonsFor(input).findIndex(button => button.recipe === found.recipe)
    if (index < 0) throw new Error(`the stonecutter's input does not take ${found.recipe.id}`)
    selected = found
    if (tellsSelection) tellSelection(ctx.outbox, screen, 2 * index)
  }

  /** as craft's crafting table: the stonecutter open, else the one given, opened; undefined: the one open */
  async function stonecutterOf (stonecutter: Block | undefined): Promise<Window | undefined> {
    if (inventory.screenType === BLOCK) return undefined
    if (stonecutter === undefined) throw new Error('stonecut needs an open stonecutter, or one to open')
    return await bot.openBlock(stonecutter)
  }

  /** the input topped up to `needed` from the inventory, by transfers of a slot each, as the vanilla client's clicks */
  async function fill (found: StonecutterRecipe, needed: number): Promise<void> {
    const { window } = openScreen('stonecut')
    const first = window.inventoryStart
    let left = needed - (inventory.stackAt(STONECUTTER_INPUT)?.count ?? 0)
    for (const [index, ref] of PLAYER_SLOTS.entries()) {
      const stack = inventory.stackAt(ref)
      if (!takes(found, stack)) continue
      const count = Math.min(left, stack.count)
      await bot.transfer({ window, itemType: stack.networkId, metadata: stack.metadata, sourceStart: first + index, destStart: 0, count })
      left -= count
    }
  }

  async function stonecut (found: StonecutterRecipe, times: number, stonecutter: Block | undefined): Promise<void> {
    const { recipe, ingredient } = found
    const needed = ingredient.count * times
    const draft = inventory.draft()
    const sources = HOTBAR_AND_INVENTORY.map(ref => draft.stackAt(ref)).filter(stack => takes(found, stack))
    const [first] = sources
    const input = inventory.screenType === BLOCK ? draft.stackAt(STONECUTTER_INPUT) : undefined
    const held = input !== undefined && takes(found, input) ? input.count : 0
    if (input !== undefined && held === 0) throw new Error(`the stonecutter's input holds another item than ${recipe.id} takes`)
    if (held > needed) throw new Error(`the stonecutter's input holds more than ${times} crafts of ${recipe.id} take`)
    if (sources.reduce((sum, { count }) => sum + count, held) < needed) throw new Error(`the inventory has not the ingredients to cut ${recipe.id} ${times} times`)
    if (first !== undefined && needed > draft.stackSize(first)) throw new Error(`the stonecutter's input holds no more than a stack: ${recipe.id} cannot be cut ${times} times at once`)
    if (draft.stackAt(CURSOR) !== undefined) throw new Error('stonecut needs an empty cursor')
    const opened = await stonecutterOf(stonecutter)
    try {
      await fill(found, needed)
      await core.call(async ctx => { await select(ctx, found) })
      await bot.clickWindow(RESULT_SLOT, 0, SHIFT)
      if (inventory.stackAt(STONECUTTER_INPUT) !== undefined) throw new Error(`the inventory has no room for what cutting ${recipe.id} makes`)
    } catch (error) {
      if (opened !== undefined) await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    if (opened !== undefined) await bot.closeWindow(opened)
  }

  bot.bedrock = {
    ...bot.bedrock,
    // as Java's recipesAll, by the ingredient as shown: a metadata of null (or none) is any
    stonecutterRecipes: (itemType, metadata) => cuts().filter(({ ingredient }) => {
      const shown = ingredients.shown(ingredient)
      return shown.id === itemType && (metadata == null || shown.metadata === null || shown.metadata === metadata)
    }).map(({ recipe }) => recipe),
    selectStonecutterRecipe: async recipe => {
      const found = recipeOf(recipe)
      await core.call(async ctx => { await select(ctx, found) })
    },
    // Java's null count is 1, and a count of 0 cuts nothing
    stonecut: async (recipe, count, stonecutter) => {
      const found = recipeOf(recipe)
      const times = count ?? 1
      if (!Number.isInteger(times) || times < 0) throw new Error(`stonecut cuts a whole number of times, not ${times}`)
      if (times > 0) await stonecut(found, times, stonecutter ?? undefined)
    }
  }
}
