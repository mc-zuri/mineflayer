import prismarineChat from 'prismarine-chat'
import type { Entity, EntityMetadataValue, EntityType } from 'prismarine-entity'
import { EYE_HEIGHT, feetFromEye } from 'prismarine-physics/lib/bedrock/index.ts'
import type { Registry } from 'prismarine-registry'
import { fromNotchianPitch, fromNotchianPitchByte, fromNotchianYaw, fromNotchianYawByte } from '../../conversions.ts'
import { bedrockEntityClass } from '../entity.ts'
import { addedEntity, addedItem, addedPainting, addedPlayer, gamemodeOf, listingsOf, runtimeKey } from '../entity_packets.ts'
import type { Link, Listing, Spawn } from '../entity_packets.ts'
import { EntityMetadata, isGliding, isSneaking } from '../metadata.ts'
import type { Player } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// The entities the server shows, by runtime id, and the player list. Their spawns, moves, rides, attributes, effects
// and events act in the packet pass; their metadata at the start of the next tick, and a removal at the end of the next
// tick, as in the vanilla client. The local player's position, velocity and rotation are movement's.

const OWNER = 'entities'
const ON_GROUND = 1
// set_entity_link's type of a removed link; 1 is a rider, 2 a passenger
const UNLINK = 0

const ENTITY_TYPES: readonly EntityType[] = Object.freeze(['player', 'mob', 'object', 'global', 'orb', 'projectile', 'hostile', 'other', 'animal', 'passive', 'ambient', 'living', 'water_creature'])

const ENTITY_EVENTS = Object.freeze({
  hurt_animation: 'entityHurt',
  death_animation: 'entityDead',
  arm_swing: 'entitySwingArm',
  tame_fail: 'entityTaming',
  tame_success: 'entityTamed',
  shake_wet: 'entityShakingOffWater',
  eat_grass_animation: 'entityEatingGrass',
  eating_item: 'entityEat'
} as const)

const ANIMATIONS = Object.freeze({
  swing_arm: 'entitySwingArm',
  wake_up: 'entityWake',
  critical_hit: 'entityCriticalEffect',
  magic_critical_hit: 'entityMagicCriticalEffect'
} as const)

type EntityEvent = (typeof ENTITY_EVENTS)[keyof typeof ENTITY_EVENTS] | (typeof ANIMATIONS)[keyof typeof ANIMATIONS]

type RegistryEntity = Registry['entitiesByName'][string]

interface Removal {
  readonly entity: Entity
  readonly unique: bigint
}

interface Listed {
  readonly player: Player
  readonly unique: bigint
}

function eventOf (events: Readonly<Record<string, EntityEvent>>, id: string | number): EntityEvent | undefined {
  return Object.entries(events).find(([name]) => name === id)?.[1]
}

/** Java's: the registry's type, an empty one an object */
function typeOf (entry: RegistryEntity | undefined): EntityType {
  if (entry === undefined) return 'other'
  return ENTITY_TYPES.find(type => type === entry.type) ?? 'object'
}

