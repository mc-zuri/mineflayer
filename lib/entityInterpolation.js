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
// - from 1.21.2 a minecart the server runs on the experimental behaviour (the minecart_improvements feature) does not
//   interpolate: a move or teleport places it, and it goes along the track steps the server sends, over 3 ticks by their
//   weights (NewMinecartBehavior.lerpClientPositionAndRotation)
// - from 26.3 a living entity goes along the steps of the server's paths (SteppedInterpolationHandler): each move or
//   sync is a step that takes its tick offset (a packet's VecDelta.Stepped ticks, else the entity type's update
//   interval: 3, a player's 2), from where the entity is, sped up while steps pile up

const conv = require('./conversions')
const { Vec3 } = require('vec3')

const f32 = Math.fround
const NOT_LIVING_TYPES = new Set(['object', 'orb', 'global', 'other', 'projectile'])
const NOT_LIVING = /(^|_)(thrown_[a-z_]+|minecart_[a-z_]+|xporb|primed_tnt|falling_sand|fireworks_rocket_entity|fishing_hook|item|xp_orb|experience_orb|area_effect_cloud|arrow|snowball|egg|fireball|ender_pearl|eye_of_ender|eye_of_ender_signal|potion|xp_bottle|experience_bottle|wither_skull|fireworks_rocket|firework_rocket|shulker_bullet|llama_spit|trident|fishing_bobber|boat|raft|minecart|tnt|falling_block|painting|item_frame|leash_knot|ender_crystal|end_crystal|evocation_fangs|evoker_fangs|lightning_bolt|marker|display|interaction|ominous_item_spawner|wind_charge|armor_stand|unknown)$/
const snakeCase = (name) => String(name ?? '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').replace(/\s+/g, '_').toLowerCase()

