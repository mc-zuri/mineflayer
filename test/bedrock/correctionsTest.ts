import assert from 'assert'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockPlugin, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../lib/types/bedrock-internal.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, TestBot } from './common/server.ts'
import { eyeOf, ServerWorld } from './common/world.ts'
import type { Point3, StartGame } from './common/world.ts'

// The server's corrections of the local player. Under a movement authority that rewinds the player, a packet that names
// one of the bot's ticks is filed on that tick's record in the packet pass, and the next tick starts by playing the
// ticks since again from it: that tick's auth input reports where they lead. Under another authority the packet acts at
// once. The player joins with its feet at (0.5, 12, 0.5), on a stone floor, where it stands (its velocity is gravity's
// -0.0784 each tick), and keeps its last 20 ticks; where it is corrected to is on the floor too, so that the ticks
// played again leave it there.

type Correction = Partial<ClientboundPacketsToWrite['correct_player_move_prediction']>
type Stats = BedrockBotInternal['_player']['corrections']['stats']

/** the velocity of a player standing on the ground: gravity's, every tick */
const FALLING = Object.freeze({ x: 0, y: -0.07840000092983246, z: 0 })
const STANDING_VELOCITY = new Vec3(FALLING.x, FALLING.y, FALLING.z)
const PUSHED = Object.freeze({ x: 0.25, y: 0.5, z: -0.25 })
const JOINED_EYE = Object.freeze({ x: 0.5, y: 13.6200103759765625, z: 0.5 })
/** where the server corrects the player to: the eye, and the feet under it */
const CORRECTED_EYE = Object.freeze({ x: 3.5, y: 13.6200103759765625, z: -2.5 })
const CORRECTED_FEET = new Vec3(3.5, 12, -2.5)
const ELSEWHERE_EYE = Object.freeze({ x: -1.5, y: 13.6200103759765625, z: 2.5 })
/** a teleport 4 blocks from where the player joined */
const NEAR_EYE = Object.freeze({ x: 4.5, y: 13.6200103759765625, z: 0.5 })
/** an eye whose feet are 1e-5 (squared, as floats) from where the player joined, on each axis */
const AGREEING_EYE = Object.freeze({ x: 0.5004943013191223, y: 13.621440887451172, z: 0.502776563167572 })
/** one whose are a float farther summed z, y, x, as the vanilla client sums it (summed z and y, then x: 1e-5) */
const DISAGREEING_EYE = Object.freeze({ x: 0.5002774000167847, y: 13.622285842895508, z: 0.5021783709526062 })

/** start_game of a server whose movement authority rewinds the player: named up to 1.21.80 (on 1.16.201 its own way) */
function rewinding (version: BedrockVersion): StartGame {
  if (isBedrockVersionAtLeast(version, 'bedrock_1.21.90')) return {}
  return { movement_authority: version === 'bedrock_1.16.201' ? 'server_v2_rewind' : 'server_with_rewind' }
}

interface Joined extends TestBot {
  /** the tick it was joined at */
  tick: number
}

/** a bot joined, 4 ticks on */
async function joined (version: BedrockVersion, game: StartGame = {}, plugins: Record<string, BedrockPlugin> = {}): Promise<Joined> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { plugins })
  await new ServerWorld(testBot.server).join(testBot, { game })
  await testBot.driver.ticks(4)
  return { ...testBot, tick: testBot.internal._core.tick ?? -1 }
}

function correct ({ server }: TestBot, tick: number, eye: Point3 = CORRECTED_EYE, fields: Correction = {}): void {
  server.send('correct_player_move_prediction', { position: eye, delta: FALLING, on_ground: true, tick: BigInt(tick), ...fields })
}

function teleport ({ server }: TestBot, eye: Point3, tick: number, mode: 'teleport' | 'reset' = 'teleport'): void {
  const cause = mode === 'teleport' ? { teleport: { cause: 'command' as const, source_entity_type: 1 } } : {}
  server.send('move_player', { runtime_id: 1, position: eye, mode, on_ground: true, tick: BigInt(tick), ...cause })
}

/** set_entity_motion of the player (runtime id 1), stamped with `tick` from 1.20.71 */
function setMotion ({ server }: TestBot, velocity: Point3, tick: number | undefined, runtimeId = 1): void {
  const id = server.codec.version === 'bedrock_1.16.201' ? runtimeId : BigInt(runtimeId)
  server.send('set_entity_motion', { runtime_entity_id: id, velocity, ...tick === undefined ? {} : { tick: BigInt(tick) } })
}

