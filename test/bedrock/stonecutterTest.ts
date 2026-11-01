import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockRecipe, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, RespondedSlot } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { GivenIngredient, GivenOutput, GivenRecipe } from './common/recipes.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The recorded values are the vanilla client's against Bedrock Dedicated Server.

const STONECUTTER_AT = Object.freeze({ x: 2, y: -60, z: 0 })
// the stonecutter window's slots: its input, its output, then the inventory (9 – 35) and the hotbar (0 – 8)
const INPUT = 0
const OUTPUT = 1
const HOTBAR = 29

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

interface Cutting extends TestBot {
  errors: string[]
  inventory: ServerInventory
  recipes: ServerRecipes
  idOf: (name: string) => number
}

async function joined (version: BedrockVersion): Promise<Cutting> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), recipes: new ServerRecipes(testBot.server, testBot.bot.registry), idOf }
}

function openStonecutter (server: FakeBedrockClient, windowId = 2): void {
  server.send('container_open', { window_id: windowId, window_type: 'stonecutter', coordinates: STONECUTTER_AT, runtime_entity_id: -1n })
}

function cut (id: string, networkId: number, input: GivenIngredient, output: GivenOutput): GivenRecipe {
  return { type: 'shapeless', id, networkId, uuid: `00000000-0000-0000-0000-${String(networkId).padStart(12, '0')}`, block: 'stonecutter', input: [input], output: [output] }
}

function stateIdOf (bot: TestBot['bot'], name: string, states: Readonly<Record<string, unknown>>): number {
  const { registry } = bot
  const palette = 'blockStatesByStateId' in registry ? Object.entries(registry.blockStatesByStateId) : []
  const found = palette.find(([, state]) => state.name === name && Object.entries(states).every(([key, value]) => state.states[key]?.value === value))
  assert.ok(found !== undefined, `no ${name} of ${JSON.stringify(states)}`)
  return Number(found[0])
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

/** each request the bot sent since the last call: its id, its actions (a legacy type id after a slash), a craft's recipe and times, a result's item, count and data */
function requestsSince ({ server, bot }: Pick<TestBot, 'server' | 'bot'>): () => string[] {
  const resultOf = (item: ResultItem): string => {
    const [count, metadata] = 'auxiliary_value' in item && item.auxiliary_value !== undefined ? [item.auxiliary_value & 0xff, item.auxiliary_value >> 8] : [Number(item.count), Number(item.metadata)]
    const name = 'network_id' in item ? bot.registry.items[Number(item.network_id)]?.name : item.name
    return `${name} ${count}:${metadata}`
  }
  const actionOf = (action: SentAction): string => {
    const legacy = 'legacy_type_id' in action ? `/${action.legacy_type_id}` : ''
    const type = `${String(action.type_id)}${legacy}`
    const craft = action.recipe_network_id === undefined ? '' : ` ${action.recipe_network_id}${action.times_crafted === undefined ? '' : ` ×${action.times_crafted}`}`
    const results = (action.result_items ?? []).map(item => ` ${resultOf(item)}`).join('')
    const slots = [action.source, action.destination].filter(slot => slot !== undefined).map(slotName).join(' → ')
    return `${type}${craft}${results}${action.count === undefined ? '' : ` ${action.count}`}${slots === '' ? '' : ` ${slots}`}`
  }
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => `${id} ${actions.map(actionOf).join(', ')}`)
  }
}

const TOLD: readonly string[] = Object.freeze(['item_stack_request', 'serverbound_stonecutter_set_recipe', 'serverbound_cursor_item_drag', 'container_close'])

/** the hex of the requests, selections, drags and closes the bot sent since the last call, in order */
function toldSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => TOLD.includes(name)).map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

