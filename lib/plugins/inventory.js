const assert = require('assert')
const { Vec3 } = require('vec3')
const { once, sleep, createDoneTask, createTask, withTimeout } = require('../promise_utils')
const { toNotchianYaw, toNotchianPitch } = require('../conversions')

module.exports = inject

// ms to wait before clicking on a tool so the server can send the new
// damage information
const DIG_CLICK_TIMEOUT = 500
// The number of milliseconds to wait for the server to respond with consume completion.
// This number is larger than the eat time of 1.61 seconds to account for latency and low tps.
// The eat time comes from https://minecraft.wiki/w/Food#Usage
const CONSUME_TIMEOUT = 2500
// milliseconds to wait for the server to respond to a window click transaction
const WINDOW_TIMEOUT = 5000

const ALWAYS_CONSUMABLES = [
  'potion',
  'milk_bucket',
  'enchanted_golden_apple',
  'golden_apple'
]

// Items the client goes on using once used (Item.getUseDuration > 0), by vanilla's Item.use. Drinks always start;
// food when the player can eat it; the others by the checks in startsUsing.
const DRINKS = new Set(['potion', 'milk_bucket', 'honey_bottle', 'ominous_bottle'])
// FoodProperties.canAlwaysEat, from the version each became so
const ALWAYS_EDIBLE = { golden_apple: '1.8', enchanted_golden_apple: '1.8', chorus_fruit: '1.9', suspicious_stew: '1.17' }
const ARROWS = new Set(['arrow', 'spectral_arrow', 'tipped_arrow'])

