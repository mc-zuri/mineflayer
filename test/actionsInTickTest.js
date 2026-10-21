/* eslint-env mocha */
// actionsInTick: the player's actions go at the start of a client tick, before its movement, as Minecraft.handleKeybinds
// sends them (Grim's Post flags an action after the tick's movement packet and before the next transaction; its
// FastBreak a block started less than 300 ms after the last one broke).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 0.5, y: 65, z: 0.5 }
const floor = []
for (let x = -4; x <= 6; x++) for (let z = -4; z <= 6; z++) floor.push([x, 64, z, 'stone'])
const MOVES = /^(position|position_look|look|flying)$/

describe('actionsInTick (Minecraft.handleKeybinds: the actions at the start of a tick)', function () {
  this.timeout(15 * 1000)
  async function standing (version, actionsInTick = true) {
    const t = await fakeServerBot(version, { spawn, blocks: floor.concat([[2, 65, 0, 'dirt'], [2, 65, 1, 'dirt']]), options: { actionsInTick } })
    for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
    assert.ok(t.bot.entity.onGround)
    await settle()
    t.written.length = 0
    return t
  }
  // the packets of each tick, the tick's movement and its tick_end (1.21.2+) among them
  const names = t => t.written.map(p => p.name)

  for (const version of ['1.20.4', '1.21.11', '26.3']) {
    it(`an action asked for between ticks or after the movement goes at the next tick's start, ${version}`, async () => {
      const t = await standing(version)
      try {
        t.bot.setControlState('forward', true)
        // between ticks (the slot goes with the next action: MultiPlayerGameMode.ensureHasSentCarriedItem)
        t.bot.setQuickBarSlot(3)
        t.bot.swingArm()
        t.bot._ensureHasSentCarriedItem()
        await settle()
        assert.deepStrictEqual(names(t).filter(n => !/keep_alive/.test(n)), [])
        // and after the tick's movement (a physicsTick listener)
        const late = () => { t.bot.activateItem() }
        t.bot.once('physicsTick', late)
        t.ticks(1)
        t.ticks(1)
        t.bot.setControlState('forward', false)
        await settle()
        const order = names(t).filter(n => /^(held_item_slot|arm_animation|punch|use_item|block_place)$/.test(n) || MOVES.test(n))
        const firstMove = order.findIndex(n => MOVES.test(n))
        // the tick's start: the slot and the swing, then its movement; the use after it, at the next tick's start
        assert.deepStrictEqual(order.slice(0, firstMove), ['arm_animation', 'held_item_slot'].map(n => n === 'arm_animation' && t.registry.version['>=']('26.3') ? 'punch' : n))
        const use = order.findIndex(n => n === 'use_item' || n === 'block_place')
        assert.ok(use > firstMove, order.join(' '))
        assert.ok(MOVES.test(order[use + 1]), order.join(' '))
      } finally {
        await t.close()
      }
    })
  }

  it('a dig starts at the next tick, after the destroy delay of the break before (MultiPlayerGameMode.continueDestroyBlock)', async () => {
    const t = await standing('1.20.4')
    try {
      let tick = 0
      t.bot.prependListener('physicsTickBegin', () => { tick++ })
      const record = []
      const write = t.bot._client.write
      t.bot._client.write = (name, params) => {
        if (name === 'block_dig') record.push([params.status, tick])
        return write(name, params)
      }
      const first = t.bot.dig(t.bot.blockAt(new Vec3(2, 65, 0)), 'ignore', 'auto', 1)
      assert.deepStrictEqual(record, [])
      while (t.bot.blockAt(new Vec3(2, 65, 0)).type !== 0) t.ticks(1)
      await first
      const second = t.bot.dig(t.bot.blockAt(new Vec3(2, 65, 1)), 'ignore', 'auto', 1)
      while (t.bot.blockAt(new Vec3(2, 65, 1)).type !== 0) t.ticks(1)
      await second
      // START the tick after the call (no tick of progress), STOP once the progress reaches 1, the next START 6 ticks on
      const [[s1, start1], [st1, stop1], [s2, start2]] = record
      assert.deepStrictEqual([s1, st1, s2], [0, 2, 0])
      assert.strictEqual(start1, 1)
      assert.strictEqual(start2 - stop1, 6)
    } finally {
      await t.close()
    }
  })

  it('off by default: an action goes when it is asked for', async () => {
    const t = await standing('1.21.11', false)
    try {
      t.bot.swingArm()
      await settle()
      assert.ok(names(t).some(n => n === 'arm_animation' || n === 'punch'))
    } finally {
      await t.close()
    }
  })
})

