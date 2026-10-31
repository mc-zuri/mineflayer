import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockLectern, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The lectern as the vanilla client used it in protocol_blocks_ui against Bedrock Dedicated Server (1.26.20.4, 1.26.51.1,
// 1.26.60.5): a book and quill put on it, its book screen opened, the close. The bot loads the windows plugin and the
// lectern's only.

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
