import assert from 'assert'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBotOptions, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { eyeOf, ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The packets are those servers sent the vanilla Bedrock client through a portal to the nether and on a respawn in the
// overworld after a death there, recorded on every version, small ones as their bytes, and what the vanilla client
// answered. Versions whose servers send alike are a group, and each group's tests run on each of its versions.

const RECORDED = Object.freeze({
  /** set_health 20 */
  fullHealth: '2a28',
  /** respawn at the world's spawn, searching, then ready: its eye (0, 13.62, 10) */
  respawnSearching: '2d0000000000004041000020410000',
  respawnReady: '2d0000000090eb5941000020410100',
  /** show_credits of the player's runtime id 1: they start; the vanilla client's: they ended */
  creditsStart: '4b0100',
  creditsEnd: '4b0102',
  /** change_dimension to the overworld at (0, 32767, 0) after the credits, a respawn, with loading screen 1 */
  creditsChange: '3d000000000000feff4600000000010101000000',
  /** serverbound_loading_screen 1, then 2, of loading screen 1 */
  creditsShown: 'b802020101000000',
  creditsHidden: 'b802040101000000'
})

/** where change_dimension put the feet at the portal in the nether */
const PORTAL_FEET = Object.freeze({ x: 0, y: Math.fround(13.62001), z: 2 })
/** where the server then placed the player, above the nether's floor: it falls once it moves */
const NETHER_FEET = Object.freeze({ x: 0.5, y: 13, z: 2.5 })
const EVENTS = ['health', 'death', 'respawn', 'game', 'spawn'] as const

type Attributes = ClientboundPacketsToWrite['update_attributes']['attributes']

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

function hexOf (server: FakeBedrockClient, name: 'player_action' | 'serverbound_loading_screen' | 'show_credits', params: object): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** the bot's dimension_change_acks, as their bytes */
function acks (server: FakeBedrockClient): string[] {
  return server.sentOf('player_action').filter(({ action }) => action === 'dimension_change_ack').map(params => hexOf(server, 'player_action', params))
}

function loadingScreens (server: FakeBedrockClient): string[] {
  return server.sentOf('serverbound_loading_screen').filter(({ loading_screen_id: id }) => id !== undefined).map(params => hexOf(server, 'serverbound_loading_screen', params))
}

/** the auth input and the player action of tick `tick`, in the order the bot queued them */
function authAndAck (server: FakeBedrockClient, tick: number): string[] {
  return server.inTick(tick).filter(name => name === 'player_auth_input' || name === 'player_action')
}

/** the packets the bot sent in its last flush */
function lastFlush (server: FakeBedrockClient): string[] {
  return (server.batches[server.batches.length - 1] ?? []).map(({ name }) => name)
}

/** the recorded health 0, without the version's other fields */
function health (version: BedrockVersion, current: number): Attributes {
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  return [{
    min: 0,
    max: 20,
    current,
    default: 20,
    name: 'minecraft:health',
    ...atLeast('bedrock_1.19.20') ? { modifiers: [] } : {},
    ...atLeast('bedrock_1.21.30') ? { default_min: 0, default_max: 20 } : {}
  }]
}

interface Joined extends TestBot {
  world: ServerWorld
  nether: ServerWorld
  /** the bot's events, with their tick */
  events: string[]
  errors: string[]
  /** the ticks at whose end the player, placed still, had fallen: the physics moved it */
  moved: number[]
}

/** joined in the overworld with health 20, a nether world to change to */
async function joined (version: BedrockVersion, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<Joined> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const { bot, internal, server, driver } = testBot
  const world = new ServerWorld(server)
  await world.join(testBot)
  receive(server, RECORDED.fullHealth)
  await driver.tick()
  const events: string[] = []
  for (const name of EVENTS) bot.on(name, () => { events.push(`${name} ${internal._core.tick ?? '-'}`) })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const moved: number[] = []
  bot.on('physicsTick', () => { if (bot.entity.velocity.y !== 0) moved.push(internal._core.tick ?? 0) })
  return { ...testBot, world, nether: new ServerWorld(server, { dimension: 'nether' }), events, errors, moved }
}

/** the next tick's number */
function next ({ internal }: TestBot): number {
  return (internal._core.tick ?? 0) + 1
}

function placeAt (server: FakeBedrockClient, feet: Point3, runtimeId = 1, mode: 'reset' | 'rotation' = 'reset'): void {
  server.send('move_player', { runtime_id: runtimeId, position: eyeOf(feet), mode, on_ground: false })
}

/** dead of health 0 */
async function die ({ server, driver }: TestBot): Promise<void> {
  server.send('update_attributes', { runtime_entity_id: 1n, attributes: health(server.codec.version, 0), tick: 0n })
  await driver.tick()
}

/** respawn's searching, then ready state at the world's spawn, as the version writes them */
function respawn (server: FakeBedrockClient): void {
  if (isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.220')) {
    receive(server, RECORDED.respawnSearching, RECORDED.respawnReady)
    return
  }
  const runtimeId = isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.210') ? 0n : 0
  server.send('respawn', { x: 0, y: 12, z: 10, state: 0, runtime_entity_id: runtimeId })
  server.send('respawn', { ...eyeOf({ x: 0, y: 12, z: 10 }), state: 1, runtime_entity_id: runtimeId })
}

/** ticks, answering the bot's requests of both worlds, until `done` holds */
async function tickUntil ({ driver, world, nether }: Joined, done: () => boolean): Promise<void> {
  for (let ticks = 0; ticks < 30 && !done(); ticks++) {
    await driver.tick()
    await world.answer()
    await nether.answer()
  }
  assert.ok(done(), 'not done in 30 ticks')
}

function xyz ({ x, y, z }: Point3): number[] {
  return [x, y, z]
}

describe('bedrock dimension changes', () => {
  const hidden: Array<{ title: string, versions: BedrockVersion[], change: string, toSpawn: string, ack: string, movesAtOnce: boolean }> = [{
    title: 'servers whose player is hidden until it is placed, and moves at once (up to 1.17.40)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40'),
    change: '3d020000000090eb59410000004000',
    toSpawn: '3d0000000000000040410000204100',
    ack: '24011c00000000',
    movesAtOnce: true
  }, {
    title: 'servers whose player is hidden until it is placed, and moves once the columns around it are loaded (1.18.0 - 1.18.30)',
    versions: bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.18.30'),
    change: '3d020000000090eb59410000004000',
    toSpawn: '3d0000000000000040410000204100',
    ack: '24011c00000000',
    movesAtOnce: false
  }, {
    title: 'servers whose player is hidden until it is placed, answered with a result position (1.19.1 - 1.19.40)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.1', 'bedrock_1.19.40'),
    change: '3d020000000090eb59410000004000',
    toSpawn: '3d0000000000000040410000204100',
    ack: '24011c00000000000000',
    movesAtOnce: false
  }]

  for (const { title, versions, change, toSpawn, ack, movesAtOnce } of hidden) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          it('sends nothing from the change, acknowledges it once the column under the feet shows, shows the player once placed', async () => {
            const testBot = await joined(version)
            const { bot, internal, server, driver, nether, events, errors, moved } = testBot
            events.length = 0
            const changed = next(testBot)
            receive(server, change)
            await driver.tick()
            assert.deepStrictEqual([events, bot.game.dimension, bot.game.minY, bot.game.height], [[`respawn ${changed - 1}`, `game ${changed - 1}`], 'the_nether', 0, 128])
            assert.deepStrictEqual([xyz(bot.entity.position), bot.blockAt(new Vec3(0, 11, 0))], [xyz(PORTAL_FEET), null])
            await driver.ticks(2)
            await nether.sendAround()
            const shown = next(testBot)
            await driver.tick()
            assert.deepStrictEqual([changed, changed + 1, changed + 2, shown].map(at => server.inTick(at)), [[], [], [], ['player_action']])
            assert.deepStrictEqual(acks(server), [ack])
            // neither turning the player nor moving another places it
            placeAt(server, NETHER_FEET, 1, 'rotation')
            placeAt(server, NETHER_FEET, 2)
            await driver.ticks(2)
            placeAt(server, NETHER_FEET)
            const placed = next(testBot)
            await driver.tick()
            // from 1.18.0 it asks for the sections once it shows the player, from that tick
            assert.deepStrictEqual([shown + 1, shown + 2, placed].map(at => server.inTick(at).filter(name => name !== 'subchunk_request')), [[], [], []])
            await tickUntil(testBot, () => moved.length > 0)
            assert.strictEqual(server.inTick(placed + 1)[0], 'player_auth_input')
            // up to 1.17.40 it moves at once, and falls from the tick after the one answering its placement
            const spawned = movesAtOnce ? placed + 1 : moved[0]
            assert.ok(movesAtOnce ? moved[0] === placed + 2 : moved[0]! > placed + 2, `moved at ${moved[0]}, placed at ${placed}`)
            assert.deepStrictEqual([events.slice(2), errors, acks(server).length, internal._core.activation.active], [[`spawn ${spawned}`], [], 1, true])
            // from 1.18.0, for the nether's sections
            assert.ok(nether.asked().slice(-1).every(({ dimension, y }) => dimension === 1 && y >= 0 && y <= 7))
            bot.end()
          })

          it("acknowledges a dead player's change at once; respawn's ready state shows the player, which moves at once", async () => {
            const testBot = await joined(version)
            const { bot, server, driver, world, events, errors, moved } = testBot
            await die(testBot)
            bot.setControlState('forward', true)
            events.length = 0
            moved.length = 0
            const changed = next(testBot)
            receive(server, toSpawn)
            await world.sendAround()
            await driver.tick()
            assert.deepStrictEqual([acks(server), lastFlush(server), bot.game.dimension], [[ack], ['player_action'], 'overworld'])
            const ready = next(testBot)
            respawn(server)
            receive(server, RECORDED.fullHealth)
            await driver.ticks(3)
            assert.deepStrictEqual([server.inTick(ready)[0], moved[0]], ['player_auth_input', ready])
            assert.deepStrictEqual([events, errors], [[`respawn ${changed - 1}`, `game ${changed - 1}`, `health ${ready - 1}`, `spawn ${ready}`], []])
            bot.end()
          })
        })
      }
    })
  }

  const frozen: Array<{ title: string, versions: BedrockVersion[], change: string, toSpawn: string, shown?: string, hidden?: string }> = [{
    title: 'servers acknowledging the change, whose player is frozen until then (1.19.50 - 1.21.2)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.50', 'bedrock_1.21.2'),
    change: '3d020000000090eb59410000004000',
    toSpawn: '3d0000000000000040410000204100'
  }, {
    title: 'servers acknowledging the change, whose player is frozen until then, naming a loading screen (1.21.20+)',
    versions: bedrockTestVersionsFrom('bedrock_1.21.20'),
    change: '3d020000000090eb594100000040000100000000',
    toSpawn: '3d000000000000004041000020410000',
    shown: 'b802020100000000',
    hidden: 'b802040100000000'
  }]
  const ACK = '24011c00000000000000'

  for (const { title, versions, change, toSpawn, shown, hidden } of frozen) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          it(`sends frozen auth inputs from the change, acknowledges it after the server once loaded, and moves ${hidden === undefined ? 'the tick after' : 'the tick after its loading screen hides, 2 ticks after'}`, async () => {
            const testBot = await joined(version)
            const { bot, server, driver, nether, events, errors, moved } = testBot
            bot.setControlState('forward', true)
            await driver.ticks(2)
            events.length = 0
            moved.length = 0
            const changed = next(testBot)
            receive(server, change)
            await driver.tick()
            assert.deepStrictEqual(loadingScreens(server), shown === undefined ? [] : [shown])
            const input = server.authInput(changed)
            assert.deepStrictEqual([input.position, input.delta, inputFlags(input).set.filter(flag => flag === 'up')], [eyeOf(PORTAL_FEET), { x: 0, y: 0, z: 0 }, []])
            assert.strictEqual(eyeOf(PORTAL_FEET).y, 15.240020751953125)
            await nether.sendAround()
            // a player action of the server's other than the acknowledgement is not one
            server.send('player_action', { runtime_entity_id: 1n, action: 'jump', position: { x: 0, y: 0, z: 0 }, face: 0 })
            await tickUntil(testBot, () => testBot.internal._world.loadedAround(bot.entity.position, 1))
            await driver.ticks(2)
            assert.deepStrictEqual([acks(server), moved, events], [[], [], [`respawn ${changed - 1}`, `game ${changed - 1}`]])
            placeAt(server, NETHER_FEET)
            receive(server, ACK)
            const acked = next(testBot)
            await driver.tick()
            const reset = server.authInput(acked)
            assert.deepStrictEqual([reset.position, inputFlags(reset).set.includes('handled_teleport'), authAndAck(server, acked), acks(server)], [eyeOf(NETHER_FEET), false, ['player_auth_input', 'player_action'], [ACK]])
            await driver.ticks(4)
            const movedAt = hidden === undefined ? acked + 1 : acked + 3
            if (hidden !== undefined) assert.deepStrictEqual([server.inTick(acked + 2).slice(0, 2), loadingScreens(server).slice(1)], [['player_auth_input', 'serverbound_loading_screen'], [hidden]])
            assert.deepStrictEqual([moved[0], events.slice(2), errors], [movedAt, [`spawn ${movedAt}`], []])
            assert.ok(inputFlags(server.authInput(movedAt)).set.includes('up'))
            bot.end()
          })

          it("acknowledges a dead player's change once respawned and loaded, after the server, and moves the tick after", async () => {
            const testBot = await joined(version)
            const { bot, server, driver, world, events, errors, moved } = testBot
            await die(testBot)
            bot.setControlState('forward', true)
            events.length = 0
            moved.length = 0
            const changed = next(testBot)
            receive(server, toSpawn, ACK)
            await world.sendAround()
            await driver.tick()
            // dead, it asks for the sections of the columns sent, as the vanilla client
            assert.deepStrictEqual([acks(server), loadingScreens(server), server.inTick(changed)], [[], [], ['subchunk_request']])
            const loaded: number[] = []
            bot.on('physicsTick', () => { if (testBot.internal._world.loadedAround(bot.entity.position, 1)) loaded.push(testBot.internal._core.tick ?? 0) })
            const ready = next(testBot)
            respawn(server)
            receive(server, RECORDED.fullHealth)
            await tickUntil(testBot, () => acks(server).length > 0)
            const acked = (testBot.internal._core.tick ?? 0)
            await driver.ticks(2)
            assert.strictEqual(loaded[0], acked)
            assert.deepStrictEqual([server.inTick(ready)[0], server.authInput(ready).position], ['player_auth_input', eyeOf({ x: 0, y: 12, z: 10 })])
            assert.deepStrictEqual([authAndAck(server, acked), acks(server), moved[0]], [['player_auth_input', 'player_action'], [ACK], acked + 1])
            assert.deepStrictEqual([events, errors], [[`respawn ${changed - 1}`, `game ${changed - 1}`, `health ${ready - 1}`, `spawn ${acked + 1}`], []])
            bot.end()
          })

          it(`acknowledges a change the player died in once loaded, after the server, ${hidden === undefined ? '' : 'hides its loading screen 2 ticks after, '}and only then asks for the respawn`, async () => {
            const testBot = await joined(version)
            const { bot, server, driver, world, nether, events, errors, moved } = testBot
            receive(server, change)
            await driver.tick()
            await die(testBot)
            await driver.ticks(2)
            await nether.sendAround()
            await tickUntil(testBot, () => testBot.internal._world.loadedAround(bot.entity.position, 1))
            await driver.ticks(2)
            // dead, it asks for the nether's sections, and waits for the server
            assert.deepStrictEqual([acks(server), server.sentOf('respawn'), nether.asked().length > 0], [[], [], true])
            placeAt(server, NETHER_FEET)
            receive(server, ACK)
            const acked = next(testBot)
            await driver.ticks(3)
            const asked = server.batches.flat().find(({ name }) => name === 'respawn')?.tick
            assert.deepStrictEqual([acks(server), loadingScreens(server), asked, server.sentOf('respawn').length], [[ACK], shown === undefined || hidden === undefined ? [] : [shown, hidden], hidden === undefined ? acked : acked + 2, 1])
            assert.deepStrictEqual([testBot.internal._core.activation.active, moved, events.filter(event => event.startsWith('spawn')), errors], [false, [], [], []])
            // it respawns in the overworld as any dead player
            receive(server, toSpawn, ACK)
            respawn(server)
            receive(server, RECORDED.fullHealth)
            await world.sendAround()
            await tickUntil(testBot, () => moved.length > 0)
            assert.deepStrictEqual([acks(server), bot.game.dimension, errors], [[ACK, ACK], 'overworld', []])
            bot.end()
          })
        })
      }
    })
  }

  describe('no version differs in: (on bedrock_1.17.40, up to 1.19.40)', () => {
    const version = 'bedrock_1.17.40'

    it('acknowledges the change 200 ticks after it without the column under the player, and shows the player then without its placement, with an error naming each', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, errors, moved } = testBot
      const changed = next(testBot)
      receive(server, '3d020000000090eb59410000004000')
      await driver.runUntil(() => moved.length > 0, 210)
      assert.deepStrictEqual([acks(server).length, moved[0]], [1, changed + 200])
      assert.deepStrictEqual(errors, ['the column (0, 0) under the player was not sent 200 ticks after the dimension change', 'the server did not place the player 200 ticks after the dimension change'])
      bot.end()
    })

    it("shows a living player placed by respawn's ready state (after the credits) once the column under it shows", async () => {
      const testBot = await joined(version)
      const { bot, server, driver, world, events, errors } = testBot
      server.send('change_dimension', { dimension: 0, position: { x: 0, y: 32767, z: 0 }, respawn: true })
      respawn(server)
      await world.sendAround()
      const shown = next(testBot)
      await driver.ticks(2)
      assert.deepStrictEqual([server.inTick(shown), server.inTick(shown + 1)[0], events.filter(event => event.startsWith('respawn')).length, errors], [['player_action'], 'player_auth_input', 1, []])
      bot.end()
    })

    it('spawns a respawned player that has no health yet only after a dimension change that came meanwhile', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, nether, events } = testBot
      await die(testBot)
      respawn(server)
      await driver.tick()
      events.length = 0
      receive(server, '3d020000000090eb59410000004000', RECORDED.fullHealth)
      await nether.sendAround()
      await driver.ticks(2)
      placeAt(server, NETHER_FEET)
      const placed = next(testBot)
      await driver.ticks(2)
      assert.deepStrictEqual(events.filter(event => event.startsWith('spawn')), [`spawn ${placed + 1}`])
      bot.end()
    })

    it('shows a player placed before the column under it showed once it acknowledged the change, from the next tick', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, nether } = testBot
      receive(server, '3d020000000090eb59410000004000')
      placeAt(server, NETHER_FEET)
      await driver.ticks(3)
      assert.deepStrictEqual(server.sentOf('player_auth_input').filter(input => Number(input.tick) > (testBot.internal._core.tick ?? 0) - 3), [])
      await nether.sendAround()
      const shown = next(testBot)
      await driver.ticks(2)
      assert.deepStrictEqual([server.inTick(shown), server.inTick(shown + 1)[0], acks(server).length], [['player_action'], 'player_auth_input', 1])
      bot.end()
    })

    it('asks at once for the respawn of a player that died during the change, which it does not acknowledge while dead', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, nether } = testBot
      receive(server, '3d020000000090eb59410000004000')
      await driver.tick()
      await die(testBot)
      await nether.sendAround()
      placeAt(server, NETHER_FEET)
      await driver.ticks(3)
      assert.deepStrictEqual([server.sentOf('respawn').length, acks(server)], [1, []])
      bot.end()
    })

    it('waits for a dead player to respawn as long as it takes', async () => {
      const testBot = await joined(version, { respawn: false })
      const { bot, server, driver, errors } = testBot
      await die(testBot)
      receive(server, '3d0000000000000040410000204100')
      await driver.ticks(220)
      assert.deepStrictEqual([acks(server).length, errors, server.sentOf('player_auth_input').length], [1, [], server.sentOf('player_auth_input').length])
      assert.strictEqual(testBot.internal._core.activation.present, false)
      bot.end()
    })
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion}, from 1.19.50)`, () => {
    const version = latestSupportedBedrockVersion
    const CHANGE = '3d020000000090eb594100000040000100000000'

    it('acknowledges the change 200 ticks after it without the server, and the columns around the player, with an error naming each', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, errors } = testBot
      const changed = next(testBot)
      receive(server, CHANGE)
      await driver.runUntil(() => acks(server).length > 0, 210)
      assert.strictEqual(testBot.internal._core.tick, changed + 199)
      assert.deepStrictEqual(errors, [
        'the server did not acknowledge the dimension change 200 ticks after it',
        'the columns (-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 0), (0, 1), (1, -1), (1, 0), (1, 1) around the player were not loaded 200 ticks after the dimension change'
      ])
      bot.end()
    })

    it('sends nothing for a dead player until it respawns, as long as it takes', async () => {
      const testBot = await joined(version, { respawn: false })
      const { bot, server, driver, errors } = testBot
      await die(testBot)
      const sent = server.sentOf('player_auth_input').length
      receive(server, '3d000000000000004041000020410000', ACK)
      await driver.ticks(220)
      assert.deepStrictEqual([acks(server), errors, server.sentOf('player_auth_input').length], [[], [], sent])
      bot.end()
    })

    it('with the respawn option off, asks for the respawn bot.respawn() asked for during a change the player died in once it ended, and for none unasked', async () => {
      const testBot = await joined(version, { respawn: false })
      const { bot, server, driver, world, nether, moved } = testBot
      receive(server, CHANGE)
      await driver.tick()
      await die(testBot)
      bot.respawn()
      await nether.sendAround()
      placeAt(server, NETHER_FEET)
      receive(server, ACK)
      await tickUntil(testBot, () => loadingScreens(server).length === 2)
      assert.deepStrictEqual([acks(server), server.sentOf('respawn').length, lastFlush(server).includes('respawn')], [[ACK], 1, true])
      server.send('change_dimension', { dimension: 0, position: { x: 0, y: 12, z: 10 }, respawn: false, loading_screen_id: 1 })
      receive(server, ACK)
      respawn(server)
      receive(server, RECORDED.fullHealth)
      await world.sendAround()
      await tickUntil(testBot, () => moved.length > 0)
      // a second death in a change, the respawn not asked for
      server.send('change_dimension', { dimension: 1, position: PORTAL_FEET, respawn: false, loading_screen_id: 2 })
      await driver.tick()
      await die(testBot)
      await nether.sendAround()
      placeAt(server, NETHER_FEET)
      receive(server, ACK)
      await tickUntil(testBot, () => loadingScreens(server).length === 6)
      await driver.ticks(2)
      assert.deepStrictEqual([acks(server).length, server.sentOf('respawn').length], [3, 1])
      bot.respawn()
      await driver.tick()
      assert.strictEqual(server.sentOf('respawn').length, 2)
      bot.end()
    })

    it('reports the collisions of the last tick the player moved, its camera, and keys tapped while frozen once it moves', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, nether } = testBot
      bot.look(Math.PI / 2, 0)
      await driver.ticks(2)
      const changed = next(testBot)
      receive(server, CHANGE)
      await driver.tick()
      const input = server.authInput(changed)
      assert.deepStrictEqual([inputFlags(input).set, input.camera_orientation], [['block_breaking_delay_enabled', 'vertical_collision'], { x: -1, y: 0, z: Math.fround(Math.cos(Math.PI / 2)) }])
      bot.setControlState('jump', true)
      await driver.tick()
      bot.setControlState('jump', false)
      await driver.tick()
      await nether.sendAround()
      receive(server, ACK)
      await tickUntil(testBot, () => testBot.internal._core.activation.active)
      await driver.tick()
      const first = server.sentOf('player_auth_input').map(sent => inputFlags(sent).set).find(flags => flags.includes('jump_pressed_raw'))
      assert.ok(first?.includes('jump_released_raw'))
      bot.end()
    })

    it('answers the credits at once, and respawns the living player in the change, its ready state telling nothing more', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, world, events, errors, moved } = testBot
      // another player's, and the end of the credits, are not answered
      server.send('show_credits', { runtime_entity_id: 2n, status: 0 })
      server.send('show_credits', { runtime_entity_id: 1n, status: 1 })
      receive(server, RECORDED.creditsStart)
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('show_credits').map(params => hexOf(server, 'show_credits', params)), [RECORDED.creditsEnd])
      assert.deepStrictEqual(lastFlush(server).slice(0, 1), ['show_credits'])
      events.length = 0
      moved.length = 0
      const changed = next(testBot)
      receive(server, RECORDED.creditsChange, ACK)
      respawn(server)
      await world.sendAround()
      await driver.tick()
      assert.deepStrictEqual([loadingScreens(server), events], [[RECORDED.creditsShown], [`respawn ${changed - 1}`, `game ${changed - 1}`]])
      await tickUntil(testBot, () => moved.length > 0)
      assert.deepStrictEqual([loadingScreens(server), events.slice(2), errors], [[RECORDED.creditsShown, RECORDED.creditsHidden], [`spawn ${moved[0]}`], []])
      bot.end()
    })

    it('holds a respawned player waiting for the columns around it at a dimension change until the server acknowledges it', async () => {
      const testBot = await joined(version)
      const { bot, internal, server, driver, nether } = testBot
      await die(testBot)
      server.send('respawn', { position: eyeOf({ x: 40.5, y: 12, z: 0.5 }), state: 1, runtime_entity_id: 0n })
      receive(server, RECORDED.fullHealth)
      await driver.ticks(2)
      receive(server, CHANGE)
      await nether.sendAround()
      await tickUntil(testBot, () => internal._world.loadedAround(bot.entity.position, 1))
      await driver.ticks(2)
      assert.deepStrictEqual([internal._core.activation.active, acks(server)], [false, []])
      bot.end()
    })

    it('respawns the player at the ready state after a death when the dimension changed while it lived', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, nether, events, world, moved } = testBot
      receive(server, CHANGE, ACK)
      await nether.sendAround()
      await driver.tick()
      await tickUntil(testBot, () => testBot.internal._core.activation.active)
      await die(testBot)
      events.length = 0
      const ready = next(testBot)
      respawn(server)
      await world.sendAround()
      await driver.tick()
      assert.deepStrictEqual(events, [`respawn ${ready - 1}`, `game ${ready - 1}`])
      moved.length = 0
      bot.setControlState('forward', true)
      await tickUntil(testBot, () => moved.length > 0)
      bot.end()
    })

    it('respawns the player at the ready state of a death after a respawn that changed the dimension', async () => {
      const testBot = await joined(version)
      const { bot, server, driver, events } = testBot
      await die(testBot)
      receive(server, '3d000000000000004041000020410000', ACK)
      respawn(server)
      receive(server, RECORDED.fullHealth)
      await driver.tick()
      await die(testBot)
      events.length = 0
      const ready = next(testBot)
      respawn(server)
      await driver.tick()
      assert.deepStrictEqual(events, [`respawn ${ready - 1}`, `game ${ready - 1}`])
      bot.end()
    })

    it("names each dimension's bounds, and empties the same world, a column sent before the change in its frame too", async () => {
      const testBot = await joined(version)
      const { bot, internal, server, driver, world } = testBot
      const before = bot.world
      server.send('player_action', { runtime_entity_id: 1n, action: 'dimension_change_ack', position: { x: 0, y: 0, z: 0 }, face: 0 })
      world.column(5, 5)
      await world.sendColumn(5, 5)
      server.send('change_dimension', { dimension: 2, position: { x: 100, y: 50, z: 0 }, respawn: false })
      await driver.tick()
      assert.deepStrictEqual([bot.game.dimension, bot.game.minY, bot.game.height, bot.world === before, bot.world.getColumns().length], ['the_end', 0, 256, true, 0])
      assert.deepStrictEqual([internal._world.columnPresent(80, 80), bot.blockAt(new Vec3(0, 11, 0))], [false, null])
      server.send('change_dimension', { dimension: 0, position: { x: 0, y: 12, z: 0 }, respawn: false })
      await driver.tick()
      assert.deepStrictEqual([bot.game.dimension, bot.game.minY, bot.game.height, testBot.errors], ['overworld', -64, 384, []])
      bot.end()
    })
  })
})
