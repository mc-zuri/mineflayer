/* eslint-env mocha */
// Where vanilla's client seats its player on a mount, version by version (Entity.positionRider, getPassengerAttachmentPoint,
// the mounts' own positionRider), and what riding leaves behind. Against a fake server, the bot stepped tick by tick.

const assert = require('assert')
const { Vec3 } = require('vec3')
const conv = require('../lib/conversions')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const f32 = Math.fround

// a floor of stone to stand on
function ground () {
  const blocks = []
  for (let x = 0; x < 8; x++) for (let z = 0; z < 3; z++) blocks.push([x, 64, z, 'stone'])
  return blocks
}

// The bot on its feet at (0.5, 65, 0.5), then put by the server on a vehicle (id 100) of that name standing at `at`
// (before 1.9 by attach_entity); setup(vehicle, t) before the vehicle is first ticked
async function riding (version, name, { at = new Vec3(3.5, 65, 1.5), setup = () => {} } = {}) {
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
  const { bot, client, registry } = t
  const mounted = once(bot, 'mount')
  if (registry.version['>=']('1.9')) client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  else client.write('attach_entity', { entityId: bot.entity.id, vehicleId: 100, leash: false })
  await mounted
  const vehicle = bot.entities[100]
  const type = registry.entitiesByName[name]
  Object.assign(vehicle, { name, type: type?.type ?? 'other', height: type?.height ?? 1, width: type?.width ?? 1, onGround: true, metadata: [] })
  vehicle.position.set(at.x, at.y, at.z)
  vehicle.interpolatedPosition?.set(at.x, at.y, at.z)
  vehicle.yaw = 0
  setup(vehicle, t)
  await sleep(50)
  t.written.length = 0
  return { ...t, vehicle }
}

// the rider's feet against its vehicle's position after a tick
async function seated (version, name, options) {
  const t = await riding(version, name, options)
  try {
    t.ticks(1)
    return { at: t.bot.entity.position.minus(t.vehicle.position), bot: t.bot, vehicle: t.vehicle }
  } finally {
    await t.close()
  }
}

