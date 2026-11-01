import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, RespondedSlot } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { GivenRecipe } from './common/recipes.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The recorded values are the vanilla client's against Bedrock Dedicated Server.

const TABLE_AT = Object.freeze({ x: 2, y: -60, z: 0 })
const ANY = 32767

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface Smithing extends TestBot {
  errors: string[]
  inventory: ServerInventory
  recipes: ServerRecipes
  idOf: (name: string) => number
}

async function joined (version: BedrockVersion): Promise<Smithing> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), recipes: new ServerRecipes(testBot.server, testBot.bot.registry), idOf }
}

function openTable (server: FakeBedrockClient, windowId = 2): void {
  server.send('container_open', { window_id: windowId, window_type: 'smithing_table', coordinates: TABLE_AT, runtime_entity_id: -1n })
}

/** an item of any data, a tag's items, or none (an invalid descriptor) */
type GivenIngredient = string | { tag: string } | null

/** a smithing_transform (of no template field before 1.19.80) or a smithing_trim, as the version's servers send it */
interface GivenSmithing {
  id: string
  networkId: number
  template?: GivenIngredient
  base: GivenIngredient
  addition: GivenIngredient
  /** a transform's: none, a trim */
  result?: string
}

const TRIMMING = Object.freeze({ template: { tag: 'minecraft:trim_templates' }, base: { tag: 'minecraft:trimmable_armors' }, addition: { tag: 'minecraft:trim_materials' } })

function sendSmithing ({ server, bot }: Pick<TestBot, 'server' | 'bot'>, given: readonly GivenSmithing[], clear = true): void {
  const { version } = server.codec
  const named = atLeast(version, 'bedrock_1.26.40')
  const descriptor = (ingredient: GivenIngredient): object => {
    if (ingredient === null) return named ? { type: 'invalid', metadata: ANY, count: 0 } : { type: 'invalid', count: 0 }
    if (typeof ingredient === 'object') return named ? { type: 'valid', descriptor_type: 'item_tag', tag: ingredient.tag, metadata: ANY, count: 1 } : { type: 'item_tag', tag: ingredient.tag, count: 1 }
    return named ? { type: 'valid', descriptor_type: 'name', name: `minecraft:${ingredient}`, metadata: ANY, count: 1 } : { type: 'int_id_meta', network_id: bot.registry.itemsByName[ingredient]?.id ?? 0, metadata: ANY, count: 1 }
  }
  const template = (recipe: GivenSmithing): object => atLeast(version, 'bedrock_1.19.80') ? { template: descriptor(recipe.template ?? null) } : {}
  const written = given.map(recipe => recipe.result === undefined
    ? { type: 'smithing_trim', recipe: { recipe_id: recipe.id, ...template(recipe), input: descriptor(recipe.base), addition: descriptor(recipe.addition), block: 'smithing_table', network_id: recipe.networkId } }
    : {
        type: 'smithing_transform',
        recipe: {
          recipe_id: recipe.id,
          ...template(recipe),
          base: descriptor(recipe.base),
          addition: descriptor(recipe.addition),
          result: { network_id: bot.registry.itemsByName[recipe.result]?.id ?? 0, count: 1, metadata: 0, block_runtime_id: 0, extra: { has_nbt: 0, can_place_on: [], can_destroy: [] } },
          tag: 'smithing_table',
          network_id: recipe.networkId
        }
      })
  const of = (type: string): object[] => written.filter(recipe => recipe.type === type).map(({ recipe }) => recipe)
  const lists = named ? { smithing_transform_recipes: of('smithing_transform'), smithing_trim_recipes: of('smithing_trim') } : { recipes: written }
  // the version's layout
  server.send('crafting_data', { ...lists, potion_type_recipes: [], potion_container_recipes: [], clear_recipes: clear } as ClientboundPacketsToWrite['crafting_data'])
}

/** recorded on 1.20.0.1 (reduced_smithing), the coast pattern and two materials of the 18 and 11; none before 1.19.80 */
function sendTrims (server: FakeBedrockClient): void {
  if (!atLeast(server.codec.version, 'bedrock_1.19.80')) return
  server.send('trim_data', {
    patterns: [{ item_name: 'minecraft:ward_armor_trim_smithing_template', pattern: 'ward' }, { item_name: 'minecraft:coast_armor_trim_smithing_template', pattern: 'coast' }],
    materials: [{ material: 'quartz', color: '§h', item_name: 'minecraft:quartz' }, { material: 'diamond', color: '§s', item_name: 'minecraft:diamond' }]
  })
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentAction = SentRequest['actions'][number]
type SentSlot = NonNullable<SentAction['source']>
type ResultItem = NonNullable<SentAction['result_items']>[number]

function slotName (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** a tag's value, its compounds' too */
function plain (tag: Tags[TagType]): string | number | object {
  if (tag.type !== 'compound') return typeof tag.value === 'bigint' ? Number(tag.value) : tag.value as string | number
  return Object.fromEntries(Object.entries(tag.value).flatMap(([name, value]) => value === undefined ? [] : [[name, plain(value)]]))
}

/** each request the bot sent since the last call: its id, its actions (a legacy type id after a slash), a craft's recipe and times, a result's item, count, data and NBT */
function requestsSince ({ server, bot }: Pick<TestBot, 'server' | 'bot'>): () => string[] {
  const resultOf = (item: ResultItem): string => {
    const [count, metadata] = 'auxiliary_value' in item && item.auxiliary_value !== undefined ? [item.auxiliary_value & 0xff, item.auxiliary_value >> 8] : [Number(item.count), Number(item.metadata)]
    const name = 'network_id' in item ? bot.registry.items[Number(item.network_id)]?.name : item.name?.replace('minecraft:', '')
    const nbt = ('extra' in item ? item.extra?.nbt : 'nbt' in item ? item.nbt : undefined)?.nbt
    return `${name} ${count}:${metadata}${nbt === undefined ? '' : ` ${JSON.stringify(plain(nbt))}`}`
  }
  const actionOf = (action: SentAction): string => {
    const legacy = 'legacy_type_id' in action ? `/${action.legacy_type_id}` : ''
    const craft = action.recipe_network_id === undefined ? '' : ` ${action.recipe_network_id}${action.times_crafted === undefined ? '' : ` ×${action.times_crafted}`}`
    const results = (action.result_items ?? []).map(item => ` ${resultOf(item)}`).join('')
    const slots = [action.source, action.destination].filter(slot => slot !== undefined).map(slotName).join(' → ')
    return `${String(action.type_id)}${legacy}${craft}${results}${action.count === undefined ? '' : ` ${action.count}`}${slots === '' ? '' : ` ${slots}`}`
  }
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => `${id} ${actions.map(actionOf).join(', ')}`)
  }
}

