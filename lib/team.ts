import prismarineChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import type { Registry } from 'prismarine-registry'
import type { Team as TeamApi, TeamText } from './types/api/index.ts'

function colorString (color: number | undefined): string {
  const formatting = [
    'black',
    'dark_blue',
    'dark_green',
    'dark_aqua',
    'dark_red',
    'dark_purple',
    'gold',
    'gray',
    'dark_gray',
    'blue',
    'green',
    'aqua',
    'red',
    'light_purple',
    'yellow',
    'white',
    'obfuscated',
    'bold',
    'strikethrough',
    'underlined',
    'italic',
    'reset'
  ]
  if (color === undefined || color > 21 || color === -1) return 'reset'
  return formatting[color] ?? 'reset'
}

function loader (registry: Registry) {
  const ChatMessage = prismarineChat(registry)
  const MessageBuilder = ChatMessage.MessageBuilder
  return class Team implements TeamApi {
    declare team: string
    declare name: ChatMessage
    declare friendlyFire: number
    declare nameTagVisibility: string
    declare collisionRule: string
    declare color: string
    declare prefix: ChatMessage
    declare suffix: ChatMessage
    declare membersMap: { [name: string]: '' }

    constructor (team: string, name: TeamText, friendlyFire: number, nameTagVisibility: string, collisionRule: string, formatting: number | undefined, prefix: TeamText, suffix: TeamText) {
      this.team = team
      this.update(name, friendlyFire, nameTagVisibility, collisionRule, formatting, prefix, suffix)
      this.membersMap = {}
    }

    parseMessage (value: TeamText): ChatMessage {
      // 1.13+ (teamUsesChatComponents): JSON text, from 1.20.3 an NBT component; before: legacy text with § codes
      if (registry.supportFeature('teamUsesChatComponents') || typeof value !== 'string') {
        return ChatMessage.fromNotch(value)
      } else {
        const result = MessageBuilder.fromString(value, { colorSeparator: '§' })
        if (result === null) {
          return new ChatMessage('')
        }
        return new ChatMessage(result.toJSON())
      }
    }

    add (name: string): '' {
      this.membersMap[name] = ''
      return ''
    }

    remove (name: string): '' | undefined {
      const removed = this.membersMap[name]
      delete this.membersMap[name]
      return removed
    }

    update (name: TeamText, friendlyFire: number, nameTagVisibility: string, collisionRule: string, formatting: number | undefined, prefix: TeamText, suffix: TeamText): void {
      this.name = this.parseMessage(name)
      this.friendlyFire = friendlyFire
      this.nameTagVisibility = nameTagVisibility
      this.collisionRule = collisionRule
      this.color = colorString(formatting)
      this.prefix = this.parseMessage(prefix)
      this.suffix = this.parseMessage(suffix)
    }

    // Return a chat component with prefix + color + name + suffix
    displayName (member: string): ChatMessage {
      const name = this.prefix.clone()
      name.append(new ChatMessage({ text: member, color: this.color }), this.suffix)
      return name
    }

    get members (): string[] {
      return Object.keys(this.membersMap)
    }
  }
}

export default loader
