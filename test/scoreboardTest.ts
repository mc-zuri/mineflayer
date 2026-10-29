import assert from 'assert'
import prismarineRegistry from 'prismarine-registry'
import scoreBoardLoader from '../lib/scoreboard.ts'
import { latestSupportedVersion } from '../lib/version.ts'

describe('ScoreBoard', () => {
  const bot = { registry: prismarineRegistry(latestSupportedVersion), teamMap: {} }
  const ScoreBoard = scoreBoardLoader(bot)

  it('sorts its items like the vanilla sidebar: highest value first, equal values by name ignoring case', () => {
    const entries = [['carol', 3], ['alice', 5], ['Bob', 3], ['dave', 3], ['erin', 7]] as const
    for (const order of [entries, [...entries].reverse()]) {
      const board = new ScoreBoard({ name: 'kills', displayText: JSON.stringify({ text: 'Kills' }) })
      for (const [name, value] of order) board.add(name, value)
      assert.deepStrictEqual(board.items.map(item => item.name), ['erin', 'alice', 'Bob', 'carol', 'dave'])
    }
  })
})
