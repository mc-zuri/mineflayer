import prismarineChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import type { ScoreBoard as ScoreBoardApi, ScoreBoardItem, ScoreBoardText } from './types/api/index.ts'
import type { BotInternal } from './types/internal.ts'

// the vanilla sidebar's order: higher value first, equal values by name ignoring case
const sortItems = (a: ScoreBoardItem, b: ScoreBoardItem): number => {
  if (a.value > b.value) return -1
  if (a.value < b.value) return 1
  const aName = a.name.toLowerCase()
  const bName = b.name.toLowerCase()
  if (aName < bName) return -1
  if (aName > bName) return 1
  return 0
}

/**
 * the scoreboards shown in each display slot, by the slot's number (0 list, 1 sidebar, 2 below the name, from 3 a
 * team color's sidebar), list / sidebar / belowName naming the first three
 */
export interface ScoreBoardPositions<Board> {
  [slot: number]: Board | undefined
  readonly list: Board | undefined
  readonly sidebar: Board | undefined
  readonly belowName: Board | undefined
}

// The named slots are getters of the prototype: they alias the numeric slots and are not enumerable, so
// Object.keys/values(bot.scoreboard) only ever yield displayed objectives.
class Positions<Board> implements ScoreBoardPositions<Board> {
  [slot: number]: Board | undefined

  get list (): Board | undefined { return this[0] }
  get sidebar (): Board | undefined { return this[1] }
  get belowName (): Board | undefined { return this[2] }
}

export default (bot: Pick<BotInternal, 'registry' | 'teamMap'>) => {
  const ChatMessage = prismarineChat(bot.registry)

  class ScoreBoard implements ScoreBoardApi {
    declare name: string
    declare title: ChatMessage
    declare itemsMap: { [name: string]: ScoreBoardItem }

    declare static positions: ScoreBoardPositions<ScoreBoard>

    constructor (packet: { name: string, displayText: ScoreBoardText }) {
      this.name = packet.name
      this.setTitle(packet.displayText)
      this.itemsMap = {}
    }

    // The objective's title is a plain string on 1.8, a JSON component from 1.13 and an NBT
    // component from 1.20.3; only the middle one used to survive, and only its top-level text.
    setTitle (title: ScoreBoardText): void {
      this.title = ChatMessage.fromNotch(title)
    }

    add (name: string, value: number, display?: ScoreBoardText | null): ScoreBoardItem {
      // 1.20.3+ may send the component to draw in place of the entry's own name.
      const displayed = display == null ? null : ChatMessage.fromNotch(display)
      this.itemsMap[name] = {
        name,
        value,
        get displayName () {
          if (displayed !== null) {
            return displayed
          }
          const team = bot.teamMap[name]
          if (team !== undefined) {
            return team.displayName(name)
          }
          return new ChatMessage(name)
        }
      }
      return this.itemsMap[name]
    }

    remove (name: string): ScoreBoardItem | undefined {
      const removed = this.itemsMap[name]
      delete this.itemsMap[name]
      return removed
    }

    get items (): ScoreBoardItem[] {
      return Object.values(this.itemsMap).sort(sortItems)
    }
  }

  ScoreBoard.positions = new Positions<ScoreBoard>()
  return ScoreBoard
}
