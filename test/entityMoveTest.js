/* eslint-env mocha */
// How the client takes the server's moves of the other entities (ClientPacketListener.handleMoveEntity,
// handleEntityPositionSync; Entity's packet coordinates; LivingEntity's turn with its interpolation).

const assert = require('assert')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

describe('the moves of other entities', function () {
  this.timeout(20 * 1000)

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
