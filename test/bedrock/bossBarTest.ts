import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, BossBar } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient } from './common/server.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'

// The packets are those servers sent the vanilla Bedrock client, recorded in the dimensions scenario on every build from
// 1.16.220: `summon ender_dragon` (add_entity, show_bar, the client's register_player), the dragon's progress twice,
// its removal; on 1.26.20 also an End dragon the server hid (hide_bar, the client's unregister_player). Versions are
// grouped by boss_event's layout: the recorded bytes from 1.16.220, the recorded values on 1.16.201 – 1.16.210.

const PLAYER = -8589934591n
const DRAGON = -8589934590n
const END_DRAGON = -8589934589n
// 'entity.ender_dragon.name', after its length
const DRAGON_NAME = '18656e746974792e656e6465725f647261676f6e2e6e616d65'
const REMOVE_DRAGON = '0efbffffff3f'

interface RecordedBar {
  /** the dragon's bar: its name, progress 1, purple, no notches */
  showBar: string
  /** the vanilla client's answer */
  register: string
  /** progress 0, sent twice */
  progress: string
}

const RECORDED_DRAGON = "'Ender Dragon' 1 purple 0"
const RECORDED_EVENTS = [
  `created ${DRAGON} ${RECORDED_DRAGON} of 1`,
  `updated ${DRAGON} 'Ender Dragon' 0 purple 0 of 1`,
  `updated ${DRAGON} 'Ender Dragon' 0 purple 0 of 1`,
  `deleted ${DRAGON} 'Ender Dragon' 0 purple 0 of 1`
]

type BossEventType = ClientboundPacketsToWrite['boss_event']['type']

function oneLayout (version: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, 'bedrock_1.26.30')
}

/** a boss_event as the version's servers write it: from 1.26.30 every type has every field */
function bossEvent (server: FakeBedrockClient, uniqueId: bigint, type: BossEventType, fields: Partial<ClientboundPacketsToWrite['boss_event']> = {}): void {
  const params = oneLayout(server.codec.version)
    ? { target_entity_id: uniqueId, player_id: 0n, type, title: '', filtered_title: '', progress: 0, color: 'pink', overlay: 'progress', ...fields }
    : { boss_entity_id: uniqueId, type, ...fields }
  server.receive(server.codec.serializer.createPacketBuffer({ name: 'boss_event', params }))
}

/** the dragon's bar as the version's servers show it (up to 1.16.210 without a style) */
function showDragon (server: FakeBedrockClient, uniqueId: bigint): void {
  const style = oneLayout(server.codec.version) ? { color: 'purple', overlay: 'progress' } as const : { color: 5, overlay: 0, screen_darkening: 0 }
  bossEvent(server, uniqueId, 'show_bar', { title: 'entity.ender_dragon.name', filtered_title: '', progress: 1, bar_progress: 1, ...style })
}

function addEntity (server: FakeBedrockClient, uniqueId: bigint): void {
  // up to 1.19.1 the unique id is entity_id_self
  server.send('add_entity', isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.19.10')
    ? { unique_id: uniqueId, entity_type: 'minecraft:ender_dragon' }
    : { entity_id_self: uniqueId, entity_type: 'minecraft:ender_dragon' })
}

/** the dragon's style as the version shows it: none up to 1.16.210 */
function dragonStyle (version: BedrockVersion): string {
  return isBedrockVersionAtLeast(version, 'bedrock_1.16.220') ? 'purple 0' : 'undefined 0'
}

function describeBar (bar: BossBar): string {
  return `${bar.entityUUID} '${bar.title.toString()}' ${bar.health} ${bar.color} ${bar.dividers}${bar.shouldDarkenSky ? ' darkened' : ''}`
}

/** the boss bar events and errors, in order, each as a line with the number of bars shown then */
function barEvents (bot: BedrockBot): string[] {
  const events: string[] = []
  const line = (event: string) => (bar: BossBar) => { events.push(`${event} ${describeBar(bar)} of ${bot.bossBars.length}`) }
  bot.on('bossBarCreated', line('created'))
  bot.on('bossBarUpdated', line('updated'))
  bot.on('bossBarDeleted', line('deleted'))
  bot.on('error', error => { events.push(`error ${error.message}`) })
  return events
}

function answers (server: FakeBedrockClient): Array<BedrockServerboundPackets['boss_event']> {
  return server.batches.flat().filter(packet => packet.owner === 'boss_bar').map(packet => {
    assert.strictEqual(packet.name, 'boss_event')
    return packet.params as BedrockServerboundPackets['boss_event']
  })
}