export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const BedrockEntity = bedrockEntityClass(bot.registry)
  const metadata = new EntityMetadata(bot.registry)
  // minecraft-data has no Bedrock entities before 1.16.220
  const registryEntities: Registry['entitiesByName'] | undefined = bot.registry.entitiesByName
  const byUnique = new Map<bigint, number>()
  const removing = new Map<number, Removal>()
  const ChatMessage = prismarineChat(bot.registry)
  const listed = new Map<string, Listed>()
  const stats = { unknownEntity: 0, unlisted: 0, local: 0, replaced: 0, unlinked: 0 }
  let localKey: number | undefined
  let localUnique: bigint | undefined
  let localGamemode = 0
  let worldGamemode = 0

  bot.entities = {}
  bot.players = {}
  bot.vehicle = null
  bot._entities = {
    byUniqueId: uniqueId => {
      const key = byUnique.get(uniqueId)
      return key === undefined ? undefined : bot.entities[key]
    },
    byRuntimeId: runtimeId => bot.entities[runtimeKey(runtimeId)],
    stats
  }

  function known (runtimeId: number | bigint): Entity | undefined {
    const entity = bot.entities[runtimeKey(runtimeId)]
    if (entity === undefined) stats.unknownEntity++
    return entity
  }

  /** an entity whose movement the bot takes: not the local player */
  function other (runtimeId: number | bigint): Entity | undefined {
    if (runtimeKey(runtimeId) === localKey) {
      stats.local++
      return undefined
    }
    return known(runtimeId)
  }

  /** the unique id a runtime id had, before it is spawned again, maybe under another */
  function forget (key: number): void {
    for (const [unique, mapped] of byUnique) {
      if (mapped === key) byUnique.delete(unique)
    }
  }

  function turn (entity: Entity, yaw: number, pitch: number, headYaw: number): void {
    entity.yaw = fromNotchianYaw(yaw)
    entity.pitch = fromNotchianPitch(pitch)
    entity.headYaw = fromNotchianYaw(headYaw)
  }

  /** the size and the count the metadata tells; an experience orb's count is its experience */
  function describe (entity: Entity, values: readonly EntityMetadataValue[]): void {
    const width = metadata.value(values, 'boundingbox_width')
    const height = metadata.value(values, 'boundingbox_height')
    const experience = metadata.value(values, 'experience_value')
    if (typeof width === 'number') entity.width = width
    if (typeof height === 'number') entity.height = height
    if (typeof experience === 'number') entity.count = experience
  }

  /** a player's position in move_entity and move_entity_delta is its eye, as in move_player */
  function feetY (entity: Entity, y: number): number {
    return entity.type === 'player' ? feetFromEye({ x: 0, y, z: 0 }).y : y
  }

  /** the entity of an add packet, in bot.entities, its entitySpawn to come */
  function place (spawned: Spawn, name: string): Entity {
    const { key, unique, position, velocity, yaw, pitch, headYaw } = spawned
    const removal = removing.get(key)
    if (removal !== undefined) destroy(key, removal)
    const live = bot.entities[key]
    if (live !== undefined) {
      stats.replaced++
      forget(key)
    }
    const entity = live ?? new BedrockEntity(key)
    const entry = registryEntities?.[name]
    entity.name = name
    entity.type = typeOf(entry)
    entity.kind = entry?.category ?? 'unknown'
    if (entry !== undefined) {
      entity.displayName = entry.displayName
      entity.entityType = entry.id
    }
    entity.width = entry?.width ?? 0
    entity.height = entry?.height ?? 0
    entity.position.set(position.x, position.y, position.z)
    entity.velocity.set(velocity.x, velocity.y, velocity.z)
    turn(entity, yaw, pitch, headYaw)
    const values = metadata.read(spawned.metadata)
    entity.metadata = values
    describe(entity, values)
    const flags = metadata.flags(values)
    if (flags !== undefined) {
      entity.crouching = isSneaking(flags)
      entity.elytraFlying = isGliding(flags)
    }
    entity.attributes = Object.fromEntries(spawned.attributes.map(({ name, value }) => [name, { value, modifiers: [] }]))
    bot.entities[key] = entity
    byUnique.set(unique, key)
    return entity
  }

  /** its entitySpawn, then the rides it shows with */
  function appear (entity: Entity, links: readonly Link[]): void {
    core.emit(bot, 'entitySpawn', entity)
    for (const link of links) relink(link)
  }

  function spawn (spawned: Spawn, name: string): Entity {
    const entity = place(spawned, name)
    appear(entity, spawned.links)
    return entity
  }

  /** off its vehicle, without an event */
  function leaveVehicle (rider: Entity): void {
    const vehicle = rider.vehicle
    if (vehicle !== null) vehicle.passengers = vehicle.passengers.filter(passenger => passenger !== rider)
    rider.vehicle = null
  }

  /** a rider linked to another vehicle leaves the first without entityDetach, as Java */
  function attach (rider: Entity, vehicle: Entity): void {
    leaveVehicle(rider)
    rider.vehicle = vehicle
    vehicle.passengers.push(rider)
    core.emit(bot, 'entityAttach', rider, vehicle)
    if (rider !== bot.entity) return
    bot.vehicle = vehicle
    core.emit(bot, 'mount')
  }

  function detach (rider: Entity, vehicle: Entity): void {
    if (rider.vehicle !== vehicle) {
      stats.unlinked++
      return
    }
    leaveVehicle(rider)
    core.emit(bot, 'entityDetach', rider, vehicle)
    if (rider !== bot.entity) return
    bot.vehicle = null
    core.emit(bot, 'dismount', vehicle)
  }

  function relink ({ ridden_entity_id: riddenId, rider_entity_id: riderId, type }: Link): void {
    const rider = bot._entities.byUniqueId(riderId)
    const vehicle = bot._entities.byUniqueId(riddenId)
    if (rider === undefined || vehicle === undefined) stats.unknownEntity++
    else if (type === UNLINK) detach(rider, vehicle)
    else attach(rider, vehicle)
  }

  /** Java's order: entityUpdate, then the sleep, the elytra and the crouch the update tells; the local player's size is movement's */
  function update (key: number, values: EntityMetadataValue[]): void {
    const entity = bot.entities[key]
    if (entity === undefined) {
      stats.unknownEntity++
      return
    }
    Object.assign(entity.metadata, values)
    if (entity !== bot.entity) describe(entity, values)
    core.emit(bot, 'entityUpdate', entity)
    if (metadata.sleeping(values)) core.emit(bot, 'entitySleep', entity)
    const flags = metadata.flags(values)
    if (flags === undefined) return
    const startsGliding = isGliding(flags) && entity.elytraFlying !== true
    entity.elytraFlying = isGliding(flags)
    if (startsGliding) core.emit(bot, 'entityElytraFlew', entity)
    if (isSneaking(flags)) {
      entity.crouching = true
      core.emit(bot, 'entityCrouch', entity)
    } else if (entity.crouching === true) {
      entity.crouching = false
      core.emit(bot, 'entityUncrouch', entity)
    }
  }

  function destroy (key: number, { entity, unique }: Removal): void {
    removing.delete(key)
    core.emit(bot, 'entityGone', entity)
    entity.isValid = false
    for (const { player } of listed.values()) {
      if (player.entity === entity) player.entity = null
    }
    // servers unlink its riders first; as Java, the rides left end without entityDetach
    leaveVehicle(entity)
    for (const passenger of entity.passengers) passenger.vehicle = null
    if (bot.vehicle === entity) {
      bot.vehicle = null
      core.emit(bot, 'dismount', entity)
    }
    // a unique id spawned again under another runtime id is that entity's now
    if (byUnique.get(unique) === key) byUnique.delete(unique)
    delete bot.entities[key]
  }

  function listedOf (unique: bigint): Listed | undefined {
    return [...listed.values()].find(entry => entry.unique === unique)
  }

  /** Java's: a new uuid joins, a known one is updated; its entity is the one the server spawned of its unique id */
  function list ({ uuid, unique, username }: Extract<Listing, { type: 'add' }>): void {
    const known = listed.get(uuid)
    const player = known?.player ?? {
      uuid,
      username,
      displayName: new ChatMessage({ text: '', extra: [{ text: username }] }),
      gamemode: unique === localUnique ? localGamemode : worldGamemode,
      ping: 0,
      entity: null,
      skinData: undefined
    }
    player.entity = bot._entities.byUniqueId(unique) ?? null
    if (unique === localUnique) bot.player = player
    if (known !== undefined) {
      core.emit(bot, 'playerUpdated', player)
      return
    }
    listed.set(uuid, { player, unique })
    bot.players[username] = player
    core.emit(bot, 'playerJoined', player)
  }

  /** never the local player, as Java; its entity stays until the server removes it */
  function unlist (uuid: string): void {
    const known = listed.get(uuid)
    if (known === undefined) stats.unlisted++
    else if (known.unique === localUnique) stats.local++
    else {
      known.player.entity = null
      listed.delete(uuid)
      delete bot.players[known.player.username]
      core.emit(bot, 'playerLeft', known.player)
    }
  }

  function emitEvent (event: EntityEvent | undefined, runtimeId: number | bigint): void {
    if (event === undefined) return
    const entity = known(runtimeId)
    if (entity !== undefined) core.emit(bot, event, entity)
  }

  // the server lists the local player before start_game, and again right after it (playerUpdated)
  core.observe(OWNER, 'start_game', packet => {
    localKey = runtimeKey(packet.runtime_entity_id)
    localUnique = packet.entity_id
    worldGamemode = gamemodeOf(packet.world_gamemode, 0)
    localGamemode = gamemodeOf(packet.player_gamemode, worldGamemode)
    bot.entities[localKey] = bot.entity
    byUnique.set(localUnique, localKey)
    const own = listedOf(localUnique)
    if (own === undefined) return
    own.player.entity = bot.entity
    own.player.gamemode = localGamemode
    bot.player = own.player
  })
  core.handle(OWNER, 'add_entity', packet => {
    spawn(addedEntity(packet), packet.entity_type.replace(/^minecraft:/, ''))
  })
  core.handle(OWNER, 'add_item_entity', packet => {
    core.emit(bot, 'itemDrop', spawn(addedItem(packet), 'item'))
  })
  core.handle(OWNER, 'add_painting', packet => {
    spawn(addedPainting(packet), 'painting')
  })
  // as the vanilla client, and Java, a player only of the player list
  core.handle(OWNER, 'add_player', packet => {
    const spawned = addedPlayer(packet)
    const known = listed.get(spawned.uuid)
    if (known === undefined) {
      stats.unlisted++
      return
    }
    const entity = place(spawned, 'player')
    entity.type = 'player'
    entity.username = spawned.username
    entity.uuid = spawned.uuid
    entity.eyeHeight = EYE_HEIGHT
    known.player.entity = entity
    // from 1.18.30
    if (spawned.gamemode !== undefined) known.player.gamemode = gamemodeOf(spawned.gamemode, worldGamemode)
    appear(entity, spawned.links)
  })
  core.handle(OWNER, 'player_list', packet => {
    for (const listing of listingsOf(packet)) {
      if (listing.type === 'add') list(listing)
      else unlist(listing.uuid)
    }
  })
  core.observe(OWNER, 'update_player_game_type', packet => {
    const known = listedOf(packet.player_unique_id)
    if (known === undefined) {
      stats.unlisted++
      return
    }
    known.player.gamemode = gamemodeOf(packet.gamemode, worldGamemode)
    core.emit(bot, 'playerUpdated', known.player)
  })
  core.handle(OWNER, 'remove_entity', packet => {
    const unique = packet.entity_id_self
    const key = byUnique.get(unique)
    const entity = key === undefined ? undefined : bot.entities[key]
    if (key === undefined || entity === undefined) stats.unknownEntity++
    else if (entity === bot.entity) stats.local++
    else removing.set(key, { entity, unique })
  })
  // the vanilla client drops the old dimension's entities, which servers do not remove
  core.observe(OWNER, 'change_dimension', () => {
    for (const [unique, key] of byUnique) {
      const entity = bot.entities[key]
      if (entity !== undefined && entity !== bot.entity) removing.set(key, { entity, unique })
    }
  })
  core.handle(OWNER, 'move_entity', packet => {
    const entity = other(packet.runtime_entity_id)
    if (entity === undefined) return
    const { position, rotation } = packet
    entity.position.set(position.x, feetY(entity, position.y), position.z)
    turn(entity, rotation.yaw, rotation.pitch, rotation.head_yaw)
    entity.onGround = (packet.flags & ON_GROUND) !== 0
    core.emit(bot, 'entityMoved', entity)
  })
  // the axes and rotations that changed, each absolute; the rotations as protocol bytes
  core.handle(OWNER, 'move_entity_delta', packet => {
    const entity = other(packet.runtime_entity_id)
    if (entity === undefined) return
    const { x, y, z, rot_x: pitch, rot_y: yaw, rot_z: headYaw } = packet
    entity.position.set(x ?? entity.position.x, y === undefined ? entity.position.y : feetY(entity, y), z ?? entity.position.z)
    if (pitch !== undefined) entity.pitch = fromNotchianPitchByte(pitch)
    if (yaw !== undefined) entity.yaw = fromNotchianYawByte(yaw)
    if (headYaw !== undefined) entity.headYaw = fromNotchianYawByte(headYaw)
    // flags up to 1.26.30
    entity.onGround = (packet.flags?.on_ground ?? packet.on_ground) === true
    core.emit(bot, 'entityMoved', entity)
  })
  // another player's: its eye; the local player's is movement's
  core.observe(OWNER, 'move_player', packet => {
    const entity = other(packet.runtime_id)
    if (entity === undefined) return
    const { x, y, z } = feetFromEye(packet.position)
    entity.position.set(x, y, z)
    turn(entity, packet.yaw, packet.pitch, packet.head_yaw)
    entity.onGround = packet.on_ground
    core.emit(bot, 'entityMoved', entity)
  })
  core.observe(OWNER, 'set_entity_motion', packet => {
    const entity = other(packet.runtime_entity_id)
    if (entity === undefined) return
    const { x, y, z } = packet.velocity
    entity.velocity.set(x, y, z)
  })
  core.observe(OWNER, 'set_entity_data', packet => {
    const key = runtimeKey(packet.runtime_entity_id)
    const values = metadata.read(packet.metadata)
    core.stage(() => { update(key, values) })
  })
  core.handle(OWNER, 'update_attributes', packet => {
    const entity = known(packet.runtime_entity_id)
    if (entity === undefined) return
    const attributes = entity.attributes ?? {}
    // modifiers from 1.19.20
    for (const { name, current, modifiers } of packet.attributes) attributes[name] = { value: current, modifiers: modifiers ?? [] }
    entity.attributes = attributes
    core.emit(bot, 'entityAttributes', entity)
  })
  core.handle(OWNER, 'mob_effect', packet => {
    const entity = known(packet.runtime_entity_id)
    if (entity === undefined) return
    const { event_id: event, effect_id: id, amplifier, duration } = packet
    if (event === 'add' || event === 'update') {
      const effect = { id, amplifier, duration }
      entity.effects[id] = effect
      core.emit(bot, 'entityEffect', entity, effect)
    } else if (event === 'remove') {
      // Java's, for an effect the bot was not told of
      const effect = entity.effects[id] ?? { id, amplifier: -1, duration: -1 }
      delete entity.effects[id]
      core.emit(bot, 'entityEffectEnd', entity, effect)
    }
  })
  core.handle(OWNER, 'entity_event', packet => { emitEvent(eventOf(ENTITY_EVENTS, packet.event_id), packet.runtime_entity_id) })
  core.handle(OWNER, 'animate', packet => { emitEvent(eventOf(ANIMATIONS, packet.action_id), packet.runtime_entity_id) })
  core.handle(OWNER, 'take_item_entity', packet => {
    const collected = known(packet.runtime_entity_id)
    const collector = known(packet.target)
    if (collected !== undefined && collector !== undefined) core.emit(bot, 'playerCollect', collector, collected)
  })
  core.handle(OWNER, 'set_entity_link', packet => { relink(packet.link) })
  core.endOfTick(OWNER, () => {
    for (const [key, removal] of removing) destroy(key, removal)
  })
  bot._session.afterSpawn(() => { core.emit(bot, 'entitySpawn', bot.entity) })

  bot.nearestEntity = (match = () => true) => {
    let nearest: Entity | null = null
    let nearestDistance = Infinity
    for (const entity of Object.values(bot.entities)) {
      if (entity === bot.entity || !match(entity)) continue
      const distance = bot.entity.position.distanceSquared(entity.position)
      if (distance < nearestDistance) {
        nearest = entity
        nearestDistance = distance
      }
    }
    return nearest
  }
}
