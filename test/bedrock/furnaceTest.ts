import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { ContainerName } from '../../lib/bedrock/modules/items.ts'
import { isFuel } from '../../lib/bedrock/screens/furnace.ts'
import type { FurnaceType } from '../../lib/bedrock/screens/furnace.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { InventoryWindow, RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt } from './common/world.ts'

// The vanilla client's recorded clicks on a furnace, a blast furnace and a smoker against Bedrock Dedicated Server: the
// bot must send its requests and closes, byte for byte.

const INGREDIENTS: Readonly<Record<FurnaceType, ContainerName>> = { furnace: 'furnace_ingredient', blast_furnace: 'blast_furnace_ingredient', smoker: 'smoker_ingredient' }

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, name: string, params: object): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** the item stack requests the bot sent since the last call, as written */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const all = server.sentOf('item_stack_request')
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.map(params => hexOf(server, 'item_stack_request', params))
  }
}

function closesOf (server: FakeBedrockClient): string[] {
  return server.sentOf('container_close').map(params => hexOf(server, 'container_close', params))
}

/** the closes, inventory openings and uses the bot sent since the call, in order */
function closesAndUsesSince (server: FakeBedrockClient): () => string[] {
  const from = server.sent.length
  return () => server.sent.slice(from).flatMap(({ name, params }) => {
    if (name === 'interact') return (params as BedrockServerboundPackets['interact']).action_id === 'open_inventory' ? ['open_inventory'] : []
    return name === 'container_close' || name === 'inventory_transaction' ? [name] : []
  })
}

function blockOf (bot: BedrockBot, x: number, y: number, z: number): Block {
  const block = bot.blockAt(new Vec3(x, y, z))
  assert.ok(block !== null)
  return block
}

type FurnaceBot = TestBot & { inventory: ServerInventory, errors: string[] }

async function joined (version: BedrockVersion, { blocks = [], ...options }: { screenAnimations?: boolean, blocks?: readonly BlockAt[] } = {}): Promise<FurnaceBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const world = new ServerWorld(testBot.server, { blocks })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors }
}

function openFurnace (server: FakeBedrockClient, id: number, type: FurnaceType): void {
  server.send('container_open', { window_id: id, window_type: type, coordinates: { x: 2, y: -60, z: 0 }, runtime_entity_id: -1n })
}

function idOf (bot: BedrockBot, name: string): number {
  const item = bot.registry.itemsByName[name]
  assert.ok(item !== undefined, name)
  return item.id
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** the frame in which the vanilla client sends container_close after the crafting table's animation, at the rate it was recorded at (as inventoryTest's) */
function closeFrame (version: BedrockVersion): number {
  return atLeast(version, 'bedrock_1.26.60') ? 8 : 14
}

/**
 * recorded in reduced_stations, on each screen: a beef (1.16.201: the input given) from hotbar slot 0 taken to the
 * cursor and placed in the input, a coal from hotbar slot 1 into the fuel; once cooked, the furnace's and the smoker's
 * output taken to the cursor and placed in hotbar slot 8, the blast furnace's shift clicked; then the close
 */
interface RecordedScreen {
  type: FurnaceType
  window: number
  firstRequest: number
  /** the input's; the coal's is 2 more, the output's 3 */
  stackId: number
  requests: readonly string[]
  close: string
}

interface RecordedGroup {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  screens: readonly RecordedScreen[]
}

