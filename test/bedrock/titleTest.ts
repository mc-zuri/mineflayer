import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient } from './common/server.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'

// The packets are those servers sent the vanilla Bedrock client, recorded on 1.26.20, 1.26.51 and 1.26.60 (the same
// bytes): `title @s times / title / subtitle / actionbar / clear / reset`, `titleraw @s title / subtitle / actionbar`,
// then a script's title, subtitle and action bar in one batch. Versions are grouped by set_title's layout: the bytes
// on 1.21.20+ (filtered_message), the recorded values on the older layouts.

type TitleType = 'clear' | 'reset' | 'set_title' | 'set_subtitle' | 'action_bar_message' | 'set_durations' | 'set_title_json' | 'set_subtitle_json' | 'action_bar_message_json'

interface RecordedTitle {
  type: TitleType
  text: string
  /** fade in, stay and fade out: -1 unless the type sets them */
  times: [number, number, number]
  bytes: string
}

const NO_TIMES: [number, number, number] = [-1, -1, -1]
const TIMES: RecordedTitle = { type: 'set_durations', text: '', times: [5, 20, 5], bytes: '580a000a280a000000' }
const TITLE: RecordedTitle = { type: 'set_title', text: 'observer title', times: NO_TIMES, bytes: '58040e6f62736572766572207469746c65010101000000' }
const SUBTITLE: RecordedTitle = { type: 'set_subtitle', text: 'observer subtitle', times: NO_TIMES, bytes: '5806116f62736572766572207375627469746c65010101000000' }
const ACTION_BAR: RecordedTitle = { type: 'action_bar_message', text: 'observer actionbar', times: NO_TIMES, bytes: '5808126f6273657276657220616374696f6e626172010101000000' }

const RECORDED: readonly RecordedTitle[] = [
  TIMES,
  TITLE,
  SUBTITLE,
  ACTION_BAR,
  {
    type: 'set_title_json',
    text: '{"rawtext":[{"text":"observer raw title"}]}\n',
    times: NO_TIMES,
    bytes: '580c2c7b2272617774657874223a5b7b2274657874223a226f6273657276657220726177207469746c65227d5d7d0a010101000000'
  },
  {
    type: 'set_subtitle_json',
    text: '{"rawtext":[{"translate":"item.apple.name"}]}\n',
    times: NO_TIMES,
    bytes: '580e2e7b2272617774657874223a5b7b227472616e736c617465223a226974656d2e6170706c652e6e616d65227d5d7d0a010101000000'
  },
  {
    type: 'action_bar_message_json',
    text: '{"rawtext":[{"text":"observer raw actionbar"}]}\n',
    times: NO_TIMES,
    bytes: '5810307b2272617774657874223a5b7b2274657874223a226f627365727665722072617720616374696f6e626172227d5d7d0a010101000000'
  },
  { type: 'clear', text: '', times: NO_TIMES, bytes: '580000010101000000' },
  { type: 'reset', text: '', times: NO_TIMES, bytes: '580200010101000000' },
  // the script's batch
  TIMES,
  SUBTITLE,
  TITLE,
  ACTION_BAR
]

// the action bars are chat's
const RECORDED_EVENTS = [
  'times 5 20 5',
  "title 'observer title'",
  "subtitle 'observer subtitle'",
  "title 'observer raw title'",
  "subtitle 'Apple'",
  'clear',
  'clear',
  'times 5 20 5',
  "subtitle 'observer subtitle'",
  "title 'observer title'"
]

// up to 1.16.201 the type is written as its number
const TYPE_NUMBERS: readonly TitleType[] = ['clear', 'reset', 'set_title', 'set_subtitle', 'action_bar_message', 'set_durations', 'set_title_json', 'set_subtitle_json', 'action_bar_message_json']

/** a set_title as the version's servers write it */
function setTitle (version: BedrockVersion, type: TitleType, text: string, [fadeIn, stay, fadeOut] = NO_TIMES): Partial<ClientboundPacketsToWrite['set_title']> {
  const written = isBedrockVersionAtLeast(version, 'bedrock_1.16.210') ? type : TYPE_NUMBERS.indexOf(type)
  return { type: written, text, fade_in_time: fadeIn, stay_time: stay, fade_out_time: fadeOut }
}

