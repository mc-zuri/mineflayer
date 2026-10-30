import type { Entity, EntityMetadataValue, EntityType } from 'prismarine-entity'
import type { Registry } from 'prismarine-registry'
import { fromNotchianPitch, fromNotchianPitchByte, fromNotchianYaw, fromNotchianYawByte } from '../../conversions.ts'
import { bedrockEntityClass } from '../entity.ts'
import { addedEntity, addedItem, addedPainting, runtimeKey } from '../entity_packets.ts'
import type { Spawn } from '../entity_packets.ts'
import { EntityMetadata, isGliding, isSneaking } from '../metadata.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// The entities the server shows, by runtime id. Their spawns, moves, attributes, effects and events act in the packet
// pass; their metadata at the start of the next tick, and a removal at the end of the next tick, as in the vanilla
// client. The local player's position, velocity and rotation are movement's.

const OWNER = 'entities'
const ON_GROUND = 1

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
  const stats = { unknownEntity: 0, local: 0, replaced: 0 }
  let localKey: number | undefined

  bot.entities = {}
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

  function spawn (spawned: Spawn, name: string): Entity {
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
    core.emit(bot, 'entitySpawn', entity)
    return entity
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
    // a unique id spawned again under another runtime id is that entity's now
    if (byUnique.get(unique) === key) byUnique.delete(unique)
    delete bot.entities[key]
  }

  function emitEvent (event: EntityEvent | undefined, runtimeId: number | bigint): void {
    if (event === undefined) return
    const entity = known(runtimeId)
    if (entity !== undefined) core.emit(bot, event, entity)
  }

  core.observe(OWNER, 'start_game', packet => {
    localKey = runtimeKey(packet.runtime_entity_id)
    bot.entities[localKey] = bot.entity
    byUnique.set(packet.entity_id, localKey)
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
    entity.position.set(position.x, position.y, position.z)
    turn(entity, rotation.yaw, rotation.pitch, rotation.head_yaw)
    entity.onGround = (packet.flags & ON_GROUND) !== 0
    core.emit(bot, 'entityMoved', entity)
  })
  // the axes and rotations that changed, each absolute; the rotations as protocol bytes
  core.handle(OWNER, 'move_entity_delta', packet => {
    const entity = other(packet.runtime_entity_id)
    if (entity === undefined) return
    const { x, y, z, rot_x: pitch, rot_y: yaw, rot_z: headYaw } = packet
    entity.position.set(x ?? entity.position.x, y ?? entity.position.y, z ?? entity.position.z)
    if (pitch !== undefined) entity.pitch = fromNotchianPitchByte(pitch)
    if (yaw !== undefined) entity.yaw = fromNotchianYawByte(yaw)
    if (headYaw !== undefined) entity.headYaw = fromNotchianYawByte(headYaw)
    // flags up to 1.26.30
    entity.onGround = (packet.flags?.on_ground ?? packet.on_ground) === true
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
