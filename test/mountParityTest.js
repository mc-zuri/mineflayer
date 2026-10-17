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

describe('mount parity (vanilla\'s client, version by version)', function () {
  this.timeout(30 * 1000)

  // A: 1.21.5 counts the saddle in a llama's saddle slot (Mob.isSaddled): its rider steers it as a horse

  // B: a mount still easing to the server's move goes on with it under its rider, and the vehicle move reports where it
  // heads (Entity.lerpTargetX, from 1.21.5 lerpTargetYRot / XRot too: InterpolationHandler)

  // C: before 1.21.2 the shift of a passenger's input is the shift key as it is that tick (LocalPlayer.tick's
  // ServerboundPlayerInputPacket): let go, the next input no longer asks to dismount

  // the rider's offset from its vehicle's position
  const offset = (bot, vehicle) => bot.entity.position.minus(vehicle.position)

  // D: a living vehicle turns over its interpolation steps (LivingEntity.aiStep's lerp, InterpolationHandler), and
  // where it seats its rider turns with it

  // E: a camel seats its rider by its pose, sat down or standing up over its animation, against the level's time as the
  // client keeps it (Camel.getBodyAnchorAnimationYOffset, ClientLevel.tickTime)

  // F: before 1.19 a pig is its rider's to move only with the carrot on a stick in hand, from 1.11 (Pig.canBeSteered)

  // H: 1.11 - 1.19.2 a pig's spawn data carries a boost time of 0, an empty boost its first steered tick spends at
  // 1 + 1.15F * Mth.sin(1 / 0 * PI) (ItemBasedSteering)

  // I: 1.16's rider whose shift key was down after its tick stops riding on its own client (Player.rideTick's
  // wantsToStopRiding), before the server says so

  // J: before 1.19 a horse is its first passenger's to move, saddled or not (AbstractHorse.canBeSteered): unsaddled it
  // goes on its own input, none, and its rider's client tells the server where it is

  // K: before 1.20.5 a llama seats its rider 0.3 behind its middle along its body's rotation, at 0.67 of its height
  // (0.6 from 1.18) with the player's -0.35 (Llama.positionRider)

  // L: before 1.13 the player that climbs on a horse turns to the horse's rotation on its own client too
  // (AbstractHorse.mountTo)

  // M: a strider seats its rider at its y plus its riding offset, then plus the player's own (Entity.positionRider adds
  // them in turn)

  // N: 1.20.2 - 1.20.4 a skeleton or zombie horse seats its rider 0.28125F below its height
  // (SkeletonHorse / ZombieHorse.getPassengerAttachmentPoint)

  // O: a steered mob that does not turn with its rider keeps its own pitch, a float never -0 (Entity.getXRot, 0.0F):
  // the vehicle move reports it so

  // P: a passenger does not touch the ground (Entity.rideTick moves it by no move of its own): its first tick on foot
  // after it leaves the vehicle keeps the air's inertia, as after a tick in the air

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

  // S: a mob the player pushed was pushed back (Entity.push): the push goes into its next tick, steered too

  // T: before 1.20.2 a camel seats its rider at its riding offset (its height less 0.6F) with the player's -0.35, 0.5
  // along its body's rotation (Camel.positionRider)

  // U: before 1.21.2 a mount its rider takes control of stops interpolating where the client showed it
  // (Entity.isControlledByLocalInstance): its steering starts there, not at the server's last move

  // V: from 1.15 a mob its rider moves keeps its packet position where the client put it (LivingEntity.aiStep's
  // setPacketCoordinates): the server's next relative move adds to it

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

  // Y: 1.8's boat is the server's to move and seats its rider 0.4 along its yaw, at -0.3 with the player's -0.35
  // (EntityBoat.updateRiderPosition); there is no paddle packet before 1.9
})
