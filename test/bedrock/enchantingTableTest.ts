import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockBotOptions, BedrockEnchantmentTable, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../lib/types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The vanilla client's enchants against Bedrock Dedicated Server, recorded on every build (an iron sword of Damage 0
// and 3 lapis lazuli in the table, an option chosen at level 86, 115 or 143): the options the server sent and the
// request the client made, as their bytes. Versions whose requests are written alike (the layout, and up to 1.26.30
// the sword's network id) are a group, each group's test run on each of its versions.

type Attributes = ClientboundPacketsToWrite['update_attributes']['attributes']
type EnchantOption = NonNullable<ClientboundPacketsToWrite['player_enchant_options']['options']>[number]

const TABLE_AT = Object.freeze({ x: 2, y: -60, z: 0 })
const LAPIS = 3

interface RecordedEnchant {
  from: BedrockVersion
  to: BedrockVersion
  choice: number
  windowId: number
  /** the player's level when the options came */
  level: number
  requestId: number
  /** the stack ids of the sword and of the lapis lazuli in the table */
  input: number
  lapis: number
  costs: readonly number[]
  options: string
  request: string
  /** the stack id the response gives the enchanted sword */
  enchanted: number
  /** what the sword gets: [id, level] */
  ench: ReadonlyArray<readonly [number, number]>
}

