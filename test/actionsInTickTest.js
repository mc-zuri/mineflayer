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

  it('a dig whose START is held counts its progress from the START sent, its STOP after it (Grim FastBreak: a START and its STOP flushed in one tick behind a menu\'s clicks, e2e-m2 t186096)', async () => {
    const t = await standing('1.21.11')
    try {
      // the ticks (their tick_end) the server had between a dig's START and its STOP, as it got them
      const digTicks = () => {
        const got = t.written.filter(p => p.name === 'tick_end' || p.name === 'block_dig')
        const start = got.findIndex(p => p.name === 'block_dig' && p.data.status === 0)
        const stop = got.findIndex(p => p.name === 'block_dig' && p.data.status === 2)
        assert.ok(start >= 0 && stop > start, got.map(p => p.name === 'block_dig' ? p.data.status : p.name).join(' '))
        return got.slice(start, stop).filter(p => p.name === 'tick_end').length
      }
      // a dig with nothing before it
      const first = t.bot.dig(t.bot.blockAt(new Vec3(2, 65, 0)), 'ignore', 'auto', 1)
      while (t.bot.blockAt(new Vec3(2, 65, 0)).type !== 0) t.ticks(1)
      await first
      await settle()
      const alone = digTicks()
      t.ticks(10)
      await settle()
      t.written.length = 0
      // the next START held 10 ticks before it goes (as the held packets ahead of it, a menu's clicks, kept it)
      const write = t.bot._client.write
      let heldStart = null
      t.bot._client.write = (name, params) => {
        if (name === 'block_dig' && params.status === 0 && heldStart === null) {
          heldStart = { params, release: 10 }
          return
        }
        return write(name, params)
      }
      t.bot.prependListener('physicsTickBegin', () => {
        if (heldStart && heldStart.release-- === 0) write('block_dig', heldStart.params)
      })
      const second = t.bot.dig(t.bot.blockAt(new Vec3(2, 65, 1)), 'ignore', 'auto', 1)
      for (let i = 0; i < 200 && t.bot.blockAt(new Vec3(2, 65, 1)).type !== 0; i++) t.ticks(1)
      await second
      await settle()
      assert.strictEqual(digTicks(), alone)
    } finally {
      await t.close()
    }
  })

  it('a block broken turns to air as its STOP goes, not in the tick before it (MultiPlayerGameMode.startPrediction: the Grim mirror\'s air for farmland a tick before the STOP, e2e-m10 t215528)', async () => {
    const t = await standing('1.21.11')
    try {
      let tick = 0
      let stopTick = null
      let airTick = null
      const at = new Vec3(2, 65, 0)
      // (the tick the STOP is put on the wire, under the held packets' write)
      const serializer = t.bot._client.serializer
      const serialize = serializer.write.bind(serializer)
      serializer.write = (packet, ...rest) => {
        if (packet.name === 'block_dig' && packet.params.status === 2 && stopTick === null) stopTick = tick
        return serialize(packet, ...rest)
      }
      // the STOP held a tick (as a turn or the packets held ahead of it hold it): it goes, and its onSent with it, at the
      // next tick's start
      const write = t.bot._client.write
      let heldStop = null
      t.bot._client.write = (name, params) => {
        if (name === 'block_dig' && params.status === 2 && heldStop === null) {
          heldStop = params
          return
        }
        return write(name, params)
      }
      t.bot.prependListener('physicsTickBegin', () => {
        if (heldStop && !heldStop.sent) {
          heldStop.sent = true
          write('block_dig', heldStop)
        }
      })
      t.bot.on('physicsTick', () => {
        if (airTick === null && t.bot.blockAt(at).type === 0) airTick = tick
        tick++
      })
      const dig = t.bot.dig(t.bot.blockAt(at), 'ignore', 'auto', 1)
      for (let i = 0; i < 200 && airTick === null; i++) t.ticks(1)
      t.ticks(2)
      await dig
      assert.ok(stopTick !== null && airTick !== null, `stop ${stopTick}, air ${airTick}`)
      assert.strictEqual(airTick, stopTick)
    } finally {
      await t.close()
    }
  })

  it('a block placed goes into the world as its use goes, the tick after one asked for between ticks (Grim Simulation: the bot moved against a block the server had not had yet, e2e-m2 t257449)', async () => {
    const t = await standing('1.21.11')
    try {
      const Item = require('prismarine-item')(t.registry)
      t.bot.inventory.updateSlot(t.bot.QUICK_BAR_START + t.bot.quickBarSlot, new Item(t.registry.itemsByName.dirt.id, 4))
      t.bot.lookAt = async () => {}
      const cell = new Vec3(2, 66, 0)
      // asked for between ticks: held for the next tick's start, the world without it till then
      const result = await t.bot.activateBlock(t.bot.blockAt(new Vec3(2, 65, 0)), new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5))
      assert.strictEqual(result, 'success')
      assert.strictEqual(t.bot.blockAt(cell).name, 'air')
      assert.strictEqual(t.bot.inventory.slots[t.bot.QUICK_BAR_START + t.bot.quickBarSlot].count, 4)
      t.ticks(1)
      await settle()
      assert.ok(t.written.some(p => p.name === 'block_place'), t.written.map(p => p.name).join(' '))
      assert.strictEqual(t.bot.blockAt(cell).name, 'dirt')
      assert.strictEqual(t.bot.inventory.slots[t.bot.QUICK_BAR_START + t.bot.quickBarSlot].count, 3)
    } finally {
      await t.close()
    }
  })

  it('bot._genericPlace (bot.placeBlock, the pathfinder\'s places) puts the block into the world and takes it from the stack as the use goes, not before (vanilla BlockItem.place on the client)', async () => {
    const t = await standing('1.21.11')
    try {
      const Item = require('prismarine-item')(t.registry)
      const hand = t.bot.QUICK_BAR_START + t.bot.quickBarSlot
      t.bot.inventory.updateSlot(hand, new Item(t.registry.itemsByName.cobblestone.id, 4))
      const cell = new Vec3(2, 66, 1)
      await t.bot._genericPlace(t.bot.blockAt(new Vec3(2, 65, 1)), new Vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' })
      // asked for between ticks: held for the next tick's start
      assert.strictEqual(t.bot.blockAt(cell).name, 'air')
      assert.strictEqual(t.bot.inventory.slots[hand].count, 4)
      t.ticks(1)
      await settle()
      assert.ok(t.written.some(p => p.name === 'block_place'), t.written.map(p => p.name).join(' '))
      assert.strictEqual(t.bot.blockAt(cell).name, 'cobblestone')
      assert.strictEqual(t.bot.inventory.slots[hand].count, 3)
      // into the cell the bot stands in: not placed on the client (BlockItem.canPlace: isUnobstructed), the stack kept
      await t.bot._genericPlace(t.bot.blockAt(new Vec3(0, 64, 0)), new Vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' })
      t.ticks(1)
      await settle()
      assert.strictEqual(t.bot.blockAt(new Vec3(0, 65, 0)).name, 'air')
      assert.strictEqual(t.bot.inventory.slots[hand].count, 3)
    } finally {
      await t.close()
    }
  })

  it('an attack asked for with a look the server hasn\'t had goes at the next tick\'s start, before the movement that sends its look (Minecraft.handleKeybinds: Grim\'s Reach measures from the position before it)', async () => {
    const t = await standing('1.21.11')
    try {
      const conv = require('../lib/conversions')
      t.ticks(1)
      await settle()
      t.written.length = 0
      // turned 40 degrees and the attack asked for between ticks
      const yaw = conv.fromNotchianYaw(Number(t.bot.entity.yawDegrees) + 40)
      await t.bot.look(yaw, 0, true)
      t.bot._client.write('use_entity', { target: 99, mouse: 1, sneaking: false })
      t.ticks(1)
      await settle()
      const order = t.written.map(p => p.name).filter(n => n === 'use_entity' || MOVES.test(n))
      assert.deepStrictEqual(order.slice(0, 2), ['use_entity', 'look'], order.join(' '))
      const look = t.written.find(p => MOVES.test(p.name)).data
      assert.ok(Math.abs(look.yaw - Number(t.bot.entity.yawDegrees)) < 1e-3, `yaw sent ${look.yaw}`)
    } finally {
      await t.close()
    }
  })

  it('two actions asked for with two looks go a tick apart, each tick\'s movement with its action\'s look (Grim BadPacketsJ: a use\'s rotation not the look of the movement after it, e2e-m6 t214396)', async () => {
    const t = await standing('1.21.11')
    try {
      const conv = require('../lib/conversions')
      t.ticks(1)
      await settle()
      t.written.length = 0
      const base = Number(t.bot.entity.yawDegrees)
      await t.bot.look(conv.fromNotchianYaw(base + 20), 0, true)
      t.bot._client.write('use_item', { hand: 1, sequence: 1, rotation: { x: Number(t.bot.entity.yawDegrees), y: Number(t.bot.entity.pitchDegrees) } })
      await t.bot.look(conv.fromNotchianYaw(base + 40), 0, true)
      t.bot._client.write('use_entity', { target: 99, mouse: 1, sneaking: false })
      t.ticks(4)
      await settle()
      const all = t.written.filter(p => p.name === 'use_item' || p.name === 'use_entity' || p.name === 'tick_end' || MOVES.test(p.name))
      const use = all.findIndex(p => p.name === 'use_item')
      const attack = all.findIndex(p => p.name === 'use_entity')
      const useTickEnd = all.findIndex((p, k) => k > use && p.name === 'tick_end')
      assert.ok(use >= 0 && useTickEnd > use && attack > useTickEnd, all.map(p => p.name).join(' '))
      // the look in force at the use's tick (the last movement sent before its tick ends) is the use's
      const lookAtUse = all.slice(0, useTickEnd).filter(p => MOVES.test(p.name) && p.data.yaw !== undefined).pop()
      assert.ok(lookAtUse && Math.abs(lookAtUse.data.yaw - all[use].data.rotation.x) < 1e-3, `look at the use's tick ${lookAtUse?.data.yaw}, the use's ${all[use].data.rotation.x}`)
      // and the attack's tick sends the attack's
      const afterAttack = all.slice(attack).find(p => MOVES.test(p.name))
      assert.ok(afterAttack && Math.abs(afterAttack.data.yaw - (base + 40)) < 0.2, `look after the attack ${afterAttack?.data.yaw}`)
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
