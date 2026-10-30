import assert from 'assert'
import type { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import type { FakeBedrockClient } from './common/server.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'

// The packets are those servers sent the vanilla Bedrock client. level_sound_event: a lit furnace at (2.5, y, 0.5),
// recorded on every build (its type 283, FurnaceUse, which the server names block.furnace.lit from 1.26.30).
// play_sound, recorded on 1.26.20, 1.26.51 and 1.26.60: `playsound random.orb @s ~ ~ ~ 1 1.5` at (0.5, -60, 0.5), a
// script's playSound of it at volume 0.5, and a jukebox's record.cat. Versions are grouped by each packet's layout:
// the recorded bytes, and the recorded values on the layouts nothing was recorded on.

interface RecordedSound {
  bytes: string
  heard: string
}

// up to 1.26.0 play_sound's y is a varint
const ORB_VARINT_Y = '560a72616e646f6d2e6f726208a0fcffff0f080000803f0000c03f'
const ORB = '560a72616e646f6d2e6f726208bf07080000803f0000c03f'
const ORB_HEARD = "named 'random.orb' (0.5, -60, 0.5) 1 1.5"
const SCRIPT_ORB_HEARD = "named 'random.orb' (0.5, -58.375, 0.5) 0.5 1.5"
const JUKEBOX_HEARD = "named 'record.cat' (2.5, -59.5, 0.5) 1 1"

const position = ({ x, y, z }: Vec3): string => `(${x}, ${y}, ${z})`

/** the sound events, in order, each as a line */
function soundEvents (bot: BedrockBot): string[] {
  const events: string[] = []
  bot.on('soundEffectHeard', (name, at, volume, pitch) => { events.push(`named '${name}' ${position(at)} ${volume} ${pitch}`) })
  bot.on('hardcodedSoundEffectHeard', (id, category, at, volume, pitch) => { events.push(`hardcoded ${id} ${category} ${position(at)} ${volume} ${pitch}`) })
  return events
}

function sentBySound (server: FakeBedrockClient): string[] {
  return server.batches.flat().filter(packet => packet.owner === 'sound').map(packet => packet.name)
}

async function heard (version: BedrockVersion, sounds: readonly RecordedSound[]): Promise<void> {
  const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
  const events = soundEvents(bot)
  for (const { bytes } of sounds) server.receive(Buffer.from(bytes, 'hex'))
  await driver.frame(0)
  assert.deepStrictEqual(events, sounds.map(sound => sound.heard))
  assert.deepStrictEqual(sentBySound(server), [])
  bot.end()
}

describe('bedrock sounds', () => {
  for (const [layout, oldest, latest, sounds] of [
    ['level_sound_event by its type\'s number (1.16.201 – 1.16.210)', oldestSupportedBedrockVersion, 'bedrock_1.16.210', [
      { bytes: '7b9b0200002040000090400000003f01000000', heard: 'hardcoded 283 0 (2.5, 4.5, 0.5) 1 1' },
      // the login's Spawn, before the player is placed
      { bytes: '7b350000003f850100470000003f01106d696e6563726166743a706c617965720000', heard: 'hardcoded 53 0 (0.5, 32769.51953125, 0.5) 1 1' }
    ]],
    // minecraft-data's names of these versions are misaligned: 283 is the furnace
    ['level_sound_event by minecraft-data\'s misaligned names (1.16.220 – 1.17.40)', 'bedrock_1.16.220', 'bedrock_1.17.40', [
      { bytes: '7b9b0200002040000090400000003f01000000', heard: "named 'JumpPrevent' (2.5, 4.5, 0.5) 1 1" }
    ]],
    ['level_sound_event by its type\'s name (1.18.0 – 1.21.60)', 'bedrock_1.18.0', 'bedrock_1.21.60', [
      { bytes: '7b9b020000204000006ec20000003f01000000', heard: "named 'FurnaceUse' (2.5, -59.5, 0.5) 1 1" },
      // an id the version does not name
      { bytes: '7b8f4e0000204000006ec20000003f01000000', heard: 'hardcoded 9999 0 (2.5, -59.5, 0.5) 1 1' }
    ]],
    ['level_sound_event with its entity (1.21.70 – 1.26.10)', 'bedrock_1.21.70', 'bedrock_1.26.10', [
      { bytes: '7b9b020000204000006ec20000003f01000000ffffffffffffffff', heard: "named 'FurnaceUse' (2.5, -59.5, 0.5) 1 1" },
      { bytes: '7b8f4e0000204000006ec20000003f01000000ffffffffffffffff', heard: 'hardcoded 9999 0 (2.5, -59.5, 0.5) 1 1' }
    ]],
    ['level_sound_event with where it fires (1.26.20)', 'bedrock_1.26.20', 'bedrock_1.26.20', [
      { bytes: '7b9b020000204000006ec20000003f01000000ffffffffffffffff00', heard: "named 'FurnaceUse' (2.5, -59.5, 0.5) 1 1" },
      { bytes: '7b8f4e0000204000006ec20000003f01000000ffffffffffffffff00', heard: 'hardcoded 9999 0 (2.5, -59.5, 0.5) 1 1' }
    ]],
    ['level_sound_event by the server\'s name (1.26.30+)', 'bedrock_1.26.30', latestSupportedBedrockVersion, [
      { bytes: '7b11626c6f636b2e6675726e6163652e6c69740000204000006ec20000003f01000000ffffffffffffffff00', heard: "named 'block.furnace.lit' (2.5, -59.5, 0.5) 1 1" }
    ]],
    ['play_sound with a varint y (1.16.201 – 1.26.0)', oldestSupportedBedrockVersion, 'bedrock_1.26.0', [
      { bytes: ORB_VARINT_Y, heard: ORB_HEARD }
    ]],
    ['play_sound with a signed y (1.26.10)', 'bedrock_1.26.10', 'bedrock_1.26.10', [
      { bytes: ORB, heard: ORB_HEARD }
    ]],
    ['play_sound with a handle (1.26.20 – 1.26.30)', 'bedrock_1.26.20', 'bedrock_1.26.30', [
      { bytes: `${ORB}00`, heard: ORB_HEARD },
      { bytes: '560a72616e646f6d2e6f726208a507080000003f0000c03f00', heard: SCRIPT_ORB_HEARD }
    ]],
    ['play_sound with its loops (1.26.40 – 1.26.45)', 'bedrock_1.26.40', 'bedrock_1.26.45', [
      { bytes: `${ORB}0000`, heard: ORB_HEARD }
    ]],
    ['play_sound with its range check and playback position (1.26.51+)', 'bedrock_1.26.51', latestSupportedBedrockVersion, [
      { bytes: `${ORB}00000000`, heard: ORB_HEARD },
      { bytes: '560a72616e646f6d2e6f726208a507080000003f0000c03f000001010000000000000000', heard: SCRIPT_ORB_HEARD },
      { bytes: '560a7265636f72642e63617428b707080000803f0000803f000101010000000000000000', heard: JUKEBOX_HEARD }
    ]]
  ] as const) {
    describe(`servers sending ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(oldest, latest)) {
        it(`bedrock ${version}: hears the recorded sounds, as Java's`, async () => {
          await heard(version, sounds)
        })
      }
    })
  }

  describe('every version', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: hears no sound with the plugin disabled`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { sound: false } })
        const events = soundEvents(bot)
        server.send('play_sound', { name: 'random.orb', coordinates: { x: 4, y: -480, z: 4 }, volume: 1, pitch: 1.5 })
        server.send('level_sound_event')
        await driver.frame(0)
        assert.deepStrictEqual(events, [])
        bot.end()
      })
    }
  })
})
