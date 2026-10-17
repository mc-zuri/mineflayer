/* eslint-env mocha */
// What the bot writes for the item in the player's hand as vanilla's client writes it, against a fake server: the
// selected slot (MultiPlayerGameMode.ensureHasSentCarriedItem) and the rotation of an item use.

const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }

describe('the selected slot (MultiPlayerGameMode.ensureHasSentCarriedItem)', function () {
  this.timeout(10 * 1000)
  for (const version of ['1.12.2', '1.20.4', '26.1']) {
    it(`a slot picked between ticks goes to the server at the start of the tick after the next, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone']] })
      try {
        // (picked as a hotbar key is, in the tick: the next tick's start sends it)
        t.bot.setQuickBarSlot(3)
        t.ticks(1)
        await settle()
        assert.deepStrictEqual(t.names(/held_item_slot/), [])
        t.ticks(1)
        await settle()
        assert.deepStrictEqual(t.written.filter(p => p.name === 'held_item_slot').map(p => p.data.slotId), [3])
        // a slot picked and put back before the tick sends nothing
        t.written.length = 0
        t.bot.setQuickBarSlot(5)
        t.bot.setQuickBarSlot(3)
        t.ticks(2)
        await settle()
        assert.deepStrictEqual(t.names(/held_item_slot/), [])
      } finally {
        await t.close()
      }
    })
  }

  it('the slot the server selects is answered at the start of the next tick, not at once', async () => {
    const t = await fakeServerBot('1.20.4', { spawn, blocks: [[0, 64, 0, 'stone']] })
    try {
      t.client.write('held_item_slot', { slot: 2 })
      await settle()
      assert.strictEqual(t.bot.quickBarSlot, 2)
      assert.deepStrictEqual(t.names(/held_item_slot/), [])
      t.ticks(1)
      await settle()
      assert.deepStrictEqual(t.written.filter(p => p.name === 'held_item_slot').map(p => p.data.slotId), [2])
    } finally {
      await t.close()
    }
  })
})
