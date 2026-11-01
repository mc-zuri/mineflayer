import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { craftRecipeAction, readStack, resultsAction, stackAction } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, nbtOf, RecipeBook, withNbt, writtenResult } from '../modules/recipes.ts'
import type { Ingredient, NbtValue } from '../modules/recipes.ts'
import { CURSOR, OUTPUT, PLAYER_SLOTS } from '../modules/screens.ts'
import { SMITHING_INPUT, SMITHING_MATERIAL, SMITHING_TEMPLATE, smithingInputs, smithingScreen } from '../screens/smithing.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { MCProtocol } from '../../types/protocol/Bedrock.d.ts'

const OWNER = 'smithing'
const BLOCK = 'smithing_table'
const SHIFT = 1
const HOTBAR_KEY = 2

type CraftingData = BedrockClientboundPackets['crafting_data']
type Descriptor = MCProtocol.Bedrock.Read.Types.RecipeIngredient

/** a smithing_transform's or a smithing_trim's fields, of the version's form */
interface SmithingData {
  readonly template?: Descriptor
  readonly base?: Descriptor
  /** a trim's base */
  readonly input?: Descriptor
  readonly addition?: Descriptor
  readonly result?: MCProtocol.Bedrock.Read.Types.ItemLegacy
  readonly network_id?: number
}

/** a transform, of no template (the template slot empty) up to 1.19.80; or a trim, the base trimmed */
type SmithingRecipe = { readonly networkId: number, readonly base: Ingredient, readonly addition: Ingredient } &
  ({ readonly template: Ingredient | undefined, readonly result: Stack } | { readonly template: Ingredient, readonly result: undefined })

interface Slots {
  readonly template: Stack | undefined
  readonly base: Stack | undefined
  readonly addition: Stack | undefined
}

/** what a click on the output crafts: by a recipe of the server's, or by none (non_implemented) */
interface Craft {
  readonly networkId: number | undefined
  readonly result: Stack
  readonly consumed: readonly SlotRef[]
}

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

// up to 1.26.30 in the recipes' list by type, from 1.26.40 in lists of their own
function smithingData (packet: CraftingData): SmithingData[] {
  const typed = (packet.recipes ?? []).flatMap(({ type, recipe }) => type === 'smithing_transform' || type === 'smithing_trim' ? [{ ...recipe } as SmithingData] : [])
  return [...typed, ...packet.smithing_transform_recipes ?? [], ...packet.smithing_trim_recipes ?? []]
}

