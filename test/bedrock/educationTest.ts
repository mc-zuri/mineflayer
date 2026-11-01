import assert from 'assert'
import type { Window } from 'prismarine-windows'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given, RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The recorded values are the vanilla client's on an Education world of Bedrock Dedicated Server (protocol_education,
// 1.26.20.4, 1.26.51.1 and 1.26.60.5): each screen opened by a use of its block at (2, -60, 0), its slots clicked, its
// craft made, then closed. The 1.26.20 client ran without the screens' animations.

const AT = Object.freeze({ x: 2, y: -60, z: 0 })
// the hotbar's slot 3 in a window of `before` slots of its own: the inventory's 27 come first
const HOTBAR_3 = (before: number): number => before + 27 + 3
const STONE_MIX = (1 << 16) | 32767
// crafting_data's reduction of stone, as recorded: element_14 (silicon) and element_8 (oxygen), a stack each
const STONE_REDUCED = Object.freeze([{ network_id: -25, count: 33 }, { network_id: -19, count: 64 }, { network_id: -19, count: 3 }])

type Screen = 'compound_creator' | 'element_constructor' | 'material_reducer' | 'lab_table'

interface Education extends TestBot {
  errors: string[]
  inventory: ServerInventory
  idOf: (name: string) => number
  /** the bot's requests since the last call, as requestsSince describes them */
  described: () => string[]
  /** the hex of the packets of these names the bot sent since the last call */
  sentSince: (...names: string[]) => string[]
  open: (window: number, type: Screen) => Promise<Window>
  /** closeWindow, with the frames, at 32 a second, until container_close left (30 at most), then the server's */
  close: (window: Window, answer?: () => void) => Promise<{ frames: number, outcome: string }>
  /** the server's container_close, in the version's layout */
  closed: (window: number) => void
}

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentAction = SentRequest['actions'][number]
type SentSlot = NonNullable<SentAction['source']>

function slotName (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** a result: its name or network id, metadata and count, of an aux value up to 1.16.210 */
function resultText (item: object): string {
  const field = (key: string): unknown => Reflect.get(item, key)
  const aux = Number(field('auxiliary_value'))
  const [metadata, count] = Number.isNaN(aux) ? [field('metadata'), field('count')] : [aux >> 8, aux & 0xff]
  return `${String(field('name') ?? field('network_id'))}:${Number(metadata)}x${Number(count)}`
}

/** a request: its id, its actions (a legacy type id after a slash, a create's result, the results' names or ids and counts) */
function requestText (request: SentRequest): string {
  const actionOf = (action: SentAction): string => {
    const legacy = 'legacy_type_id' in action ? `/${action.legacy_type_id}` : ''
    const created = action.result_slot_id === undefined ? '' : ` ${action.result_slot_id}`
    const results = action.result_items === undefined ? '' : ` ${action.result_items.map(resultText).join(' ')}`
    const slots = [action.source, action.destination].filter(slot => slot !== undefined).map(slotName).join(' → ')
    return `${String(action.type_id)}${legacy}${created}${results}${action.count === undefined ? '' : ` ${action.count}`}${slots === '' ? '' : ` ${slots}`}`
  }
  return `${request.request_id} ${request.actions.map(actionOf).join(', ')}`
}

async function joined (version: BedrockVersion, screenAnimations = true): Promise<Education> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { screenAnimations, loadInternalPlugins: false, plugins: { education: true } })
  const { bot, server, driver } = testBot
  const world = new ServerWorld(server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  let [requestsSeen, packetsSeen] = [0, server.batches.flat().length]
  const described = (): string[] => {
    const sent = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    const fresh = sent.slice(requestsSeen)
    requestsSeen = sent.length
    return fresh.map(requestText)
  }
  const sentSince = (...names: string[]): string[] => {
    const all = server.batches.flat()
    const fresh = all.slice(packetsSeen)
    packetsSeen = all.length
    return fresh.filter(({ name }) => names.includes(name)).map(({ name, params }) => `${name} ${server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')}`)
  }
  const open = async (window: number, type: Screen): Promise<Window> => {
    server.send('container_open', { window_id: window, window_type: type, coordinates: AT, runtime_entity_id: -1n })
    await driver.tick()
    const shown = bot.currentWindow
    assert.ok(shown !== null)
    return shown
  }
  const closed = (window: number): void => {
    server.send('container_close', atLeast(version, 'bedrock_1.21.0') ? { window_id: window, window_type: 'none', server: false } : { window_id: window, server: false })
  }
  const close = async (window: Window, answer = (): void => {}): Promise<{ frames: number, outcome: string }> => {
    const before = server.sentOf('container_close').length
    let outcome = 'pending'
    bot.closeWindow(window).then(() => { outcome = 'resolved' }, (error: Error) => { outcome = error.message })
    let frames = 0
    for (; frames < 30 && server.sentOf('container_close').length === before; frames++) await driver.frame(31.25)
    answer()
    closed(window.id)
    await driver.tick()
    return { frames, outcome }
  }
  const idOf = (name: string): number => bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(server), idOf, described, sentSince, open, close, closed }
}

