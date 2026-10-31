import assert from 'assert'
import type { Item } from 'prismarine-item'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// recorded packets of the vanilla client, grouped by how versions write them: the bot must send the client's, byte for byte

/** recorded in the features scenario (case mineflayer.hotbar): 2 dirt given in hotbar slot 0, key 2, then key 1 */
interface RecordedHotbar {
  from: BedrockVersion
  to: BedrockVersion
  /** the dirt as the recording's server gave it */
  dirt: Given
  /** interact mouse_over_entity: a new item in the hand */
  interact: string
  /** mob_equipment of hotbar slot 1, empty */
  emptySlot1: string
  /** mob_equipment of hotbar slot 0, the 2 dirt */
  dirtSlot0: string
}

const HOTBAR: readonly RecordedHotbar[] = [
  {
    // recorded on 1.16.201.2 and 1.16.210.5: aux items
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    dirt: { id: 3, count: 2, stackId: 2 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f01060400000000000000'
  },
  {
    // recorded on 1.16.220.2: a count and metadata, the block's runtime id
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.19.1',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: 3746 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000c43a0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.20.3: told before the tick's auth input
    from: 'bedrock_1.19.10',
    to: 'bedrock_1.21.124',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000f3c188db0f0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.132.1: the interact without a position
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.10',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '21040000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000f3c188db0f0a00000000000000000000000000'
  },
  {
    // recorded on 1.26.60.5: ItemV4s
    from: 'bedrock_1.26.20',
    to: latestSupportedBedrockVersion,
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '21040000',
    emptySlot1: '1f010000000000000000010100',
    dirtSlot0: '1f0103000200000086dfbb92080a00000000000000000000000000'
  }
]

/** recorded in the reduced_slots scenario (case slots.inventory_screen.armor_items.0): an iron helmet given in hotbar slot 0 taken to the cursor on the inventory screen, then put on the head */
interface RecordedArmor {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  take: string
  taken: string
  place: string
  placed: string
}

const ARMOR: readonly RecordedArmor[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    firstRequest: -949,
    stackId: 648,
    take: '930101e90e0100011b00900a3a000000',
    taken: '94010100e90e021b0100000000003a01000001900a00',
    place: '930101ed0e0101013a00900a06000000',
    placed: '94010100ed0e023a0100000000000601000001900a00'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.19.21',
    firstRequest: -777,
    stackId: 529,
    take: '930101910c0100011b00a2083a000000',
    taken: '94010100910c021b010000000000003a01000001a2080000',
    place: '930101950c0101013a00a20806000000',
    placed: '94010100950c023a010000000000000601000001a2080000'
  },
  {
    // recorded on 1.19.30.4
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    firstRequest: -3165,
    stackId: 2505,
    take: '930101b9310100011b0092273a000000ffffffff',
    taken: '94010100b931021b010000000000003a0100000192270000',
    place: '930101bd310101013a00922706000000ffffffff',
    placed: '94010100bd31023a01000000000000060100000192270000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.21.2',
    firstRequest: -3,
    stackId: 2,
    take: '930101050100011c00043b000000ffffffff',
    taken: '9401010005021c010000000000003b01000001040000',
    place: '930101090101013b000406000000ffffffff',
    placed: '9401010009023b010000000000000601000001040000'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    firstRequest: -2299,
    stackId: 2148,
    take: '930101f5230100011c0000000000c8213b00000000000000ffffffff',
    taken: '94010100f523021c00000000010000000000003b0000000001000001c8210000',
    place: '930101f9230101013b0000000000c8210600000000000000ffffffff',
    placed: '94010100f923023b0000000001000000000000060000000001000001c8210000'
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.42',
    firstRequest: -2299,
    stackId: 2148,
    take: '930101f5230100011c0000c8213b00000000ffffffff',
    taken: '94010100f523021c00010000000000003b0001000001c8210000',
    place: '930101f9230101013b0000c8210600000000ffffffff',
    placed: '94010100f923023b0001000000000000060001000001c8210000'
  },
  {
    // recorded on 1.21.50.7
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.26.30',
    firstRequest: -2343,
    stackId: 2201,
    take: '930101cd240100011c0000b2223b00000000ffffffff',
    taken: '94010100cd24021c0001000000000000003b0001000001b222000000',
    place: '930101d1240101013b0000b2220600000000ffffffff',
    placed: '94010100d124023b000100000000000000060001000001b222000000'
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    firstRequest: -2431,
    stackId: 2295,
    take: '930101fd25010000011c0000f70800003b00000000000000ffffffff',
    taken: '94010100fd250101021c000100000001000000003b00010000010101ee23000000',
    place: '9301018126010101013b0000f70800000600000000000000ffffffff',
    placed: '9401010081260101023b000100000001000000000600010000010101ee23000000'
  },
  {
    // recorded on 1.26.51.1
    from: 'bedrock_1.26.51',
    to: latestSupportedBedrockVersion,
    firstRequest: -2297,
    stackId: 2163,
    take: '930101f123010000011c0000730800003b00000000000000ffffffff',
    taken: '94010100f12301021c0001000000000000003b000100000101e621000000',
    place: '930101f523010101013b0000730800000600000000000000ffffffff',
    placed: '94010100f52301023b00010000000000000006000100000101e621000000'
  }
]

