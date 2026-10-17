const { Vec3 } = require('vec3')
const conv = require('../conversions')
const { performance } = require('perf_hooks')
const mojangson = require('mojangson')
const { createEntityInterpolation } = require('../entityInterpolation')
const { horseSaddleFlag } = require('../horse')
// These values are only accurate for versions 1.14 and above (crouch hitbox changes)
// Todo: hitbox sizes for sleeping, swimming/crawling, and flying with elytra
const PLAYER_HEIGHT = 1.8
const CROUCH_HEIGHT = 1.5
const PLAYER_WIDTH = 0.6
const PLAYER_EYEHEIGHT = 1.62
const CROUCH_EYEHEIGHT = 1.27

module.exports = inject

// export constants for reuse
module.exports.PLAYER_HEIGHT = PLAYER_HEIGHT
module.exports.CROUCH_HEIGHT = CROUCH_HEIGHT
module.exports.PLAYER_WIDTH = PLAYER_WIDTH
module.exports.PLAYER_EYEHEIGHT = PLAYER_EYEHEIGHT
module.exports.CROUCH_EYEHEIGHT = CROUCH_EYEHEIGHT

const animationEvents = {
  0: 'entitySwingArm',
  1: 'entityHurt',
  2: 'entityWake',
  3: 'entityEat',
  4: 'entityCriticalEffect',
  5: 'entityMagicCriticalEffect'
}
// 26.3 moved the swings to swing_animation and numbered the rest anew (ClientboundAnimatePacket)
const animationEvents263 = {
  0: 'entityWake',
  1: 'entityCriticalEffect',
  2: 'entityMagicCriticalEffect'
}

const entityStatusEvents = {
  2: 'entityHurt',
  3: 'entityDead',
  6: 'entityTaming',
  7: 'entityTamed',
  8: 'entityShakingOffWater',
  10: 'entityEatingGrass',
  55: 'entityHandSwap'
}