function stats ({ internal }: TestBot): Stats {
  return internal._player.corrections.stats
}

function eyeAfter ({ server, tick }: Joined, ticks: number): Point3 {
  return server.authInput(tick + ticks).position
}

/** corrected 3 ticks back (by `corrections`: a vehicle's ignored first): the next flush, by name and tick, and the player */
async function correctedThreeTicksBack (version: BedrockVersion, corrections: Correction[]): Promise<object> {
  const testBot = await joined(version, rewinding(version))
  for (const fields of corrections) correct(testBot, testBot.tick - 3, fields.position ?? CORRECTED_EYE, fields)
  await testBot.driver.tick()
  const flushed = (testBot.server.batches[testBot.server.batches.length - 1] ?? []).map(packet => [packet.name, (packet.tick ?? 0) - testBot.tick])
  const { filed, rewinds, replayedTicks } = stats(testBot)
  return { flushed, eye: eyeAfter(testBot, 1), feet: testBot.bot.entity.position, tick: (testBot.internal._core.tick ?? 0) - testBot.tick, filed, rewinds, replayedTicks }
}

/** the next tick's flush is its auth input alone, which reports where 3 ticks played again lead */
const CORRECTED_THREE_TICKS_BACK = Object.freeze({ flushed: [['player_auth_input', 1]], eye: CORRECTED_EYE, feet: CORRECTED_FEET, tick: 1, filed: 1, rewinds: 1, replayedTicks: 3 })

/** keeps its last `kept` ticks: a correction before them is too old, and one of the oldest rewinds the player */
async function keeps (version: BedrockVersion, game: StartGame, kept: number): Promise<void> {
  const testBot = await joined(version, game)
  correct(testBot, testBot.tick - kept)
  correct(testBot, testBot.tick - kept + 1)
  await testBot.driver.tick()
  const { tooOld, rewinds, replayedTicks } = stats(testBot)
  assert.deepStrictEqual([eyeAfter(testBot, 1), testBot.bot.entity.velocity, tooOld, rewinds, replayedTicks], [CORRECTED_EYE, STANDING_VELOCITY, 1, 1, kept - 1])
}

/** a correction of the tick before: the player as the packet pass left it, then the next tick's auth input and the player */
async function correctedOnce (testBot: Joined): Promise<object> {
  correct(testBot, testBot.tick - 1)
  await testBot.driver.frame(0)
  const { position, velocity, onGround } = testBot.bot.entity
  const atOnce = [position, velocity, onGround]
  await testBot.driver.tick()
  const { filed, rewinds } = stats(testBot)
  return { atOnce, eye: eyeAfter(testBot, 1), after: [testBot.bot.entity.position, testBot.bot.entity.velocity], filed, rewinds }
}

const STANDING = Object.freeze([new Vec3(0.5, 12, 0.5), STANDING_VELOCITY, true])

/** the player's velocity once the packet pass is done, and its feet after the next tick */
async function velocities ({ bot, driver }: TestBot): Promise<[Vec3, Vec3]> {
  await driver.frame(0)
  const atOnce = bot.entity.velocity
  await driver.tick()
  return [atOnce, bot.entity.position]
}

/** where the player standing at (0.5, 12, 0.5) is a tick after it was given PUSHED: against the stone at (1, 12, 0) */
const PUSHED_ONCE = new Vec3(0.699999988079071, 12.5, 0.25)

/** a plugin is given the internal bot */
function isInternal (bot: BedrockBot): bot is BedrockBotInternal {
  return '_core' in bot
}

