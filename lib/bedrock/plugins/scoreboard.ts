import type { ChatMessage } from 'prismarine-chat'
import { Positions } from '../../scoreboard.ts'
import { bedrockText } from '../text.ts'
import type { BedrockText } from '../text.ts'
import type { ScoreBoard, ScoreBoardItem } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { MCProtocol } from '../../types/protocol/Bedrock.d.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

// Bedrock announces an objective only when it displays it (set_display_objective), and sends the scores of displayed
// objectives only. A score entry is the objective's scoreboard id of a player or an entity (by its unique id) or of a
// fake player (by its name): the bot names the item as Java does, and finds it again by the scoreboard id.

type ScoreEntry = Exclude<BedrockClientboundPackets['set_score']['entries'], MCProtocol.Bedrock.Read.Types.ScoreEntries>[number]

interface PlayerRecord {
  type: string | number
  uuid?: string | undefined
  entity_unique_id?: bigint | undefined
  username?: string | undefined
}

interface Objective {
  board: ScoreBoard
  displayName: string
  /** the item of each scoreboard id */
  entries: Map<bigint, ScoreBoardItem>
}

const OWNER = 'scoreboard'
// the display slots by their numbers in Java's positions; Bedrock has no team sidebars
const SLOTS: readonly string[] = Object.freeze(['list', 'sidebar', 'belowname'])
const SORT_ASCENDING = 0

function byName (a: ScoreBoardItem, b: ScoreBoardItem): number {
  const [aName, bName] = [a.name.toLowerCase(), b.name.toLowerCase()]
  return Number(aName > bName) - Number(aName < bName)
}

function descending (a: ScoreBoardItem, b: ScoreBoardItem): number {
  return b.value - a.value || byName(a, b)
}

function ascending (a: ScoreBoardItem, b: ScoreBoardItem): number {
  return a.value - b.value || byName(a, b)
}

/** up to 1.26.30 the packet's type is its records', from 1.26.40 each record has its own */
function playerRecords (records: BedrockClientboundPackets['player_list']['records']): PlayerRecord[] {
  return Array.isArray(records) ? records : records.records.map(record => ({ ...record, type: records.type }))
}

