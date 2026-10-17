/* eslint-env mocha */
// The mounts as vanilla's client rides them, version by version: which it moves itself, where it seats its rider,
// what it tells the server. Against a fake server, the bot stepped tick by tick. Each describe is one fix.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const settle = () => sleep(50)

// a floor of stone to stand on, and what else is asked for
function ground (extra = []) {
  const blocks = []
  for (let x = 0; x < 16; x++) for (let z = 0; z < 4; z++) blocks.push([x, 64, z, 'stone'])
  return blocks.concat(extra)
}

// The bot on its feet at (0.5, 65, 0.5), then put by the server on a vehicle (id 100) of that name standing at `at`
async function riding (version, name, { at = new Vec3(3.5, 65, 1.5), blocks = ground(), setup = () => {}, before = () => {} } = {}) {
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks })
  const { bot, client, registry } = t
  const vehicle = entityAt(t, 100, name, at)
  await before(vehicle, t)
  const mounted = once(bot, 'mount')
  // (before 1.9 the rider is attached to its vehicle: SPacketEntityAttach)
  if (registry.version['<']('1.9')) client.write('attach_entity', { entityId: bot.entity.id, vehicleId: 100, leash: false })
  else client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  await mounted
  setup(vehicle, t)
  await settle()
  t.written.length = 0
  return { ...t, vehicle, registry }
}

// An entity of that name the bot knows, standing at `at` (its spawn as mineflayer's setEntityData would leave it)
function entityAt ({ bot, registry }, id, name, at, yaw = 0) {
  const Entity = require('prismarine-entity')(bot.version)
  const entity = bot.entities[id] ?? (bot.entities[id] = new Entity(id))
  const type = registry.entitiesByName[name]
  Object.assign(entity, { name, type: type?.type ?? 'mob', height: type?.height ?? 1, width: type?.width ?? 1, onGround: true, metadata: [] })
  entity.position.set(at.x, at.y, at.z)
  entity.yaw = yaw
  bot.entityInterpolation?.spawn(entity)
  return entity
}

const item = (registry, name) => new (require('prismarine-item')(registry))(registry.itemsByName[name].id, 1)
const saddle = (vehicle, registry) => vehicle.setEquipment(7, item(registry, 'saddle'))
const packets = (t, name) => t.written.filter(p => p.name === name).map(p => p.data)

