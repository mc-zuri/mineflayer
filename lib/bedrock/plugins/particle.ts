import { Vec3 } from 'vec3'
import type { Particle } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// spawn_particle_effect shows one effect by its name (/particle): Bedrock has no particle ids, and minecraft-data no
// Bedrock particles, so Java's Particle class cannot be built for its registry.

const OWNER = 'particle'
// Bedrock names the effect
const NO_ID = -1

class BedrockParticle implements Particle {
  id = NO_ID
  name: string
  position: Vec3
  // the effect itself spreads and moves its particles
  offset = new Vec3(0, 0, 0)
  count = 1
  movementSpeed = 0
  longDistanceRender = false

  constructor (name: string, position: Vec3) {
    this.name = name
    this.position = position
  }
}

export default function inject (bot: BedrockBotInternal): void {
  // the position is relative to the packet's entity, when it names one (never recorded): as sent
  bot._core.handle(OWNER, 'spawn_particle_effect', ({ particle_name: name, position: { x, y, z } }) => {
    bot._core.emit(bot, 'particle', new BedrockParticle(name, new Vec3(x, y, z)))
  })
}