const GROUPS: readonly RecordedGroup[] = [
  {
    name: 'container_id and slot_id (recorded on 1.16.201.2)',
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    screens: [
      { type: 'furnace', window: 10, firstRequest: -3983, stackId: 3001, requests: ['9301019d3e0100011b00f22e3a000000', '930101a13e0101013a00f22e18000000', '930101a53e0100011b01f62e3a000000', '930101a93e0101013a00f62e17010000', '930101ad3e0100011902f82e3a000000', '930101b13e0101013a00f82e1b080000'], close: '2f0a00' },
      { type: 'blast_furnace', window: 11, firstRequest: -3995, stackId: 3006, requests: ['930101b53e0100011b00fc2e3a000000', '930101b93e0101013a00fc2e2c000000', '930101bd3e0100011b01802f3a000000', '930101c13e0101013a00802f17010000', '930101c53e0101011902822f0c000000'], close: '2f0b00' },
      { type: 'smoker', window: 12, firstRequest: -4005, stackId: 3011, requests: ['930101c93e0100011b00862f3a000000', '930101cd3e0101013a00862f2d000000', '930101d13e0100011b018a2f3a000000', '930101d53e0101013a008a2f17010000', '930101d93e01000119028c2f3a000000', '930101dd3e0101013a008c2f1b080000'], close: '2f0c00' }
    ]
  },
  {
    name: 'slot_type, aux items with a stack id (recorded on 1.16.210.5)',
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    screens: [
      { type: 'furnace', window: 10, firstRequest: -4947, stackId: 3487, requests: ['930101a54d0100011b00be363a000000', '930101a94d0101013a00be3618000000', '930101ad4d0100011b01c2363a000000', '930101b14d0101013a00c23617010000', '930101b54d0100011902c4363a000000', '930101b94d0101013a00c4361b080000'], close: '2f0a00' },
      { type: 'blast_furnace', window: 11, firstRequest: -4959, stackId: 3492, requests: ['930101bd4d0100011b00c8363a000000', '930101c14d0101013a00c8362c000000', '930101c54d0100011b01cc363a000000', '930101c94d0101013a00cc3617010000', '930101cd4d0101011902ce360c000000'], close: '2f0b00' },
      { type: 'smoker', window: 12, firstRequest: -4969, stackId: 3497, requests: ['930101d14d0100011b00d2363a000000', '930101d54d0101013a00d2362d000000', '930101d94d0100011b01d6363a000000', '930101dd4d0101013a00d63617010000', '930101e14d0100011902d8363a000000', '930101e54d0101013a00d8361b080000'], close: '2f0c00' }
    ]
  },
  {
    name: 'slot_type, items (recorded on 1.16.220.2)',
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.19.21',
    screens: [
      { type: 'furnace', window: 10, firstRequest: -1657, stackId: 943, requests: ['930101f1190100011b00de0e3a000000', '930101f5190101013a00de0e18000000', '930101f9190100011b01e20e3a000000', '930101fd190101013a00e20e17010000', '930101811a0100011902e40e3a000000', '930101851a0101013a00e40e1b080000'], close: '2f0a00' },
      { type: 'blast_furnace', window: 11, firstRequest: -1669, stackId: 948, requests: ['930101891a0100011b00e80e3a000000', '9301018d1a0101013a00e80e2c000000', '930101911a0100011b01ec0e3a000000', '930101951a0101013a00ec0e17010000', '930101991a0101011902ee0e0c000000'], close: '2f0b00' },
      { type: 'smoker', window: 12, firstRequest: -1679, stackId: 953, requests: ['9301019d1a0100011b00f20e3a000000', '930101a11a0101013a00f20e2d000000', '930101a51a0100011b01f60e3a000000', '930101a91a0101013a00f60e17010000', '930101ad1a0100011902f80e3a000000', '930101b11a0101013a00f80e1b080000'], close: '2f0c00' }
    ]
  },
  {
    name: 'the request\'s cause (recorded on 1.19.30.4)',
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    screens: [
      { type: 'furnace', window: 10, firstRequest: -4045, stackId: 2919, requests: ['930101993f0100011b00ce2d3a000000ffffffff', '9301019d3f0101013a00ce2d18000000ffffffff', '930101a13f0100011b01d22d3a000000ffffffff', '930101a53f0101013a00d22d17010000ffffffff', '930101a93f0100011902d42d3a000000ffffffff', '930101ad3f0101013a00d42d1b080000ffffffff'], close: '2f0a00' },
      { type: 'blast_furnace', window: 11, firstRequest: -4057, stackId: 2924, requests: ['930101b13f0100011b00d82d3a000000ffffffff', '930101b53f0101013a00d82d2c000000ffffffff', '930101b93f0100011b01dc2d3a000000ffffffff', '930101bd3f0101013a00dc2d17010000ffffffff', '930101c13f0101011902de2d0c000000ffffffff'], close: '2f0b00' },
      { type: 'smoker', window: 12, firstRequest: -4067, stackId: 2929, requests: ['930101c53f0100011b00e22d3a000000ffffffff', '930101c93f0101013a00e22d2d000000ffffffff', '930101cd3f0100011b01e62d3a000000ffffffff', '930101d13f0101013a00e62d17010000ffffffff', '930101d53f0100011902e82d3a000000ffffffff', '930101d93f0101013a00e82d1b080000ffffffff'], close: '2f0c00' }
    ]
  },
  {
    name: 'the containers renumbered (recorded on 1.19.50.2)',
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.80',
    screens: [
      { type: 'furnace', window: 10, firstRequest: -4469, stackId: 3203, requests: ['930101e9450100011c0086323b000000ffffffff', '930101ed450101013b00863219000000ffffffff', '930101f1450100011c018a323b000000ffffffff', '930101f5450101013b008a3218010000ffffffff', '930101f9450100011a028c323b000000ffffffff', '930101fd450101013b008c321c080000ffffffff'], close: '2f0a00' },
      { type: 'blast_furnace', window: 11, firstRequest: -4481, stackId: 3208, requests: ['93010181460100011c0090323b000000ffffffff', '93010185460101013b0090322d000000ffffffff', '93010189460100011c0194323b000000ffffffff', '9301018d460101013b00943218010000ffffffff', '93010191460101011a0296320c000000ffffffff'], close: '2f0b00' },
      { type: 'smoker', window: 12, firstRequest: -4491, stackId: 3213, requests: ['93010195460100011c009a323b000000ffffffff', '93010199460101013b009a322e000000ffffffff', '9301019d460100011c019e323b000000ffffffff', '930101a1460101013b009e3218010000ffffffff', '930101a5460100011a02a0323b000000ffffffff', '930101a9460101013b00a0321c080000ffffffff'], close: '2f0c00' }
    ]
  },
  {
    name: 'the close naming the screen\'s type none (recorded on 1.21.0.3)',
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    screens: [
      { type: 'furnace', window: 12, firstRequest: -127, stackId: 53, requests: ['930101fd010100011c006a3b000000ffffffff', '93010181020101013b006a19000000ffffffff', '93010185020100011c016e3b000000ffffffff', '93010189020101013b006e18010000ffffffff', '9301018d020100011a02703b000000ffffffff', '93010191020101013b00701c080000ffffffff'], close: '2f0cf700' },
      { type: 'blast_furnace', window: 13, firstRequest: -139, stackId: 58, requests: ['93010195020100011c00743b000000ffffffff', '93010199020101013b00742d000000ffffffff', '9301019d020100011c01783b000000ffffffff', '930101a1020101013b007818010000ffffffff', '930101a5020101011a027a0c000000ffffffff'], close: '2f0df700' },
      { type: 'smoker', window: 14, firstRequest: -149, stackId: 63, requests: ['930101a9020100011c007e3b000000ffffffff', '930101ad020101013b007e2e000000ffffffff', '930101b1020100011c0182013b000000ffffffff', '930101b5020101013b00820118010000ffffffff', '930101b9020100011a0284013b000000ffffffff', '930101bd020101013b0084011c080000ffffffff'], close: '2f0ef700' }
    ]
  },
  {
    name: 'full container names with dynamic id 0 (recorded on 1.21.20.3)',
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    screens: [
      { type: 'furnace', window: 12, firstRequest: -3273, stackId: 2610, requests: ['93010191330100011c0000000000e4283b00000000000000ffffffff', '93010195330101013b0000000000e4281900000000000000ffffffff', '93010199330100011c0000000001e8283b00000000000000ffffffff', '9301019d330101013b0000000000e8281800000000010000ffffffff', '930101a1330100011a0000000002ea283b00000000000000ffffffff', '930101a5330101013b0000000000ea281c00000000080000ffffffff'], close: '2f0cf700' },
      { type: 'blast_furnace', window: 13, firstRequest: -3285, stackId: 2615, requests: ['930101a9330100011c0000000000ee283b00000000000000ffffffff', '930101ad330101013b0000000000ee282d00000000000000ffffffff', '930101b1330100011c0000000001f2283b00000000000000ffffffff', '930101b5330101013b0000000000f2281800000000010000ffffffff', '930101b9330101011a0000000002f4280c00000000000000ffffffff'], close: '2f0df700' },
      { type: 'smoker', window: 14, firstRequest: -3295, stackId: 2620, requests: ['930101bd330100011c0000000000f8283b00000000000000ffffffff', '930101c1330101013b0000000000f8282e00000000000000ffffffff', '930101c5330100011c0000000001fc283b00000000000000ffffffff', '930101c9330101013b0000000000fc281800000000010000ffffffff', '930101cd330100011a0000000002fe283b00000000000000ffffffff', '930101d1330101013b0000000000fe281c00000000080000ffffffff'], close: '2f0ef700' }
    ]
  },
  {
    name: 'full container names (recorded on 1.21.30.3)',
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.26.30',
    screens: [
      { type: 'furnace', window: 12, firstRequest: -3273, stackId: 2610, requests: ['93010191330100011c0000e4283b00000000ffffffff', '93010195330101013b0000e4281900000000ffffffff', '93010199330100011c0001e8283b00000000ffffffff', '9301019d330101013b0000e8281800010000ffffffff', '930101a1330100011a0002ea283b00000000ffffffff', '930101a5330101013b0000ea281c00080000ffffffff'], close: '2f0cf700' },
      { type: 'blast_furnace', window: 13, firstRequest: -3285, stackId: 2615, requests: ['930101a9330100011c0000ee283b00000000ffffffff', '930101ad330101013b0000ee282d00000000ffffffff', '930101b1330100011c0001f2283b00000000ffffffff', '930101b5330101013b0000f2281800010000ffffffff', '930101b9330101011a0002f4280c00000000ffffffff'], close: '2f0df700' },
      { type: 'smoker', window: 14, firstRequest: -3295, stackId: 2620, requests: ['930101bd330100011c0000f8283b00000000ffffffff', '930101c1330101013b0000f8282e00000000ffffffff', '930101c5330100011c0001fc283b00000000ffffffff', '930101c9330101013b0000fc281800010000ffffffff', '930101cd330100011a0002fe283b00000000ffffffff', '930101d1330101013b0000fe281c00080000ffffffff'], close: '2f0ef700' }
    ]
  },
  {
    name: 'the action\'s type again, 32-bit stack ids (recorded on 1.26.51.1)',
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    screens: [
      { type: 'furnace', window: 12, firstRequest: -151, stackId: 66, requests: ['930101ad02010000011c0000420000003b00000000000000ffffffff', '930101b102010101013b0000420000001900000000000000ffffffff', '930101b502010000011c0001440000003b00000000000000ffffffff', '930101b902010101013b0000440000001800010000000000ffffffff', '930101bd02010000011a0002450000003b00000000000000ffffffff', '930101c102010101013b0000450000001c00080000000000ffffffff'], close: '2f0cf700' },
      { type: 'blast_furnace', window: 13, firstRequest: -163, stackId: 71, requests: ['930101c502010000011c0000470000003b00000000000000ffffffff', '930101c902010101013b0000470000002d00000000000000ffffffff', '930101cd02010000011c0001490000003b00000000000000ffffffff', '930101d102010101013b0000490000001800010000000000ffffffff', '930101d502010101011a00024a0000000c00000000000000ffffffff'], close: '2f0df700' },
      { type: 'smoker', window: 14, firstRequest: -173, stackId: 76, requests: ['930101d902010000011c00004c0000003b00000000000000ffffffff', '930101dd02010101013b00004c0000002e00000000000000ffffffff', '930101e102010000011c00014e0000003b00000000000000ffffffff', '930101e502010101013b00004e0000001800010000000000ffffffff', '930101e902010000011a00024f0000003b00000000000000ffffffff', '930101ed02010101013b00004f0000001c00080000000000ffffffff'], close: '2f0ef700' }
    ]
  },
  {
    name: 'each place from the cursor bracketed by a drag (recorded on 1.26.60.5)',
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    screens: [
      { type: 'furnace', window: 12, firstRequest: -3437, stackId: 2757, requests: ['930101d935010000011c0000c50a00003b00000000000000ffffffff', '930101dd35010101013b0000c50a00001900000000000000ffffffff', '930101e135010000011c0001c70a00003b00000000000000ffffffff', '930101e535010101013b0000c70a00001800010000000000ffffffff', '930101e935010000011a0002c80a00003b00000000000000ffffffff', '930101ed35010101013b0000c80a00001c00080000000000ffffffff'], close: '2f0cf700' },
      { type: 'blast_furnace', window: 13, firstRequest: -3449, stackId: 2762, requests: ['930101f135010000011c0000ca0a00003b00000000000000ffffffff', '930101f535010101013b0000ca0a00002d00000000000000ffffffff', '930101f935010000011c0001cc0a00003b00000000000000ffffffff', '930101fd35010101013b0000cc0a00001800010000000000ffffffff', '9301018136010101011a0002cd0a00000c00000000000000ffffffff'], close: '2f0df700' },
      { type: 'smoker', window: 14, firstRequest: -3459, stackId: 2767, requests: ['9301018536010000011c0000cf0a00003b00000000000000ffffffff', '9301018936010101013b0000cf0a00002e00000000000000ffffffff', '9301018d36010000011c0001d10a00003b00000000000000ffffffff', '9301019136010101013b0000d10a00001800010000000000ffffffff', '9301019536010000011a0002d20a00003b00000000000000ffffffff', '9301019936010101013b0000d20a00001c00080000000000ffffffff'], close: '2f0ef700' }
    ]
  }
]

