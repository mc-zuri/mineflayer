import assert from 'assert'
import { isBedrockVersionAtLeast, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, ScoreBoardItem } from '../../lib/types/api/index.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient } from './common/server.ts'
import { bedrockCodec } from './common/codec.ts'
import { playerListAdd, playerListRemove } from './common/players.ts'
import type { ListedPlayer } from './common/players.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'

// The packets are those servers sent the vanilla Bedrock client, recorded on 1.26.20 (the layout of 1.16.220 – 1.26.30)
// and 1.26.60 (1.26.40+): `scoreboard objectives setdisplay`, `scoreboard players set / add / reset` of the player,
// a fake player and an armor stand, and `scoreboard objectives remove`. Versions are grouped by set_score's layout.

const MC_ZURI: ListedPlayer = { uuid: '723f6e75-4bb8-c0dd-31c0-21d5e913d186', uniqueId: -8589934591n, username: 'McZuri5840' }
const OBSERVER_BOT: ListedPlayer = { uuid: '5f2b7c8a-1d3e-4f60-8a9b-0c1d2e3f4a5b', uniqueId: -8589934562n, username: 'observer_bot' }

// the same bytes on every version
const DISPLAY = {
  /** the login's: observer_players in the sidebar, descending */
  observerPlayers: '6b0773696465626172106f627365727665725f706c6179657273106f627365727665725f706c61796572730564756d6d7902',
  clearSidebar: '6b077369646562617200000000',
  sidebar: '6b0773696465626172086f62736572766572084f627365727665720564756d6d7902',
  list: '6b046c697374086f62736572766572084f627365727665720564756d6d7902',
  belowname: '6b0962656c6f776e616d65086f62736572766572084f627365727665720564756d6d7902',
  removeObserver: '6a086f62736572766572'
}

interface RecordedScores {
  /** observer_bot's score 4 in observer_players, scoreboard id 1 */
  login: string
  /** in observer: the player 5 (id 2), the fake player 3 (id 3), the armor stand 7 (id 4), the player 6 */
  set: [string, string, string, string]
  /** the resets of the fake player, the armor stand and the player */
  reset: [string, string, string]
}

const ONE_ACTION: RecordedScores = {
  login: '6c000102106f627365727665725f706c61796572730400000001c3ffffff3f',
  set: [
    '6c000104086f627365727665720500000001fdffffff3f',
    '6c000106086f6273657276657203000000030d6f627365727665725f66616b65',
    '6c000108086f627365727665720700000002c1ffffff3f',
    '6c000104086f627365727665720600000001fdffffff3f'
  ],
  reset: ['6c010106086f6273657276657203000000', '6c010108086f6273657276657207000000', '6c010104086f6273657276657206000000']
}

const EACH_ITS_TYPE: RecordedScores = {
  login: '6c01010c6368616e6765706c6179657202106f627365727665725f706c617965727304000000c3ffffff3f',
  set: [
    '6c01010c6368616e6765706c6179657204086f6273657276657205000000fdffffff3f',
    '6c0103106368616e676566616b65706c6179657206086f62736572766572030000000d6f627365727665725f66616b65',
    '6c01020c6368616e6765656e7469747908086f6273657276657207000000c1ffffff3f',
    '6c01010c6368616e6765706c6179657204086f6273657276657206000000fdffffff3f'
  ],
  reset: ['6c01000672656d6f76650601086f62736572766572', '6c01000672656d6f76650801086f62736572766572', '6c01000672656d6f76650401086f62736572766572']
}

type SetScore = Partial<ClientboundPacketsToWrite['set_score']>

/** a score set (a player's by its unique id, else a fake player's by its name) as the version's servers write it */
function scoreSet (version: BedrockVersion, objective: string, scoreboardId: bigint, score: number, who: { fake: string } | { player: bigint }): SetScore {
  const identity = 'fake' in who ? { entry_type: 'fake_player' as const, custom_name: who.fake } : { entry_type: 'player' as const, entity_unique_id: who.player }
  const entry = { scoreboard_id: scoreboardId, objective_name: objective, score, ...identity }
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.40')) return { action: 'change', entries: [entry] }
  return { entries: [{ ...entry, entry_type_name: 'fake' in who ? 'changefakeplayer' : 'changeplayer' }] }
}

