import assert from 'assert'
import type { ChatMessage } from 'prismarine-chat'
import { latestSupportedBedrockVersion, testedBedrockVersions } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockBotOptions, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { ManualDriver } from './common/driver.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'

// The packets and values are those servers sent the vanilla Bedrock client, recorded on every version, small ones as
// their bytes. Versions are grouped by how their servers lay out the text, a command's output and an action bar
// title; each group's tests run on each of its versions.

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return testedBedrockVersions.indexOf(version) >= testedBedrockVersions.indexOf(since)
}

type TextType = Exclude<ClientboundPacketsToWrite['text']['type'], number>
type Text = Omit<Partial<ClientboundPacketsToWrite['text']>, 'type'> & { type: TextType }
type Category = 'message_only' | 'authored' | 'parameters'

const CATEGORIES: Record<TextType, Category> = {
  raw: 'message_only',
  tip: 'message_only',
  system: 'message_only',
  json_whisper: 'message_only',
  json_announcement: 'message_only',
  json: 'message_only',
  chat: 'authored',
  whisper: 'authored',
  announcement: 'authored',
  translation: 'parameters',
  popup: 'parameters',
  jukebox_popup: 'parameters'
}

/** the names of the category's types, which 1.21.130 writes before the type */
const TYPE_NAMES: Record<Category, string[]> = {
  message_only: ['raw', 'tip', 'system_message', 'text_object_whisper', 'text_object_announcement', 'text_object'],
  authored: ['chat', 'whisper', 'announcement'],
  parameters: ['translate', 'popup', 'jukebox_popup']
}

/** a text packet in the version's layout: from 1.21.0 a filtered message, from 1.21.130 the type's category (on 1.21.130 with its type names) */
function sendText (server: FakeBedrockClient, text: Text): void {
  const { version } = server.codec
  const category = CATEGORIES[text.type]
  const names = atLeast(version, 'bedrock_1.26.0') ? {} : Object.fromEntries(TYPE_NAMES[category].map(name => [name, name]))
  const layout = atLeast(version, 'bedrock_1.21.130') ? { category, has_filtered_message: false, ...names } : atLeast(version, 'bedrock_1.21.0') ? { filtered_message: '' } : {}
  const params = { needs_translation: false, xuid: '', platform_chat_id: '', ...layout, ...text }
  server.receive(server.codec.serializer.createPacketBuffer({ name: 'text', params }))
}