/** the hex of the requests the bot sent since the last call */
function toldSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => name === 'item_stack_request').map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

/** a click on the output, then a tick: one sending nothing does not fail (one sending a request waits for its answer) */
async function clickOutput ({ bot, driver, errors }: Smithing, slot: number, mouseButton = 0, mode = 0): Promise<void> {
  const failed: string[] = []
  bot.clickWindow(slot, mouseButton, mode).catch((error: Error) => { failed.push(error.message) })
  await driver.tick()
  assert.deepStrictEqual([...failed, ...errors], [])
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** an item of the slots, as the vanilla client put it: its stack id */
interface Placed {
  item: string
  stackId: number
}

/** recorded in reduced_stations (smithing.netherite, smithing.trim): the items put in the slots, then a left click on the result */
interface RecordedSmith {
  from: BedrockVersion
  to: BedrockVersion
  recordedOn: BedrockVersion
  what: string
  /** none: crafting_data has none; a shapeless one of the smithing table; a transform or a trim */
  recipe: 'none' | 'shapeless' | GivenSmithing
  template?: Placed
  base: Placed
  addition: Placed
  request: number
  result: string
  described: string
  told: string
}

const SWORD: Readonly<Pick<GivenSmithing, 'id' | 'base' | 'addition' | 'result'>> = Object.freeze({ id: 'minecraft:smithing_netherite_sword', base: 'diamond_sword', addition: 'netherite_ingot', result: 'netherite_sword' })
const UPGRADE = 'netherite_upgrade_smithing_template'
const COAST = 'coast_armor_trim_smithing_template'
const NETHERITE = '{"Damage":0}'
const TRIMMED = '{"Damage":0,"Trim":{"Material":"diamond","Pattern":"coast"}}'

const SMITHS: readonly RecordedSmith[] = [
  {
    // recorded on 1.16.201.2: crafting_data has no smithing recipe, the request names none; the result an aux item
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    recordedOn: 'bedrock_1.16.201',
    what: 'a diamond sword upgraded',
    recipe: 'none',
    base: { item: 'diamond_sword', stackId: 3090 },
    addition: { item: 'netherite_ingot', stackId: 3092 },
    request: -4199,
    result: 'netherite_sword',
    described: `-4199 non_implemented, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#3092, consume 1 smithing_table_input:51#3090, take 1 creative_output:50#-4199 → cursor:0#0`,
    told: '930101cd41050d0e01a00902ffff010a00030644616d616765000000000105010434a83005010333a43000013b32cd413a000000'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.18.0',
    recordedOn: 'bedrock_1.16.220',
    what: 'a diamond sword upgraded',
    recipe: 'none',
    base: { item: 'diamond_sword', stackId: 1034 },
    addition: { item: 'netherite_ingot', stackId: 1036 },
    request: -1873,
    result: 'netherite_sword',
    described: `-1873 non_implemented, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#1036, consume 1 smithing_table_input:51#1034, take 1 creative_output:50#-1873 → cursor:0#0`,
    told: '930101a11d050e0f01a009010000001cffff010a000003060044616d616765000000000000000000000000000105010434981005010333941000013b32a11d3a000000'
  },
  {
    // recorded on 1.18.12.1: crafting_data's shapeless recipe of the smithing table named
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.50',
    recordedOn: 'bedrock_1.18.11',
    what: 'a diamond sword upgraded',
    recipe: 'shapeless',
    base: { item: 'diamond_sword', stackId: 3013 },
    addition: { item: 'netherite_ingot', stackId: 3015 },
    request: -4293,
    result: 'netherite_sword',
    described: `-4293 craft_recipe 9, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#3015, consume 1 smithing_table_input:51#3013, take 1 creative_output:50#-4293 → cursor:0#0`,
    told: '9301018943050c091301b809010000001cffff010a000003060044616d6167650000000000000000000000000001050104348e2f050103338a2f00013b3289433a000000'
  },
  {
    // recorded on 1.19.60.3: a smithing_transform, of no template
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.70',
    recordedOn: 'bedrock_1.19.60',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 135 },
    base: { item: 'diamond_sword', stackId: 3387 },
    addition: { item: 'netherite_ingot', stackId: 3389 },
    request: -4925,
    result: 'netherite_sword',
    described: `-4925 craft_recipe 135, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#3389, consume 1 smithing_table_input:51#3387, take 1 creative_output:50#-4925 → cursor:0#0`,
    told: '930101f94c050c87011301c209010000001cffff010a000003060044616d616765000000000000000000000000000105010434fa3405010333f63400013c32f94c3b000000ffffffff'
  },
  {
    // recorded on 1.19.80.2: the template invalid, the base consumed first
    from: 'bedrock_1.19.80',
    to: 'bedrock_1.19.80',
    recordedOn: 'bedrock_1.19.80',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 141, template: null },
    base: { item: 'diamond_sword', stackId: 2188 },
    addition: { item: 'netherite_ingot', stackId: 2190 },
    request: -3163,
    result: 'netherite_sword',
    described: `-3163 craft_recipe 141, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_input:51#2188, consume 1 smithing_table_material:52#2190, take 1 creative_output:50#-3163 → cursor:0#0`,
    told: '930101b531050c8d011301c209010000001cffff010a000003060044616d6167650000000000000000000000000001050103339822050104349c2200013c32b5313b000000ffffffff'
  },
  {
    // recorded on 1.20.0.1: the template first
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.21.2',
    recordedOn: 'bedrock_1.20.0',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 69, template: UPGRADE },
    template: { item: UPGRADE, stackId: 2115 },
    base: { item: 'diamond_sword', stackId: 2117 },
    addition: { item: 'netherite_ingot', stackId: 2119 },
    request: -3011,
    result: 'netherite_sword',
    described: `-3011 craft_recipe 69, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_template:53#2115, consume 1 smithing_table_input:51#2117, consume 1 smithing_table_material:52#2119, take 1 creative_output:50#-3011 → cursor:0#0`,
    told: '930101852f060c451301c409010000001cffff010a000003060044616d616765000000000000000000000000000105013d358621050103338a21050104348e2100013c32852f3b000000ffffffff'
  },
  {
    // recorded on 1.20.0.1: the trim's names are trim_data's
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.21.2',
    recordedOn: 'bedrock_1.20.0',
    what: 'iron boots trimmed',
    recipe: { id: 'minecraft:smithing_armor_trim', networkId: 60, ...TRIMMING },
    template: { item: COAST, stackId: 2122 },
    base: { item: 'iron_boots', stackId: 2124 },
    addition: { item: 'diamond', stackId: 2126 },
    request: -3027,
    result: 'iron_boots',
    described: `-3027 craft_recipe 60, results_deprecated iron_boots 1:0 ${TRIMMED}, consume 1 smithing_table_template:53#2122, consume 1 smithing_table_input:51#2124, consume 1 smithing_table_material:52#2126, take 1 creative_output:50#-3027 → cursor:0#0`,
    told: '930101a52f060c3c1301b8050100000049ffff010a000003060044616d616765000000000a04005472696d0808004d6174657269616c07006469616d6f6e640807005061747465726e0500636f617374000000000000000000000105013d359421050103339821050104349c2100013c32a52f3b000000ffffffff'
  },
  {
    // recorded on 1.21.20.3: the times crafted
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.26.30',
    recordedOn: 'bedrock_1.21.20',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 924, template: UPGRADE },
    template: { item: UPGRADE, stackId: 2596 },
    base: { item: 'diamond_sword', stackId: 2598 },
    addition: { item: 'netherite_ingot', stackId: 2600 },
    request: -3253,
    result: 'netherite_sword',
    described: `-3253 craft_recipe 924 ×1, results_deprecated netherite_sword 1:0 ${NETHERITE}, consume 1 smithing_table_template:53#2596, consume 1 smithing_table_input:51#2598, consume 1 smithing_table_material:52#2600, take 1 creative_output:50#-3253 → cursor:0#0`,
    told: '930101e932060c9c07011301de09010000001cffff010a000003060044616d616765000000000000000000000000000105013d0000000035c8280501030000000033cc280501040000000034d02800013c0000000032e9323b00000000000000ffffffff'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.26.30',
    recordedOn: 'bedrock_1.21.20',
    what: 'iron boots trimmed',
    recipe: { id: 'minecraft:smithing_armor_trim', networkId: 915, ...TRIMMING },
    template: { item: COAST, stackId: 2603 },
    base: { item: 'iron_boots', stackId: 2605 },
    addition: { item: 'diamond', stackId: 2607 },
    request: -3269,
    result: 'iron_boots',
    described: `-3269 craft_recipe 915 ×1, results_deprecated iron_boots 1:0 ${TRIMMED}, consume 1 smithing_table_template:53#2603, consume 1 smithing_table_input:51#2605, consume 1 smithing_table_material:52#2607, take 1 creative_output:50#-3269 → cursor:0#0`,
    told: '9301018933060c9307011301c4050100000049ffff010a000003060044616d616765000000000a04005472696d0808004d6174657269616c07006469616d6f6e640807005061747465726e0500636f617374000000000000000000000105013d0000000035d6280501030000000033da280501040000000034de2800013c000000003289333b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.51.1: each action's legacy type, the result named
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    recordedOn: 'bedrock_1.26.51',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 1567, template: UPGRADE },
    template: { item: UPGRADE, stackId: 52 },
    base: { item: 'diamond_sword', stackId: 54 },
    addition: { item: 'netherite_ingot', stackId: 56 },
    request: -131,
    result: 'netherite_sword',
    described: `-131 craft_recipe/12 1567 ×1, results_deprecated/19 netherite_sword 1:0 ${NETHERITE}, consume/5 1 smithing_table_template:53#52, consume/5 1 smithing_table_input:51#54, consume/5 1 smithing_table_material:52#56, take/0 1 creative_output:50#-131 → cursor:0#0`,
    told: '9301018502060a0c9f0c011113010101196d696e6563726166743a6e65746865726974655f73776f7264000100001cffff010a000003060044616d61676500000000000000000000000000010505013d00353400000005050103003336000000050501040034380000000000013c00327dffffff3b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.51.1
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    recordedOn: 'bedrock_1.26.51',
    what: 'iron boots trimmed',
    recipe: { id: 'minecraft:smithing_armor_trim', networkId: 1558, ...TRIMMING },
    template: { item: COAST, stackId: 59 },
    base: { item: 'iron_boots', stackId: 61 },
    addition: { item: 'diamond', stackId: 63 },
    request: -147,
    result: 'iron_boots',
    described: `-147 craft_recipe/12 1558 ×1, results_deprecated/19 iron_boots 1:0 ${TRIMMED}, consume/5 1 smithing_table_template:53#59, consume/5 1 smithing_table_input:51#61, consume/5 1 smithing_table_material:52#63, take/0 1 creative_output:50#-147 → cursor:0#0`,
    told: '930101a502060a0c960c011113010101146d696e6563726166743a69726f6e5f626f6f74730001000049ffff010a000003060044616d616765000000000a04005472696d0808004d6174657269616c07006469616d6f6e640807005061747465726e0500636f61737400000000000000000000010505013d00353b0000000505010300333d0000000505010400343f0000000000013c00326dffffff3b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.60.5: the results' legacy type after 1.26.60's craft_reserved
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    recordedOn: 'bedrock_1.26.60',
    what: 'a diamond sword upgraded',
    recipe: { ...SWORD, networkId: 4439, template: UPGRADE },
    template: { item: UPGRADE, stackId: 2743 },
    base: { item: 'diamond_sword', stackId: 2745 },
    addition: { item: 'netherite_ingot', stackId: 2747 },
    request: -3417,
    result: 'netherite_sword',
    described: `-3417 craft_recipe/12 4439 ×1, results_deprecated/20 netherite_sword 1:0 ${NETHERITE}, consume/5 1 smithing_table_template:53#2743, consume/5 1 smithing_table_input:51#2745, consume/5 1 smithing_table_material:52#2747, take/0 1 creative_output:50#-3417 → cursor:0#0`,
    told: '930101b135060a0cd722011214010101196d696e6563726166743a6e65746865726974655f73776f7264000100001cffff010a000003060044616d61676500000000000000000000000000010505013d0035b70a0000050501030033b90a0000050501040034bb0a00000000013c0032a7f2ffff3b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    recordedOn: 'bedrock_1.26.60',
    what: 'iron boots trimmed',
    recipe: { id: 'minecraft:smithing_armor_trim', networkId: 4430, ...TRIMMING },
    template: { item: COAST, stackId: 2750 },
    base: { item: 'iron_boots', stackId: 2752 },
    addition: { item: 'diamond', stackId: 2754 },
    request: -3433,
    result: 'iron_boots',
    described: `-3433 craft_recipe/12 4430 ×1, results_deprecated/20 iron_boots 1:0 ${TRIMMED}, consume/5 1 smithing_table_template:53#2750, consume/5 1 smithing_table_input:51#2752, consume/5 1 smithing_table_material:52#2754, take/0 1 creative_output:50#-3433 → cursor:0#0`,
    told: '930101d135060a0cce22011214010101146d696e6563726166743a69726f6e5f626f6f74730001000049ffff010a000003060044616d616765000000000a04005472696d0808004d6174657269616c07006469616d6f6e640807005061747465726e0500636f61737400000000000000000000010505013d0035be0a0000050501030033c00a0000050501040034c20a00000000013c003297f2ffff3b00000000000000ffffffff'
  }
]

