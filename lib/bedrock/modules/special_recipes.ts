import type { Tags } from 'prismarine-nbt'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import { withCount } from './items.ts'
import type { Stack } from './items.ts'
import { inOrder, nbtOf, withNbt, withOnlyNbt } from './recipes.ts'
import type { Ingredients, NbtValue } from './recipes.ts'

type Registry = BedrockBotInternal['registry']
type Compound = Tags['compound']['value']

/** crafting_data's multi recipes the grid crafts by, as the codec reads their uuids */
const REPAIR = '00000000-0000-0000-0100-000000000000'
const FIREWORKS = '00000000-0000-0000-0200-000000000000'
const BOOK_CLONING = '2f4f8e33-846b-cad1-8dd9-4b8bcc766b9c'
const MAP_CLONING = '9d4d10ba-5597-9385-c443-e9a8b7efcca4'
const BANNER_DUPLICATE = '7640a275-05d1-c5b5-f04b-bfa23e922baf'
const BANNER_ADD_PATTERN = '404472e1-afae-1ad8-7bd2-30f08d862592'
const DECORATED_POT = '4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88'

/** a dye's color: Bedrock's index, as a banner's and a firework star's (red's 1 recorded at the loom) */
export const COLORS: readonly string[] = Object.freeze([
  'black', 'red', 'green', 'brown', 'blue', 'purple', 'cyan', 'light_gray', 'gray', 'pink', 'lime', 'yellow', 'light_blue', 'magenta', 'orange', 'white'
])
/** each color's customColor (ARGB), as crafting_data's stars of one dye have it */
const STAR_COLORS: readonly number[] = Object.freeze([
  -14869215, -5231066, -10585066, -8170446, -12827478, -7785800, -15295332, -6447721, -12103854, -816214, -8337633, -75715, -12930086, -3715395, -425955, -986896
])
/** up to 1.20.0 the fireworks' multi recipe takes these as dyes too, as crafting_data's stars of them name it */
const DYE_ITEMS: Readonly<Record<string, number>> = Object.freeze({ ink_sac: 0, cocoa_beans: 3, lapis_lazuli: 4, bone_meal: 15 })
/** a star's FireworkType by its shape's item; a head's is 3 */
const SHAPES: Readonly<Record<string, number>> = Object.freeze({ fire_charge: 1, gold_nugget: 2, feather: 4 })
const HEAD_SHAPE = 3
const MOST_FLIGHT = 3
const MOST_PATTERNS = 6
const LAST_GENERATION = 2
const REPAIR_BONUS_PERCENT = 5
/** the crafting table's patterns of dyes, the grid row by row: # a dye, the banner in another cell */
const BANNER_SHAPES: Readonly<Record<string, string>> = Object.freeze({
  bl: '      #  ',
  br: '        #',
  tl: '#        ',
  tr: '  #      ',
  bs: '      ###',
  ts: '###      ',
  ls: '#  #  #  ',
  rs: '  #  #  #',
  cs: ' #  #  # ',
  ms: '   ###   ',
  drs: '#   #   #',
  dls: '  # # #  ',
  ss: '# ## #   ',
  cr: '# # # # #',
  sc: ' # ### # ',
  bt: '    # # #',
  tt: '# # #    ',
  bts: '   # # # ',
  tts: ' # # #   ',
  ld: '## #     ',
  rd: '     # ##',
  lud: '   #  ## ',
  rud: ' ##  #   ',
  mc: '    #    ',
  mr: ' # # # # ',
  vh: '## ## ## ',
  hh: '######   ',
  vhr: ' ## ## ##',
  hhb: '   ######',
  bo: '#### ####',
  gra: '# # #  # ',
  gru: ' #  # # #'
})
/** the pot's sides in the grid, in the order of its sherds: back, left, right, front */
const POT_SIDES: readonly number[] = Object.freeze([1, 3, 5, 7])
const TABLE_WIDTH = 3

/** what the grid makes by a multi recipe: the cells it keeps, the others giving one item */
export interface SpecialCraft {
  readonly uuid: string
  readonly kept: readonly number[]
  readonly result: Stack
}

interface Cell {
  readonly stack: Stack
  readonly cell: number
  readonly name: string
}

function int (value: number): Tags['int'] {
  return { type: 'int', value }
}

function byte (value: number): Tags['byte'] {
  return { type: 'byte', value }
}

