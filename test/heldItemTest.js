/* eslint-env mocha */
// What the bot writes for the item in the player's hand as vanilla's client writes it, against a fake server: the
// selected slot (MultiPlayerGameMode.ensureHasSentCarriedItem) and the rotation of an item use.

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }

describe('the selected slot (MultiPlayerGameMode.ensureHasSentCarriedItem)', function () {
  this.timeout(10 * 1000)
  for (const version of ['1.12.2', '1.20.4', '26.1']) {
    it(`a slot picked between ticks goes to the server at the start of the tick after the next, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        // (picked as a hotbar key is, in the tick: the next tick's start sends it)
        t.bot.setQuickBarSlot(3)
        t.ticks(1)
        await settle()
        assert.deepStrictEqual(t.names(/held_item_slot/), [])
        t.ticks(1)
        await settle()
        assert.deepStrictEqual(t.written.filter(p => p.name === 'held_item_slot').map(p => p.data.slotId), [3])
        // a slot picked and put back before the tick sends nothing
        t.written.length = 0
        t.bot.setQuickBarSlot(5)
        t.bot.setQuickBarSlot(3)
        t.ticks(2)
        await settle()
        assert.deepStrictEqual(t.names(/held_item_slot/), [])
      } finally {
        await t.close()
      }
    })
  }

  it('the slot the server selects is answered at the start of the next tick, not at once', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      t.client.write('held_item_slot', { slot: 2 })
      await settle()
      assert.strictEqual(t.bot.quickBarSlot, 2)
      assert.deepStrictEqual(t.names(/held_item_slot/), [])
      t.ticks(1)
      await settle()
      assert.deepStrictEqual(t.written.filter(p => p.name === 'held_item_slot').map(p => p.data.slotId), [2])
    } finally {
      await t.close()
    }
  })
})

describe('the rotation of an item use (ServerboundUseItemPacket)', function () {
  this.timeout(10 * 1000)
  it('use_item carries the float rotation the player holds, whole turns kept (Player.getYRot)', async () => {
    const t = await fakeServerBot('26.1', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const JavaFloat = t.bot.entity.yawDegrees.constructor
      t.bot.entity.yawDegrees = new JavaFloat(400.5)
      t.bot.entity.pitchDegrees = new JavaFloat(12.25)
      t.bot.activateItem()
      await settle()
      const use = t.written.find(p => p.name === 'use_item')
      assert.ok(use)
      assert.strictEqual(use.data.rotation.x, 400.5)
      assert.strictEqual(use.data.rotation.y, 12.25)
    } finally {
      await t.close()
    }
  })
})

describe('an item in use (LocalPlayer.isUsingItem)', function () {
  this.timeout(10 * 1000)
  it('the server\'s cooldown on it does not stop the use: letting go releases it (RELEASE_USE_ITEM), 1.20.4', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      const horn = new Item(t.registry.itemsByName.goat_horn.id, 1)
      t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(horn) })
      t.client.write('held_item_slot', { slot: 0 })
      await settle()
      t.bot.activateItem()
      assert.strictEqual(t.bot.usingHeldItem, true)
      // (InstrumentItem.use: the horn's cooldown, which the server sends too)
      t.client.write('set_cooldown', { itemID: horn.type, cooldownTicks: 140 })
      await settle()
      assert.strictEqual(t.bot.usingHeldItem, true)
      t.written.length = 0
      t.bot.deactivateItem()
      await settle()
      assert.deepStrictEqual(t.written.filter(p => p.name === 'block_dig').map(p => p.data.status), [5])
    } finally {
      await t.close()
    }
  })
})
