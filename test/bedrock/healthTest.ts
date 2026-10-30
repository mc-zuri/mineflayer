import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBotOptions, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { eyeOf, ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The packets are those servers sent the vanilla Bedrock client on a death and a respawn, recorded on every version,
// small ones as their bytes, and what the vanilla client answered. Versions whose servers send alike are a group, and
// each group's tests run on each of its versions.

const RECORDED = Object.freeze({
  /** set_health 20 */
  fullHealth: '2a28',
  /** respawn at the world's spawn, searching, then ready: its eye (0, 13.62, 10) */
  respawnSearching: '2d0000000000004041000020410000',
  respawnReady: '2d0000000090eb5941000020410100',
  /** the vanilla client's respawn request: at (0, 0, 0), its state 2, the player's runtime id 1 */
  respawnRequest: '2d0000000000000000000000000201'
})

/** the respawned player's feet, under the recorded eye */
const RESPAWN_FEET = Object.freeze({ x: 0, y: 12, z: 10 })

type Attributes = ClientboundPacketsToWrite['update_attributes']['attributes']

const EVENTS = ['health', 'death', 'respawn', 'game', 'spawn'] as const

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

function hexOf (server: FakeBedrockClient, name: 'respawn' | 'player_action', params: object): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** the respawn requests and player action respawns the bot sent, as their bytes */
function respawnsSent (server: FakeBedrockClient): string[] {
  const requests = server.sentOf('respawn').map(params => hexOf(server, 'respawn', params))
  const actions = server.sentOf('player_action').filter(({ action }) => action === 'respawn').map(params => hexOf(server, 'player_action', params))
  return [...requests, ...actions]
}

/** the packets the bot sent in its last flush */
function lastFlush (server: FakeBedrockClient): string[] {
  return (server.batches[server.batches.length - 1] ?? []).map(({ name }) => name)
}

/** health, hunger and saturation as the version's update_attributes writes them: the recorded login's values */
function vitals (version: BedrockVersion, health = 20, hunger = 20, saturation = 5): Attributes {
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  return ([['minecraft:health', health], ['minecraft:player.hunger', hunger], ['minecraft:player.saturation', saturation]] as const).map(([name, current]) => ({
    min: 0,
    max: 20,
    current,
    default: 20,
    name,
    ...atLeast('bedrock_1.19.20') ? { modifiers: [] } : {},
    ...atLeast('bedrock_1.21.30') ? { default_min: 0, default_max: 20 } : {}
  }))
}

interface Alive extends TestBot {
  world: ServerWorld
  /** the bot's events, with their tick */
  events: string[]
  errors: string[]
}

/** joined, before the server told any vitals */
async function joined (codec: BedrockCodec, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<Alive> {
  const testBot = await bedrockTestBot(codec, options)
  const { bot, internal, server } = testBot
  const world = new ServerWorld(server)
  const events: string[] = []
  for (const name of EVENTS) bot.on(name, () => { events.push(`${name} ${internal._core.tick ?? '-'}`) })
  await world.join(testBot)
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, world, events, errors }
}

/** joined, with the recorded login's health 20, hunger 20 and saturation 5 */
async function alive (codec: BedrockCodec, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<Alive> {
  const testBot = await joined(codec, options)
  const { server, driver } = testBot
  server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(codec.version), tick: 0n })
  receive(server, RECORDED.fullHealth)
  await driver.tick()
  return testBot
}

/** the next tick's number */
function next ({ internal }: TestBot): number {
  return (internal._core.tick ?? 0) + 1
}

/** the ticks at whose end the player, placed still, had fallen: the physics moved it */
function moving ({ bot, internal }: TestBot): number[] {
  const ticks: number[] = []
  bot.on('physicsTick', () => { if (bot.entity.velocity.y !== 0) ticks.push(internal._core.tick ?? 0) })
  return ticks
}

