import assert from 'assert'
import { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { AuthInput, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// Where the server places the local player, and the auth input the bot sends every tick from when the server shows
// it, as the vanilla client of each version writes it: grouped by the auth input's layout, by when the server shows a
// player that does not move yet, and by how a teleport is answered. Until the physics move it, the player stays where
// the server put it: its feet (0.5, 12, 0.5) report the eye 13.6200103759765625.

const NO_MOVE = Object.freeze({ x: 0, z: 0 })
const FORWARD = Object.freeze({ x: 0, z: 1 })
const EAST_OF_NORTH = Object.freeze({ yaw: -45, pitch: 0 })

/** the auth input but its flags, and how its version writes them */
function layoutOf (input: AuthInput): object {
  const { input_data: _flags, ...fields } = input
  return { ...fields, input_data: inputFlags(input).written }
}

/** what every version writes: the feet (0.5, 12, 0.5), looking yaw -45 */
function common (tick: number, moveVector: { x: number, z: number }): object {
  return { pitch: 0, yaw: -45, position: { x: 0.5, y: 13.6200103759765625, z: 0.5 }, move_vector: moveVector, head_yaw: -45, input_mode: 'mouse', play_mode: 'screen', tick: BigInt(tick), delta: { x: 0, y: 0, z: 0 } }
}

/** joins looking yaw -45, then holds forward a tick: the first auth input, and that tick's */
async function firstAndWalking (codec: BedrockCodec): Promise<{ first: object, walking: object, ticks: [number, number] }> {
  const testBot = await bedrockTestBot(codec)
  const { bot, internal, server, driver } = testBot
  const { firstAuthInput } = await new ServerWorld(server).join(testBot, { rotation: EAST_OF_NORTH })
  bot.setControlState('forward', true)
  await driver.tick()
  const walkingTick = internal._core.tick ?? -1
  return { first: layoutOf(server.authInput(firstAuthInput)), walking: layoutOf(server.authInput(walkingTick)), ticks: [firstAuthInput, walkingTick] }
}

/** the names of the packets of tick `tick`, and the feet the bot reported in its auth input */
function sentIn (server: FakeBedrockClient, tick: number): [string[], AuthInput['position']] {
  return [server.inTick(tick), server.authInput(tick).position]
}

describe('bedrock movement', () => {
  describe('servers reading the auth input of 1.16.201: the flags a varint, the mouse named touch', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: writes it as the vanilla client`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), input_mode: 'touch', input_data: 'number' })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), input_mode: 'touch', input_data: 'number' })
      })
    }
  })

  describe('servers reading the flags as a varint64 (1.16.210 – 1.18.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.18.30')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), input_data: 'bigint' })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), input_data: 'bigint' })
      })
    }
  })

  describe('servers reading the interaction model (1.19.1 – 1.19.63)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.1', 'bedrock_1.19.63')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client, by touch`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), interaction_model: 'touch', input_data: 'bigint' })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), interaction_model: 'touch', input_data: 'bigint' })
      })
    }
  })

  describe('servers reading an analogue move vector (1.19.70 – 1.21.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.70', 'bedrock_1.21.30')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client, no analogue move`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'bigint' })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'bigint' })
      })
    }
  })

  describe('servers reading the camera (1.21.42)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.42', 'bedrock_1.21.42')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client, no camera while held`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        const fields = { interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'bigint' }
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), ...fields, interact_rotation: NO_MOVE, camera_orientation: { x: 0, y: 0, z: 0 } })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), ...fields, interact_rotation: { x: 0, z: -45 }, camera_orientation: { x: 0.7071067690849304, y: 0, z: 0.7071067690849304 } })
      })
    }
  })

  describe('servers reading the raw move vector (1.21.50 – 1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.50', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        const fields = { interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'bigint' }
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), ...fields, interact_rotation: NO_MOVE, camera_orientation: { x: 0, y: 0, z: 0 }, raw_move_vector: NO_MOVE })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), ...fields, interact_rotation: { x: 0, z: -45 }, camera_orientation: { x: 0.7071067690849304, y: 0, z: 0.7071067690849304 }, raw_move_vector: FORWARD })
      })
    }
  })

  describe('servers reading the flags as a list and each absent field as present, then absent (1.26.40 – 1.26.45)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40', 'bedrock_1.26.45')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        const fields = { interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'list', transaction_presence: true, item_stack_request_presence: true, block_action_presence: true, vehicle_rotation_presence: true, predicted_vehicle_presence: true }
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), ...fields, interact_rotation: NO_MOVE, camera_orientation: { x: 0, y: 0, z: 0 }, raw_move_vector: NO_MOVE })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), ...fields, interact_rotation: { x: 0, z: -45 }, camera_orientation: { x: 0.7071067690849304, y: 0, z: 0.7071067690849304 }, raw_move_vector: FORWARD })
      })
    }
  })

  describe('servers reading the flags as a list (1.26.51+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51')) {
      it(`bedrock ${version}: writes the auth input as the vanilla client`, async () => {
        const { first, walking, ticks } = await firstAndWalking(bedrockCodec(version))
        const fields = { interaction_model: 'touch', analogue_move_vector: NO_MOVE, input_data: 'list' }
        assert.deepStrictEqual(first, { ...common(ticks[0], NO_MOVE), ...fields, interact_rotation: NO_MOVE, camera_orientation: { x: 0, y: 0, z: 0 }, raw_move_vector: NO_MOVE })
        assert.deepStrictEqual(walking, { ...common(ticks[1], FORWARD), ...fields, interact_rotation: { x: 0, z: -45 }, camera_orientation: { x: 0.7071067690849304, y: 0, z: 0.7071067690849304 }, raw_move_vector: FORWARD })
      })
    }
  })

  /** joins with forward held from the start: each auth input's move vector and flags, from the first to the first moving */
  async function joinWalking (codec: BedrockCodec): Promise<Array<[{ x: number, z: number }, string[]]>> {
    const testBot = await bedrockTestBot(codec)
    testBot.bot.setControlState('forward', true)
    const { firstAuthInput, moving } = await new ServerWorld(testBot.server).join(testBot)
    const ticks = Array.from({ length: moving - firstAuthInput + 1 }, (_, index) => firstAuthInput + index)
    return ticks.map(tick => [testBot.server.authInput(tick).move_vector, inputFlags(testBot.server.authInput(tick)).set])
  }

  describe('servers moving the player from its first auth input (up to 1.17.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40')) {
      it(`bedrock ${version}: reports the keys from the first`, async () => {
        assert.deepStrictEqual(await joinWalking(bedrockCodec(version)), [[FORWARD, ['up']]])
      })
    }
  })

  describe('servers holding the player until the columns around it are loaded (1.18.0 – 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: reports no key or move until then`, async () => {
        assert.deepStrictEqual(await joinWalking(bedrockCodec(version)), [[NO_MOVE, []], [NO_MOVE, []], [FORWARD, ['up']]])
      })
    }
  })

  describe('servers holding the player until the columns around it are loaded, block breaking delayed (1.21.0+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.0')) {
      it(`bedrock ${version}: reports no key or move until then, but that block breaking is delayed`, async () => {
        const delayed = 'block_breaking_delay_enabled'
        assert.deepStrictEqual(await joinWalking(bedrockCodec(version)), [[NO_MOVE, [delayed]], [NO_MOVE, [delayed]], [FORWARD, ['up', delayed]]])
      })
    }
  })

  /**
   * joins, then is teleported by 20 blocks up: the auth input that answers it and the next, the packets of its tick,
   * the events, and the feet
   */
  async function teleported (version: BedrockVersion): Promise<{ answer: AuthInput, next: AuthInput, sent: string[], events: string[], feet: Vec3 }> {
    const testBot = await bedrockTestBot(bedrockCodec(version))
    const { bot, internal, server, driver } = testBot
    await new ServerWorld(server).join(testBot)
    const events: string[] = []
    bot.on('forcedMove', () => { events.push(`forcedMove ${bot.entity.position.toString()}`) })
    bot.on('physicsTick', () => { events.push('physicsTick') })
    bot.on('move', previous => { events.push(`move from ${previous.toString()}`) })
    server.send('move_player', { runtime_id: 1, position: { x: 0.5, y: 33.6200103759765625, z: 0.5 }, mode: 'teleport', teleport: { cause: 'command', source_entity_type: 1 } })
    await driver.tick()
    const tick = internal._core.tick ?? -1
    await driver.tick()
    return { answer: server.authInput(tick), next: server.authInput(tick + 1), sent: server.inTick(tick), events, feet: bot.entity.position }
  }

  describe('servers taking a teleport\'s answer as the auth input reporting its position, without velocity (up to 1.19.50)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.50')) {
      it(`bedrock ${version}: answers a teleport in the next auth input`, async () => {
        const { answer, next, sent, events, feet } = await teleported(version)
        assert.deepStrictEqual([answer.position, answer.delta, inputFlags(answer).set], [{ x: 0.5, y: 33.6200103759765625, z: 0.5 }, { x: 0, y: 0, z: 0 }, []])
        assert.deepStrictEqual(sent, ['player_auth_input'])
        assert.deepStrictEqual(events, ['forcedMove (0.5, 32, 0.5)', 'physicsTick', 'move from (0.5, 12, 0.5)', 'physicsTick'])
        assert.deepStrictEqual([next.position, feet], [{ x: 0.5, y: 33.6200103759765625, z: 0.5 }, new Vec3(0.5, 32, 0.5)])
      })
    }
  })

  describe('servers taking a teleport\'s answer by its flag (1.19.60 – 1.21.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.60', 'bedrock_1.21.60')) {
      it(`bedrock ${version}: answers a teleport in the next auth input`, async () => {
        const { answer, next, sent, events } = await teleported(version)
        assert.deepStrictEqual([answer.position, answer.delta], [{ x: 0.5, y: 33.6200103759765625, z: 0.5 }, { x: 0, y: 0, z: 0 }])
        assert.deepStrictEqual([inputFlags(answer).set.includes('handled_teleport'), inputFlags(next).set.includes('handled_teleport')], [true, false])
        assert.deepStrictEqual(sent, ['player_auth_input'])
        assert.deepStrictEqual(events, ['forcedMove (0.5, 32, 0.5)', 'physicsTick', 'move from (0.5, 12, 0.5)', 'physicsTick'])
      })
    }
  })

  describe('servers taking a teleport\'s answer by its flag, the aim assist cleared after it (1.21.70+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.70')) {
      it(`bedrock ${version}: answers a teleport in the next auth input, then clears the aim assist`, async () => {
        const testBot = await teleported(version)
        assert.deepStrictEqual([testBot.answer.position, testBot.answer.delta, inputFlags(testBot.answer).set], [{ x: 0.5, y: 33.6200103759765625, z: 0.5 }, { x: 0, y: 0, z: 0 }, ['handled_teleport', 'block_breaking_delay_enabled']])
        assert.deepStrictEqual(testBot.sent, ['player_auth_input', 'client_camera_aim_assist'])
        assert.deepStrictEqual(inputFlags(testBot.next).set, ['block_breaking_delay_enabled'])
      })
    }
  })

  /** the player after start_game: where its feet are, and where it looks (mineflayer's radians) */
  async function startedAt ({ bot, server, driver }: TestBot): Promise<[Vec3, number, number]> {
    new ServerWorld(server).startGame({ x: 0.5, y: 12, z: -3.5 }, { yaw: 90, pitch: -90 })
    await driver.frame(0)
    return [bot.entity.position, bot.entity.yaw, bot.entity.pitch]
  }

  describe('servers placing the player by start_game\'s spawn (1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: creates the player there`, async () => {
        assert.deepStrictEqual(await startedAt(await bedrockTestBot(bedrockCodec(version))), [new Vec3(0.5, 12, -3.5), Math.PI / 2, Math.PI / 2])
      })
    }
  })

  describe('servers placing the player by start_game\'s player_position (1.16.210+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210')) {
      it(`bedrock ${version}: creates the player there`, async () => {
        assert.deepStrictEqual(await startedAt(await bedrockTestBot(bedrockCodec(version))), [new Vec3(0.5, 12, -3.5), Math.PI / 2, Math.PI / 2])
      })
    }
  })

  /**
   * the feet after respawn: searching at (9.5, 70, 9.5), then ready at (3.5, 20, -4.5); and whether the player stood on
   * the ground before it was ready (a move_player put it there), and after
   */
  async function respawnedAt ({ bot, server, driver }: TestBot, respawn: (eye: { x: number, y: number, z: number }, state: number) => void): Promise<[Vec3, Vec3, boolean, boolean]> {
    new ServerWorld(server).startGame()
    respawn({ x: 9.5, y: 71.6200103759765625, z: 9.5 }, 0)
    await driver.frame(0)
    const searching = bot.entity.position
    server.send('move_player', { runtime_id: 1, position: { x: 0.5, y: 13.6200103759765625, z: 0.5 }, on_ground: true })
    await driver.frame(0)
    const grounded = bot.entity.onGround
    respawn({ x: 3.5, y: 21.6200103759765625, z: -4.5 }, 1)
    await driver.frame(0)
    return [searching, bot.entity.position, grounded, bot.entity.onGround]
  }

  describe('servers respawning the player by x, y and z (up to 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: places the player where it is ready, its eye there, off the ground`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const runtimeId = version === 'bedrock_1.16.201' ? 1 : 1n
        const respawned = await respawnedAt(testBot, (eye, state) => { testBot.server.send('respawn', { ...eye, state, runtime_entity_id: runtimeId }) })
        assert.deepStrictEqual(respawned, [new Vec3(0.5, 12, 0.5), new Vec3(3.5, 20, -4.5), true, false])
      })
    }
  })

  describe('servers respawning the player by its position (1.16.220+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220')) {
      it(`bedrock ${version}: places the player where it is ready, its eye there, off the ground`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const respawned = await respawnedAt(testBot, (position, state) => { testBot.server.send('respawn', { position, state, runtime_entity_id: 1n }) })
        assert.deepStrictEqual(respawned, [new Vec3(0.5, 12, 0.5), new Vec3(3.5, 20, -4.5), true, false])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('creates the player on start_game, standing nowhere yet', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec, { username: 'Walker' })
      server.send('start_game', { runtime_entity_id: 7n })
      await driver.frame(0)
      const { id, type, name, username, height, width, onGround, velocity, isCollidedHorizontally, isCollidedVertically } = bot.entity
      assert.deepStrictEqual({ id, type, name, username, height, width, onGround, velocity, isCollidedHorizontally, isCollidedVertically }, {
        id: 7, type: 'player', name: 'player', username: 'Walker', height: 1.8, width: 0.6, onGround: false, velocity: new Vec3(0, 0, 0), isCollidedHorizontally: false, isCollidedVertically: false
      })
    })

    it('is moved by the move_player of its runtime id\'s low 32 bits only, in the packet pass', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      let forced = 0
      bot.on('forcedMove', () => { forced++ })
      server.send('move_player', { runtime_id: 1, position: { x: 5.5, y: 13.6200103759765625, z: 5.5 } })
      server.send('start_game', { runtime_entity_id: (1n << 32n) + 1n, player_position: { x: 0.5, y: 13.6200103759765625, z: 0.5 } })
      server.send('move_player', { runtime_id: 2, position: { x: 2.5, y: 13.6200103759765625, z: 2.5 } })
      await driver.frame(0)
      assert.deepStrictEqual([bot.entity.position, forced], [new Vec3(0.5, 12, 0.5), 0])
      server.send('move_player', { runtime_id: 1, position: { x: 1.5, y: 33.6200103759765625, z: -1.5 }, yaw: 180, pitch: 90, mode: 'reset', on_ground: true })
      await driver.frame(0)
      assert.deepStrictEqual([bot.entity.position, bot.entity.yaw, bot.entity.pitch, bot.entity.onGround, forced], [new Vec3(1.5, 32, -1.5), 0, -Math.PI / 2, true, 1])
    })

    it('is moved by the move_player of a runtime id whose low 32 bits are a negative int32, as the codec reads the varint', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      let forced = 0
      bot.on('forcedMove', () => { forced++ })
      server.send('start_game', { runtime_entity_id: (1n << 32n) + 0x80000001n, player_position: { x: 0.5, y: 13.6200103759765625, z: 0.5 } })
      server.send('move_player', { runtime_id: -2147483647, position: { x: 1.5, y: 33.6200103759765625, z: -1.5 } })
      await driver.frame(0)
      assert.deepStrictEqual([bot.entity.position, forced], [new Vec3(1.5, 32, -1.5), 1])
    })

    it('is only turned by a move_player of the rotation mode, a look done before it notwithstanding: there is nothing to answer', async () => {
      const testBot = await bedrockTestBot(codec)
      const { bot, internal, server, driver } = testBot
      await new ServerWorld(server).join(testBot)
      const looked = bot.look(0, 0.5)
      await driver.ticks(2)
      await looked
      let forced = 0
      bot.on('forcedMove', () => { forced++ })
      server.send('move_player', { runtime_id: 1, position: { x: 9.5, y: 50, z: 9.5 }, yaw: 90, pitch: 0, mode: 'rotation' })
      await driver.ticks(2)
      const tick = internal._core.tick ?? -1
      const answers = [server.authInput(tick - 1), server.authInput(tick)].map(answer => [answer.position, answer.yaw, answer.pitch, inputFlags(answer).set])
      assert.deepStrictEqual(answers, Array(2).fill([{ x: 0.5, y: 13.6200103759765625, z: 0.5 }, 90, 0, ['block_breaking_delay_enabled']]))
      assert.deepStrictEqual([bot.entity.position, bot.entity.yaw, bot.entity.pitch, forced], [new Vec3(0.5, 12, 0.5), Math.PI / 2, 0, 0])
    })

    it('emits move at the end of a tick whose auth input reported another position or rotation, with the feet before: x, z or the pitch alone too', async () => {
      const testBot = await bedrockTestBot(codec)
      const { bot, server, driver } = testBot
      await new ServerWorld(server).join(testBot)
      const moves: string[] = []
      bot.on('move', previous => { moves.push(previous.toString()) })
      server.send('move_player', { runtime_id: 1, position: { x: 1.5, y: 13.6200103759765625, z: 0.5 } })
      await driver.tick()
      server.send('move_player', { runtime_id: 1, position: { x: 1.5, y: 13.6200103759765625, z: 1.5 } })
      await driver.tick()
      bot.look(Math.PI, -0.5).catch(() => {})
      await driver.ticks(3)
      assert.deepStrictEqual(moves, ['(0.5, 12, 0.5)', '(1.5, 12, 0.5)', '(1.5, 12, 1.5)'])
    })

    it('answers in its first auth input a teleport from before the player showed, the last of a frame\'s, with the eye the server gave', async () => {
      const { server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      world.column(0, 0)
      await world.sendColumn(0, 0)
      world.spawn()
      server.send('move_player', { runtime_id: 1, position: { x: 0.5, y: 43.6200103759765625, z: 0.5 }, mode: 'teleport', teleport: { cause: 'command', source_entity_type: 1 } })
      server.send('move_player', { runtime_id: 1, position: { x: 0.5, y: 0.5007399916648865, z: 0.5 }, mode: 'teleport', teleport: { cause: 'unknown', source_entity_type: 0 } })
      await driver.ticks(3)
      assert.deepStrictEqual(server.inTick(1), [])
      assert.deepStrictEqual([sentIn(server, 2), inputFlags(server.authInput(2)).set], [[['player_auth_input', 'client_camera_aim_assist', 'subchunk_request'], { x: 0.5, y: 0.5007399916648865, z: 0.5 }], ['handled_teleport', 'block_breaking_delay_enabled']])
      // the eye over the feet, as floats: one float off this eye
      assert.deepStrictEqual([sentIn(server, 3), inputFlags(server.authInput(3)).set], [[['player_auth_input'], { x: 0.5, y: 0.5007399320602417, z: 0.5 }], ['block_breaking_delay_enabled']])
    })
  })
})
