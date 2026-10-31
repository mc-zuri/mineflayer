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

/** The lectern's book screen (Java has no lectern helper): its book read from the block entity, its close telling the page. */
export default function lectern (bot: BedrockBotInternal): void {
  const ItemClass = prismarineItem(bot.registry)
  const lecterns = new Map<string, Told>()

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

  /** its window before windowOpen: the block entity's book and page, as the server tells them while it is open too */
  function extend ({ window, opening: { position } }: OpenScreen): void {
    const told = (key: keyof Told): PropertyDescriptor => ({ get: () => toldAt(position)[key] })
    Object.defineProperties(window, { book: told('book'), page: told('page'), totalPages: told('totalPages') })
    const members: Members = {
      setPage: async () => { throw new Error('setPage is not supported on Bedrock: no recording turns a lectern\'s page') },
      takeBook: async () => { throw new Error('takeBook is not supported on Bedrock: no recording takes a lectern\'s book') }
    }
    Object.assign(window, members)
  }

  /** the vanilla client's close of a lectern holding a book: the page it is open at, with no container_close */
  function close (outbox: OutboxWriter, { opening: { position } }: OpenScreen): void {
    const { book, page, totalPages } = toldAt(position)
    if (book === null) return
    const { x, y, z } = position
    // up to 1.20.61 it also tells whether the book is taken
    const taken = isBedrockVersionAtLeast(bot.version, 'bedrock_1.20.71') ? {} : { drop_book: false }
    outbox.queue('lectern_update', { page, page_count: totalPages, position: { x, y, z }, ...taken })
  }

  bot._core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const key = keyOf(position)
    if (value['id']?.value !== 'Lectern') {
      lecterns.delete(key)
      return
    }
    lecterns.set(key, { book: bookOf(value), page: numberOf(value, 'page'), totalPages: numberOf(value, 'totalPages') })
  })

  bot._inventory.screens.add(LECTERN_SCREEN, { shown: extend, close })
}