/** recorded in the reduced_stations scenario: 10 sticks given in hotbar slot 0 taken to the cursor on the inventory screen, then dropped by a click outside it */
interface RecordedToss {
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  take: string
  taken: string
  drop: string
  dropped: string
}

const TOSSES: readonly RecordedToss[] = [
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
    to: latestSupportedBedrockVersion,
    firstRequest: -345,
    stackId: 123,
    take: '930101b1050100000a1c00007b0000003b00000000000000ffffffff',
    taken: '94010100b10501021c0001000000000000003b000100000a01f601000000',
    drop: '930101b5050103030a3b00007b0000000000ffffffff',
    dropped: '94010100b50501013b000100000000000000'
  }
]

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

function refOf (info: SentSlot): SlotRef {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type
  assert.ok(typeof container === 'string' && info.slot !== undefined)
  return { container, slot: info.slot }
}

function nameOf (info: SentSlot): string {
  const { container, slot } = refOf(info)
  return `${container}:${slot}`
}

/** the item stack requests the bot sent since the last call, as written */
function writtenSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const all = server.sentOf('item_stack_request')
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.map(params => server.codec.serializer.createPacketBuffer({ name: 'item_stack_request', params }).toString('hex'))
  }
}

/** each request the bot sent since the last call: its actions' types, counts and slots */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ actions }) => actions.map(({ type_id: type, count, source, destination }) =>
      [String(type), count, source === undefined ? undefined : nameOf(source), destination === undefined ? undefined : `→ ${nameOf(destination)}`].filter(part => part !== undefined).join(' ')).join(', '))
  }
}

interface ServedBot extends TestBot {
  inventory: ServerInventory
  idOf: (name: string) => number
  /** steps ticks until `operation` settles, the server answering after each */
  served: <Result>(operation: Promise<Result>) => Promise<Result>
}

/** joined on the latest version; the server takes each request as the bot predicts it, opens the inventory screen when asked, and answers each close */
async function servedBot (): Promise<ServedBot> {
  const testBot = await bedrockTestBot(bedrockCodec(latestSupportedBedrockVersion), { screenAnimations: false })
  const { server, driver, internal } = testBot
  await new ServerWorld(server).join(testBot, { game: { runtime_entity_id: 1n } })
  const inventory = new ServerInventory(server)
  let [answered, opened, closed, nextStackId] = [0, 0, 0, 500]
  const answer = (): void => {
    const requests = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    for (const { request_id: id, actions } of requests.slice(answered)) {
      const slots = new Map(actions.flatMap(({ source, destination }) => [source, destination]).filter(info => info !== undefined).map(info => [nameOf(info), refOf(info)]))
      inventory.respond(id, [...slots.values()].map(ref => {
        const stack = internal._inventory.stackAt(ref)
        return { ...ref, count: stack?.count ?? 0, stackId: stack === undefined ? 0 : stack.stackId > 0 ? stack.stackId : nextStackId++ }
      }))
    }
    answered = requests.length
    const asked = server.sentOf('interact').filter(({ action_id: action }) => action === 'open_inventory')
    asked.slice(opened).forEach(() => { openScreen(server, 'inventory') })
    opened = asked.length
    const closes = server.sentOf('container_close')
    for (const { window_id: id } of closes.slice(closed)) server.send('container_close', { window_id: id, window_type: 'none', server: false })
    closed = closes.length
  }
  const served = async <Result>(operation: Promise<Result>): Promise<Result> => {
    let done = false
    operation.then(() => { done = true }, () => { done = true })
    const settled = (): boolean => done
    for (let tick = 0; tick < 300 && !settled(); tick++) {
      await driver.tick()
      answer()
    }
    return await operation
  }
  return { ...testBot, inventory, idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0, served }
}

