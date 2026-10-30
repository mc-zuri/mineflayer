import { Vec3 } from 'vec3'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// The server plays a sound by its name (play_sound, as Java's named sounds) or by its type (level_sound_event), which
// minecraft-data names up to 1.26.20 (from 1.16.220; numbers before) and the server itself names from 1.26.30.

const OWNER = 'sound'
// play_sound's coordinates are the position × 8, as Java's
const COORDINATE_SCALE = 8
// Java's master: Bedrock has no sound categories
const MASTER = 0
// level_sound_event has neither: the vanilla client takes them from its sound definitions
const VOLUME = 1
const PITCH = 1

export default function inject (bot: BedrockBotInternal): void {
  bot._core.handle(OWNER, 'play_sound', ({ name, coordinates: { x, y, z }, volume, pitch }) => {
    bot._core.emit(bot, 'soundEffectHeard', name, new Vec3(x, y, z).scaled(1 / COORDINATE_SCALE), volume, pitch)
  })

  bot._core.handle(OWNER, 'level_sound_event', ({ sound_id: sound, position: { x, y, z } }) => {
    const position = new Vec3(x, y, z)
    // a number up to 1.16.210, or an id the version's names lack
    if (typeof sound === 'number') bot._core.emit(bot, 'hardcodedSoundEffectHeard', sound, MASTER, position, VOLUME, PITCH)
    else bot._core.emit(bot, 'soundEffectHeard', sound, position, VOLUME, PITCH)
  })
}
