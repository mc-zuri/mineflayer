/* eslint-env mocha */
// The container clicks and screen actions the bot sends, as vanilla's client sends them (AbstractContainerMenu,
// MultiPlayerGameMode.handleInventoryMouseClick and the screens' own packets), against a fake server.

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

// A bot of the version against a fake server that confirms every click before 1.17 (ClientboundContainerAckPacket)
async function clickingBot (version) {
  // (a block in the chunk: an empty one does not load before 1.17)
  const t = await fakeServerBot(version, { blocks: [[0, 64, 0, 'stone']] })
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
    for (const version of ['1.8.8', '1.12.2']) {
      const t = await clickingBot(version)
      try {
        const dirt = t.registry.itemsByName.dirt.id
        // a quick move that takes the whole stack: 1.8 returns the stack moved, 1.9+ nothing (no same item left)
        t.bot.inventory.updateSlot(36, t.item('dirt', 5))
        await t.click(36, 0, 1)
        // a pick up: the slot's stack as it was
        t.bot.inventory.updateSlot(37, t.item('dirt', 3))
        await t.click(37, 0, 0)
        // a double click (PICKUP_ALL): nothing
        await t.click(38, 0, 6)
        const items = t.clicks().map(c => c.item.blockId === -1 ? null : [c.item.blockId, c.item.itemCount])
        assert.deepStrictEqual(items, [version === '1.8.8' ? [dirt, 5] : null, [dirt, 3], null], version)
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
})
