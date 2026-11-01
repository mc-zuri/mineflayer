import type { Block } from 'prismarine-block'
import prismarineItem from 'prismarine-item'
import type { Item } from 'prismarine-item'
import type { Tags, TagType } from 'prismarine-nbt'
import type { OutboxWriter } from '../core/types.ts'
import type { Vec3f } from '../modules/auth_input.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { LECTERN_SCREEN } from '../screens/lectern.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockLectern } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'lectern'
const NAMESPACE = 'minecraft:'
/** the items a lectern takes */
const BOOKS: readonly string[] = Object.freeze(['writable_book', 'written_book'])
// as openBlock waits for the screen
const PUT_TICKS = 100

type Compound = Record<string, undefined | Tags[TagType]>

/** a lectern's block entity as the server last told it */
interface Told {
  readonly book: Item | null
  readonly page: number
  readonly totalPages: number
}

const UNTOLD: Told = Object.freeze({ book: null, page: 0, totalPages: 0 })

/** what the plugin adds to the screen's window: windows.ts gives its close, the block entity's are read live */
type Members = Pick<BedrockLectern, 'setPage' | 'takeBook'>

function keyOf ({ x, y, z }: Vec3f): string {
  return `${x},${y},${z}`
}

function numberOf (compound: Compound, key: string): number {
  const value = compound[key]?.value
  return typeof value === 'number' ? value : 0
}

/** The lectern's book screen (Java has no lectern helper): its book read from the block entity, its page turned and its close telling the page; a book put on it by a use. */
export default function lectern (bot: BedrockBotInternal): void {
  const core = bot._core
  const ItemClass = prismarineItem(bot.registry)
  const lecterns = new Map<string, Told>()
  const hasDropBook = !isBedrockVersionAtLeast(bot.version, 'bedrock_1.20.71')

  function bookOf (entity: Compound): Item | null {
    const book = entity['book']
    if (book?.type !== 'compound') return null
    const name = book.value['Name']?.value
    const id = typeof name === 'string' ? bot.registry.itemsByName[name.replace(NAMESPACE, '')]?.id : undefined
    if (id === undefined) return null
    const tag = book.value['tag']
    // a lectern holds one book
    return new ItemClass(id, 1, numberOf(book.value, 'Damage'), tag?.type === 'compound' ? { ...tag, name: '' } : undefined)
  }

  function toldAt (position: Vec3f): Told {
    return lecterns.get(keyOf(position)) ?? UNTOLD
  }

  function update (outbox: OutboxWriter, { x, y, z }: Vec3f, page: number, totalPages: number): void {
    outbox.queue('lectern_update', { page, page_count: totalPages, position: { x, y, z }, ...(hasDropBook ? { drop_book: false } : {}) })
  }

  /** the screen's lectern as told, while its window is the one open and the server told it holds a book */
  function needsBook (member: string, { window, opening: { position } }: OpenScreen): Told {
    if (bot.currentWindow !== window) throw new Error(`${member} needs the lectern window open`)
    const told = toldAt(position)
    if (told.book === null) throw new Error(`${member}: the lectern holds no book`)
    return told
  }

  /** a page turned in the next input pass, shown at once (not recorded: whether the vanilla client tells the server each turn) */
  async function setPage (screen: OpenScreen, page: number): Promise<void> {
    await core.call(async ({ outbox }) => {
      const told = needsBook('setPage', screen)
      if (!Number.isInteger(page) || page < 0 || page >= told.totalPages) throw new Error(`setPage: the lectern's book has no page ${page}, having ${told.totalPages}`)
      const { position } = screen.opening
      update(outbox, position, page, told.totalPages)
      lecterns.set(keyOf(position), { ...told, page })
    })
  }

  // no server takes the book on drop_book (run against 1.16.201 – 1.20.61), and no recording takes it
  async function takeBook (): Promise<void> {
    throw new Error("takeBook is not supported on Bedrock: the servers ignore lectern_update's drop_book (up to 1.20.61, removed in 1.20.71), and the vanilla client's take is not known")
  }

  /** its window before windowOpen: the block entity's book and page, as the server tells them while it is open too */
  function extend (screen: OpenScreen): void {
    const { window, opening: { position } } = screen
    const told = (key: keyof Told): PropertyDescriptor => ({ get: () => toldAt(position)[key] })
    Object.defineProperties(window, { book: told('book'), page: told('page'), totalPages: told('totalPages') })
    const members: Members = {
      setPage: async page => { await setPage(screen, page) },
      takeBook
    }
    Object.assign(window, members)
  }

  /** the vanilla client's close of a lectern holding a book: the page it is open at, with no container_close */
  function close (outbox: OutboxWriter, { opening: { position } }: OpenScreen): void {
    const { book, page, totalPages } = toldAt(position)
    if (book === null) return
    update(outbox, position, page, totalPages)
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const key = keyOf(position)
    if (value['id']?.value !== 'Lectern') {
      lecterns.delete(key)
      return
    }
    lecterns.set(key, { book: bookOf(value), page: numberOf(value, 'page'), totalPages: numberOf(value, 'totalPages') })
  })

  /** the vanilla client's use of the lectern holding a book: resolves once the server told the lectern holds a book */
  async function putBook (lectern: Block, book: Item | undefined): Promise<void> {
    if (lectern.name !== 'lectern') throw new Error(`putBookOnLectern: ${lectern.name} is not a lectern`)
    if (toldAt(lectern.position).book !== null) throw new Error('putBookOnLectern: the lectern holds a book')
    const held = (book ?? bot.heldItem)?.name
    if (held === undefined || !BOOKS.includes(held)) throw new Error(`putBookOnLectern needs a book and quill or a written book in the hand, not ${held ?? 'nothing'}`)
    if (book !== undefined) await bot.equip(book, 'hand')
    await bot.activateBlock(lectern)
    await core.waits.until(() => toldAt(lectern.position).book !== null, PUT_TICKS, `the server put no book on the lectern in ${PUT_TICKS} ticks`)
  }

  bot._inventory.screens.add(LECTERN_SCREEN, { shown: extend, close })
  // a lectern the server told no book of takes one
  bot._blockUse.addTaker('lectern', ({ position }, item) => BOOKS.includes(item) && toldAt(position).book === null)
  bot.bedrock = {
    ...bot.bedrock,
    putBookOnLectern: async (lectern, book) => { await putBook(lectern, book ?? undefined) }
  }
}
