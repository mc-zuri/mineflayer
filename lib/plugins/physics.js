const { Vec3 } = require('vec3')
const assert = require('assert')
const conv = require('../conversions')
const math = require('../math')
const { performance } = require('perf_hooks')
const { createDoneTask, createTask } = require('../promise_utils')
const physicsUtil = require('@nxg-org/mineflayer-physics-util')
const { horseFlagsIndex, horseSaddleFlag, horseStandingBit } = require('../horse')
const { entityDataKeys } = require('../entityData')
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
  RiddenMobPhysics,
  RiddenMobState,
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
const HORSE_PHYSICS_VERSION = '1.17.1'
const BOAT_CORRECTION_LIMIT = 3
const BOAT_CORRECTION_WINDOW_MS = 1000
const HORSE_CORRECTION_LIMIT = 3
const HORSE_CORRECTION_WINDOW_MS = 1000
const BOAT_PHYS_DEBUG = !!process.env.BOAT_PHYS_DEBUG
const MAX_VEHICLE_MOVE_COMPONENT = 0.9800000190734863
const RIDEABLE_MINECART_ENTITY_NAMES = new Set([
  'MinecartRideable', // 1.8 - 1.10
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

function isRideableMinecartEntity (entity) {
  return entity != null && RIDEABLE_MINECART_ENTITY_NAMES.has(entity.name)
}

function isBoatEntity (entity) {
  const name = entity?.name?.toLowerCase()
  if (!name) return false
  return name === 'boat' || name === 'chest_boat' || name.endsWith('_boat') || name.endsWith('_raft')
}

// Bamboo rafts became a separate entity type in 1.21.2. Before that, a raft was
// a 'boat' entity of the bamboo type (its "type" data: isRaft in the plugin).
function isRaftEntity (entity) {
  const name = entity?.name?.toLowerCase()
  return typeof name === 'string' && name.endsWith('_raft')
}

function isRideableHorseEntity (entity) {
  return entity != null && RIDEABLE_HORSE_ENTITY_NAMES.has(entity.name)
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
  // the blocks a rider's own move and push meet: those the world knows the shapes of
  const riderWorld = { getBlock: (pos) => { const block = bot.blockAt(pos, false); return block?.shapes ? block : null } }

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
  bot.on('blockUpdate', (oldBlock, newBlock) => {
    const { x, y, z } = newBlock?.position ?? oldBlock?.position ?? {}
    if (x !== undefined) movingPistons.blockChanged([x, y, z], newBlock?.name)
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

  // ServerboundPlayerAbilitiesPacket: since 1.16 only the flying bit; before, every ability with the flying and
  // walking speeds the server last sent
  function sendAbilities (flying) {
    const abilities = bot.entity.abilities ?? {}
    const flags = bot.registry.version['>=']('1.16')
      ? (flying ? 2 : 0)
      : (bot.entity.isInvulnerable ? 1 : 0) | (flying ? 2 : 0) | (bot.entity.canFly ? 4 : 0) | (bot.entity.canInstantlyBuild ? 8 : 0)
    bot._client.write('abilities', { flags, flyingSpeed: abilities.flyingSpeed ?? 0.05, walkingSpeed: abilities.walkingSpeed ?? 0.1 })
    bot.entity.isFlying = flying
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
  // 1.20.2 - 1.20.4: how far below its height a horse seats its rider (getPassengersRidingOffsetY): a donkey or mule
  // 0.3875F, a skeleton or zombie horse 0.28125F (SkeletonHorse.getPassengerAttachmentPoint, ZombieHorse), else 0.15625F
  function legacyHorseAttachmentDrop (horse) {
    if (horse.name === 'donkey' || horse.name === 'mule') return 0.3875
    if (horse.name === 'skeleton_horse' || horse.name === 'zombie_horse') return 0.28125
    return 0.15625
  }

  function getHorsePassengerFeetOffsetY (horse) {
    const f32 = Math.fround
    const height = f32(horse.height ?? 1.6)
    const name = vehicleName(horse)
    if (bot.registry.isNewerOrEqualTo('1.20.5')) {
      return f32(HORSE_PASSENGER_ATTACHMENT_Y[horse.name] ?? f32(height - f32(0.15625))) - 0.6
    }
    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      return f32(height - f32(legacyHorseAttachmentDrop(horse))) + f32(-0.6)
    }
    // (a donkey or mule 0.25 lower, a skeleton horse 0.1875, from 1.9: 1.8's EntityHorse seats every variant alike;
    // 1.9 - 1.10's only the donkey of the two, EntityHorse.getMountedYOffset, AbstractChestedHorse's both from 1.11)
    let variantOffset = 0
    const lowered = name === 'donkey' || (name === 'mule' && bot.registry.isNewerOrEqualTo('1.11'))
    if (lowered && bot.registry.isNewerOrEqualTo('1.9')) {
      variantOffset = 0.25
    } else if (name === 'skeleton_horse' && bot.registry.isNewerOrEqualTo('1.9')) {
      variantOffset = 0.1875
    }
    return height * 0.75 - variantOffset - 0.35
  }

  /**
   * Where the rider of a rearing horse sits: back by 0.7 * standAnimO and up by 0.15 * standAnimO, turned with the
   * horse (its yaw, its rider's):
   *   1.9 - 1.20.1: AbstractHorse.positionRider, in float with Mth's tables, on top of y + getPassengersRidingOffset()
   *     + the player's -0.35
   *   1.20.2 - 1.20.4: getPassengerAttachmentPoint's float vector, turned by JOML's rotateY, + the player's -0.6F
   *   >= 1.20.5: the attachment plus the double vector turned by Vec3.yRot, - the player's vehicle attachment 0.6
   */
  function getRearingHorseSeat (horse, seat, standAnimO) {
    const f32 = Math.fround
    const height = f32(horse.height ?? 1.6)
    // (before 1.9 the client seats its rider before its own tick, along the horse's body, which a saddled horse turned to
    // its rider's look of this tick in its travel: EntityHorse.moveEntityWithHeading, updateRiderPosition)
    const legacyBody = !bot.registry.isNewerOrEqualTo('1.9') && horseSaddleFlag(horse, bot.registry) && bot.entity.yawDegrees !== undefined
    const yaw = legacyBody ? f32(Number(bot.entity.yawDegrees)) : f32(sentYawDegrees())
    if (bot.registry.isNewerOrEqualTo('1.20.5')) {
      const angle = f32(-yaw * f32(0.017453292))
      const sin = physics.mth.sin(angle)
      const cos = physics.mth.cos(angle)
      const back = -0.7 * standAnimO * 1
      const attachY = f32(HORSE_PASSENGER_ATTACHMENT_Y[horse.name] ?? f32(height - f32(0.15625)))
      return { x: seat.x + back * sin, y: seat.y + (attachY + 0.15 * standAnimO * 1) - 0.6, z: seat.z + back * cos }
    }
    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      const angle = f32(-yaw * f32(0.017453292))
      // org.joml.Math.sin, and cosFromSin's root of 1 - sin * sin (signed as the cosine)
      const sin = f32(Math.sin(angle))
      let cos = f32(Math.sqrt(f32(1 - f32(sin * sin))))
      if (Math.cos(angle) < 0) cos = -cos
      const back = f32(f32(f32(-0.7) * standAnimO) * 1)
      // (a skeleton horse's attachment does not rear: SkeletonHorse.getPassengerAttachmentPoint)
      if (horse.name === 'skeleton_horse') return { x: seat.x, y: seat.y + getHorsePassengerFeetOffsetY(horse), z: seat.z }
      const y = f32(f32(height - f32(legacyHorseAttachmentDrop(horse))) + f32(f32(f32(0.15) * standAnimO) * 1))
      return { x: seat.x + f32(back * sin), y: seat.y + y + f32(-0.6), z: seat.z + f32(back * cos) }
    }
    const angle = f32(yaw * f32(0.017453292))
    const sin = physics.mth.sin(angle)
    const cos = physics.mth.cos(angle)
    const back = f32(f32(0.7) * standAnimO)
    const up = f32(f32(0.15) * standAnimO)
    // (as getHorsePassengerFeetOffsetY's: the variants' offsets from 1.9, the mule's from 1.11)
    const name = vehicleName(horse)
    const lowered = name === 'donkey' || (name === 'mule' && bot.registry.isNewerOrEqualTo('1.11'))
    const legacy = !bot.registry.isNewerOrEqualTo('1.9')
    const variantOffset = legacy ? 0 : lowered ? 0.25 : name === 'skeleton_horse' ? 0.1875 : 0
    return { x: seat.x + f32(back * sin), y: seat.y + (height * 0.75 - variantOffset) + -0.35 + up, z: seat.z - f32(back * cos) }
  }

  // <= 1.20.1: Entity#positionRider = y + vehicle.getPassengersRidingOffset() + passenger.getMyRidingOffset()
  // Vanilla 1.17.1 sources: vehicle/Boat#getPassengersRidingOffset() = -0.1,
  // vehicle/AbstractMinecart#getPassengersRidingOffset() = 0, player/Player#getMyRidingOffset() = -0.35.
  const LEGACY_PLAYER_RIDING_OFFSET_Y = -0.35 // Player#getMyRidingOffset(), <= 1.20.1
  const LEGACY_BOAT_RIDING_OFFSET_Y = -0.1 // Boat#getPassengersRidingOffset(), <= 1.20.1
  // Boat#getPassengersRidingOffset() of a boat of the bamboo type: 0.3 in 1.19.3 - 1.19.4, 0.25 in 1.20 - 1.20.1
  const legacyRaftRidingOffsetY = () => bot.registry.isNewerOrEqualTo('1.20') ? 0.25 : 0.3
  const LEGACY_MINECART_RIDING_OFFSET_Y = 0 // AbstractMinecart#getPassengersRidingOffset(), <= 1.20.1

  // >= 1.20.2: y is based on the vehicle's PASSENGER attachment point.
  // The player's contribution is numerically the same, but the mechanism changed:
  //   1.20.2-1.20.4: PASSENGER.y + Player#ridingOffset() (-0.6)
  //   >= 1.20.5:     PASSENGER.y - Player.DEFAULT_VEHICLE_ATTACHMENT.y (0.6)
  // Vanilla sources: Entity#positionRider, Boat#getPassengerAttachmentPoint,
  // EntityType.*_MINECART#passengerAttachments and Player#ridingOffset / DEFAULT_VEHICLE_ATTACHMENT.
  const MODERN_PLAYER_RIDING_OFFSET_Y = -0.6
  const MODERN_MINECART_PASSENGER_ATTACHMENT_Y = 0.1875 // EntityType.*_MINECART.passengerAttachments()
  const MODERN_RAFT_RIDE_HEIGHT_FACTOR = 0.8888889 // Raft#rideHeight(), >= 1.21.2

  /**
   * Vanilla seat offset for a player passenger in a boat, minecart, horse or pig.
   * Returns null for other vehicles so their existing behavior is preserved.
   */
  // A bamboo raft: its own entity from 1.21.2, before a boat of the bamboo type (Boat.Type.BAMBOO, from 1.19.3, in its
  // "type" data: the 8th type in 1.19.3, the 9th from 1.19.4, whose CHERRY comes before it)
  function isRaft (vehicle) {
    if (isRaftEntity(vehicle)) return true
    // (before 1.21.2 a boat or chest boat of the bamboo type)
    if (vehicle?.name !== 'boat' && vehicle?.name !== 'chest_boat') return false
    if (!bot.registry.isNewerOrEqualTo('1.19.3')) return false
    // (Boat.DATA_ID_TYPE, the 12th data: minecraft-data names it from 1.19.4)
    const keys = bot.registry.entitiesByName[vehicle.name]?.metadataKeys
    const typeIndex = keys ? keys.indexOf('type') : 11
    const bamboo = bot.registry.isNewerOrEqualTo('1.19.4') ? 8 : 7
    return typeIndex >= 0 && vehicle.metadata?.[typeIndex] === bamboo
  }

  function getVehiclePassengerFeetOffsetY (vehicle) {
    if (isRideableHorseEntity(vehicle)) return getHorsePassengerFeetOffsetY(vehicle)
    if (vehicleName(vehicle) === 'pig') return getPigPassengerFeetOffsetY(vehicle)
    if (vehicle?.name === 'strider' && bot.registry.isNewerOrEqualTo('1.16')) return getStriderPassengerFeetOffsetY(vehicle)
    const isBoat = isBoatEntity(vehicle)
    const isMinecart = isRideableMinecartEntity(vehicle)
    if (!isBoat && !isMinecart) return null

    const height = vehicle.height ?? 0
    const f32 = Math.fround

    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      // getPassengerAttachmentPoint's float height (a boat's height / 3.0F, a raft's height * 0.8888889F; rideHeight
      // from 1.20.5) plus the player's riding offset: its float ridingOffset() -0.6F before 1.20.5, its vehicle
      // attachment 0.6 since
      const passengerAttachmentY = isBoat
        ? (isRaft(vehicle) ? f32(f32(height) * f32(MODERN_RAFT_RIDE_HEIGHT_FACTOR)) : f32(f32(height) / 3))
        : MODERN_MINECART_PASSENGER_ATTACHMENT_Y
      if (bot.registry.isNewerOrEqualTo('1.20.5')) return passengerAttachmentY + MODERN_PLAYER_RIDING_OFFSET_Y
      return passengerAttachmentY + f32(MODERN_PLAYER_RIDING_OFFSET_Y)
    }

    // (1.8's EntityBoat seats at -0.3; a boat of the bamboo type higher, Boat#getPassengersRidingOffset)
    const boatRidingOffset = isRaft(vehicle) ? legacyRaftRidingOffsetY() : LEGACY_BOAT_RIDING_OFFSET_Y
    const vehicleRidingOffset = isBoat ? (bot.registry.isNewerOrEqualTo('1.9') ? boatRidingOffset : -0.3) : LEGACY_MINECART_RIDING_OFFSET_Y
    // Boat.positionRider (1.9 - 1.20.1) takes the sum as a float
    if (isBoat && bot.registry.isNewerOrEqualTo('1.9')) return f32(vehicleRidingOffset + LEGACY_PLAYER_RIDING_OFFSET_Y)
    return vehicleRidingOffset + LEGACY_PLAYER_RIDING_OFFSET_Y
  }

  /**
   * How far above a pig its rider's feet are (Entity.positionRider):
   *   <= 1.20.1: the default getPassengersRidingOffset(), the float height * 0.75D, + the player's -0.35D
   *   1.20.2 - 1.20.4: Pig.getPassengerAttachmentPoint, height - 0.03125F in float, + the player's -0.6F
   *   >= 1.20.5: EntityType.PIG.passengerAttachments 0.86875F - the player's vehicle attachment 0.6D
   */
  function getPigPassengerFeetOffsetY (pig) {
    const f32 = Math.fround
    const height = f32(pig.height ?? 0.9)
    if (bot.registry.isNewerOrEqualTo('1.20.5')) return f32(0.86875) - 0.6
    if (bot.registry.isNewerOrEqualTo('1.20.2')) return f32(height - f32(0.03125)) + f32(-0.6)
    return height * 0.75 - 0.35
  }

  /**
   * Where a standing camel seats its driver (Camel.getPassengerAttachmentPoint, 1.20.2+): its body anchor, height -
   * 0.375F in float, 0.5F forward, turned by the camel's yaw (JOML's float Vector3f.rotateY 1.20.2 - 1.20.4, Vec3.yRot
   * with Mth.sin and cos from 1.20.5); then the player's riding offset (-0.6F before 1.20.5, -0.6 since). The camel
   * turns with its rider (getRiddenRotation), so its yaw is the rider's.
   */
  function getCamelSeatOffset (camel) {
    const f32 = Math.fround
    const anchorY = camelBodyAnchorY(camel)
    // (the camel's own yRot: the rider's within a turn, Entity.setRot; one it does not steer turns as the server has it)
    const steered = riddenCtx != null && riddenVehicleId === camel.id && riddenCtx.state.type === 'camel'
    const yaw = steered ? riddenCtx.state.yawDegrees : riddenMobType(camel) === 'camel' ? sentYawDegrees() : vehicleYawDegrees(camel)
    const angle = f32(-f32(yaw) * f32(0.017453292))
    let sin, cos
    if (!bot.registry.isNewerOrEqualTo('1.20.2')) {
      // before 1.20.2 Camel.positionRider: (0, 0, 0.5F).yRot(-yBodyRot) with Mth's tables, at the float sum of its body
      // anchor (riding offset: its pose's height less 0.6F) and the player's riding offset -0.35. A camel its driver
      // steers has its body at its yRot (AbstractHorse.tickRidden); one it does not (unsaddled) turns its body as the
      // client turns it (Mob.tickHeadTurn: BodyRotationControl.clientTick, toward the head the server turns)
      const body = !steered && riddenMobType(camel) !== 'camel' && camel.bodyYawDegrees != null ? camel.bodyYawDegrees : yaw
      const bodyAngle = f32(-f32(body) * f32(0.017453292))
      sin = physics.mth.sin(bodyAngle)
      cos = physics.mth.cos(bodyAngle)
      return { x: 0.5 * sin, y: f32(anchorY + -0.35), z: 0.5 * cos }
    }
    if (bot.registry.isNewerOrEqualTo('1.20.5')) {
      sin = physics.mth.sin(angle)
      cos = physics.mth.cos(angle)
    } else {
      // org.joml.Math.sin, and cosFromSin's root of 1 - sin * sin (signed as the cosine)
      sin = f32(Math.sin(angle))
      cos = f32(Math.sqrt(f32(1 - f32(sin * sin))))
      if (Math.cos(angle) < 0) cos = -cos
      return { x: f32(f32(0.5) * sin), y: f32(anchorY) + f32(-0.6), z: f32(f32(0.5) * cos) }
    }
    // (the anchor as a float, Camel.getPassengerAttachmentPoint)
    return { x: 0.5 * sin, y: f32(anchorY) - 0.6, z: 0.5 * cos }
  }

  // A vehicle's float yaw in degrees as the client holds it (the one it steers keeps them), else from its radians
  function vehicleYawDegrees (vehicle) {
    if (vehicle.yawDegrees != null) return Math.fround(Number(vehicle.yawDegrees))
    return Math.fround(conv.toNotchianYaw(vehicle.yaw ?? 0))
  }

  /**
   * Where a vehicle seats its single player passenger (Entity.getPassengerAttachmentPoint) when it is not the plain
   * point above it, from 1.20.5 (EntityType.passengerAttachments): a chest boat's or chest raft's 0.15F forward
   * (AbstractChestBoat.getSinglePassengerXOffset; from 1.20.2, before the float sum of the old seat), a llama's
   * (0, 1.37, -0.3), a nautilus's 1.1375F, a cushion's height; turned by the vehicle's yaw (Vec3.yRot(-yRot *
   * 0.017453292F), Mth.sin / cos). Null for any other vehicle.
   */
  function getPassengerAttachment (vehicle) {
    const f32 = Math.fround
    let point = null
    if (isBoatEntity(vehicle) && /chest_(boat|raft)$/.test(vehicle.name ?? '') && bot.registry.isNewerOrEqualTo('1.20.2')) {
      // (its ride height: the float height / 3, a raft's height * 0.8888889F)
      const height = f32(vehicle.height ?? 0)
      point = [0, isRaft(vehicle) ? f32(height * f32(MODERN_RAFT_RIDE_HEIGHT_FACTOR)) : f32(height / 3), f32(0.15)]
    } else if ((vehicle.name === 'llama' || vehicle.name === 'trader_llama') && bot.registry.isNewerOrEqualTo('1.20.5')) {
      point = [0, 1.37, -0.3]
    } else if (RIDDEN_NAUTILUSES.has(vehicle.name)) {
      point = [0, f32(1.1375), 0]
    } else if (vehicle.name === 'cushion') {
      point = [0, f32(vehicle.height ?? 0.25), 0]
    }
    if (!point) return null
    const [x, y, z] = point
    if (x === 0 && z === 0) return { x: 0, y, z: 0 }
    const angle = f32(-vehicleYawDegrees(vehicle) * f32(0.017453292))
    const cos = physics.mth.cos(angle)
    const sin = physics.mth.sin(angle)
    return { x: x * cos + z * sin, y, z: z * cos - x * sin }
  }

  // The level's game time as the client keeps it (ClientLevel.tickTime): the server's (update_time), one more after every
  // client tick, its entities ticked first
  let clientGameTime = null
  bot._client.on('update_time', (packet) => {
    const age = Array.isArray(packet.age) ? packet.age[0] * 4294967296 + (packet.age[1] >>> 0) : Number(packet.age)
    if (Number.isFinite(age)) {
      clientGameTime = age
      gameTimeSynced = true
    }
  })
  let gameTimeSynced = false
  // (the tick before ended with the level's tick: one more, unless the server's time came since)
  function advanceGameTime () {
    if (clientGameTime != null && !gameTimeSynced) clientGameTime++
    gameTimeSynced = false
  }

  /**
   * The height of a camel's body anchor, where it seats its driver (Camel.getBodyAnchorAnimationYOffset, adult, its
   * first passenger): its pose's height (sitting: 1.43F lower) less 0.375, moved along its sit-down or stand-up animation
   * by the ticks since its last pose change (LAST_POSE_CHANGE_TICK, negative while it sits; the level's game time less
   * its magnitude): toward 1.43F - 0.5F * 1.23F over the first 28 of 40 ticks sitting down, then to 0.2F; standing up
   * from 0.2F - (1.43F - 0.6F * 1.23F) over 24 of 52, then to 0. A sitting camel past its animation is 0.2F higher.
   */
  function camelBodyAnchorY (camel) {
    const f32 = Math.fround
    const keys = riddenMetadataKeys(camel.name)
    const lastIndex = keys.indexOf('last_pose_change_tick')
    const raw = lastIndex >= 0 ? camel.metadata?.[lastIndex] : undefined
    const last = Array.isArray(raw) ? raw[0] * 4294967296 + (raw[1] >>> 0) : raw != null ? Number(raw) : null
    const sittingPose = camel.metadata?.[keys.indexOf('pose')] === 10
    const height = sittingPose ? f32(f32(2.375) - f32(1.43)) : f32(camel.height ?? 2.375)
    // (before 1.20.2 from its riding offset, the height less 0.6F in float)
    let offset = bot.registry.isNewerOrEqualTo('1.20.2') ? height - 0.375 : f32(height - f32(0.6))
    if (last == null || clientGameTime == null) return offset
    const sitting = last < 0
    const poseTime = clientGameTime - Math.abs(last)
    const sitHeight = f32(1.43)
    const drop = f32(sitHeight - f32(0.2))
    const bottom = f32(sitHeight - drop)
    const lerp = (delta, start, end) => f32(start + f32(delta * f32(end - start)))
    const inTransition = poseTime < (sitting ? 40 : 52)
    if (inTransition) {
      const duration = sitting ? 40 : 52
      const half = sitting ? 28 : 24
      const flexOffset = sitting ? f32(0.5) : f32(0.6)
      const time = Math.min(Math.max(f32(poseTime), 0), duration)
      const first = time < half
      const part = first ? f32(time / half) : f32(f32(time - half) / (duration - half))
      const flex = f32(sitHeight - f32(flexOffset * drop))
      offset += sitting
        ? lerp(part, first ? sitHeight : flex, first ? flex : bottom)
        : lerp(part, first ? f32(bottom - sitHeight) : f32(bottom - flex), first ? f32(bottom - flex) : 0)
    }
    if (sitting && !inTransition) offset += bottom
    return offset
  }

  // The camel's LAST_POSE_CHANGE_TICK (negative while it sits): sitting, and the ticks since against the game time
  function useCamelPose (state, camel) {
    const keys = riddenMetadataKeys(camel.name)
    const raw = camel.metadata?.[keys.indexOf('last_pose_change_tick')]
    const last = Array.isArray(raw) ? raw[0] * 4294967296 + (raw[1] >>> 0) : raw != null ? Number(raw) : null
    if (last == null || !Number.isFinite(last)) return
    state.camelSitting = last < 0
    if (clientGameTime != null) state.poseTime = clientGameTime - Math.abs(last)
  }

  /**
   * Where a llama seats its rider before 1.20.5, 0.3 behind its middle along its body's rotation (yBodyRot, the yaw
   * the client shows it with here):
   *   1.11 - 1.20.1: Llama.positionRider, at 0.67 (0.6 from 1.18) of its height, + the player's riding offset -0.35
   *   1.20.2 - 1.20.4: its float passenger attachment (0, height - 0.5F, -0.3F) turned by JOML's rotateY, + the
   *   player's -0.6F
   */
  function getLegacyLlamaSeat (llama, seat) {
    const f32 = Math.fround
    const height = f32(llama.height ?? 1.87)
    // (its body's rotation as the client turns it: BodyRotationControl, entityInterpolation.turnBody)
    const body = llama.bodyYawDegrees != null ? Math.fround(llama.bodyYawDegrees) : vehicleYawDegrees(llama)
    if (bot.registry.isNewerOrEqualTo('1.20.2')) {
      const angle = f32(-body * f32(0.017453292))
      const sin = f32(Math.sin(angle))
      let cos = f32(Math.sqrt(f32(1 - f32(sin * sin))))
      if (Math.cos(angle) < 0) cos = -cos
      const z = f32(-0.3)
      return { x: seat.x + f32(z * sin), y: seat.y + f32(height - f32(0.5)) + f32(-0.6), z: seat.z + f32(z * cos) }
    }
    const radians = f32(body * f32(0.017453292))
    const cos = physics.mth.cos(radians)
    const sin = physics.mth.sin(radians)
    const riding = height * (bot.registry.isNewerOrEqualTo('1.18') ? 0.6 : 0.67)
    return { x: seat.x + f32(f32(0.3) * sin), y: seat.y + riding + -0.35, z: seat.z - f32(f32(0.3) * cos) }
  }

  // EntityType.HAPPY_GHAST.passengerAttachments: its four seats, the first (its controller's) in front
  const HAPPY_GHAST_SEATS = [[0, 4, 1.7], [-1.7, 4, 0], [0, 4, -1.7], [1.7, 4, 0]]

  /**
   * Where a happy ghast seats its rider (1.21.6+, Entity.positionRider): its passenger attachment for the rider's index
   * (the last for any after), turned by its yaw (EntityAttachments.getClamped: Vec3.yRot(-yRot * 0.017453292F)), less
   * the player's vehicle attachment 0.6. The ghast the bot steers turns on its own (tickRidden), so its seat goes with
   * the yaw it ticked to.
   */
  function getHappyGhastSeat (ghast, seat) {
    const f32 = Math.fround
    const index = Math.max(0, ghast.passengers?.findIndex(p => p.id === bot.entity.id) ?? 0)
    const [x, y, z] = HAPPY_GHAST_SEATS[Math.min(index, HAPPY_GHAST_SEATS.length - 1)]
    const steered = riddenCtx != null && riddenVehicleId === ghast.id && riddenCtx.state.type === 'happy_ghast'
    const yaw = steered ? riddenCtx.state.yawDegrees : f32(conv.toNotchianYaw(ghast.yaw ?? 0))
    const angle = f32(-f32(yaw) * f32(0.017453292))
    const cos = physics.mth.cos(angle)
    const sin = physics.mth.sin(angle)
    return { x: seat.x + (x * cos + z * sin), y: seat.y + y - 0.6, z: seat.z + (z * cos - x * sin) }
  }

  /**
   * How far above a strider its rider's feet are: its height, bobbing with its walk animation by 0.12F *
   * Mth.cos(position * 1.5F) * 2.0F * min(0.25F, speed) (in float):
   *   1.16 - 1.20.1: getPassengersRidingOffset(), height - 0.19D + the bob, + the player's -0.35D
   *   1.20.2 - 1.20.4: the float attachment height + bob, + the player's -0.6F
   *   >= 1.20.5: the attachment (its height) + the bob - the player's vehicle attachment 0.6D
   */
  function getStriderPassengerFeetOffsetY (strider) {
    const [riding, own] = getStriderSeatParts(strider)
    return riding + own
  }

  // The strider's riding offset and the player's own, which Entity.positionRider adds to the strider's y in turn
  function getStriderSeatParts (strider) {
    const f32 = Math.fround
    const height = f32(strider.height ?? 1.7)
    const walk = strider.walkAnimation ?? { speed: 0, position: 0 }
    const bob = f32(f32(f32(f32(0.12) * physics.mth.cos(f32(walk.position * f32(1.5)))) * 2) * Math.min(f32(0.25), walk.speed))
    if (bot.registry.isNewerOrEqualTo('1.20.5')) return [height + bob, -0.6]
    if (bot.registry.isNewerOrEqualTo('1.20.2')) return [f32(height + bob), f32(-0.6)]
    return [height - 0.19 + bob, -0.35]
  }

  // Where the vehicle seats its rider from (Entity.positionRider uses the vehicle's position): a vehicle the bot moves
  // itself (the 1.17.1 boat and horse, a pig, strider or camel it steers) is where it put it; any other is where the
  // client shows it, easing toward the server's moves (entity.interpolatedPosition, stepped before the passenger)
  function seatPosition (vehicle) {
    if (isBoatController() || isHorseController() || isRiddenMobController()) return vehicle.position
    return vehicle.interpolatedPosition ?? vehicle.position
  }

  // The passenger's own velocity: Entity.rideTick zeroes it, then its travel moves it by its walk input at the air
  // speed (moveRelative as the version computes it), adds gravity and keeps 0.91F of x and z and 0.98 of y
  function hasBlindness () {
    const blindness = bot.registry.effectsByName?.Blindness ?? bot.registry.effectsByName?.blindness
    return blindness != null && bot.entity.effects?.[blindness.id] != null
  }

  // The rider's move input after its aiStep (xxa, zza): the keys scaled by 0.98F; from 1.21.5 normalized, scaled and
  // stretched to the unit square (KeyboardInput.tick, LocalPlayer.modifyInput)
  function riderMoveInput () {
    const f32 = Math.fround
    let forward = (controlState.forward ? 1 : 0) - (controlState.back ? 1 : 0)
    let strafe = (controlState.left ? 1 : 0) - (controlState.right ? 1 : 0)
    const scale = (factor) => {
      forward = f32(forward * factor)
      strafe = f32(strafe * factor)
    }
    const length = () => f32(Math.sqrt(f32(f32(strafe * strafe) + f32(forward * forward))))
    if (bot.registry.isNewerOrEqualTo('1.21.5')) {
      // KeyboardInput.tick normalizes the keys; LocalPlayer.modifyInput scales them by 0.98F and stretches them to the
      // unit square
      const keys = length()
      if (keys < f32(1.0e-4)) scale(0)
      else scale(f32(1 / keys))
      if (forward !== 0 || strafe !== 0) {
        scale(f32(0.98))
        const moved = length()
        scale(f32(1 / moved))
        const absX = Math.abs(strafe)
        const absY = Math.abs(forward)
        const ratio = absY > absX ? f32(absX / absY) : f32(absY / absX)
        scale(Math.min(f32(moved * f32(Math.sqrt(f32(1 + f32(ratio * ratio))))), 1))
      }
    } else {
      // LivingEntity.aiStep: the input scaled by 0.98F
      scale(f32(0.98))
    }
    return { forward, strafe }
  }

  function setRiderVelocity (from = null) {
    const f32 = Math.fround
    const { forward, strafe } = riderMoveInput()
    // LocalPlayer.aiStep: a passenger starts sprinting with the sprint key and a forward input (food over 6 or able
    // to fly before 1.19.4; from 1.19.4 only on a vehicle that can sprint, a camel it drives), not using an item nor
    // blinded; it stops without the forward input or against a block
    // (before 1.19.4 the air speed is the one the sprint of the tick before left: EntityPlayer sets jumpMovementFactor
    // after its travel)
    const sprintedBefore = !!bot.entity.sprinting
    const forwardKey = (controlState.forward ? 1 : 0) - (controlState.back ? 1 : 0)
    const passengerRules = bot.registry.isNewerOrEqualTo('1.19.4')
    const vehicleCanSprint = !passengerRules || riddenMobType(bot.vehicle) === 'camel'
    const fed = passengerRules || (bot.food ?? 20) > 6 || !!bot.physicsEngineCtx?.state?.mayFly
    // (LocalPlayer.isSlowDueToUsingItem: an item whose use effects let a sprint go on, a spear's, does not keep it from
    // starting)
    const slowedByItem = bot.usingHeldItem && !bot.usingItemEffects?.canSprint
    const canStart = forwardKey > 0 && fed && vehicleCanSprint && !slowedByItem && !hasBlindness()
    if (!bot.entity.sprinting && canStart && controlState.sprint) bot.entity.sprinting = true
    if (bot.entity.sprinting && (forwardKey <= 0 || !fed || !vehicleCanSprint || bot.entity.isCollidedHorizontally)) {
      bot.entity.sprinting = false
    }
    const rider = {
      heading: { forward, strafe },
      yawDegrees: bot.entity.yawDegrees?.valueOf(),
      yaw: bot.entity.yaw,
      vel: new Vec3(0, 0, 0)
    }
    // LocalPlayer.aiStep before its travel: a passenger inside a suffocating block where it sat is pushed toward the
    // nearest open side too (moveTowardsClosestSpace, pushOutOfBlocks before 1.16); from 26.3 only a player that does not
    // ride is (LocalPlayer.aiStep: !isPassenger())
    if (from && !bot.registry.version['>=']('26.3')) {
      physics.pushOutOfBlocks({
        ...rider,
        pos: from,
        gameMode: bot.game?.gameMode,
        halfWidth: Math.fround(0.6) / 2,
        height: Math.fround(1.8),
        swimming: false,
        keptBoundingBox: null,
        prevControl: { sneak: false }
      }, riderWorld)
    }
    // in water where it sat (its baseTick's Entity.updateInWaterStateAndDoFluidPushing; a nautilus's rider), it swims:
    // a held sneak takes it down 0.04F (LocalPlayer.aiStep, goDownInWater, from 1.13), a held jump up 0.04F
    // (LivingEntity.aiStep, jumpInLiquid), its input at 0.02F (travelInWater); before 1.13 the water's flow pushes it
    // first (Entity.handleWaterMovement)
    // (from 1.9 a boat's passenger is out of the water: Entity.handleWaterMovement, updateInWaterStateAndDoFluidPushing)
    const legacyWater = !bot.registry.isNewerOrEqualTo('1.13')
    const swims = from != null && (!isBoatEntity(bot.vehicle) || !bot.registry.isNewerOrEqualTo('1.9')) && riderInWater(from, rider.vel)
    if (swims && controlState.sneak && !legacyWater) rider.vel.y -= 0.03999999910593033
    if (swims && controlState.jump) rider.vel.y += 0.03999999910593033
    const fallingBefore = rider.vel.y <= 0
    // Player.getFlyingSpeed: the air speed, 0.025999999F while sprinting (Player.aiStep before 1.19.4: 0.02F plus the
    // double 0.005999999865889549D cast back to a float, the same; on 1.18.2 - 1.19.3 0.02F + 0.006F in floats)
    const sprintSpeed = bot.registry.isNewerOrEqualTo('1.19.4') ? bot.entity.sprinting : sprintedBefore
    const floatSum = bot.registry.isNewerOrEqualTo('1.18.2') && !bot.registry.isNewerOrEqualTo('1.19.4')
    const sprintAirSpeed = floatSum ? f32(f32(0.02) + f32(0.006)) : f32(0.025999999)
    // LivingEntity.travel takes its speed and friction from the ground contact of the rider's last move: the first tick of
    // a player that got on its mount from the ground goes at the ground's speed, the block's friction kept
    // (getFrictionInfluencedSpeed, blockFriction * 0.91F)
    const grounded = from != null && !swims && !!bot.entity.onGround
    let friction = null
    if (grounded) {
      ectx ??= EPhysicsCtx.FROM_BOT(physics, bot, settings)
      const below = riderWorld.getBlock(physics.getBlockBelowAffectingMovement({ pos: from, supportingBlockPos: ectx.state.supportingBlockPos }, riderWorld))
      friction = f32((below ? physics.blockSlipperiness[below.type] : undefined) ?? settings.defaultSlipperiness ?? 0.6)
    }
    const speed = grounded ? physics.getFrictionInfluencedSpeed(physics.getMovementSpeedAttribute(ectx), friction) : sprintSpeed ? sprintAirSpeed : f32(0.02)
    physics.applyInputs(swims ? f32(0.02) : speed, rider)
    // its move (Entity.move from where it sat): a block in the way stops the motion on that axis
    let blocked = false
    if (from && (rider.vel.x !== 0 || rider.vel.z !== 0)) {
      ectx ??= EPhysicsCtx.FROM_BOT(physics, bot, settings)
      const moved = physics.collideBoundingBox(riderWorld, physics.getEntityBB(ectx, from), new Vec3(rider.vel.x, 0, rider.vel.z))
      // (Mth.equal: within 1.0E-5F; a move under 1E-7 the collision drops is no collision, though 1.14 - 1.18.1 still
      // reset the motion of any axis not moved exactly)
      const equal = (a, b) => Math.abs(a - b) < f32(1.0e-5)
      const exactReset = bot.registry.isNewerOrEqualTo('1.14') && !bot.registry.isNewerOrEqualTo('1.18.2')
      const resetX = exactReset ? moved.x !== rider.vel.x : !equal(moved.x, rider.vel.x)
      const resetZ = exactReset ? moved.z !== rider.vel.z : !equal(moved.z, rider.vel.z)
      blocked = !equal(moved.x, rider.vel.x) || !equal(moved.z, rider.vel.z)
      // (from 26.2 Entity.restituteMovementAfterCollisions bounces it back by a player's restitution, 0: -v * 0)
      const restitutes = bot.registry.version['>=']('26.2')
      if (resetX) rider.vel.x = restitutes ? -rider.vel.x * 0 : 0
      if (resetZ) rider.vel.z = restitutes ? -rider.vel.z * 0 : 0
    }
    // (its horizontal collision goes in the look it sends from 1.21.2)
    bot.entity.isCollidedHorizontally = blocked
    bot.entity.horizontalCollision = blocked
    if (swims && legacyWater) {
      // EntityLivingBase.moveEntityWithHeading in water before 1.13: 0.8F of the motion kept, then 0.02 down
      bot.entity.velocity.set(rider.vel.x * f32(0.8), rider.vel.y * f32(0.8) - 0.02, rider.vel.z * f32(0.8))
      return
    }
    if (swims) {
      // travelInWater: 0.8F of the motion kept (0.9F sprinting), 0.8F of the vertical, then the fluid's pull at a
      // sixteenth of the gravity (getFluidFallingAdjustedMovement, not while sprinting)
      const slowDown = bot.entity.sprinting ? f32(0.9) : f32(0.8)
      let y = rider.vel.y * 0.800000011920929
      if (!bot.entity.sprinting) y = fallingBefore && Math.abs(y - 0.005) >= 0.003 && Math.abs(y - 0.005) < 0.003 ? -0.003 : y - 0.08 / 16
      bot.entity.velocity.set(rider.vel.x * slowDown, y, rider.vel.z * slowDown)
      return
    }
    const drag = grounded ? f32(friction * f32(0.91)) : f32(0.91)
    bot.entity.velocity.set(rider.vel.x * drag, (0 - 0.08) * 0.9800000190734863, rider.vel.z * drag)
  }

  // Whether a player standing at pos touches water (Entity.updateInWaterStateAndDoFluidPushing; before 1.13
  // Entity.handleWaterMovement, whose flow push goes into vel)
  function riderInWater (pos, vel) {
    const probe = { pose: 0, pos: pos.clone(), scale: 1, vel: new Vec3(0, 0, 0), flying: false, eyeHeight: 1.62, isInWater: false }
    physics.fluidPhysics({ state: probe, worldSettings: settings }, riderWorld, true)
    if (!bot.registry.isNewerOrEqualTo('1.13') && probe.isInWater) vel?.add(probe.vel)
    return probe.isInWater
  }

  // (riderTicks false: the passenger is only seated, its own tick comes later in the client tick)
  function syncEntityWithHorse (riderTicks = true) {
    const vehicle = bot.vehicle
    if (!vehicle) return

    const sat = bot.entity.position.clone()
    const seat = seatPosition(vehicle)
    bot.entity.position.set(seat.x, seat.y + getHorsePassengerFeetOffsetY(vehicle), seat.z)

    if (!riderTicks) return
    setRiderVelocity(sat)
    // the passenger's own tick (Entity.rideTick) does not move it, so it does not touch the ground: nor did it after its
    // last tick, where its first tick on foot starts from (the air's inertia)
    bot.entity.onGround = false
    bot.entity.lastOnGround = false
  }

  function syncEntityWithVehicle (riderTicks = true) {
    const vehicle = bot.vehicle
    if (!vehicle) return

    const sat = bot.entity.position.clone()
    const seat = seatPosition(vehicle)
    const attached = getPassengerAttachment(vehicle)
    if (vehicle.name === 'camel' || vehicle.name === 'camel_husk') {
      const offset = getCamelSeatOffset(vehicle)
      bot.entity.position.set(seat.x + offset.x, seat.y + offset.y, seat.z + offset.z)
    } else if (vehicle.name === 'happy_ghast') {
      const at = getHappyGhastSeat(vehicle, seat)
      bot.entity.position.set(at.x, at.y, at.z)
    } else if (horseStandAnimO(vehicle) > 0) {
      // the horse rears (its stand animation: the ridden state's for the horse it steers, else the entity's own)
      const at = getRearingHorseSeat(vehicle, seat, horseStandAnimO(vehicle))
      bot.entity.position.set(at.x, at.y, at.z)
    } else if (isBoatEntity(vehicle) && !bot.registry.isNewerOrEqualTo('1.9')) {
      // 1.8's EntityBoat.updateRiderPosition: 0.4 along its yaw (cos for x, sin for z)
      const radians = (vehicle.yawDegrees != null ? Number(vehicle.yawDegrees) : conv.toNotchianYaw(vehicle.yaw ?? 0)) * Math.PI / 180
      // (at y + getMountedYOffset() + the player's getYOffset(), added in turn)
      bot.entity.position.set(seat.x + Math.cos(radians) * 0.4, seat.y + -0.3 + -0.35, seat.z + Math.sin(radians) * 0.4)
    } else if (LLAMAS.has(vehicle.name) && !bot.registry.isNewerOrEqualTo('1.20.5') && bot.registry.isNewerOrEqualTo('1.11')) {
      const at = getLegacyLlamaSeat(vehicle, seat)
      bot.entity.position.set(at.x, at.y, at.z)
    } else if (vehicle.name === 'strider' && bot.registry.isNewerOrEqualTo('1.16')) {
      // (its y plus its riding offset, then the player's own, as Entity.positionRider adds them)
      const [riding, own] = getStriderSeatParts(vehicle)
      bot.entity.position.set(seat.x, seat.y + riding + own, seat.z)
    } else if (attached) {
      // Entity.positionRider: the vehicle's position plus its passenger attachment, less the player's vehicle attachment
      bot.entity.position.set(seat.x + attached.x, seat.y + attached.y - 0.6, seat.z + attached.z)
    } else {
      bot.entity.position.set(
        seat.x,
        // Boats, minecarts, horses and pigs use vanilla seat offsets. Other vehicles retain the
        // existing behavior.
        seat.y + (getVehiclePassengerFeetOffsetY(vehicle) ?? (vehicle.height ?? 0)),
        seat.z
      )
    }

    if (!riderTicks) return
    setRiderVelocity(sat)
    // the passenger's own tick (Entity.rideTick) does not move it, so it does not touch the ground: nor did it after its
    // last tick, where its first tick on foot starts from (the air's inertia)
    bot.entity.onGround = false
    bot.entity.lastOnGround = false
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
      horseSaddleFlag(vehicle, bot.registry)
  }

  function isHorsePhysicsVersion () {
    return bot.version === HORSE_PHYSICS_VERSION
  }

  // a saddled horse rides through RiddenMobPhysics on every version (the ridden mob path below); HorsePhysics is unused
  function canUseLocalHorsePhysics () {
    return false
  }

  function isHorseController () {
    const vehicle = bot.vehicle
    return canUseLocalHorsePhysics() &&
      vehicle &&
      isRideableHorseEntity(vehicle) &&
      vehicle.passengers?.[0]?.id === bot.entity.id &&
      horseSaddleFlag(vehicle, bot.registry)
  }

  // ---- the mobs the bot rides and steers itself: pig, strider, camel, horses (LivingEntity.travelRidden) ----

  const RIDDEN_HORSES = new Set(['horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse'])
  // 1.8 - 1.10 name a pig Pig and every horse EntityHorse, its variant in its synced data (EntityHorse's "type": 0
  // horse, 1 donkey, 2 mule, 3 zombie, 4 skeleton; a byte at 19 on 1.8, an int after its flags from 1.9)
  const LEGACY_VEHICLE_NAMES = { Pig: 'pig', Boat: 'boat', MinecartRideable: 'minecart' }
  const LEGACY_HORSE_VARIANTS = ['horse', 'donkey', 'mule', 'zombie_horse', 'skeleton_horse']
  function vehicleName (vehicle) {
    if (!vehicle) return vehicle?.name
    if (vehicle.name === 'EntityHorse') {
      const index = bot.registry.version['<']('1.9') ? 19 : horseFlagsIndex(bot.registry) + 1
      return LEGACY_HORSE_VARIANTS[vehicle.metadata?.[index] ?? 0] ?? 'horse'
    }
    return LEGACY_VEHICLE_NAMES[vehicle.name] ?? vehicle.name
  }
  const RIDDEN_NAUTILUSES = new Set(['nautilus', 'zombie_nautilus'])
  // the llamas, never steered (Llama.getControllingPassenger: none from 1.19) but on 1.21.5, where a llama with a
  // saddle in its saddle slot is saddled (Mob.isSaddled; since 1.21.6 only a saddle it can wear counts): its rider, a
  // player, steers it as a horse (AbstractHorse.getControllingPassenger, canJump)
  const LLAMAS = new Set(['llama', 'trader_llama'])
  const steersLlama = (vehicle) => bot.registry.version['==']('1.21.5') && vehicle.passengers?.[0]?.id === bot.entity.id && horseSaddleFlag(vehicle, bot.registry)

  // Pig and Strider.getControllingPassenger: a player holding the stick in either hand; a camel's driver steers it.
  const RIDDEN_MOB_STICKS = { pig: 'carrot_on_a_stick', strider: 'warped_fungus_on_a_stick' }
  // Strider.setSuffocating's modifier: the engine adds it itself, so the synced movement speed is taken without it
  const SUFFOCATING_MODIFIERS = new Set(['minecraft:suffocating', '9e362924-01de-4ddd-a2b2-d0f7a405a174'])
  let riddenMobPhysics = null
  let riddenCtx = null
  let riddenVehicleId = null
  // what the rider's last aiStep left for its mount's next tick (the vehicle ticks before its passenger)
  let riderInputBefore = { xxa: 0, zza: 0, sprinting: false, jumping: false }
  // LocalPlayer.aiStep's charge of a jumping mount (jumpRidingTicks, jumpRidingScale)
  let riderJump = { ticks: 0, scale: 0, wasJumping: false }

  function riddenMobType (vehicle) {
    if (!vehicle) return null
    // (before 1.9 the server alone moves a ridden mob: EntityHorse / EntityPig move only where !worldObj.isRemote; the
    // client eases it toward the server's moves)
    if (!bot.registry.version['>=']('1.9')) return null
    // (a camel husk is a camel: CamelHusk extends Camel)
    // (saddled: AbstractHorse.getControllingPassenger)
    if (vehicle.name === 'camel' || vehicle.name === 'camel_husk') return horseSaddleFlag(vehicle, bot.registry) ? 'camel' : null
    if (vehicle.name === 'happy_ghast') return isHappyGhastController(vehicle) ? 'happy_ghast' : null
    // a nautilus is steered by its first passenger, a player, while saddled (AbstractNautilus.getControllingPassenger)
    if (RIDDEN_NAUTILUSES.has(vehicle.name)) return vehicle.passengers?.[0]?.id === bot.entity.id && vehicle.equipment?.[7]?.name === 'saddle' ? vehicle.name : null
    // a saddled horse, donkey, mule or skeleton / zombie horse (AbstractHorse; 1.8 - 1.10's EntityHorse rides as a horse)
    // (before 1.19 one its rider controls unsaddled too, its first passenger's: it goes on its own input)
    if (isRideableHorseEntity(vehicle)) {
      const steerable = horseSaddleFlag(vehicle, bot.registry) || (!bot.registry.version['>=']('1.19') && vehicle.passengers?.[0]?.id === bot.entity.id && bot.registry.version['>=']('1.9'))
      return steerable ? (vehicle.name === 'EntityHorse' ? 'horse' : vehicle.name) : null
    }
    if (LLAMAS.has(vehicle.name)) return steersLlama(vehicle) ? vehicle.name : null
    const name = vehicleName(vehicle)
    const stick = RIDDEN_MOB_STICKS[name]
    if (!stick) return null
    // (before 1.11 a pig is its first passenger's to move, stick or not: canPassengerSteer)
    if (!bot.registry.version['>=']('1.11') && vehicle.passengers?.[0]?.id === bot.entity.id) return name
    return holdsStick(stick) ? name : null
  }

  // the rider holds the mob's stick in either hand (Pig / Strider.canBeSteered)
  function holdsStick (stick) {
    const hands = [bot.heldItem, bot.inventory?.slots?.[45]]
    return hands.some(item => item?.name === stick)
  }

  // HappyGhast.getControllingPassenger: its first passenger, a player, while it wears a harness (its body slot) and is
  // not on its still timeout (STAYS_STILL, all the client knows of it); an adult (a ghastling is never ridden)
  function isHappyGhastController (ghast) {
    if (ghast.passengers?.[0]?.id !== bot.entity.id) return false
    if (!ghast.equipment?.[6]?.name?.endsWith('_harness')) return false
    const keys = bot.registry.entitiesByName.happy_ghast?.metadataKeys ?? []
    const flag = (name) => keys.indexOf(name) >= 0 && !!ghast.metadata?.[keys.indexOf(name)]
    return !flag('stays_still') && !flag('baby')
  }

  function isRiddenMobController () {
    return bot.entity.vehicle != null && riddenMobType(bot.vehicle) != null
  }

  // Whether the bot controls the mob it rides (Entity.getControllingPassenger is its player), what decides that its client
  // tells the server where the mob went (LocalPlayer.sendChanges: isLocalInstanceAuthoritative; before canPassengerSteer).
  // Its first passenger before 1.19; from 1.19 a horse only while saddled and a llama never (AbstractHorse, Llama), a pig
  // or strider only for a rider holding its stick, a happy ghast only in its harness. Other vehicles stay as they were.
  function controlsMount (vehicle) {
    if (vehicle.name === 'happy_ghast') return isHappyGhastController(vehicle)
    // a seat has no controlling passenger (Entity.getControllingPassenger); a nautilus only while saddled
    if (vehicle.name === 'cushion') return false
    if (RIDDEN_NAUTILUSES.has(vehicle.name) || vehicle.name === 'camel' || vehicle.name === 'camel_husk') return riddenMobType(vehicle) != null
    if (vehicle.passengers?.[0]?.id !== bot.entity.id) return false
    // before 1.19 a horse is its first passenger's, saddled or not (AbstractHorse.canBeSteered); a pig, strider or llama
    // only as from 1.19 (canPassengerSteer: getControllingPassenger)
    if (isRideableHorseEntity(vehicle)) return !bot.registry.version['>=']('1.19') || horseSaddleFlag(vehicle, bot.registry)
    if (LLAMAS.has(vehicle.name)) return riddenMobType(vehicle) != null
    if (RIDDEN_MOB_STICKS[vehicleName(vehicle)]) return riddenMobType(vehicle) != null
    return true
  }

  // AttributeInstance.calculateValue of the mount's synced movement speed, without the strider's suffocating modifier
  function riddenMovementSpeed (vehicle) {
    const synced = Object.entries(vehicle.attributes ?? {}).find(([key]) => /(^|[.:])movement_speed$|movementSpeed$/.test(key))?.[1]
    if (!synced) return undefined
    const modifiers = (synced.modifiers ?? []).filter(m => !SUFFOCATING_MODIFIERS.has(m.uuid ?? m.id))
    let value = synced.value
    for (const m of modifiers) if (m.operation === 0) value += m.amount
    let total = value
    for (const m of modifiers) if (m.operation === 1) total += value * m.amount
    for (const m of modifiers) if (m.operation === 2) total *= 1 + m.amount
    return total
  }

  // the mount's synced FLYING_SPEED (a happy ghast's), AttributeInstance.calculateValue
  function riddenFlyingSpeed (vehicle) {
    const synced = Object.entries(vehicle.attributes ?? {}).find(([key]) => /(^|[.:])flying_speed$|flyingSpeed$/.test(key))?.[1]
    if (!synced) return undefined
    const modifiers = synced.modifiers ?? []
    let value = synced.value
    for (const m of modifiers) if (m.operation === 0) value += m.amount
    let total = value
    for (const m of modifiers) if (m.operation === 1) total += value * m.amount
    for (const m of modifiers) if (m.operation === 2) total *= 1 + m.amount
    return total
  }

  // the mount's synced JUMP_STRENGTH (a horse's), its base and added values
  function riddenJumpStrength (vehicle) {
    const synced = Object.entries(vehicle.attributes ?? {}).find(([key]) => /(^|[.:])jump_strength$|jumpStrength$/.test(key))?.[1]
    if (!synced) return undefined
    let value = synced.value
    for (const m of synced.modifiers ?? []) if (m.operation === 0) value += m.amount
    return value
  }

  // A horse's stand animation before its last tick (AbstractHorse.standAnimO): the ridden state's for the horse the bot
  // steers, else the one the client keeps for every horse (tickHorseStandAnimations)
  function horseStandAnimO (vehicle) {
    if (!RIDDEN_HORSES.has(vehicleName(vehicle))) return 0
    if (riddenCtx && riddenVehicleId === vehicle.id && RIDDEN_HORSES.has(riddenCtx.state.type)) return riddenCtx.state.standAnimO
    return vehicle.standAnimO ?? 0
  }

  // AbstractHorse.tick's stand animation, which the client runs for every horse it knows, ridden or not: up while its
  // flags say it rears (bit 32, 64 before 1.11), down after. The horse the bot steers ticks it in its ridden state (except).
  function tickHorseStandAnimations (except) {
    const f32 = Math.fround
    const index = horseFlagsIndex(bot.registry)
    for (const entity of Object.values(bot.entities)) {
      // (before 1.11 every horse is an EntityHorse)
      if (entity === except || !RIDDEN_HORSES.has(vehicleName(entity))) continue
      const standing = ((entity.metadata?.[index] ?? 0) & horseStandingBit(bot.registry)) !== 0
      let anim = entity.standAnim ?? 0
      if (!standing && anim === 0 && !entity.standAnimO) continue
      entity.standAnimO = anim
      if (standing) {
        anim = f32(anim + f32(f32(f32(1 - anim) * f32(0.4)) + f32(0.05)))
        if (anim > 1) anim = 1
      } else {
        const cube = f32(f32(f32(f32(0.8) * anim) * anim) * anim)
        anim = f32(anim + f32(f32(f32(cube - anim) * f32(0.6)) - f32(0.05)))
        if (anim < 0) anim = 0
      }
      entity.standAnim = anim
    }
  }

  function destroyRiddenContext () {
    // the horse goes on with the stand animation its ridden state had
    const vehicle = riddenVehicleId != null ? bot.entities[riddenVehicleId] : null
    if (vehicle && riddenCtx && RIDDEN_HORSES.has(riddenCtx.state.type)) {
      vehicle.standAnim = riddenCtx.state.standAnim
      vehicle.standAnimO = riddenCtx.state.standAnimO
    }
    riddenCtx = null
    riddenVehicleId = null
    riddenServerTarget = null
    riderInputBefore = { xxa: 0, zza: 0, sprinting: false, jumping: false }
    riderJump = { ticks: 0, scale: 0, wasJumping: false }
  }

  function ensureRiddenContext () {
    const vehicle = bot.vehicle
    const type = riddenMobType(vehicle)
    if (!type) {
      destroyRiddenContext()
      return null
    }
    if (!riddenCtx || riddenVehicleId !== vehicle.id || riddenCtx.state.type !== type) {
      riddenMobPhysics ??= new RiddenMobPhysics(bot.registry)
      const state = new RiddenMobState(riddenMobPhysics, {
        type,
        // (where the client shows it: the server's moves it was easing toward stop there, Entity.isControlledByLocalInstance)
        pos: vehicle.interpolatedPosition ?? vehicle.position,
        vel: vehicle.velocity,
        // (the float yaw the client shows it with, which its interpolation turns)
        yawDegrees: vehicleYawDegrees(vehicle),
        onGround: !!vehicle.onGround,
        movementSpeed: riddenMovementSpeed(vehicle)
      })
      // before 1.17 the mob keeps its own box (Entity.move): the one it has when known (entity.box, as a replay seeds
      // it), else the engine builds it from the position
      if (Array.isArray(vehicle.box) && !bot.registry.isNewerOrEqualTo('1.17')) {
        const bb = state.getBB()
        bb.set(...vehicle.box)
        state.keptBoundingBox = { bb, pos: state.pos.clone(), width: state.dimensions.width, height: state.dimensions.height }
      }
      // a horse rearing as its flags last said (bit 32, 64 before 1.11)
      if (RIDDEN_HORSES.has(type)) {
        state.standing = ((vehicle.metadata?.[horseFlagsIndex(bot.registry)] ?? 0) & horseStandingBit(bot.registry)) !== 0
        // and as far into its stand animation as the client had it
        state.standAnim = vehicle.standAnim ?? 0
        state.standAnimO = vehicle.standAnimO ?? 0
      }
      // a mob without AI (Mob's flags, bit 1): a strider then keeps the suffocating the server synced
      const keys = riddenMetadataKeys(vehicle.name)
      const synced = (name) => keys.indexOf(name) >= 0 ? vehicle.metadata?.[keys.indexOf(name)] : undefined
      state.noAi = ((synced('mob_flags') ?? 0) & 0x01) !== 0
      state.suffocating = !!synced('suffocating')
      // 1.11 - 1.19.2 a spawn's data carries every value, a boost time of 0 too, which starts an empty boost
      // (ItemBasedSteering.onSynced: boostTimeTotal 0) that the first steered tick spends: one tick at 1 + 1.15F *
      // Mth.sin(1 / 0 * PI) (the 1.9 - 1.10 recordings steer at the plain speed)
      if ((type === 'pig' || type === 'strider') && bot.registry.version['>=']('1.11') && bot.registry.version['<']('1.19.3') && !vehicle.spentSpawnBoost) {
        vehicle.spentSpawnBoost = true
        state.startBoost(0)
      }
      // its pitch as the client had it
      state.pitchDegrees = Math.fround(conv.toNotchianPitch(vehicle.pitch ?? 0)) + 0
      // the push it took from the player this tick or the one before, in its motion (Entity.push: the mob that pushes
      // the local player goes the other way)
      if (clientTicks - (vehicle.lastPush?.tick ?? -Infinity) <= 1) state.vel.translate(vehicle.lastPush.x, 0, vehicle.lastPush.z)
      // a camel sitting or standing up as its last pose change says (Camel.isCamelSitting, getPoseTime)
      if (type === 'camel') useCamelPose(state, vehicle)
      // from 1.21.2 the interpolation of the server's moves the mount was in goes on under its rider's control: from
      // where the client showed it, toward the same target, over the steps left (LivingEntity.aiStep before
      // travelRidden; before 1.21.2 a controlled mount stops interpolating, Entity.isControlledByLocalInstance)
      const interpolation = vehicle.interpolation
      if (bot.registry.version['>=']('1.21.2') && interpolation?.steps > 0 && !interpolation.stepped && !interpolation.minecart && vehicle.interpolatedPosition) {
        state.pos.set(vehicle.interpolatedPosition.x, vehicle.interpolatedPosition.y, vehicle.interpolatedPosition.z)
        const rotation = interpolation.yaw != null ? { yaw: interpolation.yaw, pitch: interpolation.pitch ?? 0 } : undefined
        riddenMobPhysics.interpolateRidden(state, interpolation.target, interpolation.steps, rotation)
      }
      riddenCtx = EPhysicsCtx.FROM_ENTITY_STATE(riddenMobPhysics, state, bot.registry.entitiesByName[vehicle.name] ?? bot.registry.entitiesByName.player)
      riddenVehicleId = vehicle.id
    }
    const speed = riddenMovementSpeed(vehicle)
    if (speed !== undefined) riddenCtx.state.movementSpeed = speed
    // (AbstractHorse.isSaddled; a pig steered with its stick, canBeSteered)
    if (RIDDEN_HORSES.has(riddenCtx.state.type)) riddenCtx.state.saddled = horseSaddleFlag(vehicle, bot.registry)
    if (RIDDEN_MOB_STICKS[riddenCtx.state.type]) riddenCtx.state.saddled = holdsStick(RIDDEN_MOB_STICKS[riddenCtx.state.type])
    const jumpStrength = riddenJumpStrength(vehicle)
    if (jumpStrength !== undefined) riddenCtx.state.jumpStrength = jumpStrength
    const flyingSpeed = riddenFlyingSpeed(vehicle)
    if (flyingSpeed !== undefined) riddenCtx.state.flyingSpeed = flyingSpeed
    return riddenCtx
  }

  // LivingEntity.calculateEntityAnimation at the end of the mount's aiStep: its horizontal move this tick drives its
  // walk animation (updateWalkAnimation: toward min(distance * 4F, 1F) by 0.4F, in float)
  function updateWalkAnimation (entity, dx, dz) {
    const f32 = Math.fround
    const walk = entity.walkAnimation ?? (entity.walkAnimation = { speed: 0, position: 0 })
    const target = Math.min(f32(f32(Math.sqrt(dx * dx + dz * dz)) * 4), 1)
    walk.speed = f32(walk.speed + f32(f32(target - walk.speed) * f32(0.4)))
    walk.position = f32(walk.position + walk.speed)
  }

  // The mount's tick (before its rider's): RiddenMobPhysics with the rider's look of this tick and its input and sprint
  // of the tick before; the mount then stands where the engine left it.
  // before 1.9 where the server last moved the mount (the client takes those moves too)
  let riddenServerTarget = null

  function tickRiddenMob () {
    const ctx = ensureRiddenContext()
    if (!ctx) return false
    const state = ctx.state
    // before 1.9 nothing is controlled by its rider alone: the client eases the mount toward each move the server sends
    // (EntityLivingBase.setPositionAndRotation2, over 3 steps, in place of the 0.98 damping) and still moves it on its
    // rider's input (moveEntityWithHeading)
    if (!bot.registry.version['>=']('1.9')) {
      const target = bot.vehicle.interpolation?.target
      if (target && !target.equals(riddenServerTarget ?? state.pos)) riddenMobPhysics.teleportRidden(state, target)
      if (target) riddenServerTarget = target.clone()
    }
    // where the mount starts its tick (Entity.xo): its own, not where the server's late moves put the entity
    const startX = state.pos.x
    const startZ = state.pos.z
    riddenMobPhysics.simulateRidden(ctx, world, {
      yawDegrees: sentYawDegrees(),
      pitchDegrees: sentPitchDegrees(),
      ...riderInputBefore
    })
    const vehicle = bot.vehicle
    updateWalkAnimation(vehicle, state.pos.x - startX, state.pos.z - startZ)
    vehicle.position.set(state.pos.x, state.pos.y, state.pos.z)
    vehicle.velocity.set(state.vel.x, state.vel.y, state.vel.z)
    vehicle.onGround = state.onGround
    vehicle.yaw = conv.fromNotchianYaw(state.yawDegrees)
    // (the float yaw the client holds, where it seats its rider)
    vehicle.yawDegrees = state.yawDegrees
    bot.emit('entityMoved', vehicle)
    return true
  }

  // The rider's aiStep for its mount: its input and sprint for the mount's next tick, and the charged jump of a camel or
  // horse (LocalPlayer.aiStep: released, the mount jumps or dashes at its next tick and the server is told START_RIDING_JUMP).
  function riderTickForRiddenMob () {
    const state = riddenCtx?.state
    if (!state) return
    keepRiderInput(state.type)
    riderJumpForRiddenMob(state)
  }

  // The rider's xxa and zza after its aiStep (riderMoveInput), what its mount moves on at its next tick
  // (AbstractHorse.getRiddenInput, Camel's: the player's own, which its aiStep sets whether it steers the mount or not)
  function keepRiderInput (type) {
    const input = riderMoveInput()
    riderInputBefore = {
      xxa: input.strafe,
      zza: input.forward,
      // a camel can be sprinted on (canSprint), pigs and striders not: its rider's sprint (set in its own tick)
      sprinting: type === 'camel' && !!bot.entity.sprinting,
      // its jump key (LocalPlayer.applyInput: jumping), what a happy ghast rises on
      jumping: !!controlState.jump
    }
  }

  function riderJumpForRiddenMob (state) {
    // a jumping mount (PlayerRideableJumping): a camel, a horse or a nautilus (saddled, canJump); a camel's and a
    // nautilus's dash cooldown holds the charge (getJumpCooldown)
    const camel = state.type === 'camel'
    const dashes = camel || RIDDEN_NAUTILUSES.has(state.type)
    if (!dashes && !RIDDEN_HORSES.has(state.type) && !LLAMAS.has(state.type)) return
    // (a horse jumps saddled only: canJump)
    if (RIDDEN_HORSES.has(state.type) && !state.saddled) return
    if (!dashes || state.dashCooldown === 0) {
      chargeRiderJump(power => riddenMobPhysics.riderJump(state, power))
    } else {
      riderJump.scale = 0
      riderJump.wasJumping = !!controlState.jump
    }
  }

  // the charge of the rider's jump key (jumpRidingTicks, jumpRidingScale); released, the jump's power is told the server
  // (START_RIDING_JUMP) and given the mount (released(power))
  function chargeRiderJump (released = () => {}) {
    const jumping = !!controlState.jump
    if (riderJump.ticks < 0) {
      riderJump.ticks++
      if (riderJump.ticks === 0) riderJump.scale = 0
    }
    if (riderJump.wasJumping && !jumping) {
      riderJump.ticks = -10
      const power = Math.floor(Math.fround(riderJump.scale * 100))
      released(power)
      bot._client.write('entity_action', { entityId: bot.entity.id, actionId: 'start_riding_jump', jumpBoost: power })
    } else if (!riderJump.wasJumping && jumping) {
      riderJump.ticks = 0
      riderJump.scale = 0
    } else if (riderJump.wasJumping) {
      riderJump.ticks++
      riderJump.scale = riderJump.ticks < 10
        ? Math.fround(riderJump.ticks * Math.fround(0.1))
        : Math.fround(Math.fround(0.8) + Math.fround(Math.fround(2 / (riderJump.ticks - 9)) * Math.fround(0.1)))
    }
    riderJump.wasJumping = jumping
  }

  // the server's corrections of the mount the bot steers: a vehicle_move puts it there (Entity.absMoveTo, a box built
  // anew), a velocity packet sets its motion (Entity.lerpMotion), its synced boost starts (ItemBasedSteering.onSynced)
  bot.on('vehicleCorrection', (entity, correction) => {
    if (!riddenCtx || entity !== bot.vehicle || riddenVehicleId !== entity.id || correction.kind !== 'vehicle_move') return
    riddenCtx.state.pos.set(entity.position.x, entity.position.y, entity.position.z)
    riddenCtx.state.keptBoundingBox = null
  })
  // from 1.21.2 a teleport of the mount (relative to where it is headed, from 1.21.5 to where it is) eases it there
  // (ClientPacketListener.handleTeleportEntity, LivingEntity.lerpTo)
  // (26.3: the entity's stepped interpolation carries it, SteppedInterpolationHandler)
  bot._client.on('entity_teleport', (packet) => {
    if (!riddenCtx || packet.entityId !== riddenVehicleId || !bot.registry.version['>=']('1.21.2')) return
    const state = riddenCtx.state
    if (bot.registry.version['>=']('26.3')) {
      if (packet.onGround !== undefined) state.onGround = !!packet.onGround
      return
    }
    const base = bot.registry.version['>=']('1.21.5') ? state.pos : riddenMobPhysics.lerpTargetOf(state)
    const flags = typeof packet.flags === 'object' ? packet.flags : {}
    const target = new Vec3(flags.x ? base.x + packet.x : packet.x, flags.y ? base.y + packet.y : packet.y, flags.z ? base.z + packet.z : packet.z)
    // (and to the rotation sent, relative to its own where the flags say)
    const rotation = Number.isFinite(packet.yaw) && Number.isFinite(packet.pitch)
      ? { yaw: flags.yaw ? state.yawDegrees + packet.yaw : packet.yaw, pitch: flags.pitch ? state.pitchDegrees + packet.pitch : packet.pitch }
      : undefined
    riddenMobPhysics.teleportRidden(state, target, rotation)
    // (and on the ground as it says, Entity.setOnGround)
    if (packet.onGround !== undefined) state.onGround = !!packet.onGround
  })
  // from 1.21.2 a position sync of the mount while its rider does not steer it (its saddle off for a moment) eases it
  // there, turning to the rotation sent, and the interpolation goes on once it is steered again: what its vehicle_move
  // reports while it runs (ClientPacketListener.handleEntityPositionSync: !isLocalInstanceAuthoritative, moveOrInterpolateTo)
  // (26.3: the entity's stepped interpolation carries it)
  bot._client.on('sync_entity_position', (packet) => {
    if (!riddenCtx || packet.entityId !== riddenVehicleId || !bot.registry.version['>=']('1.21.2') || bot.registry.version['>=']('26.3')) return
    if (bot._riddenMobPhysics.controls(bot.entities[packet.entityId])) return
    const state = riddenCtx.state
    const target = new Vec3(packet.x, packet.y, packet.z)
    const rotation = Number.isFinite(packet.yaw) && Number.isFinite(packet.pitch) ? { yaw: packet.yaw, pitch: packet.pitch } : undefined
    if (state.pos.distanceSquared(target) > 4096) riddenMobPhysics.teleportRidden(state, target, rotation)
    else riddenMobPhysics.interpolateRidden(state, target, 3, rotation)
  })
  // 26.3+: the tick offsets of the steps of a move or position sync (VecDelta.Stepped, PositionPath.Stepped), for the
  // stepped interpolation of the entity (SteppedInterpolationHandler), told before the packet is handled
  if (bot.registry.version['>=']('26.3')) {
    const queueTicks = (entityId, ticks) => bot.entityInterpolation?.queueTicks?.(entityId, ticks)
    for (const name of ['rel_entity_move', 'entity_move_look']) {
      bot._client.prependListener(name, (packet) => queueTicks(packet.entityId, packet.delta?.steps?.map(step => step.ticks)))
    }
    // (a teleport is one step of the update interval)
    bot._client.prependListener('entity_teleport', (packet) => queueTicks(packet.entityId, null))
    bot._client.prependListener('sync_entity_position', (packet) => {
      const steps = packet.path?.steps
      queueTicks(packet.entityId, steps?.length ? [steps.reduce((sum, step) => sum + step.tickOffset, 0)] : null)
    })
  }
  bot._client.on('entity_velocity', (packet) => {
    if (!riddenCtx || packet.entityId !== riddenVehicleId || !bot.vehicle) return
    riddenCtx.state.vel.set(bot.vehicle.velocity.x, bot.vehicle.velocity.y, bot.vehicle.velocity.z)
  })
  // The names of a ridden mob's synced data by index: minecraft-data's from 1.19.4; before, the version's own ids
  // (../entityData: 1.8's DataWatcher puts the mob's no-AI flag at 15, its age at 12)
  const riddenMetadataKeys = name => entityDataKeys(bot.registry, name)

  bot._client.on('entity_metadata', (packet) => {
    if (!riddenCtx || packet.entityId !== riddenVehicleId || !bot.vehicle) return
    const keys = riddenMetadataKeys(bot.vehicle.name)
    for (const { key, value } of packet.metadata) {
      if (keys[key] === 'boost_time') riddenCtx.state.startBoost(value)
      else if (keys[key] === 'dash') riddenMobPhysics.syncDash(riddenCtx.state, !!value)
      else if (keys[key] === 'suffocating') riddenCtx.state.suffocating = !!value
      else if (keys[key] === 'mob_flags') riddenCtx.state.noAi = (value & 0x01) !== 0
      else if (keys[key] === 'last_pose_change_tick' && riddenCtx.state.type === 'camel') useCamelPose(riddenCtx.state, bot.vehicle)
      // a horse rears (AbstractHorse's flags, bit 32; EntityHorse's 64 before 1.11)
      else if (RIDDEN_HORSES.has(riddenCtx.state.type) && key === horseFlagsIndex(bot.registry)) riddenCtx.state.standing = (value & horseStandingBit(bot.registry)) !== 0
    }
  })

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
    if (!vehicle || !isRideableHorseEntity(vehicle) || !horseSaddleFlag(vehicle, bot.registry)) {
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
    // the push it took from the player this tick or the one before, in its motion (Boat.push, Entity.push)
    if (clientTicks - (vehicle.lastPush?.tick ?? -Infinity) <= 1) state.vel.translate(vehicle.lastPush.x, 0, vehicle.lastPush.z)
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

  // Boat.positionRider (1.9+), after its rider's tick and the look it sent: the rider turns with the boat (its float
  // yaw + deltaRotation) and is kept within 105 degrees of the boat's yaw (clampRotation, Mth.wrapDegrees in float)
  function turnPassengerWithBoat () {
    if (!bot.vehicle || !boatCtx || !bot.registry.isNewerOrEqualTo('1.9')) return
    const f32 = Math.fround
    const wrapDegrees = (degrees) => {
      let d = f32(degrees % 360)
      if (d >= 180) d = f32(d - 360)
      if (d < -180) d = f32(d + 360)
      return d
    }
    const held = bot.entity.yawDegrees != null ? Number(bot.entity.yawDegrees) : conv.toNotchianYaw(bot.entity.yaw)
    let yaw = f32(held + f32(boatCtx.state.yawVelocity ?? 0))
    const relative = wrapDegrees(f32(yaw - f32(boatCtx.state.yawDegrees)))
    const clamped = Math.min(Math.max(relative, -105), 105)
    // Boat.clampRotation: yRot += clamped - relative before 1.17; from 1.17 setYRot(getYRot() + clamped - relative), whose
    // float sums go left to right
    yaw = bot.registry.version['>=']('1.17') ? f32(f32(yaw + clamped) - relative) : f32(yaw + f32(clamped - relative))
    if (yaw === held) return
    // (26.3 sends the rotation after this turn, the same tick: the look the player holds turns with it)
    const holdsLook = sendsAfterTick && lastSentYaw === bot.entity.yaw
    bot.entity.yawDegrees = new JavaFloat(yaw)
    bot.entity.yaw = conv.fromNotchianYaw(yaw)
    if (holdsLook) lastSentYaw = bot.entity.yaw
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

  bot.on('dismount', (vehicle) => {
    const controlled = vehicle != null && (vehicle.id === boatVehicleId || vehicle.id === horseVehicleId || vehicle.id === riddenVehicleId)
    if (controlled && bot.entityInterpolation) bot.entityInterpolation.release(vehicle)
    destroyBoatContext()
    destroyHorseContext()
    // off the mount, the client no longer moves it: it has lost its controlling passenger (Entity.removeVehicle)
    destroyRiddenContext()
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
    tickPlayer(now)
    updateChunkPos()
  }

  // Whether the client ticks the player in its chunk. 1.9 - 1.16 tick a player only once it is in a loaded chunk, which
  // they check after its tick (World.updateEntityWithOptionalForce, ClientLevel.tickNonPassenger).
  // 1.9 - 1.13 check again as it enters another chunk, and skip it while its chunk is not loaded
  // (EntityPlayerSP.onUpdate): it first ticks the tick after its chunk loads.
  // 1.14 - 1.16 put the entities standing in a chunk into it as it loads (ClientLevel.reAddEntitiesToChunk), never take
  // the player out of one (a chunk the client has not loaded takes no entity), and tick a spectator anyway.
  // Before 1.9 and from 1.17 the client counts every chunk as loaded.
  const chunkGated = bot.registry.version['>=']('1.9') && bot.registry.version['<']('1.17')
  const leavesChunks = bot.registry.version['<']('1.14')
  let inChunk = false
  let chunkCoords = null
  const columnLoaded = (x, z) => bot.world.getColumn(Math.floor(x / 16), Math.floor(z / 16)) != null

  function chunkTicks () {
    if (!chunkGated) return true
    if (leavesChunks) return inChunk && columnLoaded(bot.entity.position.x, bot.entity.position.z)
    return inChunk || bot.game.gameMode === 'spectator'
  }

  function updateChunkPos () {
    if (!chunkGated) return
    const { x, z } = bot.entity.position
    const coords = `${Math.floor(x / 16)},${Math.floor(z / 16)}`
    if (inChunk && (coords === chunkCoords || !leavesChunks)) return
    chunkCoords = coords
    inChunk = columnLoaded(x, z)
  }
  // (internal, not vanilla: the chunk check a tick ends with, run on its own, for a replay of a client that ran it
  // outside its ticks)
  bot._checkChunk = updateChunkPos

  if (chunkGated && !leavesChunks) {
    bot.on('chunkColumnLoad', (corner) => {
      const { x, z } = bot.entity.position
      if (Math.floor(x / 16) === corner.x >> 4 && Math.floor(z / 16) === corner.z >> 4) inChunk = true
    })
  }

  // a new player is put in the chunk it stands in, if the client has loaded it
  function addToChunk () {
    const { x, z } = bot.entity.position
    chunkCoords = `${Math.floor(x / 16)},${Math.floor(z / 16)}`
    inChunk = columnLoaded(x, z)
  }

  // 26.3+: the player's packets go after the whole client tick (Minecraft.tick: LocalPlayer.sendChanges)
  const sendsAfterTick = bot.registry.version['>=']('26.3')
  // the player turned to where an entity it uses faces (a horse it climbs on before 1.17: AbstractHorse.doPlayerRide)
  bot._turnToDegrees = (yaw, pitch) => setAngleDegrees(bot, yaw, pitch, false)

  // 1.16's Player.rideTick: a rider whose shift key was down after its last tick stops riding on its own (wantsToStopRiding,
  // without the server), lets go of the shift key and ticks on foot from there; the server's dismount comes later
  let riderShiftDown = false
  function stopsRidingOnClient () {
    return bot.registry.version['>=']('1.16') && bot.registry.version['<']('1.17') && riderShiftDown && bot.vehicle != null && bot.entity.vehicle != null
  }

  // the client ticks counted, to know a push of the tick before
  let clientTicks = 0

  // 1.8's boat its player rides is moved by that player's client too (EntityBoat.onUpdate, isBoatEmpty false from
  // NetHandlerPlayClient.handleEntityAttach): pushed by the walk input its rider's tick before left, along the rider's
  // yaw. The server's moves of it within a block go unheeded (entities.js); the rider sits where the client has it.
  let legacyRiderInput = { forward: 0, strafe: 0 }
  function drivesLegacyBoat (vehicle) {
    return !!boatPhysics?.simulateLegacy && !bot.registry.version['>=']('1.9') && isBoatEntity(vehicle) && !!vehicle.legacyBoatDriven
  }

  // EntityPlayerSP's moveForward / moveStrafing after its tick: the keys' 1.0F (0.3F of it sneaking), times 0.98F
  function riderWalkInput () {
    const f32 = Math.fround
    const sneak = controlState.sneak ? f32(0.3) : 1
    const forward = f32((controlState.forward ? 1 : 0) - (controlState.back ? 1 : 0))
    const strafe = f32((controlState.left ? 1 : 0) - (controlState.right ? 1 : 0))
    return { forward: f32(f32(forward * sneak) * f32(0.98)), strafe: f32(f32(strafe * sneak) * f32(0.98)) }
  }

  function tickLegacyBoat (vehicle) {
    ensureVehicleRotationDefaults(vehicle)
    const entityType = bot.registry.entitiesByName[vehicle.name] ?? bot.registry.entitiesByName.Boat
    const state = BoatState.CREATE_FROM_ENTITY(boatPhysics, vehicle, ControlStateHandler.DEFAULT())
    state.box = vehicle.legacyBoatBox
    state.speedMultiplier = vehicle.legacyBoatSpeed ?? 0.07
    state.isCollidedHorizontally = !!vehicle.isCollidedHorizontally
    const ctx = EPhysicsCtx.FROM_ENTITY_STATE(boatPhysics, state, entityType)
    const yaw = bot.entity.yawDegrees != null ? Number(bot.entity.yawDegrees) : Math.fround(conv.toNotchianYaw(bot.entity.yaw))
    boatPhysics.simulateLegacy(ctx, world, { yaw, forward: legacyRiderInput.forward, strafe: legacyRiderInput.strafe })
    state.applyToEntity(vehicle)
    vehicle.legacyBoatBox = state.box
    vehicle.legacyBoatSpeed = state.speedMultiplier
    vehicle.interpolatedPosition?.set(vehicle.position.x, vehicle.position.y, vehicle.position.z)
    bot.emit('entityMoved', vehicle)
  }

  function tickPlayer (now) {
    clientTicks++
    advanceGameTime()
    bot.entity.leftVehicle = null
    if (stopsRidingOnClient()) {
      // (Player.rideTick stops riding in the passenger's tick, after its vehicle's: the vehicle it steers ticks first,
      // a boat telling its paddles, a mount travelling on)
      if (isHorseController() && ensureHorseContext() && !horsePhysicsDisabled) {
        applyPendingHorseCorrection()
        syncControlsToHorseState()
        horsePhysics.simulate(horseCtx, world)
        if (horseCtx.state.worldReady) {
          horseCtx.state.applyToEntity(bot.vehicle)
          bot.emit('entityMoved', bot.vehicle)
        }
      } else if (!isBoatController() && !isHorseController() && isRiddenMobController()) {
        // (still controlled in its tick: LivingEntity.aiStep's setPacketCoordinates where it starts, before 1.21.2)
        if (bot.entityInterpolation && bot.vehicle && !bot.registry.version['>=']('1.21.2')) bot.entityInterpolation.control(bot.vehicle)
        tickRiddenMob()
      }
      if (isBoatController() && ensureBoatContext() && !boatPhysicsDisabled) {
        applyPendingBoatCorrection()
        boatPhysics.simulate(boatCtx, world)
        if (boatCtx.state.worldReady) {
          bot._client.write('steer_boat', boatPhysics.getPaddleState(boatCtx.state))
          boatCtx.state.applyToEntity(bot.vehicle)
          bot.emit('entityMoved', bot.vehicle)
        }
        syncControlsToBoatState()
      }
      const vehicle = bot.vehicle
      bot._stopRidingOnClient?.()
      riderShiftDown = false
      // (it pushed in its tick, the player still its passenger: no push from it this tick, physics-utils' sameVehicle)
      bot.entity.leftVehicle = vehicle
      // (the player, skipped as a passenger when its entry came before its vehicle's, is not ticked that tick: it left
      // the vehicle in the vehicle's tick, ClientLevel.tickPassenger; it is when its entry comes after the vehicle's)
      if (vehicle && !ticksBeforePlayer(vehicle.id)) {
        bot.emit('clientTickWithoutPlayer')
        return writeTickEnd()
      }
    }
    riderShiftDown = false
    const timestep = physicsTimestep
    const onVehicle = bot.vehicle && bot.entity.vehicle
    const boatController = onVehicle && isBoatController()
    const horseController = onVehicle && isHorseController()
    const riddenController = onVehicle && !boatController && !horseController && isRiddenMobController()
    let playerTicked = false

    if (boatCtx && !boatController) {
      destroyBoatContext()
    }
    if (horseCtx && !horseController) {
      destroyHorseContext()
    }
    if (riddenCtx && !riddenController) {
      destroyRiddenContext()
    }

    const horsePassengerSync =
      onVehicle &&
      isHorsePhysicsVersion() &&
      isRideableHorseEntity(bot.vehicle)

    // the horses' stand animations (the one the bot steers ticks with its ridden state)
    tickHorseStandAnimations(riddenController ? bot.vehicle : null)

    // the vehicle ticks before its passenger: a step of its interpolation toward the server's moves; before 1.21.2 one
    // the client controls is where the client moves it (Entity.isControlledByLocalInstance)
    // (a mount the bot takes control of this tick goes on with the interpolation it was in, not yet stepped)
    if (riddenController) ensureRiddenContext()
    if (onVehicle && drivesLegacyBoat(bot.vehicle)) tickLegacyBoat(bot.vehicle)
    else if (bot.entityInterpolation && bot.vehicle) {
      if ((boatController || horseController || riddenController) && !bot.registry.version['>=']('1.21.2')) bot.entityInterpolation.control(bot.vehicle)
      else {
        // (26.3: the stepped interpolation of the mount the bot steers goes on from where the mount moved to, and puts it
        // at its step before its travel: Entity.commonTick before LivingEntity.aiStep)
        const steered = riddenController && riddenCtx && riddenVehicleId === bot.vehicle.id && bot.registry.version['>=']('26.3')
        const stepping = steered && bot.vehicle.interpolation?.stepped?.steps.length > 0
        if (stepping) bot.entityInterpolation.steppedFollow?.(bot.vehicle, riddenCtx.state.pos, riddenCtx.state.yawDegrees)
        bot.entityInterpolation.tick(bot.vehicle)
        if (stepping) {
          const p = bot.vehicle.interpolatedPosition
          riddenCtx.state.pos.set(p.x, p.y, p.z)
        }
        bot.entityInterpolation.turnBody?.(bot.vehicle)
      }
    }

    // the passenger is seated on its vehicle; the rider of a mount it steers has its own tick (its sprint, its move) once,
    // after the mount's (Entity.rideTick after the vehicle's tick), below
    if (onVehicle && !boatController) {
      if (horsePassengerSync) {
        syncEntityWithHorse(!riddenController)
      } else {
        syncEntityWithVehicle(!riddenController)
      }
    }

    const playerTicks = tickClientLoad() && chunkTicks()
    // a player the client does not tick still ends the client tick
    if (!playerTicks) {
      // (its keys are handled as ever: a dig goes on, Minecraft.handleKeybinds runs while the level loads)
      bot.emit('clientTickWithoutPlayer')
      return writeTickEnd()
    }

    // LivingEntity.tickDeath: a dead player keeps moving and sending until its 20th tick removes it
    const removed = isEntityRemoved()
    // that 20th tick removes it before it moves: from 1.19.1 it does not move (LivingEntity.tick skips aiStep), 1.17 -
    // 1.19 its move stops after the collision (Entity.move: isRemoved)
    const removedThisTick = deadTicks === 20 && bot.registry.version['>=']('1.17')
    const staysStill = removedThisTick && bot.registry.version['>=']('1.19.1')
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

      // a look within reach is reached exactly (adding the wrapped difference would leave it off by a rounding, and the
      // look would no longer go as the degrees the player holds)
      lastSentYaw = Math.abs(dYaw) <= maxDeltaYaw ? bot.entity.yaw : lastSentYaw + math.clamp(-maxDeltaYaw, dYaw, maxDeltaYaw)
      lastSentPitch = Math.abs(dPitch) <= maxDeltaPitch ? bot.entity.pitch : lastSentPitch + math.clamp(-maxDeltaPitch, dPitch, maxDeltaPitch)
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
      } else if (riddenController) {
        // the mount ticks before its rider, then the rider's aiStep gives it its input for the next tick
        tickRiddenMob()
        syncEntityWithVehicle()
        riderTickForRiddenMob()
      } else if (onVehicle) {
        // a mount the rider does not steer (unsaddled): the rider's aiStep still sets its input, which the mount moves
        // on at the next tick it is steered (LocalPlayer.aiStep)
        const name = vehicleName(bot.vehicle)
        keepRiderInput(name === 'camel' || name === 'camel_husk' ? 'camel' : name)
        // before 1.9 the server alone moves a saddled horse: its rider charges its jump and tells the server
        // (EntityPlayerSP.onLivingUpdate: isRidingHorse, sendHorseJump)
        if (!bot.registry.version['>=']('1.9') && isRideableHorseEntity(bot.vehicle) && horseSaddleFlag(bot.vehicle, bot.registry)) chargeRiderJump()
      } else if (!onVehicle && !staysStill) {
        // the attached rockets boost while they exist (the engine spends a tick of boost per tick)
        if (bot.fireworkRockets > 0) bot.fireworkRocketDuration = 1
        bot.fireworkRocketsBeforePlayer = fireworkRocketsBeforePlayer()
        ectx ??= EPhysicsCtx.FROM_BOT(physics, bot, settings)
        ectx.state.update(bot)
        ectx.state.removed = removedThisTick

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
        const wasFlying = s.flying

        physics.simulate(ectx, world).apply(bot)
        playerTicked = true
        // the mobs that pushed the player were pushed back (Entity.push): what each carries into its next tick
        for (const { id, x, z } of ectx.state.pushedEntities ?? []) {
          const entity = bot.entities[id]
          if (entity) entity.lastPush = { x: (entity.lastPush?.tick === clientTicks ? entity.lastPush.x : 0) + x, z: (entity.lastPush?.tick === clientTicks ? entity.lastPush.z : 0) + z, tick: clientTicks }
        }

        // LocalPlayer.aiStep: flying turned on or off by a second press of jump, by landing or by the spectator mode
        // tells the server (onUpdateAbilities)
        if (ectx.state.flying !== wasFlying) sendAbilities(ectx.state.flying)

        glideRequested = bot.registry.version['<']('1.15') ? legacyGlideRequest : !wasFallFlying && ectx.state.fallFlying

        // 4. Restore target yaw/pitch so the bot doesn't forget where it's trying to look
        bot.entity.yaw = targetYaw
        bot.entity.pitch = targetPitch
      }

      bot.emit('entityPhysicsTick')
    }

    // LocalPlayer.sendPosition ends the player's tick; from 26.3 the client sends its changes once every entity and block
    // entity ticked (Minecraft.tick: LocalPlayer.sendChanges), after the boat turned its rider and the pistons pushed it
    if (!sendsAfterTick && shouldUsePhysics && !removed) updatePosition(now)
    if (bot.physicsEnabled && shouldUsePhysics && bot.entity.vehicle && isBoatController()) turnPassengerWithBoat()

    // the other entities tick after the player: a step of their interpolation toward the server's moves
    if (bot.entityInterpolation) {
      for (const entity of Object.values(bot.entities)) {
        if (entity !== bot.entity && entity !== bot.vehicle) {
          bot.entityInterpolation.tick(entity)
          bot.entityInterpolation.turnBody?.(entity)
        }
      }
      // where each entity is shown changed for this tick (a renderer draws between its last two, as the game does)
      bot.emit('entityInterpolationTick')
    }

    // the moving pistons tick after the player (and after it sent its position) and push it
    // (PistonMovingBlockEntity.tick)
    if (playerTicked && physics.pushByMovingPiston) {
      movingPistons.tick((piston) => physics.pushByMovingPiston(ectx, world, piston), ([x, y, z], stateId) => bot.world.setBlockStateId(new Vec3(x, y, z), stateId))
      ectx.state.apply(bot)
    }

    if (sendsAfterTick && shouldUsePhysics && !removed) updatePosition(now)

    // move this afterward to sync inputs.
    if (bot.physicsEnabled && shouldUsePhysics) {
      bot.emit('physicsTick')
      bot.emit('physicTick') // Deprecated, only exists to support old plugins. May be removed in the future
    }

    // (the shift key the rider's aiStep left down)
    riderShiftDown = !!bot.entity.vehicle && !!controlState.sneak
    // (and, before 1.9, the walk input it left for the boat it rides: moveForward / moveStrafing, 0.98F of the keys')
    legacyRiderInput = riderWalkInput()
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
    if (bot.game.gameMode === 'spectator' || !isPlayerAlive()) return true
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
  // (setPosToBed: the block's centre, 0.6875 up). The metadata index: 12 on 1.14, 13 on 1.15 - 1.16 (after the bee
  // stingers), 14 since (after the frozen ticks).
  const sleepingPosKey = bot.registry.version['<']('1.15') ? 12 : bot.registry.version['<']('1.17') ? 13 : 14
  let sleeping = false
  bot._client.on('entity_metadata', (packet) => {
    if (!bot.registry.version['>=']('1.14') || packet.entityId !== bot.entity?.id) return
    const entry = packet.metadata.find(entry => entry.key === sleepingPosKey)
    if (!entry) return
    const bed = entry.value
    sleeping = bed != null && typeof bed === 'object'
    if (sleeping) bot.entity.position.set(bed.x + 0.5, Math.fround(bed.y + 0.6875), bed.z + 0.5)
    // (bot.isSleeping, where the entity metadata names are unknown)
    if (sleeping && !bot.isSleeping) bot.emit('entitySleep', bot.entity)
  })
  // the wake-up animation the server sends stops the client's sleep (ClientPacketListener.handleAnimate)
  bot.on('entityWake', (entity) => {
    if (entity === bot.entity) sleeping = false
  })
  // before 1.14 the server puts the player to sleep with its own packet: Player.startSleepInBed sets it on the bed,
  // 0.4 toward the bed's head (float arithmetic)
  bot._client.on('bed', (packet) => {
    if (bot.registry.version['>=']('1.14') || packet.entityId !== bot.entity?.id) return
    const { x, y, z } = packet.location
    const facing = bot.blockAt(new Vec3(x, y, z))?.getProperties().facing
    const [dx, dz] = { east: [1, 0], west: [-1, 0], south: [0, 1], north: [0, -1] }[facing] ?? [0, 0]
    const f32 = Math.fround
    bot.entity.position.set(f32(x + f32(0.5 + f32(dx * 0.4))), f32(y + 0.6875), f32(z + f32(0.5 + f32(dz * 0.4))))
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
  // the level the player is in: its dimension before 1.16, then the level's name
  let level = null
  const levelOf = (packet) => {
    const info = packet.worldState ?? packet
    return bot.registry.version['<']('1.16') ? info.dimension : info.name ?? info.worldName
  }
  bot._client.on('login', (packet) => { level = levelOf(packet) })
  bot._client.prependListener('respawn', (packet) => {
    const flags = typeof packet.copyMetadata === 'number' ? packet.copyMetadata : packet.copyMetadata ? 3 : 0
    const keepsData = bot.registry.version['>=']('1.21.2') && (flags & 2) !== 0
    const keepsRotation = keepsData && bot.entity.yawDegrees !== undefined
    respawnRotation = keepsRotation ? [bot.entity.yawDegrees.valueOf(), bot.entity.pitchDegrees.valueOf()] : [-180, 0]
    keepsMotion = keepsRotation
    // a new player has not died, and Player.resetPos heals it (not one keeping the old one's data from 1.21.2): it
    // lives again before the server's health update
    deadTicks = 0
    if (!keepsData) entityHealth = 20
    // the new player stands, off the ground, at the level's spawn (Player's constructor; at 0, 0, 0 from 1.21.6): a new
    // level's is 8, 64, 8 (ClientLevel), as every respawn sets it before 1.14 (World.setInitialSpawnLocation); then
    // Player.resetPos lifts it out of the blocks (not one keeping the old one's data, from 1.21.2), until the server's
    // teleport
    const newLevel = levelOf(packet) !== level
    level = levelOf(packet)
    const spawn = bot.registry.version['<']('1.14') || newLevel ? new Vec3(8, 64, 8) : bot.spawnPoint
    bot.entity.position.set(...(bot.registry.version['<']('1.21.6') ? [spawn.x + 0.5, spawn.y + 1, spawn.z + 0.5] : [0, 0, 0]))
    bot.entity.onGround = false
    delete bot.entity.lastOnGround // (the engine's record of the old player's ground contact)
    if (!keepsData) resetPos(newLevel)
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

  // Player.resetPos: up from where it stands to the first place it does not collide with the blocks (a new level has
  // none), inside the level's height
  function resetPos (emptyLevel) {
    const { position } = bot.entity
    const minY = bot.game.minY ?? 0
    const maxY = minY + (bot.game.height ?? 256)
    for (let y = position.y; y > minY && y < maxY; y++) {
      position.y = y
      if (emptyLevel || !collidesWithBlocks(position)) break
    }
  }

  // Whether a standing player at the position overlaps a block's collision shape
  function collidesWithBlocks ({ x, y, z }) {
    const box = [x - 0.3, y, z - 0.3, x + 0.3, y + 1.8, z + 0.3]
    for (let bx = Math.floor(box[0]); bx <= Math.floor(box[3]); bx++) {
      for (let by = Math.floor(box[1]) - 1; by <= Math.floor(box[4]); by++) {
        for (let bz = Math.floor(box[2]); bz <= Math.floor(box[5]); bz++) {
          const block = bot.blockAt(new Vec3(bx, by, bz))
          for (const shape of block?.shapes ?? []) {
            if (bx + shape[0] < box[3] && bx + shape[3] > box[0] && by + shape[1] < box[4] && by + shape[4] > box[1] &&
              bz + shape[2] < box[5] && bz + shape[5] > box[2]) return true
          }
        }
      }
    }
    return false
  }

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
    // from 1.21.2 a steered mob easing to a teleport reports where it is headed (ServerboundMoveVehiclePacket.fromEntity)
    const reported = riddenCtx != null && riddenVehicleId === vehicle.id && bot.registry.version['>=']('1.21.2')
      ? riddenMobPhysics.lerpTargetOf(riddenCtx.state)
      : vehicle.position
    let x = reported.x
    let y = reported.y
    let z = reported.z
    // a ridden horse turns with its rider (AbstractHorse.travel; getRiddenRotation from 1.20.2): the rider's float
    // yaw and half its pitch; so does a mob it steers (tickRidden's setRot, within a turn)
    const riddenHorse = isRideableHorseEntity(vehicle)
    const riddenMob = riddenCtx != null && riddenVehicleId === vehicle.id
    let yaw = riddenHorse ? sentYawDegrees() : Math.fround(conv.toNotchianYaw(vehicle.yaw))
    // (a pitch of 0 is never -0: the float the vehicle holds)
    let pitch = riddenHorse ? Math.fround(sentPitchDegrees() * 0.5) : Math.fround(conv.toNotchianPitch(vehicle.pitch)) + 0
    if (riddenMob) {
      // (its own rotation: a camel that refuses to move keeps its own pitch, tickRidden)
      yaw = riddenCtx.state.yawDegrees
      pitch = riddenCtx.state.pitchDegrees
      // from 1.21.5 the rotation the mount's interpolation heads to while it runs (Entity.lerpTargetYRot / XRot)
      const state = riddenCtx.state
      if (bot.registry.version['>=']('1.21.5') && state.lerpSteps > 0 && state.lerpYaw != null) ({ yaw, pitch } = riddenMobPhysics.lerpTargetRotationOf(state))
      // (26.3: the end and rotation of the stepped interpolation it is in)
      const stepped = bot.registry.version['>=']('26.3') ? bot.entityInterpolation?.steppedTarget?.(vehicle) : null
      if (stepped) {
        x = stepped.position.x
        y = stepped.position.y
        z = stepped.position.z
        if (stepped.yaw != null) yaw = Math.fround(stepped.yaw)
        if (stepped.pitch != null) pitch = Math.fround(stepped.pitch) + 0
      }
    }
    if (![x, y, z, yaw, pitch].every(Number.isFinite)) return

    // the vehicle's ground contact goes with it from 1.21.4 (ServerboundMoveVehiclePacket.fromEntity)
    bot._client.write('vehicle_move', { x, y, z, yaw, pitch, onGround: !!vehicle.onGround })
  }

  // Whether the client ticks the entity before the player: 1.14 - 1.16 tick the entities of a fastutil
  // Int2ObjectOpenHashMap (32 slots for a few entities, linear probing, the player then the others in id order) from
  // the last slot down (ClientLevel.tickEntities); before 1.14 and since 1.17 the player comes first.
  function ticksBeforePlayer (id) {
    if (bot.registry.version['<']('1.14') || bot.registry.version['>=']('1.17')) return false
    const ids = Object.values(bot.entities).map(e => e.id).filter(other => other !== bot.entity.id).sort((a, b) => a - b)
    let size = 32
    while (ids.length + 1 >= size * 0.75) size *= 2
    const taken = new Set()
    const slots = new Map()
    for (const entityId of [bot.entity.id, ...ids]) {
      const h = Math.imul(entityId, 0x9E3779B9 | 0)
      let slot = (h ^ (h >>> 16)) & (size - 1)
      while (taken.has(slot)) slot = (slot + 1) & (size - 1)
      taken.add(slot)
      slots.set(entityId, slot)
    }
    return slots.get(id) > slots.get(bot.entity.id)
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

  // LivingEntity.isAlive: by the health the client's player holds. A respawn's new player has its own (its max health,
  // unless it keeps the old one's data) until the server's health update, which can come ticks later: it waits for the
  // level as a living player does (LevelLoadStatusManager.tick).
  function isPlayerAlive () {
    return entityHealth != null ? entityHealth > 0 : bot.isAlive !== false
  }

  function isEntityRemoved () {
    const dead = !isPlayerAlive()
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
      // before 1.21.2 the shift key goes with the position (LocalPlayer.sendPosition), which a passenger does not send
      if (bot.entity.vehicle && !bot.registry.isNewerOrEqualTo('1.21.2')) return
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

    // riding a mount or boat it steers, the client tells its sprint after the vehicle's move (LocalPlayer.tick)
    const riddenMount = !!bot.entity.vehicle && riddenCtx != null && riddenVehicleId === bot.vehicle?.id
    const steeredBoat = !!bot.entity.vehicle && isBoatController()
    const sendSprint = sprinting => {
      if (lastSent.sprintState === sprinting) return
      bot._client.write('entity_action', {
        entityId: bot.entity.id,
        actionId: sprinting ? 'start_sprinting' : 'stop_sprinting',
        jumpBoost: 0
      })
      lastSent.sprintState = sprinting
    }
    if (!riddenMount && !steeredBoat) sendSprint(actualSprint)
    if (!shiftKeySentFirst) sendShiftKeyState()

    const yaw = sentYawDegrees()
    const pitch = sentPitchDegrees()
    const position = bot.entity.position
    const onGround = bot.entity.onGround
    const hasHorizontalCollision = getHorizontalCollision()

    const dx = position.x - lastSent.x
    const dy = position.y - lastSent.y
    const dz = position.z - lastSent.z
    // a passenger sends its look alone and leaves the record of what it last sent as a walking player (position, look,
    // ground contact, positionReminder) as it was (LocalPlayer.sendChanges: sendPosition only off a vehicle)
    const onVehicle = !!bot.entity.vehicle
    if (positionReminderCountsFirst && !onVehicle) lastSent.positionReminder++
    const positionUpdated =
      (dx * dx + dy * dy + dz * dz > MIN_DELTA_DIST_SQUARED) ||
      lastSent.positionReminder >= POSITION_REMINDER_TICKS
    if (!positionReminderCountsFirst && !onVehicle) lastSent.positionReminder++

    const lookUpdated = lastUpdated.yaw !== yaw || lastUpdated.pitch !== pitch

    const onBoat = isBoatEntity(bot.vehicle)
    const boatController = onVehicle && isBoatController()
    const horseController = onVehicle && isHorseController()
    // (ServerboundPaddleBoatPacket came with 1.9)
    if (needsLegacyBoatPackets() && bot.registry.isNewerOrEqualTo('1.9')) {
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

    if (sendLook && onVehicle) {
      if (!bot.inConfigurationPhase) {
        bot._client.write('look', { ...lastSent, yaw, pitch, onGround, flags: { onGround, hasHorizontalCollision } })
        // (the bot goes where its vehicle takes it: a move, from where it last sent its position)
        bot.emit('move', new Vec3(lastSent.x, lastSent.y, lastSent.z))
      }
    } else if (sendLook) {
      sendPacketLook(yaw, pitch, onGround, hasHorizontalCollision)
    }

    if (onVehicle) {
      if (boatController) {
        if (boatTickPacketsReady) {
          // (from 1.19.3 LocalPlayer.tick: sendIsSprintingIfNeeded after the boat's move, the rider's sprint, which
          // before 1.19.4 the sprint key and a forward input start; before, a rider does not tell its sprint)
          if (sendControlledBoatPackets() && bot.registry.isNewerOrEqualTo('1.19.3')) sendSprint(!!bot.entity.sprinting)
        }
      } else if (horseController) {
        if (horseTickPacketsReady) {
          sendControlledHorsePackets()
        }
      } else if (isServerAuthoritativeMinecart(bot.vehicle)) {
        sendPacketSteerVehicle()
      } else if (!canUseLocalBoatPhysics() || !onBoat) {
        if (riddenMount || controlsMount(bot.vehicle)) {
          sendPacketVehicleMove()
          // (from 1.19.3 LocalPlayer.tick: sendIsSprintingIfNeeded after the vehicle's move, the rider's own sprint, which
          // from 1.19.4 only a camel's rider starts; before, a rider does not tell its sprint)
          if (riddenMount) sendSprint(bot.registry.isNewerOrEqualTo('1.19.3') && !!bot.entity.sprinting)
        } else {
          // a mount the bot does not control (an unsaddled horse, a pig without the stick, a happy ghast out of its
          // harness...): the client moves nothing and tells only its input (LocalPlayer.sendChanges); a server from 26.3
          // puts the vehicle back for a move it gets from a passenger that does not control it
          sendPacketSteerVehicle()
        }
      }
    }

    if (lookUpdated && !onVehicle) {
      lastUpdated.yaw = yaw
      lastUpdated.pitch = pitch
    }

    if (!onVehicle) lastSent.onGround = bot.entity.onGround
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
    // sneaking while riding asks to dismount with the shift of the tick's input (LocalPlayer.tick's input packet), not
    // with a packet of its own
    if (control === 'sneak' && state === true && bot.vehicle) bot._requestDismount?.()
    if (control === 'sneak' && state === false && bot.vehicle) bot._cancelDismountRequest?.()

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
    if (packet.dismountVehicle === true && bot.vehicle) {
      const previousVehicle = bot.vehicle
      bot.vehicle = null
      delete bot.entity.vehicle
      // (the dismount lets go of the vehicle the bot controlled, shown where the client moved it last, then drops its
      // contexts)
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

    // ClientPacketListener.handleMovePlayer answers straight on the connection: a position_look of where it is now,
    // not on the ground, without changing the last position LocalPlayer sent (1.21.2 - 1.21.3 send it before the
    // teleport confirm). From 26.3 the confirm itself carries where the player is now and its rotation, and no
    // position_look follows it.
    const answerFirst = bot.registry.version['>=']('1.21.2') && bot.registry.version['<']('1.21.4')
    const confirmCarriesPosition = bot.registry.version['>=']('26.3')
    if (answerFirst) writePositionLookAnswer(pos, newYaw, newPitch)
    if (confirmCarriesPosition) {
      bot._client.write('teleport_confirm', { teleportId: packet.teleportId, x: pos.x, y: pos.y, z: pos.z, yaw: newYaw, pitch: newPitch })
    } else if (bot.supportFeature('teleportUsesOwnPacket')) {
      bot._client.write('teleport_confirm', { teleportId: packet.teleportId })
    }

    if (!answerFirst && !confirmCarriesPosition) writePositionLookAnswer(pos, newYaw, newPitch)

    shouldUsePhysics = true
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
    addToChunk()
    startLevelLoad()
    destroyBoatContext()
    destroyHorseContext()
  })
  bot.on('login', () => {
    shouldUsePhysics = false
    addToChunk()
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

  // the mob the bot rides and steers (a saddled horse, pig, strider, camel...), moved by RiddenMobPhysics
  bot._riddenMobPhysics = {
    getCtx () { return riddenCtx },
    // the bot rides and steers this mob: its client moves it (Entity.isLocalInstanceAuthoritative)
    controls (vehicle) { return vehicle != null && vehicle === bot.vehicle && riddenMobType(vehicle) != null && controlsMount(vehicle) }
  }
}

module.exports = inject
