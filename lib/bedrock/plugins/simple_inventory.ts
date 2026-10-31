import assert from 'assert'
import { readStack } from '../modules/items.ts'
import type { Stack } from '../modules/items.ts'
import type { WindowId } from '../modules/screens.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

type Transaction = BedrockClientboundPackets['inventory_transaction']['transaction']
type Actions = NonNullable<Transaction['actions']>
type Action = NonNullable<Transaction['inventory_actions']>[number] | Extract<Actions, { network_ids: boolean }>['actions'][number] | Exclude<Actions, { network_ids: boolean }>[number]

const QUICK_BAR_START = 36
const QUICK_BAR_COUNT = 9
const OUTSIDE = -999
const WORN: Readonly<Record<string, number>> = Object.freeze({ head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 })
// the player's windows, by number up to 1.16.210 and from 1.26.30, each with the slot inventory_slot numbers 0: a transaction numbers the offhand's one item 1, as requests do
const PLAYER_WINDOWS: Readonly<Record<string, readonly [WindowId, number]>> = Object.freeze({
  0: ['inventory', 0],
  inventory: ['inventory', 0],
  119: ['offhand', 1],
  offhand: ['offhand', 1],
  120: ['armor', 0],
  armor: ['armor', 0],
  124: ['ui', 0],
  ui: ['ui', 0]
})

/** each container action of the player's windows: its window, its slot as inventory_slot numbers it, and what it leaves there */
function transactionSlots ({ inventory_actions: inline, actions = [] }: Transaction): Array<[WindowId, number, Stack | undefined]> {
  // 1.16.201 writes the actions inline, 1.16.210 after network_ids
  const all: readonly Action[] = inline ?? (Array.isArray(actions) ? actions : actions.actions)
  return all.flatMap(action => {
    // the window named inventory_id up to 1.26.20; up to 1.16.210 the stack id the action's, with network_ids
    const { inventory_id: inventoryId, window_id: windowId, new_item_stack_id: stackId }: { inventory_id?: WindowId | undefined, window_id?: number | undefined, new_item_stack_id?: number | undefined } = action
    const window = PLAYER_WINDOWS[String(inventoryId ?? windowId)]
    if (action.source_type !== 'container' || window === undefined) return []
    const stack = readStack(action.new_item)
    return [[window[0], action.slot - window[1], stack === undefined || stackId === undefined ? stack : { ...stack, stackId }]]
  })
}

/** Java's simple_inventory: the hotbar selection, equip, unequip, toss and tossStack; and the slots the server's inventory transactions change */
export default function simpleInventory (bot: BedrockBotInternal): void {
  // Java's: the hotbar slot an equip fills next when none is empty
  let nextQuickBarSlot = 0

  bot.QUICK_BAR_START = QUICK_BAR_START

  bot.setQuickBarSlot = slot => {
    assert.ok(slot >= 0)
    assert.ok(slot < 9)
    bot._inventory.askSlot(bot._core, slot)
  }

  function getDestSlot (destination: string): number {
    if (destination === 'hand') return QUICK_BAR_START + bot.quickBarSlot
    const destSlot = WORN[destination]
    assert.ok(destSlot !== undefined, `invalid destination: ${destination}`)
    return destSlot
  }

  /** bot.inventory's slot in the window open: Java clicks the inventory's numbers whatever window is open */
  function shown (member: string, slot: number): number {
    const window = bot.currentWindow
    if (window === null) return slot
    const shownSlot = bot._inventory.windowSlotOf(window, slot)
    if (shownSlot === undefined) throw new Error(`${member}: the ${window.type} window open shows no slot ${slot} of the inventory`)
    return shownSlot
  }

  function firstEmptyHotbarSlot (): number | null {
    return bot.inventory.firstEmptySlotRange(QUICK_BAR_START, QUICK_BAR_START + QUICK_BAR_COUNT)
  }

  bot.getEquipmentDestSlot = getDestSlot

  bot.equip = async (item, destination) => {
    const found = typeof item === 'number' ? bot.inventory.findInventoryItem(item, null, false) : item
    if (found == null) throw new Error('Invalid item object in equip (item is null or typeof item is not object)')
    const where = destination ?? 'hand'
    const sourceSlot = found.slot
    const destSlot = getDestSlot(where)
    if (sourceSlot === destSlot) return
    if (where !== 'hand') {
      // the vanilla client sends nothing for such a click, which Java's server refuses
      if (!bot._inventory.takes(sourceSlot, destSlot)) throw new Error(`equip: ${found.name} is not worn on ${where}`)
      await bot.moveSlotItem(shown('equip', sourceSlot), shown('equip', destSlot))
      return
    }
    if (sourceSlot >= QUICK_BAR_START && sourceSlot < QUICK_BAR_START + QUICK_BAR_COUNT) {
      bot.setQuickBarSlot(sourceSlot - QUICK_BAR_START)
      return
    }
    let hotbarSlot = firstEmptyHotbarSlot()
    if (hotbarSlot === null) {
      hotbarSlot = QUICK_BAR_START + nextQuickBarSlot
      nextQuickBarSlot = (nextQuickBarSlot + 1) % QUICK_BAR_COUNT
    }
    const [source, dest] = [shown('equip', sourceSlot), shown('equip', hotbarSlot)]
    bot.setQuickBarSlot(hotbarSlot - QUICK_BAR_START)
    await bot.moveSlotItem(source, dest)
  }

  bot.unequip = async destination => {
    if (destination !== 'hand') {
      await bot.putAway(shown('unequip', getDestSlot(String(destination))))
      return
    }
    const empty = firstEmptyHotbarSlot()
    if (empty !== null) {
      bot.setQuickBarSlot(empty - QUICK_BAR_START)
      return
    }
    const free = bot.inventory.firstEmptyInventorySlot()
    // with no room the stack is dropped, as Java's tossStack drops it
    await bot.moveSlotItem(shown('unequip', QUICK_BAR_START + bot.quickBarSlot), free === null ? OUTSIDE : shown('unequip', free))
  }

  bot.tossStack = async item => {
    assert.ok(item)
    // Java reads the slot as the open window's: an item of bot.inventory is clicked where that window shows it
    const slot = bot.inventory.slots[item.slot] === item ? shown('tossStack', item.slot) : item.slot
    await bot.moveSlotItem(slot, OUTSIDE)
  }

  bot.toss = async (itemType, metadata, count) => {
    const window = bot.currentWindow ?? bot.inventory
    await bot.transfer({ window, itemType, metadata, count, sourceStart: window.inventoryStart, sourceEnd: window.inventoryEnd, destStart: OUTSIDE })
  }

  // the server's report of slots it changed: of an item picked up its only one, of a command's or a use's with inventory_content
  bot._core.handle('simple_inventory', 'inventory_transaction', ({ transaction }) => {
    for (const [window, slot, stack] of transactionSlots(transaction)) bot._inventory.receiveSlot(window, slot, stack)
  })

  // Java's, defined once the local player is
  bot._core.observe('simple_inventory', 'start_game', () => {
    Object.defineProperty(bot.entity, 'equipment', {
      get: () => [bot.heldItem, bot.inventory.slots[45], bot.inventory.slots[8], bot.inventory.slots[7], bot.inventory.slots[6], bot.inventory.slots[5]]
    })
  })
}
