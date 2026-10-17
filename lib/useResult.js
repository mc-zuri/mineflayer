// What the vanilla client predicts a right click comes to (InteractionResult), which decides whether it swings the arm
// (a Success the client predicts: SwingSource.PREDICTED, before 1.21.2 InteractionResult.SUCCESS), whether
// Minecraft.startUseItem stops (a Success, CONSUME included; on a block a FAIL too) or goes on to the item in the hand
// and then to the off hand (PASS).
//
// Results: 'success' (the client swings), 'success_server' (the server carries it out and swings), 'consume' (it acts
// without a swing), 'fail', 'pass'. Inside a block's own use 'try_empty' is InteractionResult.TRY_WITH_EMPTY_HAND.
//
// The rules are vanilla's client side of MultiPlayerGameMode.performUseItemOn (BlockBehaviour.useItemOn, then
// useWithoutItem for the main hand, then Item.useOn) and of MultiPlayerGameMode.useItem (Item.use), as 26.3 has them,
// with the versions where a block or item did otherwise. Approximations: a block's placement is checked for its target
// being free (BlockPlaceContext.canPlace), inside the build height, unobstructed by the entities that block building
// (Level.isUnobstructed, with the default state's collision boxes) and, for crops and plants, standing on what they grow
// on; the other reasons a placement fails (BlockItem.getPlacementState, canSurvive of attached blocks) are not.
const FACE_OFFSETS = [[0, -1, 0], [0, 1, 0], [0, 0, -1], [0, 0, 1], [-1, 0, 0], [1, 0, 0]]
const DOWN = 0
const UP = 1
const FACING = { down: 0, up: 1, north: 2, south: 3, west: 4, east: 5 }

const CONSUMES = new Set(['success', 'success_server', 'consume'])
const consumes = result => CONSUMES.has(result)