export default function inject (bot: BedrockBotInternal): void {
  // made at the first objective: a bot pays for the version's language (about 8 ms) only when it shows one
  let text: BedrockText | undefined
  const scoreboards: { [name: string]: ScoreBoard } = {}
  const positions = new Positions<ScoreBoard>()
  const objectives = new Map<string, Objective>()
  // the objectives whose last display sorts them ascending (Java's are always descending)
  const sortedAscending = new Set<string>()
  const players = new Map<string, { uniqueId: bigint, username: string }>()

  class BedrockScoreBoard implements ScoreBoard {
    readonly name: string
    title: ChatMessage
    readonly itemsMap: { [name: string]: ScoreBoardItem } = {}

    constructor (name: string, title: string) {
      this.name = name
      this.title = textOf().text(title)
    }

    setTitle (title: string): void {
      this.title = textOf().text(title)
    }

    add (name: string, value: number): ScoreBoardItem {
      const item = { name, value, displayName: textOf().text(name) }
      this.itemsMap[name] = item
      return item
    }

    remove (name: string): ScoreBoardItem | undefined {
      const removed = this.itemsMap[name]
      delete this.itemsMap[name]
      return removed
    }

    get items (): ScoreBoardItem[] {
      return Object.values(this.itemsMap).sort(sortedAscending.has(this.name) ? ascending : descending)
    }
  }

  function textOf (): BedrockText {
    text ??= bedrockText(bot.registry)
    return text
  }

  function usernameOf (uniqueId: bigint): string | undefined {
    for (const player of players.values()) if (player.uniqueId === uniqueId) return player.username
    return undefined
  }

  // Java names a player by its username and an entity by its UUID: Bedrock gives their unique ids
  function nameOf ({ entry_type: type, entity_unique_id: uniqueId, custom_name: customName }: ScoreEntry): string {
    if (type === 'fake_player') return customName!
    if (type === 'player') return usernameOf(uniqueId!) ?? String(uniqueId)
    return String(uniqueId)
  }

  function removeItem (objective: Objective, scoreboardId: bigint): void {
    const item = objective.entries.get(scoreboardId)
    if (item === undefined) return
    objective.entries.delete(scoreboardId)
    // another entry of the same name replaced it
    if (objective.board.itemsMap[item.name] !== item) return
    objective.board.remove(item.name)
    bot._core.emit(bot, 'scoreRemoved', objective.board, item)
  }

  function setScore (entry: ScoreEntry): void {
    // a change always names its objective and gives the score
    const objective = objectives.get(entry.objective_name!)
    if (objective === undefined) return
    const name = nameOf(entry)
    // the entry was named otherwise before (the bot did not know the player then)
    if (objective.entries.get(entry.scoreboard_id)?.name !== name) removeItem(objective, entry.scoreboard_id)
    const item = objective.board.add(name, entry.score!)
    objective.entries.set(entry.scoreboard_id, item)
    bot._core.emit(bot, 'scoreUpdated', objective.board, item)
  }

  function removeScore ({ objective_name: objectiveName, scoreboard_id: scoreboardId }: ScoreEntry): void {
    for (const [name, objective] of objectives) {
      // from 1.26.40 a removal without an objective removes the entry from every objective
      if (objectiveName === undefined || objectiveName === name) removeItem(objective, scoreboardId)
    }
  }

  bot._core.handle(OWNER, 'set_display_objective', (packet) => {
    const slot = SLOTS.indexOf(packet.display_slot)
    if (slot === -1) return
    const { objective_name: name, display_name: displayName } = packet
    if (name === '') {
      delete positions[slot]
      return
    }
    if (packet.sort_order === SORT_ASCENDING) sortedAscending.add(name)
    else sortedAscending.delete(name)
    let objective = objectives.get(name)
    if (objective === undefined) {
      objective = { board: new BedrockScoreBoard(name, displayName), displayName, entries: new Map() }
      objectives.set(name, objective)
      scoreboards[name] = objective.board
      bot._core.emit(bot, 'scoreboardCreated', objective.board)
    } else if (objective.displayName !== displayName) {
      objective.displayName = displayName
      objective.board.setTitle(displayName)
      bot._core.emit(bot, 'scoreboardTitleChanged', objective.board)
    }
    bot._core.emit(bot, 'scoreboardPosition', slot, objective.board, positions[slot])
    positions[slot] = objective.board
  })

  bot._core.handle(OWNER, 'remove_objective', ({ objective_name: name }) => {
    const objective = objectives.get(name)
    if (objective === undefined) return
    bot._core.emit(bot, 'scoreboardDeleted', objective.board)
    objectives.delete(name)
    delete scoreboards[name]
    for (const slot of Object.keys(positions).map(Number)) {
      if (positions[slot] === objective.board) delete positions[slot]
    }
  })

  bot._core.handle(OWNER, 'set_score', (packet) => {
    const { entries } = packet
    if (!Array.isArray(entries)) {
      bot._core.emit(bot, 'error', new Error(`set_score cannot be read on ${bot.version}: minecraft-data's layout of its entries is wrong`))
      return
    }
    for (const entry of entries) {
      // up to 1.26.30 the packet's action is its entries', from 1.26.40 each entry's type says it
      if (packet.action === 'remove' || entry.entry_type === 'remove') removeScore(entry)
      else setScore(entry)
    }
  })

  bot._core.observe(OWNER, 'player_list', ({ records }) => {
    for (const { type, uuid, entity_unique_id: uniqueId, username } of playerRecords(records)) {
      if (type === 'remove') players.delete(String(uuid))
      else if (uniqueId !== undefined && username !== undefined) players.set(String(uuid), { uniqueId, username })
    }
  })

  bot.scoreboards = scoreboards
  bot.scoreboard = positions
}
