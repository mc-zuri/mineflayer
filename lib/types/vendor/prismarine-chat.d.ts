// prismarine-chat's typings (its index.d.ts, imported by subpath) with what they get wrong about its runtime fixed;
// tsconfig.json maps prismarine-chat here. Upstream candidates, listed in docs/typescript/api-mismatches.md.
// - The loader takes a registry too (mineflayer passes bot.registry), not only a version.
// - fromNotch takes the NBT text component 1.20.3+ packets carry, not only JSON text.
// - The constructor takes a JSON text component (and an array of them), not only a MessageBuilder.
import type { Tags, TagType } from 'prismarine-nbt'
import type { Registry } from 'prismarine-registry'
import type { ChatMessage } from 'prismarine-chat/index.js'

/** a JSON text component: https://minecraft.wiki/w/Text_component_format */
export interface TextComponent {
  text?: string | number
  translate?: string
  with?: Array<TextComponent | string | number>
  extra?: Array<TextComponent | string>
  color?: string
  font?: string
  bold?: boolean
  italic?: boolean
  underlined?: boolean
  strikethrough?: boolean
  obfuscated?: boolean
  insertion?: string
  selector?: string
  keybind?: string
  score?: { name: string, objective: string, value?: string }
  clickEvent?: { action: string, value: string }
  hoverEvent?: { action: string, value?: TextComponent | string, contents?: TextComponent | string }
}

/** the ChatMessage class a loader returns */
export interface ChatMessageClass extends Omit<typeof ChatMessage, 'fromNotch' | 'prototype'> {
  new (message: ConstructorParameters<typeof ChatMessage>[0] | TextComponent | Array<TextComponent | string>, displayWarning?: boolean): ChatMessage
  prototype: ChatMessage
  /** a message from a packet: JSON text, or (1.20.3+) an NBT text component */
  fromNotch (message: string | Tags[TagType]): ChatMessage
}

declare const loader: (registryOrVersion: string | Registry) => ChatMessageClass
export default loader
export type { ChatMessage }
export { processNbtMessage } from 'prismarine-chat/index.js'
