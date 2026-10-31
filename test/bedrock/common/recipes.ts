import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../../lib/types/bedrock-internal.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient } from './server.ts'

type CraftingData = Partial<ClientboundPacketsToWrite['crafting_data']>

const ANY = 32767

// an item of any metadata unless given
export type GivenIngredient = { item: string, metadata?: number, count?: number } | { tag: string } | { alias: string } | { molang: string } | null

export interface GivenOutput {
  item: string
  count: number
  metadata?: number
  blockRuntimeId?: number
  nbt?: object
  // only a shield is written with one
  blockingTick?: bigint
}

export interface GivenRecipe {
  type: 'shaped' | 'shapeless' | 'shulker_box'
  id: string
  networkId: number
  uuid: string
  // a shaped recipe's input is row by row
  width?: number
  height?: number
  input: GivenIngredient[]
  output: GivenOutput[]
  priority?: number
  block?: string
  assumeSymmetry?: boolean
}

// crafting_data names it by its uuid alone
export interface GivenMulti {
  type: 'multi'
  uuid: string
  networkId: number
}

export class ServerRecipes {
  readonly version: BedrockVersion
  private readonly server: FakeBedrockClient
  private readonly registry: BedrockBotInternal['registry']

  constructor (server: FakeBedrockClient, registry: BedrockBotInternal['registry']) {
    this.server = server
    this.registry = registry
    this.version = server.codec.version
  }

  send (recipes: ReadonlyArray<GivenRecipe | GivenMulti>, clear = true): void {
    const written = recipes.map(recipe => ({ type: recipe.type, recipe: recipe.type === 'multi' ? { uuid: recipe.uuid, network_id: recipe.networkId } : this.recipe(recipe) }))
    const cleared = this.atLeast('bedrock_1.17.30') ? { clear_recipes: clear } : { is_clean: clear }
    const of = (type: string): object[] => written.filter(recipe => recipe.type === type).map(({ recipe }) => recipe)
    const lists = this.atLeast('bedrock_1.26.40') ? { shaped_recipes: of('shaped'), shapeless_recipes: of('shapeless'), shulker_box_recipes: of('shulker_box'), multi_recipes: of('multi') } : { recipes: written }
    this.server.send('crafting_data', { ...lists, ...cleared } as CraftingData)
  }

  private recipe (recipe: GivenRecipe): object {
    const input = recipe.input.map(ingredient => this.descriptor(ingredient))
    const output = recipe.output.map(given => this.output(given))
    const shaped = recipe.type === 'shaped'
    const height = recipe.height ?? 1
    // up to 1.26.30 the codec groups a shaped recipe's cells, `height` a group, the wire row by row all the same
    const grouped = shaped && !this.atLeast('bedrock_1.26.40') ? Array.from({ length: input.length / height }, (_, group) => input.slice(group * height, group * height + height)) : input
    return {
      recipe_id: recipe.id,
      ...shaped ? { width: recipe.width ?? 1, height } : {},
      input: grouped,
      output,
      uuid: recipe.uuid,
      block: recipe.block ?? 'crafting_table',
      priority: recipe.priority ?? 0,
      ...shaped && this.atLeast('bedrock_1.20.80') ? { assume_symmetry: recipe.assumeSymmetry ?? true } : {},
      ...this.atLeast('bedrock_1.21.0') ? { unlocking_requirement: { context: 'none', ingredients: [] } } : {},
      network_id: recipe.networkId
    }
  }

  private descriptor (given: GivenIngredient): object {
    const kinds = this.atLeast('bedrock_1.19.30')
    const named = this.atLeast('bedrock_1.26.40')
    if (given === null) return named ? { type: 'invalid', metadata: ANY, count: 0 } : kinds ? { type: 'invalid', count: 0 } : { network_id: 0 }
    if ('tag' in given) return named ? { type: 'valid', descriptor_type: 'item_tag', tag: given.tag, metadata: ANY, count: 1 } : { type: 'item_tag', tag: given.tag, count: 1 }
    if ('molang' in given) return named ? { type: 'valid', descriptor_type: 'molang', expression: given.molang, version: 0, count: 1 } : { type: 'molang', expression: given.molang, version: 0, count: 1 }
    if ('alias' in given) return named ? { type: 'valid', descriptor_type: 'name', name: given.alias, metadata: ANY, count: 1 } : { type: 'complex_alias', name: given.alias, count: 1 }
    const metadata = given.metadata ?? ANY
    const count = given.count ?? 1
    // 1.26.60 names an item with its data
    if (named) return { type: 'valid', descriptor_type: 'name', name: `minecraft:${given.item}${this.atLeast('bedrock_1.26.60') && metadata !== ANY ? `:${metadata}` : ''}`, metadata, count }
    const networkId = this.registry.itemsByName[given.item]?.id ?? 0
    return kinds ? { type: 'int_id_meta', network_id: networkId, metadata, count } : { network_id: networkId, network_data: metadata, count }
  }

  private output ({ item, count, metadata = 0, blockRuntimeId = 0, nbt, blockingTick }: GivenOutput): object {
    const networkId = this.registry.itemsByName[item]?.id ?? 0
    const extra = { ...nbt === undefined ? { has_nbt: 0 } : { has_nbt: true, nbt: { version: 1, nbt } }, can_place_on: [], can_destroy: [], ...blockingTick === undefined ? {} : { blocking_tick: blockingTick } }
    if (!this.atLeast('bedrock_1.16.220')) return { network_id: networkId, auxiliary_value: (metadata << 8) | count, ...extra }
    return { network_id: networkId, count, metadata, block_runtime_id: blockRuntimeId, extra }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.version, since)
  }
}
