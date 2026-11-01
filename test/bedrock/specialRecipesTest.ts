import assert from 'assert'
import { simplify } from 'prismarine-nbt'
import type { Tags, TagType } from 'prismarine-nbt'
import { nbtOf } from '../../lib/bedrock/modules/recipes.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { GivenMulti, GivenRecipe } from './common/recipes.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// No recording crafts these multi recipes in the grid: their requests are the grid's recorded layout (craft_recipe naming
// the multi recipe, results_deprecated, a consume a cell, the result moved), their results the game's rules.

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentAction = SentRequest['actions'][number]
type SentSlot = NonNullable<SentAction['source']>
type ResultItem = NonNullable<SentAction['result_items']>[number]
type CraftingEvent = BedrockServerboundPackets['crafting_event']
type Nbt = Readonly<Record<string, Tags[TagType]>>

const MULTIS: readonly GivenMulti[] = [
  { type: 'multi', uuid: '00000000-0000-0000-0100-000000000000', networkId: 101 },
  { type: 'multi', uuid: '00000000-0000-0000-0200-000000000000', networkId: 102 },
  { type: 'multi', uuid: '2f4f8e33-846b-cad1-8dd9-4b8bcc766b9c', networkId: 103 },
  { type: 'multi', uuid: '9d4d10ba-5597-9385-c443-e9a8b7efcca4', networkId: 104 },
  { type: 'multi', uuid: '7640a275-05d1-c5b5-f04b-bfa23e922baf', networkId: 105 },
  { type: 'multi', uuid: '404472e1-afae-1ad8-7bd2-30f08d862592', networkId: 106 },
  { type: 'multi', uuid: '4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88', networkId: 107 },
  // map extending, the unknown one of 1.19.80+, map upgrading
  { type: 'multi', uuid: 'ae40a14b-75b0-92d3-cef6-568d86af8987', networkId: 108 },
  { type: 'multi', uuid: '00000000-0000-0000-c800-000000000000', networkId: 109 },
  { type: 'multi', uuid: '4b43944b-9422-cdae-2793-2cbb99446786', networkId: 110 }
]

function compound (value: Nbt): { type: 'compound', name: '', value: Nbt } {
  return { type: 'compound', name: '', value }
}

function int (value: number): Tags['int'] {
  return { type: 'int', value }
}

function byte (value: number): Tags['byte'] {
  return { type: 'byte', value }
}

function string (value: string): Tags['string'] {
  return { type: 'string', value }
}

function explosion (colors: number[], trail = 0): Tags['compound'] {
  return { type: 'compound', value: { FireworkColor: { type: 'byteArray', value: colors }, FireworkFade: { type: 'byteArray', value: [] }, FireworkFlicker: byte(0), FireworkTrail: byte(trail), FireworkType: byte(0) } }
}

