import assert from 'assert'
import prismarineRegistry from 'prismarine-registry'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBotOptions, BedrockVersion, ControlState } from '../../lib/types/api/index.ts'
import { bedrockCodec, blankPacket } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { AuthInput, TestBot } from './common/server.ts'
import { eyeOf, ServerWorld } from './common/world.ts'
import type { BlockAt, Point3, Rotation, StartGame } from './common/world.ts'

// The physics move the local player every tick, and the auth input reports where they left it (the eye, the delta) and
// what they did (a start, a stop, a collision), as the vanilla client of each version reports it: the values are the
// recorded ones, the same on every version unless a group says otherwise. The physics' own rules are
// prismarine-physics' tests; these follow them through the bot. The player joins with its feet at (0.5, 12, 30.5) on a
// stone floor, looking south (yaw 0), as the recordings stand it, and is let stand a tick before each case. A play the
// server echoes the player's flags to is told against the same play without the echoes, as the recordings tell them.

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

interface Setup {
  /** besides the floor */
  blocks?: readonly BlockAt[]
  /** FEET unless given */
  feet?: Point3
  rotation?: Rotation
  game?: StartGame
  options?: Omit<BedrockBotOptions, 'version'>
}

/** a bot joined at FEET, standing a tick */
async function joined (version: BedrockVersion, { blocks = [], options = {}, ...join }: Setup = {}): Promise<Joined> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const world = new ServerWorld(testBot.server, { blocks })
  await world.join(testBot, { feet: FEET, ...join })
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
    const testBot = await joined(version, { blocks: [[0, 12, 32, 'stone'], [0, 13, 32, 'stone']] })
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
    const walking = await joined(version, { blocks: slab })
    const inputs: AuthInput[] = []
    for (let i = 0; i < 12; i++) inputs.push(await holding(walking, ['forward']))
    const stepped = inputs.slice(5)
    const held = await joined(version, { blocks: slab })
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
        const testBot = await joined(version, { blocks: [[0, 12, 32, slabOf(version)]] })
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

  /** the jump's flags (and the jump key's) among those of an auth input */
  function jumpFlags (input: AuthInput): string[] {
    return flagsOf(input).filter(flag => /jump|want_up/.test(flag))
  }

  /** a top slab of smooth stone at (x, y, z) */
  function topSlabAt (version: BedrockVersion, x: number, y: number, z: number): BlockAt {
    return [x, y, z, slabOf(version), isBedrockVersionAtLeast(version, 'bedrock_1.20.30') ? { 'minecraft:vertical_half': 'top' } : { top_slot_bit: 1 }]
  }

  /** the recorded walk against a top slab: bottom slabs in the cells at z 136 and top slabs in those at z 138, x -6 to 1 */
  function slabAndTopSlab (version: BedrockVersion): BlockAt[] {
    return [-6, -5, -4, -3, -2, -1, 0, 1].flatMap((x): BlockAt[] => [[x, 12, 136, slabOf(version)], topSlabAt(version, x, 12, 138)])
  }

  /** the recorded stairs: stone stairs up east at z 165, from (-10, 12) a block higher each block to (-6, 16) */
  const STAIRS: readonly BlockAt[] = [-10, -9, -8, -7, -6].map((x): BlockAt => [x, x + 22, 165, 'stone_stairs'])

  type Besides = Array<[number, Array<[string, object]>]>

  interface AutoJumped {
    /** the ticks whose auth inputs report a jump, and its flags */
    jumps: Array<[number, string[]]>
    /** the eyes and dy the auth inputs of the ticks picked report */
    eyes: Point3[]
    dy: number[]
    /** what came before the auth inputs, on the ticks anything did */
    besides: Besides
  }

  /** `keys` held for `walking` ticks, then nothing for `standing`, from a join as `setup` says: what the auth inputs tell */
  async function walked (version: BedrockVersion, setup: Setup, [walking, standing]: [number, number], picked: readonly number[], keys: readonly ControlState[] = ['forward']): Promise<AutoJumped> {
    const testBot = await joined(version, setup)
    const inputs: AuthInput[] = []
    for (let i = 0; i < walking + standing; i++) inputs.push(await holding(testBot, i < walking ? keys : []))
    const at = (tick: number): AuthInput => {
      const input = inputs[tick]
      assert.ok(input !== undefined)
      return input
    }
    return {
      jumps: inputs.flatMap((input, tick): Array<[number, string[]]> => jumpFlags(input).length > 0 ? [[tick, jumpFlags(input)]] : []),
      eyes: picked.map(tick => at(tick).position),
      dy: picked.map(tick => at(tick).delta.y),
      besides: inputs.flatMap((input, tick): Besides => {
        const sent = besides(testBot, Number(input.tick))
        return sent.length > 0 ? [[tick, sent]] : []
      })
    }
  }

  /** the ticks from the landing off the bottom slab to the landing of the jump against the top slab */
  const OFF_SLAB = Object.freeze([18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30])

  /**
   * forward at yaw 0 from (-2.5, 12, 134.5) for 20 ticks, up the bottom slab, off it and against the top slab, then
   * nothing for 12: as the vanilla client recorded it, jumping by itself on the 20th
   */
  async function againstTopSlab (version: BedrockVersion, options: Setup['options'] = { autoJump: true }): Promise<AutoJumped> {
    return await walked(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, options }, [20, 12], OFF_SLAB)
  }

  /** the eyes against the top slab */
  function offSlab (y: readonly number[]): Point3[] {
    return y.map(y => ({ x: -2.5, y, z: 137.6999969482422 }))
  }

  /** from the landing off the bottom slab to the landing of the jump: up to 1.16.220 the first eyes still slide */
  const SLID_OFF_SLAB_Y = [13.620001792907715, 14.040006637573242, 14.373209953308105, 14.621345520019531, ...JUMP_Y.slice(3)]
  const OFF_SLAB_Y = [STANDING_Y, ...JUMP_Y]

  /** the auto-jump against the top slab, as recorded: on the 20th tick, its eyes, flags and the packets before them */
  function jumpedAgainstTopSlab (y: readonly number[], flags: string[], besides: Besides): AutoJumped {
    return { jumps: [[19, flags]], eyes: offSlab(y), dy: [STANDING_DY, ...JUMP_DY], besides }
  }

  /** forward as against the top slab, bot.autoJump unset after the 19th tick: the 20th and 21st's jump flags and dy, and the feet */
  async function unsetAgainstTopSlab (version: BedrockVersion): Promise<[string[][], number[], Vec3]> {
    const testBot = await joined(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, options: { autoJump: true } })
    for (let i = 0; i < 19; i++) await holding(testBot, ['forward'])
    testBot.bot.autoJump = false
    const inputs = [await holding(testBot, ['forward']), await holding(testBot, ['forward'])]
    return [inputs.map(jumpFlags), inputs.map(input => input.delta.y), testBot.bot.entity.position]
  }

  /** standing against the top slab, jumping by itself no more */
  const UNSET_AGAINST_TOP_SLAB = [[[], []], [STANDING_DY, STANDING_DY], new Vec3(-2.5, 12, 137.6999969482422)]

  /** the landing move_player of the vanilla client up to 1.20.40, against the top slab */
  function landedOffSlab (y: number): [string, object] {
    return ['move_player', { ...LANDED[1], position: { x: -2.5, y, z: 137.6999969482422 } }]
  }

  /** the ticks after each jump up the stairs, and the last */
  const UP_STAIRS = Object.freeze([10, 15, 22, 39])

  /** forward at `yaw` from (-11.5, 12, 165.5) for 25 ticks, up the stairs, then nothing for 15: as recorded */
  async function upStairs (version: BedrockVersion, yaw: number): Promise<AutoJumped> {
    return await walked(version, { blocks: STAIRS, feet: { x: -11.5, y: 12, z: 165.5 }, rotation: { yaw, pitch: 0 }, options: { autoJump: true } }, [25, 15], UP_STAIRS)
  }

  /** up to 1.16.220 at yaw -90.033, as 1.16.201 recorded: the eye still slides up the step a jump left the ground by */
  const SLID_UP_STAIRS = Object.freeze([
    { x: -9.463218688964844, y: 14.407210350036621, z: 165.4988250732422 }, { x: -8.44770336151123, y: 15.405031204223633, z: 165.49826049804688 },
    { x: -6.998173713684082, y: 16.904809951782227, z: 165.49745178222656 }, { x: -6.2905473709106445, y: 18.1198787689209, z: 165.4970703125 }
  ])
  /** 1.17.0 to 1.20.80 at yaw -90.027, as 1.17.0 recorded */
  const UP_STAIRS_ON_MOVE = Object.freeze([
    { x: -9.463218688964844, y: 14.6200103759765625, z: 165.49900817871094 }, { x: -8.44770336151123, y: 15.6200103759765625, z: 165.49851989746094 },
    { x: -6.998173713684082, y: 17.1200103759765625, z: 165.49781799316406 }, { x: -6.290546417236328, y: 18.1200103759765625, z: 165.4974822998047 }
  ])
  /** from 1.21.0 at yaw -89.956, as 1.21.0 recorded: the look ahead asks for no jump onto the third step */
  const UP_STAIRS_LOOKING_AHEAD = Object.freeze([
    { x: -9.463218688964844, y: 14.6200103759765625, z: 165.5015869140625 }, { x: -8.44770336151123, y: 15.6200103759765625, z: 165.5023651123047 },
    { x: -6.919774055480957, y: 17.1200103759765625, z: 165.5035400390625 }, { x: -6.228235244750977, y: 18.1200103759765625, z: 165.5040740966797 }
  ])

  /** the walk up the stairs, as recorded: the ticks it jumps on with the flags, the eyes after, the packets before them */
  function jumpedUpStairs (jumps: readonly number[], flags: string[], eyes: readonly Point3[], besides: Besides): AutoJumped {
    return { jumps: jumps.map((tick): [number, string[]] => [tick, flags]), eyes: [...eyes], dy: Array(4).fill(STANDING_DY), besides }
  }

  /** the landing move_player of the vanilla client up to 1.20.40 the tick after each jump up the stairs, at its eye */
  function landedUpStairs (eyes: readonly Point3[], yaw: number): Besides {
    return [10, 15, 22].map((tick, index): [number, Array<[string, object]>] => [tick, [['move_player', { ...LANDED[1], position: eyes[index], yaw, head_yaw: yaw }]]])
  }

  describe('servers told of an auto-jump by player_action jump, of a landing by move_player, the eye sliding up a step (1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: jumps by itself against the top slab on its move, reporting jumping but no jump key, as recorded`, async () => {
        assert.deepStrictEqual(await againstTopSlab(version), jumpedAgainstTopSlab(SLID_OFF_SLAB_Y, ['jumping'], [
          [18, [landedOffSlab(13.620001792907715)]], [19, [actionOf('jump')]], [30, [landedOffSlab(STANDING_Y)]]
        ]))
      })

      it(`bedrock ${version}: walks up the stairs, each step its auto-jump asks for taking it off the ground, as recorded`, async () => {
        const landed = landedUpStairs(SLID_UP_STAIRS, -90.032958984375)
        const besides = [9, 14, 21].flatMap((tick, index): Besides => [[tick, [actionOf('jump')]], ...landed.slice(index, index + 1)])
        assert.deepStrictEqual(await upStairs(version, -90.032958984375), jumpedUpStairs([9, 14, 21], ['jumping'], SLID_UP_STAIRS, besides))
      })
    }
  })

  describe('servers told of an auto-jump by its flags, of a landing by move_player, the eye sliding up a step (1.16.210 – 1.16.220)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.16.220')) {
      it(`bedrock ${version}: jumps by itself against the top slab on its move, reporting jumping and start_jumping but no jump key, as recorded`, async () => {
        assert.deepStrictEqual(await againstTopSlab(version), jumpedAgainstTopSlab(SLID_OFF_SLAB_Y, ['jumping', 'start_jumping'], [
          [18, [landedOffSlab(13.620001792907715)]], [30, [landedOffSlab(STANDING_Y)]]
        ]))
      })

      it(`bedrock ${version}: walks up the stairs, each step its auto-jump asks for taking it off the ground, as recorded`, async () => {
        assert.deepStrictEqual(await upStairs(version, -90.032958984375), jumpedUpStairs([9, 14, 21], ['jumping', 'start_jumping'], SLID_UP_STAIRS, landedUpStairs(SLID_UP_STAIRS, -90.032958984375)))
      })
    }
  })

  describe('servers told of an auto-jump by its flags, of a landing by move_player (1.17.0 – 1.20.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.17.0', 'bedrock_1.20.40')) {
      it(`bedrock ${version}: jumps by itself against the top slab on its move, reporting jumping and start_jumping but no jump key, as recorded`, async () => {
        assert.deepStrictEqual(await againstTopSlab(version), jumpedAgainstTopSlab(OFF_SLAB_Y, ['jumping', 'start_jumping'], [
          [18, [landedOffSlab(STANDING_Y)]], [30, [landedOffSlab(STANDING_Y)]]
        ]))
      })

      it(`bedrock ${version}: jumps by itself up the stairs on its move into each step, as recorded`, async () => {
        assert.deepStrictEqual(await upStairs(version, -90.0274658203125), jumpedUpStairs([9, 14, 21], ['jumping', 'start_jumping'], UP_STAIRS_ON_MOVE, landedUpStairs(UP_STAIRS_ON_MOVE, -90.0274658203125)))
      })
    }
  })

  describe('servers told of an auto-jump by its flags, of a landing by the auth input alone (1.20.50 – 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.50', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: jumps by itself against the top slab on its move, reporting jumping and start_jumping but no jump key, as recorded`, async () => {
        assert.deepStrictEqual(await againstTopSlab(version), jumpedAgainstTopSlab(OFF_SLAB_Y, ['jumping', 'start_jumping'], []))
      })

      it(`bedrock ${version}: jumps by itself up the stairs on its move into each step, as recorded`, async () => {
        assert.deepStrictEqual(await upStairs(version, -90.0274658203125), jumpedUpStairs([9, 14, 21], ['jumping', 'start_jumping'], UP_STAIRS_ON_MOVE, []))
      })
    }
  })

  describe('servers whose client jumps by itself on its move into the block (1.16.201 – 1.20.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.80')) {
      it(`bedrock ${version}: walks on against the top slab without jumping once bot.autoJump is unset before its move into it`, async () => {
        assert.deepStrictEqual(await unsetAgainstTopSlab(version), UNSET_AGAINST_TOP_SLAB)
      })
    }
  })

  describe('servers whose client looks ahead for the auto-jump after its move, jumping on the next tick (1.21.0+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.0')) {
      it(`bedrock ${version}: jumps by itself against the top slab the tick after it landed there, reporting jumping and start_jumping but no jump key, as recorded`, async () => {
        assert.deepStrictEqual(await againstTopSlab(version), jumpedAgainstTopSlab(OFF_SLAB_Y, ['jumping', 'start_jumping'], []))
      })

      it(`bedrock ${version}: jumps by itself up the stairs the tick after it finds a step a block up, as recorded`, async () => {
        assert.deepStrictEqual(await upStairs(version, -89.9560775756836), jumpedUpStairs([9, 14], ['jumping', 'start_jumping'], UP_STAIRS_LOOKING_AHEAD, []))
      })

      it(`bedrock ${version}: backing into the top slab, jumps by itself looking down, but not looking away from the way it goes (not recorded: the pitch counts)`, async () => {
        const backing = async (pitch: number): Promise<AutoJumped['jumps']> => {
          const setup = { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, rotation: { yaw: 180, pitch }, options: { autoJump: true } }
          return (await walked(version, setup, [20, 12], [], ['back'])).jumps
        }
        assert.deepStrictEqual([await backing(0), await backing(90)], [[], [[19, ['jumping', 'start_jumping']]]])
      })

      it(`bedrock ${version}: drops the jump asked for by the tick it landed against the top slab when physicsEnabled holds the next, looking ahead again after`, async () => {
        const testBot = await joined(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, options: { autoJump: true } })
        for (let i = 0; i < 19; i++) await holding(testBot, ['forward'])
        testBot.bot.physicsEnabled = false
        await holding(testBot, ['forward'])
        testBot.bot.physicsEnabled = true
        const inputs = [await holding(testBot, ['forward']), await holding(testBot, ['forward'])]
        assert.deepStrictEqual(inputs.map(input => [input.position.y, jumpFlags(input)]), [[STANDING_Y, []], [JUMP_Y[0], ['jumping', 'start_jumping']]])
      })

      it(`bedrock ${version}: drops the jump asked for by the tick it landed against the top slab once bot.autoJump is unset before the next, walking on against it`, async () => {
        assert.deepStrictEqual(await unsetAgainstTopSlab(version), UNSET_AGAINST_TOP_SLAB)
      })

      it(`bedrock ${version}: holds the jump asked for by the tick it landed against the top slab in the answer to a teleport off the ground, reporting jumping but no start_jumping (not recorded)`, async () => {
        const testBot = await joined(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, options: { autoJump: true } })
        for (let i = 0; i < 19; i++) await holding(testBot, ['forward'])
        teleportTo(testBot, eyeOf({ x: -2.5, y: 14, z: 137.6999969482422 }), false)
        const answer = await holding(testBot, ['forward'])
        assert.deepStrictEqual([jumpFlags(answer), flagsOf(answer).includes('handled_teleport')], [['jumping'], true])
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

  type Echoed = Partial<Record<'sprinting' | 'sneaking', boolean>>

  /** set_entity_data of the player's flags, as the server writes it: its echo of the player's sprint and sneak */
  function echo ({ server }: TestBot, flags: Echoed, tick = 0n, runtimeId = 1n): void {
    const params = { ...blankPacket(server.codec, 'set_entity_data'), runtime_entity_id: runtimeId, metadata: [{ key: 'flags', type: 'long', value: flags }], tick }
    server.receive(server.codec.serializer.createPacketBuffer({ name: 'set_entity_data', params }))
  }

  /** the starts and stops among an auth input's flags */
  function startsAndStops (input: AuthInput): string[] {
    return flagsOf(input).filter(flag => /^(start|stop)_(sprinting|sneaking)$/.test(flag))
  }

  /** where an auth input reports the eye, and its delta */
  function motionOf ({ position, delta }: AuthInput): [Point3, Point3] {
    return [position, delta]
  }

  interface Play {
    /** the starts and stops of its auth inputs */
    told: string[][]
    /** where they report the eye, and their delta */
    moved: Array<[Point3, Point3]>
  }

  /** a play by a bot the server echoes flags to as the play says; and where the same play reports the player without */
  async function echoing (version: BedrockVersion, play: (testBot: TestBot, echo: (flags: Echoed) => void) => Promise<AuthInput[]>, setup: Setup = {}): Promise<[Play, Array<[Point3, Point3]>]> {
    const testBot = await joined(version, setup)
    const inputs = await play(testBot, flags => { echo(testBot, flags) })
    const unechoed = await play(await joined(version, setup), () => {})
    return [{ told: inputs.map(startsAndStops), moved: inputs.map(motionOf) }, unechoed.map(motionOf)]
  }

  /**
   * with the option autoJump on, forward two ticks against stone at (0, 12, 31) with a top slab a block over it (room to
   * jump onto it sneaking only), then forward and sneak a tick, `echo` sent, and forward two ticks: their auth inputs
   */
  async function sneakTappedUnderSlab (version: BedrockVersion, echo: (testBot: TestBot) => void): Promise<[TestBot, AuthInput[]]> {
    const testBot = await joined(version, { blocks: [[0, 12, 31, 'stone'], topSlabAt(version, 0, 14, 31)], options: { autoJump: true } })
    const inputs = [await holding(testBot, ['forward']), await holding(testBot, ['forward']), await holding(testBot, ['forward', 'sneak'])]
    echo(testBot)
    inputs.push(await holding(testBot, ['forward']), await holding(testBot, ['forward']))
    return [testBot, inputs]
  }

  /** the player teleported to feet y 32: the auth input answering it, then three falling with `keys` held */
  async function falling (testBot: TestBot, keys: readonly ControlState[]): Promise<AuthInput[]> {
    teleportTo(testBot, eyeOf({ x: 0.5, y: 32, z: 30.5 }), false)
    const inputs = [await holding(testBot, [])]
    for (let i = 0; i < 3; i++) inputs.push(await holding(testBot, keys))
    return inputs
  }

  describe('servers echoing the player\'s sprint and sneak unstamped, which the vanilla client takes as its own (1.16.210 – 1.21.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.21.60')) {
      it(`bedrock ${version}: stops a sprint again after an echo saying it sprints, the last echo before a tick counting, moving as without them`, async () => {
        const [echoed, unechoed] = await echoing(version, async (testBot, echo) => {
          const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
          echo({ sprinting: true })
          inputs.push(await holding(testBot, []), await holding(testBot, []))
          echo({ sprinting: true })
          echo({ sprinting: false })
          inputs.push(await holding(testBot, []))
          return inputs
        })
        assert.deepStrictEqual(echoed, { told: [['start_sprinting'], [], ['stop_sprinting'], ['stop_sprinting'], [], []], moved: unechoed })
      })

      it(`bedrock ${version}: stops a sneak again after an echo saying it sneaks, moving as without it`, async () => {
        const [echoed, unechoed] = await echoing(version, async (testBot, echo) => {
          const inputs = [await holding(testBot, ['forward', 'sneak']), await holding(testBot, [])]
          echo({ sneaking: true })
          inputs.push(await holding(testBot, []), await holding(testBot, []))
          return inputs
        })
        assert.deepStrictEqual(echoed, { told: [['start_sneaking'], ['stop_sneaking'], ['stop_sneaking'], []], moved: unechoed })
      })

      it(`bedrock ${version}: starts a sprint again while falling, the key held, after an echo saying it does not sprint, as fast as its sprint`, async () => {
        const [echoed, unechoed] = await echoing(version, async (testBot, echo) => {
          const inputs = await falling(testBot, ['forward', 'sprint'])
          echo({ sprinting: false })
          inputs.push(await holding(testBot, ['forward', 'sprint']), await holding(testBot, ['forward', 'sprint']))
          return inputs
        })
        assert.deepStrictEqual(echoed, { told: [[], ['start_sprinting'], [], [], ['start_sprinting'], []], moved: unechoed })
      })

      it(`bedrock ${version}: starts a sneak again while falling, the key held, after an echo saying it does not sneak, its pose kept`, async () => {
        const [echoed, unechoed] = await echoing(version, async (testBot, echo) => {
          const inputs = await falling(testBot, ['forward', 'right', 'sneak'])
          echo({ sneaking: false })
          inputs.push(await holding(testBot, ['forward', 'right', 'sneak']), await holding(testBot, ['forward', 'right', 'sneak']))
          return inputs
        })
        assert.deepStrictEqual(echoed, { told: [[], ['start_sneaking'], [], [], ['start_sneaking'], []], moved: unechoed })
      })

      it(`bedrock ${version}: ends a sprint the sprint key no longer holds after an echo saying it does not sprint, telling no stop (not recorded: the echo taken as its own)`, async () => {
        const testBot = await joined(version)
        const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, ['forward'])]
        echo(testBot, { sprinting: false })
        inputs.push(await holding(testBot, ['forward']), await holding(testBot, []))
        assert.deepStrictEqual(inputs.map(startsAndStops), [['start_sprinting'], [], [], []])
      })

      it(`bedrock ${version}: jumps by itself as its own move does after an echo saying it does not sneak: releasing a sneak against a block it has room to jump onto sneaking only, tells no jump (not recorded)`, async () => {
        const [, inputs] = await sneakTappedUnderSlab(version, testBot => { echo(testBot, { sneaking: false }) })
        assert.deepStrictEqual(inputs.map(input => [jumpFlags(input), startsAndStops(input)]), [[[], []], [[], []], [[], ['start_sneaking']], [[], []], [[], []]])
      })

      it(`bedrock ${version}: jumps by itself against stone on the tick acting on an echo saying it sneaks, telling stop_sneaking again (not recorded)`, async () => {
        const testBot = await joined(version, { blocks: [[0, 12, 31, 'stone']], feet: { x: 0.5, y: 12, z: 30.625 }, options: { autoJump: true } })
        const inputs = [await holding(testBot, ['forward'])]
        echo(testBot, { sneaking: true })
        inputs.push(await holding(testBot, ['forward']))
        assert.deepStrictEqual(inputs.map(input => [jumpFlags(input), startsAndStops(input)]), [[[], []], [['jumping', 'start_jumping'], ['stop_sneaking']]])
      })

      it(`bedrock ${version}: acts on no echo of another entity, nor on one without the flags`, async () => {
        const testBot = await joined(version)
        const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
        echo(testBot, { sprinting: true }, 0n, 2n)
        testBot.server.send('set_entity_data', { runtime_entity_id: 1n, metadata: [{ key: 'potion_color', type: 'int', value: 0 }], tick: 0n })
        inputs.push(await holding(testBot, []))
        assert.deepStrictEqual([inputs.map(startsAndStops), testBot.internal._core.stats.errors], [[['start_sprinting'], ['stop_sprinting'], []], 0])
      })

      it(`bedrock ${version}: acts on no echo the server sent before a tick physicsEnabled held`, async () => {
        const testBot = await joined(version)
        const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
        echo(testBot, { sprinting: true })
        testBot.bot.physicsEnabled = false
        inputs.push(await holding(testBot, []))
        testBot.bot.physicsEnabled = true
        inputs.push(await holding(testBot, []))
        assert.deepStrictEqual(inputs.map(startsAndStops), [['start_sprinting'], ['stop_sprinting'], [], []])
      })

      it(`bedrock ${version}: plays the ticks before an echo of other flags than the player's again without it, and starts the ring again with the tick acting on it; not on one of the same`, async () => {
        /** sprints, then walks: corrected on the tick before its last, `flags` echoed with it, and so again a tick after */
        const corrected = async (flags?: Echoed): Promise<[[Point3, Point3], number, number]> => {
          const testBot = await joined(version, { game: { movement_authority: 'server_with_rewind' } })
          const correct = (): void => { testBot.server.send('correct_player_move_prediction', { position: eyeOf({ x: 0.5, y: 12, z: 31 }), delta: { x: 0, y: 0, z: 0 }, on_ground: true, tick: BigInt(tickOf(testBot) - 1) }) }
          await holding(testBot, ['forward', 'sprint'])
          for (let i = 0; i < 3; i++) await holding(testBot, ['forward'])
          if (flags !== undefined) echo(testBot, flags)
          correct()
          const acting = await holding(testBot, ['forward'])
          correct()
          await holding(testBot, ['forward'])
          const { tooOld, rewinds } = testBot.internal._player.corrections.stats
          return [motionOf(acting), tooOld, rewinds]
        }
        const [unechoed] = await corrected()
        assert.deepStrictEqual([await corrected({ sprinting: false }), await corrected({ sprinting: true })], [[unechoed, 1, 1], [unechoed, 0, 2]])
      })
    }
  })

  describe('servers whose wall stops a sprint, echoing it unstamped (1.16.210 – 1.21.50)', () => {
    /** stone two blocks wide at z 32, as high as a jump, and a look 3 degrees west of south, along it */
    const wall: Setup = { blocks: [-1, 0].flatMap((x): BlockAt[] => [[x, 12, 32, 'stone'], [x, 13, 32, 'stone'], [x, 14, 32, 'stone']]), rotation: { yaw: 3, pitch: 0 } }

    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.21.50')) {
      it(`bedrock ${version}: only stops a sprint the wall stopped after an echo saying it sprints, in the air as fast as without it`, async () => {
        const [echoed, unechoed] = await echoing(version, async (testBot, echo) => {
          await holding(testBot, ['forward', 'sprint', 'jump'])
          for (let i = 0; i < 6; i++) await holding(testBot, ['forward', 'sprint'])
          const inputs = [await holding(testBot, ['forward', 'sprint'])]
          echo({ sprinting: true })
          inputs.push(await holding(testBot, ['forward', 'sprint']), await holding(testBot, ['forward', 'sprint']))
          return inputs
        }, wall)
        assert.deepStrictEqual(echoed, { told: [['stop_sprinting'], ['stop_sprinting'], ['start_sprinting', 'stop_sprinting']], moved: unechoed })
      })
    }
  })

  describe('servers echoing the player\'s flags named index, told of a sprint and a sneak by player_action (1.16.201)', () => {
    /** the echo of the player's flags, as recorded: the sprint is bit 3, the sneak bit 1 */
    function echoIndex ({ server }: TestBot, flags: bigint): void {
      server.send('set_entity_data', { runtime_entity_id: 1, metadata: [{ key: 'index', type: 'long', value: flags }], tick: 0n })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: sends stop_sprint and stop_sneak again after an echo saying it sprints or sneaks`, async () => {
        const testBot = await joined(version)
        const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
        echoIndex(testBot, 422246825345032n)
        inputs.push(await holding(testBot, []), await holding(testBot, ['sneak']), await holding(testBot, []))
        echoIndex(testBot, 422246825345026n)
        inputs.push(await holding(testBot, []))
        echoIndex(testBot, 422246825345024n)
        inputs.push(await holding(testBot, []))
        assert.deepStrictEqual(inputs.map(input => besides(testBot, Number(input.tick))), [
          [actionOf('start_sprint')], [actionOf('stop_sprint')], [actionOf('stop_sprint')], [actionOf('start_sneak')], [actionOf('stop_sneak')], [actionOf('stop_sneak')], []
        ])
      })

      it(`bedrock ${version}: sends no player_action jump after an echo saying it does not sneak, releasing a sneak against a block it has room to jump onto sneaking only (not recorded)`, async () => {
        const [testBot, inputs] = await sneakTappedUnderSlab(version, testBot => { echoIndex(testBot, 422246825345024n) })
        assert.deepStrictEqual(inputs.map(input => besides(testBot, Number(input.tick))), [[], [], [actionOf('start_sneak')], [], []])
      })
    }
  })

  describe('servers stamping the echo with a tick, recorded agreeing with the player\'s flags, which the bot ignores (1.21.70+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.70')) {
      it(`bedrock ${version}: stops no sprint again after a stamped echo saying it sprints, nor starts one after one saying it does not`, async () => {
        const testBot = await joined(version)
        const inputs = [await holding(testBot, ['forward', 'sprint']), await holding(testBot, [])]
        echo(testBot, { sprinting: true }, BigInt(tickOf(testBot)))
        inputs.push(await holding(testBot, []), await holding(testBot, ['forward', 'sprint']))
        echo(testBot, { sprinting: false }, BigInt(tickOf(testBot)))
        inputs.push(await holding(testBot, ['forward', 'sprint']))
        assert.deepStrictEqual(inputs.map(startsAndStops), [['start_sprinting'], ['stop_sprinting'], [], ['start_sprinting'], []])
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

      it(`bedrock ${version}: plays the auto-jump against the top slab again as its ticks took it, though autoJump was unset since`, async () => {
        const testBot = await joined(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 }, options: { autoJump: true } })
        const inputs: AuthInput[] = []
        for (let i = 0; i < 20; i++) inputs.push(await holding(testBot, ['forward']))
        testBot.bot.autoJump = false
        // the 18th tick, falling off the bottom slab, a quarter of a block east: the 19th looks ahead again, the 20th jumps
        const falling = inputs[17]
        assert.ok(falling !== undefined)
        testBot.server.send('correct_player_move_prediction', { position: { ...falling.position, x: -2.25 }, delta: falling.delta, on_ground: false, tick: falling.tick })
        const next = await holding(testBot, [])
        const { rewinds, replayedTicks } = testBot.internal._player.corrections.stats
        assert.deepStrictEqual([next.position, rewinds, replayedTicks], [{ x: -2.25, y: JUMP_Y[1], z: 137.6999969482422 }, 1, 2])
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

    it('walks against the top slab without jumping by itself: the option autoJump is off unless set (the vanilla client\'s is on)', async () => {
      assert.deepStrictEqual(await againstTopSlab(version, {}), { jumps: [], eyes: offSlab(Array(13).fill(STANDING_Y)), dy: Array(13).fill(STANDING_DY), besides: [] })
    })

    it('jumps by itself from the frame after bot.autoJump is set, and stops from the frame after it is unset', async () => {
      const testBot = await joined(version, { blocks: slabAndTopSlab(version), feet: { x: -2.5, y: 12, z: 134.5 } })
      const { bot, server, driver } = testBot
      for (let i = 0; i < 20; i++) await holding(testBot, ['forward'])
      const read: boolean[] = []
      /** a frame of two ticks, forward held, bot.autoJump set to `autoJump` in its first: their auth inputs */
      const frame = async (autoJump: boolean): Promise<AuthInput[]> => {
        bot.once('physicsTick', () => {
          bot.autoJump = autoJump
          read.push(bot.autoJump)
        })
        await driver.frame(100)
        return [server.authInput(tickOf(testBot) - 1), server.authInput(tickOf(testBot))]
      }
      // set, the frame's second tick does not look ahead yet; unset in the next frame's first, which looks ahead, its second still jumps
      const inputs = [...await frame(true), ...await frame(false)]
      for (let i = 0; i < 12; i++) inputs.push(await holding(testBot, ['forward']))
      assert.deepStrictEqual([read, bot.autoJump, inputs.flatMap((input, tick) => jumpFlags(input).length > 0 ? [tick] : [])], [[true, false], false, [3]])
    })

    it('holds the player from the start with the option physicsEnabled false', async () => {
      const testBot = await bedrockTestBot(bedrockCodec(version), { physicsEnabled: false })
      await new ServerWorld(testBot.server).join(testBot, { feet: { x: 0.5, y: 20, z: 30.5 } })
      await testBot.driver.ticks(5)
      assert.deepStrictEqual([testBot.bot.physicsEnabled, testBot.bot.entity.position, testBot.server.authInput(tickOf(testBot)).delta], [false, new Vec3(0.5, 20, 30.5), { x: 0, y: 0, z: 0 }])
    })
  })
})
