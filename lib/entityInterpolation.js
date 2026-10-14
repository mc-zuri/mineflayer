// How the vanilla client shows the entities it does not control: a server move or teleport sets an interpolation target
// (Entity.lerpTo / updateTrackedPositionAndAngles before 1.14, InterpolationHandler.interpolateTo from 1.21.5) and every
// client tick the entity moves 1/n of the way to it, n counting down. entity.position stays the server's packet
// position; entity.interpolatedPosition is where the client shows the entity.
//
// Per version:
// - the packet position: before 1.9 a fixed point 1/32 int; 1.9 - 1.18 a 1/4096 long the relative moves add to,
//   floored from a teleport's double; from 1.19 a codec whose base is the last double and whose relative moves add to
//   round(base * 4096) (VecDeltaCodec)
// - how far the entity interpolates: a LivingEntity over the packet's 3 steps, a minecart over 3 + 2, a boat over 10
//   (1.9 - 1.21.1; 1.8 an empty boat 3 + 5), from 1.21.2 a boat over the packet's 3, from 1.21.5 every
//   InterpolationHandler over 3 (living entities, boats, minecarts, experience orbs, fishing hooks); any other entity
//   jumps to the target (Entity.lerpTo)
// - a teleport within 1/32 block (1/64 up) keeps the shown position before 1.16.2 (over 3 steps before 1.9, 0 after)
// - a step: x + (target - x) / n before 1.20.2, Mth.lerp(1 / n, x, target) from 1.20.2
// - a rotation-only move restarts the interpolation toward the shown position (1.14 - 1.20.1), toward the target
//   (1.20.2 - 1.21.4); before 1.14 every move targets the packet position

const NOT_LIVING_TYPES = new Set(['object', 'orb', 'global', 'other', 'projectile'])
const NOT_LIVING = /(^|_)(thrown_[a-z_]+|minecart_[a-z_]+|xporb|primed_tnt|falling_sand|fireworks_rocket_entity|fishing_hook|item|xp_orb|experience_orb|area_effect_cloud|arrow|snowball|egg|fireball|ender_pearl|eye_of_ender|eye_of_ender_signal|potion|xp_bottle|experience_bottle|wither_skull|fireworks_rocket|firework_rocket|shulker_bullet|llama_spit|trident|fishing_bobber|boat|raft|minecart|tnt|falling_block|painting|item_frame|leash_knot|ender_crystal|end_crystal|evocation_fangs|evoker_fangs|lightning_bolt|marker|display|interaction|ominous_item_spawner|wind_charge|armor_stand|unknown)$/
const snakeCase = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/\s+/g, '_').toLowerCase()