function inject (bot) {
  const { mobs } = bot.registry
  const Entity = require('prismarine-entity')(bot.version)
  const Item = require('prismarine-item')(bot.version)
  const ChatMessage = require('prismarine-chat')(bot.registry)
  // where the vanilla client shows the entities it does not control (entity.interpolatedPosition)
  const interpolation = createEntityInterpolation(bot.registry)
  bot.entityInterpolation = interpolation
  bot.on('entitySpawn', (entity) => interpolation.spawn(entity))
  const rotationOf = (packet) => packet.yaw != null && packet.pitch != null ? { yaw: packet.yaw * 360 / 256, pitch: packet.pitch * 360 / 256 } : undefined

  // ONLY 1.17 has this destroy_entity packet which is the same thing as entity_destroy packet except the entity is singular
  // 1.17.1 reverted this change so this is just a simpler fix
  bot._client.on('destroy_entity', (packet) => {
    bot._client.emit('entity_destroy', { entityIds: [packet.entityId] })
  })

  bot.findPlayer = bot.findPlayers = (filter) => {
    const filterFn = (entity) => {
      if (entity.type !== 'player') return false
      if (filter === null) return true
      if (typeof filter === 'object' && filter instanceof RegExp) {
        return entity.username.search(filter) !== -1
      } else if (typeof filter === 'function') {
        return filter(entity)
      } else if (typeof filter === 'string') {
        return entity.username.toLowerCase() === filter.toLowerCase()
      }
      return false
    }
    const resultSet = Object.values(bot.entities)
      .filter(filterFn)

    if (typeof filter === 'string') {
      switch (resultSet.length) {
        case 0:
          return null
        case 1:
          return resultSet[0]
        default:
          return resultSet
      }
    }
    return resultSet
  }

  bot.players = {}
  bot.uuidToUsername = {}
  bot.entities = {}

  bot._playerFromUUID = (uuid) => Object.values(bot.players).find(player => player.uuid === uuid)

  bot.nearestEntity = (match = (entity) => { return true }) => {
    let best = null
    let bestDistance = Number.MAX_VALUE

    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity || !match(entity)) {
        continue
      }

      const dist = bot.entity.position.distanceSquared(entity.position)
      if (dist < bestDistance) {
        best = entity
        bestDistance = dist
      }
    }

    return best
  }

  bot._client.on('login', (packet) => {
    bot.players = {}
    bot.uuidToUsername = {}
    // login
    bot.entity = fetchEntity(packet.entityId)
    bot.username = bot._client.username
    bot.entity.username = bot._client.username
    bot.entity.type = 'player'
    bot.entity.name = 'player'
    bot.entity.height = PLAYER_HEIGHT
    bot.entity.width = PLAYER_WIDTH
    bot.entity.eyeHeight = PLAYER_EYEHEIGHT
  })

  // Reset list of players and entities on world switch (login or respawn packet)
  bot.on('worldSwitch', () => {
    removeAllEntities()
    bot.entities = {}
  })

  bot._client.on('entity_equipment', (packet) => {
    // entity equipment
    const entity = fetchEntity(packet.entityId)
    if (packet.equipments !== undefined) {
      packet.equipments.forEach(equipment => entity.setEquipment(equipment.slot, equipment.item ? Item.fromNotch(equipment.item) : null))
    } else {
      entity.setEquipment(packet.slot, packet.item ? Item.fromNotch(packet.item) : null)
    }
    bot.emit('entityEquip', entity)
  })

  const removeAllEntities = () => {
    for (const entity of Object.values(bot.entities ?? {})) {
      // refactor to function
      bot.emit('entityGone', entity)
      entity.isValid = false
      if (entity.uuid) {
        const player = bot._playerFromUUID(entity.uuid)
        if (player) player.entity = null
      }
      delete bot.entities[entity.id]
    }
  }

  bot._client.on('bed', (packet) => {
    // use bed
    const entity = fetchEntity(packet.entityId)
    entity.position.set(packet.location.x, packet.location.y, packet.location.z)
    bot.emit('entitySleep', entity)
  })

  bot._client.on('animation', (packet) => {
    // animation
    const entity = fetchEntity(packet.entityId)
    const eventName = (bot.registry.version['>=']('26.3') ? animationEvents263 : animationEvents)[packet.animation]
    if (eventName) bot.emit(eventName, entity)
    // the server swings the player's own arm (a use only it carries out, InteractionResult.SUCCESS_SERVER): the client
    // swings as told, which before 26.3 sends the swing back (ClientPacketListener.handleAnimate, LocalPlayer.swing)
    // (3: the off hand's swing from 1.9; 1.8 numbers eating 3)
    const offHandSwing = packet.animation === 3 && bot.registry.version['>=']('1.9')
    if (entity === bot.entity && !bot.registry.version['>=']('26.3') && (packet.animation === 0 || offHandSwing)) {
      bot.swingArm(offHandSwing ? 'left' : 'right')
    }
  })

  // 26.3+: a swing has its own packet (ClientPacketListener.handleSwingAnimation)
  bot._client.on('swing_animation', (packet) => {
    bot.emit('entitySwingArm', fetchEntity(packet.entityId))
  })

  bot.on('entityCrouch', (entity) => {
    entity.eyeHeight = CROUCH_EYEHEIGHT
    entity.height = CROUCH_HEIGHT
  })

  bot.on('entityUncrouch', (entity) => {
    entity.eyeHeight = PLAYER_EYEHEIGHT
    entity.height = PLAYER_HEIGHT
  })

  bot._client.on('collect', (packet) => {
    // collect item
    const collector = fetchEntity(packet.collectorEntityId)
    const collected = fetchEntity(packet.collectedEntityId)
    bot.emit('playerCollect', collector, collected)
  })

  // What is internalId?
  const entityDataByInternalId = Object.fromEntries(bot.registry.entitiesArray.map((e) => [e.internalId, e]))

  function setEntityData (entity, type, entityData) {
    entityData ??= entityDataByInternalId[type]
    if (entityData) {
      entity.type = entityData.type || 'object'
      entity.displayName = entityData.displayName
      entity.entityType = entityData.id
      entity.name = entityData.name
      entity.kind = entityData.category
      entity.height = entityData.height
      entity.width = entityData.width
    } else {
      // unknown entity
      entity.type = 'other'
      entity.entityType = type
      entity.displayName = 'unknown'
      entity.name = 'unknown'
      entity.kind = 'unknown'
    }
  }

  function updateEntityPos (entity, pos) {
    if (bot.supportFeature('fixedPointPosition')) {
      entity.position.set(pos.x / 32, pos.y / 32, pos.z / 32)
    } else if (bot.supportFeature('doublePosition')) {
      entity.position.set(pos.x, pos.y, pos.z)
    }
    entity.yaw = conv.fromNotchianYawByte(pos.yaw)
    entity.pitch = conv.fromNotchianPitchByte(pos.pitch)
    if (typeof pos.headPitch === 'number' && Number.isFinite(pos.headPitch)) {
      // The field is called headPitch in the protocol schema, but stores the
      // horizontal head rotation for living entities in unified spawn packets.
      entity.headYaw = conv.fromNotchianYawByte(pos.headPitch)
    }
  }

  function updateEntityVelocity (entity, velocity, emitEvent = true) {
    entity.velocity.update(velocity)
    if (emitEvent) bot.emit('entityVelocity', entity)
  }

  function parseEntityVelocity (packet) {
    // older schemas name the axes velocityX/Y/Z instead of a velocity object
    const velocity = packet.velocity ?? { x: packet.velocityX, y: packet.velocityY, z: packet.velocityZ }
    const parsedVelocity = new Vec3(velocity.x, velocity.y, velocity.z)
    return bot.supportFeature('entityVelocityIsLpVec3')
      ? parsedVelocity
      : conv.fromNotchVelocity(parsedVelocity)
  }

  function updateEntityRelativeMove (entity, packet) {
    // the packet position the client keeps (the 1/32 or 1/4096 units add up as vanilla's codec does)
    const { x, y, z } = interpolation.move(entity, packet.dX, packet.dY, packet.dZ, rotationOf(packet))
    if (bot.supportFeature('fixedPointDelta')) {
      const dx = packet.dX / 32
      const dy = packet.dY / 32
      const dz = packet.dZ / 32
      entity.position.set(x, y, z)
      updateEntityVelocity(entity, new Vec3(dx, dy, dz), false)
    } else if (bot.supportFeature('fixedPointDelta128')) {
      // this has entity velocity handled elsewhere.
      entity.position.set(x, y, z)
    }
  }

  function addNewPlayer (entityId, uuid, pos) {
    const entity = fetchEntity(entityId)
    entity.type = 'player'
    entity.name = 'player'
    entity.username = bot.uuidToUsername[uuid]
    entity.uuid = uuid
    updateEntityPos(entity, pos)
    entity.eyeHeight = PLAYER_EYEHEIGHT
    entity.height = PLAYER_HEIGHT
    entity.width = PLAYER_WIDTH
    if (uuid) {
      const player = bot._playerFromUUID(uuid)
      if (player && !player.entity) {
        player.entity = entity
      }
    }
    return entity
  }

  function addNewNonPlayer (entityId, uuid, entityType, pos) {
    const entity = fetchEntity(entityId)
    const entityData = bot.registry.entities[entityType]
    setEntityData(entity, entityType, entityData)
    updateEntityPos(entity, pos)
    entity.uuid = uuid
    return entity
  }

  function isFishingBobberEntity (entity) {
    return entity &&
      (
        entity.name === 'fishing_bobber' ||
        entity.name === 'fishing_hook' ||
        entity.entityType === 90
      )
  }

  function getSpawnEntityDataField (packet) {
    if (typeof packet.data === 'number') return packet.data
    if (typeof packet.objectData === 'number') return packet.objectData
    return null
  }

  function setFishingBobberOwnerFromSpawnPacket (entity, packet) {
    if (!isFishingBobberEntity(entity)) return

    const ownerId = getSpawnEntityDataField(packet)
    if (typeof ownerId === 'number' && ownerId > 0) {
      entity.ownerId = ownerId
      entity.owner = fetchEntity(ownerId)
    }
  }

  function updateFishingBobberHookedEntity (entity, packet, namedMetas) {
    if (!isFishingBobberEntity(entity)) return

    let rawHookedIdPlusOne = null

    if (namedMetas) {
      rawHookedIdPlusOne =
        namedMetas.hooked_entity ??
        namedMetas.hooked_entity_id ??
        namedMetas.hookedEntity ??
        namedMetas.hookedEntityId ??
        null
    }

    // FishingHook syncs hooked entity as entityId + 1, or 0 for none.
    // Fallback to the historical raw metadata index when named metadata is unavailable.
    if (rawHookedIdPlusOne == null) {
      const rawEntry = packet.metadata.find(m => m.key === 6)
      rawHookedIdPlusOne = rawEntry?.value ?? null
    }

    if (typeof rawHookedIdPlusOne !== 'number') return

    if (rawHookedIdPlusOne > 0) {
      const hookedId = rawHookedIdPlusOne - 1
      entity.hookedEntityId = hookedId
      entity.hookedEntity = fetchEntity(hookedId)
    } else {
      entity.hookedEntityId = null
      entity.hookedEntity = null
    }
  }

  function applyFishingBobberRetractImpulse (bobber) {
    if (!isFishingBobberEntity(bobber)) return

    const hooked = bobber.hookedEntity
    if (!hooked || hooked.id !== bot.entity?.id) return

    const owner = bobber.owner ?? (bobber.ownerId != null ? bot.entities[bobber.ownerId] : null)
    if (!owner) return

    // Vanilla pullEntity:
    // delta = (ownerPos - bobberPos) * 0.1
    const pull = new Vec3(
      (owner.position.x - bobber.position.x) * 0.1,
      (owner.position.y - bobber.position.y) * 0.1,
      (owner.position.z - bobber.position.z) * 0.1
    )

    updateEntityVelocity(hooked, new Vec3(
      hooked.velocity.x + pull.x,
      hooked.velocity.y + pull.y,
      hooked.velocity.z + pull.z
    ))

    bot.emit('fishingBobberRetract', bobber, owner, hooked, pull)
  }

  bot._client.on('named_entity_spawn', (packet) => {
    // in case player_info packet was not sent before named_entity_spawn : ignore named_entity_spawn (see #213)
    if (packet.playerUUID in bot.uuidToUsername) {
      // spawn named entity
      const entity = addNewPlayer(packet.entityId, packet.playerUUID, packet, packet.metadata)
      entity.dataBlobs = packet.data // this field doesn't appear to be listed on any version
      entity.metadata = parseMetadata(packet.metadata, entity.metadata) // 1.8
      bot.emit('entitySpawn', entity)
    }
  })

  // spawn object/vehicle on versions < 1.19, on versions > 1.19 handles all non-player entities
  // on versions >= 1.20.2, this also handles player entities
  bot._client.on('spawn_entity', (packet) => {
    const entityData = entityDataByInternalId[packet.type]
    const entity = entityData?.type === 'player'
      ? addNewPlayer(packet.entityId, packet.objectUUID, packet)
      : addNewNonPlayer(packet.entityId, packet.objectUUID, packet.type, packet)

    setFishingBobberOwnerFromSpawnPacket(entity, packet)

    bot.emit('entitySpawn', entity)
  })

  // spawn_entity_experience_orb packet was removed in 1.21.5+
  // XP orbs are now handled through the general spawn_entity packet
  bot._client.on('spawn_entity_experience_orb', (packet) => {
    const entity = fetchEntity(packet.entityId)
    entity.type = 'orb'
    entity.name = 'experience_orb'
    entity.width = 0.5
    entity.height = 0.5

    if (bot.supportFeature('fixedPointPosition')) {
      entity.position.set(packet.x / 32, packet.y / 32, packet.z / 32)
    } else if (bot.supportFeature('doublePosition')) {
      entity.position.set(packet.x, packet.y, packet.z)
    }

    entity.count = packet.count
    bot.emit('entitySpawn', entity)
  })

  // This packet is removed since 1.19 and merged into spawn_entity
  bot._client.on('spawn_entity_living', (packet) => {
    // spawn mob
    const entity = fetchEntity(packet.entityId)
    entity.type = 'mob'
    entity.uuid = packet.entityUUID
    const entityData = mobs[packet.type]

    setEntityData(entity, packet.type, entityData)

    if (bot.supportFeature('fixedPointPosition')) {
      entity.position.set(packet.x / 32, packet.y / 32, packet.z / 32)
    } else if (bot.supportFeature('doublePosition')) {
      entity.position.set(packet.x, packet.y, packet.z)
    }

    entity.yaw = conv.fromNotchianYawByte(packet.yaw)
    entity.pitch = conv.fromNotchianPitchByte(packet.pitch)
    // In 1.17.1 this field is named headPitch by minecraft-data, but the
    // protocol value is the living entity's horizontal head rotation.
    entity.headYaw = conv.fromNotchianYawByte(packet.headPitch)

    updateEntityVelocity(entity, parseEntityVelocity(packet), false)
    entity.metadata = parseMetadata(packet.metadata, entity.metadata)

    bot.emit('entitySpawn', entity)
  })

  bot._client.on('entity_velocity', (packet) => {
    // entity velocity
    const entity = fetchEntity(packet.entityId)
    if (isControlledBoat(entity)) return
    updateEntityVelocity(entity, parseEntityVelocity(packet))
    if (isControlledHorse(entity)) {
      bot.emit('vehicleCorrection', entity, { kind: 'entity_velocity', replaceVelocity: true })
    }
  })

  bot._client.on('entity_destroy', (packet) => {
    // destroy entity
    packet.entityIds.forEach((id) => {
      const entity = fetchEntity(id)
      bot.emit('entityGone', entity)
      entity.isValid = false
      if (entity.uuid) {
        const player = bot._playerFromUUID(entity.uuid)
        if (player) player.entity = null
      }
      delete bot.entities[id]
    })
  })

  // 26.3+: a move carries a VecDelta, one delta or the deltas of several ticks, each added to the position the one
  // before it left (VecDelta.Stepped.decode); before, the packet's own dX, dY, dZ
  function deltasOf (packet) {
    if (!packet.delta) return [packet]
    return packet.delta.steps ?? [packet.delta]
  }

  bot._client.on('rel_entity_move', (packet) => {
    // entity relative move
    const entity = fetchEntity(packet.entityId)
    if (isLocallyControlledVehicle(entity)) {
      for (const { dX, dY, dZ } of deltasOf(packet)) interpolation.controlledMove(entity, dX, dY, dZ)
      return
    }
    for (const { dX, dY, dZ } of deltasOf(packet)) updateEntityRelativeMove(entity, { ...packet, dX, dY, dZ })
    bot.emit('entityVelocity', entity)
    bot.emit('entityMoved', entity)
  })

  bot._client.on('entity_look', (packet) => {
    // entity look
    const entity = fetchEntity(packet.entityId)
    if (isLocallyControlledVehicle(entity)) return
    // a rotation-only move: from 1.14 it also restarts the interpolation, before it targets the packet position
    if (bot.registry.version['>=']('1.14')) interpolation.move(entity, null, null, null, rotationOf(packet))
    else interpolation.move(entity, 0, 0, 0, rotationOf(packet))
    if (packet.yaw != null && packet.pitch != null) {
      entity.yaw = conv.fromNotchianYawByte(packet.yaw)
      entity.pitch = conv.fromNotchianPitchByte(packet.pitch)
    }
    bot.emit('entityMoved', entity)
  })

  bot._client.on('entity_move_look', (packet) => {
    // entity look and relative move
    const entity = fetchEntity(packet.entityId)
    if (isLocallyControlledVehicle(entity)) {
      for (const { dX, dY, dZ } of deltasOf(packet)) interpolation.controlledMove(entity, dX, dY, dZ)
      return
    }
    for (const { dX, dY, dZ } of deltasOf(packet)) updateEntityRelativeMove(entity, { ...packet, dX, dY, dZ })
    if (packet.yaw != null && packet.pitch != null) {
      entity.yaw = conv.fromNotchianYawByte(packet.yaw)
      entity.pitch = conv.fromNotchianPitchByte(packet.pitch)
    }
    bot.emit('entityVelocity', entity)
    bot.emit('entityMoved', entity)
  })

  bot._client.on('entity_teleport', (packet) => {
    // entity teleport (from 1.21.2 a vehicle the client controls takes it too, ClientPacketListener.handleTeleportEntity)
    const entity = fetchEntity(packet.entityId)
    if (isLocallyControlledVehicle(entity) && !bot.registry.version['>=']('1.21.2')) {
      const scale = bot.supportFeature('fixedPointPosition') ? 32 : 1
      return interpolation.controlledTeleport(entity, packet.x / scale, packet.y / scale, packet.z / scale)
    }
    if (bot.supportFeature('fixedPointPosition')) {
      entity.position.set(packet.x / 32, packet.y / 32, packet.z / 32)
    }
    if (bot.supportFeature('doublePosition')) {
      if (packet.flags != null && typeof packet.flags === 'object') {
        // 1.21.2+: x, y, z may be relative to where the client takes the entity to be
        const base = interpolation.relativeBase(entity)
        entity.position.set(packet.flags.x ? base.x + packet.x : packet.x, packet.flags.y ? base.y + packet.y : packet.y, packet.flags.z ? base.z + packet.z : packet.z)
      } else {
        entity.position.set(packet.x, packet.y, packet.z)
      }
    }
    interpolation.teleport(entity, entity.position.x, entity.position.y, entity.position.z, typeof packet.flags === 'object' ? { yaw: packet.yaw, pitch: packet.pitch } : rotationOf(packet))
    entity.yaw = conv.fromNotchianYawByte(packet.yaw)
    entity.pitch = conv.fromNotchianPitchByte(packet.pitch)
    bot.emit('entityMoved', entity)
  })

  bot._client.on('vehicle_move', (packet) => {
    const vehicle = bot.vehicle
    if (!vehicle) return

    if (isControlledBoat(vehicle)) {
      vehicle.position.set(packet.x, packet.y, packet.z)
      vehicle.yaw = conv.fromNotchianYaw(packet.yaw)
      vehicle.pitch = conv.fromNotchianPitch(packet.pitch)
      bot._client.write('vehicle_move', {
        x: packet.x,
        y: packet.y,
        z: packet.z,
        yaw: packet.yaw,
        pitch: packet.pitch
      })
      bot.emit('vehicleCorrection', vehicle, { kind: 'vehicle_move', replaceVelocity: false })
      bot.emit('entityMoved', vehicle)
      return
    }

    if (isControlledHorse(vehicle)) {
      // ClientPacketListener.handleMoveVehicle: a vehicle the client controls moves there at once (absMoveTo) and the
      // client answers with it
      vehicle.position.set(packet.x, packet.y, packet.z)
      interpolation.spawn(vehicle)
      vehicle.yaw = conv.fromNotchianYaw(packet.yaw)
      vehicle.pitch = conv.fromNotchianPitch(packet.pitch)
      bot._client.write('vehicle_move', {
        x: packet.x,
        y: packet.y,
        z: packet.z,
        yaw: packet.yaw,
        pitch: packet.pitch,
        onGround: !!vehicle.onGround
      })
      bot.emit('vehicleCorrection', vehicle, { kind: 'vehicle_move', replaceVelocity: false })
      bot.emit('entityMoved', vehicle)
      return
    }

    vehicle.position.set(packet.x, packet.y, packet.z)
    vehicle.yaw = conv.fromNotchianYaw(packet.yaw)
    vehicle.pitch = conv.fromNotchianPitch(packet.pitch)
    bot.emit('entityMoved', vehicle)
  })

  // From 1.21.2 the server runs a minecart on the experimental behaviour when the minecart_improvements feature is on
  // (AbstractMinecart.useExperimentalMovement): it sends the steps of its track instead of moves, which the client goes
  // along over its next ticks (ClientPacketListener.handleMinecartAlongTrack, NewMinecartBehavior)
  bot._client.on('feature_flags', (packet) => {
    interpolation.minecartImprovements = (packet.features ?? []).includes('minecraft:minecart_improvements')
  })

  bot._client.on('move_minecart', (packet) => {
    const entity = fetchEntity(packet.entityId)
    if (interpolation.kindOf(entity) !== 'minecart') return
    const steps = packet.steps.map(({ position, movement, velocity, yaw, pitch, weight }) => ({
      position,
      // (the motion is `movement` before 1.21.9, `velocity` from)
      movement: velocity ?? movement,
      // ByteBufCodecs.ROTATION_BYTE: the float degrees of the packed byte
      yaw: Math.fround(yaw * 360 / 256),
      pitch: Math.fround(pitch * 360 / 256),
      weight: Math.fround(weight)
    }))
    const { x, y, z } = interpolation.minecartSteps(entity, steps)
    entity.position.set(x, y, z)
    bot.emit('entityMoved', entity)
  })

  // 1.21.3 - merges the packets above
  bot._client.on('sync_entity_position', (packet) => {
    const entity = fetchEntity(packet.entityId)
    // 26.3+: a PositionPath, one position or the positions of several ticks, which ends at its last
    // (ClientPacketListener.handleEntityPositionSync: PositionPath.endPosition); the motion is no longer sent
    const { x, y, z } = packet.path ? (packet.path.steps?.at(-1) ?? packet.path) : packet
    // a vehicle the client moves takes only the new base of its relative moves (isLocalInstanceAuthoritative)
    if (isLocallyControlledVehicle(entity)) return interpolation.controlledTeleport(entity, x, y, z)
    entity.position.set(x, y, z)
    interpolation.sync(entity, x, y, z, { yaw: packet.yaw, pitch: packet.pitch })
    // (the motion it carries is not taken: the client keeps the entity's own, ClientPacketListener.handleEntityPositionSync)
    entity.yaw = conv.fromDegreesToYaw(packet.yaw)
    entity.pitch = conv.fromDegreesToPitch(packet.pitch)
    bot.emit('entityMoved', entity)
  })

  bot._client.on('entity_head_rotation', (packet) => {
    // entity head look
    const entity = fetchEntity(packet.entityId)
    if (isLocallyControlledVehicle(entity)) return
    entity.headYaw = conv.fromNotchianYawByte(packet.headYaw)
    bot.emit('entityMoved', entity, { headRotationOnly: true })
  })

  bot._client.on('entity_status', (packet) => {
    // entity status
    const entity = fetchEntity(packet.entityId)

    if (packet.entityStatus === 31 && isFishingBobberEntity(entity)) {
      applyFishingBobberRetractImpulse(entity)
    }

    const eventName = entityStatusEvents[packet.entityStatus]

    if (eventName === 'entityHandSwap' && entity.equipment) {
      [entity.equipment[0], entity.equipment[1]] = [entity.equipment[1], entity.equipment[0]]
      entity.heldItem = entity.equipment[0] // Update held item like prismarine-entity does upon equipment updates
    }

    if (eventName) bot.emit(eventName, entity)
  })

  bot._client.on('damage_event', (packet) => { // 1.20+
    const entity = bot.entities[packet.entityId]
    const source = bot.entities[packet.sourceCauseId - 1] // damage_event : SourceCauseId : The ID + 1 of the entity responsible for the damage, if present. If not present, the value is 0
    bot.emit('entityHurt', entity, source)
  })

  // From 1.9 attach_entity is only a leash (ClientboundSetEntityLinkPacket; riding is set_passengers); 1.8 tells which
  const isLeash = packet => bot.registry.version['>=']('1.9') || !!packet.leash

  bot._client.on('attach_entity', (packet) => {
    // attach entity
    const entity = fetchEntity(packet.entityId)
    if (isLeash(packet)) {
      const holder = entity.leashHolder
      entity.leashHolder = packet.vehicleId === -1 ? null : fetchEntity(packet.vehicleId)
      if (entity.leashHolder) bot.emit('entityAttach', entity, entity.leashHolder)
      else bot.emit('entityDetach', entity, holder)
      return
    }
    if (packet.vehicleId === -1) {
      const vehicle = entity.vehicle
      delete entity.vehicle
      bot.emit('entityDetach', entity, vehicle)
    } else {
      entity.vehicle = fetchEntity(packet.vehicleId)
      bot.emit('entityAttach', entity, entity.vehicle)
    }
  })

  bot.fireworkRocketDuration = 0
  // the rockets attached to the bot: each boosts it in its own tick (FireworkRocketEntity.tick) until the server
  // removes it
  bot.fireworkRockets = 0
  const attachedFireworks = new Set()
  bot._attachedFireworkRockets = attachedFireworks
  function setElytraFlyingState (entity, elytraFlying) {
    let startedFlying = false
    if (elytraFlying) {
      startedFlying = !entity.fallFlying
      entity.fallFlying = true
      entity.elytraFlying = true
      entity._pendingElytraFlightConfirmation = false
    } else {
      // Keep speculative local glide state alive while we are still waiting for
      // the server to settle the start-flying request. A transient false metadata
      // update here should not wipe local flight before confirmation or timeout.
      if (entity.id === bot.entity?.id && entity._pendingElytraFlightConfirmation === true) {
        bot.emit('entityElytraState', entity, false)
        return
      }
      if (entity.fallFlying) {
        entity.fallFlying = false
      }
      entity.elytraFlying = false
      entity._pendingElytraFlightConfirmation = false
    }

    if (entity.id === bot.entity?.id) {
      bot.emit('entityElytraState', entity, elytraFlying)
    }

    if (startedFlying) {
      bot.emit('entityElytraFlew', entity)
    }
  }

  function handleBotUsedFireworkRocket (fireworkEntityId) {
    if (attachedFireworks.has(fireworkEntityId)) return
    attachedFireworks.add(fireworkEntityId)
    bot.fireworkRockets = attachedFireworks.size
    bot.fireworkRocketDuration = 1

    bot.emit('usedFirework', fireworkEntityId)
  }

  let fireworkEntityName
  if (bot.supportFeature('fireworkNamePlural')) {
    fireworkEntityName = 'fireworks_rocket'
  } else if (bot.supportFeature('fireworkNameSingular')) {
    fireworkEntityName = 'firework_rocket'
  }

  let fireworkMetadataIdx
  let fireworkMetadataIsOpt
  if (bot.supportFeature('fireworkMetadataVarInt7')) {
    fireworkMetadataIdx = 7
    fireworkMetadataIsOpt = false
  } else if (bot.supportFeature('fireworkMetadataOptVarInt8')) {
    fireworkMetadataIdx = 8
    fireworkMetadataIsOpt = true
  } else if (bot.supportFeature('fireworkMetadataOptVarInt9')) {
    fireworkMetadataIdx = 9
    fireworkMetadataIsOpt = true
  }
  const hasFireworkSupport = fireworkEntityName !== undefined && fireworkMetadataIdx !== undefined && fireworkMetadataIsOpt !== undefined

  // ClientPacketListener.handleSetEntityData applies the server's data to the local player too: its swimming flag
  // (1.13+) and its pose hold until the player's own tick sets them again (Player.updateSwimming, updatePlayerPose)
  function syncLocalPlayerData (entity, sharedFlags, pose) {
    if (entity !== bot.entity) return
    if (sharedFlags != null && bot.registry.isNewerOrEqualTo('1.13')) entity.swimming = (sharedFlags & 0x10) !== 0
    if (pose != null) entity.pose = pose
  }

  bot._client.on('entity_metadata', (packet) => {
    // entity metadata
    const entity = fetchEntity(packet.entityId)
    const metadata = parseMetadata(packet.metadata, entity.metadata)
    entity.metadata = metadata

    if (bot.supportFeature('mcDataHasEntityMetadata')) {
      const metadataKeys = bot.registry.entitiesByName[entity.name]?.metadataKeys
      const metas = metadataKeys ? Object.fromEntries(packet.metadata.map(e => [metadataKeys[e.key], e.value])) : {}

      updateFishingBobberHookedEntity(entity, packet, metas)
      syncLocalPlayerData(entity, metas.shared_flags, metas.pose)

      bot.emit('entityUpdate', entity)

      if (packet.metadata.some(m => m.type === 'item_stack')) {
        bot.emit('itemDrop', entity)
      }
      if (metas.sleeping_pos || metas.pose === 2) {
        bot.emit('entitySleep', entity)
      }

      if (hasFireworkSupport && fireworkEntityName === entity.name && metas.attached_to_target !== undefined) {
        // fireworkMetadataOptVarInt9 and later is implied by
        // mcDataHasEntityMetadata, so no need to check metadata index and type
        // (eg fireworkMetadataOptVarInt8)
        if (metas.attached_to_target !== 0) {
          const entityId = metas.attached_to_target - 1
          if (entityId === bot.entity?.id) {
            handleBotUsedFireworkRocket(entity.id)
          }
        }
      }

      if (metas.shared_flags != null) {
        if (bot.supportFeature('hasElytraFlying')) {
          const elytraFlying = metas.shared_flags & 0x80
          setElytraFlyingState(entity, Boolean(elytraFlying))
        }

        if (metas.shared_flags & 2) {
          entity.crouching = true
          bot.emit('entityCrouch', entity)
        } else if (entity.crouching) { // prevent the initial entity_metadata packet from firing off an uncrouch event
          entity.crouching = false
          bot.emit('entityUncrouch', entity)
        }
      }

      // Breathing (formerly in breath.js)
      if (metas.air_supply != null) {
        bot.oxygenLevel = Math.round(metas.air_supply / 15)
        bot.emit('breath')
      }
    } else {
      updateFishingBobberHookedEntity(entity, packet, null)

      bot.emit('entityUpdate', entity)

      const typeSlot = (bot.supportFeature('itemsAreAlsoBlocks') ? 5 : 6) + (bot.supportFeature('entityMetadataHasLong') ? 1 : 0)
      const slot = packet.metadata.find(e => e.type === typeSlot)
      if (entity.name && (entity.name.toLowerCase() === 'item' || entity.name === 'item_stack') && slot) {
        bot.emit('itemDrop', entity)
      }

      const typePose = bot.supportFeature('entityMetadataHasLong') ? 19 : 18
      const pose = packet.metadata.find(e => e.type === typePose)
      if (pose && pose.value === 2) {
        bot.emit('entitySleep', entity)
      }
      // (the pose is entity data from 1.14)
      const sharedFlags = packet.metadata.find(p => p.key === 0)
      syncLocalPlayerData(entity, sharedFlags?.value, bot.registry.isNewerOrEqualTo('1.14') ? pose?.value : undefined)

      if (hasFireworkSupport && fireworkEntityName === entity.name) {
        const attachedToTarget = packet.metadata.find(e => e.key === fireworkMetadataIdx)
        if (attachedToTarget !== undefined) {
          let entityId
          if (fireworkMetadataIsOpt) {
            if (attachedToTarget.value !== 0) {
              entityId = attachedToTarget.value - 1
            } // else, not attached to an entity
          } else if (attachedToTarget.value > 0) {
            // 1.11 - 1.13: an int whose 0 means none (EntityFireworkRocket.wasShotByEntity), so entity 0 never gets one
            entityId = attachedToTarget.value
          }
          if (entityId !== undefined && entityId === bot.entity?.id) {
            handleBotUsedFireworkRocket(entity.id)
          }
        }
      }

      const bitField = packet.metadata.find(p => p.key === 0)
      if (bitField !== undefined) {
        if (bot.supportFeature('hasElytraFlying')) {
          const elytraFlying = bitField.value & 0x80
          setElytraFlyingState(entity, Boolean(elytraFlying))
        }

        if ((bitField.value & 2) !== 0) {
          entity.crouching = true
          bot.emit('entityCrouch', entity)
        } else if (entity.crouching) { // prevent the initial entity_metadata packet from firing off an uncrouch event
          entity.crouching = false
          bot.emit('entityUncrouch', entity)
        }
      }
    }
  })

  bot._client.on('entity_effect', (packet) => {
    // entity effect
    const entity = fetchEntity(packet.entityId)
    const effect = {
      id: packet.effectId,
      amplifier: packet.amplifier,
      duration: packet.duration
    }
    entity.effects[effect.id] = effect
    bot.emit('entityEffect', entity, effect)
  })

  bot._client.on('remove_entity_effect', (packet) => {
    // remove entity effect
    const entity = fetchEntity(packet.entityId)
    let effect = entity.effects[packet.effectId]
    if (effect) {
      delete entity.effects[effect.id]
    } else {
      // unknown effect
      effect = {
        id: packet.effectId,
        amplifier: -1,
        duration: -1
      }
    }
    bot.emit('entityEffectEnd', entity, effect)
  })

  const updateAttributes = (packet) => {
    const entity = fetchEntity(packet.entityId)
    if (!entity.attributes) entity.attributes = {}
    for (const prop of packet.properties) {
      entity.attributes[prop.key ?? prop.name] = {
        value: prop.value,
        modifiers: prop.modifiers
      }
    }
    bot.emit('entityAttributes', entity)
  }
  bot._client.on('update_attributes', updateAttributes) // 1.8
  bot._client.on('entity_update_attributes', updateAttributes) // others

  bot._client.on('spawn_entity_weather', (packet) => {
    // spawn global entity
    const entity = fetchEntity(packet.entityId)
    entity.type = 'global'
    entity.globalType = 'thunderbolt'
    entity.uuid = packet.entityUUID
    entity.position.set(packet.x / 32, packet.y / 32, packet.z / 32)
    bot.emit('entitySpawn', entity)
  })

  bot.on('spawn', () => {
    bot.emit('entitySpawn', bot.entity)
  })

  function handlePlayerInfoBitfield (packet) {
    for (const item of packet.data) {
      let player = bot._playerFromUUID(item.uuid)
      const newPlayer = !player

      if (newPlayer) {
        player = { uuid: item.uuid }
      }

      if (packet.action.add_player) {
        player.username = item.player.name
        player.displayName = new ChatMessage({ text: '', extra: [{ text: item.player.name }] })
        player.skinData = extractSkinInformation(item.player.properties)
      }
      if (packet.action.initialize_chat && item.chatSession) {
        player.chatSession = {
          publicKey: item.chatSession.publicKey,
          sessionUuid: item.chatSession.uuid
        }
      }
      if (packet.action.update_game_mode) {
        player.gamemode = item.gamemode
      }
      if (packet.action.update_listed) {
        player.listed = item.listed
      }
      if (packet.action.update_latency) {
        player.ping = item.latency
      }
      if (packet.action.update_display_name) {
        player.displayName = item.displayName ? ChatMessage.fromNotch(item.displayName) : new ChatMessage({ text: '', extra: [{ text: player.username }] })
      }

      if (newPlayer) {
        if (player.username == null) continue // Should be unreachable if add_player is always sent for new players
        bot.players[player.username] = player
        bot.uuidToUsername[player.uuid] = player.username
      }

      const playerEntity = Object.values(bot.entities).find(e => e.type === 'player' && e.uuid === player.uuid)
      player.entity = playerEntity

      if (playerEntity === bot.entity) {
        bot.player = player
      }

      if (newPlayer) {
        bot.emit('playerJoined', player)
      } else {
        bot.emit('playerUpdated', player)
      }
    }
  }

  function handlePlayerInfoLegacy (packet) {
    for (const item of packet.data) {
      let player = bot._playerFromUUID(item.uuid)

      switch (packet.action) {
        case 'add_player': {
          const newPlayer = !player
          if (newPlayer) {
            player = bot.players[item.name] = {
              username: item.name,
              uuid: item.uuid
            }
            bot.uuidToUsername[item.uuid] = item.name
          }

          player.ping = item.ping
          player.gamemode = item.gamemode
          player.displayName = item.displayName ? ChatMessage.fromNotch(item.displayName) : new ChatMessage({ text: '', extra: [{ text: item.name }] })
          if (item.properties) {
            player.skinData = extractSkinInformation(item.properties)
          }
          if (item.crypto) {
            player.profileKeys = {
              publicKey: item.crypto.publicKey,
              signature: item.crypto.signature
            }
          }

          const playerEntity = Object.values(bot.entities).find(e => e.type === 'player' && e.uuid === item.uuid)
          player.entity = playerEntity
          if (playerEntity === bot.entity) {
            bot.player = player
          }

          if (newPlayer) bot.emit('playerJoined', player)
          else bot.emit('playerUpdated', player)
          break
        }
        case 'update_gamemode': {
          if (player) {
            player.gamemode = item.gamemode
            bot.emit('playerUpdated', player)
          }
          break
        }
        case 'update_latency': {
          if (player) {
            player.ping = item.ping
            bot.emit('playerUpdated', player)
          }
          break
        }
        case 'update_display_name': {
          if (player) {
            player.displayName = item.displayName ? ChatMessage.fromNotch(item.displayName) : new ChatMessage({ text: '', extra: [{ text: player.username }] })
            bot.emit('playerUpdated', player)
          }
          break
        }
        case 'remove_player': {
          if (player) {
            if (player.entity === bot.entity) continue
            player.entity = null
            delete bot.players[player.username]
            delete bot.uuidToUsername[item.uuid]
            bot.emit('playerLeft', player)
          }
          break
        }
      }
    }
  }

  bot._client.on('player_info', bot.supportFeature('playerInfoActionIsBitfield') ? handlePlayerInfoBitfield : handlePlayerInfoLegacy)

  // 1.19.3+ - player(s) leave the game
  bot._client.on('player_remove', (packet) => {
    for (const uuid of packet.players) {
      const player = bot._playerFromUUID(uuid)
      if (!player || player.entity === bot.entity) continue

      player.entity = null
      delete bot.players[player.username]
      delete bot.uuidToUsername[uuid]
      bot.emit('playerLeft', player)
    }
  })

  // attaching to a vehicle
  bot._client.on('attach_entity', (packet) => {
    if (isLeash(packet)) return
    const passenger = fetchEntity(packet.entityId)
    const vehicle = packet.vehicleId === -1 ? null : fetchEntity(packet.vehicleId)

    const originalVehicle = passenger.vehicle
    if (originalVehicle) {
      const index = originalVehicle.passengers.indexOf(passenger)
      originalVehicle.passengers.splice(index, 1)
    }
    passenger.vehicle = vehicle
    if (vehicle) {
      vehicle.passengers.push(passenger)
    }

    if (packet.entityId === bot.entity.id) {
      const vehicle = bot.vehicle
      if (packet.vehicleId === -1) {
        bot.vehicle = null
        bot.emit('dismount', vehicle)
      } else {
        bot.vehicle = bot.entities[packet.vehicleId]
        bot.emit('mount')
      }
    }
  })

  function detachPassengerFromVehicle (passenger, vehicle) {
    if (!vehicle) return false
    const index = vehicle.passengers?.indexOf(passenger) ?? -1
    const wasAttached = index !== -1 || passenger.vehicle === vehicle
    if (index !== -1) vehicle.passengers.splice(index, 1)
    if (passenger.vehicle === vehicle) {
      passenger.vehicle = null
    }
    return wasAttached
  }

  function handleBotDismount (previousVehicle) {
    if (bot.vehicle !== previousVehicle) return
    bot.vehicle = null
    delete bot.entity.vehicle
    bot.emit('dismount', previousVehicle)
  }

  function handleBotMount (vehicle) {
    if (bot.vehicle === vehicle) return
    bot.vehicle = vehicle
    bot.entity.vehicle = vehicle
    bot.emit('mount')
  }

  // a boat its rider steers (Boat.isControlledByLocalInstance, the client steering it since 1.9)
  function isControlledBoat (entity) {
    const name = entity?.name?.toLowerCase() ?? ''
    return bot.registry.version['>=']('1.9') &&
      bot.vehicle === entity &&
      (name === 'boat' || name.endsWith('_boat') || name.endsWith('_raft')) &&
      entity.passengers?.[0]?.id === bot.entity.id
  }

  // the first passenger of a horse controls it (AbstractHorse.getControllingPassenger, from 1.9 where the client moves
  // its vehicle); from 1.19 only while the horse is saddled, as the version keeps the saddle (horseSaddleFlag)
  function isControlledHorse (entity) {
    return bot.registry.version['>=']('1.9') &&
      bot.vehicle === entity &&
      ['EntityHorse', 'horse', 'donkey', 'mule', 'skeleton_horse', 'zombie_horse'].includes(entity.name) &&
      entity.passengers?.[0]?.id === bot.entity.id &&
      (!bot.registry.version['>=']('1.19') || horseSaddleFlag(entity, bot.registry))
  }

  // the vehicle the bot's client moves (Entity.isLocalInstanceAuthoritative): a boat it drives, a horse, or another mob
  // it steers (a pig or strider with its stick, a camel, a harnessed happy ghast)
  function isLocallyControlledVehicle (entity) {
    return isControlledBoat(entity) || isControlledHorse(entity) ||
      (bot.registry.version['>=']('1.9') && !!bot._riddenMobPhysics?.controls(entity))
  }

  function resolvePassengerEntity (passengerId) {
    if (passengerId === bot.entity.id) return bot.entity
    return fetchEntity(passengerId)
  }

  bot._client.on('set_passengers', ({ entityId, passengers }) => {
    const vehicle = entityId === -1 ? null : fetchEntity(entityId)
    if (!vehicle) return

    vehicle.passengers ??= []
    const newPassengerIds = new Set(passengers)

    for (const passenger of [...vehicle.passengers]) {
      if (!newPassengerIds.has(passenger.id)) {
        if (detachPassengerFromVehicle(passenger, vehicle)) {
          bot.emit('entityDetach', passenger, vehicle)
        }
        if (passenger.id === bot.entity.id) {
          handleBotDismount(vehicle)
        }
      }
    }

    // The packet is authoritative even if our local passenger list was already
    // incomplete or stale. Do not leave the bot mounted merely because it was
    // missing from vehicle.passengers before this update arrived.
    if (bot.vehicle === vehicle && !newPassengerIds.has(bot.entity.id)) {
      handleBotDismount(vehicle)
    }

    for (const passengerId of passengers) {
      const passenger = resolvePassengerEntity(passengerId)
      const alreadyAttached = passenger.vehicle === vehicle && vehicle.passengers.includes(passenger)

      if (!alreadyAttached) {
        if (passenger.vehicle && passenger.vehicle !== vehicle) {
          const previousVehicle = passenger.vehicle
          if (detachPassengerFromVehicle(passenger, previousVehicle)) {
            bot.emit('entityDetach', passenger, previousVehicle)
          }
        }

        passenger.vehicle = vehicle
        if (!vehicle.passengers.includes(passenger)) {
          vehicle.passengers.push(passenger)
        }
        bot.emit('entityAttach', passenger, vehicle)
      }

      if (passengerId === bot.entity.id) {
        handleBotMount(vehicle)
      }
    }

    vehicle.passengers = passengers.map((passengerId) => resolvePassengerEntity(passengerId))
  })

  // dismounting when the vehicle is gone
  bot.on('entityGone', (entity) => {
    if (attachedFireworks.delete(entity.id)) bot.fireworkRockets = attachedFireworks.size
    if (bot.vehicle === entity) {
      handleBotDismount(entity)
    }
    if (entity.passengers) {
      for (const passenger of entity.passengers) {
        passenger.vehicle = null
      }
    }
    if (entity.vehicle) {
      const index = entity.vehicle.passengers.indexOf(entity)
      if (index !== -1) {
        entity.vehicle.passengers.splice(index, 1)
      }
    }
  })

  bot.swingArm = swingArm
  bot.attack = attack
  bot.mount = mount
  bot._interactEntity = interactEntity
  bot.dismount = dismount
  // the sneak key pressed while riding: the next tick's input asks to dismount (its shift)
  bot._requestDismount = requestDismount
  // released, the next tick's input no longer asks (LocalPlayer.tick sends the live shift key)
  bot._cancelDismountRequest = clearDismountRequest
  // the client stops riding by itself (1.16's Player.rideTick): it leaves its vehicle before the server says so
  bot._stopRidingOnClient = () => {
    const vehicle = bot.vehicle
    if (!vehicle) return
    detachPassengerFromVehicle(bot.entity, vehicle)
    handleBotDismount(vehicle)
  }
  bot.useOn = useOn
  bot.moveVehicle = moveVehicle

  bot._client.on('abilities', (packet) => {
    bot.entity.abilities = {
      flags: packet.flags,
      flyingSpeed: packet.flyingSpeed,
      walkingSpeed: packet.walkingSpeed
    }

    // For convenience, extract boolean flags
    bot.entity.isInvulnerable = (packet.flags & 1) !== 0
    bot.entity.isFlying = (packet.flags & 2) !== 0
    // ClientPacketListener.handlePlayerAbilities: the player flies as the server says (the physics reads entity.flying)
    bot.entity.flying = bot.entity.isFlying
    bot.entity.canFly = (packet.flags & 4) !== 0
    bot.entity.canInstantlyBuild = (packet.flags & 8) !== 0

    bot.emit('abilities', bot.entity.abilities)
  })

  function swingArm (arm = 'right', showHand = true) {
    if (bot.registry.version['>=']('26.3')) {
      // 26.3 has no swing packet: the swing of an attack or a dig goes with a punch (Minecraft.startAttack,
      // continueAttack), which the server swings for; the client never tells an off hand swing
      if (arm === 'right') bot._client.write('punch', {})
      return
    }
    const hand = arm === 'right' ? 0 : 1
    const packet = {}
    if (showHand) packet.hand = hand
    bot._client.write('arm_animation', packet)
  }

  function useOn (target) {
    // TODO: check if not crouching will make make this action always use the item
    useEntity(target, 0)
  }

  function attack (target, swing = true) {
    // arm animation comes before the use_entity packet on 1.8
    if (bot.supportFeature('armAnimationBeforeUse')) {
      if (swing) {
        swingArm()
      }
      useEntity(target, 1)
    } else {
      useEntity(target, 1)
      if (swing) {
        swingArm()
      }
    }
  }

  // A right click on a mount or vehicle is a right click on an entity like any other: the server seats the player when
  // the entity takes it (Boat.interact, AbstractHorse.mobInteract...). Returns what the client predicts it comes to
  // (interactEntity).
  function mount (target, offHand = false) {
    return interactEntity(target, undefined, offHand)
  }

  // A right click on an entity with one hand, as vanilla's client makes it (Minecraft.startUseItem's ENTITY case,
  // MultiPlayerGameMode.interactAt / interact): before 26.1 INTERACT_AT (where the crosshair meets the entity, relative
  // to its position), then INTERACT unless that took the click (an armor stand's: ArmorStand.interactAt); from 26.1 one
  // interaction that says where (ServerboundInteractPacket). When the client predicts the use succeeds on its own copy
  // of the entity (Player.interactOn) it swings that hand (1.15 - 26.2: InteractionResult.SUCCESS; 26.3 sends no swing
  // for a use). Returns the prediction: 'success' or 'consume' (the use ends there), or 'pass' (vanilla goes on to the
  // item in that hand, then to the off hand).
  function interactEntity (target, hitPoint, offHand = false) {
    bot._ensureHasSentCarriedItem?.()
    if (!hitPoint) hitPoint = bot._entityHitPoint ? bot._entityHitPoint(target) : target.position.offset(0, (target.height ?? 0) / 2, 0)
    const location = hitPoint.minus(target.position)
    const sneaking = bot.getControlState('sneak')
    const hand = offHand ? 1 : 0
    const result = entityUseResult(target, offHand)
    if (bot.supportFeature('attackUsesOwnPacket')) {
      bot._client.write('use_entity', { target: target.id, hand, location: { x: location.x, y: location.y, z: location.z }, sneaking })
    } else {
      bot._client.write('use_entity', { target: target.id, mouse: 2, x: location.x, y: location.y, z: location.z, hand, sneaking })
      if (!result.at) bot._client.write('use_entity', { target: target.id, mouse: 0, hand, sneaking })
    }
    const swings = result.use === 'success' && bot.registry.version['>=']('1.15') && !bot.registry.version['>=']('26.3')
    if (swings) bot.swingArm(offHand ? 'left' : 'right')
    // before 1.13 a horse the player climbs on turns it to its own rotation on the client too (AbstractHorse.mountTo)
    if (result.ride && bot.registry.version['<']('1.13')) {
      const yaw = target.yawDegrees != null ? Number(target.yawDegrees) : conv.toNotchianYaw(target.yaw ?? 0)
      const pitch = target.pitchDegrees != null ? Number(target.pitchDegrees) : conv.toNotchianPitch(target.pitch ?? 0)
      bot._turnToDegrees?.(yaw, pitch)
    }
    return result.use
  }

  const HORSE = /^(horse|donkey|mule|skeleton_horse|zombie_horse|llama|trader_llama|EntityHorse)$/
  const CAMEL = /^(camel|camel_husk)$/
  const BOAT = /(^|_)(boat|raft)$/
  const CHEST_BOAT = /chest_(boat|raft)$/
  const CONTAINER_MINECART = /^(chest_minecart|hopper_minecart|minecart_chest|minecart_hopper)$/
  // (a villager is Villager before 1.11)
  const TRADER = /^(villager|Villager|wandering_trader)$/
  const NAUTILUS = /^(nautilus|zombie_nautilus)$/
  const ANIMAL_FOOD = {
    pig: /^(carrot|potato|beetroot)$/,
    strider: /^warped_fungus$/,
    happy_ghast: /^snowball$/
  }

  const metadataOf = (entity, key) => {
    const index = bot.registry.entitiesByName[entity.name]?.metadataKeys?.indexOf(key) ?? -1
    return index >= 0 ? entity.metadata?.[index] : undefined
  }
  const isBaby = entity => metadataOf(entity, 'baby') === true
  // a pig's or strider's saddle: its flag until 1.21.5, then the saddle it wears (EquipmentSlot.SADDLE); unknown counts
  // as saddled
  const isSaddled = entity => {
    if (bot.registry.version['>=']('1.21.5')) return entity.equipment?.[7]?.name === 'saddle'
    const saddle = metadataOf(entity, 'saddle')
    return saddle === undefined ? true : !!saddle
  }
  // AbstractHorse's and AbstractNautilus's tame flag (bit 2 of the horse flags; a nautilus's tamable flags, bit 4);
  // unknown counts as tame
  const isTame = entity => {
    const flags = metadataOf(entity, 'flags') ?? metadataOf(entity, 'tame_flags')
    if (typeof flags !== 'number') return true
    return (flags & (NAUTILUS.test(entity.name) ? 0x04 : 0x02)) !== 0
  }

  // What vanilla's client makes of a use on the entity on its own copy of it (Player.interactOn: Entity.interact, then
  // Mob.mobInteract): { use: 'success' | 'consume' | 'pass' }, and `at` when INTERACT_AT already took it before 26.1
  function entityUseResult (target, offHand) {
    const version = bot.registry.version
    const name = target.name ?? ''
    const item = offHand ? bot.inventory.slots[45] : bot.heldItem
    const held = item?.name ?? ''
    const sneaking = bot.getControlState('sneak')
    const ridden = (target.passengers?.length ?? 0) > 0
    const success = { use: 'success' }
    const consume = { use: 'consume' }
    const pass = { use: 'pass' }

    // an armor stand takes the click at INTERACT_AT (ArmorStand.interactAt)
    if (/^(armor_stand|ArmorStand)$/.test(name)) return { use: 'consume', at: true }

    // the leash (Entity.interact from 1.21.6, Mob.interact before): the player's own mob lets go of it; a lead in hand is
    // tied to the mob, which the client predicts with a swing until 1.21.11 (a CONSUME since)
    if (target.leashHolder === bot.entity) return success
    const leashable = target.type !== 'hostile' && target.type !== 'player' && !TRADER.test(name) &&
      (target.type === 'mob' || target.type === 'animal' || target.type === 'passive' || target.type === 'water_creature' ||
        (version['>=']('1.21.6') && BOAT.test(name)))
    if (held === 'lead' && leashable && !(target.leashHolder?.type === 'player')) {
      return version['>=']('1.21.11') ? consume : success
    }

    if (TRADER.test(name)) {
      // (Villager.mobInteract, WanderingTrader.mobInteract: the trade screen, the server's from 26.3)
      return held === 'villager_spawn_egg' || (held === 'spawn_egg' && !version['>=']('1.11')) || sneaking ? pass : success
    }
    if (/^(cow|mooshroom)$/.test(name) && held === 'bucket' && !isBaby(target)) return success // AbstractCow.mobInteract
    if (CAMEL.test(name)) {
      // Camel.mobInteract: its inventory, else a ride (CONSUME from 1.21.11)
      if (isBaby(target)) return pass
      if (sneaking) return success
      if (target.passengers?.length >= 2) return pass
      return version['>=']('1.21.11') ? consume : success
    }
    if (HORSE.test(name)) {
      // AbstractHorse.mobInteract (AbstractChestedHorse's first): its inventory, an item put on, or a ride
      if (ridden || isBaby(target)) return pass
      if (/^(skeleton_horse|zombie_horse)$/.test(name) && !isTame(target)) return pass
      // (an empty hand climbs on, but on a tame one sneaking: its inventory)
      if (!held && !(sneaking && isTame(target))) return { use: 'success', ride: true }
      return success
    }
    if (NAUTILUS.test(name)) {
      // AbstractNautilus.mobInteract: its inventory, else a ride once tame
      if (isBaby(target) || !isTame(target)) return pass
      return success
    }
    if (/^(pig|strider)$/.test(name)) {
      // Pig / Strider.mobInteract: a ride on a saddled one, a saddle put on one without; food: Animal.mobInteract
      const food = ANIMAL_FOOD[name].test(held)
      if (!food && isSaddled(target) && !ridden && !sneaking) return success
      if (food) return consume
      if (held === 'saddle' && !isSaddled(target) && !isBaby(target)) return success
      return pass
    }
    if (name === 'happy_ghast') {
      // HappyGhast.mobInteract: a harness put on, else a ride while it wears one
      if (isBaby(target)) return pass
      const harnessed = /_harness$/.test(target.equipment?.[6]?.name ?? '')
      if (/_harness$/.test(held) && !harnessed) return success
      if (harnessed && !sneaking) return success
      return pass
    }
    if (BOAT.test(name)) {
      // Boat.interact: a ride; a chest boat's chest while sneaking (ChestBoat.interact). 1.15's client answers false: it
      // seats the player only on the server (return startRiding there), so the click goes on to the off hand
      if (version['>=']('1.15') && version['<']('1.16')) return pass
      if (!sneaking) return success
      return CHEST_BOAT.test(name) ? success : pass
    }
    if (name === 'minecart' || name === 'MinecartRideable') {
      // Minecart.interact: a ride (the server's from 26.3)
      if (sneaking || ridden) return pass
      return version['>=']('26.3') ? consume : success
    }
    if (CONTAINER_MINECART.test(name)) return success // AbstractMinecartContainer.interact
    if (/^(furnace_minecart|minecart_furnace)$/.test(name)) return success // MinecartFurnace.interact
    if (name === 'cushion') return sneaking || ridden ? pass : consume // Cushion.interact
    return pass
  }

  const DISMOUNT_REQUEST_TIMEOUT_MS = 3000
  let dismountRequested = false
  let dismountRequestedAt = 0

  function clearDismountRequest () {
    dismountRequested = false
    dismountRequestedAt = 0
  }

  function requestDismount () {
    dismountRequested = true
    dismountRequestedAt = performance.now()
  }

  function isDismountRequestActive () {
    if (!dismountRequested) return false
    if (performance.now() - dismountRequestedAt > DISMOUNT_REQUEST_TIMEOUT_MS) {
      clearDismountRequest()
      return false
    }
    return true
  }

  function steerVehicleJumpMask (jump) {
    let mask = jump ? 0x01 : 0x00
    if (isDismountRequestActive()) {
      mask |= 0x02
    }
    return mask
  }

  bot.on('dismount', clearDismountRequest)
  bot.on('mount', clearDismountRequest)

  function moveVehicle (left, forward, jump = false) {
    if (bot.supportFeature('newPlayerInputPacket')) {
      // docs:
      // * left can take -1 or 1 : -1 means right, 1 means left
      // * forward can take -1 or 1 : -1 means backward, 1 means forward
      bot._client.write('player_input', {
        inputs: {
          forward: forward > 0,
          backward: forward < 0,
          left: left > 0,
          right: left < 0
        }
      })
    } else {
      bot._client.write('steer_vehicle', {
        sideways: left,
        forward,
        jump: steerVehicleJumpMask(jump)
      })
    }
  }

  function dismount () {
    if (bot.vehicle) {
      requestDismount()
      if (bot.supportFeature('newPlayerInputPacket')) {
        bot._client.write('player_input', {
          inputs: {
            jump: true
          }
        })
      } else {
        bot._client.write('steer_vehicle', {
          sideways: 0.0,
          forward: 0.0,
          jump: steerVehicleJumpMask(false)
        })
      }
    } else {
      bot.emit('error', new Error('dismount: not mounted'))
    }
  }

  function useEntity (target, leftClick, x, y, z) {
    bot._ensureHasSentCarriedItem?.()
    const sneaking = bot.getControlState('sneak')
    if (bot.supportFeature('attackUsesOwnPacket')) {
      // 26.1+: an attack is a packet of its own (ServerboundAttackPacket) and an interaction always says where on the
      // entity it is (ServerboundInteractPacket, the hit's location relative to the entity)
      if (leftClick === 1) {
        bot._client.write('attack', { entityId: target.id })
      } else {
        // where the crosshair meets the entity, relative to its position (MultiPlayerGameMode.interact)
        let location = { x, y, z }
        if (x === undefined && target.position && bot._entityHitPoint) {
          const hit = bot._entityHitPoint(target)
          location = { x: hit.x - target.position.x, y: hit.y - target.position.y, z: hit.z - target.position.z }
        }
        bot._client.write('use_entity', { target: target.id, hand: 0, location: { x: location.x ?? 0, y: location.y ?? 0, z: location.z ?? 0 }, sneaking })
      }
      return
    }
    if (x && y && z) {
      bot._client.write('use_entity', {
        target: target.id,
        mouse: leftClick,
        x,
        y,
        z,
        sneaking
      })
    } else {
      bot._client.write('use_entity', {
        target: target.id,
        mouse: leftClick,
        sneaking
      })
    }
  }

  function fetchEntity (id) {
    return bot.entities[id] || (bot.entities[id] = new Entity(id))
  }

  // thrown items and falling blocks move on the client between the server's updates; the entity physics plugin
  // simulates them itself when it is on
  let lastTick = performance.now()
  bot.on('physicsTick', () => {
    const now = performance.now()
    const delta = (now - lastTick) / 50 // convert to ticks
    lastTick = now
    if (bot.entityPhysicsEnabled) return
    for (const entity of Object.values(bot.entities)) {
      if (!entity.isValid || !entity.velocity) continue
      const fallingBlock = entity.name === 'falling_block'
      if (!fallingBlock && entity.name !== 'snowball' && entity.name !== 'egg' && entity.name !== 'ender_pearl') continue
      if (fallingBlock && entity.landedFallingBlock) continue
      // FallingBlockEntity: gravity 0.04 and drag 0.98; thrown items (ThrowableProjectile): 0.03 and 0.99
      const gravity = fallingBlock ? 0.04 : 0.03
      const drag = fallingBlock ? 0.98 : 0.99
      entity.velocity.x = entity.velocity.x * drag ** delta
      entity.velocity.y = entity.velocity.y * drag ** delta
      entity.velocity.z = entity.velocity.z * drag ** delta
      if (!entity.metadata[5] && entity.velocity.y > -3) { // check no gravity flag and terminal velocity (60 m/s -> 3m/tick)
        entity.velocity.y -= gravity * ((1 - drag ** delta) / (1 - drag))
      }
      entity.position.translate(entity.velocity.x * delta, entity.velocity.y * delta, entity.velocity.z * delta)
      // a falling block lands on the block under it (Entity.move collides it); a thrown item passes until the server removes it
      if (fallingBlock && entity.velocity.y < 0) {
        const below = bot.blockAt(entity.position.floored())
        if (below && below.boundingBox === 'block') {
          entity.position.y = Math.floor(entity.position.y) + 1
          entity.velocity.set(0, 0, 0)
          // (prismarine-entity starts every entity on the ground: a flag of its own)
          entity.landedFallingBlock = true
        }
      }
      bot.emit('entityMoved', entity)
    }
  })
}

function parseMetadata (metadata, entityMetadata = {}) {
  if (metadata !== undefined) {
    for (const { key, value } of metadata) {
      entityMetadata[key] = value
    }
  }

  return entityMetadata
}

function extractSkinInformation (properties) {
  if (!properties) {
    return undefined
  }

  const props = Object.fromEntries(properties.map((e) => [e.name, e]))
  if (!props.textures || !props.textures.value) {
    return undefined
  }

  let skinTexture
  try { // Handles mojangson-style player data
    skinTexture = JSON.parse(Buffer.from(props.textures.value, 'base64'))
  } catch (e) {
    skinTexture = mojangson.simplify(mojangson.parse(Buffer.from(props.textures.value, 'base64').toString('utf-8')))
  }

  const skinTextureUrl = skinTexture?.textures?.SKIN?.url ?? undefined
  const capeTextureUrl = skinTexture?.textures?.CAPE?.url ?? undefined
  const skinTextureModel = skinTexture?.textures?.SKIN?.metadata?.model ?? undefined

  if (!skinTextureUrl) {
    return undefined
  }

  return { url: skinTextureUrl, capeUrl: capeTextureUrl, model: skinTextureModel }
}