function createEntityInterpolation (registry) {
  const atLeast = (version) => registry.version['>='](version)
  const fixedPoint32 = !atLeast('1.9')
  // the packet position as a double (1.16+'s Entity.packetCoordinates, VecDeltaCodec from 1.19): a relative move of 0
  // on an axis keeps it as it is; otherwise it is encoded (floored to 1/4096, VecDeltaCodec.encode's Math.round by
  // 1.19.4: the 1.19 recordings floor, the 1.19.4 ones round), moved and decoded
  const deltaCodec = atLeast('1.16')
  const roundedCodec = atLeast('1.19.4')
  const handler = atLeast('1.21.5')
  const lerpForm = atLeast('1.20.2')
  const teleportSnap = !atLeast('1.16.2')
  const steppedHandler = atLeast('26.3')
  // EntityType.updateInterval of the living entities that are not 3
  const UPDATE_INTERVAL_2 = new Set(['player', 'allay', 'mannequin'])
  // the tick offsets of the steps of the packet being handled, per entity id (queueTicks)
  const pendingTicks = new Map()

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
    // a minecart on the experimental behaviour is placed where a move or teleport puts it (MinecartBehavior.lerpTo
    // before 1.21.5, then no InterpolationHandler); the steps of its track move it (minecartSteps)
    if (kind === 'minecart' && (api.minecartImprovements || entity.interpolation?.minecart)) return 0
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

  // the packet position of a position, as a teleport or spawn sets it
  function baseOf ({ x, y, z }) {
    if (fixedPoint32) return { x: Math.round(x * 32), y: Math.round(y * 32), z: Math.round(z * 32) }
    if (deltaCodec) return { x, y, z }
    return { x: Math.floor(x * 4096), y: Math.floor(y * 4096), z: Math.floor(z * 4096) }
  }

  // a relative move added to the packet position (in the packet's units)
  function addToBase (b, dx, dy, dz) {
    if (deltaCodec) {
      const encode = roundedCodec ? Math.round : Math.floor
      if (dx !== 0) b.x = (encode(b.x * 4096) + dx) / 4096
      if (dy !== 0) b.y = (encode(b.y * 4096) + dy) / 4096
      if (dz !== 0) b.z = (encode(b.z * 4096) + dz) / 4096
    } else {
      b.x += dx
      b.y += dy
      b.z += dz
    }
  }

  function packetPosition (base) {
    if (fixedPoint32) return { x: base.x / 32, y: base.y / 32, z: base.z / 32 }
    if (deltaCodec) return { x: base.x, y: base.y, z: base.z }
    return { x: base.x / 4096, y: base.y / 4096, z: base.z / 4096 }
  }

  // lerpTo / interpolateTo (an InterpolationHandler keeps a running interpolation to the same place and rotation)
  function lerpTo (entity, target, steps, rotation, ticks) {
    const state = stateOf(entity)
    const n = stepsFor(entity, steps)
    if (n > 0 && isStepped(entity)) return steppedTo(entity, target, rotation, ticks)
    const sameRotation = !rotation || (rotation.yaw === state.yaw && rotation.pitch === state.pitch)
    // (a living entity turns from the yaw it holds, its spawn's until it first turned: before the packet's is set)
    if (rotation && entity.yawDegrees == null && kindOf(entity) === 'living') entity.yawDegrees = f32(conv.toNotchianYaw(entity.yaw ?? 0))
    if (rotation) {
      state.yaw = rotation.yaw
      state.pitch = rotation.pitch
      // (an experimental minecart turns there too: setYRot(yRot % 360) before 1.21.5, setRot from 1.21.5)
      if (state.minecart) {
        state.minecart.yaw = handler ? f32(rotation.yaw) : f32(f32(rotation.yaw) % 360)
        state.minecart.pitch = handler ? f32(rotation.pitch) : f32(f32(rotation.pitch) % 360)
      }
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
    if (state.stepped) cancelStepped(state.stepped)
  }

  // where the interpolation goes (the shown position when it does not run): Entity.lerpTargetX
  function targetOf (entity) {
    const state = stateOf(entity)
    if (state.stepped) return state.stepped.steps.length > 0 ? vec(state.stepped.data) : entity.interpolatedPosition.clone()
    return state.steps > 0 ? state.target.clone() : entity.interpolatedPosition.clone()
  }

  // ---- SteppedInterpolationHandler (26.3+, a LivingEntity's) ----
  const isStepped = (entity) => steppedHandler && kindOf(entity) === 'living'
  const intervalOf = (entity) => UPDATE_INTERVAL_2.has(snakeCase(entity.name)) ? 2 : 3
  const vec = ({ x, y, z }) => new Vec3(x, y, z)
  const samePos = (a, b) => a != null && b != null && a.x === b.x && a.y === b.y && a.z === b.z

  function cancelStepped (st) {
    st.steps.length = 0
    st.remaining = 0
    st.speed = 1
  }

  // AbstractInterpolationHandler.interpolateTo: a new end (or rotation) adds a step; starting, it goes from where the
  // entity is (setStartingPoint); a step to where the last one ended takes the whole update interval
  function steppedTo (entity, target, rotation, ticks) {
    const state = stateOf(entity)
    const st = state.stepped ?? (state.stepped = { steps: [], lastStep: null, cur: 0, remaining: 0, speed: 1, data: null, yaw: null, pitch: null })
    const n = intervalOf(entity)
    const active = st.steps.length > 0
    const sameRotation = !rotation || (rotation.yaw === st.yaw && rotation.pitch === st.pitch)
    if (active && samePos(st.data, target) && sameRotation) return
    if (!active) {
      st.lastStep = entity.interpolatedPosition.clone()
      st.cur = 1
    }
    const offset = samePos(target, st.data) ? n : (ticks ?? n)
    st.steps.push({ pos: { x: target.x, y: target.y, z: target.z }, ticks: offset })
    st.remaining = f32(st.remaining + offset)
    st.data = { x: target.x, y: target.y, z: target.z }
    if (rotation) {
      st.yaw = rotation.yaw
      st.pitch = rotation.pitch
    }
    state.target.set(target.x, target.y, target.z)
    state.steps = st.steps.length
  }

  // InterpolationData.getNewPositionAndRotation: along the step reached, else the end
  function steppedPosition (st) {
    while (st.steps.length > 0) {
      const step = st.steps[0]
      if (st.cur < step.ticks) {
        const a = f32(st.cur / step.ticks)
        const from = st.lastStep
        return { x: from.x + a * (step.pos.x - from.x), y: from.y + a * (step.pos.y - from.y), z: from.z + a * (step.pos.z - from.z) }
      }
      st.cur = f32(st.cur - step.ticks)
      st.lastStep = step.pos
      st.steps.shift()
    }
    return st.data
  }

  // InterpolationData.advance: a tick, faster while more ticks than the update interval are left
  function steppedAdvance (st, n) {
    const targetSpeed = Math.max(f32(st.remaining / n), 1)
    st.speed = f32(st.speed + f32(f32(1 / n) * f32(targetSpeed - st.speed)))
    let ticks = 1
    if (f32(ticks * st.speed) < st.remaining) {
      ticks = f32(ticks * st.speed)
    } else {
      ticks = st.remaining
      st.speed = 1
    }
    st.cur = f32(st.cur + ticks)
    st.remaining = f32(st.remaining - ticks)
  }

  function steppedTick (entity, st, mutate = true) {
    if (st.steps.length === 0) {
      if (mutate) cancelStepped(st)
      return null
    }
    const run = mutate ? st : { ...st, steps: [...st.steps] }
    const p = steppedPosition(run)
    if (mutate) steppedAdvance(st, intervalOf(entity))
    return p
  }

  // the shown position after a step toward the target
  function stepOf (entity) {
    const state = entity.interpolation
    const p = entity.interpolatedPosition
    if (!state || state.steps <= 0) return [p.x, p.y, p.z]
    const t = state.target
    const n = state.steps
    if (lerpForm) {
      const d = 1.0 / n
      return [p.x + d * (t.x - p.x), p.y + d * (t.y - p.y), p.z + d * (t.z - p.z)]
    }
    return [p.x + (t.x - p.x) / n, p.y + (t.y - p.y) / n, p.z + (t.z - p.z) / n]
  }

  // A living entity turns with its interpolation, toward the rotation the server sent (LivingEntity.aiStep's
  // lerpPositionAndRotationStep, InterpolationHandler.interpolate): yRot + (float) Mth.wrapDegrees(target - yRot) /
  // steps before 1.20.2, then the double Mth.rotLerp of 1 / steps. The float yaw the client holds is entity.yawDegrees
  // (where a vehicle seats its passenger), entity.yaw keeps the packet's.
  function turn (entity, state) {
    if (state.yaw == null || kindOf(entity) !== 'living') return
    const yaw = entity.yawDegrees != null ? f32(Number(entity.yawDegrees)) : f32(conv.toNotchianYaw(entity.yaw ?? 0))
    const n = state.steps
    const wrapped = wrapDegreesD(state.yaw - yaw)
    entity.yawDegrees = lerpForm ? f32(yaw + (1 / n) * wrapped) : f32(yaw + f32(f32(wrapped) / n))
  }

  function wrapDegreesD (degrees) {
    let wrapped = degrees % 360
    if (wrapped >= 180) wrapped -= 360
    if (wrapped < -180) wrapped += 360
    return wrapped
  }

  // Mth.wrapDegrees and Mth.rotLerp, in float
  function wrapDegrees (degrees) {
    let wrapped = f32(degrees % 360)
    if (wrapped >= 180) wrapped = f32(wrapped - 360)
    if (wrapped < -180) wrapped = f32(wrapped + 360)
    return wrapped
  }
  const rotLerp = (alpha, from, to) => f32(from + f32(alpha * wrapDegrees(f32(to - from))))
  const lerp = (alpha, from, to) => from + alpha * (to - from)

  // NewMinecartBehavior.getCurrentLerpStep(1.0F): the step the minecart's weighted steps have reached after its tick,
  // and how far into it (the float sum of weights against their double total)
  function currentMinecartStep (cart) {
    const alpha = f32(f32(3 - cart.delay + 1) / 3)
    let countUp = 0
    let partial = 1
    let index = cart.current.length - 1
    for (let i = 0; i < cart.current.length; i++) {
      const weight = cart.current[i].weight
      if (weight <= 0) continue
      countUp = f32(countUp + weight)
      if (countUp >= cart.totalWeight * alpha) {
        const before = f32(countUp - weight)
        partial = f32((alpha * cart.totalWeight - before) / weight)
        index = i
        break
      }
    }
    return { partial, step: cart.current[index], previous: index > 0 ? cart.current[index - 1] : cart.old }
  }

  // NewMinecartBehavior.lerpClientPositionAndRotation: every 3 ticks the minecart takes the steps the server sent since,
  // from where it is, and goes along them by their weights
  function tickMinecart (entity, cart) {
    const shown = entity.interpolatedPosition
    if (--cart.delay <= 0) {
      const velocity = entity.velocity ?? { x: 0, y: 0, z: 0 }
      cart.old = { position: { x: shown.x, y: shown.y, z: shown.z }, movement: { x: velocity.x, y: velocity.y, z: velocity.z }, yaw: cart.yaw, pitch: cart.pitch, weight: 0 }
      cart.current = []
      if (cart.pending.length > 0) {
        cart.current = cart.pending
        cart.pending = []
        cart.totalWeight = 0
        for (const step of cart.current) cart.totalWeight += step.weight
        cart.delay = cart.totalWeight === 0 ? 0 : 3
      }
    }
    if (cart.current.length === 0) return
    const { partial, step, previous } = currentMinecartStep(cart)
    const at = (key, axis) => lerp(partial, previous[key][axis], step[key][axis])
    shown.set(at('position', 'x'), at('position', 'y'), at('position', 'z'))
    if (entity.velocity) entity.velocity.set(at('movement', 'x'), at('movement', 'y'), at('movement', 'z'))
    cart.pitch = rotLerp(partial, previous.pitch, step.pitch)
    cart.yaw = rotLerp(partial, previous.yaw, step.yaw)
    entity.yaw = conv.fromNotchianYaw(cart.yaw)
    entity.pitch = conv.fromNotchianPitch(cart.pitch)
  }

  const api = {
    // the entity spawned (or was placed) at entity.position
    spawn (entity) {
      delete entity.interpolation
      stateOf(entity)
    },

    // the tick offsets of the steps of the move or sync packet about to be handled (26.3+, VecDelta.Stepped): the
    // next moves of the entity take them in turn
    queueTicks (entityId, ticks) {
      if (ticks?.length) pendingTicks.set(entityId, [...ticks])
      else pendingTicks.delete(entityId)
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
      addToBase(state.base, dx, dy, dz)
      const target = packetPosition(state.base)
      lerpTo(entity, target, 3, rotation, pendingTicks.get(entity.id)?.shift())
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
      state.base = baseOf({ x, y, z })
      if (teleportSnap && Math.abs(shown.x - x) < 0.03125 && Math.abs(shown.y - y) < 0.015625 && Math.abs(shown.z - z) < 0.03125) {
        lerpTo(entity, shown.clone(), fixedPoint32 ? 3 : 0, rotation)
      } else {
        lerpTo(entity, { x, y, z }, 3, rotation)
      }
      return packetPosition(state.base)
    },

    // The server's moves of a vehicle the client controls do not move it, but they keep its packet position: a relative
    // move adds to it before 1.16 and from 1.21.2 (ClientPacketListener.handleMoveEntity), a teleport sets it before
    // 1.21.2 (handleTeleportEntity; from 1.21.2 the vehicle takes the teleport)
    controlledMove (entity, dx, dy, dz) {
      const state = stateOf(entity)
      if (!atLeast('1.16') || atLeast('1.21.2')) addToBase(state.base, dx, dy, dz)
    },
    controlledTeleport (entity, x, y, z) {
      stateOf(entity).base = baseOf({ x, y, z })
    },

    // A client tick of a vehicle the client controls (before 1.21.2): it is where the client moves it, its interpolation
    // waiting; from 1.16 the interpolation stops and the packet position becomes the vehicle's position
    // (Boat.tickLerp, LivingEntity.aiStep)
    control (entity) {
      const state = stateOf(entity)
      entity.interpolatedPosition.set(entity.position.x, entity.position.y, entity.position.z)
      // (from 1.15: LivingEntity.aiStep's setPacketCoordinates, a floored long before 1.16)
      if (atLeast('1.15')) {
        state.steps = 0
        state.base = baseOf(entity.position)
      }
      if (state.stepped) cancelStepped(state.stepped)
    },

    // the client no longer controls the vehicle: it is shown where the client moved it last
    release (entity) {
      const state = stateOf(entity)
      entity.interpolatedPosition.set(entity.position.x, entity.position.y, entity.position.z)
      if (state.stepped) cancelStepped(state.stepped)
    },

    // 1.21.2+'s position sync: the packet position becomes the double sent, and the entity interpolates to it (or is
    // placed there when more than 64 blocks away)
    sync (entity, x, y, z, rotation) {
      const state = stateOf(entity)
      state.base = { x, y, z }
      const shown = entity.interpolatedPosition
      if ((shown.x - x) ** 2 + (shown.y - y) ** 2 + (shown.z - z) ** 2 > 4096) place(entity, { x, y, z })
      else lerpTo(entity, { x, y, z }, 3, rotation, pendingTicks.get(entity.id)?.shift())
      return { x, y, z }
    },

    // one client tick of the entity: a step toward the target
    tick (entity) {
      const state = entity.interpolation
      if (state?.minecart) return tickMinecart(entity, state.minecart)
      if (state?.stepped) {
        const p = steppedTick(entity, state.stepped)
        if (p) entity.interpolatedPosition.set(p.x, p.y, p.z)
        state.steps = state.stepped.steps.length
        return
      }
      if (!state || state.steps <= 0) return
      entity.interpolatedPosition.set(...stepOf(entity))
      turn(entity, state)
      state.steps--
    },

    // where the entity's next client tick shows it (the shown position when it does not interpolate)
    next (entity) {
      if (!entity.interpolatedPosition) return entity.position.clone()
      if (entity.interpolation?.stepped) {
        const p = steppedTick(entity, entity.interpolation.stepped, false)
        return p ? vec(p) : entity.interpolatedPosition.clone()
      }
      return entity.interpolatedPosition.clone().set(...stepOf(entity))
    },

    // From 1.21.2 a minecart on the experimental behaviour (the minecart_improvements feature) goes along the steps of
    // its track the server sends (ClientPacketListener.handleMinecartAlongTrack): a position, motion, rotation in
    // degrees and weight each. Returns the last step's position, where the server has it.
    minecartSteps (entity, steps) {
      const state = stateOf(entity)
      if (!state.minecart) {
        const yaw = state.yaw ?? f32(conv.toNotchianYaw(entity.yaw ?? 0))
        const pitch = state.pitch ?? f32(conv.toNotchianPitch(entity.pitch ?? 0))
        state.minecart = { pending: [], current: [], totalWeight: 0, delay: 0, old: null, yaw, pitch }
      }
      state.steps = 0
      state.minecart.pending.push(...steps)
      return steps.length > 0 ? steps[steps.length - 1].position : entity.interpolatedPosition.clone()
    },

    // whether the server runs the experimental minecarts (the minecart_improvements feature flag)
    minecartImprovements: false,

    kindOf,
    targetOf
  }
  return api
}

module.exports = { createEntityInterpolation }
