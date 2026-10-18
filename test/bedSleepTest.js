/* eslint-env mocha */
// Going to sleep in a bed, as vanilla's server lets the player (ServerPlayer.startSleepInBed, before 1.16
// Player.startSleepInBed / trySleep).

const assert = require('assert')
const { once, sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

// a bed facing east, its foot at 2, 65, 1 and its head at 3, 65, 1, the bot at 0.5, 65, 0.5, at night
async function bedBot (version, options = {}) {
  const floor = []
  for (let x = -1; x <= 5; x++) for (let z = -1; z <= 3; z++) floor.push([x, 64, z, 'stone'])
  const flattened = require('prismarine-registry')(version).version['>=']('1.13')
  const beds = flattened
    ? [[2, 65, 1, 'red_bed', { facing: 'east', part: 'foot', occupied: false }], [3, 65, 1, 'red_bed', { facing: 'east', part: 'head', occupied: false }]]
    : []
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: [...floor, ...beds], ...options })
  if (!flattened) {
    // (before 1.13 the metadata: the facing, 4 occupied, 8 the head)
    const id = t.registry.blocksByName.bed.id
    t.client.write('block_change', { location: { x: 2, y: 65, z: 1 }, type: id << 4 | 3 })
    t.client.write('block_change', { location: { x: 3, y: 65, z: 1 }, type: id << 4 | 8 | 3 })
    await once(t.bot, 'blockUpdate:(3, 65, 1)')
  }
  t.bot.time.timeOfDay = 18000
  return t
}

function spawnMob (t, name, x, y, z) {
  const fixed = t.registry.supportFeature('fixedPointPosition') ? 32 : 1
  const type = (t.registry.entitiesByName[name] ?? t.registry.entitiesByName[name[0].toUpperCase() + name.slice(1)]).id
  t.client.write(t.registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living', {
    entityId: 97,
    entityUUID: '00112233-4455-6677-8899-aabbccddeeff',
    objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
    type,
    x: x * fixed,
    y: y * fixed,
    z: z * fixed,
    yaw: 0,
    pitch: 0,
    headPitch: 0,
    objectData: 0,
    velocity: { x: 0, y: 0, z: 0 },
    metadata: []
  })
  return once(t.bot, 'entitySpawn')
}

// bot.sleep: the monsters near the bed refuse it at once, else the bot clicks the bed
async function sleepOutcome (t) {
  const bed = t.bot.blockAt(t.bot.entity.position.offset(1.5, 0, 0.5))
  const sleeping = t.bot.sleep(bed)
  const clicked = once(t.client, 'block_place').then(() => 'clicked')
  const settled = { outcome: null }
  Promise.race([sleeping.then(() => 'slept', err => err.message), clicked]).then(outcome => { settled.outcome = outcome })
  // (the click goes once the bot looked at the bed: a tick)
  for (let i = 0; i < 3 && settled.outcome === null; i++) {
    await sleep(50)
    if (settled.outcome === null) t.ticks(1)
  }
  await sleep(50)
  return settled.outcome
}

describe('going to sleep (ServerPlayer.startSleepInBed)', function () {
  this.timeout(120 * 1000)

  it('a monster whose box meets the box 8 around the bed\'s head and 5 up and down keeps the player awake: from 1.15 around the bottom center of the head, before around its corner', async () => {
    for (const version of ['1.8.8', '1.12.2', '1.14.4', '1.15.2', '1.20.4', '1.21.11']) {
      // the box's east side: 3 + 8 before 1.15, 3.5 + 8 from 1.15; a zombie 0.6 wide; below, its top above 65 - 5
      const east = require('prismarine-registry')(version).version['>=']('1.15') ? 11.5 : 11
      for (const [x, y, nearby] of [[east + 0.25, 65, true], [east + 0.3125, 65, false], [3, 58.0625, true], [3, 58, false], [3, 69.96875, true], [3, 70, false]]) {
        const t = await bedBot(version)
        try {
          await spawnMob(t, 'zombie', x, y, 1.5)
          assert.strictEqual(await sleepOutcome(t), nearby ? 'there are monsters nearby' : 'clicked', `${version}: a zombie at ${x}, ${y}`)
        } finally {
          await t.close()
        }
      }
    }
  })

  it('only vanilla\'s Monster: not a slime, a ghast or (from 1.12, unless angry) a zombified piglin; in creative none from 1.13', async () => {
    for (const [version, name, gameMode, nearby] of [['1.21.11', 'slime', 'survival', false], ['1.21.11', 'ghast', 'survival', false],
      ['1.21.11', 'enderman', 'survival', true], ['1.21.11', 'zombified_piglin', 'survival', false], ['1.11.2', 'zombie_pigman', 'survival', true],
      ['1.12.2', 'zombie_pigman', 'survival', false], ['1.12.2', 'zombie', 'creative', true], ['1.13.2', 'zombie', 'creative', false]]) {
      const t = await bedBot(version, { gameMode })
      try {
        await spawnMob(t, name, 5.5, 65, 1.5)
        assert.strictEqual(await sleepOutcome(t), nearby ? 'there are monsters nearby' : 'clicked', `${version}: a ${name} (${gameMode})`)
      } finally {
        await t.close()
      }
    }
  })
})