describe('mount seats (Entity.positionRider)', function () {
  this.timeout(20 * 1000)

  describe('[E] the camel seats its driver on its body anchor as it sits (Camel.getBodyAnchorAnimationYOffset)', () => {
    it('[E] a camel sitting down long ago seats its rider on its sitting body, 0.2F above its sitting height', async () => {
      const version = '1.20.4'
      const registry = require('prismarine-registry')(version)
      const keys = registry.entitiesByName.camel.metadataKeys
      const t = await riding(version, 'camel', {
        setup: (camel, { client }) => {
          camel.metadata[keys.indexOf('pose')] = 10 // SITTING
          camel.metadata[keys.indexOf('last_pose_change_tick')] = -10 // sat down at tick 10
          client.write('update_time', { age: [0, 1000], time: [0, 1000] })
        }
      })
      try {
        await sleep(50)
        t.ticks(1)
        const dy = t.bot.entity.position.y - t.vehicle.position.y
        // its sitting height (2.375F - 1.43F) less 0.375, then 0.2F up from the bottom of its sit, in float; - 0.6F
        const height = f32(f32(2.375) - f32(1.43))
        const bottom = f32(f32(1.43) - f32(f32(1.43) - f32(0.2)))
        assert.strictEqual(dy, f32(height - 0.375 + bottom) + f32(-0.6))
      } finally {
        await t.close()
      }
    })

    it('[E] a camel the rider does not steer seats it by the camel\'s own yaw (Camel.positionRider)', async () => {
      // (unsaddled: not its rider's; the camel faces east, yaw -90, the rider south, 0)
      const { at } = await seated('1.20.4', 'camel', { setup: (camel) => { camel.yaw = conv.fromNotchianYaw(-90) } })
      assert.ok(Math.abs(at.x - 0.5) < 1e-6 && Math.abs(at.z) < 1e-6, String(at))
    })
  })

  describe('[T] the camel before 1.20.2 (Camel.positionRider)', () => {
    it('[T] before 1.20.2 a camel seats its rider at the float sum of its height less 0.6F and the player\'s -0.35', async () => {
      const { at } = await seated('1.20.1', 'camel')
      assert.strictEqual(at.y, f32(f32(f32(2.375) - f32(0.6)) + -0.35))
      assert.ok(Math.abs(Math.hypot(at.x, at.z) - 0.5) < 1e-6, String(at))
    })
  })

  describe('[K] the llama before 1.20.5 (Llama.positionRider)', () => {
    it('[K] before 1.20.5 a llama seats its rider 0.3 behind its middle, at its version\'s height', async () => {
      // 1.11 - 1.17: 0.67 of its height, 1.18 - 1.20.1: 0.6, + the player's -0.35; 1.20.2 - 1.20.4: height - 0.5F - 0.6F
      for (const [version, y] of [['1.16.5', f32(1.87) * 0.67 + -0.35], ['1.19.4', f32(1.87) * 0.6 + -0.35], ['1.20.4', f32(f32(1.87) - f32(0.5)) + f32(-0.6)]]) {
        const { at } = await seated(version, 'llama')
        assert.ok(Math.abs(at.y - y) < 1e-9, `${version}: ${at.y} ${y}`)
        assert.ok(Math.abs(Math.hypot(at.x, at.z) - f32(0.3)) < 1e-6, `${version}: ${at}`)
      }
    })
  })

  describe('[M] the strider adds its riding offset, then the player\'s own (Entity.positionRider)', () => {
    it('[M] a strider seats its rider at its y plus its riding offset, then plus the player\'s', async () => {
      const at = new Vec3(3.5, 65.1, 1.5)
      const t = await riding('1.16.5', 'strider', { at })
      try {
        t.ticks(1)
        const riding = f32(1.7) - 0.19
        assert.strictEqual(t.bot.entity.position.y, (at.y + riding) + -0.35)
      } finally {
        await t.close()
      }
    })
  })

  describe('[N] the skeleton and zombie horses 1.20.2 - 1.20.4 (SkeletonHorse.getPassengerAttachmentPoint)', () => {
    it('[N] 1.20.2 - 1.20.4 a skeleton or zombie horse seats its rider 0.28125F below its height', async () => {
      for (const name of ['skeleton_horse', 'zombie_horse']) {
        const { at } = await seated('1.20.4', name)
        assert.strictEqual(at.y, f32(f32(1.6) - f32(0.28125)) + f32(-0.6), name)
      }
    })

    it('[N] a rearing skeleton horse does not move its rider', async () => {
      const t = await riding('1.20.4', 'skeleton_horse', { setup: (horse) => { horse.metadata[17] = 0x20 } })
      try {
        t.ticks(3)
        const at = t.bot.entity.position.minus(t.vehicle.position)
        assert.ok(t.vehicle.standAnimO > 0)
        assert.strictEqual(at.y, f32(f32(1.6) - f32(0.28125)) + f32(-0.6))
        assert.ok(at.x === 0 && at.z === 0, String(at))
      } finally {
        await t.close()
      }
    })
  })

  describe('[W] a bamboo chest boat before 1.21.2 (Boat.Type.BAMBOO)', () => {
    it('[W] a chest boat of the bamboo type seats its rider at a raft\'s height before 1.21.2', async () => {
      const typeIndex = require('prismarine-registry')('1.20.4').entitiesByName.chest_boat.metadataKeys.indexOf('type')
      const { at } = await seated('1.20.4', 'chest_boat', { setup: (boat) => { boat.metadata[typeIndex] = 8 } })
      assert.ok(Math.abs(at.y - (f32(f32(0.5625) * f32(0.8888889)) - 0.6)) < 1e-9, String(at.y))
    })
  })

  describe('[X] the mounts of 1.8 - 1.10 by their old names (Pig, EntityHorse)', () => {
    it('[X] 1.9 - 1.10\'s Pig seats its rider at 0.75 of its height, less the player\'s 0.35', async () => {
      const { at } = await seated('1.10.2', 'Pig', { setup: (pig) => { pig.height = 0.9 } })
      assert.ok(Math.abs(at.y - (f32(0.9) * 0.75 - 0.35)) < 1e-9, String(at.y))
    })

    it('[X] an EntityHorse seats by its variant from 1.9: a donkey 0.25 lower, a skeleton horse 0.1875, a mule from 1.11', async () => {
      // (its variant: an int after its flags from 1.9, at 14 on 1.10)
      for (const [variant, lower] of [[0, 0], [1, 0.25], [2, 0], [4, 0.1875]]) {
        const { at } = await seated('1.10.2', 'EntityHorse', { setup: (horse) => { horse.height = 1.6; horse.metadata[14] = variant } })
        assert.ok(Math.abs(at.y - (f32(1.6) * 0.75 - lower - 0.35)) < 1e-9, `variant ${variant}: ${at.y}`)
      }
    })

    it('[X] before 1.11 a pig is moved by the client of its first passenger without the stick (canPassengerSteer)', async () => {
      // (a pig a block above the floor: the client moves it, so it falls)
      const t = await riding('1.10.2', 'Pig', { at: new Vec3(3.5, 66, 1.5), setup: (pig) => { pig.height = 0.9; pig.width = 0.9 } })
      try {
        t.ticks(10)
        assert.ok(t.vehicle.position.y < 65.5, String(t.vehicle.position))
      } finally {
        await t.close()
      }
    })
  })

  describe('[Y] the boat of 1.8 (EntityBoat.updateRiderPosition)', () => {
    it('[Y] 1.8 seats a boat\'s rider 0.4 along its yaw, at -0.3 then the player\'s -0.35', async () => {
      const { at } = await seated('1.8.8', 'Boat')
      // (yaw 0: notchian 180, cos -1 along x)
      assert.ok(Math.abs(at.y - (-0.3 + -0.35)) < 1e-9, String(at.y))
      assert.ok(Math.abs(Math.hypot(at.x, at.z) - 0.4) < 1e-9, String(at))
    })
  })

  describe('[L] before 1.13 a horse turns its new rider to it (AbstractHorse.mountTo)', () => {
    it('[L] before 1.13 an empty hand climbing a horse turns the player to the horse\'s rotation', async () => {
      const t = await fakeServerBot('1.12.2', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        const Entity = require('prismarine-entity')('1.12.2')
        const horse = new Entity(7)
        Object.assign(horse, { name: 'horse', type: 'animal', position: new Vec3(0.5, 65, 2.5), width: 1.3964844, height: 1.6, yaw: conv.fromNotchianYaw(90), pitch: 0, metadata: [], isValid: true })
        t.bot.entities[7] = horse
        assert.strictEqual(t.bot.mount(horse), 'success')
        assert.strictEqual(Number(t.bot.entity.yawDegrees), 90)
      } finally {
        await t.close()
      }
    })
  })

  describe('[P] a rider is off the ground (Entity.rideTick)', () => {
    it('[P] while riding the rider was not on the ground after its last tick either: its first tick on foot is in the air', async () => {
      const t = await fakeServerBot('1.20.4', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        // on its feet on the stone, then on a minecart for one tick
        t.ticks(3)
        assert.strictEqual(t.bot.entity.lastOnGround, true)
        const mounted = once(t.bot, 'mount')
        t.client.write('set_passengers', { entityId: 100, passengers: [t.bot.entity.id] })
        await mounted
        Object.assign(t.bot.entities[100], { name: 'minecart', type: 'other', height: 0.7, width: 0.98, onGround: true, metadata: [] })
        t.ticks(1)
        assert.strictEqual(t.bot.entity.lastOnGround, false)
      } finally {
        await t.close()
      }
    })
  })
})
