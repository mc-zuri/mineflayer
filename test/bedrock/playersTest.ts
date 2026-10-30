import assert from 'assert'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, Player } from '../../lib/types/api/index.ts'
import { bedrockCodec, blankPacket } from './common/codec.ts'
import { atLeast, boundingBox, entry, flags, LOCAL_UNIQUE, placed, positionOf, receive, runtimeId, spawned, started, STILL, write } from './common/entities.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient } from './common/server.ts'
import type { Point3 } from './common/world.ts'

// The player list and the players the server shows, from the packets and values servers sent the vanilla client,
// recorded (small packets as their bytes): the local player McZuri5840 and a second player, observer_bot. Versions are
// grouped by how player_list, add_player, move_player and update_player_game_type are laid out; each group's tests run
// on each of its versions.

interface Listing {
  uuid: string
  unique: bigint
  username: string
}

interface AddedPlayer extends Listing {
  runtime: number
  position: Point3
  gamemode?: string
}

const LOCAL: Listing = Object.freeze({ uuid: '723f6e75-4bb8-c0dd-31c0-21d5e913d186', unique: LOCAL_UNIQUE, username: 'McZuri5840' })
const OBSERVER: Listing = Object.freeze({ uuid: '76302e00-d1d7-07b8-f09b-e7ef924372ba', unique: -8589934562n, username: 'observer_bot' })
/** the recorded observer_bot's metadata flags */
const OBSERVER_FLAGS = 844459290394624n
const FEET: Point3 = Object.freeze({ x: 0.5, y: -60, z: 0.5 })
/** where `tp observer_bot 3 -60 3` put its eye */
const TELEPORTED_EYE: Point3 = Object.freeze({ x: 3.5, y: -58.37998962402344, z: 3.5 })

/** a player_list add record as the version writes it, with a blank skin */
function record (server: FakeBedrockClient, { uuid, unique, username }: Listing): object {
  const version = server.codec.version
  const { skin } = blankPacket(server.codec, 'player_skin') as { skin: object }
  return {
    uuid,
    entity_unique_id: unique,
    username,
    xbox_user_id: '',
    platform_chat_id: '',
    build_platform: 12,
    skin_data: skin,
    is_teacher: false,
    is_host: false,
    ...atLeast(version, 'bedrock_1.20.61') ? { is_subclient: false } : {},
    ...atLeast(version, 'bedrock_1.21.80') ? { player_color: -43777 } : {},
    ...atLeast(version, 'bedrock_1.26.60') ? { play_fab_id: '' } : {}
  }
}

/** player_list as the version lays it out: one type for all the records up to 1.26.30, each record's own from 1.26.40 */
function list (server: FakeBedrockClient, type: 'add' | 'remove', ...players: Listing[]): void {
  const version = server.codec.version
  const records = players.map(player => type === 'add' ? record(server, player) : { uuid: player.uuid })
  if (atLeast(version, 'bedrock_1.26.40')) {
    write(server, 'player_list', { records: records.map(written => ({ type, legacy_type: type === 'add' ? 0 : 1, ...written })) })
    return
  }
  // verified only for an add from 1.16.220
  const verified = type === 'add' || !atLeast(version, 'bedrock_1.16.220') ? records.map(() => true) : undefined
  write(server, 'player_list', { records: { type, records_count: records.length, records, verified } })
}

/** add_player as the version lays it out: the unique id entity_id_self up to 1.18.11, unique_entity_id up to 1.19.1, then an li64 unique_id */
function addPlayer (version: BedrockVersion, { uuid, unique, username, runtime, position, gamemode }: AddedPlayer): object {
  const metadata = [flags(version, OBSERVER_FLAGS), entry(version, 'nametag', 'string', username), ...boundingBox(version, 0.6000000238418579, 1.7999999523162842)]
  const ids = atLeast(version, 'bedrock_1.19.10')
    ? { unique_id: unique, runtime_id: BigInt(runtime) }
    : atLeast(version, 'bedrock_1.18.30')
      ? { unique_entity_id: unique, runtime_entity_id: BigInt(runtime) }
      : { entity_id_self: unique, runtime_entity_id: runtimeId(version, runtime) }
  return { uuid, username, ...ids, ...placed(version, position, STILL), pitch: 0, yaw: 0, head_yaw: 0, metadata, ...gamemode === undefined ? {} : { gamemode } }
}

