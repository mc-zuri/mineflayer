/* eslint-env mocha */
// Which mount the rider steers and how its ridden state starts and goes (Entity.getControllingPassenger,
// LivingEntity.travelRidden, the interpolation of the server's moves), and what the rider tells the server while riding
// (LocalPlayer.sendChanges), per version. Against a fake server, the bot stepped tick by tick.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const settle = () => sleep(50)

// The bot on its feet at (0.5, 65, 0.5) on a floor of stone and a vehicle (id 100) of that name at `at`, which the
// server puts the bot on (attach_entity before 1.9, set_passengers since) unless mount is false
async function riding (version, name, { at = new Vec3(3.5, 65, 1.5), mount = true, setup = () => {} } = {}) {
  const blocks = []
  for (let x = 0; x < 8; x++) for (let z = 0; z < 3; z++) blocks.push([x, 64, z, 'stone'])
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks })
  const { bot, client, registry } = t
  // an item of the version
  t.item = (itemName) => new (require('prismarine-item')(registry))(registry.itemsByName[itemName].id, 1)
  // the item in the selected hotbar slot
  t.hold = (itemName) => bot.inventory.updateSlot(bot.QUICK_BAR_START + bot.quickBarSlot, t.item(itemName))
  // a horse's (or camel's) saddle: from 1.21.5 the one it wears, before bit 4 of its flags
  t.saddle = (v = t.vehicle) => {
    if (registry.version['>=']('1.21.5')) v.setEquipment(7, t.item('saddle'))
    else v.metadata[require('../lib/horse').horseFlagsIndex(registry)] = 0x02 | 0x04
  }
  t.attribute = (v, speed) => {
    v.attributes = { [registry.version['>=']('1.21.2') ? 'minecraft:movement_speed' : 'minecraft:generic.movement_speed']: { value: speed, modifiers: [] } }
  }
  let vehicle
  if (mount) {
    const mounted = once(bot, 'mount')
    if (registry.version['>=']('1.9')) client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
    else client.write('attach_entity', { entityId: bot.entity.id, vehicleId: 100, leash: false })
    await mounted
    vehicle = bot.entities[100]
  } else {
    vehicle = new (require('prismarine-entity')(version))(100)
    bot.entities[100] = vehicle
  }
  const type = registry.entitiesByName[name]
  Object.assign(vehicle, { name, type: type?.type ?? 'other', height: type?.height ?? 1, width: type?.width ?? 1, onGround: true, metadata: [], isValid: true })
  vehicle.position.set(at.x, at.y, at.z)
  vehicle.interpolatedPosition?.set(at.x, at.y, at.z)
  vehicle.yaw = 0
  vehicle.pitch = 0
  setup(vehicle, t)
  await settle()
  t.written.length = 0
  t.vehicle = vehicle
  return t
}

