import type { Block } from 'prismarine-block'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { ClickedSlots, WindowClick } from '../modules/clicks.ts'
import { GRIDS } from '../modules/inventory.ts'
import type { Draft, Move, ScreenType } from '../modules/inventory.ts'
import { craftRecipeAction, craftRecipeAutoAction, createAction, resultsAction, sameItem, withCount } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { draw, drawSome, gridCells, Ingredients, matchGrid, nbtOf, RecipeBook, withNbt, writtenResult } from '../modules/recipes.ts'
import type { CraftingRecipe, Drawn, GridUse, Ingredient } from '../modules/recipes.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockRecipe, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'craft'
const OUTPUT: SlotRef = Object.freeze({ container: 'creative_output', slot: 50 })
const CURSOR: SlotRef = Object.freeze({ container: 'cursor', slot: 0 })
const OFFHAND: SlotRef = Object.freeze({ container: 'offhand', slot: 1 })
const GRID_WIDTHS: Readonly<Record<ScreenType, number>> = Object.freeze({ inventory: 2, workbench: 3 })
// a grid slot holds a stack of an ingredient
const MOST_TIMES = 64

type CraftingEvent = BedrockServerboundPackets['crafting_event']

interface Request {
  readonly moves: Move[]
  readonly event: CraftingEvent | undefined
}

interface Made {
  readonly result: Stack
  readonly outputs: readonly Stack[]
}

// what the slots get, and what the request tells
interface Results extends Made {
  readonly told: Made
}

// a recipe of crafting_data, or a multi recipe crafting as one
interface GridCraft {
  readonly networkId: number
  readonly uuid: string
  readonly uses: readonly GridUse[]
  readonly results: Results
}

type Slots = Pick<ClickedSlots, 'stackAt' | 'stackSize'>

type Placement = Extract<Move, { type: 'take' | 'place' }>

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function roomFor (stack: Stack, refs: readonly SlotRef[], slots: Slots): number {
  return refs.reduce((room, ref) => {
    const held = slots.stackAt(ref)
    if (held === undefined) return room + slots.stackSize(stack)
    return sameItem(held, stack) ? room + slots.stackSize(held) - held.count : room
  }, 0)
}

function perStack ({ result }: Results | CraftingRecipe, slots: Slots): number {
  return Math.max(1, Math.floor(slots.stackSize(result) / result.count))
}

function cellsOf (cells: ReadonlyArray<Ingredient | undefined>): Array<{ ingredient: Ingredient }> {
  return cells.filter(ingredient => ingredient !== undefined).map(ingredient => ({ ingredient }))
}