// The blocks a placement (or a fluid) replaces (BlockBehaviour.canBeReplaced: the replaceable ones)
const REPLACEABLE = /^(air|cave_air|void_air|water|flowing_water|lava|flowing_lava|short_grass|grass|tallgrass|tall_grass|fern|large_fern|dead_bush|deadbush|bush|vine|seagrass|tall_seagrass|fire|soul_fire|structure_void|light|glow_lichen|sculk_vein|bubble_column|nether_sprouts|warped_roots|crimson_roots|hanging_roots|short_dry_grass|tall_dry_grass|leaf_litter|resin_clump)$/
// Blocks whose screen or action a click opens or does (useWithoutItem returns SUCCESS on the client)
const OPENS = /^(chest|trapped_chest|(exposed_|weathered_|oxidized_)?copper_chest|waxed_(exposed_|weathered_|oxidized_)?copper_chest|ender_chest|barrel|(.+_)?shulker_box|furnace|lit_furnace|blast_furnace|smoker|(chipped_|damaged_)?anvil|crafting_table|enchanting_table|cartography_table|smithing_table|loom|stonecutter|grindstone|brewing_stand|hopper|dispenser|dropper|beacon|crafter|dragon_egg|lever|(.+_)?fence_gate|fence_gate|note_?block|daylight_detector(_inverted)?)$/
const SCREEN_BLOCK_OPENS_FOR_OP = /^(command_block|chain_command_block|repeating_command_block|jigsaw|structure_block|test_block|test_instance_block)$/
const BED = /(^|_)bed$/
const BUTTON = /_button$/
const DOOR = /(^|_)door$/
const TRAPDOOR = /trapdoor$/
const REDSTONE_DIODE = /^(unpowered_|powered_)?(repeater|comparator)$/
const SIGN = /_sign$|^(standing|wall)_sign$/
const CAMPFIRE_FOOD = /^(beef|porkchop|chicken|mutton|rabbit|cod|salmon|potato|kelp)$/
const POTTABLE = /^(.+_sapling|mangrove_propagule|dandelion|poppy|blue_orchid|allium|azure_bluet|.+_tulip|oxeye_daisy|cornflower|lily_of_the_valley|wither_rose|torchflower|open_eyeblossom|closed_eyeblossom|red_mushroom|brown_mushroom|fern|dead_bush|cactus|bamboo|crimson_fungus|warped_fungus|crimson_roots|warped_roots|azalea|flowering_azalea|.+_mushroom)$/
const COMPOSTABLE = /(_seeds|_sapling|_leaves|^short_grass|^grass$|^tall_grass|^fern|^large_fern|^kelp|^dried_kelp|^seagrass|^sweet_berries|^glow_berries|^vine|^moss|^cactus|^sugar_cane|^melon|^pumpkin|^carrot|^potato|^beetroot|^wheat|^apple|^bread|^cookie|^cake|^pumpkin_pie|^hay_block|^.+_mushroom|^.+_fungus|^.+_roots|^nether_wart|^lily_pad|^cocoa_beans|^dandelion|^poppy|^.+_tulip|^azure_bluet|^allium|^blue_orchid|^oxeye_daisy|^cornflower|^lily_of_the_valley|^wither_rose|^sunflower|^lilac|^rose_bush|^peony|^torchflower|^pitcher|^spore_blossom|^azalea|^flowering_azalea|^big_dripleaf|^small_dripleaf|^hanging_roots|^mangrove_roots|^pink_petals|^wildflowers|^leaf_litter|^bush|^firefly_bush|^cactus_flower|^.+_dry_grass|^eyeblossom|^open_eyeblossom|^closed_eyeblossom|^pale_moss|^pale_hanging_moss)/
const BOOKSHELF_BOOKS = /^(book|written_book|writable_book|enchanted_book|knowledge_book)$/
const LECTERN_BOOKS = /^(written_book|writable_book)$/
const SIGN_APPLICATOR = /_dye$|^(glow_ink_sac|ink_sac|honeycomb)$/
// Items a block item places as another block
const ITEM_BLOCK = {
  redstone: 'redstone_wire',
  string: 'tripwire',
  wheat_seeds: 'wheat',
  seeds: 'wheat',
  beetroot_seeds: 'beetroots',
  melon_seeds: 'melon_stem',
  pumpkin_seeds: 'pumpkin_stem',
  torchflower_seeds: 'torchflower_crop',
  pitcher_pod: 'pitcher_crop',
  carrot: 'carrots',
  potato: 'potatoes',
  sweet_berries: 'sweet_berry_bush',
  glow_berries: 'cave_vines',
  cocoa_beans: 'cocoa',
  nether_wart: 'nether_wart',
  powder_snow_bucket: 'powder_snow',
  sign: 'standing_sign',
  reeds: 'reeds',
  sugar_cane: 'sugar_cane',
  repeater: 'unpowered_repeater',
  comparator: 'unpowered_comparator',
  skull: 'skull',
  banner: 'standing_banner'
}
// what crops grow on (CropBlock.mayPlaceOn), and what plants do (VegetationBlock.mayPlaceOn: BlockTags.DIRT, farmland)
const CROP = /^(wheat|carrots|potatoes|beetroots|melon_stem|pumpkin_stem|torchflower_crop|pitcher_crop)$/
const PLANT = /^(.+_sapling|dandelion|poppy|blue_orchid|allium|azure_bluet|.+_tulip|oxeye_daisy|cornflower|lily_of_the_valley|torchflower|short_grass|fern|sweet_berry_bush|tall_grass|large_fern|sunflower|lilac|rose_bush|peony)$/
const DIRT = /^(dirt|grass_block|grass|podzol|coarse_dirt|mycelium|rooted_dirt|moss_block|pale_moss_block|mud|muddy_mangrove_roots|farmland)$/
// the entities a placed block cannot overlap (Entity.blocksBuilding: living entities but markers, boats, minecarts,
// end crystals, falling blocks, primed TNT)
const LIVING_TYPES = new Set(['mob', 'hostile', 'passive', 'animal', 'living', 'ambient', 'water_creature', 'player'])
const BLOCKS_BUILDING = /boat|raft|minecart|end_crystal|ender_crystal|falling_block|^tnt$|primed_tnt|armor_stand/
// Items whose use in the air the client predicts succeeds (InteractionResult.SUCCESS): a throw, a cast, a book opened
const THROWN = /^(snowball|egg|blue_egg|brown_egg|ender_pearl|splash_potion|lingering_potion|experience_bottle|wind_charge|fishing_rod|written_book|writable_book)$/
const ARMOR = /_(helmet|chestplate|leggings|boots)$|^(elytra|turtle_helmet)$/
const BOAT = /(_boat|_raft)$|^boat$/
// the foods eaten on a full stomach (FoodProperties.canAlwaysEat), from the version they are
const ALWAYS_EDIBLE = { golden_apple: '1.8', enchanted_golden_apple: '1.8', chorus_fruit: '1.9', suspicious_stew: '1.17' }

