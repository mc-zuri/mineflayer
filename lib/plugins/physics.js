const { Vec3 } = require('vec3')
const assert = require('assert')
const conv = require('../conversions')
const math = require('../math')
const { performance } = require('perf_hooks')
const { createDoneTask, createTask } = require('../promise_utils')
const physicsUtil = require('@nxg-org/mineflayer-physics-util')
const {
  BotcraftPhysics,
  EPhysicsCtx,
  PhysicsWorldSettings,
  initSetup,
  convertPlayerState,
  applyToPlayerState,
  BoatPhysics,
  BoatState,
  HorsePhysics,
  HorseState,
  ControlStateHandler
} = physicsUtil
const { resolveTransportPhysicsCapabilities } = require('../physicsCapabilities')
const { JavaFloat } = require('../javamath')
const { createMovingPistons } = require('../movingPistons')

const mouseSensitivity = 100.0
// default is 0.5F (corresponds to 100%), so we just translate according to that
const rawSensitivity = new JavaFloat(mouseSensitivity).divide(new JavaFloat(200.0))
const f = rawSensitivity.multiply(new JavaFloat(0.6)).add(new JavaFloat(0.2))
const roundingGCD = new JavaFloat(0.15).multiply(new JavaFloat(8.0)).multiply(f).multiply(f).multiply(f)

const DEFAULT_PHYSICS_INTERVAL_MS = 50
const DEFAULT_PHYSICS_TIMESTEP = DEFAULT_PHYSICS_INTERVAL_MS / 1000
// Vanilla LocalPlayer.sendPosition uses a 2.0E-4 squared-distance threshold,
// not the server-side 0.03 movement lenience.
const BOAT_DISMOUNT_YAW_OFFSETS = [0, Math.PI / 8, -Math.PI / 8, Math.PI / 4, -Math.PI / 4]
const MAX_BOAT_DISMOUNT_DISTANCE = 2.5
const HORSE_PHYSICS_VERSION = '1.17.1'
const BOAT_CORRECTION_LIMIT = 3
const BOAT_CORRECTION_WINDOW_MS = 1000
const HORSE_CORRECTION_LIMIT = 3
const HORSE_CORRECTION_WINDOW_MS = 1000
const MAX_BOAT_PASSENGER_YAW_OFFSET = 105 * Math.PI / 180
const BOAT_PHYS_DEBUG = !!process.env.BOAT_PHYS_DEBUG
const MAX_VEHICLE_MOVE_COMPONENT = 0.9800000190734863
const RIDEABLE_MINECART_ENTITY_NAMES = new Set([
  'minecart',
  'chest_minecart',
  'furnace_minecart',
  'hopper_minecart',
  'tnt_minecart',
  'spawner_minecart',
  'command_block_minecart'
])
const RIDEABLE_HORSE_ENTITY_NAMES = new Set([
  'EntityHorse', // 1.8 - 1.10: one entity for every horse type
  'horse',
  'donkey',
  'mule',
  'skeleton_horse',
  'zombie_horse'
])
const HORSE_DISMOUNT_YAW_OFFSETS = [Math.PI / 2, -Math.PI / 2, 0, Math.PI / 8, -Math.PI / 8]
const POST_DISMOUNT_TIMEOUT_MS = 3000

function isRideableMinecartEntity (entity) {
  return entity != null && RIDEABLE_MINECART_ENTITY_NAMES.has(entity.name)
}

function isBoatEntity (entity) {
  const name = entity?.name?.toLowerCase()
  if (!name) return false
  return name === 'boat' || name === 'chest_boat' || name.endsWith('_boat') || name.endsWith('_raft')
}

// Bamboo rafts became a separate entity type in 1.21.2. Before that, a raft was
// a 'boat' entity with a metadata variant that this project does not read.
function isRaftEntity (entity) {
  const name = entity?.name?.toLowerCase()
  return typeof name === 'string' && name.endsWith('_raft')
}

function isRideableHorseEntity (entity) {
  return entity != null && RIDEABLE_HORSE_ENTITY_NAMES.has(entity.name)
}

function horseSaddleFlag (entity) {
  const flags = entity?.metadata?.[17]
  return typeof flags === 'number' && (flags & 0x04) !== 0
}

function isServerAuthoritativeMinecart (vehicle) {
  return isRideableMinecartEntity(vehicle)
}

function checkInputEquality (oldInput, newInput) {
  const oldKeys = Object.keys(oldInput)
  const newKeys = Object.keys(newInput)
  if (oldKeys.length !== newKeys.length) return false
  for (const key of oldKeys) {
    if (oldInput[key] !== newInput[key]) return false
  }
  return true
}

function cloneInput (input) {
  return {
    forward: input.forward,
    back: input.back,
    left: input.left,
    right: input.right,
    jump: input.jump,
    sprint: input.sprint,
    sneak: input.sneak
  }
}

function deltaYawRadians (yaw1, yaw2) {
  const PI = Math.PI
  const PI_2 = Math.PI * 2
  let dYaw = (yaw1 - yaw2) % PI_2
  if (dYaw < -PI) dYaw += PI_2
  else if (dYaw > PI) dYaw -= PI_2
  return dYaw
}

function deltaYawDegrees (yaw1, yaw2) {
  let dYaw = new JavaFloat((yaw1.subtract(yaw2)) % new JavaFloat(360))
  if (dYaw.valueOf() < -180) dYaw = dYaw.add(new JavaFloat(360))
  else if (dYaw.valueOf() > 180) dYaw = dYaw.subtract(new JavaFloat(360))
  return dYaw
}

function setAngleDegrees (bot, newYaw, newPitch, autoround = true) {
  if (typeof bot.entity.yawDegrees === 'undefined') {
    bot.entity.yawDegrees = new JavaFloat(0)
    bot.entity.pitchDegrees = new JavaFloat(0)
  }

  if (autoround) {
    const dYaw = deltaYawDegrees(new JavaFloat(newYaw), bot.entity.yawDegrees)
    const normYaw = bot.entity.yawDegrees.add(dYaw)
    bot.entity.yawDegrees = normYaw.divide(roundingGCD).round().multiply(roundingGCD)
    bot.entity.pitchDegrees = new JavaFloat(newPitch).divide(roundingGCD).round().multiply(roundingGCD)
  } else {
    bot.entity.yawDegrees = new JavaFloat(newYaw)
    bot.entity.pitchDegrees = new JavaFloat(newPitch)
  }

  bot.entity.pitchDegrees = bot.entity.pitchDegrees.clamp(new JavaFloat(-90.0), new JavaFloat(90.0))
  bot.entity.yaw = conv.fromNotchianYaw(bot.entity.yawDegrees)
  bot.entity.pitch = conv.fromNotchianPitch(bot.entity.pitchDegrees)
}

/**
 * @param {import('mineflayer').Bot} bot
 * @param {*} param1
 */
