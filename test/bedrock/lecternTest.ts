import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockLectern, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Rotation } from './common/world.ts'

// The lectern as the vanilla client used it in protocol_blocks_ui against Bedrock Dedicated Server (1.26.20.4, 1.26.51.1,
// 1.26.60.5): a book and quill put on it by a use, its book screen opened, the close. The bot loads the windows plugin
// and the lectern's only (and simple_inventory, which equips the book to put on).

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

// recorded at y -60 of a flat world: the x and z, at a height every version's world has
const LECTERN_AT: At = Object.freeze({ x: 2, y: 12, z: 0 })
// other lecterns' block entities, each at no block the bot uses, beside it on one axis
const OTHERS_AT: readonly At[] = Object.freeze([{ x: -2, y: 12, z: 0 }, { x: 2, y: 13, z: 0 }, { x: 2, y: 12, z: 1 }])
// as recorded on every build
const WINDOW_ID = 3
// the client's frame: 32 a second, 16 on 1.26.60
const FRAME_MS = (version: BedrockVersion): number => isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** the book and quill put on it, as block_entity_data told it on 1.26.51.1 */
const RECORDED_BOOK: Compound = Object.freeze({
  Count: byte(1), Damage: { type: 'short', value: 0 }, Name: string('minecraft:writable_book'), WasPickedUp: byte(0)
})

/** the lectern's block entity: `book` held, at `page` of `totalPages` (the book and quill's: page 0 of 0) */
function lecternEntity ({ x, y, z }: At, book?: Compound, page = 0, totalPages = 0): Compound {
  const held: Compound = book === undefined ? {} : { book: { type: 'compound', value: book }, hasBook: byte(1), page: int(page), totalPages: int(totalPages) }
  return { BlockEntityVersion: int(0), ...held, id: string('Lectern'), x: int(x), y: int(y), z: int(z) }
}

interface LecternBot extends TestBot {
  errors: string[]
  /** block_entity_data at the block, as servers send it */
  tell: (value: Compound, at?: At) => void
  /** openBlock of the block, whose screen the server opens once the bot used it */
  open: (id?: number) => Promise<BedrockLectern>
  /** closeWindow, with the frames, at the client's rate, until the window closed (20 at most) */
  close: (window: Window) => Promise<number>
}