const RECORDED: readonly RecordedEnchant[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    choice: 1,
    windowId: 25,
    level: 115,
    requestId: -4227,
    input: 3100,
    lapis: 3102,
    costs: [2, 6, 8],
    options: '920103021000000000011101001e656172746820706879736963616c206d656e74616c2064657374726f7920b40f061000000000020d010b010010667265652062616c6c20626561737420b50f0810000000000109020010636f6c6420696d6275652067726f7720b60f',
    request: '93010185420509b50f0e01e60402ffff010a00030644616d616765000904656e63680a04020269640d0002036c766c010000020269640b0002036c766c010000000000010501150eb83001013b328542150e85420502160fbc3000',
    enchanted: 3103,
    ench: [[13, 1], [11, 1]]
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    choice: 2,
    windowId: 26,
    level: 143,
    requestId: -5207,
    input: 3593,
    lapis: 3595,
    costs: [2, 5, 7],
    options: '92010302100000000000010c0117686f74206c696d697465642064656d6f6e20636f6c6420ba0f051000000000010a010017636f6c64206265726174612072616e6765206375626520bb0f0710000000000211010a01002167616c76616e697a652073706865726520706879736963616c206d656e74616c20bc0f',
    request: '930101ad51050abc0f0f01e60402ffff010a00030644616d616765000904656e63680a0402026964110002036c766c010000020269640a0002036c766c010000000000010501150e923801013b32ad51150ead510503160f963800',
    enchanted: 3596,
    ench: [[17, 1], [10, 1]]
  },
  {
    // recorded on 1.17.30.4
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    choice: 1,
    windowId: 25,
    level: 115,
    requestId: -4321,
    input: 3055,
    lapis: 3057,
    costs: [1, 3, 4],
    options: '9201030110000000000109010018626c65737320666972652061697220656d62696767656e20eb10031000000000010901010c01116c696768742066697265207374616c6520ec100410000000000109010017706879736963616c2064657374726f7920736e75666620ed10',
    request: '930101c143050aec100f01e6040100000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696409000203006c766c01000002020069640c000203006c766c010000000000000000000000010501150ede2f01013b32c143150ec1430502160fe22f00',
    enchanted: 3058,
    ench: [[9, 1], [12, 1]]
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    choice: 2,
    windowId: 26,
    level: 143,
    requestId: -1999,
    input: 1113,
    lapis: 1115,
    costs: [2, 5, 6],
    options: '920103021000000000010a010014666964646c65206265726174612078797a7a7920ee10051000000000010901010c0119656c6465722066726565206669726520656d62696767656e20ef10061000000000010902001a73706865726520747769737420656d62696767656e20686f7420f010',
    request: '9301019d1f050af0101101e6040100000038ffff010a000003060044616d61676500000000090400656e63680a01000000020200696409000203006c766c020000000000000000000000010501150eb21101013b329d1f150e9d1f0503160fb61100',
    enchanted: 1116,
    ench: [[9, 2]]
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.21',
    choice: 2,
    windowId: 26,
    level: 143,
    requestId: -3509,
    input: 2621,
    lapis: 2623,
    costs: [2, 5, 7],
    options: '920103021000000000010901001d637265617475726520696d627565206265617374207374726574636820f410051000000000010a0100116f746865722078797a7a792067726f7720f510071000000000010902010c011c656d62696767656e20656c64657220776574206461726b6e65737320f610',
    request: '930101e936050cf6101301e6040100000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696409000203006c766c02000002020069640c000203006c766c010000000000000000000000010501150efa2801013b32e936150ee9360503160ffe2800',
    enchanted: 2624,
    ench: [[9, 2], [12, 1]]
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    choice: 2,
    windowId: 26,
    level: 143,
    requestId: -5157,
    input: 3544,
    lapis: 3546,
    costs: [2, 5, 7],
    options: '9201030210000000000109010018736e7566662067616c76616e697a652073686f7274656e20af11051000000000010901001b62616c6c20656d62696767656e2061697220656d62696767656e20b011071000000000010b01001867726f7720696e73696465206265726174612062616c6c20b111',
    request: '930101c950050cb1111301e6040100000038ffff010a000003060044616d61676500000000090400656e63680a0100000002020069640b000203006c766c010000000000000000000000010501150eb03701013b32c950150ec9500503160fb43700ffffffff',
    enchanted: 3547,
    ench: [[11, 1]]
  },
  {
    // recorded on 1.19.63.1
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.63',
    choice: 2,
    windowId: 26,
    level: 143,
    requestId: -4969,
    input: 3402,
    lapis: 3404,
    costs: [2, 6, 8],
    options: '920103021000000000010b01001c616e696d616c207363726f6c6c732078797a7a79206d656e74616c20bf11061000000000010901010c011e72616e67652067616c76616e697a6520656d62696767656e206375626520c011081000000000010902001972616e676520656c646572207477697374206d656e74616c20c111',
    request: '930101d14d050cc1111301e6040100000038ffff010a000003060044616d61676500000000090400656e63680a01000000020200696409000203006c766c020000000000000000000000010501160e943501013c32d14d160ed14d0503170f983500ffffffff',
    enchanted: 3405,
    ench: [[9, 2]]
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    choice: 0,
    windowId: 24,
    level: 86,
    requestId: -3175,
    input: 2193,
    lapis: 2195,
    costs: [1, 4, 5],
    options: '92010301100000000000010c011b73656c6620616e696d616c20626c65737320656d62696767656e20bb11041000000000010901001a706879736963616c20616972206561727468206d656e74616c20bc11051000000000010902000f626c6573732062616c6c2074686520bd11',
    request: '930101cd31050cbb111301e8040100000038ffff010a000003060044616d61676500000000090400656e63680a0100000002020069640c000203006c766c010000000000000000000000010501160ea22201013c32cd31160ecd310501170fa62200ffffffff',
    enchanted: 2196,
    ench: [[12, 1]]
  },
  {
    // recorded on 1.20.15.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    choice: 2,
    windowId: 27,
    level: 143,
    requestId: -4215,
    input: 2945,
    lapis: 2947,
    costs: [1, 2, 2],
    options: '920103011000000000010901001767726f772073686f7274656e206f6620696e73696465208e12021000000000010b0100196f746865722068756d616e6f696420686f7420696d627565208f12021000000000020d010901001c73706865726520736872696e6b20746f7761726473206c69676874209012',
    request: '930101ed41050c90121301ea040100000048ffff010a000003060044616d61676500000000090400656e63680a0200000002020069640d000203006c766c010000020200696409000203006c766c010000000000000000000000010501160e822e01013c32ed41160eed410503170f862e00ffffffff',
    enchanted: 2948,
    ench: [[13, 1], [9, 1]]
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    choice: 1,
    windowId: 26,
    level: 115,
    requestId: -4909,
    input: 3361,
    lapis: 3363,
    costs: [1, 4, 5],
    options: '920103011000000000011101001264727920636f6c6420706879736963616c208b12041000000000010b01010c011c696d6275652073686f7274656e2073706865726520737068657265208c12051000000000010a010016666964646c6520616e696d616c20746f7761726473208d12',
    request: '930101d94c050c8c121301ec040100000048ffff010a000003060044616d61676500000000090400656e63680a0200000002020069640b000203006c766c01000002020069640c000203006c766c010000000000000000000000010501160ec23401013c32d94c160ed94c0502170fc63400ffffffff',
    enchanted: 3364,
    ench: [[11, 1], [12, 1]]
  },
  {
    // recorded on 1.21.1.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    choice: 2,
    windowId: 28,
    level: 143,
    requestId: -5173,
    input: 3539,
    lapis: 3541,
    costs: [2, 6, 8],
    options: '920103021000000000010901001b64656d6f6e206461726b6e657373206672656520737069726974208713061000000000010b01001174686520656c64657220756e64656164208813081000000000010902001b72616e67652067726f772068756d616e6f69642069676e697465208913',
    request: '930101e950050c89131301f2040100000038ffff010a000003060044616d61676500000000090400656e63680a01000000020200696409000203006c766c020000000000000000000000010501160ea63701013c32e950160ee9500503170faa3700ffffffff',
    enchanted: 3542,
    ench: [[9, 2]]
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    choice: 1,
    windowId: 27,
    level: 115,
    requestId: -3513,
    input: 2683,
    lapis: 2685,
    costs: [1, 2, 2],
    options: '920103011000000000010a01001f7374616c65206265726174612067616c76616e697a65206c696d69746564208413021000000000010a01001b656d62696767656e207374616c652064656d6f6e206f746865722085130210000000000109010015656c656d656e74616c20667265652064656d6f6e208613',
    request: '930101f136050c8513011301f4040100000038ffff010a000003060044616d61676500000000090400656e63680a0100000002020069640a000203006c766c01000000000000000000000001050116000000000ef62901013c0000000032f13616000000000ef136050217000000000ffa2900ffffffff',
    enchanted: 2686,
    ench: [[10, 1]]
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    choice: 2,
    windowId: 28,
    level: 143,
    requestId: -3529,
    input: 2688,
    lapis: 2690,
    costs: [1, 3, 4],
    options: '920103011000000000010901001464656d6f6e20737068657265206b6c61617475208713031000000000010b010018746f776172647320736872696e6b206f66206f746865722088130410000000000109010019736872696e6b206f7468657220736e7566662064656d6f6e208913',
    request: '9301019137050c8913011301f4040100000038ffff010a000003060044616d61676500000000090400656e63680a01000000020200696409000203006c766c01000000000000000000000001050116000e802a01013c0032913716000e9137050317000f842a00ffffffff',
    enchanted: 2691,
    ench: [[9, 1]]
  },
  {
    // recorded on 1.21.124.2
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.124',
    choice: 0,
    windowId: 26,
    level: 86,
    requestId: -3629,
    input: 2841,
    lapis: 2843,
    costs: [2, 5, 7],
    options: '920103021000000000010901010c011367726f7720706879736963616c2062616c6c20f5190510000000000109010015616e696d616c20656c6465722064657374726f7920f619071000000000010901001469676e697465206c696d6974656420636f6c6420f719',
    request: '930101d938050cf51901130196050100000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696409000203006c766c01000002020069640c000203006c766c01000000000000000000000001050116000eb22c01013c0032d93816000ed938050117000fb62c00ffffffff',
    enchanted: 2844,
    ench: [[9, 1], [12, 1]]
  },
  {
    // recorded on 1.26.10.4
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.10',
    choice: 2,
    windowId: 28,
    level: 143,
    requestId: -3661,
    input: 2851,
    lapis: 2853,
    costs: [2, 5, 7],
    options: '92010302100000000001090100136e696b74752072616e6765206d656e74616c20a21a05100000000000010c011c656d62696767656e20776174657220696e7369646520637572736520a31a071000000000011101010c011d67616c76616e697a6520696d62756520667265736820736872696e6b20a41a',
    request: '9301019939050ca41a011301a4050100000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696411000203006c766c01000002020069640c000203006c766c01000000000000000000000001050116000ec62c01013c0032993916000e9939050317000fca2c00ffffffff',
    enchanted: 2854,
    ench: [[17, 1], [12, 1]]
  },
  {
    // recorded on 1.26.20.4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.30',
    choice: 0,
    windowId: 26,
    level: 86,
    requestId: -375,
    input: 132,
    lapis: 134,
    costs: [1, 3, 3],
    options: '920103011000000000010901010c011f62657261746120696e736964652064657374726f7920656d62696767656e20871c031000000000010b01001f6e696b747520706879736963616c2064657374726f79206c696d6974656420881c031000000000010901000f64727920756e646561642077657420891c',
    request: '930101ed05050c871c011301a4050100000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696409000203006c766c01000002020069640c000203006c766c01000000000000000000000001050116000e880201013c0032ed0516000eed05050117000f8c0200ffffffff',
    enchanted: 135,
    ench: [[9, 1], [12, 1]]
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    choice: 0,
    windowId: 26,
    level: 86,
    requestId: -3613,
    input: 2818,
    lapis: 2820,
    costs: [1, 2, 2],
    options: '920103011000000000010901010c01197374616c6520636f6c6420756e6465616420756e6465616420d01c021000000000010901001064727920637572736520637572736520d11c0210000000000111010019696d62756520756e6465616420776174657220696d62756520d21c',
    request: '930101b938050a0cd01c011113010101146d696e6563726166743a69726f6e5f73776f72640001000048ffff010a000003060044616d61676500000000090400656e63680a02000000020200696409000203006c766c01000002020069640c000203006c766c0100000000000000000000000105050116000e020b00000101013c0032e3f1ffff16000ee3f1ffff05050117000f040b000000ffffffff',
    enchanted: 2821,
    ench: [[9, 1], [12, 1]]
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    choice: 2,
    windowId: 28,
    level: 143,
    requestId: -3693,
    input: 2835,
    lapis: 2837,
    costs: [2, 6, 8],
    options: '9201030210000000000109010014656e6368616e742073686f7274656e2074686520ac2506100000000000010c010f647279206375626520626561737420ad25081000000000010a0200127765742061697220656c656d656e74616c20ae25',
    request: '930101d939050a0cae25011214010101146d696e6563726166743a69726f6e5f73776f72640001000038ffff010a000003060044616d61676500000000090400656e63680a0100000002020069640a000203006c766c0200000000000000000000000105050116000e130b00000101013c003293f1ffff16000e93f1ffff05050317000f150b000000ffffffff',
    enchanted: 2838,
    ench: [[10, 2]]
  },
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** the bot's packets since the last call, as their bytes, but its auth inputs */
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

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

