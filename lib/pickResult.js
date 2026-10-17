// The item the pick key picks before 1.21.4, when the client picked it itself (Minecraft.pickBlock / middleClickMouse):
// the block's clone item (Block.getCloneItemStack, before 1.13 Block.getItem with the block's damageDropped) and, in
// creative, the entity's (Entity.getPickResult, before 1.14 Minecraft.pickBlock's own list). From 1.21.4 the server
// picks it (ServerboundPickItemFromBlockPacket / FromEntity), and nothing here is used.
//
// Approximations: the data a block entity gives the item (a banner's patterns, a shulker box's items, a pot's sherds, a
// light's level, before 1.13 a bed's, banner's or skull's colour and kind, a flower pot's plant) is not added; before
// 1.13 a boat is the oak one and an item frame gives itself (their metadata has no names there).

// 1.13+: the blocks whose item is another's (Item.BY_BLOCK: ItemNameBlockItem, registerBlock with several blocks, and
// the getCloneItemStack overrides); null: none
const MODERN = {
  redstone_wire: 'redstone',
  tripwire: 'string',
  wheat: 'wheat_seeds',
  carrots: 'carrot',
  potatoes: 'potato',
  beetroots: 'beetroot_seeds',
  cocoa: 'cocoa_beans',
  sweet_berry_bush: 'sweet_berries',
  melon_stem: 'melon_seeds',
  attached_melon_stem: 'melon_seeds',
  pumpkin_stem: 'pumpkin_seeds',
  attached_pumpkin_stem: 'pumpkin_seeds',
  torchflower_crop: 'torchflower_seeds',
  pitcher_crop: 'pitcher_pod',
  cave_vines: 'glow_berries',
  cave_vines_plant: 'glow_berries',
  powder_snow: 'powder_snow_bucket',
  bamboo_sapling: 'bamboo',
  kelp_plant: 'kelp',
  weeping_vines_plant: 'weeping_vines',
  twisting_vines_plant: 'twisting_vines',
  big_dripleaf_stem: 'big_dripleaf',
  tall_seagrass: 'seagrass',
  water_cauldron: 'cauldron',
  lava_cauldron: 'cauldron',
  powder_snow_cauldron: 'cauldron',
  potted_azalea_bush: 'azalea',
  potted_flowering_azalea_bush: 'flowering_azalea',
  frosted_ice: null,
  moving_piston: null
}

// Before 1.13 (Item.getItemFromBlock, Block.getItem overrides): [item, damage]
const LEGACY = {
  wheat: ['wheat_seeds'],
  carrots: ['carrot'],
  potatoes: ['potato'],
  beetroots: ['beetroot_seeds'],
  pumpkin_stem: ['pumpkin_seeds'],
  melon_stem: ['melon_seeds'],
  redstone_wire: ['redstone'],
  tripwire: ['string'],
  cocoa: ['dye', 3],
  standing_sign: ['sign'],
  wall_sign: ['sign'],
  standing_banner: ['banner'],
  wall_banner: ['banner'],
  unpowered_repeater: ['repeater'],
  powered_repeater: ['repeater'],
  unpowered_comparator: ['comparator'],
  powered_comparator: ['comparator'],
  lit_furnace: ['furnace'],
  lit_redstone_ore: ['redstone_ore'],
  lit_redstone_lamp: ['redstone_lamp'],
  unlit_redstone_torch: ['redstone_torch'],
  daylight_detector_inverted: ['daylight_detector'],
  double_stone_slab: ['stone_slab'],
  double_wooden_slab: ['wooden_slab'],
  double_stone_slab2: ['stone_slab2'],
  purpur_double_slab: ['purpur_slab'],
  farmland: ['dirt'],
  mob_spawner: null,
  piston_extension: null
}

// Before 1.13 the items with subtypes (Item.getHasSubtypes): their damage is the kind, matched by the pick
const SUBTYPES = new Set(['stone', 'dirt', 'planks', 'sapling', 'sand', 'log', 'log2', 'leaves', 'leaves2', 'sponge',
  'sandstone', 'red_sandstone', 'tallgrass', 'wool', 'red_flower', 'stone_slab', 'stone_slab2', 'wooden_slab',
  'stained_glass', 'stained_glass_pane', 'stained_hardened_clay', 'monster_egg', 'stonebrick', 'cobblestone_wall', 'anvil',
  'quartz_block', 'prismarine', 'carpet', 'double_plant', 'concrete', 'concrete_powder', 'bed', 'banner', 'skull', 'coal',
  'golden_apple', 'fish', 'cooked_fish', 'dye', 'potion', 'filled_map'])
// (1.8's spawn egg is told by its damage, the entity's id; from 1.9 by its EntityTag)
const subtypes = (registry, name) => SUBTYPES.has(name) || (name === 'spawn_egg' && !registry.version['>=']('1.9'))

// Before 1.13 the block's damageDropped, as its kind from the metadata
function legacyDamage (bot, block, item) {
  if (!SUBTYPES.has(item)) return 0
  const m = block.metadata ?? 0
  switch (block.name) {
    case 'sapling': return m & 7
    case 'log': case 'log2': case 'leaves': case 'leaves2': return m & 3
    case 'stone_slab': case 'stone_slab2': case 'wooden_slab': case 'double_stone_slab': case 'double_stone_slab2':
    case 'double_wooden_slab': return m & 7
    case 'anvil': return m >> 2
    case 'quartz_block': return m >= 2 ? 2 : m
    // (the upper half's kind is the lower half's: BlockDoublePlant)
    case 'double_plant': return (m & 8) ? (bot.blockAt(block.position.offset(0, -1, 0))?.metadata ?? 0) & 7 : m & 7
    case 'bed': case 'standing_banner': case 'wall_banner': case 'skull': return 0
    default: return m
  }
}