/** the title events, in order, each as a line */
function titleEvents (bot: BedrockBot): string[] {
  const events: string[] = []
  bot.on('title', (text, type) => { events.push(`${type} '${text}'`) })
  bot.on('title_times', (fadeIn, stay, fadeOut) => { events.push(`times ${fadeIn} ${stay} ${fadeOut}`) })
  bot.on('title_clear', () => { events.push('clear') })
  return events
}

function sentByTitle (server: FakeBedrockClient): string[] {
  return server.batches.flat().filter(packet => packet.owner === 'title').map(packet => packet.name)
}

async function recordedTitles (version: BedrockVersion, send: (server: FakeBedrockClient, title: RecordedTitle) => void): Promise<void> {
  const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
  const events = titleEvents(bot)
  for (const title of RECORDED) send(server, title)
  await driver.frame(0)
  assert.deepStrictEqual(events, RECORDED_EVENTS)
  assert.deepStrictEqual(sentByTitle(server), [])
  bot.end()
}

describe('bedrock titles', () => {
  describe('servers sending a filtered message (1.21.20+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.20')) {
      it(`bedrock ${version}: shows the recorded titles, as Java's`, async () => {
        await recordedTitles(version, (server, { bytes }) => { server.receive(Buffer.from(bytes, 'hex')) })
      })
    }
  })

  for (const [layout, oldest, latest] of [
    ['an xuid (1.17.10 – 1.21.2)', 'bedrock_1.17.10', 'bedrock_1.21.2'],
    ['the type by its name (1.16.210 – 1.17.0)', 'bedrock_1.16.210', 'bedrock_1.17.0'],
    ['the type by its number (1.16.201)', oldestSupportedBedrockVersion, oldestSupportedBedrockVersion]
  ] as const) {
    describe(`servers sending ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(oldest, latest)) {
        it(`bedrock ${version}: shows the recorded titles, as Java's`, async () => {
          await recordedTitles(version, (server, { type, text, times }) => { server.send('set_title', setTitle(version, type, text, times)) })
        })
      }
    })
  }

  describe('every version', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: has no titles with the plugin disabled`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { title: false } })
        const events = titleEvents(bot)
        server.send('set_title', setTitle(version, 'set_title', 'observer title'))
        await driver.frame(0)
        assert.deepStrictEqual(events, [])
        bot.end()
      })
    }
  })

  describe(`the text, on ${latestSupportedBedrockVersion}`, () => {
    const version = latestSupportedBedrockVersion

    it('shows a title without its § codes, as Java shows a JSON text\'s', async () => {
      const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
      const events = titleEvents(bot)
      server.send('set_title', setTitle(version, 'set_title', '§cobserver §ltitle'))
      server.send('set_title', setTitle(version, 'set_subtitle_json', '{"rawtext":[{"text":"§cobserver"},{"text":" subtitle"}]}'))
      await driver.frame(0)
      assert.deepStrictEqual(events, ["title 'observer title'", "subtitle 'observer subtitle'"])
      bot.end()
    })

    it('translates rawtext with the version\'s language, its parameters strings or rawtext', async () => {
      const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
      const events = titleEvents(bot)
      server.send('set_title', setTitle(version, 'set_title_json', '{"rawtext":[{"translate":"death.attack.player","with":["observer","%item.apple.name"]}]}'))
      server.send('set_title', setTitle(version, 'set_subtitle_json', '{"rawtext":[{"translate":"death.attack.generic","with":{"rawtext":[{"text":"observer"}]}}]}'))
      await driver.frame(0)
      assert.deepStrictEqual(events, ["title 'observer was slain by Apple'", "subtitle 'observer died'"])
      bot.end()
    })

    it('shows nothing of JSON titles that are not rawtext, as the vanilla client', async () => {
      const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
      const events = titleEvents(bot)
      server.send('set_title', setTitle(version, 'set_title_json', 'observer title'))
      server.send('set_title', setTitle(version, 'set_subtitle_json', '{"text":"observer subtitle"}'))
      server.send('set_title', setTitle(version, 'set_title', '{"rawtext":[{"text":"observer title"}]}'))
      await driver.frame(0)
      assert.deepStrictEqual(events, ['title \'{"rawtext":[{"text":"observer title"}]}\''])
      bot.end()
    })
  })
})
