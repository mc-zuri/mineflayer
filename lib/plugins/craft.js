const assert = require('assert')

module.exports = inject

function inject (bot) {
  const Item = require('prismarine-item')(bot.registry)
  const Recipe = require('prismarine-recipe')(bot.registry).Recipe
  let windowCraftingTable

  // From 1.17.1 a click sent with a state id behind the server's (a change of the server's on its way as the click went:
  // an item picked up, food eaten) is played all the same and answered with the whole menu as it is then
  // (ServerGamePacketListenerImpl.handleContainerClick: broadcastFullState). That menu takes the place of what the
  // clicks sent after it made of the client's, and the craft's next clicks went from a grid and a cursor that were not
  // the server's: the logs taken for an ingredient were not found again ('missing ingredient'), or no craft was made.
  // The whole menus of the craft's window are counted; a craft that gets one makes no click more from its prediction
  // and goes on from the server's menu (resyncMenu).
  class StaleMenu extends Error {}
  let fullStates = 0
  const craftWindow = () => windowCraftingTable ?? bot.inventory
  bot._client.on('window_items', (packet) => {
    if (bot.supportFeature('stateIdUsed') && packet.windowId === craftWindow().id) fullStates++
  })

  async function craft (recipe, count, craftingTable) {
    assert.ok(recipe)
    count = parseInt(count ?? 1, 10)
    if (recipe.requiresTable && !craftingTable) {
      throw new Error('Recipe requires craftingTable, but one was not supplied: ' + JSON.stringify(recipe))
    }

    // the player's own grid is the inventory screen's, which vanilla's player opens to craft in it and closes after
    // (InventoryScreen: bot.openInventoryScreen); one opened already (by the caller) is left open
    const screen = !craftingTable && !bot.currentWindow && !bot.inventoryScreenOpen
    if (screen) bot.openInventoryScreen()
    try {
      const base = resultCount(bot.inventory, recipe)
      let stale = 0
      for (let i = 0; i < count;) {
        try {
          await craftOnce(recipe, craftingTable)
          i++
        } catch (err) {
          if (!(err instanceof StaleMenu)) throw err
          // the crafts made are those whose results the server's menu shows
          const window = craftWindow()
          await resyncMenu(window, craftingTable ? 3 : 2)
          const made = Math.floor((resultCount(window, recipe) - base) / recipe.result.count)
          stale = made > i ? 0 : stale + 1
          if (stale > 4) throw new Error('the server\'s menu kept changing during the craft')
          i = Math.max(i, made)
        }
      }

      if (windowCraftingTable) {
        bot.closeWindow(windowCraftingTable)
        windowCraftingTable = undefined
      }
      if (screen) bot.closeInventoryScreen()
    } catch (err) {
      if (windowCraftingTable) {
        bot.closeWindow(windowCraftingTable)
        windowCraftingTable = undefined
      }
      if (screen) bot.closeInventoryScreen()
      throw new Error(err)
    }
  }

  async function craftOnce (recipe, craftingTable) {
    if (craftingTable) {
      if (!windowCraftingTable) {
        windowCraftingTable = await bot._useBlockToOpen(craftingTable)
      }
      if (!windowCraftingTable.type.startsWith('minecraft:crafting')) {
        throw new Error('crafting: non craftingTable used as craftingTable: ' + windowCraftingTable.type)
      }
      await startClicking(windowCraftingTable, 3, 3)
    } else {
      await startClicking(bot.inventory, 2, 2)
    }

    async function startClicking (window, w, h) {
      const states = fullStates
      // a whole menu came: no click more from the prediction it replaced
      const checkStale = () => {
        if (fullStates !== states) throw new StaleMenu('the server sent the whole menu during the craft')
      }
      const click = async (slot, mouseButton, mode) => {
        checkStale()
        await bot.clickWindow(slot, mouseButton, mode)
      }
      const extraSlots = unusedRecipeSlots()
      let ingredientIndex = 0
      let originalSourceSlot = null
      let it
      if (recipe.inShape) {
        it = {
          x: 0,
          y: 0,
          row: recipe.inShape[0]
        }
        await clickShape()
      } else {
        await nextIngredientsClick()
      }

      function incrementShapeIterator () {
        it.x += 1
        if (it.x >= it.row.length) {
          it.y += 1
          if (it.y >= recipe.inShape.length) return null
          it.x = 0
          it.row = recipe.inShape[it.y]
        }
        return it
      }

      async function nextShapeClick () {
        if (incrementShapeIterator()) {
          await clickShape()
        } else if (!recipe.ingredients) {
          await putMaterialsAway()
        } else {
          await nextIngredientsClick()
        }
      }

      async function clickShape () {
        const destSlot = slot(it.x, it.y)
        const ingredient = it.row[it.x]
        if (ingredient.id === -1) return nextShapeClick()
        if (!window.selectedItem || window.selectedItem.type !== ingredient.id ||
          (ingredient.metadata != null &&
            window.selectedItem.metadata !== ingredient.metadata)) {
          // we are not holding the item we need. click it.
          checkStale()
          const sourceItem = window.findInventoryItem(ingredient.id, ingredient.metadata)
          if (!sourceItem) throw new Error('missing ingredient')
          if (originalSourceSlot == null) originalSourceSlot = sourceItem.slot
          await click(sourceItem.slot, 0, 0)
        }
        await click(destSlot, 1, 0)
        await nextShapeClick()
      }

      async function nextIngredientsClick () {
        const ingredient = recipe.ingredients[ingredientIndex]
        const destSlot = extraSlots.pop()
        if (!window.selectedItem || window.selectedItem.type !== ingredient.id ||
          (ingredient.metadata != null &&
            window.selectedItem.metadata !== ingredient.metadata)) {
          // we are not holding the item we need. click it.
          checkStale()
          const sourceItem = window.findInventoryItem(ingredient.id, ingredient.metadata)
          if (!sourceItem) throw new Error('missing ingredient')
          if (originalSourceSlot == null) originalSourceSlot = sourceItem.slot
          await click(sourceItem.slot, 0, 0)
        }
        await click(destSlot, 1, 0)
        if (++ingredientIndex < recipe.ingredients.length) {
          await nextIngredientsClick()
        } else {
          await putMaterialsAway()
        }
      }

      async function putMaterialsAway () {
        const start = window.inventoryStart
        const end = window.inventoryEnd
        checkStale()
        await bot.putSelectedItemRange(start, end, window, originalSourceSlot)
        await grabResult()
      }

      async function grabResult () {
        checkStale()
        assert.strictEqual(window.selectedItem, null)
        // From 1.17 the take of the result (ResultSlot.onTake) takes one from each stack of the grid, and each change of
        // the grid sends the result slot anew (CraftingMenu.slotChangedCraftingGrid, each with a new state id from
        // 1.17.1). Those are waited for before the next click: one sent with a state id behind the server's is answered
        // with the whole menu as it was then (broadcastFullState), which undoes the clicks the bot made since, and a
        // result update still to come would end the wait of the next click in the grid early.
        const gridChanges = window.slots.slice(1, w * h + 1).filter(item => item != null).length
        const resultUpdates = waitForResultUpdates(window, gridChanges)
        // Causes a double-emit on 1.12+ --nickelpro
        // put the recipe result in the output
        const item = new Item(recipe.result.id, recipe.result.count, recipe.result.metadata)
        window.updateSlot(0, item)
        await click(0, 0, 0)
        await resultUpdates
        checkStale()
        await bot.putSelectedItemRange(window.inventoryStart, window.inventoryEnd, window, null)
        await updateOutShape()
        // (a whole menu that answered the last clicks: the grid and the cursor are the server's to say)
        checkStale()
      }

      async function updateOutShape () {
        if (!recipe.outShape) {
          for (let i = 1; i <= w * h; i++) {
            window.updateSlot(i, null)
          }
          return
        }
        const slotsToClick = []
        for (let y = 0; y < recipe.outShape.length; ++y) {
          const row = recipe.outShape[y]
          for (let x = 0; x < row.length; ++x) {
            const _slot = slot(x, y)
            let item = null
            if (row[x].id !== -1) {
              item = new Item(row[x].id, row[x].count, row[x].metadata || null)
              slotsToClick.push(_slot)
            }
            window.updateSlot(_slot, item)
          }
        }
        for (const _slot of slotsToClick) {
          checkStale()
          await bot.putAway(_slot)
        }
      }

      function slot (x, y) {
        return 1 + x + w * y
      }

      function unusedRecipeSlots () {
        const result = []
        let x
        let y
        let row
        if (recipe.inShape) {
          for (y = 0; y < recipe.inShape.length; ++y) {
            row = recipe.inShape[y]
            for (x = 0; x < row.length; ++x) {
              if (row[x].id === -1) result.push(slot(x, y))
            }
            for (; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
          for (; y < h; ++y) {
            for (x = 0; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
        } else {
          for (y = 0; y < h; ++y) {
            for (x = 0; x < w; ++x) {
              result.push(slot(x, y))
            }
          }
        }
        return result
      }
    }
  }

  // the count of the recipe's result in the window's inventory slots and on its cursor
  function resultCount (window, recipe) {
    let n = window.selectedItem?.type === recipe.result.id ? window.selectedItem.count : 0
    for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
      if (window.slots[i]?.type === recipe.result.id) n += window.slots[i].count
    }
    return n
  }

  // The window as the server has it after every click of the craft, and what its grid and its cursor hold put back into
  // the inventory. The answers to the craft's clicks still on their way come first, and the server answers one click
  // more with the whole menu after them: one on no slot (-1, which AbstractContainerMenu.doClick passes over) with a
  // state id behind its own. The menu is the server's once a whole one came and no other for 2 ticks.
  async function resyncMenu (window, size) {
    const synced = new Promise((resolve) => {
      let ticks = 0
      let quiet = -1
      const done = () => {
        bot._client.removeListener('window_items', onItems)
        bot.removeListener('physicsTick', onTick)
        resolve()
      }
      const onItems = (packet) => { if (packet.windowId === window.id) quiet = 0 }
      const onTick = () => {
        if (++ticks >= 40 || (quiet >= 0 && ++quiet >= 2)) done()
      }
      bot._client.on('window_items', onItems)
      bot.on('physicsTick', onTick)
    })
    bot._client.write('window_click', {
      windowId: window.id,
      stateId: (window.stateId ?? 0) - 1,
      slot: -1,
      mouseButton: 0,
      mode: 0,
      changedSlots: [],
      // the empty cursor: no stack from 1.21.5 (HashedStack.EMPTY), an empty slot before
      cursorItem: bot.registry.version['>=']('1.21.5') ? undefined : Item.toNotch(null)
    })
    await synced
    if (window.selectedItem) await bot.putSelectedItemRange(window.inventoryStart, window.inventoryEnd, window, null)
    for (let i = 1; i <= size * size; i++) {
      if (window.slots[i]) await bot.putAway(i)
    }
  }

  // The server's updates of the result slot of the crafting window, `count` of them, or as many as come within 20 ticks
  // (before 1.17 each click is confirmed by its transaction instead)
  function waitForResultUpdates (window, count) {
    if (count <= 0 || bot.supportFeature('transactionPacketExists')) return Promise.resolve()
    return new Promise((resolve) => {
      let ticks = 0
      const done = () => {
        bot._client.removeListener('set_slot', onSetSlot)
        bot.removeListener('physicsTick', onTick)
        resolve()
      }
      const onSetSlot = (packet) => {
        if (packet.windowId === window.id && packet.slot === 0 && --count <= 0) done()
      }
      const onTick = () => {
        if (++ticks >= 20) done()
      }
      bot._client.on('set_slot', onSetSlot)
      bot.on('physicsTick', onTick)
    })
  }

  function recipesFor (itemType, metadata, minResultCount, craftingTable) {
    minResultCount = minResultCount ?? 1
    const results = []
    Recipe.find(itemType, metadata).forEach((recipe) => {
      if (requirementsMetForRecipe(recipe, minResultCount, craftingTable)) {
        results.push(recipe)
      }
    })
    return results
  }

  function recipesAll (itemType, metadata, craftingTable) {
    const results = []
    Recipe.find(itemType, metadata).forEach((recipe) => {
      if (!recipe.requiresTable || craftingTable) {
        results.push(recipe)
      }
    })
    return results
  }

  function requirementsMetForRecipe (recipe, minResultCount, craftingTable) {
    if (recipe.requiresTable && !craftingTable) return false

    // how many times we have to perform the craft to achieve minResultCount
    const craftCount = Math.ceil(minResultCount / recipe.result.count)

    // false if not enough inventory to make all the ones that we want
    for (let i = 0; i < recipe.delta.length; ++i) {
      const d = recipe.delta[i]
      if (bot.inventory.count(d.id, d.metadata) + d.count * craftCount < 0) return false
    }

    // otherwise true
    return true
  }

  bot.craft = craft
  bot.recipesFor = recipesFor
  bot.recipesAll = recipesAll
}
