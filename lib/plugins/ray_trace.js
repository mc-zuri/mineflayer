const { Vec3 } = require('vec3')
const { viewVector } = require('../mth')
const { toNotchianYaw, toNotchianPitch } = require('../conversions')
const { PLAYER_EYEHEIGHT } = require('./entities')

// Direction's ordinals (DOWN, UP, NORTH, SOUTH, WEST, EAST), as prismarine-world's BlockFace numbers them
const DIRECTIONS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]
const DOWN = 0
const UP = 1
const NORTH = 2
const SOUTH = 3
const WEST = 4
const EAST = 5

// The entities the crosshair can pick (EntitySelector.CAN_BE_PICKED, Entity.isPickable): the living ones, and of the
// others boats, minecarts, end crystals, armor stands, hanging entities, interactions, falling blocks, primed TNT,
// shulker bullets and the projectiles a hit can send back (fireballs, wind charges), and 26.3's cushions. Items,
// experience orbs, arrows and most projectiles, markers and displays are not.
const LIVING_TYPES = new Set(['mob', 'hostile', 'passive', 'animal', 'living', 'ambient', 'water_creature', 'player'])
const PICKABLE_OTHERS = /boat|raft|minecart|crystal|armor_?stand|item_?frame|painting|leash_?knot|^interaction$|falling|^tnt$|primedtnt|shulker_bullet|^(large_)?fireball$|wind_charge|^cushion$/i
const NOT_PICKABLE = /^(ender_?dragon|marker)$/i

