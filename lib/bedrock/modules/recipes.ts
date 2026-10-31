import type { Tags, TagType } from 'prismarine-nbt'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockRecipe, BedrockRecipeItem, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import { readStack } from './items.ts'
import type { AutoIngredient, ResultItem, SlotRef, Stack } from './items.ts'

type Registry = BedrockBotInternal['registry']
type CraftingData = BedrockClientboundPackets['crafting_data']
export type NbtValue = Record<string, undefined | Tags[TagType]>

const ANY = 32767
const NAMESPACE = 'minecraft:'
const KINDS: Readonly<Record<string, string>> = Object.freeze({
  shaped_recipes: 'shaped',
  shapeless_recipes: 'shapeless',
  multi_recipes: 'multi',
  shulker_box_recipes: 'shulker_box',
  shapeless_chemistry_recipes: 'shapeless_chemistry',
  shaped_chemistry_recipes: 'shaped_chemistry',
  smithing_transform_recipes: 'smithing_transform',
  smithing_trim_recipes: 'smithing_trim'
})
const SHAPED: readonly string[] = Object.freeze(['shaped', 'shaped_chemistry'])
const EMPTY_CELL: BedrockRecipeItem = Object.freeze({ id: -1, metadata: null, count: 1 })

// a multi recipe comes by its uuid alone (as the codec reads it): the vanilla client crafts it on the grids its recipes make
const MULTI_RECIPES: Readonly<Record<string, { readonly standsFor: (made: Made, version: BedrockVersion) => boolean, readonly nbt?: NbtValue }>> = Object.freeze({
  // fireworks: from 1.20.10 not a star of a dye that is not named one, as of an ink sac
  '00000000-0000-0000-0200-000000000000': {
    standsFor: ({ result, cells }, version) => result === 'firework_rocket' ||
      (result === 'firework_star' && (!isBedrockVersionAtLeast(version, 'bedrock_1.20.10') || cells.every(cell => cell === 'gunpowder' || cell.endsWith('_dye'))))
  },
  // map extending: an empty map and a compass, not the locator map's eight paper and compass
  '4b43944b-9422-cdae-2793-2cbb99446786': { standsFor: ({ cells }) => [...cells].sort().join() === 'compass,empty_map' },
  // the decorated pot, its result with an empty compound
  '4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88': { standsFor: ({ result }) => result === 'decorated_pot', nbt: {} }
})

interface DataRecipe {
  readonly recipe_id?: string
  readonly width?: number
  readonly height?: number
  readonly input?: unknown
  readonly output?: unknown
  readonly uuid?: string
  readonly block?: string
  readonly priority?: number
  readonly assume_symmetry?: boolean
  readonly network_id?: number
}

interface Descriptor {
  readonly type?: string | number
  readonly descriptor_type?: string
  readonly network_id?: number
  readonly network_data?: number
  readonly metadata?: number
  readonly name?: string
  readonly tag?: string
  readonly count?: number
}

// metadata undefined: any
type Accepted =
  | { readonly kind: 'id', readonly networkId: number, readonly metadata: number | undefined }
  | { readonly kind: 'names', readonly names: readonly string[], readonly metadata: number | undefined }
  | { readonly kind: 'tag', readonly tag: string }
  | { readonly kind: 'none' }

// undefined: the recipe book names the ingredient by the item it took
type Written = { readonly network_id: number, readonly metadata: number } | { readonly name: string, readonly metadata: number } | undefined

export interface Ingredient {
  readonly count: number
  readonly accepted: Accepted
  readonly written: Written
}

export interface CraftingRecipe {
  readonly recipe: BedrockRecipe
  readonly shaped: boolean
  readonly width: number
  // a shaped recipe's width × height, row by row, undefined empty
  readonly cells: ReadonlyArray<Ingredient | undefined>
  readonly result: Stack
  readonly outputs: readonly Stack[]
  readonly symmetric: boolean
}