function openScreen (server: FakeBedrockClient, type: 'inventory' | 'workbench'): void {
  server.send('container_open', { window_id: 2, window_type: type, coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
}

function itemAt (bot: BedrockBot, slot: number): Item {
  const item = bot.inventory.slots[slot]
  assert.ok(item != null)
  return item
}

/** the names of `slots` of bot.inventory, null where empty */
function namesOf (bot: BedrockBot, slots: readonly number[]): Array<string | null> {
  return slots.map(slot => bot.inventory.slots[slot]?.name ?? null)
}

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

/** the packets the bot sent in its last tick, as written, but its auth input by name and its section requests */
function lastTick (server: FakeBedrockClient, tick: number): string[] {
  return server.batches.flat().filter(packet => packet.tick === tick && packet.phase === 'T3' && packet.name !== 'subchunk_request')
    .map(({ name, params }) => name === 'player_auth_input' ? name : server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
}

/** the bot's packets since the last call, but its auth inputs and section requests, by name */
function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.map(({ name }) => name).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request')
  }
}

/** a bot joined, its items named by start_game's palette up to 1.21.50, holding `given` in hotbar slot 0 */
async function holding (version: BedrockVersion, given: Given | null): Promise<TestBot & { inventory: ServerInventory, tick: () => number }> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const inventory = new ServerInventory(testBot.server)
  if (given !== null) inventory.slot('inventory', 0, given)
  await testBot.driver.tick()
  return { ...testBot, inventory, tick: () => testBot.internal._core.tick ?? 0 }
}

