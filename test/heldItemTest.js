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

  for (const version of ['1.12.2', '1.20.4', '26.1']) {
    it(`a slot picked just before a block is placed goes to the server before the placement, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        t.bot.inventory.updateSlot(39, new Item(t.registry.itemsByName.cobblestone.id, 1))
        t.bot.setQuickBarSlot(3)
        t.written.length = 0
        // the place goes out without a look (and so without a tick) in between
        t.bot._genericPlace(t.bot.blockAt(new (require('vec3').Vec3)(0, 64, 0)), new (require('vec3').Vec3)(0, 1, 0), { forceLook: 'ignore' })
        await settle()
        const order = t.written.filter(p => p.name === 'held_item_slot' || /block_place|use_item_on/.test(p.name)).map(p => p.name)
        assert.strictEqual(order[0], 'held_item_slot', order.join(', '))
        assert.ok(order.length === 2, order.join(', '))
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
  it('the server\'s living entity flags start and stop it (LocalPlayer.onSyncedDataUpdated), 1.20.4', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName.goat_horn.id, 1)) })
      t.client.write('held_item_slot', { slot: 0 })
      // (DATA_LIVING_ENTITY_FLAGS, at 8 of a player's data: bit 1 an item in use)
      const flags = async (value) => {
        t.client.write('entity_metadata', { entityId: t.bot.entity.id, metadata: [{ key: 8, type: 'byte', value }] })
        await settle()
      }
      await flags(1)
      assert.strictEqual(t.bot.usingHeldItem, true)
      // the key not held, the next use of the keys releases it
      t.bot.deactivateItem()
      await flags(1)
      assert.strictEqual(t.bot.usingHeldItem, true)
      await flags(0)
      assert.strictEqual(t.bot.usingHeldItem, false)
      // another entity's flags are its own
      t.client.write('entity_metadata', { entityId: 99, metadata: [{ key: 8, type: 'byte', value: 1 }] })
      await settle()
      assert.strictEqual(t.bot.usingHeldItem, false)
    } finally {
      await t.close()
    }
  })

  // Grim's NoSlow: the bot walked at full speed while the server had it eating
  for (const version of ['1.12.2', '1.20.4', '1.21.11']) {
    it(`another entity's event and more of the same item in the hand leave the use going (Player.handleEntityEvent, LivingEntity.updatingUsingItem), ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName.bread.id, 3)) })
        t.client.write('held_item_slot', { slot: 0 })
        await settle()
        t.bot.food = 10
        t.bot.activateItem()
        assert.strictEqual(t.bot.usingHeldItem, true)
        // a sheep's eating, another entity's event 9
        t.client.write('entity_status', { entityId: 99, entityStatus: 10 })
        t.client.write('entity_status', { entityId: 99, entityStatus: 9 })
        await settle()
        assert.strictEqual(t.bot.usingHeldItem, true)
        // a bread picked up into the stack in the hand
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.bread.id, 4))
        assert.strictEqual(t.bot.usingHeldItem, true)
        // another item in the hand ends it
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.stone.id, 1))
        assert.strictEqual(t.bot.usingHeldItem, false)
      } finally {
        await t.close()
      }
    })
  }

  it('its use complete (entity event 9), a drink leaves its container in the hand and a food one less, 1.20.4', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      const give = async (name, count) => {
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName[name].id, count)) })
        await settle()
      }
      t.client.write('held_item_slot', { slot: 0 })
      // (Player.handleEntityEvent 9: LivingEntity.completeUsingItem, Item.finishUsingItem on the client)
      const complete = async () => {
        t.client.write('entity_status', { entityId: t.bot.entity.id, entityStatus: 9 })
        await settle()
      }
      await give('milk_bucket', 1)
      t.bot.activateItem()
      assert.strictEqual(t.bot.usingHeldItem, true)
      await complete()
      assert.strictEqual(t.bot.usingHeldItem, false)
      assert.deepStrictEqual([t.bot.heldItem?.name, t.bot.heldItem?.count], ['bucket', 1])
      await give('bread', 3)
      t.bot.food = 10
      t.bot.activateItem()
      await complete()
      assert.deepStrictEqual([t.bot.heldItem?.name, t.bot.heldItem?.count], ['bread', 2])
    } finally {
      await t.close()
    }
  })

  it('before 1.17 the server\'s stack in its slot, the same too, ends the use at the next tick (updateActiveHand)', async () => {
    for (const [version, ends] of [['1.12.2', true], ['1.20.4', false]]) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        const bread = Item.toNotch(new Item(t.registry.itemsByName.bread.id, 3))
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: bread })
        t.client.write('held_item_slot', { slot: 0 })
        await settle()
        t.bot.food = 10
        t.bot.activateItem()
        t.client.write('set_slot', { windowId: 0, stateId: 2, slot: 36, item: bread })
        await settle()
        assert.strictEqual(t.bot.usingHeldItem, true, version)
        t.ticks(1)
        assert.strictEqual(t.bot.usingHeldItem, !ends, version)
      } finally {
        await t.close()
      }
    }
  })

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

describe('a spear (1.21.11 KineticWeapon, UseEffects)', function () {
  this.timeout(10 * 1000)
  it('is used while held, with use effects that let a sprint go on at full speed', async () => {
    const t = await fakeServerBot('26.1', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      t.client.write('held_item_slot', { slot: 0 })
      const hold = async (name) => {
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName[name].id, 1)) })
        await settle()
      }
      await hold('wooden_spear')
      assert.strictEqual(t.bot.activateItem(), 'consume')
      assert.strictEqual(t.bot.usingHeldItem, true)
      assert.deepStrictEqual(t.bot.usingItemEffects, { canSprint: true, speedMultiplier: 1 })
      t.bot.deactivateItem()
      // (another item's are UseEffects.DEFAULT)
      await hold('shield')
      t.bot.activateItem()
      assert.strictEqual(t.bot.usingItemEffects, null)
    } finally {
      await t.close()
    }
  })
})