function receive (server: FakeBedrockClient, ...hex: string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** the chat events, in order */
function heard (bot: BedrockBot): string[] {
  const log: string[] = []
  const shown = (message: ChatMessage): string => message.translate === undefined ? message.toString() : `${message.toString()} <${message.translate}>`
  bot.on('message', (message, position) => { log.push(`message ${position}: ${shown(message)}`) })
  bot.on('chat', (username, message, translate) => { log.push(`chat ${username}: ${message} <${String(translate)}>`) })
  bot.on('whisper', (username, message, translate) => { log.push(`whisper ${username}: ${message} <${String(translate)}>`) })
  bot.on('messagestr', (message, position) => { log.push(`messagestr ${position}: ${message}`) })
  bot.on('unmatchedMessage', message => { log.push(`unmatchedMessage: ${message}`) })
  bot.on('actionBar', message => { log.push(`actionBar: ${message.toString()}`) })
  return log
}

type Position = 'chat' | 'system' | 'game_info'

/** one message's events: message, the default pattern's event (or unmatchedMessage after messagestr), actionBar above the hotbar */
function events (position: Position, text: string, { translate, pattern }: { translate?: string, pattern?: string } = {}): string[] {
  return [
    `message ${position}: ${translate === undefined ? text : `${text} <${translate}>`}`,
    ...(pattern === undefined ? [] : [pattern]),
    `messagestr ${position}: ${text}`,
    ...(pattern === undefined ? [`unmatchedMessage: ${text}`] : []),
    ...(position === 'game_info' ? [`actionBar: ${text}`] : [])
  ]
}

async function chatBot (version: BedrockVersion = latestSupportedBedrockVersion, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<TestBot & { log: string[] }> {
  const test = await bedrockTestBot(bedrockCodec(version), options)
  return { ...test, log: heard(test.bot) }
}

/** a message the server shows the bot, handled in the next frame */
async function show (server: FakeBedrockClient, driver: ManualDriver, ...messages: string[]): Promise<void> {
  for (const message of messages) server.send('text', { type: 'raw', message })
  await driver.frame(0)
}

// protocol_chat: what the server's commands show (say, tell, me, tellraw, a script's three messages), the echo of
// the player's chat; protocol_players: a second player joins, chats, changes its skin and leaves; protocol_blocks_ui: a
// jukebox plays
const SERVER_MESSAGES: Array<{ text: Text, hex: string, events: string[] }> = [
  {
    text: { type: 'announcement', source_name: 'Server', message: '[Server] observer announcement' },
    hex: '09000108065365727665721e5b5365727665725d206f6273657276657220616e6e6f756e63656d656e74000000',
    events: events('chat', '[Server] observer announcement', { pattern: 'chat Server: observer announcement <undefined>' })
  },
  {
    text: { type: 'whisper', source_name: 'Server', message: 'observer whisper' },
    hex: '0900010706536572766572106f627365727665722077686973706572000000',
    events: events('chat', 'Server whispers to you: observer whisper', { translate: 'commands.message.display.incoming', pattern: 'whisper Server: observer whisper <commands.message.display.incoming>' })
  },
  {
    text: { type: 'chat', source_name: '', message: '* Server observer emote' },
    hex: '0900010100172a20536572766572206f6273657276657220656d6f7465000000',
    events: events('chat', '* Server observer emote')
  },
  {
    text: { type: 'json_whisper', message: '{"rawtext":[{"text":"observer raw json"}]}\n' },
    hex: '090000092b7b2272617774657874223a5b7b2274657874223a226f6273657276657220726177206a736f6e227d5d7d0a000000',
    events: events('system', 'observer raw json')
  },
  {
    text: { type: 'json', needs_translation: true, message: '{"rawtext":[{"text":"observer plain message"}]}\n' },
    hex: '0901000a307b2272617774657874223a5b7b2274657874223a226f6273657276657220706c61696e206d657373616765227d5d7d0a000000',
    events: events('system', 'observer plain message')
  },
  {
    text: { type: 'json', needs_translation: true, message: '{"rawtext":[{"text":"observer "},{"translate":"item.apple.name"}]}\n' },
    hex: '0901000a437b2272617774657874223a5b7b2274657874223a226f6273657276657220227d2c7b227472616e736c617465223a226974656d2e6170706c652e6e616d65227d5d7d0a000000',
    events: events('system', 'observer Apple')
  },
  {
    text: { type: 'json', needs_translation: true, message: '{"rawtext":[{"translate":"commands.generic.unknown","with":{"rawtext":[{"text":"observer"}]}}]}\n' },
    hex: '0901000a607b2272617774657874223a5b7b227472616e736c617465223a22636f6d6d616e64732e67656e657269632e756e6b6e6f776e222c2277697468223a7b2272617774657874223a5b7b2274657874223a226f62736572766572227d5d7d7d5d7d0a000000',
    events: events('system', 'Unknown command: observer. Please check that the command exists and that you have permission to use it.', { translate: 'commands.generic.unknown' })
  },
  {
    text: { type: 'chat', source_name: 'McZuri5840§r', message: 'hello from the observer', xuid: '2535451458791173' },
    hex: '090001010d4d635a75726935383430c2a7721768656c6c6f2066726f6d20746865206f6273657276657210323533353435313435383739313137330000',
    events: events('chat', '<McZuri5840> hello from the observer', { translate: 'chat.type.text', pattern: 'chat McZuri5840: hello from the observer <chat.type.text>' })
  },
  {
    text: { type: 'translation', needs_translation: true, message: '§e%multiplayer.player.joined', parameters: ['observer_bot'] },
    hex: '090102021dc2a765256d756c7469706c617965722e706c617965722e6a6f696e6564010c6f627365727665725f626f74000000',
    events: events('system', 'observer_bot joined the game', { translate: 'multiplayer.player.joined' })
  },
  {
    text: { type: 'chat', source_name: 'observer_bot§r', message: 'hello from observer_bot' },
    hex: '090001010f6f627365727665725f626f74c2a7721768656c6c6f2066726f6d206f627365727665725f626f74000000',
    events: events('chat', '<observer_bot> hello from observer_bot', { translate: 'chat.type.text', pattern: 'chat observer_bot: hello from observer_bot <chat.type.text>' })
  },
  {
    text: { type: 'translation', needs_translation: true, message: '§e%multiplayer.player.changeToPersona§r', parameters: ['observer_bot'] },
    hex: '0901020229c2a765256d756c7469706c617965722e706c617965722e6368616e6765546f506572736f6e61c2a772010c6f627365727665725f626f74000000',
    events: events('system', 'observer_bot edited the character appearance.', { translate: 'multiplayer.player.changeToPersona' })
  },
  {
    text: { type: 'translation', needs_translation: true, message: '§e%multiplayer.player.left', parameters: ['observer_bot'] },
    hex: '090102021bc2a765256d756c7469706c617965722e706c617965722e6c656674010c6f627365727665725f626f74000000',
    events: events('system', 'observer_bot left the game', { translate: 'multiplayer.player.left' })
  },
  {
    text: { type: 'jukebox_popup', needs_translation: true, message: 'record.nowPlaying', parameters: ['%C418 - cat'] },
    hex: '09010204117265636f72642e6e6f77506c6179696e67010b2543343138202d20636174000000',
    // Java's chat pattern reads the action bar too
    events: events('game_info', 'Now playing: %C418 - cat', { translate: 'record.nowPlaying', pattern: 'chat playing: %C418 - cat <record.nowPlaying>' })
  }
]

// no recording has these types
const UNRECORDED_MESSAGES: Array<{ text: Text, events: string[] }> = [
  { text: { type: 'raw', message: '§araw §lmessage' }, events: events('system', 'raw message') },
  { text: { type: 'raw', needs_translation: true, message: 'createWorldScreen.gameMode.survival' }, events: events('system', 'Survival', { translate: 'createWorldScreen.gameMode.survival' }) },
  { text: { type: 'system', message: 'system message' }, events: events('system', 'system message') },
  // not translated: shown as it is
  { text: { type: 'raw', message: 'item.apple.name' }, events: events('system', 'item.apple.name') },
  { text: { type: 'tip', message: 'a tip' }, events: events('game_info', 'a tip') },
  { text: { type: 'popup', needs_translation: true, message: 'item.apple.name', parameters: [] }, events: events('game_info', 'Apple', { translate: 'item.apple.name' }) },
  { text: { type: 'translation', message: 'not translated', parameters: [] }, events: events('system', 'not translated') }
]

const JSON_ANNOUNCEMENT: { text: Text, events: string[] } = {
  text: { type: 'json_announcement', message: '{"rawtext":[{"text":"[Server] json announcement"}]}' },
  events: events('chat', '[Server] json announcement', { pattern: 'chat Server: json announcement <undefined>' })
}

const DIED = events('system', 'McZuri5840 died', { translate: 'death.attack.generic' })
const GAME_MODE_CHANGED = (mode: string): string[] => events('system', `Your game mode has been updated to ${mode}`, { translate: 'gameMode.changed' })

// dimensions / respawns: death.attack.generic [McZuri5840]; the gamemode command: gameMode.changed
const TEXT_LAYOUTS: Array<{ name: string, versions: BedrockVersion[], died: string, gameModeChanged: string, mode: string }> = [
  {
    name: '1.16.201 – 1.20.80',
    versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.80'),
    died: '0902011464656174682e61747461636b2e67656e65726963010a4d635a757269353834300000',
    gameModeChanged: '090a00747b2272617774657874223a5b7b227472616e736c617465223a2267616d654d6f64652e6368616e676564222c2277697468223a7b2272617774657874223a5b7b2274657874223a2225637265617465576f726c6453637265656e2e67616d654d6f64652e737572766976616c227d5d7d7d5d7d0a0000',
    mode: 'Survival'
  },
  {
    name: '1.21.0 – 1.21.124, with a filtered message',
    versions: bedrockTestVersionsFrom('bedrock_1.21.0', 'bedrock_1.21.124'),
    died: '0902011464656174682e61747461636b2e67656e65726963010a4d635a75726935383430000000',
    gameModeChanged: '090a00747b2272617774657874223a5b7b227472616e736c617465223a2267616d654d6f64652e6368616e676564222c2277697468223a7b2272617774657874223a5b7b2274657874223a2225637265617465576f726c6453637265656e2e67616d654d6f64652e6372656174697665227d5d7d7d5d7d0a000000',
    mode: 'Creative'
  },
  {
    name: '1.21.130, with the category and its type names',
    versions: bedrockTestVersionsFrom('bedrock_1.21.130', 'bedrock_1.21.130'),
    died: '090102097472616e736c61746505706f7075700c6a756b65626f78706f707570021464656174682e61747461636b2e67656e65726963010a4d635a75726935383430000000',
    gameModeChanged: '09000003726177037469700d73797374656d6d65737361676511746578746f626a6563747768697370657216746578746f626a656374616e6e6f756e63656d656e740a746578746f626a6563740a747b2272617774657874223a5b7b227472616e736c617465223a2267616d654d6f64652e6368616e676564222c2277697468223a7b2272617774657874223a5b7b2274657874223a2225637265617465576f726c6453637265656e2e67616d654d6f64652e6372656174697665227d5d7d7d5d7d0a000000',
    mode: 'Creative'
  },
  {
    name: '1.26.0+, with the category',
    versions: bedrockTestVersionsFrom('bedrock_1.26.0'),
    died: '090102021464656174682e61747461636b2e67656e65726963010a4d635a75726935383430000000',
    gameModeChanged: '0900000a747b2272617774657874223a5b7b227472616e736c617465223a2267616d654d6f64652e6368616e676564222c2277697468223a7b2272617774657874223a5b7b2274657874223a2225637265617465576f726c6453637265656e2e67616d654d6f64652e737572766976616c227d5d7d7d5d7d0a000000',
    mode: 'Survival'
  }
]

type CommandOutput = ClientboundPacketsToWrite['command_output']

/** a command_output to the bot's command in the version's layout: the output type a number on 1.16.201, from 1.21.130 the origin's type a string */
function commandOutput (version: BedrockVersion, output: CommandOutput['output']): Partial<CommandOutput> {
  if (!atLeast(version, 'bedrock_1.16.210')) return { output_type: 3, success_count: 1, output }
  if (!atLeast(version, 'bedrock_1.21.130')) return { output_type: 'all', success_count: 1, output }
  return { origin: { type: 'player', uuid: 'ce4eb124-a169-dfff-fe4b-bb453b50a087', request_id: '', player_entity_id: 0n }, output_type: 'alloutput', success_count: 1, output, has_data: false }
}

describe('bedrock chat', () => {
  describe('receiving text', () => {
    for (const layout of TEXT_LAYOUTS) {
      describe(`servers laying the text out as ${layout.name}`, () => {
        for (const version of layout.versions) {
          it(`bedrock ${version}: shows every type of text as the vanilla client does, in the packet pass`, async () => {
            const { bot, server, driver, log } = await chatBot(version)
            receive(server, layout.died, layout.gameModeChanged)
            const recorded = atLeast(version, 'bedrock_1.26.0')
            for (const { text, hex } of SERVER_MESSAGES) {
              if (recorded) receive(server, hex)
              else sendText(server, text)
            }
            for (const { text } of UNRECORDED_MESSAGES) sendText(server, text)
            if (atLeast(version, 'bedrock_1.19.30')) sendText(server, JSON_ANNOUNCEMENT.text)
            assert.deepStrictEqual(log, [])
            await driver.frame(0)
            assert.deepStrictEqual(log, [
              ...DIED,
              ...GAME_MODE_CHANGED(layout.mode),
              ...SERVER_MESSAGES.flatMap(message => message.events),
              ...UNRECORDED_MESSAGES.flatMap(message => message.events),
              ...(atLeast(version, 'bedrock_1.19.30') ? JSON_ANNOUNCEMENT.events : [])
            ])
            bot.end()
          })
        }
      })
    }

    it(`bedrock ${latestSupportedBedrockVersion}: gives the events one message, with Java's arguments, the default patterns' events before messagestr`, async () => {
      const { bot, server, driver } = await chatBot()
      type Argument = string | string[] | ChatMessage | null | undefined
      const log: Array<[string, ...Argument[]]> = []
      bot.on('message', (...args) => { log.push(['message', ...args]) })
      bot.on('chat', (...args) => { log.push(['chat', ...args]) })
      bot.on('messagestr', (...args) => { log.push(['messagestr', ...args]) })
      bot.on('unmatchedMessage', (...args) => { log.push(['unmatchedMessage', ...args]) })
      bot.on('actionBar', (...args) => { log.push(['actionBar', ...args]) })
      let message: ChatMessage | undefined
      bot.once('message', shown => { message = shown })
      receive(server, SERVER_MESSAGES[7]!.hex)
      await driver.frame(0)
      assert.deepStrictEqual(log, [
        ['message', message, 'chat'],
        ['chat', 'McZuri5840', 'hello from the observer', 'chat.type.text', message],
        ['messagestr', '<McZuri5840> hello from the observer', 'chat', message]
      ])
      assert.deepStrictEqual(JSON.parse(JSON.stringify(message?.json)), { translate: 'chat.type.text', with: [{ text: 'McZuri5840' }, { text: 'hello from the observer' }] })
      log.length = 0
      bot.once('message', shown => { message = shown })
      sendText(server, { type: 'tip', message: '§ea tip' })
      await driver.frame(0)
      assert.deepStrictEqual(log, [['message', message, 'game_info'], ['messagestr', 'a tip', 'game_info', message], ['unmatchedMessage', 'a tip', message], ['actionBar', message]])
      assert.strictEqual(message?.toMotd(), '§ea tip')
      bot.end()
    })

    // type 12
    for (const [version, unknownType] of [['bedrock_1.16.201', '090c000000'], [latestSupportedBedrockVersion, '0900000c000000']] as const) {
      it(`bedrock ${version}: shows nothing for a type the vanilla client does not know, or a rawtext it cannot read`, async () => {
        const { bot, internal, server, driver, log } = await chatBot(version)
        const errors: Error[] = []
        bot.on('error', error => { errors.push(error) })
        receive(server, unknownType)
        for (const message of ['not json', '{"text":"no rawtext"}', '{"rawtext":[{"text":1}]}']) sendText(server, { type: 'json', message })
        await driver.frame(0)
        assert.deepStrictEqual(log, [])
        assert.deepStrictEqual(internal._chat.stats, { invalidRawText: 3, unknownType: 1 })
        assert.deepStrictEqual(errors, [])
        bot.end()
      })
    }
  })

  describe("receiving the output of the bot's commands", () => {
    const groups: Array<{ name: string, versions: BedrockVersion[], recorded?: string[] }> = [
      { name: 'the output type a number (1.16.201)', versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201') },
      { name: 'the output type named (1.16.210 – 1.21.124)', versions: bedrockTestVersionsFrom('bedrock_1.16.210', 'bedrock_1.21.124') },
      {
        name: "the origin's type a string, the success after the message (1.21.130+)",
        versions: bedrockTestVersionsFrom('bedrock_1.21.130'),
        // craft_inventory_auto_all_planks: /give @s oak_log 3; protocol_chat: /testfor @s by a member
        recorded: [
          '4f06706c61796572ce4eb124a169dffffe4bbb453b50a08700000000000000000009616c6c6f7574707574010000000115636f6d6d616e64732e676976652e737563636573730103074f616b204c6f6701330a4d635a7572693538343000',
          '4f06706c61796572f745a1ededd19fb3595f42022b5da9ae00000000000000000009616c6c6f7574707574000000000124636f6d6d616e64732e67656e657269632e7065726d697373696f6e2e73656c6563746f72000000'
        ]
      }
    ]
    for (const group of groups) {
      describe(`servers sending ${group.name}`, () => {
        for (const version of group.versions) {
          it(`bedrock ${version}: shows each output message as a system message, a failure in red`, async () => {
            const { bot, server, driver, log } = await chatBot(version)
            const styled: string[] = []
            bot.on('message', message => { styled.push(message.toMotd()) })
            if (group.recorded !== undefined) receive(server, ...group.recorded)
            else {
              server.send('command_output', commandOutput(version, [{ success: true, message_id: 'commands.give.success', parameters: ['Oak Log', '3', 'McZuri5840'] }]))
              server.send('command_output', commandOutput(version, [{ success: false, message_id: 'commands.generic.permission.selector', parameters: [] }]))
            }
            server.send('command_output', commandOutput(version, [
              { success: true, message_id: 'slot 1 of ui', parameters: [] },
              { success: false, message_id: '§eFailed', parameters: [] }
            ]))
            server.send('command_output', commandOutput(version, []))
            await driver.frame(0)
            assert.deepStrictEqual(log, [
              ...events('system', 'Gave Oak Log * 3 to McZuri5840', { translate: 'commands.give.success' }),
              ...events('system', '<insufficient permissions for selector expansion>', { translate: 'commands.generic.permission.selector' }),
              ...events('system', 'slot 1 of ui'),
              ...events('system', 'Failed')
            ])
            // a § code in the message keeps its colour
            assert.deepStrictEqual(styled, ['Gave Oak Log * 3 to McZuri5840', '§c<insufficient permissions for selector expansion>', 'slot 1 of ui', '§eFailed'])
            bot.end()
          })
        }
      })
    }
  })

  describe('receiving the action bar of a title', () => {
    type TitleType = ClientboundPacketsToWrite['set_title']['type']
    const groups: Array<{ name: string, versions: BedrockVersion[], types: [TitleType, TitleType, TitleType] }> = [
      { name: 'the type a number (1.16.201)', versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201'), types: [4, 8, 3] },
      { name: 'the type named (1.16.210+)', versions: bedrockTestVersionsFrom('bedrock_1.16.210'), types: ['action_bar_message', 'action_bar_message_json', 'set_subtitle'] }
    ]
    for (const { name, versions, types: [actionBar, actionBarJson, subtitle] } of groups) {
      describe(`servers sending ${name}`, () => {
        for (const version of versions) {
          it(`bedrock ${version}: shows it above the hotbar, and nothing for the other titles or a rawtext it cannot read`, async () => {
            const { bot, internal, server, driver, log } = await chatBot(version)
            // protocol_titles: /title @s actionbar observer actionbar, then /titleraw … actionbar
            if (atLeast(version, 'bedrock_1.21.20')) {
              receive(server, '5808126f6273657276657220616374696f6e626172010101000000', '5810307b2272617774657874223a5b7b2274657874223a226f627365727665722072617720616374696f6e626172227d5d7d0a010101000000')
            } else {
              server.send('set_title', { type: actionBar, text: 'observer actionbar', fade_in_time: -1, stay_time: -1, fade_out_time: -1 })
              server.send('set_title', { type: actionBarJson, text: '{"rawtext":[{"text":"observer raw actionbar"}]}\n', fade_in_time: -1, stay_time: -1, fade_out_time: -1 })
            }
            server.send('set_title', { type: subtitle, text: 'a subtitle' })
            server.send('set_title', { type: actionBarJson, text: 'not json' })
            await driver.frame(0)
            assert.deepStrictEqual(log, [...events('game_info', 'observer actionbar'), ...events('game_info', 'observer raw actionbar')])
            assert.strictEqual(internal._chat.stats.invalidRawText, 1)
            bot.end()
          })
        }
      })
    }
  })

  describe(`chat patterns (no version differs; on ${latestSupportedBedrockVersion})`, () => {
    it("emit chat:<name> with a pattern's message, or its capture groups, once or each time", async () => {
      const { bot, server, driver } = await chatBot()
      const heardPatterns: Array<[string, string[] | string[][]]> = []
      for (const name of ['theTest', 'parsed', 'repeated']) bot.on(`chat:${name}`, matches => { heardPatterns.push([name, matches]) })
      // after the three default patterns
      assert.strictEqual(bot.addChatPattern('theTest', /<.+> Hello World!!!!/, { repeat: false, parse: false }), 3)
      assert.strictEqual(bot.addChatPattern('parsed', /<(.+)> Hello World(!!!!)/, { repeat: false, parse: true }), 4)
      assert.strictEqual(bot.addChatPattern('repeated', /World/), 5)
      await show(server, driver, '<U9G> Hello World!!!!', '<U9G> Hello World!!!!')
      assert.deepStrictEqual(heardPatterns, [
        ['theTest', ['<U9G> Hello World!!!!']],
        ['parsed', [['U9G', '!!!!']]],
        ['repeated', ['<U9G> Hello World!!!!']],
        ['repeated', ['<U9G> Hello World!!!!']]
      ])
      bot.end()
    })

    it("emit a set's event once its patterns matched messages in order, returning the slot count as Java's", async () => {
      const { bot, server, driver } = await chatBot(latestSupportedBedrockVersion, { defaultChatPatterns: false })
      const heardPatterns: Array<string[] | string[][]> = []
      bot.on('chat:theTest', matches => { heardPatterns.push(matches) })
      bot.on('chat:parsed', matches => { heardPatterns.push(matches) })
      assert.strictEqual(bot.addChatPatternSet('theTest', [/<.+> Hello/, /<.+> World/], { repeat: false, parse: false }), 1)
      assert.strictEqual(bot.addChatPatternSet('parsed', [/<(.+)> Hello/, /<.+> (World)/], { repeat: true, parse: true }), 2)
      await show(server, driver, '<U9G> World', '<U9G> Hello', '<U9G> Hello', '<U9G> World', '<U9G> Hello', '<U9G> World')
      assert.deepStrictEqual(heardPatterns, [['<U9G> Hello', '<U9G> World'], [['U9G'], ['World']], [['U9G'], ['World']]])
      bot.end()
    })

    it("end a message's matching at a set waiting for its next message, as Java's", async () => {
      const { bot, server, driver, log } = await chatBot(latestSupportedBedrockVersion, { defaultChatPatterns: false })
      const heardPatterns: string[] = []
      bot.on('chat:set', matches => { heardPatterns.push(`set ${matches.join(', ')}`) })
      bot.on('chat:later', matches => { heardPatterns.push(`later ${matches.join(', ')}`) })
      bot.addChatPatternSet('set', [/Hello/, /World/])
      bot.addChatPattern('later', /Hello/)
      await show(server, driver, 'Hello', 'Hello', 'World')
      assert.deepStrictEqual(heardPatterns, ['later Hello', 'set Hello, World'])
      assert.deepStrictEqual(log.filter(line => line.startsWith('unmatched')), [])
      bot.end()
    })

    it('are removed by name or by index, also from their own listener or an earlier one', async () => {
      const { bot, server, driver } = await chatBot(latestSupportedBedrockVersion, { defaultChatPatterns: false })
      const heardPatterns: string[] = []
      bot.addChatPattern('test', /Hello/)
      bot.addChatPattern('test', /World/)
      const index = bot.addChatPattern('hello', /hello/)
      bot.addChatPattern('kept', /kept/)
      bot.removeChatPattern('test')
      bot.removeChatPattern(index)
      bot.removeChatPattern(99)
      for (const name of ['test', 'hello', 'kept', 'first', 'second', 'third', 'own']) bot.on(`chat:${name}`, () => { heardPatterns.push(name) })
      assert.strictEqual(bot.addChatPattern('first', /removes/), 4)
      bot.addChatPattern('second', /removes/)
      bot.addChatPattern('third', /removes/)
      bot.addChatPattern('own', /own/)
      bot.once('chat:first', () => { bot.removeChatPattern('second') })
      bot.on('chat:own', () => { bot.removeChatPattern('own') })
      await show(server, driver, 'Hello World', 'hello', 'kept', 'removes', 'removes', 'own', 'own')
      assert.deepStrictEqual(heardPatterns, ['kept', 'first', 'third', 'first', 'third', 'own'])
      bot.end()
    })

    it('chatAddPattern emits the type given, with the capture groups, the translate key and the message, as Java does', async () => {
      const { bot, server, driver, log } = await chatBot(latestSupportedBedrockVersion, { defaultChatPatterns: false })
      const heardArgs: string[][] = []
      bot.on('whisper', (...args) => { heardArgs.push(args.map(String)) })
      assert.strictEqual(bot.chatAddPattern(/^(\w+) (\w+) (\w+)$/, 'whisper', 'a description'), 0)
      sendText(server, { type: 'raw', message: 'a b c' })
      sendText(server, { type: 'raw', needs_translation: true, message: 'item.apple.name' })
      await driver.frame(0)
      bot.chatAddPattern(/^(Apple)$/, 'whisper')
      sendText(server, { type: 'raw', needs_translation: true, message: 'item.apple.name' })
      await driver.frame(0)
      assert.deepStrictEqual(heardArgs, [['a', 'b', 'c', 'undefined', 'a b c'], ['Apple', 'item.apple.name', 'Apple']])
      assert.deepStrictEqual(log.filter(line => line.startsWith('unmatched')), ['unmatchedMessage: Apple'])
      bot.end()
    })

    it('a listener that throws is reported, and the other listeners still hear the message', async () => {
      const { bot, server, driver, log } = await chatBot()
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      bot.on('message', () => { throw new Error('message listener') })
      bot.on('chat', () => { throw new Error('chat listener') })
      bot.addChatPattern('named', /Hello/)
      bot.on('chat:named', () => { throw new Error('named listener') })
      bot.on('messagestr', () => { throw new Error('messagestr listener') })
      await show(server, driver, '<U9G> Hello')
      assert.deepStrictEqual(errors, ['message listener', 'chat listener', 'named listener', 'messagestr listener'])
      assert.deepStrictEqual(log, events('system', '<U9G> Hello', { pattern: 'chat U9G: Hello <undefined>' }))
      bot.end()
    })

    it('throw unless they are RegExps', async () => {
      const { bot } = await chatBot()
      const notRegExp = 'Hello' as string & RegExp
      assert.throws(() => bot.addChatPattern('test', notRegExp), { message: 'Pattern parameter should be of type RegExp' })
      assert.throws(() => bot.addChatPatternSet('test', [/Hello/, notRegExp]), { message: 'Pattern parameter should be of type RegExp' })
      assert.throws(() => bot.chatAddPattern(notRegExp, 'test'), { message: 'Pattern parameter should be of type RegExp' })
      bot.end()
    })

    it('include the default ones unless defaultChatPatterns is false', async () => {
      const { bot, server, driver, log } = await chatBot(latestSupportedBedrockVersion, { defaultChatPatterns: false })
      await show(server, driver, '<U9G> Hello', '[U9G -> McZuri5840] psst')
      assert.deepStrictEqual(log, [...events('system', '<U9G> Hello'), ...events('system', '[U9G -> McZuri5840] psst')])
      bot.end()
      const withDefaults = await chatBot()
      await show(withDefaults.server, withDefaults.driver, '[U9G -> McZuri5840] psst', 'U9G whispers: psst')
      // Java's chat pattern reads these too
      assert.deepStrictEqual(withDefaults.log, [
        'message system: [U9G -> McZuri5840] psst',
        'whisper U9G: psst <undefined>',
        'chat U9G: McZuri5840] psst <undefined>',
        'messagestr system: [U9G -> McZuri5840] psst',
        'message system: U9G whispers: psst',
        'whisper U9G: psst <undefined>',
        'chat whispers: psst <undefined>',
        'messagestr system: U9G whispers: psst'
      ])
      withDefaults.bot.end()
    })
  })

  describe(`awaitMessage (no version differs; on ${latestSupportedBedrockVersion})`, () => {
    /** Java's awaitMessage takes a trailing timeout (ms) and mixed arrays, which its typings do not tell */
    type AwaitMessage = (...args: Array<string | RegExp | number | Array<string | RegExp>>) => Promise<string>

    async function loggedIn (): Promise<TestBot & { log: string[], awaitMessage: AwaitMessage }> {
      const test = await chatBot()
      test.server.send('start_game', {})
      await test.driver.frame(0)
      return { ...test, awaitMessage: test.bot.awaitMessage as AwaitMessage }
    }

    it('resolves in the frame of the first message equal to a string or matching a RegExp, of any listed', async () => {
      const { bot, server, driver, awaitMessage } = await loggedIn()
      const settled: string[] = []
      const waits = [
        awaitMessage('<flatbot> hello'),
        awaitMessage(['<flatbot> hello', '<flatbot> world']),
        awaitMessage(/<.+> hello/),
        awaitMessage([/<.+> nothing/, /<.+> world/]),
        awaitMessage([/nothing/, '<flatbot> hello'], 1000)
      ].map(async (wait, index) => { settled.push(`${index} ${await wait}`) })
      bot.once('messagestr', () => { settled.push('messagestr') })
      const errors: Error[] = []
      bot.on('error', error => { errors.push(error) })
      server.send('text', { type: 'raw', message: '<flatbot> hello there' })
      server.send('text', { type: 'raw', message: '<flatbot> world' })
      server.send('text', { type: 'raw', message: '<flatbot> hello' })
      server.send('text', { type: 'raw', message: '<another> world' })
      await driver.frame(0)
      await Promise.all(waits)
      assert.deepStrictEqual(settled, ['messagestr', '0 <flatbot> hello', '1 <flatbot> world', '2 <flatbot> hello there', '3 <flatbot> world', '4 <flatbot> hello'])
      assert.deepStrictEqual(errors, [])
      // the test's own
      assert.strictEqual(bot.listenerCount('messagestr'), 1)
      bot.end()
    })

    it('rejects after the ticks of its timeout (ms, default 20000), or when the bot ends', async () => {
      const { bot, driver, awaitMessage } = await loggedIn()
      const settled: string[] = []
      const wait = (name: string, promise: Promise<string>): void => { promise.catch((error: Error) => { settled.push(`${name}: ${error.message}`) }) }
      wait('default', awaitMessage('never'))
      wait('120 ms', awaitMessage('never', 120))
      await driver.ticks(2)
      assert.deepStrictEqual(settled, [])
      await driver.tick()
      assert.deepStrictEqual(settled, ['120 ms: Timeout waiting for message after 120ms'])
      await driver.ticks(396)
      assert.strictEqual(settled.length, 1)
      await driver.tick()
      assert.strictEqual(settled[1], 'default: Timeout waiting for message after 20000ms')
      wait('ended', awaitMessage('never'))
      bot.end()
      await driver.frame(0)
      assert.strictEqual(settled[2], 'ended: the bot ended')
      assert.strictEqual(bot.listenerCount('messagestr'), 1)
    })
  })

  it(`bedrock ${latestSupportedBedrockVersion}: tabComplete rejects, naming the member: Bedrock has no tab completion`, async () => {
    const { bot } = await chatBot()
    await assert.rejects(bot.tabComplete('/weather '), { message: 'bot.tabComplete is not supported on Bedrock: the server has no tab completion (the vanilla client completes commands from available_commands)' })
    bot.end()
  })

  describe('sending', () => {
    /** a bot named as the recordings' player, the game started */
    async function loggedIn (version: BedrockVersion = latestSupportedBedrockVersion, options: Omit<BedrockBotOptions, 'version'> = {}): Promise<TestBot> {
      const test = await bedrockTestBot(bedrockCodec(version), { username: 'McZuri5840', ...options })
      test.server.send('start_game', {})
      await test.driver.frame(0)
      return test
    }

    /** the bytes the codec writes */
    function written (server: FakeBedrockClient, name: 'text' | 'command_request', params: object): string {
      return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
    }

    /** what the bot sent: its chat messages and its commands */
    function sent (server: FakeBedrockClient): string[] {
      return server.batches.flat().flatMap(({ name, params }) => {
        if (name === 'text' && 'message' in params) return [`text ${String(params.message)}`]
        if (name === 'command_request' && 'command' in params) return [`command ${String(params.command)}`]
        return []
      })
    }

    const CHAT = { type: 'chat', needs_translation: false, source_name: 'McZuri5840', message: 'hello from the observer', xuid: '', platform_chat_id: '' }
    const CHAT_LAYOUTS: Array<{ name: string, versions: BedrockVersion[], params: object }> = [
      { name: 'the type, the name and the message (1.16.201 – 1.20.80)', versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.80'), params: CHAT },
      { name: 'a filtered message too (1.21.0 – 1.21.124)', versions: bedrockTestVersionsFrom('bedrock_1.21.0', 'bedrock_1.21.124'), params: { ...CHAT, filtered_message: '' } },
      // the names checked on a 1.21.130.3 server: it disconnects a client naming them otherwise
      { name: "the category and its types' names too (1.21.130)", versions: bedrockTestVersionsFrom('bedrock_1.21.130', 'bedrock_1.21.130'), params: { ...CHAT, category: 'authored', chat: 'chat', whisper: 'whisper', announcement: 'announcement', has_filtered_message: false } },
      { name: 'the category too (1.26.0+)', versions: bedrockTestVersionsFrom('bedrock_1.26.0'), params: { ...CHAT, category: 'authored', has_filtered_message: false } }
    ]
    // protocol_chat (1.26.20, 1.26.51, 1.26.60): the vanilla client's chat, with its Xbox account's XUID
    const VANILLA_CHAT = '090001010a4d635a757269353834301768656c6c6f2066726f6d20746865206f6273657276657210323533353435313435383739313137330000'
    const VANILLA_XUID = '1032353335343531343538373931313733'

    for (const layout of CHAT_LAYOUTS) {
      describe(`a chat message to servers reading ${layout.name}`, () => {
        for (const version of layout.versions) {
          it(`bedrock ${version}: is a text packet as the vanilla client's but without an XUID (offline), in the next frame's input pass`, async () => {
            const { bot, server, driver } = await loggedIn(version)
            bot.chat('hello from the observer')
            assert.deepStrictEqual(sent(server), [])
            await driver.frame(0)
            assert.deepStrictEqual(server.sentOf('text'), [layout.params])
            assert.deepStrictEqual(server.batches.at(-1)?.map(({ name, phase }) => `${name} ${phase}`), ['text F3'])
            if (atLeast(version, 'bedrock_1.26.0')) assert.strictEqual(written(server, 'text', layout.params), VANILLA_CHAT.replace(VANILLA_XUID, '00'))
            bot.end()
          })
        }
      })
    }

    const COMMAND = { command: '/testfor @s', origin: { type: 'player', uuid: '304a0034-6331-da16-ebb0-8165952b4fbf', request_id: '' }, internal: false }
    // each server build's command version (docs/bedrock.md tells how they were found), which the server reads as a
    // signed varint: 39 is written 78
    const COMMAND_VERSIONS = [
      ['bedrock_1.19.60', 'bedrock_1.19.63', 26],
      ['bedrock_1.19.70', 'bedrock_1.19.70', 32],
      ['bedrock_1.19.80', 'bedrock_1.19.80', 33],
      ['bedrock_1.20.0', 'bedrock_1.20.0', 34],
      ['bedrock_1.20.10', 'bedrock_1.20.15', 35],
      ['bedrock_1.20.30', 'bedrock_1.20.50', 36],
      ['bedrock_1.20.61', 'bedrock_1.20.61', 37],
      ['bedrock_1.20.71', 'bedrock_1.20.80', 38],
      ['bedrock_1.21.0', 'bedrock_1.21.2', 39],
      ['bedrock_1.21.20', 'bedrock_1.21.20', 41],
      ['bedrock_1.21.30', 'bedrock_1.21.60', 42],
      ['bedrock_1.21.70', 'bedrock_1.21.80', 43],
      ['bedrock_1.21.90', 'bedrock_1.21.124', 44]
    ] as const
    const COMMAND_LAYOUTS: Array<{ name: string, versions: BedrockVersion[], params: object }> = [
      { name: 'no command version (1.16.201 – 1.19.50)', versions: bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.50'), params: COMMAND },
      ...COMMAND_VERSIONS.map(([from, to, commandVersion]) => ({
        name: `command version ${commandVersion} (${from === to ? from.slice('bedrock_'.length) : `${from.slice('bedrock_'.length)} – ${to.slice('bedrock_'.length)}`})`,
        versions: bedrockTestVersionsFrom(from, to),
        params: { ...COMMAND, version: commandVersion * 2 }
      })),
      {
        name: "the origin's type a string and its entity, the version 'latest' (1.21.130+)",
        versions: bedrockTestVersionsFrom('bedrock_1.21.130'),
        params: { ...COMMAND, origin: { ...COMMAND.origin, player_entity_id: 0n }, version: 'latest' }
      }
    ]
    // protocol_chat (1.26.60): the vanilla client's /testfor @s, its origin's UUID a random one
    const VANILLA_COMMAND = '4d0b2f74657374666f7220407306706c61796572f745a1ededd19fb3595f42022b5da9ae00000000000000000000066c6174657374'

    for (const layout of COMMAND_LAYOUTS) {
      describe(`a command to servers reading ${layout.name}`, () => {
        for (const version of layout.versions) {
          it(`bedrock ${version}: is a command_request as the vanilla client's, sent whole, in the next frame's input pass`, async () => {
            const { bot, server, driver } = await loggedIn(version, { chatLengthLimit: 5 })
            bot.chat('/testfor @s')
            await driver.frame(0)
            assert.deepStrictEqual(server.sentOf('command_request'), [layout.params])
            assert.deepStrictEqual(server.batches.at(-1)?.map(({ name, phase }) => `${name} ${phase}`), ['command_request F3'])
            if (atLeast(version, 'bedrock_1.21.130')) assert.strictEqual(written(server, 'command_request', layout.params), VANILLA_COMMAND.replace('f745a1ededd19fb3595f42022b5da9ae', '304a00346331da16ebb08165952b4fbf'))
            bot.end()
          })
        }
      })
    }

    describe(`no version differs (on ${latestSupportedBedrockVersion})`, () => {
      it('sends the lines of a message in parts of chatLengthLimit (512 by default), skipping empty lines, in call order', async () => {
        const { bot, server, driver } = await loggedIn()
        bot.chat(`${'a'.repeat(512)}b\n\nline\n`)
        // Java's takes a number too
        const chatNumber = bot.chat as (message: string | number) => void
        chatNumber(1234)
        bot.chat('hello\n/testfor @s')
        await driver.frame(0)
        assert.deepStrictEqual(sent(server), [`text ${'a'.repeat(512)}`, 'text b', 'text line', 'text 1234', 'text hello', 'command /testfor @s'])
        bot.end()
        const limited = await loggedIn(latestSupportedBedrockVersion, { chatLengthLimit: 4 })
        limited.bot.chat('abcdefghi')
        limited.bot.chat(`/${'command'.repeat(100)}`)
        await limited.driver.frame(0)
        assert.deepStrictEqual(sent(limited.server), ['text abcd', 'text efgh', 'text i', `command /${'command'.repeat(100)}`])
        limited.bot.end()
      })

      it('whispers with /tell, each part a command, a name with other characters than letters, digits and _ quoted', async () => {
        const { bot, server, driver } = await loggedIn(latestSupportedBedrockVersion, { chatLengthLimit: 26 })
        bot.whisper('Steve_2', 'hello there, how are you')
        bot.whisper('Steve Two', 'hi')
        bot.whisper('Steve-2', 'hi\n\nagain')
        bot.whisper('Steve', '/me')
        await driver.frame(0)
        assert.deepStrictEqual(sent(server), [
          'command /tell Steve_2 hello there,',
          'command /tell Steve_2  how are you',
          'command /tell "Steve Two" hi',
          'command /tell "Steve-2" hi',
          'command /tell "Steve-2" again',
          'command /tell Steve /me'
        ])
        bot.end()
      })

      it("gives each command an origin UUID of its own, a version 4 UUID in the vanilla client's byte order", async () => {
        const { bot, server, driver } = await loggedIn()
        bot.chat('/testfor @s')
        bot.whisper('Steve', 'hi')
        bot.chat('/testfor @s')
        await driver.frame(0)
        const uuids = server.sentOf('command_request').map(({ origin }) => origin.uuid)
        assert.deepStrictEqual(uuids, ['304a0034-6331-da16-ebb0-8165952b4fbf', 'd64401e9-f737-d0a2-3c56-78bd1feab29d', '7b462cab-a251-86e3-3a06-133535992b94'])
        for (const uuid of uuids) {
          const wire = Buffer.from(uuid.replaceAll('-', ''), 'hex')
          // its halves little-endian
          const bytes = Buffer.concat([wire.subarray(0, 8).reverse(), wire.subarray(8).reverse()])
          assert.strictEqual(bytes[6]! >> 4, 4, uuid)
          assert.strictEqual(bytes[8]! >> 6, 2, uuid)
        }
        bot.end()
      })

      it('throws as Java before login, after a kick before login, and for a message neither a string nor a number', async () => {
        const { bot, server, driver } = await chatBot()
        const before = 'bot.chat() called before the client entered the play state; wait for the "login" or "spawn" event'
        assert.throws(() => { bot.chat('hello') }, { message: before })
        assert.throws(() => { bot.whisper('Steve', 'hello') }, { message: before })
        assert.throws(() => { bot.chat({} as string) }, { message: 'Chat message type must be a string or number: object' })
        server.send('disconnect', { hide_disconnect_reason: false, message: 'kicked by the test' })
        await driver.frame(0)
        assert.throws(() => { bot.chat('hello') }, { message: 'bot.chat() called after the client disconnected before entering the play state (kicked by the test)' })
        assert.deepStrictEqual(sent(server), [])
      })

      it('sends nothing once the bot ended', async () => {
        const { bot, server, driver } = await loggedIn()
        bot.end()
        bot.chat('hello')
        await driver.frame(0)
        assert.deepStrictEqual(sent(server), [])
      })
    })
  })
})
