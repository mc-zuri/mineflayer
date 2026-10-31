const { horseFlagsIndex } = require('./horse')
const { entityDataKeys } = require('./entityData')

const f32 = Math.fround

// LivingEntity.getAgeScale of a baby: half, but for these (AgeableMob, Zombie, Piglin and Zoglin's baby flag)
const AGE_SCALES = { turtle: 0.3, armadillo: 0.6, camel: 0.45, dolphin: 0.65, happy_ghast: 0.2375 }

// Player.getDimensions by the synced pose from 1.14 (1.14 PlayerEntity.java:109-118 STANDING 0.6F x 1.8F, SLEEPING
// 0.2F, FALL_FLYING, SWIMMING and SPIN_ATTACK 0.6F, CROUCHING 1.5F, DYING 0.2F; 1.21.11 Avatar.java:54-55), by the
// pose's ordinal: DYING is 6 to 1.16 (1.14 EntityPose.java:4-10, 1.16.5 :4-10), 7 from 1.17, which put LONG_JUMPING
// (the standing size) at 6 (1.17 EntityPose.java:4-11). The sleeping and dying sizes are fixed, which the scale leaves.
const PLAYER_POSE_SIZES = { 0: [0.6, 1.8], 1: [0.6, 0.6], 2: [0.2, 0.2], 3: [0.6, 0.6], 4: [0.6, 0.6], 5: [0.6, 1.5] }
const SLIMES = new Set(['slime', 'magma_cube', 'Slime', 'LavaSlime'])

// The synced data of an entity by name, where the version's layout names it (entityDataKeys), else at `index`
function syncedData (registry, entity, key, index) {
  const at = entityDataKeys(registry, entity.name).indexOf(key)
  const i = at >= 0 ? at : index
  return i != null && i >= 0 ? entity.metadata?.[i] : undefined
}

// LivingEntity.getScale (1.20.5+): the scale attribute with its modifiers, clamped to 0.0625 - 16
function scaleOf (registry, entity) {
  if (!registry.version['>=']('1.20.5') || !entity.attributes) return 1
  const key = Object.keys(entity.attributes).find((name) => /(^|[.:])scale$/.test(name))
  const prop = key && entity.attributes[key]
  if (!prop) return 1
  let base = prop.value
  for (const mod of prop.modifiers ?? []) if (mod.operation === 0 || mod.operation === 'add_value') base += mod.amount
  let value = base
  for (const mod of prop.modifiers ?? []) if (mod.operation === 1 || mod.operation === 'add_multiplied_base') value += base * mod.amount
  for (const mod of prop.modifiers ?? []) if (mod.operation === 2 || mod.operation === 'add_multiplied_total') value *= 1 + mod.amount
  return Math.min(Math.max(value, 0.0625), 16)
}

// Another player's or a slime's box as the client sizes it (Entity.refreshDimensions), and from 1.20.5 any living
// entity's by its scale (LivingEntity.getDimensions: getDefaultDimensions(pose).scale(getScale()), again whenever the
// scale changes, 1.20.5 LivingEntity.java:2462-2465), as { width, height, scaled }; null where it keeps its size:
// - a slime: 0.51000005F times its size before 1.14 (its byte at 16 on 1.8: 1.8.9 SlimeEntity.java:53, 145; 1.9.4
//   SlimeEntity.java:68), 2.04F scaled by 0.255F times it to 1.20.4 (1.14 SlimeEntity.java:328, 1.20.4 :363), 0.52F
//   scaled by it from 1.20.5 (1.21.11 Slime.java:342-343)
// - a player from 1.14: its pose's size; from 1.9 to 1.13: 0.6F high gliding, 0.2F by 0.2F in a bed, 0.6F high
//   swimming or in the riptide spin (1.13), 1.65F sneaking, else 1.8F (EntityPlayer.updateSize, 1.9.4
//   PlayerEntity.java:362-386, 1.13.2 :419-449); on 1.8 0.2F by 0.2F in a bed, else 0.6F by 1.8F (1.8.9
//   PlayerEntity.java:1150, 1205: trySleep, awaken)
// - another living entity scaled (from 1.20.5): the type's size, a baby's by its age scale, times the scale; back to
//   the type's (a baby's) once the scale is 1 again (`scaled`: the box was scaled before)
function entityDimensions (registry, entity, { inBed = false, scaled = false } = {}) {
  if (!entity.name) return null
  const version = registry.version
  const scale = scaleOf(registry, entity)
  let width
  let height
  let fixed = false
  if (SLIMES.has(entity.name)) {
    const size = syncedData(registry, entity, 'size', version['<']('1.9') ? 16 : horseFlagsIndex(registry) - 1)
    if (typeof size !== 'number') return null
    if (version['<']('1.14')) {
      width = height = f32(f32(0.51000005) * size)
    } else if (version['<']('1.20.5')) {
      width = height = f32(f32(2.04) * f32(f32(0.255) * size))
    } else {
      width = height = f32(f32(0.52) * size)
    }
  } else if (entity.type === 'player') {
    if (version['>=']('1.14')) {
      const pose = syncedData(registry, entity, 'pose', 6) ?? 0
      const dying = version['<']('1.17') ? 6 : 7
      fixed = pose === 2 || pose === dying
      const size = pose === dying ? [0.2, 0.2] : (PLAYER_POSE_SIZES[pose] ?? PLAYER_POSE_SIZES[0])
      width = size[0]
      height = size[1]
    } else if (version['>=']('1.9')) {
      const flags = syncedData(registry, entity, 'shared_flags', 0) ?? 0
      const livingFlags = version['>=']('1.13') ? syncedData(registry, entity, 'living_entity_flags', 6) ?? 0 : 0
      width = 0.6
      if (flags & 0x80) height = 0.6
      else if (inBed) width = height = 0.2
      else if (version['>=']('1.13') && ((flags & 0x10) || (livingFlags & 0x04))) height = 0.6
      else if (flags & 0x02) height = 1.65
      else height = 1.8
    } else {
      width = inBed ? 0.2 : 0.6
      height = inBed ? 0.2 : 1.8
    }
  } else {
    if (scale === 1 && !scaled) return null
    const data = registry.entitiesByName[entity.name]
    if (!data || data.width == null || data.height == null) return null
    const baby = registry.supportFeature('mcDataHasEntityMetadata') && syncedData(registry, entity, 'baby') === true
    const age = baby ? (AGE_SCALES[entity.name] ?? 0.5) : 1
    // (the scale back at 1: the type's size as the baby's sizing keeps it)
    if (scale === 1) return { width: data.width * age, height: data.height * age, scaled: false }
    width = f32(f32(data.width) * f32(age))
    height = f32(f32(data.height) * f32(age))
  }
  if (!fixed && scale !== 1) {
    width = f32(f32(width) * f32(scale))
    height = f32(f32(height) * f32(scale))
  }
  return { width, height, scaled: scale !== 1 }
}

module.exports = { entityDimensions, scaleOf, AGE_SCALES }