function scoreReset (version: BedrockVersion, objective: string, scoreboardId: bigint): SetScore {
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.40')) return { action: 'remove', entries: [{ scoreboard_id: scoreboardId, objective_name: objective, score: 0 }] }
  return { entries: [{ entry_type: 'remove', entry_type_name: 'remove', scoreboard_id: scoreboardId, objective_name: objective }] }
}

function display (slot: string, objective: string, displayName = objective, sortOrder = 1): Partial<ClientboundPacketsToWrite['set_display_objective']> {
  return { display_slot: slot, objective_name: objective, display_name: displayName, criteria_name: 'dummy', sort_order: sortOrder }
}

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** the scoreboard events, in order, each as a line */
function scoreboardEvents (bot: BedrockBot): string[] {
  const events: string[] = []
  const item = ({ name, value, displayName }: ScoreBoardItem): string => `${name} ${value} (${displayName.toString()})`
  bot.on('scoreboardCreated', board => { events.push(`created ${board.name} '${board.title.toString()}'`) })
  bot.on('scoreboardTitleChanged', board => { events.push(`title ${board.name} '${board.title.toString()}'`) })
  bot.on('scoreboardPosition', (slot, board, previous) => { events.push(`position ${slot} ${board.name} after ${previous?.name ?? 'none'}`) })
  bot.on('scoreboardDeleted', board => { events.push(`deleted ${board.name}`) })
  bot.on('scoreUpdated', (board, updated) => { events.push(`updated ${board.name} ${item(updated)}`) })
  bot.on('scoreRemoved', (board, removed) => { events.push(`removed ${board.name} ${item(removed)} ${removed.name in board.itemsMap ? 'kept' : 'gone'}`) })
  bot.on('error', error => { events.push(`error ${error.message}`) })
  return events
}

function itemsOf (bot: BedrockBot, objective: string): string[] {
  return bot.scoreboards[objective]!.items.map(({ name, value }) => `${name} ${value}`)
}

function sentByScoreboard (server: FakeBedrockClient): string[] {
  return server.batches.flat().filter(packet => ['scoreboard', 'team', 'tablist'].includes(packet.owner)).map(packet => packet.name)
}

async function recordedFlow (version: BedrockVersion, scores: RecordedScores): Promise<void> {
  const codec = bedrockCodec(version)
  const { bot, server, driver } = await bedrockTestBot(codec)
  const events = scoreboardEvents(bot)
  const { scoreboards, scoreboard, teams, teamMap } = bot
  server.receive(playerListAdd(codec, MC_ZURI))
  receive(server, DISPLAY.observerPlayers, scores.login)
  await driver.frame(0)
  assert.deepStrictEqual(events.splice(0), [
    "created observer_players 'observer_players'",
    'position 1 observer_players after none',
    'updated observer_players -8589934562 4 (-8589934562)'
  ])
  assert.strictEqual(bot.scoreboard.sidebar, bot.scoreboards['observer_players'])

  receive(server, DISPLAY.clearSidebar)
  await driver.frame(0)
  assert.deepStrictEqual([events.splice(0), bot.scoreboard.sidebar], [[], undefined])

  receive(server, DISPLAY.sidebar, DISPLAY.list, DISPLAY.belowname)
  await driver.frame(0)
  assert.deepStrictEqual(events.splice(0), ["created observer 'Observer'", 'position 1 observer after none', 'position 0 observer after none', 'position 2 observer after none'])
  const observer = bot.scoreboards['observer']
  assert.deepStrictEqual(Object.keys(bot.scoreboard), ['0', '1', '2'])
  assert.deepStrictEqual([bot.scoreboard.list, bot.scoreboard.sidebar, bot.scoreboard.belowName], [observer, observer, observer])

  receive(server, ...scores.set)
  await driver.frame(0)
  assert.deepStrictEqual(events.splice(0), [
    'updated observer McZuri5840 5 (McZuri5840)',
    'updated observer observer_fake 3 (observer_fake)',
    'updated observer -8589934561 7 (-8589934561)',
    'updated observer McZuri5840 6 (McZuri5840)'
  ])
  assert.deepStrictEqual(itemsOf(bot, 'observer'), ['-8589934561 7', 'McZuri5840 6', 'observer_fake 3'])

  receive(server, ...scores.reset)
  await driver.frame(0)
  assert.deepStrictEqual(events.splice(0), [
    'removed observer observer_fake 3 (observer_fake) gone',
    'removed observer -8589934561 7 (-8589934561) gone',
    'removed observer McZuri5840 6 (McZuri5840) gone'
  ])
  assert.deepStrictEqual(observer?.itemsMap, {})

  receive(server, DISPLAY.clearSidebar, DISPLAY.removeObserver)
  await driver.frame(0)
  assert.deepStrictEqual(events.splice(0), ['deleted observer'])
  assert.deepStrictEqual(Object.keys(bot.scoreboards), ['observer_players'])
  assert.deepStrictEqual([Object.keys(bot.scoreboard), bot.scoreboard.list, bot.scoreboard.belowName], [[], undefined, undefined])
  // one object each for the bot's life; Bedrock has no teams
  assert.ok(bot.scoreboards === scoreboards && bot.scoreboard === scoreboard && bot.teams === teams && bot.teamMap === teamMap)
  assert.deepStrictEqual([bot.teams, bot.teamMap], [{}, {}])
  assert.deepStrictEqual(sentByScoreboard(server), [])
  bot.end()
}

