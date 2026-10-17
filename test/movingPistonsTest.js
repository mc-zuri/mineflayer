/* eslint-env mocha */
// The client's moving pistons (lib/movingPistons.js): what pushes the player after its tick, and when a moving block ends.

const assert = require('assert')
const { createMovingPistons } = require('../lib/movingPistons')

describe('moving pistons', function () {
  const registry = require('prismarine-registry')('1.17.1')
  // n_piston_push: a piston at x -1 (y 101, z 2707) facing east (block event 0, param 5) extends into x 0
  function extended () {
    const pistons = createMovingPistons(registry)
    pistons.trigger('piston', [-1, 101, 2707], 0, 5)
    return pistons
  }
  const progresses = (pistons, ticks) => {
    const seen = []
    for (let i = 0; i < ticks; i++) pistons.tick((piston) => seen.push(piston.progress))
    return seen
  }

  // the head the server sends with its piston's block event (n_piston_push on 1.11.2 - 1.19.4) replaces the moving
  // block, and its block entity goes (LevelChunk.setBlockState): it pushes no more; the moving block itself keeps it
  it('drops a moving block another block replaces', function () {
    const replaced = extended()
    replaced.blockChanged([0, 101, 2707], 'piston_head')
    assert.deepStrictEqual(progresses(replaced, 3), [])
    const kept = extended()
    kept.blockChanged([0, 101, 2707], 'moving_piston')
    kept.blockChanged([1, 101, 2707], 'stone')
    assert.deepStrictEqual(progresses(kept, 2), [0, 0.5])
  })
})