// The entities that spawn eggs do not make before 1.13 (EntityList.ENTITY_EGGS)
const NO_EGG = /^(EnderDragon|ender_dragon|WitherBoss|wither|SnowMan|snowman|VillagerGolem|villager_golem|Giant|giant|illusion_illager)$/
const LIVING = new Set(['mob', 'hostile', 'animal', 'passive', 'water_creature', 'ambient'])
// Boat.Type, in its order of the ids its metadata holds (1.13 - 1.21.1)
function boatTypes (registry) {
  if (registry.version['>=']('1.20')) return ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'cherry', 'dark_oak', 'mangrove', 'bamboo']
  if (registry.version['>=']('1.19')) return ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak', 'mangrove']
  return ['oak', 'spruce', 'birch', 'jungle', 'acacia', 'dark_oak']
}

function createPickResult (bot) {
  const registry = bot.registry
  const Item = require('prismarine-item')(registry)
  const modern = registry.version['>=']('1.13')
  const item = (name, metadata = 0, nbt = null) => {
    const def = registry.itemsByName[name]
    return def ? new Item(def.id, 1, metadata, nbt) : null
  }
  const metadataOf = (entity, key) => {
    const index = registry.entitiesByName[entity.name]?.metadataKeys?.indexOf(key) ?? -1
    return index >= 0 ? entity.metadata?.[index] : undefined
  }

  // Block.getCloneItemStack: null for none (an empty stack: the pick does nothing)
  function blockItem (block) {
    if (!block || /^(air|cave_air|void_air)$/.test(block.name)) return null
    const name = block.name
    if (!modern) {
      if (name in LEGACY) {
        const legacy = LEGACY[name]
        if (!legacy) return null
        return item(legacy[0], legacy[1] ?? legacyDamage(bot, block, legacy[0]))
      }
      // (a piston's head: the piston, sticky by the head's bit 8)
      if (name === 'piston_head') return item((block.metadata & 8) ? 'sticky_piston' : 'piston')
      return item(name, legacyDamage(bot, block, name))
    }
    if (name in MODERN) return MODERN[name] ? item(MODERN[name]) : null
    if (name === 'piston_head') return item(block.getProperties().type === 'sticky' ? 'sticky_piston' : 'piston')
    if (/(^|_)candle_cake$/.test(name)) return item('cake')
    if (registry.itemsByName[name]) return item(name)
    // a flower pot's plant (FlowerPotBlock), a wall torch, sign, banner, skull or coral fan the standing one's item
    // (StandingAndWallBlockItem, SignItem, HangingSignItem)
    if (/^potted_/.test(name)) return item(name.slice('potted_'.length))
    if (/_wall_|^wall_/.test(name)) return item(name.replace('_wall_', '_').replace(/^wall_/, ''))
    return null
  }

  // Entity.getPickResult (in creative only): null for none
  function entityItem (entity) {
    const name = entity?.name ?? ''
    if (/^(painting|Painting)$/.test(name)) return item('painting')
    if (/^(leash_knot|LeashKnot)$/.test(name)) return item('lead')
    if (/^(item_frame|glow_item_frame|ItemFrame)$/.test(name)) {
      const framed = metadataOf(entity, 'item')
      // (a copy of the framed item: ItemFrame.getPickResult)
      const held = framed ? Item.fromNotch(framed) : null
      if (held) return Item.fromNotch(Item.toNotch(held))
      return item(name === 'glow_item_frame' ? 'glow_item_frame' : 'item_frame')
    }
    if (/minecart/i.test(name)) {
      const kind = /chest/i.test(name) ? 'chest_minecart' : /furnace/i.test(name) ? 'furnace_minecart' : /tnt/i.test(name) ? 'tnt_minecart' : /hopper/i.test(name) ? 'hopper_minecart' : /command/i.test(name) ? 'command_block_minecart' : 'minecart'
      return item(kind)
    }
    if (/^(armor_stand|ArmorStand)$/.test(name)) return item('armor_stand')
    if (/^(end_crystal|ender_crystal|EnderCrystal)$/.test(name)) return registry.version['>=']('1.9') ? item('end_crystal') : null
    if (/^(boat|chest_boat|Boat)$/.test(name)) {
      if (!modern) return item('boat')
      const type = boatTypes(registry)[metadataOf(entity, 'type') ?? 0] ?? 'oak'
      const chest = name === 'chest_boat'
      return item(type === 'bamboo' ? (chest ? 'bamboo_chest_raft' : 'bamboo_raft') : `${type}_${chest ? 'chest_boat' : 'boat'}`)
    }
    // (1.21.2+: a boat of each wood its own entity, the item's name)
    if (/(_boat|_raft)$/.test(name) && registry.itemsByName[name]) return item(name)
    // a mob's spawn egg (Mob.getPickResult; 1.13 SpawnEggItem.forEntity); before 1.13 the one spawn egg, of the entity's
    // id (1.8: its damage) or with its EntityTag (1.9 - 1.12: SpawnEggItem.setEggEntity / ItemMonsterPlacer)
    if (modern) return item(`${name}_spawn_egg`)
    if (!LIVING.has(entity.type) || NO_EGG.test(name)) return null
    if (!registry.version['>=']('1.9')) {
      const id = registry.entitiesByName[name]?.id
      return id == null ? null : item('spawn_egg', id)
    }
    const id = registry.version['>=']('1.11') ? `minecraft:${name}` : name
    return item('spawn_egg', 0, { type: 'compound', name: '', value: { EntityTag: { type: 'compound', value: { id: { type: 'string', value: id } } } } })
  }

  return { blockItem, entityItem, subtypes: name => subtypes(registry, name) }
}

module.exports = { createPickResult }
