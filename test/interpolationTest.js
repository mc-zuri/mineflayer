/* eslint-env mocha */
// Where the client shows the other entities between the server's moves (InterpolationHandler, 26.3's
// SteppedInterpolationHandler), and where a horse's flags are in its entity data (AbstractHorse.DATA_ID_FLAGS).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { createEntityInterpolation } = require('../lib/entityInterpolation')
const { horseFlagsIndex } = require('../lib/horse')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')
const { EventEmitter } = require('events')
const mineflayer = require('../')

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

describe('a falling block (FallingBlockEntity)', function () {
  this.timeout(20 * 1000)

  // a bot of a version on a client without a connection: the packets the test emits are the server's
  async function offlineBot (version) {
    const client = new EventEmitter()
    Object.assign(client, { version, username: 'player', state: 'handshaking', write: () => {}, end: () => {} })
    require('minecraft-protocol/src/client/pluginChannels')(client, { version })
    const bot = mineflayer.createBot({ client, version, username: 'player', physicsManual: true, hideErrors: true })
    client.state = 'play'
    client.emit('state', 'play', 'handshaking')
    await sleep(0)
    return { bot, client }
  }

  // a falling block the server sends at (2.5, 102.01, 0.5), as it spawns one over a block at y 102
  async function spawnFallingBlock (version) {
    const { bot, client } = await offlineBot(version)
    // (before 1.14 its object type, 70)
    const type = bot.registry.version['>=']('1.14') ? bot.registry.entitiesByName.falling_block.id : 70
    client.emit('spawn_entity', { entityId: 97, objectUUID: '00112233-4455-6677-8899-aabbccddeeff', type, x: 2.5, y: 102.00999999046326, z: 0.5, pitch: 0, yaw: 0, objectData: 1, velocity: { x: 0, y: 0, z: 0 } })
    return { bot, entity: bot.entities[97] }
  }

  it('the client puts it a hundredth higher than sent from 1.9 to 1.15 and on 1.17, where sent on 1.16 and from 1.18', async () => {
    // (FallingBlockEntity's constructor: y + (double)((1.0F - 0.98F) / 2.0F))
    for (const [version, raised] of [['1.9.4', true], ['1.12.2', true], ['1.13.2', true], ['1.14.4', true], ['1.16.5', false], ['1.17.1', true], ['1.18.2', false], ['1.20.4', false]]) {
      const { entity } = await spawnFallingBlock(version)
      assert.strictEqual(entity.position.y, 102.00999999046326 + (raised ? 0.009999990463256836 : 0), version)
    }
  })

  it('it falls on the client by its names before 1.14 too: 1.9 - 1.10 FallingSand, 1.13 falling_objects', async () => {
    const { performance } = require('perf_hooks')
    const now = performance.now
    let clock = now.call(performance)
    performance.now = () => clock
    try {
      for (const version of ['1.10.2', '1.13.2', '1.20.4']) {
        const { bot, entity } = await spawnFallingBlock(version)
        // (in the air: no world loaded)
        bot.blockAt = () => null
        const spawnedAt = entity.position.y
        // one client tick: 0.04 down (FallingBlockEntity.tick)
        clock += 50
        bot.emit('physicsTick')
        assert.ok(Math.abs(entity.position.y - (spawnedAt - 0.04)) < 1e-9, `${version}: ${entity.name} at ${entity.position.y}`)
      }
    } finally {
      performance.now = now
    }
  })
})