describe('mount parity (vanilla\'s client, version by version)', function () {
  this.timeout(30 * 1000)

  // A: 1.21.5 counts the saddle in a llama's saddle slot (Mob.isSaddled): its rider steers it as a horse
  describe('the 1.21.5 llama (AbstractHorse.getControllingPassenger)', () => {
    it('a llama with a saddle is steered on 1.21.5, never on 1.21.4 or 1.21.6', async () => {
      for (const [version, steered] of [['1.21.4', false], ['1.21.5', true], ['1.21.6', false]]) {
        const t = await riding(version, 'llama', { setup: (v, { registry }) => saddle(v, registry) })
        try {
          const start = t.vehicle.position.clone()
          t.bot.setControlState('forward', true)
          t.ticks(5)
          await settle()
          assert.strictEqual(t.vehicle.position.distanceTo(start) > 0.01, steered, `${version}: the llama moved`)
          assert.strictEqual(packets(t, 'vehicle_move').length > 0, steered, `${version}: vehicle_move`)
        } finally {
          await t.close()
        }
      }
    })
  })

  // AbstractHorse's flags: tame (2), saddled (4)
  const horseFlags = (registry) => {
    const named = registry.entitiesByName.horse?.metadataKeys?.indexOf('flags') ?? -1
    if (named >= 0) return named
    const v = registry.version
    return v['<']('1.9') ? 16 : v['<']('1.10') ? 12 : v['<']('1.14') ? 13 : v['<']('1.15') ? 15 : v['<']('1.17') ? 16 : 17
  }
  // the item in the bot's hand
  const holdInHand = (t, name) => t.bot.inventory.updateSlot(t.bot.QUICK_BAR_START + t.bot.quickBarSlot, item(t.registry, name))

  // B: a mount still easing to the server's move goes on with it under its rider, and the vehicle move reports where it
  // heads (Entity.lerpTargetX, from 1.21.5 lerpTargetYRot / XRot too: InterpolationHandler)
  describe('the interpolation a ridden mob is in (LivingEntity.aiStep, InterpolationHandler)', () => {
    it('a teleport of the steered horse turns it: the vehicle move reports the rotation it heads to (1.21.6)', async () => {
      const t = await riding('1.21.6', 'horse', { setup: (v, { registry }) => { saddle(v, registry); v.metadata[horseFlags(registry)] = 0x06 } })
      try {
        t.ticks(1)
        const flags = { x: false, y: false, z: false, yaw: false, pitch: false, dx: false, dy: false, dz: false, yawDelta: false }
        t.client.write('entity_teleport', { entityId: 100, x: 3.5, y: 65, z: 1.5, dx: 0, dy: 0, dz: 0, yaw: -90, pitch: 0, flags, onGround: true })
        await settle()
        t.written.length = 0
        t.ticks(1)
        await settle()
        const [move] = packets(t, 'vehicle_move')
        assert.strictEqual(move.yaw, -90)
      } finally {
        await t.close()
      }
    })

    it('a pig the server moved just before its rider took it reports that move\'s target first (1.21.9)', async () => {
      const t = await riding('1.21.9', 'pig', {
        before: async (v, t) => {
          t.client.write('rel_entity_move', { entityId: 100, dX: 0, dY: 0, dZ: 0, onGround: true })
          await settle()
        },
        setup: (v, t) => { saddle(v, t.registry); holdInHand(t, 'carrot_on_a_stick') }
      })
      try {
        t.ticks(4)
        await settle()
        // (it goes south, its rider's yaw 0)
        const moves = packets(t, 'vehicle_move')
        assert.strictEqual(moves[0].z, 1.5)
        assert.ok(moves[3].z > 1.5, 'the pig went on')
      } finally {
        await t.close()
      }
    })
  })

  // C: before 1.21.2 the shift of a passenger's input is the shift key as it is that tick (LocalPlayer.tick's
  // ServerboundPlayerInputPacket): let go, the next input no longer asks to dismount
  describe('the passenger\'s shift key (ServerboundPlayerInputPacket)', () => {
    it('the shift goes with the sneak key held, not after it is let go (1.20.4)', async () => {
      const t = await riding('1.20.4', 'pig')
      try {
        t.bot.setControlState('sneak', true)
        t.ticks(1)
        t.bot.setControlState('sneak', false)
        t.ticks(1)
        await settle()
        const shifts = packets(t, 'steer_vehicle').map(p => (p.jump & 0x02) !== 0)
        assert.deepStrictEqual(shifts.slice(-2), [true, false])
      } finally {
        await t.close()
      }
    })
  })

  // the rider's offset from its vehicle's position
  const offset = (bot, vehicle) => bot.entity.position.minus(vehicle.position)

  // D: a living vehicle turns over its interpolation steps (LivingEntity.aiStep's lerp, InterpolationHandler), and
  // where it seats its rider turns with it
  describe('a living vehicle\'s turn (LivingEntity.lerpPositionAndRotationStep)', () => {
    it('the llama the server turns a quarter seats its rider a third of the way round after a tick (1.21.4)', async () => {
      const t = await riding('1.21.4', 'llama')
      try {
        t.client.write('entity_look', { entityId: 100, yaw: 64, pitch: 0, onGround: true })
        await settle()
        t.ticks(1)
        await settle()
        // (from its spawn's 180) the seat (0, 1.37, -0.3) at 150 degrees, not at 90
        const seat = offset(t.bot, t.vehicle)
        assert.ok(Math.abs(seat.x - 0.15) < 1e-4, `x ${seat.x}`)
        assert.ok(Math.abs(seat.z - 0.3 * Math.cos(Math.PI / 6)) < 1e-4, `z ${seat.z}`)
      } finally {
        await t.close()
      }
    })
  })

  // E: a camel seats its rider by its pose, sat down or standing up over its animation, against the level's time as the
  // client keeps it (Camel.getBodyAnchorAnimationYOffset, ClientLevel.tickTime)
  describe('the camel\'s seat as it sits (Camel.getBodyAnchorAnimationYOffset)', () => {
    it('a camel that sat down long ago seats its rider low (1.21.6)', async () => {
      const t = await riding('1.21.6', 'camel', {
        setup: (v, { registry }) => {
          const keys = registry.entitiesByName.camel.metadataKeys
          v.metadata[keys.indexOf('pose')] = 10
          // (sat down at tick 1000)
          v.metadata[keys.indexOf('last_pose_change_tick')] = -1000
        }
      })
      try {
        t.client.write('update_time', { age: [0, 2000], time: [0, 2000], tickDayTime: true })
        await settle()
        t.ticks(1)
        await settle()
        // its sitting height 2.375F - 1.43F less 0.375, its sat-down 0.2F, the player's -0.6
        const f32 = Math.fround
        const expected = (f32(f32(2.375) - f32(1.43)) - 0.375) + f32(f32(1.43) - f32(f32(1.43) - f32(0.2))) - 0.6
        assert.ok(Math.abs(offset(t.bot, t.vehicle).y - expected) < 1e-6, `y ${offset(t.bot, t.vehicle).y}, expected ${expected}`)
      } finally {
        await t.close()
      }
    })
  })

  // F: before 1.19 a pig is its rider's to move only with the carrot on a stick in hand, from 1.11 (Pig.canBeSteered)
  describe('the pig without its stick before 1.19 (Pig.canBeSteered)', () => {
    it('a saddled pig its rider holds no stick for is the server\'s to move: no vehicle move (1.12.2)', async () => {
      const t = await riding('1.12.2', 'pig', { setup: (v, { registry }) => { v.metadata[13] = true } })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(3)
        await settle()
        assert.strictEqual(packets(t, 'vehicle_move').length, 0)
      } finally {
        await t.close()
      }
    })
  })

  // G: before 1.19.4 minecraft-data does not name a pig's synced data: its boost time is found by its index, after the
  // mob's flags and baby (where AbstractHorse's flags are)
  describe('a pig\'s boost before 1.19.4 (Pig.DATA_BOOST_TIME by index)', () => {
    it('the boost the server syncs speeds up the steered pig (1.12.2)', async () => {
      const ride = async (boost) => {
        const t = await riding('1.12.2', 'pig', { setup: (v, t) => { v.metadata[13] = true; holdInHand(t, 'carrot_on_a_stick') } })
        try {
          // (the pig steered a tick: the boost goes to its rider's control)
          t.ticks(1)
          await settle()
          if (boost) {
            t.client.write('entity_metadata', { entityId: 100, metadata: [{ key: 14, type: 1, value: 140 }] })
            await settle()
          }
          const start = t.vehicle.position.clone()
          t.bot.setControlState('forward', true)
          t.ticks(10)
          await settle()
          return t.vehicle.position.distanceTo(start)
        } finally {
          await t.close()
        }
      }
      const plain = await ride(false)
      const boosted = await ride(true)
      assert.ok(plain > 0.1, `the pig went ${plain}`)
      assert.ok(boosted > plain * 1.1, `boosted ${boosted}, plain ${plain}`)
    })
  })

  // H: 1.11 - 1.19.2 a pig's spawn data carries a boost time of 0, an empty boost its first steered tick spends at
  // 1 + 1.15F * Mth.sin(1 / 0 * PI) (ItemBasedSteering)
  describe('the empty boost of a pig\'s spawn data (ItemBasedSteering.onSynced, 1.11 - 1.19.2)', () => {
    it('the first steered tick of a pig goes at the spent boost\'s speed (1.12.2)', async () => {
      const t = await riding('1.12.2', 'pig', { setup: (v, t) => { v.metadata[13] = true; holdInHand(t, 'carrot_on_a_stick') } })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(1)
        await settle()
        const [move] = packets(t, 'vehicle_move')
        // (0.05625 at the plain speed)
        assert.ok(Math.abs(move.z - 1.5 - 0.0562437847) < 2e-6, `the pig went ${move.z - 1.5}`)
      } finally {
        await t.close()
      }
    })
  })

  // I: 1.16's rider whose shift key was down after its tick stops riding on its own client (Player.rideTick's
  // wantsToStopRiding), before the server says so
  describe('the 1.16 rider\'s own dismount (Player.rideTick)', () => {
    it('a rider that sneaked leaves its vehicle on the next tick on 1.16.5, not on 1.15.2', async () => {
      for (const [version, leaves] of [['1.15.2', false], ['1.16.5', true]]) {
        const t = await riding(version, 'pig')
        try {
          t.bot.setControlState('sneak', true)
          t.ticks(2)
          await settle()
          assert.strictEqual(t.bot.vehicle == null, leaves, `${version}: left its vehicle`)
        } finally {
          await t.close()
        }
      }
    })
  })

  // J: before 1.19 a horse is its first passenger's to move, saddled or not (AbstractHorse.canBeSteered): unsaddled it
  // goes on its own input, none, and its rider's client tells the server where it is
  describe('the unsaddled horse before 1.19 (AbstractHorse.canBeSteered)', () => {
    it('the rider of an unsaddled horse moves it by its own input, none: it falls straight down, told to the server (1.14.4)', async () => {
      const t = await riding('1.14.4', 'horse', { at: new Vec3(3.5, 66, 1.5) })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(3)
        await settle()
        const moves = packets(t, 'vehicle_move')
        assert.ok(moves.length > 0, 'vehicle moves')
        const last = moves[moves.length - 1]
        // (a block above the ground, in the air)
        assert.ok(last.y < 66, `at ${JSON.stringify(last)}`)
        assert.ok(Math.abs(last.z - 1.5) < 1e-9 && Math.abs(last.x - 3.5) < 1e-9, `at ${JSON.stringify(last)}`)
      } finally {
        await t.close()
      }
    })
  })

  // K: before 1.20.5 a llama seats its rider 0.3 behind its middle along its body's rotation, at 0.67 of its height
  // (0.6 from 1.18) with the player's -0.35 (Llama.positionRider)
  describe('the llama\'s seat before 1.20.5 (Llama.positionRider)', () => {
    it('a llama facing north seats its rider 0.3 south of its middle (1.12.2)', async () => {
      const t = await riding('1.12.2', 'llama')
      try {
        t.ticks(1)
        await settle()
        const seat = offset(t.bot, t.vehicle)
        assert.ok(Math.abs(seat.y - (Math.fround(1.87) * 0.67 - 0.35)) < 1e-9, `y ${seat.y}`)
        assert.ok(Math.abs(seat.z - 0.3) < 1e-6 && Math.abs(seat.x) < 1e-6, `x ${seat.x}, z ${seat.z}`)
      } finally {
        await t.close()
      }
    })
  })

  // L: before 1.13 the player that climbs on a horse turns to the horse's rotation on its own client too
  // (AbstractHorse.mountTo)
  describe('climbing on a horse before 1.13 (AbstractHorse.mountTo)', () => {
    it('the bot that mounts a horse looks the way the horse does (1.12.2)', async () => {
      const t = await fakeServerBot('1.12.2', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        const horse = entityAt(t, 100, 'horse', new Vec3(1.5, 65, 0.5), Math.PI / 2)
        horse.metadata[horseFlags(t.registry)] = 0x02
        t.bot.mount(horse)
        await settle()
        assert.ok(Math.abs(t.bot.entity.yaw - horse.yaw) < 1e-6, `yaw ${t.bot.entity.yaw}`)
      } finally {
        await t.close()
      }
    })
  })

  // M: a strider seats its rider at its y plus its riding offset, then plus the player's own (Entity.positionRider adds
  // them in turn)
  describe('the strider\'s seat (Strider.getPassengersRidingOffset)', () => {
    it('the rider of a strider at y 65 sits at (65 + its riding offset) - 0.35 (1.16.5)', async () => {
      const t = await riding('1.16.5', 'strider')
      try {
        t.ticks(1)
        await settle()
        const ridingOffset = Math.fround(t.vehicle.height) - 0.19 + 0
        assert.strictEqual(t.bot.entity.position.y, (65 + ridingOffset) + -0.35)
      } finally {
        await t.close()
      }
    })
  })

  // N: 1.20.2 - 1.20.4 a skeleton or zombie horse seats its rider 0.28125F below its height
  // (SkeletonHorse / ZombieHorse.getPassengerAttachmentPoint)
  describe('the undead horses\' seat on 1.20.2 - 1.20.4 (SkeletonHorse.getPassengerAttachmentPoint)', () => {
    it('a skeleton horse seats its rider 0.28125 below its height, with the player\'s -0.6 (1.20.4)', async () => {
      const t = await riding('1.20.4', 'skeleton_horse')
      try {
        t.ticks(1)
        await settle()
        const f32 = Math.fround
        const expected = f32(f32(t.vehicle.height) - f32(0.28125)) + f32(-0.6)
        assert.ok(Math.abs(offset(t.bot, t.vehicle).y - expected) < 1e-9, `y ${offset(t.bot, t.vehicle).y}, expected ${expected}`)
      } finally {
        await t.close()
      }
    })
  })

  // O: a steered mob that does not turn with its rider keeps its own pitch, a float never -0 (Entity.getXRot, 0.0F):
  // the vehicle move reports it so
  describe('the steered mob\'s own pitch (Entity.getXRot)', () => {
    it('a sitting camel, which does not turn with its rider, reports a pitch of 0, not -0 (1.21.6)', async () => {
      const t = await riding('1.21.6', 'camel', {
        setup: (v, { registry }) => {
          const keys = registry.entitiesByName.camel.metadataKeys
          saddle(v, registry)
          v.metadata[keys.indexOf('pose')] = 10
          v.metadata[keys.indexOf('last_pose_change_tick')] = -1000
        }
      })
      try {
        t.client.write('update_time', { age: [0, 2000], time: [0, 2000], tickDayTime: true })
        await settle()
        t.ticks(1)
        await settle()
        const [move] = packets(t, 'vehicle_move')
        assert.ok(Object.is(move.pitch, 0), `pitch ${Object.is(move.pitch, -0) ? '-0' : move.pitch}`)
      } finally {
        await t.close()
      }
    })
  })

  // P: a passenger does not touch the ground (Entity.rideTick moves it by no move of its own): its first tick on foot
  // after it leaves the vehicle keeps the air's inertia, as after a tick in the air
  describe('the rider\'s first tick on foot (Entity.onGround while riding)', () => {
    it('after the dismount the rider\'s first tick keeps its motion as in the air (1.14.4)', async () => {
      const t = await riding('1.14.4', 'pig', { before: (v, t) => t.ticks(2) })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(2)
        await settle()
        const dismounted = once(t.bot, 'dismount')
        t.client.write('set_passengers', { entityId: 100, passengers: [] })
        await dismounted
        t.ticks(1)
        await settle()
        // (its motion after its last tick riding: the air's walk 0.0196 kept by 0.91F; this tick 0.0196 more, kept by
        // 0.91F as in the air, not by the ground's 0.546F * 0.91F)
        const f32 = Math.fround
        const ridden = 0.0196 * f32(0.91)
        assert.ok(Math.abs(t.bot.entity.velocity.z - (ridden + 0.0196) * f32(0.91)) < 1e-6, `z motion ${t.bot.entity.velocity.z}`)
      } finally {
        await t.close()
      }
    })
  })

  // Q: 1.21.2+'s position sync carries a motion the client does not take (ClientPacketListener.handleEntityPositionSync)
  describe('the position sync\'s motion (ClientboundEntityPositionSyncPacket)', () => {
    it('a pig the server syncs keeps its own motion (1.21.3)', async () => {
      const t = await fakeServerBot('1.21.3', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        const pig = entityAt(t, 101, 'pig', new Vec3(3.5, 65, 1.5))
        t.client.write('sync_entity_position', { entityId: 101, x: 3.5, y: 65, z: 1.5, dx: 0.5, dy: 0, dz: 0, yaw: 0, pitch: 0, onGround: true })
        await settle()
        assert.strictEqual(pig.velocity.x, 0)
      } finally {
        await t.close()
      }
    })
  })

  // R: from 1.16 the client keeps an entity's packet position as a double (Entity.packetCoordinates, VecDeltaCodec from
  // 1.19): a relative move of 0 on an axis keeps it as it is, another is added to it floored to 1/4096 before 1.19.4,
  // rounded from 1.19.4 (VecDeltaCodec.encode)
  describe('the packet position\'s codec (VecDeltaCodec)', () => {
    const moved = async (version, x, dX) => {
      const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        const pig = entityAt(t, 101, 'pig', new Vec3(3.5, 65, 1.5))
        t.client.write('entity_teleport', { entityId: 101, x, y: 65, z: 1.5, yaw: 0, pitch: 0, onGround: true })
        await settle()
        t.client.write('rel_entity_move', { entityId: 101, dX, dY: 0, dZ: 4096, onGround: true })
        await settle()
        return pig.position.x
      } finally {
        await t.close()
      }
    }

    it('an axis a move does not change keeps the teleport\'s double (1.16.5)', async () => {
      assert.strictEqual(await moved('1.16.5', 3.5 + 0.3 / 4096, 0), 3.5 + 0.3 / 4096)
    })

    it('a move adds to the position floored before 1.19.4, rounded from 1.19.4', async () => {
      assert.strictEqual(await moved('1.19.2', 3.5 + 0.7 / 4096, 1), (14336 + 1) / 4096)
      assert.strictEqual(await moved('1.19.4', 3.5 + 0.7 / 4096, 1), (14337 + 1) / 4096)
    })
  })

  // S: a mob the player pushed was pushed back (Entity.push): the push goes into its next tick, steered too
  describe('the push a mount took (Entity.push)', () => {
    it('a camel the bot pushed and then mounted goes on with the push (1.21.1)', async () => {
      const t = await riding('1.21.1', 'camel', {
        at: new Vec3(1.2, 65, 0.5),
        before: (v, t) => { v.metadata[t.registry.entitiesByName.camel.metadataKeys.indexOf('flags')] = 0x04; t.ticks(1) }
      })
      try {
        t.ticks(1)
        await settle()
        assert.ok(t.vehicle.position.x > 1.2, `the camel at ${t.vehicle.position.x}`)
      } finally {
        await t.close()
      }
    })
  })

  // T: before 1.20.2 a camel seats its rider at its riding offset (its height less 0.6F) with the player's -0.35, 0.5
  // along its body's rotation (Camel.positionRider)
  describe('the camel\'s seat before 1.20.2 (Camel.positionRider)', () => {
    it('a standing camel seats its driver 1.425 up, 0.5 along its rotation (1.20.1)', async () => {
      const t = await riding('1.20.1', 'camel')
      try {
        t.ticks(1)
        await settle()
        const f32 = Math.fround
        const seat = offset(t.bot, t.vehicle)
        assert.ok(Math.abs(seat.y - f32(f32(f32(2.375) - f32(0.6)) + -0.35)) < 1e-9, `y ${seat.y}`)
        assert.ok(Math.abs(Math.hypot(seat.x, seat.z) - 0.5) < 1e-4, `x ${seat.x}, z ${seat.z}`)
      } finally {
        await t.close()
      }
    })
  })

  // U: before 1.21.2 a mount its rider takes control of stops interpolating where the client showed it
  // (Entity.isControlledByLocalInstance): its steering starts there, not at the server's last move
  describe('where a mount the bot takes control of starts (LivingEntity.aiStep)', () => {
    it('a pig the server moved a block just before is steered from where it was shown (1.20.4)', async () => {
      const t = await riding('1.20.4', 'pig', {
        before: async (v, t) => {
          t.client.write('rel_entity_move', { entityId: 100, dX: 4096, dY: 0, dZ: 0, onGround: true })
          await settle()
        },
        setup: (v, t) => { v.metadata[t.registry.entitiesByName.pig.metadataKeys.indexOf('saddle')] = true; holdInHand(t, 'carrot_on_a_stick') }
      })
      try {
        t.ticks(1)
        await settle()
        const [move] = packets(t, 'vehicle_move')
        assert.ok(Math.abs(move.x - 3.5) < 0.01, `x ${move.x}`)
      } finally {
        await t.close()
      }
    })
  })

  // V: from 1.15 a mob its rider moves keeps its packet position where the client put it (LivingEntity.aiStep's
  // setPacketCoordinates): the server's next relative move adds to it
  describe('the packet position of a steered mount (setPacketCoordinates)', () => {
    it('a pig let go of after steering takes the server\'s move from where its last steered tick started (1.15.2)', async () => {
      const t = await riding('1.15.2', 'pig', { setup: (v, t) => { v.metadata[15] = true; holdInHand(t, 'carrot_on_a_stick') } })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(4)
        await settle()
        // (where the last steered tick starts: its aiStep sets the packet position, floored to 1/4096, then moves it)
        const steered = t.vehicle.position.z
        assert.ok(steered > 1.6, `steered to ${steered}`)
        t.ticks(1)
        await settle()
        holdInHand(t, 'stone')
        t.bot.setControlState('forward', false)
        t.ticks(1)
        await settle()
        t.client.write('rel_entity_move', { entityId: 100, dX: 0, dY: 0, dZ: 4096, onGround: true })
        await settle()
        assert.strictEqual(t.vehicle.position.z, (Math.floor(steered * 4096) + 4096) / 4096)
      } finally {
        await t.close()
      }
    })
  })

  // W: before 1.21.2 a raft is a boat or chest boat of the bamboo type (Boat.Type.BAMBOO): it seats at its raft height
  describe('the chest raft before 1.21.2 (Boat.Type.BAMBOO)', () => {
    it('a chest boat of the bamboo type seats its rider at the raft\'s height (1.21.1)', async () => {
      const t = await riding('1.21.1', 'chest_boat', { setup: (v, { registry }) => { v.metadata[registry.entitiesByName.chest_boat.metadataKeys.indexOf('type')] = 8 } })
      try {
        t.ticks(1)
        await settle()
        const f32 = Math.fround
        const expected = f32(f32(t.vehicle.height) * f32(0.8888889)) - 0.6
        assert.ok(Math.abs(offset(t.bot, t.vehicle).y - expected) < 1e-6, `y ${offset(t.bot, t.vehicle).y}, expected ${expected}`)
      } finally {
        await t.close()
      }
    })
  })

  // X: before 1.11 minecraft-data names the pig Pig: it is a pig its rider steers with the carrot on a stick
  // (EntityPig.canBeSteered), and moves (canPassengerSteer)
  describe('the pig before 1.11 (EntityPig)', () => {
    it('the rider of a Pig with the stick in hand steers it (1.10.2)', async () => {
      const t = await riding('1.10.2', 'Pig', { setup: (v, t) => { v.metadata[12] = true; holdInHand(t, 'carrot_on_a_stick') } })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(5)
        await settle()
        const moves = packets(t, 'vehicle_move')
        assert.ok(moves.length > 0, 'vehicle moves')
        assert.ok(moves[moves.length - 1].z > 1.6, `the pig at ${JSON.stringify(moves[moves.length - 1])}`)
      } finally {
        await t.close()
      }
    })
  })

  // Y: 1.8's boat is the server's to move and seats its rider 0.4 along its yaw, at -0.3 with the player's -0.35
  // (EntityBoat.updateRiderPosition); there is no paddle packet before 1.9
  describe('the 1.8 boat (EntityBoat)', () => {
    it('a boat facing north seats its rider 0.4 west, 0.65 down, and is not paddled (1.8.8)', async () => {
      const t = await riding('1.8.8', 'Boat')
      try {
        t.bot.setControlState('forward', true)
        t.ticks(2)
        await settle()
        const seat = offset(t.bot, t.vehicle)
        assert.ok(Math.abs(seat.x + 0.4) < 1e-9 && Math.abs(seat.y + 0.65) < 1e-9 && Math.abs(seat.z) < 1e-9, `seat ${seat}`)
        assert.ok(!t.names().includes('steer_boat'), 'no steer_boat')
      } finally {
        await t.close()
      }
    })
  })

  // Z: 1.8's boat its player rides is moved by that player's client too (EntityBoat.onUpdate, isBoatEmpty false from
  // NetHandlerPlayClient.handleEntityAttach): pushed by the walk input of its rider's tick before; the server's moves
  // of it within a block are not taken
  describe('the 1.8 boat its player rides (EntityBoat.onUpdate)', () => {
    it('the boat on the ground goes 0.07 * 0.98F * 0.05F, halved, along its rider\'s yaw (1.8.8)', async () => {
      const t = await riding('1.8.8', 'Boat')
      try {
        t.bot.setControlState('forward', true)
        // (the first tick's boat has no input yet: its rider's tick comes after it)
        t.ticks(1)
        await settle()
        assert.strictEqual(t.vehicle.position.z, 1.5)
        t.ticks(1)
        await settle()
        // (the rider faces south, yaw 0: the boat goes toward +z)
        const push = 0.07 * Math.fround(0.98) * Math.fround(0.05) * 0.5
        assert.ok(Math.abs(t.vehicle.position.z - (1.5 + push)) < 1e-12, `z ${t.vehicle.position.z}`)
        // a server move of half a block is not taken
        const at = t.vehicle.position.z
        t.client.write('rel_entity_move', { entityId: 100, dX: 0, dY: 0, dZ: 16, onGround: true })
        await settle()
        assert.strictEqual(t.vehicle.position.z, at)
      } finally {
        await t.close()
      }
    })
  })

  // AA: before 1.11 EntityHorse's flags have it rear at bit 64 (32 is eating grass); from 1.11 AbstractHorse's at 32
  describe('the horse\'s rearing flag (EntityHorse.isRearing, AbstractHorse.isStanding)', () => {
    it('a horse rears on bit 64 before 1.11 (1.10.2) and on bit 32 from 1.11 (1.12.2)', async () => {
      for (const [version, name, bits] of [['1.10.2', 'EntityHorse', [0x40, 0x20]], ['1.12.2', 'horse', [0x20, 0x10]]]) {
        for (const [bit, rears] of [[bits[0], true], [bits[1], false]]) {
          const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
          try {
            const horse = entityAt(t, 100, name, new Vec3(3.5, 65, 1.5))
            horse.metadata[horseFlags(t.registry)] = 0x02 | bit
            t.ticks(2)
            await settle()
            assert.strictEqual((horse.standAnim ?? 0) > 0, rears, `${version} flags ${bit}`)
          } finally {
            await t.close()
          }
        }
      }
    })
  })

  // AB: the horse the player climbs on stops rearing and eating on the client too (AbstractHorse.doPlayerRide's
  // clearStanding and setEating(false))
  describe('climbing on a rearing horse (AbstractHorse.doPlayerRide)', () => {
    it('the bot that mounts a rearing horse clears its rearing on its own copy at once (1.21.4)', async () => {
      const t = await fakeServerBot('1.21.4', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
      try {
        const horse = entityAt(t, 100, 'horse', new Vec3(1.5, 65, 0.5))
        const flags = horseFlags(t.registry)
        horse.metadata[flags] = 0x02 | 0x20
        t.ticks(2)
        await settle()
        assert.ok(horse.standAnim > 0, 'it rears')
        t.bot.mount(horse)
        assert.strictEqual(horse.metadata[flags], 0x02)
      } finally {
        await t.close()
      }
    })
  })

  // AC: 1.21.5 - 1.21.8 a move without a rotation heads the interpolation to the entity's own rotation, ending a turn;
  // from 1.21.9 it keeps the rotation the interpolation heads to (Entity.moveOrInterpolateTo, InterpolationHandler)
  describe('a move without a rotation (ClientPacketListener.handleMoveEntity)', () => {
    it('ends a turn on 1.21.6, not on 1.21.9', async () => {
      const turned = async (version) => {
        const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
        try {
          const pig = entityAt(t, 101, 'pig', new Vec3(3.5, 65, 1.5))
          // (from its spawn's 180, a quarter turn to 90)
          t.client.write('entity_look', { entityId: 101, yaw: 64, pitch: 0, onGround: true })
          await settle()
          t.ticks(1)
          await settle()
          t.client.write('rel_entity_move', { entityId: 101, dX: 0, dY: 0, dZ: 0, onGround: true })
          await settle()
          t.ticks(2)
          await settle()
          return Number(pig.yawDegrees)
        } finally {
          await t.close()
        }
      }
      assert.ok(Math.abs(await turned('1.21.6') - 150) < 1e-3, 'stays at 150 on 1.21.6')
      assert.ok(Math.abs(await turned('1.21.9') - 150) > 10, 'goes on turning on 1.21.9')
    })
  })

  // AD: a mob turns its body after its head as BodyRotationControl does on the client (Mob.tickHeadTurn): standing, its
  // body follows a head held steady for 20 ticks, and stays when the head turns more than 15 degrees from where it
  // was last steady; before 1.20.5 a llama seats its rider along that body rotation (Llama.positionRider)
  describe('a mob\'s body rotation (BodyRotationControl.clientTick)', () => {
    it('the body follows a steady head, then stays as the head turns away; the llama\'s rider sits along it (1.20.2)', async () => {
      const t = await riding('1.20.2', 'llama')
      try {
        // (its head steady at the spawn's 180)
        t.ticks(25)
        await settle()
        // the head turns to 172.97 (byte 123) over 3 ticks: within 15 of where it was steady, the body goes with it
        t.client.write('entity_head_rotation', { entityId: 100, headYaw: 123 })
        await settle()
        t.ticks(3)
        await settle()
        assert.ok(Math.abs(t.vehicle.bodyYawDegrees - 172.96875) < 1e-4, `body ${t.vehicle.bodyYawDegrees}`)
        // then to 150.47 (byte 107): past 15 degrees the body stops where it was
        t.client.write('entity_head_rotation', { entityId: 100, headYaw: 107 })
        await settle()
        t.ticks(3)
        await settle()
        assert.ok(Math.abs(t.vehicle.headYawDegrees - 150.46875) < 1e-4, `head ${t.vehicle.headYawDegrees}`)
        assert.ok(Math.abs(t.vehicle.bodyYawDegrees - 165.46875) < 1e-4, `body ${t.vehicle.bodyYawDegrees}`)
        const seat = offset(t.bot, t.vehicle)
        const radians = 165.46875 * Math.PI / 180
        assert.ok(Math.abs(seat.x - 0.3 * Math.sin(radians)) < 1e-4 && Math.abs(seat.z + 0.3 * Math.cos(radians)) < 1e-4, `seat ${seat}`)
      } finally {
        await t.close()
      }
    })
  })

  // AE: 26.3 steps a mob's interpolation before its tick (Entity.commonTick), its rider steering it too, and the vehicle
  // move tells where the interpolation heads while it runs (Entity.getClientPositionAndRotation): the server's position
  // and the mob's own rotation, not yet where the rider took it
  describe('the 26.3 vehicle move of a mount still in its interpolation (Entity.getClientPositionAndRotation)', () => {
    it('the first steered tick of a pig the server just moved reports the move\'s end and the pig\'s own rotation (26.3)', async () => {
      const t = await riding('26.3', 'pig', {
        before: async (v, t) => {
          t.client.write('rel_entity_move', { entityId: 100, delta: { onGround: true, steps: [{ ticks: 3, dX: 0, dY: 0, dZ: 0 }] } })
          await settle()
        },
        setup: (v, t) => { saddle(v, t.registry); holdInHand(t, 'carrot_on_a_stick') }
      })
      try {
        t.ticks(3)
        await settle()
        const moves = packets(t, 'vehicle_move')
        // (the pig spawned facing north, 180; its rider faces south, 0)
        assert.deepStrictEqual([moves[0].x, moves[0].z, moves[0].yaw], [3.5, 1.5, 180])
        assert.ok(moves[2].z > 1.5 && moves[2].yaw === 0, `then steered: ${JSON.stringify(moves[2])}`)
      } finally {
        await t.close()
      }
    })
  })

  // AF: the rider's aiStep sets its input whether it steers its mount or not (LocalPlayer.aiStep: xxa, zza), and the
  // mount moves on it at its next tick (AbstractHorse.getRiddenInput): the first tick of a horse saddled again goes on
  // the key held the tick before (m_c_open_donkey_riding t66 on 1.21.4)
  describe('the rider\'s input before the mount is steered (LocalPlayer.aiStep, AbstractHorse.getRiddenInput)', () => {
    it('a horse saddled again moves at its first steered tick on the key its rider held while it was not', async () => {
      for (const version of ['1.19.4', '1.20.1', '1.21.4', '1.21.6']) {
        const t = await riding(version, 'horse', { setup: (v, { registry }) => { v.metadata[horseFlags(registry)] = 0x02 } })
        try {
          // (unsaddled: the rider's own input, no vehicle move)
          t.bot.setControlState('forward', true)
          t.ticks(1)
          await settle()
          assert.strictEqual(packets(t, 'vehicle_move').length, 0, `${version}: unsaddled`)
          t.vehicle.metadata[horseFlags(t.registry)] = 0x06
          if (t.registry.version['>=']('1.21.5')) saddle(t.vehicle, t.registry)
          t.ticks(1)
          await settle()
          const [move] = packets(t, 'vehicle_move')
          // (south, its rider's yaw 0)
          assert.ok(move && move.z > 1.5 + 0.05, `${version}: ${JSON.stringify(move)}`)
        } finally {
          await t.close()
        }
      }
    })
  })

  // AG: the ground contact of the server's moves, teleports and position syncs (Entity.setOnGround), for an entity the
  // client does not move itself (ClientPacketListener.handleMoveEntity, handleTeleportEntity, handleEntityPositionSync);
  // from 1.21.2 a teleport's for the mount it steers too; 1.8 for every entity. A mount the rider then steers starts its
  // travel in the air: its flying speed (m_c_open_donkey_riding t66 on 1.21.4)
  describe('the ground contact of the server\'s moves (Entity.setOnGround)', () => {
    const teleport = (registry, onGround) => {
      const v = registry.version
      if (v['<']('1.9')) return { entityId: 100, x: 3.5 * 32, y: 65 * 32, z: 1.5 * 32, yaw: 0, pitch: 0, onGround }
      if (v['<']('1.21.2')) return { entityId: 100, x: 3.5, y: 65, z: 1.5, yaw: 0, pitch: 0, onGround }
      const flags = { x: false, y: false, z: false, yaw: false, pitch: false, dx: false, dy: false, dz: false, yawDelta: false }
      return { entityId: 100, x: 3.5, y: 65, z: 1.5, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, flags, onGround }
    }
    const sync = (registry, onGround) => registry.version['>=']('26.3')
      ? { entityId: 100, pathType: 'linear', path: { x: 3.5, y: 65, z: 1.5 }, yaw: 0, pitch: 0, onGround }
      : { entityId: 100, x: 3.5, y: 65, z: 1.5, dx: 0, dy: 0, dz: 0, yaw: 0, pitch: 0, onGround }
    const move = (registry, onGround) => registry.version['>=']('26.3')
      ? { entityId: 100, delta: { onGround, dX: 0, dY: 0, dZ: 0 } }
      : { entityId: 100, dX: 0, dY: 0, dZ: 0, onGround }

    it('an entity the client does not move takes the ground contact the server tells', async () => {
      for (const version of ['1.8.8', '1.12.2', '1.20.1', '1.21.4', '26.3']) {
        const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
        try {
          const pig = entityAt(t, 100, 'pig', new Vec3(3.5, 65, 1.5))
          t.client.write('rel_entity_move', move(t.registry, false))
          await settle()
          assert.strictEqual(pig.onGround, false, `${version}: the move's`)
          t.client.write('entity_teleport', teleport(t.registry, true))
          await settle()
          assert.strictEqual(pig.onGround, true, `${version}: the teleport's`)
          if (t.registry.version['>=']('1.21.2')) {
            t.client.write('sync_entity_position', sync(t.registry, false))
            await settle()
            assert.strictEqual(pig.onGround, false, `${version}: the position sync's`)
          }
        } finally {
          await t.close()
        }
      }
    })

    it('a horse saddled again after the server synced it in the air goes its first steered tick at its flying speed (1.21.4)', async () => {
      const t = await riding('1.21.4', 'horse', { setup: (v, { registry }) => { v.metadata[horseFlags(registry)] = 0x02 } })
      try {
        t.bot.setControlState('forward', true)
        t.ticks(1)
        await settle()
        t.client.write('sync_entity_position', sync(t.registry, false))
        await settle()
        t.vehicle.metadata[horseFlags(t.registry)] = 0x06
        t.ticks(1)
        await settle()
        // (0.98 of its flying speed, its speed * 0.1F: not the ground's)
        const moved = t.vehicle.position.z - 1.5
        assert.ok(moved > 0 && moved < 0.05, String(moved))
      } finally {
        await t.close()
      }
    })

    it('a teleport of the horse its rider steers puts it in the air as it says from 1.21.2, not before', async () => {
      for (const [version, inAir] of [['1.21.1', false], ['1.21.4', true], ['1.21.6', true]]) {
        // (falling onto the floor: its first tick ends on the ground)
        const t = await riding(version, 'horse', { setup: (v, { registry }) => { saddle(v, registry); v.metadata[horseFlags(registry)] = 0x06; v.velocity.set(0, -0.0784, 0) } })
        try {
          t.bot.setControlState('forward', true)
          t.ticks(1)
          await settle()
          const before = t.vehicle.position.z
          t.client.write('entity_teleport', teleport(t.registry, false))
          await settle()
          t.ticks(1)
          await settle()
          const moved = t.vehicle.position.z - before
          assert.ok(moved > 0, `${version}: ${moved}`)
          assert.strictEqual(moved < 0.05, inAir, `${version}: ${moved}`)
        } finally {
          await t.close()
        }
      }
    })
  })
})
