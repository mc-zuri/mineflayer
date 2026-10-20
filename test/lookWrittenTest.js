/* eslint-env mocha */
// A look written to bot.entity.yaw / pitch alone (radians, not through bot.look) is the look the player turns to: the
// float degrees it holds turn to it the shortest way (LocalPlayer.sendPosition sends getYRot, never wrapped), and the
// engine moves the player by them (Entity.moveRelative). Grim flagged the move that went by the old degrees
// (Simulation) and the look sent wrapped to a half turn (AimModulo360: a snap of more than 320 degrees).

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const conv = require('../lib/conversions')
const { JavaFloat } = require('../lib/javamath')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }
const floor = []
for (let x = -4; x <= 6; x++) for (let z = -4; z <= 6; z++) floor.push([x, 64, z, 'stone'])

describe('a look written to bot.entity.yaw and pitch (Entity.getYRot as the player turns to it)', function () {
  this.timeout(10 * 1000)
  for (const version of ['1.12.2', '1.20.4', '1.21.11', '26.3']) {
    it(`turns the degrees the player holds the shortest way, sends them and moves by them, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: floor })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        assert.ok(t.bot.entity.onGround)
        // a look turned past a whole turn: 530 degrees (north, 170)
        t.bot.entity.yawDegrees = new JavaFloat(530)
        t.bot.entity.pitchDegrees = new JavaFloat(0)
        t.bot.entity.yaw = conv.fromNotchianYaw(530)
        t.bot.entity.pitch = 0
        t.ticks(1)
        await settle()
        t.written.length = 0
        const from = t.bot.entity.position.clone()
        // the radians alone written: east (270, 100 degrees on from 530) and down 30 degrees
        t.bot.entity.yaw = conv.fromNotchianYaw(270)
        t.bot.entity.pitch = conv.fromNotchianPitch(30)
        t.bot.setControlState('forward', true)
        t.ticks(1)
        t.bot.setControlState('forward', false)
        await settle()
        const look = t.written.filter(p => /^(position_look|look)$/.test(p.name)).map(p => p.data)[0]
        assert.ok(look, 'a look sent')
        assert.ok(Math.abs(look.yaw - 630) < 0.2, `yaw sent ${look.yaw}`)
        assert.ok(Math.abs(look.pitch - 30) < 0.2, `pitch sent ${look.pitch}`)
        assert.strictEqual(Number(t.bot.entity.yawDegrees), look.yaw)
        // east: +x, no z
        const moved = t.bot.entity.position.minus(from)
        assert.ok(moved.x > 0.05 && Math.abs(moved.z) < 1e-3, `moved ${moved}`)
      } finally {
        await t.close()
      }
    })
  }

  it('a look held in the degrees and their radians both is left as it is', async () => {
    const t = await fakeServerBot('1.21.11', { spawn, blocks: floor })
    try {
      for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
      t.bot.entity.yawDegrees = new JavaFloat(545.25)
      t.bot.entity.pitchDegrees = new JavaFloat(12.34)
      t.bot.entity.yaw = conv.fromNotchianYaw(t.bot.entity.yawDegrees)
      t.bot.entity.pitch = conv.fromNotchianPitch(t.bot.entity.pitchDegrees)
      t.ticks(1)
      assert.strictEqual(Number(t.bot.entity.yawDegrees), 545.25)
      assert.strictEqual(Number(t.bot.entity.pitchDegrees), Math.fround(12.34))
    } finally {
      await t.close()
    }
  })
})