/** respawn at `feet`, as the version writes it */
function respawnAt (server: FakeBedrockClient, feet: Point3, state: number): void {
  const eye = eyeOf(feet)
  if (isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.220')) server.send('respawn', { position: eye, state, runtime_entity_id: 0n })
  else server.send('respawn', { ...eye, state, runtime_entity_id: isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.210') ? 0n : 0 })
}

describe('bedrock health', () => {
  const layouts: Array<{ title: string, versions: BedrockVersion[], death: string }> = [{
    title: 'servers sending an attribute without its modifiers (up to 1.19.10)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.10'),
    death: '1d0101000000000000a041000000000000a041106d696e6563726166743a6865616c746800'
  }, {
    title: 'servers sending an attribute with its modifiers (1.19.20 - 1.21.20)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.20', 'bedrock_1.21.20'),
    death: '1d0101000000000000a041000000000000a041106d696e6563726166743a6865616c74680000'
  }, {
    title: 'servers sending an attribute with its default range (1.21.30+)',
    versions: bedrockTestVersionsFrom('bedrock_1.21.30'),
    death: '1d0101000000000000a04100000000000000000000a0410000a041106d696e6563726166743a6865616c74680000'
  }]

  for (const { title, versions, death } of layouts) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          let codec: BedrockCodec
          before(() => { codec = bedrockCodec(version) })

          it("keeps the login's health, food and saturation, with one health event; the join's respawn is not answered", async () => {
            const { bot, server, events } = await alive(codec)
            assert.deepStrictEqual([bot.health, bot.food, bot.foodSaturation, bot.isAlive], [20, 20, 5, true])
            assert.deepStrictEqual([events.map(event => event.split(' ')[0]), respawnsSent(server)], [['game', 'spawn', 'health'], []])
            bot.end()
          })

          it('dies at health 0: health, then death, no auth input from that frame, and asks to respawn in it', async () => {
            const testBot = await alive(codec)
            const { bot, server, driver, events } = testBot
            events.length = 0
            const tick = next(testBot)
            receive(server, death)
            await driver.tick()
            assert.deepStrictEqual([bot.health, bot.isAlive, events], [0, false, [`health ${tick - 1}`, `death ${tick - 1}`]])
            assert.deepStrictEqual([lastFlush(server), respawnsSent(server)], [['respawn'], [RECORDED.respawnRequest]])
            await driver.ticks(3)
            assert.deepStrictEqual([tick, tick + 1, tick + 2, tick + 3].map(at => server.inTick(at)), [[], [], [], []])
            bot.end()
          })

          it('ignores another runtime id, and values it has already', async () => {
            const { bot, server, driver, events } = await alive(codec)
            events.length = 0
            server.send('update_attributes', { runtime_entity_id: 2n, attributes: vitals(version, 0, 0, 0), tick: 0n })
            server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(version), tick: 0n })
            receive(server, RECORDED.fullHealth)
            await driver.tick()
            assert.deepStrictEqual([bot.health, bot.food, bot.foodSaturation, events], [20, 20, 5, []])
            server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(version, 20, 19, 4), tick: 0n })
            await driver.tick()
            assert.deepStrictEqual([bot.food, bot.foodSaturation, events.map(event => event.split(' ')[0])], [19, 4, ['health']])
            bot.end()
          })
        })
      }
    })
  }

  /** dead, then respawned as recorded: the bytes of each version's player_action respawn */
  async function respawned (version: BedrockVersion): Promise<{ testBot: Alive, ready: number, moved: number[] }> {
    const testBot = await alive(bedrockCodec(version))
    const { server, driver, events } = testBot
    server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(version, 0), tick: 0n })
    await driver.tick()
    await driver.ticks(5)
    events.length = 0
    const moved = moving(testBot)
    const ready = next(testBot)
    receive(server, RECORDED.respawnSearching, RECORDED.respawnReady)
    await driver.tick()
    assert.deepStrictEqual(lastFlush(server).slice(0, 2), ['player_action', 'player_auth_input'])
    return { testBot, ready, moved }
  }

  const answers: Array<{ title: string, versions: BedrockVersion[], action: string }> = [{
    title: 'servers answered with a player action without its result position (up to 1.18.30)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.18.30'),
    action: '24010e00000001'
  }, {
    title: 'servers answered with a player action with its result position (1.19.1+)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.1'),
    action: '24010e00000000000001'
  }]

  for (const { title, versions, action } of answers) {
    describe(title, () => {
      for (const version of versions) {
        it(`bedrock ${version}: answers respawn's ready state with the player action respawn, in its frame, and emits respawn and game`, async () => {
          const { testBot: { bot, server, events }, ready } = await respawned(version)
          assert.deepStrictEqual(respawnsSent(server), [RECORDED.respawnRequest, action])
          assert.deepStrictEqual(events, [`respawn ${ready - 1}`, `game ${ready - 1}`])
          assert.deepStrictEqual([bot.entity.position.x, bot.entity.position.y, bot.entity.position.z], [RESPAWN_FEET.x, RESPAWN_FEET.y, RESPAWN_FEET.z])
          bot.end()
        })
      }
    })
  }

  const moves: Array<{ title: string, versions: BedrockVersion[], after: number }> = [{
    title: 'servers whose respawned player moves at once (up to 1.19.40)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.40'),
    after: 0
  }, {
    title: 'servers whose respawned player moves once the columns around it are loaded (1.19.50+)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.50'),
    after: 1
  }]

  for (const { title, versions, after } of moves) {
    describe(title, () => {
      for (const version of versions) {
        it(`bedrock ${version}: sends auth inputs from respawn's frame, moves ${after === 0 ? 'in it' : 'from the next tick'}, and spawns at the end of the first tick it moves with health`, async () => {
          const { testBot, ready, moved } = await respawned(version)
          const { bot, internal, server, driver, events, errors } = testBot
          await driver.ticks(3)
          assert.deepStrictEqual([moved[0], bot.isAlive], [ready + after, false])
          const healed = next(testBot)
          receive(server, RECORDED.fullHealth)
          await driver.ticks(2)
          await driver.ticks(15)
          assert.deepStrictEqual([bot.isAlive, events.slice(2)], [true, [`health ${healed - 1}`, `spawn ${healed}`]])
          assert.deepStrictEqual([server.sentOf('set_local_player_as_initialized').length, errors], [1, []])
          assert.ok(internal._core.activation.active)
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('is alive before the server tells its health', async () => {
      const { bot } = await bedrockTestBot(codec)
      assert.deepStrictEqual([bot.isAlive, bot.health], [true, undefined])
      bot.end()
    })

    const deaths: Array<{ title: string, kill: (server: FakeBedrockClient) => void }> = [
      { title: 'update_attributes', kill: server => { server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(codec.version, 0).slice(0, 1), tick: 0n }) } },
      { title: 'set_health', kill: server => { server.send('set_health', { health: 0 }) } }
    ]
    for (const { title, kill } of deaths) {
      it(`stays alive on hunger and saturation before any health (written by hand), then dies of ${title}'s 0`, async () => {
        const { bot, server, driver, events } = await joined(codec)
        events.length = 0
        server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(codec.version, 20, 19, 4).slice(1), tick: 0n })
        await driver.ticks(2)
        assert.deepStrictEqual([events.map(event => event.split(' ')[0]), bot.isAlive, bot.health, bot.food, respawnsSent(server)], [['health'], true, undefined, 19, []])
        kill(server)
        await driver.tick()
        assert.deepStrictEqual([events.map(event => event.split(' ')[0]), bot.isAlive, respawnsSent(server)], [['health', 'health', 'death'], false, [RECORDED.respawnRequest]])
        bot.end()
      })
    }

    it('dies of set_health 0 too, once, and emits health while dead', async () => {
      const { bot, server, driver, events } = await alive(codec)
      events.length = 0
      server.send('set_health', { health: 0 })
      server.send('update_attributes', { runtime_entity_id: 1n, attributes: vitals(codec.version, 0, 19), tick: 0n })
      await driver.tick()
      assert.deepStrictEqual(events.map(event => event.split(' ')[0]), ['health', 'death', 'health'])
      assert.deepStrictEqual(respawnsSent(server), [RECORDED.respawnRequest])
      bot.end()
    })

    it('with the respawn option off, asks to respawn only when bot.respawn() is called, each time while dead', async () => {
      const { bot, server, driver } = await alive(codec, { respawn: false })
      bot.respawn()
      await driver.tick()
      server.send('set_health', { health: 0 })
      await driver.tick()
      assert.deepStrictEqual(respawnsSent(server), [])
      bot.respawn()
      await driver.tick()
      bot.respawn()
      await driver.tick()
      assert.deepStrictEqual(respawnsSent(server), [RECORDED.respawnRequest, RECORDED.respawnRequest])
      receive(server, RECORDED.respawnReady)
      bot.respawn()
      await driver.tick()
      assert.strictEqual(server.sentOf('respawn').length, 2)
      bot.end()
    })

    it('asks for the sections of the columns sent while the player is dead, as the vanilla client', async () => {
      const { bot, server, driver, world } = await alive(codec, { respawn: false })
      server.send('set_health', { health: 0 })
      await driver.tick()
      const asked = world.asked().length
      world.column(2, 0)
      await world.sendColumn(2, 0)
      await driver.tick()
      assert.deepStrictEqual([...new Set(world.asked().slice(asked).map(({ x, z }) => `${x},${z}`))], ['2,0'])
      bot.end()
    })

    it("answers a living player's respawn too (after the credits), which changes nothing else", async () => {
      const testBot = await alive(codec)
      const { bot, internal, server, driver, events } = testBot
      events.length = 0
      const tick = next(testBot)
      receive(server, RECORDED.respawnSearching, RECORDED.respawnReady)
      await driver.ticks(3)
      assert.deepStrictEqual(respawnsSent(server), ['24010e00000000000001'])
      assert.deepStrictEqual(events, [`respawn ${tick - 1}`, `game ${tick - 1}`])
      assert.deepStrictEqual([tick, tick + 1, tick + 2].map(at => server.inTick(at)[0]), ['player_auth_input', 'player_auth_input', 'player_auth_input'])
      assert.ok(internal._core.activation.active)
      bot.end()
    })

    it('holds a player respawned away from the columns loaded until they are, from the tick after', async () => {
      const testBot = await alive(codec)
      const { bot, internal, server, driver, world, events, errors } = testBot
      server.send('set_health', { health: 0 })
      await driver.tick()
      events.length = 0
      const moved = moving(testBot)
      const loaded: number[] = []
      bot.on('physicsTick', () => { if (internal._world.notLoadedAround(bot.entity.position, 1).length === 0) loaded.push(internal._core.tick ?? 0) })
      respawnAt(server, { x: 40.5, y: 12, z: 0.5 }, 1)
      receive(server, RECORDED.fullHealth)
      await driver.ticks(5)
      assert.deepStrictEqual([moved, events.map(event => event.split(' ')[0])], [[], ['respawn', 'game', 'health']])
      const columns = [[2, -1], [2, 0], [2, 1], [3, -1], [3, 0], [3, 1]] as const
      for (const [x, z] of columns) {
        world.column(x, z)
        await world.sendColumn(x, z)
      }
      for (let ticks = 0; ticks < 20 && moved.length === 0; ticks++) {
        await driver.tick()
        await world.answer()
      }
      assert.ok(loaded[0] !== undefined)
      assert.deepStrictEqual([moved[0], events.slice(3), errors], [loaded[0] + 1, [`spawn ${loaded[0] + 1}`], []])
      bot.end()
    })

    it('spawns a player that died again before it moved only once it moves again', async () => {
      const { bot, server, driver, events } = await alive(codec)
      server.send('set_health', { health: 0 })
      await driver.tick()
      receive(server, RECORDED.respawnReady, RECORDED.fullHealth)
      await driver.tick()
      server.send('set_health', { health: 0 })
      await driver.tick()
      events.length = 0
      respawnAt(server, { x: 40.5, y: 12, z: 0.5 }, 1)
      receive(server, RECORDED.fullHealth)
      await driver.ticks(3)
      assert.deepStrictEqual(events.map(event => event.split(' ')[0]), ['respawn', 'game', 'health'])
      bot.end()
    })

    it('moves a respawned player 200 ticks after it respawned without the columns around it, with an error naming them', async () => {
      const testBot = await alive(codec)
      const { bot, server, driver, errors } = testBot
      server.send('set_health', { health: 0 })
      await driver.tick()
      const ready = next(testBot)
      respawnAt(server, { x: 40.5, y: 12, z: 0.5 }, 1)
      receive(server, RECORDED.fullHealth)
      let spawned: number | undefined
      bot.once('spawn', () => { spawned = testBot.internal._core.tick })
      await driver.runUntil(() => spawned !== undefined, 210)
      assert.deepStrictEqual([spawned, errors], [ready + 200, ['the columns (2, -1), (2, 0), (2, 1), (3, -1), (3, 0), (3, 1) around the player were not loaded 200 ticks after it showed again']])
      bot.end()
    })
  })
})
