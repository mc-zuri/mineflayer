import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { blockKey, numberOf, textOf } from '../block_entity.ts'
import type { BlockEntity } from '../block_entity.ts'
import type { Vec3f } from '../modules/auth_input.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { STRUCTURE_EDITOR_SCREEN } from '../screens/structure_editor.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockStructureBlockSettings, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'structure_block'
type Settings = BedrockStructureBlockSettings
type Update = BedrockServerboundPackets['structure_block_update']

// each in the order of its number in the block entity and the protocol
const MODES: ReadonlyArray<Settings['mode']> = Object.freeze(['data', 'save', 'load', 'corner', 'invalid', 'export'])
const ROTATIONS: ReadonlyArray<Settings['rotation']> = Object.freeze(['none', '90_deg', '180_deg', '270_deg'])
const MIRRORS: ReadonlyArray<Settings['mirror']> = Object.freeze(['none', 'x_axis', 'z_axis', 'both_axes'])
const ANIMATIONS: ReadonlyArray<Settings['animationMode']> = Object.freeze(['none', 'layers', 'blocks'])
const SAVE_MODES: ReadonlyArray<Settings['redstoneSaveMode']> = Object.freeze(['memory', 'disk'])
const SETTINGS: ReadonlyArray<keyof Settings> = Object.freeze([
  'mode', 'structureName', 'dataField', 'includePlayers', 'showBoundingBox', 'ignoreEntities', 'removeBlocks', 'size', 'offset',
  'rotation', 'mirror', 'animationMode', 'animationSeconds', 'integrity', 'seed', 'redstoneSaveMode'
])

/** the name of the block entity's number in `names`: the first for one out of them */
function nameOf<Name> (names: readonly Name[], entity: BlockEntity, key: string): Name {
  return names[numberOf(entity, key)] ?? names[0]!
}

function vectorOf (entity: BlockEntity, key: string): Vec3 {
  return new Vec3(numberOf(entity, `x${key}`), numberOf(entity, `y${key}`), numberOf(entity, `z${key}`))
}

/** the protocol's seed is 32 bits, the block entity's a long */
function seedOf (entity: BlockEntity): number {
  const value = entity['seed']?.value
  return typeof value === 'bigint' ? Number(BigInt.asUintN(32, value)) : numberOf(entity, 'seed') >>> 0
}

function settingsOf (entity: BlockEntity): Settings {
  return {
    mode: nameOf(MODES, entity, 'data'),
    structureName: textOf(entity, 'structureName'),
    dataField: textOf(entity, 'dataField'),
    includePlayers: numberOf(entity, 'includePlayers') !== 0,
    showBoundingBox: numberOf(entity, 'showBoundingBox') !== 0,
    ignoreEntities: numberOf(entity, 'ignoreEntities') !== 0,
    removeBlocks: numberOf(entity, 'removeBlocks') !== 0,
    size: vectorOf(entity, 'StructureSize'),
    offset: vectorOf(entity, 'StructureOffset'),
    rotation: nameOf(ROTATIONS, entity, 'rotation'),
    mirror: nameOf(MIRRORS, entity, 'mirror'),
    animationMode: nameOf(ANIMATIONS, entity, 'animationMode'),
    animationSeconds: numberOf(entity, 'animationSeconds'),
    integrity: numberOf(entity, 'integrity'),
    seed: seedOf(entity),
    redstoneSaveMode: nameOf(SAVE_MODES, entity, 'redstoneSaveMode')
  }
}

const UNTOLD: Settings = Object.freeze(settingsOf({}))

/**
 * The structure block's screen, its settings read from the block entity and sent back at its close as the vanilla
 * client does; bot.bedrock.setStructureBlock as that structure_block_update, which the server takes from an operator in
 * creative mode.
 */
