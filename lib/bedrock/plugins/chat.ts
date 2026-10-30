import type { TextComponent } from 'prismarine-chat'
import { bedrockText, rawTextComponent, textComponent, translationComponent } from '../text.ts'
import type { BedrockLanguage } from '../text.ts'
import { ChatPatterns } from './chat_patterns.ts'
import type { BedrockBotOptions } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

// What the vanilla client shows in its chat and above the hotbar, as Java's messages: the text packets, the output of
// the bot's commands, and the action bar's titles. Each is message, the chat patterns' events, messagestr,
// unmatchedMessage when no pattern matched, and actionBar above the hotbar, in the packet pass.

type TextPacket = BedrockClientboundPackets['text']
type TextType = Exclude<TextPacket['type'], number>

/** where Java's servers send the same: a player's chat as 'chat', system chat as 'system', the action bar as 'game_info' */
type Position = 'chat' | 'system' | 'game_info'

const OWNER = 'chat'
const MS_PER_TICK = 50
/** Java's */
const AWAIT_MESSAGE_TIMEOUT_MS = 20000
const USERNAME_REGEX = '(?:\\(.{1,15}\\)|\\[.{1,15}\\]|.){0,5}?(\\w+)'

const POSITIONS: Readonly<Record<TextType, Position>> = Object.freeze({
  raw: 'system',
  chat: 'chat',
  translation: 'system',
  popup: 'game_info',
  jukebox_popup: 'game_info',
  tip: 'game_info',
  system: 'system',
  whisper: 'chat',
  // the server's /say
  announcement: 'chat',
  json_whisper: 'system',
  json: 'system',
  json_announcement: 'chat'
})

export default function inject (bot: BedrockBotInternal, options: BedrockBotOptions): void {
  const core = bot._core
  const { ChatMessage, language } = bedrockText(bot.registry)
  const patterns = new ChatPatterns()
  const stats = { invalidRawText: 0, unknownType: 0 }
  bot._chat = { stats }

  /** a message the vanilla client shows; undefined: a rawtext it does not show */
  function show (component: TextComponent | undefined, position: Position): void {
    if (component === undefined) {
      stats.invalidRawText++
      return
    }
    const message = new ChatMessage(component)
    const shown = message.toString()
    core.emit(bot, 'message', message, position)
    const matched = patterns.match(shown, message, {
      deprecated: (name, args) => { core.emitNamed(bot, name, args) },
      completed: (name, matches) => { core.emit(bot, `chat:${name}`, matches) }
    })
    core.emit(bot, 'messagestr', shown, position, message)
    if (!matched) core.emit(bot, 'unmatchedMessage', shown, message)
    if (position === 'game_info') core.emit(bot, 'actionBar', message)
  }

  core.handle(OWNER, 'text', packet => {
    if (typeof packet.type === 'number') {
      stats.unknownType++
      return
    }
    show(textPacketComponent(packet, packet.type, language), POSITIONS[packet.type])
  })

  core.handle(OWNER, 'command_output', packet => {
    for (const { success, message_id: messageId, parameters } of packet.output) {
      const component = translationComponent(messageId, parameters, language)
      // the vanilla client shows a failure in red
      show(success ? component : { color: 'red', ...component }, 'system')
    }
  })

  // the action bar's titles (/title … actionbar, /titleraw … actionbar); the other titles are the HUD's
  core.observe(OWNER, 'set_title', ({ type, text }) => {
    // the type is a number on 1.16.201
    if (type === 'action_bar_message' || type === 4) show(textComponent(text), 'game_info')
    if (type === 'action_bar_message_json' || type === 8) show(rawTextComponent(text, language), 'game_info')
  })

  bot.addChatPattern = (name, pattern, patternOptions) => patterns.add(name, pattern, patternOptions)
  bot.addChatPatternSet = (name, patternSet, patternOptions) => patterns.addSet(name, patternSet, patternOptions)
  bot.chatAddPattern = (pattern, chatType) => patterns.add(chatType, pattern, { deprecated: true })
  bot.removeChatPattern = name => { patterns.remove(name) }

  if (options.defaultChatPatterns ?? true) {
    bot.chatAddPattern(new RegExp(`^${USERNAME_REGEX} whispers(?: to you)?:? (.*)$`), 'whisper')
    bot.chatAddPattern(new RegExp(`^\\[${USERNAME_REGEX} -> \\w+\\s?\\] (.*)$`), 'whisper')
    bot.chatAddPattern(new RegExp(`^${USERNAME_REGEX}\\s?[>:\\-»\\]\\)~]+\\s(.*)$`), 'chat')
  }

  bot.awaitMessage = async (...args: Array<string | RegExp | number | Array<string | RegExp>>) => {
    const last = args[args.length - 1]
    const timeout = typeof last === 'number' ? last : AWAIT_MESSAGE_TIMEOUT_MS
    const expected = args.flat().filter(arg => typeof arg !== 'number')
    let matched: string | undefined
    const listener = (message: string): void => {
      if (!expected.some(arg => typeof arg === 'string' ? message === arg : arg.test(message))) return
      matched = message
      bot.off('messagestr', listener)
    }
    bot.on('messagestr', listener)
    try {
      await core.waits.until(() => matched !== undefined, Math.ceil(timeout / MS_PER_TICK), `Timeout waiting for message after ${timeout}ms`)
    } finally {
      bot.off('messagestr', listener)
    }
    // the wait ended on the match
    return matched!
  }

  bot.tabComplete = async () => {
    throw new Error('bot.tabComplete is not supported on Bedrock: the server has no tab completion (the vanilla client completes commands from available_commands)')
  }
}

/** the text packet's message as the vanilla client shows it; undefined for a rawtext it does not show */
function textPacketComponent (packet: TextPacket, type: TextType, language: BedrockLanguage): TextComponent | undefined {
  const { source_name: source = '', message = '', parameters = [] } = packet
  if (type === 'json' || type === 'json_whisper' || type === 'json_announcement') return rawTextComponent(message, language)
  const body = packet.needs_translation ? translationComponent(message, parameters, language) : textComponent(message)
  // without a name, the text of /me
  if (type === 'chat' && source !== '') return { translate: 'chat.type.text', with: [textComponent(source), body] }
  if (type === 'whisper') return { translate: 'commands.message.display.incoming', with: [textComponent(source), body] }
  return body
}
