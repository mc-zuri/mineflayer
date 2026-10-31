import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { RespondedSlot } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The recorded values are the vanilla client's against Bedrock Dedicated Server.

const LOOM_AT = Object.freeze({ x: 2, y: -60, z: 0 })
const WHITE = 15

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

interface Loom extends TestBot {
  errors: string[]
  inventory: ServerInventory
  idOf: (name: string) => number
}

async function joined (version: BedrockVersion): Promise<Loom> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), idOf }
}

function openLoom (server: FakeBedrockClient, windowId = 2): void {
  server.send('container_open', { window_id: windowId, window_type: 'loom', coordinates: LOOM_AT, runtime_entity_id: -1n })
}

/** from 1.20.61 the server gives a banner Type 0, as recorded */
function bannerNbt (version: BedrockVersion): { ints?: Record<string, number> } {
  return atLeast(version, 'bedrock_1.20.61') ? { ints: { Type: 0 } } : {}
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

/** a tag's value, its compounds' and lists' too */
function plain (tag: Tags[TagType]): string | number | object {
  if (tag.type === 'list') return (tag.value.value as Array<Tags['compound']['value']>).map(value => plain({ type: 'compound', value }))
  if (tag.type !== 'compound') return tag.value as string | number
  return Object.fromEntries(Object.entries(tag.value).flatMap(([name, value]) => value === undefined ? [] : [[name, plain(value)]]))
}

/** each request the bot sent since the last call: its id, its actions (a legacy type id after a slash), a loom's pattern and times, a result's item, count, data and NBT */
function requestsSince ({ server, bot }: Pick<TestBot, 'server' | 'bot'>): () => string[] {
  const resultOf = (item: ResultItem): string => {
    const [count, metadata] = 'auxiliary_value' in item && item.auxiliary_value !== undefined ? [item.auxiliary_value & 0xff, item.auxiliary_value >> 8] : [Number(item.count), Number(item.metadata)]
    const name = 'network_id' in item ? bot.registry.items[Number(item.network_id)]?.name : item.name?.replace('minecraft:', '')
    const nbt = ('extra' in item ? item.extra?.nbt : 'nbt' in item ? item.nbt : undefined)?.nbt
    return `${name} ${count}:${metadata}${nbt === undefined ? '' : ` ${JSON.stringify(plain(nbt))}`}`
  }
  const actionOf = (action: SentAction): string => {
    const legacy = 'legacy_type_id' in action ? `/${action.legacy_type_id}` : ''
    const pattern = !('pattern' in action) || action.pattern === undefined ? '' : ` ${action.pattern}${action.times_crafted === undefined ? '' : ` ×${action.times_crafted}`}`
    const results = (action.result_items ?? []).map(item => ` ${resultOf(item)}`).join('')
    const slots = [action.source, action.destination].filter(slot => slot !== undefined).map(slotName).join(' → ')
    return `${String(action.type_id)}${legacy}${pattern}${results}${action.count === undefined ? '' : ` ${action.count}`}${slots === '' ? '' : ` ${slots}`}`
  }
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => `${id} ${actions.map(actionOf).join(', ')}`)
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

/** the select runs in the next input pass */
async function selected ({ bot, driver }: Pick<TestBot, 'bot' | 'driver'>, pattern: string): Promise<void> {
  const select = bot.bedrock.selectLoomPattern(pattern)
  select.catch(() => {})
  await driver.tick()
  await select
}

function countAndId (item: { count: number, stackId: number | null } | null | undefined): [number, number | null] | null {
  return item === null || item === undefined ? null : [item.count, item.stackId]
}

/** recorded in reduced_loom: a white banner and a red dye put in, the first pattern (bo) selected, a left click on the result */
interface RecordedPattern {
  from: BedrockVersion
  to: BedrockVersion
  recordedOn: BedrockVersion
  banner: number
  dye: number
  request: number
  made: number
  described: string
  told: string
}

const BO = '{"Patterns":[{"Color":1,"Pattern":"bo"}]}'
const BO_TYPED = '{"Patterns":[{"Color":1,"Pattern":"bo"}],"Type":0}'

const PATTERNS: readonly RecordedPattern[] = [
  {
    // recorded on 1.16.201.2: the request names no pattern; the result an aux item
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    recordedOn: 'bedrock_1.16.201',
    banner: 641,
    dye: 643,
    request: -945,
    made: 644,
    described: `-945 non_implemented, results_deprecated banner 1:15 ${BO}, consume 1 loom_input:9#641, consume 1 loom_dye:10#643, take 1 creative_output:50#-945 → cursor:0#0`,
    told: '930101e10e050d0e01da08823cffff010a0009085061747465726e730a020305436f6c6f720208075061747465726e02626f000000000105012809820a0501290a860a00013b32e10e3a000000'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.30',
    recordedOn: 'bedrock_1.16.220',
    banner: 522,
    dye: 524,
    request: -773,
    made: 525,
    described: `-773 non_implemented, results_deprecated banner 1:15 ${BO}, consume 1 loom_input:9#522, consume 1 loom_dye:10#524, take 1 creative_output:50#-773 → cursor:0#0`,
    told: '930101890c050e0f01da0801000f003affff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f00000000000000000000010501280994080501290a980800013b32890c3a000000'
  },
  {
    // recorded on 1.17.40.6: craft_loom_request names the pattern
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.20.50',
    recordedOn: 'bedrock_1.17.40',
    banner: 586,
    dye: 588,
    request: -855,
    made: 589,
    described: `-855 craft_loom_request bo, results_deprecated banner 1:15 ${BO}, consume 1 loom_input:9#586, consume 1 loom_dye:10#588, take 1 creative_output:50#-855 → cursor:0#0`,
    told: '930101ad0d050f02626f1101ee0801000f003affff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f00000000000000000000010501280994090501290a980900013b32ad0d3a000000'
  },
  {
    // recorded on 1.20.60.4: the banner given with Type 0, kept after the Patterns
    from: 'bedrock_1.20.61',
    to: 'bedrock_1.21.2',
    recordedOn: 'bedrock_1.20.61',
    banner: 2839,
    dye: 2841,
    request: -3727,
    made: 2842,
    described: `-3727 craft_loom_request bo, results_deprecated banner 1:15 ${BO_TYPED}, consume 1 loom_input:9#2839, consume 1 loom_dye:10#2841, take 1 creative_output:50#-3727 → cursor:0#0`,
    told: '9301019d3a051102626f1301800901000f0045ffff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f0003040054797065000000000000000000000000000105012909ae2c05012a0ab22c00013c329d3a3b000000ffffffff'
  },
  {
    // recorded on 1.21.20.3: the times crafted
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.26.30',
    recordedOn: 'bedrock_1.21.20',
    banner: 2141,
    dye: 2143,
    request: -2295,
    made: 2144,
    described: `-2295 craft_loom_request bo ×1, results_deprecated banner 1:15 ${BO_TYPED}, consume 1 loom_input:9#2141, consume 1 loom_dye:10#2143, take 1 creative_output:50#-2295 → cursor:0#0`,
    told: '930101ed23051102626f011301900901000f0045ffff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f000304005479706500000000000000000000000000010501290000000009ba2105012a000000000abe2100013c0000000032ed233b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.51.1: each action's legacy type, the result named
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    recordedOn: 'bedrock_1.26.51',
    banner: 2156,
    dye: 2158,
    request: -2293,
    made: 2159,
    described: `-2293 craft_loom_request/17 bo ×1, results_deprecated/19 banner 1:15 ${BO_TYPED}, consume/5 1 loom_input:9#2156, consume/5 1 loom_dye:10#2158, take/0 1 creative_output:50#-2293 → cursor:0#0`,
    told: '930101e923050f1102626f011113010101106d696e6563726166743a62616e6e65721e01000045ffff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f000304005479706500000000000000000000000000010505012900096c0800000505012a000a6e0800000000013c00320bf7ffff3b00000000000000ffffffff'
  },
  {
    // recorded on 1.26.60.5: the results' legacy type after 1.26.60's craft_reserved, the loom's before it
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    recordedOn: 'bedrock_1.26.60',
    banner: 2288,
    dye: 2290,
    request: -2459,
    made: 2291,
    described: `-2459 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:15 ${BO_TYPED}, consume/5 1 loom_input:9#2288, consume/5 1 loom_dye:10#2290, take/0 1 creative_output:50#-2459 → cursor:0#0`,
    told: '930101b526050f1102626f011214010101106d696e6563726166743a62616e6e65721e01000045ffff010a00000908005061747465726e730a01000000030500436f6c6f72010000000807005061747465726e0200626f00030400547970650000000000000000000000000001050501290009f00800000505012a000af20800000000013c003265f6ffff3b00000000000000ffffffff'
  }
]

describe('bedrock loom', () => {
  for (const recorded of PATTERNS) {
    describe(`the vanilla client patterning a banner, the result taken to the cursor (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: a white banner, red dye, the first pattern`, async () => {
          const loom = await joined(version)
          const { bot, internal, server, driver, errors, inventory, idOf } = loom
          openLoom(server)
          inventory.slot('ui', 9, { id: idOf('banner'), count: 1, metadata: WHITE, stackId: recorded.banner, ...bannerNbt(version) })
          inventory.slot('ui', 10, { id: idOf('red_dye'), count: 1, stackId: recorded.dye })
          await driver.tick()
          internal._core.requestIds.continueProcess(recorded.request)
          const [described, told] = [requestsSince(loom), toldSince(server)]
          const window = bot.currentWindow
          assert.ok(window !== null)
          await selected(loom, 'bo')
          const clicked = bot.clickWindow(window.craftingResultSlot, 0, 0)
          await driver.tick()
          assert.deepStrictEqual(described(), [recorded.described])
          if (version === recorded.recordedOn) assert.deepStrictEqual(told(), [recorded.told])
          inventory.respond(recorded.request, [{ container: 'loom_input', slot: 9, count: 0 }, { container: 'loom_dye', slot: 10, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: recorded.made }])
          await driver.tick()
          await clicked
          assert.deepStrictEqual([window.slots.slice(0, 3), window.selectedItem?.name, window.selectedItem?.metadata, countAndId(window.selectedItem), errors], [
            [null, null, null], 'banner', WHITE, [1, recorded.made], []
          ])
          bot.end()
        })
      }
    })
  }

  describe('up to 1.16.210 an aux item: a banner\'s own tags after the Patterns too (not recorded: its banners had none)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: a banner of Type 1`, async () => {
        const loom = await joined(version)
        const { bot, server, driver, inventory, idOf } = loom
        openLoom(server)
        inventory.slot('ui', 9, { id: idOf('banner'), count: 1, metadata: WHITE, stackId: 11, ints: { Type: 1 } })
        inventory.slot('ui', 10, { id: idOf('red_dye'), count: 1, stackId: 12 })
        await driver.tick()
        await selected(loom, 'bo')
        const described = requestsSince(loom)
        bot.clickWindow(3, 0, 0).catch(() => {})
        await driver.tick()
        assert.deepStrictEqual(described().map(request => request.split(', ').slice(0, 2).join(', ')), [
          '-3 non_implemented, results_deprecated banner 1:15 {"Patterns":[{"Color":1,"Pattern":"bo"}],"Type":1}'
        ])
        bot.end()
      })
    }
  })

  describe('the window: Java\'s loom (the banner, the dye, the pattern item, the result); the close gives back the cursor\'s item, then the banner\'s, the pattern item\'s and the dye\'s, up to 1.21.111 with the close, from 1.21.120 after the crafting table\'s animation', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.111', 'bedrock_1.21.120')) {
      // recorded in containers_loom on 1.26.51.1: place(loom_input:9), place(loom_material:11), place(loom_dye:10), then container_close
      it(`bedrock ${version}: every slot's items given back`, async () => {
        const loom = await joined(version)
        const { bot, internal, server, driver, inventory, idOf } = loom
        openLoom(server)
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 10 })
        inventory.slot('ui', 9, { id: idOf('banner'), count: 1, metadata: WHITE, stackId: 11 })
        inventory.slot('ui', 10, { id: idOf('red_dye'), count: 2, stackId: 12 })
        inventory.slot('ui', 11, { id: idOf('creeper_banner_pattern'), count: 1, stackId: 13 })
        await driver.tick()
        internal._core.requestIds.continueProcess(-3)
        const described = requestsSince(loom)
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
        assert.deepStrictEqual([layout, slots, described(), atOnce, frames], [['minecraft:loom', 'Loom', 40, 4, 3], ['banner', 'red_dye', 'creeper_banner_pattern', null], [
          '-3 place 1 cursor:0#10 → hotbar_and_inventory:0#0',
          '-5 place 1 loom_input:9#11 → hotbar_and_inventory:1#0',
          '-7 place 1 loom_material:11#13 → hotbar_and_inventory:2#0',
          '-9 place 2 loom_dye:10#12 → hotbar_and_inventory:3#0'
        ], atLeast(version, 'bedrock_1.21.120') ? 0 : 1, atLeast(version, 'bedrock_1.21.120') ? 14 : 0])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** the loom open, its slots holding the banner and the dye given, the pattern selected */
    async function loomWith (banner: string | null, dye: string | null, pattern: string | null = 'bo'): Promise<Loom & { described: () => string[] }> {
      const loom = await joined(version)
      const { server, driver, inventory, idOf } = loom
      openLoom(server)
      if (banner !== null) inventory.slot('ui', 9, { id: idOf(banner), count: 2, metadata: WHITE, stackId: 11, ...bannerNbt(version) })
      if (dye !== null) inventory.slot('ui', 10, { id: idOf(dye), count: 1, stackId: 12 })
      await driver.tick()
      if (pattern !== null) await selected(loom, pattern)
      return { ...loom, described: requestsSince(loom) }
    }

    /** the click's outcome after a tick: resolved, its error, or pending */
    async function clicked ({ bot, driver }: Loom, mouseButton = 0, mode = 0): Promise<string> {
      let outcome = 'pending'
      bot.clickWindow(3, mouseButton, mode).then(() => { outcome = 'resolved' }, (error: Error) => { outcome = error.message })
      await driver.tick()
      return outcome
    }

    it('sends nothing without a pattern selected, a banner, or a dye: another item in their slots, a dye of no _dye item', async () => {
      const cases: Array<[string | null, string | null, string | null]> = [
        ['banner', 'red_dye', null], [null, 'red_dye', 'bo'], ['banner', null, 'bo'], ['white_wool', 'red_dye', 'bo'], ['banner', 'dirt', 'bo'], ['banner', 'bone_meal', 'bo'], ['banner', 'white_wool', 'bo']
      ]
      const sent: Array<[string, string[], string[]]> = []
      for (const [banner, dye, pattern] of cases) {
        const loom = await loomWith(banner, dye, pattern)
        sent.push([await clicked(loom), loom.described(), loom.errors])
        loom.bot.end()
      }
      assert.deepStrictEqual(sent, cases.map(() => ['resolved', [], []]))
    })

    it('makes a pattern of the dye\'s color, Bedrock\'s index (red 1 recorded): black 0, light blue 12, white 15; any of the 32 patterns', async () => {
      const sent: string[][] = []
      for (const [dye, pattern] of [['black_dye', 'tts'], ['light_blue_dye', 'cr'], ['white_dye', 'gru']]) {
        const loom = await loomWith('banner', dye ?? '', pattern)
        await clicked(loom)
        sent.push(loom.described().map(request => request.split(', ').slice(0, 2).join(', ')))
        loom.bot.end()
      }
      assert.deepStrictEqual(sent, [
        ['-3 craft_loom_request/17 tts ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":0,"Pattern":"tts"}],"Type":0}'],
        ['-3 craft_loom_request/17 cr ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":12,"Pattern":"cr"}],"Type":0}'],
        ['-3 craft_loom_request/17 gru ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":15,"Pattern":"gru"}],"Type":0}']
      ])
    })

    it('keeps the selection after a craft (not recorded), the pattern added after the banner\'s own; a loom opened again has none', async () => {
      const loom = await loomWith('banner', 'red_dye')
      const { bot, server, driver, inventory, idOf, described } = loom
      await clicked(loom)
      inventory.respond(-3, [{ container: 'loom_input', slot: 9, count: 1 }, { container: 'loom_dye', slot: 10, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 13 }])
      await driver.tick()
      inventory.slot('ui', 9, null)
      inventory.slot('ui', 10, { id: idOf('black_dye'), count: 1, stackId: 14 })
      await driver.tick()
      // the patterned banner back from the cursor
      bot.clickWindow(0, 0, 0).catch(() => {})
      await driver.tick()
      inventory.respond(-5, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_input', slot: 9, count: 1, stackId: 13 }])
      await driver.tick()
      await clicked(loom)
      const crafted = described()
      inventory.respond(-7, [{ container: 'loom_input', slot: 9, count: 0 }, { container: 'loom_dye', slot: 10, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 15 }])
      openLoom(server, 3)
      await driver.tick()
      inventory.slot('ui', 0, null)
      inventory.slot('ui', 9, { id: idOf('banner'), count: 1, metadata: WHITE, stackId: 16 })
      inventory.slot('ui', 10, { id: idOf('red_dye'), count: 1, stackId: 17 })
      await driver.tick()
      await clicked(loom)
      assert.deepStrictEqual([crafted.map(request => request.split(', ').slice(0, 2).join(', ')), described()], [[
        '-3 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":1,"Pattern":"bo"}],"Type":0}',
        '-5 place/1 1 cursor:0#13 → loom_input:9#0',
        '-7 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":1,"Pattern":"bo"},{"Color":0,"Pattern":"bo"}],"Type":0}'
      ], []])
      bot.end()
    })

    it('takes the result to a hotbar key\'s slot, or shift clicks it to the inventory, onto a banner of its patterns (neither recorded); sends nothing while the slot holds an item or the inventory is full', async () => {
      const loom = await loomWith('banner', 'red_dye')
      const { inventory, idOf, described, driver } = loom
      inventory.slot('inventory', 0, { id: idOf('dirt'), count: 1, stackId: 20 })
      inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 21 })
      await driver.tick()
      const outcomes = [await clicked(loom, 0, 2), await clicked(loom, 0, 0)]
      const blocked = described()
      await clicked(loom, 4, 2)
      inventory.respond(-3, [{ container: 'hotbar', slot: 4, count: 1, stackId: 13 }])
      inventory.slot('ui', 10, { id: idOf('red_dye'), count: 1, stackId: 12 })
      await driver.tick()
      await clicked(loom, 0, 1)
      const moved = described()
      inventory.respond(-5, [{ container: 'hotbar_and_inventory', slot: 1, count: 1, stackId: 14 }])
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 30 + slot })))
      inventory.slot('ui', 10, { id: idOf('red_dye'), count: 1, stackId: 12 })
      await driver.tick()
      await clicked(loom, 0, 1)
      const consumed = 'consume/5 1 loom_input:9#11, consume/5 1 loom_dye:10#12'
      assert.deepStrictEqual([outcomes, blocked, moved, described()], [['resolved', 'resolved'], [], [
        `-3 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:15 ${BO_TYPED}, ${consumed}, take/0 1 creative_output:50#-3 → hotbar:4#0`,
        `-5 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:15 ${BO_TYPED}, ${consumed}, place/1 1 creative_output:50#-5 → hotbar_and_inventory:4#13`
      ], []])
      loom.bot.end()
    })

    it('selectLoomPattern rejects without a loom open, for a pattern of a banner pattern item (not recorded), and for one not the loom\'s, sending nothing', async () => {
      const loom = await joined(version)
      const { bot, server, driver } = loom
      const messages: string[] = []
      const rejected = async (pattern: string): Promise<void> => {
        await selected(loom, pattern).then(() => { messages.push('selected') }, (error: Error) => { messages.push(error.message) })
      }
      await rejected('bo')
      openLoom(server)
      await driver.tick()
      for (const pattern of ['cre', 'gus', 'zz', 'tts']) await rejected(pattern)
      assert.deepStrictEqual([messages, server.sentOf('item_stack_request')], [[
        'selectLoomPattern needs an open loom',
        'selectLoomPattern: the cre pattern needs a banner pattern item, which the bot does not support',
        'selectLoomPattern: the gus pattern needs a banner pattern item, which the bot does not support',
        'selectLoomPattern: zz is not a loom pattern',
        'selected'
      ], []])
      bot.end()
    })

    describe('applyBannerPattern', () => {
      function loomBlock (bot: TestBot['bot']): Block {
        const state = bot.registry.blocksByName['loom']?.defaultState ?? 0
        const block = prismarineBlock(bot.registry).fromStateId(state, 0)
        block.position = new Vec3(LOOM_AT.x, LOOM_AT.y, LOOM_AT.z)
        return block
      }

      /** steps ticks, answering each request with the slots given for it, in order */
      async function answered ({ server, driver, inventory }: Loom, answers: ReadonlyArray<readonly RespondedSlot[]>, done: () => boolean): Promise<void> {
        let seen = server.sentOf('item_stack_request').length
        const left = [...answers]
        for (let ticks = 0; ticks < 40 && !done(); ticks++) {
          await driver.tick()
          const fresh = server.sentOf('item_stack_request').slice(seen).flatMap(({ requests }) => requests)
          seen += server.sentOf('item_stack_request').slice(seen).length
          for (const { request_id: id } of fresh) inventory.respond(id, left.shift() ?? [])
        }
      }

      function itemOf (bot: TestBot['bot'], name: string): Item {
        const item = bot.inventory.items().find(item => item.name === name)
        assert.ok(item !== undefined, `no ${name}`)
        return item
      }

      /** a black banner first, then two white ones and the dyes */
      async function stocked (): Promise<Loom> {
        const loom = await joined(version)
        const { inventory, idOf, driver } = loom
        inventory.slot('inventory', 0, { id: idOf('banner'), count: 1, metadata: 0, stackId: 1, ...bannerNbt(version) })
        inventory.slot('inventory', 1, { id: idOf('banner'), count: 2, metadata: WHITE, stackId: 2, ...bannerNbt(version) })
        inventory.slot('inventory', 2, { id: idOf('red_dye'), count: 1, stackId: 3 })
        inventory.slot('inventory', 3, { id: idOf('dirt'), count: 1, stackId: 4 })
        await driver.tick()
        return loom
      }

      it('opens the loom given, puts the banner and the dye in as clicks do, shift clicks the result to the inventory, and closes it', async () => {
        const loom = await stocked()
        const { bot, internal, server } = loom
        const opened: Block[] = []
        internal.openBlock = async block => {
          opened.push(block)
          openLoom(server)
          await bot.waitForTicks(1)
          return bot.currentWindow ?? bot.inventory
        }
        const described = requestsSince(loom)
        const block = loomBlock(bot)
        const white = bot.inventory.slots[37]
        assert.ok(white !== null && white !== undefined)
        const done = bot.bedrock.applyBannerPattern('mc', itemOf(bot, 'red_dye'), white, block)
        await answered(loom, [
          [{ container: 'hotbar', slot: 1, count: 0 }, { container: 'cursor', slot: 0, count: 2, stackId: 2 }],
          [{ container: 'cursor', slot: 0, count: 1, stackId: 2 }, { container: 'loom_input', slot: 9, count: 1, stackId: 5 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar', slot: 1, count: 1, stackId: 2 }],
          [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_dye', slot: 10, count: 1, stackId: 3 }],
          [{ container: 'loom_input', slot: 9, count: 0 }, { container: 'loom_dye', slot: 10, count: 0 }, { container: 'hotbar_and_inventory', slot: 2, count: 1, stackId: 6 }]
        ], () => server.sentOf('container_close').length > 0)
        server.send('container_close', { window_id: 2, window_type: 'none', server: false })
        await loom.driver.tick()
        await done
        assert.deepStrictEqual([opened, described(), bot.inventory.slots[38]?.name, server.sentOf('container_close').length], [[block], [
          '-3 take/0 2 hotbar:1#2 → cursor:0#0',
          '-5 place/1 1 cursor:0#2 → loom_input:9#0',
          '-7 place/1 1 cursor:0#2 → hotbar:1#0',
          '-9 take/0 1 hotbar:2#3 → cursor:0#0',
          '-11 place/1 1 cursor:0#3 → loom_dye:10#0',
          '-13 craft_loom_request/17 mc ×1, results_deprecated/20 banner 1:15 {"Patterns":[{"Color":1,"Pattern":"mc"}],"Type":0}, consume/5 1 loom_input:9#5, consume/5 1 loom_dye:10#3, place/1 1 creative_output:50#-13 → hotbar_and_inventory:2#0'
        ], 'banner', 1])
        bot.end()
      })

      it('patterns the inventory\'s first banner at the loom open, as Java\'s null banner and loom', async () => {
        const loom = await stocked()
        const { bot, server, driver } = loom
        openLoom(server)
        await driver.tick()
        const described = requestsSince(loom)
        let finished = false
        const done = bot.bedrock.applyBannerPattern('bo', itemOf(bot, 'red_dye'), null, null).finally(() => { finished = true })
        await answered(loom, [
          [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 1 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_input', slot: 9, count: 1, stackId: 1 }],
          [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 3 }],
          [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_dye', slot: 10, count: 1, stackId: 3 }],
          [{ container: 'loom_input', slot: 9, count: 0 }, { container: 'loom_dye', slot: 10, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: 6 }]
        ], () => finished)
        await done
        assert.deepStrictEqual([described().map(request => request.split(', ', 2).join(', ')), bot.currentWindow?.type, server.sentOf('container_close')], [[
          '-3 take/0 1 hotbar:0#1 → cursor:0#0',
          '-5 place/1 1 cursor:0#1 → loom_input:9#0',
          '-7 take/0 1 hotbar:2#3 → cursor:0#0',
          '-9 place/1 1 cursor:0#3 → loom_dye:10#0',
          '-11 craft_loom_request/17 bo ×1, results_deprecated/20 banner 1:0 {"Patterns":[{"Color":1,"Pattern":"bo"}],"Type":0}'
        ], 'minecraft:loom', []])
        bot.end()
      })

      it('rejects, sending nothing: a pattern it does not support, an item the inventory has not, a banner or a dye that is none, the cursor holding an item, the loom\'s slots holding items, no loom', async () => {
        const loom = await stocked()
        const { bot, server, driver, inventory, idOf } = loom
        const [red, dirt] = [itemOf(bot, 'red_dye'), itemOf(bot, 'dirt')]
        const messages: string[] = []
        const rejected = async (applied: Promise<void>): Promise<void> => {
          await applied.then(() => { messages.push('applied') }, (error: Error) => { messages.push(error.message) })
        }
        await rejected(bot.bedrock.applyBannerPattern('flo', red))
        await rejected(bot.bedrock.applyBannerPattern('zz', red))
        await rejected(bot.bedrock.applyBannerPattern('bo', dirt, dirt))
        await rejected(bot.bedrock.applyBannerPattern('bo', dirt))
        await rejected(bot.bedrock.applyBannerPattern('bo', red))
        openLoom(server)
        inventory.slot('ui', 11, { id: idOf('creeper_banner_pattern'), count: 1, stackId: 7 })
        await driver.tick()
        await rejected(bot.bedrock.applyBannerPattern('bo', red))
        inventory.slot('ui', 11, null)
        inventory.slot('ui', 0, { id: idOf('dirt'), count: 1, stackId: 8 })
        await driver.tick()
        await rejected(bot.bedrock.applyBannerPattern('bo', red))
        inventory.slot('inventory', 2, null)
        await driver.tick()
        await rejected(bot.bedrock.applyBannerPattern('bo', red))
        inventory.slot('inventory', 0, null)
        inventory.slot('inventory', 1, null)
        await driver.tick()
        await rejected(bot.bedrock.applyBannerPattern('bo', red))
        assert.deepStrictEqual([messages, server.sentOf('item_stack_request')], [[
          'applyBannerPattern: the flo pattern needs a banner pattern item, which the bot does not support',
          'applyBannerPattern: zz is not a loom pattern',
          'applyBannerPattern: dirt is not a banner',
          'applyBannerPattern: dirt is not a dye',
          'applyBannerPattern needs an open loom, or one to open',
          'applyBannerPattern needs the loom\'s slots empty',
          'applyBannerPattern needs an empty cursor',
          'the inventory has no red_dye',
          'the inventory has no banner'
        ], []])
        bot.end()
      })

      it('rejects, closing the loom it opened, when a click fails, and when the inventory has no room for the result', async () => {
        const [messages, closes]: [string[], number[]] = [[], []]
        for (const fails of [true, false]) {
          const loom = await stocked()
          const { bot, internal, server, inventory, idOf } = loom
          internal.openBlock = async () => {
            openLoom(server)
            await bot.waitForTicks(1)
            return bot.currentWindow ?? bot.inventory
          }
          let finished = false
          const done = bot.bedrock.applyBannerPattern('bo', itemOf(bot, 'red_dye'), null, loomBlock(bot)).finally(() => { finished = true })
          done.catch(() => {})
          if (fails) {
            await loom.driver.runUntil(() => server.sentOf('item_stack_request').length === 1, 40)
            inventory.respond(-3, [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 1 }])
            await loom.driver.runUntil(() => server.sentOf('item_stack_request').length === 2, 40)
            inventory.respond(-5, [], 2)
          } else {
            await answered(loom, [
              [{ container: 'hotbar', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 1 }],
              [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_input', slot: 9, count: 1, stackId: 1 }],
              [{ container: 'hotbar', slot: 2, count: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 3 }],
              [{ container: 'cursor', slot: 0, count: 0 }, { container: 'loom_dye', slot: 10, count: 1, stackId: 3 }]
            ], () => server.sentOf('item_stack_request').length === 4)
            inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('dirt'), count: 64, stackId: 30 + slot })))
          }
          await answered(loom, [], () => server.sentOf('container_close').length > 0)
          server.send('container_close', { window_id: 2, window_type: 'none', server: false })
          await answered(loom, [], () => finished)
          messages.push(await done.then(() => 'applied', (error: Error) => error.message))
          closes.push(server.sentOf('container_close').length)
          bot.end()
        }
        assert.deepStrictEqual([messages, closes], [['the server refused item stack request -5: InvalidRequestActionType', 'the inventory has no room for the patterned banner'], [1, 1]])
      })
    })
  })
})