export default function structureBlock (bot: BedrockBotInternal): void {
  const core = bot._core
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(bot.version, since)
  // the protocol data has no layout of structure_block_update before 1.16.220
  const hasUpdate = atLeast('bedrock_1.16.220')
  const hasAnimation = atLeast('bedrock_1.17.0')
  const hasTickingAreas = atLeast('bedrock_1.18.30')
  const hasWaterLogged = atLeast('bedrock_1.19.30')
  const hasFilteredName = atLeast('bedrock_1.21.60')
  const blocks = new Map<string, Settings>()
  let uniqueId = 0n

  function settingsAt (position: Vec3f): Settings {
    return blocks.get(blockKey(position)) ?? UNTOLD
  }

  core.observe(OWNER, 'start_game', ({ entity_id: id }) => { uniqueId = id })
  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const key = blockKey(position)
    if (value['id']?.value === 'StructureBlock') blocks.set(key, settingsOf(value))
    else blocks.delete(key)
  })

  /** the vanilla client's structure_block_update: the settings with what its screen keeps of its own (recorded) */
  function updateOf ({ x, y, z }: Vec3f, settings: Settings, trigger: boolean): Update {
    const { size, offset } = settings
    return {
      position: { x, y, z },
      structure_name: settings.structureName,
      ...hasFilteredName ? { filtered_structure_name: '' } : {},
      data_field: settings.dataField,
      include_players: settings.includePlayers,
      show_bounding_box: settings.showBoundingBox,
      structure_block_type: MODES.indexOf(settings.mode),
      settings: {
        palette_name: 'default',
        ignore_entities: settings.ignoreEntities,
        ignore_blocks: settings.removeBlocks,
        ...hasTickingAreas ? { non_ticking_players_and_ticking_areas: true } : {},
        size: { x: size.x, y: size.y, z: size.z },
        structure_offset: { x: offset.x, y: offset.y, z: offset.z },
        last_editing_player_unique_id: uniqueId,
        ...hasAnimation
          ? { rotation: settings.rotation, mirror: settings.mirror, animation_mode: settings.animationMode, animation_duration: settings.animationSeconds }
          : { rotation: ROTATIONS.indexOf(settings.rotation), mirror: MIRRORS.indexOf(settings.mirror) },
        integrity: settings.integrity,
        seed: settings.seed,
        // the structure's middle: (-0.5, -0.5, -0.5) for a size of 0, as recorded
        pivot: { x: (size.x - 1) / 2, y: (size.y - 1) / 2, z: (size.z - 1) / 2 }
      },
      redstone_save_mode: SAVE_MODES.indexOf(settings.redstoneSaveMode),
      should_trigger: trigger,
      // the bot keeps no block's second layer, where its water is
      ...hasWaterLogged ? { water_logged: false } : {}
    }
  }

  /** its window before windowOpen: the block entity's, as the server tells them while it is open too */
  function extend ({ window, opening: { position } }: OpenScreen): void {
    Object.defineProperties(window, Object.fromEntries(SETTINGS.map(key => [key, { get: () => settingsAt(position)[key] }])))
  }

  function setStructureBlock (block: Block, given: Partial<Settings>, trigger: boolean): void {
    if (!hasUpdate) throw new Error(`setStructureBlock: the protocol data of ${bot.version} has no structure_block_update`)
    if (bot.game.gameMode !== 'creative') throw new Error('setStructureBlock: the bot has to be in creative mode to set a structure block')
    if (block.name !== 'structure_block') throw new Error(`setStructureBlock: ${block.name} is not a structure block`)
    const update = updateOf(block.position, { ...settingsAt(block.position), ...given }, trigger)
    core.command(({ outbox }) => { outbox.queue('structure_block_update', update) })
  }

  bot._inventory.screens.add(STRUCTURE_EDITOR_SCREEN, {
    shown: extend,
    // the vanilla client's close sends the settings, no container_close (recorded)
    close: (outbox, { opening: { position } }) => {
      if (hasUpdate) outbox.queue('structure_block_update', updateOf(position, settingsAt(position), false))
    }
  })
  bot.bedrock = {
    ...bot.bedrock,
    setStructureBlock: (block, settings, trigger) => { setStructureBlock(block, settings ?? {}, trigger ?? false) }
  }
}