function refOf (info: SentSlot): SlotRef {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type
  assert.ok(typeof container === 'string' && info.slot !== undefined)
  return { container, slot: info.slot }
}

function slotName (info: SentSlot): string {
  const { container, slot } = refOf(info)
  return `${container}:${slot}#${info.stack_id}`
}

/** each request the bot sent since the last call: its id, then its actions' types, counts and slots */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => [String(id), ...actions.map(({ type_id: type, count, source, destination }) =>
      [String(type), count, source === undefined ? undefined : slotName(source), destination === undefined ? undefined : `→ ${slotName(destination)}`].filter(part => part !== undefined).join(' '))].join(', '))
  }
}

function isInternal (bot: BedrockBot): bot is BedrockBotInternal {
  return '_inventory' in bot
}

function isTable (window: Window | null): window is BedrockEnchantmentTable {
  return window !== null && 'enchant' in window
}

function tableOf (window: Window | null): BedrockEnchantmentTable {
  assert.ok(isTable(window))
  return window
}

/** the player's level, as the version's update_attributes writes it */
function levelAttribute (version: BedrockVersion, level: number): Attributes {
  return [{
    min: 0,
    max: 24791,
    current: level,
    default: 0,
    name: 'minecraft:player.level',
    ...atLeast(version, 'bedrock_1.19.20') ? { modifiers: [] } : {},
    ...atLeast(version, 'bedrock_1.21.30') ? { default_min: 0, default_max: 24791 } : {}
  }]
}