type ItemName = 'oak_planks' | 'egg' | 'iron_sword' | 'wooden_sword' | 'wooden_pickaxe' | 'iron_ingot' | 'beef' | 'raw_iron'

/** an item the server gives: in the furnace's slot 0 – 2, the cursor, or the inventory window's slot (the hotbar 0 – 8) */
interface GivenItem {
  where: 'furnace' | 'cursor' | 'inventory'
  slot: number
  item: ItemName
  count: number
  stackId?: number
}

function cursor (item: ItemName, count: number, stackId = 1): GivenItem {
  return { where: 'cursor', slot: 0, item, count, stackId }
}

function input (item: ItemName, count: number, stackId = 2): GivenItem {
  return { where: 'furnace', slot: 0, item, count, stackId }
}

function fuel (item: ItemName, count: number, stackId = 3): GivenItem {
  return { where: 'furnace', slot: 1, item, count, stackId }
}

function output (item: ItemName, count: number, stackId = 4): GivenItem {
  return { where: 'furnace', slot: 2, item, count, stackId }
}

function stored (slot: number, item: ItemName, count: number, stackId = 5): GivenItem {
  return { where: 'inventory', slot, item, count, stackId }
}

/** a click of the vanilla client on a furnace screen, as recorded on 1.26.51.1, and what its slots held */
interface RecordedClick {
  name: string
  screen: FurnaceType
  given: readonly GivenItem[]
  firstRequest: number
  /** Java's slot of the window (0 the input, 1 the fuel, 2 the output, 3 – 29 the inventory, 30 – 38 the hotbar), mouse button and mode */
  click: readonly [slot: number, mouseButton: number, mode: number]
  /** null: the client sent nothing */
  request: string | null
}

