/* eslint-env mocha */
// A dig of a block in the bot's own cell (a wall torch by the head): the face the eyes are toward, not the top they are
// under (Grim's PositionBreakA flags a face the eye is behind, mineflayer-survival e2e-m7)

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const floor = []
for (let x = -3; x <= 3; x++) for (let z = -3; z <= 3; z++) floor.push([x, 64, z, 'stone'])

describe('a dig of the block in the bot\'s own cell', function () {
  this.timeout(10 * 1000)
  it('goes at the side the eyes are toward, not the top they are under', async () => {
    const t = await fakeServerBot('1.21.11', { spawn: { x: 0.3, y: 65, z: 0.5 }, blocks: floor.concat([[0, 66, 0, 'wall_torch']]) })
    try {
      for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
      const torch = t.bot.blockAt(new Vec3(0, 66, 0))
      assert.strictEqual(torch.name, 'wall_torch')
      t.written.length = 0
      t.bot.dig(torch, true).catch(() => {})
      for (let i = 0; i < 3; i++) t.ticks(1)
      await sleep(100)
      const start = t.written.find(p => p.name === 'block_dig' && p.data.status === 0)
      assert.ok(start, 'a dig started')
      assert.notStrictEqual(start.data.face, 1, 'not the top')
      assert.strictEqual(start.data.face, 4)
    } finally {
      await t.close()
    }
  })
})