function createEntityInterpolation (registry) {
  const atLeast = (version) => registry.version['>='](version)
  const fixedPoint32 = !atLeast('1.9')
  const deltaCodec = atLeast('1.19')
  const handler = atLeast('1.21.5')
  const lerpForm = atLeast('1.20.2')
  const teleportSnap = !atLeast('1.16.2')

  // what interpolates and over how many steps, for a lerpTo of `steps`; 0 jumps to the target
  function kindOf (entity) {
    const name = snakeCase(entity.name)
    if (/(^|_)minecart$|^minecart_/.test(name)) return 'minecart'
    if (/(^|_)(boat|raft)$/.test(name)) return 'boat'
    if (/(^|_)(experience_orb|xp_orb|fishing_bobber|fishing_hook)$/.test(name)) return handler ? 'living' : 'other'
    if (name === 'player' || (!NOT_LIVING_TYPES.has(entity.type) && !NOT_LIVING.test(name))) return 'living'
    return 'other'
  }

  function stepsFor (entity, steps) {
    const kind = kindOf(entity)
    if (handler) return kind === 'other' ? 0 : 3
    if (kind === 'living') return steps
    if (kind === 'minecart') return steps + 2
    if (kind === 'boat') {
      if (!atLeast('1.9')) return entity.passengers?.length ? 0 : steps + 5
      return atLeast('1.21.2') ? steps : 10
    }
    return 0
  }

  // the interpolation state, created from the position the entity spawned at
  function stateOf (entity) {
    if (!entity.interpolation) {
      const p = entity.position
      entity.interpolation = {
        base: fixedPoint32
          ? { x: Math.round(p.x * 32), y: Math.round(p.y * 32), z: Math.round(p.z * 32) }
          : deltaCodec ? { x: p.x, y: p.y, z: p.z } : { x: Math.floor(p.x * 4096), y: Math.floor(p.y * 4096), z: Math.floor(p.z * 4096) },
        target: p.clone(),
        steps: 0
      }
      entity.interpolatedPosition = p.clone()
    }
    return entity.interpolation
  }

  function packetPosition (base) {
    if (fixedPoint32) return { x: base.x / 32, y: base.y / 32, z: base.z / 32 }
    if (deltaCodec) return { x: base.x, y: base.y, z: base.z }
    return { x: base.x / 4096, y: base.y / 4096, z: base.z / 4096 }
  }

  // lerpTo / interpolateTo (an InterpolationHandler keeps a running interpolation to the same place and rotation)
  function lerpTo (entity, target, steps, rotation) {
    const state = stateOf(entity)
    const n = stepsFor(entity, steps)
    const sameRotation = !rotation || (rotation.yaw === state.yaw && rotation.pitch === state.pitch)
    if (rotation) {
      state.yaw = rotation.yaw
      state.pitch = rotation.pitch
    }
    if (n <= 0) {
      place(entity, target)
      return
    }
    if (handler && state.steps > 0 && sameRotation && state.target.x === target.x && state.target.y === target.y && state.target.z === target.z) return
    state.target.set(target.x, target.y, target.z)
    state.steps = n
  }

  function place (entity, { x, y, z }) {
    const state = stateOf(entity)
    entity.interpolatedPosition.set(x, y, z)
    state.target.set(x, y, z)
    state.steps = 0
  }

  // where the interpolation goes (the shown position when it does not run): Entity.lerpTargetX
  function targetOf (entity) {
    const state = stateOf(entity)
    return state.steps > 0 ? state.target.clone() : entity.interpolatedPosition.clone()
  }

  return {
    // the entity spawned (or was placed) at entity.position
    spawn (entity) {
      delete entity.interpolation
      stateOf(entity)
    },

    // a relative move, in the packet's units (1/32 before 1.9, 1/4096 after), with the packet's rotation in degrees
    // when it has one (null for a rotation-only packet's position); returns the new packet position
    move (entity, dx, dy, dz, rotation) {
      const state = stateOf(entity)
      if (dx == null) {
        // rotation only (1.14+): toward the shown position until 1.20.2, then toward the target
        lerpTo(entity, lerpForm ? targetOf(entity) : entity.interpolatedPosition.clone(), 3, rotation)
        return packetPosition(state.base)
      }
      const b = state.base
      if (deltaCodec) {
        if (dx !== 0) b.x = (Math.round(b.x * 4096) + dx) / 4096
        if (dy !== 0) b.y = (Math.round(b.y * 4096) + dy) / 4096
        if (dz !== 0) b.z = (Math.round(b.z * 4096) + dz) / 4096
      } else {
        b.x += dx
        b.y += dy
        b.z += dz
      }
      const target = packetPosition(b)
      lerpTo(entity, target, 3, rotation)
      return target
    },

    // the position a relative teleport (1.21.2+) adds to: the interpolation's target until 1.21.5, then the shown one
    relativeBase (entity) {
      stateOf(entity)
      return handler ? entity.interpolatedPosition.clone() : targetOf(entity)
    },

    // an absolute teleport (blocks, rotation in degrees). Before 1.21.2 it also sets the packet position; from 1.21.2
    // (relative teleports) it leaves it, and a jump of more than 64 blocks places the entity at once.
    teleport (entity, x, y, z, rotation) {
      const state = stateOf(entity)
      const shown = entity.interpolatedPosition
      if (atLeast('1.21.2')) {
        const from = this.relativeBase(entity)
        if ((from.x - x) ** 2 + (from.y - y) ** 2 + (from.z - z) ** 2 > 4096) place(entity, { x, y, z })
        else lerpTo(entity, { x, y, z }, 3, rotation)
        return packetPosition(state.base)
      }
      if (fixedPoint32) state.base = { x: Math.round(x * 32), y: Math.round(y * 32), z: Math.round(z * 32) }
      else if (deltaCodec) state.base = { x, y, z }
      else state.base = { x: Math.floor(x * 4096), y: Math.floor(y * 4096), z: Math.floor(z * 4096) }
      if (teleportSnap && Math.abs(shown.x - x) < 0.03125 && Math.abs(shown.y - y) < 0.015625 && Math.abs(shown.z - z) < 0.03125) {
        lerpTo(entity, shown.clone(), fixedPoint32 ? 3 : 0, rotation)
      } else {
        lerpTo(entity, { x, y, z }, 3, rotation)
      }
      return packetPosition(state.base)
    },

    // 1.21.2+'s position sync: the packet position becomes the double sent, and the entity interpolates to it (or is
    // placed there when more than 64 blocks away)
    sync (entity, x, y, z, rotation) {
      const state = stateOf(entity)
      state.base = { x, y, z }
      const shown = entity.interpolatedPosition
      if ((shown.x - x) ** 2 + (shown.y - y) ** 2 + (shown.z - z) ** 2 > 4096) place(entity, { x, y, z })
      else lerpTo(entity, { x, y, z }, 3, rotation)
      return { x, y, z }
    },

    // one client tick of the entity: a step toward the target
    tick (entity) {
      const state = entity.interpolation
      if (!state || state.steps <= 0) return
      const p = entity.interpolatedPosition
      const t = state.target
      const n = state.steps
      if (lerpForm) {
        const d = 1.0 / n
        p.set(p.x + d * (t.x - p.x), p.y + d * (t.y - p.y), p.z + d * (t.z - p.z))
      } else {
        p.set(p.x + (t.x - p.x) / n, p.y + (t.y - p.y) / n, p.z + (t.z - p.z) / n)
      }
      state.steps--
    },

    kindOf,
    targetOf
  }
}

module.exports = { createEntityInterpolation }
