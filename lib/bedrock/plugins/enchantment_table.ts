import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import type { Move } from '../modules/inventory.ts'
import { craftRecipeAction, resultsAction } from '../modules/items.ts'
import { Ingredients, withNbt, writtenResult } from '../modules/recipes.ts'
import { OUTPUT } from '../modules/screens.ts'
import { ENCHANTING_INPUT, ENCHANTING_LAPIS, ENCHANTMENT_SCREEN } from '../screens/enchantment.ts'
import type { BedrockEnchantment, BedrockEnchantmentTable } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'enchantment_table'
// Java's once() gives up after 20 s
const READY_TICKS = 400
const OPTIONS = 3

type Option = NonNullable<BedrockClientboundPackets['player_enchant_options']['options']>[number]

interface Table {
  readonly window: BedrockEnchantmentTable
  ready: boolean
}

function isTable (window: Window): window is BedrockEnchantmentTable {
  return 'enchant' in window && 'close' in window
}

/** Java's enchanting table on the enchantment screen: its options are player_enchant_options', its enchant a request naming one */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  /** the server's last, whatever the screen: it clears them before it opens a table */
  let options: readonly Option[] = []
  let table: Table | undefined

  core.handle(OWNER, 'player_enchant_options', packet => {
    // 1.16.201 – 1.16.210 name them enchant_options
    options = [...packet.options ?? [], ...packet.enchant_options ?? []]
    if (table !== undefined) showOptions(table)
  })

  inventory.screens.onShown(() => { table = undefined })
  inventory.screens.add(ENCHANTMENT_SCREEN, {
    shown: ({ window }) => {
      table = { window: extend(window), ready: false }
      showOptions(table)
    },
    closed: () => { table = undefined }
  })

  bot.openEnchantmentTable = async block => {
    assert.strictEqual(block.name, 'enchanting_table')
    const window = await bot.openBlock(block)
    // only an enchanting table's window has its members
    if (!isTable(window)) throw new Error(`Expected minecraft:enchant when opening table but got ${String(window.type)}`)
    return window
  }

  function enchantmentOf (option: Option | undefined): BedrockEnchantment {
    if (option === undefined) return { level: -1, expected: { enchant: -1, level: -1 }, enchants: [], optionId: -1 }
    const enchants = enchantsOf(option).map(({ id, level }) => ({ id, name: bot.registry.enchantments[id]?.name, level }))
    const [first] = enchants
    return { level: option.cost, expected: first === undefined ? { enchant: -1, level: -1 } : { enchant: first.id, level: first.level }, enchants, optionId: option.option_id }
  }

  /** Java's ready once the three levels are known: here once the server sent the options, in its packet pass */
  function showOptions (shown: Table): void {
    shown.window.enchantments = Array.from({ length: OPTIONS }, (_, index) => enchantmentOf(options[index]))
    const ready = options.length > 0
    const becameReady = ready && !shown.ready
    shown.ready = ready
    if (becameReady) core.emitWindow(shown.window, 'ready', [])
  }

  function extend (window: Window): BedrockEnchantmentTable {
    const members = {
      enchantments: [],
      // Bedrock tells the seed in start_game alone, and never after an enchant changes it
      xpseed: -1,
      targetItem: () => window.slots[0] ?? null,
      enchant: async (choice: string | number) => await enchant(window, choice),
      takeTargetItem: async () => {
        needsOpen('takeTargetItem', window)
        const item = window.slots[0]
        assert.ok(item)
        await bot.putAway(item.slot)
        return item
      },
      putTargetItem: async (item: Item) => {
        needsOpen('putTargetItem', window)
        await bot.moveSlotItem(item.slot, 0)
      },
      putLapis: async (item: Item) => {
        needsOpen('putLapis', window)
        await bot.moveSlotItem(item.slot, 1)
      }
    }
    Object.assign(window, members)
    assert.ok(isTable(window))
    return window
  }

  /** the table this window shows, while it is the screen open: the plugin keeps the table of the screen open alone */
  function needsOpen (member: string, window: Window): Table {
    if (bot.currentWindow !== window || table === undefined) throw new Error(`${member} needs the enchanting table open`)
    return table
  }

  async function enchant (window: Window, choice: string | number): Promise<Item> {
    const shown = needsOpen('enchant', window)
    if (!shown.ready) await core.waits.until(() => shown.ready || table !== shown, READY_TICKS, `enchant: the server sent the enchanting table no options in ${READY_TICKS} ticks`)
    needsOpen('enchant', window)
    const index = parseInt(String(choice), 10)
    const option = shown.window.enchantments[index]
    assert.ok(option !== undefined, `enchant: the enchanting table has no option ${String(choice)}`)
    assert.notStrictEqual(option.level, -1)
    await core.call(async ctx => { await request(ctx, shown, index) })
    const item = window.slots[0]
    assert.ok(item, 'enchant: the server left the enchanting table without its item')
    return item
  }

  /** the vanilla client's button: enabled with the lapis it takes and, outside creative, the level it asks */
  async function request (ctx: FrameContext, shown: Table, index: number): Promise<void> {
    needsOpen('enchant', shown.window)
    const option = options[index]
    const input = inventory.stackAt(ENCHANTING_INPUT)
    if (option === undefined || input === undefined) throw new Error(`enchant: the enchanting table has no option ${index} any more`)
    if (bot.registry.items[input.networkId]?.name === 'book') throw new Error('enchant: enchanting a book is not supported on Bedrock yet')
    const lapis = inventory.stackAt(ENCHANTING_LAPIS)?.count ?? 0
    if (lapis < index + 1) throw new Error(`enchant: option ${index} takes ${index + 1} lapis lazuli, and the table holds ${lapis}`)
    const level = Math.max(option.cost, index + 1)
    const has = bot.experience.level ?? 0
    if (bot.game.gameMode !== 'creative' && has < level) throw new Error(`enchant: option ${index} needs level ${level}, and the player has ${has}`)
    const enchanted = withNbt(input, {
      ench: { type: 'list', value: { type: 'compound', value: enchantsOf(option).map(({ id, level }) => ({ id: { type: 'short', value: id }, lvl: { type: 'short', value: level } })) } }
    })
    // the consume renames the input slot: the enchanted item goes back to it by the request's id
    const moves: Move[] = [
      { type: 'action', action: craftRecipeAction(version, option.option_id, 1), output: enchanted },
      { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, enchanted)], 1) },
      { type: 'consume', count: 1, from: ENCHANTING_INPUT },
      { type: 'place', count: 1, from: OUTPUT, to: ENCHANTING_INPUT },
      { type: 'consume', count: index + 1, from: ENCHANTING_LAPIS }
    ]
    await inventory.request(core, ctx, moves)
  }
}

/** in the order the item gets them */
function enchantsOf ({ equip_enchants: equip, held_enchants: held, self_enchants: self }: Option): Option['held_enchants'] {
  return [...equip, ...held, ...self]
}
