import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Tags } from 'prismarine-nbt'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, RespondedSlot } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { GivenIngredient, GivenMulti, GivenRecipe } from './common/recipes.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The recorded values are the vanilla client's against Bedrock Dedicated Server.

const TABLE_AT = Object.freeze({ x: 2, y: 4, z: 0 })
// the cartography window's slots: the input, the addition, the result, then the inventory (9 – 35) and the hotbar (0 – 8)
const INPUT = 0
const OUTPUT = 2
const SHIFT = 1
const HOTBAR_KEY = 2
const LOCATOR = 2

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface Cartography extends TestBot {
  errors: string[]
  inventory: ServerInventory
  recipes: ServerRecipes
  idOf: (name: string) => number
}

async function joined (version: BedrockVersion): Promise<Cartography> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), recipes: new ServerRecipes(testBot.server, testBot.bot.registry), idOf }
}

function openTable (server: FakeBedrockClient, windowId = 4): void {
  server.send('container_open', { window_id: windowId, window_type: 'cartography', coordinates: TABLE_AT, runtime_entity_id: -1n })
}

function tableRecipe (id: string, networkId: number, input: GivenIngredient[], metadata: number, block = 'cartography_table'): GivenRecipe {
  return { type: 'shapeless', id, networkId, uuid: `00000000-0000-0000-0000-${String(networkId).padStart(12, '0')}`, block, input, output: [{ item: 'empty_map', count: 1, metadata }] }
}