function inject (bot, { hideErrors }) {
  const Item = require('prismarine-item')(bot.registry)
  // ServerboundContainerClickPacket: since 1.21.5 the slots are HashedStack, an empty one absent (HashedStack.EMPTY),
  // not an item of count 0
  const hashedClickSlots = bot.registry.version['>=']('1.21.5')
  const clickItem = item => hashedClickSlots && (item == null || item.count === 0) ? undefined : Item.toNotch(item)
  const windows = require('prismarine-windows')(bot.version)
  const simulateInventoryClick = require('../inventory_simulator')(Item)

  let eatingTask = createDoneTask()
  let sequence = 0
  bot._nextInteractionSequence = () => ++sequence

  let nextActionNumber = 0 // < 1.17
  let stateId = -1
  if (bot.supportFeature('stateIdUsed')) {
    const listener = packet => {
      stateId = packet.stateId
      bot._stateId = stateId
    }
    bot._client.on('window_items', listener)
    bot._client.on('set_slot', listener)
  }
  const windowClickQueue = []
  let windowItems

  // 0-8, null = uninitialized
  // which quick bar slot is selected
  bot.quickBarSlot = null
  bot.inventory = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
  bot.currentWindow = null
  bot.usingHeldItem = false

  Object.defineProperty(bot, 'heldItem', {
    get: function () {
      return bot.inventory.slots[bot.QUICK_BAR_START + bot.quickBarSlot]
    }
  })

  bot.on('spawn', () => {
    Object.defineProperty(bot.entity, 'equipment', {
      get: bot.supportFeature('doesntHaveOffHandSlot')
        ? function () {
          return [bot.heldItem, bot.inventory.slots[8], bot.inventory.slots[7],
            bot.inventory.slots[6], bot.inventory.slots[5]]
        }
        : function () {
          return [bot.heldItem, bot.inventory.slots[45], bot.inventory.slots[8],
            bot.inventory.slots[7], bot.inventory.slots[6], bot.inventory.slots[5]]
        }
    })
  })

  bot._client.on('entity_status', (packet) => {
    if (packet.entityId === bot.entity.id && packet.entityStatus === 9 && !eatingTask.done) {
      eatingTask.finish()
    }
    bot.usingHeldItem = false
  })

  let previousHeldItem = null
  bot.on('heldItemChanged', (heldItem) => {
    // we only disable the item if the item type or count changes
    const same = heldItem?.type === previousHeldItem?.type && heldItem?.count === previousHeldItem?.count
    previousHeldItem = heldItem
    if (same) return
    if (!eatingTask.done) {
      eatingTask.finish()
    }
    bot.usingHeldItem = false
  })

  bot._client.on('set_cooldown', (packet) => {
    if (bot.heldItem && bot.heldItem.type !== packet.itemID) return
    if (!eatingTask.done) {
      eatingTask.finish()
    }
    bot.usingHeldItem = false
  })

  async function consume () {
    if (!eatingTask.done) {
      eatingTask.cancel(new Error('Consuming cancelled due to calling bot.consume() again'))
    }

    if (bot.game.gameMode !== 'creative' && !ALWAYS_CONSUMABLES.includes(bot.heldItem.name) && bot.food === 20) {
      throw new Error('Food is full')
    }

    eatingTask = createTask()

    activateItem()

    await withTimeout(eatingTask.promise, CONSUME_TIMEOUT)
  }

  // Item.use as the client runs it: whether using the item starts using it (LivingEntity.startUsingItem), which keeps
  // the player slowed until it is released or done; an instant use (a snowball, a rod) or a failed one does not
  function startsUsing (item) {
    if (!item) return false
    const version = bot.registry.version
    const name = item.name
    // (Abilities.invulnerable: creative and spectator)
    const invulnerable = bot.game.gameMode === 'creative' || bot.game.gameMode === 'spectator'
    if (DRINKS.has(name)) return true
    if (bot.registry.foodsByName[name]) {
      // Player.canEat: before 1.15 never while invulnerable, since always then
      const hungry = (ALWAYS_EDIBLE[name] != null && bot.registry.version['>='](ALWAYS_EDIBLE[name])) || bot.food < 20
      return version['>=']('1.15') ? invulnerable || hungry : !invulnerable && hungry
    }
    // Player.getProjectile: the arrows (and for a crossbow a firework rocket in hand) a bow or crossbow shoots
    const hasAmmo = (fireworks) => invulnerable || bot.inventory.slots.some(slot =>
      slot && (ARROWS.has(slot.name) || (fireworks && /^firework_rocket$|^fireworks$/.test(slot.name) &&
        (slot === bot.heldItem || slot.slot === 45))))
    switch (name) {
      case 'shield':
      case 'spyglass':
      case 'goat_horn':
        return true
      case 'bow':
        return hasAmmo(false)
      case 'crossbow': {
        // a charged crossbow shoots at once
        const charged = item.componentMap?.get('charged_projectiles')?.data?.projectiles?.length > 0 ||
          !!item.nbt?.value?.Charged?.value
        return !charged && hasAmmo(true)
      }
      case 'trident': {
        // not when the next use would break it (a trident lasts 250 uses; minecraft-data's 1.20.6 says 1), and with
        // riptide only in water or rain
        if ((item.durabilityUsed ?? 0) >= 250 - 1) return false
        const riptide = (Array.isArray(item.enchants) ? item.enchants : []).some(e => /riptide$/.test(e.name))
        return !riptide || !!bot.entity.isInWater || bot.isRaining
      }
    }
    // 1.8 swords block (ItemSword.onItemRightClick)
    return version['<']('1.9') && name.endsWith('_sword')
  }

  function activateItem (offHand = false) {
    bot.usingHeldItem = startsUsing(offHand ? bot.inventory.slots[45] : bot.heldItem)

    // 1.17 - 1.20.6 MultiPlayerGameMode.useItem first sends the player's position and look as they are (without
    // touching what the player's own movement packets last sent)
    if (bot.registry.version['>=']('1.17') && bot.registry.version['<']('1.21')) {
      const { position, onGround } = bot.entity
      bot._client.write('position_look', {
        x: position.x,
        y: position.y,
        z: position.z,
        yaw: bot.entity.yawDegrees?.valueOf() ?? Math.fround(toNotchianYaw(bot.entity.yaw)),
        // (a level look is a pitch of 0, never -0)
        pitch: bot.entity.pitchDegrees?.valueOf() ?? Math.fround(toNotchianPitch(bot.entity.pitch)) + 0,
        onGround
      })
    }

    if (bot.supportFeature('useItemWithBlockPlace')) {
      bot._client.write('block_place', {
        location: new Vec3(-1, 255, -1),
        direction: -1,
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: -1,
        cursorY: -1,
        cursorZ: -1
      })
    } else if (bot.supportFeature('useItemWithOwnPacket')) {
      bot._client.write('use_item', {
        hand: offHand ? 1 : 0,
        sequence: bot._nextInteractionSequence(),
        rotation: {
          x: toNotchianYaw(bot.entity.yaw),
          y: toNotchianPitch(bot.entity.pitch)
        }
      })
    }
  }

  function deactivateItem () {
    bot._ensureHasSentCarriedItem()
    // MultiPlayerGameMode.releaseUsingItem: RELEASE_USE_ITEM at the origin, facing down, on every version (6 from 26.3,
    // which put CHANGE_DESTROY_DIRECTION at 1 of ServerboundPlayerActionPacket.Action)
    const body = {
      status: bot.registry.version['>=']('26.3') ? 6 : 5,
      location: new Vec3(0, 0, 0),
      face: 0
    }

    if (bot.supportFeature('useItemWithOwnPacket')) {
      body.sequence = 0
    }

    bot._client.write('block_dig', body)

    bot.usingHeldItem = false
  }

  async function putSelectedItemRange (start, end, window, slot) {
    // put the selected item back indow the slot range in window

    // try to put it in an item that already exists and just increase
    // the count.

    while (window.selectedItem) {
      const item = window.findItemRange(start, end, window.selectedItem.type, window.selectedItem.metadata, true, window.selectedItem.nbt)

      if (item && item.stackSize !== item.count) { // something to join with
        await clickWindow(item.slot, 0, 0)
      } else { // nothing to join with
        const emptySlot = window.firstEmptySlotRange(start, end)
        if (emptySlot === null) { // no room left
          if (slot === null) { // no room => drop it
            await tossLeftover()
          } else { // if there is still some leftover and slot is not null, click slot
            await clickWindow(slot, 0, 0)
            await tossLeftover()
          }
        } else {
          await clickWindow(emptySlot, 0, 0)
        }
      }
    }

    async function tossLeftover () {
      if (window.selectedItem) {
        await clickWindow(-999, 0, 0)
      }
    }
  }

  async function activateBlock (block, direction, cursorPos) {
    direction = direction ?? new Vec3(0, 1, 0)
    const directionNum = vectorToDirection(direction) // The packet needs a number as the direction
    cursorPos = cursorPos ?? new Vec3(0.5, 0.5, 0.5)
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), false)
    // place block message
    // TODO: logic below can likely be simplified
    if (bot.supportFeature('blockPlaceHasHeldItem')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: cursorPos.scaled(16).x,
        cursorY: cursorPos.scaled(16).y,
        cursorZ: cursorPos.scaled(16).z
      })
    } else if (bot.supportFeature('blockPlaceHasHandAndIntCursor')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: 0,
        cursorX: cursorPos.scaled(16).x,
        cursorY: cursorPos.scaled(16).y,
        cursorZ: cursorPos.scaled(16).z
      })
    } else if (bot.supportFeature('blockPlaceHasHandAndFloatCursor')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: 0,
        cursorX: cursorPos.x,
        cursorY: cursorPos.y,
        cursorZ: cursorPos.z
      })
    } else if (bot.supportFeature('blockPlaceHasInsideBlock')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: 0,
        cursorX: cursorPos.x,
        cursorY: cursorPos.y,
        cursorZ: cursorPos.z,
        insideBlock: false,
        sequence: bot._nextInteractionSequence(),
        worldBorderHit: false // 1.21.3+
      })
    }

    // swing arm animation (26.3+: the server swings for a use itself, the client sends no swing, Minecraft.startUseItem)
    if (!bot.registry.version['>=']('26.3')) bot.swingArm()
  }

  async function activateEntity (entity) {
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(entity.position.offset(0, 1, 0), false)
    bot._client.write('use_entity', {
      target: entity.id,
      mouse: 0, // interact with entity
      sneaking: false,
      hand: 0, // interact with the main hand
      location: { x: 0, y: 1, z: 0 } // 26.1+: where on the entity the bot aimed (ServerboundInteractPacket)
    })
  }

  async function activateEntityAt (entity, position) {
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(position, false)
    bot._client.write('use_entity', {
      target: entity.id,
      mouse: 2, // interact with entity at
      sneaking: false,
      hand: 0, // interact with the main hand
      x: position.x - entity.position.x,
      y: position.y - entity.position.y,
      z: position.z - entity.position.z,
      location: position.minus(entity.position) // 26.1+ (ServerboundInteractPacket)
    })
  }

  async function transfer (options) {
    const window = options.window || bot.currentWindow || bot.inventory
    const itemType = options.itemType
    const metadata = options.metadata
    const nbt = options.nbt
    let count = (options.count === undefined || options.count === null) ? 1 : options.count
    let firstSourceSlot = null

    // ranges
    const sourceStart = options.sourceStart
    const destStart = options.destStart
    assert.notStrictEqual(sourceStart, null)
    assert.notStrictEqual(destStart, null)
    const sourceEnd = options.sourceEnd === null ? sourceStart + 1 : options.sourceEnd
    const destEnd = options.destEnd === null ? destStart + 1 : options.destEnd

    await transferOne()

    async function transferOne () {
      if (count === 0) {
        await putSelectedItemRange(sourceStart, sourceEnd, window, firstSourceSlot)
        return
      }
      if (!window.selectedItem || window.selectedItem.type !== itemType ||
        (metadata != null && window.selectedItem.metadata !== metadata) ||
        (nbt != null && window.selectedItem.nbt !== nbt)) {
        // we are not holding the item we need. click it.
        const sourceItem = window.findItemRange(sourceStart, sourceEnd, itemType, metadata, false, nbt)
        const mcDataEntry = bot.registry.itemsArray.find(x => x.id === itemType)
        assert(mcDataEntry, 'Invalid itemType')
        if (!sourceItem) throw new Error(`Can't find ${mcDataEntry.name} in slots [${sourceStart} - ${sourceEnd}], (item id: ${itemType})`)
        if (firstSourceSlot === null) firstSourceSlot = sourceItem.slot
        // number of item that can be moved from that slot
        await clickWindow(sourceItem.slot, 0, 0)
      }
      await clickDest()

      async function clickDest () {
        assert.notStrictEqual(window.selectedItem.type, null)
        assert.notStrictEqual(window.selectedItem.metadata, null)
        let destItem
        let destSlot
        // special case for tossing
        if (destStart === -999) {
          destSlot = -999
        } else {
          // find a non full item that we can drop into
          destItem = window.findItemRange(destStart, destEnd,
            window.selectedItem.type, window.selectedItem.metadata, true, nbt)
          // if that didn't work find an empty slot to drop into
          destSlot = destItem
            ? destItem.slot
            : window.firstEmptySlotRange(destStart, destEnd)
          // if that didn't work, give up
          if (destSlot === null) {
            throw new Error('destination full')
          }
        }
        // move the maximum number of item that can be moved
        const destSlotCount = destItem && destItem.count ? destItem.count : 0
        const movedItems = Math.min(window.selectedItem.stackSize - destSlotCount, window.selectedItem.count)
        // if the number of item the left click moves is less than the number of item we want to move
        // several at the same time (left click)
        if (movedItems <= count) {
          await clickWindow(destSlot, 0, 0)
          // update the number of item we want to move (count)
          count -= movedItems
          await transferOne()
        } else {
          // one by one (right click)
          await clickWindow(destSlot, 1, 0)
          count -= 1
          await transferOne()
        }
      }
    }
  }

  function extendWindow (window) {
    window.close = () => {
      closeWindow(window)
      window.emit('close')
    }

    window.withdraw = async (itemType, metadata, count, nbt) => {
      if (bot.inventory.emptySlotCount() === 0) {
        throw new Error('Unable to withdraw, Bot inventory is full.')
      }
      const options = {
        window,
        itemType,
        metadata,
        count,
        nbt,
        sourceStart: 0,
        sourceEnd: window.inventoryStart,
        destStart: window.inventoryStart,
        destEnd: window.inventoryEnd
      }
      await transfer(options)
    }
    window.deposit = async (itemType, metadata, count, nbt) => {
      const options = {
        window,
        itemType,
        metadata,
        count,
        nbt,
        sourceStart: window.inventoryStart,
        sourceEnd: window.inventoryEnd,
        destStart: 0,
        destEnd: window.inventoryStart
      }
      await transfer(options)
    }
  }

  async function openBlock (block, direction, cursorPos) {
    bot.activateBlock(block, direction, cursorPos)
    const [window] = await once(bot, 'windowOpen')
    extendWindow(window)
    return window
  }

  // The horses whose inventory their rider opens with the inventory key (MultiPlayerGameMode.isServerControlledInventory;
  // 1.8 - 1.10 name every horse EntityHorse)
  const HORSE_NAMES = new Set(['EntityHorse', 'horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'llama', 'trader_llama', 'camel'])

  async function openEntity (entity) {
    if (entity === bot.vehicle && HORSE_NAMES.has(entity.name)) {
      // the rider asks the server to open its mount's inventory (LocalPlayer.sendOpenInventory)
      bot._client.write('entity_action', { entityId: bot.entity.id, actionId: 'open_inventory', jumpBoost: 0 })
    } else {
      bot.activateEntity(entity)
    }
    const [window] = await once(bot, 'windowOpen')
    extendWindow(window)
    return window
  }

  function createActionNumber () {
    nextActionNumber = nextActionNumber === 32767 ? 1 : nextActionNumber + 1
    return nextActionNumber
  }

  function updateHeldItem () {
    bot.emit('heldItemChanged', bot.heldItem)
  }

  function closeWindow (window) {
    bot._client.write('close_window', {
      windowId: window.id
    })
    copyInventory(window)
    bot.currentWindow = null
    bot.emit('windowClose', window)
  }

  function copyInventory (window) {
    const slotOffset = window.inventoryStart - bot.inventory.inventoryStart
    for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
      const item = window.slots[i]
      const slot = i - slotOffset
      if (item) {
        item.slot = slot
      }
      if (!Item.equal(bot.inventory.slots[slot], item, true)) bot.inventory.updateSlot(slot, item)
    }
  }

  function tradeMatch (limitItem, targetItem) {
    return (
      targetItem !== null &&
      limitItem !== null &&
      targetItem.type === limitItem.type &&
      targetItem.count >= limitItem.count
    )
  }

  function expectTradeUpdate (window) {
    const trade = window.selectedTrade
    const hasItem = !!window.slots[2]

    if (hasItem !== tradeMatch(trade.inputItem1, window.slots[0])) {
      if (trade.hasItem2) {
        return hasItem !== tradeMatch(trade.inputItem2, window.slots[1])
      }
      return true
    }
    return false
  }

  async function waitForWindowUpdate (window, slot) {
    if (window.type === 'minecraft:inventory') {
      if (slot >= 1 && slot <= 4) {
        await once(bot.inventory, 'updateSlot:0')
      }
    } else if (window.type === 'minecraft:crafting') {
      if (slot >= 1 && slot <= 9) {
        await once(bot.currentWindow, 'updateSlot:0')
      }
    } else if (window.type === 'minecraft:merchant') {
      const toUpdate = []
      if (slot <= 1 && !window.selectedTrade.tradeDisabled && expectTradeUpdate(window)) {
        toUpdate.push(once(bot.currentWindow, 'updateSlot:2'))
      }
      if (slot === 2) {
        for (const item of bot.currentWindow.containerItems()) {
          toUpdate.push(once(bot.currentWindow, `updateSlot:${item.slot}`))
        }
      }
      await Promise.all(toUpdate)

      if (slot === 2 && !window.selectedTrade.tradeDisabled && expectTradeUpdate(window)) {
        // After the trade goes through, if the inputs are still satisfied,
        // expect another update in slot 2
        await once(bot.currentWindow, 'updateSlot:2')
      }
    }
  }

  function confirmTransaction (windowId, actionId, accepted) {
    // drop the queue entries for all the clicks that the server did not send
    // transaction packets for.
    // Also reject transactions that aren't sent from mineflayer
    let click = windowClickQueue[0]
    if (click === undefined || !windowClickQueue.some(clicks => clicks.id === actionId)) {
      // mimic vanilla client and send a rejection for faulty transaction packets
      bot._client.write('transaction', {
        windowId,
        action: actionId,
        accepted: true
        // bot.emit(`confirmTransaction${click.id}`, false)
      })
      return
    }
    // shift it later if packets are sent out of order
    click = windowClickQueue.shift()

    assert.ok(click.id <= actionId)
    while (actionId > click.id) {
      onAccepted()
      click = windowClickQueue.shift()
    }
    assert.ok(click)

    if (accepted) {
      onAccepted()
    } else {
      onRejected()
    }
    updateHeldItem()

    function onAccepted () {
      const window = windowId === 0 ? bot.inventory : bot.currentWindow
      if (!window || window.id !== click.windowId) return
      const oldSlots = JSON.parse(JSON.stringify(window.slots))
      for (let i = 0; i < oldSlots.length; i++) {
        if (oldSlots[i]) {
          oldSlots[i].durabilityUsed = window.slots[i].durabilityUsed
        }
      }
      acceptClick(window, click)

      const ignoreSlotsUpdate = window.fullUpdateTime && click.time < window.fullUpdateTime
      if (ignoreSlotsUpdate) {
        // accept click only to update selected item (no slots updates)
        window.slots = oldSlots
      }
      bot.emit(`confirmTransaction${click.id}`, true)
    }

    function onRejected () {
      bot._client.write('transaction', {
        windowId: click.windowId,
        action: click.id,
        accepted: true
      })
      bot.emit(`confirmTransaction${click.id}`, false)
    }
  }

  function acceptClick (window, click) {
    const gamemode = bot.player?.gamemode ?? (bot.game.gameMode === 'creative' ? 1 : 0)
    return simulateInventoryClick(window, click, gamemode, bot.inventory)
  }

  async function clickWindow (slot, mouseButton, mode) {
    // if you click on the quick bar and have dug recently,
    // wait a bit
    if (slot >= bot.QUICK_BAR_START && bot.lastDigTime != null) {
      let timeSinceLastDig
      while ((timeSinceLastDig = new Date() - bot.lastDigTime) < DIG_CLICK_TIMEOUT) {
        await sleep(DIG_CLICK_TIMEOUT - timeSinceLastDig)
      }
    }
    const window = bot.currentWindow || bot.inventory

    assert.ok(mode >= 0 && mode <= 6)
    const actionId = createActionNumber()

    const click = {
      slot,
      mouseButton,
      mode,
      id: actionId,
      windowId: window.id,
      item: slot === -999 ? null : window.slots[slot],
      time: Date.now()
    }

    let changedSlots
    if (bot.supportFeature('transactionPacketExists')) {
      windowClickQueue.push(click)
    } else {
      changedSlots = acceptClick(window, click)

      changedSlots = changedSlots.map(slot => {
        return {
          location: slot,
          item: clickItem(window.slots[slot])
        }
      })
    }

    if (bot.supportFeature('stateIdUsed')) { // 1.17.1 +
      bot._client.write('window_click', {
        windowId: window.id,
        stateId,
        slot,
        mouseButton,
        mode,
        changedSlots,
        cursorItem: clickItem(window.selectedItem)
      })
    } else if (bot.supportFeature('actionIdUsed')) { // <= 1.16.5
      bot._client.write('window_click', {
        windowId: window.id,
        slot,
        mouseButton,
        action: actionId,
        mode,
        // protocol expects null even if there is an item at the slot in mode 2 and 4
        item: Item.toNotch((mode === 2 || mode === 4) ? null : click.item)
      })
    } else { // 1.17
      bot._client.write('window_click', {
        windowId: window.id,
        slot,
        mouseButton,
        mode,
        changedSlots,
        cursorItem: clickItem(window.selectedItem)
      })
    }

    if (bot.supportFeature('transactionPacketExists')) {
      const response = once(bot, `confirmTransaction${actionId}`)
      if (!window.transactionRequiresConfirmation(click)) {
        confirmTransaction(window.id, actionId, true)
      }
      const [success] = await withTimeout(response, WINDOW_TIMEOUT)
        .catch(() => {
          throw new Error(`Server didn't respond to transaction for clicking on slot ${slot} on window with id ${window?.id}.`)
        })
      if (!success) {
        throw new Error(`Server rejected transaction for clicking on slot ${slot}, on window with id ${window?.id}.`)
      }
    } else {
      await waitForWindowUpdate(window, slot)
    }
  }

  async function putAway (slot) {
    const window = bot.currentWindow || bot.inventory
    const promisePutAway = once(window, `updateSlot:${slot}`)
    await clickWindow(slot, 0, 0)
    const start = window.inventoryStart
    const end = window.inventoryEnd
    await putSelectedItemRange(start, end, window, null)
    await promisePutAway
  }

  async function moveSlotItem (sourceSlot, destSlot) {
    await clickWindow(sourceSlot, 0, 0)
    await clickWindow(destSlot, 0, 0)
    // if we're holding an item, put it back where the source item was.
    // otherwise we're done.
    updateHeldItem()
    if (bot.inventory.selectedItem) {
      await clickWindow(sourceSlot, 0, 0)
    }
  }

  bot._client.on('transaction', (packet) => {
    // confirm transaction
    confirmTransaction(packet.windowId, packet.action, packet.accepted)
  })

  bot._client.on('held_item_slot', (packet) => {
    // the server selects a slot (ClientPacketListener.handleSetHeldSlot): the client answers only as its next tick
    // finds the slot is not the one it last sent
    bot._selectQuickBarSlotBeforeTick(packet.slot)
  })

  function prepareWindow (window) {
    if (!windowItems || window.id !== windowItems.windowId) {
      // don't emit windowOpen until we have the slot data
      bot.once(`setWindowItems:${window.id}`, () => {
        extendWindow(window)
        bot.emit('windowOpen', window)
      })
    } else {
      for (let i = 0; i < windowItems.items.length; ++i) {
        const item = Item.fromNotch(windowItems.items[i])
        window.updateSlot(i, item)
      }
      updateHeldItem()
      extendWindow(window)
      bot.emit('windowOpen', window)
    }
  }

  bot._client.on('open_window', (packet) => {
    // open window
    bot.currentWindow = windows.createWindow(packet.windowId,
      packet.inventoryType, packet.windowTitle, packet.slotCount)
    prepareWindow(bot.currentWindow)
  })
  bot._client.on('open_horse_window', (packet) => {
    // open window
    bot.currentWindow = windows.createWindow(packet.windowId,
      'HorseWindow', 'Horse', packet.nbSlots)
    prepareWindow(bot.currentWindow)
  })
  bot._client.on('close_window', (packet) => {
    // close window
    const oldWindow = bot.currentWindow
    bot.currentWindow = null
    bot.emit('windowClose', oldWindow)
  })
  bot._client.on('login', () => {
    // close window when switch subserver
    const oldWindow = bot.currentWindow
    if (!oldWindow) return
    bot.currentWindow = null
    bot.emit('windowClose', oldWindow)
  })
  bot._setSlot = (slotId, newItem, window = bot.inventory) => {
    // set slot
    const oldItem = window.slots[slotId]
    window.updateSlot(slotId, newItem)
    updateHeldItem()
    bot.emit(`setSlot:${window.id}`, oldItem, newItem)
  }
  bot._client.on('set_slot', (packet) => {
    const window = packet.windowId === 0 ? bot.inventory : bot.currentWindow
    if (!window || window.id !== packet.windowId) return
    const newItem = Item.fromNotch(packet.item)
    // very hacky solution. if the server doesnt send the slots in the proper order, then the window will still never emit 'windowOpen'
    if (bot.currentWindow && packet.slot === bot.currentWindow.slots.length - 1) {
      // window is probably ready
      bot.emit(`setWindowItems:${window.id}`)
    }
    bot._setSlot(packet.slot, newItem, window)
  })
  // 1.21.9+ uses set_player_inventory for server-initiated inventory changes
  // (e.g. console /give) instead of set_slot
  bot._client.on('set_player_inventory', (packet) => {
    const newItem = Item.fromNotch(packet.contents)
    bot._setSlot(packet.slotId, newItem)
  })
  bot.inventory.on('updateSlot', (index) => {
    if (index === bot.quickBarSlot + bot.inventory.hotbarStart) {
      bot.emit('heldItemChanged', bot.heldItem)
    }
  })
  bot._client.on('window_items', (packet) => {
    const window = packet.windowId === 0 ? bot.inventory : bot.currentWindow
    if (!window || window.id !== packet.windowId) {
      windowItems = packet
      return
    }

    // set window items
    for (let i = 0; i < packet.items.length; ++i) {
      const item = Item.fromNotch(packet.items[i])
      window.updateSlot(i, item)
    }
    updateHeldItem()
    bot.emit(`setWindowItems:${window.id}`)
    window.fullUpdateTime = Date.now()
  })

  /**
   * Convert a vector direction to minecraft packet number direction
   * @param {Vec3} v
   * @returns {number}
   */
  function vectorToDirection (v) {
    if (v.y < 0) {
      return 0
    } else if (v.y > 0) {
      return 1
    } else if (v.z < 0) {
      return 2
    } else if (v.z > 0) {
      return 3
    } else if (v.x < 0) {
      return 4
    } else if (v.x > 0) {
      return 5
    }
    assert.ok(false, `invalid direction vector ${v}`)
  }

  bot.activateBlock = activateBlock
  bot.activateEntity = activateEntity
  bot.activateEntityAt = activateEntityAt
  bot.consume = consume
  bot.activateItem = activateItem
  bot.deactivateItem = deactivateItem

  // not really in the public API
  bot.clickWindow = clickWindow
  bot.putSelectedItemRange = putSelectedItemRange
  bot.putAway = putAway
  bot.closeWindow = closeWindow
  bot.transfer = transfer
  bot.openBlock = openBlock
  bot.openEntity = openEntity
  bot.moveSlotItem = moveSlotItem
  bot.updateHeldItem = updateHeldItem
}
