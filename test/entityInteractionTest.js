/* eslint-env mocha */
// A right click on an entity as vanilla's client makes it (MultiPlayerGameMode.interactAt / interact), the swing the
// server asks for, leashes and the inventory of a vehicle, against a fake server.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }

// an entity the bot knows, as a spawn packet would make it
function addEntity (bot, id, fields) {
  const Entity = require('prismarine-entity')(bot.version)
  const entity = new Entity(id)
  Object.assign(entity, { isValid: true, yaw: 0, pitch: 0, metadata: [] }, fields)
  bot.entities[id] = entity
  return entity
}

describe('leashes (ClientboundSetEntityLinkPacket)', function () {
  this.timeout(10 * 1000)
  it('from 1.9 attach_entity is a leash, not a ride (ClientboundSetEntityLinkPacket)', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const pig = addEntity(t.bot, 9, { name: 'pig', type: 'animal', position: new Vec3(2.5, 65, 0.5), width: 0.9, height: 0.9 })
      t.client.write('attach_entity', { entityId: 9, vehicleId: t.bot.entity.id })
      await settle()
      assert.strictEqual(pig.leashHolder, t.bot.entity)
      assert.ok(!pig.vehicle)
      assert.ok(!(t.bot.entity.passengers ?? []).includes(pig))
      t.client.write('attach_entity', { entityId: 9, vehicleId: -1 })
      await settle()
      assert.strictEqual(pig.leashHolder, null)
    } finally {
      await t.close()
    }
  })
})