/** crafting_data's two recipes of the table, in its order, of the network ids given */
function tableRecipes (map: number, locator: number): GivenRecipe[] {
  return [
    tableRecipe('minecraft:cartography_table_locator_map', locator, [{ item: 'paper' }, { item: 'compass' }], LOCATOR),
    tableRecipe('minecraft:cartography_table_map', map, [{ item: 'paper' }], 0)
  ]
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentAction = SentRequest['actions'][number]
type SentSlot = NonNullable<SentAction['source']>

function slotName (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** each request the bot sent since the last call: its id, its actions (a legacy type id after a slash, a recipe, a text's index), its names and its cause but none */
function requestsSince ({ server }: Pick<TestBot, 'server'>): () => string[] {
  const actionOf = (action: SentAction): string => {
    const legacy = 'legacy_type_id' in action ? `/${action.legacy_type_id}` : ''
    const recipe = action.recipe_network_id === undefined ? '' : ` ${action.recipe_network_id} text ${action.filtered_string_index}`
    const slots = [action.source, action.destination].filter(slot => slot !== undefined).map(slotName).join(' → ')
    return `${String(action.type_id)}${legacy}${recipe}${action.count === undefined ? '' : ` ${action.count}`}${slots === '' ? '' : ` ${slots}`}`
  }
  const textOf = (request: SentRequest): string => {
    const cause = 'cause' in request ? request.cause : undefined
    return `${request.custom_names.length === 0 ? '' : ` names ${JSON.stringify(request.custom_names)}`}${cause === undefined || cause === -1 ? '' : ` cause ${String(cause)}`}`
  }
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(request => `${request.request_id} ${request.actions.map(actionOf).join(', ')}${textOf(request)}`)
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

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** a recorded craft: 4 paper in the input (and a compass added), a left click on the output, the map taken to the cursor */
interface RecordedCraft {
  request: number
  recipe: number
  paper: number
  compass?: number
  /** the stack id the server gave the map */
  made: number
  /** the request, as the client sent it */
  told: string
}

/** reduced_stations' cartography.empty_map, then cartography.locator_map */
interface Recording {
  version: BedrockVersion
  map: RecordedCraft
  locator: RecordedCraft & { compass: number }
}

const RECORDINGS: readonly Recording[] = [
  {
    version: 'bedrock_1.16.201',
    map: { request: -3915, recipe: 304, paper: 2973, made: 2974, told: '930101953d030cb002000000000501360cba2e00013b32953d3a00000100' },
    locator: { request: -3929, recipe: 303, paper: 2976, compass: 2978, made: 2979, told: '930101b13d040caf02000000000501360cc02e0501370dc42e00013b32b13d3a00000100' }
  },
  {
    version: 'bedrock_1.16.210',
    map: { request: -4879, recipe: 304, paper: 3459, made: 3460, told: '9301019d4c030db002000000000501360c863600013b329d4c3a00000100' },
    locator: { request: -4893, recipe: 303, paper: 3462, compass: 3464, made: 3465, told: '930101b94c040daf02000000000501360c8c360501370d903600013b32b94c3a00000100' }
  },
  {
    version: 'bedrock_1.19.30',
    map: { request: -3977, recipe: 580, paper: 2891, made: 2892, told: '930101913e030fc404000000000501360c962d00013b32913e3a000001000a000000' },
    locator: { request: -3991, recipe: 579, paper: 2894, compass: 2896, made: 2897, told: '930101ad3e040fc304000000000501360c9c2d0501370da02d00013b32ad3e3a000001000a000000' }
  },
  {
    version: 'bedrock_1.21.20',
    map: { request: -3177, recipe: 415, paper: 2568, made: 2569, told: '930101d131030f9f0300000000050137000000000c902800013c0000000032d1313b00000000000001000a000000' },
    locator: { request: -3191, recipe: 414, paper: 2571, compass: 2573, made: 2574, told: '930101ed31040f9e0300000000050137000000000c9628050138000000000d9a2800013c0000000032ed313b00000000000001000a000000' }
  },
  {
    version: 'bedrock_1.21.30',
    map: { request: -3177, recipe: 440, paper: 2568, made: 2569, told: '930101d131030fb80300000000050137000c902800013c0032d1313b00000001000a000000' },
    locator: { request: -3191, recipe: 439, paper: 2571, compass: 2573, made: 2574, told: '930101ed31040fb70300000000050137000c9628050138000d9a2800013c0032ed313b00000001000a000000' }
  },
  {
    version: 'bedrock_1.26.40',
    map: { request: -3293, recipe: 1033, paper: 2708, made: 2709, told: '930101b933030d0f89080000000005050137000c940a00000000013c003223f3ffff3b00000000000001000a000000' },
    locator: { request: -3307, recipe: 1032, paper: 2711, compass: 2713, made: 2714, told: '930101d533040d0f88080000000005050137000c970a000005050138000d990a00000000013c003215f3ffff3b00000000000001000a000000' }
  },
  {
    version: 'bedrock_1.26.60',
    map: { request: -3341, recipe: 4044, paper: 2715, made: 2716, told: '9301019934030d0fcc1f0000000005050137000c9b0a00000000013c0032f3f2ffff3b00000000000001000a000000' },
    locator: { request: -3355, recipe: 4043, paper: 2718, compass: 2720, made: 2721, told: '930101b534040d0fcb1f0000000005050137000c9e0a000005050138000da00a00000000013c0032e5f2ffff3b00000000000001000a000000' }
  }
]

/** the recording of the version, or of the latest version before it */
function recordingOf (version: BedrockVersion): Recording {
  const recording = RECORDINGS.filter(recorded => atLeast(version, recorded.version)).at(-1)
  assert.ok(recording !== undefined)
  return recording
}

interface Group {
  from: BedrockVersion
  to: BedrockVersion
  title: string
  /** the two requests, as requestsSince describes them */
  described: (recording: Recording) => [string, string]
}

const GROUPS: readonly Group[] = [
  {
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.19.21',
    title: 'no cause (1.16.201 – 1.19.21, recorded on 1.16.201 and 1.16.210)',
    described: ({ map, locator }) => [
      `${map.request} optional ${map.recipe} text 0, consume 1 cartography_input:12#${map.paper}, take 1 creative_output:50#${map.request} → cursor:0#0 names [""]`,
      `${locator.request} optional ${locator.recipe} text 0, consume 1 cartography_input:12#${locator.paper}, consume 1 cartography_additional:13#${locator.compass}, take 1 creative_output:50#${locator.request} → cursor:0#0 names [""]`
    ]
  },
  {
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.26.30',
    title: 'the cause cartography_text (1.19.30 – 1.26.30, recorded on 1.19.30, 1.21.20 and 1.21.30)',
    described: ({ map, locator }) => [
      `${map.request} optional ${map.recipe} text 0, consume 1 cartography_input:12#${map.paper}, take 1 creative_output:50#${map.request} → cursor:0#0 names [""] cause cartography_text`,
      `${locator.request} optional ${locator.recipe} text 0, consume 1 cartography_input:12#${locator.paper}, consume 1 cartography_additional:13#${locator.compass}, take 1 creative_output:50#${locator.request} → cursor:0#0 names [""] cause cartography_text`
    ]
  },
  {
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.60',
    title: 'each action\'s legacy type (1.26.40 – 1.26.60, recorded on 1.26.40 and 1.26.60)',
    described: ({ map, locator }) => [
      `${map.request} optional/15 ${map.recipe} text 0, consume/5 1 cartography_input:12#${map.paper}, take/0 1 creative_output:50#${map.request} → cursor:0#0 names [""] cause cartography_text`,
      `${locator.request} optional/15 ${locator.recipe} text 0, consume/5 1 cartography_input:12#${locator.paper}, consume/5 1 cartography_additional:13#${locator.compass}, take/0 1 creative_output:50#${locator.request} → cursor:0#0 names [""] cause cartography_text`
    ]
  }
]

/** the vanilla client's other gestures on the result, an empty map of one paper, hotbar slot 0 empty (recorded on 1.26.51.1) */
const GESTURES: ReadonlyArray<{ what: string, mode: number, button: number, request: number, paper: number, told: string }> = [
  { what: 'a shift left click', mode: SHIFT, button: 0, request: -5981, paper: 1541, told: '930101b95d030d0f94090000000005050137000c050600000101013c0032a3e8ffff0c00000000000001000a000000' },
  { what: 'a shift right click', mode: SHIFT, button: 1, request: -4603, paper: 1205, told: '930101f547030d0f94090000000005050137000cb50400000101013c003205eeffff0c00000000000001000a000000' },
  { what: 'the key 1', mode: HOTBAR_KEY, button: 0, request: -4591, paper: 1202, told: '930101dd47030d0f94090000000005050137000cb20400000000013c003211eeffff1c00000000000001000a000000' }
]

const MAP_LOCKING = '5343c1ca-e434-2260-4b02-70ffebb1b78b'

function longOf ([high, low]: readonly number[]): bigint {
  return (BigInt(high ?? 0) << 32n) | BigInt((low ?? 0) >>> 0)
}

/** a filled map of the id, its map_uuid's high and low halves */
function filledMap (version: BedrockVersion, id: number, stackId: number, [high, low]: [number, number]): Given {
  const mapUuid: Tags['long'] = { type: 'long', value: [high, low] }
  // up to 1.16.210 an item's NBT is the network NBT, whose long the codec writes from a bigint, which prismarine-nbt's typings do not give
  if (!atLeast(version, 'bedrock_1.16.220')) Reflect.set(mapUuid, 'value', longOf([high, low]))
  return { id, count: 1, stackId, nbt: { map_name_index: { type: 'int', value: 2 }, map_uuid: mapUuid } }
}

/** the map_uuid of the item's NBT: up to 1.16.210 read as a bigint */
function mapUuidOf (item: Item | null | undefined): string {
  const tag = item?.nbt?.type === 'compound' ? item.nbt.value['map_uuid'] : undefined
  if (tag?.type !== 'long') return 'none'
  return String(typeof tag.value === 'bigint' ? tag.value : longOf(tag.value))
}

/** the bot's map_create_locked_copy (its ids) and item_stack_request packets since the last call, in order */
function previewsSince (server: FakeBedrockClient): () => string[] {
  let [seen, previewsSeen] = [server.batches.flat().length, server.sentOf('map_create_locked_copy').length]
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    const previews = server.sentOf('map_create_locked_copy').slice(previewsSeen)
    seen = all.length
    previewsSeen += previews.length
    return fresh.flatMap(({ name }) => {
      if (name !== 'map_create_locked_copy') return name === 'item_stack_request' ? [name] : []
      const preview = previews.shift()
      return [`${name} ${String(preview?.original_map_id)} ${String(preview?.new_map_id)}`]
    })
  }
}

/** protocol_maps' protocol.map_locked_copy: a filled map in the input, a glass pane placed from the cursor to the addition, then a left click on the output */
interface RecordedLocking {
  version: BedrockVersion
  /** crafting_data's network id of the multi recipe 5343c1ca… */
  recipe: number
  map: number
  pane: number
  /** the map's map_uuid: its high and low halves */
  mapUuid: [number, number]
  /** the place's request id, the lock's the next */
  place: number
  /** the stack id the server gave the locked map */
  made: number
  /** the requests, as the client sent them */
  told: { place: string, lock: string }
  /** map_create_locked_copy's original_map_id, the map's id */
  original: bigint
  /** the bot's new_map_id for user Player's first copy of the map: the client's own is random */
  preview: bigint
}

const LOCKINGS: readonly RecordedLocking[] = [
  {
    // the client's new_map_id 1800816707
    version: 'bedrock_1.26.20',
    recipe: 3585,
    map: 80,
    pane: 82,
    mapUuid: [-2, 25],
    place: -45,
    made: 83,
    told: { place: '930101590101013b0000a40138000d0000ffffffff', lock: '9301015d040f811c00000000050137000ca001050138000da40100013c00325d3b00000001000a000000' },
    original: -8589934567n,
    preview: 803647151n
  },
  {
    // the client's new_map_id 515977548
    version: 'bedrock_1.26.51',
    recipe: 4763,
    map: 8,
    pane: 10,
    mapUuid: [-2, 12],
    place: -89,
    made: 11,
    told: { place: '930101b101010101013b00000a00000038000d0000000000ffffffff', lock: '930101b501040d0f9b250000000005050137000c0800000005050138000d0a0000000000013c0032a5ffffff3b00000000000001000a000000' },
    original: -8589934580n,
    preview: 770767309n
  },
  {
    // the client's new_map_id 1043407513
    version: 'bedrock_1.26.60',
    recipe: 2867,
    map: 77,
    pane: 79,
    mapUuid: [-2, 25],
    place: -45,
    made: 80,
    told: { place: '93010159010101013b00004f00000038000d0000000000ffffffff', lock: '9301015d040d0fb3160000000005050137000c4d00000005050138000d4f0000000000013c0032d1ffffff3b00000000000001000a000000' },
    original: -8589934567n,
    preview: 803647151n
  }
]

/** the recording of the version, or of the latest version before it, or the first */
function lockingOf (version: BedrockVersion): RecordedLocking {
  const recording = LOCKINGS.filter(recorded => atLeast(version, recorded.version)).at(-1) ?? LOCKINGS[0]
  assert.ok(recording !== undefined)
  return recording
}

interface LockingGroup {
  from: BedrockVersion
  to: BedrockVersion
  title: string
  previews: boolean
  /** the place's request and the lock's, as requestsSince describes them */
  described: (recording: RecordedLocking) => [string, string]
}

function lockingRequests ({ recipe, map, pane, place }: RecordedLocking, legacy: (type: number) => string, text: string): [string, string] {
  return [
    `${place} place${legacy(1)} 1 cursor:0#${pane} → cartography_additional:13#0`,
    `${place - 2} optional${legacy(15)} ${recipe} text 0, consume${legacy(5)} 1 cartography_input:12#${map}, consume${legacy(5)} 1 cartography_additional:13#${pane}, take${legacy(0)} 1 creative_output:50#${place - 2} → cursor:0#0 names [""]${text}`
  ]
}

const LOCKING_GROUPS: readonly LockingGroup[] = [
  {
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    title: 'no preview, the protocol data giving map_create_locked_copy no fields, and no cause (1.16.201 – 1.16.210, not recorded)',
    previews: false,
    described: recording => lockingRequests(recording, () => '', '')
  },
  {
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.19.21',
    title: 'the preview, no cause (1.16.220 – 1.19.21, not recorded)',
    previews: true,
    described: recording => lockingRequests(recording, () => '', '')
  },
  {
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.26.30',
    title: 'the cause cartography_text (1.19.30 – 1.26.30, recorded on 1.26.20)',
    previews: true,
    described: recording => lockingRequests(recording, () => '', ' cause cartography_text')
  },
  {
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.60',
    title: 'each action\'s legacy type (1.26.40 – 1.26.60, recorded on 1.26.51 and 1.26.60)',
    previews: true,
    described: recording => lockingRequests(recording, type => `/${type}`, ' cause cartography_text')
  }
]

describe('bedrock cartography table', () => {
  describe('the vanilla client\'s shift clicks place the map in the inventory\'s first slot with room, its key 1 takes it to hotbar slot 0 (recorded on 1.26.51.1)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: ${GESTURES.map(({ what }) => what).join(', ')}`, async () => {
        const told: string[][] = []
        for (const { mode, button, request, paper } of GESTURES) {
          const table = await joined(version)
          const { bot, internal, server, driver, inventory, recipes, idOf } = table
          recipes.send(tableRecipes(1172, 1171))
          openTable(server)
          inventory.slot('ui', 12, { id: idOf('paper'), count: 1, stackId: paper })
          await driver.tick()
          internal._core.requestIds.continueProcess(request)
          const sent = toldSince(server)
          bot.clickWindow(OUTPUT, button, mode).catch(() => {})
          await driver.tick()
          told.push(sent())
          bot.end()
        }
        assert.deepStrictEqual(told, GESTURES.map(({ told }) => [told]))
      })
    }
  })

  for (const group of GROUPS) {
    describe(`the vanilla client making an empty map of paper, then a locator map of paper and a compass, each to the cursor: ${group.title}`, () => {
      for (const version of bedrockTestVersionsFrom(group.from, group.to)) {
        it(`bedrock ${version}`, async () => {
          const table = await joined(version)
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = table
          const recording = recordingOf(version)
          const { map, locator } = recording
          recipes.send(tableRecipes(map.recipe, locator.recipe))
          openTable(server)
          inventory.slot('ui', 12, { id: idOf('paper'), count: 4, stackId: map.paper })
          await driver.tick()
          const [described, told] = [requestsSince(table), toldSince(server)]
          const crafted = async ({ request, paper, compass, made }: RecordedCraft): Promise<string[]> => {
            internal._core.requestIds.continueProcess(request)
            const clicked = bot.clickWindow(OUTPUT, 0, 0)
            await driver.tick()
            const sent = told()
            const added: RespondedSlot[] = compass === undefined ? [] : [{ container: 'cartography_additional', slot: 13, count: 0 }]
            inventory.respond(request, [{ container: 'cartography_input', slot: 12, count: 3, stackId: paper }, ...added, { container: 'cursor', slot: 0, count: 1, stackId: made }])
            await driver.tick()
            await clicked
            return sent
          }
          const toldMap = await crafted(map)
          const window = bot.currentWindow
          const made = [window?.selectedItem?.name, window?.selectedItem?.metadata, countAndId(window?.selectedItem), countAndId(window?.slots[INPUT])]
          inventory.slot('ui', 0, null)
          inventory.slot('ui', 12, { id: idOf('paper'), count: 4, stackId: locator.paper })
          inventory.slot('ui', 13, { id: idOf('compass'), count: 1, stackId: locator.compass })
          await driver.tick()
          const toldLocator = await crafted(locator)
          if (version === recording.version) assert.deepStrictEqual([toldMap, toldLocator], [[map.told], [locator.told]])
          assert.deepStrictEqual([described(), made, window?.selectedItem?.metadata, countAndId(window?.selectedItem), window?.slots[1], errors], [
            group.described(recording), ['empty_map', 0, [1, map.made], [3, map.paper]], LOCATOR, [1, locator.made], null, []
          ])
          bot.end()
        })
      }
    })
  }

  for (const group of LOCKING_GROUPS) {
    describe(`the vanilla client locking a filled map with a glass pane: the pane placed from the cursor to the addition, then the output to the cursor: ${group.title}`, () => {
      for (const version of bedrockTestVersionsFrom(group.from, group.to)) {
        it(`bedrock ${version}`, async () => {
          const table = await joined(version)
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = table
          const recording = lockingOf(version)
          const { recipe, map, pane, mapUuid, place, made } = recording
          recipes.send([{ type: 'multi', uuid: '00000000-0000-0000-0200-000000000000', networkId: 2 }, ...tableRecipes(4044, 4043), { type: 'multi', uuid: MAP_LOCKING, networkId: recipe }])
          openTable(server)
          inventory.slot('ui', 12, filledMap(version, idOf('filled_map'), map, mapUuid))
          inventory.slot('ui', 0, { id: idOf('glass_pane'), count: 1, stackId: pane })
          await driver.tick()
          const [described, told, sent] = [requestsSince(table), toldSince(server), previewsSince(server)]
          internal._core.requestIds.continueProcess(place)
          const placed = bot.clickWindow(1, 0, 0)
          await driver.tick()
          const toldPlace = told()
          const previewed = sent()
          inventory.respond(place, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'cartography_additional', slot: 13, count: 1, stackId: pane }])
          await driver.tick()
          await placed
          const locked = bot.clickWindow(OUTPUT, 0, 0)
          await driver.tick()
          const toldLock = told()
          inventory.respond(place - 2, [{ container: 'cartography_input', slot: 12, count: 0 }, { container: 'cartography_additional', slot: 13, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: made }])
          await driver.tick()
          await locked
          if (version === recording.version) assert.deepStrictEqual([toldPlace, toldLock], [[recording.told.place], [recording.told.lock]])
          const window = bot.currentWindow
          assert.deepStrictEqual([described(), previewed, sent(), window?.selectedItem?.name, countAndId(window?.selectedItem), mapUuidOf(window?.selectedItem), window?.slots[INPUT], window?.slots[1], errors], [
            group.described(recording), group.previews ? [`map_create_locked_copy ${recording.original} ${recording.preview}`, 'item_stack_request'] : ['item_stack_request'], ['item_stack_request'],
            'filled_map', [1, made], String(recording.original), null, null, []
          ])
          bot.end()
        })
      }
    })
  }

  describe('the window: Java\'s cartography table (the input, the addition, the result); the close gives back the cursor\'s item, then the input\'s and the addition\'s, up to 1.21.111 with the close, from 1.21.120 after the crafting table\'s animation', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.111', 'bedrock_1.21.120')) {
      // recorded in reduced_stations' empty_map on 1.21.2.2: place(cartography_input:12 → hotbar_and_inventory:0, 3), container_close in its packet
      it(`bedrock ${version}: every slot's items given back`, async () => {
        const table = await joined(version)
        const { bot, internal, server, driver, inventory, idOf } = table
        openTable(server)
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 10 })
        inventory.slot('ui', 12, { id: idOf('paper'), count: 3, stackId: 11 })
        inventory.slot('ui', 13, { id: idOf('compass'), count: 1, stackId: 12 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-3)
        const described = requestsSince(table)
        const window = bot.currentWindow
        assert.ok(window !== null)
        const layout = [window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot]
        const slots = window.slots.slice(0, window.inventoryStart).map(item => item?.name ?? null)
        bot.closeWindow(window).catch(() => {})
        await driver.frame(31.25)
        const atOnce = server.sentOf('container_close').length
        let frames = 0
        while (server.sentOf('container_close').length === 0 && frames < 20) {
          await driver.frame(31.25)
          frames++
        }
        assert.deepStrictEqual([layout, slots, described(), atOnce, frames], [['minecraft:cartography', 'Cartography Table', 39, 3, 2], ['paper', 'compass', null], [
          '-3 place 1 cursor:0#10 → hotbar_and_inventory:0#0',
          '-5 place 3 cartography_input:12#11 → hotbar_and_inventory:1#0',
          '-7 place 1 cartography_additional:13#12 → hotbar_and_inventory:2#0'
        ], atLeast(version, 'bedrock_1.21.120') ? 0 : 1, atLeast(version, 'bedrock_1.21.120') ? 14 : 0])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** the table open, its slots holding the items given, crafting_data's recipes of the table sent after the others given */
    async function tableWith (input: string | null, additional: string | null, others: Array<GivenRecipe | GivenMulti> = []): Promise<Cartography & { described: () => string[] }> {
      const table = await joined(version)
      const { server, driver, inventory, recipes, idOf } = table
      recipes.send([...others, ...tableRecipes(4044, 4043)])
      openTable(server)
      if (input !== null) inventory.slot('ui', 12, { id: idOf(input), count: 4, stackId: 11 })
      if (additional !== null) inventory.slot('ui', 13, { id: idOf(additional), count: 1, stackId: 12 })
      await driver.tick()
      return { ...table, described: requestsSince(table) }
    }

    /** the click's outcome after a tick: resolved, its error, or pending */
    async function clicked ({ bot, driver }: Cartography, mouseButton = 0, mode = 0): Promise<string> {
      let outcome = 'pending'
      bot.clickWindow(OUTPUT, mouseButton, mode).then(() => { outcome = 'resolved' }, (error: Error) => { outcome = error.message })
      await driver.tick()
      return outcome
    }

    it('sends nothing when no recipe of the table takes the slots in its order: none, paper added alone, a compass alone, paper and a glass pane (locking), a map and paper (extending)', async () => {
      const cases: Array<[string | null, string | null]> = [[null, null], [null, 'paper'], ['compass', null], ['compass', 'paper'], ['paper', 'glass_pane'], ['filled_map', 'paper']]
      const sent: Array<[string, string[], string[]]> = []
      for (const [input, additional] of cases) {
        const table = await tableWith(input, additional)
        sent.push([await clicked(table), table.described(), table.errors])
        table.bot.end()
      }
      assert.deepStrictEqual(sent, cases.map(() => ['resolved', [], []]))
    })

    it('crafts only the table\'s recipes: not a crafting table\'s taking the same paper', async () => {
      const table = await tableWith('paper', null, [{ ...tableRecipe('minecraft:paper_to_map', 7, [{ item: 'paper' }], 0, 'crafting_table'), output: [{ item: 'dirt', count: 1 }] }])
      await clicked(table)
      assert.deepStrictEqual(table.described(), ['-3 optional/15 4044 text 0, consume/5 1 cartography_input:12#11, take/0 1 creative_output:50#-3 → cursor:0#0 names [""] cause cartography_text'])
      table.bot.end()
    })

    it('takes the map onto the cursor\'s maps while they make no more than a stack, to a hotbar key\'s slot, or shift clicks it to the inventory (none recorded); sends nothing while the slot holds another item or a full stack, or the inventory is full', async () => {
      const table = await tableWith('paper', null)
      const { inventory, idOf, described, driver } = table
      const maps = (count: number, stackId: number): Given => ({ id: idOf('empty_map'), count, stackId })
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 1, stackId: 20 })
      inventory.slot('ui', 0, maps(64, 21))
      await driver.tick()
      const outcomes = [await clicked(table, 0, HOTBAR_KEY), await clicked(table, 0, 0)]
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 22 })
      await driver.tick()
      outcomes.push(await clicked(table, 1, 0))
      const blocked = described()
      inventory.slot('ui', 0, maps(63, 23))
      await driver.tick()
      await clicked(table, 1, 0)
      inventory.respond(-3, [{ container: 'cartography_input', slot: 12, count: 3, stackId: 11 }, { container: 'cursor', slot: 0, count: 64, stackId: 23 }])
      await driver.tick()
      await clicked(table, 4, HOTBAR_KEY)
      inventory.respond(-5, [{ container: 'cartography_input', slot: 12, count: 2, stackId: 11 }, { container: 'hotbar', slot: 4, count: 1, stackId: 24 }])
      await driver.tick()
      await clicked(table, 0, SHIFT)
      const moved = described()
      inventory.respond(-7, [{ container: 'cartography_input', slot: 12, count: 1, stackId: 11 }, { container: 'hotbar_and_inventory', slot: 4, count: 2, stackId: 24 }])
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 30 + slot })))
      await driver.tick()
      await clicked(table, 0, SHIFT)
      const crafted = (request: number, paper: number): string => `${request} optional/15 4044 text 0, consume/5 1 cartography_input:12#${paper}`
      const text = 'names [""] cause cartography_text'
      assert.deepStrictEqual([outcomes, blocked, moved, described(), table.errors], [['resolved', 'resolved', 'resolved'], [], [
        `${crafted(-3, 11)}, take/0 1 creative_output:50#-3 → cursor:0#23 ${text}`,
        `${crafted(-5, 11)}, take/0 1 creative_output:50#-5 → hotbar:4#0 ${text}`,
        `${crafted(-7, 11)}, place/1 1 creative_output:50#-7 → hotbar_and_inventory:4#24 ${text}`
      ], [], []])
      table.bot.end()
    })

    // crafting_data's multi recipes are sent before it on every version: the fireworks' among them
    const MULTIS: readonly GivenMulti[] = [{ type: 'multi', uuid: '00000000-0000-0000-0200-000000000000', networkId: 2 }, { type: 'multi', uuid: MAP_LOCKING, networkId: 2867 }]

    it('locks one filled map of a stack with one glass pane of a stack, the request leaving them previewed; sends nothing for a filled map without a long map_uuid, another item of one, glass, or without the multi recipe (none recorded)', async () => {
      const map = (id: number, uuid: [number, number]): Given => ({ ...filledMap(version, id, 11, uuid), count: 2 })
      const cases: Array<{ input: (idOf: (name: string) => number) => Given, addition: string, multis: readonly GivenMulti[] }> = [
        { input: idOf => map(idOf('filled_map'), [-2, -100]), addition: 'glass_pane', multis: MULTIS },
        { input: idOf => ({ id: idOf('filled_map'), count: 1, stackId: 11 }), addition: 'glass_pane', multis: MULTIS },
        { input: idOf => ({ id: idOf('filled_map'), count: 1, stackId: 11, nbt: { map_uuid: { type: 'int', value: 25 } } }), addition: 'glass_pane', multis: MULTIS },
        { input: idOf => map(idOf('empty_map'), [-2, 25]), addition: 'glass_pane', multis: MULTIS },
        { input: idOf => map(idOf('filled_map'), [-2, 25]), addition: 'glass', multis: MULTIS },
        { input: idOf => map(idOf('filled_map'), [-2, 25]), addition: 'glass_pane', multis: MULTIS.slice(0, 1) }
      ]
      const outcomes: Array<[string, string[], string[], string[]]> = []
      for (const { input, addition, multis } of cases) {
        const table = await tableWith(null, null, [...multis])
        const { inventory, idOf, driver, server } = table
        const sent = previewsSince(server)
        inventory.slot('ui', 12, input(idOf))
        inventory.slot('ui', 13, { id: idOf(addition), count: 3, stackId: 12 })
        await driver.tick()
        outcomes.push([await clicked(table), table.described(), sent(), table.errors])
        table.bot.end()
      }
      const nothing = ['resolved', [], [], []]
      assert.deepStrictEqual(outcomes, [
        ['pending', ['-3 optional/15 2867 text 0, consume/5 1 cartography_input:12#11, consume/5 1 cartography_additional:13#12, take/0 1 creative_output:50#-3 → cursor:0#0 names [""] cause cartography_text'], ['map_create_locked_copy -4294967396 225728497', 'item_stack_request'], []],
        nothing, nothing, nothing, nothing, nothing
      ])
    })

    it('previews the locked copy once a request leaves a filled map and a glass pane in the slots, in either order, again after the pane left, and after the server closed the screen; a new id each (only the pane added to the map recorded)', async () => {
      const table = await tableWith(null, null, [...MULTIS])
      const { bot, server, driver, inventory, idOf } = table
      const sent = previewsSince(server)
      const map = (stackId: number): Given => filledMap(version, idOf('filled_map'), stackId, [-2, 25])
      inventory.slot('ui', 12, map(30))
      inventory.slot('ui', 0, { id: idOf('glass_pane'), count: 2, stackId: 31 })
      await driver.tick()
      const click = async (slot: number, mouseButton: number): Promise<string[]> => {
        bot.clickWindow(slot, mouseButton, 0).catch(() => {})
        await driver.tick()
        return sent()
      }
      const previewed = [await click(1, 1), await click(1, 1), await click(1, 0), await click(1, 0)]
      server.send('container_close', { window_id: 4, window_type: 'none', server: true })
      openTable(server, 5)
      inventory.slot('ui', 12, null)
      inventory.slot('ui', 13, { id: idOf('glass_pane'), count: 1, stackId: 33 })
      inventory.slot('ui', 0, map(34))
      await driver.tick()
      previewed.push(await click(0, 0))
      const preview = (id: bigint): string[] => [`map_create_locked_copy -8589934567 ${id}`, 'item_stack_request']
      assert.deepStrictEqual([previewed, table.errors], [[preview(803647151n), ['item_stack_request'], ['item_stack_request'], preview(652615301n), preview(260024746n)], []])
      table.bot.end()
    })
  })
})
