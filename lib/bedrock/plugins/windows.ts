import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { NBT } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import type { BedrockTransferOptions } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OUTSIDE = -999
const LEFT = 0
const RIGHT = 1
const SHIFT = 1

/** Java's window members made of clicks, each click resolving on the server's response; the window's close, withdraw and deposit */
export default function windows (bot: BedrockBotInternal): void {
  const core = bot._core

  async function click (slot: number, mouseButton: number, mode = 0): Promise<void> {
    await bot.clickWindow(slot, mouseButton, mode)
  }

  /** Java clicks the window open; on Bedrock bot.inventory has a screen, which is opened for the member when none is, and closed after */
  async function inWindow (member: string, window: Window, use: () => Promise<void>): Promise<void> {
    if (window === bot.currentWindow) return await use()
    if (window !== bot.inventory || bot.currentWindow !== null) throw new Error(`${member} needs the ${window.type} window open`)
    const opened = await bot.openInventory()
    try {
      await use()
    } catch (error) {
      await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    await bot.closeWindow(opened)
  }

  /** while the cursor holds an item: onto a stack of it with room, else into the first empty slot, else into `slot` and the rest dropped */
  async function putSelected (window: Window, start: number, end: number, slot: number | null): Promise<void> {
    for (let cursor = window.selectedItem; cursor !== null; cursor = window.selectedItem) {
      const target = window.findItemRange(start, end, cursor.type, cursor.metadata, true, cursor.nbt)?.slot ?? window.firstEmptySlotRange(start, end)
      if (target !== null) {
        await click(target, LEFT)
        // the vanilla client sends nothing for an item the slot does not take: the loop would never end
        if (window.selectedItem === cursor) throw new Error(`putSelectedItemRange: slot ${target} of the ${window.type} window does not take the cursor's ${cursor.name}`)
        continue
      }
      if (slot !== null) await click(slot, LEFT)
      if (window.selectedItem !== null) await click(OUTSIDE, LEFT)
    }
  }

  async function transfer (window: Window, options: BedrockTransferOptions): Promise<void> {
    const { itemType, metadata, nbt, sourceStart, destStart } = options
    const sourceEnd = options.sourceEnd ?? sourceStart + 1
    const destEnd = options.destEnd ?? destStart + 1
    const name = bot.registry.items[itemType]?.name
    assert.ok(name !== undefined, 'Invalid itemType')
    let count = options.count ?? 1
    let firstSourceSlot: number | null = null
    const holds = (item: Item | null): item is Item => item !== null && item.type === itemType && (metadata == null || item.metadata === metadata) &&
      (nbt == null || JSON.stringify(nbt) === JSON.stringify(item.nbt))

    async function held (): Promise<Item> {
      if (holds(window.selectedItem)) return window.selectedItem
      const source = window.findItemRange(sourceStart, sourceEnd, itemType, metadata, false, nbt)
      if (source === null) throw new Error(`Can't find ${name} in slots [${sourceStart} - ${sourceEnd}], (item id: ${itemType})`)
      firstSourceSlot ??= source.slot
      await click(source.slot, LEFT)
      if (!holds(window.selectedItem)) throw new Error(`transfer: the cursor did not take the ${name} of slot ${source.slot}`)
      return window.selectedItem
    }

    /** the items still to move once the cursor's went to the destination */
    async function clickDest (cursor: Item): Promise<number> {
      const destItem = destStart === OUTSIDE ? null : window.findItemRange(destStart, destEnd, cursor.type, cursor.metadata, true, nbt)
      const destSlot = destStart === OUTSIDE ? OUTSIDE : destItem?.slot ?? window.firstEmptySlotRange(destStart, destEnd)
      if (destSlot === null) throw new Error('destination full')
      const destSlotCount = destItem?.count ?? 0
      const movedItems = Math.min(cursor.stackSize - destSlotCount, cursor.count)
      const target = destSlotCount + count
      const half = Math.floor(Math.min(destSlotCount + cursor.count, cursor.stackSize) / 2)
      if (movedItems <= count) {
        await click(destSlot, LEFT)
        return count - movedItems
      }
      if (destSlot !== OUTSIDE && half <= target && 3 + target - half < count) {
        // a right click on the stack with the cursor empty takes its larger half: then one back at a time
        await click(destSlot, LEFT)
        if (window.selectedItem !== null) await putSelected(window, sourceStart, sourceEnd, firstSourceSlot)
        await click(destSlot, RIGHT)
        for (let missing = target - half; missing > 0; missing--) await click(destSlot, RIGHT)
        return 0
      }
      await click(destSlot, RIGHT)
      return count - 1
    }

    while (count > 0) count = await clickDest(await held())
    await putSelected(window, sourceStart, sourceEnd, firstSourceSlot)
  }

  /** Java's extendWindow, on every screen's window before windowOpen */
  function extend (window: Window): void {
    Object.assign(window, {
      close: async () => { await bot.closeWindow(window) },
      withdraw: async (itemType: number, metadata: number | null, count: number | null, nbt?: NBT | null) => {
        if (bot.inventory.emptySlotCount() === 0) throw new Error('Unable to withdraw, Bot inventory is full.')
        const options = { window, itemType, metadata, count, nbt, sourceStart: 0, sourceEnd: window.inventoryStart, destStart: window.inventoryStart, destEnd: window.inventoryEnd }
        await inWindow('withdraw', window, async () => { await transfer(window, options) })
      },
      deposit: async (itemType: number, metadata: number | null, count: number | null, nbt?: NBT | null) => {
        const options = { window, itemType, metadata, count, nbt, sourceStart: window.inventoryStart, sourceEnd: window.inventoryEnd, destStart: 0, destEnd: window.inventoryStart }
        await inWindow('deposit', window, async () => { await transfer(window, options) })
      }
    })
  }

  bot._inventory.screens.onShown(({ window }) => { extend(window) })

  bot.transfer = async options => {
    const window = options.window ?? bot.currentWindow ?? bot.inventory
    await inWindow('transfer', window, async () => { await transfer(window, options) })
  }

  bot.putSelectedItemRange = async (start, end, window, slot) => {
    await inWindow('putSelectedItemRange', window, async () => { await putSelected(window, start, end, slot) })
  }

  bot.putAway = async slot => {
    const window = bot.currentWindow ?? bot.inventory
    await inWindow('putAway', window, async () => {
      const { inventoryStart: start, inventoryEnd: end } = window
      const item = window.slots[slot]
      const room = item != null && (window.findItemRange(start, end, item.type, item.metadata, true, item.nbt) !== null || window.firstEmptySlotRange(start, end) !== null)
      // a shift click on an output crafts again while the inputs last
      if (room && slot !== window.craftingResultSlot) return await click(slot, LEFT, SHIFT)
      await click(slot, LEFT)
      await putSelected(window, start, end, null)
    })
  }

  bot.moveSlotItem = async (sourceSlot, destSlot) => {
    await inWindow('moveSlotItem', bot.currentWindow ?? bot.inventory, async () => {
      await click(sourceSlot, LEFT)
      await click(destSlot, LEFT)
      // a swap: what the destination held goes where the source was
      if (bot.inventory.selectedItem !== null) await click(sourceSlot, LEFT)
    })
  }

  bot.simpleClick = {
    leftMouse: async slot => { await click(slot, LEFT) },
    rightMouse: async slot => { await click(slot, RIGHT) }
  }

  bot.updateHeldItem = () => {
    core.command(() => { core.emit(bot, 'heldItemChanged', bot.heldItem) })
  }
}