/** crafting_data with these material reducer recipes alone, from 1.17.30 (the protocol data's first with them) */
function sendReductions (server: FakeBedrockClient, version: BedrockVersion, reducers: ReadonlyArray<{ mix: number, items: ReadonlyArray<{ network_id: number, count: number }> }>, clear = true): void {
  const lists = atLeast(version, 'bedrock_1.26.40')
    ? { shaped_recipes: [], shapeless_recipes: [], multi_recipes: [], shulker_box_recipes: [], shapeless_chemistry_recipes: [], shaped_chemistry_recipes: [], smithing_transform_recipes: [], smithing_trim_recipes: [] }
    : { recipes: [] }
  const cleared = atLeast(version, 'bedrock_1.17.30') ? { material_reducers: reducers.map(({ mix, items }) => ({ mix, items: [...items] })), clear_recipes: clear } : { is_clean: clear }
  server.send('crafting_data', { ...lists, potion_type_recipes: [], potion_container_recipes: [], ...cleared })
}

/** a recorded build's ids and packets, as the client sent them */
interface Recorded {
  /** each request's id */
  ids: {
    placeHydrogen: number
    placeOxygen: number
    compound: number
    placeCompound: number
    reduce: number
    placeStone: number
    reducerClose: number
    placeTable: number
    combine: number
  }
  told: Readonly<Record<string, string>>
}

const RECORDED: ReadonlyMap<BedrockVersion, Recorded> = new Map([
  ['bedrock_1.26.20', {
    ids: { placeHydrogen: -55, placeOxygen: -59, compound: -61, placeCompound: -63, reduce: -71, placeStone: -73, reducerClose: -75, placeTable: -85, combine: -95 },
    told: {
      placeHydrogen: '9301016d0101023b0000042300120000ffffffff',
      placeOxygen: '930101750101013b0000082300130000ffffffff',
      compound: '9301017903121301fa0940001a000a000000000000000000000100403c0032793b00000000ffffffff',
      placeCompound: '9301017d0101403b00000a1c00030000ffffffff',
      compoundClose: '9301028101010102230012040c00000000ffffffff8501010101230013080c00010000ffffffff',
      reduce: '9301018d010912130331210000f1d4eab9030a00000000000000000000254000008682bfd6080a00000000000000000000250300008682bfd6080a0000000000000000000001060000213c00328d0127002900060100403c00328d0127002a00060200033c00328d0127002b0001013b00000e2600080000ffffffff',
      placeStone: '93010191010101033b00000e1c00030000ffffffff',
      reducerClose: '93010495010104212700291000ffffffff990101044027002a1200ffffffff9d0101040327002b1400ffffffffa101010101260008160c00030e00ffffffff',
      mismatch: '1e000100',
      placeTable: '930101a9010101013b00001a2800000000ffffffff',
      combine: '930101bd01040904012800001a04022800011e04012800022200ffffffff'
    }
  }],
  ['bedrock_1.26.51', {
    ids: { placeHydrogen: -5, placeOxygen: -9, compound: -11, placeCompound: -13, reduce: -21, placeStone: -23, reducerClose: -25, placeTable: -35, combine: -45 },
    told: {
      placeHydrogen: '93010109010101023b0000020000002300120000000000ffffffff',
      placeOxygen: '93010111010101013b0000040000002300130000000000ffffffff',
      compound: '930101150310121113010101126d696e6563726166743a636f6d706f756e64344000000a00000000000000000000010000403c0032f5ffffff3b00000000000000ffffffff',
      placeCompound: '93010119010101403b0000050000001c00030000000000ffffffff',
      compoundClose: '9301021d01010102230012020000000c00000000000000ffffffff2101010101230013040000000c00010000000000ffffffff',
      reduce: '930101290910121113030101146d696e6563726166743a656c656d656e745f3134002100c7d58aa30e0a000000000000000000000101136d696e6563726166743a656c656d656e745f3800400083c19fab040a000000000000000000000101136d696e6563726166743a656c656d656e745f3800030083c19fab040a00000000000000000000010606000000213c0032ebffffff270029000000000606010000403c0032ebffffff27002a000000000606020000033c0032ebffffff27002b000000000101013b0000070000002600080000000000ffffffff',
      placeStone: '9301012d010101033b0000070000001c00030000000000ffffffff',
      reducerClose: '93010431010404212700290800000000ffffffff350104044027002a0900000000ffffffff390104040327002b0a00000000ffffffff3d010101012600080b0000000c00030700000000ffffffff',
      mismatch: '1e00000100',
      placeTable: '93010145010101013b00000d0000002800000000000000ffffffff',
      combine: '930101590407090404012800000d0000000404022800010f0000000404012800021100000000ffffffff'
    }
  }],
  ['bedrock_1.26.60', {
    ids: { placeHydrogen: -53, placeOxygen: -57, compound: -59, placeCompound: -61, reduce: -69, placeStone: -71, reducerClose: -73, placeTable: -83, combine: -93 },
    told: {
      placeHydrogen: '93010169010101023b0000020000002300120000000000ffffffff',
      placeOxygen: '93010171010101013b0000040000002300130000000000ffffffff',
      compound: '930101750311131214010101126d696e6563726166743a636f6d706f756e64344000000a00000000000000000000010000403c0032c5ffffff3b00000000000000ffffffff',
      placeCompound: '93010179010101403b0000050000001c00030000000000ffffffff',
      compoundClose: '9301027d01010102230012020000000c00000000000000ffffffff810101010101230013040000000c00010000000000ffffffff',
      reduce: '93010189010911131214030101146d696e6563726166743a656c656d656e745f3134002100c7d58aa30e0a000000000000000000000101136d696e6563726166743a656c656d656e745f3800400083c19fab040a000000000000000000000101136d696e6563726166743a656c656d656e745f3800030083c19fab040a00000000000000000000010606000000213c0032bbffffff270029000000000606010000403c0032bbffffff27002a000000000606020000033c0032bbffffff27002b000000000101013b0000070000002600080000000000ffffffff',
      placeStone: '9301018d01010101033b0000070000001c00030000000000ffffffff',
      reducerClose: '9301049101010404212700290800000000ffffffff95010104044027002a0900000000ffffffff99010104040327002b0a00000000ffffffff9d01010101012600080b0000000c00030700000000ffffffff',
      mismatch: '1e00000100',
      placeTable: '930101a501010101013b00000d0000002800000000000000ffffffff',
      combine: '930101b9010407090404012800000d0000000404022800010f0000000404012800021100000000ffffffff'
    }
  }]
])