describe('a right click on an entity (MultiPlayerGameMode.interactAt / interact)', function () {
  this.timeout(10 * 1000)
  const uses = t => t.written.filter(p => p.name === 'use_entity').map(p => p.data)

  it('a camel takes the ride with a swing until 1.21.11 (Camel.mobInteract: SUCCESS, CONSUME since)', async () => {
    for (const [version, result, swings] of [['1.21.5', 'success', 1], ['1.21.11', 'consume', 0]]) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const camel = addEntity(t.bot, 7, { name: 'camel', type: 'animal', position: new Vec3(0.5, 65, 2.5), width: 1.7, height: 2.375 })
        assert.strictEqual(t.bot.mount(camel), result, version)
        await settle()
        assert.strictEqual(t.names(/arm_animation/).length, swings, version)
      } finally {
        await t.close()
      }
    }
  })

  it('before 26.1 a mount is INTERACT_AT where the crosshair meets it, then INTERACT, and a swing from 1.15', async () => {
    for (const version of ['1.12.2', '1.20.4']) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const boat = addEntity(t.bot, 7, { name: 'boat', type: 'other', position: new Vec3(0.5, 65, 2.5), width: 1.375, height: 0.5625 })
        assert.strictEqual(t.bot.mount(boat), 'success')
        await settle()
        const [at, interact] = uses(t)
        assert.deepStrictEqual([at.mouse, interact.mouse, uses(t).length], [2, 0, 2], version)
        // (the point on the boat's box, relative to its position)
        assert.ok(Math.abs(at.y) <= 0.5625 + 1e-6 && Math.abs(at.z) <= 0.6875 + 1e-6, version)
        assert.strictEqual(t.names(/arm_animation/).length, t.registry.version['>=']('1.15') ? 1 : 0, version)
      } finally {
        await t.close()
      }
    }
  })

  it('on 1.15 the client answers a click on a boat with false: it goes on to the off hand (Boat.interact)', async () => {
    for (const [version, result] of [['1.14.4', 'success'], ['1.15.2', 'pass'], ['1.16.5', 'success']]) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const boat = addEntity(t.bot, 7, { name: 'boat', type: 'other', position: new Vec3(0.5, 65, 2.5), width: 1.375, height: 0.5625 })
        assert.strictEqual(t.bot.mount(boat), result, version)
      } finally {
        await t.close()
      }
    }
  })

  it('from 26.1 one interaction says where on the entity it is; an armor stand takes the click at INTERACT_AT', async () => {
    const t = await fakeServerBot('26.1', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const boat = addEntity(t.bot, 7, { name: 'oak_boat', type: 'other', position: new Vec3(0.5, 65, 2.5), width: 1.375, height: 0.5625 })
      assert.strictEqual(t.bot.mount(boat), 'success')
      await settle()
      assert.strictEqual(uses(t).length, 1)
      assert.ok(uses(t)[0].location.y > 0)
      assert.strictEqual(t.names(/arm_animation/).length, 1)
    } finally {
      await t.close()
    }
    const old = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      old.bot.lookAt = async () => {}
      const stand = addEntity(old.bot, 8, { name: 'armor_stand', type: 'living', position: new Vec3(0.5, 65, 2.5), width: 0.5, height: 1.975 })
      assert.strictEqual(await old.bot.activateEntity(stand), 'consume')
      await settle()
      assert.deepStrictEqual(uses(old).map(u => u.mouse), [2])
      assert.deepStrictEqual(old.names(/arm_animation/), [])
    } finally {
      await old.close()
    }
  })

  it('the use of an entity by a spectator is sent and passes; the use of an item sends nothing (MultiPlayerGameMode)', async () => {
    for (const version of ['1.12.2', '1.21.8']) {
      const t = await fakeServerBot(version, { spawn, gameMode: 'spectator', blocks: [[0, 64, 0, 'stone']] })
      try {
        t.bot.lookAt = async () => {}
        const Item = require('prismarine-item')(t.registry)
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.snowball.id, 4))
        const cow = addEntity(t.bot, 9, { name: 'cow', type: 'animal', position: new Vec3(0.5, 65, 2.5), width: 0.9, height: 1.4 })
        assert.strictEqual(await t.bot.activateEntity(cow), 'pass', version)
        assert.strictEqual(t.bot.activateItem(), 'pass', version)
        await settle()
        assert.deepStrictEqual(t.names(/use_entity|use_item|block_place|arm_animation/), ['use_entity', 'use_entity'], version)
      } finally {
        await t.close()
      }
    }
  })

  it('a spear attacks at full charge only, and stabs (Player.cannotAttackWithItem, MultiPlayerGameMode.piercingAttack)', async () => {
    for (const [version, stab] of [['26.1', 7], ['26.3', 8]]) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        const Item = require('prismarine-item')(t.registry)
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.wooden_spear.id, 1))
        t.bot.setQuickBarSlot(0)
        const tick = n => { for (let i = 0; i < n; i++) t.bot.emit('physicsTick') }
        // (the spear taken in the tick: no strength; a wooden spear's full charge takes 0.65 s, 13 ticks)
        tick(1)
        assert.strictEqual(t.bot.isPiercingWeapon(t.bot.heldItem), true, version)
        tick(12)
        assert.strictEqual(t.bot.cannotAttackWithItem(), true, version)
        tick(1)
        assert.strictEqual(t.bot.cannotAttackWithItem(), false, version)
        t.bot.stab()
        assert.strictEqual(t.bot.cannotAttackWithItem(), true, version)
        await settle()
        const dig = t.written.find(p => p.name === 'block_dig')
        assert.deepStrictEqual([dig.data.status, dig.data.location, dig.data.face], [stab, { x: 0, y: 0, z: 0 }, 0], version)
        // (26.3 swings with no packet: no punch follows a stab)
        assert.strictEqual(t.names(/arm_animation|punch/).length, version === '26.1' ? 1 : 0, version)
        // another item needs no charge
        t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.stick.id, 1))
        assert.strictEqual(t.bot.cannotAttackWithItem(), false, version)
      } finally {
        await t.close()
      }
    }
  })

  it('a villager takes the use and opens its trades (Villager before 1.11), a spawn egg passes before 1.11', async () => {
    for (const [version, name] of [['1.8.8', 'Villager'], ['1.10.2', 'Villager'], ['1.20.4', 'villager']]) {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        t.bot.lookAt = async () => {}
        const villager = addEntity(t.bot, 9, { name, type: 'mob', position: new Vec3(0.5, 65, 2.5), width: 0.6, height: 1.95 })
        assert.strictEqual(await t.bot.activateEntity(villager), 'success', version)
        if (!t.registry.version['>=']('1.11')) {
          const Item = require('prismarine-item')(t.registry)
          t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.spawn_egg.id, 1, 50))
          assert.strictEqual(await t.bot.activateEntity(villager), 'pass', version)
        }
      } finally {
        await t.close()
      }
    }
  })
})

