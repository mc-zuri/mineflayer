import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { blockKey, numberOf, textOf } from '../block_entity.ts'
import type { BlockEntity } from '../block_entity.ts'
import type { Vec3f } from '../modules/auth_input.ts'
import type { Build } from '../modules/block_use.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'sign'
/** Java's */
const MAX_LINES = 4
const MAX_LINE_LENGTH = 45
/** a sign's block entity, a hanging sign's (not recorded) too */
const SIGN_ENTITIES: readonly string[] = Object.freeze(['Sign', 'HangingSign'])
/** a sign's item, standing, on a wall or hanging */
const SIGN_ITEM = /_sign$/
// as placeBlock waits for the server's answer
const OPEN_TICKS = 100

/** the sign's block entity with the side's text: a two-sided sign's FrontText or BackText, else the one Text of the signs before 1.19.80 (not recorded) */
function withText (entity: BlockEntity, text: string, back: boolean): BlockEntity | undefined {
  const name = back ? 'BackText' : 'FrontText'
  const side = entity[name]
  if (side?.type === 'compound') return { ...entity, [name]: { type: 'compound', value: { ...side.value, Text: { type: 'string', value: text } } } }
  return back ? undefined : { ...entity, Text: { type: 'string', value: text } }
}

/**
 * Java's signOpen, at open_sign from 1.19.80; before, at the server's block entity of a sign the bot built, as the
 * vanilla client opens its editor itself. updateSign as the vanilla client's edit: the sign's block entity as the
 * server told it, the side's text replaced, sent back in block_entity_data.
 */
export default function sign (bot: BedrockBotInternal): void {
  const core = bot._core
  const opensItself = !isBedrockVersionAtLeast(bot.version, 'bedrock_1.19.80')
  /** each sign's block entity as the server last told it */
  const signs = new Map<string, BlockEntity>()
  /** the build whose sign's editor opened */
  let opened: Build | undefined

  function signOpen ({ x, y, z }: Vec3f): void {
    core.emit(bot, 'signOpen', bot.blockAt(new Vec3(x, y, z)))
  }

  /** the bot's last build, if it put a sign at `position` in the last 100 ticks and its editor did not open */
  function signBuiltAt (position: Vec3f, tick: number | undefined): Build | undefined {
    const build = bot._blockUse.lastBuild
    if (build === undefined || build === opened || !SIGN_ITEM.test(build.item) || blockKey(build.position) !== blockKey(position)) return undefined
    return tick !== undefined && tick <= build.tick + OPEN_TICKS ? build : undefined
  }

  core.observe(OWNER, 'block_entity_data', ({ position, nbt: { value } }, { tick }) => {
    const key = blockKey(position)
    if (!SIGN_ENTITIES.includes(textOf(value, 'id'))) {
      signs.delete(key)
      return
    }
    signs.set(key, value)
    const built = opensItself ? signBuiltAt(position, tick) : undefined
    if (built === undefined) return
    opened = built
    signOpen(position)
  })
  core.handle(OWNER, 'open_sign', ({ position }) => { signOpen(position) })

  /** the block entity to send back, or why none is sent: Java's checks of the text, then the sign's */
  function editOf (block: Block, text: string, back: boolean): BlockEntity | string {
    const lines = text.split('\n')
    if (lines.length > MAX_LINES) return 'too many lines for sign text'
    if (lines.some(line => line.length > MAX_LINE_LENGTH)) return `Signs have a maximum of ${MAX_LINE_LENGTH} characters per line`
    const at = block.position.toString()
    const told = signs.get(blockKey(block.position))
    if (told === undefined) return `updateSign: the server told no block entity of the sign at ${at}`
    if (numberOf(told, 'IsWaxed') !== 0) return `updateSign: the sign at ${at} is waxed`
    return withText(told, text, back) ?? `updateSign: the sign at ${at} has no back`
  }

  /** Java's errors are events: it returns nothing */
  function updateSign (block: Block, text: string, back: boolean): void {
    const value = editOf(block, text, back)
    if (typeof value === 'string') {
      core.emit(bot, 'error', new Error(value))
      return
    }
    const { x, y, z } = block.position
    core.command(({ outbox }) => { outbox.queue('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) })
  }

  bot.updateSign = (block, text, back = false) => { updateSign(block, text, back) }
}
