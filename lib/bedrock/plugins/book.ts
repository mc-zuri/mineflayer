import assert from 'assert'
import type { Tags } from 'prismarine-nbt'
import type { FrameContext } from '../core/types.ts'
import { clickAir } from '../modules/block_use.ts'
import { slotTransaction } from '../modules/items.ts'
import type { Stack } from '../modules/items.ts'
import { nbtOf } from '../modules/recipes.ts'
import type { NbtValue } from '../modules/recipes.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import { shownSlot } from './simple_inventory.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'book'
const QUICK_BAR_START = 36
const LAST_INVENTORY_SLOT = 44
// Java waits 20 s for the server's book
const ANSWER_TICKS = 400

/** a page replaced (the pages before it the book has not added empty, as the server does) or deleted, or the book signed: book_edit's fields */
type Edit =
  | { readonly type: 'replace_page', readonly page_number: number, readonly text: string, readonly photo_name: '' }
  | { readonly type: 'delete_page', readonly page_number: number }
  | { readonly type: 'sign', readonly title: string, readonly author: string, readonly xuid: string }

type PageEdit = Exclude<Edit, { type: 'sign' }>

interface Signature {
  readonly author: string
  readonly title: string
}

function nbtString (value: string): Tags['string'] {
  return { type: 'string', value }
}

/** the texts of the book's pages, '' for a page without one */
function pagesOf (book: Stack): string[] {
  const pages = nbtOf(book)['pages']
  if (pages?.type !== 'list') return []
  // a list of compounds, or of none
  const compounds = pages.value.value as Array<Tags['compound']['value']>
  return compounds.map(({ text }) => text?.type === 'string' ? text.value : '')
}

/** the pages as the vanilla client writes them */
function pageList (texts: readonly string[]): Tags['list'] {
  return { type: 'list', value: { type: 'compound', value: texts.map(text => ({ photoname: nbtString(''), text: nbtString(text) })) } }
}

/** the edit that brings the book's pages nearer to `pages`: the first page that differs replaced, but an empty page past the book's end that a later one's replace adds; else the last page past them deleted */
function nextEdit (have: readonly string[], pages: readonly string[]): PageEdit | undefined {
  const page = pages.findIndex((text, index) => have[index] !== text && !(index >= have.length && text === '' && index < pages.length - 1))
  const text = pages[page]
  if (text !== undefined) return { type: 'replace_page', page_number: page, text, photo_name: '' }
  return have.length > pages.length ? { type: 'delete_page', page_number: have.length - 1 } : undefined
}

function edited (pages: readonly string[], edit: PageEdit): string[] {
  if (edit.type === 'delete_page') return pages.filter((_text, page) => page !== edit.page_number)
  return Array.from({ length: Math.max(pages.length, edit.page_number + 1) }, (_unused, page) => page === edit.page_number ? edit.text : pages[page] ?? '')
}

/** the book as the item `networkId`, its NBT compound `value` */
function remade ({ wire, ...book }: Stack, networkId: number, value: NbtValue): Stack {
  const nbt = { version: 1, nbt: { type: 'compound' as const, name: '', value } }
  if ('auxiliary_value' in wire) return { ...book, networkId, wire: { ...wire, network_id: networkId, has_nbt: true, nbt } }
  return { ...book, networkId, wire: { ...wire, network_id: networkId, extra: { can_place_on: [], can_destroy: [], ...wire.extra, has_nbt: true, nbt } } }
}

/** a list of no tag, typed end, as the vanilla client writes the pages of a book it opened: the typings name no end tag */
function noPages (): Tags['list'] {
  const end: string = 'end'
  return { type: 'list', value: { type: end as Tags['list']['value']['type'], value: [] } }
}

/** from 1.26.0 the slot is named inventory_slot, written first */
function bookEdit (version: BedrockVersion, slot: number, edit: Edit): BedrockServerboundPackets['book_edit'] {
  return { ...isBedrockVersionAtLeast(version, 'bedrock_1.26.0') ? { inventory_slot: slot } : { slot }, ...edit }
}