/** 1.18.11 – 1.19.50's: the base and the ingot, recorded as crafting_data sent it */
function upgradeRecipe (networkId: number, base = 'diamond_sword', result = 'netherite_sword', block = 'smithing_table'): GivenRecipe {
  return { type: 'shapeless', id: `minecraft:smithingtable_${base}_to_${result}`, networkId, uuid: `00000000-0000-0000-0000-${String(networkId).padStart(12, '0')}`, block, priority: 2, input: [{ item: base }, { item: 'netherite_ingot' }], output: [{ item: result, count: 1 }] }
}

/** the vanilla client's other gestures on the result, a netherite upgrade's template, diamond sword and ingot in the table, hotbar slot 0 empty (recorded on 1.26.51.1): its key 1 sent nothing */
const GESTURES: ReadonlyArray<{ what: string, mode: number, button: number, request: number, stacks: readonly [number, number, number], told: string | undefined }> = [
  {
    what: 'a shift left click',
    mode: 1,
    button: 0,
    request: -5067,
    stacks: [1320, 1321, 1322],
    told: '930101954f060a0c9f0c011113010101196d696e6563726166743a6e65746865726974655f73776f7264000100001cffff010a000003060044616d61676500000000000000000000000000010505013d003528050000050501030033290500000505010400342a0500000101013c003235ecffff0c00000000000000ffffffff'
  },
  {
    what: 'a shift right click',
    mode: 1,
    button: 1,
    request: -5721,
    stacks: [1480, 1481, 1482],
    told: '930101b159060a0c9f0c011113010101196d696e6563726166743a6e65746865726974655f73776f7264000100001cffff010a000003060044616d61676500000000000000000000000000010505013d0035c8050000050501030033c9050000050501040034ca0500000101013c0032a7e9ffff0c00000000000000ffffffff'
  },
  { what: 'the key 1', mode: 2, button: 0, request: -5031, stacks: [1314, 1315, 1316], told: undefined }
]

