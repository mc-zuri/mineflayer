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
})

describe('the swing the server asks for (ClientPacketListener.handleAnimate)', function () {
  this.timeout(10 * 1000)
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
