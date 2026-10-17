/* eslint-env mocha */
// 1.16's client stops riding by itself (Player.rideTick, the shift key down) in its vehicle's tick
// (ClientLevel.tickPassenger), against a fake server, the bot stepped tick by tick.

const assert = require('assert')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const settle = () => sleep(50)

function ground () {
  const blocks = []
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push([x, 64, z, 'stone'])
  return blocks
}

// the slot of an id in 1.14 - 1.16's entity map of a few entities (fastutil Int2ObjectOpenHashMap, 32 slots)
const slotOf = id => {
  const h = Math.imul(id, 0x9E3779B9 | 0)
  return (h ^ (h >>> 16)) & 31
}

// The bot on a tame saddled horse (id 100) at (8.5, 65, 8.5)
async function onHorse (version) {
  const t = await fakeServerBot(version, { spawn: { x: 8.5, y: 65, z: 7.5 }, blocks: ground() })
  const { bot, client, registry } = t
  const Entity = require('prismarine-entity')(bot.version)
  const horse = bot.entities[100] ?? (bot.entities[100] = new Entity(100))
  const type = registry.entitiesByName.horse
  Object.assign(horse, { name: 'horse', type: 'mob', height: type.height, width: type.width, onGround: true, metadata: [] })
  horse.metadata[16] = 0x06
  horse.position.set(8.5, 65, 8.5)
  bot.entityInterpolation?.spawn(horse)
  const mounted = once(bot, 'mount')
  client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  await mounted
  await settle()
  t.written.length = 0
  return { ...t, horse }
}

describe('1.16\'s rider that stops riding by itself', function () {
  this.timeout(30 * 1000)

  // the vehicle's entry comes before the player's (its slot higher): the player, no longer a passenger once its
  // vehicle has ticked, ticks on foot that tick; the vehicle pushed it in its tick while it was its passenger, so not
  // again (c_ride_skeleton_horse_dismount, v_horse_dismount on 1.16.5)
  it('ticks on foot after a vehicle the client ticks first, which does not push it that tick', async () => {
    const t = await onHorse('1.16.5')
    try {
      assert.ok(slotOf(100) > slotOf(t.bot.entity.id))
      t.bot.setControlState('sneak', true)
      t.ticks(1)
      await settle()
      t.written.length = 0
      t.ticks(1)
      await settle()
      assert.strictEqual(t.bot.vehicle, null)
      assert.ok(t.written.some(p => p.name === 'position'), t.written.map(p => p.name).join(' '))
      assert.strictEqual(t.bot.entity.leftVehicle, t.horse)
      t.ticks(1)
      await settle()
      assert.strictEqual(t.bot.entity.leftVehicle, null)
    } finally {
      await t.close()
    }
  })

  // the player's entry comes first: skipped as a passenger, it leaves the vehicle in the vehicle's tick and is not
  // ticked that tick, sending nothing (m_c_mount_click_horse tick 91 on 1.16.5)
  it('is not ticked the tick it stops riding when its entry comes before its vehicle\'s', async () => {
    const t = await onHorse('1.16.5')
    try {
      let id = 1
      while (slotOf(id) <= slotOf(100)) id++
      t.bot.entity.id = id
      t.bot.setControlState('sneak', true)
      t.ticks(1)
      await settle()
      t.written.length = 0
      t.ticks(1)
      await settle()
      assert.strictEqual(t.bot.vehicle, null)
      assert.deepStrictEqual(t.written.map(p => p.name), [])
    } finally {
      await t.close()
    }
  })
})