function createUsePrediction (bot) {
  const registry = bot.registry
  const version = registry.version
  const Block = require('prismarine-block')(registry)

  const mayBuild = () => bot.game.gameMode !== 'adventure' && bot.game.gameMode !== 'spectator'
  const creative = () => bot.game.gameMode === 'creative'
  // Player.canEat: from 1.15 an invulnerable player (Abilities.invulnerable: creative, spectator, or as the server gives
  // it) or a hungry one; before, a hungry one that is not invulnerable (Abilities.disableDamage). An always edible
  // food (FoodProperties.canAlwaysEat) is eaten on a full stomach too.
  const invulnerable = () => creative() || bot.game.gameMode === 'spectator' || !!bot.entity?.isInvulnerable
  const canEat = (alwaysEdible = false) => version['>=']('1.15')
    ? invulnerable() || alwaysEdible || bot.food < 20
    : !invulnerable() && (alwaysEdible || bot.food < 20)
  const alwaysEdible = name => ALWAYS_EDIBLE[name] != null && version['>='](ALWAYS_EDIBLE[name])
  const props = block => (typeof block.getProperties === 'function' ? block.getProperties() : {}) ?? {}
  const truthy = value => value === true || value === 'true'
  const handItem = offHand => (offHand ? bot.inventory.slots[45] : bot.heldItem) ?? null

  // ---- the item in hand on a block (Item.useOn) ----

  // The block a block item places, or null (BlockItem)
  function placedBlock (item) {
    if (!item) return null
    return registry.blocksByName[ITEM_BLOCK[item.name]] ?? registry.blocksByName[item.name] ?? null
  }

  function replaceable (block, item) {
    if (!block) return false
    if (REPLACEABLE.test(block.name)) return true
    // a single snow layer (SnowLayerBlock.canBeReplaced), unless more snow goes on it
    if ((block.name === 'snow' || block.name === 'snow_layer') && Number(props(block).layers ?? 1) === 1) return item?.name !== block.name
    return false
  }

  // Level.isUnobstructed: no entity that blocks building overlaps the boxes (by more than VoxelShape's tolerance)
  function unobstructed (boxes, position) {
    if (!boxes.length) return true
    const eps = 1e-7
    const overlaps = (entity) => {
      if (!entity?.position) return false
      const w = (entity.width ?? 0.6) / 2
      const h = entity.height ?? 1.8
      const p = entity.position
      return boxes.some(([x0, y0, z0, x1, y1, z1]) =>
        p.x - w < position.x + x1 - eps && p.x + w > position.x + x0 + eps &&
        p.y < position.y + y1 - eps && p.y + h > position.y + y0 + eps &&
        p.z - w < position.z + z1 - eps && p.z + w > position.z + z0 + eps)
    }
    if (bot.game.gameMode !== 'spectator' && overlaps(bot.entity)) return false
    return !Object.values(bot.entities).some(e => e !== bot.entity && e.isValid !== false &&
      (LIVING_TYPES.has(e.type) || BLOCKS_BUILDING.test(e.name ?? '')) && !/^marker$/.test(e.name ?? '') && overlaps(e))
  }

  // the block at a position, null outside the loaded world
  const at = position => bot.blockAt(position)

  // BlockItem.place: where the block goes, and whether it can (SUCCESS) or not (FAIL); mayPlace false where the block
  // cannot go there at all (World.mayPlace: a target not replaceable, an entity in the way, a plant off its ground)
  function placement (item, clicked, face) {
    const placed = placedBlock(item)
    if (!placed) return null
    const replaceClicked = replaceable(clicked, item)
    const position = replaceClicked ? clicked.position : clicked.position.offset(...FACE_OFFSETS[face])
    const result = { position, block: placed, face }
    const minY = bot.game.minY ?? 0
    const height = bot.game.height ?? 256
    if (position.y < minY || position.y >= minY + height) return { ...result, result: 'fail' }
    const refused = { ...result, result: 'fail', mayPlace: false }
    if (!replaceClicked && !replaceable(at(position), item)) return refused
    const below = at(position.offset(0, -1, 0))
    if (CROP.test(placed.name) && below?.name !== 'farmland') return refused
    if (PLANT.test(placed.name) && !(below && DIRT.test(below.name))) return refused
    let boxes = []
    if (placed.defaultState != null) {
      try { boxes = Block.fromStateId(placed.defaultState, 0).shapes ?? [] } catch (err) { boxes = [] }
    }
    if (!unobstructed(boxes, position)) return refused
    return { ...result, result: 'success' }
  }

  const above = block => at(block.position.offset(0, 1, 0))
  const airAbove = block => /^(air|cave_air|void_air)$/.test(above(block)?.name ?? 'air')
  const STRIPPABLE = /^(?!stripped_)(.+_(log|wood|stem|hyphae)|bamboo_block|log|log2)$/
  const SCRAPABLE = /^(?!waxed_)(exposed|weathered|oxidized)_.*copper|^waxed_.*copper|^(exposed|weathered|oxidized)_cut_copper/

  function itemUseOn (item, block, face, cursor, offHand) {
    const name = item.name
    const place = placement(item, block, face)
    if (place) {
      if (place.result === 'success') return place
      // an edible block item that cannot be placed is eaten (BlockItem.useOn: the item's consumable use)
      if (bot.registry.foodsByName[name]) return { result: useItem(offHand, item) }
      return place
    }
    if (/^(firework_rocket|fireworks)$/.test(name)) return { result: gliding() ? 'pass' : 'success' }
    if (name === 'flint_and_steel' || name === 'fire_charge') {
      if (/campfire$|candle/.test(block.name) && !truthy(props(block).lit)) return { result: 'success' }
      const target = at(block.position.offset(...FACE_OFFSETS[face]))
      return { result: target && /^(air|cave_air|void_air)$/.test(target.name) ? 'success' : 'fail' }
    }
    if (/_hoe$/.test(name)) {
      if (block.name === 'rooted_dirt') return { result: 'success' }
      return { result: /^(dirt|grass_block|grass|dirt_path|grass_path|coarse_dirt)$/.test(block.name) && face !== DOWN && airAbove(block) ? 'success' : 'pass' }
    }
    if (/_shovel$|_spade$/.test(name)) {
      return { result: /^(grass_block|grass|dirt|podzol|coarse_dirt|mycelium|rooted_dirt)$/.test(block.name) && face !== DOWN && airAbove(block) ? 'success' : 'pass' }
    }
    if (/_axe$/.test(name)) return { result: STRIPPABLE.test(block.name) || SCRAPABLE.test(block.name) ? 'success' : 'pass' }
    if (name === 'bone_meal' || (name === 'dye' && item.metadata === 15)) {
      const p = props(block)
      const grows = (CROP.test(block.name) && Number(p.age ?? 0) < (/beetroots/.test(block.name) ? 3 : 7)) ||
        /_sapling$|^sapling$|^(grass_block|grass|short_grass|tall_grass|fern|moss_block|pale_moss_block|bamboo|bamboo_sapling|cocoa|kelp|seagrass|.+_mushroom|crimson_nylium|warped_nylium|.+_fungus|azalea|flowering_azalea|big_dripleaf|small_dripleaf|glow_lichen|cave_vines|cave_vines_plant|mangrove_propagule|pink_petals|wildflowers|torchflower_crop|pitcher_crop|rooted_dirt|short_dry_grass|bush|firefly_bush|leaf_litter)$/.test(block.name) ||
        (block.name === 'sweet_berry_bush' && Number(p.age ?? 0) < 3)
      return { result: grows ? 'success' : 'pass' }
    }
    if (name === 'shears') {
      return { result: /^(kelp|twisting_vines|weeping_vines|cave_vines)$/.test(block.name) && Number(props(block).age ?? 25) < 25 ? 'success' : 'pass' }
    }
    if (name === 'honeycomb') return { result: /copper/.test(block.name) && !/^waxed_/.test(block.name) && !/copper_ore/.test(block.name) ? 'success' : 'pass' }
    if (/spawn_egg$/.test(name)) return { result: 'success' }
    if (name === 'armor_stand') return { result: face === DOWN ? 'fail' : 'success' }
    if (/^(item_frame|glow_item_frame|painting)$/.test(name)) return { result: face === DOWN || face === UP ? (name === 'painting' ? 'fail' : 'success') : 'success' }
    if (/minecart$/.test(name)) return { result: /rail$/.test(block.name) ? 'success' : 'fail' }
    if (name === 'end_crystal') return { result: /^(obsidian|bedrock)$/.test(block.name) && airAbove(block) ? 'success' : 'fail' }
    if (name === 'lead') {
      // the client ties the player's mobs to a fence (FenceBlock.use) before 1.21.2; since, only the server
      return { result: /fence$/.test(block.name) && !/gate/.test(block.name) && !version['>=']('1.21.2') ? 'success' : 'pass' }
    }
    if (name === 'brush') return { result: 'consume' }
    if (name === 'potion' && face !== DOWN && /^(dirt|coarse_dirt|rooted_dirt)$/.test(block.name)) return { result: 'success' }
    if (name === 'compass' && block.name === 'lodestone') return { result: 'success' }
    if ((name === 'ender_eye' || name === 'eye_of_ender') && /end_portal_frame/.test(block.name) && !truthy(props(block).eye)) return { result: 'success' }
    // before 1.20.5 a book goes on a lectern, before 1.21 a disc in a jukebox from the item's side (WritableBookItem.useOn,
    // WrittenBookItem.useOn: LecternBlock.tryPlaceBook; RecordItem.useOn), so a sneaking player's too
    if (LECTERN_BOOKS.test(name) && block.name === 'lectern' && !version['>=']('1.20.5')) return { result: truthy(props(block).has_book) ? 'pass' : 'success' }
    if (/^music_disc_|^record_/.test(name) && block.name === 'jukebox' && !version['>=']('1.21')) return { result: truthy(props(block).has_record) ? 'pass' : 'success' }
    return { result: 'pass' }
  }

  const gliding = () => !!(bot.entity.fallFlying || bot.entity.elytraFlying)

  // ---- the block's own use (BlockBehaviour.useItemOn / useWithoutItem, Block.use before 1.20.5) ----

  function hitSlot (block, face, cursor, rows, columns) {
    const facing = FACING[props(block).facing]
    if (facing === undefined || facing !== face || face < 2) return null
    let x
    switch (face) {
      case 2: x = 1 - cursor.x; break
      case 3: x = cursor.x; break
      case 4: x = cursor.z; break
      default: x = 1 - cursor.z
    }
    const section = (v, n) => Math.min(n - 1, Math.max(0, Math.floor(Math.fround(Math.fround(v) * 16) / (16 / n))))
    return section(x, columns) + section(1 - cursor.y, rows) * columns
  }

  function blockUseItemOn (block, item, offHand, face, cursor) {
    const name = block.name
    const p = props(block)
    const itemName = item?.name ?? ''
    if (name === 'cake') return itemName.endsWith('candle') && Number(p.bites ?? 0) === 0 ? 'success' : 'try_empty'
    if (/candle_cake$/.test(name)) {
      if (/^(flint_and_steel|fire_charge)$/.test(itemName)) return 'pass'
      return !item && truthy(p.lit) && cursor.y > 0.5 ? 'success' : 'try_empty'
    }
    if (/candle$/.test(name)) return !item && mayBuild() && truthy(p.lit) ? 'success' : 'try_empty'
    if (/campfire$/.test(name)) {
      if (CAMPFIRE_FOOD.test(itemName)) return 'consume'
      if (/_shovel$/.test(itemName) && truthy(p.lit)) return 'success'
      return 'try_empty'
    }
    if (name === 'jukebox') {
      if (truthy(p.has_record)) return 'try_empty'
      return /^music_disc_|^record_/.test(itemName) ? 'success' : 'try_empty'
    }
    if (name === 'lectern') {
      if (truthy(p.has_book)) return 'try_empty'
      if (LECTERN_BOOKS.test(itemName)) return 'success'
      // (an empty hand passes: from 1.20.5 the main hand skips the block's use, the off hand never gets to it)
      return !item ? 'pass' : 'try_empty'
    }
    if (name === 'respawn_anchor') {
      const charge = Number(p.charges ?? 0)
      if (itemName === 'glowstone' && charge < 4) return 'success'
      if (!offHand && bot.inventory.slots[45]?.name === 'glowstone' && charge < 4) return 'pass'
      return 'try_empty'
    }
    if (name === 'chiseled_bookshelf') {
      if (!BOOKSHELF_BOOKS.test(itemName)) return 'try_empty'
      const slot = hitSlot(block, face, cursor, 2, 3)
      if (slot === null) return 'pass'
      return truthy(p[`slot_${slot}_occupied`]) ? 'try_empty' : 'success'
    }
    if (/_shelf$/.test(name)) {
      if (offHand) return 'pass'
      if (hitSlot(block, face, cursor, 1, 3) === null) return 'pass'
      // (26.3's client says CONSUME for a held item; 1.21.9 - 26.2 swung for it, as the recordings show; an empty hand
      // passes from 1.21.11, 1.21.9 - 1.21.10 swung for it too)
      if (!bot.heldItem) return version['>=']('1.21.11') ? 'pass' : 'success'
      return version['>=']('26.3') ? 'consume' : 'success'
    }
    if (name === 'composter') return Number(p.level ?? 0) < 8 && COMPOSTABLE.test(itemName) ? 'success' : 'try_empty'
    if (name === 'flower_pot' || /^potted_/.test(name)) {
      if (!POTTABLE.test(itemName)) return 'try_empty'
      return name === 'flower_pot' ? 'success' : 'consume'
    }
    // DecoratedPotBlock: no use before 1.20.3; until 1.21.2 its use answers the client CONSUME (no swing)
    if (name === 'decorated_pot') return version['<']('1.20.3') ? 'try_empty' : version['<']('1.21.2') ? 'consume' : 'success'
    if (/copper_golem_statue$/.test(name)) {
      if (/_axe$/.test(itemName)) return 'pass'
      if (itemName === 'honeycomb' && !/^waxed_/.test(name)) return 'pass'
      return 'success'
    }
    if (name === 'sweet_berry_bush') return Number(p.age ?? 0) < 3 && itemName === 'bone_meal' ? 'pass' : 'try_empty'
    // (shears carve a pumpkin from 1.13, which brought the carved pumpkin)
    if (name === 'pumpkin') return itemName === 'shears' && version['>=']('1.13') ? 'success' : 'try_empty'
    if (/^(beehive|bee_nest)$/.test(name)) return Number(p.honey_level ?? 0) >= 5 && itemName === 'glass_bottle' ? 'success' : 'try_empty'
    if (/cauldron$/.test(name)) return cauldron(block, item)
    if (/^note_?block$/.test(name)) return /_head$|_skull$|^skull$/.test(itemName) && face === UP ? 'pass' : 'try_empty'
    if (/redstone_ore$/.test(name)) {
      const place = placement(item, block, face)
      return place && place.result === 'success' ? 'pass' : 'success'
    }
    if (SIGN.test(name)) {
      // (a hanging sign held under a ceiling hanging sign hangs from it: CeilingHangingSignBlock.useItemOn)
      if (/hanging_sign$/.test(name) && !/wall/.test(name) && /hanging_sign$/.test(itemName) && face === DOWN) return 'pass'
      if (!version['>=']('1.15')) return 'success'
      const applicator = SIGN_APPLICATOR.test(itemName) && mayBuild()
      return applicator || truthy(p.waxed) ? 'success' : 'consume'
    }
    if (name === 'tnt') return /^(flint_and_steel|fire_charge)$/.test(itemName) ? 'success' : 'try_empty'
    if (name === 'vault') return item && p.vault_state === 'active' ? 'success_server' : 'try_empty'
    if (/fence$/.test(name) && !/gate/.test(name) && !version['>=']('1.20.5')) {
      // before 1.20.5 the fence decides on the client what a lead or (before 1.14) an empty hand does (FenceBlock.use)
      if (itemName === 'lead') return 'success'
      if (!item && !version['>=']('1.14')) return 'success'
    }
    return 'try_empty'
  }

  // CauldronInteraction: what each cauldron does with what is in the hand
  function cauldron (block, item) {
    const itemName = item?.name ?? ''
    const fullBucket = /^(water_bucket|lava_bucket|powder_snow_bucket)$/.test(itemName)
    const p = props(block)
    const level = Number(p.level ?? 3)
    switch (block.name) {
      case 'cauldron':
        if (!version['>=']('1.17')) {
          // one cauldron with a water level before 1.17 (CauldronBlock.use): an empty hand did something before 1.15
          // (true), passes since
          if (!item) return version['>=']('1.15') ? 'try_empty' : 'success'
          if (itemName === 'water_bucket') return level < 3 ? 'success' : 'try_empty'
          if (itemName === 'bucket') return level === 3 ? 'success' : 'try_empty'
          if (itemName === 'glass_bottle') return level > 0 ? 'success' : 'try_empty'
          if (itemName === 'potion') return level < 3 ? 'success' : 'try_empty'
          // (with water in it, a banner's pattern is washed off; from 1.15 the client says CONSUME for any other block
          // item, which only a shulker box is washed of on the server)
          if (level > 0 && /_banner$|^banner$/.test(itemName)) return 'success'
          if (level > 0 && placedBlock(item) && version['>=']('1.15')) return 'consume'
          return 'try_empty'
        }
        if (fullBucket || itemName === 'potion') return 'success'
        return 'try_empty'
      case 'water_cauldron':
        if (fullBucket) return 'success'
        if (itemName === 'bucket') return level === 3 ? 'success' : 'try_empty'
        if (itemName === 'glass_bottle') return 'success'
        if (itemName === 'potion') return level < 3 ? 'success' : 'try_empty'
        if (/^leather_|_banner$|shulker_box$|^wolf_armor$/.test(itemName)) return 'success'
        return 'try_empty'
      case 'lava_cauldron':
      case 'powder_snow_cauldron':
        if (fullBucket) return 'success'
        if (itemName === 'bucket') return block.name === 'lava_cauldron' || level === 3 ? 'success' : 'try_empty'
        return 'try_empty'
    }
    return 'try_empty'
  }

  // the client's prediction of eating a slice (CakeBlock.eat)
  const eatCake = () => (canEat() ? 'success' : 'pass')

  function blockUseWithoutItem (block, face, cursor, offHand = false) {
    const name = block.name
    const p = props(block)
    if (BED.test(name)) {
      if (!version['>=']('1.15')) return 'success'
      return version['>=']('1.21.2') ? 'success_server' : 'consume'
    }
    // (a smithing table has a screen from 1.16: before, SmithingTableBlock did nothing)
    if (name === 'smithing_table' && !version['>=']('1.16')) return 'pass'
    if (OPENS.test(name)) return 'success'
    if (SCREEN_BLOCK_OPENS_FOR_OP.test(name)) return creative() ? 'success' : 'pass'
    if (DOOR.test(name) || TRAPDOOR.test(name)) return /^iron_/.test(name) ? 'pass' : 'success'
    if (BUTTON.test(name)) return truthy(p.powered) && version['>=']('1.15') ? 'consume' : 'success'
    if (REDSTONE_DIODE.test(name)) return mayBuild() ? 'success' : 'pass'
    if (name === 'cake') {
      // (before 1.11 the cake's use answered true whether a slice was eaten or not: BlockCake.onBlockActivated)
      if (!version['>=']('1.11')) return 'success'
      const eaten = eatCake()
      if (eaten === 'success') return eaten
      // (an empty hand, the one used: before 1.15 a swing, since a CONSUME)
      if (!handItem(offHand)) return version['>=']('1.15') ? 'consume' : 'success'
      return 'pass'
    }
    if (/candle_cake$/.test(name)) return eatCake()
    if (name === 'bell') return bellHit(block, face, cursor) ? 'success' : 'pass'
    // (a lectern without a book: before 1.15 its use did nothing, Block.activate false)
    if (name === 'lectern') return truthy(p.has_book) ? 'success' : version['>=']('1.15') ? 'consume' : 'pass'
    if (name === 'jukebox') return truthy(p.has_record) ? 'success' : 'pass'
    if (name === 'respawn_anchor') return Number(p.charges ?? 0) === 0 ? 'pass' : 'consume'
    if (name === 'light') return 'consume'
    if (name === 'composter') return Number(p.level ?? 0) === 8 ? 'success' : 'pass'
    // (an empty flower pot: before 1.13 its use did nothing without a plant, BlockFlowerPot.onBlockActivated false)
    if (name === 'flower_pot') return version['>=']('1.13') ? 'consume' : 'pass'
    if (/^potted_/.test(name)) return 'success'
    if (name === 'decorated_pot') return version['<']('1.20.3') ? 'pass' : version['<']('1.21.2') ? 'consume' : 'success'
    if (name === 'chiseled_bookshelf') {
      const slot = hitSlot(block, face, cursor, 2, 3)
      if (slot === null) return 'pass'
      return truthy(p[`slot_${slot}_occupied`]) ? 'success' : 'consume'
    }
    if (/^cave_vines(_plant)?$/.test(name)) return truthy(p.berries) ? 'success' : 'pass'
    if (name === 'sweet_berry_bush') return Number(p.age ?? 0) > 1 ? 'success' : 'pass'
    if (name === 'redstone_wire') {
      if (!version['>=']('1.16') || !mayBuild()) return 'pass'
      const sides = ['north', 'east', 'south', 'west'].map(side => p[side] ?? 'none')
      const dot = sides.every(side => side === 'none')
      const cross = sides.every(side => side !== 'none')
      return dot || cross ? 'success' : 'pass'
    }
    return 'pass'
  }

  // BellBlock.isProperHit: a side of the bell it can be rung from, below its top
  function bellHit (block, face, cursor) {
    if (face < 2 || cursor.y > 0.8123999834060669) return false
    const p = props(block)
    const axis = f => (f === 2 || f === 3 ? 'z' : 'x')
    const facing = FACING[p.facing]
    switch (p.attachment) {
      case 'floor': return axis(facing) === axis(face)
      case 'single_wall':
      case 'double_wall': return axis(facing) !== axis(face)
      case 'ceiling': return true
      default: return false
    }
  }

  // ---- MultiPlayerGameMode.performUseItemOn ----

  // What a right click on a block with a hand comes to: { result, place } (place: where a block item's block goes,
  // when it goes)
  function useItemOn (block, face, cursor, offHand = false) {
    const item = handItem(offHand)
    if (bot.game.gameMode === 'spectator') return { result: 'consume' }
    const somethingInHand = !!(bot.heldItem || bot.inventory.slots[45])
    const suppressed = bot.getControlState('sneak') && somethingInHand
    // (before 1.15 a block's use answered whether it acted, Block.onBlockActivated / activate: the client swung for
    // every use that did, a CONSUME too)
    const acted = result => (result === 'consume' && !version['>=']('1.15') ? 'success' : result)
    if (!suppressed) {
      const itemUse = acted(blockUseItemOn(block, item, offHand, face, cursor))
      if (consumes(itemUse)) return { result: itemUse }
      // (the block's use without the item is the main hand's from 1.20.5; before, Block.use was asked for each hand)
      if (itemUse === 'try_empty' && (!offHand || !version['>=']('1.20.5'))) {
        const use = acted(blockUseWithoutItem(block, face, cursor, offHand))
        if (consumes(use)) return { result: use }
      }
    }
    // Before 1.13 a block item (ItemBlock: the items of ids below 256, and banners) that cannot go where it would is
    // not used on the block at all: the client sends nothing and goes on to the item's own use, a FAIL
    // (PlayerControllerMP.processRightClickBlock: ItemBlock.canPlaceBlockOnSide)
    if (item && !version['>=']('1.13') && (item.type < 256 || /banner$/.test(item.name)) && placement(item, block, face)?.mayPlace === false) {
      return { result: 'fail', unsent: true }
    }
    if (item && !onCooldown(item)) {
      const used = itemUseOn(item, block, face, cursor, offHand)
      return { result: used.result, place: used.result === 'success' && used.position ? used : null }
    }
    return { result: 'pass' }
  }

  // ---- MultiPlayerGameMode.useItem (Item.use) ----

  function onCooldown (item) {
    const cooldowns = bot._itemCooldowns
    if (!cooldowns) return false
    const until = cooldowns[item.name]
    return until != null && until > performance.now()
  }

  // a ray from the eyes as an item casts it (Item.getPlayerPOVHitResult), with what it takes of fluids
  function pov (fluid) {
    if (!bot._povHitResult) return null
    return bot._povHitResult(fluid)
  }

  function useBucket (item) {
    const empty = item.name === 'bucket'
    const hit = pov(empty ? 'source_only' : 'none')
    if (!hit) return 'pass'
    const { block, face } = hit
    if (empty) {
      // BucketPickup.pickupBlock: a fluid source, a waterlogged block, powder snow
      const p = props(block)
      if (/^(water|lava|flowing_water|flowing_lava)$/.test(block.name)) return Number(p.level ?? 0) === 0 ? 'success' : 'fail'
      if (truthy(p.waterlogged) || block.name === 'powder_snow') return 'success'
      return 'fail'
    }
    if (item.name === 'milk_bucket') return 'pass'
    const water = /^(water_bucket|.+_bucket)$/.test(item.name) && item.name !== 'lava_bucket'
    const container = water && props(block).waterlogged !== undefined
    const target = container ? block : at(block.position.offset(...FACE_OFFSETS[face]))
    const placeable = t => !!t && (replaceable(t) || /water|lava/.test(t.name) || !(t.shapes?.length) || props(t).waterlogged !== undefined)
    if (placeable(target)) return 'success'
    return 'fail'
  }

  // What the use of the item in a hand in the air comes to
  function useItem (offHand = false, item = handItem(offHand)) {
    if (!item) return 'pass'
    const name = item.name
    if (onCooldown(item)) return 'pass'
    if (THROWN.test(name)) return 'success'
    if (/^(firework_rocket|fireworks)$/.test(name)) return gliding() ? 'success' : 'pass'
    if (name === 'bucket' || /_bucket$/.test(name)) {
      if (name === 'milk_bucket') return 'consume'
      if (name === 'powder_snow_bucket') return 'pass'
      return useBucket(item)
    }
    if (name === 'glass_bottle') {
      const hit = pov('source_only')
      return hit && /water/.test(hit.block.name) ? 'success' : 'pass'
    }
    if (BOAT.test(name)) return pov('any') ? 'success' : 'pass'
    if (ARMOR.test(name)) {
      const slot = /_helmet$|^turtle_helmet$/.test(name) ? 5 : /_chestplate$|^elytra$/.test(name) ? 6 : /_leggings$/.test(name) ? 7 : 8
      const worn = bot.inventory.slots[slot]
      if (!worn) return 'success'
      return version['>=']('1.19.4') && worn.name !== name ? 'success' : 'fail'
    }
    // what the client acts on without a swing: an eye of ender thrown, a map, a bundle emptied, a harness
    if (/^(ender_eye|map|.*bundle|.*_harness|knowledge_book)$/.test(name)) return 'consume'
    if (registry.foodsByName[name] || /^(potion|honey_bottle|ominous_bottle)$/.test(name)) return canEat(alwaysEdible(name)) || name === 'potion' ? 'consume' : 'fail'
    return 'pass'
  }

  return { useItemOn, useItem, placement, onCooldown }
}

module.exports = { createUsePrediction, consumes }
