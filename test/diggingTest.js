/* eslint-env mocha */
// A dig held on a block as vanilla's client runs it, against a fake server (MultiPlayerGameMode.startDestroyBlock /
// continueDestroyBlock / stopDestroyBlock).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }

describe('digging (MultiPlayerGameMode.startDestroyBlock / continueDestroyBlock)', function () {
  this.timeout(10 * 1000)
  const blocks = [[0, 64, 0, 'stone'], [1, 64, 0, 'dirt'], [2, 64, 0, 'dirt'], [0, 64, 1, 'stone']]
  const digs = t => t.written.filter(p => p.name === 'block_dig').map(p => p.data)
  const swings = t => t.names(/^(arm_animation|punch)$/).length
  // a bot standing on the stone (its dig speed is a fifth off the ground)
  async function standing (version) {
    const t = await fakeServerBot(version, { spawn, blocks })
    for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
    assert.ok(t.bot.entity.onGround)
    await settle()
    t.written.length = 0
    return t
  }

  for (const version of ['1.12.2', '1.20.4', '26.3']) {
    it(`a dig starts with a swing, swings each tick and stops the tick its progress reaches 1, ${version}`, async () => {
      const t = await standing(version)
      try {
        const shift = t.registry.version['>=']('26.3') ? 1 : 0
        const block = t.bot.blockAt(new Vec3(1, 64, 0))
        // a tick's share of the break (MultiPlayerGameMode.continueDestroyBlock: getDestroyProgress)
        const ticks = Math.ceil(t.bot.digTime(block) / 50 - 1e-9)
        const done = t.bot.dig(block, 'ignore', 'auto', 1)
        await settle()
        assert.deepStrictEqual(digs(t).map(d => d.status), [0])
        assert.strictEqual(swings(t), 1)
        t.ticks(ticks - 1)
        await settle()
        assert.deepStrictEqual(digs(t).map(d => d.status), [0])
        assert.strictEqual(swings(t), ticks)
        t.ticks(1)
        await done
        await settle()
        assert.deepStrictEqual(digs(t).map(d => d.status), [0, 2 + shift])
        assert.strictEqual(swings(t), ticks + 1)
        assert.strictEqual(t.bot.blockAt(block.position).type, 0)
      } finally {
        await t.close()
      }
    })
  }

  it('the actions of a dig carry the block interaction sequence from 1.19', async () => {
    const t = await standing('1.20.4')
    try {
      const block = t.bot.blockAt(new Vec3(1, 64, 0))
      const done = t.bot.dig(block, 'ignore', 'auto', 1)
      t.ticks(Math.ceil(t.bot.digTime(block) / 50 - 1e-9))
      await done
      await settle()
      const [start, stop] = digs(t)
      assert.ok(start.sequence > 0)
      assert.strictEqual(stop.sequence, start.sequence + 1)
    } finally {
      await t.close()
    }
  })

  it('a dig stopped sends ABORT with the face down (MultiPlayerGameMode.stopDestroyBlock)', async () => {
    const t = await standing('1.20.4')
    try {
      const done = t.bot.dig(t.bot.blockAt(new Vec3(1, 64, 0)), 'ignore', 'auto', 1).catch(err => err)
      t.ticks(2)
      t.bot.stopDigging()
      assert.strictEqual((await done).message, 'Digging aborted')
      await settle()
      assert.deepStrictEqual(digs(t).map(d => [d.status, d.face]), [[0, 1], [1, 0]])
    } finally {
      await t.close()
    }
  })

  it('the key held on from a broken block starts the next after the destroy delay of 5 ticks', async () => {
    const t = await standing('1.20.4')
    try {
      const first = t.bot.blockAt(new Vec3(1, 64, 0))
      const done = t.bot.dig(first, 'ignore', 'auto', 1)
      t.ticks(Math.ceil(t.bot.digTime(first) / 50 - 1e-9))
      await done
      await settle()
      t.written.length = 0
      const next = t.bot.dig(t.bot.blockAt(new Vec3(2, 64, 0)), 'ignore', 'auto', 1, { held: true }).catch(err => err)
      t.ticks(5)
      await settle()
      // (each tick of the delay still swings: continueDestroyBlock returns true)
      assert.deepStrictEqual(digs(t), [])
      assert.strictEqual(swings(t), 5)
      t.ticks(1)
      await settle()
      assert.deepStrictEqual(digs(t).map(d => d.status), [0])
      t.bot.stopDigging()
      await next
    } finally {
      await t.close()
    }
  })

  it('from 1.19 a break is a prediction until the server acknowledges it (BlockStatePredictionHandler)', async () => {
    const t = await standing('1.20.4')
    try {
      const { bot, client, registry } = t
      const dirt = registry.blocksByName.dirt.defaultState
      const stone = registry.blocksByName.stone.defaultState
      const breakBlock = async (position) => {
        const block = bot.blockAt(position)
        t.written.length = 0
        const done = bot.dig(block, 'ignore', 'auto', 1)
        // (after a break, the destroy delay first)
        for (let i = 0; i < 40 && bot.blockAt(position).type !== 0; i++) t.ticks(1)
        await done
        await settle()
        assert.strictEqual(bot.blockAt(position).type, 0)
        return digs(t).find(d => d.status === 2).sequence
      }
      const first = new Vec3(1, 64, 0)
      // acknowledged with no change from the server (it did not break it): the block is put back
      client.write('acknowledge_player_digging', { sequenceId: await breakBlock(first) })
      await settle()
      assert.strictEqual(bot.blockAt(first).stateId, dirt)
      // the server's change of the predicted block waits for the acknowledgement (ClientLevel.setServerVerifiedBlockState)
      const sequence = await breakBlock(first)
      client.write('block_change', { location: first, type: stone })
      await settle()
      assert.strictEqual(bot.blockAt(first).type, 0)
      client.write('acknowledge_player_digging', { sequenceId: sequence })
      await settle()
      assert.strictEqual(bot.blockAt(first).stateId, stone)
      // a break the server made too stays
      const second = new Vec3(2, 64, 0)
      const confirmed = await breakBlock(second)
      client.write('block_change', { location: second, type: 0 })
      client.write('acknowledge_player_digging', { sequenceId: confirmed })
      await settle()
      assert.strictEqual(bot.blockAt(second).type, 0)
    } finally {
      await t.close()
    }
  })

  it('26.3: a dig turned to another face of its block sends CHANGE_DESTROY_DIRECTION', async () => {
    const t = await standing('26.3')
    try {
      const block = t.bot.blockAt(new Vec3(1, 64, 0))
      const done = t.bot.dig(block, 'ignore', 'auto', 1).catch(err => err)
      t.ticks(1)
      t.bot.dig(block, 'ignore', 'auto', 4).catch(err => err)
      t.ticks(1)
      await settle()
      assert.deepStrictEqual(digs(t).map(d => [d.status, d.face]), [[0, 1], [1, 4]])
      t.bot.stopDigging()
      await done
    } finally {
      await t.close()
    }
  })
})