function compoundsOf (tag: NbtValue[string]): Compound[] {
  // a list of compounds, or of none
  return tag?.type === 'list' ? tag.value.value as Compound[] : []
}

/** a list of no tag, typed end, as crafting_data's rocket without stars has it: the typings name no end tag */
function emptyList (): Tags['list'] {
  const end: string = 'end'
  return { type: 'list', value: { type: end as Tags['list']['value']['type'], value: [] } }
}

function intOf (stack: Stack, key: string): number {
  const tag = nbtOf(stack)[key]
  return tag?.type === 'int' ? tag.value : 0
}

function withMetadata (stack: Stack, metadata: number): Stack {
  const { wire } = stack
  return withCount({ ...stack, metadata, wire: 'auxiliary_value' in wire ? wire : { ...wire, metadata } }, stack.count)
}

/** the banner with the pattern after its own, its Patterns before its other tags, as recorded at the loom: {Patterns, Type} from 1.20.61, whose banners have Type 0 */
export function patterned (banner: Stack, pattern: string, color: number): Stack {
  const { Patterns: patterns, ...rest } = nbtOf(banner)
  const added: Compound = { Color: int(color), Pattern: { type: 'string', value: pattern } }
  const { wire } = banner
  const bare: Stack = { ...banner, wire: 'auxiliary_value' in wire ? { ...wire, nbt: undefined } : { ...wire, extra: undefined } }
  return withNbt(withCount(bare, 1), { Patterns: { type: 'list', value: { type: 'compound', value: [...compoundsOf(patterns), added] } }, ...rest })
}

/** a dye item's color, -1 for none: the items named for one */
export function dyeColor (name: string): number {
  return COLORS.findIndex(color => name === `${color}_dye`)
}

/**
 * The grid's multi recipes no crafting_data recipe stands for, by the game's rules (Java's where Bedrock's are not
 * known): none of them is recorded.
 */
export class SpecialRecipes {
  private readonly registry: Registry
  private readonly ingredients: Ingredients
  private readonly version: BedrockVersion
  // the item crafting_data's own recipe of it makes, which the result is written as
  private readonly madeBy: (name: string) => Stack | undefined

  constructor (registry: Registry, ingredients: Ingredients, version: BedrockVersion, madeBy: (name: string) => Stack | undefined) {
    this.registry = registry
    this.ingredients = ingredients
    this.version = version
    this.madeBy = madeBy
  }

  /** the grid's cells row by row, `width` a row */
  craft (cells: ReadonlyArray<Stack | undefined>, width: number): SpecialCraft | undefined {
    const filled = cells.flatMap((stack, cell) => stack === undefined ? [] : [{ stack, cell, name: this.ingredients.nameOf(stack.networkId) }])
    const table = width === TABLE_WIDTH
    return this.repaired(filled) ?? this.mapCloned(filled) ?? this.bookCloned(filled) ?? this.bannerCopied(filled) ??
      (table ? this.bannerPatterned(filled) ?? this.pot(filled) : undefined) ?? this.rocket(filled) ?? this.star(filled) ?? this.faded(filled)
  }

  /** two damaged items of a kind: their durability and 5% more, their curses kept, as Java's */
  private repaired (filled: readonly Cell[]): SpecialCraft | undefined {
    const [one, two, ...more] = filled
    const most = one === undefined ? undefined : this.registry.items[one.stack.networkId]?.maxDurability
    if (one === undefined || two === undefined || more.length > 0 || one.stack.networkId !== two.stack.networkId || most === undefined) return undefined
    const left = (stack: Stack): number => most - intOf(stack, 'Damage')
    const damage = Math.max(0, most - (left(one.stack) + left(two.stack) + Math.floor(most * REPAIR_BONUS_PERCENT / 100)))
    const curses = this.cursesOf(one.stack)
    const added = this.cursesOf(two.stack)
    if (curses === undefined || added === undefined) return undefined
    const ench = [...curses, ...added.filter(curse => !curses.some(({ id }) => id?.value === curse['id']?.value))]
    const nbt: NbtValue = { Damage: int(damage), ...ench.length === 0 ? {} : { ench: { type: 'list', value: { type: 'compound', value: ench } } } }
    return { uuid: REPAIR, kept: [], result: withOnlyNbt(withCount(one.stack, 1), nbt) }
  }

