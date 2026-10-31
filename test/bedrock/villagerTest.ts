import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import prismarineBlock from 'prismarine-block'
import type { NBT } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import type { ContainerName } from '../../lib/bedrock/modules/items.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBotOptions, BedrockVersion, BedrockVillager } from '../../lib/types/api/index.ts'
import type { MCProtocol } from '../../lib/types/protocol/Bedrock.d.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, runtimeId, spawned, write } from './common/entities.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Rotation } from './common/world.ts'

// The vanilla client at (0.5, y, 0.5), its camera at yaw −90 and pitch 29.197464, trading with a villager at
// (2.5, y, 0.5) whose two offers are wheat for an emerald and an emerald and wheat for bread, recorded on 1.26.20,
// 1.26.51 and 1.26.60 (protocol_item_stacks): the bot must send the same, byte for byte

const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const VILLAGER_BOX = Object.freeze({ width: 0.6000000238418579, height: 1.899999976158142 })
const TRADER_UNIQUE = -8589934590n
const TRADER_RUNTIME = 2
const ANY = 32767
const COMPARED: ReadonlySet<string> = new Set(['inventory_transaction', 'item_stack_request', 'container_close'])

type SlotInfo = MCProtocol.Bedrock.Write.Types.StackRequestSlotInfo
type Fields = NBT['value']

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** the bot's compared packets since the last call, as written */
function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => COMPARED.has(name)).map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

// ---- the offers, as servers write them

interface GivenItem {
  name: string
  count?: number
  damage?: number
  tag?: Fields
  /** a block's item: the state it places, as its Block compound names it (states: none written) */
  block?: { name: string, states?: Fields }
}

interface GivenOffer {
  buyA?: GivenItem
  buyB?: GivenItem
  sell?: GivenItem
  netId: number
  /** buyCountA and buyCountB; none: not written */
  counts?: readonly [number, number]
  uses?: number
  maxUses?: number
  /** only the items and netId, as no recorded server writes them */
  bare?: true
}

function itemTag ({ name, count = 1, damage = ANY, tag, block }: GivenItem): NBT['value'][string] {
  const value: Fields = { Count: { type: 'byte', value: count }, Damage: { type: 'short', value: damage }, Name: { type: 'string', value: `minecraft:${name}` }, WasPickedUp: { type: 'byte', value: 0 } }
  const blockTag: Fields = block === undefined
    ? {}
    : { Block: { type: 'compound', value: { name: { type: 'string', value: `minecraft:${block.name}` }, ...block.states === undefined ? {} : { states: { type: 'compound', value: block.states } }, version: { type: 'int', value: 18168865 } } } }
  return { type: 'compound', value: { ...value, ...blockTag, ...tag === undefined ? {} : { tag: { type: 'compound', value: tag } } } }
}

function offerFields ({ buyA, buyB, sell, netId, counts, uses = 0, maxUses = 64, bare }: GivenOffer): Fields {
  const items: Fields = {}
  for (const [key, item] of [['buyA', buyA], ['buyB', buyB], ['sell', sell]] as const) if (item !== undefined) items[key] = itemTag(item)
  const int = (value: number): NBT['value'][string] => ({ type: 'int', value })
  const float = (value: number): NBT['value'][string] => ({ type: 'float', value })
  if (bare === true) return { ...items, netId: int(netId) }
  return {
    ...items,
    ...counts === undefined ? {} : { buyCountA: int(counts[0]), buyCountB: int(counts[1]) },
    demand: int(3),
    maxUses: int(maxUses),
    netId: int(netId),
    priceMultiplierA: float(Math.fround(0.05)),
    priceMultiplierB: float(0),
    rewardExp: { type: 'byte', value: 1 },
    tier: int(1),
    traderExp: int(2),
    uses: int(uses)
  }
}

function offersOf (offers: readonly GivenOffer[] | undefined): NBT {
  if (offers === undefined) return { type: 'compound', name: '', value: {} }
  return {
    type: 'compound',
    name: '',
    value: {
      Recipes: { type: 'list', value: { type: 'compound', value: offers.map(offerFields) } },
      TierExpRequirements: { type: 'list', value: { type: 'compound', value: [{ 0: { type: 'int', value: 0 } }] } }
    }
  }
}

const WHEAT_FOR_EMERALD: GivenOffer = { buyA: { name: 'wheat' }, sell: { name: 'emerald', damage: 0 }, netId: 4769, counts: [1, 0] }
const EMERALD_AND_WHEAT_FOR_BREAD: GivenOffer = { buyA: { name: 'emerald' }, buyB: { name: 'wheat' }, sell: { name: 'bread', damage: 0 }, netId: 4770, counts: [1, 1] }
/** the recorded two */
const RECORDED_OFFERS: readonly GivenOffer[] = [WHEAT_FOR_EMERALD, EMERALD_AND_WHEAT_FOR_BREAD]

interface Trade {
  windowId?: number
  type?: ClientboundPacketsToWrite['update_trade']['window_type']
  unique?: bigint
  name?: string
}

/** update_trade: the trader by its unique id, zigzag on the wire */
function updateTrade (server: FakeBedrockClient, offers: readonly GivenOffer[] | undefined, { windowId = 6, type = 'trading', unique = TRADER_UNIQUE, name = 'entity.villager.mason' }: Trade = {}): void {
  server.send('update_trade', {
    window_id: windowId,
    window_type: type,
    size: 0,
    trade_tier: 0,
    villager_unique_id: unique,
    entity_unique_id: -1n,
    display_name: name,
    new_trading_ui: true,
    economic_trades: true,
    offers: offersOf(offers)
  })
}

// ---- the bot

interface Trading extends TestBot {
  errors: string[]
  inventory: ServerInventory
  idOf: (name: string) => number
  sent: () => string[]
}

