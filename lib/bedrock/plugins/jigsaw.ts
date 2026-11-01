import type { Block } from 'prismarine-block'
import { blockKey, textOf } from '../block_entity.ts'
import type { BlockEntity } from '../block_entity.ts'
import type { Vec3f } from '../modules/auth_input.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { JIGSAW_EDITOR_SCREEN } from '../screens/jigsaw_editor.ts'
import type { BedrockJigsawSettings } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'jigsaw'
type Settings = BedrockJigsawSettings

/** each setting's field in the block entity */
const FIELDS: Readonly<Record<keyof Settings, string>> = Object.freeze({
  name: 'name',
  target: 'target',
  pool: 'target_pool',
  finalState: 'final_state',
  joint: 'joint'
})
const SETTINGS: ReadonlyArray<keyof Settings> = Object.freeze(['name', 'target', 'pool', 'finalState', 'joint'])

function settingOf (entity: BlockEntity, key: keyof Settings): string {
  return textOf(entity, FIELDS[key])
}

/**
 * The jigsaw block's screen, its settings read from the block entity; bot.bedrock.setJigsaw as the block entity sent
 * back in block_entity_data, which the server takes from an operator in creative mode.
 */
export default function jigsaw (bot: BedrockBotInternal): void {
  const core = bot._core
  /** each jigsaw block's block entity as the server last told it */
  const blocks = new Map<string, BlockEntity>()

  function entityAt ({ x, y, z }: Vec3f): BlockEntity {
    return blocks.get(blockKey({ x, y, z })) ?? { id: { type: 'string', value: 'JigsawBlock' }, x: { type: 'int', value: x }, y: { type: 'int', value: y }, z: { type: 'int', value: z } }
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const key = blockKey(position)
    if (value['id']?.value === 'JigsawBlock') blocks.set(key, value)
    else blocks.delete(key)
  })

  /** its window before windowOpen: the block entity's, as the server tells them while it is open too */
  function extend ({ window, opening: { position } }: OpenScreen): void {
    Object.defineProperties(window, Object.fromEntries(SETTINGS.map(key => [key, { get: () => settingOf(entityAt(position), key) }])))
  }

  /** the block entity as told with the settings given, its other fields kept */
  function setJigsaw (block: Block, given: Partial<Settings>): void {
    if (bot.game.gameMode !== 'creative') throw new Error('setJigsaw: the bot has to be in creative mode to set a jigsaw block')
    if (block.name !== 'jigsaw') throw new Error(`setJigsaw: ${block.name} is not a jigsaw block`)
    const { x, y, z } = block.position
    const told = entityAt(block.position)
    const value: BlockEntity = { ...told }
    for (const key of SETTINGS) value[FIELDS[key]] = { type: 'string', value: given[key] ?? settingOf(told, key) }
    core.command(({ outbox }) => { outbox.queue('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) })
  }

  // the vanilla client's close sends nothing (recorded)
  bot._inventory.screens.add(JIGSAW_EDITOR_SCREEN, { shown: extend, close: () => {} })
  bot.bedrock = {
    ...bot.bedrock,
    setJigsaw: (block, settings) => { setJigsaw(block, settings) }
  }
}
