// AbstractHorse.isSaddled: bit 4 of its flags (DATA_ID_FLAGS) until 1.21.5, at the index the version's entity data
// puts them (an int at 16 on 1.8, a byte at 12 on 1.9, 13 on 1.10 - 1.13, 15 on 1.14, 16 on 1.15 - 1.16, 17 since);
// from 1.21.5 the saddle it wears (EquipmentSlot.SADDLE, slot 7)
function horseFlagsIndex (registry) {
  const version = registry.version
  if (version['<']('1.9')) return 16
  if (version['<']('1.10')) return 12
  if (version['<']('1.14')) return 13
  if (version['<']('1.15')) return 15
  if (version['<']('1.17')) return 16
  return 17
}

function horseSaddleFlag (entity, registry) {
  if (registry.version['>=']('1.21.5')) return entity?.equipment?.[7]?.name === 'saddle'
  const flags = entity?.metadata?.[horseFlagsIndex(registry)]
  return typeof flags === 'number' && (flags & 0x04) !== 0
}

module.exports = { horseFlagsIndex, horseSaddleFlag }