/** Java's book: writeBook and signBook, by book_edit as the vanilla client's book screen sends it */
export default function book (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  // the players' xuids, by uuid: a signature names its author's
  const xuids = new Map<string, string>()

  core.observe(OWNER, 'player_list', ({ records }) => {
    // up to 1.26.30 one type for all the records, from 1.26.40 each record's own
    const listed: ReadonlyArray<{ uuid?: string | undefined, xbox_user_id?: string | undefined } | undefined> = Array.isArray(records) ? records : records.records
    for (const { uuid, xbox_user_id: xuid } of listed.map(record => ({ ...record }))) {
      // a removed player's record has its uuid alone
      if (xuid === undefined) xuids.delete(String(uuid))
      else xuids.set(String(uuid), xuid)
    }
  })

  function idOf (name: string): number {
    const item = bot.registry.itemsByName[name]
    assert.ok(item !== undefined, `the registry has no ${name}`)
    return item.id
  }

  /** the book of bot.inventory's slot, as the bot shows it */
  function bookAt (member: string, slot: number): Stack {
    const found = inventory.stackAt(inventory.inventoryRef(slot))
    if (found?.networkId !== idOf('writable_book')) throw new Error(`${member}: slot ${slot} holds no writable book any more`)
    return found
  }

  /** the edit after the vanilla client's transaction, the book shown as it leaves it: once the server shows the book so, with a new stack id */
  async function commit ({ outbox }: FrameContext, slot: number, found: Stack, made: Stack, edit: Edit, legacyId: number): Promise<void> {
    const ref = inventory.inventoryRef(slot)
    // the vanilla client's, which the server refuses: the book given to the creative inventory and the edited one taken from it
    const creative = [{ slot: 0, before: undefined, after: found }, { slot: 1, before: made, after: undefined }]
    outbox.queue('inventory_transaction', slotTransaction(version, { type: 'normal', hotbarSlot: slot - QUICK_BAR_START, before: found, after: made, legacyId, creative }))
    outbox.queue('book_edit', bookEdit(version, slot - QUICK_BAR_START, edit))
    inventory.predictSlot(ref, made)
    // the server answers the refused transaction with the book as it was before the edit, then sends the edited one
    const pages = JSON.stringify(pagesOf(made))
    const shown = (): boolean => {
      const stack = inventory.stackAt(ref)
      return stack?.networkId === made.networkId && stack.stackId !== found.stackId && JSON.stringify(pagesOf(stack)) === pages
    }
    await core.waits.until(shown, ANSWER_TICKS, `the server did not answer the book's ${edit.type} in ${ANSWER_TICKS} ticks`)
  }

  /**
   * the vanilla client's use of a book without pages, which opens its screen, the book predicted with no page: the
   * server edits no book without them. It answers nothing, or (1.17.40) the inventory with the book given an empty tag,
   * still without pages: a book is used once
   */
  function open ({ outbox }: FrameContext, slot: number, found: Stack): void {
    const opened = remade(found, found.networkId, { ...nbtOf(found), pages: noPages() })
    const hotbarSlot = slot - QUICK_BAR_START
    const data = clickAir(version, hotbarSlot, found, bot._player.eye)
    outbox.queue('inventory_transaction', slotTransaction(version, { type: 'item_use', hotbarSlot, before: found, after: opened, legacyId: core.requestIds.nextLegacyTransaction(), data }))
    inventory.predictSlot(inventory.inventoryRef(slot), opened)
  }

  /** the book's next step, in an input pass once the server showed the one before: its use if it has no pages and was not used, a page while the pages differ, then the signature */
  async function edit (member: string, slot: number, pages: readonly string[], signature: Signature | undefined, used = false): Promise<void> {
    const next = await core.call(async ctx => {
      const found = bookAt(member, slot)
      const have = pagesOf(found)
      const page = nextEdit(have, pages)
      if (!used && nbtOf(found)['pages'] === undefined && (page !== undefined || signature !== undefined)) {
        open(ctx, slot, found)
        return 'opened'
      }
      if (page !== undefined) {
        await commit(ctx, slot, found, remade(found, found.networkId, { ...nbtOf(found), pages: pageList(edited(have, page)) }), page, 0)
        return 'edited'
      }
      if (signature === undefined) return 'done'
      const { author, title } = signature
      const xuid = xuids.get(String(bot.player?.uuid)) ?? ''
      const nbt = { author: nbtString(author), generation: { type: 'int' as const, value: 0 }, pages: pageList(have), title: nbtString(title), xuid: nbtString(xuid) }
      await commit(ctx, slot, found, remade(found, idOf('written_book'), nbt), { type: 'sign', title, author, xuid }, core.requestIds.nextLegacyTransaction())
      return 'done'
    })
    // the book with no page told as held before the edits, as the vanilla client tells it
    if (next === 'opened') await bot.waitForTicks(1)
    if (next !== 'done') await edit(member, slot, pages, signature, true)
  }

  /** Java's: the book moved to the hotbar's first slot and back, its hotbar slot selected and the selection given back */
  async function write (member: string, slot: number, pages: readonly string[], signature?: Signature): Promise<void> {
    assert.ok(slot >= 0 && slot <= LAST_INVENTORY_SLOT, 'slot out of inventory range')
    assert.ok(bot.inventory.slots[slot]?.name === 'writable_book', `no book found in slot ${slot}`)
    const quickBarSlot = bot.quickBarSlot
    const moveToQuickBar = slot < QUICK_BAR_START
    if (moveToQuickBar) await bot.moveSlotItem(shownSlot(bot, member, slot), shownSlot(bot, member, QUICK_BAR_START))
    const bookSlot = moveToQuickBar ? QUICK_BAR_START : slot
    if (bookSlot - QUICK_BAR_START !== bot.quickBarSlot) {
      bot.setQuickBarSlot(bookSlot - QUICK_BAR_START)
      // the vanilla client edits the book it holds, which the server was told
      await bot.waitForTicks(1)
    }
    await edit(member, bookSlot, pages, signature)
    bot.setQuickBarSlot(quickBarSlot)
    if (moveToQuickBar) await bot.moveSlotItem(shownSlot(bot, member, QUICK_BAR_START), shownSlot(bot, member, slot))
  }

  bot.writeBook = async (slot, pages) => { await write('writeBook', slot, pages) }
  bot.signBook = async (slot, pages, author, title) => { await write('signBook', slot, pages, { author, title }) }
}
