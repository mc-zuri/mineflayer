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
})