describe('actionsInTick: a click in a menu lets go of the keys (Minecraft.setScreen: KeyMapping.releaseAll)', function () {
  this.timeout(15 * 1000)
  for (const version of ['1.20.4', '1.21.11']) {
    it(`a click made walking waits for a tick with no key down and no sprint, the keys back the tick after, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: floor, options: { actionsInTick: true } })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        t.bot.setControlState('forward', true)
        t.bot.setControlState('sprint', true)
        t.ticks(5)
        await settle()
        t.written.length = 0
        const speed = t.bot.entity.velocity.clone()
        const clicked = t.bot.clickWindow(36, 0, 0).catch(err => err)
        await settle()
        assert.ok(!t.names(/window_click/).length, 'held till a tick lets the keys go')
        t.ticks(1)
        await settle()
        const tick = t.written.map(p => p.name === 'player_input' ? `input:${Object.values(p.data.inputs ?? {}).some(Boolean)}` : p.name === 'entity_action' ? p.data.actionId : p.name)
        const click = tick.indexOf('window_click')
        assert.ok(click > 0, tick.join(' '))
        // the keys let go and the sprint stopped before it (1.21.2+ the input packet), the movement too
        if (t.registry.version['>=']('1.21.2')) assert.ok(tick.slice(0, click).includes('input:false'), tick.join(' '))
        assert.ok(tick.slice(0, click).includes('stop_sprinting'), tick.join(' '))
        // slowed: no key pushed that tick
        assert.ok(Math.abs(t.bot.entity.velocity.x) + Math.abs(t.bot.entity.velocity.z) < Math.abs(speed.x) + Math.abs(speed.z))
        assert.strictEqual(t.bot.getControlState('forward'), true)
        await clicked
        // the keys are back
        t.written.length = 0
        t.ticks(1)
        await settle()
        if (t.registry.version['>=']('1.21.2')) assert.ok(t.written.some(p => p.name === 'player_input' && p.data.inputs.forward), t.names(/./).join(' '))
      } finally {
        await t.close()
      }
    })
  }
})

describe('actionsInTick: the held packets keep their order (a screen\'s clicks, its close, the actions after)', function () {
  this.timeout(15 * 1000)
  for (const version of ['1.20.4', '1.21.11']) {
    it(`a close and a use asked for after a held click go after it: the close after the tick's movement, the use the tick after, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: floor, options: { actionsInTick: true } })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        t.bot.setControlState('forward', true)
        t.bot.setControlState('sprint', true)
        t.ticks(5)
        await settle()
        t.written.length = 0
        // an inventory craft's clicks, the menu closed, then a use (the crafting grid's items back in the bag on close)
        const clicked = t.bot.clickWindow(36, 0, 0).catch(err => err)
        t.bot.closeWindow(t.bot.inventory)
        t.bot.activateItem()
        await settle()
        assert.deepStrictEqual(t.names(/^(window_click|close_window|use_item|block_place)$/), [])
        t.ticks(1)
        await settle()
        const first = t.names(/^(window_click|close_window|use_item|block_place|position|position_look|look|flying)$/)
        const click = first.indexOf('window_click')
        assert.ok(click > 0 && first.indexOf('close_window') === click + 1, first.join(' '))
        assert.ok(!first.includes('use_item'), first.join(' '))
        t.written.length = 0
        t.ticks(1)
        await settle()
        const next = t.names(/^(use_item|block_place|position|position_look|look|flying)$/)
        assert.strictEqual(next[0], 'use_item', next.join(' '))
        await clicked
      } finally {
        await t.close()
      }
    })
  }
})

describe('actionsInTick: an action goes with the look it was asked with (the turn before the click)', function () {
  this.timeout(15 * 1000)
  for (const version of ['1.20.4', '1.21.11']) {
    it(`a use asked looking one way, the tick's begin turning another: the tick sends the use's look, the use goes at the next tick's start with it, the turn after, ${version}`, async () => {
      const t = await fakeServerBot(version, { spawn, blocks: floor, options: { actionsInTick: true } })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        await t.bot.look(0, 0, true)
        t.ticks(2)
        await settle()
        t.written.length = 0
        // looking east-ish and down, the use; the next tick's begin turns away (the bot's next target)
        await t.bot.look(-Math.PI / 2, -0.5, true)
        t.bot.activateItem()
        t.bot.once('physicsTickBegin', () => { void t.bot.look(Math.PI, 0, true) })
        t.ticks(1)
        await settle()
        const looks = () => t.written.filter(p => /^(position_look|look)$/.test(p.name)).map(p => [Math.round(p.data.yaw) + 0, Math.round(p.data.pitch) + 0])
        // the look first (Grim's RotationPlace checks a place against the look before it too, pre-flying)
        assert.deepStrictEqual(t.names(/^use_item$/), [], t.names().join(' '))
        assert.deepStrictEqual([...new Set(looks().map(String))], ['270,29'])
        t.written.length = 0
        t.ticks(1)
        await settle()
        assert.ok(t.names(/^use_item$/).length === 1, t.names().join(' '))
        assert.deepStrictEqual(looks(), [])
        t.written.length = 0
        t.ticks(1)
        await settle()
        assert.deepStrictEqual([...new Set(looks().map(String))], ['360,0'])
      } finally {
        await t.close()
      }
    })
  }
})