describe('mounts the rider steers, and what goes with them', function () {
  this.timeout(20 * 1000)

  describe('[A] a llama with a saddle on 1.21.5 (Mob.isSaddled, AbstractHorse.getControllingPassenger)', () => {
    it('[A] 1.21.5 steers a llama with a saddle in its slot, 1.21.6 does not', async () => {
      for (const [version, steers] of [['1.21.5', true], ['1.21.6', false]]) {
        const t = await riding(version, 'llama', { setup: (v, t) => { v.setEquipment(7, t.item('saddle')); t.attribute(v, 0.175) } })
        try {
          const start = t.vehicle.position.clone()
          t.bot.setControlState('forward', true)
          t.ticks(5)
          await settle()
          assert.strictEqual(t.vehicle.position.distanceTo(start) > 0.05, steers, version)
          assert.strictEqual(t.names(/^vehicle_move$/).length > 0, steers, version)
        } finally {
          await t.close()
        }
      }
    })

    it('[A] a steered llama jumps on its rider\'s released jump (PlayerRideableJumping)', async () => {
      const t = await riding('1.21.5', 'llama', { setup: (v, t) => { v.setEquipment(7, t.item('saddle')); t.attribute(v, 0.175) } })
      try {
        t.bot.setControlState('jump', true)
        t.ticks(3)
        t.bot.setControlState('jump', false)
        t.ticks(2)
        await settle()
        assert.strictEqual(t.written.filter(p => p.name === 'entity_action' && /riding_jump/i.test(String(p.data.actionId))).length, 1)
      } finally {
        await t.close()
      }
    })
  })

  describe('[B] a mount taken over goes on with its interpolation (LivingEntity.aiStep before travelRidden, 1.21.2+)', () => {
    it('[B] a horse saddled while it eases to a server move goes on toward it over the steps left', async () => {
      const t = await riding('1.21.4', 'horse', { setup: (v, t) => t.attribute(v, 0.225) })
      try {
        const start = t.vehicle.position.x
        const moved = once(t.bot._client, 'rel_entity_move')
        t.client.write('rel_entity_move', { entityId: 100, dX: 3 * 4096, dY: 0, dZ: 0, onGround: true })
        await moved
        t.saddle()
        t.ticks(1)
        assert.ok(Math.abs(t.vehicle.position.x - (start + 1)) < 1e-6, `after a step ${t.vehicle.position.x}`)
        t.ticks(2)
        assert.ok(Math.abs(t.vehicle.position.x - (start + 3)) < 1e-6, `after the steps ${t.vehicle.position.x}`)
      } finally {
        await t.close()
      }
    })

    it('[B] from 1.21.5 the vehicle_move of a mount easing to a server move says the rotation it heads to', async () => {
      const t = await riding('1.21.5', 'horse', { setup: (v, t) => t.attribute(v, 0.225) })
      try {
        const moved = once(t.bot._client, 'entity_move_look')
        t.client.write('entity_move_look', { entityId: 100, dX: 4096, dY: 0, dZ: 0, yaw: 64, pitch: 0, onGround: true })
        await moved
        t.saddle()
        t.ticks(1)
        await settle()
        const [move] = t.written.filter(p => p.name === 'vehicle_move')
        // (yaw 64 / 256 of a turn: 90 degrees)
        assert.strictEqual(move.data.yaw, 90)
      } finally {
        await t.close()
      }
    })

    it('[B] the steered mob holds the float yaw it turned to, where it seats its rider (vehicle.yawDegrees)', async () => {
      const t = await riding('1.21.4', 'horse', { setup: (v, t) => { t.saddle(v); t.attribute(v, 0.225) } })
      try {
        t.ticks(2)
        assert.ok(t.vehicle.yawDegrees != null && Number.isFinite(Number(t.vehicle.yawDegrees)))
      } finally {
        await t.close()
      }
    })
  })

  describe('[C] the sneak key the rider lets go of asks no more to dismount (LocalPlayer.tick: the live shift key)', () => {
    it('[C] a sneak pressed and let go before the tick sends no shift', async () => {
      const t = await riding('1.20.4', 'minecart')
      try {
        t.bot.setControlState('sneak', true)
        t.bot.setControlState('sneak', false)
        t.ticks(1)
        await settle()
        const steers = t.written.filter(p => p.name === 'steer_vehicle')
        assert.ok(steers.length > 0)
        for (const { data } of steers) assert.strictEqual(Number(data.jump) & 0x02, 0)
      } finally {
        await t.close()
      }
    })
  })

  describe('[G] before 1.19.4 a ridden mob\'s synced data is read by its index (no names in minecraft-data)', () => {
    it('[G] 1.16.5: a pig\'s boost time synced by index boosts the pig the rider steers', async () => {
      const ride = async (boost) => {
        const t = await riding('1.16.5', 'pig', { setup: (v, t) => { t.attribute(v, 0.25); t.hold('carrot_on_a_stick') } })
        try {
          t.ticks(2)
          if (boost) {
            const synced = once(t.bot._client, 'entity_metadata')
            // (Pig: saddle at 16, boost time at 17)
            t.client.write('entity_metadata', { entityId: 100, metadata: [{ key: 17, type: 1, value: 140 }] })
            await synced
          }
          const start = t.vehicle.position.clone()
          t.bot.setControlState('forward', true)
          t.ticks(10)
          return t.vehicle.position.distanceTo(start)
        } finally {
          await t.close()
        }
      }
      const plain = await ride(false)
      const boosted = await ride(true)
      assert.ok(boosted > plain + 0.05, `${boosted} after a boost, ${plain} without`)
    })
  })

  describe('[H] 1.11 - 1.19.2 a pig or strider spends the empty boost its spawn data started (ItemBasedSteering.onSynced)', () => {
    it('[H] 1.16.5: the first steered tick of a pig goes at the empty boost\'s speed, once', async () => {
      const first = async (spent) => {
        const t = await riding('1.16.5', 'pig', { setup: (v, t) => { t.attribute(v, 0.25); t.hold('carrot_on_a_stick'); v.spentSpawnBoost = spent } })
        try {
          t.bot.setControlState('forward', true)
          t.ticks(2)
          assert.strictEqual(t.vehicle.spentSpawnBoost, true)
          return t.vehicle.velocity.clone()
        } finally {
          await t.close()
        }
      }
      const fresh = await first(undefined)
      const spent = await first(true)
      assert.ok(fresh.distanceTo(spent) > 1e-9, `${fresh} ${spent}`)
    })
  })

  describe('[I] 1.16: a rider whose shift was down after its tick stops riding on its own (Player.rideTick)', () => {
    it('[I] 1.16.5 gets off before the server says so, 1.17.1 waits for it', async () => {
      for (const [version, off] of [['1.16.5', true], ['1.17.1', false]]) {
        const t = await riding(version, 'minecart')
        try {
          t.bot.setControlState('sneak', true)
          t.ticks(2)
          assert.strictEqual(t.bot.vehicle == null, off, version)
        } finally {
          await t.close()
        }
      }
    })
  })

  describe('[J] before 1.19 an unsaddled horse is its rider\'s (AbstractHorse.canBeSteered)', () => {
    it('[J] 1.16.5: the rider moves its unsaddled horse (it falls), which jumps only saddled', async () => {
      const t = await riding('1.16.5', 'horse', { at: new Vec3(3.5, 66, 1.5), setup: (v, t) => { t.attribute(v, 0.225); v.onGround = false } })
      try {
        t.bot.setControlState('jump', true)
        t.ticks(3)
        t.bot.setControlState('jump', false)
        t.ticks(2)
        await settle()
        assert.ok(t.vehicle.position.y < 66, `the horse stayed at ${t.vehicle.position.y}`)
        assert.strictEqual(t.written.filter(p => p.name === 'entity_action' && /riding_jump/i.test(String(p.data.actionId))).length, 0)
      } finally {
        await t.close()
      }
    })
  })

  describe('[U] a new ridden state starts where the client shows the mount (Entity.isControlledByLocalInstance)', () => {
    it('[U] before 1.21.2 a horse saddled while it eases to a server move starts where the client showed it', async () => {
      // (the interpolation stops under the rider's control before 1.21.2: the horse stays where it was shown)
      const t = await riding('1.20.4', 'horse', { setup: (v, t) => t.attribute(v, 0.225) })
      try {
        const start = t.vehicle.position.x
        const moved = once(t.bot._client, 'rel_entity_move')
        t.client.write('rel_entity_move', { entityId: 100, dX: 3 * 4096, dY: 0, dZ: 0, onGround: true })
        await moved
        t.saddle()
        t.ticks(1)
        assert.ok(Math.abs(t.vehicle.position.x - start) < 1e-6, `the horse is at ${t.vehicle.position.x}`)
      } finally {
        await t.close()
      }
    })
  })

  describe('[S] a mob the player pushed keeps that push (Entity.push)', () => {
    it('[S] a pig the standing player overlaps is pushed away, the push kept in entity.lastPush', async () => {
      const t = await riding('1.20.4', 'pig', { mount: false, at: new Vec3(0.9, 65, 0.5) })
      try {
        t.ticks(1)
        assert.ok(t.vehicle.lastPush, 'no push kept')
        assert.ok(t.vehicle.lastPush.x > 0, `pushed by ${t.vehicle.lastPush.x}`)
      } finally {
        await t.close()
      }
    })
  })

  describe('[-0 pitch] a vehicle_move never says pitch -0 (the float the vehicle holds)', () => {
    it('[-0 pitch] a mount of no steering rule the rider moves sends pitch 0, not -0', async () => {
      const t = await riding('1.20.4', 'chicken')
      try {
        t.ticks(2)
        await settle()
        const moves = t.written.filter(p => p.name === 'vehicle_move')
        assert.ok(moves.length > 0)
        for (const { data } of moves) assert.ok(!Object.is(data.pitch, -0), 'pitch -0')
      } finally {
        await t.close()
      }
    })
  })

  describe('[Y] 1.8: the client moves no ridden mob, and steers no boat (EntityHorse / EntityPig on the server only)', () => {
    it('[Y] 1.8.8: a saddled horse does not go on the rider\'s forward key', async () => {
      const t = await riding('1.8.8', 'EntityHorse', { setup: (v, t) => { t.saddle(v); t.attribute(v, 0.225) } })
      try {
        const start = t.vehicle.position.clone()
        t.bot.setControlState('forward', true)
        t.ticks(5)
        assert.ok(t.vehicle.position.distanceTo(start) < 1e-9, `moved to ${t.vehicle.position}`)
      } finally {
        await t.close()
      }
    })

    it('[Y] 1.8.8: the rider of a boat sends no steer_boat (ServerboundPaddleBoatPacket came with 1.9)', async () => {
      const t = await riding('1.8.8', 'Boat')
      try {
        // (what the bot writes: 1.8's protocol has no such packet for the server to read)
        const writes = []
        const write = t.bot._client.write.bind(t.bot._client)
        t.bot._client.write = (name, params) => {
          writes.push(name)
          return write(name, params)
        }
        t.bot.setControlState('forward', true)
        t.ticks(3)
        await settle()
        assert.ok(writes.includes('steer_vehicle'))
        assert.ok(!writes.includes('steer_boat'))
      } finally {
        await t.close()
      }
    })
  })
})
