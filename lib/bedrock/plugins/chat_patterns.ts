import type { ChatMessage } from 'prismarine-chat'

// Java's chat patterns (lib/plugins/chat.ts), its quirks kept: addChatPatternSet returns the slot count, not its index,
// and a set still waiting for its next message ends the matching of the message it matched.

/** a deprecated pattern's event: the capture groups, the first message's translate key, then the messages */
export type DeprecatedPatternArgs = Array<string | ChatMessage | undefined>

export interface PatternEvents {
  /** a deprecated pattern (chatAddPattern) matched: its event is the name the user gave it */
  deprecated: (name: string, args: DeprecatedPatternArgs) => void
  /** a pattern or set matched all its messages: `chat:<name>` with them, or with their capture groups */
  completed: (name: string, matches: string[] | string[][]) => void
}

export interface PatternOptions {
  repeat?: boolean | undefined
  parse?: boolean | undefined
  deprecated?: boolean
}

interface Slot {
  readonly name: string
  readonly patterns: readonly RegExp[]
  readonly repeat: boolean
  readonly parse: boolean
  readonly deprecated: boolean
  /** the next pattern of the set to match */
  position: number
  matches: string[]
  messages: ChatMessage[]
}

export class ChatPatterns {
  private readonly slots = new Map<number, Slot>()
  /** the slots ever added: a removed slot's index is not reused */
  private length = 0

  /** the new slot's index */
  add (name: string, pattern: RegExp, options: PatternOptions = {}): number {
    assertRegExps([pattern])
    this.slots.set(this.length, slot(name, [pattern], options))
    return this.length++
  }

  /** the number of slots, the new one counted (Java's return value: the index is one less) */
  addSet (name: string, patterns: RegExp[], { repeat, parse }: Omit<PatternOptions, 'deprecated'> = {}): number {
    assertRegExps(patterns)
    this.slots.set(this.length++, slot(name, patterns, { repeat, parse }))
    return this.length
  }

  /** the slot at an index, or every slot of a name */
  remove (name: string | number): void {
    if (typeof name === 'number') this.slots.delete(name)
    else {
      for (const [index, { name: slotName }] of this.slots) {
        if (slotName === name) this.slots.delete(index)
      }
    }
  }

  /** advances the slots whose next pattern matches the message, emitting what they complete; whether any did */
  match (text: string, message: ChatMessage, events: PatternEvents): boolean {
    const found = [...this.slots].filter(([, { patterns, position }]) => patterns[position]!.test(text)).map(([index]) => index)
    for (const index of found) {
      // an earlier slot's listener may have removed it
      const slot = this.slots.get(index)
      if (slot === undefined) continue
      slot.matches.push(text)
      slot.messages.push(message)
      slot.position++
      if (slot.deprecated) {
        events.deprecated(slot.name, [...captures(slot.matches[0]!, slot.patterns[0]!), slot.messages[0]!.translate, ...slot.messages])
        slot.messages = []
      } else {
        if (slot.patterns.length > slot.matches.length) return true
        events.completed(slot.name, slot.parse ? slot.patterns.map((pattern, i) => captures(slot.matches[i]!, pattern)) : slot.matches)
      }
      if (slot.repeat) {
        slot.position = 0
        slot.matches = []
      } else {
        this.slots.delete(index)
      }
    }
    return found.length > 0
  }
}

function slot (name: string, patterns: RegExp[], { repeat = true, parse = false, deprecated = false }: PatternOptions): Slot {
  return { name, patterns, repeat, parse, deprecated, position: 0, matches: [], messages: [] }
}

function assertRegExps (patterns: readonly RegExp[]): void {
  if (!patterns.every(pattern => pattern instanceof RegExp)) throw new Error('Pattern parameter should be of type RegExp')
}

/** the capture groups of a string the pattern matched */
function captures (text: string, pattern: RegExp): string[] {
  return text.match(pattern)!.slice(1)
}