export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  const book = new RecipeBook(ingredients, version)
  // the recipe book's select sets what the output crafts, until a craft or another screen
  let selected: BedrockRecipe | undefined
  // a shift click in the select's input pass crafts once, as the vanilla client's select with shift
  let selectedInPass = false

  core.handle(OWNER, 'crafting_data', packet => { book.receive(packet) })
  core.inputPass(OWNER, () => { selectedInPass = false })
  bot.on('windowOpen', () => { selected = undefined })

  function crafting (recipe: BedrockRecipe): CraftingRecipe {
    const found = book.of(recipe)
    if (found === undefined) throw new Error(`${recipe.id} is not one of the recipes the server sent`)
    return found
  }

  // as Java's, a metadata of null (or none) is any
  function byResult (itemType: number, metadata: number | null | undefined, craftingTable: Block | boolean | null): CraftingRecipe[] {
    return book.all().filter(({ recipe }) => recipe.block === 'crafting_table' && recipe.result.id === itemType &&
      (metadata === null || metadata === undefined || recipe.result.metadata === metadata) && (!recipe.requiresTable || Boolean(craftingTable)))
  }

  bot.recipesAll = (itemType, metadata, craftingTable) => byResult(itemType, metadata, craftingTable).map(({ recipe }) => recipe)

  bot.recipesFor = (itemType, metadata, minResultCount, craftingTable) => {
    const draft = inventory.draft()
    return byResult(itemType, metadata, craftingTable).filter(({ recipe, cells }) => {
      const times = Math.ceil((minResultCount ?? 1) / recipe.result.count)
      // as Java's, no crafts needing no ingredients
      return times === 0 || draw(ingredients, cellsOf(cells), times, HOTBAR_AND_INVENTORY, ref => draft.stackAt(ref)) !== undefined
    }).map(({ recipe }) => recipe)
  }

  // Java's null count is 1, its null table none, and a count of 0 crafts nothing
  bot.craft = async (recipe, count, craftingTable) => {
    const found = crafting(recipe)
    const times = count ?? 1
    if (!Number.isInteger(times) || times < 0) throw new Error(`craft crafts a whole number of times, not ${times}`)
    if (times === 0) return
    const open = screenToOpen(found, craftingTable ?? undefined)
    const draft = inventory.draft()
    if (draw(ingredients, cellsOf(found.cells), times, HOTBAR_AND_INVENTORY, ref => draft.stackAt(ref)) === undefined) throw new Error(lacking(found, times))
    // with the screen open the craft is made in the next input pass, as a click is
    if (open === undefined) return await core.call(ctx => autoCraft(ctx, found, times))
    const opened = await open()
    try {
      await core.call(ctx => autoCraft(ctx, found, times))
    } catch (error) {
      await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    await bot.closeWindow(opened)
  }

  bot.placeRecipe = async (recipe, all = false) => {
    const found = crafting(recipe)
    await core.call(ctx => select(ctx, found, all))
  }

  inventory.outputClick = async (ctx, click, screen) => { await outputClick(ctx, click, screen) }

  function lacking ({ recipe }: CraftingRecipe, times: number): string {
    return `the inventory has not the ingredients to craft ${recipe.id} ${times} times`
  }

  // none where the screen open crafts the recipe
  function screenToOpen ({ recipe }: CraftingRecipe, craftingTable: Block | undefined): (() => Promise<Window>) | undefined {
    const type = inventory.screenType
    if (type === 'workbench' || (type === 'inventory' && craftingTable === undefined && !recipe.requiresTable)) return undefined
    if (craftingTable === undefined && recipe.requiresTable) throw new Error(`${recipe.id} needs a crafting table, and none was given`)
    const window = bot.currentWindow
    if (window !== null) throw new Error(`craft cannot craft ${recipe.id} in the ${window.type} window`)
    if (craftingTable !== undefined) return async () => await bot.openBlock(craftingTable)
    return async () => await bot.openInventory()
  }

  function screenOf ({ recipe }: CraftingRecipe): ScreenType {
    const type = inventory.screenType
    if (type === undefined) throw new Error(`${recipe.id} needs an open crafting screen`)
    if (type === 'inventory' && recipe.requiresTable) throw new Error(`${recipe.id} does not fit the inventory's grid`)
    return type
  }

  // up to 1.20.40 each request after its crafting_event
  async function send (ctx: FrameContext, requests: readonly Request[]): Promise<void> {
    await Promise.all(requests.map(({ moves, event }) => {
      if (event !== undefined) ctx.outbox.queue('crafting_event', event)
      return inventory.request(core, ctx, moves)
    }))
  }

  function craftingEvent (screen: ScreenType, uuid: string, { told: { result } }: Results, times: number): CraftingEvent | undefined {
    if (atLeast(version, 'bedrock_1.20.50')) return undefined
    const written = writtenResult(ingredients, version, withCount(result, result.count * times))
    // from 1.16.220 the item has a stack id
    const items = [atLeast(version, 'bedrock_1.16.220') ? { ...written, has_stack_id: 0 } : written] as CraftingEvent['result']
    return { window_id: 'inventory', recipe_type: screen === 'workbench' ? 'crafting' : 'inventory', recipe_id: uuid, input: [], result: items }
  }

  // a damageable item crafted in the grid has Damage 0 (on 1.19.1 – 1.19.10 by the book too, in the slot only), a dyed bundle the bundle_id of the one it was
  function resultsOf (found: CraftingRecipe, taken: readonly Stack[], grid: boolean): Results {
    const [bundleId] = taken.map(stack => nbtOf(stack)['bundle_id']).filter(tag => tag !== undefined)
    const made = (damaged: boolean) => (output: Stack): Stack => {
      let result = output
      const item = bot.registry.items[result.networkId]
      if (damaged && item?.maxDurability !== undefined) result = withNbt(result, { Damage: { type: 'int', value: 0 } })
      if (bundleId !== undefined && item?.name.endsWith('bundle') === true) result = withNbt(result, { bundle_id: bundleId })
      return result
    }
    const madeOf = (damaged: boolean): Made => ({ result: made(damaged)(found.result), outputs: found.outputs.map(made(damaged)) })
    const told = madeOf(grid)
    return { ...grid || !atLeast(version, 'bedrock_1.19.1') || atLeast(version, 'bedrock_1.19.20') ? told : madeOf(true), told }
  }

  // with several outputs, create before each move
  function outputMoves (draft: Draft, { outputs }: Results, [index, output]: [number, Stack], times: number, destination: (stack: Stack) => Placement[]): Move[] {
    const stack = withCount(output, output.count * times)
    if (outputs.length === 1) {
      const moved = destination(stack)
      draft.apply(moved)
      return moved
    }
    return destination(stack).flatMap(move => {
      const moves: Move[] = [{ type: 'action', action: createAction(version, index), output: stack }, move]
      draft.apply(moves)
      return moves
    })
  }

  function toSlots (draft: Draft, refs: readonly SlotRef[]): (stack: Stack) => Placement[] {
    return stack => placesFor(stack, refs, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
  }

  function toInventory (draft: Draft): (stack: Stack) => Placement[] {
    return toSlots(draft, HOTBAR_AND_INVENTORY)
  }

  // from 1.18.30 the vanilla client shift clicks firework rockets to the offhand first
  function shiftedTo (result: Stack): readonly SlotRef[] {
    const rockets = atLeast(version, 'bedrock_1.18.30') && bot.registry.items[result.networkId]?.name === 'firework_rocket'
    return rockets ? [OFFHAND, ...HOTBAR_AND_INVENTORY] : HOTBAR_AND_INVENTORY
  }

  // with several outputs, create names each
  function crafted ({ result, outputs }: Results, times: number): Stack | undefined {
    return outputs.length === 1 ? withCount(result, result.count * times) : undefined
  }

  function written ({ told: { outputs } }: Results): ReturnType<typeof writtenResult>[] {
    return outputs.map(output => writtenResult(ingredients, version, ingredients.crafted(output)))
  }

  async function autoCraft (ctx: FrameContext, found: CraftingRecipe, count: number): Promise<void> {
    const screen = screenOf(found)
    const draft = inventory.draft()
    const requests: Request[] = []
    for (let left = count; left > 0;) {
      const times = Math.min(left, perStack(found, draft))
      const drawn = draw(ingredients, cellsOf(found.cells), times, HOTBAR_AND_INVENTORY, ref => draft.stackAt(ref))
      if (drawn === undefined) throw new Error(lacking(found, count))
      const results = resultsOf(found, drawn.map(({ taken }) => taken), false)
      const moves: Move[] = [
        { type: 'action', action: craftRecipeAutoAction(version, found.recipe.networkId, times, drawn.map(({ ingredient, taken }) => ingredients.written(ingredient, taken))), output: crafted(results, times) },
        { type: 'action', action: resultsAction(version, written(results), times) },
        ...drawn.flatMap(({ sources }) => sources.map(({ from, count }): Move => ({ type: 'consume', count, from })))
      ]
      draft.apply(moves)
      // with several outputs the others go first
      const [first, ...others] = [...results.outputs.entries()]
      for (const output of [...others, ...[first].filter(entry => entry !== undefined)]) {
        const placed = outputMoves(draft, results, output, times, toInventory(draft))
        if (placed.reduce((sum, move) => move.type === 'place' ? sum + move.count : sum, 0) < output[1].count * times) throw new Error(`the inventory has no room for what crafting ${found.recipe.id} makes`)
        moves.push(...placed)
      }
      requests.push({ moves, event: craftingEvent(screen, found.recipe.uuid, results, times) })
      left -= times
    }
    await send(ctx, requests)
  }

  // the selected recipe while the grid makes it; after a craft what the grid makes, as a multi recipe that stands for it
  function gridCrafts (screen: ScreenType, draft: Draft): { first: GridCraft, later: GridCraft } | undefined {
    const grid = GRIDS[screen].map(ref => [ref, draft.stackAt(ref)] as const)
    const all = book.all()
    const chosen = matchGrid(ingredients, all.filter(({ recipe }) => recipe === selected), grid, GRID_WIDTHS[screen])
    const matched = matchGrid(ingredients, all, grid, GRID_WIDTHS[screen])
    if (matched === undefined) return undefined
    const craftOf = ({ recipe, uses }: typeof matched, asMulti: boolean): GridCraft => {
      const results = resultsOf(recipe, uses.map(({ stack }) => stack), true)
      const multi = asMulti ? book.multiFor(recipe) : undefined
      if (multi === undefined) return { networkId: recipe.recipe.networkId, uuid: recipe.recipe.uuid, uses, results }
      const { nbt } = multi
      const withMulti = ({ result, outputs }: Made): Made => nbt === undefined ? { result, outputs } : { result: withNbt(result, nbt), outputs: outputs.map(output => withNbt(output, nbt)) }
      return { networkId: multi.networkId, uuid: multi.uuid, uses, results: { ...withMulti(results), told: withMulti(results.told) } }
    }
    const later = craftOf(matched, true)
    return { first: chosen === undefined ? later : craftOf(chosen, false), later }
  }

  async function outputClick (ctx: FrameContext, click: WindowClick, screen: ScreenType): Promise<void> {
    const draft = inventory.draft()
    const crafts = gridCrafts(screen, draft)
    if (crafts === undefined) return
    const gridMoves = ({ networkId, uses, results }: GridCraft, times: number, destination: (stack: Stack) => Placement[]): Move[] => {
      const moves: Move[] = [
        { type: 'action', action: craftRecipeAction(version, networkId, times), output: crafted(results, times) },
        { type: 'action', action: resultsAction(version, written(results), 1) },
        ...uses.map(({ from, count }): Move => ({ type: 'consume', count: count * times, from }))
      ]
      draft.apply(moves)
      for (const output of results.outputs.entries()) moves.push(...outputMoves(draft, results, output, times, output[0] === 0 ? destination : toInventory(draft)))
      return moves
    }
    const requests: Request[] = []
    if (click.mode === 1) {
      let craft = crafts.first
      // up to 1.21.2 a craft a request; from 1.21.20 a stack's worth
      for (let left = selectedInPass ? 1 : Math.min(...craft.uses.map(({ stack, count }) => Math.floor(stack.count / count))); left > 0;) {
        const { result } = craft.results
        const shifted = shiftedTo(result)
        const most = atLeast(version, 'bedrock_1.21.20') ? perStack(craft.results, draft) : 1
        const times = Math.min(left, most, Math.floor(roomFor(result, shifted, draft) / result.count))
        if (times === 0) break
        requests.push({ moves: gridMoves(craft, times, toSlots(draft, shifted)), event: craftingEvent(screen, craft.uuid, craft.results, times) })
        left -= times
        craft = crafts.later
      }
    } else {
      const craft = crafts.first
      const { result } = craft.results
      const to: SlotRef = click.mode === 2 ? { container: 'hotbar', slot: click.mouseButton } : CURSOR
      const held = draft.stackAt(to)
      // the cursor's or the key slot's other item, or a stack with no room for the result, blocks the craft
      if (held !== undefined && (!sameItem(held, result) || held.count + result.count > draft.stackSize(held))) return
      requests.push({ moves: gridMoves(craft, 1, stack => [{ type: 'take', count: stack.count, from: OUTPUT, to }]), event: craftingEvent(screen, craft.uuid, craft.results, 1) })
    }
    if (requests.length > 0) selected = undefined
    await send(ctx, requests)
  }

  // the grid's items back first; `all`: as many crafts' as the grid takes; lacking some, a craft's of those the inventory has
  async function select (ctx: FrameContext, found: CraftingRecipe, all: boolean): Promise<void> {
    const screen = screenOf(found)
    const grid = GRIDS[screen]
    const draft = inventory.draft()
    const requests: Request[] = []
    const request = (move: Move): void => {
      draft.apply([move])
      requests.push({ moves: [move], event: undefined })
    }
    for (const from of grid) {
      const stack = draft.stackAt(from)
      if (stack !== undefined) for (const { to, count } of placesFor(stack, HOTBAR_AND_INVENTORY, draft)) request({ type: 'place', count, from, to })
    }
    const cells = gridCells(found, grid, GRID_WIDTHS[screen])
    const drawnFor = (times: number): Array<Drawn<{ ingredient: Ingredient, to: SlotRef }>> | undefined => {
      const drawn = draw(ingredients, cells, times, HOTBAR_AND_INVENTORY, ref => draft.stackAt(ref))
      return drawn?.every(({ ingredient, taken }) => ingredient.count * times <= draft.stackSize(taken)) === true ? drawn : undefined
    }
    const times = all ? Array.from({ length: MOST_TIMES }, (_, index) => MOST_TIMES - index).find(times => drawnFor(times) !== undefined) : 1
    // lacking some of a craft's ingredients, the vanilla client places those it has
    const drawn = drawnFor(times ?? 1) ?? drawSome(ingredients, cells, 1, HOTBAR_AND_INVENTORY, ref => draft.stackAt(ref))
    if (drawn.length === 0) throw new Error(`the inventory has none of the ingredients of ${found.recipe.id}`)
    for (const { sources, to } of drawn) for (const { from, count } of sources) request({ type: 'place', count, from, to })
    selected = found.recipe
    selectedInPass = true
    await send(ctx, requests)
  }
}