/** what an iron sword of Damage 0 is once enchanted */
function enchantedNbt (ench: ReadonlyArray<readonly [number, number]>): object {
  const enchantments = ench.map(([id, level]) => ({ id: { type: 'short', value: id }, lvl: { type: 'short', value: level } }))
  return { type: 'compound', name: '', value: { Damage: { type: 'int', value: 0 }, ench: { type: 'list', value: { type: 'compound', value: enchantments } } } }
}

interface TableBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  sword: (stackId: number) => Given
  lapis: (count: number, stackId: number) => Given
}

/** joined, at `level` (none: the server has not told it) */
async function tableBot (version: BedrockVersion, level: number | undefined, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<TableBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  if (level !== undefined) testBot.server.send('update_attributes', { runtime_entity_id: 1n, attributes: levelAttribute(version, level), tick: 0n })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return {
    ...testBot,
    inventory: new ServerInventory(testBot.server),
    errors,
    sword: stackId => ({ id: idOf('iron_sword'), count: 1, stackId, ints: { Damage: 0 } }),
    lapis: (count, stackId) => ({ id: idOf('lapis_lazuli'), count, stackId })
  }
}

/** as the server opens a table: its options cleared, then the screen */
function openTable (server: FakeBedrockClient, windowId: number): void {
  server.send('player_enchant_options', {})
  server.send('container_open', { window_id: windowId, window_type: 'enchantment', coordinates: TABLE_AT, runtime_entity_id: -1n })
}

/** an option as the server sends it from 1.16.220 */
function option (cost: number, optionId: number, held: ReadonlyArray<readonly [number, number]>, self: ReadonlyArray<readonly [number, number]> = []): EnchantOption {
  const enchants = (list: ReadonlyArray<readonly [number, number]>): EnchantOption['held_enchants'] => list.map(([id, level]) => ({ id, level }))
  return { cost, slot_flags: 16, equip_enchants: [], held_enchants: enchants(held), self_enchants: enchants(self), name: 'the stale galvanize ', option_id: optionId }
}

function sendOptions (server: FakeBedrockClient, ...options: EnchantOption[]): void {
  server.send('player_enchant_options', { options })
}

const OPTIONS: readonly EnchantOption[] = [option(2, 4774, [[11, 1]]), option(5, 4775, [[10, 1], [13, 1]], [[12, 1]]), option(6, 4776, [[9, 2]])]

/** the message `promise` rejects with once `ticks` ticks ran */
async function rejection (driver: TestBot['driver'], promise: Promise<unknown>, ticks = 1): Promise<string> {
  let message = 'resolved'
  const settled = promise.then(() => {}, (error: Error) => { message = error.message })
  await driver.ticks(ticks)
  await settled
  return message
}

