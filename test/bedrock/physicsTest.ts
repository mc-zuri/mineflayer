import assert from 'assert'
import prismarineRegistry from 'prismarine-registry'
import { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion, ControlState } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { AuthInput, TestBot } from './common/server.ts'
import { eyeOf, ServerWorld } from './common/world.ts'
import type { BlockAt, Point3 } from './common/world.ts'

// The physics move the local player every tick, and the auth input reports where they left it (the eye, the delta) and
// what they did (a start, a stop, a collision), as the vanilla client of each version reports it: the values are the
// recorded ones, the same on every version unless a group says otherwise. The physics' own rules are
// prismarine-physics' tests; these follow them through the bot. The player joins with its feet at (0.5, 12, 30.5) on a
// stone floor, looking south (yaw 0), as the recordings stand it, and is let stand a tick before each case.

const FEET = Object.freeze({ x: 0.5, y: 12, z: 30.5 })
/** the eye of the feet standing on the floor */
const STANDING_Y = 13.6200103759765625
const STANDING_DY = -0.07840000092983246

/** the jump in place, from the tick it starts to the landing */
const JUMP_Y = Object.freeze([14.040010452270508, 14.373210906982422, 14.621346473693848, 14.78611946105957, 14.869196891784668, 14.872213363647461, 14.796769142150879, 14.644433975219727, 14.41674518585205, 14.11521053314209, 13.74130630493164, STANDING_Y])
const JUMP_DY = Object.freeze([0.33319997787475586, 0.2481359988451004, 0.16477328538894653, 0.0830778256058693, 0.0030162709299474955, -0.0754440575838089, -0.15233518183231354, -0.2276884764432907, -0.3015347123146057, -0.3739040195941925, -0.4448259472846985, STANDING_DY])

/** the eye of the feet at y 32, where the fall starts */
const TELEPORTED_Y = 33.62001037597656
/** the fall from a teleport of the feet to y 32, from the tick after the auth input that answers it to the landing */
const FALL_Y = Object.freeze([TELEPORTED_Y, 33.54161071777344, 33.38637924194336, 33.15584945678711, 32.851531982421875, 32.47490310668945, 32.02740478515625, 31.510456085205078, 30.925447463989258, 30.273738861083984, 29.556663513183594, 28.775529861450195, 27.93161964416504, 27.026187896728516, 26.06046485900879, 25.035655975341797, 23.952943801879883, 22.81348419189453, 21.6184139251709, 20.368844985961914, 19.065868377685547, 17.71055030822754, 16.303937911987305, 14.84705924987793, STANDING_Y])
const FALL_DY = Object.freeze([STANDING_DY, -0.1552319973707199, -0.2305273562669754, -0.30431681871414185, -0.3766304850578308, -0.4474978744983673, -0.5169479250907898, -0.585008978843689, -0.6517087817192078, -0.7170746326446533, -0.7811331152915955, -0.8439104557037354, -0.9054322242736816, -0.9657235741615295, -1.0248091220855713, -1.082713007926941, -1.1394587755203247, -1.195069670677185, -1.2495683431625366, -1.3029770851135254, -1.3553175926208496, -1.4066113233566284, -1.4568791389465332, -1.50614166259765625, STANDING_DY])

interface Joined extends TestBot {
  world: ServerWorld
}

/** a bot joined at FEET (and `blocks` besides the floor), standing a tick */
async function joined (version: BedrockVersion, blocks: readonly BlockAt[] = []): Promise<Joined> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { blocks })
  await world.join(testBot, { feet: FEET })
  await testBot.driver.tick()
  return { ...testBot, world }
}

function tickOf ({ internal }: TestBot): number {
  return internal._core.tick ?? -1
}

/** holds `keys` (and nothing else) for a tick: that tick's auth input */
async function holding (testBot: TestBot, keys: readonly ControlState[]): Promise<AuthInput> {
  testBot.bot.clearControlStates()
  for (const control of keys) testBot.bot.setControlState(control, true)
  await testBot.driver.tick()
  return testBot.server.authInput(tickOf(testBot))
}

function teleportTo ({ server }: TestBot, eye: Point3, onGround: boolean): void {
  server.send('move_player', { runtime_id: 1, position: eye, mode: 'teleport', on_ground: onGround, teleport: { cause: 'command', source_entity_type: 1 } })
}

