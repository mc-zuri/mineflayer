/* eslint-env mocha */
// The container clicks and screen actions the bot sends, as vanilla's client sends them (AbstractContainerMenu,
// MultiPlayerGameMode.handleInventoryMouseClick and the screens' own packets), against a fake server.

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')
const { Vec3 } = require('vec3')

// A bot of the version against a fake server that confirms every click before 1.17 (ClientboundContainerAckPacket)
async function clickingBot (version, options = {}) {
  // (a block in the chunk: an empty one does not load before 1.17)
  const t = await fakeServerBot(version, { blocks: [[0, 64, 0, 'stone']], ...options })
  if (!t.registry.version['>=']('1.17')) {
    t.client.on('window_click', (packet) => {
      t.client.write('transaction', { windowId: packet.windowId, action: packet.action, accepted: true })
    })
  }
  t.Item = require('prismarine-item')(t.registry)
  t.windows = require('prismarine-windows')(t.registry)
  t.item = (name, count = 1) => new t.Item(t.registry.itemsByName[name].id, count)
  // a click, not waited on (before 1.17 the fake server confirms it; from 1.17 no slot update follows)
  t.click = async (slot, mouseButton, mode) => {
    t.bot.clickWindow(slot, mouseButton, mode).catch(() => {})
    await sleep(50)
  }
  t.clicks = () => t.written.filter(p => p.name === 'window_click').map(p => p.data)
  return t
}