export interface MultiRecipe {
  readonly uuid: string
  readonly networkId: number
  readonly nbt: NbtValue | undefined
}

// by item name, a cell taking several items by the first
interface Made {
  readonly result: string
  readonly cells: readonly string[]
}

function listOf (value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function recipesOf (packet: CraftingData): Array<{ type: string, recipe: DataRecipe }> {
  if (packet.recipes !== undefined) return packet.recipes.map(({ type, recipe }) => ({ type: String(type), recipe: { ...recipe } }))
  return Object.entries(packet).flatMap(([list, recipes]) => {
    const type = KINDS[list]
    return type === undefined ? [] : listOf(recipes).map(recipe => ({ type, recipe: { ...recipe as DataRecipe } }))
  })
}

function clearsRecipes (packet: CraftingData): boolean {
  return (packet.clear_recipes ?? packet.is_clean) === true
}

// 1.26.60 names an item with its data, minecraft:stone:0
function withoutData (name: string): string {
  return name.replace(/^([^:]+:[^:]+):\d+$/, '$1')
}

// each state's value index in its own bits, the state the palette varies fastest lowest
function legacyDataOf (palette: NonNullable<Registry['blockStates']>, name: string): ReadonlyMap<number, number> {
  // the ids start_game numbered the palette with, which minecraft-data's typings do not give
  const states = palette.flatMap(state => state.name === name ? [{ id: Number(Reflect.get(state, 'stateId')), values: new Map(Object.entries(state.states).map(([key, { value }]) => [key, value])) }] : [])
  const valueOf = (index: number, key: string): unknown => states[index]?.values.get(key)
  const keys = [...new Set(states.flatMap(({ values }) => [...values.keys()]))]
    .map(key => ({ key, values: [...new Set(states.map((_, index) => valueOf(index, key)))], stride: states.findIndex((_, index) => valueOf(index, key) !== valueOf(0, key)) }))
    .sort((a, b) => a.stride - b.stride)
  return new Map(states.map(({ id, values }) => {
    let [data, shift] = [0, 0]
    for (const key of keys) {
      data |= key.values.indexOf(values.get(key.key)) << shift
      shift += Math.ceil(Math.log2(key.values.length))
    }
    return [id, data]
  }))
}

export class Ingredients {
  private readonly registry: Registry
  private readonly version: BedrockVersion
  // item_registry gives the registry another items list, start_game another palette
  private tags: { readonly from: unknown, readonly names: Map<string, string[]> } | undefined
  private blockData: { readonly from: unknown, readonly byBlock: Map<string, ReadonlyMap<number, number>> } | undefined

  constructor (registry: Registry, version: BedrockVersion) {
    this.registry = registry
    this.version = version
  }

  of (descriptor: Descriptor): Ingredient | undefined {
    // up to 1.19.21 an item by network id, empty as 0; from 1.26.40 a valid one names its kind apart
    const type = descriptor.descriptor_type ?? descriptor.type
    if (type === 'invalid' || descriptor.network_id === 0) return undefined
    const count = Number(descriptor.count)
    const metadata = descriptor.metadata ?? descriptor.network_data ?? ANY
    if (type === 'int_id_meta' || type === undefined) {
      const networkId = Number(descriptor.network_id)
      return { count, accepted: { kind: 'id', networkId, metadata: metadata === ANY ? undefined : metadata }, written: { network_id: networkId, metadata } }
    }
    if (type === 'item_tag') return { count, accepted: { kind: 'tag', tag: String(descriptor.tag) }, written: undefined }
    if (type === 'complex_alias') return { count, accepted: { kind: 'names', names: this.alias(String(descriptor.name)), metadata: undefined }, written: undefined }
    if (type !== 'name') return { count, accepted: { kind: 'none' }, written: undefined }
    const name = withoutData(String(descriptor.name))
    // from 1.26.40 a name is a complex alias's first: its data picks one of its items
    const aliased = this.alias(name)
    const names = aliased.length > 0 ? metadata === ANY ? aliased : aliased.slice(metadata, metadata + 1) : [name.replace(NAMESPACE, '')]
    return { count, accepted: { kind: 'names', names, metadata: aliased.length > 0 || metadata === ANY ? undefined : metadata }, written: { name, metadata } }
  }

  matches ({ accepted }: Ingredient, stack: Stack): boolean {
    if (accepted.kind === 'none') return false
    if (accepted.kind === 'id') return stack.networkId === accepted.networkId && (accepted.metadata === undefined || this.dataOf(stack) === accepted.metadata)
    const name = this.nameOf(stack.networkId)
    if (accepted.kind === 'tag') return this.taggedWith(accepted.tag).includes(name)
    return accepted.names.includes(name) && (accepted.metadata === undefined || this.dataOf(stack) === accepted.metadata)
  }

  // from 1.16.220 the server sends a block's item with data 0 and the state it places, which the client reads as its legacy data
  private dataOf ({ networkId, metadata, wire }: Stack): number {
    if (!('block_runtime_id' in wire)) return metadata
    return this.legacyData(this.nameOf(networkId)).get(Number(wire.block_runtime_id)) ?? metadata
  }

  private legacyData (name: string): ReadonlyMap<number, number> {
    const { blockStates: palette = [] } = this.registry
    if (this.blockData?.from !== palette) this.blockData = { from: palette, byBlock: new Map() }
    const data = this.blockData.byBlock.get(name) ?? legacyDataOf(palette, name)
    this.blockData.byBlock.set(name, data)
    return data
  }

  shown ({ accepted, count }: Ingredient): BedrockRecipeItem {
    if (accepted.kind === 'id') return { id: accepted.networkId, metadata: accepted.metadata ?? null, count }
    if (accepted.kind === 'none') return { ...EMPTY_CELL, count }
    const [first] = accepted.kind === 'tag' ? this.taggedWith(accepted.tag) : accepted.names
    return { id: this.registry.itemsByName[String(first)]?.id ?? -1, metadata: accepted.kind === 'names' ? accepted.metadata ?? null : null, count }
  }

  // up to 1.26.30 by network id, a tag's cell with any metadata
  written ({ written, count }: Ingredient, taken: Stack): AutoIngredient {
    if (!isBedrockVersionAtLeast(this.version, 'bedrock_1.26.40')) {
      const { network_id: networkId, metadata } = written !== undefined && 'network_id' in written ? written : { network_id: taken.networkId, metadata: ANY }
      return { type: 'int_id_meta', network_id: networkId, metadata, count }
    }
    const { name, metadata } = written !== undefined && 'name' in written ? written : { name: this.namespaced(taken.networkId), metadata: taken.metadata }
    return { type: 'name', legacy_type: 1, name, metadata, count }
  }

  // a custom item's name has its own namespace
  namespaced (networkId: number): string {
    return `${NAMESPACE}${this.nameOf(networkId)}`.replace(/^minecraft:(?=[^:]+:)/, '')
  }

  // from 1.26.40 the client writes a block's crafted item by the state the server gave it, as that state's legacy data; its slot keeps data 0
  crafted (output: Stack): Stack {
    const { wire } = output
    if (!isBedrockVersionAtLeast(this.version, 'bedrock_1.26.40') || !('block_runtime_id' in wire) || output.metadata !== 0) return output
    const metadata = this.legacyData(this.nameOf(output.networkId)).get(Number(wire.block_runtime_id))
    return metadata === undefined ? output : { ...output, metadata, wire: { ...wire, metadata } }
  }

  nameOf (networkId: number): string {
    return String(this.registry.items[networkId]?.name)
  }

  private alias (name: string): readonly string[] {
    return this.registry.complexAliasesByName?.[name]?.items ?? []
  }

  private taggedWith (tag: string): readonly string[] {
    const from = this.registry.itemsArray
    if (this.tags?.from !== from) {
      const names = new Map<string, string[]>()
      for (const item of from) for (const itemTag of item.tags ?? []) names.set(itemTag, [...names.get(itemTag) ?? [], item.name])
      this.tags = { from, names }
    }
    return this.tags.names.get(tag) ?? []
  }
}

function bedrockRecipe (ingredients: Ingredients, type: string, data: DataRecipe, [result, ...others]: readonly [Stack, ...Stack[]], cells: ReadonlyArray<Ingredient | undefined>): BedrockRecipe {
  const itemOf = ({ networkId, metadata, count }: Stack): BedrockRecipeItem => ({ id: networkId, metadata, count })
  const shaped = SHAPED.includes(type)
  const [width, height] = [Number(data.width), Number(data.height)]
  const filled = cells.filter(cell => cell !== undefined)
  const shown = (ingredient: Ingredient | undefined): BedrockRecipeItem => ingredient === undefined ? { ...EMPTY_CELL } : ingredients.shown(ingredient)
  const results = [result, ...others].map(itemOf)
  const delta: BedrockRecipeItem[] = []
  for (const item of [...filled.map(cell => ({ ...shown(cell), count: -cell.count })), ...results]) {
    const same = delta.find(other => other.id === item.id && other.metadata === item.metadata)
    if (same === undefined) delta.push({ ...item })
    else same.count += item.count
  }
  return {
    result: itemOf(result),
    inShape: shaped ? Array.from({ length: height }, (_, row) => cells.slice(row * width, row * width + width).map(shown)) : null,
    outShape: null,
    ingredients: shaped ? null : filled.map(cell => ({ ...shown(cell), count: -cell.count })),
    delta,
    requiresTable: shaped ? width > 2 || height > 2 : filled.length > 4,
    id: String(data.recipe_id),
    type,
    networkId: Number(data.network_id),
    uuid: String(data.uuid),
    priority: Number(data.priority),
    block: String(data.block),
    results
  }
}

// read when first asked for, the earlier recipes kept while a crafting_data adds its own
export class RecipeBook {
  private readonly ingredients: Ingredients
  private readonly version: BedrockVersion
  private unread: Array<{ type: string, recipe: DataRecipe }> = []
  private read: CraftingRecipe[] = []
  private multi: MultiRecipe[] = []
  private readonly byRecipe = new WeakMap<BedrockRecipe, CraftingRecipe>()

  constructor (ingredients: Ingredients, version: BedrockVersion) {
    this.ingredients = ingredients
    this.version = version
  }

  receive (packet: CraftingData): void {
    const recipes = recipesOf(packet)
    if (clearsRecipes(packet)) [this.unread, this.read, this.multi] = [[], [], []]
    this.unread.push(...recipes)
  }

  // in crafting_data's order: of two recipes of one priority the earlier is crafted
  all (): readonly CraftingRecipe[] {
    for (const { type, recipe } of this.unread.splice(0)) {
      if (type === 'multi') this.multi.push({ uuid: String(recipe.uuid), networkId: Number(recipe.network_id), nbt: MULTI_RECIPES[String(recipe.uuid)]?.nbt })
      const crafting = this.craftingRecipe(type, recipe)
      if (crafting === undefined) continue
      this.byRecipe.set(crafting.recipe, crafting)
      this.read.push(crafting)
    }
    return this.read
  }

  of (recipe: BedrockRecipe): CraftingRecipe | undefined {
    const crafting = this.byRecipe.get(recipe)
    return crafting !== undefined && this.all().includes(crafting) ? crafting : undefined
  }

  // the multi recipe the vanilla client crafts a grid this recipe matches by
  multiFor ({ recipe, cells }: CraftingRecipe): MultiRecipe | undefined {
    this.all()
    const made: Made = { result: this.ingredients.nameOf(recipe.result.id), cells: cells.filter(cell => cell !== undefined).map(cell => this.ingredients.nameOf(this.ingredients.shown(cell).id)) }
    return this.multi.find(({ uuid }) => MULTI_RECIPES[uuid]?.standsFor(made, this.version))
  }

  private craftingRecipe (type: string, data: DataRecipe): CraftingRecipe | undefined {
    const outputs = listOf(data.output).map(item => readStack(item as Parameters<typeof readStack>[0])).filter(stack => stack !== undefined)
    const [result] = outputs
    if (!Array.isArray(data.input) || result === undefined) return undefined
    const shaped = SHAPED.includes(type)
    // up to 1.26.30 the codec groups a shaped recipe's cells, the wire having them row by row
    const descriptors: Descriptor[] = data.input.flat()
    const cells = descriptors.map(descriptor => this.ingredients.of(descriptor))
    const used = shaped ? cells : cells.filter(cell => cell !== undefined)
    return {
      recipe: bedrockRecipe(this.ingredients, type, data, [result, ...outputs.slice(1)], used),
      shaped,
      width: Number(data.width),
      cells: used,
      result,
      outputs,
      symmetric: data.assume_symmetry !== false
    }
  }
}

// taken: the first slot's stack, the item the recipe book names
export type Drawn<Cell> = Cell & {
  readonly sources: ReadonlyArray<{ readonly from: SlotRef, readonly count: number }>
  readonly taken: Stack
}

// a slot's items go to the first cells
export function drawSome<Cell extends { readonly ingredient: Ingredient }> (ingredients: Ingredients, cells: readonly Cell[], times: number, slots: readonly SlotRef[], stackAt: (ref: SlotRef) => Stack | undefined): Array<Drawn<Cell>> {
  const pool = slots.flatMap(from => {
    const stack = stackAt(from)
    return stack === undefined ? [] : [{ from, stack, left: stack.count }]
  })
  return cells.flatMap(cell => {
    const matching = pool.filter(slot => slot.left > 0 && ingredients.matches(cell.ingredient, slot.stack))
    const [first] = matching
    let needed = cell.ingredient.count * times
    if (first === undefined || matching.reduce((sum, { left }) => sum + left, 0) < needed) return []
    const sources: Array<{ from: SlotRef, count: number }> = []
    for (const slot of matching) {
      const count = Math.min(needed, slot.left)
      if (count > 0) sources.push({ from: slot.from, count })
      slot.left -= count
      needed -= count
    }
    return [{ ...cell, sources, taken: first.stack }]
  })
}

export function draw<Cell extends { readonly ingredient: Ingredient }> (ingredients: Ingredients, cells: readonly Cell[], times: number, slots: readonly SlotRef[], stackAt: (ref: SlotRef) => Stack | undefined): Array<Drawn<Cell>> | undefined {
  const drawn = drawSome(ingredients, cells, times, slots, stackAt)
  return drawn.length === cells.length ? drawn : undefined
}

export interface GridUse {
  readonly from: SlotRef
  readonly stack: Stack
  readonly count: number
}

// of the recipes that match, the lowest priority, then the earliest
export function matchGrid (ingredients: Ingredients, recipes: readonly CraftingRecipe[], grid: ReadonlyArray<readonly [SlotRef, Stack | undefined]>, gridWidth: number): { recipe: CraftingRecipe, uses: GridUse[] } | undefined {
  const filled = grid.flatMap(([from, stack], cell) => stack === undefined ? [] : [{ from, stack, cell }])
  const columns = filled.map(({ cell }) => cell % gridWidth)
  const rows = filled.map(({ cell }) => Math.floor(cell / gridWidth))
  const [left, top] = [Math.min(...columns), Math.min(...rows)]
  const [width, height] = [Math.max(...columns) - left + 1, Math.max(...rows) - top + 1]
  const fits = (ingredient: Ingredient, stack: Stack): boolean => stack.count >= ingredient.count && ingredients.matches(ingredient, stack)
  const shapedUses = (recipe: CraftingRecipe, mirrored: boolean): GridUse[] | undefined => {
    const uses = filled.map(({ from, stack, cell }) => {
      const [x, y] = [cell % gridWidth - left, Math.floor(cell / gridWidth) - top]
      const ingredient = recipe.cells[y * width + (mirrored ? width - 1 - x : x)]
      return ingredient !== undefined && fits(ingredient, stack) ? { from, stack, count: ingredient.count } : undefined
    })
    // the cells the grid leaves empty are the recipe's empty ones
    const defined = uses.filter(use => use !== undefined)
    return defined.length === uses.length && defined.length === recipe.cells.filter(cell => cell !== undefined).length ? defined : undefined
  }
  const shapelessUses = (recipe: CraftingRecipe): GridUse[] | undefined => {
    const assigned = new Map<number, Ingredient>()
    const assign = (cells: ReadonlyArray<Ingredient | undefined>): boolean => {
      const [ingredient, ...rest] = cells
      if (ingredient === undefined) return assigned.size === filled.length
      return filled.some(({ cell, stack }) => {
        if (assigned.has(cell) || !fits(ingredient, stack)) return false
        assigned.set(cell, ingredient)
        if (assign(rest)) return true
        assigned.delete(cell)
        return false
      })
    }
    return assign(recipe.cells) ? filled.flatMap(({ from, stack, cell }) => [...assigned].filter(([used]) => used === cell).map(([, { count }]) => ({ from, stack, count }))) : undefined
  }
  let best: { recipe: CraftingRecipe, uses: GridUse[] } | undefined
  for (const recipe of recipes) {
    if (recipe.recipe.block !== 'crafting_table' || (best !== undefined && recipe.recipe.priority >= best.recipe.recipe.priority)) continue
    const uses = !recipe.shaped
      ? shapelessUses(recipe)
      : recipe.width !== width || recipe.cells.length !== width * height ? undefined : shapedUses(recipe, false) ?? (recipe.symmetric ? shapedUses(recipe, true) : undefined)
    if (uses !== undefined) best = { recipe, uses }
  }
  return best
}

// a shaped recipe from the grid's top left, a shapeless one in the first slots
export function gridCells<Slot> (recipe: CraftingRecipe, grid: readonly Slot[], gridWidth: number): Array<{ ingredient: Ingredient, to: Slot }> {
  return recipe.cells.flatMap((ingredient, index) => {
    const to = grid[recipe.shaped ? Math.floor(index / recipe.width) * gridWidth + index % recipe.width : index]
    return ingredient === undefined || to === undefined ? [] : [{ ingredient, to }]
  })
}

export function withNbt (stack: Stack, value: NbtValue): Stack {
  const { wire } = stack
  const nbt = { version: 1, nbt: { type: 'compound' as const, name: '', value: { ...nbtOf(stack), ...value } } }
  if ('auxiliary_value' in wire) return { ...stack, wire: { ...wire, has_nbt: true, nbt } }
  return { ...stack, wire: { ...wire, extra: { can_place_on: [], can_destroy: [], ...wire.extra, has_nbt: true, nbt } } }
}

export function nbtOf (stack: Stack): NbtValue {
  const { wire } = stack
  return ('auxiliary_value' in wire ? wire : wire.extra)?.nbt?.nbt.value ?? {}
}

export function writtenResult (ingredients: Ingredients, version: BedrockVersion, { networkId, count, metadata, wire }: Stack): ResultItem {
  if ('auxiliary_value' in wire) return { ...wire, auxiliary_value: (metadata << 8) | count }
  const { block_runtime_id: blockRuntimeId, extra } = wire
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.40')) return { network_id: networkId, count, metadata, block_runtime_id: blockRuntimeId, extra }
  return { type: 'name', legacy_type: 1, name: ingredients.namespaced(networkId), metadata, count, block_runtime_id: Number(blockRuntimeId), extra }
}
