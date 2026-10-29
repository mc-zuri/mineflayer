import { Vec3 } from 'vec3'
import type { Registry } from 'prismarine-registry'
import type { Particle as ParticleApi } from './types/api/index.ts'
import type { ClientboundPackets } from './types/protocol/client.ts'

export default loader

function loader (registry: Registry) {
  class Particle implements ParticleApi {
    declare id: number
    /** the registry's name of the particle; undefined for an id the registry does not have */
    declare name: string | undefined
    declare position: Vec3
    declare offset: Vec3
    declare count: number
    declare movementSpeed: number
    declare longDistanceRender: boolean

    /** id: the particle's id, or (as 1.20.5+ packets give it) its name */
    constructor (id: number | string, position: Vec3, offset: Vec3, count = 1, movementSpeed = 0, longDistanceRender = false) {
      if (typeof id === 'number') {
        this.id = id
        this.name = registry.particles[id]?.name
      } else {
        const particle = registry.particlesByName[id]
        if (particle === undefined) throw new Error(`The registry has no particle named ${id}`)
        this.id = particle.id
        this.name = particle.name
      }
      this.position = position
      this.offset = offset
      this.count = count
      this.movementSpeed = movementSpeed
      this.longDistanceRender = longDistanceRender
    }

    static fromNetwork (packet: ClientboundPackets['world_particles']): Particle {
      const position = new Vec3(packet.x, packet.y, packet.z)
      const offset = new Vec3(packet.offsetX, packet.offsetY, packet.offsetZ)
      // 1.20.5+ (updatedParticlesPacket) name the particle in a particle object, before by its id
      if (packet.particle !== undefined) {
        // TODO: We add extra data that's inside packet.particle.data that varies by the particle's .type
        return new Particle(packet.particle.type, position, offset, packet.amount, packet.velocityOffset, packet.longDistance)
      }
      if (packet.particleId === undefined) throw new Error('A world_particles packet without particle nor particleId')
      return new Particle(packet.particleId, position, offset, packet.particles, packet.particleData, packet.longDistance)
    }
  }

  return Particle
}
