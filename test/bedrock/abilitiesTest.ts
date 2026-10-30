import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { Abilities, BedrockBot, BedrockBotOptions, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { StartGame } from './common/world.ts'

// The packets are those servers sent the vanilla Bedrock client, recorded on every version, as their bytes. Versions
// whose servers send alike are a group, and each group's tests run on each of its versions. Servers send no abilities
// after a game mode change (none after the recorded ones): the bot applies the game mode itself. No recording has a
// layer but the base one, nor flight told by adventure_settings: those are written by hand.

/** the player's unique id in the recorded logins, and in the recorded worlds where the player flew or was creative */
const LOGIN_UNIQUE_ID = -4294967295n
const UNIQUE_ID = -8589934591n

const JAVA_DEFAULTS: Abilities = Object.freeze({ invulnerable: false, flying: false, mayFly: false, instantBuild: false, flyingSpeed: 0.05, walkingSpeed: 0.1 })
/** update_abilities' speeds are 32-bit floats */
const SURVIVAL: Abilities = Object.freeze({ ...JAVA_DEFAULTS, flyingSpeed: Math.fround(0.05), walkingSpeed: Math.fround(0.1) })
const CREATIVE = (survival: Abilities): Abilities => ({ ...survival, invulnerable: true, mayFly: true, instantBuild: true })
const SPECTATOR = (survival: Abilities): Abilities => ({ ...survival, invulnerable: true, flying: true, mayFly: true })

/** update_abilities' layers, and the bits of the abilities of a layer (allowed or enabled) */
const LAYERS = Object.freeze({ cache: 0, base: 1, spectator: 2, commands: 3 })
const BITS = Object.freeze({ invulnerable: 1 << 8, flying: 1 << 9, mayFly: 1 << 10, instantBuild: 1 << 11, flyingSpeed: 1 << 13, walkingSpeed: 1 << 14 })
const ALL = 0xfffff

interface Layer { type: number, allowed: number, enabled: number, flyingSpeed?: number, walkingSpeed?: number }

/** update_abilities as 1.21.60+ write it, an operator's, with its vertical fly speed 1 */
function updateAbilities (uniqueId: bigint, layers: readonly Layer[]): Buffer {
  const id = Buffer.alloc(8)
  id.writeBigInt64LE(uniqueId)
  const written = layers.map(({ type, allowed, enabled, flyingSpeed = 0.05, walkingSpeed = 0.1 }) => {
    const layer = Buffer.alloc(22)
    layer.writeUInt16LE(type, 0)
    layer.writeUInt32LE(allowed, 2)
    layer.writeUInt32LE(enabled, 6)
    layer.writeFloatLE(flyingSpeed, 10)
    layer.writeFloatLE(1, 14)
    layer.writeFloatLE(walkingSpeed, 18)
    return layer
  })
  return Buffer.concat([Buffer.from('bb01', 'hex'), id, Buffer.from([2, 1, layers.length]), ...written])
}

function receive (server: FakeBedrockClient, ...packets: Array<string | Buffer>): void {
  for (const packet of packets) server.receive(typeof packet === 'string' ? Buffer.from(packet, 'hex') : packet)
}

/** the version's spectator game type */
function spectatorOf (version: BedrockVersion): 'spectator' | 'creative_spectator' {
  return isBedrockVersionAtLeast(version, 'bedrock_1.18.30') ? 'spectator' : 'creative_spectator'
}

interface LoggedIn {
  bot: BedrockBot
  server: FakeBedrockClient
  /** each `abilities` event's abilities, or what it got where they are not bot.abilities */
  told: Array<Abilities | string>
  frame: () => Promise<void>
}

/** logged in to a recorded world: flat, its player's game type falling back to the world's survival */
async function loggedIn (codec: BedrockCodec, fields: StartGame, ...packets: Array<string | Buffer>): Promise<LoggedIn> {
  return await loggedInWith(codec, {}, fields, ...packets)
}

async function loggedInWith (codec: BedrockCodec, options: Omit<BedrockBotOptions, 'version'>, fields: StartGame, ...packets: Array<string | Buffer>): Promise<LoggedIn> {
  const { bot, server, driver } = await bedrockTestBot(codec, options)
  const told: Array<Abilities | string> = []
  bot.on('abilities', abilities => { told.push(abilities === bot.abilities ? { ...abilities } : 'not bot.abilities') })
  new ServerWorld(server).startGame(undefined, undefined, { player_gamemode: 'fallback', world_gamemode: 'survival', generator: 2, ...fields })
  receive(server, ...packets)
  await driver.frame(0)
  return { bot, server, told, frame: async () => { await driver.frame(0) } }
}

describe('bedrock abilities', () => {
  const groups: Array<{ title: string, versions: BedrockVersion[], login: string, survival: Abilities }> = [{
    title: 'servers sending adventure_settings, auto-jump on (up to 1.19.1)',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.1'),
    login: '372001bf03020001000000ffffffff',
    survival: JAVA_DEFAULTS
  }, {
    title: 'servers sending update_abilities, its base layer allowing 18 abilities (1.19.10 - 1.19.63)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.10', 'bedrock_1.19.63'),
    login: 'bb0101000000ffffffff0201010100ffff0300ff000000cdcc4c3dcdcccc3d',
    survival: SURVIVAL
  }, {
    title: 'servers sending update_abilities, its base layer allowing 19, with privileged building (1.19.70 - 1.21.50)',
    versions: bedrockTestVersionsFrom('bedrock_1.19.70', 'bedrock_1.21.50'),
    login: 'bb0101000000ffffffff0201010100ffff0700ff000000cdcc4c3dcdcccc3d',
    survival: SURVIVAL
  }, {
    title: 'servers sending update_abilities, its base layer allowing 20, with a vertical fly speed (1.21.60+)',
    versions: bedrockTestVersionsFrom('bedrock_1.21.60'),
    login: 'bb0101000000ffffffff0201010100ffff0f00ff000000cdcc4c3d0000803fcdcccc3d',
    survival: SURVIVAL
  }]

  for (const { title, versions, login, survival } of groups) {
    describe(title, () => {
      for (const version of versions) {
        describe(`bedrock ${version}`, () => {
          let codec: BedrockCodec
          before(() => { codec = bedrockCodec(version) })

          it("has Java's abilities until the server tells them, then a survival player's, with abilities on each packet", async () => {
            const { bot, server, driver } = await bedrockTestBot(codec)
            assert.deepStrictEqual(bot.abilities, JAVA_DEFAULTS)
            const told: Abilities[] = []
            bot.on('abilities', abilities => { told.push({ ...abilities }) })
            new ServerWorld(server).startGame(undefined, undefined, { entity_id: LOGIN_UNIQUE_ID, player_gamemode: 'fallback', world_gamemode: 'survival' })
            // as recorded, twice
            receive(server, login, login)
            await driver.frame(0)
            assert.deepStrictEqual([told, { ...bot.abilities }], [[survival, survival], survival])
            bot.end()
          })

          it("takes the game mode's abilities, Java's, with abilities when they change", async () => {
            const { bot, server, told, frame } = await loggedIn(codec, { entity_id: LOGIN_UNIQUE_ID }, login)
            told.length = 0
            server.send('update_player_game_type', { gamemode: 'creative', player_unique_id: LOGIN_UNIQUE_ID })
            await frame()
            assert.deepStrictEqual(bot.abilities, CREATIVE(survival))
            server.send('set_player_game_type', { gamemode: 'creative' })
            // another player's
            server.send('update_player_game_type', { gamemode: 'survival', player_unique_id: UNIQUE_ID })
            server.send('set_player_game_type', { gamemode: spectatorOf(version) })
            await frame()
            server.send('set_player_game_type', { gamemode: 'survival' })
            server.send('set_player_game_type', { gamemode: 'adventure' })
            await frame()
            assert.deepStrictEqual(told, [CREATIVE(survival), SPECTATOR(survival), survival])
            bot.end()
          })
        })
      }
    })
  }

  describe('servers sending adventure_settings (up to 1.19.1, written by hand)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.1')) {
      it(`bedrock ${version}: takes its flight flags as the base layer's, whatever player it names`, async () => {
        const { bot, server, told, frame } = await loggedIn(bedrockCodec(version), { entity_id: LOGIN_UNIQUE_ID })
        // may fly and flying, then may fly, a player id 0
        receive(server, '37c00401bf03020001000000ffffffff', '374001bf0302000000000000000000')
        await frame()
        server.send('set_player_game_type', { gamemode: 'creative' })
        await frame()
        server.send('set_player_game_type', { gamemode: 'survival' })
        await frame()
        assert.deepStrictEqual(told, [
          { ...JAVA_DEFAULTS, mayFly: true, flying: true },
          { ...JAVA_DEFAULTS, mayFly: true },
          CREATIVE(JAVA_DEFAULTS),
          JAVA_DEFAULTS
        ])
        bot.end()
      })
    }
  })

  describe('servers granting creative flight (1.19.70 - 1.21.50, recorded on 1.19.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.70', 'bedrock_1.21.50')) {
      it(`bedrock ${version}: flies when the base layer says so, and a creative player keeps its flight`, async () => {
        const { bot, server, told, frame } = await loggedIn(bedrockCodec(version), { entity_id: UNIQUE_ID })
        server.send('update_player_game_type', { gamemode: 'creative', player_unique_id: UNIQUE_ID })
        await frame()
        told.length = 0
        // asked for with request_ability, granted, then stopped
        receive(server, 'bb0101000000feffffff0201010100ffff0700ff0f0000cdcc4c3dcdcccc3d')
        await frame()
        assert.strictEqual(bot.abilities.flying, true)
        receive(server, 'bb0101000000feffffff0201010100ffff0700ff0d0000cdcc4c3dcdcccc3d')
        server.send('update_player_game_type', { gamemode: 'survival', player_unique_id: UNIQUE_ID })
        await frame()
        assert.deepStrictEqual(told, [{ ...CREATIVE(SURVIVAL), flying: true }, CREATIVE(SURVIVAL), SURVIVAL])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it("takes a creative world's game mode at login, then its base layer, which servers write so (recorded)", async () => {
      const { bot, told } = await loggedIn(codec, { entity_id: UNIQUE_ID, world_gamemode: 'creative' }, 'bb0101000000feffffff0100010100ffff0f003f0d0000cdcc4c3d0000803fcdcccc3d')
      assert.deepStrictEqual([told, { ...bot.abilities }], [[CREATIVE(JAVA_DEFAULTS), CREATIVE(SURVIVAL)], CREATIVE(SURVIVAL)])
      bot.end()
    })

    it("leaves another player's abilities (recorded)", async () => {
      const { bot, server, told, frame } = await loggedIn(codec, { entity_id: UNIQUE_ID, player_gamemode: 'survival', world_gamemode: 'creative' }, 'bb0101000000feffffff0100010100ffff0f003f000000cdcc4c3d0000803fcdcccc3d')
      receive(server, 'bb011e000000feffffff0100010100ffff0f003f0d0000cdcc4c3d0000803fcdcccc3d')
      await frame()
      assert.deepStrictEqual([told, { ...bot.abilities }], [[SURVIVAL], SURVIVAL])
      bot.end()
    })

    it('lets a layer that allows an ability decide it over the layers below, in whatever order they come (written by hand)', async () => {
      const { bot, server, told, frame } = await loggedIn(codec, { entity_id: UNIQUE_ID })
      receive(server, updateAbilities(UNIQUE_ID, [
        { type: LAYERS.commands, allowed: BITS.mayFly | BITS.walkingSpeed, enabled: 0, walkingSpeed: 0.5 },
        { type: LAYERS.base, allowed: ALL, enabled: BITS.invulnerable | BITS.instantBuild, flyingSpeed: 0.25, walkingSpeed: 0.75 },
        { type: LAYERS.spectator, allowed: BITS.flying | BITS.mayFly | BITS.invulnerable, enabled: BITS.flying | BITS.mayFly },
        // below the base layer, and allowing nothing
        { type: LAYERS.cache, allowed: ALL, enabled: ALL, flyingSpeed: 2, walkingSpeed: 2 },
        { type: LAYERS.commands, allowed: 0, enabled: ALL, flyingSpeed: 2, walkingSpeed: 2 }
      ]))
      await frame()
      assert.deepStrictEqual(told, [{ invulnerable: false, flying: true, mayFly: false, instantBuild: true, flyingSpeed: 0.25, walkingSpeed: 0.5 }])
      bot.end()
    })

    it("takes a layer the version does not name by its number, and Java's ability where no layer allows it (written by hand)", async () => {
      const { bot, server, told, frame } = await loggedIn(codec, { entity_id: UNIQUE_ID })
      receive(server, updateAbilities(UNIQUE_ID, [
        { type: 9, allowed: BITS.flying | BITS.walkingSpeed, enabled: BITS.flying, walkingSpeed: 0.5 },
        { type: LAYERS.commands, allowed: BITS.flying | BITS.walkingSpeed | BITS.flyingSpeed, enabled: 0, flyingSpeed: 0.25, walkingSpeed: 0.75 }
      ]))
      await frame()
      assert.deepStrictEqual(told, [{ ...JAVA_DEFAULTS, flying: true, flyingSpeed: 0.25, walkingSpeed: 0.5 }])
      bot.end()
    })

    it("puts the game mode's abilities in the base layer, under the layers above it, and keeps a creative player's flight (written by hand)", async () => {
      const { bot, server, told, frame } = await loggedIn(codec, { entity_id: UNIQUE_ID })
      receive(server, updateAbilities(UNIQUE_ID, [{ type: LAYERS.spectator, allowed: BITS.mayFly, enabled: 0 }]))
      server.send('set_player_game_type', { gamemode: 'creative' })
      await frame()
      server.send('set_player_game_type', { gamemode: 'survival' })
      await frame()
      // flying in survival, which the game mode it has already leaves; then creative
      receive(server, updateAbilities(UNIQUE_ID, [{ type: LAYERS.base, allowed: ALL, enabled: BITS.flying }]))
      server.send('set_player_game_type', { gamemode: 'survival' })
      await frame()
      server.send('set_player_game_type', { gamemode: 'creative' })
      await frame()
      assert.deepStrictEqual(told, [
        JAVA_DEFAULTS,
        { ...JAVA_DEFAULTS, invulnerable: true, instantBuild: true },
        JAVA_DEFAULTS,
        { ...SURVIVAL, flying: true },
        { ...CREATIVE(SURVIVAL), flying: true }
      ])
      bot.end()
    })

    it("emits abilities after game when the game mode changes them, at the login too, as Java's server sends them", async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const events: string[] = []
      for (const name of ['login', 'game', 'abilities'] as const) bot.on(name, () => { events.push(name) })
      new ServerWorld(server).startGame(undefined, undefined, { entity_id: UNIQUE_ID, player_gamemode: 'fallback', world_gamemode: 'creative' })
      await driver.frame(0)
      server.send('set_player_game_type', { gamemode: 'survival' })
      await driver.frame(0)
      assert.deepStrictEqual(events, ['login', 'game', 'abilities', 'game', 'abilities'])
      bot.end()
    })

    it('follows the game mode without the game plugin (written by hand)', async () => {
      const { bot, server, told, frame } = await loggedInWith(codec, { plugins: { game: false } }, { entity_id: UNIQUE_ID, world_gamemode: 'creative' })
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      server.send('update_player_game_type', { gamemode: 'survival', player_unique_id: LOGIN_UNIQUE_ID })
      await frame()
      server.send('update_player_game_type', { gamemode: 'survival', player_unique_id: UNIQUE_ID })
      await frame()
      server.send('set_default_game_type', { gamemode: 'creative' })
      await frame()
      server.send('set_player_game_type', { gamemode: 'spectator' })
      await frame()
      assert.deepStrictEqual([bot.game, told, errors], [undefined, [CREATIVE(JAVA_DEFAULTS), JAVA_DEFAULTS, SPECTATOR(JAVA_DEFAULTS)], []])
      bot.end()
    })

    it("changes to the world's game mode while the player's falls back to it", async () => {
      const { bot, server, told, frame } = await loggedIn(codec, { entity_id: UNIQUE_ID })
      server.send('set_default_game_type', { gamemode: 'creative' })
      await frame()
      assert.deepStrictEqual(told, [CREATIVE(JAVA_DEFAULTS)])
      bot.end()
    })
  })
})