/** what the bot sent in tick `tick` before its auth input */
function besides ({ server }: TestBot, tick: number): Array<[string, object]> {
  const sent = server.batches.flat().filter(packet => packet.tick === tick && packet.phase === 'T3')
  const input = sent.findIndex(packet => packet.name === 'player_auth_input')
  return sent.slice(0, input).map(packet => [packet.name, packet.params])
}

function flagsOf (input: AuthInput): string[] {
  return inputFlags(input).set
}

/** the landing move_player the vanilla client sends up to 1.20.40, at the eye over FEET */
const LANDED: [string, object] = ['move_player', { runtime_id: 1, position: { x: 0.5, y: STANDING_Y, z: 30.5 }, pitch: 0, yaw: 0, head_yaw: 0, mode: 'normal', on_ground: true, ridden_runtime_id: 0, tick: 0n }]

interface JumpAndFall {
  /** the auth inputs of the jump: its y and dy, and the flags of its first two */
  jump: { y: number[], dy: number[], flags: [string[], string[]] }
  /** what came before the auth inputs of the jump's first tick and of its landing */
  jumpBesides: [Array<[string, object]>, Array<[string, object]>]
  /** the auth input answering the teleport: its y, dy and flags; then the fall's y and dy, and its landing's flags */
  fall: { answer: [number, number, string[]], y: number[], dy: number[], landing: string[] }
  fallBesides: Array<[string, object]>
}

/** the player jumps (the key pressed a tick), lands, stands, then is teleported 20 blocks up and falls */
async function jumpAndFall (version: BedrockVersion): Promise<JumpAndFall> {
  const testBot = await joined(version)
  const start = tickOf(testBot) + 1
  await holding(testBot, ['jump'])
  await holding(testBot, [])
  await testBot.driver.ticks(JUMP_Y.length - 2)
  const jumped = JUMP_Y.map((_, index) => testBot.server.authInput(start + index))
  await holding(testBot, [])
  teleportTo(testBot, eyeOf({ x: 0.5, y: 32, z: 30.5 }), true)
  const answer = await holding(testBot, [])
  await testBot.driver.ticks(FALL_Y.length)
  const fallen = FALL_Y.map((_, index) => testBot.server.authInput(Number(answer.tick) + 1 + index))
  const landing = fallen[fallen.length - 1]
  assert.ok(landing !== undefined)
  return {
    jump: { y: jumped.map(input => input.position.y), dy: jumped.map(input => input.delta.y), flags: [flagsOf(testBot.server.authInput(start)), flagsOf(testBot.server.authInput(start + 1))] },
    jumpBesides: [besides(testBot, start), besides(testBot, start + JUMP_Y.length - 1)],
    fall: { answer: [answer.position.y, answer.delta.y, flagsOf(answer)], y: fallen.map(input => input.position.y), dy: fallen.map(input => input.delta.y), landing: flagsOf(landing) },
    fallBesides: besides(testBot, Number(landing.tick))
  }
}

/** a jump and a fall, as recorded, with the flags and the packets before the auth inputs of a version group */
function jumpedAndFell (jumpFlags: [string[], string[]], jumpBesides: [Array<[string, object]>, Array<[string, object]>], answerFlags: string[], landingFlags: string[], fallBesides: Array<[string, object]>): JumpAndFall {
  return {
    jump: { y: [...JUMP_Y], dy: [...JUMP_DY], flags: jumpFlags },
    jumpBesides,
    fall: { answer: [TELEPORTED_Y, 0, answerFlags], y: [...FALL_Y], dy: [...FALL_DY], landing: landingFlags },
    fallBesides
  }
}

/** the player_action by which the vanilla client of 1.16.201 tells what a tick started (later ones: by flags) */
function actionOf (action: 'start_sprint' | 'stop_sprint' | 'start_sneak' | 'stop_sneak' | 'jump'): [string, object] {
  return ['player_action', { runtime_entity_id: 1, action, position: { x: 0, y: 0, z: 0 }, face: 0 }]
}

