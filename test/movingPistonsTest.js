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

  // TileEntityPiston.update before 1.11 pushes once more the tick the block ends: each tick hands the engine its
  // progress, 0, 0.5 and 1, and then it is gone
  it('ticks a moving block at its end too, then drops it', function () {
    assert.deepStrictEqual(progresses(extended(), 4), [0, 0.5, 1])
  })

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
  // its end sets the block it moved, as the client's finalTick does (PistonMovingBlockEntity.tick): the head the player
  // the server put inside the plate stands on (n_piston_push_jumping on 1.19.3, before the server's head comes)
  it('sets the block it moved where it ends', function () {
    const placed = []
    const pistons = extended()
    for (let i = 0; i < 4; i++) pistons.tick(() => {}, (pos, stateId) => placed.push([pos, stateId]))
    const Block = require('prismarine-block')(registry)
    assert.deepStrictEqual(placed.map(([pos, stateId]) => [pos, Block.fromStateId(stateId, 0).name, Block.fromStateId(stateId, 0).getProperties().facing]), [[[0, 101, 2707], 'piston_head', 'east']])
  })
})
