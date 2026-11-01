import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Tags } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { resultsAction, stackAction, withCount } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, nbtOf, withNbt, writtenResult } from '../modules/recipes.ts'
import { CURSOR, OUTPUT, PLAYER_SLOTS } from '../modules/screens.ts'
import { LOOM_DYE, LOOM_INPUT, LOOM_MATERIAL, LOOM_SCREEN } from '../screens/loom.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const BLOCK = 'loom'
const RESULT_SLOT = 3
const SHIFT = 1
const HOTBAR_KEY = 2

/** the patterns of a dye alone, in the order of the vanilla client's buttons, as recorded on 1.26.20, 1.26.51 and 1.26.60 */
const PATTERNS: readonly string[] = Object.freeze([
  'bo', 'mc', 'cr', 'ld', 'rud', 'lud', 'rd', 'gra', 'gru', 'hh', 'hhb', 'vh', 'vhr', 'mr', 'ss', 'bl',
  'br', 'tl', 'tr', 'sc', 'bs', 'cs', 'dls', 'drs', 'ls', 'ms', 'rs', 'ts', 'bt', 'tt', 'bts', 'tts'
])
/** the patterns of a banner pattern item in loom_material, which no recording has */
const ITEM_PATTERNS: readonly string[] = Object.freeze(['cre', 'sku', 'flo', 'moj', 'bri', 'cbo', 'pig', 'glb', 'flw', 'gus'])
/** a banner pattern's Color: Bedrock's index of the dye's color (red's 1 recorded) */
const COLORS: readonly string[] = Object.freeze([
  'black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'light_gray', 'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white'
])

type Compound = Tags['compound']['value']