function recipeOf (recipes: readonly BedrockRecipe[], index = 0): BedrockRecipe {
  const recipe = recipes[index]
  assert.ok(recipe !== undefined, `no stonecutter recipe ${index}`)
  return recipe
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** recorded in reduced_stonecutter: one item put in the input, the first button, then a left click on the output */
interface RecordedCut {
  from: BedrockVersion
  to: BedrockVersion
  recordedOn: BedrockVersion
  ingredient: { item: string, metadata?: number }
  /** the input's item, a block's by its state from 1.16.220 */
  input: { item: string, metadata?: number, state?: Readonly<Record<string, string>>, stackId: number }
  output: GivenOutput
  id: string
  networkId: number
  request: number
  /** the request, as requestsSince describes it, on every version of the group */
  described: string
  /** the selection told before it, and the request, as the client sent them on the build recorded */
  told: string[]
}

const CUTS: readonly RecordedCut[] = [
  {
    // recorded on 1.16.201.2: the request names no recipe and tells the result
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    recordedOn: 'bedrock_1.16.201',
    ingredient: { item: 'stone', metadata: 5 },
    input: { item: 'stone', metadata: 5, stackId: 3127 },
    output: { item: 'double_stone_slab3', count: 2, metadata: 3 },
    id: 'minecraft:stonecutter_andesite_slab',
    networkId: 1000,
    request: -4299,
    described: '-4299 non_implemented, results_deprecated double_stone_slab3 2:3, consume 1 stonecutter_input:3#3127, take 2 creative_output:50#-4299 → cursor:0#0',
    told: ['9301019543040d0e01c302840c000000000105013403ee3000023b3295433a000000']
  },
  {
    // recorded on 1.16.220.2: andesite is stone of data 0 and the andesite block's state
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.40',
    recordedOn: 'bedrock_1.16.220',
    ingredient: { item: 'stone', metadata: 5 },
    input: { item: 'stone', state: { stone_type: 'andesite' }, stackId: 1071 },
    output: { item: 'double_stone_slab3', count: 2, blockRuntimeId: 5977 },
    id: 'minecraft:stonecutter_andesite_slab',
    networkId: 1000,
    request: -1973,
    described: '-1973 non_implemented, results_deprecated double_stone_slab3 2:0, consume 1 stonecutter_input:3#1071, take 2 creative_output:50#-1973 → cursor:0#0',
    told: ['930101e91e040e0f01c302020000b25d0a000000000000000000000105013403de1000023b32e91e3a000000']
  },
  {
    // recorded on 1.18.0.2: the recipe named, the result told
    from: 'bedrock_1.18.0',
    to: 'bedrock_1.18.11',
    recordedOn: 'bedrock_1.18.0',
    ingredient: { item: 'cobbled_deepslate' },
    input: { item: 'cobbled_deepslate', stackId: 2643 },
    output: { item: 'chiseled_deepslate', count: 1, blockRuntimeId: 1129 },
    id: 'minecraft:chiseled_deepslate_from_cobbled_deepslate_stonecutting',
    networkId: 49,
    request: -3565,
    described: '-3565 craft_recipe 49, results_deprecated chiseled_deepslate 1:0, consume 1 stonecutter_input:3#2643, take 1 creative_output:50#-3565 → cursor:0#0',
    told: ['930101d937040a3111019506010000d2110a000000000000000000000105013403a62900013b32d9373a000000']
  },
  {
    // recorded on 1.18.30.4: the result no longer told
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.21.2',
    recordedOn: 'bedrock_1.18.30',
    ingredient: { item: 'cobbled_deepslate' },
    input: { item: 'cobbled_deepslate', stackId: 2643 },
    output: { item: 'chiseled_deepslate', count: 1 },
    id: 'minecraft:chiseled_deepslate_from_cobbled_deepslate_stonecutting',
    networkId: 58,
    request: -3565,
    described: '-3565 craft_recipe 58, consume 1 stonecutter_input:3#2643, take 1 creative_output:50#-3565 → cursor:0#0',
    told: ['930101d937030c3a05013403a62900013b32d9373a000000']
  },
  {
    // recorded on 1.21.20.3: the times crafted
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.26.30',
    recordedOn: 'bedrock_1.21.20',
    ingredient: { item: 'cobbled_deepslate' },
    input: { item: 'cobbled_deepslate', stackId: 2710 },
    output: { item: 'chiseled_deepslate', count: 1 },
    id: 'minecraft:chiseled_deepslate_from_cobbled_deepslate_stonecutting',
    networkId: 441,
    request: -3583,
    described: '-3583 craft_recipe 441 ×1, consume 1 stonecutter_input:3#2710, take 1 creative_output:50#-3583 → cursor:0#0',
    told: ['930101fd37030cb903010501350000000003ac2a00013c0000000032fd373b00000000000000ffffffff']
  },
  {
    // recorded on 1.26.51.1: each action's legacy type
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    recordedOn: 'bedrock_1.26.51',
    ingredient: { item: 'cobbled_deepslate' },
    input: { item: 'cobbled_deepslate', stackId: 2719 },
    output: { item: 'chiseled_deepslate', count: 1 },
    id: 'minecraft:chiseled_deepslate_from_cobbled_deepslate_stonecutting',
    networkId: 1198,
    request: -3565,
    described: '-3565 craft_recipe/12 1198 ×1, consume/5 1 stonecutter_input:3#2719, take/0 1 creative_output:50#-3565 → cursor:0#0',
    told: ['930101d937030a0cae09010505013500039f0a00000000013c003213f2ffff3b00000000000000ffffffff']
  },
  {
    // recorded on 1.26.60.5: the input emptied, the selection is reset before the request
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    recordedOn: 'bedrock_1.26.60',
    ingredient: { item: 'cobbled_deepslate', metadata: 0 },
    input: { item: 'cobbled_deepslate', stackId: 2857 },
    output: { item: 'chiseled_deepslate', count: 1 },
    id: 'minecraft:chiseled_deepslate_from_cobbled_deepslate_stonecutting',
    networkId: 4070,
    request: -3747,
    described: '-3747 craft_recipe/12 4070 ×1, consume/5 1 stonecutter_input:3#2857, take/0 1 creative_output:50#-3747 → cursor:0#0',
    told: ['e2020200', 'e2020200', '930101c53a030a0ce61f01050501350003290b00000000013c00325df1ffff3b00000000000000ffffffff']
  }
]

describe('bedrock stonecutter', () => {
  for (const recorded of CUTS) {
    describe(`the vanilla client cutting by the selected button, the result taken to the cursor (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: ${recorded.id}`, async () => {
          const cutting = await joined(version)
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = cutting
          recipes.send([cut(recorded.id, recorded.networkId, recorded.ingredient, recorded.output)])
          openStonecutter(server)
          const { item, metadata, state, stackId } = recorded.input
          const block = state === undefined ? {} : { blockRuntimeId: stateIdOf(bot, item, state) }
          inventory.slot('ui', 3, { id: idOf(item), count: 1, stackId, ...metadata === undefined ? {} : { metadata }, ...block })
          await driver.tick()
          const { item: ingredient, metadata: data } = recorded.ingredient
          const recipe = recipeOf(bot.bedrock.stonecutterRecipes(idOf(ingredient), data))
          // up to 1.26.30 an ingredient is an item and its data; from 1.26.40 stone is a complex alias, of any data
          const otherData = data !== undefined && !atLeast(version, 'bedrock_1.26.40') ? bot.bedrock.stonecutterRecipes(idOf(ingredient), data + 1) : []
          assert.deepStrictEqual([otherData, bot.bedrock.stonecutterRecipes(idOf(ingredient))], [[], [recipe]])
          const selected = bot.bedrock.selectStonecutterRecipe(recipe)
          await driver.tick()
          await selected
          internal._core.requestIds.continueProcess(recorded.request)
          const [described, told] = [requestsSince(cutting), toldSince(server)]
          const clicked = bot.clickWindow(OUTPUT, 0, 0)
          await driver.tick()
          // a click's request takes its own id alone
          assert.deepStrictEqual([described(), internal._core.requestIds.nextStackRequest()], [[recorded.described], recorded.request - 2])
          if (version === recorded.recordedOn) assert.deepStrictEqual(told(), recorded.told)
          inventory.respond(recorded.request, [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'cursor', slot: 0, count: recorded.output.count, stackId: stackId + 1 }])
          await driver.tick()
          await clicked
          const window = bot.currentWindow
          assert.deepStrictEqual([window?.slots[INPUT], window?.selectedItem?.name, countAndId(window?.selectedItem), errors], [null, recorded.output.item, [recorded.output.count, stackId + 1], []])
          bot.end()
        })
      }
    })
  }

  describe('the vanilla client\'s shift clicks place the result in the inventory\'s first slot with room, its key 1 takes it to hotbar slot 0 (recorded on 1.26.51.1)', () => {
    // one stone, cobblestone selected, hotbar slot 0 empty
    const gestures: ReadonlyArray<{ what: string, mode: number, button: number, request: number, stone: number, told: string }> = [
      { what: 'a shift left click', mode: 1, button: 0, request: -6521, stone: 1674, told: '930101f165030a0cc203010505013500038a0600000101013c003287e6ffff0c00000000000000ffffffff' },
      { what: 'a shift right click', mode: 1, button: 1, request: -6527, stone: 1676, told: '930101fd65030a0cc203010505013500038c0600000101013c003281e6ffff0c00000000000000ffffffff' },
      { what: 'the key 1', mode: 2, button: 0, request: -6495, stone: 1668, told: '930101bd65030a0cc20301050501350003840600000000013c0032a1e6ffff1c00000000000000ffffffff' }
    ]
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: ${gestures.map(({ what }) => what).join(', ')}`, async () => {
        const told: string[][] = []
        for (const { mode, button, request, stone } of gestures) {
          const cutting = await joined(version)
          const { bot, internal, server, driver, inventory, recipes, idOf } = cutting
          recipes.send([cut('minecraft:stonecutter_cobblestone', 450, { item: 'stone' }, { item: 'cobblestone', count: 1 })])
          openStonecutter(server)
          inventory.slot('ui', 3, { id: idOf('stone'), count: 1, stackId: stone })
          await driver.tick()
          const selected = bot.bedrock.selectStonecutterRecipe(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'), null)))
          await driver.tick()
          await selected
          internal._core.requestIds.continueProcess(request)
          const sent = toldSince(server)
          bot.clickWindow(OUTPUT, button, mode).catch(() => {})
          await driver.tick()
          told.push(sent())
          bot.end()
        }
        assert.deepStrictEqual(told, gestures.map(({ told }) => [told]))
      })
    }
  })

  // recorded in reduced_stations' pick_shift: 4 stone, the second button, a shift click on the output
  const STAIRS = cut('minecraft:stonecutter_stone_stairs', 1037, { item: 'stone' }, { item: 'stone_stairs', count: 1 })
  const SLABS = cut('minecraft:stonecutter_cobblestone_slab_from_stone', 3323, { item: 'stone' }, { item: 'stone_block_slab4', count: 2 })

  async function shiftClicked (version: BedrockVersion, recipe: GivenRecipe, stackId: number, request: number): Promise<string[]> {
    const cutting = await joined(version)
    const { bot, internal, server, driver, inventory, recipes, idOf } = cutting
    recipes.send([cut('minecraft:stonecutter_stonebrick', 1036, { item: 'stone' }, { item: 'stonebrick', count: 1 }), recipe])
    openStonecutter(server)
    inventory.slot('ui', 3, { id: idOf('stone'), count: 4, stackId })
    await driver.tick()
    const selected = bot.bedrock.selectStonecutterRecipe(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'), null), 1))
    await driver.tick()
    await selected
    internal._core.requestIds.continueProcess(request)
    const described = requestsSince(cutting)
    bot.clickWindow(OUTPUT, 0, 1).catch(() => {})
    await driver.tick()
    const next = internal._core.requestIds.nextStackRequest()
    bot.end()
    return [...described(), `next ${next}`]
  }

  describe('the vanilla client shift clicking the output: a craft a request, each onto the stack the one before made, then the id of one more not sent (1.18.30 – 1.21.2, recorded on 1.21.2.2)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.30', 'bedrock_1.21.2')) {
      it(`bedrock ${version}: 4 stone to 4 stone stairs, in one packet`, async () => {
        assert.deepStrictEqual(await shiftClicked(version, STAIRS, 3413, -4807), [
          '-4807 craft_recipe 1037, consume 1 stonecutter_input:3#3413, place 1 creative_output:50#-4807 → hotbar_and_inventory:0#0',
          '-4809 craft_recipe 1037, consume 1 stonecutter_input:3#-4807, place 1 creative_output:50#-4809 → hotbar_and_inventory:0#-4807',
          '-4811 craft_recipe 1037, consume 1 stonecutter_input:3#-4809, place 1 creative_output:50#-4811 → hotbar_and_inventory:0#-4809',
          '-4813 craft_recipe 1037, consume 1 stonecutter_input:3#-4811, place 1 creative_output:50#-4813 → hotbar_and_inventory:0#-4811',
          'next -4817'
        ])
      })
    }
  })

  describe('the vanilla client shift clicking the output: a stack\'s worth a request (1.21.20+, recorded on 1.21.20.3 and 1.26.51.1)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: 4 stone to 8 cobblestone slabs`, async () => {
        assert.deepStrictEqual(await shiftClicked(version, SLABS, 5729, -10751), [
          '-10751 craft_recipe 3323 ×4, consume 4 stonecutter_input:3#5729, place 8 creative_output:50#-10751 → hotbar_and_inventory:0#0',
          'next -10753'
        ])
      })
    }
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: 4 stone to 8 cobblestone slabs, each action's legacy type`, async () => {
        assert.deepStrictEqual(await shiftClicked(version, SLABS, 5729, -10751), [
          '-10751 craft_recipe/12 3323 ×4, consume/5 4 stonecutter_input:3#5729, place/1 8 creative_output:50#-10751 → hotbar_and_inventory:0#0',
          'next -10753'
        ])
      })
    }
  })

  describe('the vanilla client telling the selection: the first button twice at the opening and whenever the input fills or empties, the button\'s index twice when one is clicked (1.26.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60', 'bedrock_1.26.60')) {
      // recorded on 1.26.60.5 in stations: pick_take, then pick_shift
      it(`bedrock ${version}: 4 stone in the input, the first button, a click (4 to 3), the hand-back; then 4 stone, the second button, a shift click`, async () => {
        const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
        recipes.send([
          cut('minecraft:stonecutter_cobblestone_from_stone', 3322, { item: 'stone', metadata: 0 }, { item: 'cobblestone', count: 1 }),
          cut('minecraft:stonecutter_cobblestone_slab_from_stone', 3323, { item: 'stone', metadata: 0 }, { item: 'stone_block_slab4', count: 2 })
        ])
        const stone = (stackId: number): Given => ({ id: idOf('stone'), count: 4, stackId })
        inventory.slot('inventory', 0, stone(1287))
        await driver.tick()
        const told = toldSince(server)
        openStonecutter(server, 2)
        await driver.frame(10)
        assert.deepStrictEqual(told(), ['e2020200', 'e2020200'])
        internal._core.requestIds.continueProcess(-2403)
        const step = async (made: Promise<void>, sent: string[], ...answers: string[]): Promise<void> => {
          await driver.ticks(2)
          assert.deepStrictEqual(told(), sent)
          receive(server, ...answers)
          await driver.tick()
          await made
        }
        await step(bot.clickWindow(HOTBAR, 0, 0), ['930101c525010000041c0000070500003b00000000000000ffffffff'], '94010100c52501021c0001000000000000003b0001000004018e14000000')
        await step(bot.clickWindow(INPUT, 0, 0), ['e60200', 'e2020200', 'e2020200', '930101c925010101043b0000070500003500030000000000ffffffff', 'e60201'],
          'e302fdffffff1f0200', '94010100c92501023b000100000000000000350001030304018e14000000')
        const recipes1 = bot.bedrock.stonecutterRecipes(idOf('stone'), 0)
        await step(bot.bedrock.selectStonecutterRecipe(recipeOf(recipes1)), ['e2020200'])
        await step(bot.clickWindow(OUTPUT, 0, 0), ['930101cd25030a0cfa1901050501350003070500000000013c003299f6ffff3b00000000000000ffffffff'], '94010100cd250102350001030303018e140000003b0001000001019014000000')
        await step(bot.clickWindow(HOTBAR + 8, 0, 0), ['e60200', '930101d125010101013b0000080500001c00080000000000ffffffff', 'e60201'], '94010100d12501023b0001000000000000001c0001080801019014000000')
        const window = bot.currentWindow
        assert.ok(window !== null)
        const closed = bot.closeWindow(window)
        await step(Promise.resolve(), ['e2020200', 'e2020200', '930101d52501010103350003070500000c00000000000000ffffffff'], 'e302fdffffff1f0200', '94010100d5250102350001030300000000000c0001000003018e14000000')
        await driver.ticks(12)
        assert.deepStrictEqual(told(), ['2f02f700'])
        receive(server, '2f02f700')
        await driver.tick()
        await closed

        inventory.slot('inventory', 0, stone(1290))
        openStonecutter(server, 3)
        await driver.frame(10)
        assert.deepStrictEqual(told(), ['e2020300', 'e2020300'])
        internal._core.requestIds.continueProcess(-2413)
        await step(bot.clickWindow(HOTBAR, 0, 0), ['930101d925010000041c00000a0500003b00000000000000ffffffff'], '94010100d92501021c0001000000000000003b0001000004019414000000')
        await step(bot.clickWindow(INPUT, 0, 0), ['e60200', 'e2020300', 'e2020300', '930101dd25010101043b00000a0500003500030000000000ffffffff', 'e60201'],
          'e302fdffffff1f0300', '94010100dd2501023b000100000000000000350001030304019414000000')
        await step(bot.bedrock.selectStonecutterRecipe(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'), 0), 1)), ['e2020302'])
        await step(bot.clickWindow(OUTPUT, 0, 1), ['e2020300', 'e2020300', '930101e125030a0cfb19040505043500030a0500000101083c00328ff6ffff0c00000000000000ffffffff'],
          'e302fdffffff1f0300', '94010100e1250102350001030300000000000c0001000008019614000000')
        assert.deepStrictEqual([countAndId(bot.inventory.slots[36]), bot.inventory.slots[36]?.name, errors], [[8, 1291], 'stone_block_slab4', []])
        bot.end()
      })
    }
  })

  describe('closing: the cursor\'s item, then the input\'s, given back; up to 1.21.111 the close with them, from 1.21.120 after the crafting table\'s animation', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.111', 'bedrock_1.21.120')) {
      // recorded in reduced_stations' pick_take on 1.21.2.2: -4801 place(stonecutter_input:3 → hotbar_and_inventory:0, 3), container_close in its packet
      it(`bedrock ${version}: 3 stone back to hotbar slot 0, the cursor's dirt to slot 1`, async () => {
        const cutting = await joined(version)
        const { bot, internal, server, driver, inventory, idOf } = cutting
        openStonecutter(server)
        inventory.slot('ui', 3, { id: idOf('stone'), count: 3, stackId: 3410 })
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 3411 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-4801)
        const described = requestsSince(cutting)
        const window = bot.currentWindow
        assert.ok(window !== null)
        assert.deepStrictEqual([window.type, window.slots.length, window.inventoryStart, window.craftingResultSlot], ['minecraft:stonecutter', 38, 2, 1])
        bot.closeWindow(window).catch(() => {})
        await driver.frame(31.25)
        const atOnce = server.sentOf('container_close').length
        let frames = 0
        while (server.sentOf('container_close').length === 0 && frames < 20) {
          await driver.frame(31.25)
          frames++
        }
        assert.deepStrictEqual([described(), atOnce, frames], [[
          '-4801 place 1 cursor:0#3411 → hotbar_and_inventory:0#0',
          '-4803 place 3 stonecutter_input:3#3410 → hotbar_and_inventory:1#0'
        ], atLeast(version, 'bedrock_1.21.120') ? 0 : 1, atLeast(version, 'bedrock_1.21.120') ? 14 : 0])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const COBBLESTONE = cut('cobblestone', 1, { item: 'stone', metadata: 0 }, { item: 'cobblestone', count: 1 })
    const SLAB = cut('slab', 2, { item: 'stone', metadata: 0 }, { item: 'stone_block_slab4', count: 2 })
    const BRICKS = cut('bricks', 3, { item: 'stone', metadata: 0 }, { item: 'stonebrick', count: 1 })
    const GRANITE = cut('granite slab', 4, { item: 'granite' }, { item: 'stone_block_slab3', count: 2 })
    const NO_INPUT = cut('no input', 6, null, { item: 'stonebrick', count: 1 })
    const TABLE: GivenRecipe = { type: 'shapeless', id: 'not a cut', networkId: 5, uuid: '00000000-0000-0000-0000-000000000005', input: [{ item: 'stone', metadata: 0 }], output: [{ item: 'stone_button', count: 1 }] }

    /** the stonecutter open, its input holding `count` stone, the recipes sent */
    async function cutter (count: number, given: readonly GivenRecipe[] = [COBBLESTONE, TABLE, SLAB, NO_INPUT, GRANITE, BRICKS]): Promise<Cutting & { told: () => string[], described: () => string[] }> {
      const cutting = await joined(version)
      const { server, driver, inventory, recipes, idOf } = cutting
      recipes.send(given)
      openStonecutter(server)
      if (count > 0) inventory.slot('ui', 3, { id: idOf('stone'), count, stackId: 10 })
      await driver.tick()
      return { ...cutting, told: toldSince(server), described: requestsSince(cutting) }
    }

    async function selected (bot: TestBot['bot'], driver: TestBot['driver'], index: number): Promise<void> {
      const select = bot.bedrock.selectStonecutterRecipe(recipeOf(bot.bedrock.stonecutterRecipes(bot.registry.itemsByName['stone']?.id ?? 0, null), index))
      await driver.tick()
      await select
    }

    it('shows the stonecutter\'s recipes taking an item, in crafting_data\'s order, of any metadata for null (stone being a complex alias of any data); not another block\'s, nor one without an input', async () => {
      const { bot, idOf } = await cutter(0)
      const ids = (metadata?: number | null): string[] => bot.bedrock.stonecutterRecipes(idOf('stone'), metadata).map(({ id }) => id)
      assert.deepStrictEqual([ids(), ids(null), ids(0), bot.bedrock.stonecutterRecipes(idOf('granite')).map(({ id }) => id), bot.bedrock.stonecutterRecipes(idOf('dirt'))], [
        ['cobblestone', 'slab', 'bricks'], ['cobblestone', 'slab', 'bricks'], ['cobblestone', 'slab', 'bricks'], ['granite slab'], []
      ])
      bot.end()
    })

    it('tells the server the button selected by twice its index among those the input shows, and the reset its emptying and filling make (not a swap), in their request\'s packet before it', async () => {
      const { bot, server, driver, inventory, idOf } = await cutter(2)
      await selected(bot, driver, 2)
      assert.deepStrictEqual(server.sentOf('serverbound_stonecutter_set_recipe').at(-1), { container_id: 2, recipe_index: 4 })
      const packets = (): string[][] => server.batches.map(batch => batch.map(({ name }) => name).filter(name => name === 'serverbound_stonecutter_set_recipe' || name === 'item_stack_request')).filter(names => names.length > 0)
      const before = packets().length
      const clicked = async (button: number, input: Given | null, cursor: Given | null): Promise<void> => {
        bot.clickWindow(INPUT, button, 0).catch(() => {})
        await driver.tick()
        inventory.slot('ui', 3, input)
        inventory.slot('ui', 0, cursor)
        await driver.tick()
      }
      const stone = (count: number): Given => ({ id: idOf('stone'), count, stackId: 10 })
      await clicked(0, null, stone(2))
      await clicked(1, stone(1), stone(1))
      await clicked(1, stone(2), { id: idOf('dirt'), count: 1, stackId: 11 })
      await clicked(0, null, null)
      const set = ['serverbound_stonecutter_set_recipe', 'serverbound_stonecutter_set_recipe']
      assert.deepStrictEqual([packets().slice(before), server.sentOf('serverbound_stonecutter_set_recipe').slice(-4).map(({ recipe_index: index }) => index)], [
        [[...set, 'item_stack_request'], [...set, 'item_stack_request'], ['item_stack_request'], ['item_stack_request']], [0, 0, 0, 0]
      ])
      bot.end()
    })

    it('crafts nothing without a selection, nor while the input holds an item it does not take, nor once the input emptied or another item was swapped in; a click sends nothing while the cursor holds another item or its stack has no room', async () => {
      const { bot, internal, driver, inventory, idOf, described } = await cutter(2)
      const nothing = async (): Promise<void> => {
        const clicked = bot.clickWindow(OUTPUT, 0, 0)
        await driver.tick()
        await clicked
        assert.deepStrictEqual(described(), [])
      }
      await nothing()
      await selected(bot, driver, 0)
      inventory.slot('ui', 3, { id: idOf('granite'), count: 2, stackId: 10 })
      await driver.tick()
      await nothing()
      inventory.slot('ui', 3, { id: idOf('stone'), count: 2, stackId: 10 })
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 11 })
      await driver.tick()
      await nothing()
      inventory.slot('ui', 0, { id: idOf('cobblestone'), count: 64, stackId: 11 })
      await driver.tick()
      await nothing()
      internal._core.requestIds.continueProcess(-3)
      const swapping = bot.clickWindow(INPUT, 0, 0)
      await driver.tick()
      inventory.respond(-3, [{ container: 'stonecutter_input', slot: 3, count: 64, stackId: 11 }, { container: 'cursor', slot: 0, count: 2, stackId: 10 }])
      await driver.tick()
      await swapping
      assert.deepStrictEqual(described(), ['-3 swap/2 cursor:0#11 → stonecutter_input:3#10'])
      inventory.slot('ui', 3, { id: idOf('stone'), count: 2, stackId: 10 })
      inventory.slot('ui', 0, null)
      await driver.tick()
      await nothing()
      await selected(bot, driver, 0)
      const taking = bot.clickWindow(INPUT, 0, 0)
      await driver.tick()
      inventory.respond(-5, [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 10 }])
      await driver.tick()
      await taking
      const putting = bot.clickWindow(INPUT, 0, 0)
      await driver.tick()
      inventory.respond(-7, [{ container: 'stonecutter_input', slot: 3, count: 2, stackId: 10 }, { container: 'cursor', slot: 0, count: 0 }])
      await driver.tick()
      await putting
      assert.deepStrictEqual(described(), ['-5 take/0 2 stonecutter_input:3#10 → cursor:0#0', '-7 place/1 2 cursor:0#10 → stonecutter_input:3#0'])
      await nothing()
      bot.end()
    })

    it('forgets the selection when a stonecutter opens again; keeps it over a swap of other slots', async () => {
      const { bot, internal, server, driver, inventory, idOf, described } = await cutter(2)
      await selected(bot, driver, 0)
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 1, stackId: 11 })
      inventory.slot('ui', 0, { id: idOf('granite'), count: 1, stackId: 12 })
      await driver.tick()
      internal._core.requestIds.continueProcess(-3)
      const swapping = bot.clickWindow(HOTBAR, 0, 0)
      await driver.tick()
      inventory.respond(-3, [{ container: 'cursor', slot: 0, count: 1, stackId: 11 }, { container: 'hotbar', slot: 0, count: 1, stackId: 12 }])
      await driver.tick()
      await swapping
      bot.clickWindow(OUTPUT, 4, 2).catch(() => {})
      await driver.tick()
      inventory.respond(-5, [{ container: 'stonecutter_input', slot: 3, count: 1, stackId: 10 }, { container: 'hotbar', slot: 4, count: 1, stackId: 13 }])
      openStonecutter(server, 3)
      await driver.tick()
      const again = bot.clickWindow(OUTPUT, 4, 2)
      await driver.tick()
      await again
      assert.deepStrictEqual(described(), ['-3 swap/2 cursor:0#12 → hotbar:0#11', '-5 craft_recipe/12 1 ×1, consume/5 1 stonecutter_input:3#10, take/0 1 creative_output:50#-5 → hotbar:4#0'])
      bot.end()
    })

    it('takes the result to a hotbar key\'s slot, onto the cursor\'s stack of it, or with a right click the whole result; keeps the selection while the input lasts', async () => {
      const { bot, internal, driver, inventory, idOf, described } = await cutter(3)
      await selected(bot, driver, 1)
      inventory.slot('inventory', 4, { id: idOf('stone_block_slab4'), count: 62, stackId: 11 })
      inventory.slot('ui', 0, { id: idOf('stone_block_slab4'), count: 2, stackId: 12 })
      await driver.tick()
      internal._core.requestIds.continueProcess(-3)
      for (const [button, mode] of [[4, 2], [1, 0], [0, 0]]) bot.clickWindow(OUTPUT, button ?? 0, mode ?? 0).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual(described(), [
        '-3 craft_recipe/12 2 ×1, consume/5 1 stonecutter_input:3#10, take/0 2 creative_output:50#-3 → hotbar:4#11',
        '-5 craft_recipe/12 2 ×1, consume/5 1 stonecutter_input:3#-3, take/0 2 creative_output:50#-5 → cursor:0#12',
        '-7 craft_recipe/12 2 ×1, consume/5 1 stonecutter_input:3#-5, take/0 2 creative_output:50#-7 → cursor:0#-5'
      ])
      bot.end()
    })

    it('shift clicks while the inventory has room: a stack\'s worth a request, the rest of the input left', async () => {
      const { bot, internal, driver, inventory, idOf, described } = await cutter(64, [SLAB])
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => slot < 34 ? { id: idOf('dirt'), count: 64, stackId: 20 + slot } : slot === 34 ? { id: idOf('stone_block_slab4'), count: 60, stackId: 60 } : null))
      await selected(bot, driver, 0)
      internal._core.requestIds.continueProcess(-3)
      bot.clickWindow(OUTPUT, 0, 1).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual(described(), [
        '-3 craft_recipe/12 2 ×32, consume/5 32 stonecutter_input:3#10, place/1 4 creative_output:50#-3 → hotbar_and_inventory:34#60, place/1 60 creative_output:50#-3 → hotbar_and_inventory:35#0',
        '-5 craft_recipe/12 2 ×2, consume/5 2 stonecutter_input:3#-3, place/1 4 creative_output:50#-5 → hotbar_and_inventory:35#-3'
      ])
      bot.end()
    })

    it('rejects a select without a stonecutter open (or once its close gave the items back), a recipe not the stonecutter\'s or not sent, one the input does not take, sending nothing', async () => {
      const { bot, server, driver, recipes, idOf, told } = await cutter(0)
      const [table] = bot.recipesAll(idOf('stone_button'), null, false)
      assert.ok(table !== undefined)
      const cobblestone = recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone')))
      const granite = recipeOf(bot.bedrock.stonecutterRecipes(idOf('granite')))
      const rejected = async (recipe: BedrockRecipe): Promise<string> => {
        const select = bot.bedrock.selectStonecutterRecipe(recipe).then(() => 'selected', (error: Error) => error.message)
        await driver.tick()
        return await select
      }
      const empty = await rejected(cobblestone)
      recipes.send([COBBLESTONE])
      const window = bot.currentWindow
      assert.ok(window !== null)
      bot.closeWindow(window).catch(() => {})
      await driver.tick()
      const closing = await rejected(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'))))
      server.send('container_close', { window_id: 2, window_type: 'none', server: false })
      await driver.tick()
      assert.deepStrictEqual([await rejected(table), await rejected(granite), empty, closing, await rejected(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'))))], [
        'not a cut is not one of the stonecutter\'s recipes the server sent',
        'granite slab is not one of the stonecutter\'s recipes the server sent',
        'the stonecutter\'s input does not take cobblestone',
        'selectStonecutterRecipe needs an open stonecutter',
        'selectStonecutterRecipe needs an open stonecutter'
      ])
      assert.deepStrictEqual(told(), [])
      bot.end()
    })

    it('reads the server\'s answer to a reset, which nothing depends on', async () => {
      const { bot, internal, server, driver, errors } = await cutter(0)
      receive(server, 'e302fdffffff1f0200')
      await driver.tick()
      assert.deepStrictEqual([internal._core.stats.packets.get('clientbound_stonecutter_set_recipe')?.handled, errors], [1, []])
      bot.end()
    })

    describe('stonecut', () => {
      function stonecutterBlock (bot: TestBot['bot']): Block {
        const state = bot.registry.blocksByName['stonecutter_block']?.defaultState ?? 0
        const block = prismarineBlock(bot.registry).fromStateId(state, 0)
        block.position = new Vec3(STONECUTTER_AT.x, STONECUTTER_AT.y, STONECUTTER_AT.z)
        return block
      }

      /** steps ticks, answering each request with the slots given for it, in order */
      async function answered ({ server, driver, inventory }: Cutting, answers: ReadonlyArray<readonly RespondedSlot[]>, done: () => boolean): Promise<void> {
        let seen = server.sentOf('item_stack_request').length
        const left = [...answers]
        for (let ticks = 0; ticks < 40 && !done(); ticks++) {
          await driver.tick()
          const fresh = server.sentOf('item_stack_request').slice(seen).flatMap(({ requests }) => requests)
          seen += server.sentOf('item_stack_request').slice(seen).length
          for (const { request_id: id } of fresh) inventory.respond(id, left.shift() ?? [])
        }
      }

      it('opens the stonecutter given, puts the ingredients in its input as clicks do, selects, shift clicks the output and closes it; a count of 0 cuts nothing', async () => {
        const cutting = await joined(version)
        const { bot, internal, server, driver, inventory, recipes, idOf } = cutting
        recipes.send([COBBLESTONE, SLAB])
        inventory.slot('inventory', 0, { id: idOf('stone'), count: 1, stackId: 2 })
        inventory.slot('inventory', 5, { id: idOf('stone'), count: 3, stackId: 3 })
        await driver.tick()
        const opened: Block[] = []
        internal.openBlock = async block => {
          opened.push(block)
          openStonecutter(server)
          await bot.waitForTicks(1)
          return bot.currentWindow ?? bot.inventory
        }
        const described = requestsSince(cutting)
        const block = stonecutterBlock(bot)
        let done = false
        const cutDone = bot.bedrock.stonecut(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone')), 1), 3, block).finally(() => { done = true })
        await answered(cutting, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'stonecutter_input', slot: 3, count: 1, stackId: 2 }],
          [{ container: 'hotbar', slot: 5, count: 0 }, { container: 'cursor', slot: 0, count: 3, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 2, stackId: 3 }, { container: 'stonecutter_input', slot: 3, count: 2, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 1, stackId: 3 }, { container: 'stonecutter_input', slot: 3, count: 3, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 5, count: 1, stackId: 3 }],
          [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 6, stackId: 4 }]
        ], () => server.sentOf('container_close').length > 0)
        server.send('container_close', { window_id: 2, window_type: 'none', server: false })
        await driver.tick()
        await cutDone
        assert.deepStrictEqual([opened, server.sentOf('container_close'), described(), done, server.sentOf('serverbound_stonecutter_set_recipe').map(({ recipe_index: index }) => index)], [[block], [{ window_id: 2, window_type: 'none', server: false }], [
          '-3 take/0 1 hotbar:0#2 → cursor:0#0',
          '-5 place/1 1 cursor:0#2 → stonecutter_input:3#0',
          '-7 take/0 3 hotbar:5#3 → cursor:0#0',
          '-9 place/1 1 cursor:0#3 → stonecutter_input:3#2',
          '-11 place/1 1 cursor:0#3 → stonecutter_input:3#2',
          '-13 place/1 1 cursor:0#3 → hotbar:5#0',
          '-15 craft_recipe/12 2 ×3, consume/5 3 stonecutter_input:3#2, place/1 6 creative_output:50#-15 → hotbar_and_inventory:0#0'
        ], true, [0, 0, 0, 0, 2, 0, 0]])
        await bot.bedrock.stonecut(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'))), 0)
        bot.end()
      })

      it('cuts at the stonecutter open, topping its input up; Java\'s null count once, its null stonecutter none', async () => {
        const cutting = await joined(version)
        const { bot, server, driver, inventory, recipes, idOf } = cutting
        recipes.send([COBBLESTONE])
        openStonecutter(server)
        inventory.slot('ui', 3, { id: idOf('stone'), count: 1, stackId: 2 })
        inventory.slot('inventory', 0, { id: idOf('stone'), count: 3, stackId: 3 })
        await driver.tick()
        const described = requestsSince(cutting)
        const recipe = recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone')))
        let done = false
        const twice = bot.bedrock.stonecut(recipe, 2).finally(() => { done = true })
        await answered(cutting, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 3, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 2, stackId: 3 }, { container: 'stonecutter_input', slot: 3, count: 2, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 0, count: 2, stackId: 3 }],
          [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 1, count: 2, stackId: 4 }]
        ], () => done)
        await twice
        inventory.slot('ui', 3, { id: idOf('stone'), count: 1, stackId: 5 })
        await driver.tick()
        done = false
        const once = bot.bedrock.stonecut(recipe, null, null).finally(() => { done = true })
        await answered(cutting, [[{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 1, count: 3, stackId: 4 }]], () => done)
        await once
        assert.deepStrictEqual([described(), bot.currentWindow?.type, server.sentOf('container_close')], [[
          '-3 take/0 3 hotbar:0#3 → cursor:0#0',
          '-5 place/1 1 cursor:0#3 → stonecutter_input:3#2',
          '-7 place/1 2 cursor:0#3 → hotbar:0#0',
          '-9 craft_recipe/12 1 ×2, consume/5 2 stonecutter_input:3#2, place/1 2 creative_output:50#-9 → hotbar_and_inventory:1#0',
          '-11 craft_recipe/12 1 ×1, consume/5 1 stonecutter_input:3#5, place/1 1 creative_output:50#-11 → hotbar_and_inventory:1#4'
        ], 'minecraft:stonecutter', []])
        bot.end()
      })

      it('cuts a stack\'s worth at once, the most the input holds', async () => {
        const cutting = await joined(version)
        const { bot, driver, inventory, recipes, idOf, server } = cutting
        recipes.send([COBBLESTONE])
        openStonecutter(server)
        inventory.slot('ui', 3, { id: idOf('stone'), count: 63, stackId: 2 })
        inventory.slot('inventory', 0, { id: idOf('stone'), count: 2, stackId: 3 })
        await driver.tick()
        const described = requestsSince(cutting)
        let done = false
        const cut = bot.bedrock.stonecut(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'))), 64).finally(() => { done = true })
        await answered(cutting, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 1, stackId: 3 }, { container: 'stonecutter_input', slot: 3, count: 64, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 0, count: 1, stackId: 3 }],
          [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 1, count: 64, stackId: 4 }]
        ], () => done)
        await cut
        assert.deepStrictEqual(described(), [
          '-3 take/0 2 hotbar:0#3 → cursor:0#0',
          '-5 place/1 1 cursor:0#3 → stonecutter_input:3#2',
          '-7 place/1 1 cursor:0#3 → hotbar:0#0',
          '-9 craft_recipe/12 1 ×64, consume/5 64 stonecutter_input:3#2, place/1 64 creative_output:50#-9 → hotbar_and_inventory:1#0'
        ])
        bot.end()
      })

      it('rejects, sending nothing: a recipe not the stonecutter\'s, no whole count, without the ingredients, more than a stack, an input of another item or more than the crafts take, the cursor holding an item, no stonecutter', async () => {
        const cutting = await joined(version)
        const { bot, server, driver, inventory, recipes, idOf } = cutting
        recipes.send([COBBLESTONE, TABLE, GRANITE])
        inventory.slot('inventory', 0, { id: idOf('stone'), count: 64, stackId: 2 })
        inventory.slot('inventory', 1, { id: idOf('stone'), count: 2, stackId: 3 })
        await driver.tick()
        const [table] = bot.recipesAll(idOf('stone_button'), null, false)
        assert.ok(table !== undefined)
        const recipe = recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone')))
        const granite = recipeOf(bot.bedrock.stonecutterRecipes(idOf('granite')))
        const messages: string[] = []
        const rejected = async (cutting: Promise<void>): Promise<void> => {
          await cutting.then(() => { messages.push('cut') }, (error: Error) => { messages.push(error.message) })
        }
        await rejected(bot.bedrock.stonecut(table))
        await rejected(bot.bedrock.stonecut(recipe, 1.5))
        await rejected(bot.bedrock.stonecut(recipe, -1))
        await rejected(bot.bedrock.stonecut(granite))
        await rejected(bot.bedrock.stonecut(recipe, 65))
        await rejected(bot.bedrock.stonecut(recipe, 67))
        await rejected(bot.bedrock.stonecut(recipe))
        openStonecutter(server)
        inventory.slot('ui', 3, { id: idOf('granite'), count: 1, stackId: 4 })
        await driver.tick()
        await rejected(bot.bedrock.stonecut(recipe))
        inventory.slot('ui', 3, { id: idOf('stone'), count: 3, stackId: 4 })
        await driver.tick()
        await rejected(bot.bedrock.stonecut(recipe, 2))
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 5 })
        await driver.tick()
        await rejected(bot.bedrock.stonecut(recipe, 3))
        assert.deepStrictEqual([messages, server.sentOf('item_stack_request')], [[
          'not a cut is not one of the stonecutter\'s recipes the server sent',
          'stonecut cuts a whole number of times, not 1.5',
          'stonecut cuts a whole number of times, not -1',
          'the inventory has not the ingredients to cut granite slab 1 times',
          'the stonecutter\'s input holds no more than a stack: cobblestone cannot be cut 65 times at once',
          'the inventory has not the ingredients to cut cobblestone 67 times',
          'stonecut needs an open stonecutter, or one to open',
          'the stonecutter\'s input holds another item than cobblestone takes',
          'the stonecutter\'s input holds more than 2 crafts of cobblestone take',
          'stonecut needs an empty cursor'
        ], []])
        bot.end()
      })

      it('rejects, closing the stonecutter it opened, when the inventory has no room for what it cuts', async () => {
        const cutting = await joined(version)
        const { bot, internal, server, driver, inventory, recipes, idOf } = cutting
        recipes.send([COBBLESTONE])
        inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => slot === 0 ? { id: idOf('stone'), count: 2, stackId: 2 } : { id: idOf('dirt'), count: 64, stackId: 10 + slot }))
        await driver.tick()
        internal.openBlock = async () => {
          openStonecutter(server)
          await bot.waitForTicks(1)
          return bot.currentWindow ?? bot.inventory
        }
        let done = false
        const cutDone = bot.bedrock.stonecut(recipeOf(bot.bedrock.stonecutterRecipes(idOf('stone'))), 1, stonecutterBlock(bot)).finally(() => { done = true })
        cutDone.catch(() => {})
        await answered(cutting, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 1, stackId: 2 }, { container: 'stonecutter_input', slot: 3, count: 1, stackId: 6 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 0, count: 1, stackId: 2 }],
          [{ container: 'stonecutter_input', slot: 3, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 2, stackId: 2 }]
        ], () => server.sentOf('container_close').length > 0)
        server.send('container_close', { window_id: 2, window_type: 'none', server: false })
        await driver.tick()
        await assert.rejects(cutDone, { message: 'the inventory has no room for what cutting cobblestone makes' })
        assert.deepStrictEqual([done, server.sentOf('item_stack_request').length], [true, 4])
        bot.end()
      })
    })
  })
})
