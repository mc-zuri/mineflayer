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
})