describe('bedrock items', () => {
  for (const recorded of HOTBAR) {
    describe(`selecting a hotbar slot as the vanilla client's key (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: reads the slot at once, selects it in the next input pass and tells it in the next tick`, async () => {
          const { bot, server, driver, tick } = await holding(version, recorded.dirt)
          const held: Array<string | undefined> = []
          bot.on('heldItemChanged', item => { held.push(item?.name) })
          const placed = (told: string[]): string[] => atLeast(version, 'bedrock_1.19.10') ? [...told, 'player_auth_input'] : ['player_auth_input', ...told]

          bot.setQuickBarSlot(1)
          assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem, held], [1, null, []])
          await driver.frame(10)
          assert.deepStrictEqual(held, [undefined])
          await driver.tick()
          assert.deepStrictEqual(lastTick(server, tick()), placed([recorded.interact, recorded.emptySlot1]))

          bot.setQuickBarSlot(0)
          assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.count], [0, 2])
          await driver.tick()
          assert.deepStrictEqual([held, lastTick(server, tick())], [[undefined, bot.heldItem?.name], placed([recorded.interact, recorded.dirtSlot0])])
          bot.end()
        })
      }
    })
  }

  for (const recorded of ARMOR) {
    describe(`equipping as the vanilla client puts armor on (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: takes the helmet to the cursor, then puts it on the head, each click once the server took the one before`, async () => {
          const { bot, internal, server, driver, inventory } = await holding(version, null)
          const errors: string[] = []
          bot.on('error', error => { errors.push(error.message) })
          inventory.slot('inventory', 0, { id: bot.registry.itemsByName['iron_helmet']?.id ?? 0, count: 1, stackId: recorded.stackId })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const requests = writtenSince(server)

          const equip = bot.equip(itemAt(bot, 36), 'head')
          await driver.tick()
          assert.deepStrictEqual(requests(), [recorded.take])
          server.receive(Buffer.from(recorded.taken, 'hex'))
          await driver.ticks(2)
          assert.deepStrictEqual(requests(), [recorded.place])
          server.receive(Buffer.from(recorded.placed, 'hex'))
          await driver.tick()
          await equip
          assert.deepStrictEqual([namesOf(bot, [5, 36]), bot.inventory.slots[5]?.stackId, bot.currentWindow, errors], [['iron_helmet', null], recorded.stackId, bot.inventory, []])
          bot.end()
        })
      }
    })
  }

  for (const recorded of TOSSES) {
    describe(`tossing a stack as the vanilla client drops it from the cursor (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: takes the stack to the cursor, then drops it with the arm's swing, each click once the server took the one before, leaving the screen open`, async () => {
          const { bot, internal, server, driver, inventory } = await holding(version, null)
          const errors: string[] = []
          bot.on('error', error => { errors.push(error.message) })
          inventory.slot('inventory', 0, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 10, stackId: recorded.stackId })
          openScreen(server, 'inventory')
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const requests = writtenSince(server)

          const toss = bot.tossStack(itemAt(bot, 36))
          await driver.tick()
          assert.deepStrictEqual([requests(), server.sentOf('animate').length], [[recorded.take], 0])
          server.receive(Buffer.from(recorded.taken, 'hex'))
          await driver.ticks(2)
          assert.deepStrictEqual(requests(), [recorded.drop])
          // the arm swings for the drop, recorded with the request on every build: for a dropped item from 1.21.130
          assert.deepStrictEqual(server.sentOf('animate').map(({ action_id: action, swing_source: source }) => [action, source]), [['swing_arm', atLeast(version, 'bedrock_1.21.130') ? 'dropitem' : undefined]])
          server.receive(Buffer.from(recorded.dropped, 'hex'))
          await driver.tick()
          await toss
          assert.deepStrictEqual([bot.inventory.slots[36], bot.inventory.selectedItem, bot.currentWindow, server.sentOf('container_close').length, errors], [null, null, bot.inventory, 0, []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const dirt: Given = { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 }

    it('throws Java\'s assertion for a slot out of the hotbar', async () => {
      const { bot } = await holding(version, null)
      assert.throws(() => { bot.setQuickBarSlot(-1) }, { name: 'AssertionError' })
      assert.throws(() => { bot.setQuickBarSlot(9) }, { name: 'AssertionError' })
      assert.strictEqual(bot.QUICK_BAR_START, 36)
      bot.end()
    })

    it('selects nothing and tells nothing for the slot selected, as the vanilla client\'s key (recorded on 1.26.51.1)', async () => {
      const { bot, server, driver } = await holding(version, dirt)
      const sent = sentSince(server)
      let changes = 0
      bot.on('heldItemChanged', () => { changes++ })
      bot.setQuickBarSlot(0)
      await driver.tick()
      assert.deepStrictEqual([changes, sent()], [0, []])
      bot.end()
    })

    it('selects the last slot asked in a frame, and none when it is the one the frame started with', async () => {
      const { bot, internal, server, driver } = await holding(version, dirt)
      const sent = sentSince(server)
      const held: Array<number | undefined> = []
      bot.on('heldItemChanged', item => { held.push(item?.count) })
      bot.setQuickBarSlot(1)
      bot.setQuickBarSlot(0)
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.count], [0, 2])
      await driver.tick()
      assert.deepStrictEqual([held, sent()], [[], []])
      bot.setQuickBarSlot(1)
      bot.setQuickBarSlot(2)
      await driver.frame(10)
      assert.deepStrictEqual([internal._inventory.quickBarSlot, held], [2, [undefined]])
      await driver.tick()
      assert.deepStrictEqual([sent(), server.sentOf('mob_equipment').at(-1)?.selected_slot], [['interact', 'mob_equipment'], 2])
      bot.end()
    })

    it('selects a slot asked while the input pass selects another', async () => {
      const { bot, driver } = await holding(version, dirt)
      const selected: number[] = []
      bot.once('heldItemChanged', () => { bot.setQuickBarSlot(3) })
      bot.on('heldItemChanged', () => { selected.push(bot.quickBarSlot) })
      bot.setQuickBarSlot(1)
      await driver.frame(10)
      await driver.frame(10)
      assert.deepStrictEqual(selected, [3, 3])
      bot.end()
    })

    it('reads the server\'s selection after its own', async () => {
      const { bot, server, driver } = await holding(version, dirt)
      bot.setQuickBarSlot(1)
      await driver.frame(10)
      server.send('player_hotbar', { selected_slot: 2, window_id: 'inventory', select_slot: true })
      await driver.frame(10)
      assert.strictEqual(bot.quickBarSlot, 2)
      bot.end()
    })

    it('emits heldItemChanged for the slot asked, when the server changes it before the input pass selects it', async () => {
      const { bot, inventory, driver } = await holding(version, null)
      const held: Array<number | undefined> = []
      bot.on('heldItemChanged', item => { held.push(item?.count) })
      bot.setQuickBarSlot(1)
      inventory.slot('inventory', 1, dirt)
      inventory.slot('inventory', 0, { ...dirt, count: 5 })
      await driver.frame(10)
      assert.deepStrictEqual(held, [2, 2])
      bot.end()
    })

    it('tells another slot of an alike item by mob_equipment alone, its slot being the server\'s selection (not recorded)', async () => {
      const { bot, inventory, server, driver } = await holding(version, null)
      const sent = sentSince(server)
      bot.setQuickBarSlot(4)
      await driver.tick()
      const told = server.sentOf('mob_equipment').at(-1)
      assert.deepStrictEqual([sent(), told?.slot, told?.selected_slot, told?.item.network_id], [['mob_equipment'], 4, 4, 0])
      // another slot changed: the hand and its slot are as told
      inventory.slot('inventory', 8, dirt)
      await driver.tick()
      assert.deepStrictEqual(sent(), [])
      bot.end()
    })
  })

  describe(`equip and unequip, alike on every version: (on ${latestSupportedBedrockVersion})`, () => {
    it('puts armor and the offhand\'s item on by clicks on the inventory screen it opens and closes; bot.entity.equipment is Java\'s', async () => {
      const testBot = await servedBot()
      const { bot, server, inventory, idOf, served } = testBot
      inventory.slot('inventory', 0, { id: idOf('iron_helmet'), count: 1, stackId: 7 })
      inventory.slot('inventory', 9, { id: idOf('shield'), count: 1, stackId: 8 })
      inventory.slot('inventory', 1, { id: idOf('iron_boots'), count: 1, stackId: 9 })
      inventory.slot('inventory', 2, { id: idOf('iron_chestplate'), count: 1, stackId: 10 })
      await testBot.driver.tick()
      const requests = requestsSince(server)
      await served(bot.equip(itemAt(bot, 36), 'head'))
      await served(bot.equip(idOf('shield'), 'off-hand'))
      assert.deepStrictEqual([requests(), server.sentOf('interact').filter(({ action_id: action }) => action === 'open_inventory').length, server.sentOf('container_close').length, bot.currentWindow], [[
        'take 1 hotbar:0 → cursor:0', 'place 1 cursor:0 → armor:0',
        'take 1 inventory:9 → cursor:0', 'place 1 cursor:0 → offhand:1'
      ], 2, 2, null])
      await served(bot.openInventory())
      await served(bot.equip(idOf('iron_boots'), 'feet'))
      await served(bot.equip(idOf('iron_chestplate'), 'torso'))
      // the slot it is in already: nothing
      await served(bot.equip(itemAt(bot, 8), 'feet'))
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow], [[
        'take 1 hotbar:1 → cursor:0', 'place 1 cursor:0 → armor:3', 'take 1 hotbar:2 → cursor:0', 'place 1 cursor:0 → armor:1'
      ], 2, bot.inventory])
      bot.setQuickBarSlot(3)
      inventory.slot('inventory', 3, { id: idOf('stone'), count: 5, stackId: 11 })
      await testBot.driver.tick()
      assert.deepStrictEqual(bot.entity.equipment.map(item => item?.name ?? null), ['stone', 'shield', 'iron_boots', null, 'iron_chestplate', 'iron_helmet'])
      bot.end()
    })

    it('rejects, sending nothing, an item the slot does not take, as the vanilla client sends nothing for such a click', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 3, stackId: 7 })
      inventory.slot('inventory', 1, { id: idOf('egg'), count: 3, stackId: 8 })
      inventory.slot('inventory', 2, { id: idOf('iron_helmet'), count: 1, stackId: 9 })
      await driver.tick()
      const sent = sentSince(server)
      await assert.rejects(served(bot.equip(idOf('dirt'), 'head')), { message: 'equip: dirt is not worn on head' })
      await assert.rejects(served(bot.equip(idOf('egg'), 'off-hand')), { message: 'equip: egg is not worn on off-hand' })
      await assert.rejects(served(bot.equip(idOf('iron_helmet'), 'feet')), { message: 'equip: iron_helmet is not worn on feet' })
      assert.deepStrictEqual(sent(), [])
      bot.end()
    })

    it('equips the hand by selecting a hotbar item, else by moving the item to the first empty hotbar slot, else to the next in turn, and selecting it', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      const stone = { id: idOf('stone'), count: 64, stackId: 20 }
      inventory.content('inventory', [stone, null, ...Array<Given>(7).fill(stone), { id: idOf('dirt'), count: 3, stackId: 7 }, ...Array<Given | null>(26).fill(null)])
      inventory.slot('inventory', 2, { id: idOf('egg'), count: 3, stackId: 8 })
      inventory.slot('inventory', 11, { id: idOf('oak_planks'), count: 10, stackId: 9, metadata: 1 })
      inventory.slot('offhand', 0, { id: idOf('arrow'), count: 5, stackId: 10 })
      await driver.tick()
      const requests = requestsSince(server)
      await served(bot.equip(idOf('egg'), null))
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.name, requests()], [2, 'egg', []])
      // the hand's item: nothing
      await served(bot.equip(itemAt(bot, 38), 'hand'))
      await served(bot.equip(itemAt(bot, 45), 'hand'))
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.name, requests()], [1, 'arrow', ['take 5 offhand:1 → cursor:0', 'place 5 cursor:0 → hotbar:1']])
      await served(bot.equip(itemAt(bot, 36), 'hand'))
      assert.deepStrictEqual([bot.quickBarSlot, requests()], [0, []])
      await served(bot.equip(idOf('dirt'), 'hand'))
      await served(bot.equip(itemAt(bot, 11), 'hand'))
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.metadata, namesOf(bot, [36, 9, 11]), requests()], [1, 1, ['dirt', 'stone', 'arrow'], [
        'take 3 inventory:9 → cursor:0', 'swap cursor:0 → hotbar:0', 'place 64 cursor:0 → inventory:9',
        'take 10 inventory:11 → cursor:0', 'swap cursor:0 → hotbar:1', 'place 5 cursor:0 → inventory:11'
      ]])
      bot.end()
    })

    it('goes round the hotbar in Java\'s turn when no hotbar slot is empty', async () => {
      const { bot, inventory, idOf, served, driver } = await servedBot()
      const dirt = { id: idOf('dirt'), count: 1, stackId: 7 }
      inventory.content('inventory', [...Array<Given>(9).fill({ id: idOf('stone'), count: 64, stackId: 20 }), ...Array<Given>(10).fill(dirt), ...Array<Given | null>(17).fill(null)])
      await driver.tick()
      const selected: number[] = []
      for (let slot = 9; slot < 19; slot++) {
        await served(bot.equip(itemAt(bot, slot), 'hand'))
        selected.push(bot.quickBarSlot)
      }
      assert.deepStrictEqual(selected, [0, 1, 2, 3, 4, 5, 6, 7, 8, 0])
      bot.end()
    })

    it('clicks bot.inventory\'s slots where the screen open shows them, rejecting one it does not show', async () => {
      const testBot = await servedBot()
      const { bot, server, inventory, idOf, served, driver } = testBot
      inventory.slot('inventory', 9, { id: idOf('dirt'), count: 3, stackId: 7 })
      inventory.slot('inventory', 1, { id: idOf('iron_boots'), count: 1, stackId: 8 })
      inventory.slot('armor', 0, { id: idOf('iron_helmet'), count: 1, stackId: 9 })
      openScreen(server, 'workbench')
      await driver.tick()
      const requests = requestsSince(server)
      await served(bot.equip(idOf('dirt'), 'hand'))
      assert.deepStrictEqual([bot.quickBarSlot, requests(), bot.currentWindow?.slots[37]?.name], [0, ['take 3 inventory:9 → cursor:0', 'place 3 cursor:0 → hotbar:0'], 'dirt'])
      await assert.rejects(served(bot.equip(idOf('iron_boots'), 'feet')), { message: 'equip: the minecraft:crafting_table window open shows no slot 8 of the inventory' })
      await assert.rejects(served(bot.equip(itemAt(bot, 5), 'hand')), { message: 'equip: the minecraft:crafting_table window open shows no slot 5 of the inventory' })
      await assert.rejects(served(bot.unequip('head')), { message: 'unequip: the minecraft:crafting_table window open shows no slot 5 of the inventory' })
      assert.deepStrictEqual([requests(), bot.quickBarSlot], [[], 0])
      bot.end()
    })

    it('unequips the hand by selecting an empty hotbar slot, else by moving its stack to the inventory, else by dropping it', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      const stone = { id: idOf('stone'), count: 64, stackId: 20 }
      // the last hotbar slot empty
      inventory.content('inventory', [...Array<Given>(8).fill(stone), null, ...Array<Given>(27).fill(stone)])
      await driver.tick()
      const requests = requestsSince(server)
      await served(bot.unequip('hand'))
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem, requests()], [8, null, []])
      inventory.slot('inventory', 8, stone)
      inventory.slot('inventory', 20, null)
      await driver.tick()
      await served(bot.unequip('hand'))
      inventory.slot('inventory', 8, stone)
      await driver.tick()
      await served(bot.unequip('hand'))
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem, requests(), server.sentOf('animate').length, server.sentOf('container_close').length], [8, null, [
        'take 64 hotbar:8 → cursor:0', 'place 64 cursor:0 → inventory:20',
        'take 64 hotbar:8 → cursor:0', 'drop 64 cursor:0'
      ], 1, 2])
      bot.end()
    })

    it('unequips the armor and the offhand by putAway: a shift click to the hotbar and inventory, on the inventory screen open or the one it opens', async () => {
      const { bot, server, inventory, idOf, served } = await servedBot()
      inventory.slot('armor', 3, { id: idOf('iron_boots'), count: 1, stackId: 7 })
      inventory.slot('offhand', 0, { id: idOf('shield'), count: 1, stackId: 8 })
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 3, stackId: 9 })
      const requests = requestsSince(server)
      await served(bot.unequip('feet'))
      await served(bot.openInventory())
      await served(bot.unequip('off-hand'))
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, namesOf(bot, [8, 45, 37, 38]), bot.quickBarSlot], [
        ['place 1 armor:3 → hotbar_and_inventory:1', 'place 1 offhand:1 → hotbar_and_inventory:2'], 1, [null, null, 'iron_boots', 'shield'], 0
      ])
      bot.end()
    })

    it('rejects as Java an item that is none, an item the inventory has not, and a destination that is none', async () => {
      const { bot, idOf, served } = await servedBot()
      const invalid = { message: 'Invalid item object in equip (item is null or typeof item is not object)' }
      await assert.rejects(served(bot.equip(null as never, 'hand')), invalid)
      await assert.rejects(served(bot.equip(idOf('dirt'), 'hand')), invalid)
      await assert.rejects(served(bot.unequip(null)), { name: 'AssertionError', message: 'invalid destination: null' })
      assert.throws(() => bot.getEquipmentDestSlot('nose'), { name: 'AssertionError', message: 'invalid destination: nose' })
      bot.setQuickBarSlot(6)
      assert.deepStrictEqual(['hand', 'head', 'torso', 'legs', 'feet', 'off-hand'].map(bot.getEquipmentDestSlot), [42, 5, 6, 7, 8, 45])
      bot.end()
    })

    it('tells whether a slot takes what another holds: any slot but the armor and the offhand, and a slot the inventory has not', async () => {
      const { bot, internal, inventory, idOf, driver } = await servedBot()
      inventory.slot('inventory', 0, { id: idOf('iron_helmet'), count: 1, stackId: 7 })
      await driver.tick()
      const takes = internal._inventory
      assert.deepStrictEqual([takes.takes(36, 5), takes.takes(36, 6), takes.takes(36, 9), takes.takes(36, 99), takes.takes(99, 6), takes.takes(37, 6)], [true, false, true, true, true, true])
      bot.end()
    })
  })
  describe(`toss and tossStack, alike on every version: (on ${latestSupportedBedrockVersion})`, () => {
    it('tosses a stack on the inventory screen it opens and closes, or on the screen open, where it shows an item of bot.inventory, or the window\'s own item', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 5, stackId: 7 })
      inventory.slot('inventory', 9, { id: idOf('stone'), count: 3, stackId: 8 })
      inventory.slot('inventory', 1, { id: idOf('egg'), count: 2, stackId: 9 })
      await driver.tick()
      const requests = requestsSince(server)
      await served(bot.tossStack(itemAt(bot, 36)))
      assert.deepStrictEqual([requests(), server.sentOf('animate').length, server.sentOf('container_close').length, bot.currentWindow, bot.inventory.slots[36]], [
        ['take 5 hotbar:0 → cursor:0', 'drop 5 cursor:0'], 1, 1, null, null
      ])
      openScreen(server, 'workbench')
      await driver.tick()
      await served(bot.tossStack(itemAt(bot, 9)))
      const window = bot.currentWindow
      assert.ok(window !== null)
      await served(bot.tossStack(window.slots[38] ?? itemAt(bot, 0)))
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow, namesOf(bot, [9, 37])], [
        ['take 3 inventory:9 → cursor:0', 'drop 3 cursor:0', 'take 2 hotbar:1 → cursor:0', 'drop 2 cursor:0'], 1, window, [null, null]
      ])
      await assert.rejects(bot.tossStack(null as never), { name: 'AssertionError' })
      assert.deepStrictEqual(requests(), [])
      bot.end()
    })

    it('tosses as Java\'s transfer to outside the window: the stack taken, a drop an item and the rest put back, else the whole stack dropped', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      inventory.slot('inventory', 9, { id: idOf('oak_planks'), count: 10, stackId: 7 })
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 4, stackId: 8 })
      await driver.tick()
      const requests = requestsSince(server)
      await served(bot.toss(idOf('oak_planks'), null, 3))
      assert.deepStrictEqual([requests(), server.sentOf('animate').length, server.sentOf('container_close').length, bot.currentWindow, bot.inventory.slots[9]?.count], [[
        'take 10 inventory:9 → cursor:0', 'drop 1 cursor:0', 'drop 1 cursor:0', 'drop 1 cursor:0', 'place 7 cursor:0 → inventory:9'
      ], 3, 1, null, 7])
      await served(bot.toss(idOf('oak_planks'), 0, null))
      await served(bot.toss(idOf('dirt'), null, 4))
      assert.deepStrictEqual([requests(), namesOf(bot, [9, 36]), bot.inventory.slots[9]?.count], [[
        'take 7 inventory:9 → cursor:0', 'drop 1 cursor:0', 'place 6 cursor:0 → inventory:9', 'take 4 hotbar:0 → cursor:0', 'drop 4 cursor:0'
      ], ['oak_planks', null], 6])
      bot.end()
    })

    it('tosses from the player\'s slots of the screen open, and rejects as Java too few items, after tossing those it found, and an item that is none', async () => {
      const { bot, server, inventory, idOf, served, driver } = await servedBot()
      const [stone, planks] = [idOf('stone'), idOf('oak_planks')]
      inventory.slot('inventory', 1, { id: stone, count: 2, stackId: 7 })
      inventory.slot('inventory', 9, { id: planks, count: 5, stackId: 8, metadata: 1 })
      await driver.tick()
      const requests = requestsSince(server)
      await assert.rejects(served(bot.toss(stone, null, 3)), { message: `Can't find stone in slots [9 - 45], (item id: ${stone})` })
      await assert.rejects(served(bot.toss(planks, 0, 1)), { message: `Can't find oak_planks in slots [9 - 45], (item id: ${planks})` })
      await assert.rejects(served(bot.toss(99999, null, 1)), { name: 'AssertionError', message: 'Invalid itemType' })
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow], [['take 2 hotbar:1 → cursor:0', 'drop 2 cursor:0'], 3, null])
      openScreen(server, 'workbench')
      await driver.tick()
      await served(bot.toss(planks, 1, 5))
      await assert.rejects(served(bot.toss(stone, null, 1)), { message: `Can't find stone in slots [10 - 46], (item id: ${stone})` })
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow?.type], [['take 5 inventory:9 → cursor:0', 'drop 5 cursor:0'], 3, 'minecraft:crafting_table'])
      bot.end()
    })
  })
})