// crafting_data's, as recorded on 1.26.60.5
const ROCKETS: GivenRecipe = { type: 'shapeless', id: 'paper_sulphur_recipeId', networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', priority: 50, input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3, nbt: { type: 'compound', name: '', value: { Fireworks: { type: 'compound', value: { Explosions: { type: 'list', value: { type: 'end', value: [] } }, Flight: byte(1) } } } } }] }
const LIME_STAR: GivenRecipe = { type: 'shapeless', id: 'paper_sulphur_dye_10_recipeId', networkId: 2, uuid: '00000000-0000-0000-0000-000000000002', priority: 50, input: [{ item: 'gunpowder' }, { item: 'lime_dye' }], output: [{ item: 'firework_star', count: 1, metadata: 10, nbt: compound({ FireworksItem: explosion([10]), customColor: int(-8337633) }) }] }
const BRICK = { item: 'brick' }
const POT: GivenRecipe = { type: 'shaped', id: 'decorated_pot_base_recipeId', networkId: 3, uuid: '00000000-0000-0000-0000-000000000003', priority: 50, width: 3, height: 3, input: [null, BRICK, null, BRICK, null, BRICK, null, BRICK, null], output: [{ item: 'decorated_pot', count: 1 }] }

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function slotName (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${String(info.slot ?? info.slot_id)}`
}

interface Special extends TestBot {
  inventory: ServerInventory
  idOf: (name: string) => number
}

async function specialBot (version: BedrockVersion, recipes: ReadonlyArray<GivenRecipe | GivenMulti> = [ROCKETS, LIME_STAR, POT, ...MULTIS]): Promise<Special> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  new ServerRecipes(testBot.server, testBot.bot.registry).send(recipes)
  return { ...testBot, inventory: new ServerInventory(testBot.server), idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0 }
}

/** the screen open, its grid holding the items by cell, row by row */
function opened ({ server, inventory, idOf }: Special, screen: 'inventory' | 'workbench', cells: ReadonlyArray<readonly [number, string, Partial<Given>?]>): void {
  server.send('container_open', { window_id: 2, window_type: screen, coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
  const first = screen === 'inventory' ? 28 : 32
  for (const [cell, item, given] of cells) inventory.slot('ui', first + cell, { id: idOf(item), count: 1, stackId: 10 + cell, ...given })
}

/** each crafting_event and request the bot sent since the last call, in order: an event's type, recipe and result; a request's actions' types, recipes, times, counts and slots */
function craftingSince ({ server, bot }: Pick<TestBot, 'server' | 'bot'>): () => string[] {
  const resultOf = (item: ResultItem | CraftingEvent['result'][number]): string => {
    const [count, metadata] = 'auxiliary_value' in item && item.auxiliary_value !== undefined ? [item.auxiliary_value & 0xff, item.auxiliary_value >> 8] : [Number(item.count), Number(item.metadata)]
    const name = 'network_id' in item ? bot.registry.items[Number(item.network_id)]?.name : item.name?.replace('minecraft:', '')
    const nbt = ('extra' in item ? item.extra?.nbt : 'nbt' in item ? item.nbt : undefined)?.nbt
    return `${String(name)} ${count}:${metadata} ${nbt === undefined ? 'none' : JSON.stringify(simplify(nbt))}`
  }
  const actionOf = (action: SentAction): string => {
    const { type_id: type, recipe_network_id: recipe, count, source, destination } = action
    const times = 'times_crafted' in action ? `×${String(action.times_crafted)}` : undefined
    const results = action.result_items?.map(resultOf).join(' ')
    return [String(type), recipe, times, results, count, source === undefined ? undefined : slotName(source), destination === undefined ? undefined : `→ ${slotName(destination)}`].filter(part => part !== undefined).join(' ')
  }
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.flatMap(({ name, params }) => {
      if (name === 'crafting_event') {
        const event = params as CraftingEvent
        return [`event ${event.recipe_type} ${event.recipe_id} ${event.result.map(resultOf).join(' ')}`]
      }
      if (name !== 'item_stack_request') return []
      return (params as BedrockServerboundPackets['item_stack_request']).requests.map(({ actions }) => actions.map(actionOf).join(', '))
    })
  }
}

/** the click's packets, once its tick ran; a click that sent nothing has resolved */
async function clicked (special: Special, mode = 0, button = 0): Promise<string[]> {
  const sent = craftingSince(special)
  await special.driver.tick()
  const click = special.bot.clickWindow(0, button, mode)
  await special.driver.tick()
  const packets = sent()
  if (packets.length === 0) await click
  else click.catch(() => {})
  return packets
}

const SWORD_DAMAGE = Object.freeze({ ints: { Damage: 200 } })
const WRITTEN = Object.freeze({ nbt: { author: string('Steve'), generation: int(0), pages: { type: 'list', value: { type: 'compound', value: [{ photoname: string(''), text: string('hi') }] } }, title: string('Notes'), xuid: string('') } satisfies Nbt })
const BOOK_COPY = '{"author":"Steve","generation":1,"pages":[{"photoname":"","text":"hi"}],"title":"Notes","xuid":""}'

// the request's layout by version: crafting_event before it up to 1.20.40, the times from 1.21.20
const LAYOUTS = [
  { from: 'bedrock_1.16.201', to: 'bedrock_1.20.40', event: true, times: '' },
  { from: 'bedrock_1.20.50', to: 'bedrock_1.21.2', event: false, times: '' },
  { from: 'bedrock_1.21.20', to: latestSupportedBedrockVersion, event: false, times: ' ×1' }
] as const

interface Case {
  readonly title: string
  readonly screen?: 'inventory' | 'workbench'
  readonly cells: ReadonlyArray<readonly [number, string, Partial<Given>?]>
  readonly mode?: number
  // undefined: nothing sent
  readonly sent?: string
}

const CURSES = Object.freeze({ nbt: { ench: { type: 'list', value: { type: 'compound', value: [{ id: { type: 'short', value: 9 }, lvl: { type: 'short', value: 2 } }, { id: { type: 'short', value: 28 }, lvl: { type: 'short', value: 1 } }] } } } satisfies Nbt })
const BINDING = Object.freeze({ nbt: { ench: { type: 'list', value: { type: 'compound', value: [{ id: { type: 'short', value: 27 }, lvl: { type: 'short', value: 1 } }, { id: { type: 'short', value: 28 }, lvl: { type: 'short', value: 1 } }] } } } satisfies Nbt })
const UNKNOWN = Object.freeze({ nbt: { ench: { type: 'list', value: { type: 'compound', value: [{ id: { type: 'short', value: 38 }, lvl: { type: 'short', value: 1 } }] } } } satisfies Nbt })
const MAP = Object.freeze({ nbt: { map_name_index: int(1), map_uuid: { type: 'long', value: [-2, 15] } } satisfies Nbt })
const PATTERNS = (count: number): Partial<Given> => ({ metadata: 1, nbt: { Patterns: { type: 'list', value: { type: 'compound', value: Array.from({ length: count }, () => ({ Color: int(15), Pattern: string('bo') })) } }, Type: int(0) } })
const BLANK = Object.freeze({ metadata: 1, nbt: { Type: int(0) } satisfies Nbt })
const STAR = Object.freeze({ metadata: 10, nbt: { FireworksItem: explosion([10]), customColor: int(-8337633) } satisfies Nbt })
const TRAIL_STAR = Object.freeze({ metadata: 1, nbt: { FireworksItem: explosion([1], 1), customColor: int(-5231066) } satisfies Nbt })
const STAR_NBT = (colors: string, fade: string, flicker: number, trail: number, type: number, color: number): string =>
  `{"FireworksItem":{"FireworkColor":[${colors}],"FireworkFade":[${fade}],"FireworkFlicker":${flicker},"FireworkTrail":${trail},"FireworkType":${type}},"customColor":${color}}`
const TAKEN = 'take 1 creative_output:50 → cursor:0'

// on 1.26.60: the grid's items by cell, what a click on the output sends
const CASES: readonly Case[] = [
  {
    title: 'two iron swords repaired: their durability and 5% more (50 + 150 + 12 of 250: Damage 38), by the repair multi recipe',
    cells: [[0, 'iron_sword', { ints: { Damage: 200 } }], [1, 'iron_sword', { ints: { Damage: 100 } }]],
    sent: `craft_recipe 101 ×1, results_deprecated ×1 iron_sword 1:0 {"Damage":38}, consume 1 crafting_input:28, consume 1 crafting_input:29, ${TAKEN}`
  },
  {
    title: 'an unworn sword and a worn one repaired to Damage 0 at most, the first\'s curses then the second\'s new ones kept, the other enchantments gone',
    cells: [[0, 'iron_sword', CURSES], [3, 'iron_sword', { ints: { Damage: 20 }, ...BINDING }]],
    sent: `craft_recipe 101 ×1, results_deprecated ×1 iron_sword 1:0 {"Damage":0,"ench":[{"id":28,"lvl":1},{"id":27,"lvl":1}]}, consume 1 crafting_input:28, consume 1 crafting_input:31, ${TAKEN}`
  },
  { title: 'swords of two kinds not repaired', cells: [[0, 'iron_sword', SWORD_DAMAGE], [1, 'diamond_sword', SWORD_DAMAGE]] },
  { title: 'three swords not repaired', screen: 'workbench', cells: [[0, 'iron_sword', SWORD_DAMAGE], [1, 'iron_sword', SWORD_DAMAGE], [2, 'iron_sword', SWORD_DAMAGE]] },
  { title: 'two items without durability not repaired', cells: [[0, 'compass'], [1, 'compass']] },
  { title: 'a sword of an enchantment the registry does not know not repaired', cells: [[0, 'iron_sword', { ints: { Damage: 1 }, ...UNKNOWN }], [1, 'iron_sword', SWORD_DAMAGE]] },
  {
    title: 'a filled map cloned by two empty maps: three of it',
    cells: [[0, 'filled_map', MAP], [1, 'empty_map'], [2, 'empty_map', { metadata: 2 }]],
    sent: 'craft_recipe 104 ×1, results_deprecated ×1 filled_map 3:0 {"map_name_index":1,"map_uuid":[-2,15]}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, take 3 creative_output:50 → cursor:0'
  },
  { title: 'two filled maps not cloned', cells: [[0, 'filled_map', MAP], [1, 'filled_map', MAP], [2, 'empty_map']] },
  { title: 'a filled map alone not cloned', cells: [[0, 'filled_map', MAP]] },
  { title: 'a filled map and paper not cloned', cells: [[0, 'filled_map', MAP], [1, 'empty_map'], [2, 'paper']] },
  { title: 'a filled map extended by paper: not supported (the map\'s scale is not in its item)', screen: 'workbench', cells: [0, 1, 2, 3, 5, 6, 7, 8].map((cell): readonly [number, string] => [cell, 'paper']).concat([[4, 'filled_map']]) },
  {
    title: 'a written book cloned by two books and quills, by a hotbar key: two of the next generation, the book kept',
    cells: [[0, 'writable_book'], [1, 'written_book', WRITTEN], [2, 'writable_book']],
    mode: 2,
    sent: `craft_recipe 103 ×1, results_deprecated ×1 written_book 2:0 ${BOOK_COPY}, consume 1 crafting_input:28, consume 1 crafting_input:30, take 2 creative_output:50 → hotbar:0`
  },
  { title: 'a copy\'s copy not cloned', cells: [[0, 'written_book', { nbt: { ...WRITTEN.nbt, generation: int(2) } }], [1, 'writable_book']] },
  { title: 'two written books not cloned', cells: [[0, 'written_book', WRITTEN], [1, 'written_book', WRITTEN], [2, 'writable_book']] },
  { title: 'a written book and paper not cloned', cells: [[0, 'written_book', WRITTEN], [1, 'writable_book'], [2, 'paper']] },
  {
    title: 'a banner\'s patterns copied onto a blank one of its color, by a shift click: the patterned banner kept',
    cells: [[0, 'banner', PATTERNS(1)], [1, 'banner', BLANK]],
    mode: 1,
    sent: 'craft_recipe 105 ×1, results_deprecated ×1 banner 1:1 {"Patterns":[{"Color":15,"Pattern":"bo"}],"Type":0}, consume 1 crafting_input:29, place 1 creative_output:50 → hotbar_and_inventory:0'
  },
  { title: 'banners of two colors not copied', cells: [[0, 'banner', PATTERNS(1)], [1, 'banner', { ...BLANK, metadata: 2 }]] },
  { title: 'two patterned banners not copied', cells: [[0, 'banner', PATTERNS(1)], [1, 'banner', PATTERNS(2)]] },
  { title: 'two blank banners not copied', cells: [[0, 'banner', BLANK], [1, 'banner', BLANK]] },
  { title: 'a banner and a book of its data not copied', cells: [[0, 'banner', { ...PATTERNS(1), metadata: 0 }], [1, 'book']] },
  {
    title: 'a banner given a top stripe by three red dyes at the crafting table, after its patterns',
    screen: 'workbench',
    cells: [[0, 'red_dye'], [1, 'red_dye'], [2, 'red_dye'], [4, 'banner', PATTERNS(1)]],
    sent: 'craft_recipe 106 ×1, results_deprecated ×1 banner 1:1 {"Patterns":[{"Color":15,"Pattern":"bo"},{"Color":1,"Pattern":"ts"}],"Type":0}, consume 1 crafting_input:32, consume 1 crafting_input:33, consume 1 crafting_input:34, consume 1 crafting_input:36, take 1 creative_output:50 → cursor:0'
  },
  {
    title: 'a blank banner given a roundel by a black dye in the middle',
    screen: 'workbench',
    cells: [[4, 'black_dye'], [8, 'banner', BLANK]],
    sent: 'craft_recipe 106 ×1, results_deprecated ×1 banner 1:1 {"Patterns":[{"Color":0,"Pattern":"mc"}],"Type":0}, consume 1 crafting_input:36, consume 1 crafting_input:40, take 1 creative_output:50 → cursor:0'
  },
  { title: 'dyes of two colors no pattern', screen: 'workbench', cells: [[0, 'red_dye'], [1, 'blue_dye'], [2, 'red_dye'], [4, 'banner', BLANK]] },
  { title: 'dyes in no pattern\'s shape no pattern', screen: 'workbench', cells: [[1, 'red_dye'], [4, 'banner', BLANK]] },
  { title: 'a banner of six patterns no more', screen: 'workbench', cells: [[4, 'black_dye'], [8, 'banner', PATTERNS(6)]] },
  { title: 'two banners and a dye no pattern', screen: 'workbench', cells: [[4, 'black_dye'], [7, 'banner', BLANK], [8, 'banner', BLANK]] },
  { title: 'an ink sac no pattern', screen: 'workbench', cells: [[4, 'ink_sac'], [8, 'banner', BLANK]] },
  { title: 'a pattern in the inventory\'s grid not made', cells: [[0, 'black_dye'], [3, 'banner', BLANK]] },
  {
    title: 'a decorated pot of bricks and sherds: its sherds back, left, right, front by name',
    screen: 'workbench',
    cells: [[1, 'brick'], [3, 'angler_pottery_sherd'], [5, 'brick'], [7, 'skull_pottery_sherd']],
    sent: 'craft_recipe 107 ×1, results_deprecated ×1 decorated_pot 1:0 {"sherds":["minecraft:brick","minecraft:angler_pottery_sherd","minecraft:brick","minecraft:skull_pottery_sherd"]}, consume 1 crafting_input:33, consume 1 crafting_input:35, consume 1 crafting_input:37, consume 1 crafting_input:39, take 1 creative_output:50 → cursor:0'
  },
  { title: 'sherds off the pot\'s sides no pot', screen: 'workbench', cells: [[0, 'brick'], [3, 'angler_pottery_sherd'], [5, 'brick'], [7, 'brick']] },
  { title: 'a pot of a fifth item no pot', screen: 'workbench', cells: [[1, 'brick'], [3, 'angler_pottery_sherd'], [4, 'paper'], [5, 'brick'], [7, 'brick']] },
  { title: 'a pot of paper no pot', screen: 'workbench', cells: [[1, 'brick'], [3, 'paper'], [5, 'brick'], [7, 'brick']] },
  {
    title: 'firework rockets of a flight of two, without stars',
    cells: [[0, 'paper'], [1, 'gunpowder'], [2, 'gunpowder']],
    sent: 'craft_recipe 102 ×1, results_deprecated ×1 firework_rocket 3:0 {"Fireworks":{"Explosions":[],"Flight":2}}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, take 3 creative_output:50 → cursor:0'
  },
  {
    title: 'firework rockets of a flight of three and two stars, the stars\' explosions in the grid\'s order',
    screen: 'workbench',
    cells: [[0, 'firework_star', TRAIL_STAR], [1, 'gunpowder'], [2, 'paper'], [4, 'gunpowder'], [5, 'firework_star', STAR], [8, 'gunpowder']],
    sent: 'craft_recipe 102 ×1, results_deprecated ×1 firework_rocket 3:0 {"Fireworks":{"Explosions":[{"FireworkColor":[1],"FireworkFade":[],"FireworkFlicker":0,"FireworkTrail":1,"FireworkType":0},{"FireworkColor":[10],"FireworkFade":[],"FireworkFlicker":0,"FireworkTrail":0,"FireworkType":0}],"Flight":3}}, consume 1 crafting_input:32, consume 1 crafting_input:33, consume 1 crafting_input:34, consume 1 crafting_input:36, consume 1 crafting_input:37, consume 1 crafting_input:40, take 3 creative_output:50 → cursor:0'
  },
  {
    title: 'a star without an explosion adding none to the rockets',
    cells: [[0, 'paper'], [1, 'gunpowder'], [2, 'firework_star'], [3, 'firework_star']],
    sent: 'craft_recipe 102 ×1, results_deprecated ×1 firework_rocket 3:0 {"Fireworks":{"Explosions":[],"Flight":1}}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, consume 1 crafting_input:31, take 3 creative_output:50 → cursor:0'
  },
  { title: 'rockets of four gunpowder not made', screen: 'workbench', cells: [[0, 'paper'], [1, 'gunpowder'], [2, 'gunpowder'], [3, 'gunpowder'], [4, 'gunpowder']] },
  { title: 'rockets without gunpowder not made', cells: [[0, 'paper'], [1, 'firework_star', STAR]] },
  { title: 'rockets of two paper not made', cells: [[0, 'paper'], [1, 'paper'], [2, 'gunpowder']] },
  { title: 'rockets and a dye not made', cells: [[0, 'paper'], [1, 'gunpowder'], [2, 'gunpowder'], [3, 'red_dye']] },
  {
    title: 'a star of two colors and a trail: the first dye\'s data, the colors\' mix',
    cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'lime_dye'], [3, 'diamond']],
    sent: `craft_recipe 102 ×1, results_deprecated ×1 firework_star 1:1 ${STAR_NBT('1,10', '', 0, 1, 0, -6784478)}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, consume 1 crafting_input:31, ${TAKEN}`
  },
  {
    title: 'a creeper-shaped twinkling black star',
    cells: [[0, 'creeper_head'], [1, 'glowstone_dust'], [2, 'black_dye'], [3, 'gunpowder']],
    sent: `craft_recipe 102 ×1, results_deprecated ×1 firework_star 1:0 ${STAR_NBT('0', '', 1, 0, 3, -14869215)}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, consume 1 crafting_input:31, ${TAKEN}`
  },
  { title: 'a star of two shapes not made', cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'fire_charge'], [3, 'feather']] },
  { title: 'a star of two gunpowder not made', cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'gunpowder'], [3, 'diamond']] },
  { title: 'a star of two diamonds not made', cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'diamond'], [3, 'diamond']] },
  { title: 'a star of two glowstone dusts not made', cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'glowstone_dust'], [3, 'glowstone_dust']] },
  { title: 'a star without a dye not made', cells: [[0, 'gunpowder'], [1, 'diamond']] },
  { title: 'a star of paper not made', cells: [[0, 'gunpowder'], [1, 'red_dye'], [2, 'paper']] },
  {
    title: 'a star fading to white and black, its colors and data kept',
    cells: [[0, 'white_dye'], [1, 'firework_star', STAR], [2, 'black_dye']],
    sent: `craft_recipe 102 ×1, results_deprecated ×1 firework_star 1:10 ${STAR_NBT('10', '15,0', 0, 0, 0, -8337633)}, consume 1 crafting_input:28, consume 1 crafting_input:29, consume 1 crafting_input:30, ${TAKEN}`
  },
  { title: 'a star without an explosion not fading', cells: [[0, 'white_dye'], [1, 'firework_star']] },
  { title: 'two stars not fading', cells: [[0, 'white_dye'], [1, 'firework_star', STAR], [2, 'firework_star', STAR]] },
  { title: 'a star and paper not fading', cells: [[0, 'white_dye'], [1, 'firework_star', STAR], [2, 'paper']] },
  { title: 'a star alone not fading', cells: [[0, 'firework_star', STAR]] }
]

// the stars' shapes by their items
const SHAPED: ReadonlyArray<readonly [string, number]> = [['fire_charge', 1], ['gold_nugget', 2], ['skeleton_skull', 3], ['skull', 3], ['feather', 4]]

describe('bedrock crafting: the grid\'s special recipes (not recorded)', () => {
  for (const { from, to, event, times } of LAYOUTS) {
    describe(`the grid's layout of a craft, ${event ? 'after its crafting_event' : 'without crafting_event'}${times === '' ? '' : ', with the times'} (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: two iron swords repaired by a click, a written book cloned by a hotbar key, a banner copied twice by a shift click`, async () => {
          const special = await specialBot(version, MULTIS)
          const { bot, inventory } = special
          opened(special, 'inventory', [[0, 'iron_sword', SWORD_DAMAGE], [1, 'iron_sword', SWORD_DAMAGE]])
          const repaired = 'iron_sword 1:0 {"Damage":138}'
          assert.deepStrictEqual(await clicked(special), [
            ...event ? [`event inventory 00000000-0000-0000-0100-000000000000 ${repaired}`] : [],
            `craft_recipe 101${times}, results_deprecated ×1 ${repaired}, consume 1 crafting_input:28, consume 1 crafting_input:29, ${TAKEN}`
          ])
          assert.deepStrictEqual([bot.inventory.selectedItem?.name, bot.inventory.selectedItem?.nbt == null ? undefined : simplify(bot.inventory.selectedItem.nbt)], ['iron_sword', { Damage: 138 }])
          for (const slot of [28, 29]) inventory.slot('ui', slot, null)
          opened(special, 'inventory', [[2, 'written_book', WRITTEN], [3, 'writable_book']])
          const copy = `written_book 1:0 ${BOOK_COPY}`
          assert.deepStrictEqual(await clicked(special, 2, 4), [
            ...event ? [`event inventory 2f4f8e33-846b-cad1-8dd9-4b8bcc766b9c ${copy}`] : [],
            `craft_recipe 103${times}, results_deprecated ×1 ${copy}, consume 1 crafting_input:31, take 1 creative_output:50 → hotbar:4`
          ])
          assert.deepStrictEqual([bot.inventory.slots[40]?.name, bot.inventory.slots[3]?.name], ['written_book', 'written_book'])
          for (const slot of [30, 31]) inventory.slot('ui', slot, null)
          opened(special, 'inventory', [[0, 'banner', PATTERNS(1)], [1, 'banner', { ...BLANK, count: 2 }]])
          const banner = (count: number): string => `banner ${count}:1 {"Patterns":[{"Color":15,"Pattern":"bo"}],"Type":0}`
          // up to 1.21.2 a request a craft, from 1.21.20 a stack's worth; the events before the requests, as recorded of rockets
          const copies = times === '' ? [1, 1] : [2]
          assert.deepStrictEqual(await clicked(special, 1), [
            ...event ? copies.map(count => `event inventory 7640a275-05d1-c5b5-f04b-bfa23e922baf ${banner(count)}`) : [],
            ...copies.map(count => `craft_recipe 105${times === '' ? '' : ` ×${count}`}, results_deprecated ×1 ${banner(1)}, consume ${count} crafting_input:29, place ${count} creative_output:50 → hotbar_and_inventory:0`)
          ])
          bot.end()
        })
      }
    })
  }

  for (const { from, to, inkSac } of [{ from: 'bedrock_1.16.201', to: 'bedrock_1.20.0', inkSac: true }, { from: 'bedrock_1.20.10', to: latestSupportedBedrockVersion, inkSac: false }] as const) {
    describe(`the fireworks' multi recipe taking ${inkSac ? 'an ink sac, cocoa beans, lapis lazuli and bone meal as dyes, as crafting_data\'s stars' : 'only the items named for a dye: an ink sac\'s star is its own recipe\'s'} (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: a star of an ink sac, cocoa beans, lapis lazuli, bone meal and a lime dye`, async () => {
          const special = await specialBot(version, [ROCKETS, LIME_STAR, ...MULTIS])
          opened(special, 'workbench', [[0, 'gunpowder'], [1, 'ink_sac'], [2, 'cocoa_beans'], [3, 'lapis_lazuli'], [4, 'bone_meal'], [5, 'lime_dye']])
          const [request] = await clicked(special, 1)
          // black, brown, blue, white and lime, black's data
          assert.deepStrictEqual(request?.match(/firework_star 1:\d+ \{"FireworksItem":\{"FireworkColor":\[[\d,]+\]/)?.[0], inkSac ? 'firework_star 1:0 {"FireworksItem":{"FireworkColor":[0,3,4,15,10]' : undefined)
          special.bot.end()
        })
      }
    })
  }

  describe(`what a click on the output sends: (on ${latestSupportedBedrockVersion})`, () => {
    for (const { title, screen = 'inventory', cells, mode, sent } of CASES) {
      it(title, async () => {
        const special = await specialBot(latestSupportedBedrockVersion)
        opened(special, screen, cells)
        assert.deepStrictEqual(await clicked(special, mode), sent === undefined ? [] : [sent])
        special.bot.end()
      })
    }

    it('a star\'s shape by its item: a fire charge, a gold nugget, a head, a feather', async () => {
      const special = await specialBot(latestSupportedBedrockVersion)
      const types: number[] = []
      for (const [item] of SHAPED) {
        opened(special, 'inventory', [[0, 'gunpowder'], [1, 'red_dye'], [2, item]])
        const [request] = await clicked(special)
        types.push(Number(request?.match(/"FireworkType":(\d)/)?.[1]))
        special.inventory.slot('ui', 0, null)
      }
      assert.deepStrictEqual(types, SHAPED.map(([, type]) => type))
      special.bot.end()
    })

    // the repair's multi recipe not sent; the rockets', the star's and the pot's crafting_data recipes not sent
    for (const [title, recipes, cells] of [
      ['two swords without the repair multi recipe', [ROCKETS, LIME_STAR, POT], [[0, 'iron_sword', SWORD_DAMAGE], [1, 'iron_sword', SWORD_DAMAGE]]],
      ['rockets without crafting_data\'s rockets', MULTIS, [[0, 'paper'], [1, 'gunpowder'], [2, 'gunpowder']]],
      ['a star without crafting_data\'s stars', MULTIS, [[0, 'gunpowder'], [1, 'red_dye'], [2, 'blue_dye']]],
      ['a pot of sherds without crafting_data\'s pot', MULTIS, [[1, 'brick'], [3, 'angler_pottery_sherd'], [5, 'brick'], [7, 'brick']]]
    ] as const) {
      it(`nothing sent for ${title}`, async () => {
        const special = await specialBot(latestSupportedBedrockVersion, recipes)
        opened(special, 'workbench', cells)
        assert.deepStrictEqual(await clicked(special), [])
        special.bot.end()
      })
    }

    it('a shift click repeating the craft while the grid has the items: a stack\'s worth of rockets a request, to the offhand first', async () => {
      const special = await specialBot(latestSupportedBedrockVersion)
      opened(special, 'inventory', [[0, 'paper', { count: 2 }], [1, 'gunpowder', { count: 4 }], [2, 'gunpowder', { count: 2 }]])
      const sent = await clicked(special, 1)
      assert.deepStrictEqual(sent, ['craft_recipe 102 ×2, results_deprecated ×1 firework_rocket 3:0 {"Fireworks":{"Explosions":[],"Flight":2}}, consume 2 crafting_input:28, consume 2 crafting_input:29, consume 2 crafting_input:30, place 6 creative_output:50 → offhand:1'])
      special.bot.end()
    })

    it('the results as the bot keeps them: a star of its first dye\'s data, rockets without stars of a list of no tag', async () => {
      const special = await specialBot(latestSupportedBedrockVersion)
      const { internal, bot } = special
      opened(special, 'inventory', [[0, 'gunpowder'], [1, 'red_dye'], [2, 'lime_dye']])
      await clicked(special)
      const star = internal._inventory.stackAt({ container: 'cursor', slot: 0 })
      opened(special, 'inventory', [[0, 'paper'], [1, 'gunpowder'], [2, 'gunpowder']])
      await clicked(special, 2, 1)
      const rocketsAt = internal._inventory.stackAt({ container: 'hotbar', slot: 1 })
      const rockets = rocketsAt === undefined ? undefined : nbtOf(rocketsAt)['Fireworks']
      const wireData = star !== undefined && 'metadata' in star.wire ? star.wire.metadata : undefined
      assert.deepStrictEqual([star?.metadata, wireData, rockets?.type === 'compound' ? rockets.value['Explosions'] : undefined], [1, 1, { type: 'list', value: { type: 'end', value: [] } }])
      bot.end()
    })
  })
})