  /** the item's curses, undefined with an enchantment the registry does not know */
  private cursesOf (stack: Stack): Compound[] | undefined {
    const enchantments = compoundsOf(nbtOf(stack)['ench']).map(ench => ({ ench, known: this.registry.enchantments[Number(ench['id']?.value)] }))
    if (enchantments.some(({ known }) => known === undefined)) return undefined
    return enchantments.filter(({ known }) => known?.curse === true).map(({ ench }) => ench)
  }

  /** a filled map and empty maps: a copy for each, the map too */
  private mapCloned (filled: readonly Cell[]): SpecialCraft | undefined {
    const maps = filled.filter(({ name }) => name === 'filled_map')
    const [map] = maps
    const empty = filled.length - maps.length
    if (map === undefined || maps.length > 1 || empty === 0 || filled.some(({ name }) => name !== 'filled_map' && name !== 'empty_map')) return undefined
    return { uuid: MAP_CLONING, kept: [], result: withCount(map.stack, empty + 1) }
  }

  /** a written book and books and quills: a copy of the next generation for each, the book kept, but a copy's copy */
  private bookCloned (filled: readonly Cell[]): SpecialCraft | undefined {
    const books = filled.filter(({ name }) => name === 'written_book')
    const [book] = books
    const quills = filled.length - books.length
    if (book === undefined || books.length > 1 || quills === 0 || filled.some(({ name }) => name !== 'written_book' && name !== 'writable_book')) return undefined
    const generation = intOf(book.stack, 'generation')
    if (generation >= LAST_GENERATION) return undefined
    return { uuid: BOOK_CLONING, kept: [book.cell], result: withOnlyNbt(withCount(book.stack, quills), inOrder({ ...nbtOf(book.stack), generation: int(generation + 1) })) }
  }

  /** a banner of patterns and one without, of one color: a copy, the patterned banner kept */
  private bannerCopied (filled: readonly Cell[]): SpecialCraft | undefined {
    const [one, two, ...more] = filled
    if (one === undefined || two === undefined || more.length > 0 || one.name !== 'banner' || two.name !== 'banner' || one.stack.metadata !== two.stack.metadata) return undefined
    const patterned = [one, two].find(({ stack }) => this.patternsOf(stack) > 0)
    const blank = [one, two].find(({ stack }) => this.patternsOf(stack) === 0)
    if (patterned === undefined || blank === undefined) return undefined
    return { uuid: BANNER_DUPLICATE, kept: [patterned.cell], result: withCount(patterned.stack, 1) }
  }

  private patternsOf (banner: Stack): number {
    return compoundsOf(nbtOf(banner)['Patterns']).length
  }

  /** a banner and dyes of one color in a pattern's shape, at the crafting table: the pattern added, up to six */
  private bannerPatterned (filled: readonly Cell[]): SpecialCraft | undefined {
    const banners = filled.filter(({ name }) => name === 'banner')
    const [banner] = banners
    const dyes = filled.filter(({ name }) => name !== 'banner')
    const colors = new Set(dyes.map(({ name }) => dyeColor(name)))
    const [color] = colors
    if (banner === undefined || banners.length > 1 || color === undefined || colors.size > 1 || color < 0 || this.patternsOf(banner.stack) >= MOST_PATTERNS) return undefined
    const dyed = new Set(dyes.map(({ cell }) => cell))
    const pattern = Object.keys(BANNER_SHAPES).find(code => [...String(BANNER_SHAPES[code])].every((mark, cell) => (mark === '#') === dyed.has(cell)))
    return pattern === undefined ? undefined : { uuid: BANNER_ADD_PATTERN, kept: [], result: patterned(banner.stack, pattern, color) }
  }

  /** bricks and sherds on the pot's four sides, at the crafting table: its sherds by name, as Java's */
  private pot (filled: readonly Cell[]): SpecialCraft | undefined {
    const sides = POT_SIDES.map(side => filled.find(({ cell }) => cell === side))
    const pot = this.madeBy('decorated_pot')
    const isSherd = (side: Cell | undefined): side is Cell => side !== undefined && this.registry.itemsByName[side.name]?.tags?.includes('minecraft:decorated_pot_sherds') === true
    if (filled.length !== POT_SIDES.length || !sides.every(isSherd) || pot === undefined) return undefined
    const sherds = sides.filter(isSherd).map(({ name }) => `minecraft:${name}`)
    return { uuid: DECORATED_POT, kept: [], result: withOnlyNbt(withCount(pot, 1), { sherds: { type: 'list', value: { type: 'string', value: sherds } } }) }
  }