/** the ids of a version not recorded: 1.26.60's */
function recordedOf (version: BedrockVersion): Recorded {
  const recorded = RECORDED.get(version) ?? RECORDED.get('bedrock_1.26.60')
  assert.ok(recorded !== undefined)
  return recorded
}

/** the frames, at 32 a second, a close's request left in to its container_close: the crafting table's animation (390 ms) from 1.21.120 */
function closeFrames (version: BedrockVersion, animated: boolean): number {
  return animated && atLeast(version, 'bedrock_1.21.120') ? 15 : 1
}

/** the version's legacy type id after a slash, from 1.26.40: 1.26.60 counts one more from non_implemented on */
function legacyOf (version: BedrockVersion): (type: number) => string {
  if (!atLeast(version, 'bedrock_1.26.40')) return () => ''
  return type => `/${type >= 18 && atLeast(version, 'bedrock_1.26.60') ? type + 1 : type}`
}

/** a result as described: by name from 1.26.40, else by network id */
function resultOf (version: BedrockVersion, name: string, networkId: number, metadata: number, count: number): string {
  return `${atLeast(version, 'bedrock_1.26.40') ? `minecraft:${name}` : networkId}:${metadata}x${count}`
}

describe('bedrock education screens', () => {
  describe('the screens shown with their slots as requests name them, their close giving back the cursor\'s item, then the compound creator\'s inputs', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}`, async () => {
        const education = await joined(version, false)
        const { bot, internal, server, driver, inventory, idOf, described, open, close } = education
        const layouts: unknown[] = []
        for (const [id, type] of [[2, 'compound_creator'], [3, 'element_constructor'], [4, 'material_reducer'], [5, 'lab_table']] as const) {
          const window = await open(id, type)
          layouts.push([window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot])
          inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: id })
          await driver.tick()
          await close(window)
        }
        const window = await open(2, 'compound_creator')
        inventory.slot('ui', 0, { id: idOf('element_1'), count: 1, stackId: 10 })
        inventory.slot('ui', 19, { id: idOf('element_8'), count: 2, stackId: 11 })
        inventory.slot('ui', 26, { id: idOf('element_6'), count: 3, stackId: 12 })
        await driver.tick()
        const shown = window.slots.slice(0, window.inventoryStart).map(item => item === null ? null : `${item.name} ${item.count}`)
        internal._core.requestIds.continueProcess(-11)
        await close(window)
        const place = legacyOf(version)(1)
        assert.deepStrictEqual([layouts, shown, described(), server.sentOf('container_close').map(({ window_id: id }) => id)], [[
          ['minecraft:compound_creator', 'Compound Creator', 46, 10, 9],
          ['minecraft:element_constructor', 'Element Constructor', 37, 1, 0],
          ['minecraft:material_reducer', 'Material Reducer', 46, 10, -1],
          ['minecraft:lab_table', 'Lab Table', 45, 9, -1]
        ], [null, 'element_8 2', null, null, null, null, null, null, 'element_6 3', null], [
          // unanswered, each dirt onto the one before, named by its request
          ...[2, 3, 4, 5].map((id, index) => `${-3 - 2 * index} place${place} 1 cursor:0#${id} → hotbar_and_inventory:0#${index === 0 ? 0 : -1 - 2 * index}`),
          `-11 place${place} 1 cursor:0#10 → hotbar_and_inventory:1#0`,
          `-13 place${place} 2 compcreate_input:19#11 → hotbar_and_inventory:2#0`,
          `-15 place${place} 3 compcreate_input:26#12 → hotbar_and_inventory:3#0`
        ], [2, 3, 4, 5, 2]])
        assert.deepStrictEqual(education.errors, [])
        bot.end()
      })
    }
  })

  describe('the vanilla client\'s compound: hydrogen and oxygen placed from the cursor in the creator\'s first inputs, water (compound 26) made by createCompound as its output\'s click, a stack to the cursor, placed in hotbar slot 3, the inputs given back at the close', () => {
    const groups: ReadonlyArray<readonly [BedrockVersion, BedrockVersion, string]> = [
      ['bedrock_1.16.201', 'bedrock_1.26.30', 'the result by network id (1.16.201 – 1.26.30, recorded on 1.26.20)'],
      ['bedrock_1.26.40', 'bedrock_1.26.60', 'the result by name, each action\'s legacy type (1.26.40 – 1.26.60, recorded on 1.26.51 and 1.26.60)']
    ]
    for (const [from, to, title] of groups) {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: ${title}`, async () => {
          const recording = RECORDED.get(version)
          const { ids } = recordedOf(version)
          const education = await joined(version, version !== 'bedrock_1.26.20')
          const { bot, internal, driver, inventory, idOf, described, sentSince, open, close } = education
          const legacy = legacyOf(version)
          const window = await open(2, 'compound_creator')
          const told: string[] = []
          const placed = async (id: number, element: Given, slot: number, responded: RespondedSlot[]): Promise<void> => {
            inventory.slot('ui', 0, element)
            await driver.tick()
            internal._core.requestIds.continueProcess(id)
            const clicked = bot.clickWindow(slot, 0, 0)
            await driver.tick()
            told.push(...sentSince('item_stack_request'))
            inventory.respond(id, responded)
            await driver.tick()
            await clicked
          }
          sentSince('item_stack_request')
          await placed(ids.placeHydrogen, { id: idOf('element_1'), count: 2, stackId: 2 }, 0, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'compcreate_input', slot: 18, count: 2, stackId: 2 }])
          await placed(ids.placeOxygen, { id: idOf('element_8'), count: 1, stackId: 4 }, 1, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'compcreate_input', slot: 19, count: 1, stackId: 4 }])
          internal._core.requestIds.continueProcess(ids.compound)
          const made = bot.bedrock.createCompound(26)
          await driver.tick()
          await driver.tick()
          told.push(...sentSince('item_stack_request'))
          inventory.respond(ids.compound, [{ container: 'cursor', slot: 0, count: 64, stackId: 5 }])
          await driver.tick()
          await made
          const cursor = [window.selectedItem?.name, window.selectedItem?.metadata, window.selectedItem?.count, window.slots[0]?.count, window.slots[1]?.count]
          const clicked = bot.clickWindow(HOTBAR_3(10), 0, 0)
          await driver.tick()
          told.push(...sentSince('item_stack_request'))
          inventory.respond(ids.placeCompound, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 3, count: 64, stackId: 5 }])
          await driver.tick()
          await clicked
          const closed = await close(window, () => {
            inventory.respond(ids.placeCompound - 2, [{ container: 'compcreate_input', slot: 18, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 2, stackId: 2 }])
            inventory.respond(ids.placeCompound - 4, [{ container: 'compcreate_input', slot: 19, count: 0 }, { container: 'hotbar_and_inventory', slot: 1, count: 1, stackId: 4 }])
          })
          told.push(...sentSince('item_stack_request', 'container_close'))
          if (recording !== undefined) {
            assert.deepStrictEqual(told, [
              ...['placeHydrogen', 'placeOxygen', 'compound', 'placeCompound', 'compoundClose'].map(name => `item_stack_request ${recording.told[name]}`),
              'container_close 2f02f700'
            ])
          }
          assert.deepStrictEqual([closed, described(), cursor, education.errors], [{ frames: closeFrames(version, version !== 'bedrock_1.26.20'), outcome: 'resolved' }, [
            `${ids.placeHydrogen} place${legacy(1)} 2 cursor:0#2 → compcreate_input:18#0`,
            `${ids.placeOxygen} place${legacy(1)} 1 cursor:0#4 → compcreate_input:19#0`,
            `${ids.compound} non_implemented${legacy(18)}, results_deprecated${legacy(19)} ${resultOf(version, 'compound', idOf('compound'), 26, 64)}, take${legacy(0)} 64 creative_output:50#${ids.compound} → cursor:0#0`,
            `${ids.placeCompound} place${legacy(1)} 64 cursor:0#5 → hotbar:3#0`,
            `${ids.placeCompound - 2} place${legacy(1)} 2 compcreate_input:18#2 → hotbar_and_inventory:0#0`,
            `${ids.placeCompound - 4} place${legacy(1)} 1 compcreate_input:19#4 → hotbar_and_inventory:1#0`
          ], ['compound', 26, 64, 2, 1], []])
          bot.end()
        })
      }
    }
  })

  describe('the vanilla client\'s reduction: stone placed from the cursor in the reducer\'s input, one of it reduced in the click\'s request to the stacks of crafting_data\'s recipe, the rest placed in hotbar slot 3; the close destroys the outputs, gives the stone back and tells an inventory mismatch', () => {
    const groups: ReadonlyArray<readonly [BedrockVersion, BedrockVersion, string]> = [
      ['bedrock_1.16.201', 'bedrock_1.17.10', 'no reduction: the protocol data\'s crafting_data has no material reducer recipe (1.16.201 – 1.17.10, not recorded)'],
      ['bedrock_1.17.30', 'bedrock_1.26.30', 'the results by network id (1.17.30 – 1.26.30, recorded on 1.26.20)'],
      ['bedrock_1.26.40', 'bedrock_1.26.60', 'the results by name, each action\'s legacy type (1.26.40 – 1.26.60, recorded on 1.26.51 and 1.26.60)']
    ]
    for (const [from, to, title] of groups) {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: ${title}`, async () => {
          const recording = RECORDED.get(version)
          const { ids } = recordedOf(version)
          const animated = version !== 'bedrock_1.26.20'
          const education = await joined(version, animated)
          const { bot, internal, server, driver, inventory, idOf, described, sentSince, open, close } = education
          const legacy = legacyOf(version)
          const reduces = atLeast(version, 'bedrock_1.17.30')
          sendReductions(server, version, [{ mix: STONE_MIX, items: STONE_REDUCED }])
          const window = await open(4, 'material_reducer')
          inventory.slot('ui', 0, { id: idOf('stone'), count: 4, stackId: 7 })
          await driver.tick()
          internal._core.requestIds.continueProcess(ids.reduce)
          sentSince('item_stack_request')
          const reduced = bot.clickWindow(0, 0, 0)
          await driver.tick()
          const told = sentSince('item_stack_request')
          if (reduces) {
            inventory.respond(ids.reduce, [
              { container: 'matreduce_output', slot: 41, count: 33, stackId: 8 },
              { container: 'matreduce_output', slot: 42, count: 64, stackId: 9 },
              { container: 'matreduce_output', slot: 43, count: 3, stackId: 10 },
              { container: 'cursor', slot: 0, count: 3, stackId: 7 },
              { container: 'matreduce_input', slot: 8, count: 1, stackId: 11 }
            ])
          }
          await driver.tick()
          await reduced
          const shown = window.slots.slice(0, 4).map(item => item === null ? null : `${item.name} ${item.count}`)
          const transaction = !atLeast(version, 'bedrock_1.16.210')
            ? { legacy_request_id: 0, transaction_type: 'inventory_mismatch', network_ids: false, inventory_actions: [] }
            : { legacy: { legacy_request_id: 0 }, transaction_type: 'inventory_mismatch', actions: atLeast(version, 'bedrock_1.16.220') ? [] : { network_ids: false, actions: [] } }
          const close_ = ids.reducerClose
          if (!reduces) {
            // an output's item of the server's: the close destroys it, then gives back the cursor's stone
            inventory.slot('ui', 41, { id: idOf('element_14'), count: 2, stackId: 20 })
            await driver.tick()
            internal._core.requestIds.continueProcess(close_)
            const closing = await close(window, () => {
              inventory.respond(close_, [{ container: 'matreduce_output', slot: 41, count: 0 }])
              inventory.respond(close_ - 2, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 4, stackId: 7 }])
            })
            assert.deepStrictEqual([told, shown, described(), server.sentOf('inventory_transaction'), closing, education.errors], [[], [null, null, null, null], [
              `${close_} destroy 2 matreduce_output:41#20`,
              `${close_ - 2} place 4 cursor:0#7 → hotbar_and_inventory:0#0`
            ], [{ transaction }], { frames: 1, outcome: 'resolved' }, []])
            bot.end()
            return
          }
          // the outputs take nothing: the vanilla client sends nothing for a click with the cursor's stone (recorded)
          const ignored = bot.clickWindow(1, 0, 0)
          await driver.tick()
          await ignored
          const clicked = bot.clickWindow(HOTBAR_3(10), 0, 0)
          await driver.tick()
          told.push(...sentSince('item_stack_request'))
          inventory.respond(ids.placeStone, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 3, count: 3, stackId: 7 }])
          await driver.tick()
          await clicked
          internal._core.requestIds.continueProcess(close_)
          const closed = await close(window, () => {
            for (const [index, slot] of [41, 42, 43].entries()) inventory.respond(close_ - 2 * index, [{ container: 'matreduce_output', slot, count: 0 }])
            inventory.respond(close_ - 6, [{ container: 'matreduce_input', slot: 8, count: 0 }, { container: 'hotbar_and_inventory', slot: 3, count: 4, stackId: 7 }])
          })
          const closing = sentSince('item_stack_request', 'container_close', 'inventory_transaction')
          const mismatch = server.sentOf('inventory_transaction')
          if (recording !== undefined) {
            const sent = [`item_stack_request ${String(recording.told['reducerClose'])}`, `inventory_transaction ${String(recording.told['mismatch'])}`, 'container_close 2f04f700']
            assert.deepStrictEqual([...told, ...closing], [
              `item_stack_request ${String(recording.told['reduce'])}`,
              `item_stack_request ${String(recording.told['placeStone'])}`,
              // the 1.26.20 client, without the animation, closed in the frame of its requests, telling the mismatch in the next tick
              ...animated ? sent : [sent[0], sent[2], sent[1]]
            ])
          }
          assert.deepStrictEqual([closed, described(), shown, mismatch, education.errors], [{ frames: closeFrames(version, animated), outcome: 'resolved' }, [
            `${ids.reduce} non_implemented${legacy(18)}, results_deprecated${legacy(19)} ${resultOf(version, 'element_14', -25, 0, 33)} ${resultOf(version, 'element_8', -19, 0, 64)} ${resultOf(version, 'element_8', -19, 0, 3)}, ` +
              `create${legacy(6)} 0, take${legacy(0)} 33 creative_output:50#${ids.reduce} → matreduce_output:41#0, create${legacy(6)} 1, take${legacy(0)} 64 creative_output:50#${ids.reduce} → matreduce_output:42#0, ` +
              `create${legacy(6)} 2, take${legacy(0)} 3 creative_output:50#${ids.reduce} → matreduce_output:43#0, place${legacy(1)} 1 cursor:0#7 → matreduce_input:8#0`,
            `${ids.placeStone} place${legacy(1)} 3 cursor:0#7 → hotbar:3#0`,
            `${close_} destroy${legacy(4)} 33 matreduce_output:41#8`,
            `${close_ - 2} destroy${legacy(4)} 64 matreduce_output:42#9`,
            `${close_ - 4} destroy${legacy(4)} 3 matreduce_output:43#10`,
            `${close_ - 6} place${legacy(1)} 1 matreduce_input:8#11 → hotbar_and_inventory:3#7`
          ], ['stone 1', 'element_14 33', 'element_8 64', 'element_8 3'], [{ transaction }], []])
          bot.end()
        })
      }
    }
  })

  describe('the vanilla client\'s combine: three elements placed from the cursor in the lab table\'s first slots, then combineLabTable as its button: the combine destroys them, and the screen closes', () => {
    const groups: ReadonlyArray<readonly [BedrockVersion, BedrockVersion, string]> = [
      ['bedrock_1.16.201', 'bedrock_1.26.30', 'no legacy types (1.16.201 – 1.26.30, recorded on 1.26.20)'],
      ['bedrock_1.26.40', 'bedrock_1.26.60', 'each action\'s legacy type (1.26.40 – 1.26.60, recorded on 1.26.51 and 1.26.60)']
    ]
    for (const [from, to, title] of groups) {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: ${title}`, async () => {
          const recording = RECORDED.get(version)
          const { ids } = recordedOf(version)
          const education = await joined(version)
          const { bot, internal, server, driver, inventory, idOf, described, sentSince, open, closed } = education
          const legacy = legacyOf(version)
          const window = await open(5, 'lab_table')
          inventory.content(5, Array.from({ length: 9 }, () => null))
          inventory.slot('ui', 0, { id: idOf('element_11'), count: 1, stackId: 13 })
          await driver.tick()
          internal._core.requestIds.continueProcess(ids.placeTable)
          sentSince('item_stack_request')
          const placed = bot.clickWindow(0, 0, 0)
          await driver.tick()
          const told = sentSince('item_stack_request')
          inventory.slot(5, 0, { id: idOf('element_11'), count: 1, stackId: 13 })
          inventory.respond(ids.placeTable, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'labtable_input', slot: 0, count: 1, stackId: 13 }])
          await driver.tick()
          await placed
          inventory.slot(5, 1, { id: idOf('element_1'), count: 2, stackId: 15 })
          inventory.slot(5, 2, { id: idOf('element_8'), count: 1, stackId: 17 })
          await driver.tick()
          internal._core.requestIds.continueProcess(ids.combine)
          let outcome = 'pending'
          const combined = bot.bedrock.combineLabTable().then(() => { outcome = 'resolved' })
          await driver.tick()
          told.push(...sentSince('item_stack_request'))
          inventory.respond(ids.combine, [0, 1, 2].map(slot => ({ container: 'labtable_input', slot, count: 0 })))
          let frames = 0
          for (; frames < 30 && server.sentOf('container_close').length === 0; frames++) await driver.frame(31.25)
          told.push(...sentSince('item_stack_request', 'container_close'))
          const answered = outcome
          closed(5)
          await driver.tick()
          await combined
          if (recording !== undefined) {
            assert.deepStrictEqual(told, [`item_stack_request ${String(recording.told['placeTable'])}`, `item_stack_request ${String(recording.told['combine'])}`, 'container_close 2f05f700'])
          }
          assert.deepStrictEqual([frames, described(), answered, outcome, bot.currentWindow, window.slots.slice(0, 3), education.errors], [closeFrames(version, true), [
            `${ids.placeTable} place${legacy(1)} 1 cursor:0#13 → labtable_input:0#0`,
            `${ids.combine} lab_table_combine${legacy(9)}, destroy${legacy(4)} 1 labtable_input:0#13, destroy${legacy(4)} 2 labtable_input:1#15, destroy${legacy(4)} 1 labtable_input:2#17`
          ], 'pending', 'resolved', null, [null, null, null], []])
          bot.end()
        })
      }
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** the outcome of a promise after a tick: resolved, its error, or pending */
    async function outcomeOf ({ driver }: Education, promise: Promise<unknown>): Promise<string> {
      let outcome = 'pending'
      promise.then(() => { outcome = 'resolved' }, (error: Error) => { outcome = error.message })
      await driver.tick()
      await driver.tick()
      return outcome
    }

    it('the element constructor: its output\'s click sends nothing, as the vanilla client\'s with no element chosen (recorded); its close gives back only the cursor\'s item, after the crafting table\'s animation', async () => {
      const education = await joined(version)
      const { bot, inventory, idOf, driver, described, open, close } = education
      const window = await open(3, 'element_constructor')
      const clicked = await outcomeOf(education, bot.clickWindow(0, 0, 0))
      inventory.slot('ui', 0, { id: idOf('element_1'), count: 1, stackId: 10 })
      await driver.tick()
      const closed = await close(window, () => { inventory.respond(-3, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: 10 }]) })
      assert.deepStrictEqual([clicked, described(), closed, education.errors], ['resolved', ['-3 place/1 1 cursor:0#10 → hotbar_and_inventory:0#0'], { frames: closeFrames(version, true), outcome: 'resolved' }, []])
      bot.end()
    })

    it('createCompound rejects, sending nothing, a metadata not a whole number from 0, without a compound creator open, over another screen, and with an item on the cursor', async () => {
      const education = await joined(version)
      const { bot, inventory, idOf, driver, described, open } = education
      const outcomes = [
        await outcomeOf(education, bot.bedrock.createCompound(-1)),
        await outcomeOf(education, bot.bedrock.createCompound(2.5)),
        await outcomeOf(education, bot.bedrock.createCompound(0)),
        await outcomeOf(education, bot.bedrock.createCompound(26))
      ]
      await open(3, 'element_constructor')
      outcomes.push(await outcomeOf(education, bot.bedrock.createCompound(26)))
      await open(2, 'compound_creator')
      inventory.slot('ui', 0, { id: idOf('element_1'), count: 1, stackId: 10 })
      await driver.tick()
      outcomes.push(await outcomeOf(education, bot.bedrock.createCompound(26)))
      assert.deepStrictEqual([outcomes, described(), education.errors], [[
        'createCompound: -1 is not a compound\'s metadata',
        'createCompound: 2.5 is not a compound\'s metadata',
        'createCompound needs an open compound creator',
        'createCompound needs an open compound creator',
        'createCompound needs an open compound creator',
        'createCompound needs an empty cursor'
      ], [], []])
      bot.end()
    })

    it('combineLabTable rejects, sending nothing, without a lab table open, over another screen, and with its slots empty; a refusal rejects it', async () => {
      const education = await joined(version)
      const { bot, inventory, idOf, driver, described, open } = education
      const outcomes = [await outcomeOf(education, bot.bedrock.combineLabTable())]
      await open(2, 'compound_creator')
      outcomes.push(await outcomeOf(education, bot.bedrock.combineLabTable()))
      await open(5, 'lab_table')
      outcomes.push(await outcomeOf(education, bot.bedrock.combineLabTable()))
      inventory.slot(5, 4, { id: idOf('element_1'), count: 2, stackId: 10 })
      await driver.tick()
      const refused = bot.bedrock.combineLabTable()
      refused.catch(() => {})
      await driver.tick()
      inventory.respond(-3, [], 2)
      outcomes.push(await outcomeOf(education, refused))
      assert.deepStrictEqual([outcomes, described(), education.errors], [[
        'combineLabTable needs an open lab table',
        'combineLabTable needs an open lab table',
        'combineLabTable needs items in the lab table',
        'the server refused item stack request -3: InvalidRequestActionType'
      ], ['-3 lab_table_combine/9, destroy/4 2 labtable_input:4#10'], []])
      bot.end()
    })

    /** an item by name, as a test gives it */
    interface Named {
      name: string
      count: number
      stackId: number
      metadata?: number
    }

    type Reducers = Parameters<typeof sendReductions>[2]

    /** the reducer open with the cursor's and the `ui` slots' items, crafting_data's other recipes sent before stone's */
    async function reducerWith (cursor: Named | null, slots: ReadonlyArray<readonly [number, Named]>, others: (idOf: (name: string) => number) => Reducers = () => []): Promise<Education> {
      const education = await joined(version)
      const { server, inventory, driver, idOf, open } = education
      const given = ({ name, count, stackId, metadata }: Named): Given => ({ id: idOf(name), count, stackId, ...metadata === undefined ? {} : { metadata } })
      sendReductions(server, version, [...others(idOf), { mix: STONE_MIX, items: STONE_REDUCED }])
      await open(4, 'material_reducer')
      inventory.slot('ui', 0, cursor === null ? null : given(cursor))
      for (const [slot, named] of slots) inventory.slot('ui', slot, given(named))
      await driver.tick()
      return education
    }

    it('reduces nothing, for a click putting an item in the input, where the input holds one, an output holds one, no recipe takes the item (the recipes cleared too), or a recipe makes more stacks than the nine outputs (none recorded)', async () => {
      const stones: Named = { name: 'stone', count: 2, stackId: 10 }
      const cases: Array<() => Promise<Education>> = [
        // the cursor's stone onto the input's: the input takes one item
        async () => await reducerWith(stones, [[8, { name: 'stone', count: 1, stackId: 11 }]]),
        // the cursor's stone swapped with the input's dirt
        async () => await reducerWith(stones, [[8, { name: 'dirt', count: 1, stackId: 11 }]]),
        async () => await reducerWith(stones, [[45, { name: 'element_8', count: 1, stackId: 11 }]]),
        async () => await reducerWith({ name: 'dirt', count: 2, stackId: 10 }, []),
        async () => await reducerWith({ name: 'dirt', count: 2, stackId: 10 }, [], idOf => [{ mix: (idOf('dirt') << 16) | 32767, items: Array.from({ length: 10 }, () => ({ network_id: -12, count: 1 })) }]),
        // after a crafting_data clearing the recipes
        async () => {
          const education = await reducerWith(stones, [])
          sendReductions(education.server, version, [])
          await education.driver.tick()
          return education
        }
      ]
      const sent: string[][] = []
      for (const make of cases) {
        const education = await make()
        sent.push([await outcomeOf(education, education.bot.clickWindow(0, 0, 0)), ...education.described(), ...education.errors])
        education.bot.end()
      }
      assert.deepStrictEqual(sent, cases.map(() => ['resolved']))
    })

    it('takes the input\'s item or an output\'s to the empty cursor as any slot\'s; reduces by the first recipe of the item and its metadata, those of a crafting_data keeping the recipes after the others; a hotbar key\'s place reduces too (none recorded)', async () => {
      const potion = (idOf: (name: string) => number, metadata: number): number => (idOf('potion') << 16) | metadata
      const education = await reducerWith(null, [[8, { name: 'stone', count: 1, stackId: 11 }], [42, { name: 'element_8', count: 5, stackId: 12 }]], idOf => [
        { mix: potion(idOf, 5), items: [{ network_id: -12, count: 1 }] },
        { mix: potion(idOf, 14), items: [{ network_id: idOf('element_6'), count: 2 }] }
      ])
      const { bot, server, inventory, idOf, driver, described } = education
      const outcomes = [await outcomeOf(education, bot.clickWindow(0, 0, 0))]
      inventory.respond(-3, [{ container: 'matreduce_input', slot: 8, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 11 }])
      inventory.slot('ui', 0, null)
      await driver.tick()
      outcomes.push(await outcomeOf(education, bot.clickWindow(2, 0, 0)))
      inventory.respond(-5, [{ container: 'matreduce_output', slot: 42, count: 0 }, { container: 'cursor', slot: 0, count: 5, stackId: 12 }])
      inventory.slot('ui', 0, null)
      inventory.slot('inventory', 4, { id: idOf('potion'), count: 1, metadata: 14, stackId: 13 })
      // a recipe of any potion, after those kept
      sendReductions(server, version, [{ mix: potion(idOf, 32767), items: [{ network_id: -19, count: 1 }] }], false)
      await driver.tick()
      outcomes.push(await outcomeOf(education, bot.clickWindow(0, 4, 2)))
      assert.deepStrictEqual([outcomes, server.sentOf('inventory_transaction'), described(), education.errors], [['pending', 'pending', 'pending'], [], [
        '-3 take/0 1 matreduce_input:8#11 → cursor:0#0',
        '-5 take/0 5 matreduce_output:42#12 → cursor:0#0',
        '-7 non_implemented/19, results_deprecated/20 minecraft:element_6:0x2, create/6 0, take/0 2 creative_output:50#-7 → matreduce_output:41#0, place/1 1 hotbar:4#13 → matreduce_input:8#0'
      ], []])
      bot.end()
    })
  })
})