function inject (bot, { physicsEnabled, maxCatchupTicks, physicsManual }) {
  // LocalPlayer.positionReminder: the ticks since the last position sent; at 20 the position goes again. 1.8 counts
  // the tick after checking (EntityPlayerSP.onUpdateWalkingPlayer), so its reminder goes a tick later.
  const POSITION_REMINDER_TICKS = 20
  const positionReminderCountsFirst = bot.registry.isNewerOrEqualTo('1.9')
  const sneakIsInputOnly = bot.registry.isNewerOrEqualTo('1.21.6')
  // From 1.21.2 LocalPlayer.tick sends the shift key first (sendShiftKeyState), then the input and the sprint; before,
  // sendPosition sends the sprint first (sendIsSprintingIfNeeded), then the shift key.
  const shiftKeySentFirst = bot.registry.isNewerOrEqualTo('1.21.2')
  // LocalPlayer.sendPosition: the position goes when it moved more than 0.03 blocks, from 1.18.2 more than 2.0E-4
  const MIN_DELTA_DIST_SQUARED = bot.registry.isNewerOrEqualTo('1.18.2') ? 2.0E-4 * 2.0E-4 : 9.0E-4
  const PHYSICS_CATCHUP_TICKS = maxCatchupTicks ?? 4
  const world = { getBlock: (pos) => bot.blockAt(pos, false) }

  const transportCapabilities = resolveTransportPhysicsCapabilities(physicsUtil)
  const boatCapabilityAvailable = transportCapabilities.boat
  const horseCapabilityAvailable = transportCapabilities.horse
  let warnedMissingBoatCapability = false
  let warnedMissingHorseCapability = false

  const physics = new BotcraftPhysics(bot.registry)
  const movingPistons = createMovingPistons(bot.registry)
  bot._client.on('block_action', (packet) => {
    const { x, y, z } = packet.location
    movingPistons.trigger(bot.registry.blocks[packet.blockId]?.name, [x, y, z], packet.byte1, packet.byte2)
  })
  const boatPhysics = boatCapabilityAvailable ? new BoatPhysics(bot.registry) : null
  const horsePhysics = horseCapabilityAvailable ? new HorsePhysics(bot.registry) : null
  initSetup(bot.registry)

  // Only 1.8 sends a movement packet every tick, the status-only one when nothing changed; from 1.9 that one goes only
  // when onGround changes. (minecraft-data's positionUpdateSentEveryTick feature lists 1.8 - 1.11.2.)
  const positionUpdateSentEveryTick = !bot.registry.isNewerOrEqualTo('1.9')

  bot.jumpQueued = false
  bot.jumpTicks = 0

  const controlState = {
    forward: false,
    back: false,
    left: false,
    right: false,
    jump: false,
    sprint: false,
    sneak: false
  }

  let lastSentYaw = null
  let lastSentPitch = null
  let doPhysicsTimer = null
  let lastPhysicsFrameTime = null
  let shouldUsePhysics = false

  // 1.21.4+: after a login or a respawn the player does not tick until the client has loaded the level
  // (LocalPlayer.tick: hasClientLoaded). It waits for the server's level_chunks_load_start, then for the
  // player's section (ClientPacketListener.tick, LevelLoadStatusManager / LevelLoadTracker), and tells the server.
  const waitsForLevel = bot.registry.version['>=']('1.21.4')
  const loadTimesOutInTicks = waitsForLevel && bot.registry.version['<']('1.21.11') // Player.CLIENT_LOADED_TIMEOUT_TIME
  const loadTimesOutInTime = bot.registry.version['>=']('1.21.9') // LevelLoadTracker.CLIENT_WAIT_TIMEOUT_MS
  let clientLoaded = !waitsForLevel
  let levelLoad = null // 'server' (waiting for level_chunks_load_start), 'chunk' (for the player's section), null
  let clientLoadTimeout = 60
  let levelLoadDeadline = Infinity
  // A bot has no renderer: the player's section counts as compiled once its chunk is loaded, unless the caller
  // replaces that test with its own function (e.g. a replay of a recorded client).
  if (bot.levelLoaded === undefined) bot.levelLoaded = null
  bot.physicsEnabled = physicsEnabled ?? true
  let deadTicks = 21
  let physicsIntervalMs = DEFAULT_PHYSICS_INTERVAL_MS
  let physicsTimestep = DEFAULT_PHYSICS_TIMESTEP

  const settings = new PhysicsWorldSettings(bot.registry)
  settings.yawSpeed = 6000 // default speed is 60 for upstream mineflayer * 20. Bumped to allow instant turns.
  settings.pitchSpeed = 6000
  settings.overrides = {}

  /**
   * @type {EPhysicsCtx<PlayerState> | undefined}
   */
  let ectx
  // the tick asked the server to start gliding (LocalPlayer.aiStep's START_FALL_FLYING), and whether it was sent
  let glideRequested = false
  let startFallFlyingSent = false

  /**
   * @type {import('@nxg-org/mineflayer-physics-util').EPhysicsCtx<import('@nxg-org/mineflayer-physics-util').BoatState> | null}
   */
  let boatCtx = null
  let boatVehicleId = null
  let boatPhysicsDisabled = false
  let boatPhysicsDisabledLogged = false
  /** @type {{ kind: string, replaceVelocity: boolean } | null} */
  let pendingBoatCorrection = null
  let boatCorrectionCount = 0
  let boatCorrectionWindowStart = 0
  let boatTickPacketsReady = false
  /** @type {Record<string, number>} */
  const boatDebugCorrectionCounts = {}

  /**
   * @type {import('@nxg-org/mineflayer-physics-util').EPhysicsCtx<import('@nxg-org/mineflayer-physics-util').HorseState> | null}
   */
  let horseCtx = null
  let horseVehicleId = null
  let horsePhysicsDisabled = false
  let horsePhysicsDisabledLogged = false
  /** @type {{ kind: string, replaceVelocity: boolean } | null} */
  let pendingHorseCorrection = null
  let horseCorrectionCount = 0
  let horseCorrectionWindowStart = 0
  let horseTickPacketsReady = false
  /** @type {{ released: boolean, jumpBoost: number } | null} */
  let pendingHorseJumpRelease = null

  let lastSent = {
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    pitch: 0,
    onGround: false,
    positionReminder: 0,
    flags: { onGround: false, hasHorizontalCollision: false },
    sprintState: false,
    sneakState: false,
    previousInputState: cloneInput(controlState)
  }

  let elytraFlyTask = createDoneTask()
  let elytraFlyTimeout = null
  let pendingElytraFly = false
  let forceElytraFly = false
  let resolveForcedElytraFlyImmediately = false
  let speculativeElytraFly = false
  let elytraTakeoffControl = null

  bot._lastSent = lastSent

  const lastUpdated = {
    yaw: 0,
    pitch: 0
  }

  let timeAccumulator = 0
  let catchupTicks = 0

  function getHorizontalCollision () {
    return bot.registry.isNewerOrEqualTo('1.21.3') &&
      !!(bot.entity.horizontalCollision ?? bot.entity.isCollidedHorizontally)
  }

  function setPendingElytraFlyRequestState (enabled) {
    if (bot.entity == null) return
    bot.entity._pendingElytraFlyRequest = enabled
  }

  function isElytraTakeoffControlActive () {
    return elytraTakeoffControl != null && (pendingElytraFly || speculativeElytraFly)
  }

  function hasConfirmedElytraFlightState () {
    return (bot.entity.fallFlying || bot.entity.elytraFlying) &&
      bot.entity._pendingElytraFlightConfirmation !== true
  }

  function startElytraTakeoffControl (assistTakeoff) {
    if (elytraTakeoffControl != null) return

    elytraTakeoffControl = {
      previousControls: cloneInput(controlState),
      overrideMovement: assistTakeoff === true,
      phase: (bot.entity.onGround || lastSent.onGround)
        ? (controlState.jump ? 'ground_release' : 'ground_jump')
        : (controlState.jump ? 'air_release' : 'air_press')
    }
  }

  function clearElytraTakeoffControl () {
    if (elytraTakeoffControl == null) return

    const { previousControls, overrideMovement } = elytraTakeoffControl
    elytraTakeoffControl = null

    controlState.jump = previousControls.jump
    if (overrideMovement) {
      for (const key of Object.keys(previousControls)) {
        if (key === 'jump') continue
        controlState[key] = previousControls[key]
      }
    }
  }

  function advanceElytraTakeoffControlBeforePackets () {
    if (elytraTakeoffControl == null) return

    // Vanilla clears the glide flag when gliding is no longer valid rather than
    // treating every local fallFlying flip as authoritative; see
    // LivingEntity.updateFallFlying()/canGlide() in 1.21.4. Keep the takeoff
    // controller alive until flight is speculative or confirmed so the
    // START_FLYING_WITH_ELYTRA packet is not dropped while a stale local
    // fall-flying bit is still set. Grim is sensitive to that packet/input
    // ordering and will see an orphaned pending request as invalid.
    if (speculativeElytraFly || hasConfirmedElytraFlightState() || !pendingElytraFly) {
      clearElytraTakeoffControl()
      return
    }

    if (elytraTakeoffControl.overrideMovement) {
      controlState.forward = true
      controlState.back = false
      controlState.left = false
      controlState.right = false
      controlState.sprint = true
      controlState.sneak = false
    }

    if (elytraTakeoffControl.phase === 'ground_release') {
      controlState.jump = false
      return
    }

    if (elytraTakeoffControl.phase === 'ground_jump') {
      if (!controlState.jump) {
        controlState.jump = true
        bot.jumpQueued = true
      }
      return
    }

    if (elytraTakeoffControl.phase === 'air_release') {
      controlState.jump = false
      return
    }

    if (elytraTakeoffControl.phase === 'air_press' && !controlState.jump) {
      controlState.jump = true
      bot.jumpQueued = true
    }
  }

  function advanceElytraTakeoffControlAfterPackets () {
    if (elytraTakeoffControl == null) return

    if (speculativeElytraFly || hasConfirmedElytraFlightState() || !pendingElytraFly) {
      clearElytraTakeoffControl()
      return
    }

    if ((elytraTakeoffControl.phase === 'air_release' || elytraTakeoffControl.phase === 'air_press') &&
        bot.entity.onGround && lastSent.onGround) {
      elytraTakeoffControl.phase = controlState.jump ? 'ground_release' : 'ground_jump'
      return
    }

    if (elytraTakeoffControl.phase === 'ground_release') {
      if (lastSent.previousInputState.jump === false) {
        elytraTakeoffControl.phase = 'ground_jump'
      }
      return
    }

    if (elytraTakeoffControl.phase === 'ground_jump') {
      if (!bot.entity.onGround && !lastSent.onGround) {
        elytraTakeoffControl.phase = 'air_release'
      }
      return
    }

    if (elytraTakeoffControl.phase === 'air_release' && lastSent.previousInputState.jump === false) {
      elytraTakeoffControl.phase = 'air_press'
    }
  }

  function restartPhysicsTimer () {
    if (doPhysicsTimer === null) return
    clearInterval(doPhysicsTimer)
    doPhysicsTimer = setInterval(doPhysics, physicsIntervalMs)
  }

  function doPhysics () {
    const now = performance.now()
    const deltaSeconds = (now - lastPhysicsFrameTime) / 1000
    lastPhysicsFrameTime = now

    timeAccumulator += deltaSeconds
    catchupTicks = 0
    while (timeAccumulator >= physicsTimestep) {
      tickPhysics(now)
      timeAccumulator -= physicsTimestep
      catchupTicks++
      if (catchupTicks >= PHYSICS_CATCHUP_TICKS) break
    }
  }

  // EntityType.*.passengerAttachments (1.20.5+)
  const HORSE_PASSENGER_ATTACHMENT_Y = { horse: 1.44375, donkey: 1.1125, mule: 1.2125, skeleton_horse: 1.31875, zombie_horse: 1.31875 }

  /**
   * How far above a horse its rider's feet are (Entity.positionRider), from the horse's float height:
   *   <= 1.20.1: getPassengersRidingOffset() (height * 0.75D; chested horses 0.25 and skeleton horses 0.1875 less) +
   *              Player.getMyRidingOffset() (-0.35D)
   *   1.20.2 - 1.20.4: the passenger attachment, height - 0.15625F (chested horses 0.3875F) in float, + the player's
   *              ridingOffset(), -0.6F
   *   >= 1.20.5: the horse type's passenger attachment (float) - Player.DEFAULT_VEHICLE_ATTACHMENT.y (0.6D)
   */
  function getHorsePassengerFeetOffsetY (horse) {
    const f32 = Math.fround
    const height = f32(horse.height ?? 1.6)
    const chested = horse.name === 'donkey' || horse.name === 'mule'
    if (bot.registry.isNewerOrEqualTo('1.20.5')) {
      return f32(HORSE_PASSENGER_ATTACHMENT_Y[horse.name] ?? f32(height - f32(0.15625))) - 0.6
    }
    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      return f32(height - f32(chested ? 0.3875 : 0.15625)) + f32(-0.6)
    }
    let variantOffset = 0
    if (chested) {
      variantOffset = 0.25
    } else if (horse.name === 'skeleton_horse') {
      variantOffset = 0.1875
    }
    return height * 0.75 - variantOffset - 0.35
  }

  // <= 1.20.1: Entity#positionRider = y + vehicle.getPassengersRidingOffset() + passenger.getMyRidingOffset()
  // Vanilla 1.17.1 sources: vehicle/Boat#getPassengersRidingOffset() = -0.1,
  // vehicle/AbstractMinecart#getPassengersRidingOffset() = 0, player/Player#getMyRidingOffset() = -0.35.
  const LEGACY_PLAYER_RIDING_OFFSET_Y = -0.35 // Player#getMyRidingOffset(), <= 1.20.1
  const LEGACY_BOAT_RIDING_OFFSET_Y = -0.1 // Boat#getPassengersRidingOffset(), <= 1.20.1
  const LEGACY_MINECART_RIDING_OFFSET_Y = 0 // AbstractMinecart#getPassengersRidingOffset(), <= 1.20.1

  // >= 1.20.2: y is based on the vehicle's PASSENGER attachment point.
  // The player's contribution is numerically the same, but the mechanism changed:
  //   1.20.2-1.20.4: PASSENGER.y + Player#ridingOffset() (-0.6)
  //   >= 1.20.5:     PASSENGER.y - Player.DEFAULT_VEHICLE_ATTACHMENT.y (0.6)
  // Vanilla sources: Entity#positionRider, Boat#getPassengerAttachmentPoint,
  // EntityType.*_MINECART#passengerAttachments and Player#ridingOffset / DEFAULT_VEHICLE_ATTACHMENT.
  const MODERN_PLAYER_RIDING_OFFSET_Y = -0.6
  const MODERN_MINECART_PASSENGER_ATTACHMENT_Y = 0.1875 // EntityType.*_MINECART.passengerAttachments()
  const MODERN_BOAT_RIDE_HEIGHT_FACTOR = 1 / 3 // (Abstract)Boat#rideHeight(), >= 1.20.2
  const MODERN_RAFT_RIDE_HEIGHT_FACTOR = 0.8888889 // Raft#rideHeight(), >= 1.21.2

  /**
   * Vanilla seat offset for a player passenger in a boat, minecart or horse.
   * Returns null for other vehicles so their existing behavior is preserved.
   */
  function getVehiclePassengerFeetOffsetY (vehicle) {
    if (isRideableHorseEntity(vehicle)) return getHorsePassengerFeetOffsetY(vehicle)
    const isBoat = isBoatEntity(vehicle)
    const isMinecart = isRideableMinecartEntity(vehicle)
    if (!isBoat && !isMinecart) return null

    const height = vehicle.height ?? 0

    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      const passengerAttachmentY = isBoat
        ? height * (isRaftEntity(vehicle) ? MODERN_RAFT_RIDE_HEIGHT_FACTOR : MODERN_BOAT_RIDE_HEIGHT_FACTOR)
        : MODERN_MINECART_PASSENGER_ATTACHMENT_Y
      return passengerAttachmentY + MODERN_PLAYER_RIDING_OFFSET_Y
    }

    // Before 1.21.2 a raft was named 'boat'; its metadata variant is not read here.
    const vehicleRidingOffset = isBoat ? LEGACY_BOAT_RIDING_OFFSET_Y : LEGACY_MINECART_RIDING_OFFSET_Y
    return vehicleRidingOffset + LEGACY_PLAYER_RIDING_OFFSET_Y
  }

  // Where the vehicle seats its rider from (Entity.positionRider uses the vehicle's position): a vehicle the bot moves
  // itself is where it put it; any other is where the client shows it, easing toward the server's moves
  // (entity.interpolatedPosition, stepped before the passenger)
  function seatPosition (vehicle) {
    if (isBoatController() || isHorseController()) return vehicle.position
    return vehicle.interpolatedPosition ?? vehicle.position
  }

  function syncEntityWithHorse () {
    const vehicle = bot.vehicle
    if (!vehicle) return

    const seat = seatPosition(vehicle)
    bot.entity.position.set(seat.x, seat.y + getHorsePassengerFeetOffsetY(vehicle), seat.z)

    // the passenger's own velocity: Entity.rideTick zeroes it, then its travel adds gravity and air drag (the walk
    // input it would add is not modeled)
    bot.entity.velocity.set(0, (0 - 0.08) * 0.9800000190734863, 0)
    // the passenger's own tick (Entity.rideTick) does not move it, so it does not touch the ground
    bot.entity.onGround = false
  }

  function syncEntityWithVehicle () {
    const vehicle = bot.vehicle
    if (!vehicle) return

    const seat = seatPosition(vehicle)
    bot.entity.position.set(
      seat.x,
      // Boats, minecarts and horses use vanilla seat offsets. Other vehicles retain the
      // existing behavior.
      seat.y + (getVehiclePassengerFeetOffsetY(vehicle) ?? (vehicle.height ?? 0)),
      seat.z
    )

    // the passenger's own velocity: Entity.rideTick zeroes it, then its travel adds gravity and air drag (the walk
    // input it would add is not modeled)
    bot.entity.velocity.set(0, (0 - 0.08) * 0.9800000190734863, 0)
    // the passenger's own tick (Entity.rideTick) does not move it, so it does not touch the ground
    bot.entity.onGround = false
  }

  function isSolidBlockAt (pos) {
    const block = bot.blockAt(pos, false)
    if (block == null) return false
    if (block.type === 0 || block.name === 'air' || block.name === 'cave_air' || block.name === 'void_air') {
      return false
    }
    return true
  }

  function isOutsideHorizontalEntityAabb (x, z, entity) {
    const halfWidth = (entity.width ?? 0) / 2
    if (halfWidth <= 0) return false
    const dx = Math.abs(x - entity.position.x)
    const dz = Math.abs(z - entity.position.z)
    return dx > halfWidth || dz > halfWidth
  }

  function isValidBoatDismountPosition (x, y, z, boat) {
    if (!isOutsideHorizontalEntityAabb(x, z, boat)) return false
    if (isSolidBlockAt(new Vec3(x, y, z))) return false
    if (isSolidBlockAt(new Vec3(x, y + 1, z))) return false
    return true
  }

  function computeBoatDismountDistance (boat, player) {
    const boatWidth = boat.width
    const playerWidth = player.width
    if (!boatWidth || !playerWidth || boatWidth <= 0 || playerWidth <= 0) return null
    const distance = (boatWidth * Math.SQRT2 + playerWidth) / 2
    return Math.min(distance, MAX_BOAT_DISMOUNT_DISTANCE)
  }

  let pendingPostDismountVehicle = null
  let pendingPostDismountAt = 0

  function clearPendingPostDismount () {
    pendingPostDismountVehicle = null
    pendingPostDismountAt = 0
  }

  function isPendingPostDismountValid () {
    if (pendingPostDismountVehicle == null) return false
    if (Date.now() - pendingPostDismountAt >= POST_DISMOUNT_TIMEOUT_MS) {
      clearPendingPostDismount()
      return false
    }
    return true
  }

  function rememberPendingPostDismount (vehicle) {
    if (vehicle?.name === 'boat' || isRideableHorseEntity(vehicle)) {
      pendingPostDismountVehicle = vehicle
      pendingPostDismountAt = Date.now()
    }
  }

  function applyPostDismountOffset (vehicle) {
    if (vehicle?.name === 'boat') {
      offsetPlayerFromBoat(vehicle)
    } else if (isRideableHorseEntity(vehicle)) {
      offsetPlayerFromHorse(vehicle)
    }
  }

  function offsetPlayerFromBoat (boat) {
    const distance = computeBoatDismountDistance(boat, bot.entity)
    if (distance == null) return

    const y = boat.position.y + (boat.height ?? 0)
    const vehicleVelocity = boat.velocity

    for (const yawOffset of BOAT_DISMOUNT_YAW_OFFSETS) {
      const dirYaw = bot.entity.yaw + yawOffset
      const x = boat.position.x - Math.sin(dirYaw) * distance
      const z = boat.position.z - Math.cos(dirYaw) * distance
      if (!isValidBoatDismountPosition(x, y, z, boat)) continue

      bot.entity.position.set(x, y, z)
      if (vehicleVelocity) {
        bot.entity.velocity.set(vehicleVelocity.x, vehicleVelocity.y, vehicleVelocity.z)
      } else {
        bot.entity.velocity.set(0, 0, 0)
      }
      bot.entity.onGround = false
      return
    }
  }

  function warnMissingBoatCapabilityOnce () {
    if (warnedMissingBoatCapability || boatCapabilityAvailable) return
    warnedMissingBoatCapability = true
    console.warn('[mineflayer] local boat physics unavailable: @nxg-org/mineflayer-physics-util does not export BoatPhysics/BoatState')
  }

  function warnMissingHorseCapabilityOnce () {
    if (warnedMissingHorseCapability || horseCapabilityAvailable) return
    warnedMissingHorseCapability = true
    console.warn('[mineflayer] local horse physics unavailable: @nxg-org/mineflayer-physics-util does not export HorsePhysics/HorseState')
  }

  function isBoatControllerCandidate () {
    return isBoatPhysicsVersion() &&
      isBoatEntity(bot.vehicle) &&
      bot.vehicle.passengers?.[0]?.id === bot.entity.id
  }

  function isHorseControllerCandidate () {
    const vehicle = bot.vehicle
    return bot.version === HORSE_PHYSICS_VERSION &&
      vehicle &&
      isRideableHorseEntity(vehicle) &&
      vehicle.passengers?.[0]?.id === bot.entity.id &&
      horseSaddleFlag(vehicle)
  }

  function isHorsePhysicsVersion () {
    return bot.version === HORSE_PHYSICS_VERSION
  }

  function canUseLocalHorsePhysics () {
    return horseCapabilityAvailable && isHorsePhysicsVersion()
  }

  function isHorseController () {
    const vehicle = bot.vehicle
    return canUseLocalHorsePhysics() &&
      vehicle &&
      isRideableHorseEntity(vehicle) &&
      vehicle.passengers?.[0]?.id === bot.entity.id &&
      horseSaddleFlag(vehicle)
  }

  function destroyHorseContext () {
    horseCtx = null
    horseVehicleId = null
    pendingHorseCorrection = null
    pendingHorseJumpRelease = null
    horseTickPacketsReady = false
  }

  function resetHorseCorrectionTracking () {
    horseCorrectionCount = 0
    horseCorrectionWindowStart = 0
    horsePhysicsDisabled = false
    horsePhysicsDisabledLogged = false
  }

  function createHorseContext (vehicle) {
    ensureVehicleRotationDefaults(vehicle)
    const entityType = bot.registry.entitiesByName[vehicle.name] ?? bot.registry.entitiesByName.horse
    const state = HorseState.CREATE_FROM_ENTITY(horsePhysics, vehicle, ControlStateHandler.COPY_BOT(bot))
    horseCtx = EPhysicsCtx.FROM_ENTITY_STATE(horsePhysics, state, entityType)
    horseVehicleId = vehicle.id
    resetHorseCorrectionTracking()
    pendingHorseCorrection = null
    pendingHorseJumpRelease = null
    horseTickPacketsReady = false
  }

  function ensureHorseContext () {
    const vehicle = bot.vehicle
    if (!vehicle || !isRideableHorseEntity(vehicle) || !horseSaddleFlag(vehicle)) {
      destroyHorseContext()
      return false
    }
    if (!horseCtx || horseVehicleId !== vehicle.id) {
      createHorseContext(vehicle)
    }
    return true
  }

  function disableHorsePhysicsWithLog (reason) {
    if (horsePhysicsDisabled) return
    horsePhysicsDisabled = true
    if (!horsePhysicsDisabledLogged) {
      console.warn(`[mineflayer] disabled local horse physics: ${reason}`)
      horsePhysicsDisabledLogged = true
    }
  }

  function applyPendingHorseCorrection () {
    if (!pendingHorseCorrection || !horseCtx || !bot.vehicle) return false
    const correction = pendingHorseCorrection
    pendingHorseCorrection = null

    if (correction.kind === 'entity_velocity') {
      horseCtx.state.vel.set(
        bot.vehicle.velocity.x,
        bot.vehicle.velocity.y,
        bot.vehicle.velocity.z
      )
      return true
    }

    if (correction.kind !== 'vehicle_move') {
      return false
    }

    horseCtx.state.rebaseFromEntity(bot.vehicle, {
      replaceVelocity: correction.replaceVelocity === true
    })
    return true
  }

  function syncControlsToHorseState () {
    if (!horseCtx) return
    horseCtx.state.updateControls(
      ControlStateHandler.COPY_BOT(bot),
      bot.entity.yaw,
      bot.entity.pitch
    )
    horseCtx.state.updateFromHorseEntity(bot.vehicle)
    pendingHorseJumpRelease = horseCtx.state.updateJumpCharge(controlState.jump)
  }

  function isValidHorseDismountPosition (x, y, z, horse) {
    if (!isOutsideHorizontalEntityAabb(x, z, horse)) return false
    const halfWidth = (bot.entity.width ?? 0.6) / 2
    for (const dy of [0, 1]) {
      for (const dx of [-halfWidth, 0, halfWidth]) {
        for (const dz of [-halfWidth, 0, halfWidth]) {
          if (isSolidBlockAt(new Vec3(x + dx, y + dy, z + dz))) return false
        }
      }
    }
    if (isSolidBlockAt(new Vec3(x, y - 0.01, z))) return true
    return isSolidBlockAt(new Vec3(x, y - 1, z))
  }

  function offsetPlayerFromHorse (horse) {
    const playerWidth = bot.entity.width ?? 0.6
    const horseWidth = horse.width ?? 1.3964844
    const distance = (horseWidth + playerWidth) / 2 + 0.2
    const feetY = horse.position.y + getHorsePassengerFeetOffsetY(horse)

    for (const yawOffset of HORSE_DISMOUNT_YAW_OFFSETS) {
      const dirYaw = horse.yaw + yawOffset
      const x = horse.position.x - Math.sin(dirYaw) * distance
      const z = horse.position.z + Math.cos(dirYaw) * distance
      if (!isValidHorseDismountPosition(x, feetY, z, horse)) continue
      bot.entity.position.set(x, feetY, z)
      bot.entity.velocity.set(0, 0, 0)
      bot.entity.onGround = false
      return
    }
  }

  function sendControlledHorsePackets () {
    const vehicle = bot.vehicle
    if (!vehicle || !horseCtx) return false

    ensureVehicleRotationDefaults(vehicle)

    const jumpRelease = pendingHorseJumpRelease
    pendingHorseJumpRelease = null

    if (jumpRelease?.released) {
      bot._client.write('entity_action', {
        entityId: bot.entity.id,
        actionId: 'start_riding_jump',
        jumpBoost: jumpRelease.jumpBoost
      })
    }

    const sideways = controlState.left ? 1 : controlState.right ? -1 : 0
    const forward = (controlState.forward ? 1 : 0) - (controlState.back ? 1 : 0)
    bot.moveVehicle(sideways, forward, controlState.jump)

    const x = vehicle.position.x
    const y = vehicle.position.y
    const z = vehicle.position.z
    // the ridden horse turns with its rider (AbstractHorse.travel): the rider's float yaw and half its pitch
    const yaw = sentYawDegrees()
    const pitch = Math.fround(sentPitchDegrees() * 0.5)

    if (![x, y, z, yaw, pitch].every(Number.isFinite)) {
      disableHorsePhysicsWithLog('non-finite vehicle state')
      return false
    }

    bot._client.write('vehicle_move', { x, y, z, yaw, pitch })
    return true
  }

  // the boat the client steers itself (Boat.tick, isControlledByLocalInstance) since 1.9
  function isBoatPhysicsVersion () {
    return bot.registry.version['>=']('1.9')
  }

  function canUseLocalBoatPhysics () {
    return boatCapabilityAvailable && isBoatPhysicsVersion()
  }

  function isBoatController () {
    return canUseLocalBoatPhysics() &&
      isBoatEntity(bot.vehicle) &&
      bot.vehicle.passengers?.[0]?.id === bot.entity.id
  }

  function needsLegacyBoatPackets () {
    const vehicle = bot.vehicle
    return !canUseLocalBoatPhysics() &&
      isBoatEntity(vehicle) &&
      vehicle.passengers?.[0]?.id === bot.entity.id
  }

  function destroyBoatContext () {
    boatCtx = null
    boatVehicleId = null
    pendingBoatCorrection = null
    boatTickPacketsReady = false
  }

  function resetBoatCorrectionTracking () {
    boatCorrectionCount = 0
    boatCorrectionWindowStart = 0
    boatPhysicsDisabled = false
    boatPhysicsDisabledLogged = false
  }

  function ensureVehicleRotationDefaults (vehicle) {
    if (!Number.isFinite(vehicle.yaw)) vehicle.yaw = 0
    if (!Number.isFinite(vehicle.pitch)) vehicle.pitch = 0
  }

  function createBoatContext (vehicle) {
    ensureVehicleRotationDefaults(vehicle)
    const entityType = bot.registry.entitiesByName[vehicle.name] ?? bot.registry.entitiesByName.boat
    // (no keys yet: the boat steers by the keys of the tick before)
    const state = BoatState.CREATE_FROM_ENTITY(boatPhysics, vehicle, ControlStateHandler.DEFAULT())
    state.controllingPlayer = true
    boatCtx = EPhysicsCtx.FROM_ENTITY_STATE(boatPhysics, state, entityType)
    boatPhysics.settleStatus(boatCtx, world)
    boatVehicleId = vehicle.id
    resetBoatCorrectionTracking()
    pendingBoatCorrection = null
    boatTickPacketsReady = false
  }

  function ensureBoatContext () {
    const vehicle = bot.vehicle
    if (!vehicle || !isBoatEntity(vehicle)) {
      destroyBoatContext()
      return false
    }
    if (!boatCtx || boatVehicleId !== vehicle.id) {
      createBoatContext(vehicle)
    }
    return true
  }

  function disableBoatPhysicsWithLog (reason) {
    if (boatPhysicsDisabled) return
    boatPhysicsDisabled = true
    if (!boatPhysicsDisabledLogged) {
      console.warn(`[mineflayer] disabled local boat physics: ${reason}`)
      boatPhysicsDisabledLogged = true
    }
  }

  function applyPendingBoatCorrection () {
    if (!pendingBoatCorrection || !boatCtx || !bot.vehicle) return false
    const correction = pendingBoatCorrection
    pendingBoatCorrection = null

    if (correction.kind !== 'vehicle_move') {
      if (BOAT_PHYS_DEBUG) {
        console.log(`[boat phys] ignoring correction kind=${correction.kind}`)
      }
      return false
    }

    const vehicle = bot.vehicle
    const localPos = boatCtx.state.pos
    const serverDx = vehicle.position.x - localPos.x
    const serverDy = vehicle.position.y - localPos.y
    const serverDz = vehicle.position.z - localPos.z
    const horizontalDist = Math.sqrt(serverDx * serverDx + serverDz * serverDz)
    const totalDist = Math.sqrt(serverDx * serverDx + serverDy * serverDy + serverDz * serverDz)

    if (BOAT_PHYS_DEBUG) {
      console.log(
        `[boat phys] correction apply kind=${correction.kind} ` +
        `serverDelta=(${serverDx.toFixed(3)},${serverDy.toFixed(3)},${serverDz.toFixed(3)}) ` +
        `horiz=${horizontalDist.toFixed(3)} total=${totalDist.toFixed(3)}`
      )
    }

    boatCtx.state.rebaseFromEntity(vehicle, {
      replaceVelocity: correction.replaceVelocity === true
    })
    return true
  }

  function syncControlsToBoatState () {
    if (!boatCtx) return
    boatCtx.state.controllingPlayer = true
    boatCtx.state.updateControls(ControlStateHandler.COPY_BOT(bot))
  }

  function clampPassengerYawRelativeToBoat () {
    const vehicle = bot.vehicle
    if (!vehicle) return

    let relativeYaw = bot.entity.yaw - vehicle.yaw
    const fullTurn = Math.PI * 2
    relativeYaw = ((relativeYaw + Math.PI) % fullTurn + fullTurn) % fullTurn - Math.PI
    if (relativeYaw > MAX_BOAT_PASSENGER_YAW_OFFSET) {
      bot.entity.yaw = vehicle.yaw + MAX_BOAT_PASSENGER_YAW_OFFSET
    } else if (relativeYaw < -MAX_BOAT_PASSENGER_YAW_OFFSET) {
      bot.entity.yaw = vehicle.yaw - MAX_BOAT_PASSENGER_YAW_OFFSET
    }
  }

  function sendControlledBoatPackets () {
    const vehicle = bot.vehicle
    if (!vehicle || !boatCtx) return false

    ensureVehicleRotationDefaults(vehicle)

    const x = vehicle.position.x
    const y = vehicle.position.y
    const z = vehicle.position.z
    // (the boat's own float rotation, as ServerboundMoveVehiclePacket takes it: whole turns kept, no -0 pitch)
    const yaw = Math.fround(vehicle.yawDegrees != null ? Number(vehicle.yawDegrees) : conv.toNotchianYaw(vehicle.yaw))
    const pitch = Math.fround(vehicle.pitchDegrees != null ? Number(vehicle.pitchDegrees) : conv.toNotchianPitch(vehicle.pitch)) + 0

    if (![x, y, z, yaw, pitch].every(Number.isFinite)) {
      disableBoatPhysicsWithLog('non-finite vehicle state')
      return false
    }

    sendPacketSteerVehicle()
    // (the vehicle's ground contact goes with it from 1.21.4, ServerboundMoveVehiclePacket.fromEntity)
    bot._client.write('vehicle_move', { x, y, z, yaw, pitch, onGround: !!vehicle.onGround })
    return true
  }

  bot.on('vehicleCorrection', (entity, correction) => {
    if (!canUseLocalBoatPhysics() || !isBoatEntity(entity) || bot.vehicle !== entity) return
    if (!isBoatController()) return

    if (BOAT_PHYS_DEBUG) {
      boatDebugCorrectionCounts[correction.kind] = (boatDebugCorrectionCounts[correction.kind] || 0) + 1
      console.log(
        `[boat phys] correction received kind=${correction.kind} ` +
        `count=${boatDebugCorrectionCounts[correction.kind]}`
      )
    }

    if (correction.kind === 'vehicle_move') {
      const now = performance.now()
      if (now - boatCorrectionWindowStart > BOAT_CORRECTION_WINDOW_MS) {
        boatCorrectionWindowStart = now
        boatCorrectionCount = 0
      }
      boatCorrectionCount++
      if (boatCorrectionCount >= BOAT_CORRECTION_LIMIT) {
        disableBoatPhysicsWithLog(`${BOAT_CORRECTION_LIMIT} server corrections within ${BOAT_CORRECTION_WINDOW_MS}ms`)
      }
    }

    pendingBoatCorrection = correction
  })

  bot.on('vehicleCorrection', (entity, correction) => {
    if (!canUseLocalHorsePhysics() || !isRideableHorseEntity(entity) || bot.vehicle !== entity) return
    if (!isHorseController()) return

    if (correction.kind === 'vehicle_move') {
      const now = performance.now()
      if (now - horseCorrectionWindowStart > HORSE_CORRECTION_WINDOW_MS) {
        horseCorrectionWindowStart = now
        horseCorrectionCount = 0
      }
      horseCorrectionCount++
      if (horseCorrectionCount >= HORSE_CORRECTION_LIMIT) {
        disableHorsePhysicsWithLog(`${HORSE_CORRECTION_LIMIT} server corrections within ${HORSE_CORRECTION_WINDOW_MS}ms`)
      }
    }

    pendingHorseCorrection = correction
  })

  bot.on('mount', () => {
    clearPendingPostDismount()

    const vehicle = bot.vehicle
    if (isBoatControllerCandidate() && !boatCapabilityAvailable) {
      warnMissingBoatCapabilityOnce()
    }
    if (isHorseControllerCandidate() && !horseCapabilityAvailable) {
      warnMissingHorseCapabilityOnce()
    }

    const oldPos = bot.entity.position.clone()
    if (isHorsePhysicsVersion() && isRideableHorseEntity(vehicle)) {
      syncEntityWithHorse()
    } else if (isBoatEntity(vehicle) || isRideableMinecartEntity(vehicle)) {
      syncEntityWithVehicle()
    }
    if (!bot.entity.position.equals(oldPos)) {
      bot.emit('move', oldPos)
    }

    if (isBoatController()) {
      createBoatContext(bot.vehicle)
    }
    if (isHorseController()) {
      createHorseContext(bot.vehicle)
    }
  })

  bot.on('entityGone', (entity) => {
    if (entity.id === boatVehicleId) {
      destroyBoatContext()
    }
    if (entity.id === horseVehicleId) {
      destroyHorseContext()
    }
  })

  bot.on('dismount', (previousVehicle) => {
    destroyBoatContext()
    destroyHorseContext()
    rememberPendingPostDismount(previousVehicle)
    applyPostDismountOffset(previousVehicle)
  })

  bot.on('entityAttributes', (entity) => {
    if (!horseCtx || bot.vehicle !== entity || horseVehicleId !== entity.id) return
    horseCtx.state.updateFromHorseEntity(entity)
  })

  bot.on('entityMoved', (entity) => {
    if (bot.vehicle !== entity) return
    if (!isServerAuthoritativeMinecart(entity)) return

    const oldPos = bot.entity.position.clone()
    syncEntityWithVehicle()

    if (!bot.entity.position.equals(oldPos)) {
      bot.emit('move', oldPos)
    }
  })

  function tickPhysics (now) {
    const timestep = physicsTimestep
    const onVehicle = bot.vehicle && bot.entity.vehicle
    const boatController = onVehicle && isBoatController()
    const horseController = onVehicle && isHorseController()
    let playerTicked = false

    if (boatCtx && !boatController) {
      destroyBoatContext()
    }
    if (horseCtx && !horseController) {
      destroyHorseContext()
    }

    const horsePassengerSync =
      onVehicle &&
      isHorsePhysicsVersion() &&
      isRideableHorseEntity(bot.vehicle)

    // the vehicle ticks before its passenger: a step of its interpolation toward the server's moves
    if (bot.entityInterpolation && bot.vehicle) bot.entityInterpolation.tick(bot.vehicle)

    if (onVehicle && !boatController) {
      if (horsePassengerSync) {
        syncEntityWithHorse()
      } else {
        syncEntityWithVehicle()
      }
    }

    const playerTicks = tickClientLoad()
    // a player outside the loaded chunks does not tick, but the client tick still ends
    if (!playerTicks || bot.blockAt(bot.entity.position) == null) return writeTickEnd()

    // LivingEntity.tickDeath: a dead player keeps moving and sending until its 20th tick removes it
    const removed = isEntityRemoved()
    // LivingEntity.tick (1.14+): a sleeping player looks straight ahead
    if (sleeping) setAngleDegrees(bot, bot.entity.yawDegrees.valueOf(), 0, false)

    bot.emit('physicsTickBegin')

    // Vanilla has the current tick's input settled before movement and packet
    // emission. Keep assisted elytra takeoff control in sync with physics so
    // the movement packet matches the input state Grim sees for that tick.
    advanceElytraTakeoffControlBeforePackets()

    if (lastSentYaw === null) lastSentYaw = bot.entity.yaw
    if (lastSentPitch === null) lastSentPitch = bot.entity.pitch

    if (shouldUsePhysics) {
      const dYaw = deltaYawRadians(bot.entity.yaw, lastSentYaw)
      const dPitch = bot.entity.pitch - lastSentPitch

      const maxDeltaYaw = timestep * bot.physicsSettings.yawSpeed
      const maxDeltaPitch = timestep * bot.physicsSettings.pitchSpeed

      lastSentYaw += math.clamp(-maxDeltaYaw, dYaw, maxDeltaYaw)
      lastSentPitch += math.clamp(-maxDeltaPitch, dPitch, maxDeltaPitch)
    }

    boatTickPacketsReady = false
    horseTickPacketsReady = false

    if (bot.physicsEnabled && shouldUsePhysics && !removed) {
      if (boatController) {
        if (ensureBoatContext()) {
          const hadPendingCorrection = pendingBoatCorrection != null
          const appliedCorrection = applyPendingBoatCorrection()

          if (!boatPhysicsDisabled) {
            // Boat.tick runs before its rider's tick: it steers by the keys LocalPlayer.rideTick gave it the tick before
            // and tells the server its paddles; this tick's keys reach it next tick
            boatPhysics.simulate(boatCtx, world)
            if (boatCtx.state.worldReady) {
              bot._client.write('steer_boat', boatPhysics.getPaddleState(boatCtx.state))
              boatCtx.state.applyToEntity(bot.vehicle)
              boatTickPacketsReady = true
              bot.emit('entityMoved', bot.vehicle)
            }
            syncControlsToBoatState()
          }

          if (BOAT_PHYS_DEBUG) {
            const s = boatCtx.state
            console.log(
              `[boat phys] tick status=${s.status} prev=${s.previousStatus} ` +
              `y=${s.pos.y.toFixed(3)} vel=(${s.vel.x.toFixed(4)},${s.vel.y.toFixed(4)},${s.vel.z.toFixed(4)}) ` +
              `water=${s.waterLevel.toFixed(3)} pending=${hadPendingCorrection} applied=${appliedCorrection}`
            )
          }

          syncEntityWithVehicle()
          clampPassengerYawRelativeToBoat()
        }
      } else if (horseController) {
        if (ensureHorseContext()) {
          applyPendingHorseCorrection()

          if (!horsePhysicsDisabled) {
            syncControlsToHorseState()
            horsePhysics.simulate(horseCtx, world)
            if (horseCtx.state.worldReady) {
              horseCtx.state.applyToEntity(bot.vehicle)
              horseTickPacketsReady = true
              bot.emit('entityMoved', bot.vehicle)
            }
          }

          syncEntityWithHorse()
        }
      } else if (!onVehicle) {
        // the attached rockets boost while they exist (the engine spends a tick of boost per tick)
        if (bot.fireworkRockets > 0) bot.fireworkRocketDuration = 1
        bot.fireworkRocketsBeforePlayer = fireworkRocketsBeforePlayer()
        ectx ??= EPhysicsCtx.FROM_BOT(physics, bot, settings)
        ectx.state.update(bot)

        // 2. Sync physics engine to the interpolated look to satisfy anticheats
        ectx.state.yaw = lastSentYaw
        ectx.state.pitch = lastSentPitch

        Object.assign(ectx, settings.overrides)

        // 3. Save target yaw/pitch before applying physics
        const targetYaw = bot.entity.yaw
        const targetPitch = bot.entity.pitch

        // LocalPlayer.aiStep: a press of jump in the air with an elytra asks the server to start gliding. Since 1.15 the
        // client starts it too (the engine does) and asks when it did; before, it asks when falling and not gliding.
        const s = ectx.state
        const wasFallFlying = s.fallFlying
        const legacyGlideRequest = s.control.jump && !s.prevControl.jump && !s.onGround && s.vel.y < 0 &&
          !wasFallFlying && !s.flying && s.validElytraEquipped

        physics.simulate(ectx, world).apply(bot)
        playerTicked = true

        glideRequested = bot.registry.version['<']('1.15') ? legacyGlideRequest : !wasFallFlying && ectx.state.fallFlying

        // 4. Restore target yaw/pitch so the bot doesn't forget where it's trying to look
        bot.entity.yaw = targetYaw
        bot.entity.pitch = targetPitch
      }

      bot.emit('entityPhysicsTick')
    }

    if (shouldUsePhysics && !removed) updatePosition(now)

    // the other entities tick after the player: a step of their interpolation toward the server's moves
    if (bot.entityInterpolation) {
      for (const entity of Object.values(bot.entities)) {
        if (entity !== bot.entity && entity !== bot.vehicle) bot.entityInterpolation.tick(entity)
      }
    }

    // the moving pistons tick after the player (and after it sent its position) and push it
    // (PistonMovingBlockEntity.tick)
    if (playerTicked && physics.pushByMovingPiston) {
      movingPistons.tick((piston) => physics.pushByMovingPiston(ectx, world, piston))
      ectx.state.apply(bot)
    }

    // move this afterward to sync inputs.
    if (bot.physicsEnabled && shouldUsePhysics) {
      bot.emit('physicsTick')
      bot.emit('physicTick') // Deprecated, only exists to support old plugins. May be removed in the future
    }

    writeTickEnd()
  }

  // Whether the player ticks this client tick (always before 1.21.4)
  function tickClientLoad () {
    if (!waitsForLevel) return true
    if (levelLoad === 'chunk' && isLevelReady()) {
      levelLoad = null
      if (!clientLoaded) {
        bot._client.write('player_loaded', {})
        clientLoaded = true
      }
    }
    // LocalPlayer.tick (1.21.4 - 1.21.10): after 60 ticks of waiting the player ticks anyway
    if (!clientLoaded && loadTimesOutInTicks && clientLoadTimeout > 0) clientLoadTimeout--
    return clientLoaded || (loadTimesOutInTicks && clientLoadTimeout <= 0)
  }

  function isLevelReady () {
    if (loadTimesOutInTime && Date.now() > levelLoadDeadline) return true
    const y = bot.entity.position.y
    if (y < bot.game.minY || y >= bot.game.minY + bot.game.height) return true
    if (bot.game.gameMode === 'spectator' || !bot.isAlive) return true
    return typeof bot.levelLoaded === 'function' ? !!bot.levelLoaded() : bot.blockAt(bot.entity.position) != null
  }

  function startLevelLoad () {
    if (!waitsForLevel) return
    clientLoaded = false
    levelLoad = 'server'
    clientLoadTimeout = 60
    levelLoadDeadline = Date.now() + 30000
  }

  // LivingEntity.onSyncedDataUpdated (1.14+): the sleeping position the server sets puts the player on the bed
  // (setPosToBed: the block's centre, 0.6875 up). The metadata index: 12 before 1.16, 13 on 1.16, 14 since.
  const sleepingPosKey = bot.registry.version['<']('1.16') ? 12 : bot.registry.version['<']('1.17') ? 13 : 14
  let sleeping = false
  bot._client.on('entity_metadata', (packet) => {
    if (!bot.registry.version['>=']('1.14') || packet.entityId !== bot.entity?.id) return
    const entry = packet.metadata.find(entry => entry.key === sleepingPosKey)
    if (!entry) return
    const bed = entry.value
    sleeping = bed != null && typeof bed === 'object'
    if (sleeping) bot.entity.position.set(bed.x + 0.5, Math.fround(bed.y + 0.6875), bed.z + 0.5)
  })

  // LocalPlayer.onGameModeChanged (1.20+): the player list turning the player into a spectator stops its fall
  bot._client.on('player_info', (packet) => {
    if (!bot.registry.version['>=']('1.20') || !packet.action?.update_game_mode) return
    for (const item of packet.data ?? []) {
      const self = item.uuid != null && (item.uuid === bot._client.uuid || item.uuid === bot.player?.uuid)
      if (self && item.gamemode === 3 && bot.game.gameMode !== 'spectator') bot.entity.velocity.y = 0
    }
  })

  // ClientPacketListener.handleRespawn makes a new LocalPlayer, which has sent no position or look yet. From 1.16 it
  // keeps the shift key and sprint states the old one sent (from 1.20.2 only when the server keeps the player's data,
  // flag 2), and from 1.21.2 its last sent input with them.
  // (it faces -180 and stands still unless, from 1.21.2, it keeps the old player's rotation and motion with its data)
  let respawnRotation = [-180, 0]
  let keepsMotion = false
  bot._client.prependListener('respawn', (packet) => {
    const flags = typeof packet.copyMetadata === 'number' ? packet.copyMetadata : packet.copyMetadata ? 3 : 0
    const keepsRotation = bot.registry.version['>=']('1.21.2') && (flags & 2) !== 0 && bot.entity.yawDegrees !== undefined
    respawnRotation = keepsRotation ? [bot.entity.yawDegrees.valueOf(), bot.entity.pitchDegrees.valueOf()] : [-180, 0]
    keepsMotion = keepsRotation
    const keep = bot.registry.version['>=']('1.16') && (bot.registry.version['<']('1.20.2') || (flags & 2) !== 0)
    Object.assign(lastSent, { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, onGround: false, positionReminder: 0 })
    lastSent.flags = { onGround: false, hasHorizontalCollision: false }
    lastUpdated.yaw = 0
    lastUpdated.pitch = 0
    if (!keep) {
      lastSent.sneakState = false
      lastSent.sprintState = false
      lastSent.previousInputState = { forward: false, back: false, left: false, right: false, jump: false, sneak: false, sprint: false }
    }
  })

  bot._client.on('game_state_change', (packet) => {
    const loadStart = packet.reason === 'level_chunks_load_start' || packet.reason === 13
    if (loadStart && levelLoad === 'server') levelLoad = 'chunk'
  })

  // Minecraft.tick ends every client tick with ServerboundClientTickEndPacket (1.21.2+)
  function writeTickEnd () {
    if (bot.registry.isNewerOrEqualTo('1.21.3')) bot._client.write('tick_end', {})
  }

  bot.on('newListener', (name) => {
    if (name === 'physicTick') {
      console.warn('Mineflayer detected that you are using a deprecated event (physicTick)! Please use physicsTick instead.')
    }
  })

  function cleanup () {
    clearInterval(doPhysicsTimer)
    doPhysicsTimer = null
  }

  function sendPacketPosition (position, onGround, hasHorizontalCollision) {
    // Don't send position packets during configuration phase (Velocity support)
    if (bot.inConfigurationPhase) return

    // console.log(`sendPacketPosition: position=${position.toString()} onGround=${onGround} hasHorizontalCollision=${hasHorizontalCollision}`)

    // sends data, no logic
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return
    const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)
    lastSent.x = position.x
    lastSent.y = position.y
    lastSent.z = position.z
    lastSent.onGround = onGround
    lastSent.flags = { onGround, hasHorizontalCollision }
    bot._client.write('position', lastSent)
    bot.emit('move', oldPos)
  }

  function sendPacketLook (yaw, pitch, onGround, hasHorizontalCollision) {
    // Don't send look packets during configuration phase (Velocity support)
    if (bot.inConfigurationPhase) return

    // sends data, no logic
    const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)
    lastSent.yaw = yaw
    lastSent.pitch = pitch
    lastSent.onGround = onGround
    lastSent.flags = { onGround, hasHorizontalCollision }
    bot._client.write('look', lastSent)
    bot.emit('move', oldPos)
  }

  function sendPacketPositionAndLook (position, yaw, pitch, onGround, hasHorizontalCollision = getHorizontalCollision()) {
    // Don't send position_look packets during configuration phase (Velocity support)
    if (bot.inConfigurationPhase) return

    // console.log(`sendPacketPositionAndLook: position=${position.toString()} yaw=${yaw} pitch=${pitch} onGround=${onGround} hasHorizontalCollision=${hasHorizontalCollision}`)
    // sends data, no logic
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return
    const oldPos = new Vec3(lastSent.x, lastSent.y, lastSent.z)
    lastSent.x = position.x
    lastSent.y = position.y
    lastSent.z = position.z
    lastSent.yaw = yaw
    lastSent.pitch = pitch
    lastSent.onGround = onGround
    lastSent.flags = { onGround, hasHorizontalCollision }
    bot._client.write('position_look', lastSent)
    bot.emit('move', oldPos)
  }

  // A position_look answering the server, written as it is: what the bot last sent is left alone.
  function writePositionLookAnswer (position, yaw, pitch) {
    if (bot.inConfigurationPhase) return
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y) || !Number.isFinite(position.z)) return
    const flags = { onGround: false, hasHorizontalCollision: false }
    bot._client.write('position_look', { x: position.x, y: position.y, z: position.z, yaw, pitch, onGround: false, flags })
  }

  function clampVehicleMoveComponent (value) {
    const number = Number.isFinite(value) ? value : 0
    return Math.min(Math.abs(number), MAX_VEHICLE_MOVE_COMPONENT) * Math.sign(number)
  }

  // Input channel only for versions without player_input (< 1.21.3).
  //
  // On 1.21.3+ updatePosition() already sends the full player_input (including
  // jump/shift/sprint) whenever input changes — matching vanilla LocalPlayer. A
  // second, reduced packet from here would clear those flags and the server would
  // keep them cleared until the next controlState change, because
  // lastSent.previousInputState already matches controlState.
  //
  // bot.vehicleMove is an internal one-tick legacy override; it is not supported on
  // 1.21.3+.
  function sendPacketSteerVehicle () {
    const override = bot.vehicleMove
    bot.vehicleMove = null
    if (bot.supportFeature('newPlayerInputPacket')) return

    const forward = override ? override.forward : (controlState.forward ? 1 : controlState.back ? -1 : 0)
    const sideways = override ? override.sideways : (controlState.left ? 1 : controlState.right ? -1 : 0)
    const jump = override ? override.jump : controlState.jump

    bot.moveVehicle(clampVehicleMoveComponent(sideways), clampVehicleMoveComponent(forward), !!jump)
  }

  function sendPacketVehicleMove () {
    sendPacketSteerVehicle()
    // ServerboundMoveVehiclePacket came with 1.9; a 1.8 passenger sends only its look and input
    if (!bot.registry.isNewerOrEqualTo('1.9')) return

    const vehicle = bot.vehicle
    const x = vehicle.position.x
    const y = vehicle.position.y
    const z = vehicle.position.z
    // a ridden horse turns with its rider (AbstractHorse.travel; getRiddenRotation from 1.20.2): the rider's float
    // yaw and half its pitch
    const riddenHorse = isRideableHorseEntity(vehicle)
    const yaw = riddenHorse ? sentYawDegrees() : Math.fround(conv.toNotchianYaw(vehicle.yaw))
    const pitch = riddenHorse ? Math.fround(sentPitchDegrees() * 0.5) : Math.fround(conv.toNotchianPitch(vehicle.pitch))
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return

    // the vehicle's ground contact goes with it from 1.21.4 (ServerboundMoveVehiclePacket.fromEntity)
    bot._client.write('vehicle_move', { x, y, z, yaw, pitch, onGround: !!vehicle.onGround })
  }

  // How many attached rockets the client ticks before the player, boosting before its move. 1.14 - 1.16 tick the
  // entities of a fastutil Int2ObjectOpenHashMap (32 slots for a few entities, linear probing) from the last slot down,
  // so a rocket whose id lands in a higher slot than the player's goes first; before 1.14 the entity list and since
  // 1.17 EntityTickList keep the order the entities came in, the player first.
  function fireworkRocketsBeforePlayer () {
    const rockets = [...(bot._attachedFireworkRockets ?? [])]
    if (rockets.length === 0 || bot.registry.version['<']('1.14') || bot.registry.version['>=']('1.17')) return 0
    let slots = 32
    while (Object.keys(bot.entities).length >= slots * 0.75) slots *= 2
    const taken = new Set()
    const slotOf = id => {
      const h = Math.imul(id, 0x9E3779B9 | 0)
      let slot = (h ^ (h >>> 16)) & (slots - 1)
      while (taken.has(slot)) slot = (slot + 1) & (slots - 1)
      taken.add(slot)
      return slot
    }
    const playerSlot = slotOf(bot.entity.id)
    return rockets.filter(id => slotOf(id) > playerSlot).length
  }

  // LocalPlayer.sendPosition sends the rotation as the float degrees the player holds (getYRot, getXRot): never wrapped
  // to a turn, a pitch of 0 never -0. Once the sent look has reached the entity's, its degrees go as they are; the
  // radians are converted only while the look is still turning towards them.
  function sentYawDegrees () {
    const degrees = bot.entity.yawDegrees
    if (degrees !== undefined && lastSentYaw === bot.entity.yaw && conv.fromNotchianYaw(degrees) === lastSentYaw) return degrees.valueOf()
    return Math.fround(conv.toNotchianYaw(lastSentYaw))
  }

  function sentPitchDegrees () {
    const degrees = bot.entity.pitchDegrees
    if (degrees !== undefined && lastSentPitch === bot.entity.pitch && conv.fromNotchianPitch(degrees) === lastSentPitch) return degrees.valueOf()
    return Math.fround(conv.toNotchianPitch(lastSentPitch))
  }

  function isEntityRemoved () {
    const dead = entityHealth != null ? entityHealth <= 0 : bot.isAlive === false
    if (!dead) deadTicks = 0
    if (dead && deadTicks <= 20) deadTicks++
    return deadTicks > 20
  }

  // LivingEntity.getHealth reads the entity data the server syncs, which the health update (setHealth) and the
  // player's entity metadata both set: the metadata can bring the death a tick before the health update.
  let entityHealth = null
  const healthKey = bot.registry.version['<']('1.10') ? 6 : bot.registry.version['<']('1.14') ? 7 : bot.registry.version['<']('1.17') ? 8 : 9
  bot._client.on('update_health', (packet) => { entityHealth = packet.health })
  bot._client.on('entity_metadata', (packet) => {
    if (packet.entityId !== bot.entity?.id) return
    const health = packet.metadata.find(entry => entry.key === healthKey)?.value
    if (typeof health === 'number') entityHealth = health
  })

  function updatePosition (now) {
    // Don't send position with invalid coordinates (NaN after death)
    if (!Number.isFinite(bot.entity.position.x)) return

    // Don't send any position packets during configuration phase (Velocity support)
    if (bot.inConfigurationPhase) return

    const forward = (controlState.forward ? 1 : 0) - (controlState.back ? 1 : 0)
    const isSprintingApplicable = forward > 0 && !controlState.sneak && !bot.entity.isInWater && !bot.entity.isInLava
    const fallbackSprint = isSprintingApplicable && controlState.sprint
    const resolvedSprint = ectx?.state?.sprinting ?? bot.entity.sprinting
    const actualSprint = typeof resolvedSprint === 'boolean' ? resolvedSprint : fallbackSprint
    const isJumpRisingEdge = controlState.jump && !lastSent.previousInputState.jump

    // Vanilla starts fall-flying during aiStep(), before the packet send phase
    // for shift/input/sprint/movement. Grim's Post check also expects the
    // elytra entity_action not to trail behind a movement packet.
    startFallFlyingSent = false
    tryStartPendingElytraFly(isJumpRisingEdge)
    if (glideRequested && !startFallFlyingSent) {
      bot._client.write('entity_action', { entityId: bot.entity.id, actionId: 'start_fall_flying', jumpBoost: 0 })
    }
    glideRequested = false

    const sendShiftKeyState = () => {
      if (lastSent.sneakState === controlState.sneak) return
      // from 1.21.6 sneaking goes in player_input only; the player command lost its sneak actions
      if (!sneakIsInputOnly) {
        bot._client.write('entity_action', {
          entityId: bot.entity.id,
          actionId: controlState.sneak ? 'start_sneaking' : 'stop_sneaking',
          jumpBoost: 0
        })
      }
      lastSent.sneakState = controlState.sneak
    }
    if (shiftKeySentFirst) sendShiftKeyState()

    // the tick's input as the client sends it: the jump auto-jump presses goes with the keys (KeyboardInput.tick)
    const input = bot.autoJumping ? { ...controlState, jump: true } : controlState
    if (bot.supportFeature('newPlayerInputPacket') &&
        !checkInputEquality(lastSent.previousInputState, input)) {
      lastSent.previousInputState = cloneInput(input)
      bot._client.write('player_input', {
        inputs: {
          forward: input.forward,
          backward: input.back,
          left: input.left,
          right: input.right,
          jump: input.jump,
          shift: input.sneak,
          sprint: input.sprint
        }
      })
    }

    if (lastSent.sprintState !== actualSprint) {
      bot._client.write('entity_action', {
        entityId: bot.entity.id,
        actionId: actualSprint ? 'start_sprinting' : 'stop_sprinting',
        jumpBoost: 0
      })
      lastSent.sprintState = actualSprint
    }
    if (!shiftKeySentFirst) sendShiftKeyState()

    const yaw = sentYawDegrees()
    const pitch = sentPitchDegrees()
    const position = bot.entity.position
    const onGround = bot.entity.onGround
    const hasHorizontalCollision = getHorizontalCollision()

    const dx = position.x - lastSent.x
    const dy = position.y - lastSent.y
    const dz = position.z - lastSent.z
    if (positionReminderCountsFirst) lastSent.positionReminder++
    const positionUpdated =
      (dx * dx + dy * dy + dz * dz > MIN_DELTA_DIST_SQUARED) ||
      lastSent.positionReminder >= POSITION_REMINDER_TICKS
    if (!positionReminderCountsFirst) lastSent.positionReminder++

    const lookUpdated = lastUpdated.yaw !== yaw || lastUpdated.pitch !== pitch

    const onVehicle = !!bot.entity.vehicle
    const onBoat = isBoatEntity(bot.vehicle)
    const boatController = onVehicle && isBoatController()
    const horseController = onVehicle && isHorseController()
    if (needsLegacyBoatPackets()) {
      bot._client.write('steer_boat', {
        leftPaddle: bot.controlState.left || bot.controlState.forward || bot.controlState.back,
        rightPaddle: bot.controlState.right || bot.controlState.forward || bot.controlState.back
      })
    }

    let sendLook = false
    if (onVehicle) {
      sendLook = true
    } else if (positionUpdated && lookUpdated) {
      sendPacketPositionAndLook(position, yaw, pitch, onGround, hasHorizontalCollision)
      lastSent.positionReminder = 0
    } else if (positionUpdated) {
      sendPacketPosition(position, onGround, hasHorizontalCollision)
      lastSent.positionReminder = 0
    } else if (lookUpdated) {
      sendLook = true
    } else if (positionUpdateSentEveryTick || onGround !== lastSent.onGround || hasHorizontalCollision !== lastSent.flags.hasHorizontalCollision) {
      // (before 1.21.3 the packet has an onGround field, from 1.21.3 flags)
      bot._client.write('flying', {
        onGround,
        flags: { onGround, hasHorizontalCollision }
      })
      lastSent.flags = { onGround, hasHorizontalCollision }
    }

    if (sendLook) {
      sendPacketLook(yaw, pitch, onGround, hasHorizontalCollision)
    }

    if (onVehicle) {
      if (boatController) {
        if (boatTickPacketsReady) {
          sendControlledBoatPackets()
        }
      } else if (horseController) {
        if (horseTickPacketsReady) {
          sendControlledHorsePackets()
        }
      } else if (isServerAuthoritativeMinecart(bot.vehicle)) {
        sendPacketSteerVehicle()
      } else if (!canUseLocalBoatPhysics() || !onBoat) {
        sendPacketVehicleMove()
      }
    }

    if (lookUpdated) {
      lastUpdated.yaw = yaw
      lastUpdated.pitch = pitch
    }

    lastSent.onGround = bot.entity.onGround
    advanceElytraTakeoffControlAfterPackets()
    bot.physicsEngineCtx = ectx
  }

  bot.physicsEngine = physics
  bot.physicsSettings = settings
  bot.physicsCtx = ectx

  const obj = {}
  Object.keys(bot.physicsEngine).forEach((key) => {
    Object.defineProperty(obj, key, {
      get () {
        return bot.physicsEngine[key]
      },
      set (value) {
        bot.physicsEngine[key] = value
        return value
      }
    })
  })

  Object.keys(bot.physicsSettings).forEach((key) => {
    Object.defineProperty(obj, key, {
      get () {
        return bot.physicsSettings[key]
      },
      set (value) {
        bot.physicsSettings[key] = value
        return value
      }
    })
  })

  Object.defineProperty(obj, 'physicsIntervalMs', {
    enumerable: true,
    get () {
      return physicsIntervalMs
    },
    set (value) {
      if (!Number.isFinite(value) || value <= 0) {
        throw new RangeError('physics.physicsIntervalMs must be a finite number greater than 0')
      }
      physicsIntervalMs = value
      physicsTimestep = value / 1000
      restartPhysicsTimer()
      return value
    }
  })

  obj.simulatePlayer = function (oldState, world) {
    const eType = bot.registry.entitiesByName.player ?? bot.registry.entitiesByName['minecraft:player']

    // for versions 1.9 and below, this doesn't exist.
    // I provide a default if this value is undefined, so this is fine either way.
    // if (!eType) throw new Error('Player entity type not found in registry')

    const state = convertPlayerState(bot, oldState, physics)

    const ectx = EPhysicsCtx.FROM_ENTITY_STATE(
      physics,
      state,
      eType,
      settings
    )

    Object.assign(ectx, settings.overrides)

    physics.simulate(ectx, world)
    applyToPlayerState(state, oldState)
  }

  bot.physics = obj
  bot.physicsWorld = world

  function getEffectLevel (mcData, effectName, effects) {
    const effectDescriptor = mcData.effectsByName[effectName]
    if (!effectDescriptor) return 0
    const effectInfo = effects[effectDescriptor.id]
    if (!effectInfo) return 0
    return effectInfo.amplifier + 1
  }

  function getElytraFlyPreflightError () {
    if (bot.entity.fallFlying) {
      return 'Already elytra flying'
    } else if (bot.entity.onClimbable) {
      return 'Unable to elytra fly while on climbable'
    } else if (bot.entity.vehicle) {
      return 'Unable to elytra fly while in vehicle'
    } else if (bot.entity.isInWater) {
      return 'Unable to elytra fly while in water'
    }

    const mcData = require('minecraft-data')(bot.version)
    if (getEffectLevel(mcData, 'Levitation', bot.entity.effects) > 0) {
      return 'Unable to elytra fly with levitation effect'
    }

    const torsoSlot = bot.getEquipmentDestSlot('torso')
    const item = bot.inventory.slots[torsoSlot]
    if (item == null || item.name !== 'elytra') {
      return 'Elytra must be equip to start flying'
    }

    return null
  }

  function getPendingElytraFlyPreflightError (force = false) {
    const preflightError = getElytraFlyPreflightError()
    if (force && preflightError === 'Already elytra flying') return null
    if (preflightError !== 'Already elytra flying') return preflightError

    // The local physics engine can flip fallFlying on the same rising-edge jump
    // that should also emit START_FLYING_WITH_ELYTRA. Treat that as the vanilla
    // local-state transition for this pending request rather than rejecting our
    // own packet before it is written.
    if (pendingElytraFly && !speculativeElytraFly && bot.entity._pendingElytraFlightConfirmation !== true) {
      return null
    }

    return preflightError
  }

  function tryStartPendingElytraFly (isJumpRisingEdge) {
    if (!pendingElytraFly || elytraFlyTask.done) return

    const preflightError = getPendingElytraFlyPreflightError(forceElytraFly)
    if (preflightError != null) {
      clearPendingElytraFly(new Error(preflightError))
      return
    }

    if (!forceElytraFly) {
      if (bot.entity.onGround || lastSent.onGround) return
      if (!isJumpRisingEdge) return
    }

    // Intentional deviation from vanilla: vanilla only emits
    // START_FLYING_WITH_ELYTRA after the off-ground jump transition in
    // LocalPlayer/LivingEntity. The documented mineflayer force option is used
    // here to bypass that packet-send gate as well, so a forced rebounce sends
    // the packet immediately instead of waiting for a new airborne jump edge.
    // This is specifically for anticheat experimentation where preserving
    // continuous local fall-flying state is preferred over vanilla timing.

    bot._client.write('entity_action', {
      entityId: bot.entity.id,
      actionId: 'start_fall_flying',
      jumpBoost: 0
    })
    startFallFlyingSent = true
    if (resolveForcedElytraFlyImmediately) {
      clearPendingElytraFly()
      return
    }

    setLocalElytraFlyState(true)
    speculativeElytraFly = true
    pendingElytraFly = false
    forceElytraFly = false
    setPendingElytraFlyRequestState(false)
  }

  function setLocalElytraFlyState (enabled) {
    bot.entity.elytraFlying = enabled
    bot.entity.fallFlying = enabled
    bot.entity._pendingElytraFlightConfirmation = enabled

    if (ectx?.state != null) {
      if ('elytraFlying' in ectx.state) ectx.state.elytraFlying = enabled
      if ('fallFlying' in ectx.state) ectx.state.fallFlying = enabled
    }
  }

  function clearPendingElytraFly (err) {
    clearElytraTakeoffControl()

    pendingElytraFly = false
    forceElytraFly = false
    resolveForcedElytraFlyImmediately = false
    setPendingElytraFlyRequestState(false)
    if (elytraFlyTimeout != null) {
      clearTimeout(elytraFlyTimeout)
      elytraFlyTimeout = null
    }

    if (err != null && speculativeElytraFly) {
      setLocalElytraFlyState(false)
    }
    speculativeElytraFly = false

    if (err != null) {
      elytraFlyTask.cancel(err)
    } else {
      elytraFlyTask.finish()
    }

    elytraFlyTask = createDoneTask()
  }

  function armPendingElytraFlyTimeout (assistTakeoff) {
    if (elytraFlyTimeout != null) {
      clearTimeout(elytraFlyTimeout)
    }

    elytraFlyTimeout = setTimeout(() => {
      clearPendingElytraFly(new Error('Timed out waiting for elytra flight to start'))
    }, assistTakeoff ? 2500 : 1500)
  }

  bot.elytraFly = async (options = {}) => {
    const normalizedOptions = typeof options === 'boolean' ? { assistTakeoff: options } : options
    const {
      assistTakeoff = false,
      force = false
    } = normalizedOptions

    if (!elytraFlyTask.done) {
      // Vanilla re-evaluates jump/input state each tick before movement and
      // packet emission; see LocalPlayer.tick()/serverAiStep() and
      // LivingEntity.travel() in the 1.21.4 client. If a previous mineflayer
      // elytra request is still pending, let a forced retry refresh that
      // pending controller instead of coalescing it away until timeout.
      // Anticheat expects a renewed grounded takeoff sequence to emit the
      // matching START_FLYING_WITH_ELYTRA packet rather than preserving a
      // stale pending request with outdated jump state.
      if (force && pendingElytraFly) {
        const preflightError = getElytraFlyPreflightError()
        if (preflightError != null && preflightError !== 'Already elytra flying') {
          clearPendingElytraFly(new Error(preflightError))
        } else {
          forceElytraFly = true
          resolveForcedElytraFlyImmediately = preflightError === 'Already elytra flying'
          clearElytraTakeoffControl()
          startElytraTakeoffControl(assistTakeoff)
          setPendingElytraFlyRequestState(true)
          armPendingElytraFlyTimeout(assistTakeoff)
        }
      }

      return await elytraFlyTask.promise
    }

    const preflightError = getElytraFlyPreflightError()
    if (preflightError != null && !(force && preflightError === 'Already elytra flying')) {
      throw new Error(preflightError)
    }

    elytraFlyTask = createTask()
    pendingElytraFly = true
    forceElytraFly = force
    resolveForcedElytraFlyImmediately = force && preflightError === 'Already elytra flying'
    setPendingElytraFlyRequestState(true)
    startElytraTakeoffControl(assistTakeoff)
    armPendingElytraFlyTimeout(assistTakeoff)

    return await elytraFlyTask.promise
  }

  bot.spoofControlState = (control, state) => {
    controlState[control] = state
  }

  bot.setControlState = (control, state) => {
    if (control === 'sneak' && state === true && bot.vehicle) {
      bot.dismount()
      return
    }

    assert.ok(control in controlState, `invalid control: ${control}`)
    assert.ok(typeof state === 'boolean', `invalid state: ${state}`)
    if (control === 'jump' && isElytraTakeoffControlActive()) return
    if (controlState[control] === state) return

    controlState[control] = state
    if (control === 'jump' && state) {
      bot.jumpQueued = true
    }
  }

  bot.getControlState = (control) => {
    assert.ok(control in controlState, `invalid control: ${control}`)
    return controlState[control]
  }

  bot.clearControlStates = () => {
    for (const control in controlState) {
      bot.setControlState(control, false)
    }
  }

  bot.controlState = {}
  for (const control of Object.keys(controlState)) {
    Object.defineProperty(bot.controlState, control, {
      get () {
        return controlState[control]
      },
      set (state) {
        bot.setControlState(control, state)
        return state
      }
    })
  }

  let lookingTask = createDoneTask()
  let targetYaw = null
  let targetPitch = null

  bot.on('physicsTick', () => {
    if (lookingTask.done || targetYaw == null || targetPitch == null) return

    const currentYawDeg = new JavaFloat(conv.toNotchianYaw(bot.entity.yaw))
    const currentPitchDeg = new JavaFloat(conv.toNotchianPitch(bot.entity.pitch))

    const deltaYaw = deltaYawDegrees(targetYaw, currentYawDeg).valueOf()
    const deltaPitch = targetPitch.subtract(currentPitchDeg).valueOf()

    if (Math.abs(deltaYaw) < 0.1 && Math.abs(deltaPitch) < 0.1) {
      lookingTask.finish()
      return
    }

    const yawChange = math.clamp(-bot.physicsSettings.yawSpeed / 20, deltaYaw, bot.physicsSettings.yawSpeed / 20)
    const pitchChange = math.clamp(-bot.physicsSettings.pitchSpeed / 20, deltaPitch, bot.physicsSettings.pitchSpeed / 20)

    setAngleDegrees(
      bot,
      currentYawDeg.valueOf() + yawChange,
      currentPitchDeg.valueOf() + pitchChange,
      true
    )
  })

  bot._client.on('explosion', explosion => {
    if (bot.physicsEnabled && bot.game.gameMode !== 'creative') {
      if (explosion.playerKnockback) {
        bot.entity.velocity.x += explosion.playerKnockback.x
        bot.entity.velocity.y += explosion.playerKnockback.y
        bot.entity.velocity.z += explosion.playerKnockback.z
      }
      if ('playerMotionX' in explosion) {
        bot.entity.velocity.x += explosion.playerMotionX
        bot.entity.velocity.y += explosion.playerMotionY
        bot.entity.velocity.z += explosion.playerMotionZ
      }
    }
  })

  bot.look = async (yaw, pitch, force) => {
    if (!lookingTask.done) {
      lookingTask.finish()
      targetYaw = null
      targetPitch = null
    }

    const yawNotchian = conv.toNotchianYaw(yaw)
    const pitchNotchian = conv.toNotchianPitch(pitch)

    if (force) {
      setAngleDegrees(bot, yawNotchian, pitchNotchian, true)
      lastSentYaw = bot.entity.yaw
      lastSentPitch = bot.entity.pitch
      return
    }

    lookingTask = createTask()
    targetYaw = new JavaFloat(yawNotchian)
    targetPitch = new JavaFloat(pitchNotchian)
    return await lookingTask.promise
  }

  bot.lookAt = async (point, force) => {
    const delta = point.minus(bot.entity.position.offset(0, bot.entity.eyeHeight, 0))
    const yaw = Math.atan2(-delta.x, -delta.z)
    const groundDistance = Math.sqrt(delta.x * delta.x + delta.z * delta.z)
    const pitch = Math.atan2(delta.y, groundDistance)
    await bot.look(yaw, pitch, force)
  }

  // Entity.refreshDimensions: the bot's own pose set from synced entity data refits the box it keeps (1.14 - 1.16)
  const poseSerializer = bot.supportFeature('entityMetadataHasLong') ? 19 : 18
  bot._client.on('entity_metadata', (packet) => {
    if (!ectx || packet.entityId !== bot.entity?.id) return
    if (packet.metadata.some(entry => entry.type === poseSerializer)) physics.refreshDimensions(ectx.state)
  })

  bot._client.on('player_rotation', (packet) => {
    const yaw = (packet.relativeYaw ? bot.entity.yawDegrees.valueOf() : 0) + packet.yaw
    const pitch = (packet.relativePitch ? bot.entity.pitchDegrees.valueOf() : 0) + packet.pitch
    setAngleDegrees(bot, yaw, pitch, false)
    lastSentYaw = bot.entity.yaw
    lastSentPitch = bot.entity.pitch
    // ClientPacketListener.handleRotatePlayer answers with the rotation it set, not on the ground
    if (bot.inConfigurationPhase) return
    const flags = { onGround: false, hasHorizontalCollision: false }
    bot._client.write('look', { yaw: bot.entity.yawDegrees.valueOf(), pitch: bot.entity.pitchDegrees.valueOf(), onGround: false, flags })
  })

  // player position and look (clientbound)
  bot._client.on('position', (packet) => {
    const shouldReapplyPostDismountOffset = packet.dismountVehicle === true

    if (packet.dismountVehicle === true && bot.vehicle) {
      const previousVehicle = bot.vehicle
      bot.vehicle = null
      delete bot.entity.vehicle
      destroyBoatContext()
      destroyHorseContext()
      bot.emit('dismount', previousVehicle)
    }

    bot.entity.height = 1.8

    const vel = bot.entity.velocity
    const pos = bot.entity.position
    let newYaw, newPitch

    // from 1.21.2 a passenger keeps its position and rotation (ClientPacketListener.handleMovePlayer), only answering
    if (bot.registry.version['>=']('1.21.2') && bot.vehicle) {
      newYaw = typeof bot.entity.yawDegrees !== 'undefined' ? bot.entity.yawDegrees.valueOf() : conv.toNotchianYaw(bot.entity.yaw)
      newPitch = typeof bot.entity.pitchDegrees !== 'undefined' ? bot.entity.pitchDegrees.valueOf() : conv.toNotchianPitch(bot.entity.pitch)
    } else if (typeof packet.flags === 'object') {
      if (packet.flags.dx !== undefined) {
        // 1.21.2+ (PositionMoveRotation.calculateAbsolute): the motion is kept by its own relative flags, plus the
        // packet's (read as 0 when a packet was written without them)
        const delta = (value) => Number.isFinite(value) ? value : 0
        vel.set(
          (packet.flags.dx ? vel.x : 0) + delta(packet.dx),
          (packet.flags.dy ? vel.y : 0) + delta(packet.dy),
          (packet.flags.dz ? vel.z : 0) + delta(packet.dz)
        )
      } else {
        vel.set(
          packet.flags.x ? vel.x : 0,
          packet.flags.y ? vel.y : 0,
          packet.flags.z ? vel.z : 0
        )
      }
      pos.set(
        packet.flags.x ? (pos.x + packet.x) : packet.x,
        packet.flags.y ? (pos.y + packet.y) : packet.y,
        packet.flags.z ? (pos.z + packet.z) : packet.z
      )

      const currentYaw = typeof bot.entity.yawDegrees !== 'undefined'
        ? bot.entity.yawDegrees.valueOf()
        : conv.toNotchianYaw(bot.entity.yaw)
      const currentPitch = typeof bot.entity.pitchDegrees !== 'undefined'
        ? bot.entity.pitchDegrees.valueOf()
        : conv.toNotchianPitch(bot.entity.pitch)

      newYaw = (packet.flags.yaw ? currentYaw : 0) + packet.yaw
      newPitch = (packet.flags.pitch ? currentPitch : 0) + packet.pitch
    } else {
      vel.set(
        packet.flags & 1 ? vel.x : 0,
        packet.flags & 2 ? vel.y : 0,
        packet.flags & 4 ? vel.z : 0
      )
      pos.set(
        packet.flags & 1 ? (pos.x + packet.x) : packet.x,
        packet.flags & 2 ? (pos.y + packet.y) : packet.y,
        packet.flags & 4 ? (pos.z + packet.z) : packet.z
      )

      const currentYaw = typeof bot.entity.yawDegrees !== 'undefined'
        ? bot.entity.yawDegrees.valueOf()
        : conv.toNotchianYaw(bot.entity.yaw)
      const currentPitch = typeof bot.entity.pitchDegrees !== 'undefined'
        ? bot.entity.pitchDegrees.valueOf()
        : conv.toNotchianPitch(bot.entity.pitch)

      newYaw = (packet.flags & 8 ? currentYaw : 0) + packet.yaw
      newPitch = (packet.flags & 16 ? currentPitch : 0) + packet.pitch
    }

    setAngleDegrees(bot, newYaw, newPitch, false)
    bot.entity.onGround = false

    // ClientPacketListener.handleMovePlayer answers straight on the connection: a position_look of where it is now,
    // not on the ground, without changing the last position LocalPlayer sent (1.21.2 - 1.21.3 send it before the
    // teleport confirm).
    const answerFirst = bot.registry.version['>=']('1.21.2') && bot.registry.version['<']('1.21.4')
    if (answerFirst) writePositionLookAnswer(pos, newYaw, newPitch)
    if (bot.supportFeature('teleportUsesOwnPacket')) {
      bot._client.write('teleport_confirm', { teleportId: packet.teleportId })
    }

    if (!answerFirst) writePositionLookAnswer(pos, newYaw, newPitch)

    if (shouldReapplyPostDismountOffset && bot.vehicle == null && isPendingPostDismountValid()) {
      const vehicle = pendingPostDismountVehicle
      const packetStillOnBoat = vehicle?.name === 'boat' &&
        !isOutsideHorizontalEntityAabb(pos.x, pos.z, vehicle)
      if (packetStillOnBoat) {
        applyPostDismountOffset(vehicle)
      }
    }

    shouldUsePhysics = true
    bot.jumpTicks = 0
    lastSentYaw = bot.entity.yaw
    lastSentPitch = bot.entity.pitch

    bot.emit('forcedMove')
  })

  bot.on('entityElytraState', (entity, elytraFlying) => {
    if (entity.id !== bot.entity?.id || elytraFlyTask.done) return
    if (elytraFlying) {
      clearPendingElytraFly()
    }
  })

  bot.waitForTicks = async function (ticks, tickBegin = false) {
    if (ticks <= 0) return
    const eventName = tickBegin ? 'physicsTickBegin' : 'physicsTick'
    await new Promise((resolve) => {
      const tickListener = () => {
        ticks--
        if (ticks === 0) {
          bot.removeListener(eventName, tickListener)
          resolve()
        }
      }

      bot.on(eventName, tickListener)
    })
  }

  // a client that boards a vehicle keeps ticking and sending (LocalPlayer.tick: its look, input and the vehicle's move)
  bot.on('mount', () => {
    shouldUsePhysics = true
  })
  bot.on('death', () => {
    destroyBoatContext()
    destroyHorseContext()
  })
  bot.on('respawn', () => {
    shouldUsePhysics = false
    startLevelLoad()
    destroyBoatContext()
    destroyHorseContext()
  })
  bot.on('login', () => {
    shouldUsePhysics = false
    startLevelLoad()
    movingPistons.clear()
    destroyBoatContext()
    destroyHorseContext()
  })

  function forceResetControls () {
    elytraTakeoffControl = null
    setPendingElytraFlyRequestState(false)
    for (const control in controlState) {
      controlState[control] = false
    }
  }

  bot.on('respawn', () => {
    setAngleDegrees(bot, ...respawnRotation, false)
    if (!keepsMotion) bot.entity.velocity.set(0, 0, 0)
    shouldUsePhysics = false
    forceResetControls()
    clearPendingElytraFly(new Error('Elytra flight cancelled due to respawn'))
  })

  bot.on('login', () => {
    bot.entity.yawDegrees = new JavaFloat(0)
    bot.entity.pitchDegrees = new JavaFloat(0)
    shouldUsePhysics = false
    forceResetControls()
    bot.entity._pendingElytraFlightConfirmation = false

    lastSent = {
      x: 0,
      y: 0,
      z: 0,
      yaw: 0,
      pitch: 0,
      onGround: false,
      positionReminder: 0,
      flags: { onGround: false, hasHorizontalCollision: false },
      sprintState: false,
      sneakState: false,
      previousInputState: cloneInput(controlState)
    }

    bot._lastSent = lastSent
    lastSentYaw = null
    lastSentPitch = null
    lastUpdated.yaw = 0
    lastUpdated.pitch = 0
    clearPendingElytraFly(new Error('Elytra flight cancelled due to login'))

    if (doPhysicsTimer === null && !physicsManual) {
      lastPhysicsFrameTime = performance.now()
      doPhysicsTimer = setInterval(doPhysics, physicsIntervalMs)
    }
  })

  // With the physicsManual option no timer runs the ticks: the caller runs each one (a replay, a test).
  bot.physicsTick = () => tickPhysics(performance.now())

  bot.on('end', () => {
    clearPendingElytraFly(new Error('Elytra flight cancelled due to disconnect'))
    cleanup()
  })

  bot._boatPhysics = {
    getCtx () { return boatCtx },
    isDisabled () { return boatPhysicsDisabled },
    getStatus () { return boatCtx?.state?.status ?? null },
    getPaddleState () {
      return boatCtx && boatPhysics ? boatPhysics.getPaddleState(boatCtx.state) : null
    }
  }

  bot._horsePhysics = {
    getCtx () { return horseCtx },
    isDisabled () { return horsePhysicsDisabled }
  }
}

module.exports = inject