describe('container clicks (AbstractContainerMenu, MultiPlayerGameMode.handleInventoryMouseClick)', function () {
  this.timeout(20 * 1000)

  it('a screen closed leaves the inventory with the stacks it showed, their components too: a potion brewed where a water bottle was (the menus share the one Inventory)', async () => {
    for (const version of ['1.20.6', '1.21.11', '26.3']) {
      const t = await clickingBot(version)
      try {
        const potion = (id) => t.Item.toNotch(t.Item.fromNotch({ itemId: t.registry.itemsByName.potion.id, itemCount: 1, components: [{ type: 'potion_contents', data: { potionId: id, customEffects: [] } }], removeComponents: [] }))
        const empty = t.Item.toNotch(null)
        const inventory = new Array(46).fill(empty)
        inventory[36] = potion(0)
        t.client.write('window_items', { windowId: 0, stateId: 40, items: inventory, carriedItem: empty })
        await sleep(50)
        const title = t.registry.version['>=']('1.20.3') ? { type: 'string', value: 'Chest' } : JSON.stringify({ text: 'Chest' })
        const opened = new Promise(resolve => t.bot.once('windowOpen', resolve))
        t.client.write('open_window', { windowId: 1, inventoryType: 2, windowTitle: title })
        // the hotbar's first slot (the chest's 54) a potion of fire resistance now
        const shown = [...new Array(27).fill(empty), ...inventory.slice(9, 45)]
        shown[54] = potion(11)
        t.client.write('window_items', { windowId: 1, stateId: 1, items: shown, carriedItem: empty })
        await opened
        await sleep(50)
        t.bot.closeWindow(t.bot.currentWindow)
        assert.strictEqual(t.bot.inventory.slots[36]?.componentMap.get('potion_contents')?.data.potionId, 11, version)
      } finally {
        await t.close()
      }
    }
  })

  it('component hashes: CRC32C over HashOps, as vanilla\'s HashedPatchMap hashes them', () => {
    const componentHash = require('../lib/component_hash')
    // CRC32C's check value (Guava's Hashing.crc32c), as a signed int
    assert.strictEqual(componentHash.crc32c(Buffer.from('123456789')), 0xE3069283 | 0)
    const hash = componentHash(require('prismarine-registry')('1.21.11'))
    // the hashes vanilla 1.21.11 and 26.1 clients sent in their container clicks (the recordings' cov_containers):
    // an anvil's renamed sword, a sword with Sharpness I, an anvil's repair cost of 1
    assert.strictEqual(hash({ type: 'custom_name', data: { type: 'string', value: 'Renamed Blade' } }), 1637761081)
    assert.strictEqual(hash({ type: 'custom_name', data: 'Blade' }), -1613705431)
    const sharpness = require('prismarine-registry')('1.21.11').enchantmentsByName.sharpness.id
    assert.strictEqual(hash({ type: 'enchantments', data: { enchantments: [{ id: sharpness, level: 1 }] } }), -1201233444)
    assert.strictEqual(hash({ type: 'stored_enchantments', data: { enchantments: [{ id: sharpness, level: 1 }] } }), -1201233444)
    assert.strictEqual(hash({ type: 'repair_cost', data: 1 }), 1565579036)
    // a component whose codec is not known here has no hash
    assert.strictEqual(hash({ type: 'lore', data: [] }), undefined)
  })

  it('from 1.21.5 a click sends each added component of a stack as its hash (HashedStack)', async () => {
    const t = await clickingBot('1.21.11')
    try {
      const sword = t.Item.fromNotch({
        itemId: t.registry.itemsByName.diamond_sword.id,
        itemCount: 1,
        components: [{ type: 'custom_name', data: { type: 'string', value: 'Renamed Blade' } }],
        removeComponents: []
      })
      t.bot.inventory.updateSlot(36, sword)
      await t.click(36, 0, 0)
      const [click] = t.clicks()
      assert.deepStrictEqual(click.changedSlots.map(c => [c.location, c.item ?? null]), [[36, null]])
      assert.deepStrictEqual(click.cursorItem.components, [{ type: 'custom_name', hash: 1637761081 }])
    } finally {
      await t.close()
    }
  })

  it('before 1.17 a click is played on the menu at once: a next click before the server answers starts from it', async () => {
    // (m_c_open_horse_riding on 1.13.2: the saddle picked up and put back before the server confirmed the pick up)
    for (const version of ['1.8.8', '1.13.2', '1.16.5']) {
      const t = await fakeServerBot(version, { blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.stone.id, 1))
        t.bot.clickWindow(36, 0, 0).catch(() => {})
        t.bot.clickWindow(36, 0, 0).catch(() => {})
        await sleep(50)
        const clicks = t.written.filter(p => p.name === 'window_click').map(p => p.data)
        const present = item => version === '1.8.8' ? item.blockId !== -1 : item.present
        // the pick up carries the stone the slot held, the put back the empty slot it found
        assert.deepStrictEqual(clicks.map(c => [c.slot, present(c.item)]), [[36, true], [36, false]], version)
        assert.strictEqual(t.bot.inventory.slots[36]?.name, 'stone', version)
      } finally {
        await t.close()
      }
    }
  })

  it('before 1.17 each menu numbers its own clicks from 1 (AbstractContainerMenu transaction ids)', async () => {
    const t = await clickingBot('1.12.2')
    try {
      await t.click(36, 0, 0)
      await t.click(36, 0, 0)
      // a crafting table's menu opened: its clicks count from 1
      t.bot.currentWindow = t.windows.createWindow(1, 'minecraft:crafting_table', 'Crafting')
      await t.click(1, 0, 0)
      await t.click(1, 0, 0)
      // closed: the player's inventory menu goes on with its own count
      t.bot.currentWindow = null
      await t.click(36, 0, 0)
      assert.deepStrictEqual(t.clicks().map(c => [c.windowId, c.action]), [[0, 1], [0, 2], [1, 1], [1, 2], [0, 3]])
    } finally {
      await t.close()
    }
  })

  it('before 1.17 a click carries the stack the menu returns from it (AbstractContainerMenu.clicked)', async () => {
    for (const version of ['1.8.8', '1.10.2', '1.12.2']) {
      const t = await clickingBot(version)
      try {
        const dirt = t.registry.itemsByName.dirt.id
        // a quick move that takes the whole stack: before 1.12 the stack moved (Container.slotClick keeps what
        // transferStackInSlot returned), from 1.12 nothing (no same item left in the slot)
        t.bot.inventory.updateSlot(36, t.item('dirt', 5))
        await t.click(36, 0, 1)
        // a pick up: the slot's stack as it was
        t.bot.inventory.updateSlot(37, t.item('dirt', 3))
        await t.click(37, 0, 0)
        // a double click (PICKUP_ALL): nothing
        await t.click(38, 0, 6)
        const items = t.clicks().map(c => c.item.blockId === -1 ? null : [c.item.blockId, c.item.itemCount])
        assert.deepStrictEqual(items, [version !== '1.12.2' ? [dirt, 5] : null, [dirt, 3], null], version)
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.17 a click lists its changed slots in the order of vanilla\'s Int2ObjectOpenHashMap', async () => {
    const t = await clickingBot('1.20.4')
    try {
      for (const slot of [9, 10, 11, 12, 13, 30]) t.bot.inventory.updateSlot(slot, t.item('dirt', 60))
      t.bot.inventory.updateSlot(36, t.item('dirt', 64))
      // a quick move of the hotbar's stack: onto 9 - 13 and 30, the rest into 14
      await t.click(36, 0, 1)
      const [click] = t.clicks()
      // (fastutil's iteration: the table of 32 from its last bucket down, keys placed by HashCommon.mix)
      assert.deepStrictEqual(click.changedSlots.map(c => c.location), [14, 12, 13, 9, 11, 10, 30, 36])
    } finally {
      await t.close()
    }
  })

  it('1.16 - 26.2 a click that drops out of the screen swings the arm first (LivingEntity.drop)', async () => {
    for (const version of ['1.15.2', '1.16.5', '1.20.4', '26.3']) {
      const t = await clickingBot(version)
      try {
        const swings = t.registry.version['>=']('1.16') && !t.registry.version['>=']('26.3')
        const relevant = () => t.names(/^(window_click|arm_animation|punch)$/)
        // the drop key on a slot
        t.bot.inventory.updateSlot(36, t.item('dirt', 5))
        await t.click(36, 0, 4)
        assert.deepStrictEqual(relevant(), swings ? ['arm_animation', 'window_click'] : ['window_click'], version)
        // the carried stack clicked outside the screen
        t.written.length = 0
        t.bot.inventory.updateSlot(37, t.item('dirt', 5))
        await t.click(37, 0, 0)
        await t.click(-999, 0, 0)
        assert.deepStrictEqual(relevant(), swings ? ['window_click', 'arm_animation', 'window_click'] : ['window_click', 'window_click'], version)
      } finally {
        await t.close()
      }
    }
  })

  it('a mount\'s screen takes in its saddle and armor slots what the mount wears (Slot.mayPlace)', async () => {
    const t = await clickingBot('1.20.4')
    try {
      const Entity = require('prismarine-entity')(t.registry)
      const open = async (id, name) => {
        const mount = new Entity(id)
        mount.name = name
        t.bot.entities[id] = mount
        t.client.write('open_horse_window', { windowId: id, nbSlots: 2, entityId: id })
        await sleep(50)
        return t.bot.currentWindow
      }
      const horse = await open(50, 'horse')
      assert.strictEqual(horse.mayPlace(0, t.item('saddle')), true)
      assert.strictEqual(horse.mayPlace(0, t.item('dirt')), false)
      assert.strictEqual(horse.mayPlace(1, t.item('iron_horse_armor')), true)
      assert.strictEqual(horse.mayPlace(1, t.item('white_carpet')), false)
      const llama = await open(51, 'llama')
      assert.strictEqual(llama.mayPlace(0, t.item('saddle')), false)
      assert.strictEqual(llama.mayPlace(1, t.item('white_carpet')), true)
      const donkey = await open(52, 'donkey')
      assert.strictEqual(donkey.mayPlace(1, t.item('iron_horse_armor')), false)
    } finally {
      await t.close()
    }
  })

  it('the screen of a mount has the saddle, the armor and the chest before the player slots, as its packet counts them', async () => {
    // a donkey with a chest (15 slots) and a horse: the inventory's size to 1.20.4, without the armor on 1.20.5 - 1.20.6,
    // the chest's columns from 1.21 (the recorded vanilla servers' counts)
    for (const [version, donkey, horse] of [['1.16.5', 17, 2], ['1.20.4', 17, 2], ['1.20.6', 16, 1], ['1.21.1', 5, 0], ['1.21.5', 5, 0], ['26.1', 5, 0]]) {
      const t = await clickingBot(version)
      try {
        const starts = []
        for (const [id, nbSlots] of [[60, donkey], [61, horse]]) {
          t.client.write('open_horse_window', { windowId: id, nbSlots, entityId: id })
          await sleep(50)
          starts.push([t.bot.currentWindow.inventoryStart, t.bot.currentWindow.slots.length])
        }
        assert.deepStrictEqual(starts, [[17, 53], [2, 38]], version)
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.21.5 the saddle slot of a mount\'s screen is the saddle the mount wears (EquipmentSlot.SADDLE)', async () => {
    const t = await clickingBot('1.21.5')
    try {
      const Entity = require('prismarine-entity')(t.registry)
      const horse = new Entity(50)
      horse.name = 'horse'
      t.bot.entities[50] = horse
      t.client.write('open_horse_window', { windowId: 3, nbSlots: 2, entityId: 50 })
      await sleep(50)
      t.bot.currentWindow.updateSlot(0, t.item('saddle'))
      assert.strictEqual(horse.equipment[7]?.name, 'saddle')
      t.bot.currentWindow.updateSlot(0, null)
      assert.ok(!horse.equipment[7])
    } finally {
      await t.close()
    }
  })

  it('a mount\'s screen shows what it wears from its opening: its body armor from 1.20.5, its saddle from 1.21.5 (AbstractHorse.getBodyArmorAccess, createEquipmentSlotContainer)', async () => {
    for (const [version, armor, saddle] of [['1.20.4', false, false], ['1.20.6', true, false], ['1.21.5', true, true]]) {
      const t = await clickingBot(version)
      try {
        const Entity = require('prismarine-entity')(t.registry)
        const horse = new Entity(50)
        horse.name = 'horse'
        horse.equipment[6] = t.item('iron_horse_armor')
        horse.equipment[7] = t.item('saddle')
        t.bot.entities[50] = horse
        t.client.write('open_horse_window', { windowId: 3, nbSlots: 2, entityId: 50 })
        await sleep(50)
        const window = t.bot.currentWindow
        assert.deepStrictEqual([window.slots[0]?.name ?? null, window.slots[1]?.name ?? null], [saddle ? 'saddle' : null, armor ? 'iron_horse_armor' : null], version)
      } finally {
        await t.close()
      }
    }
  })

  // a 1.16.5 merchant screen open (however it was opened) with its offers
  async function merchantBot () {
    const t = await clickingBot('1.16.5')
    t.bot.currentWindow = t.windows.createWindow(5, t.windows.windows['minecraft:merchant'].type, 'Villager')
    const slot = (name, count) => ({ present: true, itemId: t.registry.itemsByName[name].id, itemCount: count })
    const offer = (input, output) => ({ inputItem1: slot(input, 1), outputItem: slot(output, 1), inputItem2: undefined, tradeDisabled: false, nbTradeUses: 0, maximumNbTradeUses: 12, xp: 1, specialPrice: 0, priceMultiplier: 0.05, demand: 0 })
    t.offers = () => {
      t.client.write('trade_list', {
        windowId: 5,
        trades: [offer('emerald', 'bread'), offer('wheat', 'emerald')],
        villagerLevel: 1,
        experience: 0,
        isRegularVillager: true,
        canRestock: true
      })
      return sleep(50)
    }
    return t
  }

  it('a merchant screen takes the offers the server sends it, its selection at the first (ClientSideMerchant)', async () => {
    const t = await merchantBot()
    try {
      await t.offers()
      const window = t.bot.currentWindow
      assert.deepStrictEqual(window.trades.map(trade => trade.outputItem.name), ['bread', 'emerald'])
      assert.strictEqual(window.selectedTrade, window.trades[0])
    } finally {
      await t.close()
    }
  })

  it('bot.selectTrade picks the offer in the open merchant screen (MerchantMenu.setSelectionHint)', async () => {
    const t = await merchantBot()
    try {
      await t.offers()
      t.bot.selectTrade(1)
      const window = t.bot.currentWindow
      assert.strictEqual(window.selectedTrade, window.trades[1])
      await sleep(50)
      assert.deepStrictEqual(t.written.filter(p => p.name === 'select_trade').map(p => p.data.slot), [1])
      // the offers again (as after a trade): the selection stays where it was
      await t.offers()
      assert.strictEqual(window.selectedTrade, window.trades[1])
    } finally {
      await t.close()
    }
  })

  it('from 1.12 the result of a trade taken by a quick move carries its stack when the payment pays for it again (AbstractContainerMenu.clicked)', async () => {
    for (const emeralds of [1, 3]) {
      const t = await merchantBot()
      try {
        await t.offers()
        const window = t.bot.currentWindow
        window.updateSlot(0, t.item('emerald', emeralds))
        window.updateSlot(2, t.item('bread', 1))
        await t.click(2, 0, 1)
        // the result there again after the first trade: the quick move goes on, and the click carries the result
        const [click] = t.clicks()
        assert.deepStrictEqual(click.item.present ? [click.item.itemId, click.item.itemCount] : null, emeralds > 1 ? [t.registry.itemsByName.bread.id, 1] : null, `${emeralds}`)
      } finally {
        await t.close()
      }
    }
  })

  it('the server sets the stack on the cursor (setCarried): set_slot -1 -1, set_cursor_item from 1.21.2, window_items from 1.17', async () => {
    for (const version of ['1.16.5', '1.20.4', '1.21.4']) {
      const t = await clickingBot(version)
      try {
        const notch = (name, count) => t.Item.toNotch(t.item(name, count))
        if (t.bot.registry.version['>=']('1.21.2')) t.client.write('set_cursor_item', { contents: notch('dirt', 3) })
        else t.client.write('set_slot', { windowId: -1, stateId: 1, slot: -1, item: notch('dirt', 3) })
        await sleep(50)
        assert.deepStrictEqual([t.bot.inventory.selectedItem?.name, t.bot.inventory.selectedItem?.count], ['dirt', 3], version)
        if (t.bot.registry.version['>=']('1.17')) {
          t.client.write('window_items', { windowId: 0, stateId: 2, items: new Array(46).fill(t.Item.toNotch(null)), carriedItem: notch('stone', 5) })
          await sleep(50)
          assert.deepStrictEqual([t.bot.inventory.selectedItem?.name, t.bot.inventory.selectedItem?.count], ['stone', 5], version)
        }
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.21.2 the server sets a slot of the player\'s inventory by its index in the Inventory: the hotbar 0 - 8, the armor 36 - 39 from the feet, the off hand 40 (ClientPacketListener.handleSetPlayerInventory)', async () => {
    for (const version of ['1.21.4', '1.21.11', '26.3']) {
      const t = await clickingBot(version)
      try {
        const set = (slotId, name, count) => t.client.write('set_player_inventory', { slotId, contents: t.Item.toNotch(t.item(name, count)) })
        // (what the grid held, put back as the inventory screen closed: Inventory.placeItemBackInInventory)
        set(2, 'oak_log', 61)
        set(20, 'dirt', 3)
        set(36, 'iron_boots', 1)
        set(39, 'iron_helmet', 1)
        set(40, 'shield', 1)
        await sleep(50)
        const items = t.bot.inventory.slots.map((item, slot) => item ? `${slot} ${item.name} ${item.count}` : null).filter(Boolean)
        assert.deepStrictEqual(items, ['5 iron_helmet 1', '8 iron_boots 1', '20 dirt 3', '38 oak_log 61', '45 shield 1'], version)
      } finally {
        await t.close()
      }
    }
  })

  it('a creative slot set again before the server answered is sent again, as the creative screen sends every change', async () => {
    for (const version of ['1.20.4', '1.21.4']) {
      const t = await fakeServerBot(version, { gameMode: 'creative', blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        const diamond = new Item(t.registry.itemsByName.diamond.id, 64)
        // (the server answers each a while after: a set_slot of the item, before 1.21.3)
        if (!t.bot.supportFeature('noAckOnCreateSetSlotPacket')) {
          t.client.on('set_creative_slot', ({ slot, item }) => setTimeout(() => t.client.write('set_slot', { windowId: 0, stateId: 1, slot, item }), 100))
        }
        const first = t.bot.creative.setInventorySlot(36, diamond)
        const second = t.bot.creative.setInventorySlot(36, null)
        await Promise.all([first, second])
        assert.deepStrictEqual(t.written.filter(p => p.name === 'set_creative_slot').map(p => p.data.item.itemCount ?? p.data.item.present), [64, version === '1.20.4' ? false : 0], version)
        assert.strictEqual(t.bot.inventory.slots[36], null, version)
      } finally {
        await t.close()
      }
    }
  })

  it('bot.writeBook and bot.signBook send the book as the editor saves it (ServerboundEditBookPacket)', async () => {
    for (const version of ['1.14.4', '1.16.5', '1.20.4']) {
      const t = await clickingBot(version)
      try {
        t.bot.inventory.updateSlot(36, t.item('writable_book'))
        t.bot.setQuickBarSlot(0)
        t.bot.writeBook(36, ['First page', 'Second page']).catch(() => {})
        await sleep(50)
        t.bot.signBook(36, ['First page'], 'Dev', 'My Book').catch(() => {})
        await sleep(50)
        const [write, sign] = t.written.filter(p => p.name === 'edit_book').map(p => p.data)
        if (t.registry.version['>=']('1.17.1')) {
          // the book's slot, its pages, the title signed
          assert.deepStrictEqual([write.hand, write.pages, write.title], [0, ['First page', 'Second page'], undefined], version)
          assert.deepStrictEqual([sign.hand, sign.pages, sign.title], [0, ['First page'], 'My Book'], version)
        } else {
          // the book as edited, signing, the main hand; its tags pages, author, title until 1.14, the other way round after
          const tags = item => Object.keys(item.nbtData.value)
          assert.deepStrictEqual([write.signing, write.hand, tags(write.new_book)], [false, 0, ['pages']], version)
          assert.deepStrictEqual([sign.signing, tags(sign.new_book)], [true, version === '1.14.4' ? ['pages', 'author', 'title'] : ['title', 'author', 'pages']], version)
          assert.strictEqual(sign.new_book.nbtData.value.author.value, 'Dev', version)
        }
      } finally {
        await t.close()
      }
    }
  })

  it('bot.setCommandBlock sends the update of the command block screen in creative, the player list entry unknown', async () => {
    const t = await fakeServerBot('1.20.4', { gameMode: 'creative', blocks: [[0, 64, 0, 'stone'], [2, 64, 0, 'command_block']] })
    try {
      t.bot.player = undefined
      t.bot.setCommandBlock(new Vec3(2, 64, 0), 'say hi', { trackOutput: true })
      await sleep(50)
      const [update] = t.written.filter(p => p.name === 'update_command_block').map(p => p.data)
      assert.deepStrictEqual([update.command, update.mode, update.flags], ['say hi', 2, 1])
    } finally {
      await t.close()
    }
  })

  it('bot.setAnvilItemName names the item in the open anvil screen (ServerboundRenameItemPacket, AnvilMenu.setItemName)', async () => {
    for (const version of ['1.12.2', '1.16.5', '1.20.4']) {
      const t = await clickingBot(version)
      try {
        const type = t.windows.windows['minecraft:anvil'].type
        const window = t.windows.createWindow(6, type, 'Repair')
        t.bot.currentWindow = window
        let computed = 0
        window.showAnvilResult = () => computed++
        // (before 1.13 the name goes on the MC|ItemName channel, with no openAnvil before it)
        t.bot.setAnvilItemName('Blade')
        await sleep(50)
        assert.strictEqual(window.anvilName, 'Blade')
        assert.strictEqual(computed, 1)
        if (t.registry.version['<']('1.13')) {
          const named = t.written.filter(p => p.name === 'custom_payload' && p.data.channel === 'MC|ItemName')
          assert.strictEqual(named.length, 1)
          assert.ok(named[0].data.data.includes(Buffer.from('Blade')))
          continue
        }
        assert.deepStrictEqual(t.written.filter(p => p.name === 'name_item').map(p => p.data.name), ['Blade'])
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.17 bot.craft waits for the result slot the server sends for each change of the grid, so each click goes with the server\'s state id (CraftingMenu.slotChangedCraftingGrid)', async () => {
    for (const version of ['1.17.1', '1.21.11']) {
      const t = await clickingBot(version)
      try {
        // a server that plays the grid as vanilla's does: each change of a grid slot (a click in it, the take of the
        // result taking one from each stack) sends the result slot with a new state id, a moment later; a click with
        // a state id behind is answered with the whole menu
        let serverStateId = 0
        const grid = new Set()
        const stale = []
        const table = t.registry.itemsByName.crafting_table.id
        const sendResult = () => {
          serverStateId++
          const item = grid.size === 4 ? t.Item.toNotch(new t.Item(table, 1)) : t.Item.toNotch(null)
          const stateId = serverStateId
          setTimeout(() => t.client.write('set_slot', { windowId: 0, stateId, slot: 0, item }), 20)
        }
        t.client.on('window_click', (packet) => {
          if (packet.stateId !== serverStateId) stale.push([packet.slot, packet.stateId, serverStateId])
          const before = new Set(grid)
          for (const { location, item } of packet.changedSlots) {
            if (location < 1 || location > 4) continue
            if (item != null && item.present !== false && (item.itemCount ?? 1) > 0) grid.add(location)
            else grid.delete(location)
          }
          if (packet.slot === 0) {
            // ResultSlot.onTake: one off each stack of the grid, each a change
            for (let i = 0; i < before.size; i++) sendResult()
          } else if (packet.slot >= 1 && packet.slot <= 4) sendResult()
        })
        t.client.write('set_slot', { windowId: 0, stateId: serverStateId, slot: 0, item: t.Item.toNotch(null) })
        await sleep(50)
        t.bot.inventory.updateSlot(36, t.item('oak_planks', 8))
        const ticking = setInterval(() => t.bot.physicsTick(), 50)
        try {
          const recipe = t.bot.recipesFor(table, null, 1, null)[0]
          await t.bot.craft(recipe, 2, null)
        } finally {
          clearInterval(ticking)
        }
        assert.deepStrictEqual(stale, [], version)
        assert.strictEqual(t.bot.inventory.items().find(item => item.name === 'crafting_table')?.count, 2, version)
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.17.1 bot.craft goes on from the whole menu the server answers a click behind its state id with (an item picked up as the clicks went), not from what its clicks made of the grid (ServerGamePacketListenerImpl.handleContainerClick: broadcastFullState)', async () => {
    for (const version of ['1.17.1', '1.21.11', '26.3']) {
      // (spawned: the bot's ticks run)
      const t = await clickingBot(version, { spawn: new Vec3(0.5, 65, 0.5) })
      try {
        // a server that plays the player's menu as vanilla's does: a click is played whatever its state id; each change
        // of the grid sends the result slot (CraftingMenu.slotChangedCraftingGrid); a click behind the menu's state id
        // is answered with the whole menu, one in step with it with the slots the client got wrong
        // (AbstractContainerMenu.broadcastChanges against the click's changed slots)
        const simulate = require('../lib/inventory_simulator')(t.Item, t.registry)
        const menu = t.windows.createWindow(0, 'minecraft:inventory', 'Inventory')
        const log = t.registry.itemsByName.oak_log.id
        const planks = t.registry.itemsByName.oak_planks.id
        const notch = item => t.Item.toNotch(item ?? null)
        const same = (item, sent) => {
          const id = sent == null || sent.present === false || (sent.itemCount ?? 1) <= 0 ? null : (sent.itemId ?? sent.blockId)
          return (item?.type ?? null) === id && (id == null || item.count === sent.itemCount)
        }
        let stateId = 0
        const sendSlot = (slot) => t.client.write('set_slot', { windowId: 0, stateId: ++stateId, slot, item: notch(menu.slots[slot]) })
        const sendResult = () => {
          const grid = menu.slots.slice(1, 5).filter(item => item != null)
          menu.updateSlot(0, grid.length === 1 && grid[0].type === log ? new t.Item(planks, 4) : null)
          sendSlot(0)
        }
        const play = (packet) => {
          const stale = packet.stateId !== stateId
          if (packet.slot === 0) {
            // ResultSlot.onTake: one off each stack of the grid, each a change
            const result = menu.slots[0]
            const carried = menu.selectedItem
            if (result && (!carried || (carried.type === result.type && carried.count + result.count <= carried.stackSize))) {
              menu.selectedItem = new t.Item(result.type, (carried?.count ?? 0) + result.count)
              for (let i = 1; i <= 4; i++) {
                const item = menu.slots[i]
                if (!item) continue
                menu.updateSlot(i, item.count > 1 ? new t.Item(item.type, item.count - 1) : null)
                sendResult()
              }
            }
          } else if (packet.slot !== -1) {
            simulate(menu, { slot: packet.slot, mouseButton: packet.mouseButton, mode: packet.mode, item: packet.slot === -999 ? null : menu.slots[packet.slot] }, 0, menu)
            if (packet.slot >= 1 && packet.slot <= 4) sendResult()
          }
          if (stale) {
            t.client.write('window_items', { windowId: 0, stateId: ++stateId, items: menu.slots.map(notch), carriedItem: notch(menu.selectedItem) })
          } else {
            for (const { location, item } of packet.changedSlots) {
              if (location !== 0 && !same(menu.slots[location], item)) sendSlot(location)
            }
          }
        }
        // the server's ticks: an item picked up in two of them (into the last hotbar slot, with its slot update), then the
        // clicks that came since the last tick; those the bot sent before the pickup's update came are behind
        let serverTicks = 0
        const clicks = []
        t.client.on('window_click', (packet) => clicks.push(packet))
        const serverTick = async () => {
          if ([2, 6].includes(++serverTicks)) {
            menu.updateSlot(44, t.item('dirt', (menu.slots[44]?.count ?? 0) + 1))
            sendSlot(44)
          }
          // (each click's answers a packet of their own on the way, as the server's connection flushes them)
          for (const packet of clicks.splice(0)) {
            play(packet)
            await sleep(2)
          }
        }
        menu.updateSlot(36, t.item('oak_log', 8))
        t.client.write('window_items', { windowId: 0, stateId, items: menu.slots.map(notch), carriedItem: notch(null) })
        await sleep(50)
        // the server's tick, then the bot's
        let ticking = true
        const ticks = (async () => {
          for (;;) {
            if (!ticking) break
            await serverTick()
            t.bot.physicsTick()
            await sleep(15)
          }
        })()
        try {
          const recipe = t.bot.recipesFor(planks, null, 1, null)[0]
          await t.bot.craft(recipe, 3, null)
          await sleep(200)
        } finally {
          ticking = false
          await ticks
        }
        const items = window => window.slots.map((item, slot) => item ? `${slot} ${item.name} ${item.count}` : null).filter(Boolean)
        assert.deepStrictEqual(items(t.bot.inventory), items(menu), version)
        const count = name => menu.slots.slice(9, 45).reduce((n, item) => n + (item?.name === name ? item.count : 0), 0)
        assert.deepStrictEqual([count('oak_planks'), count('oak_log')], [12, 5], version)
      } finally {
        await t.close()
      }
    }
  })

  it('from 1.17.1 each menu has its own state id: a click sends the open menu\'s, and the inventory\'s again once a chest closed (AbstractContainerMenu.stateId, ClientPacketListener.handleContainerSetSlot)', async () => {
    for (const version of ['1.17.1', '1.21.11', '26.3']) {
      const t = await clickingBot(version)
      try {
        const notch = (name, count) => t.Item.toNotch(name ? t.item(name, count) : null)
        const inventory = new Array(46).fill(notch(null))
        inventory[36] = notch('oak_planks', 8)
        t.client.write('window_items', { windowId: 0, stateId: 40, items: inventory, carriedItem: notch(null) })
        await sleep(50)
        // a chest (generic_9x3), its menu's state ids from 1
        const title = t.registry.version['>=']('1.20.3') ? { type: 'string', value: 'Chest' } : JSON.stringify({ text: 'Chest' })
        const opened = new Promise(resolve => t.bot.once('windowOpen', resolve))
        t.client.write('open_window', { windowId: 1, inventoryType: 2, windowTitle: title })
        t.client.write('window_items', { windowId: 1, stateId: 1, items: [...new Array(27).fill(notch(null)), ...inventory.slice(9, 45)], carriedItem: notch(null) })
        await opened
        await t.click(0, 0, 0)
        // the player's inventory menu goes on with the chest open (an item picked up)
        t.client.write('set_slot', { windowId: 0, stateId: 41, slot: 37, item: notch('dirt', 1) })
        t.client.write('set_slot', { windowId: 1, stateId: 2, slot: 0, item: notch(null) })
        await sleep(50)
        await t.click(1, 0, 0)
        t.bot.closeWindow(t.bot.currentWindow)
        await t.click(36, 0, 0)
        assert.deepStrictEqual(t.clicks().map(c => [c.windowId, c.slot, c.stateId]), [[1, 0, 1], [1, 1, 2], [0, 36, 41]], version)
        assert.strictEqual(t.bot._stateId, 41, version)
      } finally {
        await t.close()
      }
    }
  })

  it('bot.craft in the player\'s grid opens the inventory screen and closes it after, as vanilla\'s player does: before 1.12 its opening is a client command (OPEN_INVENTORY_ACHIEVEMENT), its closing the close of menu 0', async () => {
    for (const version of ['1.8.8', '1.11.2', '1.12.2', '1.21.11']) {
      const t = await clickingBot(version)
      try {
        const table = t.registry.itemsByName.crafting_table.id
        const planks = t.registry.itemsByName.oak_planks ?? t.registry.itemsByName.planks
        if (t.registry.version['>=']('1.17')) {
          // the result slot each change of the grid sends (CraftingMenu.slotChangedCraftingGrid), with its state id
          let stateId = 0
          const grid = new Set()
          t.client.on('window_click', (packet) => {
            const before = grid.size
            for (const { location, item } of packet.changedSlots) {
              if (location < 1 || location > 4) continue
              if (item != null && item.present !== false && (item.itemCount ?? 1) > 0) grid.add(location)
              else grid.delete(location)
            }
            const changes = packet.slot === 0 ? before : packet.slot >= 1 && packet.slot <= 4 ? 1 : 0
            for (let i = 0; i < changes; i++) {
              const item = t.Item.toNotch(grid.size === 4 ? new t.Item(table, 1) : null)
              const id = ++stateId
              setTimeout(() => t.client.write('set_slot', { windowId: 0, stateId: id, slot: 0, item }), 20)
            }
          })
          t.client.write('set_slot', { windowId: 0, stateId, slot: 0, item: t.Item.toNotch(null) })
          await sleep(50)
        }
        t.bot.inventory.updateSlot(36, new t.Item(planks.id, 4))
        const opened = []
        t.bot.on('inventoryScreenOpen', () => opened.push('open'))
        t.bot.on('inventoryScreenClose', () => opened.push('close'))
        const ticking = setInterval(() => t.bot.physicsTick(), 50)
        try {
          const recipe = t.bot.recipesFor(table, null, 1, null)[0]
          await t.bot.craft(recipe, 1, null)
        } finally {
          clearInterval(ticking)
        }
        // (what the server has got)
        await sleep(100)
        const sent = t.written.filter(p => ['client_command', 'window_click', 'close_window'].includes(p.name))
        const clicks = sent.filter(p => p.name === 'window_click')
        assert.ok(clicks.length > 0, version)
        const command = sent.findIndex(p => p.name === 'client_command')
        if (t.registry.version['>=']('1.12')) {
          assert.strictEqual(command, -1, version)
        } else {
          assert.strictEqual(command, 0, version)
          assert.strictEqual(sent[0].data.payload ?? sent[0].data.actionId, 2, version)
        }
        const last = sent.at(-1)
        assert.strictEqual(last.name, 'close_window', version)
        assert.strictEqual(last.data.windowId, 0, version)
        assert.strictEqual(sent.filter(p => p.name === 'close_window').length, 1, version)
        assert.deepStrictEqual(opened, ['open', 'close'], version)
        assert.strictEqual(t.bot.inventoryScreenOpen, false, version)
      } finally {
        await t.close()
      }
    }
  })

  it('bot.clickEnchantment clicks an offer of the open enchanting screen (ServerboundContainerButtonClickPacket)', async () => {
    const t = await clickingBot('1.16.5')
    try {
      t.bot.currentWindow = t.windows.createWindow(7, t.windows.windows['minecraft:enchantment'].type, 'Enchant')
      t.bot.clickEnchantment(2)
      await sleep(50)
      assert.deepStrictEqual(t.written.filter(p => p.name === 'enchant_item').map(p => p.data), [{ windowId: 7, enchantment: 2 }])
    } finally {
      await t.close()
    }
  })
})
