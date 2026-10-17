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
