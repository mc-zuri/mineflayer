/* eslint-env mocha */
// How the client takes the server's moves of the other entities (ClientPacketListener.handleMoveEntity,
// handleEntityPositionSync; Entity's packet coordinates; LivingEntity's turn with its interpolation).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { createEntityInterpolation } = require('../lib/entityInterpolation')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

describe('the moves of other entities', function () {
  this.timeout(20 * 1000)

  describe('[R] the packet position as a double from 1.16 (Entity.packetCoordinates, VecDeltaCodec)', () => {
    it('[R] from 1.16 a zero relative move keeps an axis; the others are floored to 1/4096 before 1.19.4, rounded since', () => {
      const moved = (version) => {
        const interpolation = createEntityInterpolation(require('prismarine-registry')(version))
        const pig = { id: 7, name: 'pig', type: 'passive', position: new Vec3(0.3, 64.3, 0.3), yaw: 0, pitch: 0 }
        interpolation.spawn(pig)
        return interpolation.move(pig, 4096, 0, 0, null)
      }
      for (const version of ['1.16.5', '1.19.2', '1.19.4']) {
        const to = moved(version)
        assert.strictEqual(to.y, 64.3, version)
        assert.strictEqual(to.z, 0.3, version)
        const encode = version === '1.19.4' ? Math.round : Math.floor
        assert.strictEqual(to.x, (encode(0.3 * 4096) + 4096) / 4096, version)
      }
    })
  })

  describe('[V] a vehicle the client controls takes its position as its packet position from 1.15 (LivingEntity.aiStep)', () => {
    it('[V] from 1.15 a controlled vehicle\'s next relative move goes from where the client moved it', () => {
      const interpolation = createEntityInterpolation(require('prismarine-registry')('1.15.2'))
      const horse = { id: 7, name: 'horse', type: 'animal', position: new Vec3(0, 64, 0), yaw: 0, pitch: 0 }
      interpolation.spawn(horse)
      interpolation.move(horse, 4096, 0, 0, null)
      // the client moved it to x 5 itself
      horse.position.set(5, 64, 0)
      interpolation.control(horse)
      assert.strictEqual(horse.interpolation.steps, 0)
      assert.strictEqual(interpolation.move(horse, 4096, 0, 0, null).x, 6)
    })
  })

  describe('[Q] a position sync leaves the entity\'s motion alone (ClientPacketListener.handleEntityPositionSync)', () => {
    it('[Q] the motion a position sync carries is not the entity\'s', async () => {
      const t = await fakeServerBot('1.21.4', { spawn: { x: 0.5, y: 65, z: 0.5 } })
      try {
        const { bot, client, registry } = t
        const spawned = once(bot, 'entitySpawn')
        client.write('spawn_entity', { entityId: 97, objectUUID: '00112233-4455-6677-8899-aabbccddeeff', type: registry.entitiesByName.zombie.id, x: 2.5, y: 65, z: 0.5, pitch: 0, yaw: 0, headPitch: 0, objectData: 0, velocity: { x: 0, y: 0, z: 0 } })
        const [zombie] = await spawned
        zombie.velocity.set(0.1, 0, 0)
        const synced = once(bot._client, 'sync_entity_position')
        client.write('sync_entity_position', { entityId: 97, x: 3, y: 65, z: 0.5, dx: 0.5, dy: 0.5, dz: 0.5, yaw: 0, pitch: 0, onGround: true })
        await synced
        await sleep(10)
        assert.deepStrictEqual(zombie.velocity.toArray(), [0.1, 0, 0])
      } finally {
        await t.close()
      }
    })
  })
})