async function namesTheLoginEntry (version: BedrockVersion, scores: RecordedScores): Promise<void> {
  const codec = bedrockCodec(version)
  const { bot, server, driver } = await bedrockTestBot(codec)
  const events = scoreboardEvents(bot)
  server.receive(playerListAdd(codec, OBSERVER_BOT))
  receive(server, DISPLAY.observerPlayers, scores.login)
  await driver.frame(0)
  assert.deepStrictEqual(events.slice(2), ['updated observer_players observer_bot 4 (observer_bot)'])
  bot.end()
}

describe('bedrock scoreboards', () => {
  describe('servers sending one action for the packet\'s entries (1.16.220 – 1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220', 'bedrock_1.26.30')) {
      describe(`bedrock ${version}`, () => {
        it('follows the recorded objectives and scores', async () => { await recordedFlow(version, ONE_ACTION) })
        it('names a player the player list has by its username', async () => { await namesTheLoginEntry(version, ONE_ACTION) })
      })
    }
  })

  describe('servers sending each entry with its own type (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      describe(`bedrock ${version}`, () => {
        it('follows the recorded objectives and scores', async () => { await recordedFlow(version, EACH_ITS_TYPE) })
        it('names a player the player list has by its username', async () => { await namesTheLoginEntry(version, EACH_ITS_TYPE) })

        it('removes an entry from every objective when the removal names none', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = scoreboardEvents(bot)
          server.send('set_display_objective', display('sidebar', 'a'))
          server.send('set_display_objective', display('list', 'b'))
          server.send('set_score', scoreSet(version, 'a', 2n, 5, { fake: 'observer_fake' }))
          server.send('set_score', scoreSet(version, 'b', 2n, 6, { fake: 'observer_fake' }))
          server.send('set_score', scoreSet(version, 'b', 3n, 1, { fake: 'other' }))
          await driver.frame(0)
          events.splice(0)
          server.send('set_score', { entries: [{ entry_type: 'remove', entry_type_name: 'remove', scoreboard_id: 2n }] })
          await driver.frame(0)
          assert.deepStrictEqual(events, ['removed a observer_fake 5 (observer_fake) gone', 'removed b observer_fake 6 (observer_fake) gone'])
          assert.deepStrictEqual(itemsOf(bot, 'b'), ['other 1'])
          bot.end()
        })
      })
    }
  })

  describe('1.16.201 – 1.16.210, whose set_score minecraft-data misreads', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.16.210')) {
      it(`bedrock ${version}: reports the scores as an error and follows the objectives`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const events = scoreboardEvents(bot)
        receive(server, DISPLAY.sidebar)
        server.send('set_score', { entries: { type: 'change', entries: [{ scoreboard_id: 1n, objective_name: 'observer', score: 5 }] } })
        receive(server, DISPLAY.removeObserver)
        await driver.frame(0)
        assert.deepStrictEqual(events, [
          "created observer 'Observer'",
          'position 1 observer after none',
          `error set_score cannot be read on ${version}: minecraft-data's layout of its entries is wrong`,
          'deleted observer'
        ])
        bot.end()
      })
    }
  })

  describe('every version from 1.16.220, the scores in the version\'s layout', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220')) {
      describe(`bedrock ${version}`, () => {
        it('ignores the scores of objectives not displayed and the removal of entries it does not have', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = scoreboardEvents(bot)
          server.send('set_display_objective', display('sidebar', 'shown'))
          server.send('set_score', scoreSet(version, 'hidden', 1n, 5, { fake: 'observer_fake' }))
          server.send('set_score', scoreSet(version, 'shown', 1n, 5, { fake: 'observer_fake' }))
          server.send('set_score', scoreReset(version, 'shown', 2n))
          server.send('set_score', scoreReset(version, 'hidden', 1n))
          await driver.frame(0)
          assert.deepStrictEqual(events.slice(2), ['updated shown observer_fake 5 (observer_fake)'])
          assert.deepStrictEqual(Object.keys(bot.scoreboards), ['shown'])
          bot.end()
        })

        it('sorts the items as the objective is displayed, then by name ignoring case', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          server.send('set_display_objective', display('sidebar', 'up', 'up', 0))
          server.send('set_display_objective', display('sidebar', 'down', 'down', 1))
          for (const objective of ['up', 'down']) {
            for (const [id, name, score] of [[1n, 'B', 2], [2n, 'C', 1], [3n, 'a', 2], [4n, 'c', 1]] as const) {
              server.send('set_score', scoreSet(version, objective, id, score, { fake: name }))
            }
          }
          await driver.frame(0)
          assert.deepStrictEqual(itemsOf(bot, 'up'), ['C 1', 'c 1', 'a 2', 'B 2'])
          assert.deepStrictEqual(itemsOf(bot, 'down'), ['a 2', 'B 2', 'C 1', 'c 1'])
          server.send('set_display_objective', display('list', 'up', 'up', 1))
          server.send('set_display_objective', display('list', 'down', 'down', 0))
          await driver.frame(0)
          assert.deepStrictEqual(itemsOf(bot, 'up'), ['a 2', 'B 2', 'C 1', 'c 1'])
          assert.deepStrictEqual(itemsOf(bot, 'down'), ['C 1', 'c 1', 'a 2', 'B 2'])
          bot.end()
        })

        it('keeps the item of the last entry of a name', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = scoreboardEvents(bot)
          server.send('set_display_objective', display('sidebar', 'shown'))
          server.send('set_score', scoreSet(version, 'shown', 1n, 5, { fake: 'twice' }))
          server.send('set_score', scoreSet(version, 'shown', 2n, 6, { fake: 'twice' }))
          server.send('set_score', scoreReset(version, 'shown', 1n))
          await driver.frame(0)
          assert.deepStrictEqual(itemsOf(bot, 'shown'), ['twice 6'])
          server.send('set_score', scoreReset(version, 'shown', 2n))
          await driver.frame(0)
          assert.deepStrictEqual(events.slice(2), ['updated shown twice 5 (twice)', 'updated shown twice 6 (twice)', 'removed shown twice 6 (twice) gone'])
          bot.end()
        })

        it("names a player's entry by the player list when its score is set", async () => {
          const codec = bedrockCodec(version)
          const { bot, server, driver } = await bedrockTestBot(codec)
          const events = scoreboardEvents(bot)
          const { uniqueId } = OBSERVER_BOT
          server.send('set_display_objective', display('sidebar', 'shown'))
          server.send('set_score', scoreSet(version, 'shown', 1n, 4, { player: uniqueId }))
          server.receive(playerListAdd(codec, OBSERVER_BOT))
          server.send('set_score', scoreSet(version, 'shown', 1n, 5, { player: uniqueId }))
          server.receive(playerListRemove(codec, OBSERVER_BOT.uuid))
          server.send('set_score', scoreSet(version, 'shown', 1n, 6, { player: uniqueId }))
          await driver.frame(0)
          assert.deepStrictEqual(events.slice(2), [
            'updated shown -8589934562 4 (-8589934562)',
            'removed shown -8589934562 4 (-8589934562) gone',
            'updated shown observer_bot 5 (observer_bot)',
            'removed shown observer_bot 5 (observer_bot) gone',
            'updated shown -8589934562 6 (-8589934562)'
          ])
          assert.deepStrictEqual(itemsOf(bot, 'shown'), ['-8589934562 6'])
          bot.end()
        })
      })
    }
  })

  describe('every version', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      describe(`bedrock ${version}`, () => {
        it('takes a display name as Bedrock text, and a new one as a new title', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = scoreboardEvents(bot)
          const titles: object[] = []
          bot.on('scoreboardCreated', board => { titles.push(board.title.json) })
          server.send('set_display_objective', display('sidebar', 'obs', '§aObs'))
          server.send('set_display_objective', display('list', 'obs', '§aObs'))
          server.send('set_display_objective', display('belowname', 'obs', 'Renamed'))
          server.send('set_display_objective', display('sidebar', 'obs', 'Renamed'))
          await driver.frame(0)
          assert.deepStrictEqual(events, [
            "created obs 'Obs'",
            'position 1 obs after none',
            'position 0 obs after none',
            "title obs 'Renamed'",
            'position 2 obs after none',
            'position 1 obs after obs'
          ])
          server.send('set_display_objective', display('sidebar', 'obs', '§aObs'))
          await driver.frame(0)
          titles.push(bot.scoreboards['obs']!.title.json)
          assert.deepStrictEqual(titles, [{ text: 'Obs', color: 'green' }, { text: 'Obs', color: 'green' }])
          bot.end()
        })

        it('deletes a removed objective from the slots showing it, and creates it again when it is displayed again', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          server.send('set_display_objective', display('sidebar', 'a'))
          server.send('set_display_objective', display('list', 'a'))
          server.send('set_display_objective', display('belowname', 'b'))
          await driver.frame(0)
          const events = scoreboardEvents(bot)
          bot.on('scoreboardDeleted', () => { events.push(`deleted while ${Object.keys(bot.scoreboards).join(' ')} shown in ${Object.keys(bot.scoreboard).join(' ')}`) })
          server.send('remove_objective', { objective_name: 'a' })
          await driver.frame(0)
          assert.deepStrictEqual([Object.keys(bot.scoreboards), Object.keys(bot.scoreboard), bot.scoreboard.belowName?.name], [['b'], ['2'], 'b'])
          server.send('set_display_objective', display('sidebar', 'a'))
          await driver.frame(0)
          assert.deepStrictEqual(events, ['deleted a', 'deleted while a b shown in 0 1 2', "created a 'a'", 'position 1 a after none'])
          bot.end()
        })

        it('ignores a slot it does not know, and the removal of an objective not displayed', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
          const events = scoreboardEvents(bot)
          server.send('set_display_objective', display('hotbar', 'obs'))
          server.send('remove_objective', { objective_name: 'obs' })
          await driver.frame(0)
          assert.deepStrictEqual([events, bot.scoreboards, Object.keys(bot.scoreboard)], [[], {}, []])
          bot.end()
        })

        it('has no teams, and an empty tab list header and footer', async () => {
          const { bot } = await bedrockTestBot(bedrockCodec(version))
          assert.deepStrictEqual([bot.teams, bot.teamMap], [{}, {}])
          assert.deepStrictEqual([bot.tablist.header.toString(), bot.tablist.footer.toString()], ['', ''])
          bot.end()
        })

        it('has none of it with the plugins disabled', async () => {
          const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { scoreboard: false, team: false, tablist: false } })
          const events = scoreboardEvents(bot)
          receive(server, DISPLAY.sidebar)
          await driver.frame(0)
          assert.deepStrictEqual([events, 'scoreboards' in bot, 'scoreboard' in bot, 'teams' in bot, 'teamMap' in bot, 'tablist' in bot], [[], false, false, false, false, false])
          bot.end()
        })
      })
    }
  })
})
