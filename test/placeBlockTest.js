/* eslint-env mocha */
// Placing a block, as vanilla's server answers it (ServerGamePacketListenerImpl.handleUseItemOn): the updates of the
// block clicked and of the one on its face, from 1.19 the acknowledgement of the use's sequence after them.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

// the bot at 0.5, 65, 0.5 holding stone, the server's answer to its click on the top of 2, 64, 1 written by answer
async function placingBot (version, answer) {
  const floor = []
  for (let x = 0; x <= 4; x++) for (let z = 0; z <= 3; z++) floor.push([x, 64, z, 'stone'])
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: floor })
  const Item = require('prismarine-item')(t.registry)
  t.client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: Item.toNotch(new Item(t.registry.itemsByName.stone.id, 64)) })
  for (let i = 0; i < 50 && t.bot.heldItem?.name !== 'stone'; i++) await sleep(20)
  const stateOf = name => t.registry.blocksByName[name].defaultState ?? t.registry.blocksByName[name].id << 4
  const update = (pos, name) => t.client.write('block_change', { location: pos, type: stateOf(name) })
  t.client.on('block_place', (packet) => answer({ packet, update, ack: () => t.client.write('acknowledge_player_digging', { sequenceId: packet.sequence }) }))
  return t
}

// bot.placeBlock's outcome: 'placed' or the error's message, null while it waits
function placing (t) {
  const settled = { outcome: null }
  t.bot._placeBlockWithOptions(t.bot.blockAt(new Vec3(2, 64, 1)), new Vec3(0, 1, 0), { forceLook: 'ignore' })
    .then(() => { settled.outcome = 'placed' }, err => { settled.outcome = err.message })
  return settled
}

const clicked = { x: 2, y: 64, z: 1 }
const above = { x: 2, y: 65, z: 1 }

describe('placing a block (ServerGamePacketListenerImpl.handleUseItemOn)', function () {
  this.timeout(120 * 1000)
  const versions = ['1.8.8', '1.12.2', '1.18.2', '1.19.4', '1.21.11']

  it('the server\'s updates (from 1.19 closed by its acknowledgement) answer at once, without a tick: the block placed, or not', async () => {
    for (const version of versions) {
      const sequenced = require('prismarine-registry')(version).version['>=']('1.19')
      for (const placed of [true, false]) {
        const t = await placingBot(version, ({ update, ack }) => {
          update(clicked, 'stone')
          update(above, placed ? 'stone' : 'air')
          if (sequenced) ack()
        })
        try {
          const settled = placing(t)
          await sleep(300)
          assert.strictEqual(settled.outcome, placed ? 'placed' : 'No block has been placed : the block is still air', `${version}: placed ${placed}`)
        } finally {
          await t.close()
        }
      }
    }
  })

  it('from 1.19 the acknowledgement alone answers (a click the server turned down: out of reach)', async () => {
    for (const version of ['1.19.4', '1.21.11']) {
      const t = await placingBot(version, ({ ack }) => ack())
      try {
        const settled = placing(t)
        await sleep(300)
        assert.strictEqual(settled.outcome, 'No block has been placed : the block is still air', version)
      } finally {
        await t.close()
      }
    }
  })

  it('without an answer the bot gives up in 100 of its ticks (physicsManual: not 5 seconds)', async () => {
    for (const version of ['1.12.2', '1.21.11']) {
      const t = await placingBot(version, () => {})
      try {
        const settled = placing(t)
        await sleep(5200)
        t.ticks(99)
        await sleep(50)
        assert.strictEqual(settled.outcome, null, version)
        t.ticks(1)
        await sleep(50)
        assert.strictEqual(settled.outcome, 'Event blockUpdate:(2, 65, 1) did not fire within 100 ticks', version)
      } finally {
        await t.close()
      }
    }
  })
})
