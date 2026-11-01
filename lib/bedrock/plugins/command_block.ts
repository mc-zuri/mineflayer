import type { Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import type { Vec3f } from '../modules/auth_input.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { COMMAND_BLOCK_SCREEN } from '../screens/command_block.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { CommandBlockOptions } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'command_block'
type Mode = 'chain' | 'repeat' | 'impulse'
/** Bedrock's mode of each of Java's (0 sequence, 1 auto, 2 redstone): a chain, repeating or impulse command block */
const MODES: readonly Mode[] = Object.freeze(['chain', 'repeat', 'impulse'])
/** the command block of each of Java's modes: a command block's mode is the block itself */
const BLOCKS: readonly string[] = Object.freeze(['chain_command_block', 'repeating_command_block', 'command_block'])
// Java's mode of a command block as placed
const REDSTONE = 2

type Compound = Record<string, undefined | Tags[TagType]>

/** a command block's block entity as the server last told it: a field it lacks reads as its type's zero */
interface Told {
  readonly command: string
  readonly lastOutput: string
  readonly customName: string
  readonly trackOutput: boolean
  readonly conditional: boolean
  readonly alwaysActive: boolean
  readonly tickDelay: number
  readonly executeOnFirstTick: boolean
}

const UNTOLD: Told = Object.freeze({
  command: '', lastOutput: '', customName: '', trackOutput: false, conditional: false, alwaysActive: false, tickDelay: 0, executeOnFirstTick: false
})

function keyOf ({ x, y, z }: Vec3f): string {
  return `${x},${y},${z}`
}

function textOf (compound: Compound, key: string): string {
  const value = compound[key]?.value
  return typeof value === 'string' ? value : ''
}

function numberOf (compound: Compound, key: string): number {
  const value = compound[key]?.value
  return typeof value === 'number' ? value : 0
}

function toldOf (entity: Compound): Told {
  return {
    command: textOf(entity, 'Command'),
    lastOutput: textOf(entity, 'LastOutput'),
    customName: textOf(entity, 'CustomName'),
    trackOutput: numberOf(entity, 'TrackOutput') !== 0,
    conditional: numberOf(entity, 'conditionalMode') !== 0,
    alwaysActive: numberOf(entity, 'auto') !== 0,
    tickDelay: numberOf(entity, 'TickDelay'),
    executeOnFirstTick: numberOf(entity, 'ExecuteOnFirstTick') !== 0
  }
}

/**
 * The command block's screen, its command and settings read from the block entity; Java's setCommandBlock as the
 * vanilla client's command_block_update, which the server takes from an operator in creative mode.
 */
export default function commandBlock (bot: BedrockBotInternal): void {
  const core = bot._core
  const blocks = new Map<string, Told>()
  const hasFilteredName = isBedrockVersionAtLeast(bot.version, 'bedrock_1.21.60')

  function toldAt (position: Vec3f): Told {
    return blocks.get(keyOf(position)) ?? UNTOLD
  }

  function modeAt ({ x, y, z }: Vec3f): number {
    const mode = BLOCKS.indexOf(bot.blockAt(new Vec3(x, y, z))?.name ?? '')
    return mode < 0 ? REDSTONE : mode
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }) => {
    const key = keyOf(position)
    if (value['id']?.value === 'CommandBlock') blocks.set(key, toldOf(value))
    else blocks.delete(key)
  })

  /** its window before windowOpen: the block entity's, as the server tells them while it is open too, and the block's mode */
  function extend ({ window, opening: { position } }: OpenScreen): void {
    const told = (key: keyof Told): PropertyDescriptor => ({ get: () => toldAt(position)[key] })
    Object.defineProperties(window, {
      command: told('command'),
      lastOutput: told('lastOutput'),
      customName: told('customName'),
      trackOutput: told('trackOutput'),
      conditional: told('conditional'),
      alwaysActive: told('alwaysActive'),
      tickDelay: told('tickDelay'),
      executeOnFirstTick: told('executeOnFirstTick'),
      mode: { get: () => modeAt(position) }
    })
  }

  /** Java's options, Java's defaults for those not given; the rest the block entity's, as the vanilla client's screen keeps them */
  function setCommandBlock (pos: Vec3, command: string, options: Partial<CommandBlockOptions>): void {
    if (bot.game.gameMode !== 'creative') throw new Error('setCommandBlock: the bot has to be in creative mode to set a command block')
    const block = bot.blockAt(pos)
    if (block === null || !BLOCKS.includes(block.name)) throw new Error('setCommandBlock: the block isn\'t a command block')
    const javaMode = options.mode ?? REDSTONE
    const mode = MODES[javaMode]
    if (mode === undefined) throw new Error(`setCommandBlock: mode ${javaMode} is none of 0 (sequence), 1 (auto) and 2 (redstone)`)
    const { x, y, z } = block.position
    const { lastOutput, customName, tickDelay, executeOnFirstTick } = toldAt(block.position)
    const update: BedrockServerboundPackets['command_block_update'] = {
      is_block: true,
      position: { x, y, z },
      mode,
      needs_redstone: !(options.alwaysActive ?? false),
      conditional: options.conditional ?? false,
      command,
      last_output: lastOutput,
      name: customName,
      ...hasFilteredName ? { filtered_name: '' } : {},
      should_track_output: options.trackOutput ?? false,
      tick_delay: tickDelay,
      execute_on_first_tick: executeOnFirstTick
    }
    core.command(({ outbox }) => { outbox.queue('command_block_update', update) })
  }

  // the vanilla client's close sends nothing (recorded)
  bot._inventory.screens.add(COMMAND_BLOCK_SCREEN, { shown: extend, close: () => {} })
  bot.setCommandBlock = (pos, command, options = {}) => { setCommandBlock(pos, command, options) }
}
