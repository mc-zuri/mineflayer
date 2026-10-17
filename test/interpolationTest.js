/* eslint-env mocha */
// Where the client shows the other entities between the server's moves (InterpolationHandler, 26.3's
// SteppedInterpolationHandler), and where a horse's flags are in its entity data (AbstractHorse.DATA_ID_FLAGS).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { createEntityInterpolation } = require('../lib/entityInterpolation')
const { horseFlagsIndex } = require('../lib/horse')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

describe('entity interpolation and horse flags', function () {
  this.timeout(20 * 1000)

  // a zombie at the origin the server moves 1 block along x in one step of 2 ticks (VecDelta.Stepped)
  function steppedZombie (version) {
    const registry = require('prismarine-registry')(version)
    const interpolation = createEntityInterpolation(registry)
    const zombie = { id: 7, name: 'zombie', type: 'hostile', position: new Vec3(0, 0, 0) }
    interpolation.spawn(zombie)
    interpolation.queueTicks?.(7, [2])
    interpolation.move(zombie, 4096, 0, 0, null)
    const shown = []
    for (let i = 0; i < 3; i++) {
      interpolation.tick(zombie)
      shown.push(zombie.interpolatedPosition.x)
    }
    return shown
  }

  it('from 26.3 a living entity goes along the step the server sent over its ticks (SteppedInterpolationHandler)', () => {
    // a step of 2 ticks: halfway, then there
    assert.deepStrictEqual(steppedZombie('26.3'), [0.5, 1, 1])
    // before, 3 steps of a third each (InterpolationHandler)
    const before = steppedZombie('26.1')
    assert.ok(Math.abs(before[0] - 1 / 3) < 1e-9 && before[2] === 1, String(before))
  })

  it('a 26.3 move packet\'s step ticks reach the interpolation before the move is handled (VecDelta.Stepped)', async () => {
    const t = await fakeServerBot('26.3', { spawn: { x: 0.5, y: 65, z: 0.5 } })
    try {
      const { bot, client, registry } = t
      const spawned = once(bot, 'entitySpawn')
      client.write('spawn_entity', { entityId: 97, objectUUID: '00112233-4455-6677-8899-aabbccddeeff', type: registry.entitiesByName.zombie.id, x: 2.5, y: 65, z: 0.5, pitch: 0, yaw: 0, headPitch: 0, objectData: 0, velocity: { x: 0, y: 0, z: 0 } })
      const [zombie] = await spawned
      const moved = once(bot._client, 'rel_entity_move')
      client.write('rel_entity_move', { entityId: 97, delta: { onGround: true, steps: [{ ticks: 2, dX: 4096, dY: 0, dZ: 0 }] } })
      await moved
      await sleep(10)
      t.ticks(1)
      assert.strictEqual(zombie.interpolatedPosition.x, 3)
      t.ticks(1)
      assert.strictEqual(zombie.interpolatedPosition.x, 3.5)
    } finally {
      await t.close()
    }
  })

  it('a horse\'s flags are at 18 from 26.1, whose ageable mobs gained AGE_LOCKED', () => {
    for (const [version, index] of [['1.8.8', 16], ['1.12.2', 13], ['1.20.4', 17], ['1.21.11', 17], ['26.1', 18], ['26.3', 18]]) {
      assert.strictEqual(horseFlagsIndex(require('prismarine-registry')(version)), index, version)
    }
  })
})