/** The smithing table: its screen, and what a click on its output crafts. */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  // 1.18.11 – 1.19.50's recipes are shapeless ones of the smithing table
  const book = new RecipeBook(ingredients, version)
  const templated = atLeast(version, 'bedrock_1.20.0')
  let recipes: SmithingRecipe[] = []
  let patterns = new Map<string, string>()
  let materials = new Map<string, string>()

  // the codec reads an ingredient's absent fields as undefined
  function ingredientOf (descriptor: Descriptor): Ingredient | undefined {
    return ingredients.of(descriptor as Parameters<Ingredients['of']>[0])
  }

  core.observe(OWNER, 'crafting_data', packet => {
    book.receive(packet)
    // before 1.17.30 (is_clean) there is no smithing recipe
    if (packet.clear_recipes === true) recipes = []
    for (const data of smithingData(packet)) {
      const [template, base, addition] = [data.template, data.base ?? data.input, data.addition].map(descriptor => descriptor === undefined ? undefined : ingredientOf(descriptor))
      const result = data.result === undefined ? undefined : readStack(data.result as Parameters<typeof readStack>[0])
      const networkId = Number(data.network_id)
      if (base === undefined || addition === undefined) continue
      if (result !== undefined) recipes.push({ networkId, template, base, addition, result })
      else if (template !== undefined) recipes.push({ networkId, template, base, addition, result })
    }
  })
  // the trims' names by the template's and the material's item, empty before 1.20.0
  core.handle(OWNER, 'trim_data', packet => {
    patterns = new Map(packet.patterns.map(({ item_name: item, pattern }) => [item, pattern]))
    materials = new Map(packet.materials.map(({ item_name: item, material }) => [item, material]))
  })

  inventory.screens.add(smithingScreen(templated), { output: async (ctx, click) => { await outputClick(ctx, click) } })

  function shapeless (): SmithingRecipe[] {
    return book.all().flatMap(({ recipe, cells: [base, addition], result }) => recipe.block === BLOCK && base !== undefined && addition !== undefined ? [{ networkId: recipe.networkId, template: undefined, base, addition, result }] : [])
  }

  // a smithing recipe takes one of each (count 1 in the recorded crafting_data), as the request consumes
  function fits (ingredient: Ingredient, stack: Stack | undefined): stack is Stack {
    return stack !== undefined && ingredients.matches(ingredient, stack)
  }

  // the base's NBT kept (not recorded: the bases recorded had none), a damageable item's Damage 0 when it has none
  function made (item: Stack, base: Stack, added: NbtValue): Stack {
    const kept = nbtOf(base)
    const damage = bot.registry.items[item.networkId]?.maxDurability === undefined ? {} : { Damage: kept['Damage'] ?? { type: 'int' as const, value: 0 } }
    const value = { ...kept, ...damage, ...added }
    return Object.keys(value).length === 0 ? item : withNbt(item, value)
  }

  function trimmed (template: Stack, base: Stack, addition: Stack): Stack | undefined {
    const pattern = patterns.get(ingredients.namespaced(template.networkId))
    const material = materials.get(ingredients.namespaced(addition.networkId))
    if (pattern === undefined || material === undefined) return undefined
    return made(base, base, { Trim: { type: 'compound', value: { Material: { type: 'string', value: material }, Pattern: { type: 'string', value: pattern } } } })
  }

  function madeBy (recipe: SmithingRecipe, { template, base, addition }: Slots): Stack | undefined {
    if (!fits(recipe.base, base) || !fits(recipe.addition, addition)) return undefined
    if (recipe.result === undefined) return fits(recipe.template, template) ? trimmed(template, base, addition) : undefined
    const templateFits = recipe.template === undefined ? template === undefined : fits(recipe.template, template)
    return templateFits ? made(recipe.result, base, {}) : undefined
  }

  // up to 1.18.0 crafting_data has no smithing recipe: the vanilla client upgrades a diamond item to its netherite one, naming none
  function upgraded ({ base, addition }: Slots): Stack | undefined {
    if (base === undefined || addition === undefined || ingredients.nameOf(addition.networkId) !== 'netherite_ingot') return undefined
    const name = ingredients.nameOf(base.networkId)
    const upgrade = bot.registry.itemsByName[name.replace(/^diamond_/, 'netherite_')]
    if (!name.startsWith('diamond_') || upgrade === undefined) return undefined
    return made({ ...base, networkId: upgrade.id, wire: { ...base.wire, network_id: upgrade.id } }, base, {})
  }

  // up to 1.19.70 the addition before the base; from 1.19.80 the template first, when the recipe has one
  function consumedBy (template: Ingredient | undefined): SlotRef[] {
    if (!atLeast(version, 'bedrock_1.19.80')) return [SMITHING_MATERIAL, SMITHING_INPUT]
    return [...template === undefined ? [] : [SMITHING_TEMPLATE], SMITHING_INPUT, SMITHING_MATERIAL]
  }

  function craftOf (slots: Slots): Craft | undefined {
    for (const recipe of [...shapeless(), ...recipes]) {
      const result = madeBy(recipe, slots)
      if (result !== undefined) return { networkId: recipe.networkId, result, consumed: consumedBy(recipe.template) }
    }
    const result = atLeast(version, 'bedrock_1.18.11') ? undefined : upgraded(slots)
    return result === undefined ? undefined : { networkId: undefined, result, consumed: consumedBy(undefined) }
  }

  function slotsOf (stackAt: (ref: SlotRef) => Stack | undefined): Slots {
    return { template: stackAt(SMITHING_TEMPLATE), base: stackAt(SMITHING_INPUT), addition: stackAt(SMITHING_MATERIAL) }
  }

  /** a mouse button takes the result to the cursor unless it holds an item, a shift click to the inventory; a hotbar key does nothing, as recorded on 1.26.51 */
  async function outputClick (ctx: FrameContext, click: WindowClick): Promise<void> {
    const draft = inventory.draft()
    const craft = craftOf(slotsOf(ref => draft.stackAt(ref)))
    if (craft === undefined || click.mode === HOTBAR_KEY) return
    const { networkId, result, consumed } = craft
    const moved: Move[] = click.mode === SHIFT
      ? placesFor(result, HOTBAR_AND_INVENTORY, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
      : draft.stackAt(CURSOR) === undefined ? [{ type: 'take', count: result.count, from: OUTPUT, to: CURSOR }] : []
    if (moved.length === 0) return
    await inventory.request(core, ctx, [
      { type: 'action', action: networkId === undefined ? stackAction(version, 'non_implemented', {}) : craftRecipeAction(version, networkId, 1), output: result },
      { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, result)], 1) },
      ...consumed.map((from): Move => ({ type: 'consume', count: 1, from })),
      ...moved
    ])
  }

  /** as craft's crafting table: the smithing table open, else the one given, opened; undefined: the one open */
  async function smithingTableOf (smithingTable: Block | undefined): Promise<Window | undefined> {
    if (inventory.screenType === BLOCK) return undefined
    if (smithingTable === undefined) throw new Error('smith needs an open smithing table, or one to open')
    return await bot.openBlock(smithingTable)
  }

  /** the first of the player's slots holding the item, by its index in a station window's player slots */
  function sourceOf (item: Item): { stack: Stack, index: number } {
    const [source] = PLAYER_SLOTS.flatMap((ref, index) => {
      const stack = inventory.stackAt(ref)
      return stack?.networkId === item.type && stack.metadata === item.metadata ? [{ stack, index }] : []
    })
    if (source === undefined) throw new Error(`the inventory has no ${item.name}`)
    return source
  }

  async function smith (base: Item, addition: Item, template: Item | undefined, smithingTable: Block | undefined): Promise<void> {
    // in the recorded order: the template, the base, the addition
    const given = [template, base, addition].map(item => item === undefined ? undefined : sourceOf(item))
    const [templateSource, baseSource, additionSource] = given
    if (craftOf({ template: templateSource?.stack, base: baseSource?.stack, addition: additionSource?.stack }) === undefined) {
      throw new Error(`no smithing recipe takes ${[template, base, addition].flatMap(item => item === undefined ? [] : [item.name]).join(', ')}`)
    }
    const open = inventory.screenType === BLOCK
    if (inventory.stackAt(CURSOR) !== undefined) throw new Error('smith needs an empty cursor')
    if (open && smithingInputs(templated).some(ref => inventory.stackAt(ref) !== undefined)) throw new Error('smith needs the smithing table\'s slots empty')
    const opened = await smithingTableOf(smithingTable)
    try {
      const inputs = smithingInputs(templated)
      // the window's player slots follow its inputs and its result
      const playerStart = inputs.length + 1
      const placed = templated ? given : given.slice(1)
      for (const [destStart, source] of placed.entries()) {
        if (source !== undefined) await bot.transfer({ itemType: source.stack.networkId, metadata: source.stack.metadata, sourceStart: playerStart + source.index, destStart, count: 1 })
      }
      // to the inventory, as the vanilla client's shift click (recorded on 1.26.51)
      await bot.clickWindow(inputs.length, 0, SHIFT)
    } catch (error) {
      if (opened !== undefined) await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    if (opened !== undefined) await bot.closeWindow(opened)
  }

  bot.bedrock = {
    ...bot.bedrock,
    // Java's null template and table are none
    smith: async (base, addition, template, smithingTable) => { await smith(base, addition, template ?? undefined, smithingTable ?? undefined) }
  }
}