/** joined beside a lectern, with the windows plugin and the lectern's */
async function lecternBot (version: BedrockVersion): Promise<LecternBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { windows: true, lectern: true } })
  const { bot, server, driver } = testBot
  const blocks = [[LECTERN_AT.x, LECTERN_AT.y, LECTERN_AT.z, 'lectern']] as const
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const blockOf = ({ x, y, z }: At): Block => {
    const block = bot.blockAt(new Vec3(x, y, z))
    assert.ok(block !== null)
    return block
  }
  const tell = (value: Compound, { x, y, z }: At = LECTERN_AT): void => { server.send('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) }
  const open = async (id = WINDOW_ID): Promise<BedrockLectern> => {
    let opened: Window | undefined
    const opening = bot.openBlock(blockOf(LECTERN_AT)).then(window => { opened = window })
    await driver.ticks(4)
    server.send('container_open', { window_id: id, window_type: 'lectern', coordinates: LECTERN_AT, runtime_entity_id: -1n })
    await driver.runUntil(() => opened !== undefined, 10)
    await opening
    assert.ok(opened !== undefined)
    // the window openBlock resolves with for a lectern
    return opened as BedrockLectern
  }
  const close = async (window: Window): Promise<number> => {
    const closing = bot.closeWindow(window)
    let frames = 0
    while (bot.currentWindow === window && frames < 20) {
      frames++
      await driver.frame(FRAME_MS(version))
    }
    await closing
    return frames
  }
  return { ...testBot, errors, tell, open, close }
}

/** the lectern_update the client's close sends: drop_book up to 1.20.61 */
interface Recorded {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  update: object
}

const RECORDED: readonly Recorded[] = [
  { name: 'drop_book false', from: 'bedrock_1.16.201', to: 'bedrock_1.20.61', update: { page: 0, page_count: 0, position: LECTERN_AT, drop_book: false } },
  // recorded on 1.26.20.4, 1.26.51.1 and 1.26.60.5
  { name: 'no drop_book', from: 'bedrock_1.20.71', to: latestSupportedBedrockVersion, update: { page: 0, page_count: 0, position: LECTERN_AT } }
]

describe('bedrock lectern', () => {
  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: shows the book the block entity holds, takes no click, and closes with the page alone in the next frame`, async () => {
          const { bot, server, driver, errors, tell, open, close } = await lecternBot(version)
          tell(lecternEntity(LECTERN_AT, RECORDED_BOOK))
          const opened: Window[] = []
          const closed: Window[] = []
          bot.on('windowOpen', window => { opened.push(window) })
          bot.on('windowClose', window => { closed.push(window) })
          const lectern = await open()
          assert.deepStrictEqual([opened, lectern.id, lectern.type, lectern.title, lectern.slots.length, lectern.inventoryStart, lectern.craftingResultSlot],
            [[lectern], WINDOW_ID, 'minecraft:lectern', 'Lectern', 36, 0, -1])
          assert.deepStrictEqual([lectern.book?.name, lectern.book?.count, lectern.book?.metadata, lectern.book?.nbt, lectern.page, lectern.totalPages], ['writable_book', 1, 0, null, 0, 0])
          const clicked = assert.rejects(bot.clickWindow(0, 0, 0), { message: 'clickWindow: the lectern window takes no clicks on Bedrock, whose book screen shows no slot' })
          await driver.tick()
          await clicked
          const frames = await close(lectern)
          assert.deepStrictEqual([frames, server.sentOf('lectern_update'), server.sentOf('container_close'), server.sentOf('item_stack_request'), closed, bot.currentWindow, errors],
            [1, [recorded.update], [], [], [lectern], null, []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('closes a lectern the server told no book of, as the scripted server\'s of containers_lectern, sending nothing', async () => {
      const { bot, server, errors, tell, open, close } = await lecternBot(version)
      // as containers_lectern's scripted server told it
      tell({ id: string('Lectern'), x: int(LECTERN_AT.x), y: int(LECTERN_AT.y), z: int(LECTERN_AT.z), isMovable: byte(1) })
      const lectern = await open()
      assert.deepStrictEqual([lectern.book, lectern.page, lectern.totalPages], [null, 0, 0])
      assert.deepStrictEqual([await close(lectern), server.sentOf('lectern_update'), server.sentOf('container_close'), bot.currentWindow, errors], [1, [], [], null, []])
      bot.end()
    })

    it('reads the block entity told last at its position, while open too: the page, the book\'s tag, a book of no item, another block entity there', async () => {
      const { bot, server, driver, errors, tell, open, close } = await lecternBot(version)
      const untold = await open(2)
      assert.deepStrictEqual([untold.book, untold.page, untold.totalPages], [null, 0, 0])
      await close(untold)
      const tag: Compound = { pages: { type: 'list', value: { type: 'compound', value: [{ text: string('one') }, { text: string('two') }] } } }
      tell(lecternEntity(LECTERN_AT, { ...RECORDED_BOOK, Name: string('minecraft:written_book'), Damage: { type: 'short', value: 2 }, tag: { type: 'compound', value: tag } }, 1, 2))
      // other lecterns'
      for (const at of OTHERS_AT) tell(lecternEntity(at, RECORDED_BOOK, 5, 9), at)
      const lectern = await open()
      assert.deepStrictEqual([lectern.book?.name, lectern.book?.metadata, lectern.book?.nbt, lectern.page, lectern.totalPages], ['written_book', 2, { type: 'compound', name: '', value: tag }, 1, 2])
      tell(lecternEntity(LECTERN_AT, { ...RECORDED_BOOK, Name: string('minecraft:no_such_book') }, 1, 2))
      await driver.tick()
      assert.deepStrictEqual([lectern.book, lectern.page], [null, 1])
      tell({ ...lecternEntity(LECTERN_AT, { ...RECORDED_BOOK, Name: byte(1) }), page: string('1') })
      await driver.tick()
      assert.deepStrictEqual([lectern.book, lectern.page], [null, 0])
      tell(lecternEntity(LECTERN_AT, RECORDED_BOOK, 1, 2))
      await driver.tick()
      assert.strictEqual(lectern.book?.name, 'writable_book')
      await close(lectern)
      // a block entity of another kind there forgets the lectern
      tell({ id: string('Chest'), x: int(LECTERN_AT.x), y: int(LECTERN_AT.y), z: int(LECTERN_AT.z) })
      const replaced = await open(4)
      assert.deepStrictEqual([replaced.book, replaced.page, replaced.totalPages], [null, 0, 0])
      await close(replaced)
      assert.deepStrictEqual([server.sentOf('lectern_update'), errors], [[{ page: 1, page_count: 2, position: LECTERN_AT }], []])
      bot.end()
    })

    it('rejects turning the page and taking the book, which no recording does, sending nothing', async () => {
      const { bot, server, errors, tell, open } = await lecternBot(version)
      tell(lecternEntity(LECTERN_AT, RECORDED_BOOK))
      const lectern = await open()
      await assert.rejects(lectern.setPage(1), { message: 'setPage is not supported on Bedrock: no recording turns a lectern\'s page' })
      await assert.rejects(lectern.takeBook(), { message: 'takeBook is not supported on Bedrock: no recording takes a lectern\'s book' })
      assert.deepStrictEqual([server.sentOf('lectern_update'), bot.currentWindow, errors], [[], lectern, []])
      bot.end()
    })
  })
})

// ---- a book put on by a use

/** the recorded client's camera, standing at (0.5, y, 0.5) before the lectern at (2, y, 0) */
const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const PUT_TICKS = 100

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name, and no section request */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

interface PuttingBot extends TestBot {
  errors: string[]
  inventory: ServerInventory
  lectern: Block
  /** block_entity_data at the lectern */
  tell: (value: Compound) => void
  /** the item's network id */
  idOf: (name: string) => number
}

/** joined looking at a lectern as the recorded client did (at y -60; 4 where the overworld starts at 0), which the server told holds no book */
async function puttingBot (version: BedrockVersion): Promise<PuttingBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { windows: true, lectern: true, simple_inventory: true } })
  const { bot, server } = testBot
  const y = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks: [[2, y, 0, 'lectern'], [0, y - 1, 0, 'stone']] })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y, z: 0.5 }, rotation: CAMERA, game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const at: At = { x: 2, y, z: 0 }
  const lectern = bot.blockAt(new Vec3(at.x, at.y, at.z))
  assert.ok(lectern !== null)
  const tell = (value: Compound): void => { server.send('block_entity_data', { position: at, nbt: { type: 'compound', name: '', value } }) }
  // as recorded once the lectern was set
  tell(lecternEntity(at))
  const idOf = (name: string): number => {
    const item = bot.registry.itemsByName[name]
    assert.ok(item !== undefined)
    return item.id
  }
  return { ...testBot, errors, inventory: new ServerInventory(server), lectern, tell, idOf }
}

/** the actions of each use's transaction, as the version writes them (without the fields an item read from the server leaves undefined) */
function actionsOf (server: FakeBedrockClient): unknown[] {
  const actions = server.sentOf('inventory_transaction').map(({ transaction }) => 'inventory_actions' in transaction ? transaction.inventory_actions : transaction.actions)
  return JSON.parse(JSON.stringify(actions)) as unknown[]
}

/** the actions of a transaction that changes no slot: 1.16.210 says whether they name items by network id */
function noActions (version: BedrockVersion): object {
  return isBedrockVersionAtLeast(version, 'bedrock_1.16.210') && !isBedrockVersionAtLeast(version, 'bedrock_1.16.220') ? { network_ids: false, actions: [] } : []
}

/** a slot of the inventory emptied of a book without NBT, as an ItemV4 from 1.26.60 */
function emptied (slot: number, networkId: number): object {
  const none = { network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 }
  return { source_type: 'container', window_id: 0, slot, old_item: { ...none, network_id: networkId, count: 1, extra: { has_nbt: 0, can_place_on: [], can_destroy: [] } }, new_item: none }
}

interface RecordedPut {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  /** the use's transaction names the book's slot emptied, and the hand is told empty in the use's tick */
  predicts: boolean
  /** by build, as recorded: the use's batch, then the use's end's, the server having sent the slot emptied */
  recorded: Readonly<Partial<Record<BedrockVersion, readonly [use: readonly string[], end: readonly string[]]>>>
}

const START = '24013804770004770008'
const STOP = '24013a04770000000000'
const SWING = '2c0101000000000108696e746572616374'
const EMPTY_HAND = ['21040000', '1f010000000000000000000000']

const PUTS: readonly RecordedPut[] = [
  {
    // recorded on 1.26.20.4 and 1.26.51.1 (the book and quill 550 and 521); before, a lectern's book is not recorded
    name: 'no slot named, the hand told once the server sent the slot emptied',
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.26.51',
    predicts: false,
    recorded: {
      'bedrock_1.26.20': [
        [START, SWING, '1e00020000010477000800cc0801000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff8cac0bf0c0100', 'player_auth_input'],
        [STOP, ...EMPTY_HAND, 'player_auth_input']
      ],
      'bedrock_1.26.51': [
        [START, SWING, '1e000002000001047700040000090201000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff8cac0bf0c0100', 'player_auth_input'],
        [STOP, ...EMPTY_HAND, 'player_auth_input']
      ]
    }
  },
  {
    // recorded on 1.26.60.5
    name: 'the book\'s slot named emptied, the hand told empty in the use\'s tick',
    from: 'bedrock_1.26.60',
    to: latestSupportedBedrockVersion,
    predicts: true,
    recorded: {
      'bedrock_1.26.60': [
        [
          START,
          `${SWING}00`,
          '1e000002010001000000090201000000000a0000000000000000000000000000000000000001047700040000090201000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff8cac0bf0c0100',
          ...EMPTY_HAND,
          'player_auth_input'
        ],
        [STOP, 'player_auth_input']
      ]
    }
  }
]

describe('bedrock lectern: a book put on by a use', () => {
  for (const put of PUTS) {
    describe(`${put.name} (${put.from.slice(8)} – ${put.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(put.from, put.to)) {
        it(`bedrock ${version}: uses the lectern holding the book and quill, resolving once the server told the lectern holds it`, async () => {
          const { bot, server, driver, errors, inventory, lectern, tell, idOf } = await puttingBot(version)
          const book = idOf('writable_book')
          inventory.slot('inventory', 0, { id: book, count: 1 })
          await driver.ticks(2)
          const batches = batchesSince(server)
          const told = server.sentOf('mob_equipment').length
          let done = false
          const putting = bot.bedrock.putBookOnLectern(lectern).then(() => { done = true })

          await driver.tick()
          const use = batches()
          assert.deepStrictEqual([actionsOf(server), bot.heldItem?.name, server.sentOf('mob_equipment').length - told],
            put.predicts ? [[[emptied(0, book)]], undefined, 1] : [[noActions(version)], 'writable_book', 0])
          await driver.tick()
          inventory.slot('inventory', 0, null)
          await driver.tick()
          const end = batches()
          const recorded = put.recorded[version]
          if (recorded !== undefined) assert.deepStrictEqual([use, end], [[recorded[0]], [['player_auth_input'], recorded[1]]])
          assert.deepStrictEqual([server.sentOf('mob_equipment').length - told, bot.heldItem, done, errors], [1, null, false, []])
          tell(lecternEntity(lectern.position, RECORDED_BOOK))
          await driver.tick()
          assert.strictEqual(done, true)
          await putting
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('takes no book to a lectern told holding one, nor another item, nor from an empty hand; putBookOnLectern rejects them, sending nothing', async () => {
      const { bot, server, driver, errors, inventory, lectern, tell, idOf } = await puttingBot(version)
      const book = idOf('writable_book')
      inventory.slot('inventory', 0, { id: book, count: 1 })
      tell(lecternEntity(lectern.position, RECORDED_BOOK))
      await driver.ticks(2)
      await assert.rejects(bot.bedrock.putBookOnLectern(lectern), { message: 'putBookOnLectern: the lectern holds a book' })
      const floor = bot.blockAt(lectern.position.offset(-2, -1, 0))
      assert.ok(floor !== null)
      await assert.rejects(bot.bedrock.putBookOnLectern(floor), { message: 'putBookOnLectern: stone is not a lectern' })
      // the vanilla client's use opens the book screen
      const used = bot.activateBlock(lectern)
      await driver.ticks(4)
      await used
      tell(lecternEntity(lectern.position))
      inventory.slot('inventory', 0, { id: idOf('stick'), count: 1 })
      await driver.tick()
      await assert.rejects(bot.bedrock.putBookOnLectern(lectern), { message: 'putBookOnLectern needs a book and quill or a written book in the hand, not stick' })
      const stick = bot.activateBlock(lectern)
      await driver.ticks(4)
      await stick
      inventory.slot('inventory', 0, null)
      await driver.tick()
      await assert.rejects(bot.bedrock.putBookOnLectern(lectern), { message: 'putBookOnLectern needs a book and quill or a written book in the hand, not nothing' })
      const emptyHanded = bot.activateBlock(lectern)
      await driver.ticks(4)
      await emptyHanded
      assert.deepStrictEqual([actionsOf(server), errors], [[[], [], []], []])
      bot.end()
    })

    it('rejects a book given while the lectern is told holding one, and a given stick, before selecting them, sending nothing', async () => {
      const { bot, server, driver, errors, inventory, lectern, tell, idOf } = await puttingBot(version)
      inventory.slot('inventory', 3, { id: idOf('written_book'), count: 1 })
      inventory.slot('inventory', 4, { id: idOf('stick'), count: 1 })
      tell(lecternEntity(lectern.position, RECORDED_BOOK))
      await driver.ticks(2)
      const [book, stick] = [bot.inventory.slots[39], bot.inventory.slots[40]]
      assert.ok(book !== null && book !== undefined && stick !== null && stick !== undefined)
      const told = server.sentOf('mob_equipment').length
      await assert.rejects(bot.bedrock.putBookOnLectern(lectern, book), { message: 'putBookOnLectern: the lectern holds a book' })
      tell(lecternEntity(lectern.position))
      await driver.tick()
      await assert.rejects(bot.bedrock.putBookOnLectern(lectern, stick), { message: 'putBookOnLectern needs a book and quill or a written book in the hand, not stick' })
      await driver.ticks(2)
      assert.deepStrictEqual([actionsOf(server), server.sentOf('mob_equipment').length - told, server.sentOf('item_stack_request'), bot.quickBarSlot, errors], [[], 0, [], 0, []])
      bot.end()
    })

    it('puts a written book given in another hotbar slot, which it selects first, naming that slot', async () => {
      const { bot, server, driver, errors, inventory, lectern, tell, idOf } = await puttingBot(version)
      const book = idOf('written_book')
      inventory.slot('inventory', 3, { id: book, count: 1 })
      await driver.ticks(2)
      const given = bot.inventory.slots[39]
      assert.ok(given !== null && given !== undefined)
      const putting = bot.bedrock.putBookOnLectern(lectern, given)
      await driver.ticks(2)
      assert.deepStrictEqual([actionsOf(server), bot.quickBarSlot, bot.heldItem], [[[emptied(3, book)]], 3, null])
      tell(lecternEntity(lectern.position, { ...RECORDED_BOOK, Name: { type: 'string', value: 'minecraft:written_book' } }))
      await driver.ticks(3)
      await putting
      assert.deepStrictEqual(errors, [])
      bot.end()
    })

    it(`rejects when the server tells no book on the lectern in ${PUT_TICKS} ticks`, async () => {
      const { bot, driver, inventory, lectern, idOf } = await puttingBot(version)
      inventory.slot('inventory', 0, { id: idOf('writable_book'), count: 1 })
      await driver.ticks(2)
      const putting = assert.rejects(bot.bedrock.putBookOnLectern(lectern), { message: `the server put no book on the lectern in ${PUT_TICKS} ticks` })
      await driver.ticks(PUT_TICKS + 4)
      await putting
      bot.end()
    })
  })
})
