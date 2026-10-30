import prismarineChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import prismarineEntity from 'prismarine-entity'
import type { Entity } from 'prismarine-entity'
import type { Item } from 'prismarine-item'
import type { Registry } from 'prismarine-registry'
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
