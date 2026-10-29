// prismarine-chat's typings (its index.d.ts, imported by subpath) with what they get wrong about its runtime fixed;
// tsconfig.json maps prismarine-chat here. Upstream candidates, listed in docs/typescript/api-mismatches.md.
// - The loader takes a registry too (mineflayer passes bot.registry), not only a version.
// - fromNotch takes the NBT text component 1.20.3+ packets carry, not only JSON text.
import type { Tags, TagType } from 'prismarine-nbt'
import type { Registry } from 'prismarine-registry'
import type { ChatMessage } from 'prismarine-chat/index.js'

/** the ChatMessage class a loader returns */
export interface ChatMessageClass extends Omit<typeof ChatMessage, 'fromNotch' | 'prototype'> {
  new (...args: ConstructorParameters<typeof ChatMessage>): ChatMessage
  prototype: ChatMessage
  /** a message from a packet: JSON text, or (1.20.3+) an NBT text component */
  fromNotch (message: string | Tags[TagType]): ChatMessage
}

declare const loader: (registryOrVersion: string | Registry) => ChatMessageClass
export default loader
export type { ChatMessage }
export { processNbtMessage } from 'prismarine-chat/index.js'