describe('the swing the server asks for (ClientPacketListener.handleAnimate)', function () {
  this.timeout(10 * 1000)
  it('before 1.11 a cow is called Cow: it is milked all the same (EntityCow.processInteract)', async () => {
    const t = await fakeServerBot('1.8.8', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.bucket.id, 1))
      t.bot.lookAt = async () => {}
      const cow = addEntity(t.bot, 7, { name: 'Cow', type: 'mob', position: new Vec3(2.5, 65, 0.5), width: 0.9, height: 1.3 })
      assert.strictEqual(await t.bot.activateEntity(cow), 'success')
      assert.strictEqual(t.bot.heldItem?.name, 'milk_bucket')
    } finally {
      await t.close()
    }
  })

  it('a cow milked with a bucket fills it on the client at once (ItemUtils.createFilledResult)', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      const hold = async (count) => {
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName.bucket.id, count)) })
        await settle()
      }
      t.client.write('held_item_slot', { slot: 0 })
      // (the view held: a look turns only with the ticks)
      t.bot.lookAt = async () => {}
      const cow = addEntity(t.bot, 7, { name: 'cow', type: 'animal', position: new Vec3(2.5, 65, 0.5), width: 0.9, height: 1.4 })
      await hold(1)
      assert.strictEqual(await t.bot.activateEntity(cow), 'success')
      assert.deepStrictEqual([t.bot.heldItem?.name, t.bot.heldItem?.count], ['milk_bucket', 1])
      // (of a stack, one bucket)
      await hold(3)
      await t.bot.activateEntity(cow)
      assert.deepStrictEqual([t.bot.heldItem?.name, t.bot.heldItem?.count], ['bucket', 2])
    } finally {
      await t.close()
    }
  })

  it('the server\'s swing of the player\'s own arm is swung back before 26.3 (ClientPacketListener.handleAnimate)', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      t.client.write('animation', { entityId: t.bot.entity.id, animation: 0 })
      t.client.write('animation', { entityId: t.bot.entity.id, animation: 3 })
      // another entity's swing is not the player's
      t.client.write('animation', { entityId: 99, animation: 0 })
      await settle()
      assert.deepStrictEqual(t.written.filter(p => p.name === 'arm_animation').map(p => p.data.hand), [0, 1])
    } finally {
      await t.close()
    }
  })
})

describe('the inventory of a vehicle (HasCustomInventoryScreen)', function () {
  this.timeout(10 * 1000)
  it('the inventory key on a chest boat asks the server for its inventory (HasCustomInventoryScreen)', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      const boat = addEntity(t.bot, 100, { name: 'chest_boat', type: 'other', position: new Vec3(0.5, 65, 0.5), width: 1.375, height: 0.5625 })
      t.client.write('set_passengers', { entityId: 100, passengers: [t.bot.entity.id] })
      await settle()
      assert.strictEqual(t.bot.vehicle, boat)
      t.bot.lookAt = async () => {}
      t.bot.openEntity(boat).catch(() => {})
      await settle()
      assert.deepStrictEqual(t.names(/^(entity_action|use_entity)$/), ['entity_action'])
    } finally {
      await t.close()
    }
  })
})