function answeredBytes (server: FakeBedrockClient): string[] {
  return answers(server).map(params => server.codec.serializer.createPacketBuffer({ name: 'boss_event', params }).toString('hex'))
}

async function botInGame (version: BedrockVersion): Promise<Awaited<ReturnType<typeof bedrockTestBot>> & { events: string[] }> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  testBot.server.send('start_game', { entity_id: PLAYER })
  await testBot.driver.frame(0)
  return { ...testBot, events: barEvents(testBot.bot) }
}

async function recordedDragon (version: BedrockVersion, recorded: RecordedBar): Promise<void> {
  const { bot, server, driver, events } = await botInGame(version)
  addEntity(server, DRAGON)
  server.receive(Buffer.from(recorded.showBar, 'hex'))
  await driver.frame(0)
  assert.deepStrictEqual(events, RECORDED_EVENTS.slice(0, 1))
  assert.deepStrictEqual(answeredBytes(server), [recorded.register])
  const [bar] = bot.bossBars
  assert.deepStrictEqual([bar?.isDragonBar, bar?.createFog, bar?.shouldCreateFog, bar?.flags], [false, false, false, 0])
  server.receive(Buffer.from(recorded.progress, 'hex'))
  server.receive(Buffer.from(recorded.progress, 'hex'))
  server.receive(Buffer.from(REMOVE_DRAGON, 'hex'))
  await driver.frame(0)
  assert.deepStrictEqual(events, RECORDED_EVENTS)
  assert.deepStrictEqual(bot.bossBars, [])
  assert.deepStrictEqual(answeredBytes(server), [recorded.register])
  bot.end()
}