  /** paper, one to three gunpowder and stars: crafting_data's rockets, their flight the gunpowder and their explosions the stars' */
  private rocket (filled: readonly Cell[]): SpecialCraft | undefined {
    const count = (name: string): number => filled.filter(cell => cell.name === name).length
    const [paper, gunpowder, stars] = [count('paper'), count('gunpowder'), filled.filter(({ name }) => name === 'firework_star')]
    const rocket = this.madeBy('firework_rocket')
    if (paper !== 1 || gunpowder === 0 || gunpowder > MOST_FLIGHT || paper + gunpowder + stars.length !== filled.length || rocket === undefined) return undefined
    const explosions = stars.flatMap(({ stack }) => {
      const explosion = nbtOf(stack)['FireworksItem']
      return explosion?.type === 'compound' ? [explosion.value] : []
    })
    const list: Tags['list'] = explosions.length === 0 ? emptyList() : { type: 'list', value: { type: 'compound', value: explosions } }
    return { uuid: FIREWORKS, kept: [], result: withOnlyNbt(rocket, { Fireworks: { type: 'compound', value: { Explosions: list, Flight: byte(gunpowder) } } }) }
  }

  /** a dye's color for the fireworks' multi recipe: up to 1.20.0 the items crafting_data's stars take too */
  private fireworkColor (name: string): number {
    const color = dyeColor(name)
    return color < 0 && !isBedrockVersionAtLeast(this.version, 'bedrock_1.20.10') ? DYE_ITEMS[name] ?? -1 : color
  }

  /** a gunpowder, dyes, and a shape, a diamond and a glowstone dust or none: crafting_data's star, of the first dye's data and the colors' mix */
  private star (filled: readonly Cell[]): SpecialCraft | undefined {
    const colors = filled.flatMap(({ name }) => {
      const color = this.fireworkColor(name)
      return color < 0 ? [] : [color]
    })
    const shapes = filled.flatMap(({ name }) => name === 'skull' || /_(head|skull)$/.test(name) ? [HEAD_SHAPE] : SHAPES[name] ?? [])
    const count = (name: string): number => filled.filter(cell => cell.name === name).length
    const [gunpowder, trail, flicker] = [count('gunpowder'), count('diamond'), count('glowstone_dust')]
    const [first] = colors
    const star = this.madeBy('firework_star')
    if (gunpowder !== 1 || first === undefined || shapes.length > 1 || trail > 1 || flicker > 1 || star === undefined) return undefined
    if (gunpowder + colors.length + shapes.length + trail + flicker !== filled.length) return undefined
    const explosion: Compound = {
      FireworkColor: { type: 'byteArray', value: colors },
      FireworkFade: { type: 'byteArray', value: [] },
      FireworkFlicker: byte(flicker),
      FireworkTrail: byte(trail),
      FireworkType: byte(shapes[0] ?? 0)
    }
    return { uuid: FIREWORKS, kept: [], result: withOnlyNbt(withMetadata(withCount(star, 1), first), { FireworksItem: { type: 'compound', value: explosion }, customColor: int(mixed(colors)) }) }
  }

  /** a star and dyes: the star fading to the dyes' colors */
  private faded (filled: readonly Cell[]): SpecialCraft | undefined {
    const [star] = filled.filter(({ name }) => name === 'firework_star')
    const colors = filled.map(({ name }) => this.fireworkColor(name)).filter(color => color >= 0)
    const explosion = star === undefined ? undefined : nbtOf(star.stack)['FireworksItem']
    // a star and nothing but dyes
    if (star === undefined || colors.length === 0 || colors.length + 1 !== filled.length || explosion?.type !== 'compound') return undefined
    return { uuid: FIREWORKS, kept: [], result: withNbt(withCount(star.stack, 1), { FireworksItem: { type: 'compound', value: { ...explosion.value, FireworkFade: { type: 'byteArray', value: colors } } } }) }
  }
}

/** the colors' channels averaged */
function mixed (colors: readonly number[]): number {
  const channel = (shift: number): number => Math.floor(colors.reduce((sum, color) => sum + ((Number(STAR_COLORS[color]) >>> shift) & 0xff), 0) / colors.length) << shift
  return channel(24) | channel(16) | channel(8) | channel(0)
}
