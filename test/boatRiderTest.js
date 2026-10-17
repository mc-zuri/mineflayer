/* eslint-env mocha */
// The rider of a boat it steers, as vanilla's client tells the server about it. Against a fake server, the bot stepped
// tick by tick.

const assert = require('assert')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const settle = () => sleep(50)

function ground () {
  const blocks = []
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push([x, 64, z, 'stone'])
  return blocks
}

// still water a block deep over the stone
function pool () {
  const blocks = ground()
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push([x, 65, z, 'water'])
  return blocks
}

// The bot on its feet at (0.5, 65, 0.5), then put by the server in a boat (id 100) at (8.5, 65, 8.5)
async function inBoat (version, { blocks = ground(), y = 65 } = {}) {
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks })
  const { bot, client, registry } = t
  const Entity = require('prismarine-entity')(bot.version)
  const boat = bot.entities[100] ?? (bot.entities[100] = new Entity(100))
  const name = registry.entitiesByName.oak_boat ? 'oak_boat' : registry.entitiesByName.boat ? 'boat' : 'Boat'
  const type = registry.entitiesByName[name]
  Object.assign(boat, { name, type: type.type ?? 'mob', height: type.height, width: type.width, onGround: true, metadata: [] })
  boat.position.set(8.5, y, 8.5)
  bot.entityInterpolation?.spawn(boat)
  const mounted = once(bot, 'mount')
  // (before 1.9 the rider is attached to its vehicle: S1BPacketEntityAttach)
  if (registry.version['<']('1.9')) client.write('attach_entity', { entityId: bot.entity.id, vehicleId: 100, leash: false })
  else client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  await mounted
  await settle()
  t.written.length = 0
  return t
}

describe('the rider of a boat it steers', function () {
  this.timeout(30 * 1000)

  // from 1.19.3 LocalPlayer.tick tells the rider's sprint after the vehicle's move (sendIsSprintingIfNeeded); before,
  // a rider does not tell it, and from 1.19.4 it no longer starts sprinting in a boat (v_boat_sprint_key_ignored on
  // 1.19.3)
  it('tells its sprint after the boat\'s move from 1.19.3', async () => {
    for (const [version, told] of [['1.19.2', false], ['1.19.3', true], ['1.19.4', false]]) {
      const t = await inBoat(version)
      try {
        t.bot.setControlState('forward', true)
        t.bot.setControlState('sprint', true)
        t.ticks(1)
        await settle()
        const names = t.written.map(p => p.name).filter(n => n === 'vehicle_move' || n === 'entity_action')
        assert.deepStrictEqual(names, told ? ['vehicle_move', 'entity_action'] : ['vehicle_move'], version)
        if (told) assert.strictEqual(t.written.find(p => p.name === 'entity_action').data.actionId, 'start_sprinting', version)
      } finally {
        await t.close()
      }
    }
  })
  // the server's teleport that dismounts the rider (1.17 - 1.19.3's dismountVehicle) lets go of the boat it steered,
  // shown where the client moved it last (the rider stands on it there); its interpolation goes on from there
  // (Boat.tickLerp: no lerp while controlled; v_boat_dismount on 1.19)
  it('shows the boat it steered where it moved it, once a teleport dismounts it', async () => {
    const t = await inBoat('1.19')
    try {
      t.bot.setControlState('forward', true)
      t.ticks(3)
      await settle()
      const boat = t.bot.entities[100]
      const at = boat.position.clone()
      assert.ok(at.x !== 8.5 || at.z !== 8.5, 'the boat moved')
      t.client.write('position', { x: at.x, y: at.y + 0.5625, z: at.z, yaw: 0, pitch: 0, flags: 0, teleportId: 2, dismountVehicle: true })
      await settle()
      assert.strictEqual(t.bot.vehicle, null)
      assert.deepStrictEqual(boat.interpolatedPosition.toArray(), at.toArray())
    } finally {
      await t.close()
    }
  })
  // 1.8's rider is in the water its boat floats on (Entity.handleWaterMovement, which 1.9 skips for a boat's passenger):
  // its tick from no motion (Entity.updateRidden) swims, its input at 0.02F, 0.8F of the motion kept, then 0.02 down
  // (EntityLivingBase.moveEntityWithHeading; v_boat_dismount on 1.8.8)
  it('swims in the water its boat floats on, on 1.8', async () => {
    const t = await inBoat('1.8.8', { blocks: pool(), y: 65.9 })
    try {
      t.bot.setControlState('forward', true)
      t.ticks(2)
      await settle()
      const { x, y, z } = t.bot.entity.velocity
      // (yaw 0: the input along z; the recorded 0.015680000419616702)
      assert.deepStrictEqual([x, y, z].map(v => v + 0), [0, -0.02, 0.015680000419616702])
    } finally {
      await t.close()
    }
  })
  // 1.16's client stops riding by itself (Player.rideTick, the shift key down), in the passenger's tick after its
  // vehicle's: the boat it steers ticks first and tells its paddles, then the player goes on foot (m_c_mount_click_oak_boat
  // tick 91 on 1.16.5)
  it('steers its boat a last time before it stops riding on 1.16', async () => {
    const t = await inBoat('1.16.5')
    try {
      t.bot.setControlState('sneak', true)
      let names = []
      for (let i = 0; i < 3 && t.bot.vehicle; i++) {
        t.written.length = 0
        t.ticks(1)
        await settle()
        names = t.written.map(p => p.name)
      }
      assert.strictEqual(t.bot.vehicle, null, 'it stopped riding')
      assert.strictEqual(names[0], 'steer_boat', names.join(' '))
      assert.ok(!names.includes('vehicle_move'), names.join(' '))
    } finally {
      await t.close()
    }
  })
})
