/* eslint-env mocha */
// Where vanilla's client seats its player on a mount, version by version (Entity.positionRider, getPassengerAttachmentPoint,
// the mounts' own positionRider), and what riding leaves behind. Against a fake server, the bot stepped tick by tick.

const assert = require('assert')
const { Vec3 } = require('vec3')
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
