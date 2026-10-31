import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { InventoryWindow } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Joined } from './common/world.ts'

// the vanilla client's recorded clicks and its servers' responses: the bot must send the client's requests, byte for byte

const ITEM_STACK_REQUEST = '93'
const DRAG_START = 'e60200'
const DRAG_STOP = 'e60201'

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** the item stack requests the bot sent since the last call, as written */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const all = server.sentOf('item_stack_request')
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.map(params => hexOf(server, { name: 'item_stack_request', params }))
  }
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name and section requests */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

async function joined (version: BedrockVersion, runtimeId = 1n): Promise<TestBot & Joined & { errors: string[], inventory: ServerInventory }> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  const ticks = await world.join(testBot, { game: { runtime_entity_id: runtimeId, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, ...ticks, errors, inventory: new ServerInventory(testBot.server) }
}

function openScreen (server: FakeBedrockClient, type: 'inventory' | 'workbench'): void {
  server.send('container_open', { window_id: 2, window_type: type, coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
}

/** recorded: 10 items given in hotbar slot 0 taken to the cursor on an open screen, then dropped by a click outside it */
interface RecordedDrop {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  take: string
  taken: string
  drop: string
  dropped: string
}

const DROPS: readonly RecordedDrop[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -4177,
    stackId: 3085,
    take: '930101a14101000a1b009a303a000000',
    taken: '94010100a141021b0100000000003a0100000a9a3000',
    drop: '930101a54101030a3a009a300000',
    dropped: '94010100a541013a010000000000'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.19.21',
    firstRequest: -1851,
    stackId: 1029,
    take: '930101f51c01000a1b008a103a000000',
    taken: '94010100f51c021b010000000000003a0100000a8a100000',
    drop: '930101f91c01030a3a008a100000',
    dropped: '94010100f91c013a01000000000000'
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -4239,
    stackId: 2978,
    take: '9301019d4201000a1b00c42e3a000000ffffffff',
    taken: '940101009d42021b010000000000003a0100000ac42e0000',
    drop: '930101a14201030a3a00c42e0000ffffffff',
    dropped: '94010100a142013a01000000000000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.21.2',
    firstRequest: -4663,
    stackId: 3260,
    take: '930101ed4801000a1c00f8323b000000ffffffff',
    taken: '94010100ed48021c010000000000003b0100000af8320000',
    drop: '930101f14801030a3b00f8320000ffffffff',
    dropped: '94010100f148013b01000000000000'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -3467,
    stackId: 2669,
    take: '930101953601000a1c0000000000da293b00000000000000ffffffff',
    taken: '940101009536021c00000000010000000000003b000000000100000ada290000',
    drop: '930101993601030a3b0000000000da290000ffffffff',
    dropped: '940101009936013b0000000001000000000000'
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -3467,
    stackId: 2669,
    take: '930101953601000a1c0000da293b00000000ffffffff',
    taken: '940101009536021c00010000000000003b000100000ada290000',
    drop: '930101993601030a3b0000da290000ffffffff',
    dropped: '940101009936013b0001000000000000'
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -3511,
    stackId: 2722,
    take: '930101ed3601000a1c0000c42a3b00000000ffffffff',
    taken: '94010100ed36021c0001000000000000003b000100000ac42a000000',
    drop: '930101f13601030a3b0000c42a0000ffffffff',
    dropped: '94010100f136013b000100000000000000'
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -3583,
    stackId: 2809,
    take: '930101fd370100000a1c0000f90a00003b00000000000000ffffffff',
    taken: '94010100fd370101021c000100000001000000003b000100000a0101f22b000000',
    drop: '93010181380103030a3b0000f90a00000000ffffffff',
    dropped: '9401010081380101013b00010000000100000000'
  },
  {
    // recorded on 1.26.51.1
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.60',
    firstRequest: -345,
    stackId: 123,
    take: '930101b1050100000a1c00007b0000003b00000000000000ffffffff',
    taken: '94010100b10501021c0001000000000000003b000100000a01f601000000',
    drop: '930101b5050103030a3b00007b0000000000ffffffff',
    dropped: '94010100b50501013b000100000000000000'
  }
]

/** recorded: a shield given in hotbar slot 0 taken to the cursor on the inventory screen, then put in the offhand by a right click */
interface RecordedShield {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  take: string
  taken: string
  place: string
  placed: string
}

const SHIELDS: readonly RecordedShield[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -997,
    stackId: 670,
    take: '930101c90f0100011b00bc0a3a000000',
    taken: '94010100c90f021b0100000000003a01000001bc0a00',
    place: '930101cd0f0101013a00bc0a21010000',
    placed: '94010100cd0f023a0100000000002101010101bc0a00'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.19.21',
    firstRequest: -825,
    stackId: 551,
    take: '930101f10c0100011b00ce083a000000',
    taken: '94010100f10c021b010000000000003a01000001ce080000',
    place: '930101f50c0101013a00ce0821010000',
    placed: '94010100f50c023a010000000000002101010101ce080000'
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -3213,
    stackId: 2527,
    take: '93010199320100011b00be273a000000ffffffff',
    taken: '940101009932021b010000000000003a01000001be270000',
    place: '9301019d320101013a00be2721010000ffffffff',
    placed: '940101009d32023a010000000000002101010101be270000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.21.2',
    firstRequest: -51,
    stackId: 24,
    take: '930101650100011c00303b000000ffffffff',
    taken: '9401010065021c010000000000003b01000001300000',
    place: '930101690101013b003022010000ffffffff',
    placed: '9401010069023b010000000000002201010101300000'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -2347,
    stackId: 2170,
    take: '930101d5240100011c0000000000f4213b00000000000000ffffffff',
    taken: '94010100d524021c00000000010000000000003b0000000001000001f4210000',
    place: '930101d9240101013b0000000000f4212200000000010000ffffffff',
    placed: '94010100d924023b0000000001000000000000220000000001010101f4210000'
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -2347,
    stackId: 2170,
    take: '930101d5240100011c0000f4213b00000000ffffffff',
    taken: '94010100d524021c00010000000000003b0001000001f4210000',
    place: '930101d9240101013b0000f4212200010000ffffffff',
    placed: '94010100d924023b0001000000000000220001010101f4210000'
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -2391,
    stackId: 2223,
    take: '930101ad250100011c0000de223b00000000ffffffff',
    taken: '94010100ad25021c0001000000000000003b0001000001de22000000',
    place: '930101b1250101013b0000de222200010000ffffffff',
    placed: '94010100b125023b000100000000000000220001010101de22000000'
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -2479,
    stackId: 2317,
    take: '930101dd26010000011c00000d0900003b00000000000000ffffffff',
    taken: '94010100dd260101021c000100000001000000003b000100000101019a24000000',
    place: '930101e126010101013b00000d0900002200010000000000ffffffff',
    placed: '94010100e1260101023b0001000000010000000022000101010101019a24000000'
  },
  {
    // recorded on 1.26.51.1
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.60',
    firstRequest: -2345,
    stackId: 2185,
    take: '930101d124010000011c0000890800003b00000000000000ffffffff',
    taken: '94010100d12401021c0001000000000000003b0001000001019222000000',
    place: '930101d524010101013b0000890800002200010000000000ffffffff',
    placed: '94010100d52401023b000100000000000000220001010101019222000000'
  }
]

type ItemName = 'oak_planks' | 'ender_pearl' | 'egg' | 'iron_sword' | 'iron_helmet' | 'crafting_table' | 'arrow'

/** an item the server gives: oak planks and crafting tables stack to 64, ender pearls and eggs to 16, a sword and a helmet to 1 */
interface GivenItem {
  window: InventoryWindow
  slot: number
  item: ItemName
  count: number
  stackId: number
  metadata?: number
}

/** a click of the vanilla client, as recorded on 1.26.51.1, and what its slots held */
interface RecordedClick {
  name: string
  screen: 'inventory' | 'workbench'
  given: readonly GivenItem[]
  firstRequest: number
  /** Java's slot of the window, mouse button and mode */
  click: readonly [slot: number, mouseButton: number, mode: number]
  /** null: the client sent nothing */
  request: string | null
}

function cursor (item: ItemName, count: number, stackId = 1): GivenItem {
  return { window: 'ui', slot: 0, item, count, stackId }
}

/** the inventory window's slot: the hotbar 0 – 8, the inventory 9 – 35 */
function stored (slot: number, item: ItemName, count: number, stackId = 2): GivenItem {
  return { window: 'inventory', slot, item, count, stackId }
}

function grid (slot: number, item: ItemName, count: number, stackId = 3): GivenItem {
  return { window: 'ui', slot, item, count, stackId }
}

// Java's slots: the inventory's grid 1 – 4, armor 5 – 8, inventory 9 – 35, hotbar 36 – 44, offhand 45; a table's grid 1 – 9, then 10 – 45
const RECORDED_CLICKS: readonly RecordedClick[] = [
  { name: 'a left click takes the slot\'s stack', screen: 'inventory', given: [stored(4, 'oak_planks', 64, 163)], firstRequest: -771, click: [40, 0, 0], request: '930101850c010000401c0004a30000003b00000000000000ffffffff' },
  { name: 'a left click places the cursor\'s stack in an empty slot', screen: 'inventory', given: [cursor('ender_pearl', 16, 166)], firstRequest: -783, click: [40, 0, 0], request: '9301019d0c010101103b0000a60000001c00040000000000ffffffff' },
  { name: 'a left click places what fits onto a stack of the item', screen: 'inventory', given: [cursor('oak_planks', 64, 1065), stored(4, 'oak_planks', 1, 1064)], firstRequest: -4133, click: [40, 0, 0], request: '930101c9400101013f3b0000290400001c00042804000000ffffffff' },
  { name: 'a left click swaps the cursor\'s stack with a full stack of its item', screen: 'inventory', given: [cursor('ender_pearl', 1, 121), grid(28, 'ender_pearl', 16, 120)], firstRequest: -559, click: [1, 0, 0], request: '930101dd080102023b0000790000000d001c7800000000ffffffff' },
  { name: 'a left click with a full stack on a full stack of its item does nothing', screen: 'inventory', given: [cursor('ender_pearl', 16), stored(4, 'ender_pearl', 16)], firstRequest: -3, click: [40, 0, 0], request: null },
  { name: 'a left click with an unstackable item on one just like it does nothing', screen: 'inventory', given: [cursor('iron_sword', 1), stored(4, 'iron_sword', 1)], firstRequest: -3, click: [40, 0, 0], request: null },
  { name: 'a left click swaps the cursor\'s stack with another item\'s', screen: 'inventory', given: [cursor('iron_sword', 1, 165), stored(4, 'oak_planks', 1, 164)], firstRequest: -777, click: [40, 0, 0], request: '930101910c0102023b0000a50000001c0004a400000000ffffffff' },
  { name: 'a left click with nothing on the cursor on an empty slot does nothing', screen: 'inventory', given: [], firstRequest: -3, click: [40, 0, 0], request: null },
  { name: 'a right click takes half the slot\'s stack, rounded up', screen: 'inventory', given: [grid(28, 'ender_pearl', 5, 378)], firstRequest: -1595, click: [1, 1, 0], request: '930101f518010000030d001c7a0100003b00000000000000ffffffff' },
  { name: 'a right click takes half an even stack', screen: 'inventory', given: [stored(4, 'egg', 16, 773)], firstRequest: -3029, click: [40, 1, 0], request: '930101a92f010000081c0004050300003b00000000000000ffffffff' },
  { name: 'a right click places one in an empty slot', screen: 'inventory', given: [cursor('oak_planks', 5, 380)], firstRequest: -1603, click: [1, 1, 0], request: '9301018519010101013b00007c0100000d001c0000000000ffffffff' },
  { name: 'a right click places one onto a stack of the item', screen: 'inventory', given: [cursor('ender_pearl', 16, 175), stored(4, 'ender_pearl', 1, 174)], firstRequest: -813, click: [40, 1, 0], request: '930101d90c010101013b0000af0000001c0004ae00000000ffffffff' },
  { name: 'a right click swaps the cursor\'s stack with a full stack of its item', screen: 'inventory', given: [cursor('oak_planks', 1, 464), stored(4, 'oak_planks', 64, 463)], firstRequest: -1903, click: [40, 1, 0], request: '930101dd1d0102023b0000d00100001c0004cf01000000ffffffff' },
  { name: 'a right click with a full stack on a full stack of its item does nothing', screen: 'inventory', given: [cursor('oak_planks', 64), stored(4, 'oak_planks', 64)], firstRequest: -3, click: [40, 1, 0], request: null },
  { name: 'a right click swaps the cursor\'s stack with another item\'s', screen: 'inventory', given: [cursor('ender_pearl', 16, 177), stored(4, 'oak_planks', 64, 176)], firstRequest: -821, click: [40, 1, 0], request: '930101e90c0102023b0000b10000001c0004b000000000ffffffff' },
  { name: 'a right click swaps on a crafting table\'s grid', screen: 'workbench', given: [cursor('ender_pearl', 1, 42), grid(36, 'iron_sword', 1, 44)], firstRequest: -265, click: [5, 1, 0], request: '93010191040102023b00002a0000000d00242c00000000ffffffff' },
  { name: 'a shift click moves a hotbar stack to the inventory', screen: 'inventory', given: [stored(4, 'ender_pearl', 16, 1074)], firstRequest: -4161, click: [40, 0, 1], request: '9301018141010101101c0004320400001d00090000000000ffffffff' },
  { name: 'a shift click moves an inventory stack to the hotbar', screen: 'inventory', given: [stored(22, 'ender_pearl', 16, 806)], firstRequest: -3119, click: [22, 0, 1], request: '930101dd30010101101d0016260300001c00000000000000ffffffff' },
  { name: 'a shift click moves the armor to the hotbar or inventory', screen: 'inventory', given: [{ window: 'armor', slot: 0, item: 'iron_helmet', count: 1, stackId: 986 }], firstRequest: -3835, click: [5, 0, 1], request: '930101f53b01010101060000da0300000c00000000000000ffffffff' },
  { name: 'a left click places the cursor\'s arrows in the offhand', screen: 'inventory', given: [cursor('arrow', 64, 239)], firstRequest: -1041, click: [45, 0, 0], request: '930101a110010101403b0000ef0000002200010000000000ffffffff' },
  { name: 'a shift right click moves the offhand\'s stack to the hotbar or inventory', screen: 'inventory', given: [{ window: 'offhand', slot: 0, item: 'oak_planks', count: 64, stackId: 810 }], firstRequest: -3131, click: [45, 1, 1], request: '930101f530010101402200012a0300000c00000000000000ffffffff' },
  { name: 'a shift click moves a grid stack to the hotbar or inventory', screen: 'inventory', given: [grid(28, 'ender_pearl', 16, 126)], firstRequest: -589, click: [1, 0, 1], request: '9301019909010101100d001c7e0000000c00000000000000ffffffff' },
  { name: 'a shift click moves a hotbar stack to the inventory, past a crafting table', screen: 'workbench', given: [stored(4, 'oak_planks', 64, 60)], firstRequest: -333, click: [41, 0, 1], request: '9301019905010101401c00043c0000001d00090000000000ffffffff' },
  { name: 'a shift click moves an inventory stack to the hotbar, past a crafting table', screen: 'workbench', given: [stored(22, 'ender_pearl', 16, 61)], firstRequest: -335, click: [23, 0, 1], request: '9301019d05010101101d00163d0000001c00000000000000ffffffff' },
  { name: 'a shift click moves a crafting table\'s grid stack to the hotbar or inventory', screen: 'workbench', given: [grid(36, 'iron_sword', 1, 48)], firstRequest: -287, click: [5, 0, 1], request: '930101bd04010101010d0024300000000c00000000000000ffffffff' },
  { name: 'a shift click moves a stack onto a stack of its item', screen: 'inventory', given: [stored(0, 'oak_planks', 10, 30), stored(9, 'oak_planks', 10, 31)], firstRequest: -57, click: [36, 0, 1], request: '930101710101010a1c00001e0000001d00091f00000000ffffffff' },
  { name: 'a shift click on an empty slot does nothing, whatever the cursor holds', screen: 'inventory', given: [cursor('iron_sword', 1)], firstRequest: -3, click: [40, 1, 1], request: null },
  { name: 'a hotbar key moves the slot\'s stack to its empty hotbar slot', screen: 'inventory', given: [stored(4, 'iron_sword', 1, 443)], firstRequest: -1863, click: [40, 8, 2], request: '9301018d1d010101011c0004bb0100001c00080000000000ffffffff' },
  { name: 'a hotbar key moves its hotbar slot\'s stack to the empty slot', screen: 'inventory', given: [stored(0, 'iron_sword', 1, 1059)], firstRequest: -4115, click: [40, 0, 2], request: '930101a540010101011c0000230400001c00040000000000ffffffff' },
  { name: 'a hotbar key places the slot\'s stack onto its hotbar slot\'s of the item', screen: 'inventory', given: [stored(4, 'oak_planks', 1, 444), stored(8, 'oak_planks', 1, 445)], firstRequest: -1865, click: [40, 8, 2], request: '930101911d010101011c0004bc0100001c0008bd01000000ffffffff' },
  { name: 'a hotbar key swaps the slot\'s stack with its hotbar slot\'s of another item', screen: 'inventory', given: [stored(4, 'ender_pearl', 16, 446), stored(8, 'oak_planks', 64, 447)], firstRequest: -1867, click: [40, 8, 2], request: '930101951d0102021c0004be0100001c0008bf01000000ffffffff' },
  { name: 'a hotbar key swaps the armor with a helmet unlike it', screen: 'inventory', given: [{ window: 'armor', slot: 0, item: 'iron_helmet', count: 1, stackId: 355, metadata: 50 }, stored(0, 'iron_helmet', 1, 357)], firstRequest: -1481, click: [5, 0, 2], request: '9301019117010202060000630100001c00006501000000ffffffff' },
  { name: 'a left click with an item not worn there on the armor does nothing', screen: 'inventory', given: [{ window: 'armor', slot: 0, item: 'iron_helmet', count: 1, stackId: 108 }, cursor('oak_planks', 64)], firstRequest: -3, click: [5, 0, 0], request: null },
  { name: 'a left click puts nothing in an armor slot the cursor\'s item is not worn in', screen: 'inventory', given: [cursor('oak_planks', 1)], firstRequest: -3, click: [5, 0, 0], request: null },
  { name: 'a right click puts nothing in an armor slot the cursor\'s item is not worn in', screen: 'inventory', given: [cursor('oak_planks', 1)], firstRequest: -3, click: [5, 1, 0], request: null },
  { name: 'a hotbar key moves nothing to an armor slot its item is not worn in', screen: 'inventory', given: [stored(0, 'oak_planks', 1)], firstRequest: -3, click: [5, 0, 2], request: null },
  { name: 'a hotbar key moves the slot\'s whole stack to its empty hotbar slot', screen: 'inventory', given: [stored(9, 'oak_planks', 64, 1269)], firstRequest: -4839, click: [9, 0, 2], request: '930101cd4b010101401d0009f50400001c00000000000000ffffffff' },
  { name: 'a hotbar key moves the offhand\'s stack', screen: 'inventory', given: [{ window: 'offhand', slot: 0, item: 'iron_sword', count: 1, stackId: 554 }], firstRequest: -2199, click: [45, 0, 2], request: '930101ad22010101012200012a0200001c00000000000000ffffffff' },
  { name: 'a hotbar key swaps a grid stack', screen: 'inventory', given: [grid(28, 'ender_pearl', 16, 993), stored(0, 'oak_planks', 64, 994)], firstRequest: -3861, click: [1, 0, 2], request: '930101a93c0102020d001ce10300001c0000e203000000ffffffff' },
  { name: 'a hotbar key moves its hotbar slot\'s stack to a crafting table\'s grid', screen: 'workbench', given: [stored(0, 'iron_sword', 1, 635)], firstRequest: -2457, click: [5, 0, 2], request: '930101b126010101011c00007b0200000d00240000000000ffffffff' },
  { name: 'a hotbar key places the cursor\'s stack in its empty hotbar slot', screen: 'inventory', given: [cursor('ender_pearl', 1, 194), stored(22, 'oak_planks', 1)], firstRequest: -873, click: [22, 8, 2], request: '930101d10d010101013b0000c20000001c00080000000000ffffffff' },
  { name: 'a hotbar key over its own hotbar slot does nothing', screen: 'inventory', given: [stored(0, 'oak_planks', 64)], firstRequest: -3, click: [36, 0, 2], request: null },
  { name: 'the drop key drops one of the slot\'s stack', screen: 'inventory', given: [stored(4, 'ender_pearl', 16, 770)], firstRequest: -3023, click: [40, 0, 4], request: '9301019d2f010303011c0004020300000000ffffffff' },
  { name: 'the drop key with ctrl drops the slot\'s stack', screen: 'inventory', given: [stored(4, 'ender_pearl', 16, 1046)], firstRequest: -4073, click: [40, 1, 4], request: '930101d13f010303101c0004160400000000ffffffff' },
  { name: 'the drop key drops one of the cursor\'s stack', screen: 'inventory', given: [cursor('iron_sword', 1, 772), stored(4, 'ender_pearl', 16)], firstRequest: -3027, click: [40, 0, 4], request: '930101a52f010303013b0000040300000000ffffffff' },
  { name: 'the drop key over a crafting output drops one of the cursor\'s stack, crafting nothing', screen: 'inventory', given: [cursor('crafting_table', 1, 721), ...[28, 29, 30, 31].map((slot, index) => grid(slot, 'oak_planks', 1, 717 + index))], firstRequest: -2839, click: [0, 0, 4], request: '930101ad2c010303013b0000d10200000000ffffffff' },
  { name: 'the drop key over a crafting output with nothing on the cursor does nothing', screen: 'inventory', given: [28, 29, 30, 31].map((slot, index) => grid(slot, 'oak_planks', 1, 717 + index)), firstRequest: -3, click: [0, 0, 4], request: null },
  { name: 'the drop key with ctrl does nothing while the cursor holds an item', screen: 'inventory', given: [cursor('iron_sword', 1), stored(4, 'oak_planks', 64)], firstRequest: -3, click: [40, 1, 4], request: null },
  { name: 'a left click outside the window drops the cursor\'s stack', screen: 'inventory', given: [cursor('ender_pearl', 5, 249)], firstRequest: -1065, click: [-999, 0, 0], request: '930101d110010303053b0000f90000000000ffffffff' },
  { name: 'a right click outside the window drops one of the cursor\'s stack', screen: 'inventory', given: [cursor('oak_planks', 5, 250)], firstRequest: -1069, click: [-999, 1, 0], request: '930101d910010303013b0000fa0000000000ffffffff' }
]

describe('bedrock window clicks', () => {
  for (const recorded of DROPS) {
    describe(`the vanilla client taking a stack to the cursor and dropping it outside the window (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: sends each click's request in the next tick, and resolves once the server took it`, async () => {
          const { bot, internal, server, driver, errors, inventory } = await joined(version)
          inventory.slot('inventory', 0, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 10, stackId: recorded.stackId })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const requests = requestsSince(server)

          const take = bot.clickWindow(36, 0, 0)
          await driver.tick()
          assert.deepStrictEqual([requests(), bot.heldItem, bot.inventory.selectedItem?.count], [[recorded.take], null, 10])
          receive(server, recorded.taken)
          await driver.tick()
          await take

          const drop = bot.clickWindow(-999, 0, 0)
          await driver.tick()
          assert.deepStrictEqual([requests(), bot.inventory.selectedItem], [[recorded.drop], null])
          receive(server, recorded.dropped)
          await driver.tick()
          await drop
          assert.deepStrictEqual([bot.inventory.selectedItem, bot.heldItem, errors], [null, null, []])
          bot.end()
        })
      }
    })
  }

  for (const recorded of SHIELDS) {
    describe(`the vanilla client putting a shield in the offhand (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: places the cursor's shield in the offhand with a right click`, async () => {
          const { bot, internal, server, driver, errors, inventory } = await joined(version)
          // a shield is written with its blocking tick where the codec knows its id: from start_game's item states, up to 1.21.50
          const blocking = atLeast(version, 'bedrock_1.21.60') ? {} : { blockingTick: 0n }
          inventory.slot('inventory', 0, { id: bot.registry.itemsByName['shield']?.id ?? 0, count: 1, stackId: recorded.stackId, ...blocking })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const requests = requestsSince(server)

          const take = bot.clickWindow(36, 0, 0)
          await driver.tick()
          assert.deepStrictEqual([requests(), bot.heldItem], [[recorded.take], null])
          receive(server, recorded.taken)
          await driver.tick()
          await take

          const place = bot.clickWindow(45, 1, 0)
          await driver.tick()
          assert.deepStrictEqual([requests(), bot.inventory.slots[45]?.name], [[recorded.place], 'shield'])
          receive(server, recorded.placed)
          await driver.tick()
          await place
          assert.deepStrictEqual([bot.inventory.slots[45]?.name, bot.inventory.slots[45]?.stackId, errors], ['shield', recorded.stackId, []])
          bot.end()
        })
      }
    })
  }

  // the requests are written alike from 1.26.40 (1.26.60 brackets some clicks with drags, see below)
  describe('the vanilla client\'s clicks, as recorded on 1.26.51 (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      for (const recorded of RECORDED_CLICKS) {
        it(`bedrock ${version}: ${recorded.name}`, async () => {
          const { bot, internal, server, driver, errors, inventory } = await joined(version)
          openScreen(server, recorded.screen)
          for (const { window, slot, item, ...given } of recorded.given) inventory.slot(window, slot, { id: bot.registry.itemsByName[item]?.id ?? 0, ...given })
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const requests = requestsSince(server)
          const [slot, mouseButton, mode] = recorded.click
          let settled = false
          const click = bot.clickWindow(slot, mouseButton, mode)
          click.then(() => { settled = true }, () => {})
          await driver.tick()
          assert.deepStrictEqual(requests(), recorded.request === null ? [] : [recorded.request])
          assert.strictEqual(settled, recorded.request === null)
          assert.deepStrictEqual(errors, [])
          bot.end()
          click.catch(() => {})
        })
      }
    }
  })

  // recorded on 1.26.51.1: the take's response comes after the next click, made in a frame without a tick
  describe('the vanilla client naming a click\'s slots in the frame it clicks, a response that arrives before its request leaves notwithstanding (1.26.51+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51')) {
      it(`bedrock ${version}: the cursor named by the unanswered take, then by the server's stack id`, async () => {
        const { bot, internal, server, driver, errors, inventory } = await joined(version)
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 4, stackId: 5, blockRuntimeId: 1921718966 })
        receive(server, '2e03ff00750001')
        await driver.tick()
        internal._core.requestIds.continueProcess(-11)
        const batches = batchesSince(server)
        const requests = requestsSince(server)

        const take = bot.clickWindow(36, 0, 0)
        await driver.tick()
        assert.deepStrictEqual(requests(), ['93010115010000041c0000050000003b00000000000000ffffffff'])
        batches()
        const placeOne = bot.clickWindow(1, 1, 0)
        await driver.frame(10)
        assert.deepStrictEqual(requests(), [])
        receive(server, '940101001501021c0001000000000000003b0001000004010a000000')
        await driver.tick()
        await take
        // the hand emptied, told before the request in the tick, as recorded
        assert.deepStrictEqual(batches().flat().filter(packet => !packet.startsWith('e602')), ['21040000', '1f010000000000000000000000', '93010119010101013b0000f5ffffff0d001c0000000000ffffffff', 'player_auth_input'])
        assert.strictEqual(requests().length, 1)
        receive(server, '940101001901023b0001000003010a0000000d00011c1c01010c000000')
        await driver.tick()
        await placeOne

        const placeAnother = bot.clickWindow(2, 1, 0)
        await driver.tick()
        assert.deepStrictEqual(requests(), ['9301011d010101013b0000050000000d001d0000000000ffffffff'])
        receive(server, '940101001d01023b0001000002010a0000000d00011d1d01010e000000')
        await driver.tick()
        await placeAnother
        assert.deepStrictEqual([bot.inventory.selectedItem?.count, bot.inventory.slots.slice(1, 3).map(item => item?.stackId), errors], [2, [6, 7], []])
        bot.end()
      })

      // recorded on 1.26.51.1: a plank taken to the cursor, the take's response arriving in the frame of the next click
      it(`bedrock ${version}: the cursor named by the take whose response came in the click's frame, the hand told before the request`, async () => {
        const { bot, server, driver, errors, inventory } = await joined(version)
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 1, stackId: 2, blockRuntimeId: 1921718966 })
        receive(server, '2e03ff00750001')
        await driver.tick()
        const batches = batchesSince(server)

        const take = bot.clickWindow(36, 0, 0)
        await driver.tick()
        assert.deepStrictEqual(batches().flat().filter(packet => packet.startsWith('9301')), ['93010105010000011c0000020000003b00000000000000ffffffff'])
        receive(server, '940101000501021c0001000000000000003b00010000010104000000')
        const place = bot.clickWindow(1, 1, 0)
        await driver.tick()
        await take
        assert.deepStrictEqual(batches().flat().filter(packet => !packet.startsWith('e602')), ['21040000', '1f010000000000000000000000', '93010109010101013b0000fdffffff0d001c0000000000ffffffff', 'player_auth_input'])
        receive(server, '940101000901023b0001000000000000000d00011c1c010104000000')
        await driver.tick()
        await place
        assert.deepStrictEqual([bot.inventory.selectedItem, bot.inventory.slots[1]?.stackId, errors], [null, 2, []])
        bot.end()
      })
    }
  })

  // recorded on 1.26.60.5: a crafting table's grid given one of the cursor's 4 planks, then the 3 others put back
  describe('the vanilla client bracketing a click that places from the cursor with serverbound_cursor_item_drag (1.26.60+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60')) {
      it(`bedrock ${version}: the start before the request, the stop in the input pass of the frame after the request left`, async () => {
        const { bot, internal, server, driver, errors, inventory } = await joined(version)
        openScreen(server, 'workbench')
        inventory.slot('ui', 0, { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 4, stackId: 2 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-5)
        const batches = batchesSince(server)

        const placeOne = bot.clickWindow(4, 1, 0)
        await driver.tick()
        await driver.tick()
        assert.deepStrictEqual(batches(), [[DRAG_START, '93010109010101013b0000020000000d00230000000000ffffffff', 'player_auth_input'], [DRAG_STOP, 'player_auth_input']])
        receive(server, '940101000901023b000100000301040000000d00012323010106000000')
        await driver.tick()
        await placeOne
        assert.deepStrictEqual(batches(), [['player_auth_input']])

        // clicked in a frame without a tick, its request leaves in the next frame's, and the stop in the frame after
        const placeRest = bot.clickWindow(37, 0, 0)
        await driver.frame(10)
        await driver.tick()
        await driver.frame(10)
        assert.deepStrictEqual(batches(), [[DRAG_START], ['9301010d010101033b0000020000001c00000000000000ffffffff', 'player_auth_input'], [DRAG_STOP]])
        assert.deepStrictEqual(errors, [])
        bot.end()
        placeRest.catch(() => {})
      })

      it(`bedrock ${version}: one bracket for two clicks in a frame, the stop before the next click's start`, async () => {
        const { bot, server, driver, inventory } = await joined(version)
        openScreen(server, 'inventory')
        inventory.slot('ui', 0, { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 4, stackId: 2 })
        await driver.tick()
        const batches = batchesSince(server)
        const names = (): string[][] => batches().map(batch => batch.map(packet => packet.startsWith(ITEM_STACK_REQUEST) ? 'item_stack_request' : packet))
        const clicks = [bot.clickWindow(1, 1, 0), bot.clickWindow(2, 1, 0)]
        await driver.tick()
        clicks.push(bot.clickWindow(3, 1, 0))
        await driver.tick()
        await driver.tick()
        assert.deepStrictEqual(names(), [
          [DRAG_START, 'item_stack_request', 'player_auth_input'],
          [DRAG_STOP, DRAG_START, 'item_stack_request', 'player_auth_input'],
          [DRAG_STOP, 'player_auth_input']
        ])
        bot.end()
        Promise.allSettled(clicks).catch(() => {})
      })

      it(`bedrock ${version}: none for a click that takes to the cursor or swaps it, nor for a key`, async () => {
        const { bot, server, driver, inventory } = await joined(version)
        openScreen(server, 'inventory')
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 4, stackId: 2 })
        inventory.slot('inventory', 1, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 4, stackId: 3 })
        await driver.tick()
        const clicks = [bot.clickWindow(36, 0, 0), bot.clickWindow(37, 0, 0), bot.clickWindow(40, 0, 2), bot.clickWindow(-999, 0, 0)]
        await driver.ticks(3)
        assert.deepStrictEqual(server.sentOf('serverbound_cursor_item_drag'), [])
        bot.end()
        Promise.allSettled(clicks).catch(() => {})
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    async function withScreen (type: 'inventory' | 'workbench' = 'inventory'): Promise<TestBot & Joined & { errors: string[], inventory: ServerInventory, idOf: (name: string) => number }> {
      const testBot = await joined(version)
      openScreen(testBot.server, type)
      await testBot.driver.tick()
      return { ...testBot, idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0 }
    }

    /** the moves of the bot's last item stack request packet: each request's actions as type, count, source and destination */
    function lastMoves (server: FakeBedrockClient): unknown[] {
      return server.sentOf('item_stack_request').at(-1)?.requests.map(({ request_id: id, actions }) => [id, ...actions.map(({ type_id: type, count, source, destination }) =>
        [type, count, ...[source, destination].filter(slot => slot !== undefined).map(slot => `${String(typeof slot.slot_type === 'object' ? slot.slot_type.container_id : slot.slot_type)}:${slot.slot}#${slot.stack_id}`)])]) ?? []
    }

    it('rejects the clicks it does not make, before they reach a frame', async () => {
      const { bot } = await withScreen()
      for (const [mouseButton, mode] of [[2, 0], [-1, 0], [0.5, 0], [2, 1], [9, 2], [40, 2], [0, 3], [2, 4], [0, 5], [0, 6]] as const) {
        await assert.rejects(bot.clickWindow(36, mouseButton, mode), { message: `clickWindow does not support mode ${mode} with mouse button ${mouseButton} on Bedrock` })
      }
      bot.end()
    })

    it('rejects a click without a screen open, and on a slot the window has not', async () => {
      const { bot, server, driver } = await joined(version)
      const noScreen = assert.rejects(bot.clickWindow(36, 0, 0), { message: 'clickWindow needs an open window: on Bedrock the inventory too is a screen (bot.openInventory())' })
      await driver.frame(10)
      await noScreen
      openScreen(server, 'workbench')
      await driver.frame(10)
      for (const slot of [46, -1, 1.5]) {
        const rejected = assert.rejects(bot.clickWindow(slot, 0, 0), { message: `the minecraft:crafting_table window has no slot ${slot}` })
        await driver.frame(10)
        await rejected
      }
      bot.end()
    })

    it('rejects a click when the bot ends before its input pass, and one made after', async () => {
      const { bot, driver } = await withScreen()
      const ended: string[] = []
      bot.clickWindow(36, 0, 0).catch((error: Error) => { ended.push(error.message) })
      bot.end()
      await driver.frame(10)
      bot.clickWindow(36, 0, 0).catch((error: Error) => { ended.push(error.message) })
      await driver.frame(10)
      assert.deepStrictEqual(ended, ['the bot ended', 'the bot ended'])
    })

    it('resolves a click that sends nothing in its frame: on a crafting output no recipe filled, the drop key on what an output holds, outside but by a mouse button, outside with nothing on the cursor', async () => {
      for (const screen of ['inventory', 'workbench'] as const) {
        const { bot, server, driver, inventory, idOf } = await withScreen(screen)
        inventory.slot('ui', 0, { id: idOf('oak_planks'), count: 4, stackId: 2 })
        await driver.frame(10)
        let settled = 0
        for (const [slot, mouseButton, mode] of [[0, 0, 0], [0, 1, 1], [0, 0, 2], [0, 1, 4], [-999, 0, 1], [-999, 0, 2], [-999, 0, 4]] as const) bot.clickWindow(slot, mouseButton, mode).then(() => { settled++ }, () => {})
        await driver.frame(10)
        inventory.slot('ui', 0, null)
        inventory.slot('ui', 50, { id: idOf('crafting_table'), count: 1, stackId: 3 })
        await driver.frame(10)
        for (const mouseButton of [0, 1]) bot.clickWindow(-999, mouseButton, 0).then(() => { settled++ }, () => {})
        for (const mouseButton of [0, 1]) bot.clickWindow(0, mouseButton, 4).then(() => { settled++ }, () => {})
        await driver.frame(10)
        await driver.tick()
        assert.deepStrictEqual([settled, server.sentOf('item_stack_request')], [11, []])
        bot.end()
      }
    })

    it('sends the clicks of a frame in one packet, after a request made before them, each naming the slots the earlier changed', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
      inventory.slot('inventory', 1, { id: idOf('oak_planks'), count: 60, stackId: 8 })
      await driver.tick()
      bot.clickWindow(36, 0, 0).catch(() => {})
      bot.clickWindow(37, 0, 0).catch(() => {})
      bot.closeWindow(bot.inventory).catch(() => {})
      await driver.tick()
      // 4 of the cursor's 10 onto slot 1's 60, the 6 others handed back to the slot the take emptied
      assert.deepStrictEqual(lastMoves(server), [
        [-3, ['take', 10, 'hotbar:0#7', 'cursor:0#0']],
        [-5, ['place', 4, 'cursor:0#-3', 'hotbar:1#8']],
        [-7, ['place', 6, 'cursor:0#-5', 'hotbar_and_inventory:0#-3']]
      ])
      assert.strictEqual(server.sentOf('item_stack_request').length, 1)
      bot.end()
    })

    it('predicts a swap and a drop at once, and undoes them when the server refuses', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 10, stackId: 7 })
      inventory.slot('ui', 0, { id: idOf('stick'), count: 3, stackId: 8 })
      await driver.tick()
      const swap = bot.clickWindow(36, 0, 0)
      await driver.frame(10)
      assert.deepStrictEqual([bot.heldItem?.name, bot.heldItem?.stackId, bot.inventory.selectedItem?.name, bot.inventory.selectedItem?.stackId], ['stick', 8, 'oak_planks', 7])
      const drop = bot.clickWindow(-999, 1, 0)
      await driver.frame(10)
      assert.deepStrictEqual(bot.inventory.selectedItem?.count, 9)
      const refused = Promise.all([
        assert.rejects(swap, { message: 'the server refused item stack request -3: CannotSwapItem' }),
        assert.rejects(drop, { message: 'the server refused item stack request -5: CannotDropItem' })
      ])
      server.send('item_stack_response', { responses: [{ status: 54, request_id: -3 }, { status: 59, request_id: -5 }] })
      await driver.tick()
      await refused
      assert.deepStrictEqual([bot.heldItem?.name, bot.heldItem?.count, bot.inventory.selectedItem?.name, bot.inventory.selectedItem?.count], ['oak_planks', 10, 'stick', 3])
      bot.end()
    })

    it('shifts a stack onto the stacks of its item with room, in order, then to the first empty slot, in one request', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('ui', 28, { id: idOf('oak_planks'), count: 40, stackId: 7 })
      inventory.slot('inventory', 2, { id: idOf('oak_planks'), count: 64, stackId: 8 })
      inventory.slot('inventory', 3, { id: idOf('stick'), count: 1, stackId: 9 })
      inventory.slot('inventory', 5, { id: idOf('oak_planks'), count: 50, stackId: 10 })
      inventory.slot('inventory', 20, { id: idOf('oak_planks'), count: 60, stackId: 11 })
      await driver.tick()
      bot.clickWindow(1, 0, 1).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 14, 'crafting_input:28#7', 'hotbar_and_inventory:5#10'], ['place', 4, 'crafting_input:28#-3', 'hotbar_and_inventory:20#11'], ['place', 22, 'crafting_input:28#-3', 'hotbar_and_inventory:0#0']]])
      assert.deepStrictEqual([bot.inventory.slots[1], bot.inventory.slots[41]?.count, bot.inventory.slots[20]?.count, bot.heldItem?.count], [null, 64, 64, 22])
      bot.end()
    })

    it('shifts only what has room, and nothing to a full inventory', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('stick'), count: slot === 12 ? 60 : 64, stackId: 100 + slot })))
      inventory.slot('ui', 28, { id: idOf('stick'), count: 10, stackId: 7 })
      inventory.slot('ui', 29, { id: idOf('oak_planks'), count: 10, stackId: 8 })
      await driver.tick()
      const clicks = [bot.clickWindow(1, 0, 1), bot.clickWindow(2, 0, 1)]
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 4, 'crafting_input:28#7', 'hotbar_and_inventory:12#112']]])
      assert.deepStrictEqual([bot.inventory.slots[1]?.count, bot.inventory.slots[2]?.count], [6, 10])
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })

    it('presses a hotbar key with the cursor holding an item over an occupied hotbar slot, or over its own slot, or over an empty slot itself empty: nothing', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('inventory', 3, { id: idOf('stick'), count: 1, stackId: 7 })
      inventory.slot('inventory', 4, { id: idOf('stick'), count: 1, stackId: 9 })
      inventory.slot('inventory', 5, { id: idOf('stick'), count: 10, stackId: 10 })
      await driver.tick()
      const clicks = [bot.clickWindow(9, 0, 2), bot.clickWindow(9, 3, 2), bot.clickWindow(41, 5, 2)]
      await driver.frame(10)
      inventory.slot('ui', 0, { id: idOf('stick'), count: 1, stackId: 8 })
      await driver.frame(10)
      clicks.push(bot.clickWindow(10, 4, 2))
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 1, 'hotbar:3#7', 'inventory:9#0']]])
      assert.strictEqual(server.sentOf('item_stack_request').length, 1)
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })

    it('places onto a stack with room for one only one, by either mouse button', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('ui', 0, { id: idOf('oak_planks'), count: 5, stackId: 7 })
      inventory.slot('inventory', 9, { id: idOf('oak_planks'), count: 63, stackId: 8 })
      inventory.slot('inventory', 10, { id: idOf('oak_planks'), count: 63, stackId: 9 })
      await driver.tick()
      const clicks = [bot.clickWindow(9, 0, 0), bot.clickWindow(10, 1, 0)]
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 1, 'cursor:0#7', 'inventory:9#8']], [-5, ['place', 1, 'cursor:0#-3', 'inventory:10#9']]])
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })

    it('puts in an armor slot only an item the registry enchants as worn there, and swaps none out for another', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      const moves = (): unknown[] => server.sentOf('item_stack_request').flatMap(({ requests }) => requests.flatMap(({ actions }) => actions.map(({ type_id: type, destination }) => [type, destination?.slot])))
      inventory.slot('armor', 2, { id: idOf('iron_leggings'), count: 1, stackId: 7 })
      inventory.slot('inventory', 0, { id: idOf('iron_sword'), count: 1, stackId: 8 })
      await driver.tick()
      for (const [item, slots] of [['iron_boots', [5, 6, 7, 8]], ['carved_pumpkin', [6, 5]], ['elytra', [5, 6]]] as const) {
        inventory.slot('ui', 0, { id: idOf(item), count: 1, stackId: 9 })
        await driver.tick()
        for (const slot of slots) bot.clickWindow(slot, 0, 0).catch(() => {})
        await driver.tick()
      }
      inventory.slot('ui', 0, null)
      await driver.tick()
      bot.clickWindow(7, 0, 2).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual(moves(), [['place', 3], ['place', 0], ['place', 1]])
      bot.end()
    })

    // recorded on 1.26.51: eggs by a left and a right click from the cursor and by a hotbar key, refused; arrows and a shield taken
    it('sends nothing for a click that would put an item the offhand does not take there, as an egg', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('ui', 0, { id: idOf('egg'), count: 16, stackId: 7 })
      inventory.slot('inventory', 0, { id: idOf('egg'), count: 1, stackId: 8 })
      inventory.slot('inventory', 1, { id: idOf('totem_of_undying'), count: 1, stackId: 9 })
      await driver.tick()
      const refused = [bot.clickWindow(45, 0, 0), bot.clickWindow(45, 1, 0)]
      await driver.tick()
      inventory.slot('ui', 0, null)
      await driver.tick()
      refused.push(bot.clickWindow(45, 0, 2))
      await driver.tick()
      await Promise.all(refused)
      assert.deepStrictEqual(server.sentOf('item_stack_request'), [])
      const placed = bot.clickWindow(45, 1, 2)
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 1, 'hotbar:1#9', 'offhand:1#0']]])
      bot.end()
      placed.catch(() => {})
    })

    it('puts the other items the vanilla client takes in the offhand there, unrecorded: a nautilus shell, a filled map, a firework rocket', async () => {
      for (const item of ['nautilus_shell', 'filled_map', 'firework_rocket']) {
        const { bot, server, driver, inventory, idOf } = await withScreen()
        inventory.slot('inventory', 1, { id: idOf(item), count: 1, stackId: 9 })
        await driver.tick()
        const placed = bot.clickWindow(45, 1, 2)
        await driver.tick()
        assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 1, 'hotbar:1#9', 'offhand:1#0']]])
        bot.end()
        placed.catch(() => {})
      }
    })

    // recorded only with one item moved (on the cursor or in the key's slot): the bot moves the whole stack, as a left click does
    it('moves the whole stack by a hotbar key: from the cursor to the key\'s empty slot, from the key\'s slot to the empty slot', async () => {
      const { bot, server, driver, inventory, idOf } = await withScreen()
      inventory.slot('ui', 0, { id: idOf('stick'), count: 5, stackId: 7 })
      inventory.slot('inventory', 1, { id: idOf('oak_planks'), count: 10, stackId: 8 })
      await driver.tick()
      const clicks = [bot.clickWindow(9, 0, 2)]
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-3, ['place', 5, 'cursor:0#7', 'hotbar:0#0']]])
      inventory.slot('ui', 0, null)
      await driver.tick()
      clicks.push(bot.clickWindow(10, 1, 2))
      await driver.tick()
      assert.deepStrictEqual(lastMoves(server), [[-5, ['place', 10, 'hotbar:1#8', 'inventory:10#0']]])
      bot.end()
      Promise.allSettled(clicks).catch(() => {})
    })

    it('takes nothing with a right click or a drop key on an empty slot', async () => {
      const { bot, server, driver } = await withScreen()
      const clicks = [bot.clickWindow(9, 1, 0), bot.clickWindow(9, 0, 4), bot.clickWindow(9, 1, 4)]
      await driver.tick()
      await Promise.all(clicks)
      assert.deepStrictEqual(server.sentOf('item_stack_request'), [])
      bot.end()
    })
  })
})