describe('bedrock enchanting table', () => {
  for (const recorded of RECORDED) {
    describe(`the vanilla client enchanting an iron sword (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: option ${recorded.choice}, the options as player_enchant_options gave them, ready in its packet pass`, async () => {
          const { bot, internal, server, driver, inventory, errors, sword, lapis } = await tableBot(version, recorded.level)
          internal._core.requestIds.continueProcess(recorded.requestId)
          const readies: number[][] = []
          bot.once('windowOpen', window => {
            const opened = tableOf(window)
            opened.on('ready', () => { readies.push(opened.enchantments.map(({ level }) => level)) })
          })
          openTable(server, recorded.windowId)
          inventory.slot('ui', 14, sword(recorded.input))
          inventory.slot('ui', 15, lapis(LAPIS, recorded.lapis))
          receive(server, recorded.options)
          await driver.tick()
          const table = tableOf(bot.currentWindow)
          assert.deepStrictEqual([readies, table.xpseed], [[recorded.costs], -1])
          const sent = sentSince(server)
          const enchanted = table.enchant(recorded.choice)
          await driver.tick()
          // nothing else: no packet of the button's own
          assert.deepStrictEqual(sent(), [recorded.request])
          const left = LAPIS - recorded.choice - 1
          inventory.respond(recorded.requestId, [
            { container: 'enchanting_input', slot: 14, count: 1, stackId: recorded.enchanted },
            { container: 'enchanting_lapis', slot: 15, count: left, ...left === 0 ? {} : { stackId: recorded.lapis } }
          ])
          server.send('player_enchant_options', {})
          await driver.tick()
          const item = await enchanted
          assert.deepStrictEqual([item.name, item.stackId, item.nbt, table.slots[1]?.count ?? 0, readies.length, table.enchantments.map(({ level }) => level), errors],
            ['iron_sword', recorded.enchanted, enchantedNbt(recorded.ench), left, 1, [-1, -1, -1], []])
          bot.end()
        })
      }
    })
  }

  describe('the vanilla client closing the table: its item, then its lapis lazuli given back, the close after the inventory\'s animation (1.26.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60')) {
      it(`bedrock ${version}: the 2 lapis lazuli option 0 left, to hotbar slot 0`, async () => {
        const { bot, internal, server, driver, inventory, errors, lapis } = await tableBot(version, 85)
        internal._core.requestIds.continueProcess(-3667)
        openTable(server, 26)
        inventory.slot('ui', 15, lapis(2, 2827))
        await driver.tick()
        const sent = sentSince(server)
        const closing = bot.closeWindow(tableOf(bot.currentWindow))
        await driver.tick()
        // recorded on 1.26.60.5
        assert.deepStrictEqual(sent(), ['930101a5390101010217000f0b0b00000c00000000000000ffffffff'])
        inventory.respond(-3667, [{ container: 'enchanting_lapis', slot: 15, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 2, stackId: 2827 }])
        const closes: string[][] = []
        for (let frame = 0; frame < 5; frame++) {
          await driver.frame(62.5)
          closes.push(sent().filter(packet => packet.startsWith('2f')))
        }
        assert.deepStrictEqual(closes, [[], [], [], [], ['2f1af700']])
        server.send('container_close', { window_id: 26, window_type: 'none', server: false })
        await driver.tick()
        await closing
        assert.deepStrictEqual([bot.currentWindow, bot.inventory.slots[36]?.count, errors], [null, 2, []])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    function block (bot: TestBot['bot'], name: string): Block {
      const state = bot.registry.blocksByName[name]?.defaultState ?? 0
      return prismarineBlock(bot.registry).fromStateId(state, 0)
    }

    /** openBlock answered by the server opening `type`'s screen */
    function stubOpenBlock ({ bot, internal, server }: TableBot, type: 'enchantment' | 'workbench'): Block[] {
      const used: Block[] = []
      internal.openBlock = async block => {
        used.push(block)
        if (type === 'enchantment') openTable(server, 3)
        else server.send('container_open', { window_id: 3, window_type: type, coordinates: TABLE_AT, runtime_entity_id: -1n })
        await bot.waitForTicks(1)
        assert.ok(bot.currentWindow !== null)
        return bot.currentWindow
      }
      return used
    }

    /** a table open holding a sword and 3 lapis lazuli, with OPTIONS */
    async function tableWithOptions (level: number | undefined): Promise<TableBot & { table: BedrockEnchantmentTable }> {
      const testBot = await tableBot(version, level)
      const { bot, server, driver, inventory, sword, lapis } = testBot
      openTable(server, 3)
      inventory.slot('ui', 14, sword(20))
      inventory.slot('ui', 15, lapis(LAPIS, 21))
      sendOptions(server, ...OPTIONS)
      await driver.tick()
      return { ...testBot, table: tableOf(bot.currentWindow) }
    }

    it('opens the table with openBlock, without options until the server sends them; rejects another block, and a window that is no table, as Java\'s', async () => {
      const testBot = await tableBot(version, undefined)
      const { bot, driver } = testBot
      const used = stubOpenBlock(testBot, 'enchantment')
      const table = block(bot, 'enchanting_table')
      const opening = bot.openEnchantmentTable(table)
      await driver.ticks(2)
      const window = await opening
      const none = { level: -1, expected: { enchant: -1, level: -1 }, enchants: [], optionId: -1 }
      assert.deepStrictEqual([used, window.type, window.slots.length, window.inventoryStart, window.targetItem(), window.xpseed, window.enchantments],
        [[table], 'minecraft:enchanting_table', 38, 2, null, -1, [none, none, none]])
      await assert.rejects(bot.openEnchantmentTable(block(bot, 'crafting_table')), { name: 'AssertionError' })
      const other = await tableBot(version, undefined)
      stubOpenBlock(other, 'workbench')
      const wrong = await rejection(other.driver, other.bot.openEnchantmentTable(block(other.bot, 'enchanting_table')), 2)
      assert.strictEqual(wrong, 'Expected minecraft:enchant when opening table but got minecraft:crafting_table')
      bot.end()
      other.bot.end()
    })

    it('shows each option\'s cost, first enchantment, every enchantment and id; ready once options come, again after an empty packet', async () => {
      const { bot, server, driver, table } = await tableWithOptions(30)
      let readies = 0
      table.on('ready', () => { readies++ })
      const first = table.enchantments
      // options again while ready: not ready again
      sendOptions(server, ...OPTIONS)
      await driver.tick()
      sendOptions(server)
      await driver.tick()
      const cleared = table.enchantments.map(({ level }) => level)
      // an option with no enchantment, and an enchantment the registry does not know
      sendOptions(server, option(1, 7, []), option(3, 8, [[200, 1]]))
      await driver.tick()
      assert.deepStrictEqual([first, readies, cleared, table.enchantments], [[
        { level: 2, expected: { enchant: 11, level: 1 }, enchants: [{ id: 11, name: 'bane_of_arthropods', level: 1 }], optionId: 4774 },
        { level: 5, expected: { enchant: 10, level: 1 }, enchants: [{ id: 10, name: 'smite', level: 1 }, { id: 13, name: 'fire_aspect', level: 1 }, { id: 12, name: 'knockback', level: 1 }], optionId: 4775 },
        { level: 6, expected: { enchant: 9, level: 2 }, enchants: [{ id: 9, name: 'sharpness', level: 2 }], optionId: 4776 }
      ], 1, [-1, -1, -1], [
        { level: 1, expected: { enchant: -1, level: -1 }, enchants: [], optionId: 7 },
        { level: 3, expected: { enchant: 200, level: 1 }, enchants: [{ id: 200, name: undefined, level: 1 }], optionId: 8 },
        { level: -1, expected: { enchant: -1, level: -1 }, enchants: [], optionId: -1 }
      ]])
      bot.end()
    })

    it('enchants once ready, waiting for the options, a choice given as a string: equip, held then self enchantments', async () => {
      const { bot, internal, server, driver, inventory, sword, lapis } = await tableBot(version, 30)
      internal._core.requestIds.continueProcess(-9)
      openTable(server, 3)
      inventory.slot('ui', 14, sword(20))
      inventory.slot('ui', 15, lapis(LAPIS, 21))
      await driver.tick()
      const table = tableOf(bot.currentWindow)
      const requests = requestsSince(server)
      const enchanted = table.enchant('1')
      await driver.ticks(3)
      const before = requests()
      sendOptions(server, ...OPTIONS.slice(0, 1), { ...option(5, 4775, [[10, 1]], [[12, 1]]), equip_enchants: [{ id: 17, level: 1 }] })
      await driver.ticks(2)
      assert.deepStrictEqual([before, requests()], [[], [
        '-9, craft_recipe, results_deprecated, consume 1 enchanting_input:14#20, place 1 creative_output:50#-9 → enchanting_input:14#-9, consume 2 enchanting_lapis:15#21'
      ]])
      inventory.respond(-9, [{ container: 'enchanting_input', slot: 14, count: 1, stackId: 22 }, { container: 'enchanting_lapis', slot: 15, count: 1, stackId: 21 }])
      await driver.tick()
      const item = await enchanted
      assert.deepStrictEqual([item.stackId, item.nbt, table.targetItem()?.stackId], [22, enchantedNbt([[17, 1], [10, 1], [12, 1]]), 22])
      bot.end()
    })

    it('enchants in creative below the level an option asks', async () => {
      const { bot, server, driver, table } = await tableWithOptions(undefined)
      server.send('set_player_game_type', { gamemode: 'creative' })
      await driver.tick()
      const requests = requestsSince(server)
      table.enchant(2).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual([bot.game.gameMode, requests().length], ['creative', 1])
      bot.end()
    })

    it('rejects, sending nothing: an option it has not, Java\'s assertion for one with no level, too low a level (0 untold), too little lapis lazuli, a book, the options gone or the item taken before the input pass', async () => {
      const { bot, internal, server, driver, inventory, table, lapis } = await tableWithOptions(5)
      const untold = await tableWithOptions(undefined)
      const low = await tableWithOptions(2)
      sendOptions(low.server, option(1, 7, [[9, 1]]), option(1, 8, [[9, 1]]), option(1, 9, [[9, 1]]))
      await low.driver.tick()
      const requests = requestsSince(server)
      const messages = [
        await rejection(driver, table.enchant(3)),
        await rejection(driver, table.enchant(2)),
        await rejection(untold.driver, untold.table.enchant(0)),
        await rejection(low.driver, low.table.enchant(2))
      ]
      inventory.slot('ui', 15, lapis(1, 21))
      await driver.tick()
      messages.push(await rejection(driver, table.enchant(1)))
      inventory.slot('ui', 15, null)
      await driver.tick()
      messages.push(await rejection(driver, table.enchant(0)))
      inventory.slot('ui', 15, lapis(1, 21))
      sendOptions(server, option(2, 9, [[9, 1]]))
      await driver.tick()
      await assert.rejects(table.enchant(1), { name: 'AssertionError' })
      inventory.slot('ui', 14, { id: bot.registry.itemsByName['book']?.id ?? 0, count: 1, stackId: 30 })
      await driver.tick()
      messages.push(await rejection(driver, table.enchant(0)))
      // the server clears the options, or takes the item, in the frame before the enchant's input pass
      const cleared = table.enchant(0)
      sendOptions(server)
      messages.push(await rejection(driver, cleared))
      sendOptions(server, option(2, 9, [[9, 1]]))
      await driver.tick()
      const taken = table.enchant(0)
      inventory.slot('ui', 14, null)
      messages.push(await rejection(driver, taken))
      assert.deepStrictEqual([messages, requests(), internal._inventory.stackAt({ container: 'enchanting_lapis', slot: 15 })?.count], [[
        'enchant: the enchanting table has no option 3',
        'enchant: option 2 needs level 6, and the player has 5',
        'enchant: option 0 needs level 2, and the player has 0',
        'enchant: option 2 needs level 3, and the player has 2',
        'enchant: option 1 takes 2 lapis lazuli, and the table holds 1',
        'enchant: option 0 takes 1 lapis lazuli, and the table holds 0',
        'enchant: enchanting a book is not supported on Bedrock yet',
        'enchant: the enchanting table has no option 0 any more',
        'enchant: the enchanting table has no option 0 any more'
      ], [], 1])
      bot.end()
      untold.bot.end()
      low.bot.end()
    })

    it('rejects an enchant whose table the server closed before its input pass, sending nothing', async () => {
      const { bot, server, driver, table } = await tableWithOptions(30)
      const requests = requestsSince(server)
      const enchanted = table.enchant(0)
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      assert.deepStrictEqual([await rejection(driver, enchanted), requests()], ['enchant needs the enchanting table open', []])
      bot.end()
    })

    it('rejects the members while a screen the server opened over the table waits for its content', async () => {
      const { bot, server, driver, inventory, sword, lapis } = await tableBot(version, 30, {
        plugins: {
          // a screen shown at its window's first content, of a type no feature defines
          fixture: bot => {
            assert.ok(isInternal(bot))
            bot._inventory.screens.add({ type: 'compound_creator', containers: {}, shown: 'content', layout: () => undefined, animation: 'none', handBack: [] })
          }
        }
      })
      openTable(server, 3)
      inventory.slot('ui', 14, sword(20))
      inventory.slot('ui', 15, lapis(LAPIS, 21))
      sendOptions(server, ...OPTIONS)
      await driver.tick()
      const table = tableOf(bot.currentWindow)
      server.send('container_open', { window_id: 4, window_type: 'compound_creator', coordinates: TABLE_AT, runtime_entity_id: -1n })
      await driver.tick()
      const requests = requestsSince(server)
      assert.deepStrictEqual([bot.currentWindow, await rejection(driver, table.enchant(0)), requests()], [null, 'enchant needs the enchanting table open', []])
      bot.end()
    })

    it('gives back the cursor\'s item, the item, then the lapis lazuli on close', async () => {
      const { bot, server, driver, inventory, sword, lapis } = await tableBot(version, 30)
      openTable(server, 3)
      inventory.slot('ui', 0, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 1, stackId: 22 })
      inventory.slot('ui', 14, sword(20))
      inventory.slot('ui', 15, lapis(LAPIS, 21))
      await driver.tick()
      const requests = requestsSince(server)
      bot.closeWindow(tableOf(bot.currentWindow)).catch(() => {})
      await driver.ticks(2)
      assert.deepStrictEqual(requests(), [
        '-3, place 1 cursor:0#22 → hotbar_and_inventory:0#0',
        '-5, place 1 enchanting_input:14#20 → hotbar_and_inventory:1#0',
        '-7, place 3 enchanting_lapis:15#21 → hotbar_and_inventory:2#0'
      ])
      bot.end()
    })

    it('rejects an enchant waiting for options when the table closes, or none come in 400 ticks; and the members of a table not open', async () => {
      const { bot, server, driver, inventory, sword } = await tableBot(version, 30)
      inventory.slot('inventory', 0, sword(20))
      openTable(server, 3)
      await driver.tick()
      const table = tableOf(bot.currentWindow)
      const held = bot.inventory.slots[36]
      assert.ok(held !== null && held !== undefined)
      const waiting = table.enchant(0)
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      const closed = await rejection(driver, waiting)
      openTable(server, 4)
      await driver.tick()
      const next = tableOf(bot.currentWindow)
      const expired = await rejection(driver, next.enchant(0), 400)
      // another screen opened over the table: the options are none of its
      server.send('container_open', { window_id: 5, window_type: 'workbench', coordinates: TABLE_AT, runtime_entity_id: -1n })
      sendOptions(server, ...OPTIONS)
      await driver.tick()
      const members = [
        await rejection(driver, table.enchant(0)),
        await rejection(driver, next.takeTargetItem()),
        await rejection(driver, next.putTargetItem(held)),
        await rejection(driver, next.putLapis(held))
      ]
      assert.deepStrictEqual([closed, expired, members, next.enchantments.map(({ level }) => level)], [
        'enchant needs the enchanting table open',
        'enchant: the server sent the enchanting table no options in 400 ticks',
        ['enchant needs the enchanting table open', 'takeTargetItem needs the enchanting table open', 'putTargetItem needs the enchanting table open', 'putLapis needs the enchanting table open'],
        [-1, -1, -1]
      ])
      bot.end()
    })

    it('puts the item and the lapis lazuli in with Java\'s clicks, and takes the item back with a shift click, resolving with it', async () => {
      const { bot, internal, server, driver, inventory, sword, lapis, errors } = await tableBot(version, 30)
      inventory.slot('inventory', 0, sword(20))
      inventory.slot('inventory', 1, lapis(LAPIS, 21))
      openTable(server, 3)
      await driver.tick()
      const table = tableOf(bot.currentWindow)
      const requests = requestsSince(server)
      let [answered, nextStackId] = [0, 500]
      // the server takes each request as the bot predicts it
      const served = async (operation: Promise<unknown>): Promise<void> => {
        let done = false
        operation.then(() => { done = true }, () => { done = true })
        const settled = (): boolean => done
        for (let tick = 0; tick < 50 && !settled(); tick++) {
          await driver.tick()
          const sent = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
          for (const { request_id: id, actions } of sent.slice(answered)) {
            const refs = actions.flatMap(({ source, destination }) => [source, destination]).filter(info => info !== undefined).map(refOf)
            inventory.respond(id, refs.map(ref => {
              const stack = internal._inventory.stackAt(ref)
              return { ...ref, count: stack?.count ?? 0, stackId: stack === undefined ? 0 : stack.stackId > 0 ? stack.stackId : nextStackId++ }
            }))
          }
          answered = sent.length
        }
        await operation
      }
      const [swordItem, lapisItem] = [table.slots[29], table.slots[30]]
      assert.ok(swordItem !== null && swordItem !== undefined && lapisItem !== null && lapisItem !== undefined)
      await served(table.putTargetItem(swordItem))
      await served(table.putLapis(lapisItem))
      const putIn = requests()
      let taken: Item | undefined
      await served(table.takeTargetItem().then(item => { taken = item }))
      assert.deepStrictEqual([putIn, requests(), taken?.name, table.slots[0], table.slots[1]?.count, errors], [[
        '-3, take 1 hotbar:0#20 → cursor:0#0', '-5, place 1 cursor:0#500 → enchanting_input:14#0',
        '-7, take 3 hotbar:1#21 → cursor:0#0', '-9, place 3 cursor:0#502 → enchanting_lapis:15#0'
      ], ['-11, place 1 enchanting_input:14#501 → hotbar_and_inventory:0#0'], 'iron_sword', null, LAPIS, []])
      await assert.rejects(table.takeTargetItem(), { name: 'AssertionError' })
      bot.end()
    })
  })
})