/** the player and entity events from now, each with its player's or entity's name, and login */
function heard (bot: BedrockBot): string[] {
  const events: string[] = []
  for (const name of ['playerJoined', 'playerUpdated', 'playerLeft'] as const) bot.on(name, (player: Player) => { events.push(`${name} ${player.username}`) })
  for (const name of ['entitySpawn', 'entityGone', 'entityMoved'] as const) bot.on(name, entity => { events.push(`${name} ${entity.username ?? entity.id}`) })
  bot.on('login', () => { events.push('login') })
  bot.on('error', error => { events.push(`error ${error.message}`) })
  return events
}

function listed (bot: BedrockBot, username: string): Player {
  const player = bot.players[username]
  assert.ok(player !== undefined, `${username} is not listed`)
  return player
}

describe('bedrock players', () => {
  const listLayouts: Array<[string, BedrockVersion, BedrockVersion, string | undefined]> = [
    ['one type for all the records, verified either way (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210', undefined],
    ['one type for all the records, an add verified (1.16.220 – 1.20.50)', 'bedrock_1.16.220', 'bedrock_1.20.50', '3f010176302e00d1d707b8f09be7ef924372ba'],
    ['whether a record is a subclient (1.20.61 – 1.21.70)', 'bedrock_1.20.61', 'bedrock_1.21.70', '3f010176302e00d1d707b8f09be7ef924372ba'],
    ["a record's color (1.21.80 – 1.26.30)", 'bedrock_1.21.80', 'bedrock_1.26.30', '3f010176302e00d1d707b8f09be7ef924372ba'],
    ["each record's own type (1.26.40 – 1.26.51)", 'bedrock_1.26.40', 'bedrock_1.26.51', '3f01000176302e00d1d707b8f09be7ef924372ba'],
    ["each record's own type and its PlayFab id (1.26.60)", 'bedrock_1.26.60', latestSupportedBedrockVersion, '3f01000176302e00d1d707b8f09be7ef924372ba']
  ]
  for (const [layout, from, to, recordedRemoval] of listLayouts) {
    describe(`servers sending player_list with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: lists the local player before login and the others as they come; a player leaves in the packet pass, its entity at the end of the next tick`, async () => {
          const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = heard(bot)
          list(server, 'add', LOCAL)
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), bot.player, listed(bot, 'McZuri5840').entity], [['playerJoined McZuri5840'], undefined, null])
          server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: 3n })
          list(server, 'add', LOCAL)
          list(server, 'add', OBSERVER)
          await driver.frame(0)
          assert.deepStrictEqual(events.splice(0), ['login', 'playerUpdated McZuri5840', 'playerJoined observer_bot'])
          assert.deepStrictEqual([bot.player, bot.player.entity, Object.keys(bot.players)], [listed(bot, 'McZuri5840'), bot.entity, ['McZuri5840', 'observer_bot']])
          const observer = listed(bot, 'observer_bot')
          const { uuid, username, gamemode, ping, entity, skinData } = observer
          assert.deepStrictEqual([uuid, username, gamemode, ping, entity, skinData, observer.displayName.toString()], [OBSERVER.uuid, 'observer_bot', 0, 0, null, undefined, 'observer_bot'])
          write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 20, position: FEET }))
          await driver.frame(0)
          const observerEntity = spawned(bot, 20)
          assert.deepStrictEqual([events.splice(0), observer.entity], [['entitySpawn observer_bot'], observerEntity])
          receive(server, '0ec3ffffff3f')
          if (recordedRemoval === undefined) list(server, 'remove', OBSERVER)
          else receive(server, recordedRemoval)
          list(server, 'remove', { ...OBSERVER, uuid: '00000000-0000-0000-0000-000000000001' }, LOCAL)
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), observer.entity, Object.keys(bot.players), bot.entities[20]], [['playerLeft observer_bot'], null, ['McZuri5840'], observerEntity])
          assert.deepStrictEqual([internal._entities.stats.unlisted, internal._entities.stats.local], [1, 1])
          await driver.tick()
          assert.deepStrictEqual([events, bot.entities[20], bot.player.entity], [['entityGone observer_bot'], undefined, bot.entity])
          bot.end()
        })
      }
    })
  }

  const addPlayerLayouts: Array<[string, BedrockVersion, BedrockVersion, string | undefined, number]> = [
    ['x, y, z and the speeds (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210', undefined, 0],
    ['a position and a velocity (1.16.220 – 1.18.11)', 'bedrock_1.16.220', 'bedrock_1.18.11', undefined, 0],
    ['the unique id renamed, and a game mode (1.18.30 – 1.19.1)', 'bedrock_1.18.30', 'bedrock_1.19.1', 'creative', 1],
    ['an li64 unique id (1.19.10 – 1.26.60)', 'bedrock_1.19.10', latestSupportedBedrockVersion, 'creative', 1]
  ]
  for (const [layout, from, to, gamemode, javaGamemode] of addPlayerLayouts) {
    describe(`servers sending add_player with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: spawns a listed player in the packet pass, at its feet, as its player's entity; one not listed not`, async () => {
          const { bot, internal, server, driver } = await started(version, 3)
          list(server, 'add', OBSERVER)
          await driver.frame(0)
          const events = heard(bot)
          write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 20, position: FEET, ...gamemode === undefined ? {} : { gamemode } }))
          write(server, 'add_player', addPlayer(version, { ...OBSERVER, uuid: '00000000-0000-0000-0000-000000000001', unique: -5n, runtime: 21, position: FEET }))
          await driver.frame(0)
          assert.deepStrictEqual([events, Object.keys(bot.entities), internal._entities.stats.unlisted], [['entitySpawn observer_bot'], ['3', '20'], 1])
          const entity = spawned(bot, 20)
          const { type, name, username, uuid, eyeHeight, width, height } = entity
          assert.deepStrictEqual({ type, name, username, uuid, eyeHeight, width, height }, { type: 'player', name: 'player', username: 'observer_bot', uuid: OBSERVER.uuid, eyeHeight: Math.fround(1.62001), width: 0.6000000238418579, height: 1.7999999523162842 })
          assert.deepStrictEqual([positionOf(entity), entity.metadata[0], entity.getCustomName()?.toString()], [FEET, OBSERVER_FLAGS, 'observer_bot'])
          const observer = listed(bot, 'observer_bot')
          assert.deepStrictEqual([observer.entity, internal._entities.byUniqueId(OBSERVER.unique), observer.gamemode], [entity, entity, javaGamemode])
          bot.end()
        })

        it(`bedrock ${version}: ${gamemode === undefined ? 'keeps the game mode known, as add_player tells none' : "gives the player the game mode add_player tells, the fallback the world's"}`, async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: 3n, world_gamemode: 'creative' })
          list(server, 'add', OBSERVER)
          write(server, 'update_player_game_type', { gamemode: 'adventure', player_unique_id: OBSERVER.unique })
          write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 20, position: FEET, ...gamemode === undefined ? {} : { gamemode: 'fallback' } }))
          await driver.frame(0)
          assert.strictEqual(listed(bot, 'observer_bot').gamemode, gamemode === undefined ? 2 : 1)
          bot.end()
        })
      }
    })
  }

  const movePlayerLayouts: Array<[string, BedrockVersion, BedrockVersion, string, number]> = [
    ['the teleport by the mode (1.16.201 – 1.26.30)', 'bedrock_1.16.201', 'bedrock_1.26.30', '1317000060401c8569c200006040000000000000000000000000020000030000000100000000', 23],
    ['the teleport an option (1.26.40 – 1.26.60)', 'bedrock_1.26.40', latestSupportedBedrockVersion, '1314000060401c8569c20000604000000000000000000000000002000001030000000100000000', 20]
  ]
  for (const [layout, from, to, teleported, runtime] of movePlayerLayouts) {
    describe(`servers sending move_player with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: moves another player to the feet under the eye it tells, in the packet pass; the local player is movement's`, async () => {
          const { bot, internal, server, driver } = await started(version, 3)
          list(server, 'add', OBSERVER)
          write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime, position: FEET }))
          await driver.frame(0)
          const events = heard(bot)
          const entity = spawned(bot, runtime)
          receive(server, teleported)
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), positionOf(entity), entity.onGround], [['entityMoved observer_bot'], { x: 3.5, y: -60, z: 3.5 }, false])
          write(server, 'move_player', { runtime_id: runtime, position: FEET, pitch: 45, yaw: 90, head_yaw: 180, on_ground: true })
          write(server, 'move_player', { runtime_id: 3, position: TELEPORTED_EYE, mode: 'rotation' })
          write(server, 'move_player', { runtime_id: 9, position: TELEPORTED_EYE })
          await driver.frame(0)
          assert.deepStrictEqual([events, positionOf(entity), entity.pitch, entity.yaw, entity.headYaw, entity.onGround], [['entityMoved observer_bot'], { x: 0.5, y: Math.fround(-60 - Math.fround(1.62001)), z: 0.5 }, -Math.PI / 4, Math.PI / 2, 0, true])
          assert.deepStrictEqual([internal._entities.stats.local, internal._entities.stats.unknownEntity], [1, 1])
          bot.end()
        })
      }
    })
  }

  const gameTypeLayouts: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['without a tick (1.16.201 – 1.20.71)', 'bedrock_1.16.201', 'bedrock_1.20.71'],
    ['a varint tick (1.20.80 – 1.21.30)', 'bedrock_1.20.80', 'bedrock_1.21.30'],
    ['a varint64 tick (1.21.42 – 1.26.60)', 'bedrock_1.21.42', latestSupportedBedrockVersion]
  ]
  for (const [layout, from, to] of gameTypeLayouts) {
    describe(`servers sending update_player_game_type with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: gives a listed player Java's game mode, the fallback the world's, emitting playerUpdated`, async () => {
          const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version))
          list(server, 'add', LOCAL)
          server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: 3n, player_gamemode: 'fallback', world_gamemode: 'creative' })
          list(server, 'add', OBSERVER)
          await driver.frame(0)
          assert.deepStrictEqual([bot.player.entity, bot.player.gamemode, listed(bot, 'observer_bot').gamemode], [bot.entity, 1, 1])
          const updated: Array<[string, number]> = []
          bot.on('playerUpdated', player => { updated.push([player.username, player.gamemode]) })
          const tick = atLeast(version, 'bedrock_1.21.42') ? { tick: 378n } : atLeast(version, 'bedrock_1.20.80') ? { tick: 378 } : {}
          const spectators = atLeast(version, 'bedrock_1.18.30') ? ['survival_spectator', 'creative_spectator', 'spectator'] : ['survival_spectator', 'creative_spectator']
          for (const gamemode of ['adventure', ...spectators, 'fallback', 'survival']) write(server, 'update_player_game_type', { gamemode, player_unique_id: LOCAL_UNIQUE, ...tick })
          write(server, 'update_player_game_type', { gamemode: 'adventure', player_unique_id: OBSERVER.unique, ...tick })
          write(server, 'update_player_game_type', { gamemode: 'creative', player_unique_id: -5n, ...tick })
          await driver.frame(0)
          assert.deepStrictEqual(updated, [['McZuri5840', 2], ...spectators.map((): [string, number] => ['McZuri5840', 3]), ['McZuri5840', 1], ['McZuri5840', 0], ['observer_bot', 2]])
          assert.strictEqual(internal._entities.stats.unlisted, 1)
          bot.end()
        })
      }
    })
  }

  describe('servers moving a player with move_entity and move_entity_delta (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: takes the position as the player's eye, as move_player's`, async () => {
        const { bot, server, driver } = await started(version, 3)
        list(server, 'add', OBSERVER)
        write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 20, position: FEET }))
        await driver.frame(0)
        const entity = spawned(bot, 20)
        write(server, 'move_entity', { runtime_entity_id: runtimeId(version, 20), flags: 1, position: TELEPORTED_EYE, rotation: { yaw: 0, pitch: 0, head_yaw: 0 } })
        await driver.frame(0)
        assert.deepStrictEqual(positionOf(entity), { x: 3.5, y: -60, z: 3.5 })
        const delta = (fields: object, ...present: string[]): object => atLeast(version, 'bedrock_1.26.40')
          ? fields
          : { flags: { _value: present.reduce((bits, name) => bits | (name === 'has_x' ? 1 : 2), 0), has_x: present.includes('has_x'), has_y: present.includes('has_y') }, ...fields }
        write(server, 'move_entity_delta', { runtime_entity_id: 20n, ...delta({ x: 1.5 }, 'has_x') })
        await driver.frame(0)
        assert.deepStrictEqual(positionOf(entity), { x: 1.5, y: -60, z: 3.5 })
        write(server, 'move_entity_delta', { runtime_entity_id: 20n, ...delta({ y: -57.37998962402344 }, 'has_y') })
        await driver.frame(0)
        assert.deepStrictEqual(positionOf(entity), { x: 1.5, y: Math.fround(-57.37998962402344 - Math.fround(1.62001)), z: 3.5 })
        bot.end()
      })
    }
  })

  describe('servers alike on every version (the latest)', () => {
    const version = latestSupportedBedrockVersion

    it('lists the local player first after start_game with its game mode and entity', async () => {
      const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
      server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: 3n, player_gamemode: 'adventure', world_gamemode: 'creative' })
      list(server, 'add', LOCAL, OBSERVER)
      await driver.frame(0)
      assert.deepStrictEqual([bot.player, bot.player.entity, bot.player.gamemode, listed(bot, 'observer_bot').gamemode], [listed(bot, 'McZuri5840'), bot.entity, 2, 1])
      bot.end()
    })

    it('leaves a player without its entity once the entity is gone, and gives it back the entity the server shows when it is listed again', async () => {
      const { bot, server, driver } = await started(version, 3)
      const events = heard(bot)
      list(server, 'add', OBSERVER)
      write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 20, position: FEET }))
      await driver.frame(0)
      const first = spawned(bot, 20)
      receive(server, '0ec3ffffff3f')
      await driver.tick()
      assert.strictEqual(listed(bot, 'observer_bot').entity, null)
      write(server, 'add_player', addPlayer(version, { ...OBSERVER, runtime: 22, position: FEET }))
      list(server, 'remove', OBSERVER)
      list(server, 'add', OBSERVER)
      await driver.frame(0)
      const again = listed(bot, 'observer_bot')
      assert.deepStrictEqual([again.entity, again.entity === first], [spawned(bot, 22), false])
      list(server, 'add', OBSERVER)
      await driver.frame(0)
      assert.deepStrictEqual(events, ['playerJoined observer_bot', 'entitySpawn observer_bot', 'entityGone observer_bot', 'entitySpawn observer_bot', 'playerLeft observer_bot', 'playerJoined observer_bot', 'playerUpdated observer_bot'])
      assert.strictEqual(listed(bot, 'observer_bot').entity, spawned(bot, 22))
      bot.end()
    })

    it('handles no player packet without its plugin', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { entities: false, scoreboard: false } })
      list(server, 'add', LOCAL)
      await driver.frame(0)
      assert.deepStrictEqual([bot.players, internal._core.stats.packets.get('player_list')], [undefined, { handled: 0, threw: 0, unhandled: 1 }])
      bot.end()
    })
  })
})