module.exports = (bot) => {
  const version = bot.registry.version

  // ---- vanilla's clip (AABB.clip, VoxelShape.clip, BlockGetter.traverseBlocks), in its own double arithmetic ----

  // AABB.clipPoint: the scale along (dx, dy, dz) at which the ray crosses one face of the box, if it is the nearest yet
  function clipPoint (state, da, db, dc, point, minB, maxB, minC, maxC, newDirection, fromA, fromB, fromC) {
    const s = (point - fromA) / da
    const pb = fromB + s * db
    const pc = fromC + s * dc
    if (s > 0 && s < state.scale && minB - 1.0E-7 < pb && pb < maxB + 1.0E-7 && minC - 1.0E-7 < pc && pc < maxC + 1.0E-7) {
      state.scale = s
      state.direction = newDirection
    }
  }

  // AABB.getDirection of one box (minX, minY, minZ, maxX, maxY, maxZ)
  function clipBox (state, box, from, dx, dy, dz) {
    const [minX, minY, minZ, maxX, maxY, maxZ] = box
    if (dx > 1.0E-7) clipPoint(state, dx, dy, dz, minX, minY, maxY, minZ, maxZ, WEST, from.x, from.y, from.z)
    else if (dx < -1.0E-7) clipPoint(state, dx, dy, dz, maxX, minY, maxY, minZ, maxZ, EAST, from.x, from.y, from.z)
    if (dy > 1.0E-7) clipPoint(state, dy, dz, dx, minY, minZ, maxZ, minX, maxX, DOWN, from.y, from.z, from.x)
    else if (dy < -1.0E-7) clipPoint(state, dy, dz, dx, maxY, minZ, maxZ, minX, maxX, UP, from.y, from.z, from.x)
    if (dz > 1.0E-7) clipPoint(state, dz, dx, dy, minZ, minX, maxX, minY, maxY, NORTH, from.z, from.x, from.y)
    else if (dz < -1.0E-7) clipPoint(state, dz, dx, dy, maxZ, minX, maxX, minY, maxY, SOUTH, from.z, from.x, from.y)
  }

  // AABB.clip of boxes (absolute coordinates) between from and to: { pos, face } of the nearest crossing, or null
  function clipBoxes (boxes, from, to) {
    const dx = to.x - from.x
    const dy = to.y - from.y
    const dz = to.z - from.z
    const state = { scale: 1.0, direction: null }
    for (const box of boxes) clipBox(state, box, from, dx, dy, dz)
    if (state.direction === null) return null
    const s = state.scale
    return { pos: new Vec3(from.x + s * dx, from.y + s * dy, from.z + s * dz), face: state.direction }
  }

  // Direction.getApproximateNearest (of the float components)
  function nearestDirection (x, y, z) {
    x = Math.fround(x)
    y = Math.fround(y)
    z = Math.fround(z)
    let best = 0
    let bestDot = Number.MIN_VALUE
    DIRECTIONS.forEach(([nx, ny, nz], i) => {
      const dot = Math.fround(Math.fround(Math.fround(x * nx) + Math.fround(y * ny)) + Math.fround(z * nz))
      if (dot > bestDot) {
        bestDot = dot
        best = i
      }
    })
    return best
  }

  // The outline shape the crosshair is clipped against (ClipContext.Block.OUTLINE, BlockBehaviour.getShape) where it is
  // not the collision shape prismarine-block knows: blocks one walks through (grass, bushes, signs, buttons, levers,
  // an open gate) and fences, whose outline stops at the block's top
  const px = boxes => boxes.map(b => b.map(v => v / 16))
  const HORIZONTAL = { north: 0, east: 1, south: 2, west: 3 }
  // a box given for a north-facing wall attachment, turned to face another way about the block's centre
  const turn = ([x0, y0, z0, x1, y1, z1], facing) => {
    switch (facing) {
      case 'south': return [16 - x1, y0, 16 - z1, 16 - x0, y1, 16 - z0]
      case 'east': return [16 - z1, y0, x0, 16 - z0, y1, x1]
      case 'west': return [z0, y0, 16 - x1, z1, y1, 16 - x0]
      default: return [x0, y0, z0, x1, y1, z1]
    }
  }
  function attached (props, wall, floor) {
    if (HORIZONTAL[props.facing] === undefined) return null
    if (props.face === 'wall') return px([turn(wall, props.facing)])
    const zAxis = props.facing === 'north' || props.facing === 'south'
    let box = zAxis ? floor : [floor[2], floor[1], floor[0], floor[5], floor[4], floor[3]]
    if (props.face === 'ceiling') box = [box[0], 16 - box[4], box[2], box[3], 16 - box[1], box[5]]
    return px([box])
  }
  function outlineShapes (block) {
    const name = block.name
    if (/^(short_grass|grass|fern)$/.test(name)) return px([[2, 0, 2, 14, 13, 14]])
    if (/fence$/.test(name) || (/fence_gate$/.test(name) && block.shapes.length)) {
      return block.shapes.map(s => [s[0], s[1], s[2], s[3], Math.min(s[4], 1), s[5]])
    }
    const props = typeof block.getProperties === 'function' ? block.getProperties() : {}
    if (name === 'sweet_berry_bush') {
      const age = Number(props.age ?? 0)
      return age === 0 ? px([[3, 0, 3, 13, 8, 13]]) : age === 3 ? [[0, 0, 0, 1, 1, 1]] : px([[1, 0, 1, 15, 16, 15]])
    }
    if (/_sign$/.test(name) && !/wall|hanging/.test(name)) return px([[4, 0, 4, 12, 16, 12]])
    if (/fence_gate$/.test(name)) {
      const zAxis = props.facing === 'north' || props.facing === 'south'
      const top = props.in_wall === true || props.in_wall === 'true' ? 13 : 16
      return px([zAxis ? [0, 0, 6, 16, top, 10] : [6, 0, 0, 10, top, 16]])
    }
    if (/_button$/.test(name)) {
      const depth = props.powered === true || props.powered === 'true' ? 1 : 2
      return attached(props, [5, 6, 16 - depth, 11, 10, 16], [5, 0, 6, 11, depth, 10])
    }
    if (name === 'lever') return attached(props, [5, 4, 10, 11, 12, 16], [5, 0, 4, 11, 6, 12])
    if (/torch$/.test(name)) {
      // BaseTorchBlock.SHAPE on the floor; WallTorchBlock.SHAPES against a wall (1.12's torch faces away from it)
      if (/wall_torch$/.test(name) || HORIZONTAL[props.facing] !== undefined) return px([turn([5.5, 3, 11, 10.5, 13, 16], props.facing)])
      return px([[6, 0, 6, 10, 10, 10]])
    }
    if (name === 'redstone_wire') {
      // RedStoneWireBlock.makeShapes: a dot, and toward each connected side a strip on the floor (and up the wall)
      const boxes = [[3, 0, 3, 13, 1, 13]]
      for (const side of ['north', 'east', 'south', 'west']) {
        const connection = props[side] ?? 'none'
        if (connection === 'none' || connection === false) continue
        boxes.push(turn([3, 0, 0, 13, 1, 8], side))
        if (connection === 'up') boxes.push(turn([3, 0, 0, 13, 16, 1], side))
      }
      return px(boxes)
    }
    if (name === 'lectern' && HORIZONTAL[props.facing] !== undefined) {
      // LecternBlock.SHAPES: the base, the post and the sloped top in three steps
      return px([[0, 0, 0, 16, 2, 16], [4, 2, 4, 12, 14, 12], [0, 10, 1, 16, 14, 16 / 3], [0, 12, 16 / 3, 16, 16, 29 / 3],
        [0, 14, 29 / 3, 16, 18, 14]].map(box => turn(box, props.facing)))
    }
    return null
  }

  // The fluid in a block (its FluidState): a water or lava block, a waterlogged block; null when none
  function fluidOf (block) {
    const props = typeof block.getProperties === 'function' ? block.getProperties() : {}
    if (/^(water|lava|flowing_water|flowing_lava)$/.test(block.name)) {
      const level = Number(props.level ?? 0)
      // (the amount: 8 for a source and a falling fluid, 8 - level while it flows)
      return { type: /water/.test(block.name) ? 'water' : 'lava', source: level === 0, amount: level === 0 || level >= 8 ? 8 : 8 - level }
    }
    if (props.waterlogged === true || props.waterlogged === 'true' || /^(bubble_column|kelp|kelp_plant|seagrass|tall_seagrass)$/.test(block.name)) {
      return { type: 'water', source: true, amount: 8 }
    }
    return null
  }

  // FlowingFluid.getShape: the fluid's height, the whole block under the same fluid
  function fluidShape (block, fluid) {
    const above = bot.blockAt(block.position.offset(0, 1, 0))
    const sameAbove = above && fluidOf(above)?.type === fluid.type
    return [[0, 0, 0, 1, sameAbove ? 1 : Math.fround(fluid.amount / 9), 1]]
  }

  // VoxelShape.clip of a block's shapes: from inside the shape the hit is where the ray starts
  function clipBlock (block, from, to, shapesOverride = null) {
    const shapes = shapesOverride ?? outlineShapes(block) ?? block.shapes
    if (!shapes || shapes.length === 0) return null
    const diff = to.minus(from)
    if (diff.x * diff.x + diff.y * diff.y + diff.z * diff.z < 1.0E-7) return null
    const { x, y, z } = block.position
    const test = new Vec3(from.x + diff.x * 0.001, from.y + diff.y * 0.001, from.z + diff.z * 0.001)
    const tx = test.x - x
    const ty = test.y - y
    const tz = test.z - z
    if (shapes.some(s => s[0] <= tx && tx < s[3] && s[1] <= ty && ty < s[4] && s[2] <= tz && tz < s[5])) {
      return { pos: test, face: nearestDirection(diff.x, diff.y, diff.z) ^ 1 }
    }
    const moved = boxes => boxes.map(s => [s[0] + x, s[1] + y, s[2] + z, s[3] + x, s[4] + y, s[5] + z])
    const hit = clipBoxes(moved(shapes), from, to)
    if (shapesOverride) return hit
    // Level.clipWithInteractionOverride: a block whose interaction shape the ray meets first takes that face
    const interaction = interactionShape(block)
    if (hit && interaction) {
      const over = clipBoxes(moved(interaction), from, to)
      if (over && over.pos.distanceSquared(from) < hit.pos.distanceSquared(from)) hit.face = over.face
    }
    return hit
  }

  // BlockBehaviour.getInteractionShape where it is not the outline: a cauldron's inside, a composter's and
  // scaffolding's whole block
  function interactionShape (block) {
    if (/cauldron$/.test(block.name)) return [[2 / 16, 4 / 16, 2 / 16, 14 / 16, 1, 14 / 16]]
    if (block.name === 'composter' || block.name === 'scaffolding') return [[0, 0, 0, 1, 1, 1]]
    return null
  }

  const lerp = (delta, start, end) => start + delta * (end - start)
  const frac = value => value - Math.floor(value)

  // BlockGetter.clip (ClipContext.Fluid.NONE) between from and to: the first block along the ray whose shape the ray
  // meets, with the face it enters by and where (block.face, block.intersect); null when it meets none. (The block's
  // shape is its collision shape: prismarine-block has no outline shapes.)
  // fluid (ClipContext.Fluid): 'none', 'source_only' or 'any' (a fluid the ray takes is met as its fluid shape; the
  // nearer of the block and the fluid is the hit, block.fluid true when it is the fluid)
  function clipBlocks (from, to, matcher, fluid = 'none') {
    if (from.equals(to)) return null
    const visit = (bx, by, bz) => {
      const block = bot.blockAt(new Vec3(bx, by, bz))
      if (!block || (matcher && !matcher(block))) return null
      let hit = clipBlock(block, from, to)
      const inBlock = fluid !== 'none' ? fluidOf(block) : null
      if (inBlock && (fluid === 'any' || inBlock.source)) {
        const fluidHit = clipBlock(block, from, to, fluidShape(block, inBlock))
        if (fluidHit && (!hit || fluidHit.pos.distanceSquared(from) < hit.pos.distanceSquared(from))) hit = { ...fluidHit, fluid: true }
      }
      block.fluid = !!hit?.fluid
      if (!hit) return null
      block.face = hit.face
      block.intersect = hit.pos
      return block
    }
    // BlockGetter.traverseBlocks
    const toX = lerp(-1.0E-7, to.x, from.x)
    const toY = lerp(-1.0E-7, to.y, from.y)
    const toZ = lerp(-1.0E-7, to.z, from.z)
    const fromX = lerp(-1.0E-7, from.x, to.x)
    const fromY = lerp(-1.0E-7, from.y, to.y)
    const fromZ = lerp(-1.0E-7, from.z, to.z)
    let bx = Math.floor(fromX)
    let by = Math.floor(fromY)
    let bz = Math.floor(fromZ)
    const first = visit(bx, by, bz)
    if (first) return first
    const dx = toX - fromX
    const dy = toY - fromY
    const dz = toZ - fromZ
    const signX = Math.sign(dx)
    const signY = Math.sign(dy)
    const signZ = Math.sign(dz)
    const tDeltaX = signX === 0 ? Number.MAX_VALUE : signX / dx
    const tDeltaY = signY === 0 ? Number.MAX_VALUE : signY / dy
    const tDeltaZ = signZ === 0 ? Number.MAX_VALUE : signZ / dz
    let tX = tDeltaX * (signX > 0 ? 1.0 - frac(fromX) : frac(fromX))
    let tY = tDeltaY * (signY > 0 ? 1.0 - frac(fromY) : frac(fromY))
    let tZ = tDeltaZ * (signZ > 0 ? 1.0 - frac(fromZ) : frac(fromZ))
    while (tX <= 1.0 || tY <= 1.0 || tZ <= 1.0) {
      if (tX < tY) {
        if (tX < tZ) {
          bx += signX
          tX += tDeltaX
        } else {
          bz += signZ
          tZ += tDeltaZ
        }
      } else if (tY < tZ) {
        by += signY
        tY += tDeltaY
      } else {
        bz += signZ
        tZ += tDeltaZ
      }
      const block = visit(bx, by, bz)
      if (block) return block
    }
    return null
  }

  // ---- the view ----

  // the eyes (Entity.getEyePosition): the float eye height of the entity's pose
  function eyePosition (entity) {
    const eyeHeight = Math.fround(entity.eyeHeight ?? PLAYER_EYEHEIGHT)
    return new Vec3(entity.position.x, entity.position.y + eyeHeight, entity.position.z)
  }

  // the unit vector the entity looks along (Entity.getViewVector), from its float rotation in degrees
  function lookVector (entity) {
    const yaw = entity.yawDegrees?.valueOf() ?? Math.fround(toNotchianYaw(entity.yaw))
    const pitch = entity.pitchDegrees?.valueOf() ?? Math.fround(toNotchianPitch(entity.pitch))
    const v = viewVector(version, pitch, yaw)
    return new Vec3(v.x, v.y, v.z)
  }

  // Entity.pick: the block the entity looks at within range (null for a miss), and where the ray ends
  function pickBlock (entity, range, matcher, fluid = 'none') {
    const from = eyePosition(entity)
    const view = lookVector(entity)
    const to = new Vec3(from.x + view.x * range, from.y + view.y * range, from.z + view.z * range)
    return { from, view, to, block: clipBlocks(from, to, matcher, fluid) }
  }

  // Item.getPlayerPOVHitResult: the block (or fluid: 'none', 'source_only', 'any') an item's use casts its ray to,
  // within the player's block interaction range (5 before 1.20.5); { block, face, intersect, fluid } or null for a miss
  bot._povHitResult = (fluid = 'none') => {
    if (!bot.entity?.position) return null
    const range = version['>=']('1.20.5') ? (bot.game.gameMode === 'creative' ? 5 : 4.5) : 5
    const { block } = pickBlock(bot.entity, range, null, fluid)
    return block ? { block, face: block.face, intersect: block.intersect, fluid: block.fluid } : null
  }

  const isPickable = entity => {
    if (entity === bot.entity || entity.username === bot.username || !entity.position || !entity.width) return false
    if (entity.isValid === false || NOT_PICKABLE.test(entity.name ?? '')) return false
    return LIVING_TYPES.has(entity.type) || PICKABLE_OTHERS.test(entity.name ?? '')
  }
  const rootVehicle = entity => {
    let root = entity
    while (root?.vehicle) root = root.vehicle
    return root
  }

  // An entity's box (Entity.getBoundingBox, EntityDimensions.makeBoundingBox: its float width and height)
  function boxOf (entity) {
    const w = Math.fround(Math.fround(entity.width) / 2)
    const h = Math.fround(entity.height)
    const { x, y, z } = entity.position
    return [x - w, y, z - w, x + w, y + h, z + w]
  }

  // The box the crosshair picks an entity by: before 1.9 grown by its collision border (Entity.getCollisionBorderSize,
  // 0.1, EntityRenderer.getMouseOver)
  function pickBoxOf (entity) {
    const box = boxOf(entity)
    if (!version['<']('1.9')) return box
    const g = 0.10000000149011612
    return [box[0] - g, box[1] - g, box[2] - g, box[3] + g, box[4] + g, box[5] + g]
  }

  // ProjectileUtil.getEntityHitResult: the nearest pickable entity whose box the ray from - to crosses
  function clipEntities (from, to, maxDistanceSq) {
    let nearest = maxDistanceSq
    let hovered = null
    let hoveredPos = null
    const ownRoot = rootVehicle(bot.entity)
    for (const entity of Object.values(bot.entities)) {
      if (!isPickable(entity)) continue
      const box = pickBoxOf(entity)
      const inside = box[0] <= from.x && from.x < box[3] && box[1] <= from.y && from.y < box[4] && box[2] <= from.z && from.z < box[5]
      // (no entity is picked from inside: Entity.canBePickedFromInside)
      if (inside) continue
      const hit = clipBoxes([box], from, to)
      if (!hit) continue
      const dd = from.distanceSquared(hit.pos)
      if (dd < nearest || nearest === 0) {
        // the player's own vehicle and its other riders are not picked
        if (rootVehicle(entity) === ownRoot) {
          if (nearest === 0) {
            hovered = entity
            hoveredPos = hit.pos
          }
        } else {
          hovered = entity
          hoveredPos = hit.pos
          nearest = dd
        }
      }
    }
    return hovered ? { entity: hovered, intersect: hoveredPos } : null
  }

  // What is under the crosshair (LocalPlayer.raycastHitResult / pick): an entity in front of the first block within
  // reach, else that block, else nothing. { type: 'entity', entity, intersect } | { type: 'block', block, face,
  // intersect } | { type: 'miss', intersect }. A hit beyond its reach is a miss.
  bot.raycastHitResult = (blockRange = 4.5, entityRange = 3) => {
    let maxDistance = Math.max(blockRange, entityRange)
    const { from, view, to: blockTo, block } = pickBlock(bot.entity, maxDistance)
    const blockLocation = block ? block.intersect : blockTo
    const blockDistanceSq = blockLocation.distanceSquared(from)
    let maxDistanceSq = maxDistance * maxDistance
    if (block) {
      maxDistanceSq = blockDistanceSq
      maxDistance = Math.sqrt(blockDistanceSq)
    }
    const to = new Vec3(from.x + view.x * maxDistance, from.y + view.y * maxDistance, from.z + view.z * maxDistance)
    const entityHit = clipEntities(from, to, maxDistanceSq)
    // LocalPlayer.filterHitResult: a hit not closer than its range is a miss where it was
    const within = (location, range) => location.distanceSquared(from) < range * range
    if (entityHit && entityHit.intersect.distanceSquared(from) < blockDistanceSq) {
      if (within(entityHit.intersect, entityRange)) return { type: 'entity', entity: entityHit.entity, intersect: entityHit.intersect }
      return { type: 'miss', intersect: entityHit.intersect }
    }
    if (block && within(block.intersect, blockRange)) return { type: 'block', block, face: block.face, intersect: block.intersect }
    return { type: 'miss', intersect: blockLocation }
  }

  // Where the crosshair meets an entity's box (the EntityHitResult location a right click on it sends); when the
  // crosshair is not on it, where the line from the eyes to its centre enters it
  bot._entityHitPoint = (entity) => {
    const from = eyePosition(bot.entity)
    const view = lookVector(bot.entity)
    const box = pickBoxOf(entity)
    const far = 64
    const along = clipBoxes([box], from, new Vec3(from.x + view.x * far, from.y + view.y * far, from.z + view.z * far))
    if (along) return along.pos
    const centre = new Vec3((box[0] + box[3]) / 2, (box[1] + box[4]) / 2, (box[2] + box[5]) / 2)
    const toward = centre.minus(from)
    const length = toward.norm()
    if (length === 0) return centre
    const ray = clipBoxes([box], from, from.plus(toward.scaled((length + far) / length)))
    return ray ? ray.pos : centre
  }

  bot.blockInSight = (maxSteps = 256, vectorLength = 5 / 16) => {
    const block = bot.blockAtCursor(maxSteps * vectorLength)
    if (block) return block
  }

  bot.blockAtCursor = (maxDistance = 256, matcher = null) => {
    return bot.blockAtEntityCursor(bot.entity, maxDistance, matcher)
  }

  bot.entityAtCursor = (maxDistance = 3.5) => {
    const hit = bot.raycastHitResult(maxDistance, maxDistance)
    return hit.type === 'entity' ? hit.entity : null
  }

  bot.blockAtEntityCursor = (entity = bot.entity, maxDistance = 256, matcher = null) => {
    if (!entity.position || !entity.height || entity.pitch === undefined || entity.yaw === undefined) return null
    const { from, block } = pickBlock(entity, maxDistance, matcher)
    if (!block || block.intersect.distanceSquared(from) >= maxDistance * maxDistance) return null
    return block
  }
}
