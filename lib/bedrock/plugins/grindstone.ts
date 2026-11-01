import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { resultsAction, stackAction } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, nbtOf, withOnlyNbt, writtenResult } from '../modules/recipes.ts'
import type { NbtValue } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import { GRINDSTONE_ADDITIONAL, GRINDSTONE_INPUT, GRINDSTONE_SCREEN } from '../screens/grindstone.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockGrindstone, BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const INPUT_SLOT = 0
const ADDITIONAL_SLOT = 1
const RESULT_SLOT = 2
const SHIFT = 1
const HOTBAR_KEY = 2
// Java's grindstone adds 5 % of the durability to what both items have left
const BONUS_PERCENT = 5
const GRINDSTONE_SLOTS: readonly SlotRef[] = Object.freeze([GRINDSTONE_INPUT, GRINDSTONE_ADDITIONAL])

function isGrindstone (window: Window): window is BedrockGrindstone {
  return 'grind' in window
}

function isGrindstoneSlot ({ container }: SlotRef): boolean {
  return GRINDSTONE_SLOTS.some(slot => slot.container === container)
}

/** the open window's slot holding the item: its own stack, else as Java's transfer, the first in the inventory of its type, metadata and NBT */
function slotOf (window: Window, item: Item, member: string): number {
  // an item the program made counts stack ids of its own, which may be a server's
  const found = window.slots.find(slot => slot?.stackId === item.stackId && slot.type === item.type) ??
    window.findItemRange(window.inventoryStart, window.inventoryEnd, item.type, item.metadata, false, item.nbt)
  if (found == null) throw new Error(`${member}: the ${item.name} given is in no slot of the window`)
  return found.slot
}

/** Bedrock's grindstone, which Java's bot has not: bot.bedrock.openGrindstone, and its window's grind, the vanilla client's clicks */
export default function inject (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version, registry } = bot
  const ingredients = new Ingredients(registry, version)
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  /** what the vanilla client's craft names: the grindstone's slots as the last request changing them left them */
  let recipeNetworkId = 0

  inventory.screens.add(GRINDSTONE_SCREEN, {
    shown: ({ window }) => {
      recipeNetworkId = 0
      Object.assign(window, { grind: async (itemOne: Item, itemTwo?: Item | null) => await grind(window, itemOne, itemTwo ?? null) })
    },
    requested: (requestId, moves) => {
      if (!moves.some(move => move.type !== 'action' && (isGrindstoneSlot(move.from) || ('to' in move && isGrindstoneSlot(move.to))))) return
      // up to 1.19.80 the request; from 1.20.0 the input's name right after it, its stack's or the request's
      recipeNetworkId = atLeast('bedrock_1.20.0') ? inventory.stackAt(GRINDSTONE_INPUT)?.stackId ?? requestId : requestId
    },
    output: async (ctx, click, { window }) => { await craft(ctx, click, window) }
  })

  bot.bedrock = {
    ...bot.bedrock,
    openGrindstone: async block => {
      const window = await bot.openBlock(block)
      if (!isGrindstone(window)) throw new Error(`openGrindstone: the block opened a ${String(window.type)} window, not a grindstone`)
      return window
    }
  }

  /** the item a slot's damage is out of; throws for one the grindstone does not take, as far as recorded */
  function maxDurabilityOf (item: Item): number {
    const max = registry.items[item.type]?.maxDurability
    if (max === undefined) throw new Error(`grinding ${item.name} is not supported on Bedrock yet`)
    if (item.enchants.some(({ name }) => registry.enchantmentsByName[name]?.curse === true)) throw new Error(`grinding ${item.name} with a curse is not supported on Bedrock yet`)
    return max
  }

  /** what the result's NBT changes on the first item's, its enchantments removed; throws where the vanilla client shows no result */
  function changesOf (items: ReadonlyArray<Item | null | undefined>): NbtValue {
    const [one, two] = items.filter(item => item != null)
    if (one === undefined) throw new Error('the grindstone holds nothing to grind')
    const max = maxDurabilityOf(one)
    const repairCost: NbtValue = atLeast('bedrock_1.17.10') ? { RepairCost: { type: 'int', value: 0 } } : {}
    if (two === undefined) {
      if (one.enchants.length === 0) throw new Error(`the grindstone makes nothing of ${one.name} without enchantments`)
      return repairCost
    }
    maxDurabilityOf(two)
    if (two.type !== one.type) throw new Error(`the grindstone makes nothing of ${one.name} and ${two.name}`)
    const left = max - one.durabilityUsed + max - two.durabilityUsed + Math.floor(max * BONUS_PERCENT / 100)
    return { Damage: { type: 'int', value: Math.max(max - left, 0) }, ...repairCost }
  }

  /** where the vanilla client moves the result: a mouse button to the cursor, a hotbar key to its slot unless that holds an item, a shift click to the first slot of the inventory with room */
  function movedTo (result: Stack, { mode, mouseButton }: WindowClick): Move[] {
    if (mode === SHIFT) return placesFor(result, HOTBAR_AND_INVENTORY, inventory.draft()).map(({ to, count }) => ({ type: 'place', count, from: OUTPUT, to }))
    if (mode !== HOTBAR_KEY) return [{ type: 'take', count: 1, from: OUTPUT, to: CURSOR }]
    const to: SlotRef = { container: 'hotbar', slot: mouseButton }
    return inventory.stackAt(to) === undefined ? [{ type: 'take', count: 1, from: OUTPUT, to }] : []
  }

  /** a click on the result: the vanilla client's request */
  async function craft (ctx: FrameContext, click: WindowClick, window: Window): Promise<void> {
    const changes = changesOf([window.slots[INPUT_SLOT], window.slots[ADDITIONAL_SLOT]])
    const filled = GRINDSTONE_SLOTS.filter(ref => inventory.stackAt(ref) !== undefined)
    const [first] = filled.map(ref => inventory.stackAt(ref))
    assert.ok(first)
    const kept = Object.fromEntries(Object.entries(nbtOf(first)).filter(([key]) => key !== 'ench'))
    const result = withOnlyNbt(first, { ...kept, ...changes })
    // the cost is 0 on every recorded build: the experience comes as orbs
    const action = !atLeast('bedrock_1.17.40')
      ? stackAction(version, 'non_implemented', {})
      : stackAction(version, 'craft_grindstone_request', { recipe_network_id: recipeNetworkId, ...atLeast('bedrock_1.21.20') ? { times_crafted: 1 } : {}, cost: 0 })
    const moved = movedTo(result, click)
    if (moved.length === 0) return
    const moves: Move[] = [
      { type: 'action', action, output: result },
      { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, result)], 1) },
      ...filled.map(from => ({ type: 'consume' as const, count: 1, from })),
      ...moved
    ]
    await inventory.request(core, ctx, moves)
  }

  /** as the vanilla client: each item into its slot by two clicks, a click on the result, one putting it away */
  async function grind (window: Window, itemOne: Item, itemTwo: Item | null): Promise<Item> {
    if (bot.currentWindow !== window) throw new Error('grind needs the grindstone open')
    changesOf([itemOne, itemTwo])
    await bot.moveSlotItem(slotOf(window, itemOne, 'grind'), INPUT_SLOT)
    if (itemTwo !== null) await bot.moveSlotItem(slotOf(window, itemTwo, 'grind'), ADDITIONAL_SLOT)
    await bot.clickWindow(RESULT_SLOT, 0, 0)
    const made = window.selectedItem
    assert.ok(made, 'grind: the server left the cursor empty')
    await bot.putSelectedItemRange(window.inventoryStart, window.inventoryEnd, window, null)
    return made
  }
}