const RECORDED_CLICKS: readonly RecordedClick[] = [
  { name: 'a left click puts no egg in the fuel slot', screen: 'furnace', given: [cursor('egg', 1)], firstRequest: -3, click: [1, 0, 0], request: null },
  { name: 'a right click puts no egg in the fuel slot', screen: 'furnace', given: [cursor('egg', 1)], firstRequest: -3, click: [1, 1, 0], request: null },
  { name: 'a left click swaps no egg with the fuel', screen: 'furnace', given: [cursor('egg', 16), fuel('wooden_sword', 1)], firstRequest: -3, click: [1, 0, 0], request: null },
  { name: 'a left click places a wooden sword in the fuel slot', screen: 'furnace', given: [cursor('wooden_sword', 1, 63)], firstRequest: -339, click: [1, 0, 0], request: '930101a505010101013b00003f0000001800010000000000ffffffff' },
  { name: 'a right click places one plank onto the fuel\'s', screen: 'furnace', given: [cursor('oak_planks', 64, 74), fuel('oak_planks', 1, 73)], firstRequest: -387, click: [1, 1, 0], request: '9301018506010101013b00004a0000001800014900000000ffffffff' },
  { name: 'a left click swaps a fuel with another', screen: 'furnace', given: [cursor('wooden_sword', 1, 340), fuel('wooden_pickaxe', 1, 342)], firstRequest: -1419, click: [1, 0, 0], request: '93010195160102023b0000540100001800015601000000ffffffff' },
  { name: 'a left click places an egg in the input', screen: 'furnace', given: [cursor('egg', 1, 77)], firstRequest: -395, click: [0, 0, 0], request: '9301019506010101013b00004d0000001900000000000000ffffffff' },
  { name: 'a right click takes half a blast furnace\'s input, rounded up', screen: 'blast_furnace', given: [input('raw_iron', 5, 1518)], firstRequest: -5861, click: [0, 1, 0], request: '930101c95b010000032d0000ee0500003b00000000000000ffffffff' },
  { name: 'a right click takes half the output', screen: 'furnace', given: [output('iron_ingot', 64, 969)], firstRequest: -3787, click: [2, 1, 0], request: '930101953b010000201a0002c90300003b00000000000000ffffffff' },
  { name: 'a left click takes the output onto the cursor\'s stack of its item', screen: 'furnace', given: [cursor('iron_ingot', 1, 675), output('iron_ingot', 5, 676)], firstRequest: -2645, click: [2, 0, 0], request: '930101a929010000051a0002a40200003b0000a302000000ffffffff' },
  { name: 'a right click takes half the output onto the cursor\'s stack of its item', screen: 'furnace', given: [cursor('iron_ingot', 1, 96), output('iron_ingot', 5, 97)], firstRequest: -467, click: [2, 1, 0], request: '930101a507010000031a0002610000003b00006000000000ffffffff' },
  { name: 'a left click on the output with another item on the cursor does nothing', screen: 'furnace', given: [cursor('egg', 1), output('iron_ingot', 5)], firstRequest: -3, click: [2, 0, 0], request: null },
  { name: 'a right click on the output with another item on the cursor does nothing', screen: 'furnace', given: [cursor('egg', 1), output('iron_ingot', 5)], firstRequest: -3, click: [2, 1, 0], request: null },
  { name: 'a left click on the output with a full stack of its item on the cursor does nothing', screen: 'furnace', given: [cursor('iron_ingot', 64), output('iron_ingot', 5)], firstRequest: -3, click: [2, 0, 0], request: null },
  { name: 'a hotbar key over the fuel does nothing', screen: 'furnace', given: [fuel('wooden_sword', 1)], firstRequest: -3, click: [1, 0, 2], request: null },
  { name: 'a hotbar key over the input does nothing, its hotbar slot holding an item', screen: 'furnace', given: [stored(0, 'egg', 16)], firstRequest: -3, click: [0, 0, 2], request: null },
  { name: 'a hotbar key over the output does nothing', screen: 'blast_furnace', given: [output('iron_ingot', 64)], firstRequest: -3, click: [2, 0, 2], request: null },
  { name: 'the drop key drops one of the output', screen: 'furnace', given: [output('iron_ingot', 64, 95)], firstRequest: -463, click: [2, 0, 4], request: '9301019d07010303011a00025f0000000000ffffffff' },
  { name: 'the drop key with ctrl drops the output', screen: 'furnace', given: [output('iron_ingot', 64, 89)], firstRequest: -451, click: [2, 1, 4], request: '9301018507010303401a0002590000000000ffffffff' },
  { name: 'the drop key drops one of a smoker\'s input', screen: 'smoker', given: [input('beef', 64, 1328)], firstRequest: -5101, click: [0, 0, 4], request: '930101d94f010303012e0000300500000000ffffffff' },
  { name: 'a shift click moves planks from the hotbar to the fuel slot', screen: 'furnace', given: [stored(4, 'oak_planks', 64, 679)], firstRequest: -2655, click: [34, 0, 1], request: '930101bd29010101401c0004a70200001800010000000000ffffffff' },
  { name: 'a shift click moves an iron sword from the hotbar to the input', screen: 'furnace', given: [stored(4, 'iron_sword', 1, 678)], firstRequest: -2653, click: [34, 0, 1], request: '930101b929010101011c0004a60200001900000000000000ffffffff' },
  { name: 'a shift click moves eggs from the hotbar to the input', screen: 'furnace', given: [stored(4, 'egg', 16, 975)], firstRequest: -3799, click: [34, 0, 1], request: '930101ad3b010101101c0004cf0300001900000000000000ffffffff' },
  { name: 'a shift click moves an iron sword from the inventory to the input', screen: 'furnace', given: [stored(22, 'iron_sword', 1, 682)], firstRequest: -2663, click: [16, 0, 1], request: '930101cd29010101011d0016aa0200001900000000000000ffffffff' },
  { name: 'a shift click moves beef from the hotbar to a smoker\'s input', screen: 'smoker', given: [stored(0, 'beef', 64, 1494)], firstRequest: -5773, click: [30, 0, 1], request: '930101995a010101401c0000d60500002e00000000000000ffffffff' },
  { name: 'a shift click moves raw iron from the inventory to a blast furnace\'s input', screen: 'blast_furnace', given: [stored(35, 'raw_iron', 64, 1359)], firstRequest: -5219, click: [29, 0, 1], request: '930101c551010101401d00234f0500002d00000000000000ffffffff' },
  { name: 'a shift right click moves the output to the hotbar or inventory', screen: 'furnace', given: [output('iron_ingot', 64, 974)], firstRequest: -3797, click: [2, 1, 1], request: '930101a93b010101401a0002ce0300000c00000000000000ffffffff' },
  { name: 'a shift click moves the fuel to the hotbar or inventory', screen: 'furnace', given: [fuel('oak_planks', 64, 950)], firstRequest: -3731, click: [1, 0, 1], request: '930101a53a01010140180001b60300000c00000000000000ffffffff' }
]

