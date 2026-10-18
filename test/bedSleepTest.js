/* eslint-env mocha */
// Going to sleep in a bed, as vanilla's server lets the player (ServerPlayer.startSleepInBed, before 1.16
// Player.startSleepInBed / trySleep).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { once, sleep } = require('../lib/promise_utils')
const nbt = require('prismarine-nbt')
const { fakeServerBot } = require('./common/fakeServer')

// a bed facing east, its foot at 2, 65, 1 (or x, 65, 1) and its head east of it, the bot at 0.5, 65, 0.5, at night
async function bedBot (version, { foot: x = 2, ...options } = {}) {
  const floor = []
  for (let fx = 0; fx <= 12; fx++) for (let z = -1; z <= 3; z++) floor.push([fx, 64, z, 'stone'])
  const flattened = require('prismarine-registry')(version).version['>=']('1.13')
  const beds = flattened
    ? [[x, 65, 1, 'red_bed', { facing: 'east', part: 'foot', occupied: false }], [x + 1, 65, 1, 'red_bed', { facing: 'east', part: 'head', occupied: false }]]
    : []
  const t = await fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: [...floor, ...beds], ...options })
  if (!flattened) {
    // (before 1.13 the metadata: the facing, 4 occupied, 8 the head)
    const id = t.registry.blocksByName.bed.id
    t.client.write('block_change', { location: { x, y: 65, z: 1 }, type: id << 4 | 3 })
    t.client.write('block_change', { location: { x: x + 1, y: 65, z: 1 }, type: id << 4 | 8 | 3 })
    await once(t.bot, `blockUpdate:(${x + 1}, 65, 1)`)
  }
  t.bot.time.timeOfDay = 18000
  t.foot = new Vec3(x, 65, 1)
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
  const bed = t.bot.blockAt(t.foot)
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

// the bot clicks the bed (a tick or two to look at it): its sleep's outcome, a promise of 'slept' or the error, and
// the ticks it took
async function clickBed (t) {
  const bed = t.bot.blockAt(t.foot)
  const state = { clicked: false }
  t.client.once('block_place', () => { state.clicked = true })
  const sleeping = t.bot.sleep(bed).then(() => 'slept', err => err)
  let ticked = 0
  for (let i = 0; i < 3 && !state.clicked; i++) {
    await sleep(50)
    if (!state.clicked) {
      t.ticks(1)
      ticked++
    }
  }
  await sleep(50)
  assert.ok(state.clicked, 'the bed clicked')
  return { sleeping, ticked }
}

// a message above the hotbar, as BedBlock.use sends it (Player.displayClientMessage), before 1.12 in the chat
function writeOverlay (t, translate) {
  const json = JSON.stringify({ translate })
  if (t.registry.version['>=']('1.20.3')) t.client.write('system_chat', { content: nbt.comp({ translate: nbt.string(translate) }), isActionBar: true })
  else if (t.registry.version['>=']('1.19.2')) t.client.write('system_chat', { content: json, isActionBar: true })
  else if (t.registry.version['>=']('1.19')) t.client.write('system_chat', { content: json, type: 2 })
  else t.client.write('chat', { message: json, position: t.registry.version['>=']('1.12') ? 2 : 1, sender: '00000000-0000-0000-0000-000000000000' })
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

  it('the server\'s refusal (BedBlock.use: the problem\'s message) rejects at once with its reason, without a tick', async () => {
    for (const [version, key, reason] of [['1.8.8', 'tile.bed.notSafe', 'there are monsters nearby'], ['1.12.2', 'tile.bed.noSleep', "it's not night and it's not a thunderstorm"],
      ['1.13.2', 'block.minecraft.bed.too_far_away', 'the bed is too far'], ['1.16.5', 'block.minecraft.bed.obstructed', 'the bed is obstructed'],
      ['1.19.2', 'block.minecraft.bed.not_safe', 'there are monsters nearby'], ['1.20.4', 'block.minecraft.bed.occupied', 'the bed is occupied'],
      ['1.21.11', 'block.minecraft.bed.not_safe', 'there are monsters nearby']]) {
      const t = await bedBot(version)
      try {
        const { sleeping } = await clickBed(t)
        writeOverlay(t, key)
        const err = await sleeping
        assert.ok(err instanceof Error, `${version}: ${err}`)
        assert.deepStrictEqual([err.message, err.translate], [reason, key], version)
      } finally {
        await t.close()
      }
    }
  })

  it('without an answer the bot gives up in 60 of its ticks (physicsManual: not 3 seconds); another message does not refuse', async () => {
    for (const version of ['1.12.2', '1.15.2', '1.21.11']) {
      const t = await bedBot(version)
      try {
        const settled = { outcome: null }
        const { sleeping, ticked } = await clickBed(t)
        sleeping.then(outcome => { settled.outcome = outcome })
        // (1.15: the spawn set at the bed, no refusal)
        writeOverlay(t, version === '1.15.2' ? 'block.minecraft.bed.set_spawn' : 'sleep.not_possible')
        await sleep(3200)
        t.ticks(59 - ticked)
        await sleep(50)
        assert.strictEqual(settled.outcome, null, version)
        t.ticks(1)
        await sleep(50)
        assert.strictEqual(settled.outcome?.message, 'bot is not sleeping', version)
      } finally {
        await t.close()
      }
    }
  })

  it('the bed within reach: 3 blocks across and 2 up or down of its head or, from 1.11, its foot; from 1.15 of the block\'s bottom center, before of its corner', async () => {
    // (the foot at 6, 65, 1, the head at 7, 65, 1)
    for (const [version, cases] of [['1.9.4', [[10, true], [10.0625, false], [3.5, false]]], ['1.12.2', [[10, true], [10.0625, false], [3, true], [2.9375, false]]],
      ['1.14.4', [[10, true], [10.0625, false]]], ['1.15.2', [[10.5, true], [10.5625, false], [3.5, true], [3.4375, false]]],
      ['1.21.11', [[10.5, true], [10.5625, false], [3.5, true], [3.4375, false]]]]) {
      for (const [x, reachable] of cases) {
        const t = await bedBot(version, { foot: 6, spawn: { x, y: 65, z: 0.5 } })
        try {
          assert.strictEqual(await sleepOutcome(t), reachable ? 'clicked' : 'the bed is too far', `${version}: at ${x}`)
        } finally {
          await t.close()
        }
      }
    }
  })
})