describe('bedrock smithing table', () => {
  describe('the vanilla client\'s shift clicks place the result in the inventory\'s first slot with room; its key 1 over it sends nothing (recorded on 1.26.51.1)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: ${GESTURES.map(({ what }) => what).join(', ')}`, async () => {
        const told: string[][] = []
        for (const { mode, button, request, stacks: [template, base, addition] } of GESTURES) {
          const smithing = await joined(version)
          const { bot, internal, server, driver, inventory, idOf } = smithing
          sendSmithing(smithing, [{ ...SWORD, networkId: 1567, template: UPGRADE }])
          sendTrims(server)
          openTable(server)
          inventory.slot('ui', 53, { id: idOf(UPGRADE), count: 1, stackId: template })
          inventory.slot('ui', 51, { id: idOf('diamond_sword'), count: 1, stackId: base })
          inventory.slot('ui', 52, { id: idOf('netherite_ingot'), count: 1, stackId: addition })
          await driver.tick()
          internal._core.requestIds.continueProcess(request)
          const sent = toldSince(server)
          bot.clickWindow(3, button, mode).catch(() => {})
          await driver.tick()
          told.push(sent())
          bot.end()
        }
        assert.deepStrictEqual(told, GESTURES.map(({ told }) => told === undefined ? [] : [told]))
      })
    }
  })

  for (const recorded of SMITHS) {
    describe(`the vanilla client smithing, the result taken to the cursor (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: ${recorded.what}`, async () => {
          const smithing = await joined(version)
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = smithing
          if (recorded.recipe === 'shapeless') recipes.send([upgradeRecipe(9)])
          else if (recorded.recipe !== 'none') sendSmithing(smithing, [recorded.recipe])
          sendTrims(server)
          openTable(server)
          const placed = [[53, recorded.template], [51, recorded.base], [52, recorded.addition]] as const
          for (const [slot, given] of placed) if (given !== undefined) inventory.slot('ui', slot, { id: idOf(given.item), count: 1, stackId: given.stackId })
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.request)
          const [described, told] = [requestsSince(smithing), toldSince(server)]
          const window = bot.currentWindow
          assert.ok(window !== null)
          const clicked = bot.clickWindow(window.craftingResultSlot, 0, 0)
          await driver.tick()
          assert.deepStrictEqual(described(), [recorded.described])
          if (version === recorded.recordedOn) assert.deepStrictEqual(told(), [recorded.told])
          const emptied = placed.flatMap(([slot, given]): RespondedSlot[] => given === undefined ? [] : [{ container: slot === 53 ? 'smithing_table_template' : slot === 51 ? 'smithing_table_input' : 'smithing_table_material', slot, count: 0 }])
          inventory.respond(recorded.request, [...emptied, { container: 'cursor', slot: 0, count: 1, stackId: recorded.addition.stackId + 1 }])
          await driver.tick()
          await clicked
          assert.deepStrictEqual([window.slots.slice(0, window.craftingResultSlot), window.selectedItem?.name, countAndId(window.selectedItem), errors], [
            Array.from({ length: window.craftingResultSlot }, () => null), recorded.result, [1, recorded.addition.stackId + 1], []
          ])
          bot.end()
        })
      }
    })
  }

  describe('the window: Java\'s 1.16 layout up to 1.19.80 (the base, the addition, the result), its 1.20 one from 1.20.0 (the template first); the close gives back the cursor\'s item, then the base\'s, the addition\'s and the template\'s, after the inventory\'s animation from 1.21.120', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.80', 'bedrock_1.20.0')) {
      it(`bedrock ${version}: the cursor's and every slot's items given back, with the close`, async () => {
        const smithing = await joined(version)
        const { bot, internal, server, driver, inventory, idOf } = smithing
        openTable(server)
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 10 })
        inventory.slot('ui', 51, { id: idOf('diamond_sword'), count: 1, stackId: 11 })
        inventory.slot('ui', 52, { id: idOf('netherite_ingot'), count: 1, stackId: 12 })
        if (atLeast(version, 'bedrock_1.20.0')) inventory.slot('ui', 53, { id: idOf(UPGRADE), count: 1, stackId: 13 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-3)
        const described = requestsSince(smithing)
        const window = bot.currentWindow
        assert.ok(window !== null)
        const layout = [window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot]
        const slots = window.slots.slice(0, window.inventoryStart).map(item => item?.name ?? null)
        bot.closeWindow(window).catch(() => {})
        await driver.frame(31.25)
        assert.deepStrictEqual([layout, slots, described(), server.sentOf('container_close').length], atLeast(version, 'bedrock_1.20.0')
          ? [['minecraft:smithing', 'Upgrade Gear', 40, 4, 3], [UPGRADE, 'diamond_sword', 'netherite_ingot', null], [
              '-3 place 1 cursor:0#10 → hotbar_and_inventory:0#0',
              '-5 place 1 smithing_table_input:51#11 → hotbar_and_inventory:1#0',
              '-7 place 1 smithing_table_material:52#12 → hotbar_and_inventory:2#0',
              '-9 place 1 smithing_table_template:53#13 → hotbar_and_inventory:3#0'
            ], 1]
          : [['minecraft:smithing', 'Upgrade Gear', 39, 3, 2], ['diamond_sword', 'netherite_ingot', null], [
              '-3 place 1 cursor:0#10 → hotbar_and_inventory:0#0',
              '-5 place 1 smithing_table_input:51#11 → hotbar_and_inventory:1#0',
              '-7 place 1 smithing_table_material:52#12 → hotbar_and_inventory:2#0'
            ], 1])
        bot.end()
      })
    }
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.111', 'bedrock_1.21.120')) {
      // recorded in containers_smithing_table on 1.26.51.1: place(smithing_table_input:51), place(smithing_table_material:52), place(smithing_table_template:53), then container_close
      it(`bedrock ${version}: the close ${atLeast(version, 'bedrock_1.21.120') ? 'after the inventory\'s animation' : 'with the items'}`, async () => {
        const { bot, server, driver, inventory, idOf } = await joined(version)
        openTable(server)
        inventory.slot('ui', 51, { id: idOf('diamond_sword'), count: 1, stackId: 11 })
        await driver.tick()
        const window = bot.currentWindow
        assert.ok(window !== null)
        bot.closeWindow(window).catch(() => {})
        await driver.frame(31.25)
        const atOnce = server.sentOf('container_close').length
        let frames = 0
        while (server.sentOf('container_close').length === 0 && frames < 20) {
          await driver.frame(31.25)
          frames++
        }
        assert.deepStrictEqual([atOnce, frames], atLeast(version, 'bedrock_1.21.120') ? [0, 9] : [1, 0])
        bot.end()
      })
    }
  })

  describe('up to 1.18.0, with no smithing recipe, only a diamond item and a netherite ingot are upgraded', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.18.0')) {
      it(`bedrock ${version}: not an iron sword, a diamond horse armor (no netherite one), nor a diamond sword with a diamond`, async () => {
        const smithing = await joined(version)
        const { bot, driver, server, inventory, idOf } = smithing
        openTable(server)
        await driver.tick()
        const described = requestsSince(smithing)
        const made: string[][] = []
        for (const [base, addition] of [['iron_sword', 'netherite_ingot'], ['diamond_horse_armor', 'netherite_ingot'], ['diamond_sword', 'diamond'], ['diamond_pickaxe', 'netherite_ingot']]) {
          inventory.slot('ui', 51, { id: idOf(base ?? ''), count: 1, stackId: 11 })
          inventory.slot('ui', 52, { id: idOf(addition ?? ''), count: 1, stackId: 12 })
          await driver.tick()
          await clickOutput(smithing, 2)
          made.push(described())
        }
        assert.deepStrictEqual(made, [[], [], [], [
          `-3 non_implemented, results_deprecated netherite_pickaxe 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#12, consume 1 smithing_table_input:51#11, take 1 creative_output:50#-3 → cursor:0#0`
        ]])
        bot.end()
      })
    }
  })

  describe('1.18.11 – 1.19.50: the shapeless recipes of the smithing table', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.11', 'bedrock_1.19.50')) {
      it(`bedrock ${version}: not another block's, nor one of a single ingredient; and no upgrade without one`, async () => {
        const smithing = await joined(version)
        const { bot, driver, server, inventory, recipes, idOf } = smithing
        const single: GivenRecipe = { ...upgradeRecipe(3, 'diamond_axe', 'netherite_axe'), input: [{ item: 'diamond_axe' }] }
        recipes.send([upgradeRecipe(1, 'diamond_sword', 'netherite_sword', 'crafting_table'), single, upgradeRecipe(2, 'diamond_hoe', 'netherite_hoe')])
        openTable(server)
        await driver.tick()
        const described = requestsSince(smithing)
        const made: string[][] = []
        for (const base of ['diamond_sword', 'diamond_axe', 'diamond_hoe']) {
          inventory.slot('ui', 51, { id: idOf(base), count: 1, stackId: 11 })
          inventory.slot('ui', 52, { id: idOf('netherite_ingot'), count: 1, stackId: 12 })
          await driver.tick()
          await clickOutput(smithing, 2)
          made.push(described())
        }
        assert.deepStrictEqual(made, [[], [], [
          `-3 craft_recipe 2, results_deprecated netherite_hoe 1:0 ${NETHERITE}, consume 1 smithing_table_material:52#12, consume 1 smithing_table_input:51#11, take 1 creative_output:50#-3 → cursor:0#0`
        ]])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const NETHERITE_SWORD: GivenSmithing = { ...SWORD, networkId: 1, template: UPGRADE }
    const TRIM: GivenSmithing = { id: 'minecraft:smithing_armor_trim', networkId: 2, ...TRIMMING }

    /** the table open, its slots holding the template, the base and the addition given */
    async function table (given: readonly GivenSmithing[], template: string | null, base: string | null, addition: string | null, base_?: Partial<Given>): Promise<Smithing & { described: () => string[] }> {
      const smithing = await joined(version)
      const { server, driver, inventory, idOf } = smithing
      sendSmithing(smithing, given)
      sendTrims(server)
      openTable(server)
      if (template !== null) inventory.slot('ui', 53, { id: idOf(template), count: 1, stackId: 10 })
      if (base !== null) inventory.slot('ui', 51, { id: idOf(base), count: 1, stackId: 11, ...base_ })
      if (addition !== null) inventory.slot('ui', 52, { id: idOf(addition), count: 1, stackId: 12 })
      await driver.tick()
      return { ...smithing, described: requestsSince(smithing) }
    }

    async function clicked (smithing: Smithing, mouseButton = 0, mode = 0): Promise<void> {
      await clickOutput(smithing, 3, mouseButton, mode)
    }

    it('sends nothing while the slots match no recipe: an item missing, another item, a material or a pattern trim_data does not name, a template not the recipe\'s', async () => {
      const cases: Array<[string | null, string | null, string | null]> = [
        [UPGRADE, 'diamond_sword', null], [UPGRADE, null, 'netherite_ingot'], [null, 'diamond_sword', 'netherite_ingot'], [UPGRADE, 'iron_sword', 'netherite_ingot'], [UPGRADE, 'diamond_sword', 'diamond'],
        [COAST, 'diamond_sword', 'netherite_ingot'], [UPGRADE, 'iron_boots', 'diamond'], ['dune_armor_trim_smithing_template', 'iron_boots', 'diamond'], [COAST, 'iron_boots', 'emerald'], [COAST, 'iron_boots', 'dirt']
      ]
      const sent: string[][] = []
      for (const [template, base, addition] of cases) {
        const smithing = await table([NETHERITE_SWORD, TRIM], template, base, addition)
        await clicked(smithing)
        sent.push(smithing.described())
        smithing.bot.end()
      }
      // a template trim_data names, not the recipe's
      const ward = await table([{ ...TRIM, template: COAST }], 'ward_armor_trim_smithing_template', 'iron_boots', 'diamond')
      await clicked(ward)
      sent.push(ward.described())
      ward.bot.end()
      assert.deepStrictEqual(sent, [...cases.map(() => []), []])
    })

    it('leaves out a recipe it cannot read: an invalid base, a trim of an invalid template; a transform of an invalid template takes an empty template slot only', async () => {
      const NO_BASE: GivenSmithing = { ...NETHERITE_SWORD, networkId: 3, base: null }
      const NO_TEMPLATE_TRIM: GivenSmithing = { ...TRIM, networkId: 4, template: null }
      const NO_TEMPLATE: GivenSmithing = { ...NETHERITE_SWORD, networkId: 5, template: null }
      const sent: string[][] = []
      for (const template of [UPGRADE, null]) {
        const smithing = await table([NO_BASE, NO_TEMPLATE_TRIM, NO_TEMPLATE], template, 'diamond_sword', 'netherite_ingot')
        await clicked(smithing)
        sent.push(smithing.described())
        smithing.bot.end()
      }
      for (const template of [null, COAST]) {
        const trimming = await table([NO_TEMPLATE_TRIM], template, 'iron_boots', 'diamond')
        await clicked(trimming)
        sent.push(trimming.described())
        trimming.bot.end()
      }
      assert.deepStrictEqual(sent, [[], [
        `-3 craft_recipe/12 5 ×1, results_deprecated/20 netherite_sword 1:0 ${NETHERITE}, consume/5 1 smithing_table_input:51#11, consume/5 1 smithing_table_material:52#12, take/0 1 creative_output:50#-3 → cursor:0#0`
      ], [], []])
    })

    it('keeps the base\'s NBT, its Damage too (not recorded); an item of no durability gets none (recorded: netherite horse armor)', async () => {
      const HORSE: GivenSmithing = { id: 'minecraft:smithing_netherite_horse_armor', networkId: 6, template: UPGRADE, base: 'diamond_horse_armor', addition: 'netherite_ingot', result: 'netherite_horse_armor' }
      const sent: string[][] = []
      for (const [given, template, base, ints] of [[NETHERITE_SWORD, UPGRADE, 'diamond_sword', { Damage: 7, RepairCost: 1 }], [TRIM, COAST, 'iron_boots', { RepairCost: 1 }], [HORSE, UPGRADE, 'diamond_horse_armor', undefined]] as const) {
        const smithing = await table([given], template, base, given === TRIM ? 'diamond' : 'netherite_ingot', ints === undefined ? {} : { ints })
        await clicked(smithing)
        sent.push(smithing.described())
        smithing.bot.end()
      }
      assert.deepStrictEqual(sent, [
        ['-3 craft_recipe/12 1 ×1, results_deprecated/20 netherite_sword 1:0 {"Damage":7,"RepairCost":1}, consume/5 1 smithing_table_template:53#10, consume/5 1 smithing_table_input:51#11, consume/5 1 smithing_table_material:52#12, take/0 1 creative_output:50#-3 → cursor:0#0'],
        ['-3 craft_recipe/12 2 ×1, results_deprecated/20 iron_boots 1:0 {"RepairCost":1,"Damage":0,"Trim":{"Material":"diamond","Pattern":"coast"}}, consume/5 1 smithing_table_template:53#10, consume/5 1 smithing_table_input:51#11, consume/5 1 smithing_table_material:52#12, take/0 1 creative_output:50#-3 → cursor:0#0'],
        ['-3 craft_recipe/12 6 ×1, results_deprecated/20 netherite_horse_armor 1:0, consume/5 1 smithing_table_template:53#10, consume/5 1 smithing_table_input:51#11, consume/5 1 smithing_table_material:52#12, take/0 1 creative_output:50#-3 → cursor:0#0']
      ])
    })

    it('shift clicks the result to the inventory; sends nothing while the cursor holds an item or the inventory is full, and for a hotbar key, over an empty slot too (recorded on 1.26.51)', async () => {
      const smithing = await table([NETHERITE_SWORD], UPGRADE, 'diamond_sword', 'netherite_ingot')
      const { inventory, idOf, described } = smithing
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 1, stackId: 20 })
      await smithing.driver.tick()
      await clicked(smithing, 4, 2)
      await clicked(smithing, 0, 2)
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 21 })
      await smithing.driver.tick()
      await clicked(smithing, 0, 0)
      const blocked = described()
      await clicked(smithing, 0, 1)
      const moved = described()
      inventory.respond(-3, [{ container: 'hotbar_and_inventory', slot: 1, count: 1, stackId: 14 }])
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 30 + slot })))
      inventory.slot('ui', 53, { id: idOf(UPGRADE), count: 1, stackId: 10 })
      inventory.slot('ui', 51, { id: idOf('diamond_sword'), count: 1, stackId: 11 })
      inventory.slot('ui', 52, { id: idOf('netherite_ingot'), count: 1, stackId: 12 })
      await smithing.driver.tick()
      await clicked(smithing, 0, 1)
      assert.deepStrictEqual([blocked, moved, described()], [[], [
        '-3 craft_recipe/12 1 ×1, results_deprecated/20 netherite_sword 1:0 {"Damage":0}, consume/5 1 smithing_table_template:53#10, consume/5 1 smithing_table_input:51#11, consume/5 1 smithing_table_material:52#12, place/1 1 creative_output:50#-3 → hotbar_and_inventory:1#0'
      ], []])
      smithing.bot.end()
    })

    it('reads crafting_data\'s smithing recipes added to those before, and forgets them when one clears them; and trim_data\'s last', async () => {
      const smithing = await table([NETHERITE_SWORD], COAST, 'iron_boots', 'diamond')
      const { server, driver, described } = smithing
      sendSmithing(smithing, [TRIM], false)
      server.send('trim_data', { patterns: [], materials: [] })
      await driver.tick()
      await clicked(smithing)
      const forgotten = described()
      sendTrims(server)
      await driver.tick()
      await clicked(smithing)
      const added = described()
      // a crafting_data of no smithing recipe, not clearing, keeps them
      smithing.recipes.send([], false)
      smithing.inventory.respond(-3, [{ container: 'cursor', slot: 0, count: 0 }])
      smithing.inventory.slot('ui', 53, { id: smithing.idOf(COAST), count: 1, stackId: 10 })
      smithing.inventory.slot('ui', 51, { id: smithing.idOf('iron_boots'), count: 1, stackId: 11 })
      smithing.inventory.slot('ui', 52, { id: smithing.idOf('diamond'), count: 1, stackId: 12 })
      await driver.tick()
      await clicked(smithing)
      const kept = described()
      sendSmithing(smithing, [NETHERITE_SWORD])
      smithing.inventory.respond(-5, [{ container: 'cursor', slot: 0, count: 0 }])
      smithing.inventory.slot('ui', 53, { id: smithing.idOf(COAST), count: 1, stackId: 10 })
      smithing.inventory.slot('ui', 51, { id: smithing.idOf('iron_boots'), count: 1, stackId: 11 })
      smithing.inventory.slot('ui', 52, { id: smithing.idOf('diamond'), count: 1, stackId: 12 })
      await driver.tick()
      await clicked(smithing)
      assert.deepStrictEqual([forgotten, added.length, kept.length, described()], [[], 1, 1, []])
      smithing.bot.end()
    })

    describe('smith', () => {
      function tableBlock (bot: TestBot['bot']): Block {
        const state = bot.registry.blocksByName['smithing_table']?.defaultState ?? 0
        const block = prismarineBlock(bot.registry).fromStateId(state, 0)
        block.position = new Vec3(TABLE_AT.x, TABLE_AT.y, TABLE_AT.z)
        return block
      }

      /** steps ticks, answering each request with the slots given for it, in order */
      async function answered ({ server, driver, inventory }: Smithing, answers: ReadonlyArray<readonly RespondedSlot[]>, done: () => boolean): Promise<void> {
        let seen = server.sentOf('item_stack_request').length
        const left = [...answers]
        for (let ticks = 0; ticks < 40 && !done(); ticks++) {
          await driver.tick()
          const fresh = server.sentOf('item_stack_request').slice(seen).flatMap(({ requests }) => requests)
          seen += server.sentOf('item_stack_request').slice(seen).length
          for (const { request_id: id } of fresh) inventory.respond(id, left.shift() ?? [])
        }
      }

      function itemOf (bot: TestBot['bot'], name: string): Item {
        const item = bot.inventory.items().find(item => item.name === name)
        assert.ok(item !== undefined, `no ${name}`)
        return item
      }

      async function stocked (): Promise<Smithing> {
        const smithing = await joined(version)
        const { inventory, idOf, driver } = smithing
        sendSmithing(smithing, [NETHERITE_SWORD])
        inventory.slot('inventory', 0, { id: idOf(UPGRADE), count: 2, stackId: 2 })
        inventory.slot('inventory', 1, { id: idOf('diamond_sword'), count: 1, stackId: 3 })
        inventory.slot('inventory', 2, { id: idOf('netherite_ingot'), count: 1, stackId: 4 })
        await driver.tick()
        return smithing
      }

      it('opens the smithing table given, puts the template, the base and the addition in as clicks do, shift clicks the result to the inventory, and closes it', async () => {
        const smithing = await stocked()
        const { bot, internal, server } = smithing
        const opened: Block[] = []
        internal.openBlock = async block => {
          opened.push(block)
          openTable(server)
          await bot.waitForTicks(1)
          return bot.currentWindow ?? bot.inventory
        }
        const described = requestsSince(smithing)
        const block = tableBlock(bot)
        const done = bot.bedrock.smith(itemOf(bot, 'diamond_sword'), itemOf(bot, 'netherite_ingot'), itemOf(bot, UPGRADE), block)
        await answered(smithing, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 1, stackId: 2 }, { container: 'smithing_table_template', slot: 53, count: 1, stackId: 5 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 0, count: 1, stackId: 2 }],
          [{ container: 'hotbar', slot: 1, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'smithing_table_input', slot: 51, count: 1, stackId: 3 }],
          [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 4 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'smithing_table_material', slot: 52, count: 1, stackId: 4 }],
          [{ container: 'smithing_table_template', slot: 53, count: 0 }, { container: 'smithing_table_input', slot: 51, count: 0 }, { container: 'smithing_table_material', slot: 52, count: 0 }, { container: 'hotbar_and_inventory', slot: 1, count: 1, stackId: 6 }]
        ], () => server.sentOf('container_close').length > 0)
        server.send('container_close', { window_id: 2, window_type: 'none', server: false })
        await smithing.driver.tick()
        await done
        assert.deepStrictEqual([opened, described(), bot.inventory.slots[37]?.name, server.sentOf('container_close').length], [[block], [
          '-3 take/0 2 hotbar:0#2 → cursor:0#0',
          '-5 place/1 1 cursor:0#2 → smithing_table_template:53#0',
          '-7 place/1 1 cursor:0#2 → hotbar:0#0',
          '-9 take/0 1 hotbar:1#3 → cursor:0#0',
          '-11 place/1 1 cursor:0#3 → smithing_table_input:51#0',
          '-13 take/0 1 hotbar:2#4 → cursor:0#0',
          '-15 place/1 1 cursor:0#4 → smithing_table_material:52#0',
          '-17 craft_recipe/12 1 ×1, results_deprecated/20 netherite_sword 1:0 {"Damage":0}, consume/5 1 smithing_table_template:53#5, consume/5 1 smithing_table_input:51#3, consume/5 1 smithing_table_material:52#4, place/1 1 creative_output:50#-17 → hotbar_and_inventory:1#0'
        ], 'netherite_sword', 1])
        bot.end()
      })

      for (const [at, recipe] of [['bedrock_1.19.70', { ...SWORD, networkId: 1 }], [version, { ...SWORD, networkId: 1, template: null }]] as const) {
        it(`smiths at the smithing table open, Java's null template and table none: ${at === version ? 'a recipe of no template leaves the template slot empty' : 'before 1.20.0 there is no template slot'} (${at})`, async () => {
          const smithing = await joined(at)
          const { bot, server, driver, inventory, idOf } = smithing
          sendSmithing(smithing, [recipe])
          inventory.slot('inventory', 1, { id: idOf('diamond_sword'), count: 1, stackId: 3 })
          inventory.slot('inventory', 2, { id: idOf('netherite_ingot'), count: 1, stackId: 4 })
          openTable(server)
          await driver.tick()
          const described = requestsSince(smithing)
          let finished = false
          const done = bot.bedrock.smith(itemOf(bot, 'diamond_sword'), itemOf(bot, 'netherite_ingot'), null, null).finally(() => { finished = true })
          await answered(smithing, [
            [{ container: 'hotbar', slot: 1, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 3 }],
            [{ container: 'cursor', slot: 0, count: 0 }, { container: 'smithing_table_input', slot: 51, count: 1, stackId: 3 }],
            [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 4 }],
            [{ container: 'cursor', slot: 0, count: 0 }, { container: 'smithing_table_material', slot: 52, count: 1, stackId: 4 }],
            [{ container: 'smithing_table_input', slot: 51, count: 0 }, { container: 'smithing_table_material', slot: 52, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: 6 }]
          ], () => finished)
          await done
          assert.deepStrictEqual([described().map(request => request.split(',', 1).join().replace(/\/\d+| ×\d+/g, '')), bot.currentWindow?.type, server.sentOf('container_close')], [[
            '-3 take 1 hotbar:1#3 → cursor:0#0',
            '-5 place 1 cursor:0#3 → smithing_table_input:51#0',
            '-7 take 1 hotbar:2#4 → cursor:0#0',
            '-9 place 1 cursor:0#4 → smithing_table_material:52#0',
            '-11 craft_recipe 1'
          ], 'minecraft:smithing', []])
          bot.end()
        })
      }

      it('rejects, sending nothing: items no recipe takes, an item the inventory has not (or of another data), the cursor holding an item, the table\'s slots holding items, no smithing table', async () => {
        const smithing = await stocked()
        const { bot, server, driver, inventory, idOf } = smithing
        const [template, base, addition] = [itemOf(bot, UPGRADE), itemOf(bot, 'diamond_sword'), itemOf(bot, 'netherite_ingot')]
        const messages: string[] = []
        const rejected = async (smith: Promise<void>): Promise<void> => {
          await smith.then(() => { messages.push('smithed') }, (error: Error) => { messages.push(error.message) })
        }
        await rejected(bot.bedrock.smith(base, addition))
        await rejected(bot.bedrock.smith(addition, base, template))
        await rejected(bot.bedrock.smith(base, addition, template))
        openTable(server)
        inventory.slot('ui', 52, { id: idOf('dirt'), count: 1, stackId: 7 })
        await driver.tick()
        await rejected(bot.bedrock.smith(base, addition, template))
        inventory.slot('ui', 52, null)
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 7 })
        await driver.tick()
        await rejected(bot.bedrock.smith(base, addition, template))
        inventory.slot('inventory', 2, null)
        await driver.tick()
        await rejected(bot.bedrock.smith(base, addition, template))
        inventory.slot('inventory', 1, { id: idOf('diamond_sword'), count: 1, metadata: 1, stackId: 3 })
        await driver.tick()
        await rejected(bot.bedrock.smith(base, addition, template))
        assert.deepStrictEqual([messages, server.sentOf('item_stack_request')], [[
          'no smithing recipe takes diamond_sword, netherite_ingot',
          `no smithing recipe takes ${UPGRADE}, netherite_ingot, diamond_sword`,
          'smith needs an open smithing table, or one to open',
          'smith needs the smithing table\'s slots empty',
          'smith needs an empty cursor',
          'the inventory has no netherite_ingot',
          'the inventory has no diamond_sword'
        ], []])
        bot.end()
      })

      it('rejects, closing the smithing table it opened, when a click fails', async () => {
        const smithing = await stocked()
        const { bot, internal, server } = smithing
        internal.openBlock = async () => {
          openTable(server)
          await bot.waitForTicks(1)
          return bot.currentWindow ?? bot.inventory
        }
        let finished = false
        const done = bot.bedrock.smith(itemOf(bot, 'diamond_sword'), itemOf(bot, 'netherite_ingot'), itemOf(bot, UPGRADE), tableBlock(bot)).finally(() => { finished = true })
        done.catch(() => {})
        const respondTo = async (id: number, slots: readonly RespondedSlot[], status: 'ok' | number = 'ok'): Promise<void> => {
          await smithing.driver.runUntil(() => server.sentOf('item_stack_request').some(({ requests }) => requests.some(({ request_id: sent }) => sent === id)), 40)
          smithing.inventory.respond(id, slots, status)
        }
        await respondTo(-3, [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 2 }])
        await respondTo(-5, [], 2)
        await answered(smithing, [], () => server.sentOf('container_close').length > 0)
        server.send('container_close', { window_id: 2, window_type: 'none', server: false })
        await answered(smithing, [], () => finished)
        await assert.rejects(done)
        assert.deepStrictEqual(server.sentOf('container_close').length, 1)
        bot.end()
      })
    })
  })
})
