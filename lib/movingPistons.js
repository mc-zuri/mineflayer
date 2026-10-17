// The client's moving pistons (PistonBaseBlock.triggerEvent, PistonMovingBlockEntity): from the server's block events a
// piston's head moves out of it (event 0) or its base moves back over the head's cell (1, 2), 0.5F further each tick.
// The client ticks them after its entities, and each one pushes the player through the physics engine's
// pushByMovingPiston. Blocks in front of a piston are not moved (PistonStructureResolver).

// Direction.from3DDataValue: down, up, north, south, west, east
const DIRECTIONS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]
const FACINGS = ['down', 'up', 'north', 'south', 'west', 'east']

function createMovingPistons (registry) {
  const Block = require('prismarine-block')(registry)
  const legacy = registry.isOlderThan('1.13')
  const moving = new Map()
  const key = ([x, y, z]) => `${x},${y},${z}`

  // the collision boxes of the piston head (before 1.13 by id and metadata: facing, 8 sticky)
  function headShapes (facing, sticky, short) {
    const block = legacy
      ? new Block(registry.blocksByName.piston_head.id, 0, facing | (sticky ? 8 : 0))
      : Block.fromProperties('piston_head', { facing: FACINGS[facing], short: String(short), type: sticky ? 'sticky' : 'normal' }, 0)
    return block.shapes
  }

  // the block a moving block becomes (PistonMovingBlockEntity.finalTick, its movedState): the head the piston pushed out,
  // or the piston its base moved back into (before 1.13 by id and metadata: facing, 8 sticky)
  function movedStateId (entity) {
    const { facing, sticky, extending } = entity
    if (extending) {
      return legacy
        ? registry.blocksByName.piston_head.id * 16 + (facing | (sticky ? 8 : 0))
        : Block.fromProperties('piston_head', { facing: FACINGS[facing], short: 'false', type: sticky ? 'sticky' : 'normal' }, 0).stateId
    }
    const name = sticky ? 'sticky_piston' : 'piston'
    return legacy
      ? registry.blocksByName[name].id * 16 + facing
      : Block.fromProperties(name, { facing: FACINGS[facing], extended: 'false' }, 0).stateId
  }

  return {
    // a piston's block event, as the client handles it before it ticks
    trigger (name, [x, y, z], event, param) {
      if (name !== 'piston' && name !== 'sticky_piston') return
      const sticky = name === 'sticky_piston'
      const facing = param & 7
      const [dx, dy, dz] = DIRECTIONS[facing] ?? [0, 0, 0]
      const front = [x + dx, y + dy, z + dz]
      if (event === 0) {
        moving.set(key(front), { pos: front, facing, sticky, extending: true, progress: 0 })
      } else if (event === 1 || event === 2) {
        moving.delete(key(front))
        moving.set(key([x, y, z]), { pos: [x, y, z], facing, sticky, extending: false, progress: 0 })
      }
    },
    // a block the server set: one other than the moving block itself where a block moves replaces it, and its block
    // entity goes (LevelChunk.setBlockState: removeBlockEntity)
    blockChanged ([x, y, z], name) {
      if (name !== 'moving_piston' && name !== 'piston_extension') moving.delete(key([x, y, z]))
    },
    // after the player's tick: each moving piston pushes it (push gets the engine's MovingPiston), then moves on; the
    // tick it ends too (before 1.11 TileEntityPiston.update pushes once more there), then it is gone, the block it moved
    // set where it is (place(pos, stateId); the client's own finalTick, its collision the moving block's at its end)
    tick (push, place = () => {}) {
      for (const entity of [...moving.values()]) {
        // a retracting base collides as the head, short past a quarter (getCollisionRelatedBlockState)
        const short = !entity.extending && entity.progress > Math.fround(0.25)
        push({ pos: entity.pos, direction: DIRECTIONS[entity.facing], extending: entity.extending, source: true, progress: entity.progress, shapes: headShapes(entity.facing, entity.sticky, short) })
        if (entity.progress >= 1) {
          moving.delete(key(entity.pos))
          place(entity.pos, movedStateId(entity))
        } else {
          entity.progress = Math.min(Math.fround(entity.progress + Math.fround(0.5)), 1)
        }
      }
    },
    clear () {
      moving.clear()
    }
  }
}

module.exports = { createMovingPistons }