/** joined standing on stone, looking as the recorded clients' camera did; the overworld starts at 0 up to 1.17.40 */
async function joined (version: BedrockVersion, options: Partial<BedrockBotOptions> = {}): Promise<Trading> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const feetY = feetYOf(version)
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[0, feetY - 1, 0, 'stone']] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation: CAMERA, game: { runtime_entity_id: 1n, ...itemStates } })
  // from 1.21.60 the items, the shield's id among them, come after start_game
  if (atLeast(version, 'bedrock_1.21.60')) testBot.server.send('item_registry', { itemstates: world.registry.writeItemStates() })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), idOf, sent: sentSince(testBot.server) }
}

function feetYOf (version: BedrockVersion): number {
  return atLeast(version, 'bedrock_1.18.0') ? -60 : 4
}

/** a trader before the player (or `z` blocks south), shown once the frame after ran */
async function trader ({ bot, server, driver }: TestBot, { runtime = TRADER_RUNTIME, unique = TRADER_UNIQUE, type = 'minecraft:villager_v2', z = 0.5 } = {}): Promise<Entity> {
  const { version } = bot
  write(server, 'add_entity', addEntity(version, { unique, runtime, type, position: { x: 2.5, y: feetYOf(version), z }, metadata: boundingBox(version, VILLAGER_BOX.width, VILLAGER_BOX.height) }))
  await driver.frame(0)
  return spawned(bot, runtime)
}

/** the slot each action of each request names, as the bot wrote it */
function refOf ({ container_id: containerId, slot_id: slotId, slot_type: slotType, slot }: SlotInfo): { container: string, slot: number } {
  const container = containerId ?? (typeof slotType === 'object' ? slotType.container_id : slotType)
  return { container: String(container), slot: Number(slot ?? slotId) }
}

/** each request the bot sent since the last call, its actions read: `place 64 hotbar_and_inventory:0 → trade2_ingredient1:4` */
function requestsSince (server: FakeBedrockClient): () => string[][] {
  let seen = 0
  return () => {
    const requests = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    const fresh = requests.slice(seen)
    seen = requests.length
    return fresh.map(({ actions }) => actions.map(action => {
      const { type_id: type, count, recipe_network_id: networkId, source, destination } = action
      const where = (info: SlotInfo | undefined): string => {
        if (info === undefined) return ''
        const { container, slot } = refOf(info)
        return `${container}:${slot}`
      }
      return [type, networkId ?? count, where(source), destination === undefined ? '' : `→ ${where(destination)}`].filter(part => part !== undefined && part !== '').join(' ')
    }))
  }
}

/** answers each request since the last call as a server taking it: ok, each slot it names as the bot now shows it */
function answerer ({ internal, server }: TestBot, inventory: ServerInventory, status: 'ok' | number = 'ok'): () => void {
  let seen = 0
  let nextStackId = 100
  return () => {
    const requests = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    for (const { request_id: requestId, actions } of requests.slice(seen)) {
      const slots = new Map<string, RespondedSlot>()
      for (const { source, destination } of actions) {
        for (const info of [source, destination]) {
          if (info === undefined) continue
          const { container, slot } = refOf(info)
          if (container === 'creative_output') continue
          // the request named it
          const ref = { container: container as ContainerName, slot }
          const count = internal._inventory.stackAt(ref)?.count ?? 0
          slots.set(`${container}:${slot}`, { ...ref, count, ...count === 0 ? {} : { stackId: nextStackId++ } })
        }
      }
      inventory.respond(requestId, [...slots.values()], status)
    }
    seen = requests.length
  }
}

/** ticks, the server answering after each, until `promise` settles */
async function play ({ driver }: TestBot, answer: () => void, promise: Promise<unknown>): Promise<void> {
  const state = { settled: false }
  const done = promise.finally(() => { state.settled = true })
  // its rejection is the caller's
  done.catch(() => {})
  for (let ticks = 0; ticks < 300 && !state.settled; ticks++) {
    await driver.tick()
    answer()
  }
  await done
}

/** the bot opening the trader's screen, update_trade answering its use */
async function opened (testBot: Trading, villager: Entity, offers: readonly GivenOffer[] | undefined, trade: Trade = {}): Promise<BedrockVillager> {
  const { bot, server, driver } = testBot
  const opening = bot.openVillager(villager)
  await driver.frame(10)
  updateTrade(server, offers, trade)
  testBot.inventory.content(trade.windowId ?? 6, [null, null, null])
  await driver.tick()
  return await opening
}

/** the server opening a trading screen over the one open */
async function shownOver ({ bot, server, driver }: TestBot, offers: readonly GivenOffer[], trade: Trade): Promise<BedrockVillager> {
  updateTrade(server, offers, trade)
  await driver.tick()
  const window = bot.currentWindow
  assert.ok(window !== null && 'selectTrade' in window)
  return window as BedrockVillager
}

/** a call made in the next input pass, settled after it */
async function ticked ({ driver }: TestBot, call: () => Promise<void>): Promise<void> {
  const done = call()
  // its rejection is the caller's
  done.catch(() => {})
  await driver.tick()
  await done
}

