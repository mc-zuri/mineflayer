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

  it('a dig the server\'s break ended is still aborted once the key lets go (MultiPlayerGameMode.stopDestroyBlock: isDestroying)', async () => {
    for (const version of ['1.13.2', '1.20.4']) {
      const t = await standing(version)
      try {
        const done = t.bot.dig(t.bot.blockAt(new Vec3(1, 64, 0)), 'ignore', 'auto', 1)
        t.ticks(2)
        // the server breaks the block first
        t.client.write('block_change', { location: { x: 1, y: 64, z: 0 }, type: 0 })
        await done
        assert.strictEqual(t.bot.isDestroying, true, version)
        t.bot.stopDigging()
        await settle()
        assert.deepStrictEqual(digs(t).map(d => [d.status, d.face]), [[0, 1], [1, 0]], version)
        assert.strictEqual(t.bot.isDestroying, false, version)
      } finally {
        await t.close()
      }
    }
  })

  // no face asked for: the face the crosshair hits once the bot looks at the block (BlockHitResult.getDirection), not
  // the top whatever the eye sees (Grim's PositionBreakA undid the breaks of blocks at and above the eye: face UP)
  for (const version of ['1.12.2', '1.20.4', '26.3']) {
    it(`a dig with no face given goes at the face the crosshair hits, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone'], [2, 66, 0, 'dirt'], [0, 68, 0, 'dirt'], [0, 64, 2, 'dirt']] })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        await settle()
        const faces = []
        for (const [x, y, z] of [[2, 66, 0], [0, 68, 0], [0, 64, 2]]) {
          t.written.length = 0
          const done = t.bot.dig(t.bot.blockAt(new Vec3(x, y, z)), true).catch(err => err)
          await settle()
          faces.push(digs(t).find(d => d.status === 0)?.face)
          t.bot.stopDigging()
          await done
        }
        // west of the block at the eye's height, under the one over the head, the top of the one on the floor
        assert.deepStrictEqual(faces, [4, 0, 1])
      } finally {
        await t.close()
      }
    })
  }

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

  it('before 1.14 a broken block the server puts back is started anew after the delay; from 1.14 dug on (PlayerControllerMP.onPlayerDestroyBlock)', async () => {
    for (const [version, restarts] of [['1.8.8', true], ['1.13.2', true], ['1.14.4', false]]) {
      const t = await standing(version)
      try {
        const block = t.bot.blockAt(new Vec3(1, 64, 0))
        const done = t.bot.dig(block, 'ignore', 'auto', 1)
        t.ticks(Math.ceil(t.bot.digTime(block) / 50 - 1e-9))
        await done
        // the server puts it back (its break refused)
        const Block = require('prismarine-block')(t.registry)
        const dirt = t.registry.version['>=']('1.13') ? Block.fromProperties('dirt', {}, 0).stateId : t.registry.blocksByName.dirt.id << 4
        t.client.write('block_change', { location: { x: 1, y: 64, z: 0 }, type: dirt })
        await settle()
        assert.strictEqual(t.bot.blockAt(block.position).name, 'dirt', version)
        t.written.length = 0
        const again = t.bot.dig(t.bot.blockAt(block.position), 'ignore', 'auto', 1, { held: true }).catch(err => err)
        t.ticks(6)
        await settle()
        assert.deepStrictEqual(digs(t).map(d => d.status), restarts ? [0] : [], version)
        t.bot.stopDigging()
        await again
      } finally {
        await t.close()
      }
    }
  })

  it('1.14 - 1.18: a break the server acknowledges with another state puts it back, and the player where it was as it broke it (MultiPlayerGameMode.handleBlockBreakAck)', async () => {
    for (const [version, movedBack] of [['1.15.2', true], ['1.16.5', false], ['1.18.2', false]]) {
      const t = await standing(version)
      try {
        const block = t.bot.blockAt(new Vec3(1, 64, 0))
        const done = t.bot.dig(block, 'ignore', 'auto', 1)
        t.ticks(Math.ceil(t.bot.digTime(block) / 50 - 1e-9))
        await done
        const at = t.bot.entity.position.clone()
        assert.strictEqual(t.bot.blockAt(block.position).type, 0, version)
        // the player has moved on since
        t.bot.entity.position.set(at.x + 0.25, at.y, at.z)
        const Block = require('prismarine-block')(t.registry)
        t.client.write('acknowledge_player_digging', { location: { x: 1, y: 64, z: 0 }, block: Block.fromProperties('dirt', {}, 0).stateId, status: 2, successful: true })
        await settle()
        assert.strictEqual(t.bot.blockAt(block.position).name, 'dirt', version)
        // (from 1.16 only a player the block now collides with)
        assert.deepStrictEqual(t.bot.entity.position.toArray(), movedBack ? at.toArray() : [at.x + 0.25, at.y, at.z], version)
        // a start acknowledged as it was asked: nothing
        t.client.write('acknowledge_player_digging', { location: { x: 2, y: 64, z: 0 }, block: Block.fromProperties('dirt', {}, 0).stateId, status: 0, successful: true })
        await settle()
        assert.strictEqual(t.bot.blockAt(new Vec3(2, 64, 0)).name, 'dirt', version)
      } finally {
        await t.close()
      }
    }
  })

  for (const version of ['1.20.4', '1.21.11', '26.3']) {
    it(`a dig the server refused (spawn protection: its START answered with the block, its STOP with the acknowledgement alone) leaves the block, ${version}`, async () => {
      const t = await standing(version)
      try {
        const { bot, client, registry } = t
        const position = new Vec3(1, 64, 0)
        const dirt = registry.blocksByName.dirt.defaultState
        // the server: the START refused with the block as it is (ServerPlayerGameMode.handleBlockBreakAction), every
        // action acknowledged (ServerGamePacketListenerImpl.ackBlockChangesUpTo)
        client.on('block_dig', (packet) => {
          if (packet.status === 0) client.write('block_change', { location: position, type: dirt })
          client.write('acknowledge_player_digging', { sequenceId: packet.sequence })
        })
        const done = bot.dig(bot.blockAt(position), 'ignore', 'auto', 1)
        for (let i = 0; i < 40 && bot.blockAt(position).type !== 0; i++) t.ticks(1)
        await done
        await settle()
        assert.strictEqual(bot.blockAt(position).stateId, dirt)
      } finally {
        await t.close()
      }
    })
  }

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

  for (const version of ['1.20.4', '1.21.11', '26.3']) {
    it(`a break is told predicted (bot._isBlockPredicted) till the server acknowledges it, then the server's block, ${version}`, async () => {
      const t = await standing(version)
      try {
        const { bot, client, registry } = t
        const position = new Vec3(1, 64, 0)
        const dirt = registry.blocksByName.dirt.defaultState
        assert.strictEqual(bot._isBlockPredicted(position), false)
        const done = bot.dig(bot.blockAt(position), 'ignore', 'auto', 1)
        for (let i = 0; i < 40 && bot.blockAt(position).type !== 0; i++) t.ticks(1)
        await done
        await settle()
        // air in the client's world, the server's answer to come: a refused break (spawn protection) put back by it
        assert.strictEqual(bot.blockAt(position).type, 0)
        assert.strictEqual(bot._isBlockPredicted(position), true)
        assert.strictEqual(bot._isBlockPredicted(new Vec3(2, 64, 0)), false)
        // (the STOP's: the last sequence sent)
        client.write('acknowledge_player_digging', { sequenceId: Math.max(...digs(t).map(d => d.sequence)) })
        await settle()
        assert.strictEqual(bot._isBlockPredicted(position), false)
        assert.strictEqual(bot.blockAt(position).stateId, dirt)
      } finally {
        await t.close()
      }
    })
  }

  it('before 1.19 no break is a prediction (bot._isBlockPredicted): the server sends no sequence to acknowledge', async () => {
    const t = await standing('1.12.2')
    try {
      const { bot } = t
      const position = new Vec3(1, 64, 0)
      const done = bot.dig(bot.blockAt(position), 'ignore', 'auto', 1)
      for (let i = 0; i < 40 && bot.blockAt(position).type !== 0; i++) t.ticks(1)
      await done
      assert.strictEqual(bot.blockAt(position).type, 0)
      assert.strictEqual(bot._isBlockPredicted(position), false)
    } finally {
      await t.close()
    }
  })

  for (const version of ['1.12.2', '1.20.4', '26.3']) {
    it(`a dig of a block already broken (its Block kept from before, its place air) fails at once and sends nothing, and stops one held on another (Minecraft.startAttack / continueAttack on a MISS), ${version}`, async () => {
      const t = await standing(version)
      try {
        const stale = t.bot.blockAt(new Vec3(1, 64, 0))
        t.client.write('block_change', { location: { x: 1, y: 64, z: 0 }, type: 0 })
        await settle()
        assert.strictEqual(t.bot.blockAt(stale.position).type, 0)
        const err = await t.bot.dig(stale, 'ignore', 'auto', 1).then(() => null, err => err)
        assert.match(err?.message ?? '', /nothing to dig: the block at .* is air/)
        assert.strictEqual(t.bot.targetDigBlock, null)
        t.ticks(5)
        await settle()
        assert.deepStrictEqual(digs(t), [])
        // one held on another block: stopped
        const held = t.bot.dig(t.bot.blockAt(new Vec3(2, 64, 0)), 'ignore', 'auto', 1).catch(err => err)
        t.ticks(2)
        const again = await t.bot.dig(stale, 'ignore', 'auto', 1).then(() => null, err => err)
        assert.match(again?.message ?? '', /is air/)
        assert.strictEqual((await held).message, 'Digging aborted')
        assert.strictEqual(t.bot.targetDigBlock, null)
        await settle()
        // (ABORT is 2 from 26.3, CHANGE_DESTROY_DIRECTION put at 1)
        assert.deepStrictEqual(digs(t).map(d => d.status), [0, t.registry.version['>=']('26.3') ? 2 : 1])
      } finally {
        await t.close()
      }
    })
  }

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
