import assert from 'assert'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const QUICK_BAR_START = 36
const QUICK_BAR_COUNT = 9
const OUTSIDE = -999
const WORN: Readonly<Record<string, number>> = Object.freeze({ head: 5, torso: 6, legs: 7, feet: 8, 'off-hand': 45 })

/** Java's simple_inventory: the hotbar selection, equip and unequip */
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

  // Java's, defined once the local player is
  bot._core.observe('simple_inventory', 'start_game', () => {
    Object.defineProperty(bot.entity, 'equipment', {
      get: () => [bot.heldItem, bot.inventory.slots[45], bot.inventory.slots[8], bot.inventory.slots[7], bot.inventory.slots[6], bot.inventory.slots[5]]
    })
  })
}
