/* eslint-env mocha */
// A block's menu opens on its use only without the shift key down while a hand holds an item (ServerPlayerGameMode.
// useItemOn: Player.isSecondaryUseActive): openBlock and a craft at a table let go of the shift key for a tick first,
// and put it back once the menu opened.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }

describe('a block used to open its menu with the shift key down (Player.isSecondaryUseActive)', function () {
  this.timeout(15 * 1000)
  for (const version of ['1.20.4', '1.21.11']) {
    it(`openBlock lets go of the shift key, a tick before the use, and holds it again once the menu opened, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: [[0, 64, 0, 'stone'], [1, 64, 0, 'stone'], [1, 65, 0, 'crafting_table']] })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        const Item = require('prismarine-item')(t.registry)
        t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 45, item: Item.toNotch(new Item(t.registry.itemsByName.shield.id, 1)) })
        await settle()
        t.bot.setControlState('sneak', true)
        t.ticks(1)
        await settle()
        t.written.length = 0
        // the server opens the table's menu on the use
        t.client.on('block_place', () => {
          const title = t.registry.version['>=']('1.20.3') ? { type: 'string', value: 'Crafting' } : JSON.stringify({ text: 'Crafting' })
          t.client.write('open_window', { windowId: 1, inventoryType: 11, windowTitle: title })
          t.client.write('window_items', { windowId: 1, stateId: 2, items: new Array(46).fill(Item.toNotch(null)), carriedItem: Item.toNotch(null) })
        })
        const opened = t.bot.openBlock(t.bot.blockAt(new Vec3(1, 65, 0)))
        await settle()
        assert.deepStrictEqual(t.names(/^block_place$/), [], 'no use before the tick that lets go of the shift key')
        let done = false
        opened.then(() => { done = true }, () => { done = true })
        for (let i = 0; i < 10 && !done; i++) {
          t.ticks(1)
          await settle()
        }
        await opened
        // the shift key let go before the use: the input (1.21.6+) or the player command
        const order = t.written.map(p => p.name === 'player_input' ? `input shift ${p.data.inputs.shift}` : p.name === 'entity_action' ? p.data.actionId : p.name).filter(n => /shift|sneak|block_place/.test(n))
        const use = order.indexOf('block_place')
        assert.ok(use > 0 && /stop_sneaking|shift false/.test(order[use - 1]), order.join(' '))
        assert.strictEqual(t.bot.getControlState('sneak'), true)
      } finally {
        await t.close()
      }
    })
  }
})
