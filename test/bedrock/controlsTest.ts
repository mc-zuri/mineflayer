import assert from 'assert'
import { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { ControlState } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { AuthInput, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The controls and the look, phase by phase: a control set acts in the next frame's input pass and shows in the next
// tick's auth input; a look is applied after the next frame's ticks and shows in the auth input of the frame after.
// The keys' flags are grouped by the flags the version's server reads.

/** a joined bot */
async function joinedBot (codec: BedrockCodec): Promise<TestBot> {
  const testBot = await bedrockTestBot(codec)
  await new ServerWorld(testBot.server).join(testBot)
  return testBot
}

/** holds `keys` (and nothing else) for a tick: that tick's auth input's flags */
async function flagsHolding ({ bot, internal, server, driver }: TestBot, keys: readonly ControlState[]): Promise<string[]> {
  bot.clearControlStates()
  for (const control of keys) bot.setControlState(control, true)
  await driver.tick()
  return inputFlags(server.authInput(internal._core.tick ?? -1)).set
}

const PRESSED: readonly ControlState[] = Object.freeze(['forward', 'left', 'jump', 'sprint', 'sneak'])

describe('bedrock controls', () => {
  describe('servers reading a jump as a north jump too (up to 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: reports the keys held`, async () => {
        const testBot = await joinedBot(bedrockCodec(version))
        assert.deepStrictEqual(await flagsHolding(testBot, PRESSED), ['north_jump', 'jump_down', 'sprint_down', 'jumping', 'sneaking', 'sneak_down', 'up', 'left', 'want_up', 'want_down'])
        assert.deepStrictEqual(await flagsHolding(testBot, ['back', 'right', 'sprint']), ['sprint_down', 'down', 'right'])
      })
    }
  })

  describe('servers reading no north jump, and that block breaking is delayed (1.21.0 – 1.21.42)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.0', 'bedrock_1.21.42')) {
      it(`bedrock ${version}: reports the keys held`, async () => {
        const testBot = await joinedBot(bedrockCodec(version))
        assert.deepStrictEqual(await flagsHolding(testBot, PRESSED), ['jump_down', 'sprint_down', 'jumping', 'sneaking', 'sneak_down', 'up', 'left', 'want_up', 'want_down', 'block_breaking_delay_enabled'])
        assert.deepStrictEqual(await flagsHolding(testBot, ['back', 'right', 'sprint']), ['sprint_down', 'down', 'right', 'block_breaking_delay_enabled'])
      })
    }
  })

  describe('servers reading the jump and sneak keys as pressed, held and released too (1.21.50+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.50')) {
      it(`bedrock ${version}: reports the keys held, and the jump and sneak keys pressed and released`, async () => {
        const testBot = await joinedBot(bedrockCodec(version))
        const held = ['jump_down', 'sprint_down', 'jumping', 'sneaking', 'sneak_down', 'up', 'left', 'want_up', 'want_down', 'block_breaking_delay_enabled']
        assert.deepStrictEqual(await flagsHolding(testBot, PRESSED), [...held, 'jump_pressed_raw', 'jump_current_raw', 'sneak_pressed_raw', 'sneak_current_raw'])
        await testBot.driver.tick()
        assert.deepStrictEqual(inputFlags(testBot.server.authInput(testBot.internal._core.tick ?? -1)).set, [...held, 'jump_current_raw', 'sneak_current_raw'])
        assert.deepStrictEqual(await flagsHolding(testBot, ['back', 'right', 'sprint']), ['sprint_down', 'down', 'right', 'block_breaking_delay_enabled', 'jump_released_raw', 'sneak_released_raw'])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('reads a control set at once, and sets one by controlState too', async () => {
      const { bot } = await bedrockTestBot(codec)
      bot.setControlState('jump', true)
      bot.controlState.sneak = true
      assert.deepStrictEqual([bot.getControlState('jump'), bot.controlState.jump, bot.getControlState('sneak'), bot.getControlState('forward')], [true, true, true, false])
      assert.deepStrictEqual({ ...bot.controlState }, { forward: false, back: false, left: false, right: false, jump: true, sprint: false, sneak: true })
      bot.clearControlStates()
      assert.deepStrictEqual({ ...bot.controlState }, { forward: false, back: false, left: false, right: false, jump: false, sprint: false, sneak: false })
      // @ts-expect-error no such control
      assert.throws(() => { bot.setControlState('fly', true) }, { message: 'invalid control: fly' })
      // @ts-expect-error no such control
      assert.throws(() => bot.getControlState('fly'), { message: 'invalid control: fly' })
    })

    it('reports a control set in the ticks of a frame in the next tick\'s auth input', async () => {
      const testBot = await joinedBot(codec)
      const { bot, internal, server, driver } = testBot
      const tick = (internal._core.tick ?? -1) + 1
      bot.once('physicsTick', () => { bot.setControlState('forward', true) })
      await driver.ticks(2)
      assert.deepStrictEqual([inputFlags(server.authInput(tick)).set, inputFlags(server.authInput(tick + 1)).set], [['block_breaking_delay_enabled'], ['up', 'block_breaking_delay_enabled']])
    })

    it('cooks the keys into a move vector: x left and z forward, a diagonal as long as a side, scaled while sneaking', async () => {
      const testBot = await joinedBot(codec)
      const { bot, internal, server, driver } = testBot
      const sent = (): Array<{ x: number, z: number } | undefined> => {
        const input = server.authInput(internal._core.tick ?? -1)
        return [input.move_vector, input.raw_move_vector]
      }
      const vectors = async (keys: readonly ControlState[]): Promise<Array<{ x: number, z: number } | undefined>> => {
        bot.clearControlStates()
        for (const control of keys) bot.setControlState(control, true)
        await driver.tick()
        return sent()
      }
      const diagonal = 0.7071067690849304
      assert.deepStrictEqual(await vectors(['forward']), [{ x: 0, z: 1 }, { x: 0, z: 1 }])
      assert.deepStrictEqual(await vectors(['back']), [{ x: 0, z: -1 }, { x: 0, z: -1 }])
      assert.deepStrictEqual(await vectors(['left']), [{ x: 1, z: 0 }, { x: 1, z: 0 }])
      assert.deepStrictEqual(await vectors(['right']), [{ x: -1, z: 0 }, { x: -1, z: 0 }])
      assert.deepStrictEqual(await vectors(['forward', 'left']), [{ x: diagonal, z: diagonal }, { x: diagonal, z: diagonal }])
      assert.deepStrictEqual(await vectors(['back', 'right', 'sprint']), [{ x: -diagonal, z: -diagonal }, { x: -diagonal, z: -diagonal }])
      assert.deepStrictEqual(await vectors(['forward', 'back', 'left']), [{ x: 1, z: 0 }, { x: 1, z: 0 }])
      assert.deepStrictEqual(await vectors(['forward', 'sneak']), [{ x: 0, z: 0.30000001192092896 }, { x: 0, z: 1 }])
      assert.deepStrictEqual(await vectors(['forward', 'left', 'sneak']), [{ x: 0.2121320366859436, z: 0.2121320366859436 }, { x: diagonal, z: diagonal }])
      // held, not pressed again: the same
      await driver.tick()
      assert.deepStrictEqual(sent(), [{ x: 0.2121320366859436, z: 0.2121320366859436 }, { x: diagonal, z: diagonal }])
      assert.deepStrictEqual(await vectors([]), [{ x: 0, z: 0 }, { x: 0, z: 0 }])
    })

    it('keeps a key\'s presses and releases until an auth input reports the keys: not one of a tick it sends none or holds', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      await world.sendAround()
      world.spawn()
      bot.setControlState('jump', true)
      bot.setControlState('jump', false)
      await driver.tick()
      bot.setControlState('sneak', true)
      bot.setControlState('sneak', false)
      await driver.tick()
      await world.answer()
      await driver.ticks(3)
      assert.deepStrictEqual([1, 2, 3, 4, 5].map(tick => server.inTick(tick)[0] === undefined ? [] : inputFlags(server.authInput(tick)).set), [
        [],
        ['block_breaking_delay_enabled'],
        ['block_breaking_delay_enabled'],
        ['block_breaking_delay_enabled', 'jump_released_raw', 'jump_pressed_raw', 'sneak_released_raw', 'sneak_pressed_raw'],
        ['block_breaking_delay_enabled']
      ])
    })

    it('reports a look asked for in the ticks of a frame in the auth input of the frame after the next, and resolves at the end of its tick', async () => {
      const testBot = await joinedBot(codec)
      const { bot, internal, server, driver } = testBot
      const tick = (internal._core.tick ?? -1) + 1
      const done: string[] = []
      bot.once('physicsTick', () => {
        bot.look(Math.PI / 4, 0).then(() => { done.push(`first at ${internal._core.tick ?? '-'}`) }, () => {})
        bot.look(Math.PI / 2, Math.PI / 4).then(() => { done.push(`second at ${internal._core.tick ?? '-'}`) }, () => {})
        bot.look(Math.PI / 2, Math.PI / 4).then(() => { done.push(`again at ${internal._core.tick ?? '-'}`) }, () => {})
      })
      bot.on('physicsTick', () => { done.push(`physicsTick ${internal._core.tick ?? '-'}`) })
      bot.on('move', previous => { done.push(`move from ${previous.toString()}`) })
      await driver.ticks(2)
      assert.deepStrictEqual([bot.entity.yaw, bot.entity.pitch], [Math.PI / 2, Math.PI / 4])
      await driver.tick()
      const rotation = (at: number): [number, number, number] => [server.authInput(at).yaw, server.authInput(at).pitch, server.authInput(at).head_yaw]
      assert.deepStrictEqual([rotation(tick + 1), rotation(tick + 2)], [[0, 0, 0], [90, -45, 90]])
      const cameraAt = (at: number): [AuthInput['interact_rotation'], AuthInput['camera_orientation']] => [server.authInput(at).interact_rotation, server.authInput(at).camera_orientation]
      // looking south, the camera's x is +0, as the vanilla client writes it
      assert.deepStrictEqual([cameraAt(tick + 1), cameraAt(tick + 2)], [[{ x: 0, z: 0 }, { x: 0, y: 0, z: 1 }], [{ x: -45, z: 90 }, { x: -0.7071067690849304, y: 0.7071067690849304, z: 4.329780301713277e-17 }]])
      assert.deepStrictEqual(done, [`physicsTick ${tick}`, `physicsTick ${tick + 1}`, `physicsTick ${tick + 2}`, 'move from (0.5, 12, 0.5)', `first at ${tick + 2}`, `second at ${tick + 2}`, `again at ${tick + 2}`])
    })

    it('resolves a look the player looks already at once, unless a look is under way', async () => {
      const { bot, internal, server, driver } = await joinedBot(codec)
      const looked: string[] = []
      const look = (name: string, yaw: number): void => { bot.look(yaw, 0).then(() => { looked.push(name) }, () => {}) }
      const settled = async (): Promise<string[]> => {
        await new Promise(resolve => setImmediate(resolve))
        return looked
      }
      look('already', Math.PI)
      assert.deepStrictEqual(await settled(), ['already'])
      look('away', Math.PI / 2)
      look('back', Math.PI)
      assert.deepStrictEqual(await settled(), ['already'])
      await driver.ticks(2)
      assert.deepStrictEqual([await settled(), server.authInput(internal._core.tick ?? -1).yaw], [['already', 'away', 'back'], 0])
      look('already again', Math.PI)
      assert.deepStrictEqual(await settled(), ['already', 'away', 'back', 'already again'])
    })

    it('looks at a point from the eye, 1.62001 above the feet, its yaw in (-180, 180]', async () => {
      const testBot = await joinedBot(codec)
      const { bot, internal, server, driver } = testBot
      const eye = new Vec3(0.5, 12 + Math.fround(1.62001), 0.5)
      const lookAt = async (dx: number, dy: number, dz: number): Promise<[number, number, boolean]> => {
        let looked = false
        bot.lookAt(eye.offset(dx, dy, dz)).then(() => { looked = true }, () => {})
        await driver.ticks(2)
        const input = server.authInput(internal._core.tick ?? -1)
        return [input.yaw, input.pitch, looked]
      }
      assert.deepStrictEqual(await lookAt(-10, 10, 0), [90, -45, true])
      // a pitch of 0 is +0, as the vanilla client writes it; east is -90, as it reports
      assert.deepStrictEqual(await lookAt(10, 0, 0), [-90, 0, true])
      assert.deepStrictEqual(await lookAt(10, 10, -10), [-135, -35.26438903808594, true])
      assert.deepStrictEqual(await lookAt(0, 10, 10), [0, -45, true])
      assert.deepStrictEqual(await lookAt(0, -10, -10), [180, 45, true])
    })

    it('ends a tick with the player\'s movement recorded, then spawn, physicsTick, physicTick and move', async () => {
      const testBot = await bedrockTestBot(codec)
      const { bot, internal, server } = testBot
      const events: string[] = []
      for (const event of ['spawn', 'physicsTick', 'physicTick', 'move'] as const) bot.on(event, () => { events.push(`${event} ${internal._core.tick ?? '-'}`) })
      bot.on('spawn', () => { events.push(`recorded ${internal._player.corrections.history.newest ?? '-'}`) })
      // a look asked for in tick 2 is reported in tick 4, the tick it spawns
      bot.on('physicsTick', () => { if (internal._core.tick === 2) bot.look(0, 0).catch(() => {}) })
      await new ServerWorld(server).join(testBot)
      assert.deepStrictEqual(events.slice(-5), ['spawn 4', 'recorded 4', 'physicsTick 4', 'physicTick 4', 'move 4'])
    })

    it('waits for ticks: from start_game\'s tick 0 before it, none at once', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const done: string[] = []
      bot.waitForTicks(2).then(() => { done.push(`2 at ${internal._core.tick ?? '-'}`) }, () => {})
      bot.waitForTicks(0).then(() => { done.push('none') }, () => {})
      await driver.tick()
      assert.deepStrictEqual(done, ['none'])
      new ServerWorld(server).startGame()
      await driver.ticks(2)
      bot.waitForTicks(3).then(() => { done.push(`3 at ${internal._core.tick ?? '-'}`) }, () => {})
      await driver.ticks(2)
      assert.deepStrictEqual(done, ['none', '2 at 2'])
      await driver.tick()
      assert.deepStrictEqual(done, ['none', '2 at 2', '3 at 5'])
    })

    it('rejects the looks not reported when the bot ends', async () => {
      const testBot = await joinedBot(codec)
      const rejected = assert.rejects(testBot.bot.look(1, 0), { message: 'the bot ended' })
      testBot.bot.end()
      await testBot.driver.frame(0)
      await rejected
    })
  })
})