describe('bedrock corrections', () => {
  describe('servers naming no ring size (1.16.201): one tick', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: rewinds the player to its last tick only`, async () => {
        await keeps(version, rewinding(version), 1)
      })
    }
  })

  describe('servers naming the ring size (1.16.210+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210')) {
      it(`bedrock ${version}: rewinds the player as many ticks back`, async () => {
        await keeps(version, { ...rewinding(version), rewind_history_size: 3 }, 3)
      })
    }
  })

  /** the player made ready again elsewhere: a correction of the tick before is too old, and the next auth input reports where */
  async function respawned (version: BedrockVersion, respawn: (testBot: TestBot, eye: Point3) => void): Promise<void> {
    const testBot = await joined(version, rewinding(version))
    respawn(testBot, CORRECTED_EYE)
    correct(testBot, testBot.tick, ELSEWHERE_EYE)
    await testBot.driver.tick()
    assert.deepStrictEqual([stats(testBot).tooOld, eyeAfter(testBot, 1)], [1, CORRECTED_EYE])
  }

  describe('servers respawning the player by x, y and z (up to 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: starts the ring again`, async () => {
        await respawned(version, ({ server }, eye) => { server.send('respawn', { ...eye, state: 1, runtime_entity_id: version === 'bedrock_1.16.201' ? 1 : 1n }) })
      })
    }
  })

  describe('servers respawning the player by its position (1.16.220+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220')) {
      it(`bedrock ${version}: starts the ring again`, async () => {
        await respawned(version, ({ server }, position) => { server.send('respawn', { position, state: 1, runtime_entity_id: 1n }) })
      })
    }
  })

  // 1.16.201's correction is the same, of its one tick (above)
  describe('servers correcting the position, the velocity and the ground (1.16.210 – 1.20.71)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.20.71')) {
      it(`bedrock ${version}: plays the ticks since again first in the next tick, whose auth input alone reports it`, async () => {
        assert.deepStrictEqual(await correctedThreeTicksBack(version, [{}]), CORRECTED_THREE_TICKS_BACK)
      })
    }
  })

  describe('servers correcting the player or the vehicle it drives, by its rotation (1.20.80 – 1.21.2)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.80', 'bedrock_1.21.2')) {
      it(`bedrock ${version}: plays the ticks since again from the player's, not the vehicle's`, async () => {
        const vehicle: Correction = { prediction_type: 'vehicle', position: ELSEWHERE_EYE, vehicle_rotation: { x: 0, z: 90 } }
        assert.deepStrictEqual(await correctedThreeTicksBack(version, [vehicle, { prediction_type: 'player' }]), CORRECTED_THREE_TICKS_BACK)
      })
    }
  })

  describe('servers correcting the player or the vehicle it drives, by its rotation and angular velocity (1.21.20 – 1.21.93)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20', 'bedrock_1.21.93')) {
      it(`bedrock ${version}: plays the ticks since again from the player's, not the vehicle's`, async () => {
        const vehicle: Correction = { prediction_type: 'vehicle', position: ELSEWHERE_EYE, vehicle_rotation: { rotation: { x: 0, z: 90 }, angular_velocity: 0.5 } }
        assert.deepStrictEqual(await correctedThreeTicksBack(version, [vehicle, { prediction_type: 'player' }]), CORRECTED_THREE_TICKS_BACK)
      })
    }
  })

  describe('servers correcting the player or the vehicle it drives, with a rotation either way (1.21.100+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.100')) {
      it(`bedrock ${version}: plays the ticks since again from the player's, not the vehicle's`, async () => {
        const vehicle: Correction = { prediction_type: 'vehicle', position: ELSEWHERE_EYE, rotation: { x: 0, z: 90 }, angular_velocity: 0.5 }
        assert.deepStrictEqual(await correctedThreeTicksBack(version, [vehicle, { prediction_type: 'player' }]), CORRECTED_THREE_TICKS_BACK)
      })
    }
  })

  describe('servers of the server movement authority, which correct the player at once (up to 1.21.60, as recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.21.60')) {
      it(`bedrock ${version}: places the player in the packet pass, as under the client authority`, async () => {
        for (const game of [{}, { movement_authority: 'client' as const }]) {
          assert.deepStrictEqual(await correctedOnce(await joined(version, game)), {
            atOnce: [CORRECTED_FEET, STANDING_VELOCITY, true], eye: CORRECTED_EYE, after: [CORRECTED_FEET, STANDING_VELOCITY], filed: 0, rewinds: 0
          })
        }
      })
    }
  })

  describe('servers of the server movement authority with rewind (1.21.70, 1.21.80, as recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.70', 'bedrock_1.21.80')) {
      it(`bedrock ${version}: files a correction, and rewinds the player in the next tick`, async () => {
        assert.deepStrictEqual(await correctedOnce(await joined(version)), { atOnce: STANDING, eye: CORRECTED_EYE, after: [CORRECTED_FEET, STANDING_VELOCITY], filed: 1, rewinds: 1 })
      })
    }
  })

  describe('servers naming no movement authority, which rewinds the player (1.21.90+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.90')) {
      it(`bedrock ${version}: files a correction, and reports it in the next tick: that of tick 61 received after the auth input of tick 62 in that of tick 63, as recorded`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { bot, internal, server, driver } = testBot
        const world = new ServerWorld(server)
        await world.join(testBot)
        // the floor the player was corrected onto, at y 0
        world.column(0, 4, Array.from({ length: 256 }, (_, index) => [index >> 4, 0, 64 + (index & 15), 'stone'] as const))
        await world.load(driver, [[0, 4]])
        await driver.runUntil(() => internal._core.tick === 62, 100)
        const recorded = { x: 8.324000358581543, y: 2.6200098991394043, z: 65.51499938964844 }
        server.send('correct_player_move_prediction', { position: recorded, delta: { x: 0, y: 0, z: 0 }, on_ground: true, tick: 61n })
        await driver.frame(0)
        const atOnce = bot.entity.position
        await driver.tick()
        const { filed, rewinds, replayedTicks } = stats({ bot, internal, server, driver })
        assert.deepStrictEqual([atOnce, server.authInput(63).position, server.authInput(63).delta, filed, rewinds, replayedTicks], [new Vec3(0.5, 12, 0.5), recorded, FALLING, 1, 1, 1])
      })
    }
  })

  describe('servers changing the movement authority (1.21.42+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.42')) {
      it(`bedrock ${version}: follows it: under the server authority a correction or a teleport acts at once, and the ring starts again`, async () => {
        const testBot = await joined(version)
        const { server, driver, tick } = testBot
        server.send('set_movement_authority', { movement_authority: 'server' })
        correct(testBot, tick - 1)
        server.send('set_movement_authority', { movement_authority: 'server_with_rewind' })
        correct(testBot, tick - 1, ELSEWHERE_EYE)
        await driver.frame(0)
        const atOnce = testBot.bot.entity.position
        await driver.tick()
        server.send('set_movement_authority', { movement_authority: 'server' })
        teleport(testBot, NEAR_EYE, tick + 1)
        server.send('set_movement_authority', { movement_authority: 'server_with_rewind' })
        correct(testBot, tick + 1, ELSEWHERE_EYE)
        await driver.tick()
        correct(testBot, tick + 2, ELSEWHERE_EYE)
        await driver.tick()
        const { tooOld, filed, rewinds } = stats(testBot)
        assert.deepStrictEqual([atOnce, tooOld, eyeAfter(testBot, 2), eyeAfter(testBot, 3), filed, rewinds], [CORRECTED_FEET, 2, NEAR_EYE, ELSEWHERE_EYE, 1, 1])
      })
    }
  })

  describe('servers setting the velocity without a tick (up to 1.20.61)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.61')) {
      it(`bedrock ${version}: sets the player's in the packet pass, the ring starting again; the player moves by it in the next tick`, async () => {
        const testBot = await joined(version, rewinding(version))
        setMotion(testBot, PUSHED, undefined)
        setMotion(testBot, FALLING, undefined, 2)
        correct(testBot, testBot.tick)
        assert.deepStrictEqual([await velocities(testBot), stats(testBot).tooOld], [[new Vec3(0.25, 0.5, -0.25), PUSHED_ONCE], 1])
      })
    }
  })

  describe('servers stamping the velocity with a tick, of the server movement authority (1.20.71 – 1.21.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.71', 'bedrock_1.21.60')) {
      it(`bedrock ${version}: sets the player's in the packet pass`, async () => {
        const testBot = await joined(version)
        setMotion(testBot, PUSHED, testBot.tick - 1)
        assert.deepStrictEqual([await velocities(testBot), stats(testBot).filed], [[new Vec3(0.25, 0.5, -0.25), PUSHED_ONCE], 0])
      })
    }
  })

  describe('servers stamping the velocity with a tick, of a movement authority with rewind (1.21.70+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.70')) {
      it(`bedrock ${version}: counts the player's present velocity as an echo, files another of a tick it keeps, drops one of a tick it does not, and sets it at once unstamped`, async () => {
        const testBot = await joined(version)
        setMotion(testBot, FALLING, testBot.tick)
        setMotion(testBot, PUSHED, testBot.tick + 9)
        setMotion(testBot, PUSHED, 1)
        setMotion(testBot, PUSHED, testBot.tick - 1)
        const filed = [await velocities(testBot), { ...stats(testBot) }]
        // an echo of the velocity set at once, which started the ring again
        setMotion(testBot, PUSHED, 0)
        setMotion(testBot, PUSHED, testBot.tick)
        const counted = { filed: 1, agreed: 0, echoes: 1, unstamped: 0, tooOld: 1, anomalies: 1, rewinds: 1, replayedTicks: 1, abandoned: 0 }
        // pushed from the tick before: played again, then on in the next tick; then pushed on from there
        assert.deepStrictEqual([filed, await velocities(testBot), stats(testBot)], [
          [[STANDING_VELOCITY, new Vec3(0.699999988079071, 12.911600112915039, 0.11349999159574509)], counted],
          [new Vec3(0.25, 0.5, -0.25), new Vec3(0.949999988079071, 13.411600112915039, -0.13650000095367432)], { ...counted, echoes: 2 }
        ])
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('counts a correction unstamped, too old, ahead of its ticks or agreeing, and changes neither the player nor the tick', async () => {
      const testBot = await joined(version)
      correct(testBot, 0)
      correct(testBot, 1)
      correct(testBot, testBot.tick + 1)
      correct(testBot, testBot.tick - 1, AGREEING_EYE)
      await testBot.driver.tick()
      assert.deepStrictEqual([testBot.internal._core.tick, eyeAfter(testBot, 1), stats(testBot)], [testBot.tick + 1, JOINED_EYE, {
        filed: 0, agreed: 1, echoes: 0, unstamped: 1, tooOld: 1, anomalies: 1, rewinds: 0, replayedTicks: 0, abandoned: 0
      }])
    })

    it('files a correction a float farther, or off the ground, or while a rewind is asked for', async () => {
      const testBot = await joined(version)
      correct(testBot, testBot.tick - 1, DISAGREEING_EYE)
      await testBot.driver.tick()
      // where the ticks played again left the player: on the floor, under the correction
      const played = eyeAfter(testBot, 1)
      correct(testBot, testBot.tick + 1, played, { on_ground: false })
      correct(testBot, testBot.tick, played)
      await testBot.driver.tick()
      const { filed, agreed, rewinds, replayedTicks } = stats(testBot)
      assert.deepStrictEqual([played, filed, agreed, rewinds, replayedTicks, eyeAfter(testBot, 2), testBot.bot.entity.onGround], [
        { ...DISAGREEING_EYE, y: JOINED_EYE.y }, 3, 0, 2, 2, played, true
      ])
    })

    it('agrees with a correction of the ticks it played again, and of one before them, as they were played', async () => {
      const testBot = await joined(version)
      const { internal, driver, tick } = testBot
      correct(testBot, tick - 1)
      await driver.tick()
      const { history } = internal._player.corrections
      const played = [tick - 2, tick - 1, tick].map(record => {
        const snapshot = history.get(record)?.snapshot
        return snapshot === undefined ? undefined : { position: snapshot.position, velocity: snapshot.velocity, onGround: snapshot.onGround }
      })
      correct(testBot, tick - 2, JOINED_EYE)
      correct(testBot, tick - 1)
      correct(testBot, tick)
      await driver.tick()
      const { filed, agreed, rewinds } = stats(testBot)
      const corrected = { position: { x: 3.5, y: 12, z: -2.5 }, onGround: true }
      assert.deepStrictEqual([played, filed, agreed, rewinds, eyeAfter(testBot, 2)], [[
        { position: { x: 0.5, y: 12, z: 0.5 }, velocity: FALLING, onGround: true },
        { ...corrected, velocity: FALLING },
        { ...corrected, velocity: FALLING }
      ], 1, 3, 1, CORRECTED_EYE])
    })

    it('files a near teleport stamped with a tick it keeps, placing the player at once; a rewind over that tick plays it again, then what was filed after it', async () => {
      const testBot = await joined(version)
      const { driver, tick } = testBot
      teleport(testBot, NEAR_EYE, tick - 1)
      await driver.ticks(2)
      const placed = [eyeAfter(testBot, 1), eyeAfter(testBot, 2), stats(testBot).rewinds]
      correct(testBot, tick - 2)
      await driver.tick()
      correct(testBot, tick + 1)
      teleport(testBot, NEAR_EYE, tick + 2)
      correct(testBot, tick + 2, ELSEWHERE_EYE)
      // the auth input of tick + 4 answers the teleport
      await driver.ticks(2)
      const { rewinds, replayedTicks } = stats(testBot)
      assert.deepStrictEqual([placed, eyeAfter(testBot, 3), eyeAfter(testBot, 5), rewinds, replayedTicks], [[NEAR_EYE, NEAR_EYE, 0], NEAR_EYE, ELSEWHERE_EYE, 2, 6])
    })

    it('starts the ring again on a reset, a teleport of 16 blocks or more along any axis, one unstamped, or one of a tick it does not keep', async () => {
      const testBot = await joined(version)
      const { driver, tick } = testBot
      // each with a correction of the ring's last tick, too old once the ring starts again; the last (14.875 blocks) is
      // filed, and the correction after it, which the rewind applies after it
      const teleports: Array<[x: number, y: number, z: number, stamp: number, mode?: 'reset']> = [
        [1.5, 12, 0.5, tick, 'reset'], [17.5, 12, 0.5, tick + 1], [17.5, 32, 0.5, tick + 2], [17.5, 32, 20.5, tick + 3], [18.5, 32, 20.5, 0],
        [18.5, 32, 19.5, 1], [18.5, 32, 18.5, tick + 7], [18.5, 32, 3.625, tick + 7]
      ]
      for (const [index, [x, y, z, stamp, mode]] of teleports.entries()) {
        teleport(testBot, eyeOf({ x, y, z }), stamp, mode)
        correct(testBot, tick + index)
        await driver.tick()
      }
      // the teleports of a tick too old and of one ahead are counted as a correction's
      const { tooOld, anomalies, filed, rewinds } = stats(testBot)
      assert.deepStrictEqual([tooOld, anomalies, filed, rewinds, testBot.bot.entity.position], [8, 1, 1, 1, CORRECTED_FEET])
    })

    it('records each tick the player moves: what its movement read, and where it left the player', async () => {
      const testBot = await joined(version)
      const { bot, internal, server, driver, tick } = testBot
      bot.setControlState('forward', true)
      setMotion(testBot, PUSHED, 0)
      server.send('move_player', { runtime_id: 1, position: NEAR_EYE, yaw: 90, pitch: 30, mode: 'teleport', on_ground: true, teleport: { cause: 'command', source_entity_type: 1 } })
      await driver.frame(0)
      const stopped = bot.entity.velocity
      await driver.ticks(2)
      const records = [tick + 1, tick + 2].map(recorded => internal._player.corrections.history.get(recorded))
      const read = records.map(record => {
        if (record === undefined || record.input === 'held') return undefined
        const { input: { move, yaw, teleported }, snapshot: { position, velocity, onGround } } = record
        return [move, yaw, teleported, { position, velocity, onGround }]
      })
      assert.deepStrictEqual([stopped, read], [
        new Vec3(0, 0, 0), [
          [{ x: 0, z: 1 }, 90, true, { position: { x: 4.5, y: 12, z: 0.5 }, velocity: { x: 0, y: 0, z: 0 }, onGround: true }],
          // the first tick walking west, as recorded
          [{ x: 0, z: 1 }, 90, false, { position: { x: 4.4019999504089355, y: 12, z: 0.5 }, velocity: { x: -0.053508009761571884, y: -0.07840000092983246, z: -0 }, onGround: true }]
        ]
      ])
    })

    it('abandons a rewind when a system it plays again throws, keeping the player where it is and starting the ring again', async () => {
      const throwsReplaying: BedrockPlugin = bot => {
        assert.ok(isInternal(bot))
        bot._core.system('test', { name: 'test.throwsReplaying', place: { after: 'movement.simulate' }, gate: 'active', replay: true, run: ({ tick, replaying }) => { if (replaying) throw new Error(`replaying ${tick}`) } })
      }
      const testBot = await joined(version, {}, { throwsReplaying })
      const errors: string[] = []
      testBot.bot.on('error', error => { errors.push(error.message) })
      correct(testBot, testBot.tick - 2)
      await testBot.driver.tick()
      correct(testBot, testBot.tick)
      await testBot.driver.tick()
      const { abandoned, rewinds, tooOld } = stats(testBot)
      assert.deepStrictEqual([errors, abandoned, rewinds, tooOld, eyeAfter(testBot, 1), eyeAfter(testBot, 2)], [[`replaying ${testBot.tick - 1}`], 1, 0, 1, JOINED_EYE, JOINED_EYE])
    })
  })
})
