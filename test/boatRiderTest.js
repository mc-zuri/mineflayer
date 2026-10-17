/* eslint-env mocha */
// The rider of a boat it steers, as vanilla's client tells the server about it. Against a fake server, the bot stepped
// tick by tick.

const assert = require('assert')
const { fakeServerBot } = require('./common/fakeServer')
const { once, sleep } = require('../lib/promise_utils')

const settle = () => sleep(50)

function ground () {
  const blocks = []
  for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks.push([x, 64, z, 'stone'])
  return blocks
}

// The bot on its feet at (0.5, 65, 0.5), then put by the server in a boat (id 100) at (8.5, 65, 8.5)
async function inBoat (version) {
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: ground() })
  const { bot, client, registry } = t
  const Entity = require('prismarine-entity')(bot.version)
  const boat = bot.entities[100] ?? (bot.entities[100] = new Entity(100))
  const name = registry.entitiesByName.oak_boat ? 'oak_boat' : 'boat'
  const type = registry.entitiesByName[name]
  Object.assign(boat, { name, type: type.type ?? 'mob', height: type.height, width: type.width, onGround: true, metadata: [] })
  boat.position.set(8.5, 65, 8.5)
  bot.entityInterpolation?.spawn(boat)
  const mounted = once(bot, 'mount')
  client.write('set_passengers', { entityId: 100, passengers: [bot.entity.id] })
  await mounted
  await settle()
  t.written.length = 0
  return t
}

describe('the rider of a boat it steers', function () {
  this.timeout(30 * 1000)

  // from 1.19.3 LocalPlayer.tick tells the rider's sprint after the vehicle's move (sendIsSprintingIfNeeded); before,
  // a rider does not tell it, and from 1.19.4 it no longer starts sprinting in a boat (v_boat_sprint_key_ignored on
  // 1.19.3)
  it('tells its sprint after the boat\'s move from 1.19.3', async () => {
    for (const [version, told] of [['1.19.2', false], ['1.19.3', true], ['1.19.4', false]]) {
      const t = await inBoat(version)
      try {
        t.bot.setControlState('forward', true)
        t.bot.setControlState('sprint', true)
        t.ticks(1)
        await settle()
        const names = t.written.map(p => p.name).filter(n => n === 'vehicle_move' || n === 'entity_action')
        assert.deepStrictEqual(names, told ? ['vehicle_move', 'entity_action'] : ['vehicle_move'], version)
        if (told) assert.strictEqual(t.written.find(p => p.name === 'entity_action').data.actionId, 'start_sprinting', version)
      } finally {
        await t.close()
      }
    }
  })
})
