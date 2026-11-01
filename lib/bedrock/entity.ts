import prismarineChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import prismarineEntity from 'prismarine-entity'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import type { Registry } from 'prismarine-registry'
import { Vec3 } from 'vec3'
import { EntityMetadata } from './metadata.ts'
import { textComponent } from './text.ts'

/** prismarine-entity's Entity of the version, reading a Bedrock entity's metadata */
export function bedrockEntityClass (registry: Registry): typeof Entity {
  const ChatMessage = prismarineChat(registry)
  const metadata = new EntityMetadata(registry)
  return class BedrockEntity extends prismarineEntity(registry) {
    /** the name tag, its § codes styling it as the vanilla client draws it; null without one */
    override getCustomName (): ChatMessage | null {
      const name = metadata.value(this.metadata, 'nametag')
      return typeof name === 'string' && name !== '' ? new ChatMessage(textComponent(name)) : null
    }

    override getDroppedItem (): Item | null {
      throw new Error('entity.getDroppedItem() is not supported on Bedrock yet')
    }
  }
}

/** where an entity looks from: its eye (a player's the vanilla client's, 1.62001 over the feet), else its box's top, as Java's */
export function eyePositionOf (entity: Entity): Vec3 {
  return entity.position.offset(0, entity.eyeHeight ?? entity.height, 0)
}

/** Java's direction of a look, from mineflayer's radians */
export function viewDirection ({ yaw, pitch }: { yaw: number, pitch: number }): Vec3 {
  return new Vec3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch))
}
