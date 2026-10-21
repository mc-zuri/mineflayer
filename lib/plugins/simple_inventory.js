const assert = require('assert')

module.exports = inject

const QUICK_BAR_COUNT = 9
const QUICK_BAR_START = 36

function inject (bot, { physicsManual } = {}) {
  const Item = require('prismarine-item')(bot.registry)
  let nextQuickBarSlot = 0

  const armorSlots = {
    head: 5,
    torso: 6,
    legs: 7,
    feet: 8
  }

  if (!bot.supportFeature('doesntHaveOffHandSlot')) {
    armorSlots['off-hand'] = 45
  }

  async function tossStack (item) {
    assert.ok(item)
    await bot.clickWindow(item.slot, 0, 0)
    await bot.clickWindow(-999, 0, 0)
    bot.closeWindow(bot.currentWindow || bot.inventory)
  }

  async function toss (itemType, metadata, count) {
    const window = bot.currentWindow || bot.inventory
    const options = {
      window,
      itemType,
      metadata,
      count,
      sourceStart: window.inventoryStart,
      sourceEnd: window.inventoryEnd,
      destStart: -999
    }
    await bot.transfer(options)
  }

  async function unequip (destination) {
    if (destination === 'hand') {
      await equipEmpty()
    } else {
      await disrobe(destination)
    }
  }

  // The selected slot reaches the server as vanilla's client sends it (MultiPlayerGameMode.ensureHasSentCarriedItem):
  // at the start of the next tick, or before an attack, a use or a dig needs it; and only when it is not the slot the
  // server was last told (carriedIndex).
  let carriedIndex = 0
  let ticks = 0
  let changedAt = null
  let flushTimer = null

  function ensureHasSentCarriedItem () {
    changedAt = null
    if (flushTimer) {
      clearTimeout(flushTimer)
      flushTimer = null
    }
    if (bot.quickBarSlot == null || bot.quickBarSlot === carriedIndex) return
    carriedIndex = bot.quickBarSlot
    bot._client.write('held_item_slot', { slotId: carriedIndex })
  }
  bot._ensureHasSentCarriedItem = ensureHasSentCarriedItem

  // the slot changed now: sent at the start of a later tick (the ticks being the player's, physicsTickBegin). A slot
  // selected before a tick is sent with it; one picked during a tick (a hotbar key), with the next.
  function selectSlot (slot, beforeTick) {
    // a change still unsent from an earlier tick went at that tick's start
    if (changedAt !== null && changedAt < ticks) ensureHasSentCarriedItem()
    bot.quickBarSlot = slot
    bot.updateHeldItem()
    if (slot === carriedIndex) return
    changedAt = beforeTick ? ticks - 1 : ticks
    // without a physics tick to send it (none runs before spawn), the slot goes out on its own
    if (!physicsManual && !flushTimer) {
      flushTimer = setTimeout(() => {
        flushTimer = null
        if (changedAt !== null) ensureHasSentCarriedItem()
      }, 100)
    }
  }

  bot.on('end', () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = null
  })

  // A respawn's new player (ClientPacketListener.handleRespawn: a new LocalPlayer, its Inventory's selected slot 0) has
  // the first slot selected, which its first tick tells the server when it is not the one last sent: the server's new
  // player after a death has slot 0 too, and the bot that kept its old slot thought it held the pickaxe crafted into it
  // while the server had it dig by hand (Grim's FastBreak: 6 s too fast, the server's break refused, 'no progress')
  bot._client.on('respawn', () => {
    if (bot.quickBarSlot != null && bot.quickBarSlot !== 0) selectSlot(0, true)
  })

  bot.on('physicsTickBegin', () => {
    ticks++
    if (changedAt !== null && changedAt < ticks - 1) ensureHasSentCarriedItem()
  })

  function setQuickBarSlot (slot) {
    assert.ok(slot >= 0)
    assert.ok(slot < 9)
    if (bot.quickBarSlot === slot) return
    selectSlot(slot, false)
  }
  // A slot selected before the tick (the server's choice, ClientPacketListener.handleSetHeldSlot, or a pick in a screen):
  // not answered at once, but at the start of the coming tick
  bot._selectQuickBarSlotBeforeTick = (slot) => {
    if (slot < 0 || slot >= 9) return
    selectSlot(slot, true)
  }

  async function equipEmpty () {
    for (let i = 0; i < QUICK_BAR_COUNT; ++i) {
      if (!bot.inventory.slots[QUICK_BAR_START + i]) {
        setQuickBarSlot(i)
        return
      }
    }
    const slot = bot.inventory.firstEmptyInventorySlot()
    if (!slot) {
      await bot.tossStack(bot.heldItem)
      return
    }
    const equipSlot = QUICK_BAR_START + bot.quickBarSlot
    await bot.clickWindow(equipSlot, 0, 0)
    await bot.clickWindow(slot, 0, 0)
    if (bot.inventory.selectedItem) {
      await bot.clickWindow(-999, 0, 0)
    }
  }

  async function disrobe (destination) {
    assert.strictEqual(bot.currentWindow, null)
    const destSlot = getDestSlot(destination)
    await bot.putAway(destSlot)
  }

  async function equip (item, destination) {
    if (typeof item === 'number') {
      item = bot.inventory.findInventoryItem(item)
    }
    if (item == null || typeof item !== 'object') {
      throw new Error('Invalid item object in equip (item is null or typeof item is not object)')
    }
    if (!destination || destination === null) {
      destination = 'hand'
    }
    const sourceSlot = item.slot
    let destSlot = getDestSlot(destination)

    if (sourceSlot === destSlot) {
      // don't need to do anything
      return
    }

    if (destination !== 'hand') {
      await bot.moveSlotItem(sourceSlot, destSlot)
      return
    }

    if (destSlot >= QUICK_BAR_START && destSlot < (QUICK_BAR_START + QUICK_BAR_COUNT) && sourceSlot >= QUICK_BAR_START && sourceSlot < (QUICK_BAR_START + QUICK_BAR_COUNT)) {
      // all we have to do is change the quick bar selection
      bot.setQuickBarSlot(sourceSlot - QUICK_BAR_START)
      return
    }

    // find an empty slot on the quick bar to put the source item in
    destSlot = bot.inventory.firstEmptySlotRange(QUICK_BAR_START, QUICK_BAR_START + QUICK_BAR_COUNT)
    if (destSlot == null) {
      // LRU cache for the quick bar items
      destSlot = QUICK_BAR_START + nextQuickBarSlot
      nextQuickBarSlot = (nextQuickBarSlot + 1) % QUICK_BAR_COUNT
    }
    setQuickBarSlot(destSlot - QUICK_BAR_START)
    await bot.moveSlotItem(sourceSlot, destSlot)
  }

  function getDestSlot (destination) {
    if (destination === 'hand') {
      return QUICK_BAR_START + bot.quickBarSlot
    } else {
      const destSlot = armorSlots[destination]
      assert.ok(destSlot != null, `invalid destination: ${destination}`)
      return destSlot
    }
  }

  function leftMouse (slot) {
    return bot.clickWindow(slot, 0, 0)
  }

  function rightMouse (slot) {
    return bot.clickWindow(slot, 1, 0)
  }

  function shiftMouse (slot) {
    return bot.clickWindow(slot, 0, 1)
  }

  async function shiftDoubleClick (slot) {
    const window = bot.currentWindow || bot.inventory
    const filter = window.slots[slot]
    if (!window.selectedItem || !filter) return

    const start = slot < window.inventoryStart ? 0 : window.inventoryStart
    const end = slot < window.inventoryStart ? window.inventoryStart : window.inventoryEnd
    await shiftMouse(slot)
    for (let current = start; current < end; current++) {
      if (Item.equal(window.slots[current], filter, false)) await shiftMouse(current)
    }
  }

  bot.equip = equip
  bot.unequip = unequip
  bot.toss = toss
  bot.tossStack = tossStack
  bot.setQuickBarSlot = setQuickBarSlot
  bot.getEquipmentDestSlot = getDestSlot
  bot.simpleClick = { leftMouse, rightMouse, shiftMouse, shiftDoubleClick }

  // constants
  bot.QUICK_BAR_START = QUICK_BAR_START
}
