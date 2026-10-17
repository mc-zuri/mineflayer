const { horseFlagsIndex } = require('./horse')

// The names of an entity's synced data by index (SynchedEntityData: the ids its classes define, in order), for what the
// client's predictions read of it: minecraft-data's from 1.19.4. Before, the version's own layout:
// - 1.8's DataWatcher ids: Entity's flags at 0, EntityAgeable's age at 12 (a baby's below 0), EntityLiving's no AI at
//   15 and the mob's own from 16; an item frame's item at 8 and its rotation at 9
// - from 1.9 the ids follow on: Entity's (5; 6 with 1.10's no gravity, 7 with 1.14's pose, 8 with 1.17's ticks frozen),
//   LivingEntity's, Mob's flags and AgeableMob's baby, then the mob's own (where AbstractHorse's flags are:
//   horseFlagsIndex); a hanging entity has none of its own: an item frame's item and rotation follow Entity's
const AGEABLE_OWN = {
  sheep: ['wool'],
  Sheep: ['wool'],
  pig: ['saddle', 'boost_time'],
  Pig: ['saddle', 'boost_time'],
  strider: ['boost_time', 'suffocating', 'saddle'],
  horse: ['flags'],
  donkey: ['flags'],
  mule: ['flags'],
  skeleton_horse: ['flags'],
  zombie_horse: ['flags'],
  llama: ['flags'],
  trader_llama: ['flags'],
  EntityHorse: ['flags'],
  cow: [],
  Cow: [],
  mooshroom: [],
  MushroomCow: [],
  goat: []
}
const ITEM_FRAME = /^(item_frame|glow_item_frame|ItemFrame)$/

function entityDataKeys (registry, name) {
  const named = registry.entitiesByName[name]?.metadataKeys
  if (named) return named
  const version = registry.version
  const keys = []
  const own = AGEABLE_OWN[name]
  if (version['<']('1.9')) {
    if (ITEM_FRAME.test(name)) return Object.assign(keys, { 8: 'item', 9: 'rotation' })
    if (!own) return keys
    Object.assign(keys, { 0: 'shared_flags', 12: 'age', 15: 'mob_flags' })
    // (1.8's pig has no boost time)
    own.slice(0, 1).forEach((key, i) => { keys[16 + i] = key })
    return keys
  }
  const entityCount = version['<']('1.10') ? 5 : version['<']('1.14') ? 6 : version['<']('1.17') ? 7 : 8
  if (ITEM_FRAME.test(name)) return Object.assign(keys, { 0: 'shared_flags', [entityCount]: 'item', [entityCount + 1]: 'rotation' })
  if (!own) return keys
  const first = horseFlagsIndex(registry)
  Object.assign(keys, { 0: 'shared_flags', [first - 2]: 'mob_flags', [first - 1]: 'baby' })
  own.forEach((key, i) => { keys[first + i] = key })
  return keys
}

module.exports = { entityDataKeys }
