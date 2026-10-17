/* eslint-env mocha */
// What a rider does on the mounts and seats vanilla's client knows: which it steers (Entity.getControllingPassenger),
// where it sits (Entity.positionRider, EntityType.passengerAttachments), how it moves in the water it sits in, and what
// it tells the server while riding (LocalPlayer.sendChanges). Against a fake server, the bot stepped tick by tick.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const f32 = Math.fround
const settle = () => sleep(50)

// a row of stone to stand on, and what else is asked for
function ground (extra = []) {
  const blocks = []
  for (let x = 0; x < 8; x++) for (let z = 0; z < 3; z++) blocks.push([x, 64, z, 'stone'])
  return blocks.concat(extra)
}

// The bot on its feet at (0.5, 65, 0.5), then put by the server on a vehicle (id 100) of that name standing at `at`
// (yaw: the rotation the server's teleport gives the bot first, in degrees)
async function riding (version, name, { at = new Vec3(3.5, 65, 1.5), blocks = ground(), setup = () => {}, yaw = null } = {}) {
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks })
  const { bot, client, registry } = t
  if (yaw !== null) {
    const reply = once(client, registry.version['>=']('26.3') ? 'teleport_confirm' : 'position_look')
    client.write('position', { x: 0.5, y: 65, z: 0.5, yaw, pitch: 0, flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0, teleportId: 2 })
    await reply
    bot.physicsTick()
  }
  const mounted = once(bot, 'mount')
  client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  await mounted
  const vehicle = bot.entities[100]
  const type = registry.entitiesByName[name]
  Object.assign(vehicle, { name, type: type?.type ?? 'other', height: type?.height ?? 1, width: type?.width ?? 1, onGround: true, metadata: [] })
  vehicle.position.set(at.x, at.y, at.z)
  vehicle.interpolatedPosition?.set(at.x, at.y, at.z)
  vehicle.yaw = 0
  setup(vehicle, t)
  await settle()
  t.written.length = 0
  return { ...t, vehicle }
}

const item = (registry, name) => new (require('prismarine-item')(registry))(registry.itemsByName[name].id, 1)
const saddle = (vehicle, registry) => vehicle.setEquipment(7, item(registry, 'saddle'))
// the rider's offset from its vehicle's position
const offset = (bot, vehicle) => bot.entity.position.minus(vehicle.position)
const ridingJumps = (written) => written.filter(p => p.name === 'entity_action' && /riding_jump/i.test(String(p.data.actionId))).length

describe('riding (vanilla\'s mounts and seats)', function () {
  this.timeout(20 * 1000)

  describe('the nautilus (AbstractNautilus)', () => {
    it('a saddled nautilus is steered by its rider: it goes on the forward key, a released jump dashes it', async () => {
      const t = await riding('26.1', 'nautilus', { setup: (v, { registry }) => saddle(v, registry) })
      try {
        const start = t.vehicle.position.clone()
        t.bot.setControlState('forward', true)
        t.ticks(5)
        t.bot.setControlState('forward', false)
        await settle()
        assert.ok(t.vehicle.position.distanceTo(start) > 0.01, 'the nautilus did not move')
        assert.ok(t.names(/vehicle_move/).length > 0)
        // (PlayerRideableJumping: the jump charged while held goes on its release)
        t.bot.setControlState('jump', true)
        t.ticks(3)
        t.bot.setControlState('jump', false)
        t.ticks(2)
        await settle()
        assert.strictEqual(ridingJumps(t.written), 1)
      } finally {
        await t.close()
      }
    })

    it('an unsaddled nautilus has no controlling passenger: its rider sends no vehicle_move', async () => {
      const t = await riding('26.1', 'nautilus')
      try {
        t.ticks(3)
        await settle()
        assert.deepStrictEqual(t.names(/vehicle_move/), [])
      } finally {
        await t.close()
      }
    })
  })

  describe('the camel (Camel, CamelHusk)', () => {
    it('a camel is steered only while saddled (AbstractHorse.getControllingPassenger)', async () => {
      for (const version of ['1.20.4', '26.1']) {
        const t = await riding(version, 'camel')
        try {
          const start = t.vehicle.position.clone()
          t.bot.setControlState('forward', true)
          t.ticks(5)
          await settle()
          assert.ok(t.vehicle.position.equals(start), `${version}: the unsaddled camel moved`)
          assert.deepStrictEqual(t.names(/vehicle_move/), [], version)
        } finally {
          await t.close()
        }
      }
    })

    it('a saddled camel husk is steered as a camel is', async () => {
      const t = await riding('26.1', 'camel_husk', { setup: (v, { registry }) => saddle(v, registry) })
      try {
        const start = t.vehicle.position.clone()
        t.bot.setControlState('forward', true)
        t.ticks(5)
        await settle()
        assert.ok(t.vehicle.position.distanceTo(start) > 0.01, 'the camel husk did not move')
        assert.ok(t.names(/vehicle_move/).length > 0)
      } finally {
        await t.close()
      }
    })

    it('a steered camel seats its rider by the camel\'s own yaw, not the rider\'s unwrapped one (Entity.setRot)', async () => {
      // the rider has turned ten thousand times round: its float yaw (3600090) is the camel's (90) only within a turn
      const t = await riding('26.1', 'camel', { yaw: 3600090, setup: (v, { registry }) => saddle(v, registry) })
      try {
        t.ticks(2)
        const mth = t.bot.physicsEngine.mth
        const seat = yaw => {
          const angle = f32(-f32(yaw) * f32(0.017453292))
          return { x: 0.5 * mth.sin(angle), z: 0.5 * mth.cos(angle) }
        }
        const at = offset(t.bot, t.vehicle)
        // (the two seats differ: the float radians of the unwrapped yaw are off)
        assert.ok(Math.abs(seat(3600090).z - seat(90).z) > 1e-4)
        assert.ok(Math.abs(at.z - seat(90).z) < 1e-9, `${at} ${seat(90).z}`)
      } finally {
        await t.close()
      }
    })
  })

  describe('seats (EntityType.passengerAttachments)', () => {
  })

  describe('the cushion (26.3)', () => {
  })

  describe('in the water', () => {
  })

  describe('a rearing horse (AbstractHorse.standAnim)', () => {
  })

  describe('the mount\'s synced data (onSyncedDataUpdated)', () => {
  })

  describe('what a passenger sends (LocalPlayer.sendChanges)', () => {
  })
})
