import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { stackAction } from '../modules/items.ts'
import type { RequestText, SlotRef, Stack } from '../modules/items.ts'
import { nbtOf, withNbt } from '../modules/recipes.ts'
import type { NbtValue } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { ANVIL_INPUT, ANVIL_MATERIAL, ANVIL_SCREEN } from '../screens/anvil.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockAnvil, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'anvil'
const INPUT_SLOT = 0
const MATERIAL_SLOT = 1
const RESULT_SLOT = 2
// Java's anvil: its longest name, the cost it refuses, what a unit of material repairs and two items combined add of the durability
const MAX_NAME_LENGTH = 35
const TOO_EXPENSIVE = 40
const REPAIR_PERCENT = 25
const COMBINE_BONUS_PERCENT = 12
// Java's anvil waits for the level the server takes; Bedrock's server answers the request in the same frame or the next
const LEVEL_TICKS = 100

interface AnvilResult {
  /** undefined: the item's own */
  readonly damage: number | undefined
  readonly repairCost: number
  /** the name it gives, undefined where it keeps the item's */
  readonly name: string | undefined
  readonly cost: number
  /** the material it takes */
  readonly used: number
}

function isAnvil (window: Window): window is BedrockAnvil {
  return 'combine' in window
}

/** the open window's slot holding the item: its own stack, else as Java's transfer, the first in the inventory of its type, metadata and NBT */
function slotOf (window: Window, item: Item, member: string): number {
  // an item the program made counts stack ids of its own, which may be a server's
  const found = window.slots.find(slot => slot?.stackId === item.stackId && slot.type === item.type) ??
    window.findItemRange(window.inventoryStart, window.inventoryEnd, item.type, item.metadata, false, item.nbt)
  if (found == null) throw new Error(`${member}: the ${item.name} given is in no slot of the window`)
  return found.slot
}

function int (value: number): NbtValue[string] {
  return { type: 'int', value }
}