describe('bedrock furnaces', () => {
  for (const group of GROUPS) {
    describe(`the vanilla client cooking: ${group.name} (${group.from.slice(8)} – ${group.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(group.from, group.to)) {
        for (const recorded of group.screens) {
          const { type, window: id, firstRequest, stackId } = recorded

          it(`bedrock ${version}: shows the ${type} at its opening, puts the input and the fuel in, takes the output, and closes it`, async () => {
            const { bot, internal, server, driver, inventory, errors } = await joined(version)
            const [beef, coal, cooked] = [idOf(bot, 'beef'), idOf(bot, 'coal'), idOf(bot, 'cooked_beef')]
            inventory.slot('inventory', 0, { id: beef, count: 1, stackId })
            inventory.slot('inventory', 1, { id: coal, count: 1, stackId: stackId + 2 })
            await driver.tick()
            const opened: Window[] = []
            bot.on('windowOpen', window => { opened.push(window) })
            openFurnace(server, id, type)
            inventory.content(id, [null, null, null])
            await driver.tick()
            const window = bot.currentWindow
            assert.ok(window !== null)
            assert.deepStrictEqual([opened, window.id, window.type, window.slots.length, window.inventoryStart, window.inventoryEnd, window.craftingResultSlot], [[window], id, `minecraft:${type}`, 39, 3, 39, 2])
            internal._core.requestIds.continueProcess(firstRequest)
            const requests = requestsSince(server)
            let next = firstRequest
            async function click (slot: number, mode: number, before: () => void, responded: readonly RespondedSlot[]): Promise<void> {
              const clicked = bot.clickWindow(slot, 0, mode)
              await driver.tick()
              // the furnace's slots come before the response, as recorded
              before()
              inventory.respond(next, responded)
              next -= 2
              await driver.tick()
              await clicked
            }

            const ingredient = INGREDIENTS[type]
            await click(30, 0, () => {}, [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId }])
            await click(0, 0, () => { inventory.slot(id, 0, { id: beef, count: 1, stackId }) }, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: ingredient, slot: 0, count: 1, stackId }])
            await click(31, 0, () => {}, [{ container: 'hotbar', slot: 1, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: stackId + 2 }])
            await click(1, 0, () => { inventory.slot(id, 1, { id: coal, count: 1, stackId: stackId + 2 }) }, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'furnace_fuel', slot: 1, count: 1, stackId: stackId + 2 }])
            assert.deepStrictEqual(window.slots.slice(0, 3).map(countAndId), [[1, stackId], [1, stackId + 2], null])
            // the coal burns, the beef cooks
            inventory.slot(id, 1, null)
            inventory.slot(id, 2, { id: cooked, count: 1, stackId: stackId + 3 })
            inventory.slot(id, 0, null)
            await driver.tick()
            assert.deepStrictEqual([window.slots.slice(0, 3).map(countAndId), window.slots[2]?.name], [[null, null, [1, stackId + 3]], 'cooked_beef'])
            const emptied = () => { inventory.slot(id, 2, null) }
            if (type === 'blast_furnace') {
              await click(2, 1, emptied, [{ container: 'furnace_output', slot: 2, count: 0, stackId: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: stackId + 3 }])
            } else {
              await click(2, 0, emptied, [{ container: 'furnace_output', slot: 2, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: stackId + 3 }])
              await click(38, 0, () => {}, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'hotbar', slot: 8, count: 1, stackId: stackId + 3 }])
            }
            const hotbar = type === 'blast_furnace' ? 0 : 8
            assert.deepStrictEqual([requests(), window.slots[2], countAndId(window.slots[30 + hotbar]), countAndId(bot.inventory.slots[36 + hotbar])], [recorded.requests, null, [1, stackId + 3], [1, stackId + 3]])
            // from 1.26.60 each place from the cursor, started and stopped
            const places = type === 'blast_furnace' ? 2 : 3
            assert.strictEqual(server.sentOf('serverbound_cursor_item_drag').length, atLeast(version, 'bedrock_1.26.60') ? 2 * places : 0)

            // nothing on the cursor to give back; the close leaves at once, from 1.21.120 after the crafting table's animation
            const closed: Window[] = []
            bot.on('windowClose', window => { closed.push(window) })
            const closing = bot.closeWindow(window)
            await driver.tick()
            const atOnce = closesOf(server)
            let frames = 0
            while (closesOf(server).length === 0 && frames < 20) {
              await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
              frames++
            }
            server.send('container_close', { window_id: id, server: false })
            await driver.tick()
            await closing
            assert.deepStrictEqual([atOnce.length, frames], atLeast(version, 'bedrock_1.21.120') ? [0, closeFrame(version)] : [1, 0])
            assert.deepStrictEqual([closesOf(server), requests(), closed, bot.currentWindow, errors], [[recorded.close], [], [window], null, []])
            bot.end()
          })
        }
      }
    })
  }

  // the requests are written alike from 1.26.40 (1.26.60 brackets the places from the cursor with drags, as above)
  describe('the vanilla client\'s clicks on a furnace\'s screens, as recorded on 1.26.51 (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      for (const recorded of RECORDED_CLICKS) {
        it(`bedrock ${version}: ${recorded.name}`, async () => {
          const { bot, internal, server, driver, inventory, errors } = await joined(version)
          openFurnace(server, 3, recorded.screen)
          await driver.tick()
          const windows: Readonly<Record<GivenItem['where'], InventoryWindow>> = { furnace: 3, cursor: 'ui', inventory: 'inventory' }
          for (const { where, slot, item, ...given } of recorded.given) inventory.slot(windows[where], slot, { id: idOf(bot, item), ...given })
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

      it(`bedrock ${version}: gives the cursor's eggs back at the close, not the furnace's slots`, async () => {
        const { bot, internal, server, driver, inventory, errors } = await joined(version, { screenAnimations: false })
        openFurnace(server, 31, 'furnace')
        await driver.tick()
        inventory.slot('ui', 0, { id: idOf(bot, 'egg'), count: 16, stackId: 65 })
        inventory.slot(31, 1, { id: idOf(bot, 'wooden_sword'), count: 1, stackId: 64 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-347)
        const requests = requestsSince(server)
        // nothing sent
        await Promise.all([bot.clickWindow(1, 0, 0), driver.tick()])
        const window = bot.currentWindow
        assert.ok(window !== null)
        const closing = bot.closeWindow(window)
        await driver.tick()
        assert.deepStrictEqual([requests(), closesOf(server)], [['930101b505010101103b0000410000000c00000000000000ffffffff'], ['2f1ff700']])
        inventory.respond(-347, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 16, stackId: 65 }])
        server.send('container_close', { window_id: 31, server: false })
        await driver.tick()
        await closing
        assert.deepStrictEqual([countAndId(bot.inventory.slots[36]), bot.inventory.selectedItem, errors], [[16, 65], null, []])
        bot.end()
      })

      it(`bedrock ${version}: still closes when the animation ends, after the server closed the screen during it, as recorded 153 times`, async () => {
        const { bot, internal, server, driver, inventory, errors } = await joined(version)
        openFurnace(server, 31, 'furnace')
        await driver.tick()
        inventory.slot('ui', 0, { id: idOf(bot, 'egg'), count: 16, stackId: 65 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-347)
        const requests = requestsSince(server)
        const window = bot.currentWindow
        assert.ok(window !== null)
        const closed: Window[] = []
        bot.on('windowClose', window => { closed.push(window) })
        const closing = bot.closeWindow(window)
        await driver.tick()
        assert.deepStrictEqual([requests(), closesOf(server)], [['930101b505010101103b0000410000000c00000000000000ffffffff'], []])
        inventory.respond(-347, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 16, stackId: 65 }])
        server.send('container_close', { window_id: 31, window_type: 'furnace', server: true })
        let frames = 0
        while (closesOf(server).length === 0 && frames < 20) {
          await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
          frames++
        }
        await closing
        assert.deepStrictEqual([frames, closesOf(server), closed, bot.currentWindow], [closeFrame(version), ['2f1ff700'], [window], null])
        server.send('container_close', { window_id: 31, window_type: 'none', server: false })
        await driver.tick()
        assert.deepStrictEqual([closesOf(server), closed.length, countAndId(bot.inventory.slots[36]), errors], [['2f1ff700'], 1, [16, 65], []])
        bot.end()
      })

      it(`bedrock ${version}: settles closeWindow once that late close left, and opens the inventory or uses a block only after it, as the vanilla client's screen stays up until then`, async () => {
        const { bot, server, driver, errors } = await joined(version, { blocks: [[2, 12, 0, 'furnace']] })
        openFurnace(server, 31, 'furnace')
        await driver.tick()
        const window = bot.currentWindow
        assert.ok(window !== null)
        const sent = closesAndUsesSince(server)
        let closesWhenSettled: number | undefined
        const closing = bot.closeWindow(window).then(() => { closesWhenSettled = closesOf(server).length })
        await driver.tick()
        server.send('container_close', { window_id: 31, window_type: 'furnace', server: true })
        await driver.tick()
        const opening = bot.openInventory()
        const used = bot.openBlock(blockOf(bot, 2, 12, 0))
        let frames = 0
        while (sent().length < 3 && frames < 20) {
          await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
          frames++
        }
        await closing
        assert.deepStrictEqual([sent(), closesWhenSettled, bot.currentWindow, errors], [['container_close', 'open_inventory', 'inventory_transaction'], 1, null, []])
        // once it left, nothing waits for it
        const again = bot.openInventory()
        await driver.tick()
        assert.deepStrictEqual(sent().slice(3), ['open_inventory'])
        bot.end()
        for (const call of [opening, used, again]) call.catch(() => {})
      })

      it(`bedrock ${version}: uses a block at once after the server closed the screen before the close began, which sends none, and after the server closed it once the bot's own close left`, async () => {
        const { bot, server, driver, errors } = await joined(version, { blocks: [[2, 12, 0, 'furnace']] })
        openFurnace(server, 31, 'furnace')
        await driver.tick()
        const window = bot.currentWindow
        assert.ok(window !== null)
        let settled = false
        bot.closeWindow(window).then(() => { settled = true }, () => {})
        server.send('container_close', { window_id: 31, window_type: 'furnace', server: true })
        await driver.tick()
        const sent = closesAndUsesSince(server)
        const used = bot.openBlock(blockOf(bot, 2, 12, 0))
        let ticks = 0
        while (sent().length === 0 && ticks < 20) {
          await driver.tick()
          ticks++
        }
        assert.deepStrictEqual([settled, sent(), ticks, bot.currentWindow], [true, ['inventory_transaction'], 4, null])
        openFurnace(server, 32, 'furnace')
        const opened: { window?: Window } = {}
        used.then(window => { opened.window = window }, () => {})
        await driver.runUntil(() => opened.window !== undefined, 20)
        const reopened = opened.window
        assert.ok(reopened !== undefined)
        const closing = bot.closeWindow(reopened)
        const usedAgain = bot.openBlock(blockOf(bot, 2, 12, 0))
        let frames = 0
        while (sent().length < 2 && frames < 20) {
          await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
          frames++
        }
        await driver.ticks(2)
        assert.deepStrictEqual(sent(), ['inventory_transaction', 'container_close'])
        server.send('container_close', { window_id: 32, window_type: 'none', server: false })
        await driver.runUntil(() => sent().length === 3, 20)
        await closing
        assert.deepStrictEqual([sent(), errors], [['inventory_transaction', 'container_close', 'inventory_transaction'], []])
        bot.end()
        usedAgain.catch(() => {})
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('takes only what fits onto the cursor from the output, and puts nothing in it', async () => {
      const { bot, server, driver, inventory, errors } = await joined(version)
      openFurnace(server, 3, 'smoker')
      const ingot = idOf(bot, 'iron_ingot')
      inventory.slot('ui', 0, { id: ingot, count: 62, stackId: 1 })
      inventory.slot(3, 2, { id: ingot, count: 5, stackId: 2 })
      await driver.tick()
      const taken = bot.clickWindow(2, 0, 0)
      await driver.tick()
      const [request] = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
      assert.ok(request !== undefined)
      assert.deepStrictEqual(request.actions.map(({ type_id: type, count }) => [type, count]), [['take', 2]])
      inventory.respond(request.request_id, [{ container: 'furnace_output', slot: 2, count: 3, stackId: 2 }, { container: 'cursor', slot: 0, count: 64, stackId: 1 }])
      await driver.tick()
      await taken
      inventory.slot(3, 2, null)
      await driver.tick()
      // a full stack on the cursor and none in the output
      await Promise.all([bot.clickWindow(2, 0, 0), bot.clickWindow(2, 1, 0), driver.tick()])
      assert.deepStrictEqual([server.sentOf('item_stack_request').length, bot.inventory.selectedItem?.count, errors], [1, 64, []])
      bot.end()
    })

    it('keeps the inventory\'s rules elsewhere: a hotbar key over the inventory puts the cursor\'s item in the hotbar, a shift click moves the output whatever the cursor holds', async () => {
      const { bot, server, driver, inventory, errors } = await joined(version)
      openFurnace(server, 3, 'furnace')
      const ingot = idOf(bot, 'iron_ingot')
      inventory.slot('inventory', 9, { id: idOf(bot, 'egg'), count: 16, stackId: 1 })
      inventory.slot('ui', 0, { id: ingot, count: 1, stackId: 2 })
      inventory.slot(3, 2, { id: ingot, count: 5, stackId: 3 })
      await driver.tick()
      const shift = bot.clickWindow(2, 0, 1)
      const key = bot.clickWindow(3, 4, 2)
      await driver.tick()
      const sent = server.sentOf('item_stack_request').flatMap(({ requests }) => requests.map(({ actions }) => actions.map(({ type_id: type, count, source, destination }) => {
        const name = (slot: typeof source): string => `${JSON.stringify(slot?.slot_type)}:${slot?.slot}`
        return `${type} ${count} ${name(source)} → ${name(destination)}`
      })))
      assert.deepStrictEqual([sent, errors], [[['place 5 {"container_id":"furnace_output"}:2 → {"container_id":"hotbar_and_inventory"}:0'], ['place 1 {"container_id":"cursor"}:0 → {"container_id":"hotbar"}:4']], []])
      bot.end()
      shift.catch(() => {})
      key.catch(() => {})
    })

    it('knows the vanilla game\'s fuels by every version\'s names', () => {
      const fuels = ['coal', 'charcoal', 'lava_bucket', 'planks', 'log2', 'oak_planks', 'pale_oak_slab', 'spruce_hanging_sign', 'stripped_cherry_wood', 'silver_wool', 'light_gray_carpet', 'wooden_sword']
      const others = ['crimson_planks', 'warped_stem', 'egg', 'iron_sword', 'oak', 'stripped_oak_planks', 'red_wool_slab', undefined]
      assert.deepStrictEqual([fuels.filter(name => !isFuel(name)), others.filter(name => isFuel(name))], [[], []])
    })
  })
})