/** The loom: its screen, the pattern its buttons select, and what a click on its output makes. */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  // the vanilla client tells the server no selection: the request names the pattern
  let selected: string | undefined

  inventory.screens.add(LOOM_SCREEN, {
    output: async (ctx, click) => { await outputClick(ctx, click) },
    shown: () => { selected = undefined }
  })

  function isBanner (stack: Stack): boolean {
    return ingredients.nameOf(stack.networkId) === 'banner'
  }

  /** -1: not a dye */
  function colorOf (dye: Stack): number {
    const name = ingredients.nameOf(dye.networkId)
    return COLORS.findIndex(color => name === `${color}_dye`)
  }

  /** the banner with the pattern after its own, its Patterns before its other tags, as recorded: {Patterns, Type} from 1.20.61, whose banners have Type 0 */
  function patterned (banner: Stack, pattern: string, color: number): Stack {
    const { Patterns: patterns, ...rest } = nbtOf(banner)
    // a banner's patterns are compounds
    const kept = patterns?.type === 'list' ? patterns.value.value as Compound[] : []
    const added: Compound = { Color: { type: 'int', value: color }, Pattern: { type: 'string', value: pattern } }
    const { wire } = banner
    const bare: Stack = { ...banner, wire: 'auxiliary_value' in wire ? { ...wire, nbt: undefined } : { ...wire, extra: undefined } }
    return withNbt(withCount(bare, 1), { Patterns: { type: 'list', value: { type: 'compound', value: [...kept, added] } }, ...rest })
  }

  // up to 1.17.30 the request names no pattern; the times from 1.21.20
  function craftAction (pattern: string): ReturnType<typeof stackAction> {
    if (!isBedrockVersionAtLeast(version, 'bedrock_1.17.40')) return stackAction(version, 'non_implemented', {})
    const times = isBedrockVersionAtLeast(version, 'bedrock_1.21.20') ? { times_crafted: 1 } : {}
    return stackAction(version, 'craft_loom_request', { pattern, ...times })
  }

  /** a mouse button takes the banner to the cursor, a hotbar key to its slot, unless that slot holds an item; a shift click moves it to the inventory (as recorded on 1.26.51) */
  async function outputClick (ctx: FrameContext, click: WindowClick): Promise<void> {
    const draft = inventory.draft()
    const banner = draft.stackAt(LOOM_INPUT)
    const dye = draft.stackAt(LOOM_DYE)
    const color = dye === undefined ? -1 : colorOf(dye)
    if (selected === undefined || banner === undefined || !isBanner(banner) || color < 0) return
    const result = patterned(banner, selected, color)
    const to: SlotRef = click.mode === HOTBAR_KEY ? { container: 'hotbar', slot: click.mouseButton } : CURSOR
    const moved: Move[] = click.mode === SHIFT
      ? placesFor(result, HOTBAR_AND_INVENTORY, draft).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
      : draft.stackAt(to) === undefined ? [{ type: 'take', count: 1, from: OUTPUT, to }] : []
    if (moved.length === 0) return
    await inventory.request(core, ctx, [
      { type: 'action', action: craftAction(selected), output: result },
      { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, result)], 1) },
      { type: 'consume', count: 1, from: LOOM_INPUT },
      { type: 'consume', count: 1, from: LOOM_DYE },
      ...moved
    ])
  }

  function checked (member: string, pattern: string): string {
    if (ITEM_PATTERNS.includes(pattern)) throw new Error(`${member}: the ${pattern} pattern needs a banner pattern item, which the bot does not support`)
    if (!PATTERNS.includes(pattern)) throw new Error(`${member}: ${pattern} is not a loom pattern`)
    return pattern
  }

  function select (member: string, pattern: string): void {
    if (inventory.screenType !== BLOCK) throw new Error(`${member} needs an open loom`)
    selected = checked(member, pattern)
  }

  /** as craft's crafting table: the loom open, else the one given, opened; undefined: the one open */
  async function loomOf (loom: Block | undefined): Promise<Window | undefined> {
    if (inventory.screenType === BLOCK) return undefined
    if (loom === undefined) throw new Error('applyBannerPattern needs an open loom, or one to open')
    return await bot.openBlock(loom)
  }

  /** the first of the player's slots holding a stack the test takes, by its index in a station window's player slots */
  function sourceOf (takes: (stack: Stack) => boolean, name: string): { stack: Stack, index: number } {
    const [source] = PLAYER_SLOTS.flatMap((ref, index) => {
      const stack = inventory.stackAt(ref)
      return stack !== undefined && takes(stack) ? [{ stack, index }] : []
    })
    if (source === undefined) throw new Error(`the inventory has no ${name}`)
    return source
  }

  function of (item: Item): (stack: Stack) => boolean {
    return stack => stack.networkId === item.type && stack.metadata === item.metadata
  }

  async function apply (pattern: string, dye: Item, banner: Item | undefined, loom: Block | undefined): Promise<void> {
    checked('applyBannerPattern', pattern)
    const bannerName = banner?.name ?? 'banner'
    const bannerSource = sourceOf(banner === undefined ? isBanner : of(banner), bannerName)
    const dyeSource = sourceOf(of(dye), dye.name)
    if (!isBanner(bannerSource.stack)) throw new Error(`applyBannerPattern: ${bannerName} is not a banner`)
    if (colorOf(dyeSource.stack) < 0) throw new Error(`applyBannerPattern: ${dye.name} is not a dye`)
    if (inventory.stackAt(CURSOR) !== undefined) throw new Error('applyBannerPattern needs an empty cursor')
    if (inventory.screenType === BLOCK && [LOOM_INPUT, LOOM_DYE, LOOM_MATERIAL].some(ref => inventory.stackAt(ref) !== undefined)) throw new Error('applyBannerPattern needs the loom\'s slots empty')
    const opened = await loomOf(loom)
    try {
      // in the recorded order: the banner, then the dye; the window's player slots follow its three slots and its result
      for (const [destStart, { stack, index }] of [bannerSource, dyeSource].entries()) {
        await bot.transfer({ itemType: stack.networkId, metadata: stack.metadata, sourceStart: RESULT_SLOT + 1 + index, destStart, count: 1 })
      }
      await core.call(async () => { select('applyBannerPattern', pattern) })
      // to the inventory, as the vanilla client's shift click (recorded on 1.26.51)
      await bot.clickWindow(RESULT_SLOT, 0, SHIFT)
      if (inventory.stackAt(LOOM_INPUT) !== undefined) throw new Error('the inventory has no room for the patterned banner')
    } catch (error) {
      if (opened !== undefined) await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    if (opened !== undefined) await bot.closeWindow(opened)
  }

  bot.bedrock = {
    ...bot.bedrock,
    selectLoomPattern: async pattern => { await core.call(async () => { select('selectLoomPattern', pattern) }) },
    // Java's null banner is the inventory's first, its null loom none
    applyBannerPattern: async (pattern, dye, banner, loom) => { await apply(pattern, dye, banner ?? undefined, loom ?? undefined) }
  }
}