describe('bedrock physics', () => {
  describe('servers told of a jump by player_action, landings by move_player (1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: jumps and falls as recorded, sending player_action jump before the jump's auth input and move_player before a landing's`, async () => {
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['north_jump', 'jump_down', 'jumping', 'want_up'], []], [[actionOf('jump')], [LANDED]], [], [], [LANDED]))
      })
    }
  })

  describe('servers told of a jump by its flag, landings by move_player (1.16.210 – 1.19.50)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.19.50')) {
      it(`bedrock ${version}: jumps and falls as recorded, sending move_player before a landing's auth input`, async () => {
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['north_jump', 'jump_down', 'jumping', 'want_up', 'start_jumping'], []], [[], [LANDED]], [], [], [LANDED]))
      })
    }
  })

  describe('servers told of a teleport answered by its flag, landings by move_player (1.19.60 – 1.20.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.60', 'bedrock_1.20.40')) {
      it(`bedrock ${version}: jumps and falls as recorded, sending move_player before a landing's auth input`, async () => {
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['north_jump', 'jump_down', 'jumping', 'want_up', 'start_jumping'], []], [[], [LANDED]], ['handled_teleport'], [], [LANDED]))
      })
    }
  })

  describe('servers told of a landing by the auth input alone (1.20.50 – 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.50', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: jumps and falls as recorded`, async () => {
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['north_jump', 'jump_down', 'jumping', 'want_up', 'start_jumping'], []], [[], []], ['handled_teleport'], [], []))
      })
    }
  })

  describe('servers reading no north jump, and that block breaking is delayed (1.21.0 – 1.21.20)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.0', 'bedrock_1.21.20')) {
      it(`bedrock ${version}: jumps and falls as recorded`, async () => {
        const delayed = 'block_breaking_delay_enabled'
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['jump_down', 'jumping', 'want_up', 'start_jumping', delayed], [delayed]], [[], []], ['handled_teleport', delayed], [delayed], []))
      })
    }
  })

  describe('servers reading the collisions (1.21.30 – 1.21.42)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.30', 'bedrock_1.21.42')) {
      it(`bedrock ${version}: jumps and falls as recorded, the ground hit from below, and still under the teleport's answer`, async () => {
        const delayed = 'block_breaking_delay_enabled'
        const answered = ['handled_teleport', delayed, 'vertical_collision']
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell([['jump_down', 'jumping', 'want_up', 'start_jumping', delayed], [delayed]], [[], []], answered, [delayed, 'vertical_collision'], []))
      })
    }
  })

  describe('servers reading the jump key as pressed, held and released too (1.21.50+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.50')) {
      it(`bedrock ${version}: jumps and falls as recorded`, async () => {
        const delayed = 'block_breaking_delay_enabled'
        const answered = ['handled_teleport', delayed, 'vertical_collision']
        const jumpFlags: [string[], string[]] = [['jump_down', 'jumping', 'want_up', 'start_jumping', delayed, 'jump_pressed_raw', 'jump_current_raw'], [delayed, 'jump_released_raw']]
        assert.deepStrictEqual(await jumpAndFall(version), jumpedAndFell(jumpFlags, [[], []], answered, [delayed, 'vertical_collision'], []))
      })
    }
  })

  /** bot.entity's collisions, and whether it stands on the ground */
  function collisionsOf ({ bot }: TestBot): [boolean, boolean, boolean] {
    return [bot.entity.isCollidedHorizontally, bot.entity.isCollidedVertically, bot.entity.onGround]
  }

  /**
   * walks south into stone at z 32: each auth input's z, dz and whether it reports the collision; then bot.entity's
   * collisions, and in a tick held after (a held player moves into nothing)
   */
  async function intoWall (version: BedrockVersion): Promise<[number[], number[], boolean[], [boolean, boolean, boolean], [boolean, boolean, boolean]]> {
    const testBot = await joined(version, [[0, 12, 32, 'stone'], [0, 13, 32, 'stone']])
    const inputs: AuthInput[] = []
    for (let i = 0; i < 8; i++) inputs.push(await holding(testBot, ['forward']))
    const walking = collisionsOf(testBot)
    testBot.bot.physicsEnabled = false
    await holding(testBot, ['forward'])
    return [inputs.map(input => input.position.z), inputs.map(input => input.delta.z), inputs.map(input => flagsOf(input).includes('horizontal_collision')), walking, collisionsOf(testBot)]
  }

  /** the recorded walk south, stopped by the stone: its feet 0.3 before it */
  const WALL_Z = [30.597999572753906, 30.749507904052734, 30.93023109436035, 31.12690544128418, 31.3322906494140625, 31.542430877685547, 31.700000762939453, 31.700000762939453]
  const WALL_DZ = [0.053508009761571884, 0.08272338658571243, 0.09867499023675919, 0.1073845624923706, 0.1121399849653244, 0.11473644524812698, 0, 0]

  describe('servers reading no collision flags (up to 1.21.20)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.21.20')) {
      it(`bedrock ${version}: walks into a wall and stops`, async () => {
        assert.deepStrictEqual(await intoWall(version), [WALL_Z, WALL_DZ, Array(8).fill(false), [true, true, true], [false, false, true]])
      })
    }
  })

  describe('servers reading the horizontal collision (1.21.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.30')) {
      it(`bedrock ${version}: walks into a wall and stops, reporting it from the tick it is stopped`, async () => {
        assert.deepStrictEqual(await intoWall(version), [WALL_Z, WALL_DZ, [false, false, false, false, false, false, true, true], [true, true, true], [false, false, true]])
      })
    }
  })

  /** the eye of the feet standing on a bottom slab on the floor */
  const SLAB_Y = 14.1200103759765625

  /** a bottom slab of smooth stone, by its name in the version */
  function slabOf (version: BedrockVersion): string {
    const { blocksByName } = prismarineRegistry(version)
    const name = ['smooth_stone_slab', 'stone_block_slab', 'stone_slab'].find(name => blocksByName[name] !== undefined)
    assert.ok(name !== undefined)
    return name
  }

  interface SteppedUp {
    /** the auth inputs of the 6th to 12th ticks: the player steps up in the 7th */
    y: number[]
    dy: number[]
    /** another player, held in the tick after its step: that tick's y, and bot.entity's feet y and collisions */
    held: [number, number, boolean, boolean]
  }

  /** walks south onto a bottom slab at z 32, as recorded */
  async function upSlab (version: BedrockVersion): Promise<SteppedUp> {
    const slab: BlockAt[] = [[0, 12, 32, slabOf(version)]]
    const walking = await joined(version, slab)
    const inputs: AuthInput[] = []
    for (let i = 0; i < 12; i++) inputs.push(await holding(walking, ['forward']))
    const stepped = inputs.slice(5)
    const held = await joined(version, slab)
    for (let i = 0; i < 7; i++) await holding(held, ['forward'])
    held.bot.physicsEnabled = false
    const heldInput = await holding(held, ['forward'])
    const [isCollidedHorizontally, isCollidedVertically] = collisionsOf(held)
    return { y: stepped.map(input => input.position.y), dy: stepped.map(input => input.delta.y), held: [heldInput.position.y, held.bot.entity.position.y, isCollidedHorizontally, isCollidedVertically] }
  }

  /** a step up, as recorded: the eyes reported from the tick before the step; and the held tick's eye over the feet */
  function steppedUp (y: number[]): SteppedUp {
    return { y, dy: Array(7).fill(STANDING_DY), held: [SLAB_Y, 12.5, false, false] }
  }

  describe('servers told of a step up by the eye sliding up it, 0.6 of what is left each tick (1.16.201 – 1.16.220)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.220')) {
      it(`bedrock ${version}: steps up a slab, its tick reporting the eye where it was; held, the eye over the feet`, async () => {
        assert.deepStrictEqual(await upSlab(version), steppedUp([STANDING_Y, STANDING_Y, 13.920010566711426, 14.040010452270508, 14.088010787963867, 14.107210159301758, 14.114890098571777]))
      })

      it(`bedrock ${version}: lands from a jump off the step while the eye still slides, sending move_player at the eye the auth input reports`, async () => {
        const testBot = await joined(version, [[0, 12, 32, slabOf(version)]])
        for (let i = 0; i < 7; i++) await holding(testBot, ['forward'])
        await holding(testBot, ['forward', 'jump'])
        await testBot.driver.runUntil(() => testBot.bot.entity.onGround, 40)
        const input = testBot.server.authInput(tickOf(testBot))
        const { x, y, z } = testBot.bot.entity.position
        assert.deepStrictEqual([besides(testBot, tickOf(testBot)), input.position.y < eyeOf({ x, y, z }).y], [[['move_player', { ...LANDED[1], position: input.position }]], true])
      })
    }
  })

  describe('servers told of a step up a tick late: its tick reports the eye over the feet it started from (1.17.0 – 1.20.61)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.17.0', 'bedrock_1.20.61')) {
      it(`bedrock ${version}: steps up a slab, reporting it the tick after; held in that tick, the eye over the feet`, async () => {
        assert.deepStrictEqual(await upSlab(version), steppedUp([STANDING_Y, STANDING_Y, SLAB_Y, SLAB_Y, SLAB_Y, SLAB_Y, SLAB_Y]))
      })
    }
  })

  describe('servers told of a step up on its tick (1.20.71+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.71')) {
      it(`bedrock ${version}: steps up a slab, reporting it on its tick; held after, the eye over the feet`, async () => {
        assert.deepStrictEqual(await upSlab(version), steppedUp([STANDING_Y, SLAB_Y, SLAB_Y, SLAB_Y, SLAB_Y, SLAB_Y, SLAB_Y]))
      })
    }
  })

  /** the sprint's flags (and the forward key's) among those of an auth input */
  function sprintFlags (input: AuthInput): string[] {
    return flagsOf(input).filter(flag => ['up', 'sprint_down', 'sprinting', 'start_sprinting', 'stop_sprinting'].includes(flag))
  }

  /** sprints south two ticks, then lets go: the auth inputs' z and sprint flags, and what came before each */
  async function sprinting (version: BedrockVersion): Promise<Array<[number, string[], Array<[string, object]>]>> {
    const testBot = await joined(version)
    const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
    return inputs.map(input => [input.position.z, sprintFlags(input), besides(testBot, Number(input.tick))])
  }

  describe('servers told of a sprint by player_action (1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: sprints from its first tick, sending start_sprint and stop_sprint before the auth inputs`, async () => {
        assert.deepStrictEqual(await sprinting(version), [
          [30.627399444580078, ['sprint_down', 'up', 'sprinting'], [actionOf('start_sprint')]],
          [30.824359893798828, ['sprint_down', 'up', 'sprinting'], []],
          [30.9319000244140625, [], [actionOf('stop_sprint')]]
        ])
      })

      it(`bedrock ${version}: writes in them the low 32 bits of the player's runtime id, and the look`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        await new ServerWorld(testBot.server).join(testBot, { feet: FEET, rotation: { yaw: -90, pitch: 30 }, game: { runtime_entity_id: (1n << 32n) + 7n } })
        await testBot.driver.tick()
        const start = tickOf(testBot) + 1
        await holding(testBot, ['jump'])
        await holding(testBot, [])
        await testBot.driver.ticks(JUMP_Y.length - 2)
        assert.deepStrictEqual([besides(testBot, start), besides(testBot, start + JUMP_Y.length - 1)], [
          [['player_action', { runtime_entity_id: 7, action: 'jump', position: { x: 0, y: 0, z: 0 }, face: 0 }]],
          [['move_player', { ...LANDED[1], runtime_id: 7, pitch: 30, yaw: -90, head_yaw: -90 }]]
        ])
      })

      it(`bedrock ${version}: sends the actions of a tick in the order it took them: the sprint's, then the jump`, async () => {
        const testBot = await joined(version)
        const input = await holding(testBot, ['forward', 'sprint', 'jump'])
        assert.deepStrictEqual(besides(testBot, Number(input.tick)), [actionOf('start_sprint'), actionOf('jump')])
      })
    }
  })

  for (const [range, versions] of [['1.16.210 – 1.20.50', bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.20.50')], ['1.21.0+', bedrockTestVersionsFrom('bedrock_1.21.0')]] as const) {
    describe(`servers told of a sprint by its flags, which speeds the player from its first tick (${range})`, () => {
      for (const version of versions) {
        it(`bedrock ${version}: sprints from its first tick`, async () => {
          assert.deepStrictEqual(await sprinting(version), [
            [30.627399444580078, ['sprint_down', 'up', 'sprinting', 'start_sprinting'], []],
            [30.824359893798828, ['sprint_down', 'up', 'sprinting'], []],
            [30.9319000244140625, ['stop_sprinting'], []]
          ])
        })
      }
    })
  }

  describe('servers whose sprint speeds the player from its second tick (1.20.61 – 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.61', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: walks the first tick of a sprint`, async () => {
        assert.deepStrictEqual(await sprinting(version), [
          [30.597999572753906, ['sprint_down', 'up', 'sprinting', 'start_sprinting'], []],
          [30.778907775878906, ['sprint_down', 'up', 'sprinting'], []],
          [30.877683639526367, ['stop_sprinting'], []]
        ])
      })
    }
  })

  /** the sneak's flags (and the forward key's) among those of an auth input */
  function sneakFlags (input: AuthInput): string[] {
    return flagsOf(input).filter(flag => !['block_breaking_delay_enabled', 'vertical_collision'].includes(flag))
  }

  /** sneaks south a tick, then walks two: the auth inputs' z, move vectors and flags, and what came before them */
  async function sneaking (version: BedrockVersion): Promise<Array<[number, AuthInput['move_vector'], AuthInput['raw_move_vector'], string[], Array<[string, object]>]>> {
    const testBot = await joined(version)
    const inputs = [await holding(testBot, ['forward', 'sneak']), await holding(testBot, ['forward']), await holding(testBot, ['forward'])]
    return inputs.map(input => [input.position.z, input.move_vector, input.raw_move_vector, sneakFlags(input), besides(testBot, Number(input.tick))])
  }

  /** a move of 0.3 forward: sneaking, and on the tick the sneak key is released */
  const SNEAK_MOVE = Object.freeze({ x: 0, z: 0.30000001192092896 })
  const FORWARD = Object.freeze({ x: 0, z: 1 })

  describe('servers told of a sneak by player_action (1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: sneaks, the move scaled on the tick the key is released too`, async () => {
        assert.deepStrictEqual(await sneaking(version), [
          [30.529399871826172, SNEAK_MOVE, undefined, ['sneaking', 'sneak_down', 'up', 'want_down'], [actionOf('start_sneak')]],
          [30.574851989746094, SNEAK_MOVE, undefined, ['up'], [actionOf('stop_sneak')]],
          [30.697668075561523, FORWARD, undefined, ['up'], []]
        ])
      })
    }
  })

  describe('servers told of a sneak by its flags (1.16.210 – 1.21.42)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.21.42')) {
      it(`bedrock ${version}: sneaks, the move scaled on the tick the key is released too`, async () => {
        assert.deepStrictEqual(await sneaking(version), [
          [30.529399871826172, SNEAK_MOVE, undefined, ['sneaking', 'sneak_down', 'up', 'want_down', 'start_sneaking'], []],
          [30.574851989746094, SNEAK_MOVE, undefined, ['up', 'stop_sneaking'], []],
          [30.697668075561523, FORWARD, undefined, ['up'], []]
        ])
      })
    }
  })

  describe('servers reading the raw move vector and the sneak key as pressed, held and released (1.21.50+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.50')) {
      it(`bedrock ${version}: sneaks, the move scaled on the tick the key is released too, the raw move not`, async () => {
        assert.deepStrictEqual(await sneaking(version), [
          [30.529399871826172, SNEAK_MOVE, FORWARD, ['sneaking', 'sneak_down', 'up', 'want_down', 'start_sneaking', 'sneak_pressed_raw', 'sneak_current_raw'], []],
          [30.574851989746094, SNEAK_MOVE, FORWARD, ['up', 'stop_sneaking', 'sneak_released_raw'], []],
          [30.697668075561523, FORWARD, FORWARD, ['up'], []]
        ])
      })
    }
  })

  /**
   * a cell the bot does not know is solid below the section of the feet, and air from it up: a player teleported to
   * feet y 40 (section 2), in a column not sent or whose sections were not answered, lands on y 32
   */
  async function landsOnUnknown (testBot: Joined, x: number): Promise<[Vec3, boolean, number]> {
    teleportTo(testBot, eyeOf({ x, y: 40, z: 30.5 }), false)
    await testBot.driver.tick()
    await testBot.driver.runUntil(() => testBot.bot.entity.onGround, 40)
    const below = testBot.bot.blockAt(new Vec3(x, 31, 30.5))
    await testBot.driver.ticks(2)
    return [testBot.bot.entity.position, below === null, testBot.server.authInput(tickOf(testBot)).delta.y]
  }

  describe('servers sending whole columns (up to 1.17.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40')) {
      it(`bedrock ${version}: stands the player on the section below its feet' in a column it was not sent`, async () => {
        assert.deepStrictEqual(await landsOnUnknown(await joined(version), 100.5), [new Vec3(100.5, 32, 30.5), true, STANDING_DY])
      })
    }
  })

  describe('servers sending columns without their sections (1.18.0+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0')) {
      it(`bedrock ${version}: stands the player on the section below its feet' in a column it was not sent, or whose sections it has no answer for`, async () => {
        const testBot = await joined(version)
        const notSent = await landsOnUnknown(testBot, 100.5)
        testBot.world.column(4, 1, [])
        await testBot.world.sendColumn(4, 1)
        assert.deepStrictEqual([notSent, await landsOnUnknown(testBot, 70.5)], [[new Vec3(100.5, 32, 30.5), true, STANDING_DY], [new Vec3(70.5, 32, 30.5), true, STANDING_DY]])
      })
    }
  })

  interface CorrectedFall {
    /** the auth inputs of the 6th to 8th ticks after the teleport's answer: their y and dy, and the 7th's z */
    y: number[]
    dy: number[]
    z: number
    /** the feet (x, z) of the 4th to 6th ticks: as their auth inputs reported them, and as the ring keeps them after */
    sent: Array<[number, number]>
    kept: Array<[number, number] | undefined>
    rewinds: number
    replayedTicks: number
  }

  /**
   * falls from a teleport of the feet to y 32, forward held in the 4th and 5th ticks after the auth input that answers it;
   * then the server says the player was where the teleport put it, standing still, after the 3rd
   */
  async function correctedMidFall (version: BedrockVersion): Promise<CorrectedFall> {
    const testBot = await joined(version)
    const { server, driver, internal } = testBot
    teleportTo(testBot, eyeOf({ x: 0.5, y: 32, z: 30.5 }), false)
    const answered = Number((await holding(testBot, [])).tick)
    await driver.ticks(3)
    await holding(testBot, ['forward'])
    await holding(testBot, ['forward'])
    await holding(testBot, [])
    const walked = [answered + 4, answered + 5, answered + 6]
    const sent = walked.map((tick): [number, number] => [server.authInput(tick).position.x, server.authInput(tick).position.z])
    server.send('correct_player_move_prediction', { position: eyeOf({ x: 0.5, y: 32, z: 30.5 }), delta: { x: 0, y: 0, z: 0 }, on_ground: false, tick: BigInt(answered + 3) })
    await holding(testBot, [])
    await driver.tick()
    const inputs = [answered + 6, answered + 7, answered + 8].map(tick => server.authInput(tick))
    const kept = walked.map((tick): [number, number] | undefined => {
      const feet = internal._player.corrections.history.get(tick)?.snapshot.position
      return feet === undefined ? undefined : [feet.x, feet.z]
    })
    const { rewinds, replayedTicks } = internal._player.corrections.stats
    return { y: inputs.map(input => input.position.y), dy: inputs.map(input => input.delta.y), z: server.authInput(answered + 7).position.z, sent, kept, rewinds, replayedTicks }
  }

  describe('servers of the server movement authority, which correct the player at once (up to 1.21.60, as recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.21.60')) {
      it(`bedrock ${version}: falls again from where a correction puts it, the ring started again`, async () => {
        const { y, dy, z, kept, rewinds, replayedTicks } = await correctedMidFall(version)
        assert.deepStrictEqual({ y, dy, z, kept, rewinds, replayedTicks }, {
          y: [FALL_Y[5], FALL_Y[0], FALL_Y[1]], dy: [FALL_DY[5], FALL_DY[0], FALL_DY[1]], z: 30.5, kept: [undefined, undefined, undefined], rewinds: 0, replayedTicks: 0
        })
      })
    }
  })

  describe('servers of a movement authority with rewind (1.21.70+, as recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.70')) {
      it(`bedrock ${version}: plays the fall again from the tick a correction names, on the keys each tick read, in the next tick`, async () => {
        const { y, dy, sent, kept, rewinds, replayedTicks } = await correctedMidFall(version)
        assert.deepStrictEqual({ y, dy, kept, rewinds, replayedTicks }, { y: [FALL_Y[5], FALL_Y[3], FALL_Y[4]], dy: [FALL_DY[5], FALL_DY[3], FALL_DY[4]], kept: sent, rewinds: 1, replayedTicks: 3 })
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('holds the player while physicsEnabled is false, standing still and reporting no key nor move, but keeping a tap for the auth input after: set, it acts from the next frame', async () => {
      const testBot = await joined(version)
      const { bot, internal, server, driver } = testBot
      teleportTo(testBot, eyeOf({ x: 0.5, y: 32, z: 30.5 }), false)
      // the answer and two ticks of the fall
      await driver.ticks(3)
      bot.physicsEnabled = false
      const read = bot.physicsEnabled
      bot.setControlState('forward', true)
      bot.setControlState('jump', true)
      bot.setControlState('jump', false)
      await driver.ticks(3)
      const { position, delta, move_vector: moveVector, camera_orientation: camera } = server.authInput(tickOf(testBot))
      const held = [read, position, delta, moveVector, camera, flagsOf(server.authInput(tickOf(testBot))), bot.entity.position, internal._player.corrections.history.get(tickOf(testBot))?.input]
      // set in the first tick of a frame of two: the second is held still
      bot.once('physicsTick', () => { bot.physicsEnabled = true })
      await driver.frame(100)
      await driver.tick()
      const [stillHeld, moving] = [server.authInput(tickOf(testBot) - 1), server.authInput(tickOf(testBot))]
      assert.deepStrictEqual(held, [false, { x: 0.5, y: FALL_Y[1], z: 30.5 }, { x: 0, y: 0, z: 0 }, { x: 0, z: 0 }, { x: 0, y: 0, z: 1 }, ['block_breaking_delay_enabled'], new Vec3(0.5, 31.921600341796875, 30.5), 'held'])
      assert.deepStrictEqual([bot.physicsEnabled, stillHeld.delta, moving.position, moving.delta, flagsOf(moving)], [
        true, { x: 0, y: 0, z: 0 }, { x: 0.5, y: FALL_Y[1], z: 30.519599914550781 }, { x: 0, y: STANDING_DY, z: 0.01783600077033043 }, ['up', 'block_breaking_delay_enabled', 'jump_released_raw', 'jump_pressed_raw']
      ])
    })

    it('answers a teleport without velocity, though the player jumped in that tick', async () => {
      const testBot = await joined(version)
      teleportTo(testBot, eyeOf({ x: 0.5, y: 32, z: 30.5 }), true)
      const answer = await holding(testBot, ['jump'])
      const next = await holding(testBot, [])
      assert.deepStrictEqual([answer.position.y, answer.delta, flagsOf(answer).includes('start_jumping'), next.position.y, next.delta.y], [TELEPORTED_Y, { x: 0, y: 0, z: 0 }, true, 34.040008544921875, JUMP_DY[0]])
    })

    it('starts no sprint on a second press of forward: only the sprint key starts one', async () => {
      const testBot = await joined(version)
      const inputs = [await holding(testBot, ['forward']), await holding(testBot, []), await holding(testBot, ['forward']), await holding(testBot, ['forward'])]
      assert.deepStrictEqual(inputs.map(sprintFlags), [['up'], [], ['up'], ['up']])
    })

    it('holds the player from the start with the option physicsEnabled false', async () => {
      const testBot = await bedrockTestBot(bedrockCodec(version), { physicsEnabled: false })
      await new ServerWorld(testBot.server).join(testBot, { feet: { x: 0.5, y: 20, z: 30.5 } })
      await testBot.driver.ticks(5)
      assert.deepStrictEqual([testBot.bot.physicsEnabled, testBot.bot.entity.position, testBot.server.authInput(tickOf(testBot)).delta], [false, new Vec3(0.5, 20, 30.5), { x: 0, y: 0, z: 0 }])
    })
  })
})