/** the server opening its inventory screen over the one open */
async function inventoryOver ({ server, driver }: TestBot): Promise<void> {
  server.send('container_open', { window_id: 2, window_type: 'inventory', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
  await driver.tick()
}

/** windowOpen gives each screen's window: the trading screen's is a BedrockVillager, which emits ready */
function onReady (window: Window, listener: () => void): void {
  (window as BedrockVillager).on('ready', listener)
}

/** the entity each trading screen shown names, as a feature's hook sees it */
function openingEntities ({ internal }: TestBot): bigint[] {
  const entities: bigint[] = []
  internal._inventory.screens.extend('trading', { shown: screen => { entities.push(screen.opening.entity) } })
  return entities
}

function countsOf (window: BedrockVillager, ...slots: number[]): Array<[string, number] | null> {
  return slots.map(slot => {
    const item = window.slots[slot]
    return item === null || item === undefined ? null : [item.name, item.count]
  })
}

// ---- the recorded sessions

interface RecordedSession {
  version: BedrockVersion
  runtime: number
  unique: bigint
  firstRequest: number
  wheatStackId: number
  use: string
  updateTrade: string
  content: string
  /** each gesture's request, and the server's response */
  fill: readonly [string, string]
  toggle: readonly [string, string]
  trade: readonly [string, string]
  select: readonly [string, string]
  handBack: readonly [string, string]
  /** 1.26.20's client closed at once, in the hand-back's batch */
  atOnce: boolean
}

const OFFERS_HEAD = '0a000907526563697065730a040a04627579410105436f756e7401020644616d616765ff7f08044e616d650f6d696e6563726166743a7768656174010b5761735069636b6564557000000309627579436f756e7441020309627579436f756e744200030664656d616e640003076d617855736573800103056e65744964'
const OFFERS_MIDDLE = '051070726963654d756c7469706c6965724100000000051070726963654d756c7469706c69657242000000000109726577617264457870010a0473656c6c0105436f756e7401020644616d616765000008044e616d65116d696e6563726166743a656d6572616c64010b5761735069636b6564557000000304746965720003097472616465724578700203047573657300000a04627579410105436f756e7401020644616d616765ff7f08044e616d65116d696e6563726166743a656d6572616c64010b5761735069636b6564557000000a04627579420105436f756e7401020644616d616765ff7f08044e616d650f6d696e6563726166743a7768656174010b5761735069636b6564557000000309627579436f756e7441020309627579436f756e744202030664656d616e640003076d617855736573800103056e65744964'
const OFFERS_TAIL = '051070726963654d756c7469706c6965724100000000051070726963654d756c7469706c69657242000000000109726577617264457870010a0473656c6c0105436f756e7401020644616d616765000008044e616d650f6d696e6563726166743a6272656164010b5761735069636b656455700000030474696572000309747261646572457870020304757365730000091354696572457870526571756972656d656e74730a02030130000000'

/** the recorded update_trade: the window, the trader's unique id, its profession, then the offers by their network ids */
function recordedUpdateTrade (head: string, netIds: readonly [string, string]): string {
  return `${head}${OFFERS_HEAD}${netIds[0]}${OFFERS_MIDDLE}${netIds[1]}${OFFERS_TAIL}`
}

const SESSIONS: readonly RecordedSession[] = [
  {
    version: 'bedrock_1.26.20',
    runtime: 15,
    unique: -8589934582n,
    firstRequest: -15,
    wheatStackId: 65,
    use: '1e0003000f0000dc0540000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f',
    updateTrade: recordedUpdateTrade('50060f0000ebffffff3f0118656e746974792e76696c6c616765722e73686570686572640101', ['9238', '9438']),
    content: '310603000000000000',
    fill: ['9301011d0101400c000082012f00040000ffffffff', '940101001d020c0001000000000000002f00010404408201000000'],
    toggle: [
      '930102210101402f000482010c00000000ffffffff250101400c0000212f00042100ffffffff',
      '9401020021022f0001040400000000000c000100004082010000000025020c0001000000000000002f00010404408201000000'
    ],
    trade: ['93010129040c891c011301d008010000000a000000000000000000000105012f0004820100013c0032293b00000000ffffffff', '9401010029022f000104043f82010000003b00010000018401000000'],
    select: [
      '9301022d01013f2f000482010c00000000ffffffff3101013f0c00002d3000050000ffffffff',
      '940102002d022f0001040400000000000c000100003f82010000000031020c00010000000000000030000105053f8201000000'
    ],
    handBack: [
      '930102350101013b000084010c00000000ffffffff3901013f30000582010c00010000ffffffff',
      '9401020035023b0001000000000000000c00010000018401000000003902300001050500000000000c000101013f8201000000'
    ],
    atOnce: true
  },
  {
    version: 'bedrock_1.26.51',
    runtime: 2,
    unique: -8589934590n,
    firstRequest: -59,
    wheatStackId: 25,
    use: '1e00000300020000510140000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f',
    updateTrade: recordedUpdateTrade('50060f0000fbffffff3f0115656e746974792e76696c6c616765722e6d61736f6e0101', ['c24a', 'c44a']),
    content: '31060300000000000000000000000000000000000000000000000000000000000000000000',
    fill: ['93010175010101400c0000190000002f00040000000000ffffffff', '940101007501020c0001000000000000002f00010404400132000000'],
    toggle: [
      '93010279010101402f0004190000000c00000000000000ffffffff7d010101400c0000c3ffffff2f0004c3ffffff00ffffffff',
      '940102007901022f0001040400000000000c00010000400132000000007d01020c0001000000000000002f00010404400132000000'
    ],
    trade: [
      '9301018101040a0ca125011113010101116d696e6563726166743a656d6572616c64000100000a00000000000000000000010505012f0004190000000000013c0032bfffffff3b00000000000000ffffffff',
      '94010100810101022f000104043f01320000003b00010000010134000000'
    ],
    select: [
      '93010285010101013f2f0004190000000c00000000000000ffffffff89010101013f0c0000bdffffff3000050000000000ffffffff',
      '94010200850101022f0001040400000000000c000100003f013200000000890101020c00010000000000000030000105053f0132000000'
    ],
    handBack: [
      '9301028d01010101013b00001a0000000c00000000000000ffffffff91010101013f300005190000000c00010000000000ffffffff',
      '940102008d0101023b0001000000000000000c000100000101340000000091010102300001050500000000000c000101013f0132000000'
    ],
    atOnce: false
  },
  {
    version: 'bedrock_1.26.60',
    runtime: 13,
    unique: -8589934582n,
    firstRequest: -15,
    wheatStackId: 59,
    use: '1e000003000d000000510140000000000a000000000000000000000000003f1c8569c20000003f67660640af186dc20000003f',
    updateTrade: recordedUpdateTrade('50060f0000ebffffff3f0116656e746974792e76696c6c616765722e6661726d65720101', ['ca4a', 'cc4a']),
    content: '31060300000000000000000000000000000000000000000000000000000000000000000000',
    fill: ['9301011d010101400c00003b0000002f00040000000000ffffffff', '940101001d01020c0001000000000000002f00010404400176000000'],
    toggle: [
      '93010221010101402f00043b0000000c00000000000000ffffffff25010101400c0000efffffff2f0004efffffff00ffffffff',
      '940102002101022f0001040400000000000c00010000400176000000002501020c0001000000000000002f00010404400176000000'
    ],
    trade: [
      '93010129040a0ca525011214010101116d696e6563726166743a656d6572616c64000100000a00000000000000000000010505012f00043b0000000000013c0032ebffffff3b00000000000000ffffffff',
      '940101002901022f000104043f01760000003b00010000010178000000'
    ],
    select: [
      '9301022d0101013f2f00043b0000000c00000000000000ffffffff310101013f0c0000e9ffffff3000050000000000ffffffff',
      '940102002d01022f0001040400000000000c000100003f0176000000003101020c00010000000000000030000105053f0176000000'
    ],
    handBack: [
      '93010235010101013b00003c0000000c00000000000000ffffffff390101013f3000053b0000000c00010000000000ffffffff',
      '940102003501023b0001000000000000000c0001000001017800000000390102300001050500000000000c000101013f0176000000'
    ],
    atOnce: false
  }
]

const CLIENT_CLOSE = '2ffff700'
const SERVER_CLOSE = '2f06f700'

describe('bedrock trading with villagers', () => {
  describe('the vanilla client trading with a villager (1.26.20, 1.26.51, 1.26.60, played byte for byte)', () => {
    for (const recorded of SESSIONS.filter(({ version }) => bedrockTestVersionsFrom(version, version).length > 0)) {
      it(`bedrock ${recorded.version}: fills the first trade at its opening, toggles it, trades, selects the second, sends nothing for its unmet result, and hands back as the screen closes`, async () => {
        const testBot = await joined(recorded.version, { screenAnimations: !recorded.atOnce })
        const { bot, internal, server, driver, inventory, idOf, sent } = testBot
        internal._core.requestIds.continueProcess(recorded.firstRequest)
        inventory.slot('inventory', 0, { id: idOf('wheat'), count: 64, stackId: recorded.wheatStackId })
        const villager = await trader(testBot, { runtime: recorded.runtime, unique: recorded.unique })
        sent()
        const events: string[] = []
        bot.on('windowOpen', window => {
          events.push(`windowOpen ${window.type}`)
          onReady(window, () => { events.push('ready') })
        })
        const opening = bot.openVillager(villager)
        await driver.frame(10)
        receive(server, recorded.updateTrade, recorded.content)
        await driver.tick()
        const window = await opening
        assert.deepStrictEqual([sent(), events], [[recorded.use, recorded.fill[0]], ['windowOpen minecraft:villager', 'ready']])
        receive(server, recorded.fill[1])
        await driver.tick()

        const exchange = async (call: () => Promise<void>, [request, response]: readonly [string, string]): Promise<void> => {
          const done = call()
          await driver.tick()
          assert.deepStrictEqual(sent(), [request])
          receive(server, response)
          await driver.tick()
          await done
        }
        await exchange(async () => { await window.selectTrade(0) }, recorded.toggle)
        await exchange(async () => { await bot.clickWindow(2, 0, 0) }, recorded.trade)
        await exchange(async () => { await window.selectTrade(1) }, recorded.select)
        const unmet = bot.clickWindow(2, 0, 0)
        await driver.tick()
        await unmet
        assert.deepStrictEqual([sent(), window.selectedTrade === window.trades[1], countsOf(window, 0, 1)], [[], true, [null, ['wheat', 63]]])

        const closing = bot.closeWindow(window)
        await driver.tick()
        assert.deepStrictEqual(sent(), recorded.atOnce ? [recorded.handBack[0], CLIENT_CLOSE] : [recorded.handBack[0]])
        receive(server, recorded.handBack[1])
        // from 1.21.120 after the crafting table's animation, longer than the inventory's
        await driver.frames(Array.from({ length: 5 }, () => 62.5))
        assert.deepStrictEqual(sent(), [])
        await driver.frames(Array.from({ length: 3 }, () => 62.5))
        assert.deepStrictEqual(sent(), recorded.atOnce ? [] : [CLIENT_CLOSE])
        receive(server, SERVER_CLOSE)
        await driver.frame(10)
        await closing
        const [emerald, wheat] = [bot.inventory.slots[36], bot.inventory.slots[37]]
        assert.deepStrictEqual([window.trades.map(trade => trade.nbTradeUses), emerald?.name, emerald?.count, wheat?.name, wheat?.count, bot.currentWindow], [[1, 0], 'emerald', 1, 'wheat', 63, null])
        bot.end()
      })
    }
  })

  describe('the screen update_trade opens, its trades, a trade and the trader\'s death (every version: one update_trade layout, the requests and the close each the version\'s)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201')) {
      it(`bedrock ${version}: windowOpen then ready, Java's trades, the trader by its zigzag id, the first trade filled and traded, and the screen closed as the trader dies`, async () => {
        const testBot = await joined(version)
        const { bot, server, driver, inventory, idOf, errors } = testBot
        inventory.slot('inventory', 0, { id: idOf('wheat'), count: 64, stackId: 25 })
        const villager = await trader(testBot)
        const requests = requestsSince(server)
        const entities = openingEntities(testBot)
        const window = await opened(testBot, villager, RECORDED_OFFERS)
        const [first, second] = window.trades
        assert.ok(first !== undefined && second !== undefined)
        const items = (trade: typeof first): Array<string | number | null> => [...trade.inputs, ...trade.outputs].flatMap(item => [item.name, item.count])
        assert.deepStrictEqual([window.type, window.slots.length, window.title, window.inventoryStart, window.craftingResultSlot], ['minecraft:villager', 39, '{"translate":"entity.villager.mason"}', 3, 2])
        assert.deepStrictEqual([items(first), first.inputItem2, first.hasItem2, items(second), second.hasItem2, second.inputItem2?.name], [['wheat', 1, 'emerald', 1], null, false, ['emerald', 1, 'wheat', 1, 'bread', 1], true, 'wheat'])
        assert.deepStrictEqual(
          [first.tradeDisabled, first.nbTradeUses, first.maximumNbTradeUses, first.xp, first.demand, first.realPrice, first.tier, first.priceMultiplier, first.specialPrice, first.inputItem1.metadata, entities],
          [false, 0, 64, 2, 3, 1, 1, Math.fround(0.05), undefined, 0, [BigInt(TRADER_RUNTIME)]]
        )
        assert.deepStrictEqual([requests(), window.selectedTrade === first], [[['place 64 hotbar_and_inventory:0 → trade2_ingredient1:4']], true])

        const answer = answerer(testBot, inventory)
        answer()
        await play(testBot, answer, bot.clickWindow(2, 0, 0))
        assert.deepStrictEqual(requests(), [['craft_recipe 4769', 'results_deprecated', 'consume 1 trade2_ingredient1:4', 'take 1 creative_output:50 → cursor:0']])
        assert.deepStrictEqual([first.nbTradeUses, window.selectedItem?.name, countsOf(window, 0)], [1, 'emerald', [['wheat', 63]]])

        write(server, 'entity_event', { runtime_entity_id: runtimeId(version, TRADER_RUNTIME), event_id: 'death_animation', data: 0 })
        await driver.frame(10)
        const animated = atLeast(version, 'bedrock_1.21.120')
        const closes = (): object[] => server.sentOf('container_close')
        const close = atLeast(version, 'bedrock_1.21.0') ? { window_id: 'none', window_type: 'none', server: false } : { window_id: 'none', server: false }
        assert.deepStrictEqual(closes(), animated ? [] : [close])
        await driver.frames([200, 200, 200])
        assert.deepStrictEqual([closes(), requests()], [[close], [['place 1 cursor:0 → hotbar_and_inventory:0'], ['place 63 trade2_ingredient1:4 → hotbar_and_inventory:1']]])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })

      it(`bedrock ${version}: trades for a shield, its sale written with the blocking tick the version's item layout gives a shield`, async () => {
        const testBot = await joined(version)
        const { bot, server, inventory, idOf, errors } = testBot
        inventory.slot('inventory', 0, { id: idOf('wheat'), count: 64, stackId: 25 })
        const villager = await trader(testBot)
        const window = await opened(testBot, villager, [{ buyA: { name: 'wheat', count: 20 }, sell: { name: 'shield', damage: 0 }, netId: 9, counts: [20, 0] }])
        const answer = answerer(testBot, inventory)
        answer()
        await play(testBot, answer, bot.clickWindow(2, 0, 0))
        const [request] = server.sentOf('item_stack_request').at(-1)?.requests ?? []
        const result = request?.actions[1]?.result_items?.[0]
        assert.ok(result !== undefined)
        // up to 1.16.210 the item's extra fields are its own
        const extra = 'extra' in result ? result.extra : result
        const sold = 'network_id' in result ? result.network_id : result.name
        assert.deepStrictEqual(
          [request?.actions[0]?.type_id, sold, extra !== undefined && 'blocking_tick' in extra ? extra.blocking_tick : undefined, window.selectedItem?.name, errors],
          ['craft_recipe', atLeast(version, 'bedrock_1.26.40') ? 'minecraft:shield' : idOf('shield'), 0n, 'shield', []]
        )
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('trades as Java\'s bot.trade: selects the trade, tops its ingredient slot up from the inventory, takes each result to the inventory, and puts back what is left', async () => {
      const testBot = await joined(version)
      const { bot, server, inventory, idOf } = testBot
      const wheat = idOf('wheat')
      inventory.content('inventory', [{ id: wheat, count: 64, stackId: 7 }, { id: wheat, count: 30, stackId: 8 }, ...Array.from({ length: 34 }, () => null)])
      const villager = await trader(testBot)
      const window = await opened(testBot, villager, [{ buyA: { name: 'wheat', count: 20 }, sell: { name: 'emerald', damage: 0 }, netId: 9, counts: [20, 0], maxUses: 16 }])
      const answer = answerer(testBot, inventory)
      const requests = requestsSince(server)
      await play(testBot, answer, bot.trade(window, '0', 4))
      const sent = requests()
      const trades = sent.filter(actions => actions[0] === 'craft_recipe 9')
      assert.deepStrictEqual(trades.length, 4)
      // only the fourth trade's 20 wheat needs a top-up: the 4 left and 16 more, from the inventory's 30 taken to the cursor
      assert.deepStrictEqual(sent.filter(actions => /^take \d+ (hotbar|inventory):\d+ → cursor:0$/.test(actions[0] ?? '')).map(actions => actions[0]), ['take 30 hotbar:1 → cursor:0'])
      const counts = new Map<string, number>()
      for (const item of bot.inventory.items()) counts.set(item.name, (counts.get(item.name) ?? 0) + item.count)
      assert.deepStrictEqual([window.trades[0]?.nbTradeUses, [...counts].sort(), countsOf(window, 0, 1), window.selectedItem], [4, [['emerald', 4], ['wheat', 14]], [null, null], null])
      bot.end()
    })

    it('trades the uses left without a count, putting the cursor\'s item away first and the ingredients left back', async () => {
      const testBot = await joined(version)
      const { bot, server, inventory, idOf } = testBot
      inventory.content('inventory', [{ id: idOf('emerald'), count: 1, stackId: 7 }, { id: idOf('wheat'), count: 10, stackId: 8 }, ...Array.from({ length: 34 }, () => null)])
      // an emerald on the cursor: the second needed
      inventory.slot('ui', 0, { id: idOf('emerald'), count: 1, stackId: 9 })
      const villager = await trader(testBot)
      const window = await opened(testBot, villager, [
        WHEAT_FOR_EMERALD,
        { buyA: { name: 'emerald' }, buyB: { name: 'wheat', count: 2 }, sell: { name: 'bread', count: 2, damage: 0 }, netId: 12, counts: [1, 2], uses: 1, maxUses: 3 }
      ])
      const answer = answerer(testBot, inventory)
      answer()
      const requests = requestsSince(server)
      await play(testBot, answer, window.trade(1))
      const sent = requests()
      assert.deepStrictEqual(sent[1], ['place 1 cursor:0 → hotbar:0'])
      assert.deepStrictEqual(sent.filter(actions => actions[0] === 'craft_recipe 12').map(actions => actions.slice(2, 4)), [
        ['consume 1 trade2_ingredient1:4', 'consume 2 trade2_ingredient2:5'],
        ['consume 1 trade2_ingredient1:4', 'consume 2 trade2_ingredient2:5']
      ])
      const names = bot.inventory.items().map(item => `${item.name} ${item.count}`).sort()
      assert.deepStrictEqual([window.trades[1]?.nbTradeUses, window.trades[1]?.tradeDisabled, names, countsOf(window, 0, 1)], [3, true, ['bread 4', 'wheat 6'], [null, null]])
      bot.end()
    })

    it('rejects a trade, sending nothing: a window not open, no such trade, none left, more than are left, not enough of an item', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, inventory, idOf } = testBot
      inventory.slot('inventory', 0, { id: idOf('wheat'), count: 2, stackId: 7 })
      const villager = await trader(testBot)
      const window = await opened(testBot, villager, [
        { buyA: { name: 'wheat' }, sell: { name: 'emerald', damage: 0 }, netId: 1, counts: [1, 0], uses: 0, maxUses: 2 },
        { buyA: { name: 'wheat' }, sell: { name: 'emerald', damage: 0 }, netId: 2, counts: [1, 0], uses: 2, maxUses: 2 },
        { buyA: { name: 'emerald' }, sell: { name: 'bread', damage: 0 }, netId: 3, counts: [1, 0] },
        { buyA: { name: 'wheat' }, buyB: { name: 'emerald' }, sell: { name: 'bread', damage: 0 }, netId: 4, counts: [1, 1] },
        // the demand raised its price over its item's count
        { buyA: { name: 'wheat' }, sell: { name: 'emerald', damage: 0 }, netId: 5, counts: [2, 0] }
      ])
      inventory.respond(-3, [{ container: 'hotbar_and_inventory', slot: 0, count: 0 }, { container: 'trade2_ingredient1', slot: 4, count: 2, stackId: 7 }])
      await driver.tick()
      const requests = requestsSince(server)
      requests()
      await assert.rejects(bot.trade(window, 7), { message: 'the villager has no trade 7' })
      await assert.rejects(bot.trade(window, 1), { message: 'trade blocked' })
      await assert.rejects(bot.trade(window, 0, 3), { message: 'trade 0 has 2 uses left, not 3' })
      // 0 is every use left, as none
      await assert.rejects(bot.trade(window, 2, 0), { message: 'Not enough item 1 to trade' })
      await assert.rejects(bot.trade(window, 4, 2), { message: 'Not enough item 1 to trade' })
      await assert.rejects(bot.trade(window, 3, 1), { message: 'Not enough item 2 to trade' })
      await driver.ticks(2)
      assert.deepStrictEqual(requests(), [])
      // another trading screen open
      await shownOver(testBot, RECORDED_OFFERS, { windowId: 9 })
      await assert.rejects(bot.trade(window, 0, 1), { message: 'trade needs the villager\'s window open' })
      bot.end()
    })

    it('a result click sends nothing with no trade selected, a trade used up or unmet, the cursor holding another item or no room; a shift click rejects, a refusal too, counting no use', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, inventory, idOf } = testBot
      const villager = await trader(testBot)
      const requests = requestsSince(server)
      const click = async (mode = 0): Promise<void> => { await ticked(testBot, async () => { await bot.clickWindow(2, 0, mode) }) }
      // no trades, then none again: none selected
      await opened(testBot, villager, undefined)
      await click()
      const none = await shownOver(testBot, [], { windowId: 6 })
      await click()
      assert.strictEqual(none.selectedTrade, null)
      // used up, its price in
      const window = await shownOver(testBot, [{ ...WHEAT_FOR_EMERALD, netId: 1, uses: 64 }, WHEAT_FOR_EMERALD], { windowId: 7 })
      inventory.slot('ui', 4, { id: idOf('wheat'), count: 5, stackId: 9 })
      await click()
      assert.deepStrictEqual(requests(), [])
      await play(testBot, answerer(testBot, inventory), window.selectTrade(1))
      assert.deepStrictEqual(requests(), [['place 5 trade2_ingredient1:4 → hotbar_and_inventory:0'], ['place 5 hotbar_and_inventory:0 → trade2_ingredient1:4']])

      inventory.slot('ui', 4, { id: idOf('dirt'), count: 5, stackId: 9 })
      await click()
      inventory.slot('ui', 4, { id: idOf('wheat'), count: 5, stackId: 9 })
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 10 })
      await click()
      inventory.slot('ui', 0, { id: idOf('emerald'), count: 64, stackId: 10 })
      await click()
      await assert.rejects(click(1), { message: 'clickWindow: on Bedrock the trading result takes a mouse click only, not mode 1' })
      assert.deepStrictEqual(requests(), [])

      // the last one the cursor has room for
      inventory.slot('ui', 0, { id: idOf('emerald'), count: 63, stackId: 10 })
      await driver.tick()
      const refused = assert.rejects(bot.clickWindow(2, 1, 0), /the server refused item stack request/)
      await play(testBot, answerer(testBot, inventory, 49), refused)
      assert.deepStrictEqual([requests().map(actions => actions.at(-1)), window.trades[1]?.nbTradeUses, window.selectedItem?.count], [['take 1 creative_output:50 → cursor:0'], 0, 63])

      // its first price in, not its second
      inventory.slot('ui', 0, null)
      inventory.slot('ui', 4, { id: idOf('emerald'), count: 1, stackId: 11 })
      await shownOver(testBot, [EMERALD_AND_WHEAT_FOR_BREAD], { windowId: 9 })
      await click()
      assert.deepStrictEqual(requests(), [['place 1 trade2_ingredient1:4 → hotbar_and_inventory:0'], ['place 1 hotbar_and_inventory:0 → trade2_ingredient1:4']])
      bot.end()
    })

    it('selects a trade: back to the inventory what the slots hold, then a stack\'s worth of the items from several stacks, of the data value the trade costs; leaving what has no room', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, inventory, idOf } = testBot
      const [wheat, dirt] = [idOf('wheat'), idOf('dirt')]
      inventory.content('inventory', [{ id: wheat, count: 40, stackId: 7 }, { id: wheat, count: 30, metadata: 1, stackId: 8 }, { id: wheat, count: 40, stackId: 9 }, ...Array.from({ length: 33 }, () => null)])
      const villager = await trader(testBot)
      const priced: GivenOffer = { buyA: { name: 'wheat', damage: 0 }, sell: { name: 'emerald', damage: 0 }, netId: 1, counts: [1, 0] }
      const window = await opened(testBot, villager, [priced])
      const requests = requestsSince(server)
      assert.deepStrictEqual(requests(), [['place 40 hotbar_and_inventory:0 → trade2_ingredient1:4'], ['place 24 hotbar_and_inventory:2 → trade2_ingredient1:4']])
      await assert.rejects(ticked(testBot, async () => { await window.selectTrade(3) }), { message: 'the villager has no trade 3' })

      // the inventory full: the slots' wheat and emerald stay
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot): Given => ({ id: slot === 35 ? wheat : dirt, count: 64, stackId: 20 + slot })))
      inventory.slot('ui', 4, { id: wheat, count: 64, stackId: 60 })
      inventory.slot('ui', 5, { id: idOf('emerald'), count: 1, stackId: 61 })
      const full = await shownOver(testBot, [{ ...priced, buyB: { name: 'wheat' } }], { windowId: 8 })
      await driver.tick()
      await ticked(testBot, async () => { await full.selectTrade(0) })
      assert.deepStrictEqual([requests(), countsOf(full, 0, 1)], [[], [['wheat', 64], ['emerald', 1]]])
      await inventoryOver(testBot)
      await assert.rejects(ticked(testBot, async () => { await full.selectTrade(0) }), { message: 'selectTrade needs the villager\'s window open' })
      bot.end()
    })

    it('opens a wandering trader\'s screen; rejects a mob that does not trade before the use, a screen of another kind, and one the bot does not show', async () => {
      const testBot = await joined(version)
      const { bot, server, driver } = testBot
      const pig = await trader(testBot, { runtime: 3, unique: -3n, type: 'minecraft:pig', z: 5.5 })
      await assert.rejects(bot.openVillager(pig), { message: 'openVillager: a pig does not trade' })
      const villager = await trader(testBot)
      const inventoryOpened = assert.rejects(bot.openVillager(villager), { message: 'openVillager: the server opened a minecraft:inventory window, not the villager_v2\'s' })
      await driver.frame(10)
      server.send('container_open', { window_id: 2, window_type: 'inventory', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
      await driver.tick()
      await inventoryOpened
      server.send('container_close', { window_id: 2, server: true })
      await driver.tick()
      const unshown = assert.rejects(bot.openVillager(villager), { message: 'the server opened a container screen, which the bot does not show' })
      await driver.frame(10)
      updateTrade(server, RECORDED_OFFERS, { type: 'container' })
      await driver.tick()
      await unshown
      assert.strictEqual(server.sentOf('inventory_transaction').length, 2)

      write(server, 'remove_entity', { entity_id_self: TRADER_UNIQUE })
      await driver.ticks(2)
      const wandering = await trader(testBot, { runtime: 4, unique: -4n, type: 'minecraft:wandering_trader' })
      const window = await opened(testBot, wandering, RECORDED_OFFERS, { unique: -4n, name: 'entity.wandering_trader.name' })
      assert.deepStrictEqual([window.type, window.title, window.trades.length], ['minecraft:villager', '{"translate":"entity.wandering_trader.name"}', 2])
      bot.end()
    })

    it('takes update_trade again for the screen open as its new trades, without ready; container_open opens it with none; another death closes nothing', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, inventory, idOf } = testBot
      inventory.slot('inventory', 0, { id: idOf('wheat'), count: 64, stackId: 7 })
      // no screen: nothing to close
      await trader(testBot, { runtime: 5, unique: -5n, type: 'minecraft:pig', z: 5.5 })
      write(server, 'entity_event', { runtime_entity_id: 5n, event_id: 'death_animation', data: 0 })
      const villager = await trader(testBot)
      await trader(testBot, { runtime: 6, unique: -6n, type: 'minecraft:pig', z: 7.5 })
      let readies = 0
      bot.on('windowOpen', window => { onReady(window, () => { readies++ }) })
      const window = await opened(testBot, villager, RECORDED_OFFERS)
      updateTrade(server, [EMERALD_AND_WHEAT_FOR_BREAD, { ...WHEAT_FOR_EMERALD, netId: 8, uses: 3 }])
      write(server, 'entity_event', { runtime_entity_id: 6n, event_id: 'death_animation', data: 0 })
      await driver.frames([200, 200, 200, 200, 200])
      assert.deepStrictEqual([readies, bot.currentWindow === window, window.trades.map(trade => trade.outputItem.name), window.selectedTrade === window.trades[0]], [1, true, ['bread', 'emerald'], true])
      assert.deepStrictEqual(server.sentOf('container_close'), [])

      // closed by the server, its id opens a screen again; one of another kind does not replace it
      server.send('container_close', { window_id: 6, window_type: 'none', server: true })
      await driver.tick()
      const again = await shownOver(testBot, RECORDED_OFFERS, { windowId: 6 })
      updateTrade(server, RECORDED_OFFERS, { windowId: 9, type: 'container' })
      await driver.tick()
      assert.deepStrictEqual([again === window, bot.currentWindow === again, readies], [false, true, 2])

      // the recorded test server's (1.26.51.1): its trader is not one the bot has, and it trades nothing
      const entities = openingEntities(testBot)
      receive(server, '50030f0000d20f0110636f6e7461696e65722d73657276657201000a000907526563697065730a00091354696572457870526571756972656d656e74730a0000')
      await driver.tick()
      const tested = bot.currentWindow as BedrockVillager | null
      server.send('container_open', { window_id: 4, window_type: 'trading', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
      await driver.tick()
      const plain = bot.currentWindow as BedrockVillager | null
      assert.deepStrictEqual([tested?.title, tested?.trades, readies, plain?.title, plain?.trades, plain?.selectedTrade, entities], ['{"translate":"container-server"}', [], 3, 'Villager', [], null, [-1n, -1n]])
      bot.end()
    })

    it('sells a block\'s item as the state its Block compound names: a stone sale put away onto the inventory\'s stone, an oak log lying along x as that state', async () => {
      const testBot = await joined(version)
      const { bot, server, inventory, idOf, errors } = testBot
      const Block = prismarineBlock(bot.registry)
      const [stone, xLog] = [Block.fromProperties('stone', {}, 0).stateId, Block.fromProperties('oak_log', { pillar_axis: 'x' }, 0).stateId]
      inventory.content('inventory', [{ id: idOf('wheat'), count: 64, stackId: 7 }, { id: idOf('stone'), count: 10, stackId: 8, blockRuntimeId: stone }, ...Array.from({ length: 34 }, () => null)])
      const villager = await trader(testBot)
      const window = await opened(testBot, villager, [
        { buyA: { name: 'wheat' }, sell: { name: 'stone', damage: 0, block: { name: 'stone' } }, netId: 9, counts: [1, 0] },
        { buyA: { name: 'wheat' }, sell: { name: 'oak_log', damage: 0, block: { name: 'oak_log', states: { pillar_axis: { type: 'string', value: 'x' } } } }, netId: 10, counts: [1, 0] }
      ])
      const answer = answerer(testBot, inventory)
      const requests = requestsSince(server)
      await play(testBot, answer, bot.trade(window, 0, 1))
      const stones = bot.inventory.items().filter(item => item.name === 'stone').map(item => item.count)
      assert.deepStrictEqual([requests().filter(actions => actions[0]?.startsWith('place 1 cursor:0') === true), stones], [[['place 1 cursor:0 → hotbar:1']], [11]])
      await play(testBot, answer, bot.trade(window, 1, 1))
      const sold = server.sentOf('item_stack_request').flatMap(({ requests }) => requests).flatMap(({ actions }) => actions.flatMap(action => [...action.result_items ?? []]))
      assert.deepStrictEqual([sold.map(item => 'block_runtime_id' in item ? item.block_runtime_id : undefined), errors], [[stone, xLog], []])
      bot.end()
    })

    it('reads the offers as a server may write them: the counts from the items, an item\'s NBT; an item or a block state the registry has not, or an offer without its sale, is an error', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, errors, inventory, idOf } = testBot
      inventory.slot('inventory', 0, { id: idOf('emerald'), count: 5, stackId: 7 })
      const villager = await trader(testBot)
      const book: GivenItem = { name: 'enchanted_book', damage: 0, tag: { ench: { type: 'list', value: { type: 'compound', value: [{ id: { type: 'short', value: 9 }, lvl: { type: 'short', value: 1 } }] } } } }
      const window = await opened(testBot, villager, [{ buyA: { name: 'emerald', count: 5, damage: 0 }, sell: book, netId: 1, bare: true }])
      const [trade] = window.trades
      assert.deepStrictEqual([trade?.realPrice, trade?.inputItem2, trade?.nbTradeUses, trade?.maximumNbTradeUses, trade?.tradeDisabled, trade?.outputItem.nbt?.value], [5, null, 0, 0, true, book.tag])
      // with a use left, the sale is told with its NBT
      updateTrade(server, [{ buyA: { name: 'emerald', count: 5, damage: 0 }, sell: book, netId: 1, counts: [5, 0] }])
      const answer = answerer(testBot, inventory)
      answer()
      await play(testBot, answer, bot.clickWindow(2, 0, 0))
      const [request] = server.sentOf('item_stack_request').at(-1)?.requests ?? []
      const result = request?.actions[1]?.result_items?.[0]
      assert.ok(result !== undefined && 'extra' in result)
      assert.deepStrictEqual([request?.actions[0]?.recipe_network_id, result.extra?.has_nbt, result.extra?.nbt?.nbt.value], [1, true, book.tag])
      updateTrade(server, [{ buyA: { name: 'emerald' }, sell: { name: 'custom_thing' }, netId: 2 }], { windowId: 9 })
      updateTrade(server, [{ buyA: { name: 'emerald' }, netId: 3 }], { windowId: 9 })
      updateTrade(server, [{ buyA: { name: 'emerald' }, sell: { name: 'stone', block: { name: 'stone', states: { stone_type: { type: 'string', value: 'granite' } } } }, netId: 4 }], { windowId: 9 })
      updateTrade(server, [{ buyA: { name: 'emerald' }, sell: { name: 'stone', block: { name: 'custom_block' } }, netId: 5 }], { windowId: 9 })
      await driver.tick()
      assert.deepStrictEqual(errors, [
        'a trade names custom_thing, an item the registry has not', 'a trade has no buyA or no sell', 'a trade names a state of stone the registry has not',
        'a trade names a state of custom_block the registry has not'
      ])
      bot.end()
    })
  })
})
