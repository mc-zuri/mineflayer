/* eslint-env mocha */
// A passenger the client doesn't drive rides on its vehicle each client tick (Entity.rideTick: vehicle.positionRider):
// the server sends no moves of a passenger (ServerEntity.sendChanges), so a chicken jockey's zombie or a spider
// jockey's skeleton is wherever its mount is.

const assert = require('assert')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

for (const version of ['1.20.4', '1.21.11', '26.3']) {
  describe(`passengers ride on their vehicles (${version})`, function () {
    this.timeout(20 * 1000)

    it('a chicken jockey\'s zombie stays on its chicken as the chicken moves, and stays put once off it', async () => {
      const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 } })
      try {
        const { bot, registry } = t
        const spawnName = registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living'
        const spawn = async (entityId, name, x) => {
          const spawned = once(bot, 'entitySpawn')
          bot._client.emit(spawnName, { entityId, objectUUID: `00112233-4455-6677-8899-aabbccddee${entityId}`, entityUUID: `00112233-4455-6677-8899-aabbccddee${entityId}`, type: registry.entitiesByName[name].id, x, y: 65, z: 0.5, pitch: 0, yaw: 0, headPitch: 0, objectData: 0, velocity: { x: 0, y: 0, z: 0 }, velocityX: 0, velocityY: 0, velocityZ: 0, metadata: [] })
          const [entity] = await spawned
          return entity
        }
        const chicken = await spawn(40, 'chicken', 4.5)
        const zombie = await spawn(41, 'zombie', 9.5)
        bot._client.emit('set_passengers', { entityId: 40, passengers: [41] })
        assert.strictEqual(zombie.vehicle, chicken)
        t.ticks(1)
        assert.deepStrictEqual(zombie.position.toArray(), [4.5, 65 + chicken.height, 0.5])
        // the chicken moved (where the server has it): the zombie on it the next tick, shown there too
        chicken.position.set(6.5, 65, 2.5)
        chicken.interpolatedPosition?.set(6.5, 65, 2.5)
        t.ticks(1)
        assert.deepStrictEqual(zombie.position.toArray(), [6.5, 65 + chicken.height, 2.5])
        if (zombie.interpolatedPosition) assert.deepStrictEqual(zombie.interpolatedPosition.toArray(), [6.5, 65 + chicken.height, 2.5])
        // off it: where it got off
        bot._client.emit('set_passengers', { entityId: 40, passengers: [] })
        chicken.position.set(10.5, 65, 2.5)
        t.ticks(1)
        assert.deepStrictEqual(zombie.position.toArray(), [6.5, 65 + chicken.height, 2.5])
        await sleep(1)
      } finally {
        await t.close()
      }
    })
  })
}
