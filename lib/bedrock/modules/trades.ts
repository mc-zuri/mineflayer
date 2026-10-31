import type { NBT, Tags, TagType } from 'prismarine-nbt'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { MCProtocol } from '../../types/protocol/Bedrock.d.ts'
import type { Stack } from './items.ts'

type Registry = BedrockBotInternal['registry']
type Fields = NBT['value']
type ReadItem = MCProtocol.Bedrock.Read.Types.Item

// an item of any data value, as every recorded trade's price names its items
const ANY = 32767
const NAMESPACE = /^minecraft:/

/** an item of a trade: its stack as the slots have it, the data value it costs (undefined: any), its NBT */
export interface TradeItem {
  readonly stack: Stack
  readonly metadata: number | undefined
  readonly nbt: NBT | undefined
}

/** an offer of update_trade's offers, as the server computed it for the player */
export interface Offer {
  readonly buyA: TradeItem
  readonly buyB: TradeItem | undefined
  readonly sell: TradeItem
  /** what a trade consumes of buyA and buyB: their counts with the demand and the discounts */
  readonly countA: number
  readonly countB: number
  /** what craft_recipe names: the server's, for the connection */
  readonly netId: number
  readonly uses: number
  readonly maxUses: number
  /** the villager level it needs */
  readonly tier: number
  readonly traderExp: number
  readonly demand: number
  readonly priceMultiplierA: number
}

function isFields (value: Tags[TagType]['value']): value is Fields {
  return typeof value === 'object' && !Array.isArray(value)
}

function numberOf (fields: Fields, key: string): number {
  const value = fields[key]?.value
  return typeof value === 'number' ? value : 0
}

/** the count the server computed, else the item's own */
function countOf (recipe: Fields, key: string, wanted: TradeItem | undefined): number {
  return recipe[key] === undefined ? wanted?.stack.count ?? 0 : numberOf(recipe, key)
}

function compoundOf (fields: Fields, key: string): Fields | undefined {
  const tag = fields[key]
  return tag?.type === 'compound' ? tag.value : undefined
}

function compoundsOf (fields: Fields, key: string): Fields[] {
  const tag = fields[key]
  return tag?.type === 'list' ? tag.value.value.filter(isFields) : []
}

/** the state a block's item places, by its Block compound, as start_game numbered the palette: 0 for an item not a block's */
function blockRuntimeIdOf (registry: Registry, item: Fields): number {
  const block = compoundOf(item, 'Block')
  if (block === undefined) return 0
  const name = String(block['name']?.value).replace(NAMESPACE, '')
  const states = Object.entries(compoundOf(block, 'states') ?? {})
  const state = registry.blockStates?.find(state => state.name === name && states.every(([key, tag]) => Reflect.get(state.states, key)?.value === tag?.value))
  if (state === undefined) throw new Error(`a trade names a state of ${name} the registry has not`)
  // the ids start_game numbered the palette with, which minecraft-data's typings do not give
  return Number(Reflect.get(state, 'stateId'))
}

/** an item as the version's slots have it: an aux value up to 1.16.210; its tag as its NBT; a shield with the blocking tick its layout needs */

function stackOf (registry: Registry, version: BedrockVersion, item: Fields): TradeItem {
  const name = String(item['Name']?.value).replace(NAMESPACE, '')
  const networkId = registry.itemsByName[name]?.id
  if (networkId === undefined) throw new Error(`a trade names ${name}, an item the registry has not`)
  const count = numberOf(item, 'Count')
  const damage = numberOf(item, 'Damage')
  const metadata = damage === ANY ? 0 : damage
  const tag = compoundOf(item, 'tag')
  const nbt: NBT | undefined = tag === undefined ? undefined : { type: 'compound', name: '', value: tag }
  const extra = {
    has_nbt: 0,
    can_place_on: [],
    can_destroy: [],
    ...nbt === undefined ? {} : { has_nbt: true as const, nbt: { version: 1, nbt } },
    ...name === 'shield' ? { blocking_tick: 0n } : {}
  }
  const wire: ReadItem = isBedrockVersionAtLeast(version, 'bedrock_1.16.220')
    ? { network_id: networkId, count, metadata, has_stack_id: 0, block_runtime_id: blockRuntimeIdOf(registry, item), extra }
    : { network_id: networkId, auxiliary_value: (metadata << 8) | count, ...extra }
  return { stack: { networkId, count, metadata, stackId: 0, wire }, metadata: damage === ANY ? undefined : damage, nbt }
}

/** the offers' recipes, in the order the screen lists them */
export function readOffers (registry: Registry, version: BedrockVersion, offers: NBT): Offer[] {
  return compoundsOf(offers.value, 'Recipes').map(recipe => {
    const [buyA, buyB, sell] = ['buyA', 'buyB', 'sell'].map(key => {
      const item = compoundOf(recipe, key)
      return item === undefined ? undefined : stackOf(registry, version, item)
    })
    if (buyA === undefined || sell === undefined) throw new Error('a trade has no buyA or no sell')
    return {
      buyA,
      buyB,
      sell,
      countA: countOf(recipe, 'buyCountA', buyA),
      countB: countOf(recipe, 'buyCountB', buyB),
      netId: numberOf(recipe, 'netId'),
      uses: numberOf(recipe, 'uses'),
      maxUses: numberOf(recipe, 'maxUses'),
      tier: numberOf(recipe, 'tier'),
      traderExp: numberOf(recipe, 'traderExp'),
      demand: numberOf(recipe, 'demand'),
      priceMultiplierA: numberOf(recipe, 'priceMultiplierA')
    }
  })
}

/** a stack a trade takes as the item it costs */
export function matches ({ networkId, metadata }: Stack, wanted: TradeItem): boolean {
  return networkId === wanted.stack.networkId && (wanted.metadata === undefined || metadata === wanted.metadata)
}