describe('bedrock boss bars', () => {
  for (const [layout, oldest, latest, recorded] of [
    ['a numbered style (1.16.220 – 1.21.50)', 'bedrock_1.16.220', 'bedrock_1.21.50', {
      showBar: `4afbffffff3f00${DRAGON_NAME}0000803f00000500`,
      register: '4afbffffff3f01fdffffff3f',
      progress: '4afbffffff3f0400000000'
    }],
    ['a filtered title (1.21.60 – 1.26.20)', 'bedrock_1.21.60', 'bedrock_1.26.20', {
      showBar: `4afbffffff3f00${DRAGON_NAME}000000803f00000500`,
      register: '4afbffffff3f01fdffffff3f',
      progress: '4afbffffff3f0400000000'
    }],
    ['every field of every type, and the player (1.26.30 – 1.26.45)', 'bedrock_1.26.30', 'bedrock_1.26.45', {
      showBar: `4afbffffff3f0000${DRAGON_NAME}000000803f0500`,
      register: `4afbffffff3ffdffffff3f01${DRAGON_NAME}00000000000100`,
      progress: `4afbffffff3f0004${DRAGON_NAME}00000000000500`
    }],
    ['every field of every type (1.26.51+)', 'bedrock_1.26.51', latestSupportedBedrockVersion, {
      showBar: `4afbffffff3f00${DRAGON_NAME}000000803f0500`,
      register: `4afbffffff3f01${DRAGON_NAME}00000000000100`,
      progress: `4afbffffff3f04${DRAGON_NAME}00000000000500`
    }]
  ] as const) {
    describe(`servers sending ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(oldest, latest)) {
        it(`bedrock ${version}: shows the recorded dragon's bar, answered as the vanilla client, until the dragon goes`, async () => {
          await recordedDragon(version, recorded)
        })
      }
    })
  }

  describe('servers sending a numbered style (1.16.220 – 1.26.20)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.220', 'bedrock_1.26.20')) {
      it(`bedrock ${version}: follows each type's fields, as Java's bar`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        addEntity(server, DRAGON)
        showDragon(server, DRAGON)
        bossEvent(server, DRAGON, 'update_properties', { screen_darkening: 1, color: 2, overlay: 2 })
        bossEvent(server, DRAGON, 'texture', { color: 7, overlay: 4 })
        // Java has no rebecca purple
        bossEvent(server, DRAGON, 'texture', { color: 6, overlay: 3 })
        // Java's bar has no dividers of an overlay it does not know either
        bossEvent(server, DRAGON, 'texture', { color: 1, overlay: 9 })
        bossEvent(server, DRAGON, 'update_properties', { screen_darkening: 0, color: 0, overlay: 1 })
        bossEvent(server, DRAGON, 'set_bar_title', { title: '§5Observer 100%', filtered_title: '' })
        bossEvent(server, DRAGON, 'set_bar_progress', { progress: 0.5 })
        bossEvent(server, DRAGON, 'show_bar', { title: 'entity.wither.name', filtered_title: '', progress: 0.25, screen_darkening: 1, color: 3, overlay: 4 })
        await driver.frame(0)
        assert.deepStrictEqual(events, [
          `created ${DRAGON} ${RECORDED_DRAGON} of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 red 10 darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 white 20 darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 undefined 12 darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 blue undefined darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 pink 6 of 1`,
          `updated ${DRAGON} 'Observer 100%' 1 pink 6 of 1`,
          `updated ${DRAGON} 'Observer 100%' 0.5 pink 6 of 1`,
          `updated ${DRAGON} 'Wither' 0.25 green 20 darkened of 1`
        ])
        assert.strictEqual(bot.bossBars[0]?.flags, 0x1)
        assert.deepStrictEqual(answeredBytes(server), ['4afbffffff3f01fdffffff3f'])
        bot.end()
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.21.60', 'bedrock_1.26.20')) {
      it(`bedrock ${version}: hides the recorded End dragon's bar, answered as the vanilla client`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        addEntity(server, END_DRAGON)
        server.receive(Buffer.from(`4af9ffffff3f00${DRAGON_NAME}000000803f00000500`, 'hex'))
        await driver.frame(0)
        server.receive(Buffer.from('4af9ffffff3f02', 'hex'))
        await driver.frame(0)
        server.receive(Buffer.from('0ef9ffffff3f', 'hex'))
        await driver.frame(0)
        assert.deepStrictEqual(events, [`created ${END_DRAGON} ${RECORDED_DRAGON} of 1`, `deleted ${END_DRAGON} ${RECORDED_DRAGON} of 1`])
        assert.deepStrictEqual(answeredBytes(server), ['4af9ffffff3f01fdffffff3f', '4af9ffffff3f03fdffffff3f'])
        assert.deepStrictEqual(bot.bossBars, [])
        bot.end()
      })
    }
  })

  describe('servers sending every field of every type (1.26.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.30')) {
      it(`bedrock ${version}: takes each type's own fields, and answers with the bar's titles`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        addEntity(server, DRAGON)
        showDragon(server, DRAGON)
        const others = { title: 'entity.wither.name', filtered_title: 'Wither', progress: 0.5 }
        bossEvent(server, DRAGON, 'update_properties', { ...others, color: 'rebecca_purple', overlay: 'notched_12' })
        bossEvent(server, DRAGON, 'texture', { ...others, color: 'red', overlay: 'notched_6' })
        bossEvent(server, DRAGON, 'set_bar_title', { title: '§5Observer', filtered_title: 'Obs', progress: 0.5, color: 'white', overlay: 'notched_20' })
        bossEvent(server, DRAGON, 'set_bar_progress', { ...others, color: 'white', overlay: 'notched_20' })
        bossEvent(server, DRAGON, 'hide_bar', others)
        await driver.frame(0)
        assert.deepStrictEqual(events, [
          `created ${DRAGON} ${RECORDED_DRAGON} of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 undefined 12 of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 red 6 of 1`,
          `updated ${DRAGON} 'Observer' 1 red 6 of 1`,
          `updated ${DRAGON} 'Observer' 0.5 red 6 of 1`,
          `deleted ${DRAGON} 'Observer' 0.5 red 6 of 1`
        ])
        const player = isBedrockVersionAtLeast(version, 'bedrock_1.26.51') ? {} : { player_id: PLAYER }
        const answer = { target_entity_id: DRAGON, ...player, progress: 0, color: 'blue', overlay: 'progress' }
        assert.deepStrictEqual(answers(server), [
          { ...answer, type: 'register_player', title: 'entity.ender_dragon.name', filtered_title: '' },
          { ...answer, type: 'unregister_player', title: '§5Observer', filtered_title: 'Obs' }
        ])
        bot.end()
      })
    }
  })

  describe('servers sending no style with the bar (1.16.201 – 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.16.210')) {
      it(`bedrock ${version}: shows the bar without a colour, and its style once the server sends it`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        addEntity(server, DRAGON)
        showDragon(server, DRAGON)
        bossEvent(server, DRAGON, 'update_properties', { darkness_factor: 1 })
        bossEvent(server, DRAGON, 'texture', { color: 3, overlay: 1 })
        bossEvent(server, DRAGON, 'set_bar_progress', { bar_progress: 0.5 })
        bossEvent(server, DRAGON, 'set_bar_title', { title: 'Observer' })
        bossEvent(server, DRAGON, 'hide_bar')
        await driver.frame(0)
        assert.deepStrictEqual(events, [
          `created ${DRAGON} 'Ender Dragon' 1 undefined 0 of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 undefined 0 darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 1 green 6 darkened of 1`,
          `updated ${DRAGON} 'Ender Dragon' 0.5 green 6 darkened of 1`,
          `updated ${DRAGON} 'Observer' 0.5 green 6 darkened of 1`,
          `deleted ${DRAGON} 'Observer' 0.5 green 6 darkened of 1`
        ])
        assert.deepStrictEqual(answers(server), [
          { boss_entity_id: DRAGON, type: 'register_player', player_id: PLAYER },
          { boss_entity_id: DRAGON, type: 'unregister_player', player_id: PLAYER }
        ])
        bot.end()
      })
    }
  })

  describe('every version', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: shows a bar only for an entity the bot has, and drops every bar with its entities on a dimension change`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        showDragon(server, DRAGON)
        addEntity(server, DRAGON)
        addEntity(server, END_DRAGON)
        await driver.frame(0)
        assert.deepStrictEqual([events, answers(server)], [[], []])
        showDragon(server, END_DRAGON)
        showDragon(server, DRAGON)
        await driver.frame(0)
        assert.deepStrictEqual(bot.bossBars.map(bar => bar.entityUUID), [String(END_DRAGON), String(DRAGON)])
        server.send('change_dimension')
        showDragon(server, DRAGON)
        await driver.frame(0)
        assert.deepStrictEqual(events, [
          `created ${END_DRAGON} 'Ender Dragon' 1 ${dragonStyle(version)} of 1`,
          `created ${DRAGON} 'Ender Dragon' 1 ${dragonStyle(version)} of 2`,
          `deleted ${END_DRAGON} 'Ender Dragon' 1 ${dragonStyle(version)} of 2`,
          `deleted ${DRAGON} 'Ender Dragon' 1 ${dragonStyle(version)} of 1`
        ])
        assert.deepStrictEqual(bot.bossBars, [])
        assert.strictEqual(answers(server).length, 2)
        bot.end()
      })

      it(`bedrock ${version}: changes no bar it has not, and takes no player's answer as a change`, async () => {
        const { bot, server, driver, events } = await botInGame(version)
        addEntity(server, DRAGON)
        bossEvent(server, DRAGON, 'set_bar_title', { title: 'Observer', filtered_title: '' })
        bossEvent(server, DRAGON, 'hide_bar')
        server.receive(Buffer.from(REMOVE_DRAGON, 'hex'))
        showDragon(server, DRAGON)
        addEntity(server, DRAGON)
        showDragon(server, DRAGON)
        bossEvent(server, DRAGON, 'register_player', { player_id: PLAYER })
        bossEvent(server, DRAGON, 'unregister_player', { player_id: PLAYER })
        bossEvent(server, END_DRAGON, 'hide_bar')
        server.receive(Buffer.from('0ef9ffffff3f', 'hex'))
        await driver.frame(0)
        assert.deepStrictEqual(events, [`created ${DRAGON} 'Ender Dragon' 1 ${dragonStyle(version)} of 1`])
        assert.strictEqual(answers(server).length, 1)
        bot.end()
      })

      it(`bedrock ${version}: has no boss bars with the plugin disabled`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { boss_bar: false } })
        const events = barEvents(bot)
        addEntity(server, DRAGON)
        showDragon(server, DRAGON)
        await driver.frame(0)
        assert.strictEqual(Object.hasOwn(bot, 'bossBars'), false)
        assert.deepStrictEqual([events, answers(server)], [[], []])
        bot.end()
      })
    }
  })

  it(`keeps Java's flags, on ${latestSupportedBedrockVersion}`, async () => {
    const { bot, server, driver } = await botInGame(latestSupportedBedrockVersion)
    addEntity(server, DRAGON)
    showDragon(server, DRAGON)
    await driver.frame(0)
    const [bar] = bot.bossBars
    assert.ok(bar !== undefined)
    bar.flags = 0x2
    assert.deepStrictEqual([bar.shouldDarkenSky, bar.isDragonBar, bar.createFog, bar.shouldCreateFog], [false, true, false, false])
    bar.flags = 0x5
    assert.deepStrictEqual([bar.shouldDarkenSky, bar.isDragonBar, bar.createFog, bar.shouldCreateFog], [true, false, true, true])
    bar.flags = 0x1
    assert.deepStrictEqual([bar.shouldDarkenSky, bar.isDragonBar, bar.createFog, bar.flags], [true, false, false, 0x1])
    bar.isDragonBar = true
    assert.strictEqual(bar.flags, 0x3)
    bar.createFog = true
    assert.strictEqual(bar.flags, 0x7)
    bot.end()
  })
})
