/* eslint-env mocha */
// The server's wake-up of the sleeping player, as vanilla's client takes it (ClientPacketListener.handleAnimate).

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

describe('waking up (LivingEntity.stopSleeping)', function () {
  this.timeout(10 * 1000)
  it('1.14 - 1.15 stand the player up on the client at once, where BedBlock.findStandUpPosition finds room', async () => {
    for (const [version, key, standsUp] of [['1.14.4', 12, true], ['1.15.2', 13, true], ['1.16.5', 14, false]]) {
      const floor = []
      for (let x = -1; x <= 5; x++) for (let z = -1; z <= 3; z++) floor.push([x, 64, z, 'stone'])
      // a bed facing east: its foot at 2, 65, 1, its head at 3, 65, 1
      const t = await fakeServerBot(version, {
        spawn: { x: 0.5, y: 65, z: 0.5 },
        blocks: [...floor, [2, 65, 1, 'red_bed', { facing: 'east', part: 'foot', occupied: true }], [3, 65, 1, 'red_bed', { facing: 'east', part: 'head', occupied: true }]]
      })
      try {
        t.client.write('entity_metadata', { entityId: t.bot.entity.id, metadata: [{ key, type: 10, value: { x: 3, y: 65, z: 1 } }] })
        await sleep(100)
        const asleep = t.bot.entity.position.clone()
        t.client.write('animation', { entityId: t.bot.entity.id, animation: 2 })
        await sleep(100)
        // (the first room: the corner west and north of the head, on the stone)
        const expected = standsUp ? [2.5, 65 + 2.0E-7, 0.5] : asleep.toArray()
        assert.deepStrictEqual(t.bot.entity.position.toArray(), expected, version)
      } finally {
        await t.close()
      }
    }
  })
})
