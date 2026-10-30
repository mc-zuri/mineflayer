import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion, Particle } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'

// The packet is the one servers sent the vanilla Bedrock client for `particle minecraft:heart_particle ~ ~2 ~` at feet
// y -60, recorded on 1.26.20, 1.26.51 and 1.26.60 (the same bytes). Versions are grouped by spawn_particle_effect's
// layout: the bytes on 1.18.30+ (molang variables), the recorded values written without them before.

const HEART = '7600010000003f000068c20000003f186d696e6563726166743a68656172745f7061727469636c65'

/** the recorded heart as the version's servers write it */
function heart (version: BedrockVersion): string {
  return isBedrockVersionAtLeast(version, 'bedrock_1.18.30') ? `${HEART}00` : HEART
}

const HEART_SHOWN = "'minecraft:heart_particle' -1 (0.5, -58, 0.5) offset (0, 0, 0) 1 0 false"

function describeParticle ({ name, id, position, offset, count, movementSpeed, longDistanceRender }: Particle): string {
  return `'${name}' ${id} ${position.toString()} offset ${offset.toString()} ${count} ${movementSpeed} ${longDistanceRender}`
}

function particles (bot: BedrockBot): string[] {
  const shown: string[] = []
  bot.on('particle', particle => { shown.push(describeParticle(particle)) })
  return shown
}

async function recordedHeart (version: BedrockVersion): Promise<void> {
  const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
  const shown = particles(bot)
  server.receive(Buffer.from(heart(version), 'hex'))
  await driver.frame(0)
  assert.deepStrictEqual(shown, [HEART_SHOWN])
  assert.deepStrictEqual(server.batches.flat().filter(packet => packet.owner === 'particle'), [])
  bot.end()
}

describe('bedrock particles', () => {
  describe('servers sending molang variables (1.18.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.30')) {
      it(`bedrock ${version}: shows the recorded particle, as Java's`, async () => {
        await recordedHeart(version)
      })
    }
  })

  describe('servers sending none (1.16.201 – 1.18.11)', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.18.11')) {
      it(`bedrock ${version}: shows the recorded particle, as Java's`, async () => {
        await recordedHeart(version)
      })
    }
  })

  describe('every version', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: shows no particle with the plugin disabled`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { particle: false } })
        const shown = particles(bot)
        server.receive(Buffer.from(heart(version), 'hex'))
        await driver.frame(0)
        assert.deepStrictEqual(shown, [])
        bot.end()
      })
    }
  })

  it(`bedrock ${latestSupportedBedrockVersion}: shows an entity's particle where the server puts it`, async () => {
    const { bot, server, driver } = await bedrockTestBot(bedrockCodec(latestSupportedBedrockVersion))
    const shown = particles(bot)
    server.send('spawn_particle_effect', { entity_id: -8589934590n, position: { x: 1, y: 2, z: 3 }, particle_name: 'minecraft:heart_particle' })
    await driver.frame(0)
    assert.deepStrictEqual(shown, ["'minecraft:heart_particle' -1 (1, 2, 3) offset (0, 0, 0) 1 0 false"])
    bot.end()
  })
})