/** Java's anvil on Bedrock's: openAnvil, and its window's combine and rename, the vanilla client's clicks and request */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version, registry } = bot
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  // from 1.19.50 the result goes into the inventory, before to the cursor
  const placesResult = atLeast('bedrock_1.19.50')
  /** the name box's text while combine or rename clicks the result: undefined keeps the item's name */
  let named: string | undefined
  let runtimeId = 0n

  core.observe(OWNER, 'start_game', packet => { runtimeId = packet.runtime_entity_id })

  inventory.screens.add(ANVIL_SCREEN, {
    shown: ({ window }) => {
      Object.assign(window, {
        combine: async (itemOne: Item, itemTwo: Item, name?: string) => { await combine(window, itemOne, itemTwo, name) },
        rename: async (item: Item, name?: string) => { await rename(window, item, name) }
      })
    },
    output: async (ctx, click, screen) => { await craft(ctx, click, screen) }
  })

  bot.openAnvil = async block => {
    const window = await bot.openBlock(block)
    if (!isAnvil(window)) throw new Error(`Not a anvil-like window: ${String(window.type)}`)
    return window
  }

  function nameOf (item: Item): string {
    return item.customName ?? item.displayName
  }

  /** two of an item, or one and its material: the damage it leaves of the first's, its cost and the material it takes */
  function repairOf (one: Item, two: Item): { damage: number, cost: number, used: number } | undefined {
    const known = registry.items[one.type]
    const max = known?.maxDurability
    const damage = one.durabilityUsed
    if (max === undefined || damage === 0) return undefined
    if (two.type === one.type) return { damage: Math.max(damage - (max - two.durabilityUsed) - Math.floor(max * COMBINE_BONUS_PERCENT / 100), 0), cost: 2, used: 1 }
    if (!(known?.repairWith ?? []).includes(two.name)) return undefined
    const each = Math.floor(max * REPAIR_PERCENT / 100)
    const used = Math.min(two.count, Math.ceil(damage / each))
    return { damage: Math.max(damage - used * each, 0), cost: used, used }
  }

  /** the vanilla client's result, undefined where it shows none; throws for what is not recorded */
  function resultOf (one: Item, two: Item | null, name: string | undefined): AnvilResult | undefined {
    if ([one, two].some(item => item !== null && (item.enchants.length > 0 || item.name === 'enchanted_book'))) throw new Error('the anvil with enchantments is not supported on Bedrock yet')
    if (name === '') throw new Error('the anvil with an empty name is not supported on Bedrock yet')
    const renamed = name !== undefined && name !== nameOf(one) ? name : undefined
    const penalty = one.repairCost + (two?.repairCost ?? 0)
    if (two === null) {
      // as Java's, a rename alone is never too expensive; Bedrock's keeps the item's prior work
      return renamed === undefined ? undefined : { damage: undefined, repairCost: one.repairCost, name: renamed, cost: Math.min(1 + penalty, TOO_EXPENSIVE - 1), used: 0 }
    }
    const repair = repairOf(one, two)
    const cost = (repair?.cost ?? 0) + (renamed === undefined ? 0 : 1) + penalty
    if (repair === undefined || cost >= TOO_EXPENSIVE) return undefined
    return { damage: repair.damage, repairCost: Math.max(one.repairCost, two.repairCost) * 2 + 1, name: renamed, cost, used: repair.used }
  }

  /** the vanilla client takes the level a result costs outside creative */
  function affords (cost: number): boolean {
    return bot.game.gameMode === 'creative' || (bot.experience.level ?? 0) >= cost
  }

  function checkName (name: string | undefined): void {
    if (name !== undefined && name.length > MAX_NAME_LENGTH) throw new Error('Name is too long.')
  }

  function needsOpen (member: string, window: Window): void {
    if (bot.currentWindow !== window) throw new Error(`${member} needs the anvil open`)
  }

  async function combine (window: Window, itemOne: Item, itemTwo: Item, name: string | undefined): Promise<void> {
    needsOpen('combine', window)
    checkName(name)
    const ways: Array<[Item, Item]> = [[itemOne, itemTwo], [itemTwo, itemOne]]
    // Java takes the cheaper way: Bedrock's rules here cost the same both ways that make a result
    const [way] = ways.flatMap(([one, two]) => {
      const result = resultOf(one, two, name)
      return result === undefined ? [] : [{ one, two, cost: result.cost }]
    })
    if (way === undefined) throw new Error('Not anvil-able (in either direction), cancelling.')
    if (!affords(way.cost)) throw new Error('Player does not have enough xp to do action, cancelling.')
    await use(window, 'combine', way.one, way.two, name)
  }

  async function rename (window: Window, item: Item, name: string | undefined): Promise<void> {
    needsOpen('rename', window)
    checkName(name)
    const result = resultOf(item, null, name)
    if (result === undefined) throw new Error('Not valid rename, cancelling.')
    if (!affords(result.cost)) throw new Error('Player does not have enough xp to do action, cancelling.')
    await use(window, 'rename', item, null, name)
  }

  /** as the vanilla client: each item into its slot by two clicks, a click on the result, one putting it away up to 1.19.40; then, outside creative, the level the server takes */
  async function use (window: Window, member: string, one: Item, two: Item | null, name: string | undefined): Promise<void> {
    const from = slotOf(window, one, member)
    // an item already in its slot stays there
    if (from !== INPUT_SLOT) await bot.moveSlotItem(from, INPUT_SLOT)
    const materialFrom = two === null ? MATERIAL_SLOT : slotOf(window, two, member)
    if (materialFrom !== MATERIAL_SLOT) await bot.moveSlotItem(materialFrom, MATERIAL_SLOT)
    let levelTold = false
    const told = (): void => { levelTold = true }
    bot.on('experience', told)
    named = name
    try {
      await bot.clickWindow(RESULT_SLOT, 0, 0)
      if (!placesResult) await bot.putSelectedItemRange(window.inventoryStart, window.inventoryEnd, window, null)
      if (bot.game.gameMode !== 'creative') await core.waits.until(() => levelTold, LEVEL_TICKS, `the server told no level in ${LEVEL_TICKS} ticks after the anvil's result`)
    } finally {
      named = undefined
      bot.off('experience', told)
    }
  }

  /** where the vanilla client puts the result: from 1.19.50 the first slot of the inventory with room, before on the cursor */
  function destinationOf (made: Stack): SlotRef {
    if (!placesResult) return CURSOR
    const [place] = placesFor(made, HOTBAR_AND_INVENTORY, inventory.draft())
    if (place === undefined) throw new Error('the anvil\'s result with no room in the inventory is not supported on Bedrock yet')
    return place.to
  }

  /** a click on the result: the vanilla client's request, sent with the name and the anvil's damage before it */
  async function craft (ctx: FrameContext, { mode }: WindowClick, { window, opening }: OpenScreen): Promise<void> {
    if (mode !== 0) throw new Error(`clickWindow: mode ${mode} on the anvil's result is not supported on Bedrock yet`)
    const one = window.slots[INPUT_SLOT]
    const input = inventory.stackAt(ANVIL_INPUT)
    if (one == null || input === undefined) throw new Error('the anvil holds nothing to repair or name')
    const two = window.slots[MATERIAL_SLOT] ?? null
    const result = resultOf(one, two, named)
    if (result === undefined) throw new Error('clickWindow: the anvil shows no result')
    if (!affords(result.cost)) throw new Error(`clickWindow: the anvil's result costs ${result.cost} levels, and the player has ${bot.experience.level ?? 0}`)
    const display = nbtOf(input)['display']
    const shown = display?.type === 'compound' ? display.value : {}
    // its keys after the item's own, as the vanilla client's
    const made = withNbt(input, {
      ...result.damage === undefined ? {} : { Damage: int(result.damage) },
      RepairCost: int(result.repairCost),
      ...result.name === undefined ? {} : { display: { type: 'compound', value: { ...shown, Name: { type: 'string', value: result.name } } } }
    })
    const moves: Move[] = [
      { type: 'action', action: stackAction(version, 'optional', { recipe_network_id: 0, filtered_string_index: 0 }), output: made },
      ...two === null ? [] : [{ type: 'consume' as const, count: result.used, from: ANVIL_MATERIAL }],
      { type: 'consume', count: 1, from: ANVIL_INPUT },
      { type: placesResult ? 'place' : 'take', count: 1, from: OUTPUT, to: destinationOf(made) }
    ]
    // up to 1.19.40 the name is told always, its cause from 1.19.30; from 1.19.50 only a new one
    const text: RequestText = !placesResult ? { customNames: [result.name ?? nameOf(one)], cause: 'anvil_text' } : result.name === undefined ? {} : { customNames: [result.name], cause: 'anvil_text' }
    if (result.name !== undefined && !atLeast('bedrock_1.18.30')) ctx.outbox.queue('filter_text_packet', { text: result.name, from_server: false })
    // 1.16.201's client tells the levels it takes (not recorded in creative, where it takes none)
    if (!atLeast('bedrock_1.16.210') && bot.game.gameMode !== 'creative') ctx.outbox.queue('entity_event', { runtime_entity_id: Number(runtimeId), event_id: 'player_add_xp_levels', data: -result.cost })
    // the vanilla client rolls the damage it tells, which the server applies: the bot never damages an anvil; 1.17.0 and, from 1.26.40, the server rolls
    if (version !== 'bedrock_1.17.0' && !atLeast('bedrock_1.26.40')) ctx.outbox.queue('anvil_damage', { damage: 0, position: opening.position })
    await inventory.request(core, ctx, moves, text)
  }
}
