import assert from 'assert'
import minecraftData from 'minecraft-data'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import prismarineRecipe from 'prismarine-recipe'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockRecipe, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { ServerRecipes } from './common/recipes.ts'
import type { GivenMulti, GivenRecipe } from './common/recipes.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Joined } from './common/world.ts'

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => name !== 'player_auth_input' && name !== 'subchunk_request')
      .map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

interface Crafting extends TestBot, Joined {
  errors: string[]
  inventory: ServerInventory
  recipes: ServerRecipes
  idOf: (name: string) => number
}

async function joined (version: BedrockVersion, { hashes = false } = {}): Promise<Crafting> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  const ticks = await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, ...ticks, errors, inventory: new ServerInventory(testBot.server), recipes: new ServerRecipes(testBot.server, testBot.bot.registry), idOf }
}

function openScreen (server: FakeBedrockClient, type: 'inventory' | 'workbench', windowId = 2): void {
  server.send('container_open', { window_id: windowId, window_type: type, coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
}

function stateIdOf (bot: TestBot['bot'], name: string, states: Readonly<Record<string, unknown>>): number {
  const { registry } = bot
  const palette = 'blockStatesByStateId' in registry ? Object.entries(registry.blockStatesByStateId) : []
  const found = palette.find(([, state]) => state.name === name && Object.entries(states).every(([key, value]) => state.states[key]?.value === value))
  assert.ok(found !== undefined, `no ${name} of ${JSON.stringify(states)}`)
  return Number(found[0])
}

function javaShape (name: string): Array<Array<string | undefined>> | undefined {
  const java = minecraftData('1.20.4')
  const recipe = prismarineRecipe('1.20.4').Recipe.find(java.itemsByName[name]?.id ?? 0, null).find(({ inShape }) => inShape !== null)
  return recipe?.inShape.map(row => row.map(({ id }) => java.items[id]?.name))
}

function craftingTable (bot: TestBot['bot']): Block {
  const state = bot.registry.blocksByName['crafting_table']?.defaultState ?? 0
  return prismarineBlock(bot.registry).fromStateId(state, 0)
}

// one acacia planks in hotbar slot 0, the inventory open
interface RecordedAuto {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  // from 1.16.220 the server names acacia planks by their block state, with data 0
  planks: { item: string, metadata?: number, block?: Readonly<Record<string, string>>, stackId: number }
  networkId: number
  uuid: string
  blockRuntimeId: number
  event: string | null
  request: string
  response: string
  held: string
}

const BUTTONS: readonly RecordedAuto[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -7,
    planks: { item: 'planks', metadata: 4, stackId: 10 },
    networkId: 1810,
    uuid: 'd94bd3b1-92cf-9955-1fdd-0c1955afe7b2',
    blockRuntimeId: 0,
    event: '350000d94bd3b192cf99551fdd0c1955afe7b2000197020200000000',
    request: '9301010d040a920e0e01970202000000000105010c001401013b320d0c000d00',
    response: '940101000d010c010000011600',
    held: '1f0197020200000000000000'
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -7,
    planks: { item: 'planks', metadata: 4, stackId: 10 },
    networkId: 1810,
    uuid: 'ab454af4-7c47-c51a-12ed-f93eef40489c',
    blockRuntimeId: 0,
    event: '350000ab454af47c47c51a12edf93eef40489c000197020200000000',
    request: '9301010d040b920e0f01970202000000000105010c001401013b320d0c000d00',
    response: '940101000d010c01000001160000',
    held: '1f0197020200000000000000'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.0',
    firstRequest: -7,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 10 },
    networkId: 1810,
    uuid: 'ce4a919a-9919-ee6b-18d5-c0f7d5d2baa7',
    blockRuntimeId: 0,
    event: '350000ce4a919a9919ee6b18d5c0f7d5d2baa70001970201000000000a00000000000000000000',
    request: '9301010d040b920e0f019702010000000a000000000000000000000105010c001401013b320d0c000d00',
    response: '940101000d010c01000001160000',
    held: '1f01970201000000000a00000000000000000000000000'
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    firstRequest: -7,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 10 },
    networkId: 1990,
    uuid: '2d4d498d-a8b0-7633-97d6-93d06819f4a4',
    blockRuntimeId: 0,
    event: '3500002d4d498da8b0763397d693d06819f4a40001970201000000000a00000000000000000000',
    request: '9301010d040bc60f010f019702010000000a000000000000000000000105010c001401013b320d0c000d00',
    response: '940101000d010c01000001160000',
    held: '1f01970201000000000a00000000000000000000000000'
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -7,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 10 },
    networkId: 1990,
    uuid: 'f44076ba-4a30-14d5-83b1-0eb53bab43a4',
    blockRuntimeId: 0,
    event: '350000f44076ba4a3014d583b10eb53bab43a40001970201000000000a00000000000000000000',
    request: '9301010d040bc60f0111019702010000000a000000000000000000000105010c001401013b320d0c000d00',
    response: '940101000d010c01000001160000',
    held: '1f01970201000000000a00000000000000000000000000'
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.21',
    firstRequest: -7,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 10 },
    networkId: 1999,
    uuid: '1e40fb00-1cb7-c0e6-1b1b-42b358e5baa5',
    blockRuntimeId: 0,
    event: '3500001e40fb001cb7c0e61b1b42b358e5baa50001970201000000000a00000000000000000000',
    request: '9301010d040dcf0f0113019702010000000a000000000000000000000105010c001401013b320d0c000d00',
    response: '940101000d010c01000001160000',
    held: '1f01970201000000000a00000000000000000000000000'
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.30',
    firstRequest: -7,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 10 },
    networkId: 2099,
    uuid: '71440f32-c4bb-d283-6d5b-4064b2070288',
    blockRuntimeId: 7233,
    event: '35000071440f32c4bbd2836d5b4064b2070288000197020100000082710a00000000000000000000',
    request: '9301010d040db310011301970201000082710a000000000000000000000105010c001401013b320d0c000d00ffffffff',
    response: '940101000d010c01000001160000',
    held: '1f0197020100000082710a00000000000000000000000000'
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.40',
    to: 'bedrock_1.19.40',
    firstRequest: -3,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 2 },
    networkId: 2066,
    uuid: '3f4bf860-35af-57de-d193-aba9fe70859f',
    blockRuntimeId: 7233,
    event: '3500003f4bf86035af57ded193aba9fe70859f000197020100000082710a00000000000000000000',
    request: '93010105040d921001010105000400021301970201000082710a000000000000000000000105010c000401013b32050c000500ffffffff',
    response: '9401010005010c01000001060000',
    held: '1f0197020100000082710a00000000000000000000000000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -3,
    planks: { item: 'planks', block: { wood_type: 'acacia' }, stackId: 2 },
    networkId: 2082,
    uuid: 'b648a0fb-56ba-38b2-ea1b-a6eba1b42086',
    blockRuntimeId: 11409,
    event: '350000b648a0fb56ba38b2ea1ba6eba1b420860001970201000000a2b2010a00000000000000000000',
    request: '93010105040da210010101050004000213019702010000a2b2010a000000000000000000000105010c000401013c32050c000500ffffffff',
    response: '9401010005010c01000001060000',
    held: '1f01970201000000a2b2010a00000000000000000000000000'
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.21.2',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 2158,
    uuid: 'f54f941a-7514-3bab-b196-e5c865420f97',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040dee100101011afd00000213019702010000a0fd9491010a000000000000000000000105010c000401013c32050c000500ffffffff',
    response: '9401010005010c01000001060000',
    held: '1f01970201000000a0fd9491010a00000000000000000000000000'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 2275,
    uuid: 'ad4c93f8-1190-ec71-685f-75ac8a45acb0',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040de311010101011afd00000213019702010000a0fd9491010a000000000000000000000105010c00000000000401013c0000000032050c00000000000500ffffffff',
    response: '9401010005010c0000000001000001060000',
    held: '1f01970201000000a0fd9491010a00000000000000000000000000'
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 2275,
    uuid: '09401f0f-bdb1-efea-1b02-4704800c4da5',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040de311010101011afd00000213019702010000a0fd9491010a000000000000000000000105010c00000401013c0032050c00000500ffffffff',
    response: '9401010005010c0001000001060000',
    held: '1f01970201000000a0fd9491010a00000000000000000000000000'
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.10',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 2709,
    uuid: '394f0e97-be61-118a-e4c1-e44a092ef6aa',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040d9515010101011afd00000213019702010000a0fd9491010a000000000000000000000105010c00000401013c0032050c00000500ffffffff',
    response: '9401010005010c000100000106000000',
    held: '1f01970201000000a0fd9491010a00000000000000000000000000'
  },
  {
    // recorded on 1.26.20.4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.30',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 3436,
    uuid: 'ac4b6966-4b14-024b-27c8-7aeae2e8a290',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040dec1a010101011afd00000213019702010000a0fd9491010a000000000000000000000105010c00000401013c0032050c00000500ffffffff',
    response: '9401010005010c000100000106000000',
    held: '1f0174ff01000000d0beca480a00000000000000000000000000'
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 3506,
    uuid: '3a499724-61f3-8140-63f0-23bff686ec9f',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040b0db21b01010101176d696e6563726166743a6163616369615f706c616e6b730001001113010101176d696e6563726166743a6163616369615f627574746f6e000100d0beca480a00000000000000000000010505010c0000020000000101013c0032fdffffff0c0000fdffffff00ffffffff',
    response: '94010100050101010c0001000001010106000000',
    held: '1f0174ff01000000d0beca480a00000000000000000000000000'
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 4614,
    uuid: '0a4a0e9d-48d7-4baa-796d-82bfae0e8ebc',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040b0d862401010101176d696e6563726166743a6163616369615f706c616e6b730001001113010101176d696e6563726166743a6163616369615f627574746f6e000100d0beca480a00000000000000000000010505010c0000020000000101013c0032fdffffff0c0000fdffffff00ffffffff',
    response: '940101000501010c00010000010106000000',
    held: '1f0174ff01000000d0beca480a00000000000000000000000000'
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -3,
    planks: { item: 'acacia_planks', stackId: 2 },
    networkId: 2716,
    uuid: '194c9625-1b33-16cb-de8c-f8b5f627da84',
    blockRuntimeId: 152215376,
    event: null,
    request: '93010105040b0d9c1501010101176d696e6563726166743a6163616369615f706c616e6b730001001214010101176d696e6563726166743a6163616369615f627574746f6e000100d0beca480a00000000000000000000010505010c0000020000000101013c0032fdffffff0c0000fdffffff00ffffffff',
    response: '940101000501010c00010000010106000000',
    held: '1f0174ff01000000d0beca480a00000000000000000000000000'
  }
]

// cobblestone in hotbar slot 0 at a crafting table; a segment a gesture
interface RecordedBook {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  times?: number
  recipe: GivenRecipe
  segments: ReadonlyArray<{ sent: readonly string[], received: readonly string[] }>
}

const AUTO_ALLS: readonly RecordedBook[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -103,
    stackId: 281,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44bbace-4678-8e9f-da4e-5592f3e8b1ad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '350002d44bbace46788e9fda4e5592f3e8b1ad000158f80c00000000',
          '930101cd01060aac0e0e01588c0c000000000a050a0c00b204050a0c00cd01050a0c00cd01013c3b32cd010c010000'
        ],
        received: ['94010100cd01010c02000003b2040001013cb40400']
      }
    ]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -103,
    stackId: 281,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44ec8f1-157e-da8f-5d35-d1b0cfed19a3', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '350002d44ec8f1157eda8f5d35d1b0cfed19a3000158f80c00000000',
          '930101cd01060bac0e0f01588c0c000000000a050a0c00b204050a0c00cd01050a0c00cd01013c3b32cd010c010000'
        ],
        received: ['94010100cd01010c02000003b204000001013cb4040000']
      }
    ]
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.0',
    firstRequest: -85,
    stackId: 240,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: '7143f01c-9917-e7bd-586f-c8ba4340289e', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 5945 }] },
    segments: [
      {
        sent: [
          '3500027143f01c9917e7bd586fc8ba4340289e0001583c000000f25c0a00000000000000000000',
          '930101a901060bac0e0f0158060000f25c0a000000000000000000000a050a0c00e003050a0c00a901050a0c00a901013c3b32a9010c010000'
        ],
        received: ['94010100a901010c02000003e003000001013ce2030000']
      }
    ]
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    firstRequest: -89,
    stackId: 256,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '374b44df-56cd-464c-4e3e-53d4e553ecbf', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7130 }] },
    segments: [
      {
        sent: [
          '350002374b44df56cd464c4e3e53d4e553ecbf0001583c000000b46f0a00000000000000000000',
          '930101b101060be00f0a0f0158060000b46f0a000000000000000000000a050a0c008004050a0c00b101050a0c00b101013c3b32b1010c010000'
        ],
        received: ['94010100b101010c020000038004000001013c82040000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -89,
    stackId: 256,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '1c4bd76d-65fb-0aef-aab6-546f61f4689d', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7226 }] },
    segments: [
      {
        sent: [
          '3500021c4bd76d65fb0aefaab6546f61f4689d0001583c000000f4700a00000000000000000000',
          '930101b101060be00f0a110158060000f4700a000000000000000000000a050a0c008004050a0c00b101050a0c00b101013c3b32b1010c010000'
        ],
        received: ['94010100b101010c020000038004000001013c82040000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.30',
    firstRequest: -89,
    stackId: 256,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2025, uuid: '844e7760-2c10-84e4-4c90-86feca93d9a5', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7223 }] },
    segments: [
      {
        sent: [
          '350002844e77602c1084e44c9086feca93d9a50001583c000000ee700a00000000000000000000',
          '930101b101060de90f0a130158060000ee700a000000000000000000000a050a0c008004050a0c00b101050a0c00b101013c3b32b1010c010000'
        ],
        received: ['94010100b101010c020000038004000001013c82040000']
      }
    ]
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.21',
    firstRequest: -87,
    stackId: 251,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2122, uuid: 'd6428634-2f27-f394-494f-cc236b6280a6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4273 }] },
    segments: [
      {
        sent: [
          '350002d64286342f27f394494fcc236b6280a60001583c000000e2420a00000000000000000000',
          '930101ad01060dca100a130158060000e2420a000000000000000000000a050a0c00f603050a0c00ad01050a0c00ad01013c3b32ad010c010000'
        ],
        received: ['94010100ad01010c02000003f603000001013cf8030000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.30',
    firstRequest: -87,
    stackId: 251,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2125, uuid: '2c46ecf5-2741-3453-8b53-3ddd77b2ca94', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '3500022c46ecf5274134538b533ddd77b2ca940001583c000000e6420a00000000000000000000',
          '930101ad01060dcd100a130158060000e6420a000000000000000000000a050a0c00f603050a0c00ad01050a0c00ad01013c3b32ad010c010000ffffffff'
        ],
        received: ['94010100ad01010c02000003f603000001013cf8030000']
      }
    ]
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.40',
    to: 'bedrock_1.19.40',
    firstRequest: -93,
    stackId: 232,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2087, uuid: 'a6411bc1-dc00-ed8e-0dc0-8e664545c496', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '350002a6411bc1dc00ed8e0dc08e664545c4960001583c000000e6420a00000000000000000000',
          '930101b901060da7100a03010400000002010400000002010400000002130158060000e6420a000000000000000000000a050a0c00d003050a0c00b901050a0c00b901013c3b32b9010c010000ffffffff'
        ],
        received: ['94010100b901010c02000003d003000001013cd2030000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -89,
    stackId: 226,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2103, uuid: '7740f7c7-6250-373d-2e58-cc68d889349c', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 6052 }] },
    segments: [
      {
        sent: [
          '3500027740f7c76250373d2e58cc68d889349c0001583c000000c85e0a00000000000000000000',
          '930101b101060db7100a03010400000002010400000002010400000002130158060000c85e0a000000000000000000000a050a0c00c403050a0c00b101050a0c00b101013c3c32b1010c010000ffffffff'
        ],
        received: ['94010100b101010c02000003c403000001013cc6030000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    firstRequest: -91,
    stackId: 221,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2179, uuid: '844fe3db-d639-aa90-ac17-768390581398', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 172918599 }] },
    segments: [
      {
        sent: [
          '930101b501060d83110a030104000000020104000000020104000000021301580600008e9df4a4010a000000000000000000000a050a0c00ba03050a0c00b501050a0c00b501013c3c32b5010c010000ffffffff'
        ],
        received: ['94010100b501010c02000003ba03000001013cbc030000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -95,
    stackId: 234,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '1b405dcf-a1f7-23b5-a47c-ff5b60bb219a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101bd01060df8110a030104000000020104000000020104000000021301d10d060000f992bf9d010a000000000000000000000a050a0c00d403050a0c00bd01050a0c00bd01013c3c32bd010c010000ffffffff'
        ],
        received: ['94010100bd01010c02000003d403000001013cd6030000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -95,
    stackId: 234,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '5b4e8a15-a76d-1a02-890f-0c50a37bc29a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101bd01060df8110a0a030104000000020104000000020104000000021301d10d060000f992bf9d010a000000000000000000000a050a0c0000000000d403050a0c0000000000bd01050a0c0000000000bd01013c3c0000000032bd010c00000000010000ffffffff'
        ],
        received: ['94010100bd01010c0000000002000003d403000001013cd6030000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -95,
    stackId: 234,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: 'db4c5399-eaec-10e0-e772-672f54f56dbb', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101bd01060df8110a0a030104000000020104000000020104000000021301d10d060000f992bf9d010a000000000000000000000a050a0c0000d403050a0c0000bd01050a0c0000bd01013c3c0032bd010c00010000ffffffff'
        ],
        received: ['94010100bd01010c0002000003d403000001013cd6030000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -97,
    stackId: 241,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2730, uuid: 'b44de3a8-ee42-0a15-2223-939e1337a49a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101c101060daa150a0a030104000000020104000000020104000000021301d10d060000f992bf9d010a000000000000000000000a050a0c0000e203050a0c0000c101050a0c0000c101013c3c0032c1010c00010000ffffffff'
        ],
        received: ['94010100c101010c0002000003e20300000001013ce403000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -101,
    stackId: 257,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 3527, uuid: '6d481c69-0cfc-6868-ab69-03a4cc17faad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101c901060b0dc71b0a030101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e6500010011130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000a05050a0c00000101000005050a0c00009bffffff05050a0c00009bffffff01013c3c00329bffffff0c00010000000000ffffffff'
        ],
        received: ['94010100c9010101010c00020000030101820400000001013c01018404000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -103,
    stackId: 258,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 4635, uuid: '2c4b9dd7-d032-7151-aa42-346a7499dca6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101cd01060b0d9b240a030101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e6500010011130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000a05050a0c00000201000005050a0c000099ffffff05050a0c000099ffffff01013c3c003299ffffff0c00010000000000ffffffff'
        ],
        received: ['94010100cd0101010c000200000301840400000001013c018604000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -103,
    stackId: 258,
    times: 10,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2737, uuid: '26445602-008d-6d62-3a38-fc1e7f5dceb0', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930101cd01060b0db1150a030101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e650001000101156d696e6563726166743a636f62626c6573746f6e6500010012140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000a05050a0c00000201000005050a0c000099ffffff05050a0c000099ffffff01013c3c003299ffffff0c00010000000000ffffffff'
        ],
        received: ['94010100cd0101010c000200000301840400000001013c018604000000']
      }
    ]
  }
]

const SELECTS: readonly RecordedBook[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -783,
    stackId: 991,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44bbace-4678-8e9f-da4e-5592f3e8b1ad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '9301049d0c0101010c00be0f0d200000a10c0101010c009d0c0d210000a50c0101010c00a10c0d220000a90c0609ac0e0e01588c0c000000000105010d209d0c05010d21a10c05010d22a50c00063b32a90c3a000000'
        ],
        received: ['940104009d0c020c01000002be0f000d01202001c00f0000a10c020c01000001be0f000d01212101c20f0000a50c020c0100000000000d01222201be0f0000a90c020d032020000000212100000022220000003a01000006c40f00']
      }
    ]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -783,
    stackId: 991,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44ec8f1-157e-da8f-5d35-d1b0cfed19a3', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '9301049d0c0101010c00be0f0d200000a10c0101010c009d0c0d210000a50c0101010c00a10c0d220000a90c060aac0e0f01588c0c000000000105010d209d0c05010d21a10c05010d22a50c00063b32a90c3a000000'
        ],
        received: ['940104009d0c020c01000002be0f00000d01202001c00f000000a10c020c01000001be0f00000d01212101c20f000000a50c020c010000000000000d01222201be0f000000a90c020d032020000000002121000000002222000000003a01000006c40f0000']
      }
    ]
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    firstRequest: -651,
    stackId: 842,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: '7143f01c-9917-e7bd-586f-c8ba4340289e', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 5945 }] },
    segments: [
      {
        sent: [
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '930104950a0101010c00940d0d200000990a0101010c00950a0d2100009d0a0101010c00990a0d220000a10a060aac0e0f0158060000f25c0a000000000000000000000105010d20950a05010d21990a05010d229d0a00063b32a10a3a000000'
        ],
        received: ['94010400950a020c01000002940d00000d01202001960d000000990a020c01000001940d00000d01212101980d0000009d0a020c010000000000000d01222201940d000000a10a020d032020000000002121000000002222000000003a010000069a0d0000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -677,
    stackId: 876,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '1c4bd76d-65fb-0aef-aab6-546f61f4689d', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7226 }] },
    segments: [
      {
        sent: [
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '930104c90a0101010c00d80d0d200000cd0a0101010c00c90a0d210000d10a0101010c00cd0a0d220000d50a060ae00f110158060000f4700a000000000000000000000105010d20c90a05010d21cd0a05010d22d10a00063b32d50a3a000000'
        ],
        received: ['94010400c90a020c01000002d80d00000d01202001da0d000000cd0a020c01000001d80d00000d01212101dc0d000000d10a020c010000000000000d01222201d80d000000d50a020d032020000000002121000000002222000000003a01000006de0d0000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.30',
    firstRequest: -677,
    stackId: 876,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2025, uuid: '844e7760-2c10-84e4-4c90-86feca93d9a5', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7223 }] },
    segments: [
      {
        sent: [
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '930104c90a0101010c00d80d0d200000cd0a0101010c00c90a0d210000d10a0101010c00cd0a0d220000d50a060ce90f130158060000ee700a000000000000000000000105010d20c90a05010d21cd0a05010d22d10a00063b32d50a3a000000'
        ],
        received: ['94010400c90a020c01000002d80d00000d01202001da0d000000cd0a020c01000001d80d00000d01212101dc0d000000d10a020c010000000000000d01222201d80d000000d50a020d032020000000002121000000002222000000003a01000006de0d0000']
      }
    ]
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.21',
    firstRequest: -665,
    stackId: 861,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2122, uuid: 'd6428634-2f27-f394-494f-cc236b6280a6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4273 }] },
    segments: [
      {
        sent: [
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '930104b10a0101010c00ba0d0d200000b50a0101010c00b10a0d210000b90a0101010c00b50a0d220000bd0a060cca10130158060000e2420a000000000000000000000105010d20b10a05010d21b50a05010d22b90a00063b32bd0a3a000000'
        ],
        received: ['94010400b10a020c01000002ba0d00000d01202001bc0d000000b50a020c01000001ba0d00000d01212101be0d000000b90a020c010000000000000d01222201ba0d000000bd0a020d032020000000002121000000002222000000003a01000006c00d0000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -665,
    stackId: 861,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2125, uuid: '2c46ecf5-2741-3453-8b53-3ddd77b2ca94', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '930104b10a0101010c00ba0d0d200000ffffffffb50a0101010c00b10a0d210000ffffffffb90a0101010c00b50a0d220000ffffffffbd0a060ccd10130158060000e6420a000000000000000000000105010d20b10a05010d21b50a05010d22b90a00063b32bd0a3a000000ffffffff'
        ],
        received: ['94010400b10a020c01000002ba0d00000d01202001bc0d000000b50a020c01000001ba0d00000d01212101be0d000000b90a020c010000000000000d01222201ba0d000000bd0a020d032020000000002121000000002222000000003a01000006c00d0000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -719,
    stackId: 935,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2103, uuid: '7740f7c7-6250-373d-2e58-cc68d889349c', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 6052 }] },
    segments: [
      {
        sent: [
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '9301049d0b0101010c00ce0e0d200000ffffffffa10b0101010c009d0b0d210000ffffffffa50b0101010c00a10b0d220000ffffffffa90b060cb710130158060000c85e0a000000000000000000000105010d209d0b05010d21a10b05010d22a50b00063c32a90b3b000000ffffffff'
        ],
        received: ['940104009d0b020c01000002ce0e00000d01202001d00e000000a10b020c01000001ce0e00000d01212101d20e000000a50b020c010000000000000d01222201ce0e000000a90b020d032020000000002121000000002222000000003b01000006d40e0000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    firstRequest: -705,
    stackId: 912,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2179, uuid: '844fe3db-d639-aa90-ac17-768390581398', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 172918599 }] },
    segments: [
      {
        sent: [
          '930104810b0101010c00a00e0d200000ffffffff850b0101010c00810b0d210000ffffffff890b0101010c00850b0d220000ffffffff8d0b060c83111301580600008e9df4a4010a000000000000000000000105010d20810b05010d21850b05010d22890b00063c328d0b3b000000ffffffff'
        ],
        received: ['94010400810b020c01000002a00e00000d01202001a20e000000850b020c01000001a00e00000d01212101a40e000000890b020c010000000000000d01222201a00e0000008d0b020d032020000000002121000000002222000000003b01000006a60e0000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -749,
    stackId: 963,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '1b405dcf-a1f7-23b5-a47c-ff5b60bb219a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104d90b0101010c00860f0d200000ffffffffdd0b0101010c00d90b0d210000ffffffffe10b0101010c00dd0b0d220000ffffffffe50b060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20d90b05010d21dd0b05010d22e10b00063c32e50b3b000000ffffffff'
        ],
        received: ['94010400d90b020c01000002860f00000d01202001880f000000dd0b020c01000001860f00000d012121018a0f000000e10b020c010000000000000d01222201860f000000e50b020d032020000000002121000000002222000000003b010000068c0f0000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -749,
    stackId: 963,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '5b4e8a15-a76d-1a02-890f-0c50a37bc29a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104d90b0101010c0000000000860f0d00000000200000ffffffffdd0b0101010c0000000000d90b0d00000000210000ffffffffe10b0101010c0000000000dd0b0d00000000220000ffffffffe50b060cf811011301d10d060000f992bf9d010a000000000000000000000105010d0000000020d90b05010d0000000021dd0b05010d0000000022e10b00063c0000000032e50b3b00000000000000ffffffff'
        ],
        received: ['94010400d90b020c0000000001000002860f00000d0000000001202001880f000000dd0b020c0000000001000001860f00000d00000000012121018a0f000000e10b020c00000000010000000000000d0000000001222201860f000000e50b020d00000000032020000000002121000000002222000000003b00000000010000068c0f0000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -749,
    stackId: 963,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: 'db4c5399-eaec-10e0-e772-672f54f56dbb', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104d90b0101010c0000860f0d00200000ffffffffdd0b0101010c0000d90b0d00210000ffffffffe10b0101010c0000dd0b0d00220000ffffffffe50b060cf811011301d10d060000f992bf9d010a000000000000000000000105010d0020d90b05010d0021dd0b05010d0022e10b00063c0032e50b3b00000000ffffffff'
        ],
        received: ['94010400d90b020c0001000002860f00000d0001202001880f000000dd0b020c0001000001860f00000d00012121018a0f000000e10b020c00010000000000000d0001222201860f000000e50b020d00032020000000002121000000002222000000003b00010000068c0f0000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -763,
    stackId: 989,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2730, uuid: 'b44de3a8-ee42-0a15-2223-939e1337a49a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104f50b0101010c0000ba0f0d00200000fffffffff90b0101010c0000f50b0d00210000fffffffffd0b0101010c0000f90b0d00220000ffffffff810c060caa15011301d10d060000f992bf9d010a000000000000000000000105010d0020f50b05010d0021f90b05010d0022fd0b00063c0032810c3b00000000ffffffff'
        ],
        received: ['94010400f50b020c0001000002ba0f0000000d0001202001bc0f00000000f90b020c0001000001ba0f0000000d0001212101be0f00000000fd0b020c0001000000000000000d0001222201ba0f00000000810c020d00032020000000000021210000000000222200000000003b0001000006c00f000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -793,
    stackId: 1043,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 3527, uuid: '6d481c69-0cfc-6868-ab69-03a4cc17faad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104b10c010101010c0000130400000d00200000000000ffffffffb50c010101010c0000e7fcffff0d00210000000000ffffffffb90c010101010c0000e5fcffff0d00220000000000ffffffffbd0c060a0cc71b0111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020e7fcffff0505010d0021e5fcffff0505010d0022e3fcffff0000063c0032e1fcffff3b00000000000000ffffffff'
        ],
        received: ['94010400b10c0101020c00010000020101a6100000000d00012020010101a81000000000b50c0101020c00010000010101a6100000000d00012121010101aa1000000000b90c0101020c000100000001000000000d00012222010101a61000000000bd0c0101020d00032020000100000000212100010000000022220001000000003b00010000060101ac10000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -805,
    stackId: 1042,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 4635, uuid: '2c4b9dd7-d032-7151-aa42-346a7499dca6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104c90c010101010c0000120400000d00200000000000ffffffffcd0c010101010c0000dbfcffff0d00210000000000ffffffffd10c010101010c0000d9fcffff0d00220000000000ffffffffd50c060a0c9b240111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020dbfcffff0505010d0021d9fcffff0505010d0022d7fcffff0000063c0032d5fcffff3b00000000000000ffffffff'
        ],
        received: ['94010400c90c01020c000100000201a4100000000d000120200101a61000000000cd0c01020c000100000101a4100000000d000121210101a81000000000d10c01020c0001000000000000000d000122220101a41000000000d50c01020d00032020000000000021210000000000222200000000003b000100000601aa10000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -805,
    stackId: 1042,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2737, uuid: '26445602-008d-6d62-3a38-fc1e7f5dceb0', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930104c90c010101010c0000120400000d00200000000000ffffffffcd0c010101010c0000dbfcffff0d00210000000000ffffffffd10c010101010c0000d9fcffff0d00220000000000ffffffffd50c060a0cb1150112140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020dbfcffff0505010d0021d9fcffff0505010d0022d7fcffff0000063c0032d5fcffff3b00000000000000ffffffff'
        ],
        received: ['94010400c90c01020c000100000201a4100000000d000120200101a61000000000cd0c01020c000100000101a4100000000d000121210101a81000000000d10c01020c0001000000000000000d000122220101a41000000000d50c01020d00032020000000000021210000000000222200000000003b000100000601aa10000000']
      }
    ]
  }
]

const SHIFT_ONES: readonly RecordedBook[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -1303,
    stackId: 1306,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44bbace-4678-8e9f-da4e-5592f3e8b1ad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103ad140101010c00b4140d200000b1140101010c00ad140d210000b5140101010c00b1140d220000'
        ],
        received: ['94010300ad14020c01000002b414000d01202001b6140000b114020c01000001b414000d01212101b8140000b514020c0100000000000d01222201b41400']
      },
      {
        sent: [
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '930101b9140609ac0e0e01588c0c000000000105010d20b61405010d21b81405010d22b41401063b32b9140c000000'
        ],
        received: ['94010100b914020d032020000000212100000022220000000c01000006ba1400']
      }
    ]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -1303,
    stackId: 1306,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44ec8f1-157e-da8f-5d35-d1b0cfed19a3', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103ad140101010c00b4140d200000b1140101010c00ad140d210000b5140101010c00b1140d220000'
        ],
        received: ['94010300ad14020c01000002b41400000d01202001b614000000b114020c01000001b41400000d01212101b814000000b514020c010000000000000d01222201b4140000']
      },
      {
        sent: [
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '930101b914060aac0e0f01588c0c000000000105010d20b61405010d21b81405010d22b41401063b32b9140c000000'
        ],
        received: ['94010100b914020d032020000000002121000000002222000000000c01000006ba140000']
      }
    ]
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    firstRequest: -1075,
    stackId: 1102,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: '7143f01c-9917-e7bd-586f-c8ba4340289e', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 5945 }] },
    segments: [
      {
        sent: [
          '930103e5100101010c009c110d200000e9100101010c00e5100d210000ed100101010c00e9100d220000'
        ],
        received: ['94010300e510020c010000029c1100000d012020019e11000000e910020c010000019c1100000d01212101a011000000ed10020c010000000000000d012222019c110000']
      },
      {
        sent: [
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '930101f110060aac0e0f0158060000f25c0a000000000000000000000105010d209e1105010d21a01105010d229c1101063b32f1100c000000'
        ],
        received: ['94010100f110020d032020000000002121000000002222000000000c01000006a2110000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -1111,
    stackId: 1145,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '1c4bd76d-65fb-0aef-aab6-546f61f4689d', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7226 }] },
    segments: [
      {
        sent: [
          '930103ad110101010c00f2110d200000b1110101010c00ad110d210000b5110101010c00b1110d220000'
        ],
        received: ['94010300ad11020c01000002f21100000d01202001f411000000b111020c01000001f21100000d01212101f611000000b511020c010000000000000d01222201f2110000']
      },
      {
        sent: [
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '930101b911060ae00f110158060000f4700a000000000000000000000105010d20f41105010d21f61105010d22f21101063b32b9110c000000'
        ],
        received: ['94010100b911020d032020000000002121000000002222000000000c01000006f8110000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.30',
    firstRequest: -1111,
    stackId: 1145,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2025, uuid: '844e7760-2c10-84e4-4c90-86feca93d9a5', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7223 }] },
    segments: [
      {
        sent: [
          '930103ad110101010c00f2110d200000b1110101010c00ad110d210000b5110101010c00b1110d220000'
        ],
        received: ['94010300ad11020c01000002f21100000d01202001f411000000b111020c01000001f21100000d01212101f611000000b511020c010000000000000d01222201f2110000']
      },
      {
        sent: [
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '930101b911060ce90f130158060000ee700a000000000000000000000105010d20f41105010d21f61105010d22f21101063b32b9110c000000'
        ],
        received: ['94010100b911020d032020000000002121000000002222000000000c01000006f8110000']
      }
    ]
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.21',
    firstRequest: -1091,
    stackId: 1125,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2122, uuid: 'd6428634-2f27-f394-494f-cc236b6280a6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4273 }] },
    segments: [
      {
        sent: [
          '93010385110101010c00ca110d20000089110101010c0085110d2100008d110101010c0089110d220000'
        ],
        received: ['940103008511020c01000002ca1100000d01202001cc110000008911020c01000001ca1100000d01212101ce110000008d11020c010000000000000d01222201ca110000']
      },
      {
        sent: [
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '9301019111060cca10130158060000e2420a000000000000000000000105010d20cc1105010d21ce1105010d22ca1101063b3291110c000000'
        ],
        received: ['940101009111020d032020000000002121000000002222000000000c01000006d0110000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -1091,
    stackId: 1125,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2125, uuid: '2c46ecf5-2741-3453-8b53-3ddd77b2ca94', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '93010385110101010c00ca110d200000ffffffff89110101010c0085110d210000ffffffff8d110101010c0089110d220000ffffffff'
        ],
        received: ['940103008511020c01000002ca1100000d01202001cc110000008911020c01000001ca1100000d01212101ce110000008d11020c010000000000000d01222201ca110000']
      },
      {
        sent: [
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '9301019111060ccd10130158060000e6420a000000000000000000000105010d20cc1105010d21ce1105010d22ca1101063b3291110c000000ffffffff'
        ],
        received: ['940101009111020d032020000000002121000000002222000000000c01000006d0110000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -1259,
    stackId: 1251,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2103, uuid: '7740f7c7-6250-373d-2e58-cc68d889349c', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 6052 }] },
    segments: [
      {
        sent: [
          '930103d5130101010c00c6130d200000ffffffffd9130101010c00d5130d210000ffffffffdd130101010c00d9130d220000ffffffff'
        ],
        received: ['94010300d513020c01000002c61300000d01202001c813000000d913020c01000001c61300000d01212101ca13000000dd13020c010000000000000d01222201c6130000']
      },
      {
        sent: [
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '930101e113060cb710130158060000c85e0a000000000000000000000105010d20c81305010d21ca1305010d22c61301063c32e1130c000000ffffffff'
        ],
        received: ['94010100e113020d032020000000002121000000002222000000000c01000006cc130000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    firstRequest: -1227,
    stackId: 1221,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2179, uuid: '844fe3db-d639-aa90-ac17-768390581398', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 172918599 }] },
    segments: [
      {
        sent: [
          '93010395130101010c008a130d200000ffffffff99130101010c0095130d210000ffffffff9d130101010c0099130d220000ffffffff'
        ],
        received: ['940103009513020c010000028a1300000d012020018c130000009913020c010000018a1300000d012121018e130000009d13020c010000000000000d012222018a130000']
      },
      {
        sent: [
          '930101a113060c83111301580600008e9df4a4010a000000000000000000000105010d208c1305010d218e1305010d228a1301063c32a1130c000000ffffffff'
        ],
        received: ['94010100a113020d032020000000002121000000002222000000000c0100000690130000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -1307,
    stackId: 1294,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '1b405dcf-a1f7-23b5-a47c-ff5b60bb219a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103b5140101010c009c140d200000ffffffffb9140101010c00b5140d210000ffffffffbd140101010c00b9140d220000ffffffff'
        ],
        received: ['94010300b514020c010000029c1400000d012020019e14000000b914020c010000019c1400000d01212101a014000000bd14020c010000000000000d012222019c140000']
      },
      {
        sent: [
          '930101c114060cf8111301d10d060000f992bf9d010a000000000000000000000105010d209e1405010d21a01405010d229c1401063c32c1140c000000ffffffff'
        ],
        received: ['94010100c114020d032020000000002121000000002222000000000c01000006a2140000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -1307,
    stackId: 1294,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '5b4e8a15-a76d-1a02-890f-0c50a37bc29a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103b5140101010c00000000009c140d00000000200000ffffffffb9140101010c0000000000b5140d00000000210000ffffffffbd140101010c0000000000b9140d00000000220000ffffffff'
        ],
        received: ['94010300b514020c00000000010000029c1400000d00000000012020019e14000000b914020c00000000010000019c1400000d0000000001212101a014000000bd14020c00000000010000000000000d00000000012222019c140000']
      },
      {
        sent: [
          '930101c114060cf811011301d10d060000f992bf9d010a000000000000000000000105010d00000000209e1405010d0000000021a01405010d00000000229c1401063c0000000032c1140c00000000000000ffffffff'
        ],
        received: ['94010100c114020d00000000032020000000002121000000002222000000000c0000000001000006a2140000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -1307,
    stackId: 1294,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: 'db4c5399-eaec-10e0-e772-672f54f56dbb', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103b5140101010c00009c140d00200000ffffffffb9140101010c0000b5140d00210000ffffffffbd140101010c0000b9140d00220000ffffffff'
        ],
        received: ['94010300b514020c00010000029c1400000d00012020019e14000000b914020c00010000019c1400000d0001212101a014000000bd14020c00010000000000000d00012222019c140000']
      },
      {
        sent: [
          '930101c114060cf811011301d10d060000f992bf9d010a000000000000000000000105010d00209e1405010d0021a01405010d00229c1401063c0032c1140c00000000ffffffff'
        ],
        received: ['94010100c114020d00032020000000002121000000002222000000000c0001000006a2140000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -1331,
    stackId: 1328,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2730, uuid: 'b44de3a8-ee42-0a15-2223-939e1337a49a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103e5140101010c0000e0140d00200000ffffffffe9140101010c0000e5140d00210000ffffffffed140101010c0000e9140d00220000ffffffff'
        ],
        received: ['94010300e514020c0001000002e0140000000d0001202001e21400000000e914020c0001000001e0140000000d0001212101e41400000000ed14020c0001000000000000000d0001222201e014000000']
      },
      {
        sent: [
          '930101f114060caa15011301d10d060000f992bf9d010a000000000000000000000105010d0020e21405010d0021e41405010d0022e01401063c0032f1140c00000000ffffffff'
        ],
        received: ['94010100f114020d00032020000000000021210000000000222200000000000c0001000006e614000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -1383,
    stackId: 1398,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 3527, uuid: '6d481c69-0cfc-6868-ab69-03a4cc17faad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103cd15010101010c0000760500000d00200000000000ffffffffd115010101010c000099faffff0d00210000000000ffffffffd515010101010c000097faffff0d00220000000000ffffffff'
        ],
        received: ['94010300cd150101020c00010000020101ec150000000d00012020010101ee1500000000d1150101020c00010000010101ec150000000d00012121010101f01500000000d5150101020c000100000001000000000d00012222010101ec15000000']
      },
      {
        sent: [
          '930101d915060a0cc71b0111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020770500000505010d0021780500000505010d0022760500000101063c003293faffff0c00000000000000ffffffff'
        ],
        received: ['94010100d9150101020d00032020000100000000212100010000000022220001000000000c00010000060101f215000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -1403,
    stackId: 1400,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 4635, uuid: '2c4b9dd7-d032-7151-aa42-346a7499dca6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103f515010101010c0000780500000d00200000000000fffffffff915010101010c000085faffff0d00210000000000fffffffffd15010101010c000083faffff0d00220000000000ffffffff'
        ],
        received: ['94010300f51501020c000100000201f0150000000d000120200101f21500000000f91501020c000100000101f0150000000d000121210101f41500000000fd1501020c0001000000000000000d000122220101f015000000']
      },
      {
        sent: [
          '9301018116060a0c9b240111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020790500000505010d00217a0500000505010d0022780500000101063c00327ffaffff0c00000000000000ffffffff'
        ],
        received: ['94010100811601020d00032020000000000021210000000000222200000000000c000100000601f615000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -1403,
    stackId: 1400,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2737, uuid: '26445602-008d-6d62-3a38-fc1e7f5dceb0', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103f515010101010c0000780500000d00200000000000fffffffff915010101010c000085faffff0d00210000000000fffffffffd15010101010c000083faffff0d00220000000000ffffffff'
        ],
        received: ['94010300f51501020c000100000201f0150000000d000120200101f21500000000f91501020c000100000101f0150000000d000121210101f41500000000fd1501020c0001000000000000000d000122220101f015000000']
      },
      {
        sent: [
          '9301018116060a0cb1150112140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020790500000505010d00217a0500000505010d0022780500000101063c00327ffaffff0c00000000000000ffffffff'
        ],
        received: ['94010100811601020d00032020000000000021210000000000222200000000000c000100000601f615000000']
      }
    ]
  }
]

const SHIFT_STACKS: readonly RecordedBook[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -2193,
    stackId: 1860,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44bbace-4678-8e9f-da4e-5592f3e8b1ad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103a12201010b0c00881d0d200000a52201010b0c00a1220d210000a92201010b0c00a5220d220000'
        ],
        received: ['94010300a122020c01000016881d000d0120200b8a1d0000a522020c0100000b881d000d0121210b8c1d0000a922020c0100000000000d0122220b881d00']
      },
      {
        sent: [
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '93010bad220609ac0e0e01588c0c000000000105010d208a1d05010d218c1d05010d22881d01063b32ad220c000000b1220609ac0e0e01588c0c000000000105010d20ad2205010d21ad2205010d22ad2201063b32b1220c00ad2200b5220609ac0e0e01588c0c000000000105010d20b12205010d21b12205010d22b12201063b32b5220c00b12200b9220609ac0e0e01588c0c000000000105010d20b52205010d21b52205010d22b52201063b32b9220c00b52200bd220609ac0e0e01588c0c000000000105010d20b92205010d21b92205010d22b92201063b32bd220c00b92200c1220609ac0e0e01588c0c000000000105010d20bd2205010d21bd2205010d22bd2201063b32c1220c00bd2200c5220609ac0e0e01588c0c000000000105010d20c12205010d21c12205010d22c12201063b32c5220c00c12200c9220609ac0e0e01588c0c000000000105010d20c52205010d21c52205010d22c52201063b32c9220c00c52200cd220609ac0e0e01588c0c000000000105010d20c92205010d21c92205010d22c92201063b32cd220c00c92200d1220609ac0e0e01588c0c000000000105010d20cd2205010d21cd2205010d22cd2201063b32d1220c00cd2200d5220709ac0e0e01588c0c000000000105010d20d12205010d21d12205010d22d12201043b32d5220c00d12201023b32d5220c010000'
        ],
        received: ['94010b00ad22020d0320200a8a1d0021210a8c1d0022220a881d000c010000068e1d0000b122020d032020098a1d002121098c1d00222209881d000c0100000c8e1d0000b522020d032020088a1d002121088c1d00222208881d000c010000128e1d0000b922020d032020078a1d002121078c1d00222207881d000c010000188e1d0000bd22020d032020068a1d002121068c1d00222206881d000c0100001e8e1d0000c122020d032020058a1d002121058c1d00222205881d000c010000248e1d0000c522020d032020048a1d002121048c1d00222204881d000c0100002a8e1d0000c922020d032020038a1d002121038c1d00222203881d000c010000308e1d0000cd22020d032020028a1d002121028c1d00222202881d000c010000368e1d0000d122020d032020018a1d002121018c1d00222201881d000c0100003c8e1d0000d522020d032020000000212100000022220000000c020000408e1d00010102a21d00']
      }
    ]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -2193,
    stackId: 1860,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44ec8f1-157e-da8f-5d35-d1b0cfed19a3', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103a12201010b0c00881d0d200000a52201010b0c00a1220d210000a92201010b0c00a5220d220000'
        ],
        received: ['94010300a122020c01000016881d00000d0120200b8a1d000000a522020c0100000b881d00000d0121210b8c1d000000a922020c010000000000000d0122220b881d0000']
      },
      {
        sent: [
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '93010bad22060aac0e0f01588c0c000000000105010d208a1d05010d218c1d05010d22881d01063b32ad220c000000b122060aac0e0f01588c0c000000000105010d20ad2205010d21ad2205010d22ad2201063b32b1220c00ad2200b522060aac0e0f01588c0c000000000105010d20b12205010d21b12205010d22b12201063b32b5220c00b12200b922060aac0e0f01588c0c000000000105010d20b52205010d21b52205010d22b52201063b32b9220c00b52200bd22060aac0e0f01588c0c000000000105010d20b92205010d21b92205010d22b92201063b32bd220c00b92200c122060aac0e0f01588c0c000000000105010d20bd2205010d21bd2205010d22bd2201063b32c1220c00bd2200c522060aac0e0f01588c0c000000000105010d20c12205010d21c12205010d22c12201063b32c5220c00c12200c922060aac0e0f01588c0c000000000105010d20c52205010d21c52205010d22c52201063b32c9220c00c52200cd22060aac0e0f01588c0c000000000105010d20c92205010d21c92205010d22c92201063b32cd220c00c92200d122060aac0e0f01588c0c000000000105010d20cd2205010d21cd2205010d22cd2201063b32d1220c00cd2200d522070aac0e0f01588c0c000000000105010d20d12205010d21d12205010d22d12201043b32d5220c00d12201023b32d5220c010000'
        ],
        received: ['94010b00ad22020d0320200a8a1d000021210a8c1d000022220a881d00000c010000068e1d000000b122020d032020098a1d00002121098c1d0000222209881d00000c0100000c8e1d000000b522020d032020088a1d00002121088c1d0000222208881d00000c010000128e1d000000b922020d032020078a1d00002121078c1d0000222207881d00000c010000188e1d000000bd22020d032020068a1d00002121068c1d0000222206881d00000c0100001e8e1d000000c122020d032020058a1d00002121058c1d0000222205881d00000c010000248e1d000000c522020d032020048a1d00002121048c1d0000222204881d00000c0100002a8e1d000000c922020d032020038a1d00002121038c1d0000222203881d00000c010000308e1d000000cd22020d032020028a1d00002121028c1d0000222202881d00000c010000368e1d000000d122020d032020018a1d00002121018c1d0000222201881d00000c0100003c8e1d000000d522020d032020000000002121000000002222000000000c020000408e1d0000010102a21d0000']
      }
    ]
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    firstRequest: -1887,
    stackId: 1601,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: '7143f01c-9917-e7bd-586f-c8ba4340289e', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 5945 }] },
    segments: [
      {
        sent: [
          '930103bd1d01010b0c0082190d200000c11d01010b0c00bd1d0d210000c51d01010b0c00c11d0d220000'
        ],
        received: ['94010300bd1d020c01000016821900000d0120200b8419000000c11d020c0100000b821900000d0121210b8619000000c51d020c010000000000000d0122220b82190000']
      },
      {
        sent: [
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '93010bc91d060aac0e0f0158060000f25c0a000000000000000000000105010d20841905010d21861905010d22821901063b32c91d0c000000cd1d060aac0e0f0158060000f25c0a000000000000000000000105010d20c91d05010d21c91d05010d22c91d01063b32cd1d0c00c91d00d11d060aac0e0f0158060000f25c0a000000000000000000000105010d20cd1d05010d21cd1d05010d22cd1d01063b32d11d0c00cd1d00d51d060aac0e0f0158060000f25c0a000000000000000000000105010d20d11d05010d21d11d05010d22d11d01063b32d51d0c00d11d00d91d060aac0e0f0158060000f25c0a000000000000000000000105010d20d51d05010d21d51d05010d22d51d01063b32d91d0c00d51d00dd1d060aac0e0f0158060000f25c0a000000000000000000000105010d20d91d05010d21d91d05010d22d91d01063b32dd1d0c00d91d00e11d060aac0e0f0158060000f25c0a000000000000000000000105010d20dd1d05010d21dd1d05010d22dd1d01063b32e11d0c00dd1d00e51d060aac0e0f0158060000f25c0a000000000000000000000105010d20e11d05010d21e11d05010d22e11d01063b32e51d0c00e11d00e91d060aac0e0f0158060000f25c0a000000000000000000000105010d20e51d05010d21e51d05010d22e51d01063b32e91d0c00e51d00ed1d060aac0e0f0158060000f25c0a000000000000000000000105010d20e91d05010d21e91d05010d22e91d01063b32ed1d0c00e91d00f11d070aac0e0f0158060000f25c0a000000000000000000000105010d20ed1d05010d21ed1d05010d22ed1d01043b32f11d0c00ed1d01023b32f11d0c010000'
        ],
        received: ['94010b00c91d020d0320200a8419000021210a8619000022220a821900000c010000068819000000cd1d020d032020098419000021210986190000222209821900000c0100000c8819000000d11d020d032020088419000021210886190000222208821900000c010000128819000000d51d020d032020078419000021210786190000222207821900000c010000188819000000d91d020d032020068419000021210686190000222206821900000c0100001e8819000000dd1d020d032020058419000021210586190000222205821900000c010000248819000000e11d020d032020048419000021210486190000222204821900000c0100002a8819000000e51d020d032020038419000021210386190000222203821900000c010000308819000000e91d020d032020028419000021210286190000222202821900000c010000368819000000ed1d020d032020018419000021210186190000222201821900000c0100003c8819000000f11d020d032020000000002121000000002222000000000c02000040881900000101029c190000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -1975,
    stackId: 1675,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '1c4bd76d-65fb-0aef-aab6-546f61f4689d', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7226 }] },
    segments: [
      {
        sent: [
          '930103ed1e01010b0c00961a0d200000f11e01010b0c00ed1e0d210000f51e01010b0c00f11e0d220000'
        ],
        received: ['94010300ed1e020c01000016961a00000d0120200b981a000000f11e020c0100000b961a00000d0121210b9a1a000000f51e020c010000000000000d0122220b961a0000']
      },
      {
        sent: [
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '93010bf91e060ae00f110158060000f4700a000000000000000000000105010d20981a05010d219a1a05010d22961a01063b32f91e0c000000fd1e060ae00f110158060000f4700a000000000000000000000105010d20f91e05010d21f91e05010d22f91e01063b32fd1e0c00f91e00811f060ae00f110158060000f4700a000000000000000000000105010d20fd1e05010d21fd1e05010d22fd1e01063b32811f0c00fd1e00851f060ae00f110158060000f4700a000000000000000000000105010d20811f05010d21811f05010d22811f01063b32851f0c00811f00891f060ae00f110158060000f4700a000000000000000000000105010d20851f05010d21851f05010d22851f01063b32891f0c00851f008d1f060ae00f110158060000f4700a000000000000000000000105010d20891f05010d21891f05010d22891f01063b328d1f0c00891f00911f060ae00f110158060000f4700a000000000000000000000105010d208d1f05010d218d1f05010d228d1f01063b32911f0c008d1f00951f060ae00f110158060000f4700a000000000000000000000105010d20911f05010d21911f05010d22911f01063b32951f0c00911f00991f060ae00f110158060000f4700a000000000000000000000105010d20951f05010d21951f05010d22951f01063b32991f0c00951f009d1f060ae00f110158060000f4700a000000000000000000000105010d20991f05010d21991f05010d22991f01063b329d1f0c00991f00a11f070ae00f110158060000f4700a000000000000000000000105010d209d1f05010d219d1f05010d229d1f01043b32a11f0c009d1f01023b32a11f0c010000'
        ],
        received: ['94010b00f91e020d0320200a981a000021210a9a1a000022220a961a00000c010000069c1a000000fd1e020d03202009981a00002121099a1a0000222209961a00000c0100000c9c1a000000811f020d03202008981a00002121089a1a0000222208961a00000c010000129c1a000000851f020d03202007981a00002121079a1a0000222207961a00000c010000189c1a000000891f020d03202006981a00002121069a1a0000222206961a00000c0100001e9c1a0000008d1f020d03202005981a00002121059a1a0000222205961a00000c010000249c1a000000911f020d03202004981a00002121049a1a0000222204961a00000c0100002a9c1a000000951f020d03202003981a00002121039a1a0000222203961a00000c010000309c1a000000991f020d03202002981a00002121029a1a0000222202961a00000c010000369c1a0000009d1f020d03202001981a00002121019a1a0000222201961a00000c0100003c9c1a000000a11f020d032020000000002121000000002222000000000c020000409c1a0000010102b01a0000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.30',
    firstRequest: -1975,
    stackId: 1673,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2025, uuid: '844e7760-2c10-84e4-4c90-86feca93d9a5', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7223 }] },
    segments: [
      {
        sent: [
          '930103ed1e01010b0c00921a0d200000f11e01010b0c00ed1e0d210000f51e01010b0c00f11e0d220000'
        ],
        received: ['94010300ed1e020c01000016921a00000d0120200b941a000000f11e020c0100000b921a00000d0121210b961a000000f51e020c010000000000000d0122220b921a0000']
      },
      {
        sent: [
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '93010bf91e060ce90f130158060000ee700a000000000000000000000105010d20941a05010d21961a05010d22921a01063b32f91e0c000000fd1e060ce90f130158060000ee700a000000000000000000000105010d20f91e05010d21f91e05010d22f91e01063b32fd1e0c00f91e00811f060ce90f130158060000ee700a000000000000000000000105010d20fd1e05010d21fd1e05010d22fd1e01063b32811f0c00fd1e00851f060ce90f130158060000ee700a000000000000000000000105010d20811f05010d21811f05010d22811f01063b32851f0c00811f00891f060ce90f130158060000ee700a000000000000000000000105010d20851f05010d21851f05010d22851f01063b32891f0c00851f008d1f060ce90f130158060000ee700a000000000000000000000105010d20891f05010d21891f05010d22891f01063b328d1f0c00891f00911f060ce90f130158060000ee700a000000000000000000000105010d208d1f05010d218d1f05010d228d1f01063b32911f0c008d1f00951f060ce90f130158060000ee700a000000000000000000000105010d20911f05010d21911f05010d22911f01063b32951f0c00911f00991f060ce90f130158060000ee700a000000000000000000000105010d20951f05010d21951f05010d22951f01063b32991f0c00951f009d1f060ce90f130158060000ee700a000000000000000000000105010d20991f05010d21991f05010d22991f01063b329d1f0c00991f00a11f070ce90f130158060000ee700a000000000000000000000105010d209d1f05010d219d1f05010d229d1f01043b32a11f0c009d1f01023b32a11f0c010000'
        ],
        received: ['94010b00f91e020d0320200a941a000021210a961a000022220a921a00000c01000006981a000000fd1e020d03202009941a0000212109961a0000222209921a00000c0100000c981a000000811f020d03202008941a0000212108961a0000222208921a00000c01000012981a000000851f020d03202007941a0000212107961a0000222207921a00000c01000018981a000000891f020d03202006941a0000212106961a0000222206921a00000c0100001e981a0000008d1f020d03202005941a0000212105961a0000222205921a00000c01000024981a000000911f020d03202004941a0000212104961a0000222204921a00000c0100002a981a000000951f020d03202003941a0000212103961a0000222203921a00000c01000030981a000000991f020d03202002941a0000212102961a0000222202921a00000c01000036981a0000009d1f020d03202001941a0000212101961a0000222201921a00000c0100003c981a000000a11f020d032020000000002121000000002222000000000c02000040981a0000010102ac1a0000']
      }
    ]
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.21',
    firstRequest: -1949,
    stackId: 1648,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2122, uuid: 'd6428634-2f27-f394-494f-cc236b6280a6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4273 }] },
    segments: [
      {
        sent: [
          '930103b91e01010b0c00e0190d200000bd1e01010b0c00b91e0d210000c11e01010b0c00bd1e0d220000'
        ],
        received: ['94010300b91e020c01000016e01900000d0120200be219000000bd1e020c0100000be01900000d0121210be419000000c11e020c010000000000000d0122220be0190000']
      },
      {
        sent: [
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '93010bc51e060cca10130158060000e2420a000000000000000000000105010d20e21905010d21e41905010d22e01901063b32c51e0c000000c91e060cca10130158060000e2420a000000000000000000000105010d20c51e05010d21c51e05010d22c51e01063b32c91e0c00c51e00cd1e060cca10130158060000e2420a000000000000000000000105010d20c91e05010d21c91e05010d22c91e01063b32cd1e0c00c91e00d11e060cca10130158060000e2420a000000000000000000000105010d20cd1e05010d21cd1e05010d22cd1e01063b32d11e0c00cd1e00d51e060cca10130158060000e2420a000000000000000000000105010d20d11e05010d21d11e05010d22d11e01063b32d51e0c00d11e00d91e060cca10130158060000e2420a000000000000000000000105010d20d51e05010d21d51e05010d22d51e01063b32d91e0c00d51e00dd1e060cca10130158060000e2420a000000000000000000000105010d20d91e05010d21d91e05010d22d91e01063b32dd1e0c00d91e00e11e060cca10130158060000e2420a000000000000000000000105010d20dd1e05010d21dd1e05010d22dd1e01063b32e11e0c00dd1e00e51e060cca10130158060000e2420a000000000000000000000105010d20e11e05010d21e11e05010d22e11e01063b32e51e0c00e11e00e91e060cca10130158060000e2420a000000000000000000000105010d20e51e05010d21e51e05010d22e51e01063b32e91e0c00e51e00ed1e070cca10130158060000e2420a000000000000000000000105010d20e91e05010d21e91e05010d22e91e01043b32ed1e0c00e91e01023b32ed1e0c010000'
        ],
        received: ['94010b00c51e020d0320200ae219000021210ae419000022220ae01900000c01000006e619000000c91e020d03202009e2190000212109e4190000222209e01900000c0100000ce619000000cd1e020d03202008e2190000212108e4190000222208e01900000c01000012e619000000d11e020d03202007e2190000212107e4190000222207e01900000c01000018e619000000d51e020d03202006e2190000212106e4190000222206e01900000c0100001ee619000000d91e020d03202005e2190000212105e4190000222205e01900000c01000024e619000000dd1e020d03202004e2190000212104e4190000222204e01900000c0100002ae619000000e11e020d03202003e2190000212103e4190000222203e01900000c01000030e619000000e51e020d03202002e2190000212102e4190000222202e01900000c01000036e619000000e91e020d03202001e2190000212101e4190000222201e01900000c0100003ce619000000ed1e020d032020000000002121000000002222000000000c02000040e6190000010102fa190000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -1949,
    stackId: 1648,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2125, uuid: '2c46ecf5-2741-3453-8b53-3ddd77b2ca94', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '930103b91e01010b0c00e0190d200000ffffffffbd1e01010b0c00b91e0d210000ffffffffc11e01010b0c00bd1e0d220000ffffffff'
        ],
        received: ['94010300b91e020c01000016e01900000d0120200be219000000bd1e020c0100000be01900000d0121210be419000000c11e020c010000000000000d0122220be0190000']
      },
      {
        sent: [
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '93010bc51e060ccd10130158060000e6420a000000000000000000000105010d20e21905010d21e41905010d22e01901063b32c51e0c000000ffffffffc91e060ccd10130158060000e6420a000000000000000000000105010d20c51e05010d21c51e05010d22c51e01063b32c91e0c00c51e00ffffffffcd1e060ccd10130158060000e6420a000000000000000000000105010d20c91e05010d21c91e05010d22c91e01063b32cd1e0c00c91e00ffffffffd11e060ccd10130158060000e6420a000000000000000000000105010d20cd1e05010d21cd1e05010d22cd1e01063b32d11e0c00cd1e00ffffffffd51e060ccd10130158060000e6420a000000000000000000000105010d20d11e05010d21d11e05010d22d11e01063b32d51e0c00d11e00ffffffffd91e060ccd10130158060000e6420a000000000000000000000105010d20d51e05010d21d51e05010d22d51e01063b32d91e0c00d51e00ffffffffdd1e060ccd10130158060000e6420a000000000000000000000105010d20d91e05010d21d91e05010d22d91e01063b32dd1e0c00d91e00ffffffffe11e060ccd10130158060000e6420a000000000000000000000105010d20dd1e05010d21dd1e05010d22dd1e01063b32e11e0c00dd1e00ffffffffe51e060ccd10130158060000e6420a000000000000000000000105010d20e11e05010d21e11e05010d22e11e01063b32e51e0c00e11e00ffffffffe91e060ccd10130158060000e6420a000000000000000000000105010d20e51e05010d21e51e05010d22e51e01063b32e91e0c00e51e00ffffffffed1e070ccd10130158060000e6420a000000000000000000000105010d20e91e05010d21e91e05010d22e91e01043b32ed1e0c00e91e01023b32ed1e0c010000ffffffff'
        ],
        received: ['94010b00c51e020d0320200ae219000021210ae419000022220ae01900000c01000006e619000000c91e020d03202009e2190000212109e4190000222209e01900000c0100000ce619000000cd1e020d03202008e2190000212108e4190000222208e01900000c01000012e619000000d11e020d03202007e2190000212107e4190000222207e01900000c01000018e619000000d51e020d03202006e2190000212106e4190000222206e01900000c0100001ee619000000d91e020d03202005e2190000212105e4190000222205e01900000c01000024e619000000dd1e020d03202004e2190000212104e4190000222204e01900000c0100002ae619000000e11e020d03202003e2190000212103e4190000222203e01900000c01000030e619000000e51e020d03202002e2190000212102e4190000222202e01900000c01000036e619000000e91e020d03202001e2190000212101e4190000222201e01900000c0100003ce619000000ed1e020d032020000000002121000000002222000000000c02000040e6190000010102fa190000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -1843,
    stackId: 1630,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2103, uuid: '7740f7c7-6250-373d-2e58-cc68d889349c', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 6052 }] },
    segments: [
      {
        sent: [
          '930103e51c01010b0c00bc190d200000ffffffffe91c01010b0c00e51c0d210000ffffffffed1c01010b0c00e91c0d220000ffffffff'
        ],
        received: ['94010300e51c020c01000016bc1900000d0120200bbe19000000e91c020c0100000bbc1900000d0121210bc019000000ed1c020c010000000000000d0122220bbc190000']
      },
      {
        sent: [
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '93010bf11c060cb710130158060000c85e0a000000000000000000000105010d20be1905010d21c01905010d22bc1901063c32f11c0c000000fffffffff51c060cb710130158060000c85e0a000000000000000000000105010d20f11c05010d21f11c05010d22f11c01063c32f51c0c00f11c00fffffffff91c060cb710130158060000c85e0a000000000000000000000105010d20f51c05010d21f51c05010d22f51c01063c32f91c0c00f51c00fffffffffd1c060cb710130158060000c85e0a000000000000000000000105010d20f91c05010d21f91c05010d22f91c01063c32fd1c0c00f91c00ffffffff811d060cb710130158060000c85e0a000000000000000000000105010d20fd1c05010d21fd1c05010d22fd1c01063c32811d0c00fd1c00ffffffff851d060cb710130158060000c85e0a000000000000000000000105010d20811d05010d21811d05010d22811d01063c32851d0c00811d00ffffffff891d060cb710130158060000c85e0a000000000000000000000105010d20851d05010d21851d05010d22851d01063c32891d0c00851d00ffffffff8d1d060cb710130158060000c85e0a000000000000000000000105010d20891d05010d21891d05010d22891d01063c328d1d0c00891d00ffffffff911d060cb710130158060000c85e0a000000000000000000000105010d208d1d05010d218d1d05010d228d1d01063c32911d0c008d1d00ffffffff951d060cb710130158060000c85e0a000000000000000000000105010d20911d05010d21911d05010d22911d01063c32951d0c00911d00ffffffff991d070cb710130158060000c85e0a000000000000000000000105010d20951d05010d21951d05010d22951d01043c32991d0c00951d01023c32991d0c010000ffffffff'
        ],
        received: ['94010b00f11c020d0320200abe19000021210ac019000022220abc1900000c01000006c219000000f51c020d03202009be190000212109c0190000222209bc1900000c0100000cc219000000f91c020d03202008be190000212108c0190000222208bc1900000c01000012c219000000fd1c020d03202007be190000212107c0190000222207bc1900000c01000018c219000000811d020d03202006be190000212106c0190000222206bc1900000c0100001ec219000000851d020d03202005be190000212105c0190000222205bc1900000c01000024c219000000891d020d03202004be190000212104c0190000222204bc1900000c0100002ac2190000008d1d020d03202003be190000212103c0190000222203bc1900000c01000030c219000000911d020d03202002be190000212102c0190000222202bc1900000c01000036c219000000951d020d03202001be190000212101c0190000222201bc1900000c0100003cc219000000991d020d032020000000002121000000002222000000000c02000040c2190000010102d6190000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    firstRequest: -1791,
    stackId: 1593,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2179, uuid: '844fe3db-d639-aa90-ac17-768390581398', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 172918599 }] },
    segments: [
      {
        sent: [
          '930103fd1b01010b0c00f2180d200000ffffffff811c01010b0c00fd1b0d210000ffffffff851c01010b0c00811c0d220000ffffffff'
        ],
        received: ['94010300fd1b020c01000016f21800000d0120200bf418000000811c020c0100000bf21800000d0121210bf618000000851c020c010000000000000d0122220bf2180000']
      },
      {
        sent: [
          '93010b891c060c83111301580600008e9df4a4010a000000000000000000000105010d20f41805010d21f61805010d22f21801063c32891c0c000000ffffffff8d1c060c83111301580600008e9df4a4010a000000000000000000000105010d20891c05010d21891c05010d22891c01063c328d1c0c00891c00ffffffff911c060c83111301580600008e9df4a4010a000000000000000000000105010d208d1c05010d218d1c05010d228d1c01063c32911c0c008d1c00ffffffff951c060c83111301580600008e9df4a4010a000000000000000000000105010d20911c05010d21911c05010d22911c01063c32951c0c00911c00ffffffff991c060c83111301580600008e9df4a4010a000000000000000000000105010d20951c05010d21951c05010d22951c01063c32991c0c00951c00ffffffff9d1c060c83111301580600008e9df4a4010a000000000000000000000105010d20991c05010d21991c05010d22991c01063c329d1c0c00991c00ffffffffa11c060c83111301580600008e9df4a4010a000000000000000000000105010d209d1c05010d219d1c05010d229d1c01063c32a11c0c009d1c00ffffffffa51c060c83111301580600008e9df4a4010a000000000000000000000105010d20a11c05010d21a11c05010d22a11c01063c32a51c0c00a11c00ffffffffa91c060c83111301580600008e9df4a4010a000000000000000000000105010d20a51c05010d21a51c05010d22a51c01063c32a91c0c00a51c00ffffffffad1c060c83111301580600008e9df4a4010a000000000000000000000105010d20a91c05010d21a91c05010d22a91c01063c32ad1c0c00a91c00ffffffffb11c070c83111301580600008e9df4a4010a000000000000000000000105010d20ad1c05010d21ad1c05010d22ad1c01043c32b11c0c00ad1c01023c32b11c0c010000ffffffff'
        ],
        received: ['94010b00891c020d0320200af418000021210af618000022220af21800000c01000006f8180000008d1c020d03202009f4180000212109f6180000222209f21800000c0100000cf818000000911c020d03202008f4180000212108f6180000222208f21800000c01000012f818000000951c020d03202007f4180000212107f6180000222207f21800000c01000018f818000000991c020d03202006f4180000212106f6180000222206f21800000c0100001ef8180000009d1c020d03202005f4180000212105f6180000222205f21800000c01000024f818000000a11c020d03202004f4180000212104f6180000222204f21800000c0100002af818000000a51c020d03202003f4180000212103f6180000222203f21800000c01000030f818000000a91c020d03202002f4180000212102f6180000222202f21800000c01000036f818000000ad1c020d03202001f4180000212101f6180000222201f21800000c0100003cf818000000b11c020d032020000000002121000000002222000000000c02000040f81800000101028c190000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -1903,
    stackId: 1688,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '1b405dcf-a1f7-23b5-a47c-ff5b60bb219a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103dd1d01010b0c00b01a0d200000ffffffffe11d01010b0c00dd1d0d210000ffffffffe51d01010b0c00e11d0d220000ffffffff'
        ],
        received: ['94010300dd1d020c01000016b01a00000d0120200bb21a000000e11d020c0100000bb01a00000d0121210bb41a000000e51d020c010000000000000d0122220bb01a0000']
      },
      {
        sent: [
          '93010be91d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20b21a05010d21b41a05010d22b01a01063c32e91d0c000000ffffffffed1d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20e91d05010d21e91d05010d22e91d01063c32ed1d0c00e91d00fffffffff11d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20ed1d05010d21ed1d05010d22ed1d01063c32f11d0c00ed1d00fffffffff51d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20f11d05010d21f11d05010d22f11d01063c32f51d0c00f11d00fffffffff91d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20f51d05010d21f51d05010d22f51d01063c32f91d0c00f51d00fffffffffd1d060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20f91d05010d21f91d05010d22f91d01063c32fd1d0c00f91d00ffffffff811e060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20fd1d05010d21fd1d05010d22fd1d01063c32811e0c00fd1d00ffffffff851e060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20811e05010d21811e05010d22811e01063c32851e0c00811e00ffffffff891e060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20851e05010d21851e05010d22851e01063c32891e0c00851e00ffffffff8d1e060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20891e05010d21891e05010d22891e01063c328d1e0c00891e00ffffffff911e070cf8111301d10d060000f992bf9d010a000000000000000000000105010d208d1e05010d218d1e05010d228d1e01043c32911e0c008d1e01023c32911e0c010000ffffffff'
        ],
        received: ['94010b00e91d020d0320200ab21a000021210ab41a000022220ab01a00000c01000006b61a000000ed1d020d03202009b21a0000212109b41a0000222209b01a00000c0100000cb61a000000f11d020d03202008b21a0000212108b41a0000222208b01a00000c01000012b61a000000f51d020d03202007b21a0000212107b41a0000222207b01a00000c01000018b61a000000f91d020d03202006b21a0000212106b41a0000222206b01a00000c0100001eb61a000000fd1d020d03202005b21a0000212105b41a0000222205b01a00000c01000024b61a000000811e020d03202004b21a0000212104b41a0000222204b01a00000c0100002ab61a000000851e020d03202003b21a0000212103b41a0000222203b01a00000c01000030b61a000000891e020d03202002b21a0000212102b41a0000222202b01a00000c01000036b61a0000008d1e020d03202001b21a0000212101b41a0000222201b01a00000c0100003cb61a000000911e020d032020000000002121000000002222000000000c02000040b61a0000010102ca1a0000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -1777,
    stackId: 1625,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '5b4e8a15-a76d-1a02-890f-0c50a37bc29a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103e11b01010b0c0000000000b2190d00000000200000ffffffffe51b01010b0c0000000000e11b0d00000000210000ffffffffe91b01010b0c0000000000e51b0d00000000220000ffffffff'
        ],
        received: ['94010300e11b020c0000000001000016b21900000d000000000120200bb419000000e51b020c000000000100000bb21900000d000000000121210bb619000000e91b020c00000000010000000000000d000000000122220bb2190000']
      },
      {
        sent: [
          '930102ed1b060cf8110a1301d10d060000f992bf9d010a0000000000000000000001050a0d0000000020b419050a0d0000000021b619050a0d0000000022b219013c3c0000000032ed1b0c00000000000000fffffffff11b070cf811011301d10d060000f992bf9d010a000000000000000000000105010d0000000020ed1b05010d0000000021ed1b05010d0000000022ed1b01043c0000000032f11b0c0000000000ed1b01023c0000000032f11b0c00000000010000ffffffff'
        ],
        received: ['94010200ed1b020d0000000003202001b4190000212101b6190000222201b21900000c000000000100003cb819000000f11b020d00000000032020000000002121000000002222000000000c0000000002000040b8190000010102ba190000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -1777,
    stackId: 1625,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: 'db4c5399-eaec-10e0-e772-672f54f56dbb', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103e11b01010b0c0000b2190d00200000ffffffffe51b01010b0c0000e11b0d00210000ffffffffe91b01010b0c0000e51b0d00220000ffffffff'
        ],
        received: ['94010300e11b020c0001000016b21900000d000120200bb419000000e51b020c000100000bb21900000d000121210bb619000000e91b020c00010000000000000d000122220bb2190000']
      },
      {
        sent: [
          '930102ed1b060cf8110a1301d10d060000f992bf9d010a0000000000000000000001050a0d0020b419050a0d0021b619050a0d0022b219013c3c0032ed1b0c00000000fffffffff11b070cf811011301d10d060000f992bf9d010a000000000000000000000105010d0020ed1b05010d0021ed1b05010d0022ed1b01043c0032f11b0c0000ed1b01023c0032f11b0c00010000ffffffff'
        ],
        received: ['94010200ed1b020d0003202001b4190000212101b6190000222201b21900000c000100003cb819000000f11b020d00032020000000002121000000002222000000000c0002000040b8190000010102ba190000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -1809,
    stackId: 1667,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2730, uuid: 'b44de3a8-ee42-0a15-2223-939e1337a49a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103a11c01010b0c0000861a0d00200000ffffffffa51c01010b0c0000a11c0d00210000ffffffffa91c01010b0c0000a51c0d00220000ffffffff'
        ],
        received: ['94010300a11c020c0001000016861a0000000d000120200b881a00000000a51c020c000100000b861a0000000d000121210b8a1a00000000a91c020c0001000000000000000d000122220b861a000000']
      },
      {
        sent: [
          '930102ad1c060caa150a1301d10d060000f992bf9d010a0000000000000000000001050a0d0020881a050a0d00218a1a050a0d0022861a013c3c0032ad1c0c00000000ffffffffb11c070caa15011301d10d060000f992bf9d010a000000000000000000000105010d0020ad1c05010d0021ad1c05010d0022ad1c01043c0032b11c0c0000ad1c01023c0032b11c0c00010000ffffffff'
        ],
        received: ['94010200ad1c020d0003202001881a0000002121018a1a000000222201861a0000000c000100003c8c1a00000000b11c020d00032020000000000021210000000000222200000000000c00020000408c1a0000000101028e1a000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -1879,
    stackId: 1753,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 3527, uuid: '6d481c69-0cfc-6868-ab69-03a4cc17faad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103ad1d0101010b0c0000d90600000d00200000000000ffffffffb11d0101010b0c0000a9f8ffff0d00210000000000ffffffffb51d0101010b0c0000a7f8ffff0d00220000000000ffffffff'
        ],
        received: ['94010300ad1d0101020c00010000160101b21b0000000d000120200b0101b41b00000000b11d0101020c000100000b0101b21b0000000d000121210b0101b61b00000000b51d0101020c000100000001000000000d000122220b0101b21b000000']
      },
      {
        sent: [
          '930102b91d060a0cc71b0a11130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000105050a0d0020da06000005050a0d0021db06000005050a0d0022d906000001013c3c0032a3f8ffff0c00000000000000ffffffffbd1d070a0cc71b0111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020a3f8ffff0505010d0021a3f8ffff0505010d0022a3f8ffff0101043c0032a1f8ffff0c0000a3f8ffff0101023c0032a1f8ffff0c00010000000000ffffffff'
        ],
        received: ['94010200b91d0101020d00032020010101b41b0000002121010101b61b0000002222010101b21b0000000c000100003c0101b81b00000000bd1d0101020d00032020000100000000212100010000000022220001000000000c00020000400101b81b0000000101020101ba1b000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -1905,
    stackId: 1758,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 4635, uuid: '2c4b9dd7-d032-7151-aa42-346a7499dca6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103e11d0101010b0c0000de0600000d00200000000000ffffffffe51d0101010b0c00008ff8ffff0d00210000000000ffffffffe91d0101010b0c00008df8ffff0d00220000000000ffffffff'
        ],
        received: ['94010300e11d01020c000100001601bc1b0000000d000120200b01be1b00000000e51d01020c000100000b01bc1b0000000d000121210b01c01b00000000e91d01020c0001000000000000000d000122220b01bc1b000000']
      },
      {
        sent: [
          '930102ed1d060a0c9b240a11130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000105050a0d0020df06000005050a0d0021e006000005050a0d0022de06000001013c3c003289f8ffff0c00000000000000fffffffff11d070a0c9b240111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d002089f8ffff0505010d002189f8ffff0505010d002289f8ffff0101043c003287f8ffff0c000089f8ffff0101023c003287f8ffff0c00010000000000ffffffff'
        ],
        received: ['94010200ed1d01020d000320200101be1b00000021210101c01b00000022220101bc1b0000000c000100003c01c21b00000000f11d01020d00032020000000000021210000000000222200000000000c000200004001c21b00000001010201c41b000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -1905,
    stackId: 1758,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2737, uuid: '26445602-008d-6d62-3a38-fc1e7f5dceb0', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103e11d0101010b0c0000de0600000d00200000000000ffffffffe51d0101010b0c00008ff8ffff0d00210000000000ffffffffe91d0101010b0c00008df8ffff0d00220000000000ffffffff'
        ],
        received: ['94010300e11d01020c000100001601bc1b0000000d000120200b01be1b00000000e51d01020c000100000b01bc1b0000000d000121210b01c01b00000000e91d01020c0001000000000000000d000122220b01bc1b000000']
      },
      {
        sent: [
          '930102ed1d060a0cb1150a12140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a000000000000000000000105050a0d0020df06000005050a0d0021e006000005050a0d0022de06000001013c3c003289f8ffff0c00000000000000fffffffff11d070a0cb1150112140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d002089f8ffff0505010d002189f8ffff0505010d002289f8ffff0101043c003287f8ffff0c000089f8ffff0101023c003287f8ffff0c00010000000000ffffffff'
        ],
        received: ['94010200ed1d01020d000320200101be1b00000021210101c01b00000022220101bc1b0000000c000100003c01c21b00000000f11d01020d00032020000000000021210000000000222200000000000c000200004001c21b00000001010201c41b000000']
      }
    ]
  }
]

const CURSORS: readonly RecordedBook[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -253,
    stackId: 676,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44bbace-4678-8e9f-da4e-5592f3e8b1ad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103f9030101010c00c80a0d200000fd030101010c00f9030d21000081040101010c00fd030d220000'
        ],
        received: ['94010300f903020c01000002c80a000d01202001ca0a0000fd03020c01000001c80a000d01212101cc0a00008104020c0100000000000d01222201c80a00']
      },
      {
        sent: [
          '350002d44bbace46788e9fda4e5592f3e8b1ad0001588c0c00000000',
          '93010185040609ac0e0e01588c0c000000000105010d20ca0a05010d21cc0a05010d22c80a00063b3285043a000000'
        ],
        received: ['940101008504020d032020000000212100000022220000003a01000006ce0a00']
      },
      {
        sent: [
          '93010189040101063a00ce0a1b080000'
        ],
        received: ['940101008904023a0100000000001b01080806ce0a00']
      }
    ]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    firstRequest: -253,
    stackId: 676,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: 'd44ec8f1-157e-da8f-5d35-d1b0cfed19a3', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 3, blockRuntimeId: 0 }] },
    segments: [
      {
        sent: [
          '930103f9030101010c00c80a0d200000fd030101010c00f9030d21000081040101010c00fd030d220000'
        ],
        received: ['94010300f903020c01000002c80a00000d01202001ca0a000000fd03020c01000001c80a00000d01212101cc0a0000008104020c010000000000000d01222201c80a0000']
      },
      {
        sent: [
          '350002d44ec8f1157eda8f5d35d1b0cfed19a30001588c0c00000000',
          '9301018504060aac0e0f01588c0c000000000105010d20ca0a05010d21cc0a05010d22c80a00063b3285043a000000'
        ],
        received: ['940101008504020d032020000000002121000000002222000000003a01000006ce0a0000']
      },
      {
        sent: [
          '93010189040101063a00ce0a1b080000'
        ],
        received: ['940101008904023a010000000000001b01080806ce0a0000']
      }
    ]
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    firstRequest: -217,
    stackId: 582,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 1836, uuid: '7143f01c-9917-e7bd-586f-c8ba4340289e', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 5945 }] },
    segments: [
      {
        sent: [
          '930103b1030101010c008c090d200000b5030101010c00b1030d210000b9030101010c00b5030d220000'
        ],
        received: ['94010300b103020c010000028c0900000d012020018e09000000b503020c010000018c0900000d012121019009000000b903020c010000000000000d012222018c090000']
      },
      {
        sent: [
          '3500027143f01c9917e7bd586fc8ba4340289e00015806000000f25c0a00000000000000000000',
          '930101bd03060aac0e0f0158060000f25c0a000000000000000000000105010d208e0905010d21900905010d228c0900063b32bd033a000000'
        ],
        received: ['94010100bd03020d032020000000002121000000002222000000003a0100000692090000']
      },
      {
        sent: [
          '930101c1030101063a0092091b080000'
        ],
        received: ['94010100c103023a010000000000001b0108080692090000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -231,
    stackId: 607,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2016, uuid: '1c4bd76d-65fb-0aef-aab6-546f61f4689d', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7226 }] },
    segments: [
      {
        sent: [
          '930103cd030101010c00be090d200000d1030101010c00cd030d210000d5030101010c00d1030d220000'
        ],
        received: ['94010300cd03020c01000002be0900000d01202001c009000000d103020c01000001be0900000d01212101c209000000d503020c010000000000000d01222201be090000']
      },
      {
        sent: [
          '3500021c4bd76d65fb0aefaab6546f61f4689d00015806000000f4700a00000000000000000000',
          '930101d903060ae00f110158060000f4700a000000000000000000000105010d20c00905010d21c20905010d22be0900063b32d9033a000000'
        ],
        received: ['94010100d903020d032020000000002121000000002222000000003a01000006c4090000']
      },
      {
        sent: [
          '930101dd030101063a00c4091b080000'
        ],
        received: ['94010100dd03023a010000000000001b01080806c4090000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.30',
    firstRequest: -231,
    stackId: 607,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2025, uuid: '844e7760-2c10-84e4-4c90-86feca93d9a5', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'double_stone_slab', count: 6, metadata: 0, blockRuntimeId: 7223 }] },
    segments: [
      {
        sent: [
          '930103cd030101010c00be090d200000d1030101010c00cd030d210000d5030101010c00d1030d220000'
        ],
        received: ['94010300cd03020c01000002be0900000d01202001c009000000d103020c01000001be0900000d01212101c209000000d503020c010000000000000d01222201be090000']
      },
      {
        sent: [
          '350002844e77602c1084e44c9086feca93d9a500015806000000ee700a00000000000000000000',
          '930101d903060ce90f130158060000ee700a000000000000000000000105010d20c00905010d21c20905010d22be0900063b32d9033a000000'
        ],
        received: ['94010100d903020d032020000000002121000000002222000000003a01000006c4090000']
      },
      {
        sent: [
          '930101dd030101063a00c4091b080000'
        ],
        received: ['94010100dd03023a010000000000001b01080806c4090000']
      }
    ]
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.21',
    firstRequest: -227,
    stackId: 597,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2122, uuid: 'd6428634-2f27-f394-494f-cc236b6280a6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4273 }] },
    segments: [
      {
        sent: [
          '930103c5030101010c00aa090d200000c9030101010c00c5030d210000cd030101010c00c9030d220000'
        ],
        received: ['94010300c503020c01000002aa0900000d01202001ac09000000c903020c01000001aa0900000d01212101ae09000000cd03020c010000000000000d01222201aa090000']
      },
      {
        sent: [
          '350002d64286342f27f394494fcc236b6280a600015806000000e2420a00000000000000000000',
          '930101d103060cca10130158060000e2420a000000000000000000000105010d20ac0905010d21ae0905010d22aa0900063b32d1033a000000'
        ],
        received: ['94010100d103020d032020000000002121000000002222000000003a01000006b0090000']
      },
      {
        sent: [
          '930101d5030101063a00b0091b080000'
        ],
        received: ['94010100d503023a010000000000001b01080806b0090000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -227,
    stackId: 597,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2125, uuid: '2c46ecf5-2741-3453-8b53-3ddd77b2ca94', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 4275 }] },
    segments: [
      {
        sent: [
          '930103c5030101010c00aa090d200000ffffffffc9030101010c00c5030d210000ffffffffcd030101010c00c9030d220000ffffffff'
        ],
        received: ['94010300c503020c01000002aa0900000d01202001ac09000000c903020c01000001aa0900000d01212101ae09000000cd03020c010000000000000d01222201aa090000']
      },
      {
        sent: [
          '3500022c46ecf5274134538b533ddd77b2ca9400015806000000e6420a00000000000000000000',
          '930101d103060ccd10130158060000e6420a000000000000000000000105010d20ac0905010d21ae0905010d22aa0900063b32d1033a000000ffffffff'
        ],
        received: ['94010100d103020d032020000000002121000000002222000000003a01000006b0090000']
      },
      {
        sent: [
          '930101d5030101063a00b0091b080000ffffffff'
        ],
        received: ['94010100d503023a010000000000001b01080806b0090000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.40',
    firstRequest: -177,
    stackId: 619,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2103, uuid: '7740f7c7-6250-373d-2e58-cc68d889349c', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 6052 }] },
    segments: [
      {
        sent: [
          '930103e1020101010c00d6090d200000ffffffffe5020101010c00e1020d210000ffffffffe9020101010c00e5020d220000ffffffff'
        ],
        received: ['94010300e102020c01000002d60900000d01202001d809000000e502020c01000001d60900000d01212101da09000000e902020c010000000000000d01222201d6090000']
      },
      {
        sent: [
          '3500027740f7c76250373d2e58cc68d889349c00015806000000c85e0a00000000000000000000',
          '930101ed02060cb710130158060000c85e0a000000000000000000000105010d20d80905010d21da0905010d22d60900063c32ed023b000000ffffffff'
        ],
        received: ['94010100ed02020d032020000000002121000000002222000000003b01000006dc090000']
      },
      {
        sent: [
          '930101f1020101063b00dc091c080000ffffffff'
        ],
        received: ['94010100f102023b010000000000001c01080806dc090000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    firstRequest: -181,
    stackId: 603,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2179, uuid: '844fe3db-d639-aa90-ac17-768390581398', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'stone_block_slab', count: 6, metadata: 0, blockRuntimeId: 172918599 }] },
    segments: [
      {
        sent: [
          '930103e9020101010c00b6090d200000ffffffffed020101010c00e9020d210000fffffffff1020101010c00ed020d220000ffffffff'
        ],
        received: ['94010300e902020c01000002b60900000d01202001b809000000ed02020c01000001b60900000d01212101ba09000000f102020c010000000000000d01222201b6090000']
      },
      {
        sent: [
          '930101f502060c83111301580600008e9df4a4010a000000000000000000000105010d20b80905010d21ba0905010d22b60900063c32f5023b000000ffffffff'
        ],
        received: ['94010100f502020d032020000000002121000000002222000000003b01000006bc090000']
      },
      {
        sent: [
          '930101f9020101063b00bc091c080000ffffffff'
        ],
        received: ['94010100f902023b010000000000001c01080806bc090000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -189,
    stackId: 633,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '1b405dcf-a1f7-23b5-a47c-ff5b60bb219a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103f9020101010c00f2090d200000fffffffffd020101010c00f9020d210000ffffffff81030101010c00fd020d220000ffffffff'
        ],
        received: ['94010300f902020c01000002f20900000d01202001f409000000fd02020c01000001f20900000d01212101f6090000008103020c010000000000000d01222201f2090000']
      },
      {
        sent: [
          '9301018503060cf8111301d10d060000f992bf9d010a000000000000000000000105010d20f40905010d21f60905010d22f20900063c3285033b000000ffffffff'
        ],
        received: ['940101008503020d032020000000002121000000002222000000003b01000006f8090000']
      },
      {
        sent: [
          '93010189030101063b00f8091c080000ffffffff'
        ],
        received: ['940101008903023b010000000000001c01080806f8090000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -189,
    stackId: 633,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: '5b4e8a15-a76d-1a02-890f-0c50a37bc29a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103f9020101010c0000000000f2090d00000000200000fffffffffd020101010c0000000000f9020d00000000210000ffffffff81030101010c0000000000fd020d00000000220000ffffffff'
        ],
        received: ['94010300f902020c0000000001000002f20900000d0000000001202001f409000000fd02020c0000000001000001f20900000d0000000001212101f6090000008103020c00000000010000000000000d0000000001222201f2090000']
      },
      {
        sent: [
          '9301018503060cf811011301d10d060000f992bf9d010a000000000000000000000105010d0000000020f40905010d0000000021f60905010d0000000022f20900063c000000003285033b00000000000000ffffffff'
        ],
        received: ['940101008503020d00000000032020000000002121000000002222000000003b0000000001000006f8090000']
      },
      {
        sent: [
          '93010189030101063b0000000000f8091c00000000080000ffffffff'
        ],
        received: ['940101008903023b00000000010000000000001c0000000001080806f8090000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -189,
    stackId: 633,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2296, uuid: 'db4c5399-eaec-10e0-e772-672f54f56dbb', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '930103f9020101010c0000f2090d00200000fffffffffd020101010c0000f9020d00210000ffffffff81030101010c0000fd020d00220000ffffffff'
        ],
        received: ['94010300f902020c0001000002f20900000d0001202001f409000000fd02020c0001000001f20900000d0001212101f6090000008103020c00010000000000000d0001222201f2090000']
      },
      {
        sent: [
          '9301018503060cf811011301d10d060000f992bf9d010a000000000000000000000105010d0020f40905010d0021f60905010d0022f20900063c003285033b00000000ffffffff'
        ],
        received: ['940101008503020d00032020000000002121000000002222000000003b0001000006f8090000']
      },
      {
        sent: [
          '93010189030101063b0000f8091c00080000ffffffff'
        ],
        received: ['940101008903023b00010000000000001c0001080806f8090000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -193,
    stackId: 651,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2730, uuid: 'b44de3a8-ee42-0a15-2223-939e1337a49a', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '93010381030101010c0000960a0d00200000ffffffff85030101010c000081030d00210000ffffffff89030101010c000085030d00220000ffffffff'
        ],
        received: ['940103008103020c0001000002960a0000000d0001202001980a000000008503020c0001000001960a0000000d00012121019a0a000000008903020c0001000000000000000d0001222201960a000000']
      },
      {
        sent: [
          '9301018d03060caa15011301d10d060000f992bf9d010a000000000000000000000105010d0020980a05010d00219a0a05010d0022960a00063c00328d033b00000000ffffffff'
        ],
        received: ['940101008d03020d00032020000000000021210000000000222200000000003b00010000069c0a000000']
      },
      {
        sent: [
          '93010191030101063b00009c0a1c00080000ffffffff'
        ],
        received: ['940101009103023b0001000000000000001c00010808069c0a000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -201,
    stackId: 689,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 3527, uuid: '6d481c69-0cfc-6868-ab69-03a4cc17faad', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '9301039103010101010c0000b10200000d00200000000000ffffffff9503010101010c000037ffffff0d00210000000000ffffffff9903010101010c000035ffffff0d00220000000000ffffffff'
        ],
        received: ['9401030091030101020c00010000020101e20a0000000d00012020010101e40a0000000095030101020c00010000010101e20a0000000d00012121010101e60a0000000099030101020c000100000001000000000d00012222010101e20a000000']
      },
      {
        sent: [
          '9301019d03060a0cc71b0111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020b20200000505010d0021b30200000505010d0022b10200000000063c003231ffffff3b00000000000000ffffffff'
        ],
        received: ['940101009d030101020d00032020000100000000212100010000000022220001000000003b00010000060101e80a000000']
      },
      {
        sent: [
          '930101a103010101063b0000b40200001c00080000000000ffffffff'
        ],
        received: ['94010100a1030101023b000100000001000000001c00010808060101e80a000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -205,
    stackId: 685,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 4635, uuid: '2c4b9dd7-d032-7151-aa42-346a7499dca6', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '9301039903010101010c0000ad0200000d00200000000000ffffffff9d03010101010c000033ffffff0d00210000000000ffffffffa103010101010c000031ffffff0d00220000000000ffffffff'
        ],
        received: ['94010300990301020c000100000201da0a0000000d000120200101dc0a000000009d0301020c000100000101da0a0000000d000121210101de0a00000000a10301020c0001000000000000000d000122220101da0a000000']
      },
      {
        sent: [
          '930101a503060a0c9b240111130101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020ae0200000505010d0021af0200000505010d0022ad0200000000063c00322dffffff3b00000000000000ffffffff'
        ],
        received: ['94010100a50301020d00032020000000000021210000000000222200000000003b000100000601e00a000000']
      },
      {
        sent: [
          '930101a903010101063b0000b00200001c00080000000000ffffffff'
        ],
        received: ['94010100a90301023b0001000000000000001c000108080601e00a000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -205,
    stackId: 685,
    recipe: { type: 'shaped', id: 'Painting_Cobblestone_recipeId', networkId: 2737, uuid: '26445602-008d-6d62-3a38-fc1e7f5dceb0', priority: 50, width: 3, height: 1, input: [{ item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }, { item: 'cobblestone', metadata: 0 }], output: [{ item: 'cobblestone_slab', count: 6, metadata: 0, blockRuntimeId: -165143741 }] },
    segments: [
      {
        sent: [
          '9301039903010101010c0000ad0200000d00200000000000ffffffff9d03010101010c000033ffffff0d00210000000000ffffffffa103010101010c000031ffffff0d00220000000000ffffffff'
        ],
        received: ['94010300990301020c000100000201da0a0000000d000120200101dc0a000000009d0301020c000100000101da0a0000000d000121210101de0a00000000a10301020c0001000000000000000d000122220101da0a000000']
      },
      {
        sent: [
          '930101a503060a0cb1150112140101011a6d696e6563726166743a636f62626c6573746f6e655f736c6162000600c3b6a0b10f0a00000000000000000000010505010d0020ae0200000505010d0021af0200000505010d0022ad0200000000063c00322dffffff3b00000000000000ffffffff'
        ],
        received: ['94010100a50301020d00032020000000000021210000000000222200000000003b000100000601e00a000000']
      },
      {
        sent: [
          'e60200',
          '930101a903010101063b0000b00200001c00080000000000ffffffff',
          'e60201'
        ],
        received: ['94010100a90301023b0001000000000000001c000108080601e00a000000']
      }
    ]
  }
]

function craftingSince (server: FakeBedrockClient): () => string[] {
  const crafting = ['crafting_event', 'item_stack_request', 'serverbound_cursor_item_drag']
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => crafting.includes(name)).map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

interface BookScenario {
  title: string
  cobblestone: number
  recorded: readonly RecordedBook[]
  gestures: (bot: TestBot['bot'], recipe: BedrockRecipe, recorded: RecordedBook) => ReadonlyArray<() => Array<Promise<void>>>
}

// Java's crafting table slots: the output 0, the hotbar 37 – 45
const BOOK: readonly BookScenario[] = [
  {
    title: 'crafting all a stack makes (auto, all), a request crafting them all',
    cobblestone: 33,
    recorded: AUTO_ALLS,
    gestures: (bot, recipe, { times }) => [() => [bot.craft(recipe, times)]]
  },
  {
    title: 'selecting the recipe and taking its result (select, by the keyboard), in one packet',
    cobblestone: 3,
    recorded: SELECTS,
    gestures: (bot, recipe) => [() => [bot.placeRecipe(recipe), bot.clickWindow(0, 0, 0)]]
  },
  {
    title: 'selecting the recipe, then shift clicking the output (select, by the mouse)',
    cobblestone: 3,
    recorded: SHIFT_ONES,
    gestures: (bot, recipe) => [() => [bot.placeRecipe(recipe)], () => [bot.clickWindow(0, 0, 1)]]
  },
  {
    title: 'selecting the recipe with a stack of ingredients, then shift clicking the output: a craft a request up to 1.21.2, a stack of results a request from 1.21.20',
    cobblestone: 33,
    recorded: SHIFT_STACKS,
    gestures: (bot, recipe) => [() => [bot.placeRecipe(recipe, true)], () => [bot.clickWindow(0, 0, 1)]]
  },
  {
    title: 'selecting the recipe, clicking the output, then hotbar slot 8: the result to the cursor, then to the slot',
    cobblestone: 3,
    recorded: CURSORS,
    gestures: (bot, recipe) => [() => [bot.placeRecipe(recipe)], () => [bot.clickWindow(0, 0, 0)], () => [bot.clickWindow(45, 0, 0)]]
  }
]

type GridItem = readonly [slot: number, item: string, stackId: number, count?: number]

// recorded on 1.26.51.1
interface RecordedGridCraft {
  name: string
  screen: 'inventory' | 'workbench'
  firstRequest: number
  recipe: GivenRecipe
  given: readonly GridItem[]
  // made in the tick before, its request unanswered
  before?: readonly [slot: number, mouseButton: number, mode: number]
  click: readonly [slot: number, mouseButton: number, mode: number]
  request: string
  response: string
}

const PLANKS = Object.freeze({ tag: 'minecraft:planks' })

const GRID_CRAFTS: readonly RecordedGridCraft[] = [
  {
    name: 'a left click takes a chest to the cursor, its metadata its block\'s facing',
    screen: 'workbench',
    firstRequest: -65,
    recipe: { type: 'shaped', id: 'minecraft:Chest_recipeId', networkId: 1193, uuid: '8a41a107-8515-e02b-fac3-44e3ace3f088', width: 3, height: 3, input: [PLANKS, PLANKS, PLANKS, PLANKS, null, PLANKS, PLANKS, PLANKS, PLANKS], output: [{ item: 'chest', count: 1, blockRuntimeId: -1132117234 }] },
    given: [[32, 'oak_planks', 21], [33, 'oak_planks', 22], [34, 'oak_planks', 23], [35, 'oak_planks', 24], [37, 'oak_planks', 25], [38, 'oak_planks', 26], [39, 'oak_planks', 27], [40, 'oak_planks', 20]],
    click: [0, 0, 0],
    request: '93010181010b0a0ca9090111130101010f6d696e6563726166743a63686573740401008e8695e40b0a00000000000000000000010505010d0020150000000505010d0021160000000505010d0022170000000505010d0023180000000505010d0025190000000505010d00261a0000000505010d00271b0000000505010d0028140000000000013c0032bfffffff3b00000000000000ffffffff',
    response: '94010100810101020d000820200000000000212100000000002222000000000023230000000000252500000000002626000000000027270000000000282800000000003b00010000010138000000'
  },
  {
    name: 'a hotbar key takes a wooden hoe to the key\'s slot, a damageable result told with Damage 0',
    screen: 'workbench',
    firstRequest: -71,
    recipe: { type: 'shaped', id: 'minecraft:wooden_hoe', networkId: 1728, uuid: '4c42e583-612f-7223-7a69-348f3da54db5', width: 2, height: 3, input: [PLANKS, PLANKS, null, { item: 'stick' }, null, { item: 'stick' }], output: [{ item: 'wooden_hoe', count: 1 }] },
    given: [[32, 'oak_planks', 33], [33, 'oak_planks', 30], [36, 'stick', 34], [39, 'stick', 32]],
    click: [0, 8, 2],
    request: '9301018d01070a0cc00d011113010101146d696e6563726166743a776f6f64656e5f686f65000100001cffff010a000003060044616d61676500000000000000000000000000010505010d0020210000000505010d00211e0000000505010d0024220000000505010d0027200000000000013c0032b9ffffff1c00080000000000ffffffff',
    response: '940101008d0101020d0004202000000000002121000000000024240000000000272700000000001c00010808010146000000'
  },
  {
    name: 'a shift click crafts as often as the grid allows, a stack\'s worth a request: logs to planks',
    screen: 'inventory',
    firstRequest: -9,
    recipe: { type: 'shaped', id: 'minecraft:oak_planks', networkId: 715, uuid: '674f416c-7b71-071a-0a96-3a7e74096496', input: [{ item: 'oak_log' }], output: [{ item: 'oak_planks', count: 4, blockRuntimeId: 1921718966 }] },
    given: [[28, 'oak_log', 3, 2]],
    click: [0, 0, 1],
    request: '93010111040a0ccb05021113010101146d696e6563726166743a6f616b5f706c616e6b73000400b6b5ac94070a00000000000000000000010505020d001c030000000101083c0032f7ffffff0c00000000000000ffffffff',
    response: '940101001101020d00011c1c00000000000c00010000080108000000'
  },
  {
    name: 'a shift click crafts an unstackable result a request: two beds, the second naming the grid by the first',
    screen: 'workbench',
    firstRequest: -183,
    recipe: { type: 'shaped', id: 'bed_color_15', networkId: 3679, uuid: '7f479dc5-49e7-0ff0-c813-e8a5a1b4d2b4', priority: 1, width: 3, height: 2, input: [{ item: 'white_wool', metadata: 0 }, { item: 'white_wool', metadata: 0 }, { item: 'white_wool', metadata: 0 }, PLANKS, PLANKS, PLANKS], output: [{ item: 'bed', count: 1 }] },
    given: [[32, 'white_wool', 62, 2], [33, 'white_wool', 63, 2], [34, 'white_wool', 64, 2], [35, 'oak_planks', 65, 2], [36, 'oak_planks', 66, 2], [37, 'oak_planks', 67, 2]],
    click: [0, 0, 1],
    request: '930102ed02090a0cdf1c0111130101010d6d696e6563726166743a626564000100000a00000000000000000000010505010d00203e0000000505010d00213f0000000505010d0022400000000505010d0023410000000505010d0024420000000505010d0025430000000101013c003249ffffff0c00000000000000fffffffff102090a0cdf1c0111130101010d6d696e6563726166743a626564000100000a00000000000000000000010505010d002049ffffff0505010d002149ffffff0505010d002249ffffff0505010d002349ffffff0505010d002449ffffff0505010d002549ffffff0101013c003247ffffff0c00010000000000ffffffff',
    response: '94010200ed0201020d0006202001017c000000212101017e0000002222010180010000002323010182010000002424010184010000002525010186010000000c000100000101880100000000f10201020d00062020000000000021210000000000222200000000002323000000000024240000000000252500000000000c0001010101018a01000000'
  },
  {
    name: 'a left click takes a cake to the cursor, then its buckets to the inventory, each after create, the grid and the cursor named by the place still unanswered',
    screen: 'workbench',
    firstRequest: -189,
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 543, uuid: '9849fb67-692a-6365-140c-2e8e6fff48be', width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar' }, { tag: 'minecraft:egg' }, { item: 'sugar' }, { item: 'wheat' }, { item: 'wheat' }, { item: 'wheat' }], output: [{ item: 'cake', count: 1 }, { item: 'bucket', count: 3 }] },
    given: [[32, 'milk_bucket', 73], [33, 'milk_bucket', 74], [34, 'milk_bucket', 75], [35, 'sugar', 82], [36, 'egg', 79], [37, 'sugar', 77], [38, 'wheat', 83], [39, 'wheat', 84], [0, 'wheat', 81]],
    before: [9, 0, 0],
    click: [0, 0, 0],
    request: '930101fd020f0a0c9f040111130201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000010505010d0020490000000505010d00214a0000000505010d00224b0000000505010d0023520000000505010d00244f0000000505010d00254d0000000505010d0026530000000505010d0027540000000505010d002843ffffff0606000000013c003241ffffff3b000043ffffff0606010101033c003241ffffff0c00000000000000ffffffff',
    response: '94010100fd0201030d00092020000000000021210000000000222200000000002323000000000024240000000000252500000000002626000000000027270000000000282800000000003b000100000101aa010000000c000100000301ac01000000'
  },
  {
    name: 'a right click takes the whole result, as a left click: sticks',
    screen: 'inventory',
    firstRequest: -31,
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: 'e74d2753-a3f5-ef68-d641-6bc87424f491', priority: -1, height: 2, input: [PLANKS, PLANKS], output: [{ item: 'stick', count: 4 }] },
    given: [[28, 'oak_planks', 12], [30, 'oak_planks', 11]],
    click: [0, 1, 0],
    request: '9301013d050a0cad0c0111130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010d001c0c0000000505010d001e0b0000000000043c0032e1ffffff3b00000000000000ffffffff',
    response: '940101003d01020d00021c1c00000000001e1e00000000003b0001000004011a000000'
  },
  {
    name: 'a left click takes the result onto the cursor\'s stack of it',
    screen: 'inventory',
    firstRequest: -51,
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: 'ec4e01a8-9f07-826d-59b5-61e4758339bf', priority: -1, height: 2, input: [PLANKS, PLANKS], output: [{ item: 'stick', count: 4 }] },
    given: [[28, 'oak_planks', 16], [30, 'oak_planks', 17], [0, 'stick', 18, 4]],
    click: [0, 0, 0],
    request: '93010165050a0cad0c0111130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010d001c100000000505010d001e110000000000043c0032cdffffff3b00001200000000ffffffff',
    response: '940101006501020d00021c1c00000000001e1e00000000003b00010000080124000000'
  }
]

// recorded on 1.26.51.01
interface RecordedSelectShift {
  name: string
  screen: 'inventory' | 'workbench'
  firstRequest: number
  recipe: GivenRecipe
  given: readonly [item: string, stackId: number, count: number]
  request: string
  response: string
}

const SELECT_SHIFTS: readonly RecordedSelectShift[] = [
  {
    name: 'sticks from 4 planks at a crafting table: 2 planks a cell, 4 sticks',
    screen: 'workbench',
    firstRequest: -73,
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: 'a7418ea8-5b23-d09e-1172-fa29d296e0a1', priority: -1, height: 2, input: [PLANKS, PLANKS], output: [{ item: 'stick', count: 4 }] },
    given: ['oak_planks', 108, 4],
    request: '9301039101010101020c00006c0000000d00200000000000ffffffff9501010101020c0000b7ffffff0d00230000000000ffffffff9901050a0cad0c0111130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010d0020b7ffffff0505010d0023b5ffffff0101043c0032b3ffffff0c0000b5ffffff00ffffffff',
    response: '94010300910101020c000100000201d8010000000d000120200201da0100000000950101020c0001000000000000000d000123230201d80100000000990101020d000220200101da0100000023230101d8010000000c000100000401dc01000000'
  },
  {
    name: 'planks from 2 logs on the inventory screen: both logs in the cell, 4 planks',
    screen: 'inventory',
    firstRequest: -15,
    recipe: { type: 'shaped', id: 'minecraft:oak_planks', networkId: 715, uuid: '794d5c53-8c7e-a255-5d61-c9324b132b8b', input: [{ item: 'oak_log' }], output: [{ item: 'oak_planks', count: 4, blockRuntimeId: 1921718966 }] },
    given: ['oak_log', 21, 2],
    request: '9301021d010101020c0000150000000d001c0000000000ffffffff21040a0ccb05011113010101146d696e6563726166743a6f616b5f706c616e6b73000400b6b5ac94070a00000000000000000000010505010d001cf1ffffff0101043c0032efffffff0c0000f1ffffff00ffffffff',
    response: '940102001d01020c0001000000000000000d00011c1c02012a000000002101020d00011c1c01012a0000000c0001000004012c000000'
  }
]

interface RecordedAutoCraft {
  from: BedrockVersion
  to: BedrockVersion
  screen: 'inventory' | 'workbench'
  firstRequest: number
  times: number
  given: ReadonlyArray<{ slot: number, item: string, metadata?: number, count: number, stackId: number }>
  recipe: GivenRecipe
  sent: readonly string[]
  received: readonly string[]
}

const STICKS: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.40',
    to: 'bedrock_1.19.40',
    screen: 'inventory',
    firstRequest: -77,
    times: 1,
    given: [{ slot: 0, item: 'crimson_planks', count: 2, stackId: 192 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 27, uuid: '8a4ae704-2285-5c22-d750-f17b6db35fb5', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500008a4ae70422855c22d750f17b6db35fb50001800504000000000a00000000000000000000',
      '9301019901050d1b0102010effff7f02010effff7f0213018005040000000a000000000000000000000105010c00800305010c00990101043b3299010c00990100ffffffff'
    ],
    received: ['940101009901010c0100000482030000']
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.63',
    screen: 'inventory',
    firstRequest: -73,
    times: 1,
    given: [{ slot: 0, item: 'crimson_planks', count: 2, stackId: 186 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 27, uuid: 'b04fbb3c-d5c1-7b3c-b0f8-f52cf6d936b7', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000b04fbb3cd5c17b3cb0f8f52cf6d936b70001800504000000000a00000000000000000000',
      '9301019101050d1b0102010effff7f02010effff7f0213018005040000000a000000000000000000000105010c00f40205010c00910101043c3291010c00910100ffffffff'
    ],
    received: ['940101009101010c01000004f6020000']
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    screen: 'inventory',
    firstRequest: -73,
    times: 1,
    given: [{ slot: 0, item: 'crimson_planks', count: 2, stackId: 184 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 27, uuid: '6f43e336-08d8-1f4c-67cc-74b38d8991a4', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500006f43e33608d81f4c67cc74b38d8991a40001820504000000000a00000000000000000000',
      '9301019101050d1b0102010effff7f02010effff7f0213018205040000000a000000000000000000000105010c00f00205010c00910101043c3291010c00910100ffffffff'
    ],
    received: ['940101009101010c01000004f2020000']
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    screen: 'inventory',
    firstRequest: -77,
    times: 1,
    given: [{ slot: 0, item: 'bamboo_planks', count: 2, stackId: 184 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 112, uuid: 'f44d3aab-602d-1250-0eeb-f39073b8fca9', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000f44d3aab602d12500eebf39073b8fca90001840504000000000a00000000000000000000',
      '9301019901050d7001020102feff7f020102feff7f0213018405040000000a000000000000000000000105010c00f00205010c00990101043c3299010c00990100ffffffff'
    ],
    received: ['940101009901010c01000004f2020000']
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.71',
    screen: 'inventory',
    firstRequest: -75,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 181 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 760, uuid: 'fb47f888-8024-cafc-e9a3-0a46352aeb85', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019501050df8050102011afdff7f02011afdff7f0213018605040000000a000000000000000000000105010c00ea0205010c00950101043c3295010c00950100ffffffff'
    ],
    received: ['940101009501010c01000004ec020000']
  },
  {
    // recorded on 1.20.80.5
    from: 'bedrock_1.20.80',
    to: 'bedrock_1.20.80',
    screen: 'inventory',
    firstRequest: -75,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 181 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 774, uuid: 'c3470bda-8956-bfb7-9a52-6a14b5624ca9', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019501050d86060102011afdff7f02011afdff7f0213018805040000000a000000000000000000000105010c00ea0205010c00950101043c3295010c00950100ffffffff'
    ],
    received: ['940101009501010c01000004ec020000']
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    screen: 'inventory',
    firstRequest: -79,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 193 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 910, uuid: '0e42401b-7508-6699-cf6b-2df36b704fbd', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019d01050d8e070102011afdff7f02011afdff7f0213018e05040000000a000000000000000000000105010c00820305010c009d0101043c329d010c009d0100ffffffff'
    ],
    received: ['940101009d01010c0100000484030000']
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    screen: 'inventory',
    firstRequest: -79,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 193 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 946, uuid: '4041a417-82d0-75d7-0004-01c762fd5dba', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019d01050db207010102011afdff7f02011afdff7f0213019005040000000a000000000000000000000105010c0000000000820305010c00000000009d0101043c00000000329d010c00000000009d0100ffffffff'
    ],
    received: ['940101009d01010c000000000100000484030000']
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    screen: 'inventory',
    firstRequest: -79,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 193 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 960, uuid: '144389b9-52d3-8335-0129-2e5e5720f3ba', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019d01050dc007010102011afdff7f02011afdff7f0213019005040000000a000000000000000000000105010c0000820305010c00009d0101043c00329d010c00009d0100ffffffff'
    ],
    received: ['940101009d01010c000100000484030000']
  },
  {
    // recorded on 1.21.43.1
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    screen: 'inventory',
    firstRequest: -81,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 200 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 996, uuid: 'f7493e79-3377-2ca1-efd3-9d24b2e837a9', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a101050de407010102011afdff7f02011afdff7f021301b205040000000a000000000000000000000105010c0000900305010c0000a10101043c0032a1010c0000a10100ffffffff'
    ],
    received: ['94010100a101010c000100000492030000']
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.124',
    screen: 'inventory',
    firstRequest: -81,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 200 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1037, uuid: '824bae2c-b7dd-1711-b6ab-43b0ec07119a', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a101050d8d08010102011afdff7f02011afdff7f021301b205040000000a000000000000000000000105010c0000900305010c0000a10101043c0032a1010c0000a10100ffffffff'
    ],
    received: ['94010100a101010c00010000049203000000']
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.30',
    screen: 'inventory',
    firstRequest: -83,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 207 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1104, uuid: 'fe4b57b8-b59e-dc55-0cb7-4f49c9ed2ea9', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a501050dd008010102011afdff7f02011afdff7f021301c005040000000a000000000000000000000105010c00009e0305010c0000a50101043c0032a5010c0000a50100ffffffff'
    ],
    received: ['94010100a501010c0001000004a003000000']
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    screen: 'inventory',
    firstRequest: -53,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 122 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1443, uuid: '2d44848f-9b20-0c5e-b829-9572a3b8de8f', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010169050b0da30b01020101176d696e6563726166743a6163616369615f706c616e6b730001000101176d696e6563726166743a6163616369615f706c616e6b7300010011130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010c00007a0000000505010c0000cbffffff0101043c0032cbffffff0c0000cbffffff00ffffffff'
    ],
    received: ['94010100690101010c00010000040101f601000000']
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'inventory',
    firstRequest: -53,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 122 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: '7949d2d8-d634-ec39-db36-811842a2de9c', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010169050b0dad0c01020101176d696e6563726166743a6163616369615f706c616e6b730001000101176d696e6563726166743a6163616369615f706c616e6b7300010011130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010c00007a0000000505010c0000cbffffff0101043c0032cbffffff0c0000cbffffff00ffffffff'
    ],
    received: ['940101006901010c000100000401f601000000']
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screen: 'inventory',
    firstRequest: -53,
    times: 1,
    given: [{ slot: 0, item: 'acacia_planks', count: 2, stackId: 122 }],
    recipe: { type: 'shaped', id: 'minecraft:stick', networkId: 4453, uuid: '0b4739d7-0fd9-ea0a-078d-5ad267d45a84', priority: -1, width: 1, height: 2, input: [{ tag: 'minecraft:planks' }, { tag: 'minecraft:planks' }], output: [{ item: 'stick', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010169050b0de52201020101176d696e6563726166743a6163616369615f706c616e6b730001000101176d696e6563726166743a6163616369615f706c616e6b7300010012140101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505010c00007a0000000505010c0000cbffffff0101043c0032cbffffff0c0000cbffffff00ffffffff'
    ],
    received: ['940101006901010c000100000401f601000000']
  }
]

const CAKES: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    screen: 'workbench',
    firstRequest: -35,
    times: 1,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 70 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 71 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 72 }, { slot: 3, item: 'sugar', count: 2, stackId: 74 }, { slot: 4, item: 'blue_egg', count: 1, stackId: 76 }, { slot: 5, item: 'wheat', count: 3, stackId: 78 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 390, uuid: 'e1463ae0-c41b-032c-efb9-4e8c57dc05b0', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101450f0b0d860301090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010011130201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000010505010c0000460000000505010c0001470000000505010c0002480000000505010c00034a0000000505010c00044c0000000505010c0003ddffffff0505010c00054e0000000505010c0005ddffffff0505010c0005ddffffff0606010101033c0032ddffffff0c0000ddffffff0606000101013c0032ddffffff0c0001ddffffff00ffffffff'
    ],
    received: ['94010100450101010c000600000301019e010000000101010101a0010000000202000100000000030300010000000004040001000000000505000100000000']
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'workbench',
    firstRequest: -35,
    times: 1,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 70 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 71 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 72 }, { slot: 3, item: 'sugar', count: 2, stackId: 74 }, { slot: 4, item: 'blue_egg', count: 1, stackId: 76 }, { slot: 5, item: 'wheat', count: 3, stackId: 78 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 543, uuid: '884d7389-dfce-8790-9e33-461c1a57b4bf', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101450f0b0d9f0401090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010011130201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000010505010c0000460000000505010c0001470000000505010c0002480000000505010c00034a0000000505010c00044c0000000505010c0003ddffffff0505010c00054e0000000505010c0005ddffffff0505010c0005ddffffff0606010101033c0032ddffffff0c0000ddffffff0606000101013c0032ddffffff0c0001ddffffff00ffffffff'
    ],
    received: ['940101004501010c0006000003019e0100000001010101a00100000002020000000000030300000000000404000000000005050000000000']
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screen: 'workbench',
    firstRequest: -35,
    times: 1,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 70 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 71 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 72 }, { slot: 3, item: 'sugar', count: 2, stackId: 74 }, { slot: 4, item: 'blue_egg', count: 1, stackId: 76 }, { slot: 5, item: 'wheat', count: 3, stackId: 78 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 3415, uuid: '6e417620-e231-a2f0-07e1-0d73048a209f', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101450f0b0dd71a01090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010012140201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000010505010c0000460000000505010c0001470000000505010c0002480000000505010c00034a0000000505010c00044c0000000505010c0003ddffffff0505010c00054e0000000505010c0005ddffffff0505010c0005ddffffff0606010101033c0032ddffffff0c0000ddffffff0606000101013c0032ddffffff0c0001ddffffff00ffffffff'
    ],
    received: ['940101004501010c0006000003019e0100000001010101a00100000002020000000000030300000000000404000000000005050000000000']
  }
]

const DISPENSERS: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    screen: 'workbench',
    firstRequest: -41,
    times: 1,
    given: [{ slot: 0, item: 'cobblestone', count: 7, stackId: 92 }, { slot: 1, item: 'bow', count: 1, stackId: 94 }, { slot: 2, item: 'redstone', count: 1, stackId: 96 }],
    recipe: { type: 'shaped', id: 'minecraft:dispenser', networkId: 1174, uuid: '1249bfba-919f-89ab-4e6c-3900bd76fca3', priority: 0, width: 3, height: 3, input: [{ item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'bow', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'redstone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }], output: [{ item: 'dispenser', count: 1, metadata: 0, blockRuntimeId: 1036524128 }] },
    sent: [
      '930101510c0b0d960901090101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff03010001010d6d696e6563726166743a626f77feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101126d696e6563726166743a72656473746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301001113010101136d696e6563726166743a64697370656e736572060100e0b4a0ee030a00000000000000000000010505010c00005c0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0000d7ffffff0505010c00015e0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0002600000000505010c0000d7ffffff0101013c0032d7ffffff0c0000d7ffffff00ffffffff'
    ],
    received: ['94010100510101010c00030000010101c20100000001010001000000000202000100000000']
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'workbench',
    firstRequest: -41,
    times: 1,
    given: [{ slot: 0, item: 'cobblestone', count: 7, stackId: 92 }, { slot: 1, item: 'bow', count: 1, stackId: 94 }, { slot: 2, item: 'redstone', count: 1, stackId: 96 }],
    recipe: { type: 'shaped', id: 'minecraft:dispenser', networkId: 1313, uuid: '0b42ee33-eac4-0ac6-5cf5-5926decd7d80', priority: 0, width: 3, height: 3, input: [{ item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'bow', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'redstone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }], output: [{ item: 'dispenser', count: 1, metadata: 0, blockRuntimeId: 1036524128 }] },
    sent: [
      '930101510c0b0da10a01090101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff03010001010d6d696e6563726166743a626f77feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101126d696e6563726166743a72656473746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301001113010101136d696e6563726166743a64697370656e736572060100e0b4a0ee030a00000000000000000000010505010c00005c0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0000d7ffffff0505010c00015e0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0002600000000505010c0000d7ffffff0101013c0032d7ffffff0c0000d7ffffff00ffffffff'
    ],
    received: ['940101005101010c000300000101c2010000000101000000000002020000000000']
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screen: 'workbench',
    firstRequest: -41,
    times: 1,
    given: [{ slot: 0, item: 'cobblestone', count: 7, stackId: 92 }, { slot: 1, item: 'bow', count: 1, stackId: 94 }, { slot: 2, item: 'redstone', count: 1, stackId: 96 }],
    recipe: { type: 'shaped', id: 'minecraft:dispenser', networkId: 4185, uuid: '00477052-9ae8-5d7e-42b8-8e5b94c54ab6', priority: 0, width: 3, height: 3, input: [{ item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'bow', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }, { item: 'redstone', metadata: 32767 }, { item: 'cobblestone', metadata: 32767 }], output: [{ item: 'dispenser', count: 1, metadata: 0, blockRuntimeId: 1036524128 }] },
    sent: [
      '930101510c0b0dd92001090101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff03010001010d6d696e6563726166743a626f77feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301000101126d696e6563726166743a72656473746f6e65feff0301000101156d696e6563726166743a636f62626c6573746f6e65feff0301001214010101136d696e6563726166743a64697370656e736572060100e0b4a0ee030a00000000000000000000010505010c00005c0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0000d7ffffff0505010c00015e0000000505010c0000d7ffffff0505010c0000d7ffffff0505010c0002600000000505010c0000d7ffffff0101013c0032d7ffffff0c0000d7ffffff00ffffffff'
    ],
    received: ['940101005101010c000300000101c2010000000101000000000002020000000000']
  }
]

const PICKAXES: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.26.51.01
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'workbench',
    firstRequest: -25,
    times: 1,
    given: [{ slot: 0, item: 'oak_planks', count: 3, stackId: 63 }, { slot: 1, item: 'stick', count: 2, stackId: 65 }],
    recipe: { type: 'shaped', id: 'minecraft:wooden_pickaxe', networkId: 1729, uuid: '4c495a24-649c-2b61-fab0-279043afc5b3', priority: 0, width: 3, height: 3, input: [PLANKS, PLANKS, PLANKS, null, { item: 'stick', metadata: 32767 }, null, null, { item: 'stick', metadata: 32767 }, null], output: [{ item: 'wooden_pickaxe', count: 1 }] },
    sent: [
      '93010131080b0dc10d01050101146d696e6563726166743a6f616b5f706c616e6b730001000101146d696e6563726166743a6f616b5f706c616e6b730001000101146d696e6563726166743a6f616b5f706c616e6b7300010001010f6d696e6563726166743a737469636bfeff03010001010f6d696e6563726166743a737469636bfeff0301001113010101186d696e6563726166743a776f6f64656e5f7069636b617865000100000a00000000000000000000010505010c00003f0000000505010c0000e7ffffff0505010c0000e7ffffff0505010c0001410000000505010c0001e7ffffff0101013c0032e7ffffff0c0000e7ffffff00ffffffff'
    ],
    received: ['940101003101010c000200000101840100000001010000000000']
  }
]

interface RecordedHeldCraft extends RecordedAutoCraft {
  /** mob_equipment of the result in the hand */
  held: string
}

const IRON = Object.freeze({ item: 'iron_ingot', metadata: 32767 })

const SHEARS: readonly RecordedHeldCraft[] = [
  {
    // recorded on 1.19.0.5 and 1.19.10.3: the hand's shears have Damage 0
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.10',
    screen: 'inventory',
    firstRequest: -61,
    times: 1,
    given: [{ slot: 0, item: 'iron_ingot', count: 2, stackId: 156 }],
    recipe: { type: 'shaped', id: 'minecraft:shears', networkId: 914, uuid: '48436a98-7a7a-b762-4727-a2231189cbbc', priority: 0, width: 2, height: 2, input: [null, IRON, IRON, null], output: [{ item: 'shears', count: 1 }] },
    sent: [
      '35000048436a987a7ab7624727a2231189cbbc0001ca0601000000000a00000000000000000000',
      '93010179050d9207011301ca06010000000a000000000000000000000105010c00b80205010c007901013b32790c007900'
    ],
    received: ['9401010079010c01000001ba020000'],
    held: '1f01ca0601000000001cffff010a000003060044616d61676500000000000000000000000000000000'
  },
  {
    // recorded on 1.19.20.2
    from: 'bedrock_1.19.20',
    to: 'bedrock_1.19.20',
    screen: 'inventory',
    firstRequest: -61,
    times: 1,
    given: [{ slot: 0, item: 'iron_ingot', count: 2, stackId: 156 }],
    recipe: { type: 'shaped', id: 'minecraft:shears', networkId: 917, uuid: '8b4cc0d1-0863-6146-1e25-ee8bc3fef598', priority: 0, width: 2, height: 2, input: [null, IRON, IRON, null], output: [{ item: 'shears', count: 1 }] },
    sent: [
      '3500008b4cc0d1086361461e25ee8bc3fef5980001ca0601000000000a00000000000000000000',
      '93010179050d9507011301ca06010000000a000000000000000000000105010c00b80205010c007901013b32790c007900'
    ],
    received: ['9401010079010c01000001ba020000'],
    held: '1f01ca0601000000000a00000000000000000000000000'
  }
]

const HONEY_BLOCKS: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    screen: 'inventory',
    firstRequest: -155,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 532 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 533 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 534 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 535 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 536 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 537 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 538 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 539 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 540 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 541 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 542 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 543 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 544 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 545 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 546 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 547 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 194, uuid: '3f4c5c80-299a-1f7e-eb2b-12fa119435a6', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500003f4c5c80299a1f7eeb2b12fa119435a60001b703800100000000',
      '930101b5021c0ac2010e02b7030200000000d20608000000004005100c00a80805100c01aa0805100c02ac0805100c03ae0805100c04b00805100c05b20805100c06b40805100c07b60805100c08b80805100c09ba0805100c0abc0805100c0bbe0805100c0cc00805100c0dc20805100c0ec40805100c0fc608060101403b32b5020c00b502060101403b32b5020c01b502060101403b32b5020c02b502060101403b32b5020c03b502060001403b32b5020c04b50200'
    ],
    received: ['94010100b502010c10000040c80800010140ca0800020240cc0800030340ce0800040440d00800050500000006060000000707000000080800000009090000000a0a0000000b0b0000000c0c0000000d0d0000000e0e0000000f0f000000']
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    screen: 'inventory',
    firstRequest: -155,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 532 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 533 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 534 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 535 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 536 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 537 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 538 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 539 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 540 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 541 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 542 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 543 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 544 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 545 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 546 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 547 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 194, uuid: 'a6473d5c-6b4f-f7bc-6a65-075043558f9c', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000a6473d5c6b4ff7bc6a65075043558f9c0001b703800100000000',
      '930101b5021c0bc2010f02b7030200000000d20608000000004005100c00a80805100c01aa0805100c02ac0805100c03ae0805100c04b00805100c05b20805100c06b40805100c07b60805100c08b80805100c09ba0805100c0abc0805100c0bbe0805100c0cc00805100c0dc20805100c0ec40805100c0fc608060101403b32b5020c00b502060101403b32b5020c01b502060101403b32b5020c02b502060101403b32b5020c03b502060001403b32b5020c04b50200'
    ],
    received: ['94010100b502010c10000040c8080000010140ca080000020240cc080000030340ce080000040440d00800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    screen: 'inventory',
    firstRequest: -125,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 439 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 440 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 441 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 442 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 443 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 444 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 445 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 446 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 447 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 448 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 449 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 450 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 451 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 454 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 194, uuid: 'ae40d8f7-95a9-57f9-2569-d775c049929a', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 4234 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000ae40d8f795a957f92569d775c049929a0001b7034000000094420a00000000000000000000',
      '930101f9011c0bc2010f02b70301000094420a00000000000000000000d206040000000a000000000000000000004005100c00ee0605100c01f00605100c02f20605100c03f40605100c04f60605100c05f80605100c06fa0605100c07fc0605100c08fe0605100c09800705100c0a820705100c0b840705100c0c860705100c0d880705100c0e8a0705100c0f8c07060101403b32f9010c00f901060101403b32f9010c01f901060101403b32f9010c02f901060101403b32f9010c03f901060001403b32f9010c04f90100'
    ],
    received: ['94010100f901010c100000408e070000010140900700000202409207000003034094070000040440960700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    screen: 'inventory',
    firstRequest: -127,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 462 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 463 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 464 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 465 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 466 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 467 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 353, uuid: '6e43b3ad-e078-9061-adf1-9d2bb2cd5e91', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 5017 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500006e43b3ade0789061adf19d2bb2cd5e910001b70340000000b24e0a00000000000000000000',
      '930101fd011c0be1020f02b703010000b24e0a00000000000000000000d606040000000a000000000000000000004005100c00880705100c018a0705100c028c0705100c038e0705100c04900705100c05920705100c06940705100c07960705100c08980705100c099a0705100c0a9c0705100c0b9e0705100c0ca00705100c0da20705100c0ea40705100c0fa607060101403b32fd010c00fd01060101403b32fd010c01fd01060101403b32fd010c02fd01060101403b32fd010c03fd01060001403b32fd010c04fd0100'
    ],
    received: ['94010100fd01010c10000040a8070000010140aa070000020240ac070000030340ae070000040440b00700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    screen: 'inventory',
    firstRequest: -127,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 462 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 463 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 464 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 465 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 466 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 467 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 374, uuid: '374a353e-825c-10b3-8e78-6276b37d9f8f', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 5087 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000374a353e825c10b38e786276b37d9f8f0001b70340000000be4f0a00000000000000000000',
      '930101fd011c0bf602400f02b703010000be4f0a00000000000000000000d606040000000a000000000000000000004005100c00880705100c018a0705100c028c0705100c038e0705100c04900705100c05920705100c06940705100c07960705100c08980705100c099a0705100c0a9c0705100c0b9e0705100c0ca00705100c0da20705100c0ea40705100c0fa607060101403b32fd010c00fd01060101403b32fd010c01fd01060101403b32fd010c02fd01060101403b32fd010c03fd01060001403b32fd010c04fd0100'
    ],
    received: ['94010100fd01010c10000040a8070000010140aa070000020240ac070000030340ae070000040440b00700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    screen: 'inventory',
    firstRequest: -127,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 462 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 463 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 464 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 465 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 466 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 467 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 374, uuid: '9c4a8526-bdd8-eed4-3372-f6e5e26661b3', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 5112 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500009c4a8526bdd8eed43372f6e5e26661b30001b70340000000f04f0a00000000000000000000',
      '930101fd011c0bf602401102b703010000f04f0a00000000000000000000d606040000000a000000000000000000004005100c00880705100c018a0705100c028c0705100c038e0705100c04900705100c05920705100c06940705100c07960705100c08980705100c099a0705100c0a9c0705100c0b9e0705100c0ca00705100c0da20705100c0ea40705100c0fa607060101403b32fd010c00fd01060101403b32fd010c01fd01060101403b32fd010c02fd01060101403b32fd010c03fd01060001403b32fd010c04fd0100'
    ],
    received: ['94010100fd01010c10000040a8070000010140aa070000020240ac070000030340ae070000040440b00700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.21',
    screen: 'inventory',
    firstRequest: -127,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 462 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 463 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 464 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 465 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 466 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 467 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 383, uuid: 'be4494a7-2ba8-b571-5f72-b7206a145eb2', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 5113 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000be4494a72ba8b5715f72b7206a145eb20001b70340000000f24f0a00000000000000000000',
      '930101fd011c0dff02401302b703010000f24f0a00000000000000000000d606040000000a000000000000000000004005100c00880705100c018a0705100c028c0705100c038e0705100c04900705100c05920705100c06940705100c07960705100c08980705100c099a0705100c0a9c0705100c0b9e0705100c0ca00705100c0da20705100c0ea40705100c0fa607060101403b32fd010c00fd01060101403b32fd010c01fd01060101403b32fd010c02fd01060101403b32fd010c03fd01060001403b32fd010c04fd0100'
    ],
    received: ['94010100fd01010c10000040a8070000010140aa070000020240ac070000030340ae070000040440b00700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.30',
    screen: 'inventory',
    firstRequest: -125,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 447 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 448 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 449 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 450 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 451 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 462 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 470, uuid: '644457bc-0300-19a4-53a9-56b64507a99b', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 894 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000644457bc030019a453a956b64507a99b0001b70340000000fc0d0a00000000000000000000',
      '930101f9011c0dd603401302b703010000fc0d0a00000000000000000000d606040000000a000000000000000000004005100c00fe0605100c01800705100c02820705100c03840705100c04860705100c05880705100c068a0705100c078c0705100c088e0705100c09900705100c0a920705100c0b940705100c0c960705100c0d980705100c0e9a0705100c0f9c07060101403b32f9010c00f901060101403b32f9010c01f901060101403b32f9010c02f901060101403b32f9010c03f901060001403b32f9010c04f90100ffffffff'
    ],
    received: ['94010100f901010c100000409e070000010140a0070000020240a2070000030340a4070000040440a60700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.40',
    to: 'bedrock_1.19.40',
    screen: 'inventory',
    firstRequest: -153,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 527 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 528 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 529 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 530 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 531 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 532 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 533 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 534 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 535 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 536 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 537 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 538 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 539 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 540 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 541 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 542 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 507, uuid: '7845ac0c-52d1-97df-b67c-6099acd2128d', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 894 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500007845ac0c52d197dfb67c6099acd2128d0001b70340000000fc0d0a00000000000000000000',
      '930101b1021c0dfb034004015002ff7f02015002ff7f02015002ff7f02015002ff7f021302b703010000fc0d0a00000000000000000000d606040000000a000000000000000000004005100c009e0805100c01a00805100c02a20805100c03a40805100c04a60805100c05a80805100c06aa0805100c07ac0805100c08ae0805100c09b00805100c0ab20805100c0bb40805100c0cb60805100c0db80805100c0eba0805100c0fbc08060101403b32b1020c00b102060101403b32b1020c01b102060101403b32b1020c02b102060101403b32b1020c03b102060001403b32b1020c04b10200ffffffff'
    ],
    received: ['94010100b102010c10000040be080000010140c0080000020240c2080000030340c4080000040440c60800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.50',
    screen: 'inventory',
    firstRequest: -145,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 505 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 506 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 507 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 508 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 509 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 510 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 511 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 512 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 513 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 514 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 515 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 516 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 517 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 518 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 519 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 520 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 507, uuid: '3d471d67-6217-37e6-b24a-dc852c8cce8f', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1515 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500003d471d67621737e6b24adc852c8cce8f0001b70340000000d6170a00000000000000000000',
      '930101a1021c0dfb034004015002ff7f02015002ff7f02015002ff7f02015002ff7f021302b703010000d6170a00000000000000000000d606040000000a000000000000000000004005100c00f20705100c01f40705100c02f60705100c03f80705100c04fa0705100c05fc0705100c06fe0705100c07800805100c08820805100c09840805100c0a860805100c0b880805100c0c8a0805100c0d8c0805100c0e8e0805100c0f9008060101403c32a1020c00a102060101403c32a1020c01a102060101403c32a1020c02a102060101403c32a1020c03a102060001403c32a1020c04a10200ffffffff'
    ],
    received: ['94010100a102010c10000040920800000101409408000002024096080000030340980800000404409a0800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.19.60.3
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.63',
    screen: 'inventory',
    firstRequest: -145,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 505 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 506 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 507 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 508 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 509 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 510 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 511 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 512 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 513 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 514 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 515 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 516 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 517 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 518 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 519 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 520 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 507, uuid: 'd541503b-c711-108f-28ee-be8ce030929c', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1578 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000d541503bc711108f28eebe8ce030929c0001b70340000000d4180a00000000000000000000',
      '930101a1021c0dfb034004015502ff7f02015502ff7f02015502ff7f02015502ff7f021302b703010000d4180a00000000000000000000d606040000000a000000000000000000004005100c00f20705100c01f40705100c02f60705100c03f80705100c04fa0705100c05fc0705100c06fe0705100c07800805100c08820805100c09840805100c0a860805100c0b880805100c0c8a0805100c0d8c0805100c0e8e0805100c0f9008060101403c32a1020c00a102060101403c32a1020c01a102060101403c32a1020c02a102060101403c32a1020c03a102060001403c32a1020c04a10200ffffffff'
    ],
    received: ['94010100a102010c10000040920800000101409408000002024096080000030340980800000404409a0800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    screen: 'inventory',
    firstRequest: -145,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 501 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 502 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 503 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 504 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 505 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 506 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 507 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 508 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 509 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 510 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 511 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 512 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 513 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 514 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 515 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 516 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 507, uuid: 'f646a181-6d1d-e82b-e46a-b096e97b9481', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1584 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000f646a1816d1de82be46ab096e97b94810001b70340000000e0180a00000000000000000000',
      '930101a1021c0dfb034004015602ff7f02015602ff7f02015602ff7f02015602ff7f021302b703010000e0180a00000000000000000000d806040000000a000000000000000000004005100c00ea0705100c01ec0705100c02ee0705100c03f00705100c04f20705100c05f40705100c06f60705100c07f80705100c08fa0705100c09fc0705100c0afe0705100c0b800805100c0c820805100c0d840805100c0e860805100c0f8808060101403c32a1020c00a102060101403c32a1020c01a102060101403c32a1020c02a102060101403c32a1020c03a102060001403c32a1020c04a10200ffffffff'
    ],
    received: ['94010100a102010c100000408a0800000101408c0800000202408e08000003034090080000040440920800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    screen: 'inventory',
    firstRequest: -153,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 449 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 450 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 451 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 452 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 453 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 454 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 455 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 456 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 457 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 458 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 459 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 460 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 461 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 462 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 463 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 464 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 583, uuid: '954e79b0-8af0-d095-91bf-276afcba3492', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350000954e79b08af0d09591bf276afcba34920001b70340000000c69e97a70b0a00000000000000000000',
      '930101b1021c0dc7044004015702ff7f02015702ff7f02015702ff7f02015702ff7f021302b703010000c69e97a70b0a00000000000000000000da06040000000a000000000000000000004005100c00820705100c01840705100c02860705100c03880705100c048a0705100c058c0705100c068e0705100c07900705100c08920705100c09940705100c0a960705100c0b980705100c0c9a0705100c0d9c0705100c0e9e0705100c0fa007060101403c32b1020c00b102060101403c32b1020c01b102060101403c32b1020c02b102060101403c32b1020c03b102060001403c32b1020c04b10200ffffffff'
    ],
    received: ['94010100b102010c10000040a2070000010140a4070000020240a6070000030340a8070000040440aa0700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.50',
    screen: 'inventory',
    firstRequest: -149,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 493 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 494 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 495 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 496 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 497 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 498 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 499 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 500 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 501 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 502 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 503 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 504 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 422, uuid: 'df4bece7-8315-a7e6-214e-6a26913bfb90', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a9021c0da6034004015802ff7f02015802ff7f02015802ff7f02015802ff7f021302b703010000c69e97a70b0a00000000000000000000dc06040000000a000000000000000000004005100c00d20705100c01d40705100c02d60705100c03d80705100c04da0705100c05dc0705100c06de0705100c07e00705100c08e20705100c09e40705100c0ae60705100c0be80705100c0cea0705100c0dec0705100c0eee0705100c0ff007060101403c32a9020c00a902060101403c32a9020c01a902060101403c32a9020c02a902060101403c32a9020c03a902060001403c32a9020c04a90200ffffffff'
    ],
    received: ['94010100a902010c10000040f2070000010140f4070000020240f6070000030340f8070000040440fa0700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.20.60.4
    from: 'bedrock_1.20.61',
    to: 'bedrock_1.20.61',
    screen: 'inventory',
    firstRequest: -149,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 493 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 494 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 495 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 496 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 497 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 498 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 499 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 500 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 501 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 502 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 503 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 504 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 422, uuid: '164ff698-7bc1-7ffe-9afd-9cda306a83b0', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a9021c0da6034004015902ff7f02015902ff7f02015902ff7f02015902ff7f021302b703010000c69e97a70b0a00000000000000000000dc06040000000a000000000000000000004005100c00d20705100c01d40705100c02d60705100c03d80705100c04da0705100c05dc0705100c06de0705100c07e00705100c08e20705100c09e40705100c0ae60705100c0be80705100c0cea0705100c0dec0705100c0eee0705100c0ff007060101403c32a9020c00a902060101403c32a9020c01a902060101403c32a9020c02a902060101403c32a9020c03a902060001403c32a9020c04a90200ffffffff'
    ],
    received: ['94010100a902010c10000040f2070000010140f4070000020240f6070000030340f8070000040440fa0700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.20.72.1
    from: 'bedrock_1.20.71',
    to: 'bedrock_1.20.71',
    screen: 'inventory',
    firstRequest: -149,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 493 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 494 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 495 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 496 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 497 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 498 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 499 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 500 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 501 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 502 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 503 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 504 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 434, uuid: '1a49be85-038f-199e-31eb-d1a54a2ff3a3', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a9021c0db2034004015b02ff7f02015b02ff7f02015b02ff7f02015b02ff7f021302b703010000c69e97a70b0a00000000000000000000de06040000000a000000000000000000004005100c00d20705100c01d40705100c02d60705100c03d80705100c04da0705100c05dc0705100c06de0705100c07e00705100c08e20705100c09e40705100c0ae60705100c0be80705100c0cea0705100c0dec0705100c0eee0705100c0ff007060101403c32a9020c00a902060101403c32a9020c01a902060101403c32a9020c02a902060101403c32a9020c03a902060001403c32a9020c04a90200ffffffff'
    ],
    received: ['94010100a902010c10000040f2070000010140f4070000020240f6070000030340f8070000040440fa0700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.20.80.5
    from: 'bedrock_1.20.80',
    to: 'bedrock_1.20.80',
    screen: 'inventory',
    firstRequest: -149,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 493 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 494 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 495 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 496 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 497 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 498 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 499 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 500 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 501 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 502 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 503 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 504 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 505 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 457, uuid: 'c34f4b91-5dd3-e9fc-fa4a-af9e6b668196', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a9021c0dc9034004015f02ff7f02015f02ff7f02015f02ff7f02015f02ff7f021302b703010000c69e97a70b0a00000000000000000000e206040000000a000000000000000000004005100c00d40705100c01d60705100c02d80705100c03da0705100c04dc0705100c05de0705100c06e00705100c07e20705100c08e40705100c09e60705100c0ae80705100c0bea0705100c0cec0705100c0dee0705100c0ef00705100c0ff207060101403c32a9020c00a902060101403c32a9020c01a902060101403c32a9020c02a902060101403c32a9020c03a902060001403c32a9020c04a90200ffffffff'
    ],
    received: ['94010100a902010c10000040f4070000010140f6070000020240f8070000030340fa070000040440fc0700000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    screen: 'inventory',
    firstRequest: -157,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 516 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 517 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 518 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 519 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 520 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 521 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 522 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 523 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 524 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 525 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 526 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 527 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 528 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 529 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 530 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 531 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 596, uuid: '794ab885-20fb-cce5-203c-7bee11c1e3a7', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101b9021c0dd4044004016202ff7f02016202ff7f02016202ff7f02016202ff7f021302b703010000c69e97a70b0a00000000000000000000e806040000000a000000000000000000004005100c00880805100c018a0805100c028c0805100c038e0805100c04900805100c05920805100c06940805100c07960805100c08980805100c099a0805100c0a9c0805100c0b9e0805100c0ca00805100c0da20805100c0ea40805100c0fa608060101403c32b9020c00b902060101403c32b9020c01b902060101403c32b9020c02b902060101403c32b9020c03b902060001403c32b9020c04b90200ffffffff'
    ],
    received: ['94010100b902010c10000040a8080000010140aa080000020240ac080000030340ae080000040440b00800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    screen: 'inventory',
    firstRequest: -157,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 516 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 517 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 518 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 519 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 520 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 521 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 522 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 523 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 524 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 525 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 526 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 527 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 528 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 529 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 530 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 531 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 647, uuid: '0d46afa5-4d4c-f0be-3c97-476e478e3098', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101b9021c0d8705404004016302ff7f02016302ff7f02016302ff7f02016302ff7f021302b703010000c69e97a70b0a00000000000000000000ea06040000000a000000000000000000004005100c0000000000880805100c00000000018a0805100c00000000028c0805100c00000000038e0805100c0000000004900805100c0000000005920805100c0000000006940805100c0000000007960805100c0000000008980805100c00000000099a0805100c000000000a9c0805100c000000000b9e0805100c000000000ca00805100c000000000da20805100c000000000ea40805100c000000000fa608060101403c0000000032b9020c0000000000b902060101403c0000000032b9020c0000000001b902060101403c0000000032b9020c0000000002b902060101403c0000000032b9020c0000000003b902060001403c0000000032b9020c0000000004b90200ffffffff'
    ],
    received: ['94010100b902010c0000000010000040a8080000010140aa080000020240ac080000030340ae080000040440b00800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    screen: 'inventory',
    firstRequest: -157,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 516 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 517 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 518 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 519 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 520 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 521 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 522 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 523 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 524 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 525 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 526 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 527 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 528 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 529 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 530 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 531 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 667, uuid: '9743ff5d-9d11-a2d6-9bf4-651ea04604a0', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101b9021c0d9b05404004016302ff7f02016302ff7f02016302ff7f02016302ff7f021302b703010000c69e97a70b0a00000000000000000000ea06040000000a000000000000000000004005100c0000880805100c00018a0805100c00028c0805100c00038e0805100c0004900805100c0005920805100c0006940805100c0007960805100c0008980805100c00099a0805100c000a9c0805100c000b9e0805100c000ca00805100c000da20805100c000ea40805100c000fa608060101403c0032b9020c0000b902060101403c0032b9020c0001b902060101403c0032b9020c0002b902060101403c0032b9020c0003b902060001403c0032b9020c0004b90200ffffffff'
    ],
    received: ['94010100b902010c0010000040a8080000010140aa080000020240ac080000030340ae080000040440b00800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.21.43.1
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    screen: 'inventory',
    firstRequest: -161,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 534 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 535 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 536 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 537 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 538 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 539 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 540 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 541 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 542 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 543 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 544 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 545 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 546 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 547 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 548 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 549 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 780, uuid: '8d419adb-0569-2095-e40d-6927f30938b0', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101c1021c0d8c06404004017302ff7f02017302ff7f02017302ff7f02017302ff7f021302b703010000c69e97a70b0a000000000000000000008c07040000000a000000000000000000004005100c0000ac0805100c0001ae0805100c0002b00805100c0003b20805100c0004b40805100c0005b60805100c0006b80805100c0007ba0805100c0008bc0805100c0009be0805100c000ac00805100c000bc20805100c000cc40805100c000dc60805100c000ec80805100c000fca08060101403c0032c1020c0000c102060101403c0032c1020c0001c102060101403c0032c1020c0002c102060101403c0032c1020c0003c102060001403c0032c1020c0004c10200ffffffff'
    ],
    received: ['94010100c102010c0010000040cc080000010140ce080000020240d0080000030340d2080000040440d40800000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000']
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.111',
    screen: 'inventory',
    firstRequest: -161,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 534 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 535 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 536 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 537 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 538 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 539 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 540 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 541 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 542 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 543 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 544 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 545 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 546 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 547 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 548 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 549 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 821, uuid: '0e418c4f-938c-bcc0-904a-c4859f69208c', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101c1021c0db506404004017302ff7f02017302ff7f02017302ff7f02017302ff7f021302b703010000c69e97a70b0a000000000000000000008c07040000000a000000000000000000004005100c0000ac0805100c0001ae0805100c0002b00805100c0003b20805100c0004b40805100c0005b60805100c0006b80805100c0007ba0805100c0008bc0805100c0009be0805100c000ac00805100c000bc20805100c000cc40805100c000dc60805100c000ec80805100c000fca08060101403c0032c1020c0000c102060101403c0032c1020c0001c102060101403c0032c1020c0002c102060101403c0032c1020c0003c102060001403c0032c1020c0004c10200ffffffff'
    ],
    received: ['94010100c102010c0010000040cc08000000010140ce08000000020240d008000000030340d208000000040440d40800000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f0000000000']
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    screen: 'inventory',
    firstRequest: -165,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 550 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 551 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 552 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 553 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 554 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 555 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 556 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 557 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 558 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 559 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 560 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 561 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 562 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 563 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 564 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 565 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 881, uuid: 'b0440662-1bd4-7c3f-e906-e0bbc5250f94', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101c9021c0df106404004017202ff7f02017202ff7f02017202ff7f02017202ff7f021302b703010000c69e97a70b0a000000000000000000008a07040000000a000000000000000000004005100c0000cc0805100c0001ce0805100c0002d00805100c0003d20805100c0004d40805100c0005d60805100c0006d80805100c0007da0805100c0008dc0805100c0009de0805100c000ae00805100c000be20805100c000ce40805100c000de60805100c000ee80805100c000fea08060101403c0032c9020c0000c902060101403c0032c9020c0001c902060101403c0032c9020c0002c902060101403c0032c9020c0003c902060001403c0032c9020c0004c90200ffffffff'
    ],
    received: ['94010100c902010c0010000040ec08000000010140ee08000000020240f008000000030340f208000000040440f40800000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f0000000000']
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.30',
    screen: 'inventory',
    firstRequest: -165,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 550 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 551 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 552 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 553 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 554 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 555 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 556 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 557 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 558 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 559 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 560 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 561 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 562 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 563 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 564 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 565 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 890, uuid: 'c749d32b-b2b6-158a-d07c-1c0c8a485e98', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101c9021c0dfa06404004017902ff7f02017902ff7f02017902ff7f02017902ff7f021302b703010000c69e97a70b0a000000000000000000009807040000000a000000000000000000004005100c0000cc0805100c0001ce0805100c0002d00805100c0003d20805100c0004d40805100c0005d60805100c0006d80805100c0007da0805100c0008dc0805100c0009de0805100c000ae00805100c000be20805100c000ce40805100c000de60805100c000ee80805100c000fea08060101403c0032c9020c0000c902060101403c0032c9020c0001c902060101403c0032c9020c0002c902060101403c0032c9020c0003c902060001403c0032c9020c0004c90200ffffffff'
    ],
    received: ['94010100c902010c0010000040ec08000000010140ee08000000020240f008000000030340f208000000040440f40800000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f0000000000']
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    screen: 'inventory',
    firstRequest: -139,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 477 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 478 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 479 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 480 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 481 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 482 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 483 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 484 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 485 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 486 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 487 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 488 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 492 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 1228, uuid: '9f4b6e6c-7f0e-f982-4963-5b645ebd3993', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010195021c0b0dcc0940040101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301001113020101156d696e6563726166743a686f6e65795f626c6f636b000100a3cfcbd3050a000000000000000000000101166d696e6563726166743a676c6173735f626f74746c65000400000a00000000000000000000400505100c0000dd0100000505100c0001de0100000505100c0002df0100000505100c0003e00100000505100c0004e10100000505100c0005e20100000505100c0006e30100000505100c0007e40100000505100c0008e50100000505100c0009e60100000505100c000ae70100000505100c000be80100000505100c000ce90100000505100c000dea0100000505100c000eeb0100000505100c000fec0100000606010101403c003275ffffff0c000075ffffff0606010101403c003275ffffff0c000175ffffff0606010101403c003275ffffff0c000275ffffff0606010101403c003275ffffff0c000375ffffff0606000101403c003275ffffff0c000475ffffff00ffffffff'
    ],
    received: ['9401010095020101010c00100000400101da070000000101400101dc070000000202400101de070000000303400101e0070000000404400101e207000000050500010000000006060001000000000707000100000000080800010000000009090001000000000a0a0001000000000b0b0001000000000c0c0001000000000d0d0001000000000e0e0001000000000f0f000100000000']
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'inventory',
    firstRequest: -141,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 478 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 479 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 480 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 481 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 482 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 483 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 484 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 485 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 486 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 487 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 488 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 493 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 1367, uuid: '02400930-8af6-c7ca-d33e-d6f7475f1fba', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010199021c0b0dd70a40040101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301001113020101156d696e6563726166743a686f6e65795f626c6f636b000100a3cfcbd3050a000000000000000000000101166d696e6563726166743a676c6173735f626f74746c65000400000a00000000000000000000400505100c0000de0100000505100c0001df0100000505100c0002e00100000505100c0003e10100000505100c0004e20100000505100c0005e30100000505100c0006e40100000505100c0007e50100000505100c0008e60100000505100c0009e70100000505100c000ae80100000505100c000be90100000505100c000cea0100000505100c000deb0100000505100c000eec0100000505100c000fed0100000606010101403c003273ffffff0c000073ffffff0606010101403c003273ffffff0c000173ffffff0606010101403c003273ffffff0c000273ffffff0606010101403c003273ffffff0c000373ffffff0606000101403c003273ffffff0c000473ffffff00ffffffff'
    ],
    received: ['94010100990201010c001000004001dc0700000001014001de0700000002024001e00700000003034001e20700000004044001e40700000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f0000000000']
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screen: 'inventory',
    firstRequest: -141,
    times: 64,
    given: [{ slot: 0, item: 'honey_bottle', count: 16, stackId: 478 }, { slot: 1, item: 'honey_bottle', count: 16, stackId: 479 }, { slot: 2, item: 'honey_bottle', count: 16, stackId: 480 }, { slot: 3, item: 'honey_bottle', count: 16, stackId: 481 }, { slot: 4, item: 'honey_bottle', count: 16, stackId: 482 }, { slot: 5, item: 'honey_bottle', count: 16, stackId: 483 }, { slot: 6, item: 'honey_bottle', count: 16, stackId: 484 }, { slot: 7, item: 'honey_bottle', count: 16, stackId: 485 }, { slot: 8, item: 'honey_bottle', count: 16, stackId: 486 }, { slot: 9, item: 'honey_bottle', count: 16, stackId: 487 }, { slot: 10, item: 'honey_bottle', count: 16, stackId: 488 }, { slot: 11, item: 'honey_bottle', count: 16, stackId: 489 }, { slot: 12, item: 'honey_bottle', count: 16, stackId: 490 }, { slot: 13, item: 'honey_bottle', count: 16, stackId: 491 }, { slot: 14, item: 'honey_bottle', count: 16, stackId: 492 }, { slot: 15, item: 'honey_bottle', count: 16, stackId: 493 }],
    recipe: { type: 'shaped', id: 'minecraft:honey_block', networkId: 4239, uuid: 'fe4822dc-bd66-9940-1ae8-a6fd78fc9f90', priority: 0, width: 2, height: 2, input: [{ item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }, { item: 'honey_bottle', metadata: 32767 }], output: [{ item: 'honey_block', count: 1, metadata: 0, blockRuntimeId: 1517479843 }, { item: 'glass_bottle', count: 4, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '93010199021c0b0d8f2140040101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301000101166d696e6563726166743a686f6e65795f626f74746c65feff0301001214020101156d696e6563726166743a686f6e65795f626c6f636b000100a3cfcbd3050a000000000000000000000101166d696e6563726166743a676c6173735f626f74746c65000400000a00000000000000000000400505100c0000de0100000505100c0001df0100000505100c0002e00100000505100c0003e10100000505100c0004e20100000505100c0005e30100000505100c0006e40100000505100c0007e50100000505100c0008e60100000505100c0009e70100000505100c000ae80100000505100c000be90100000505100c000cea0100000505100c000deb0100000505100c000eec0100000505100c000fed0100000606010101403c003273ffffff0c000073ffffff0606010101403c003273ffffff0c000173ffffff0606010101403c003273ffffff0c000273ffffff0606010101403c003273ffffff0c000373ffffff0606000101403c003273ffffff0c000473ffffff00ffffffff'
    ],
    received: ['94010100990201010c001000004001dc0700000001014001de0700000002024001e00700000003034001e20700000004044001e40700000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f0000000000']
  }
]

const CAKE_ALLS: readonly RecordedAutoCraft[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    screen: 'workbench',
    firstRequest: -141,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 405 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 406 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 407 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 408 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 409 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 410 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 418 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 18, item: 'sugar', count: 12, stackId: 424 }, { slot: 19, item: 'egg', count: 6, stackId: 426 }, { slot: 20, item: 'wheat', count: 18, stackId: 428 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 291, uuid: 'd944d051-2934-c018-54bc-df47051100ad', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002d944d0512934c01854bcdf47051100ad0001be060c00000000',
      '9301019902200aa3020e02be060200000000d00506000000000605010c00aa0605010c01ac0605010c02ae0605010c03b00605010c04b20605010c05b40605010c06b60605010c07b80605010c08ba0605010c09bc0605010c0abe0605010c0bc00605010c0cc20605010c0dc40605010c0ec60605010c0fc80605010c10ca0605010c11cc0605060c12d00605060c13d40605060c12990205060c14d80605060c14990205060c149902060101103b3299020c009902060101023b3299020c019902060001063b3299020c02990200'
    ],
    received: ['940101009902010c15000010da0600010102dc0600020206de060003030000000404000000050500000006060000000707000000080800000009090000000a0a0000000b0b0000000c0c0000000d0d0000000e0e0000000f0f00000010100000001111000000121200000013130000001414000000']
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    screen: 'workbench',
    firstRequest: -141,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 405 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 406 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 407 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 408 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 409 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 410 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 418 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 18, item: 'sugar', count: 12, stackId: 424 }, { slot: 19, item: 'egg', count: 6, stackId: 426 }, { slot: 20, item: 'wheat', count: 18, stackId: 428 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 291, uuid: '9b4d1a2f-4273-bb75-6a8c-61f7411440a2', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500029b4d1a2f4273bb756a8c61f7411440a20001be060c00000000',
      '9301019902200ba3020f02be060200000000d00506000000000605010c00aa0605010c01ac0605010c02ae0605010c03b00605010c04b20605010c05b40605010c06b60605010c07b80605010c08ba0605010c09bc0605010c0abe0605010c0bc00605010c0cc20605010c0dc40605010c0ec60605010c0fc80605010c10ca0605010c11cc0605060c12d00605060c13d40605060c12990205060c14d80605060c14990205060c149902060101103b3299020c009902060101023b3299020c019902060001063b3299020c02990200'
    ],
    received: ['940101009902010c15000010da060000010102dc060000020206de0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    screen: 'workbench',
    firstRequest: -115,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 334 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 335 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 336 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 337 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 338 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 339 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 340 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 341 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 342 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 343 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 344 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 345 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 346 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 18, item: 'sugar', count: 12, stackId: 353 }, { slot: 19, item: 'egg', count: 6, stackId: 355 }, { slot: 20, item: 'wheat', count: 18, stackId: 357 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 291, uuid: 'e74de98d-7aae-881b-a2f2-7801e49227ab', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002e74de98d7aae881ba2f27801e49227ab0001be0606000000000a00000000000000000000',
      '930101e501200ba3020f02be06010000000a00000000000000000000d005030000000a000000000000000000000605010c009c0505010c019e0505010c02a00505010c03a20505010c04a40505010c05a60505010c06a80505010c07aa0505010c08ac0505010c09ae0505010c0ab00505010c0bb20505010c0cb40505010c0db60505010c0eb80505010c0fba0505010c10bc0505010c11be0505060c12c20505060c13c60505060c12e50105060c14ca0505060c14e50105060c14e501060101103b32e5010c00e501060101023b32e5010c01e501060001063b32e5010c02e50100'
    ],
    received: ['94010100e501010c15000010cc050000010102ce050000020206d00500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    screen: 'workbench',
    firstRequest: -117,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 352 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 353 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 354 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 355 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 356 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 357 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 358 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 359 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 360 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 361 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 362 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 363 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 364 }, { slot: 18, item: 'sugar', count: 12, stackId: 366 }, { slot: 19, item: 'egg', count: 6, stackId: 368 }, { slot: 20, item: 'wheat', count: 18, stackId: 370 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 450, uuid: '424474d8-bd8c-b415-1622-8dfa739aa482', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002424474d8bd8cb41516228dfa739aa4820001c20606000000000a00000000000000000000',
      '930101e901200bc2030f02c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00b60505010c01b80505010c02ba0505010c03bc0505010c04be0505010c05c00505010c06c20505010c07c40505010c08c60505010c09c80505010c0aca0505010c0bcc0505010c0cce0505010c0dd00505010c0ed20505010c0fd40505010c10d60505010c11d80505060c12dc0505060c13e00505060c12e90105060c14e40505060c14e90105060c14e901060101103b32e9010c00e901060101023b32e9010c01e901060001063b32e9010c02e90100'
    ],
    received: ['94010100e901010c15000010e6050000010102e8050000020206ea0500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    screen: 'workbench',
    firstRequest: -117,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 352 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 353 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 354 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 355 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 356 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 357 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 358 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 359 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 360 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 361 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 362 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 363 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 364 }, { slot: 18, item: 'sugar', count: 12, stackId: 366 }, { slot: 19, item: 'egg', count: 6, stackId: 368 }, { slot: 20, item: 'wheat', count: 18, stackId: 370 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 471, uuid: '4c4a1ae6-06a0-1b33-6768-041220bab884', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500024c4a1ae606a01b336768041220bab8840001c20606000000000a00000000000000000000',
      '930101e901200bd703060f02c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00b60505010c01b80505010c02ba0505010c03bc0505010c04be0505010c05c00505010c06c20505010c07c40505010c08c60505010c09c80505010c0aca0505010c0bcc0505010c0cce0505010c0dd00505010c0ed20505010c0fd40505010c10d60505010c11d80505060c12dc0505060c13e00505060c12e90105060c14e40505060c14e90105060c14e901060101103b32e9010c00e901060101023b32e9010c01e901060001063b32e9010c02e90100'
    ],
    received: ['94010100e901010c15000010e6050000010102e8050000020206ea0500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    screen: 'workbench',
    firstRequest: -117,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 352 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 353 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 354 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 355 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 356 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 357 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 358 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 359 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 360 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 361 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 362 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 363 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 364 }, { slot: 18, item: 'sugar', count: 12, stackId: 366 }, { slot: 19, item: 'egg', count: 6, stackId: 368 }, { slot: 20, item: 'wheat', count: 18, stackId: 370 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 471, uuid: 'fb4abf5f-3715-9019-d104-947c1d00adb4', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002fb4abf5f37159019d104947c1d00adb40001c20606000000000a00000000000000000000',
      '930101e901200bd703061102c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00b60505010c01b80505010c02ba0505010c03bc0505010c04be0505010c05c00505010c06c20505010c07c40505010c08c60505010c09c80505010c0aca0505010c0bcc0505010c0cce0505010c0dd00505010c0ed20505010c0fd40505010c10d60505010c11d80505060c12dc0505060c13e00505060c12e90105060c14e40505060c14e90105060c14e901060101103b32e9010c00e901060101023b32e9010c01e901060001063b32e9010c02e90100'
    ],
    received: ['94010100e901010c15000010e6050000010102e8050000020206ea0500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.21',
    screen: 'workbench',
    firstRequest: -117,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 352 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 353 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 354 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 355 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 356 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 357 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 358 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 359 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 360 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 361 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 362 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 363 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 364 }, { slot: 18, item: 'sugar', count: 12, stackId: 366 }, { slot: 19, item: 'egg', count: 6, stackId: 368 }, { slot: 20, item: 'wheat', count: 18, stackId: 370 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 480, uuid: '5b47393a-f904-a2d8-6057-312ebb0034a6', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500025b47393af904a2d86057312ebb0034a60001c20606000000000a00000000000000000000',
      '930101e901200de003061302c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00b60505010c01b80505010c02ba0505010c03bc0505010c04be0505010c05c00505010c06c20505010c07c40505010c08c60505010c09c80505010c0aca0505010c0bcc0505010c0cce0505010c0dd00505010c0ed20505010c0fd40505010c10d60505010c11d80505060c12dc0505060c13e00505060c12e90105060c14e40505060c14e90105060c14e901060101103b32e9010c00e901060101023b32e9010c01e901060001063b32e9010c02e90100'
    ],
    received: ['94010100e901010c15000010e6050000010102e8050000020206ea0500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.30',
    screen: 'workbench',
    firstRequest: -115,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 342 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 343 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 344 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 345 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 346 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 347 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 348 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 349 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 350 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 351 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 352 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 353 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 354 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 355 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 356 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 357 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 358 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 359 }, { slot: 18, item: 'sugar', count: 12, stackId: 361 }, { slot: 19, item: 'egg', count: 6, stackId: 363 }, { slot: 20, item: 'wheat', count: 18, stackId: 365 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 567, uuid: '2b4048ba-0543-2ba6-d807-1fde01a043a7', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500022b4048ba05432ba6d8071fde01a043a70001c20606000000000a00000000000000000000',
      '930101e501200db704061302c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00ac0505010c01ae0505010c02b00505010c03b20505010c04b40505010c05b60505010c06b80505010c07ba0505010c08bc0505010c09be0505010c0ac00505010c0bc20505010c0cc40505010c0dc60505010c0ec80505010c0fca0505010c10cc0505010c11ce0505060c12d20505060c13d60505060c12e50105060c14da0505060c14e50105060c14e501060101103b32e5010c00e501060101023b32e5010c01e501060001063b32e5010c02e50100ffffffff'
    ],
    received: ['94010100e501010c15000010dc050000010102de050000020206e00500000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.40',
    to: 'bedrock_1.19.40',
    screen: 'workbench',
    firstRequest: -143,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 429 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 430 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 431 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 432 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 433 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 434 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 435 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 436 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 437 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 438 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 439 }, { slot: 18, item: 'sugar', count: 12, stackId: 441 }, { slot: 19, item: 'egg', count: 6, stackId: 443 }, { slot: 20, item: 'wheat', count: 18, stackId: 445 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 603, uuid: '2a46eb8f-b1aa-65c0-ae35-e49d34f1c9ba', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500022a46eb8fb1aa65c0ae35e49d34f1c9ba0001c20606000000000a00000000000000000000',
      '9301019d02200ddb04060901690100000201690100000201690100000201a001ff7f02018601ff7f0201a001ff7f02014e01ff7f02014e01ff7f02014e01ff7f021302c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00cc0605010c01ce0605010c02d00605010c03d20605010c04d40605010c05d60605010c06d80605010c07da0605010c08dc0605010c09de0605010c0ae00605010c0be20605010c0ce40605010c0de60605010c0ee80605010c0fea0605010c10ec0605010c11ee0605060c12f20605060c13f60605060c129d0205060c14fa0605060c149d0205060c149d02060101103b329d020c009d02060101023b329d020c019d02060001063b329d020c029d0200ffffffff'
    ],
    received: ['940101009d02010c15000010fc060000010102fe060000020206800700000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.63',
    screen: 'workbench',
    firstRequest: -135,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 402 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 403 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 404 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 405 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 406 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 407 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 408 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 409 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 410 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 18, item: 'sugar', count: 12, stackId: 419 }, { slot: 19, item: 'egg', count: 6, stackId: 421 }, { slot: 20, item: 'wheat', count: 18, stackId: 423 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 603, uuid: 'bb4162d2-43eb-eb51-798b-b6da78b6d783', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002bb4162d243ebeb51798bb6da78b6d7830001c20606000000000a00000000000000000000',
      '9301018d02200ddb04060901690100000201690100000201690100000201a001ff7f02018601ff7f0201a001ff7f02014e01ff7f02014e01ff7f02014e01ff7f021302c206010000000a00000000000000000000d005030000000a000000000000000000000605010c00a00605010c01a20605010c02a40605010c03a60605010c04a80605010c05aa0605010c06ac0605010c07ae0605010c08b00605010c09b20605010c0ab40605010c0bb60605010c0cb80605010c0dba0605010c0ebc0605010c0fbe0605010c10c00605010c11c20605060c12c60605060c13ca0605060c128d0205060c14ce0605060c148d0205060c148d02060101103c328d020c008d02060101023c328d020c018d02060001063c328d020c028d0200ffffffff'
    ],
    received: ['940101008d02010c15000010d0060000010102d2060000020206d40600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    screen: 'workbench',
    firstRequest: -135,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 396 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 397 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 398 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 399 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 402 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 403 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 404 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 405 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 406 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 407 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 408 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 409 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 410 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 18, item: 'sugar', count: 12, stackId: 415 }, { slot: 19, item: 'egg', count: 6, stackId: 417 }, { slot: 20, item: 'wheat', count: 18, stackId: 419 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 603, uuid: '9c41fb1d-df90-855c-8fcf-c85e607daaa9', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '3500029c41fb1ddf90855c8fcfc85e607daaa90001c40606000000000a00000000000000000000',
      '9301018d02200ddb040609016a01000002016a01000002016a0100000201a101ff7f02018701ff7f0201a101ff7f02014f01ff7f02014f01ff7f02014f01ff7f021302c406010000000a00000000000000000000d205030000000a000000000000000000000605010c00980605010c019a0605010c029c0605010c039e0605010c04a00605010c05a20605010c06a40605010c07a60605010c08a80605010c09aa0605010c0aac0605010c0bae0605010c0cb00605010c0db20605010c0eb40605010c0fb60605010c10b80605010c11ba0605060c12be0605060c13c20605060c128d0205060c14c60605060c148d0205060c148d02060101103c328d020c008d02060101023c328d020c018d02060001063c328d020c028d0200ffffffff'
    ],
    received: ['940101008d02010c15000010c8060000010102ca060000020206cc0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    screen: 'workbench',
    firstRequest: -143,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 396 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 397 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 398 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 399 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 402 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 403 }, { slot: 18, item: 'sugar', count: 12, stackId: 405 }, { slot: 19, item: 'egg', count: 6, stackId: 407 }, { slot: 20, item: 'wheat', count: 18, stackId: 409 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 677, uuid: '144475a0-71fa-9936-8dc1-1c44ae38f39d', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '350002144475a071fa99368dc11c44ae38f39d0001c60606000000000a00000000000000000000',
      '9301019d02200da5050609016b01000002016b01000002016b0100000201a201ff7f02018801ff7f0201a201ff7f02015001ff7f02015001ff7f02015001ff7f021302c606010000000a00000000000000000000d405030000000a000000000000000000000605010c00840605010c01860605010c02880605010c038a0605010c048c0605010c058e0605010c06900605010c07920605010c08940605010c09960605010c0a980605010c0b9a0605010c0c9c0605010c0d9e0605010c0ea00605010c0fa20605010c10a40605010c11a60605060c12aa0605060c13ae0605060c129d0205060c14b20605060c149d0205060c149d02060101103c329d020c009d02060101023c329d020c019d02060001063c329d020c029d0200ffffffff'
    ],
    received: ['940101009d02010c15000010b4060000010102b6060000020206b80600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.61',
    screen: 'workbench',
    firstRequest: -139,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 384 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 396 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 397 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 398 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 399 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 18, item: 'sugar', count: 12, stackId: 403 }, { slot: 19, item: 'egg', count: 6, stackId: 405 }, { slot: 20, item: 'wheat', count: 18, stackId: 407 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 176, uuid: '864d8e4f-6eb3-be3e-8079-1f6476293b8a', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019502200db0010609016c01000002016c01000002016c0100000201a301ff7f02018901ff7f0201a301ff7f02015101ff7f02015101ff7f02015101ff7f021302c806010000000a00000000000000000000d605030000000a000000000000000000000605010c00800605010c01820605010c02840605010c03860605010c04880605010c058a0605010c068c0605010c078e0605010c08900605010c09920605010c0a940605010c0b960605010c0c980605010c0d9a0605010c0e9c0605010c0f9e0605010c10a00605010c11a20605060c12a60605060c13aa0605060c12950205060c14ae0605060c14950205060c149502060101103c3295020c009502060101023c3295020c019502060001063c3295020c02950200ffffffff'
    ],
    received: ['940101009502010c15000010b0060000010102b2060000020206b40600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.20.72.1
    from: 'bedrock_1.20.71',
    to: 'bedrock_1.20.71',
    screen: 'workbench',
    firstRequest: -139,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 384 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 396 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 397 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 398 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 399 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 18, item: 'sugar', count: 12, stackId: 403 }, { slot: 19, item: 'egg', count: 6, stackId: 405 }, { slot: 20, item: 'wheat', count: 18, stackId: 407 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 192, uuid: '0242af1d-16f7-e42c-5022-06ca2200ce8a', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019502200dc0010609016c01000002016c01000002016c0100000201a401ff7f02018a01ff7f0201a401ff7f02015101ff7f02015101ff7f02015101ff7f021302ca06010000000a00000000000000000000d605030000000a000000000000000000000605010c00800605010c01820605010c02840605010c03860605010c04880605010c058a0605010c068c0605010c078e0605010c08900605010c09920605010c0a940605010c0b960605010c0c980605010c0d9a0605010c0e9c0605010c0f9e0605010c10a00605010c11a20605060c12a60605060c13aa0605060c12950205060c14ae0605060c14950205060c149502060101103c3295020c009502060101023c3295020c019502060001063c3295020c02950200ffffffff'
    ],
    received: ['940101009502010c15000010b0060000010102b2060000020206b40600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.20.80.5
    from: 'bedrock_1.20.80',
    to: 'bedrock_1.20.80',
    screen: 'workbench',
    firstRequest: -139,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 396 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 397 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 398 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 399 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 400 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 401 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 402 }, { slot: 18, item: 'sugar', count: 12, stackId: 404 }, { slot: 19, item: 'egg', count: 6, stackId: 406 }, { slot: 20, item: 'wheat', count: 18, stackId: 408 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 215, uuid: 'b1411813-fac3-80b9-bcf2-fad8eda24f89', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301019502200dd7010609016d01000002016d01000002016d0100000201a501ff7f02018b01ff7f0201a501ff7f02015201ff7f02015201ff7f02015201ff7f021302cc06010000000a00000000000000000000d805030000000a000000000000000000000605010c00820605010c01840605010c02860605010c03880605010c048a0605010c058c0605010c068e0605010c07900605010c08920605010c09940605010c0a960605010c0b980605010c0c9a0605010c0d9c0605010c0e9e0605010c0fa00605010c10a20605010c11a40605060c12a80605060c13ac0605060c12950205060c14b00605060c14950205060c149502060101103c3295020c009502060101023c3295020c019502060001063c3295020c02950200ffffffff'
    ],
    received: ['940101009502010c15000010b2060000010102b4060000020206b60600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    screen: 'workbench',
    firstRequest: -147,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 418 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 18, item: 'sugar', count: 12, stackId: 430 }, { slot: 19, item: 'egg', count: 6, stackId: 432 }, { slot: 20, item: 'wheat', count: 18, stackId: 434 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 355, uuid: '95461549-e323-d165-3220-ff9550418e99', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a502200de302060901700100000201700100000201700100000201a801ff7f02018e01ff7f0201a801ff7f02015501ff7f02015501ff7f02015501ff7f021302d206010000000a00000000000000000000de05030000000a000000000000000000000605010c00b60605010c01b80605010c02ba0605010c03bc0605010c04be0605010c05c00605010c06c20605010c07c40605010c08c60605010c09c80605010c0aca0605010c0bcc0605010c0cce0605010c0dd00605010c0ed20605010c0fd40605010c10d60605010c11d80605060c12dc0605060c13e00605060c12a50205060c14e40605060c14a50205060c14a502060101103c32a5020c00a502060101023c32a5020c01a502060001063c32a5020c02a50200ffffffff'
    ],
    received: ['94010100a502010c15000010e6060000010102e8060000020206ea0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    screen: 'workbench',
    firstRequest: -147,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 418 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 18, item: 'sugar', count: 12, stackId: 430 }, { slot: 19, item: 'egg', count: 6, stackId: 432 }, { slot: 20, item: 'wheat', count: 18, stackId: 434 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 408, uuid: '844c6517-30e6-28bf-bd2a-efcfd99bb29c', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a502200d980306060901710100000201710100000201710100000201a901ff7f02018f01ff7f0201a901ff7f02015601ff7f02015601ff7f02015601ff7f021302d406010000000a00000000000000000000e005030000000a000000000000000000000605010c0000000000b60605010c0000000001b80605010c0000000002ba0605010c0000000003bc0605010c0000000004be0605010c0000000005c00605010c0000000006c20605010c0000000007c40605010c0000000008c60605010c0000000009c80605010c000000000aca0605010c000000000bcc0605010c000000000cce0605010c000000000dd00605010c000000000ed20605010c000000000fd40605010c0000000010d60605010c0000000011d80605060c0000000012dc0605060c0000000013e00605060c0000000012a50205060c0000000014e40605060c0000000014a50205060c0000000014a502060101103c0000000032a5020c0000000000a502060101023c0000000032a5020c0000000001a502060001063c0000000032a5020c0000000002a50200ffffffff'
    ],
    received: ['94010100a502010c0000000015000010e6060000010102e8060000020206ea0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    screen: 'workbench',
    firstRequest: -147,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 411 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 412 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 413 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 414 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 415 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 416 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 417 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 418 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 18, item: 'sugar', count: 12, stackId: 430 }, { slot: 19, item: 'egg', count: 6, stackId: 432 }, { slot: 20, item: 'wheat', count: 18, stackId: 434 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 433, uuid: '934744d0-1531-9190-d7f8-b2ec5008d9b6', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a502200db10306060901710100000201710100000201710100000201a901ff7f02018f01ff7f0201a901ff7f02015601ff7f02015601ff7f02015601ff7f021302d406010000000a00000000000000000000e005030000000a000000000000000000000605010c0000b60605010c0001b80605010c0002ba0605010c0003bc0605010c0004be0605010c0005c00605010c0006c20605010c0007c40605010c0008c60605010c0009c80605010c000aca0605010c000bcc0605010c000cce0605010c000dd00605010c000ed20605010c000fd40605010c0010d60605010c0011d80605060c0012dc0605060c0013e00605060c0012a50205060c0014e40605060c0014a50205060c0014a502060101103c0032a5020c0000a502060101023c0032a5020c0001a502060001063c0032a5020c0002a50200ffffffff'
    ],
    received: ['94010100a502010c0015000010e6060000010102e8060000020206ea0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.21.43.1
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    screen: 'workbench',
    firstRequest: -147,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 429 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 430 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 431 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 432 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 433 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 434 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 435 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 436 }, { slot: 18, item: 'sugar', count: 12, stackId: 438 }, { slot: 19, item: 'egg', count: 6, stackId: 440 }, { slot: 20, item: 'wheat', count: 18, stackId: 442 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 577, uuid: '2d4eea97-1db3-0d1f-54f0-83d6dc51cba9', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a502200dc10406060901820100000201820100000201820100000201ba01ff7f0201a001ff7f0201ba01ff7f02016701ff7f02016701ff7f02016701ff7f021302f606010000000a000000000000000000008206030000000a000000000000000000000605010c0000c60605010c0001c80605010c0002ca0605010c0003cc0605010c0004ce0605010c0005d00605010c0006d20605010c0007d40605010c0008d60605010c0009d80605010c000ada0605010c000bdc0605010c000cde0605010c000de00605010c000ee20605010c000fe40605010c0010e60605010c0011e80605060c0012ec0605060c0013f00605060c0012a50205060c0014f40605060c0014a50205060c0014a502060101103c0032a5020c0000a502060101023c0032a5020c0001a502060001063c0032a5020c0002a50200ffffffff'
    ],
    received: ['94010100a502010c0015000010f6060000010102f8060000020206fa0600000303000000000404000000000505000000000606000000000707000000000808000000000909000000000a0a000000000b0b000000000c0c000000000d0d000000000e0e000000000f0f00000000101000000000111100000000121200000000131300000000141400000000']
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.111',
    screen: 'workbench',
    firstRequest: -147,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 419 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 420 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 421 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 422 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 423 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 424 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 425 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 426 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 427 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 428 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 429 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 430 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 431 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 432 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 433 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 434 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 435 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 436 }, { slot: 18, item: 'sugar', count: 12, stackId: 438 }, { slot: 19, item: 'egg', count: 6, stackId: 440 }, { slot: 20, item: 'wheat', count: 18, stackId: 442 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 618, uuid: 'd64f52f5-f914-4626-bd87-c1d3aeb3c1b9', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { item: 'egg', metadata: 32767 }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101a502200dea0406060901820100000201820100000201820100000201ba01ff7f0201a001ff7f0201ba01ff7f02016701ff7f02016701ff7f02016701ff7f021302f606010000000a000000000000000000008206030000000a000000000000000000000605010c0000c60605010c0001c80605010c0002ca0605010c0003cc0605010c0004ce0605010c0005d00605010c0006d20605010c0007d40605010c0008d60605010c0009d80605010c000ada0605010c000bdc0605010c000cde0605010c000de00605010c000ee20605010c000fe40605010c0010e60605010c0011e80605060c0012ec0605060c0013f00605060c0012a50205060c0014f40605060c0014a50205060c0014a502060101103c0032a5020c0000a502060101023c0032a5020c0001a502060001063c0032a5020c0002a50200ffffffff'
    ],
    received: ['94010100a502010c0015000010f606000000010102f806000000020206fa06000000030300000000000404000000000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f00000000001010000000000011110000000000121200000000001313000000000014140000000000']
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    screen: 'workbench',
    firstRequest: -151,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 435 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 436 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 437 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 438 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 439 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 440 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 441 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 442 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 443 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 444 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 445 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 446 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 447 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 448 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 449 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 450 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 451 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 452 }, { slot: 18, item: 'sugar', count: 12, stackId: 454 }, { slot: 19, item: 'blue_egg', count: 6, stackId: 456 }, { slot: 20, item: 'wheat', count: 18, stackId: 458 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 59, uuid: '70443f92-fdd3-8bb6-a68a-23606613338c', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101ad02200d3b06060901820100000201820100000201820100000201b901ff7f0201e902ff7f0201b901ff7f02016701ff7f02016701ff7f02016701ff7f021302f406010000000a000000000000000000008206030000000a000000000000000000000605010c0000e60605010c0001e80605010c0002ea0605010c0003ec0605010c0004ee0605010c0005f00605010c0006f20605010c0007f40605010c0008f60605010c0009f80605010c000afa0605010c000bfc0605010c000cfe0605010c000d800705010c000e820705010c000f840705010c0010860705010c0011880705060c00128c0705060c0013900705060c0012ad0205060c0014940705060c0014ad0205060c0014ad02060101103c0032ad020c0000ad02060101023c0032ad020c0001ad02060001063c0032ad020c0002ad0200ffffffff'
    ],
    received: ['94010100ad02010c0015000010960700000001010298070000000202069a07000000030300000000000404000000000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f00000000001010000000000011110000000000121200000000001313000000000014140000000000']
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.30',
    screen: 'workbench',
    firstRequest: -151,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 435 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 436 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 437 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 438 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 439 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 440 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 441 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 442 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 443 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 444 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 445 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 446 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 447 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 448 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 449 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 450 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 451 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 452 }, { slot: 18, item: 'sugar', count: 12, stackId: 454 }, { slot: 19, item: 'blue_egg', count: 6, stackId: 456 }, { slot: 20, item: 'wheat', count: 18, stackId: 458 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 68, uuid: '654aa243-c969-dc0a-d80b-ea48c118e09b', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '930101ad02200d4406060901890100000201890100000201890100000201c001ff7f0201f102ff7f0201c001ff7f02016e01ff7f02016e01ff7f02016e01ff7f0213028207010000000a000000000000000000009006030000000a000000000000000000000605010c0000e60605010c0001e80605010c0002ea0605010c0003ec0605010c0004ee0605010c0005f00605010c0006f20605010c0007f40605010c0008f60605010c0009f80605010c000afa0605010c000bfc0605010c000cfe0605010c000d800705010c000e820705010c000f840705010c0010860705010c0011880705060c00128c0705060c0013900705060c0012ad0205060c0014940705060c0014ad0205060c0014ad02060101103c0032ad020c0000ad02060101023c0032ad020c0001ad02060001063c0032ad020c0002ad0200ffffffff'
    ],
    received: ['94010100ad02010c0015000010960700000001010298070000000202069a07000000030300000000000404000000000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f00000000001010000000000011110000000000121200000000001313000000000014140000000000']
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    screen: 'workbench',
    firstRequest: -131,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 377 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 378 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 379 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 380 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 381 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 382 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 383 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 384 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 18, item: 'sugar', count: 12, stackId: 396 }, { slot: 19, item: 'blue_egg', count: 6, stackId: 398 }, { slot: 20, item: 'wheat', count: 18, stackId: 400 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 390, uuid: 'e1463ae0-c41b-032c-efb9-4e8c57dc05b0', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301018502200b0d860306090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010011130201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000060505010c0000790100000505010c00017a0100000505010c00027b0100000505010c00037c0100000505010c00047d0100000505010c00057e0100000505010c00067f0100000505010c0007800100000505010c0008810100000505010c0009820100000505010c000a830100000505010c000b840100000505010c000c850100000505010c000d860100000505010c000e870100000505010c000f880100000505010c0010890100000505010c00118a0100000505060c00128c0100000505060c00138e0100000505060c00127dffffff0505060c0014900100000505060c00147dffffff0505060c00147dffffff0606010101103c00327dffffff0c00007dffffff0606010101023c00327dffffff0c00017dffffff0606000101063c00327dffffff0c00027dffffff00ffffffff'
    ],
    received: ['9401010085020101010c00150000100101a2060000000101020101a4060000000202060101a60600000003030001000000000404000100000000050500010000000006060001000000000707000100000000080800010000000009090001000000000a0a0001000000000b0b0001000000000c0c0001000000000d0d0001000000000e0e0001000000000f0f00010000000010100001000000001111000100000000121200010000000013130001000000001414000100000000']
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    screen: 'workbench',
    firstRequest: -133,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 378 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 379 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 380 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 381 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 382 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 383 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 384 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 18, item: 'sugar', count: 12, stackId: 397 }, { slot: 19, item: 'blue_egg', count: 6, stackId: 399 }, { slot: 20, item: 'wheat', count: 18, stackId: 401 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 543, uuid: '884d7389-dfce-8790-9e33-461c1a57b4bf', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301018902200b0d9f0406090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010011130201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000060505010c00007a0100000505010c00017b0100000505010c00027c0100000505010c00037d0100000505010c00047e0100000505010c00057f0100000505010c0006800100000505010c0007810100000505010c0008820100000505010c0009830100000505010c000a840100000505010c000b850100000505010c000c860100000505010c000d870100000505010c000e880100000505010c000f890100000505010c00108a0100000505010c00118b0100000505060c00128d0100000505060c00138f0100000505060c00127bffffff0505060c0014910100000505060c00147bffffff0505060c00147bffffff0606010101103c00327bffffff0c00007bffffff0606010101023c00327bffffff0c00017bffffff0606000101063c00327bffffff0c00027bffffff00ffffffff'
    ],
    received: ['94010100890201010c001500001001a40600000001010201a60600000002020601a806000000030300000000000404000000000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f00000000001010000000000011110000000000121200000000001313000000000014140000000000']
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screen: 'workbench',
    firstRequest: -133,
    times: 6,
    given: [{ slot: 0, item: 'milk_bucket', count: 1, stackId: 378 }, { slot: 1, item: 'milk_bucket', count: 1, stackId: 379 }, { slot: 2, item: 'milk_bucket', count: 1, stackId: 380 }, { slot: 3, item: 'milk_bucket', count: 1, stackId: 381 }, { slot: 4, item: 'milk_bucket', count: 1, stackId: 382 }, { slot: 5, item: 'milk_bucket', count: 1, stackId: 383 }, { slot: 6, item: 'milk_bucket', count: 1, stackId: 384 }, { slot: 7, item: 'milk_bucket', count: 1, stackId: 385 }, { slot: 8, item: 'milk_bucket', count: 1, stackId: 386 }, { slot: 9, item: 'milk_bucket', count: 1, stackId: 387 }, { slot: 10, item: 'milk_bucket', count: 1, stackId: 388 }, { slot: 11, item: 'milk_bucket', count: 1, stackId: 389 }, { slot: 12, item: 'milk_bucket', count: 1, stackId: 390 }, { slot: 13, item: 'milk_bucket', count: 1, stackId: 391 }, { slot: 14, item: 'milk_bucket', count: 1, stackId: 392 }, { slot: 15, item: 'milk_bucket', count: 1, stackId: 393 }, { slot: 16, item: 'milk_bucket', count: 1, stackId: 394 }, { slot: 17, item: 'milk_bucket', count: 1, stackId: 395 }, { slot: 18, item: 'sugar', count: 12, stackId: 397 }, { slot: 19, item: 'blue_egg', count: 6, stackId: 399 }, { slot: 20, item: 'wheat', count: 18, stackId: 401 }],
    recipe: { type: 'shaped', id: 'minecraft:cake', networkId: 3415, uuid: '6e417620-e231-a2f0-07e1-0d73048a209f', priority: 0, width: 3, height: 3, input: [{ item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'milk_bucket', metadata: 0 }, { item: 'sugar', metadata: 32767 }, { tag: 'minecraft:egg' }, { item: 'sugar', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }, { item: 'wheat', metadata: 32767 }], output: [{ item: 'cake', count: 1, metadata: 0, blockRuntimeId: 0 }, { item: 'bucket', count: 3, metadata: 0, blockRuntimeId: 0 }] },
    sent: [
      '9301018902200b0dd71a06090101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b65740001000101156d696e6563726166743a6d696c6b5f6275636b657400010001010f6d696e6563726166743a7375676172feff0301000101126d696e6563726166743a626c75655f65676700010001010f6d696e6563726166743a7375676172feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010001010f6d696e6563726166743a7768656174feff03010012140201010e6d696e6563726166743a63616b65000100000a000000000000000000000101106d696e6563726166743a6275636b6574000300000a00000000000000000000060505010c00007a0100000505010c00017b0100000505010c00027c0100000505010c00037d0100000505010c00047e0100000505010c00057f0100000505010c0006800100000505010c0007810100000505010c0008820100000505010c0009830100000505010c000a840100000505010c000b850100000505010c000c860100000505010c000d870100000505010c000e880100000505010c000f890100000505010c00108a0100000505010c00118b0100000505060c00128d0100000505060c00138f0100000505060c00127bffffff0505060c0014910100000505060c00147bffffff0505060c00147bffffff0606010101103c00327bffffff0c00007bffffff0606010101023c00327bffffff0c00017bffffff0606000101063c00327bffffff0c00027bffffff00ffffffff'
    ],
    received: ['94010100890201010c001500001001a40600000001010201a60600000002020601a806000000030300000000000404000000000005050000000000060600000000000707000000000008080000000000090900000000000a0a00000000000b0b00000000000c0c00000000000d0d00000000000e0e00000000000f0f00000000001010000000000011110000000000121200000000001313000000000014140000000000']
  }
]

interface RecordedRocket {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackIds: readonly [paper: number, gunpowder: number]
  networkId: number
  uuid: string
  segments: ReadonlyArray<{ sent: readonly string[], received: readonly string[] }>
}

const ROCKET_FLIGHT = Object.freeze({ type: 'compound', name: '', value: { Fireworks: { type: 'compound', value: { Explosions: { type: 'list', value: { type: 'end', value: [] } }, Flight: { type: 'byte', value: 1 } } } } })

const ROCKETS: readonly RecordedRocket[] = [
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.30',
    firstRequest: -1383,
    stackIds: [1343, 1345],
    networkId: 2031,
    uuid: '504689e1-2d6f-18f0-726c-d6facd33a0bf',
    segments: [
      {
        sent: [
          '930102cd150101010c00fe140d1c0000d1150101010c0182150d1d0000'
        ],
        received: ['94010200cd15020c010000000000000d011c1c01fe14000000d115020c010101000000000d011d1d0182150000']
      },
      {
        sent: [
          '350000504689e12d6f18f0726cd6facd33a0bf00018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101d515050aef0f0f018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfe1405010d1d821501033b32d5150c000000'
        ],
        received: ['94010100d515020d021c1c000000001d1d000000000c0100000384150000']
      }
    ]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    firstRequest: -1383,
    stackIds: [1343, 1345],
    networkId: 2052,
    uuid: '1f431de1-e3ef-b8d3-c553-208dc1eb158d',
    segments: [
      {
        sent: [
          '930102cd150101010c00fe140d1c0000d1150101010c0182150d1d0000'
        ],
        received: ['94010200cd15020c010000000000000d011c1c01fe14000000d115020c010101000000000d011d1d0182150000']
      },
      {
        sent: [
          '3500001f431de1e3efb8d3c553208dc1eb158d00018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101d515050a841011018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfe1405010d1d821501033b32d5150c000000'
        ],
        received: ['94010100d515020d021c1c000000001d1d000000000c0100000384150000']
      }
    ]
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.11',
    firstRequest: -1383,
    stackIds: [1343, 1345],
    networkId: 2061,
    uuid: '05445a69-6413-1466-738f-f67286bb2f9d',
    segments: [
      {
        sent: [
          '930102cd150101010c00fe140d1c0000d1150101010c0182150d1d0000'
        ],
        received: ['94010200cd15020c010000000000000d011c1c01fe14000000d115020c010101000000000d011d1d0182150000']
      },
      {
        sent: [
          '35000005445a6964131466738ff67286bb2f9d00018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101d515050c8d1013018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfe1405010d1d821501033b32d5150c000000'
        ],
        received: ['94010100d515020d021c1c000000001d1d000000000c0100000384150000']
      }
    ]
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.19.21',
    firstRequest: -1383,
    stackIds: [1343, 1345],
    networkId: 2061,
    uuid: 'ad4393cc-5a17-1a64-aff4-7c962910a998',
    segments: [
      {
        sent: [
          '930102cd150101010c00fe140d1c0000d1150101010c0182150d1d0000'
        ],
        received: ['94010200cd15020c010000000000000d011c1c01fe14000000d115020c010101000000000d011d1d0182150000']
      },
      {
        sent: [
          '350000ad4393cc5a171a64aff47c962910a99800018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101d515050c8d1013018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfe1405010d1d821501033b32d51521010000'
        ],
        received: ['94010100d515020d021c1c000000001d1d00000000210101010384150000']
      }
    ]
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -1357,
    stackIds: [1318, 1320],
    networkId: 2161,
    uuid: 'f74b301d-10c3-d004-fc98-45155e6d9e99',
    segments: [
      {
        sent: [
          '93010299150101010c00cc140d1c0000ffffffff9d150101010c01d0140d1d0000ffffffff'
        ],
        received: ['940102009915020c010000000000000d011c1c01cc140000009d15020c010101000000000d011d1d01d0140000']
      },
      {
        sent: [
          '350000f74b301d10c3d004fc9845155e6d9e9900018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101a115050cf11013018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ccc1405010d1dd01401033b32a11521010000ffffffff'
        ],
        received: ['94010100a115020d021c1c000000001d1d000000002101010103d2140000']
      }
    ]
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.50',
    firstRequest: -1681,
    stackIds: [1540, 1542],
    networkId: 2139,
    uuid: '9541e242-debe-90d3-7650-05ef0b987a82',
    segments: [
      {
        sent: [
          '930102a11a0101010c0088180d1c0000ffffffffa51a0101010c018c180d1d0000ffffffff'
        ],
        received: ['94010200a11a020c010000000000000d011c1c018818000000a51a020c010101000000000d011d1d018c180000']
      },
      {
        sent: [
          '3500009541e242debe90d3765005ef0b987a8200018e08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101a91a050cdb1013018e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c881805010d1d8c1801033c32a91a22010000ffffffff'
        ],
        received: ['94010100a91a020d021c1c000000001d1d0000000022010101038e180000']
      }
    ]
  },
  {
    // recorded on 1.19.60.3
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.63',
    firstRequest: -1681,
    stackIds: [1540, 1542],
    networkId: 2139,
    uuid: 'a748e31f-09b9-9a61-fb43-c24c9be68f85',
    segments: [
      {
        sent: [
          '930102a11a0101010c0088180d1c0000ffffffffa51a0101010c018c180d1d0000ffffffff'
        ],
        received: ['94010200a11a020c010000000000000d011c1c018818000000a51a020c010101000000000d011d1d018c180000']
      },
      {
        sent: [
          '350000a748e31f09b99a61fb43c24c9be68f8500019808030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101a91a050cdb10130198080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c881805010d1d8c1801033c32a91a22010000ffffffff'
        ],
        received: ['94010100a91a020d021c1c000000001d1d0000000022010101038e180000']
      }
    ]
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    firstRequest: -1675,
    stackIds: [1530, 1532],
    networkId: 2139,
    uuid: 'dc4391fd-7b1e-7476-9e5b-0f20df4055ac',
    segments: [
      {
        sent: [
          '930102951a0101010c00f4170d1c0000ffffffff991a0101010c01f8170d1d0000ffffffff'
        ],
        received: ['94010200951a020c010000000000000d011c1c01f417000000991a020c010101000000000d011d1d01f8170000']
      },
      {
        sent: [
          '350000dc4391fd7b1e74769e5b0f20df4055ac00019a08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '9301019d1a050cdb1013019a080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cf41705010d1df81701033c329d1a22010000ffffffff'
        ],
        received: ['940101009d1a020d021c1c000000001d1d000000002201010103fa170000']
      }
    ]
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    firstRequest: -1661,
    stackIds: [1478, 1480],
    networkId: 2210,
    uuid: '7b411664-6957-20f3-8eca-ffc9b78105b7',
    segments: [
      {
        sent: [
          '930102f9190101010c008c170d1c0000fffffffffd190101010c0190170d1d0000ffffffff'
        ],
        received: ['94010200f919020c010000000000000d011c1c018c17000000fd19020c010101000000000d011d1d0190170000']
      },
      {
        sent: [
          '3500007b411664695720f38ecaffc9b78105b700019c08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          '930101811a050ca21113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c8c1705010d1d901701033c32811a22010000ffffffff'
        ],
        received: ['94010100811a020d021c1c000000001d1d00000000220101010392170000']
      }
    ]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.50',
    firstRequest: -1629,
    stackIds: [1503, 1505],
    networkId: 2215,
    uuid: '174ff56e-abcc-99c7-e55f-b00f4e578fb3',
    segments: [
      {
        sent: [
          '930102b9190101010c00be170d1c0000ffffffffbd190101010c01c2170d1d0000ffffffff'
        ],
        received: ['94010200b919020c010000000000000d011c1c01be17000000bd19020c010101000000000d011d1d01c2170000']
      },
      {
        sent: [
          '930101c119050ca71113019e080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cbe1705010d1dc21701033c32c11922010000ffffffff'
        ],
        received: ['94010100c119020d021c1c000000001d1d000000002201010103c4170000']
      }
    ]
  },
  {
    // recorded on 1.20.60.4
    from: 'bedrock_1.20.61',
    to: 'bedrock_1.20.61',
    firstRequest: -1629,
    stackIds: [1503, 1505],
    networkId: 2215,
    uuid: 'fa49a5c5-3a23-8ee2-9e5d-1480fad7148c',
    segments: [
      {
        sent: [
          '930102b9190101010c00be170d1c0000ffffffffbd190101010c01c2170d1d0000ffffffff'
        ],
        received: ['94010200b919020c010000000000000d011c1c01be17000000bd19020c010101000000000d011d1d01c2170000']
      },
      {
        sent: [
          '930101c119050ca7111301a0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cbe1705010d1dc21701033c32c11922010000ffffffff'
        ],
        received: ['94010100c119020d021c1c000000001d1d000000002201010103c4170000']
      }
    ]
  },
  {
    // recorded on 1.20.72.1
    from: 'bedrock_1.20.71',
    to: 'bedrock_1.20.71',
    firstRequest: -1629,
    stackIds: [1503, 1505],
    networkId: 2215,
    uuid: '7f489e6e-bacf-3f50-b598-e0e9a9e173b0',
    segments: [
      {
        sent: [
          '930102b9190101010c00be170d1c0000ffffffffbd190101010c01c2170d1d0000ffffffff'
        ],
        received: ['94010200b919020c010000000000000d011c1c01be17000000bd19020c010101000000000d011d1d01c2170000']
      },
      {
        sent: [
          '930101c119050ca7111301a4080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cbe1705010d1dc21701033c32c11922010000ffffffff'
        ],
        received: ['94010100c119020d021c1c000000001d1d000000002201010103c4170000']
      }
    ]
  },
  {
    // recorded on 1.20.80.5
    from: 'bedrock_1.20.80',
    to: 'bedrock_1.20.80',
    firstRequest: -1629,
    stackIds: [1506, 1508],
    networkId: 2217,
    uuid: '62426dd0-4163-a501-adb0-11b5dcb981a1',
    segments: [
      {
        sent: [
          '930102b9190101010c00c4170d1c0000ffffffffbd190101010c01c8170d1d0000ffffffff'
        ],
        received: ['94010200b919020c010000000000000d011c1c01c417000000bd19020c010101000000000d011d1d01c8170000']
      },
      {
        sent: [
          '930101c119050ca9111301a8080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cc41705010d1dc81701033c32c11922010000ffffffff'
        ],
        received: ['94010100c119020d021c1c000000001d1d000000002201010103ca170000']
      }
    ]
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -1741,
    stackIds: [1597, 1599],
    networkId: 2332,
    uuid: '5a4bb69b-2a61-21d1-2748-2d6508b682a4',
    segments: [
      {
        sent: [
          '930102991b0101010c00fa180d1c0000ffffffff9d1b0101010c01fe180d1d0000ffffffff'
        ],
        received: ['94010200991b020c010000000000000d011c1c01fa180000009d1b020c010101000000000d011d1d01fe180000']
      },
      {
        sent: [
          '930101a11b050c9c121301ae080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfa1805010d1dfe1801033c32a11b22010000ffffffff'
        ],
        received: ['94010100a11b020d021c1c000000001d1d00000000220101010380190000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -1741,
    stackIds: [1597, 1599],
    networkId: 2332,
    uuid: '44452286-2018-5ae4-90b2-1b993b7ac080',
    segments: [
      {
        sent: [
          '930102991b0101010c0000000000fa180d000000001c0000ffffffff9d1b0101010c0000000001fe180d000000001d0000ffffffff'
        ],
        received: ['94010200991b020c00000000010000000000000d00000000011c1c01fa180000009d1b020c00000000010101000000000d00000000011d1d01fe180000']
      },
      {
        sent: [
          '930101a11b050c9c12011301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d000000001cfa1805010d000000001dfe1801033c0000000032a11b2200000000010000ffffffff'
        ],
        received: ['94010100a11b020d00000000021c1c000000001d1d0000000022000000000101010380190000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    firstRequest: -1741,
    stackIds: [1597, 1599],
    networkId: 2332,
    uuid: '2b46435f-8bad-8cf3-ca16-af196abc32a1',
    segments: [
      {
        sent: [
          '930102991b0101010c0000fa180d001c0000ffffffff9d1b0101010c0001fe180d001d0000ffffffff'
        ],
        received: ['94010200991b020c00010000000000000d00011c1c01fa180000009d1b020c00010101000000000d00011d1d01fe180000']
      },
      {
        sent: [
          '930101a11b050c9c12011301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cfa1805010d001dfe1801033c0032a11b2200010000ffffffff'
        ],
        received: ['94010100a11b020d00021c1c000000001d1d0000000022000101010380190000']
      }
    ]
  },
  {
    // recorded on 1.21.43.1
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    firstRequest: -1773,
    stackIds: [1639, 1641],
    networkId: 2725,
    uuid: '754410a4-f157-ec75-a3b7-73040f0cc681',
    segments: [
      {
        sent: [
          '930102d91b0101010c0000ce190d001c0000ffffffffdd1b0101010c0001d2190d001d0000ffffffff'
        ],
        received: ['94010200d91b020c00010000000000000d00011c1c01ce19000000dd1b020c00010101000000000d00011d1d01d2190000']
      },
      {
        sent: [
          '930101e11b050ca515011301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cce1905010d001dd21901033c0032e11b2200010000ffffffff'
        ],
        received: ['94010100e11b020d00021c1c000000001d1d00000000220001010103d4190000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.111',
    firstRequest: -1773,
    stackIds: [1639, 1641],
    networkId: 2766,
    uuid: 'a64f2245-d770-c51e-3e14-e06fc0f5a995',
    segments: [
      {
        sent: [
          '930102d91b0101010c0000ce190d001c0000ffffffffdd1b0101010c0001d2190d001d0000ffffffff'
        ],
        received: ['94010200d91b020c0001000000000000000d00011c1c01ce1900000000dd1b020c0001010100000000000d00011d1d01d219000000']
      },
      {
        sent: [
          '930101e11b050cce15011301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cce1905010d001dd21901033c0032e11b2200010000ffffffff'
        ],
        received: ['94010100e11b020d00021c1c00000000001d1d0000000000220001010103d419000000']
      }
    ]
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    firstRequest: -1843,
    stackIds: [1725, 1727],
    networkId: 3216,
    uuid: 'f04dc6fd-acaf-e8bd-e18f-2042e2ca2cb6',
    segments: [
      {
        sent: [
          '930102e51c0101010c0000fa1a0d001c0000ffffffffe91c0101010c0001fe1a0d001d0000ffffffff'
        ],
        received: ['94010200e51c020c0001000000000000000d00011c1c01fa1a00000000e91c020c0001010100000000000d00011d1d01fe1a000000']
      },
      {
        sent: [
          '930101ed1c050c9019011301ce080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cfa1a05010d001dfe1a01033c0032ed1c2200010000ffffffff'
        ],
        received: ['94010100ed1c020d00021c1c00000000001d1d0000000000220001010103801b000000']
      }
    ]
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.30',
    firstRequest: -1651,
    stackIds: [1041, 1043],
    networkId: 3225,
    uuid: '8c415f24-c723-5c83-efbc-dde1661bf1ae',
    segments: [
      {
        sent: [
          '930102e5190101010c0000a2100d001c0000ffffffffe9190101010c0001a6100d001d0000ffffffff'
        ],
        received: ['94010200e519020c0001000000000000000d00011c1c01a21000000000e919020c0001010100000000000d00011d1d01a610000000']
      },
      {
        sent: [
          '930101ed19050c9919011301dc080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001ca21005010d001da61001033c0032ed192200010000ffffffff'
        ],
        received: ['94010100ed19020d00021c1c00000000001d1d0000000000220001010103a810000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -1857,
    stackIds: [1730, 1732],
    networkId: 3563,
    uuid: '3542654f-02d8-4b79-a30d-c1d7dc15c39f',
    segments: [
      {
        sent: [
          '930102811d010101010c0000c20600000d001c0000000000ffffffff851d010101010c0001c40600000d001d0000000000ffffffff'
        ],
        received: ['94010200811d0101020c000100000001000000000d00011c1c010101841b00000000851d0101020c000101010001000000000d00011d1d010101881b000000']
      },
      {
        sent: [
          '930101891d050a0ceb1b011113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001cc20600000505010d001dc40600000101033c0032bbf8ffff2200010000000000ffffffff'
        ],
        received: ['94010100891d0101020d00021c1c0001000000001d1d00010000000022000101010301018a1b000000']
      }
    ]
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -1877,
    stackIds: [1730, 1732],
    networkId: 4671,
    uuid: '834087e2-6e1d-6616-248f-8a085876d3b5',
    segments: [
      {
        sent: [
          '930102a91d010101010c0000c20600000d001c0000000000ffffffffad1d010101010c0001c40600000d001d0000000000ffffffff'
        ],
        received: ['94010200a91d01020c0001000000000000000d00011c1c0101841b00000000ad1d01020c0001010100000000000d00011d1d0101881b000000']
      },
      {
        sent: [
          '930101b11d050a0cbf24011113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001cc20600000505010d001dc40600000101033c0032a7f8ffff2200010000000000ffffffff'
        ],
        received: ['94010100b11d01020d00021c1c00000000001d1d0000000000220001010103018a1b000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -1877,
    stackIds: [1730, 1732],
    networkId: 2773,
    uuid: '50463ded-8cc3-982d-3544-7584770d0db3',
    segments: [
      {
        sent: [
          '930102a91d010101010c0000c20600000d001c0000000000ffffffffad1d010101010c0001c40600000d001d0000000000ffffffff'
        ],
        received: ['94010200a91d01020c0001000000000000000d00011c1c0101841b00000000ad1d01020c0001010100000000000d00011d1d0101881b000000']
      },
      {
        sent: [
          '930101b11d050a0cd515011214010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001cc20600000505010d001dc40600000101033c0032a7f8ffff2200010000000000ffffffff'
        ],
        received: ['94010100b11d01020d00021c1c00000000001d1d0000000000220001010103018a1b000000']
      }
    ]
  }
]

interface RecordedMulti {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackIds: readonly number[]
  networkId: number
  uuid: string
  multi: number
  segments: ReadonlyArray<{ sent: readonly string[], received: readonly string[] }>
}

function repeated (count: number, hex: string): string[] {
  return Array.from({ length: count }, () => hex)
}

const MULTI_ROCKETS: readonly RecordedMulti[] = [
  {
    // recorded on 1.20.10.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    firstRequest: -3487,
    stackIds: [2670, 2672],
    networkId: 2215,
    uuid: '8d45b7ea-c8e5-d610-c4c4-63aee8775587',
    multi: 2298,
    segments: [
      {
        sent: [
          '930102bd360101160c00dc290d1c0000ffffffffc1360101160c01e0290d1d0000ffffffff'
        ],
        received: ['94010200bd36020c010000000000000d011c1c16dc29000000c136020c010101000000000d011d1d16e0290000']
      },
      {
        sent: [
          '3500008d45b7eac8e5d610c4c463aee877558700019c08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000',
          ...repeated(21, '3500000000000000000000020000000000000000019c08030000000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000'),
          '930116c536050ca71113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cdc2905010d1de02901033c32c53622010000ffffffffc936050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cc53605010d1dc53601033c32c9362201c53600ffffffffcd36050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cc93605010d1dc93601033c32cd362201c93600ffffffffd136050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ccd3605010d1dcd3601033c32d1362201cd3600ffffffffd536050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cd13605010d1dd13601033c32d5362201d13600ffffffffd936050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cd53605010d1dd53601033c32d9362201d53600ffffffffdd36050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cd93605010d1dd93601033c32dd362201d93600ffffffffe136050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cdd3605010d1ddd3601033c32e1362201dd3600ffffffffe536050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ce13605010d1de13601033c32e5362201e13600ffffffffe936050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ce53605010d1de53601033c32e9362201e53600ffffffffed36050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ce93605010d1de93601033c32ed362201e93600fffffffff136050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1ced3605010d1ded3601033c32f1362201ed3600fffffffff536050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cf13605010d1df13601033c32f5362201f13600fffffffff936050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cf53605010d1df53601033c32f9362201f53600fffffffffd36050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cf93605010d1df93601033c32fd362201f93600ffffffff8137050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1cfd3605010d1dfd3601033c3281372201fd3600ffffffff8537050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c813705010d1d813701033c3285372201813700ffffffff8937050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c853705010d1d853701033c3289372201853700ffffffff8d37050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c893705010d1d893701033c328d372201893700ffffffff9137050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c8d3705010d1d8d3701033c32913722018d3700ffffffff9537050cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c913705010d1d913701033c3295372201913700ffffffff9937060cfa1113019c080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d1c953705010d1d953701013c3299372201953701023c3299370c000000ffffffff'
        ],
        received: ['94011600c536020d021c1c15dc2900001d1d15e02900002201010103e229000000c936020d021c1c14dc2900001d1d14e02900002201010106e229000000cd36020d021c1c13dc2900001d1d13e02900002201010109e229000000d136020d021c1c12dc2900001d1d12e0290000220101010ce229000000d536020d021c1c11dc2900001d1d11e0290000220101010fe229000000d936020d021c1c10dc2900001d1d10e02900002201010112e229000000dd36020d021c1c0fdc2900001d1d0fe02900002201010115e229000000e136020d021c1c0edc2900001d1d0ee02900002201010118e229000000e536020d021c1c0ddc2900001d1d0de0290000220101011be229000000e936020d021c1c0cdc2900001d1d0ce0290000220101011ee229000000ed36020d021c1c0bdc2900001d1d0be02900002201010121e229000000f136020d021c1c0adc2900001d1d0ae02900002201010124e229000000f536020d021c1c09dc2900001d1d09e02900002201010127e229000000f936020d021c1c08dc2900001d1d08e0290000220101012ae229000000fd36020d021c1c07dc2900001d1d07e0290000220101012de2290000008137020d021c1c06dc2900001d1d06e02900002201010130e2290000008537020d021c1c05dc2900001d1d05e02900002201010133e2290000008937020d021c1c04dc2900001d1d04e02900002201010136e2290000008d37020d021c1c03dc2900001d1d03e02900002201010139e2290000009137020d021c1c02dc2900001d1d02e0290000220101013ce2290000009537020d021c1c01dc2900001d1d01e0290000220101013fe2290000009937030d021c1c000000001d1d000000002201010140e22900000c010000028c2a0000']
      }
    ]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -2221,
    stackIds: [2062, 2064],
    networkId: 2332,
    uuid: '44452286-2018-5ae4-90b2-1b993b7ac080',
    multi: 2419,
    segments: [
      {
        sent: [
          '930102d9220101160c00000000009c200d000000001c0000ffffffffdd220101160c0000000001a0200d000000001d0000ffffffff'
        ],
        received: ['94010200d922020c00000000010000000000000d00000000011c1c169c20000000dd22020c00000000010101000000000d00000000011d1d16a0200000']
      },
      {
        sent: [
          '930102e122050c9c12151301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d000000001c9c2005150d000000001da020013f3c0000000032e1222200000000010000ffffffffe522060cf312011301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d000000001ce12205010d000000001de12201013c0000000032e522220000000001e12201023c0000000032e5220c00000000000000ffffffff'
        ],
        received: ['94010200e122020d00000000021c1c019c2000001d1d01a020000022000000000101013fa220000000e522030d00000000021c1c000000001d1d00000000220000000001010140a22000000c0000000001000002a4200000']
      }
    ]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    firstRequest: -2221,
    stackIds: [2062, 2064],
    networkId: 2332,
    uuid: '2b46435f-8bad-8cf3-ca16-af196abc32a1',
    multi: 2419,
    segments: [
      {
        sent: [
          '930102d9220101160c00009c200d001c0000ffffffffdd220101160c0001a0200d001d0000ffffffff'
        ],
        received: ['94010200d922020c00010000000000000d00011c1c169c20000000dd22020c00010101000000000d00011d1d16a0200000']
      },
      {
        sent: [
          '930102e122050c9c12151301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d001c9c2005150d001da020013f3c0032e1222200010000ffffffffe522060cf312011301b0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001ce12205010d001de12201013c0032e522220001e12201023c0032e5220c00000000ffffffff'
        ],
        received: ['94010200e122020d00021c1c019c2000001d1d01a020000022000101013fa220000000e522030d00021c1c000000001d1d00000000220001010140a22000000c0001000002a4200000']
      }
    ]
  },
  {
    // recorded on 1.21.43.1
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    firstRequest: -2265,
    stackIds: [2115, 2117],
    networkId: 2725,
    uuid: '754410a4-f157-ec75-a3b7-73040f0cc681',
    multi: 2812,
    segments: [
      {
        sent: [
          '930102b1230101160c000086210d001c0000ffffffffb5230101160c00018a210d001d0000ffffffff'
        ],
        received: ['94010200b123020c00010000000000000d00011c1c168621000000b523020c00010101000000000d00011d1d168a210000']
      },
      {
        sent: [
          '930102b923050ca515151301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d001c862105150d001d8a21013f3c0032b9232200010000ffffffffbd23060cfc15011301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cb92305010d001db92301013c0032bd23220001b92301023c0032bd230c00000000ffffffff'
        ],
        received: ['94010200b923020d00021c1c01862100001d1d018a21000022000101013f8c21000000bd23030d00021c1c000000001d1d000000002200010101408c2100000c00010000028e210000']
      }
    ]
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.111',
    firstRequest: -2265,
    stackIds: [2115, 2117],
    networkId: 2766,
    uuid: 'a64f2245-d770-c51e-3e14-e06fc0f5a995',
    multi: 2853,
    segments: [
      {
        sent: [
          '930102b1230101160c000086210d001c0000ffffffffb5230101160c00018a210d001d0000ffffffff'
        ],
        received: ['94010200b123020c0001000000000000000d00011c1c16862100000000b523020c0001010100000000000d00011d1d168a21000000']
      },
      {
        sent: [
          '930102b923050cce15151301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d001c862105150d001d8a21013f3c0032b9232200010000ffffffffbd23060ca516011301d0080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001cb92305010d001db92301013c0032bd23220001b92301023c0032bd230c00000000ffffffff'
        ],
        received: ['94010200b923020d00021c1c0186210000001d1d018a2100000022000101013f8c2100000000bd23030d00021c1c00000000001d1d00000000002200010101408c210000000c00010000028e21000000']
      }
    ]
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    firstRequest: -2353,
    stackIds: [2225, 2227],
    networkId: 3216,
    uuid: 'f04dc6fd-acaf-e8bd-e18f-2042e2ca2cb6',
    multi: 3303,
    segments: [
      {
        sent: [
          '930102e1240101160c0000e2220d001c0000ffffffffe5240101160c0001e6220d001d0000ffffffff'
        ],
        received: ['94010200e124020c0001000000000000000d00011c1c16e22200000000e524020c0001010100000000000d00011d1d16e622000000']
      },
      {
        sent: [
          '930102e924050c9019151301ce080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d001ce22205150d001de622013f3c0032e9242200010000ffffffffed24060ce719011301ce080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001ce92405010d001de92401013c0032ed24220001e92401023c0032ed240c00000000ffffffff'
        ],
        received: ['94010200e924020d00021c1c01e2220000001d1d01e62200000022000101013fe82200000000ed24030d00021c1c00000000001d1d0000000000220001010140e8220000000c0001000002ea22000000']
      }
    ]
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.30',
    firstRequest: -2161,
    stackIds: [1541, 1543],
    networkId: 3225,
    uuid: '8c415f24-c723-5c83-efbc-dde1661bf1ae',
    multi: 3312,
    segments: [
      {
        sent: [
          '930102e1210101160c00008a180d001c0000ffffffffe5210101160c00018e180d001d0000ffffffff'
        ],
        received: ['94010200e121020c0001000000000000000d00011c1c168a1800000000e521020c0001010100000000000d00011d1d168e18000000']
      },
      {
        sent: [
          '930102e921050c9919151301dc080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105150d001c8a1805150d001d8e18013f3c0032e9212200010000ffffffffed21060cf019011301dc080300000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c6967687401000000000000000000000105010d001ce92105010d001de92101013c0032ed21220001e92101023c0032ed210c00000000ffffffff'
        ],
        received: ['94010200e921020d00021c1c018a180000001d1d018e1800000022000101013f901800000000ed21030d00021c1c00000000001d1d000000000022000101014090180000000c00010000029218000000']
      }
    ]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -2367,
    stackIds: [2245, 2247],
    networkId: 3563,
    uuid: '3542654f-02d8-4b79-a30d-c1d7dc15c39f',
    multi: 3650,
    segments: [
      {
        sent: [
          '930102fd24010101160c0000c50800000d001c0000000000ffffffff8125010101160c0001c70800000d001d0000000000ffffffff'
        ],
        received: ['94010200fd240101020c000100000001000000000d00011c1c1601018a230000000081250101020c000101010001000000000d00011d1d1601018e23000000']
      },
      {
        sent: [
          '9301028525050a0ceb1b151113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505150d001cc50800000505150d001dc708000001013f3c0032bdf6ffff2200010000000000ffffffff8925060a0cc21c011113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001cbdf6ffff0505010d001dbdf6ffff0101013c0032bbf6ffff220001bdf6ffff0101023c0032bbf6ffff0c00000000000000ffffffff'
        ],
        received: ['9401020085250101020d00021c1c0101018a230000001d1d0101018e2300000022000101013f010190230000000089250101030d00021c1c0001000000001d1d000100000000220001010140010190230000000c000100000201019223000000']
      }
    ]
  },
  {
    // recorded on 1.26.51.1
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    firstRequest: -495,
    stackIds: [487, 489],
    networkId: 4671,
    uuid: 'bb4f2121-7cb1-88c3-bd76-e1e407745fb3',
    multi: 4758,
    segments: [
      {
        sent: [
          '930102dd07010101160c0000e70100000d001c0000000000ffffffffe107010101160c0001e90100000d001d0000000000ffffffff'
        ],
        received: ['94010200dd0701020c0001000000000000000d00011c1c1601ce0700000000e10701020c0001010100000000000d00011d1d1601d207000000']
      },
      {
        sent: [
          '930102e507050a0cbf24151113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505150d001ce70100000505150d001de901000001013f3c00320dfeffff2200010000000000ffffffffe907060a0c9625011113010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001c0dfeffff0505010d001d0dfeffff0101013c00320bfeffff2200010dfeffff0101023c00320bfeffff0c00000000000000ffffffff'
        ],
        received: ['94010200e50701020d00021c1c0101ce070000001d1d0101d20700000022000101013f01d40700000000e90701030d00021c1c00000000001d1d000000000022000101014001d4070000000c000100000201d607000000']
      }
    ]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    firstRequest: -2393,
    stackIds: [2240, 2242],
    networkId: 2773,
    uuid: '50463ded-8cc3-982d-3544-7584770d0db3',
    multi: 2862,
    segments: [
      {
        sent: [
          '930102b125010101160c0000c00800000d001c0000000000ffffffffb525010101160c0001c20800000d001d0000000000ffffffff'
        ],
        received: ['94010200b12501020c0001000000000000000d00011c1c1601802300000000b52501020c0001010100000000000d00011d1d16018423000000']
      },
      {
        sent: [
          '930102b925050a0cd515151214010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505150d001cc00800000505150d001dc208000001013f3c0032a3f6ffff2200010000000000ffffffffbd25060a0cae16011214010101196d696e6563726166743a66697265776f726b5f726f636b65740003000038ffff010a00000a090046697265776f726b73090a004578706c6f73696f6e730000000000010600466c696768740100000000000000000000010505010d001ca3f6ffff0505010d001da3f6ffff0101013c0032a1f6ffff220001a3f6ffff0101023c0032a1f6ffff0c00000000000000ffffffff'
        ],
        received: ['94010200b92501020d00021c1c010180230000001d1d0101842300000022000101013f01862300000000bd2501030d00021c1c00000000001d1d00000000002200010101400186230000000c0001000002018823000000']
      }
    ]
  }
]

const MAPS: readonly RecordedMulti[] = [
  {
    // recorded on 1.21.2.2
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -2863,
    stackIds: [2220, 2222],
    networkId: 289,
    uuid: '07402d9f-2f69-6f17-5d00-4302f4ebc389',
    multi: 2425,
    segments: [
      {
        sent: [
          '930102dd2c0101400c00d8220d1c0000ffffffffe12c0101400c01dc220d1d0000ffffffff'
        ],
        received: ['94010200dd2c020c010000000000000d011c1c40d822000000e12c020c010101000000000d011d1d40dc220000']
      },
      {
        sent: [
          '930140e52c050ca1021301a608010002000a000000000000000000000105010d1cd82205010d1ddc2201013c32e52c0c000000ffffffffe92c050cf9121301a608010002000a000000000000000000000105010d1ce52c05010d1de52c01013c32e92c0c00e52c00ffffffffed2c050cf9121301a608010002000a000000000000000000000105010d1ce92c05010d1de92c01013c32ed2c0c00e92c00fffffffff12c050cf9121301a608010002000a000000000000000000000105010d1ced2c05010d1ded2c01013c32f12c0c00ed2c00fffffffff52c050cf9121301a608010002000a000000000000000000000105010d1cf12c05010d1df12c01013c32f52c0c00f12c00fffffffff92c050cf9121301a608010002000a000000000000000000000105010d1cf52c05010d1df52c01013c32f92c0c00f52c00fffffffffd2c050cf9121301a608010002000a000000000000000000000105010d1cf92c05010d1df92c01013c32fd2c0c00f92c00ffffffff812d050cf9121301a608010002000a000000000000000000000105010d1cfd2c05010d1dfd2c01013c32812d0c00fd2c00ffffffff852d050cf9121301a608010002000a000000000000000000000105010d1c812d05010d1d812d01013c32852d0c00812d00ffffffff892d050cf9121301a608010002000a000000000000000000000105010d1c852d05010d1d852d01013c32892d0c00852d00ffffffff8d2d050cf9121301a608010002000a000000000000000000000105010d1c892d05010d1d892d01013c328d2d0c00892d00ffffffff912d050cf9121301a608010002000a000000000000000000000105010d1c8d2d05010d1d8d2d01013c32912d0c008d2d00ffffffff952d050cf9121301a608010002000a000000000000000000000105010d1c912d05010d1d912d01013c32952d0c00912d00ffffffff992d050cf9121301a608010002000a000000000000000000000105010d1c952d05010d1d952d01013c32992d0c00952d00ffffffff9d2d050cf9121301a608010002000a000000000000000000000105010d1c992d05010d1d992d01013c329d2d0c00992d00ffffffffa12d050cf9121301a608010002000a000000000000000000000105010d1c9d2d05010d1d9d2d01013c32a12d0c009d2d00ffffffffa52d050cf9121301a608010002000a000000000000000000000105010d1ca12d05010d1da12d01013c32a52d0c00a12d00ffffffffa92d050cf9121301a608010002000a000000000000000000000105010d1ca52d05010d1da52d01013c32a92d0c00a52d00ffffffffad2d050cf9121301a608010002000a000000000000000000000105010d1ca92d05010d1da92d01013c32ad2d0c00a92d00ffffffffb12d050cf9121301a608010002000a000000000000000000000105010d1cad2d05010d1dad2d01013c32b12d0c00ad2d00ffffffffb52d050cf9121301a608010002000a000000000000000000000105010d1cb12d05010d1db12d01013c32b52d0c00b12d00ffffffffb92d050cf9121301a608010002000a000000000000000000000105010d1cb52d05010d1db52d01013c32b92d0c00b52d00ffffffffbd2d050cf9121301a608010002000a000000000000000000000105010d1cb92d05010d1db92d01013c32bd2d0c00b92d00ffffffffc12d050cf9121301a608010002000a000000000000000000000105010d1cbd2d05010d1dbd2d01013c32c12d0c00bd2d00ffffffffc52d050cf9121301a608010002000a000000000000000000000105010d1cc12d05010d1dc12d01013c32c52d0c00c12d00ffffffffc92d050cf9121301a608010002000a000000000000000000000105010d1cc52d05010d1dc52d01013c32c92d0c00c52d00ffffffffcd2d050cf9121301a608010002000a000000000000000000000105010d1cc92d05010d1dc92d01013c32cd2d0c00c92d00ffffffffd12d050cf9121301a608010002000a000000000000000000000105010d1ccd2d05010d1dcd2d01013c32d12d0c00cd2d00ffffffffd52d050cf9121301a608010002000a000000000000000000000105010d1cd12d05010d1dd12d01013c32d52d0c00d12d00ffffffffd92d050cf9121301a608010002000a000000000000000000000105010d1cd52d05010d1dd52d01013c32d92d0c00d52d00ffffffffdd2d050cf9121301a608010002000a000000000000000000000105010d1cd92d05010d1dd92d01013c32dd2d0c00d92d00ffffffffe12d050cf9121301a608010002000a000000000000000000000105010d1cdd2d05010d1ddd2d01013c32e12d0c00dd2d00ffffffffe52d050cf9121301a608010002000a000000000000000000000105010d1ce12d05010d1de12d01013c32e52d0c00e12d00ffffffffe92d050cf9121301a608010002000a000000000000000000000105010d1ce52d05010d1de52d01013c32e92d0c00e52d00ffffffffed2d050cf9121301a608010002000a000000000000000000000105010d1ce92d05010d1de92d01013c32ed2d0c00e92d00fffffffff12d050cf9121301a608010002000a000000000000000000000105010d1ced2d05010d1ded2d01013c32f12d0c00ed2d00fffffffff52d050cf9121301a608010002000a000000000000000000000105010d1cf12d05010d1df12d01013c32f52d0c00f12d00fffffffff92d050cf9121301a608010002000a000000000000000000000105010d1cf52d05010d1df52d01013c32f92d0c00f52d00fffffffffd2d050cf9121301a608010002000a000000000000000000000105010d1cf92d05010d1df92d01013c32fd2d0c00f92d00ffffffff812e050cf9121301a608010002000a000000000000000000000105010d1cfd2d05010d1dfd2d01013c32812e0c00fd2d00ffffffff852e050cf9121301a608010002000a000000000000000000000105010d1c812e05010d1d812e01013c32852e0c00812e00ffffffff892e050cf9121301a608010002000a000000000000000000000105010d1c852e05010d1d852e01013c32892e0c00852e00ffffffff8d2e050cf9121301a608010002000a000000000000000000000105010d1c892e05010d1d892e01013c328d2e0c00892e00ffffffff912e050cf9121301a608010002000a000000000000000000000105010d1c8d2e05010d1d8d2e01013c32912e0c008d2e00ffffffff952e050cf9121301a608010002000a000000000000000000000105010d1c912e05010d1d912e01013c32952e0c00912e00ffffffff992e050cf9121301a608010002000a000000000000000000000105010d1c952e05010d1d952e01013c32992e0c00952e00ffffffff9d2e050cf9121301a608010002000a000000000000000000000105010d1c992e05010d1d992e01013c329d2e0c00992e00ffffffffa12e050cf9121301a608010002000a000000000000000000000105010d1c9d2e05010d1d9d2e01013c32a12e0c009d2e00ffffffffa52e050cf9121301a608010002000a000000000000000000000105010d1ca12e05010d1da12e01013c32a52e0c00a12e00ffffffffa92e050cf9121301a608010002000a000000000000000000000105010d1ca52e05010d1da52e01013c32a92e0c00a52e00ffffffffad2e050cf9121301a608010002000a000000000000000000000105010d1ca92e05010d1da92e01013c32ad2e0c00a92e00ffffffffb12e050cf9121301a608010002000a000000000000000000000105010d1cad2e05010d1dad2e01013c32b12e0c00ad2e00ffffffffb52e050cf9121301a608010002000a000000000000000000000105010d1cb12e05010d1db12e01013c32b52e0c00b12e00ffffffffb92e050cf9121301a608010002000a000000000000000000000105010d1cb52e05010d1db52e01013c32b92e0c00b52e00ffffffffbd2e050cf9121301a608010002000a000000000000000000000105010d1cb92e05010d1db92e01013c32bd2e0c00b92e00ffffffffc12e050cf9121301a608010002000a000000000000000000000105010d1cbd2e05010d1dbd2e01013c32c12e0c00bd2e00ffffffffc52e050cf9121301a608010002000a000000000000000000000105010d1cc12e05010d1dc12e01013c32c52e0c00c12e00ffffffffc92e050cf9121301a608010002000a000000000000000000000105010d1cc52e05010d1dc52e01013c32c92e0c00c52e00ffffffffcd2e050cf9121301a608010002000a000000000000000000000105010d1cc92e05010d1dc92e01013c32cd2e0c00c92e00ffffffffd12e050cf9121301a608010002000a000000000000000000000105010d1ccd2e05010d1dcd2e01013c32d12e0c00cd2e00ffffffffd52e050cf9121301a608010002000a000000000000000000000105010d1cd12e05010d1dd12e01013c32d52e0c00d12e00ffffffffd92e050cf9121301a608010002000a000000000000000000000105010d1cd52e05010d1dd52e01013c32d92e0c00d52e00ffffffffdd2e050cf9121301a608010002000a000000000000000000000105010d1cd92e05010d1dd92e01013c32dd2e0c00d92e00ffffffffe12e050cf9121301a608010002000a000000000000000000000105010d1cdd2e05010d1ddd2e01013c32e12e0c00dd2e00ffffffff'
        ],
        received: ['94014000e52c020d021c1c3fd82200001d1d3fdc2200000c01000001de22000000e92c020d021c1c3ed82200001d1d3edc2200000c01000002de22000000ed2c020d021c1c3dd82200001d1d3ddc2200000c01000003de22000000f12c020d021c1c3cd82200001d1d3cdc2200000c01000004de22000000f52c020d021c1c3bd82200001d1d3bdc2200000c01000005de22000000f92c020d021c1c3ad82200001d1d3adc2200000c01000006de22000000fd2c020d021c1c39d82200001d1d39dc2200000c01000007de22000000812d020d021c1c38d82200001d1d38dc2200000c01000008de22000000852d020d021c1c37d82200001d1d37dc2200000c01000009de22000000892d020d021c1c36d82200001d1d36dc2200000c0100000ade220000008d2d020d021c1c35d82200001d1d35dc2200000c0100000bde22000000912d020d021c1c34d82200001d1d34dc2200000c0100000cde22000000952d020d021c1c33d82200001d1d33dc2200000c0100000dde22000000992d020d021c1c32d82200001d1d32dc2200000c0100000ede220000009d2d020d021c1c31d82200001d1d31dc2200000c0100000fde22000000a12d020d021c1c30d82200001d1d30dc2200000c01000010de22000000a52d020d021c1c2fd82200001d1d2fdc2200000c01000011de22000000a92d020d021c1c2ed82200001d1d2edc2200000c01000012de22000000ad2d020d021c1c2dd82200001d1d2ddc2200000c01000013de22000000b12d020d021c1c2cd82200001d1d2cdc2200000c01000014de22000000b52d020d021c1c2bd82200001d1d2bdc2200000c01000015de22000000b92d020d021c1c2ad82200001d1d2adc2200000c01000016de22000000bd2d020d021c1c29d82200001d1d29dc2200000c01000017de22000000c12d020d021c1c28d82200001d1d28dc2200000c01000018de22000000c52d020d021c1c27d82200001d1d27dc2200000c01000019de22000000c92d020d021c1c26d82200001d1d26dc2200000c0100001ade22000000cd2d020d021c1c25d82200001d1d25dc2200000c0100001bde22000000d12d020d021c1c24d82200001d1d24dc2200000c0100001cde22000000d52d020d021c1c23d82200001d1d23dc2200000c0100001dde22000000d92d020d021c1c22d82200001d1d22dc2200000c0100001ede22000000dd2d020d021c1c21d82200001d1d21dc2200000c0100001fde22000000e12d020d021c1c20d82200001d1d20dc2200000c01000020de22000000e52d020d021c1c1fd82200001d1d1fdc2200000c01000021de22000000e92d020d021c1c1ed82200001d1d1edc2200000c01000022de22000000ed2d020d021c1c1dd82200001d1d1ddc2200000c01000023de22000000f12d020d021c1c1cd82200001d1d1cdc2200000c01000024de22000000f52d020d021c1c1bd82200001d1d1bdc2200000c01000025de22000000f92d020d021c1c1ad82200001d1d1adc2200000c01000026de22000000fd2d020d021c1c19d82200001d1d19dc2200000c01000027de22000000812e020d021c1c18d82200001d1d18dc2200000c01000028de22000000852e020d021c1c17d82200001d1d17dc2200000c01000029de22000000892e020d021c1c16d82200001d1d16dc2200000c0100002ade220000008d2e020d021c1c15d82200001d1d15dc2200000c0100002bde22000000912e020d021c1c14d82200001d1d14dc2200000c0100002cde22000000952e020d021c1c13d82200001d1d13dc2200000c0100002dde22000000992e020d021c1c12d82200001d1d12dc2200000c0100002ede220000009d2e020d021c1c11d82200001d1d11dc2200000c0100002fde22000000a12e020d021c1c10d82200001d1d10dc2200000c01000030de22000000a52e020d021c1c0fd82200001d1d0fdc2200000c01000031de22000000a92e020d021c1c0ed82200001d1d0edc2200000c01000032de22000000ad2e020d021c1c0dd82200001d1d0ddc2200000c01000033de22000000b12e020d021c1c0cd82200001d1d0cdc2200000c01000034de22000000b52e020d021c1c0bd82200001d1d0bdc2200000c01000035de22000000b92e020d021c1c0ad82200001d1d0adc2200000c01000036de22000000bd2e020d021c1c09d82200001d1d09dc2200000c01000037de22000000c12e020d021c1c08d82200001d1d08dc2200000c01000038de22000000c52e020d021c1c07d82200001d1d07dc2200000c01000039de22000000c92e020d021c1c06d82200001d1d06dc2200000c0100003ade22000000cd2e020d021c1c05d82200001d1d05dc2200000c0100003bde22000000d12e020d021c1c04d82200001d1d04dc2200000c0100003cde22000000d52e020d021c1c03d82200001d1d03dc2200000c0100003dde22000000d92e020d021c1c02d82200001d1d02dc2200000c0100003ede22000000dd2e020d021c1c01d82200001d1d01dc2200000c0100003fde22000000e12e020d021c1c000000001d1d000000000c01000040de220000']
      }
    ]
  }
]

const POTS: readonly RecordedMulti[] = [
  {
    // recorded on 1.21.2.2
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    firstRequest: -1999,
    stackIds: [1752, 1753, 1754, 1755],
    networkId: 2415,
    uuid: 'a847ec7c-ec5d-85f2-bc18-f01bc7e6d0a8',
    multi: 2429,
    segments: [
      {
        sent: [
          '9301049d1f0101400c00b01b0d210000ffffffffa11f0101400c01b21b0d230000ffffffffa51f0101400c02b41b0d250000ffffffffa91f0101400c03b61b0d270000ffffffff'
        ],
        received: ['940104009d1f020c010000000000000d01212140b01b000000a11f020c010101000000000d01232340b21b000000a51f020c010202000000000d01252540b41b000000a91f020c010303000000000d01272740b61b0000']
      },
      {
        sent: [
          '930140ad1f070cef121301cd08010000e0f9adc4020a000000000000000000000105010d21b01b05010d23b21b05010d25b41b05010d27b61b01013c32ad1f0c000000ffffffffb11f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21ad1f05010d23ad1f05010d25ad1f05010d27ad1f01013c32b11f0c00ad1f00ffffffffb51f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b11f05010d23b11f05010d25b11f05010d27b11f01013c32b51f0c00b11f00ffffffffb91f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b51f05010d23b51f05010d25b51f05010d27b51f01013c32b91f0c00b51f00ffffffffbd1f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b91f05010d23b91f05010d25b91f05010d27b91f01013c32bd1f0c00b91f00ffffffffc11f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21bd1f05010d23bd1f05010d25bd1f05010d27bd1f01013c32c11f0c00bd1f00ffffffffc51f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c11f05010d23c11f05010d25c11f05010d27c11f01013c32c51f0c00c11f00ffffffffc91f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c51f05010d23c51f05010d25c51f05010d27c51f01013c32c91f0c00c51f00ffffffffcd1f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c91f05010d23c91f05010d25c91f05010d27c91f01013c32cd1f0c00c91f00ffffffffd11f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21cd1f05010d23cd1f05010d25cd1f05010d27cd1f01013c32d11f0c00cd1f00ffffffffd51f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d11f05010d23d11f05010d25d11f05010d27d11f01013c32d51f0c00d11f00ffffffffd91f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d51f05010d23d51f05010d25d51f05010d27d51f01013c32d91f0c00d51f00ffffffffdd1f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d91f05010d23d91f05010d25d91f05010d27d91f01013c32dd1f0c00d91f00ffffffffe11f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21dd1f05010d23dd1f05010d25dd1f05010d27dd1f01013c32e11f0c00dd1f00ffffffffe51f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e11f05010d23e11f05010d25e11f05010d27e11f01013c32e51f0c00e11f00ffffffffe91f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e51f05010d23e51f05010d25e51f05010d27e51f01013c32e91f0c00e51f00ffffffffed1f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e91f05010d23e91f05010d25e91f05010d27e91f01013c32ed1f0c00e91f00fffffffff11f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21ed1f05010d23ed1f05010d25ed1f05010d27ed1f01013c32f11f0c00ed1f00fffffffff51f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f11f05010d23f11f05010d25f11f05010d27f11f01013c32f51f0c00f11f00fffffffff91f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f51f05010d23f51f05010d25f51f05010d27f51f01013c32f91f0c00f51f00fffffffffd1f070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f91f05010d23f91f05010d25f91f05010d27f91f01013c32fd1f0c00f91f00ffffffff8120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21fd1f05010d23fd1f05010d25fd1f05010d27fd1f01013c3281200c00fd1f00ffffffff8520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21812005010d23812005010d25812005010d27812001013c3285200c00812000ffffffff8920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21852005010d23852005010d25852005010d27852001013c3289200c00852000ffffffff8d20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21892005010d23892005010d25892005010d27892001013c328d200c00892000ffffffff9120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d218d2005010d238d2005010d258d2005010d278d2001013c3291200c008d2000ffffffff9520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21912005010d23912005010d25912005010d27912001013c3295200c00912000ffffffff9920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21952005010d23952005010d25952005010d27952001013c3299200c00952000ffffffff9d20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21992005010d23992005010d25992005010d27992001013c329d200c00992000ffffffffa120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d219d2005010d239d2005010d259d2005010d279d2001013c32a1200c009d2000ffffffffa520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21a12005010d23a12005010d25a12005010d27a12001013c32a5200c00a12000ffffffffa920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21a52005010d23a52005010d25a52005010d27a52001013c32a9200c00a52000ffffffffad20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21a92005010d23a92005010d25a92005010d27a92001013c32ad200c00a92000ffffffffb120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21ad2005010d23ad2005010d25ad2005010d27ad2001013c32b1200c00ad2000ffffffffb520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b12005010d23b12005010d25b12005010d27b12001013c32b5200c00b12000ffffffffb920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b52005010d23b52005010d25b52005010d27b52001013c32b9200c00b52000ffffffffbd20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21b92005010d23b92005010d25b92005010d27b92001013c32bd200c00b92000ffffffffc120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21bd2005010d23bd2005010d25bd2005010d27bd2001013c32c1200c00bd2000ffffffffc520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c12005010d23c12005010d25c12005010d27c12001013c32c5200c00c12000ffffffffc920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c52005010d23c52005010d25c52005010d27c52001013c32c9200c00c52000ffffffffcd20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21c92005010d23c92005010d25c92005010d27c92001013c32cd200c00c92000ffffffffd120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21cd2005010d23cd2005010d25cd2005010d27cd2001013c32d1200c00cd2000ffffffffd520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d12005010d23d12005010d25d12005010d27d12001013c32d5200c00d12000ffffffffd920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d52005010d23d52005010d25d52005010d27d52001013c32d9200c00d52000ffffffffdd20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21d92005010d23d92005010d25d92005010d27d92001013c32dd200c00d92000ffffffffe120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21dd2005010d23dd2005010d25dd2005010d27dd2001013c32e1200c00dd2000ffffffffe520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e12005010d23e12005010d25e12005010d27e12001013c32e5200c00e12000ffffffffe920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e52005010d23e52005010d25e52005010d27e52001013c32e9200c00e52000ffffffffed20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21e92005010d23e92005010d25e92005010d27e92001013c32ed200c00e92000fffffffff120070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21ed2005010d23ed2005010d25ed2005010d27ed2001013c32f1200c00ed2000fffffffff520070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f12005010d23f12005010d25f12005010d27f12001013c32f5200c00f12000fffffffff920070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f52005010d23f52005010d25f52005010d27f52001013c32f9200c00f52000fffffffffd20070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21f92005010d23f92005010d25f92005010d27f92001013c32fd200c00f92000ffffffff8121070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21fd2005010d23fd2005010d25fd2005010d27fd2001013c3281210c00fd2000ffffffff8521070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21812105010d23812105010d25812105010d27812101013c3285210c00812100ffffffff8921070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21852105010d23852105010d25852105010d27852101013c3289210c00852100ffffffff8d21070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21892105010d23892105010d25892105010d27892101013c328d210c00892100ffffffff9121070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d218d2105010d238d2105010d258d2105010d278d2101013c3291210c008d2100ffffffff9521070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21912105010d23912105010d25912105010d27912101013c3295210c00912100ffffffff9921070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21952105010d23952105010d25952105010d27952101013c3299210c00952100ffffffff9d21070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21992105010d23992105010d25992105010d27992101013c329d210c00992100ffffffffa121070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d219d2105010d239d2105010d259d2105010d279d2101013c32a1210c009d2100ffffffffa521070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21a12105010d23a12105010d25a12105010d27a12101013c32a5210c00a12100ffffffffa921070cfd121301cd08010000e0f9adc4020fffff010a00000000000000000000000105010d21a52105010d23a52105010d25a52105010d27a52101013c32a9210c00a52100ffffffff'
        ],
        received: ['94014000ad1f020d0421213fb01b000023233fb21b000025253fb41b000027273fb61b00000c01000001b81b000000b11f020d0421213eb01b000023233eb21b000025253eb41b000027273eb61b00000c01000002b81b000000b51f020d0421213db01b000023233db21b000025253db41b000027273db61b00000c01000003b81b000000b91f020d0421213cb01b000023233cb21b000025253cb41b000027273cb61b00000c01000004b81b000000bd1f020d0421213bb01b000023233bb21b000025253bb41b000027273bb61b00000c01000005b81b000000c11f020d0421213ab01b000023233ab21b000025253ab41b000027273ab61b00000c01000006b81b000000c51f020d04212139b01b0000232339b21b0000252539b41b0000272739b61b00000c01000007b81b000000c91f020d04212138b01b0000232338b21b0000252538b41b0000272738b61b00000c01000008b81b000000cd1f020d04212137b01b0000232337b21b0000252537b41b0000272737b61b00000c01000009b81b000000d11f020d04212136b01b0000232336b21b0000252536b41b0000272736b61b00000c0100000ab81b000000d51f020d04212135b01b0000232335b21b0000252535b41b0000272735b61b00000c0100000bb81b000000d91f020d04212134b01b0000232334b21b0000252534b41b0000272734b61b00000c0100000cb81b000000dd1f020d04212133b01b0000232333b21b0000252533b41b0000272733b61b00000c0100000db81b000000e11f020d04212132b01b0000232332b21b0000252532b41b0000272732b61b00000c0100000eb81b000000e51f020d04212131b01b0000232331b21b0000252531b41b0000272731b61b00000c0100000fb81b000000e91f020d04212130b01b0000232330b21b0000252530b41b0000272730b61b00000c01000010b81b000000ed1f020d0421212fb01b000023232fb21b000025252fb41b000027272fb61b00000c01000011b81b000000f11f020d0421212eb01b000023232eb21b000025252eb41b000027272eb61b00000c01000012b81b000000f51f020d0421212db01b000023232db21b000025252db41b000027272db61b00000c01000013b81b000000f91f020d0421212cb01b000023232cb21b000025252cb41b000027272cb61b00000c01000014b81b000000fd1f020d0421212bb01b000023232bb21b000025252bb41b000027272bb61b00000c01000015b81b0000008120020d0421212ab01b000023232ab21b000025252ab41b000027272ab61b00000c01000016b81b0000008520020d04212129b01b0000232329b21b0000252529b41b0000272729b61b00000c01000017b81b0000008920020d04212128b01b0000232328b21b0000252528b41b0000272728b61b00000c01000018b81b0000008d20020d04212127b01b0000232327b21b0000252527b41b0000272727b61b00000c01000019b81b0000009120020d04212126b01b0000232326b21b0000252526b41b0000272726b61b00000c0100001ab81b0000009520020d04212125b01b0000232325b21b0000252525b41b0000272725b61b00000c0100001bb81b0000009920020d04212124b01b0000232324b21b0000252524b41b0000272724b61b00000c0100001cb81b0000009d20020d04212123b01b0000232323b21b0000252523b41b0000272723b61b00000c0100001db81b000000a120020d04212122b01b0000232322b21b0000252522b41b0000272722b61b00000c0100001eb81b000000a520020d04212121b01b0000232321b21b0000252521b41b0000272721b61b00000c0100001fb81b000000a920020d04212120b01b0000232320b21b0000252520b41b0000272720b61b00000c01000020b81b000000ad20020d0421211fb01b000023231fb21b000025251fb41b000027271fb61b00000c01000021b81b000000b120020d0421211eb01b000023231eb21b000025251eb41b000027271eb61b00000c01000022b81b000000b520020d0421211db01b000023231db21b000025251db41b000027271db61b00000c01000023b81b000000b920020d0421211cb01b000023231cb21b000025251cb41b000027271cb61b00000c01000024b81b000000bd20020d0421211bb01b000023231bb21b000025251bb41b000027271bb61b00000c01000025b81b000000c120020d0421211ab01b000023231ab21b000025251ab41b000027271ab61b00000c01000026b81b000000c520020d04212119b01b0000232319b21b0000252519b41b0000272719b61b00000c01000027b81b000000c920020d04212118b01b0000232318b21b0000252518b41b0000272718b61b00000c01000028b81b000000cd20020d04212117b01b0000232317b21b0000252517b41b0000272717b61b00000c01000029b81b000000d120020d04212116b01b0000232316b21b0000252516b41b0000272716b61b00000c0100002ab81b000000d520020d04212115b01b0000232315b21b0000252515b41b0000272715b61b00000c0100002bb81b000000d920020d04212114b01b0000232314b21b0000252514b41b0000272714b61b00000c0100002cb81b000000dd20020d04212113b01b0000232313b21b0000252513b41b0000272713b61b00000c0100002db81b000000e120020d04212112b01b0000232312b21b0000252512b41b0000272712b61b00000c0100002eb81b000000e520020d04212111b01b0000232311b21b0000252511b41b0000272711b61b00000c0100002fb81b000000e920020d04212110b01b0000232310b21b0000252510b41b0000272710b61b00000c01000030b81b000000ed20020d0421210fb01b000023230fb21b000025250fb41b000027270fb61b00000c01000031b81b000000f120020d0421210eb01b000023230eb21b000025250eb41b000027270eb61b00000c01000032b81b000000f520020d0421210db01b000023230db21b000025250db41b000027270db61b00000c01000033b81b000000f920020d0421210cb01b000023230cb21b000025250cb41b000027270cb61b00000c01000034b81b000000fd20020d0421210bb01b000023230bb21b000025250bb41b000027270bb61b00000c01000035b81b0000008121020d0421210ab01b000023230ab21b000025250ab41b000027270ab61b00000c01000036b81b0000008521020d04212109b01b0000232309b21b0000252509b41b0000272709b61b00000c01000037b81b0000008921020d04212108b01b0000232308b21b0000252508b41b0000272708b61b00000c01000038b81b0000008d21020d04212107b01b0000232307b21b0000252507b41b0000272707b61b00000c01000039b81b0000009121020d04212106b01b0000232306b21b0000252506b41b0000272706b61b00000c0100003ab81b0000009521020d04212105b01b0000232305b21b0000252505b41b0000272705b61b00000c0100003bb81b0000009921020d04212104b01b0000232304b21b0000252504b41b0000272704b61b00000c0100003cb81b0000009d21020d04212103b01b0000232303b21b0000252503b41b0000272703b61b00000c0100003db81b000000a121020d04212102b01b0000232302b21b0000252502b41b0000272702b61b00000c0100003eb81b000000a521020d04212101b01b0000232301b21b0000252501b41b0000272701b61b00000c0100003fb81b000000a921020d042121000000002323000000002525000000002727000000000c01000040b81b0000']
      }
    ]
  }
]

interface MultiScenario {
  title: string
  screen: 'inventory' | 'workbench'
  uuid: string
  // a stack of `count` in each hotbar slot
  given: ReadonlyArray<readonly [item: string, metadata: number]>
  count: number
  recipe: (recorded: RecordedMulti) => GivenRecipe
  recorded: readonly RecordedMulti[]
}

const MULTIS: readonly MultiScenario[] = [
  {
    title: 'firework rockets from 22 paper and 22 gunpowder, the crafts after the first by the fireworks\' multi recipe (up to 1.20.40 each after its crafting_event; from 1.21.20 21 to the offhand, then one more)',
    screen: 'inventory',
    uuid: '00000000-0000-0000-0200-000000000000',
    given: [['paper', 0], ['gunpowder', 0]],
    count: 22,
    recipe: ({ networkId, uuid }) => ({ type: 'shapeless', id: 'paper_sulphur_recipeId', networkId, uuid, priority: 50, input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3, nbt: ROCKET_FLIGHT }] }),
    recorded: MULTI_ROCKETS
  },
  {
    title: 'enhanced empty maps from 64 empty maps and 64 compasses, the crafts after the first by the map extending multi recipe',
    screen: 'inventory',
    uuid: '4b43944b-9422-cdae-2793-2cbb99446786',
    given: [['empty_map', 1], ['compass', 0]],
    count: 64,
    recipe: ({ networkId, uuid }) => ({ type: 'shapeless', id: 'minecraft:basic_map_to_enhanced', networkId, uuid, input: [{ item: 'empty_map', metadata: 1 }, { item: 'compass' }], output: [{ item: 'empty_map', count: 1, metadata: 2 }] }),
    recorded: MAPS
  },
  {
    title: 'decorated pots from four stacks of bricks at a crafting table, the crafts after the first by the decorated pot\'s multi recipe, the pot with an empty compound',
    screen: 'workbench',
    uuid: '4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88',
    given: [['brick', 0], ['brick', 0], ['brick', 0], ['brick', 0]],
    count: 64,
    recipe: ({ networkId, uuid }) => ({ type: 'shaped', id: 'decorated_pot_base_recipeId', networkId, uuid, priority: 50, width: 3, height: 3, input: [null, { item: 'brick' }, null, { item: 'brick' }, null, { item: 'brick' }, null, { item: 'brick' }, null], output: [{ item: 'decorated_pot', count: 1, blockRuntimeId: 340115056 }] }),
    recorded: POTS
  }
]

// its bamboo planks experimental then, recorded on 1.19.50.2
const BAMBOO_BED = {
  firstRequest: -761,
  stackId: 958,
  recipe: { type: 'shaped', id: 'bed_color_bamboo_0', networkId: 1763, uuid: '534a49f8-d3f4-1134-81ed-ef3a7ce5d6a1', priority: 2, width: 3, height: 2, input: [{ item: 'wool', metadata: 0 }, { item: 'wool', metadata: 0 }, { item: 'wool', metadata: 0 }, { item: 'bamboo_planks' }, { item: 'bamboo_planks' }, { item: 'bamboo_planks' }], output: [{ item: 'bed', count: 1 }] } satisfies GivenRecipe,
  sent: '930103f10b0101010c00fc0e0d200000fffffffff50b0101010c00f10b0d210000fffffffff90b0101010c00f50b0d220000ffffffff',
  received: '94010300f10b020c01000002fc0e00000d01202001fe0e000000f50b020c01000001fc0e00000d01212101800f000000f90b020c010000000000000d01222201fc0e0000'
}

const AUTO_CRAFTS: ReadonlyArray<{ title: string, recorded: readonly RecordedAutoCraft[] }> = [
  { title: 'crafting sticks from planks, the recipe naming a tag: the ingredient the item it took, of any metadata up to 1.26.30, by name from 1.26.40', recorded: STICKS },
  { title: 'crafting a cake, its buckets placed before it, each after create', recorded: CAKES },
  { title: 'crafting all the honey blocks 256 honey bottles make: the 256 glass bottles four stacks, each place after create', recorded: HONEY_BLOCKS },
  { title: 'crafting all the cakes the ingredients make: 18 buckets a stack of 16 and 2, each place after create', recorded: CAKE_ALLS },
  { title: 'crafting a dispenser, its metadata its block\'s facing (1.26.40+)', recorded: DISPENSERS },
  { title: 'crafting a wooden pickaxe, a damageable result told without the Damage a grid\'s craft tells', recorded: PICKAXES }
]

describe('bedrock crafting', () => {
  for (const recorded of BUTTONS) {
    describe(`the vanilla client crafting by the recipe book (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: an acacia button from the planks in hotbar slot 0, the button to the slot the planks left`, async () => {
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
          const { item, metadata, block, stackId } = recorded.planks
          const button: GivenRecipe = {
            type: 'shaped',
            id: 'ButtonAcacia_recipeId',
            networkId: recorded.networkId,
            uuid: recorded.uuid,
            priority: 50,
            input: [{ item, metadata: block === undefined ? metadata ?? 0 : 4 }],
            output: [{ item: 'acacia_button', count: 1, blockRuntimeId: recorded.blockRuntimeId }]
          }
          recipes.send([button])
          inventory.slot('inventory', 0, { id: idOf(item), metadata: metadata ?? 0, blockRuntimeId: block === undefined ? 0 : stateIdOf(bot, item, block), count: 1, stackId })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const sent = sentSince(server)
          const [recipe] = bot.recipesFor(idOf('acacia_button'), null, 1, false)
          assert.ok(recipe !== undefined)
          const crafted = bot.craft(recipe, 1)
          await driver.tick()
          assert.deepStrictEqual(sent(), [...recorded.event === null ? [] : [recorded.event], recorded.request])
          receive(server, recorded.response)
          await driver.tick()
          await crafted
          // the new item in the hand told as the client told it
          assert.strictEqual(sent().at(-1), recorded.held)
          assert.deepStrictEqual([bot.heldItem?.name, bot.heldItem?.count, bot.heldItem?.stackId, errors], ['acacia_button', 1, recorded.firstRequest === -7 ? 11 : 3, []])
          bot.end()
        })
      }
    })
  }

  for (const scenario of BOOK) {
    for (const recorded of scenario.recorded) {
      describe(`the vanilla client ${scenario.title} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
        for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
          it(`bedrock ${version}: cobblestone slabs at a crafting table`, async () => {
            const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
            recipes.send([recorded.recipe])
            const [cobblestone] = recorded.recipe.input
            assert.ok(cobblestone !== null && cobblestone !== undefined && 'item' in cobblestone)
            inventory.slot('inventory', 0, { id: idOf(cobblestone.item), count: scenario.cobblestone, stackId: recorded.stackId })
            openScreen(server, 'workbench')
            await driver.tick()
            internal._core.requestIds.continueProcess(recorded.firstRequest)
            const [slab] = recorded.recipe.output
            const recipe = bot.recipesAll(idOf(slab?.item ?? ''), null, true).find(({ id }) => id === recorded.recipe.id)
            assert.ok(recipe !== undefined)
            const sent = craftingSince(server)
            const made: Array<Promise<void>> = []
            for (const [index, gesture] of scenario.gestures(bot, recipe, recorded).entries()) {
              made.push(...gesture())
              await driver.tick()
              receive(server, ...recorded.segments[index]?.received ?? [])
              await driver.tick()
              assert.deepStrictEqual(sent(), recorded.segments[index]?.sent)
            }
            await Promise.all(made)
            assert.deepStrictEqual(errors, [])
            bot.end()
          })
        }
      })
    }
  }

  for (const recorded of ROCKETS) {
    describe(`the vanilla client selecting the firework rockets' recipe, then shift clicking the output: the rockets to the inventory, from 1.18.30 to the offhand first (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: three rockets from paper and gunpowder on the inventory screen`, async () => {
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
          recipes.send([{ type: 'shapeless', id: 'paper_sulphur_recipeId', networkId: recorded.networkId, uuid: recorded.uuid, priority: 50, input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3, nbt: ROCKET_FLIGHT }] }])
          inventory.slot('inventory', 0, { id: idOf('paper'), count: 1, stackId: recorded.stackIds[0] })
          inventory.slot('inventory', 1, { id: idOf('gunpowder'), count: 1, stackId: recorded.stackIds[1] })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const recipe = bot.recipesAll(idOf('firework_rocket'), null, false).find(({ id }) => id === 'paper_sulphur_recipeId')
          assert.ok(recipe !== undefined)
          const sent = craftingSince(server)
          for (const [index, gesture] of [async () => await bot.placeRecipe(recipe), async () => await bot.clickWindow(0, 0, 1)].entries()) {
            const made = gesture()
            await driver.tick()
            receive(server, ...recorded.segments[index]?.received ?? [])
            await driver.tick()
            await made
            assert.deepStrictEqual(sent(), recorded.segments[index]?.sent)
          }
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    })
  }

  for (const scenario of MULTIS) {
    for (const recorded of scenario.recorded) {
      describe(`the vanilla client crafting ${scenario.title} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
        for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
          it(`bedrock ${version}: selected with all, then shift clicked`, async () => {
            const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
            const given = scenario.recipe(recorded)
            recipes.send([given, { type: 'multi', uuid: scenario.uuid, networkId: recorded.multi }])
            for (const [slot, [item, metadata]] of scenario.given.entries()) inventory.slot('inventory', slot, { id: idOf(item), metadata, count: scenario.count, stackId: recorded.stackIds[slot] ?? 0 })
            openScreen(server, scenario.screen)
            await driver.tick()
            internal._core.requestIds.continueProcess(recorded.firstRequest)
            const [result] = given.output
            const recipe = bot.recipesAll(idOf(result?.item ?? ''), null, true).find(({ id }) => id === given.id)
            assert.ok(recipe !== undefined)
            const sent = craftingSince(server)
            for (const [index, gesture] of [async () => await bot.placeRecipe(recipe, true), async () => await bot.clickWindow(0, 0, 1)].entries()) {
              const made = gesture()
              await driver.tick()
              receive(server, ...recorded.segments[index]?.received ?? [])
              await driver.tick()
              await made
              assert.deepStrictEqual(sent(), recorded.segments[index]?.sent)
            }
            assert.deepStrictEqual(errors, [])
            bot.end()
          })
        }
      })
    }
  }

  describe('the vanilla client selecting a recipe the inventory has some of the ingredients of: those it has placed (1.19.50 – 1.19.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.50', 'bedrock_1.19.80')) {
      it(`bedrock ${version}: a bamboo bed's wool, without the bamboo planks, then a shift click on the output sending nothing`, async () => {
        const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
        recipes.send([BAMBOO_BED.recipe])
        inventory.slot('inventory', 0, { id: idOf('wool'), count: 3, stackId: BAMBOO_BED.stackId })
        openScreen(server, 'workbench')
        await driver.tick()
        internal._core.requestIds.continueProcess(BAMBOO_BED.firstRequest)
        const recipe = bot.recipesAll(idOf('bed'), null, true).find(({ id }) => id === BAMBOO_BED.recipe.id)
        assert.ok(recipe !== undefined)
        const sent = craftingSince(server)
        const placed = bot.placeRecipe(recipe)
        await driver.tick()
        receive(server, BAMBOO_BED.received)
        await driver.tick()
        await placed
        assert.deepStrictEqual(sent(), [BAMBOO_BED.sent])
        await Promise.all([bot.clickWindow(0, 0, 1), driver.tick()])
        assert.deepStrictEqual([sent(), errors], [[], []])
        bot.end()
      })
    }
  })

  describe('the vanilla client crafting what it put in a grid, by clicking the output (1.26.51)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      for (const recorded of GRID_CRAFTS) {
        it(`bedrock ${version}: ${recorded.name}`, async () => {
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version, { hashes: true })
          recipes.send([recorded.recipe])
          openScreen(server, recorded.screen)
          for (const [slot, item, stackId, count = 1] of recorded.given) inventory.slot('ui', slot, { id: idOf(item), count, stackId })
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const clicks: Array<Promise<void>> = []
          if (recorded.before !== undefined) {
            clicks.push(bot.clickWindow(...recorded.before))
            await driver.tick()
          }
          const sent = craftingSince(server)
          clicks.push(bot.clickWindow(...recorded.click))
          await driver.tick()
          assert.deepStrictEqual(sent(), [recorded.request])
          receive(server, recorded.response)
          await driver.tick()
          await clicks.at(-1)
          assert.deepStrictEqual(errors, [])
          bot.end()
          Promise.allSettled(clicks).catch(() => {})
        })
      }
    }
  })

  // recorded on 1.26.51.1: the place's response came in the frame before the shift click's tick
  describe('the vanilla client telling what a click put in the hand once its response came, an earlier response come before the click\'s tick notwithstanding (1.26.51)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: sticks shift clicked to the empty hotbar slot 0`, async () => {
        const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version, { hashes: true })
        recipes.send([{ type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: 'e74d2753-a3f5-ef68-d641-6bc87424f491', priority: -1, height: 2, input: [PLANKS, PLANKS], output: [{ item: 'stick', count: 4 }] }])
        openScreen(server, 'inventory')
        for (const [slot, stackId, count] of [[0, 13, 1], [28, 14, 2], [30, 15, 1]] as const) inventory.slot('ui', slot, { id: idOf('oak_planks'), count, stackId })
        await driver.tick()
        internal._core.requestIds.continueProcess(-39)
        const sent = sentSince(server)
        const place = bot.clickWindow(3, 0, 0)
        await driver.tick()
        assert.deepStrictEqual(sent(), ['9301014d010101013b00000d0000000d001e0f00000000ffffffff'])
        receive(server, '940101004d01023b0001000000000000000d00011e1e02011e000000')
        await driver.frame(10)
        const shift = bot.clickWindow(0, 0, 1)
        await driver.tick()
        assert.deepStrictEqual(sent(), ['93010151050a0cad0c0211130101010f6d696e6563726166743a737469636b000400000a00000000000000000000010505020d001c0e0000000505020d001e0f0000000101083c0032d7ffffff0c00000000000000ffffffff'])
        receive(server, '940101005101020d00021c1c00000000001e1e00000000000c00010000080120000000')
        await driver.tick()
        assert.deepStrictEqual(sent(), ['21040000', '1f01430108000000000a00000000000000000000000000'])
        await Promise.all([place, shift])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })
    }
  })

  describe('the vanilla client selecting a recipe with shift: a shift click in the select\'s pass crafts once, in its packet (1.26.51)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      for (const recorded of SELECT_SHIFTS) {
        it(`bedrock ${version}: ${recorded.name}`, async () => {
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version, { hashes: true })
          recipes.send([recorded.recipe])
          const [item, stackId, count] = recorded.given
          inventory.slot('inventory', 0, { id: idOf(item), count, stackId })
          openScreen(server, recorded.screen)
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const [result] = recorded.recipe.output
          const [recipe] = bot.recipesAll(idOf(result?.item ?? ''), null, true)
          assert.ok(recipe !== undefined)
          const sent = craftingSince(server)
          const made = [bot.placeRecipe(recipe, true), bot.clickWindow(0, 0, 1)]
          await driver.tick()
          assert.deepStrictEqual(sent(), [recorded.request])
          receive(server, recorded.response)
          await driver.tick()
          await Promise.all(made)
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    }
  })

  for (const { title, recorded: cases } of AUTO_CRAFTS) {
    for (const recorded of cases) {
      describe(`the vanilla client ${title} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
        for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
          it(`bedrock ${version}: ${recorded.recipe.id}, ${recorded.times} times`, async () => {
            const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version, { hashes: true })
            recipes.send([recorded.recipe])
            for (const { slot, item, metadata, count, stackId } of recorded.given) inventory.slot('inventory', slot, { id: idOf(item), metadata: metadata ?? 0, count, stackId })
            openScreen(server, recorded.screen)
            await driver.tick()
            internal._core.requestIds.continueProcess(recorded.firstRequest)
            const [result] = recorded.recipe.output
            const recipe = bot.recipesFor(idOf(result?.item ?? ''), null, null, recorded.screen === 'workbench').find(({ id }) => id === recorded.recipe.id)
            assert.ok(recipe !== undefined)
            const sent = craftingSince(server)
            const crafted = bot.craft(recipe, recorded.times)
            await driver.tick()
            receive(server, ...recorded.received)
            await driver.tick()
            await crafted
            assert.deepStrictEqual([sent(), errors], [recorded.sent, []])
            bot.end()
          })
        }
      })
    }
  }

  for (const recorded of SHEARS) {
    describe(`the vanilla client holding the shears the recipe book crafted, told without Damage: ${recorded.to === 'bedrock_1.19.10' ? 'with Damage 0' : 'without it'} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: shears from two iron ingots in hotbar slot 0`, async () => {
          const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
          recipes.send([recorded.recipe])
          for (const { slot, item, count, stackId } of recorded.given) inventory.slot('inventory', slot, { id: idOf(item), count, stackId })
          openScreen(server, recorded.screen)
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const sent = sentSince(server)
          const [recipe] = bot.recipesFor(idOf('shears'), null, 1, false)
          assert.ok(recipe !== undefined)
          const crafted = bot.craft(recipe, recorded.times)
          await driver.tick()
          assert.deepStrictEqual(sent(), recorded.sent)
          receive(server, ...recorded.received)
          await driver.tick()
          await crafted
          assert.deepStrictEqual([sent().at(-1), errors], [recorded.held, []])
          bot.end()
        })
      }
    })
  }

  // recorded on 1.26.51.1: the server gives a bundle a bundle_id, which the dyed bundle keeps
  describe('the vanilla client dyeing a bundle, the result keeping the bundle\'s bundle_id (1.26.51)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: a black bundle from a bundle and an ink sac`, async () => {
        const { bot, internal, server, driver, errors, inventory, recipes, idOf } = await joined(version)
        recipes.send([{ type: 'shulker_box', id: 'bundle_dye_0', networkId: 2892, uuid: '6247a7a2-9202-84b3-c07d-eee7e33214a8', input: [{ item: 'bundle' }, { item: 'ink_sac' }], output: [{ item: 'black_bundle', count: 1 }] }])
        inventory.slot('inventory', 0, { id: idOf('bundle'), count: 1, stackId: 237, ints: { bundle_id: 0 } })
        inventory.slot('inventory', 1, { id: idOf('ink_sac'), count: 1, stackId: 239 })
        openScreen(server, 'inventory')
        await driver.tick()
        internal._core.requestIds.continueProcess(-95)
        const sent = craftingSince(server)
        const [recipe] = bot.recipesFor(idOf('black_bundle'), null, 1, false)
        assert.ok(recipe !== undefined)
        const crafted = bot.craft(recipe)
        await driver.tick()
        receive(server, '94010100bd0101010c000200000101e00300000001010000000000')
        await driver.tick()
        await crafted
        assert.deepStrictEqual([sent(), errors], [['930101bd01050b0dcc1601020101106d696e6563726166743a62756e646c65feff0301000101116d696e6563726166743a696e6b5f736163feff0301001113010101166d696e6563726166743a626c61636b5f62756e646c65000100001fffff010a000003090062756e646c655f696400000000000000000000000000010505010c0000ed0000000505010c0001ef0000000101013c0032a1ffffff0c0000a1ffffff00ffffffff'], []])
        bot.end()
      })
    }
  })

  describe('an item but a bundle made of a bundle, without its bundle_id (1.26.51)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51', 'bedrock_1.26.51')) {
      it(`bedrock ${version}: a stick from a bundle, by a recipe a server may send`, async () => {
        const { bot, server, driver, errors, inventory, recipes, idOf } = await joined(version)
        recipes.send([{ type: 'shapeless', id: 'bundle_stick', networkId: 3000, uuid: '00000000-0000-0000-0000-000000000002', input: [{ item: 'bundle' }], output: [{ item: 'stick', count: 1 }] }])
        inventory.slot('inventory', 0, { id: idOf('bundle'), count: 1, stackId: 237, ints: { bundle_id: 0 } })
        openScreen(server, 'inventory')
        await driver.tick()
        const [recipe] = bot.recipesFor(idOf('stick'), null, 1, false)
        assert.ok(recipe !== undefined)
        const crafted = bot.craft(recipe)
        await driver.tick()
        const [result] = server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[1]?.result_items ?? []
        const stick = bot.inventory.slots.find(item => item?.name === 'stick')
        assert.deepStrictEqual([result !== undefined && 'name' in result ? [result.name, result.extra?.has_nbt] : result, stick?.slot, stick?.nbt, errors], [['minecraft:stick', 0], 36, null, []])
        bot.end()
        crafted.catch(() => {})
      })
    }
  })

  describe('the vanilla client telling a damageable item crafted in the grid with Damage 0, as recorded on every build', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201')) {
      it(`bedrock ${version}: a wooden hoe`, async () => {
        const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
        recipes.send([{ type: 'shaped', id: 'hoe', networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', height: 2, input: [{ item: 'stick' }, { item: 'stick' }], output: [{ item: 'wooden_hoe', count: 1 }] }])
        openScreen(server, 'inventory')
        for (const slot of [28, 30]) inventory.slot('ui', slot, { id: idOf('stick'), count: 1, stackId: slot })
        await driver.tick()
        const click = bot.clickWindow(0, 0, 0)
        await driver.tick()
        const [result] = server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[1]?.result_items ?? []
        // up to 1.16.210 an aux item, its NBT its own, from 1.16.220 its extra data's
        assert.ok(JSON.stringify(result).includes('"nbt":{"type":"compound","name":"","value":{"Damage":{"type":"int","value":0}}}'))
        bot.end()
        click.catch(() => {})
      })
    }
  })

  describe('crafting_data\'s recipes, as the bot shows them: Java\'s fields, a tag\'s or an alias\'s first item for its cells', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.21')) {
      it(`bedrock ${version}: items by network id and data (up to 1.19.21), 32767 any`, async () => {
        const { bot, server, driver, recipes, idOf } = await joined(version)
        recipes.send([
          { type: 'shaped', id: 'sticks', networkId: 7, uuid: '00000000-0000-0000-0000-000000000001', height: 2, input: [{ item: 'planks' }, { item: 'planks' }], output: [{ item: 'stick', count: 4 }] },
          { type: 'shapeless', id: 'two', networkId: 8, uuid: '00000000-0000-0000-0000-000000000002', input: [{ item: 'planks', metadata: 2 }, { item: 'stick', count: 2 }], output: [{ item: 'stick', count: 1 }] },
          { type: 'shaped', id: 'gap', networkId: 9, uuid: '00000000-0000-0000-0000-000000000003', width: 2, input: [null, { item: 'stick' }], output: [{ item: 'ladder', count: 3 }] }
        ])
        openScreen(server, 'inventory')
        await driver.tick()
        const [sticks, two] = bot.recipesAll(idOf('stick'), null, true)
        const [planks, stick] = [idOf('planks'), idOf('stick')]
        assert.deepStrictEqual([sticks?.inShape, sticks?.ingredients, sticks?.delta, sticks?.requiresTable], [[[{ id: planks, metadata: null, count: 1 }], [{ id: planks, metadata: null, count: 1 }]], null, [{ id: planks, metadata: null, count: -2 }, { id: stick, metadata: 0, count: 4 }], false])
        const [gap] = bot.recipesAll(idOf('ladder'), null, false)
        assert.deepStrictEqual(gap?.inShape, [[{ id: -1, metadata: null, count: 1 }, { id: stick, metadata: null, count: 1 }]])
        assert.deepStrictEqual([two?.inShape, two?.ingredients, two?.delta, two?.result, two?.results], [null, [{ id: planks, metadata: 2, count: -1 }, { id: stick, metadata: null, count: -2 }], [{ id: planks, metadata: 2, count: -1 }, { id: stick, metadata: null, count: -2 }, { id: stick, metadata: 0, count: 1 }], { id: stick, metadata: 0, count: 1 }, [{ id: stick, metadata: 0, count: 1 }]])
        bot.end()
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.19.70', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: an item_tag's items those whose tags include it, a complex_alias's its items (1.19.70 – 1.26.30)`, async () => {
        const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
        recipes.send([
          { type: 'shaped', id: 'torch', networkId: 9, uuid: '00000000-0000-0000-0000-000000000003', height: 2, input: [{ alias: 'minecraft:coal' }, { item: 'stick' }], output: [{ item: 'torch', count: 4 }] },
          { type: 'shapeless', id: 'button', networkId: 10, uuid: '00000000-0000-0000-0000-000000000004', input: [{ tag: 'minecraft:planks' }], output: [{ item: 'stone_button', count: 1 }] },
          { type: 'shapeless', id: 'nothing', networkId: 11, uuid: '00000000-0000-0000-0000-000000000005', input: [{ molang: 'query.is_item_name_any(\'stick\')' }, { alias: 'minecraft:nothing' }, { tag: 'minecraft:nothing' }], output: [{ item: 'stick', count: 1 }] },
          { type: 'shaped', id: 'gap', networkId: 12, uuid: '00000000-0000-0000-0000-000000000006', width: 2, input: [null, { item: 'stick' }], output: [{ item: 'ladder', count: 3 }] }
        ])
        inventory.slot('inventory', 0, { id: idOf('charcoal'), count: 2, stackId: 2 })
        inventory.slot('inventory', 1, { id: idOf('stick'), count: 2, stackId: 3 })
        openScreen(server, 'inventory')
        await driver.tick()
        assert.deepStrictEqual(bot.recipesFor(idOf('torch'), null, 1, false).map(({ id, inShape }) => [id, inShape?.[0]?.[0]?.id]), [['torch', idOf('coal')]])
        // 5 torches two crafts, 9 three
        assert.deepStrictEqual([bot.recipesFor(idOf('torch'), null, 5, false).map(({ id }) => id), bot.recipesFor(idOf('torch'), null, 9, false)], [['torch'], []])
        const [button] = bot.recipesAll(idOf('stone_button'), 0, false)
        assert.deepStrictEqual([button?.id, button?.ingredients?.[0]?.metadata, bot.recipesFor(idOf('stone_button'), null, 1, false)], ['button', null, []])
        // a molang expression, an alias or a tag the registry does not know takes no item: Java's shows none
        assert.deepStrictEqual(bot.recipesAll(idOf('ladder'), null, false).map(({ inShape }) => inShape?.[0]?.map(({ id }) => id)), [[-1, idOf('stick')]])
        const [nothing] = bot.recipesAll(idOf('stick'), null, false)
        assert.deepStrictEqual([nothing?.ingredients?.map(({ id }) => id), bot.recipesFor(idOf('stick'), null, 1, false)], [[-1, -1, -1], []])
        bot.end()
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: a name a complex alias's first (its data one of its items), then an item's; 1.26.60 names an item with its data (1.26.40+)`, async () => {
        const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
        recipes.send([
          { type: 'shaped', id: 'any coal', networkId: 9, uuid: '00000000-0000-0000-0000-000000000003', height: 2, input: [{ item: 'coal' }, { item: 'stick' }], output: [{ item: 'torch', count: 4 }] },
          { type: 'shaped', id: 'coal only', networkId: 10, uuid: '00000000-0000-0000-0000-000000000004', height: 2, input: [{ item: 'coal', metadata: 0 }, { item: 'stick' }], output: [{ item: 'torch', count: 4 }] },
          { type: 'shaped', id: 'charcoal only', networkId: 11, uuid: '00000000-0000-0000-0000-000000000005', height: 2, input: [{ item: 'coal', metadata: 1 }, { item: 'stick' }], output: [{ item: 'torch', count: 4 }] },
          { type: 'shaped', id: 'oak', networkId: 12, uuid: '00000000-0000-0000-0000-000000000006', input: [{ item: 'oak_planks', metadata: 0 }], output: [{ item: 'stone_button', count: 1 }] }
        ])
        inventory.slot('inventory', 0, { id: idOf('charcoal'), count: 1, stackId: 2 })
        inventory.slot('inventory', 1, { id: idOf('stick'), count: 1, stackId: 3 })
        inventory.slot('inventory', 2, { id: idOf('oak_planks'), count: 1, stackId: 4 })
        openScreen(server, 'inventory')
        await driver.tick()
        assert.deepStrictEqual(bot.recipesFor(idOf('torch'), null, 1, false).map(({ id }) => id), ['any coal', 'charcoal only'])
        assert.deepStrictEqual(bot.recipesFor(idOf('stone_button'), null, 1, false).map(({ id, inShape }) => [id, inShape?.[0]?.[0]]), [['oak', { id: idOf('oak_planks'), metadata: 0, count: 1 }]])
        bot.end()
      })
    }
  })

  describe('a block\'s item the server sends with data 0, its block state telling which (1.16.220 – 1.20.61): that state\'s legacy data', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220', 'bedrock_1.20.61')) {
      it(`bedrock ${version}: stripped acacia wood is wood 12, its wood type in three bits; another block's state leaves the data sent`, async () => {
        const { bot, driver, inventory, recipes, idOf } = await joined(version)
        const fromWood = (metadata: number): GivenRecipe => ({ type: 'shapeless', id: `wood ${metadata}`, networkId: metadata + 1, uuid: '00000000-0000-0000-0000-000000000001', input: [{ item: 'wood', metadata }], output: [{ item: 'stick', count: 1 }] })
        recipes.send([fromWood(0), fromWood(4), fromWood(10), fromWood(12)])
        inventory.slot('inventory', 0, { id: idOf('wood'), count: 1, blockRuntimeId: stateIdOf(bot, 'wood', { wood_type: 'acacia', stripped_bit: 1, pillar_axis: 'y' }), stackId: 2 })
        inventory.slot('inventory', 1, { id: idOf('wood'), metadata: 4, count: 1, blockRuntimeId: stateIdOf(bot, 'cobblestone', {}), stackId: 3 })
        await driver.tick()
        assert.deepStrictEqual(bot.recipesFor(idOf('stick'), null, 1, false).map(({ id }) => id), ['wood 4', 'wood 12'])
        bot.end()
      })
    }
  })

  // a hoe's shape mirrored: the cobblestone on top, the sticks down the left
  for (const { from, to, mirrorsAll } of [{ from: 'bedrock_1.16.201', to: 'bedrock_1.20.71', mirrorsAll: true }, { from: 'bedrock_1.20.80', to: latestSupportedBedrockVersion, mirrorsAll: false }] as const) {
    describe(`the grid matched mirrored, ${mirrorsAll ? 'every shaped recipe: crafting_data has no assume_symmetry' : 'unless the recipe does not assume symmetry'} (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: of the recipes that match, the lowest priority, then the earliest, whatever its network id`, async () => {
          const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
          const hoe = (id: string, networkId: number, priority: number, assumeSymmetry: boolean): GivenRecipe => ({ type: 'shaped', id, networkId, uuid: '00000000-0000-0000-0000-000000000004', priority, width: 2, height: 3, assumeSymmetry, input: [{ item: 'cobblestone' }, { item: 'cobblestone' }, null, { item: 'stick' }, null, { item: 'stick' }], output: [{ item: 'stone_hoe', count: 1 }] })
          recipes.send([hoe('asymmetric', 1, -2, false), hoe('earlier', 3, -1, true), hoe('later', 2, -1, true)])
          openScreen(server, 'workbench')
          for (const slot of [32, 33]) inventory.slot('ui', slot, { id: idOf('cobblestone'), count: 1, stackId: slot })
          for (const slot of [35, 38]) inventory.slot('ui', slot, { id: idOf('stick'), count: 1, stackId: slot })
          await driver.tick()
          const clicked = bot.clickWindow(0, 0, 0)
          await driver.tick()
          assert.strictEqual(server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[0]?.recipe_network_id, mirrorsAll ? 1 : 3)
          bot.end()
          clicked.catch(() => {})
        })
      }
    })
  }

  for (const { from, to, field } of [{ from: 'bedrock_1.16.201', to: 'bedrock_1.17.10', field: 'is_clean' }, { from: 'bedrock_1.17.30', to: latestSupportedBedrockVersion, field: 'clear_recipes' }] as const) {
    describe(`crafting_data replacing the recipes when it clears them (${field}), else adding its own (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: sticks, then ladders added, then torches alone; the fireworks' multi recipe crafting by the id it was given last`, async () => {
          const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
          const making = (item: string, networkId: number): GivenRecipe => ({ type: 'shapeless', id: item, networkId, uuid: '00000000-0000-0000-0000-000000000001', input: [{ item: 'cobblestone' }], output: [{ item, count: 1 }] })
          const rockets = (networkId: number): GivenRecipe => ({ type: 'shapeless', id: 'rockets', networkId, uuid: '00000000-0000-0000-0000-000000000002', priority: 50, input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3, nbt: ROCKET_FLIGHT }] })
          const fireworks = (networkId: number): GivenMulti => ({ type: 'multi', uuid: '00000000-0000-0000-0200-000000000000', networkId })
          const shown = (): number[] => ['stick', 'ladder', 'torch'].map(item => bot.recipesAll(idOf(item), null, false).length)
          recipes.send([making('stick', 1), rockets(4), fireworks(9)])
          await driver.tick()
          const [sticks] = bot.recipesAll(idOf('stick'), null, false)
          assert.ok(sticks !== undefined)
          recipes.send([making('ladder', 2)], false)
          await driver.tick()
          assert.deepStrictEqual(shown(), [1, 1, 0])
          // a recipe given before the ladders still crafts (0 times, as Java's)
          await bot.craft(sticks, 0)
          recipes.send([making('torch', 3), rockets(5), fireworks(19)])
          await driver.tick()
          assert.deepStrictEqual(shown(), [0, 0, 1])
          await assert.rejects(bot.craft(sticks, 0), { message: 'stick is not one of the recipes the server sent' })
          openScreen(server, 'inventory')
          inventory.slot('ui', 28, { id: idOf('paper'), count: 1, stackId: 2 })
          inventory.slot('ui', 29, { id: idOf('gunpowder'), count: 1, stackId: 3 })
          await driver.tick()
          const clicked = bot.clickWindow(0, 0, 0)
          await driver.tick()
          assert.strictEqual(server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[0]?.recipe_network_id, 19)
          bot.end()
          clicked.catch(() => {})
        })
      }
    })
  }

  for (const { from, to, wire } of [{ from: 'bedrock_1.16.201', to: 'bedrock_1.26.30', wire: 'grouped by the codec' }, { from: 'bedrock_1.26.40', to: latestSupportedBedrockVersion, wire: 'a list' }] as const) {
    describe(`a shaped recipe's rows top to bottom, each left to right, as Java's: the wire's cells row by row, ${wire} (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: a bed's wool above its planks (3 × 2), and a 2 × 3, selected into the crafting table's grid from its top left`, async () => {
          const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
          recipes.send([
            { type: 'shaped', id: 'bed', networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', width: 3, height: 2, input: [{ item: 'cobblestone' }, { item: 'cobblestone' }, { item: 'cobblestone' }, { item: 'stick' }, { item: 'stick' }, { item: 'stick' }], output: [{ item: 'ladder', count: 1 }] },
            { type: 'shaped', id: 'two by three', networkId: 2, uuid: '00000000-0000-0000-0000-000000000002', width: 2, height: 3, input: [{ item: 'cobblestone' }, { item: 'stick' }, { item: 'dirt' }, { item: 'sand' }, { item: 'gravel' }, { item: 'flint' }], output: [{ item: 'torch', count: 1 }] }
          ])
          for (const [slot, item] of ['cobblestone', 'stick', 'dirt', 'sand', 'gravel', 'flint'].entries()) inventory.slot('inventory', slot, { id: idOf(item), count: 3, stackId: 2 + slot })
          openScreen(server, 'workbench')
          await driver.tick()
          const nameOf = (id: number): string | undefined => bot.registry.items[id]?.name
          const [bed] = bot.recipesAll(idOf('ladder'), null, true)
          const [twoByThree] = bot.recipesAll(idOf('torch'), null, true)
          assert.ok(bed !== undefined && twoByThree !== undefined)
          assert.deepStrictEqual(bed.inShape?.map(row => row.map(({ id }) => nameOf(id))), [['cobblestone', 'cobblestone', 'cobblestone'], ['stick', 'stick', 'stick']])
          assert.deepStrictEqual(javaShape('white_bed'), [['white_wool', 'white_wool', 'white_wool'], ['oak_planks', 'oak_planks', 'oak_planks']])
          assert.deepStrictEqual(twoByThree.inShape?.map(row => row.map(({ id }) => nameOf(id))), [['cobblestone', 'stick'], ['dirt', 'sand'], ['gravel', 'flint']])
          const placed = [bot.placeRecipe(bed), bot.placeRecipe(twoByThree)]
          await driver.tick()
          const places = server.sentOf('item_stack_request').flatMap(({ requests }) => requests.map(({ actions }) => {
            const to = actions[0]?.destination
            // 1.16.201 names it slot_id
            return to === undefined ? undefined : 'slot' in to ? to.slot : to.slot_id
          }))
          // the bed's cells, the grid's six items handed back, then the 2 × 3's cells
          assert.deepStrictEqual([...places.slice(0, 6), ...places.slice(12)], [32, 33, 34, 35, 36, 37, 32, 33, 35, 36, 38, 39])
          bot.end()
          Promise.allSettled(placed).catch(() => {})
        })
      }
    })
  }

  // the stars' recipes as crafting_data has them, from a gunpowder and a dye
  for (const { from, to, inkSacByMulti } of [{ from: 'bedrock_1.16.201', to: 'bedrock_1.20.0', inkSacByMulti: true }, { from: 'bedrock_1.20.10', to: latestSupportedBedrockVersion, inkSacByMulti: false }] as const) {
    describe(`a grid the fireworks' multi recipe stands for crafted by it: rockets, ${inkSacByMulti ? 'every star' : 'a star of a dye item, not of an ink sac'}; a grid filled by hand (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: rockets and a lime star by the multi recipe, a black star of an ink sac ${inkSacByMulti ? 'by it too' : 'by its own recipe'}`, async () => {
          const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
          const star = (dye: string, networkId: number, color: number): GivenRecipe => ({ type: 'shapeless', id: `star ${dye}`, networkId, uuid: '00000000-0000-0000-0000-000000000001', priority: 50, input: [{ item: 'gunpowder' }, { item: dye }], output: [{ item: 'firework_star', count: 1, metadata: color }] })
          recipes.send([
            { type: 'shapeless', id: 'rockets', networkId: 1, uuid: '00000000-0000-0000-0000-000000000002', priority: 50, input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3, nbt: ROCKET_FLIGHT }] },
            star('ink_sac', 2, 0),
            star('lime_dye', 3, 10),
            { type: 'multi', uuid: '00000000-0000-0000-0200-000000000000', networkId: 9 }
          ])
          openScreen(server, 'inventory')
          const crafted = (): unknown => server.sentOf('item_stack_request').at(-1)?.requests.map(({ actions }) => actions[0]?.recipe_network_id)
          const clicks: Array<Promise<void>> = []
          for (const [first, second, expected] of [['paper', 'gunpowder', 9], ['gunpowder', 'ink_sac', inkSacByMulti ? 9 : 2], ['gunpowder', 'lime_dye', 9]] as const) {
            inventory.slot('ui', 28, { id: idOf(first), count: 1, stackId: 2 })
            inventory.slot('ui', 29, { id: idOf(second), count: 1, stackId: 3 })
            inventory.slot('ui', 0, null)
            await driver.tick()
            clicks.push(bot.clickWindow(0, 0, 0))
            await driver.tick()
            assert.deepStrictEqual(crafted(), [expected])
          }
          bot.end()
          Promise.allSettled(clicks).catch(() => {})
        })
      }
    })
  }

  describe('a block\'s item crafted told by the state the server gave it, as that state\'s legacy data, as an ingredient is read: a chest south 0, west 1, north 2 (as recorded on 1.26.51), east 3 (1.26.40+); held, it has data 0, as the client tells it', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: a chest facing each way, by a hotbar key, the east one to the hand; an output's own data kept`, async () => {
        const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
        openScreen(server, 'inventory')
        const clicks: Array<Promise<void>> = []
        const told: unknown[] = []
        for (const [index, [direction, key, metadata]] of ([['south', 3, 0], ['west', 2, 0], ['north', 1, 0], ['east', 0, 0], ['east', 4, 5]] as const).entries()) {
          recipes.send([{ type: 'shapeless', id: `${direction}${metadata}`, networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', input: [{ item: 'stick' }], output: [{ item: 'chest', count: 1, metadata, blockRuntimeId: stateIdOf(bot, 'chest', { 'minecraft:cardinal_direction': direction }) }] }])
          inventory.slot('ui', 28, { id: idOf('stick'), count: 1, stackId: 2 + index })
          await driver.tick()
          clicks.push(bot.clickWindow(0, key, 2))
          await driver.tick()
          told.push(server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[1]?.result_items?.[0]?.metadata)
        }
        assert.deepStrictEqual(told, [0, 1, 2, 3, 5])
        // 1.26.40 – 1.26.45 flag what a response has
        const flagged = !isBedrockVersionAtLeast(version, 'bedrock_1.26.51')
        const slots = [{ slot: 0, hotbar_slot: 0, count: 1, ...flagged ? { item_stack_id_presence: true } : {}, item_stack_id: 30, custom_name: '', durability_correction: 0 }]
        server.send('item_stack_response', { responses: [{ status: 'ok', request_id: -9, ...flagged ? { containers_presence: true } : {}, containers: [{ slot_type: { container_id: 'hotbar_and_inventory' }, slots }] }] })
        await driver.tick()
        const { item: held } = server.sentOf('mob_equipment').at(-1) ?? {}
        assert.deepStrictEqual([held?.network_id, held?.metadata], [idOf('chest'), 0])
        bot.end()
        Promise.allSettled(clicks).catch(() => {})
      })
    }
  })

  describe('a custom item named by its own namespace, a vanilla one as minecraft\'s (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: a gem and a stick crafted by the recipe book`, async () => {
        const { bot, server, driver, inventory, recipes } = await joined(version)
        const components = { type: 'compound' as const, value: { item_properties: { type: 'compound' as const, value: {} } } }
        const vanilla = (name: string, runtimeId: number): ClientboundPacketsToWrite['item_registry']['itemstates'][number] => ({ name: `minecraft:${name}`, runtime_id: runtimeId, component_based: false, version: 'legacy', nbt: { type: 'compound', name: '', value: {} } })
        server.send('item_registry', { itemstates: [vanilla('stick', 1000), vanilla('oak_planks', 1001), { name: 'test:gem', runtime_id: 5000, component_based: true, version: 'data_driven', nbt: { type: 'compound', name: '', value: { components } } }] })
        await driver.tick()
        recipes.send([
          { type: 'shapeless', id: 'gem', networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', input: [{ item: 'stick' }], output: [{ item: 'test:gem', count: 1 }] },
          { type: 'shapeless', id: 'stick', networkId: 2, uuid: '00000000-0000-0000-0000-000000000002', input: [{ item: 'oak_planks' }], output: [{ item: 'stick', count: 1 }] }
        ])
        inventory.slot('inventory', 0, { id: 1000, count: 1, stackId: 2 })
        inventory.slot('inventory', 1, { id: 1001, count: 1, stackId: 3 })
        openScreen(server, 'inventory')
        await driver.tick()
        const crafts = [...bot.recipesAll(5000, null, false), ...bot.recipesAll(1000, null, false)].map(async recipe => await bot.craft(recipe))
        await driver.tick()
        const told = server.sentOf('item_stack_request').flatMap(({ requests }) => requests.map(({ actions }) => actions[1]?.result_items?.map(item => 'name' in item ? item.name : undefined)))
        assert.deepStrictEqual(told, [['test:gem'], ['minecraft:stick']])
        bot.end()
        Promise.allSettled(crafts).catch(() => {})
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const sticks: GivenRecipe = { type: 'shaped', id: 'minecraft:stick', networkId: 1581, uuid: '00000000-0000-0000-0000-000000000001', priority: -1, height: 2, input: [PLANKS, PLANKS], output: [{ item: 'stick', count: 4 }] }
    const table: GivenRecipe = { type: 'shaped', id: 'minecraft:crafting_table', networkId: 1218, uuid: '00000000-0000-0000-0000-000000000002', width: 2, height: 2, input: [PLANKS, PLANKS, PLANKS, PLANKS], output: [{ item: 'crafting_table', count: 1 }] }
    const slabs: GivenRecipe = { type: 'shaped', id: 'slabs', networkId: 1300, uuid: '00000000-0000-0000-0000-000000000003', width: 3, input: [PLANKS, PLANKS, PLANKS], output: [{ item: 'oak_slab', count: 6 }] }

    function movesSince (server: FakeBedrockClient): () => unknown[] {
      let seen = server.sentOf('item_stack_request').length
      return () => {
        const fresh = server.sentOf('item_stack_request').slice(seen)
        seen += fresh.length
        return fresh.flatMap(({ requests }) => requests.map(({ request_id: id, actions }) => [id, ...actions.map(({ type_id: type, count, source, destination, times_crafted: times, result_slot_id: index }) =>
          [type, count ?? times ?? index, ...[source, destination].filter(slot => slot !== undefined).map(slot => `${String(typeof slot.slot_type === 'object' ? slot.slot_type.container_id : slot.slot_type)}:${slot.slot}#${slot.stack_id}`)])]))
      }
    }

    it('rejects a craft and a select when the bot ends before their input pass', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 2, stackId: 2 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      assert.ok(recipe !== undefined)
      const ended: string[] = []
      for (const call of [bot.craft(recipe), bot.placeRecipe(recipe)]) call.catch((error: Error) => { ended.push(error.message) })
      bot.end()
      await driver.frame(10)
      assert.deepStrictEqual(ended, ['the bot ended', 'the bot ended'])
    })

    it('crafts on the inventory screen it opens itself, then closes it; Java\'s null count once, its null table none', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 2, stackId: 2 })
      await driver.tick()
      const [recipe] = bot.recipesFor(idOf('stick'), null, 1, false)
      assert.ok(recipe !== undefined)
      const moves = movesSince(server)
      const crafted = bot.craft(recipe, null, null)
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('interact').at(-1)?.action_id, 'open_inventory')
      openScreen(server, 'inventory')
      await driver.tick()
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['craft_recipe_auto', 1], ['results_deprecated', 1], ['consume', 1, 'hotbar_and_inventory:0#2'], ['consume', 1, 'hotbar_and_inventory:0#-3'], ['place', 4, 'creative_output:50#-3', 'hotbar_and_inventory:0#-3']]])
      server.send('item_stack_response', { responses: [{ status: 'ok', request_id: -3, containers: [] }] })
      await driver.frames([10, 10, 310, 10])
      assert.deepStrictEqual(server.sentOf('container_close').length, 1)
      server.send('container_close', { window_id: 2, window_type: 'none', server: false })
      await driver.tick()
      await crafted
      bot.end()
    })

    it('crafts on the crafting table it opens itself, a stack\'s worth a request, in one packet, and closes it', async () => {
      const { bot, internal, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 64, stackId: 2 })
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      assert.ok(recipe !== undefined)
      const opened: Block[] = []
      internal.openBlock = async block => {
        opened.push(block)
        openScreen(server, 'workbench')
        await bot.waitForTicks(1)
        return bot.currentWindow ?? bot.inventory
      }
      const table = craftingTable(bot)
      const moves = movesSince(server)
      const crafted = bot.craft(recipe, 20, table)
      await driver.ticks(3)
      const requests = moves().map(request => Array.isArray(request) ? [request[0], request[1], request.filter(action => Array.isArray(action) && action[0] !== 'craft_recipe_auto' && action[0] !== 'results_deprecated')] : request)
      assert.deepStrictEqual([opened, requests, server.sentOf('item_stack_request').at(-1)?.requests.length], [[table], [
        [-3, ['craft_recipe_auto', 16], [['consume', 16, 'hotbar_and_inventory:0#2'], ['consume', 16, 'hotbar_and_inventory:0#-3'], ['place', 64, 'creative_output:50#-3', 'hotbar_and_inventory:1#0']]],
        [-5, ['craft_recipe_auto', 4], [['consume', 4, 'hotbar_and_inventory:0#-3'], ['consume', 4, 'hotbar_and_inventory:0#-5'], ['place', 16, 'creative_output:50#-5', 'hotbar_and_inventory:2#0']]]
      ], 2])
      bot.end()
      crafted.catch(() => {})
    })

    it('names a tag\'s cell by the item it takes, a slot the cells before took all of passed over', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 1, stackId: 2 })
      inventory.slot('inventory', 1, { id: idOf('birch_planks'), count: 1, stackId: 3 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesFor(idOf('stick'), null, 1, false)
      assert.ok(recipe !== undefined)
      const crafted = bot.craft(recipe)
      await driver.tick()
      const [craft] = server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions ?? []
      assert.ok(craft !== undefined && 'ingredients' in craft)
      assert.deepStrictEqual(craft.ingredients?.map(ingredient => 'name' in ingredient ? ingredient.name : undefined), ['minecraft:oak_planks', 'minecraft:birch_planks'])
      bot.end()
      crafted.catch(() => {})
    })

    it('rejects, sending nothing: a recipe it was not sent, or of another crafting_data, crafting no whole times, without the ingredients, without room for the result, without the table a recipe needs, with a table over another window', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks, slabs])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 2, stackId: 2 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      const [slab] = bot.recipesAll(idOf('oak_slab'), null, true)
      assert.ok(recipe !== undefined && slab !== undefined)
      const rejected = [
        assert.rejects(bot.craft({ ...recipe }), { message: 'minecraft:stick is not one of the recipes the server sent' }),
        assert.rejects(bot.craft(recipe, -1), { message: 'craft crafts a whole number of times, not -1' }),
        assert.rejects(bot.craft(recipe, 2), { message: 'the inventory has not the ingredients to craft minecraft:stick 2 times' }),
        assert.rejects(bot.craft(slab), { message: 'slabs needs a crafting table, and none was given' }),
        assert.rejects(bot.placeRecipe(slab), { message: 'slabs does not fit the inventory\'s grid' })
      ]
      rejected.push(assert.rejects(bot.craft(slab, 1, craftingTable(bot)), { message: 'craft cannot craft slabs in the minecraft:inventory window' }))
      // a table given, the craft is the table's, even of a recipe the inventory's grid fits
      rejected.push(assert.rejects(bot.craft(recipe, 1, craftingTable(bot)), { message: 'craft cannot craft minecraft:stick in the minecraft:inventory window' }))
      await driver.tick()
      await Promise.all(rejected)
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => slot === 0 ? { id: idOf('oak_planks'), count: 2, stackId: 2 } : { id: idOf('dirt'), count: 64, stackId: 10 + slot }))
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 64, stackId: 2 })
      await driver.tick()
      const full = assert.rejects(bot.craft(recipe), { message: 'the inventory has no room for what crafting minecraft:stick makes' })
      await driver.tick()
      await full
      recipes.send([table])
      await driver.tick()
      await assert.rejects(bot.craft(recipe), { message: 'minecraft:stick is not one of the recipes the server sent' })
      assert.deepStrictEqual([server.sentOf('item_stack_request'), server.sentOf('crafting_event')], [[], []])
      bot.end()
    })

    it('shows only an input\'s and output\'s recipes of the crafting table, a recipe three high or of five ingredients needing the table; for no result, as Java\'s, those the inventory has no ingredients for', async () => {
      const { bot, server, driver, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      recipes.send([{ ...table, block: 'stonecutter' }, slabs], false)
      server.send('crafting_data', { multi_recipes: [{ uuid: '00000000-0000-0000-0000-000000000009', network_id: 1 }], clear_recipes: false })
      recipes.send([{ type: 'shaped', id: 'tall', networkId: 1500, uuid: '00000000-0000-0000-0000-00000000000b', height: 3, input: [PLANKS, PLANKS, PLANKS], output: [{ item: 'ladder', count: 1 }] }], false)
      recipes.send([
        { type: 'shapeless', id: 'four', networkId: 1501, uuid: '00000000-0000-0000-0000-00000000000c', input: [PLANKS, PLANKS, PLANKS, PLANKS], output: [{ item: 'stone_button', count: 1 }] },
        { type: 'shapeless', id: 'five', networkId: 1502, uuid: '00000000-0000-0000-0000-00000000000d', input: [PLANKS, PLANKS, PLANKS, PLANKS, PLANKS], output: [{ item: 'lever', count: 1 }] }
      ], false)
      await driver.tick()
      assert.deepStrictEqual([bot.recipesAll(idOf('stick'), null, false).length, bot.recipesAll(idOf('crafting_table'), null, true).length, bot.recipesAll(idOf('oak_slab'), 0, true).length, bot.recipesAll(idOf('oak_slab'), 1, true).length], [1, 0, 1, 0])
      assert.deepStrictEqual([bot.recipesFor(idOf('stick'), null, 0, false).length, bot.recipesFor(idOf('stick'), null, 1, false).length], [1, 0])
      assert.deepStrictEqual([bot.recipesAll(idOf('ladder'), null, false).length, bot.recipesAll(idOf('ladder'), null, true).map(({ requiresTable }) => requiresTable)], [0, [true]])
      // a shapeless recipe fits the inventory's grid with four ingredients, not five
      assert.deepStrictEqual(['stone_button', 'lever'].map(name => [bot.recipesAll(idOf(name), null, false).length, bot.recipesAll(idOf(name), null, true).map(({ requiresTable }) => requiresTable)]), [[1, [false]], [0, [true]]])
      bot.end()
    })

    it('selects a recipe after giving back what the grid holds, a request a cell and slot, and with all as many crafts\' as each slot takes; rejects one of whose ingredients the inventory has none', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([table, { type: 'shaped', id: 'diamond block', networkId: 1400, uuid: '00000000-0000-0000-0000-000000000006', input: [{ item: 'diamond' }], output: [{ item: 'diamond_block', count: 1 }] }])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 3, stackId: 2 })
      inventory.slot('inventory', 1, { id: idOf('oak_planks'), count: 6, stackId: 3 })
      openScreen(server, 'inventory')
      inventory.slot('ui', 29, { id: idOf('stick'), count: 1, stackId: 4 })
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('crafting_table'), null, false)
      assert.ok(recipe !== undefined)
      const moves = movesSince(server)
      const placed = [bot.placeRecipe(recipe, true)]
      await driver.tick()
      assert.deepStrictEqual(moves(), [
        [-3, ['place', 1, 'crafting_input:29#4', 'hotbar_and_inventory:2#0']],
        [-5, ['place', 2, 'hotbar_and_inventory:0#2', 'crafting_input:28#0']],
        [-7, ['place', 1, 'hotbar_and_inventory:0#-5', 'crafting_input:29#-3']],
        [-9, ['place', 1, 'hotbar_and_inventory:1#3', 'crafting_input:29#-7']],
        [-11, ['place', 2, 'hotbar_and_inventory:1#-9', 'crafting_input:30#0']],
        [-13, ['place', 2, 'hotbar_and_inventory:1#-11', 'crafting_input:31#0']]
      ])
      const [diamonds] = bot.recipesAll(idOf('diamond_block'), null, false)
      assert.ok(diamonds !== undefined)
      placed.push(assert.rejects(bot.placeRecipe(diamonds, true), { message: 'the inventory has none of the ingredients of diamond block' }))
      await driver.tick()
      await placed[1]
      bot.end()
      placed[0]?.catch(() => {})
    })

    it('selects a shapeless recipe into the grid\'s first slots, and leaves a shaped one\'s empty cells empty', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([
        { type: 'shapeless', id: 'mixed', networkId: 6, uuid: '00000000-0000-0000-0000-000000000007', input: [{ item: 'oak_planks' }, { item: 'stick' }], output: [{ item: 'torch', count: 2 }] },
        { type: 'shaped', id: 'diagonal', networkId: 8, uuid: '00000000-0000-0000-0000-000000000009', width: 2, height: 2, input: [{ item: 'stick' }, null, null, { item: 'oak_planks' }], output: [{ item: 'torch', count: 1 }] }
      ])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 4, stackId: 2 })
      inventory.slot('inventory', 1, { id: idOf('stick'), count: 4, stackId: 3 })
      openScreen(server, 'workbench')
      await driver.tick()
      const [mixed, diagonal] = ['mixed', 'diagonal'].map(id => bot.recipesAll(idOf('torch'), null, true).find(recipe => recipe.id === id))
      assert.ok(mixed !== undefined && diagonal !== undefined)
      const moves = movesSince(server)
      const placed = [bot.placeRecipe(mixed), bot.placeRecipe(diagonal)]
      await driver.tick()
      assert.deepStrictEqual(moves().map(request => Array.isArray(request) ? request[1] : request), [
        ['place', 1, 'hotbar_and_inventory:0#2', 'crafting_input:32#0'],
        ['place', 1, 'hotbar_and_inventory:1#3', 'crafting_input:33#0'],
        ['place', 1, 'crafting_input:32#-3', 'hotbar_and_inventory:0#-3'],
        ['place', 1, 'crafting_input:33#-5', 'hotbar_and_inventory:1#-5'],
        ['place', 1, 'hotbar_and_inventory:1#-9', 'crafting_input:32#-7'],
        ['place', 1, 'hotbar_and_inventory:0#-7', 'crafting_input:36#0']
      ])
      bot.end()
      Promise.allSettled(placed).catch(() => {})
    })

    it('selects as many crafts\' as a grid slot takes a stack of the item for', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ type: 'shapeless', id: 'pearls', networkId: 9, uuid: '00000000-0000-0000-0000-00000000000a', input: [{ item: 'ender_pearl' }], output: [{ item: 'ender_eye', count: 1 }] }])
      inventory.slot('inventory', 0, { id: idOf('ender_pearl'), count: 16, stackId: 2 })
      inventory.slot('inventory', 1, { id: idOf('ender_pearl'), count: 16, stackId: 3 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('ender_eye'), null, false)
      assert.ok(recipe !== undefined)
      const moves = movesSince(server)
      const placed = bot.placeRecipe(recipe, true)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['place', 16, 'hotbar_and_inventory:0#2', 'crafting_input:28#0']]])
      bot.end()
      placed.catch(() => {})
    })

    it('selects, lacking some of a craft\'s ingredients, a craft\'s of those the inventory has, with all too, leaving the others\' cells empty', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ type: 'shapeless', id: 'mixed', networkId: 6, uuid: '00000000-0000-0000-0000-000000000007', input: [{ item: 'oak_planks' }, { item: 'stick' }, { item: 'stick', count: 2 }], output: [{ item: 'torch', count: 2 }] }])
      inventory.slot('inventory', 0, { id: idOf('stick'), count: 2, stackId: 2 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('torch'), null, false)
      assert.ok(recipe !== undefined)
      const moves = movesSince(server)
      const placed = bot.placeRecipe(recipe, true)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['place', 1, 'hotbar_and_inventory:0#2', 'crafting_input:29#0']]])
      bot.end()
      placed.catch(() => {})
    })

    it('takes the result onto the cursor\'s stack of its item while the stack has room for all of it', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      openScreen(server, 'inventory')
      inventory.slot('ui', 28, { id: idOf('oak_planks'), count: 1, stackId: 2 })
      inventory.slot('ui', 30, { id: idOf('oak_planks'), count: 1, stackId: 3 })
      inventory.slot('ui', 0, { id: idOf('stick'), count: 60, stackId: 4 })
      await driver.tick()
      const moves = movesSince(server)
      const clicked = bot.clickWindow(0, 0, 0)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['craft_recipe', 1], ['results_deprecated', 1], ['consume', 1, 'crafting_input:28#2'], ['consume', 1, 'crafting_input:30#3'], ['take', 4, 'creative_output:50#-3', 'cursor:0#4']]])
      bot.end()
      clicked.catch(() => {})
    })

    it('shift clicks firework rockets onto the offhand\'s stack first, then to the inventory, as the vanilla client did from 1.21.20 (63 and 3: 1 and 2)', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ type: 'shapeless', id: 'rockets', networkId: 4, uuid: '00000000-0000-0000-0000-000000000005', input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3 }] }])
      openScreen(server, 'inventory')
      inventory.slot('ui', 28, { id: idOf('paper'), count: 2, stackId: 2 })
      inventory.slot('ui', 29, { id: idOf('gunpowder'), count: 2, stackId: 3 })
      inventory.slot('offhand', 0, { id: idOf('firework_rocket'), count: 62, stackId: 4 })
      await driver.tick()
      const moves = movesSince(server)
      const clicked = bot.clickWindow(0, 0, 1)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['craft_recipe', 2], ['results_deprecated', 1], ['consume', 2, 'crafting_input:28#2'], ['consume', 2, 'crafting_input:29#3'], ['place', 2, 'creative_output:50#-3', 'offhand:1#4'], ['place', 4, 'creative_output:50#-3', 'hotbar_and_inventory:0#0']]])
      bot.end()
      clicked.catch(() => {})
    })

    it('shift clicks firework rockets while only the offhand has room for them', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ type: 'shapeless', id: 'rockets', networkId: 4, uuid: '00000000-0000-0000-0000-000000000005', input: [{ item: 'paper' }, { item: 'gunpowder' }], output: [{ item: 'firework_rocket', count: 3 }] }])
      openScreen(server, 'inventory')
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 10 + slot })))
      inventory.slot('ui', 28, { id: idOf('paper'), count: 2, stackId: 2 })
      inventory.slot('ui', 29, { id: idOf('gunpowder'), count: 2, stackId: 3 })
      await driver.tick()
      const moves = movesSince(server)
      const clicked = bot.clickWindow(0, 0, 1)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['craft_recipe', 2], ['results_deprecated', 1], ['consume', 2, 'crafting_input:28#2'], ['consume', 2, 'crafting_input:29#3'], ['place', 6, 'creative_output:50#-3', 'offhand:1#0']]])
      bot.end()
      clicked.catch(() => {})
    })

    it('rejects a select with no screen open', async () => {
      const { bot, driver, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      assert.ok(recipe !== undefined)
      const rejected = assert.rejects(bot.placeRecipe(recipe), { message: 'minecraft:stick needs an open crafting screen' })
      await driver.tick()
      await rejected
      bot.end()
    })

    it('matches a shapeless recipe by its ingredients in any cells, of the crafting table\'s recipes only', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([
        { type: 'shapeless', id: 'three', networkId: 5, uuid: '00000000-0000-0000-0000-000000000006', priority: -3, input: [{ item: 'oak_planks' }, { item: 'stick' }, { item: 'stick' }], output: [{ item: 'stick', count: 1 }] },
        { type: 'shaped', id: 'cut', networkId: 7, uuid: '00000000-0000-0000-0000-000000000008', block: 'stonecutter', priority: -9, input: [{ item: 'oak_planks' }], output: [{ item: 'stick', count: 1 }] },
        { type: 'shapeless', id: 'dye', networkId: 4, uuid: '00000000-0000-0000-0000-000000000005', input: [{ item: 'oak_planks' }, { item: 'stick' }], output: [{ item: 'stick', count: 1 }] },
        { type: 'shapeless', id: 'mixed', networkId: 6, uuid: '00000000-0000-0000-0000-000000000007', input: [PLANKS, { item: 'oak_planks' }], output: [{ item: 'stick', count: 2 }] },
        { type: 'shaped', id: 'one', networkId: 3, uuid: '00000000-0000-0000-0000-000000000004', input: [{ item: 'oak_planks' }], output: [{ item: 'stick', count: 1 }] }
      ])
      openScreen(server, 'workbench')
      inventory.slot('ui', 40, { id: idOf('oak_planks'), count: 1, stackId: 40 })
      inventory.slot('ui', 32, { id: idOf('stick'), count: 1, stackId: 41 })
      await driver.tick()
      const clicked = [bot.clickWindow(0, 0, 0)]
      const craft = (): unknown => server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[0]?.recipe_network_id
      await driver.tick()
      assert.strictEqual(craft(), 4)
      // the tag takes the oak planks first, which leaves the second cell only the birch: it takes the birch then
      for (const slot of [40, 32]) inventory.slot('ui', slot, null)
      inventory.slot('ui', 0, null)
      inventory.slot('ui', 33, { id: idOf('oak_planks'), count: 1, stackId: 42 })
      inventory.slot('ui', 34, { id: idOf('birch_planks'), count: 1, stackId: 43 })
      await driver.tick()
      clicked.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.strictEqual(craft(), 6)
      // one plank: the crafting table's recipe, though the stonecutter's has the lower priority
      for (const slot of [33, 34, 0]) inventory.slot('ui', slot, null)
      inventory.slot('ui', 36, { id: idOf('oak_planks'), count: 1, stackId: 44 })
      await driver.tick()
      clicked.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.strictEqual(craft(), 3)
      bot.end()
      Promise.allSettled(clicked).catch(() => {})
    })

    it('crafts the recipe the recipe book selected, of recipes alike, while the screen is open; a grid filled by hand the earliest', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ ...sticks, id: 'earlier', networkId: 3 }, { ...sticks, id: 'later', networkId: 2 }])
      openScreen(server, 'inventory')
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 4, stackId: 2 })
      inventory.slot('ui', 28, { id: idOf('oak_planks'), count: 1, stackId: 3 })
      inventory.slot('ui', 30, { id: idOf('oak_planks'), count: 1, stackId: 4 })
      await driver.tick()
      const later = bot.recipesAll(idOf('stick'), null, false).find(({ id }) => id === 'later')
      assert.ok(later !== undefined)
      const craft = (): unknown => server.sentOf('item_stack_request').at(-1)?.requests.at(-1)?.actions[0]?.recipe_network_id
      const made = [bot.clickWindow(0, 0, 0)]
      await driver.tick()
      assert.strictEqual(craft(), 3)
      made.push(bot.placeRecipe(later, true), bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.strictEqual(craft(), 2)
      // a craft ends the select, as the vanilla client's crafts after the first by a multi recipe
      made.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.strictEqual(craft(), 3)
      // the grid holding what the select put there, a screen opened anew has none selected
      made.push(bot.placeRecipe(later))
      await driver.tick()
      openScreen(server, 'inventory')
      made.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.strictEqual(craft(), 3)
      bot.end()
      Promise.allSettled(made).catch(() => {})
    })

    it('sends nothing for an output click the cursor or the key\'s slot blocks, or a shift click without room, or on a grid no recipe matches, as two planks side by side', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks, table])
      openScreen(server, 'inventory')
      inventory.slot('ui', 28, { id: idOf('oak_planks'), count: 1, stackId: 2 })
      inventory.slot('ui', 30, { id: idOf('oak_planks'), count: 1, stackId: 3 })
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 4 })
      inventory.slot('inventory', 2, { id: idOf('dirt'), count: 1, stackId: 5 })
      await driver.tick()
      const clicks = [bot.clickWindow(0, 0, 0), bot.clickWindow(0, 2, 2)]
      await driver.tick()
      inventory.slot('ui', 0, { id: idOf('stick'), count: 61, stackId: 4 })
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 10 + slot })))
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0), bot.clickWindow(0, 0, 1))
      await driver.tick()
      inventory.slot('ui', 30, null)
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      // three of the crafting table's four cells, the cursor empty
      inventory.slot('ui', 0, null)
      inventory.slot('ui', 29, { id: idOf('oak_planks'), count: 1, stackId: 6 })
      inventory.slot('ui', 30, { id: idOf('oak_planks'), count: 1, stackId: 7 })
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      // two planks side by side: the sticks' recipe is one wide
      inventory.slot('ui', 30, null)
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      await Promise.all(clicks)
      assert.deepStrictEqual(server.sentOf('item_stack_request'), [])
      bot.end()
    })

    it('crafts nothing for a count of 0, as Java\'s, and rejects without the ingredients before opening a screen; a refused craft rejects with the refusal, though closing the screen it opened fails too', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 2, stackId: 2 })
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      assert.ok(recipe !== undefined)
      const opened = (): unknown[] => server.sentOf('interact').filter(({ action_id: action }) => action === 'open_inventory')
      await bot.craft(recipe, 0)
      await assert.rejects(bot.craft(recipe, 2), { message: 'the inventory has not the ingredients to craft minecraft:stick 2 times' })
      assert.deepStrictEqual(opened(), [])
      const refused = assert.rejects(bot.craft(recipe), { message: 'the server refused item stack request -3: InvalidCraftRequest' })
      await driver.tick()
      openScreen(server, 'inventory')
      await driver.ticks(2)
      server.send('item_stack_response', { responses: [{ status: 7, request_id: -3 }] })
      // the server never answers the close
      await driver.ticks(120)
      await refused
      assert.deepStrictEqual([opened().length, server.sentOf('container_close').length], [1, 1])
      bot.end()
    })

    it('rejects a craft whose ingredients a craft before it in the input pass took', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 2, stackId: 2 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stick'), null, false)
      assert.ok(recipe !== undefined)
      const crafted = bot.craft(recipe)
      const rejected = assert.rejects(bot.craft(recipe), { message: 'the inventory has not the ingredients to craft minecraft:stick 1 times' })
      await driver.tick()
      await rejected
      assert.deepStrictEqual(server.sentOf('item_stack_request').map(({ requests }) => requests.length), [1])
      bot.end()
      crafted.catch(() => {})
    })

    it('takes a metadata of undefined as any, as Java\'s null', async () => {
      const { bot, driver, recipes, idOf } = await joined(version)
      recipes.send([sticks])
      await driver.tick()
      assert.deepStrictEqual([undefined, null, 0, 1].map(metadata => [bot.recipesAll(idOf('stick'), metadata, false).length, bot.recipesFor(idOf('stick'), metadata, 0, false).length]), [[1, 1], [1, 1], [1, 1], [0, 0]])
      bot.end()
    })

    it('matches no recipe to a grid holding more than a shapeless recipe\'s ingredients, or fewer of an item than its cell takes', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([
        { type: 'shapeless', id: 'torch', networkId: 4, uuid: '00000000-0000-0000-0000-000000000005', input: [{ item: 'oak_planks' }, { item: 'stick' }], output: [{ item: 'torch', count: 1 }] },
        { type: 'shaped', id: 'ladder', networkId: 5, uuid: '00000000-0000-0000-0000-000000000006', priority: -1, input: [{ item: 'cobblestone', count: 2 }], output: [{ item: 'ladder', count: 1 }] },
        { type: 'shaped', id: 'button', networkId: 6, uuid: '00000000-0000-0000-0000-000000000007', input: [{ item: 'cobblestone' }], output: [{ item: 'stone_button', count: 1 }] }
      ])
      openScreen(server, 'inventory')
      inventory.slot('ui', 28, { id: idOf('oak_planks'), count: 1, stackId: 2 })
      inventory.slot('ui', 29, { id: idOf('stick'), count: 1, stackId: 3 })
      inventory.slot('ui', 30, { id: idOf('dirt'), count: 1, stackId: 4 })
      await driver.tick()
      const clicks = [bot.clickWindow(0, 0, 0)]
      await driver.tick()
      for (const slot of [28, 29, 30]) inventory.slot('ui', slot, null)
      inventory.slot('ui', 31, { id: idOf('cobblestone'), count: 1, stackId: 5 })
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      // the ladder's cell takes two, which the button's lower priority does not keep it from
      inventory.slot('ui', 31, { id: idOf('cobblestone'), count: 2, stackId: 6 })
      inventory.slot('ui', 0, null)
      await driver.tick()
      clicks.push(bot.clickWindow(0, 0, 0))
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('item_stack_request').map(({ requests }) => requests[0]?.actions[0]?.recipe_network_id), [6, 5])
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })

    it('selects with all as many as 64 crafts\' of an item stacking to 64', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      recipes.send([{ type: 'shapeless', id: 'buttons', networkId: 9, uuid: '00000000-0000-0000-0000-00000000000a', input: [{ item: 'oak_planks' }], output: [{ item: 'stone_button', count: 1 }] }])
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 64, stackId: 2 })
      inventory.slot('inventory', 1, { id: idOf('oak_planks'), count: 36, stackId: 3 })
      openScreen(server, 'inventory')
      await driver.tick()
      const [recipe] = bot.recipesAll(idOf('stone_button'), null, false)
      assert.ok(recipe !== undefined)
      const moves = movesSince(server)
      const placed = bot.placeRecipe(recipe, true)
      await driver.tick()
      assert.deepStrictEqual(moves(), [[-3, ['place', 64, 'hotbar_and_inventory:0#2', 'crafting_input:28#0']]])
      bot.end()
      placed.catch(() => {})
    })

    it('crafts by a multi recipe only the grids of the recipes it stands for: the map extending one an empty map and a compass, not the locator map\'s eight paper and compass; never by one it does not know', async () => {
      const { bot, server, driver, inventory, recipes, idOf } = await joined(version)
      const paper = { item: 'paper' }
      recipes.send([
        { type: 'shapeless', id: 'enhanced', networkId: 1, uuid: '00000000-0000-0000-0000-000000000001', input: [{ item: 'empty_map' }, { item: 'compass' }], output: [{ item: 'empty_map', count: 1, metadata: 2 }] },
        { type: 'shaped', id: 'locator', networkId: 2, uuid: '00000000-0000-0000-0000-000000000002', width: 3, height: 3, input: [paper, paper, paper, paper, { item: 'compass' }, paper, paper, paper, paper], output: [{ item: 'empty_map', count: 1, metadata: 2 }] },
        { type: 'shapeless', id: 'sticks', networkId: 3, uuid: '00000000-0000-0000-0000-000000000003', input: [{ item: 'oak_planks' }], output: [{ item: 'stick', count: 4 }] },
        { type: 'multi', uuid: '4b43944b-9422-cdae-2793-2cbb99446786', networkId: 7 },
        { type: 'multi', uuid: '00000000-0000-0000-0000-00000000000f', networkId: 8 }
      ])
      openScreen(server, 'workbench')
      const crafted: unknown[] = []
      const clicks: Array<Promise<void>> = []
      for (const grid of [[[32, 'empty_map'], [33, 'compass']], [...[32, 33, 34, 35, 37, 38, 39, 40].map(slot => [slot, 'paper'] as const), [36, 'compass']], [[32, 'oak_planks']]] as const) {
        for (let slot = 32; slot <= 40; slot++) inventory.slot('ui', slot, null)
        for (const [slot, item] of grid) inventory.slot('ui', slot, { id: idOf(item), count: 1, stackId: slot })
        inventory.slot('ui', 0, null)
        await driver.tick()
        clicks.push(bot.clickWindow(0, 0, 0))
        await driver.tick()
        crafted.push(server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions[0]?.recipe_network_id)
      }
      assert.deepStrictEqual(crafted, [7, 2, 3])
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })
  })
})
