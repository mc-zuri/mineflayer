import assert from 'assert'
import prismarineItem from 'prismarine-item'
import type { Item } from 'prismarine-item'
import type { FrameContext } from '../core/types.ts'
import { defaultAccepts } from '../modules/clicks.ts'
import { craftCreativeAction, readStack, resultsAction, withCount } from '../modules/items.ts'
import type { Stack } from '../modules/items.ts'
import { Ingredients, nbtOf, writtenResult } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'creative'
// the armor, the inventory, the hotbar and the offhand: the creative inventory has no crafting grid
const FIRST_SLOT = 5
const LAST_SLOT = 45
const LEFT = 0

interface Entry {
  readonly id: number
  readonly stack: Stack
}

interface Made {
  readonly entry: Entry
  readonly count: number
}

/** Java's bot.creative: the items creative_content lists, made on the inventory screen as the vanilla client makes them */
export default function creative (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const Item = prismarineItem(bot.registry)
  const ingredients = new Ingredients(bot.registry, version)
  let entries: readonly Entry[] = []
  // Java's: the slots a setInventorySlot is setting
  const setting = new Set<number>()
  // the operation on the inventory screen, which the next waits for
  let running: Promise<void> | undefined

  core.handle(OWNER, 'creative_content', packet => {
    // 1.16.201 numbers an entry runtime_id, 1.16.210 stack_id
    entries = packet.items.flatMap(({ entry_id: entryId, stack_id: stackId, runtime_id: runtimeId, item }) => {
      const stack = readStack(item)
      return stack === undefined ? [] : [{ id: Number(entryId ?? stackId ?? runtimeId), stack }]
    })
  })

  function creativeMode (member: string): void {
    const mode = bot.game.gameMode
    if (mode !== 'creative') throw new Error(`bot.creative.${member} needs the creative game mode, not ${mode}: the vanilla client shows the creative inventory there only`)
  }

  /** the entry of the item's id and metadata (a block's legacy data, as recipes name it) with its NBT, else with none */
  function entryOf (item: Item): Entry {
    const wanted = { count: 1, accepted: { kind: 'id', networkId: item.type, metadata: item.metadata }, written: undefined } as const
    const nbt = JSON.stringify(item.nbt?.value ?? {})
    const alike = entries.filter(({ stack }) => ingredients.matches(wanted, stack))
    // a new tool's Damage 0, which prismarine-item gives it, is in no entry
    const entry = alike.find(({ stack }) => JSON.stringify(nbtOf(stack)) === nbt) ?? alike.find(({ stack }) => Object.keys(nbtOf(stack)).length === 0)
    if (entry === undefined) throw new Error(`bot.creative.setInventorySlot: the creative inventory has no ${item.name} of metadata ${item.metadata} and this NBT`)
    return entry
  }

  /** on the inventory screen open, else on the one it opens and closes again */
  async function inInventoryScreen (member: string, use: () => Promise<void>): Promise<void> {
    const window = bot.currentWindow
    if (window === bot.inventory) return await use()
    if (window !== null) throw new Error(`bot.creative.${member} needs the inventory screen: the ${window.type} window is open`)
    const opened = await bot.openInventory()
    try {
      await use()
    } catch (error) {
      await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    await bot.closeWindow(opened)
  }

  /** once the operation before ended: another would close the screen it uses */
  async function onInventoryScreen (member: string, use: () => Promise<void>): Promise<void> {
    if (running !== undefined) {
      await running.catch(() => {})
      return await onInventoryScreen(member, use)
    }
    const run = inInventoryScreen(member, use)
    running = run
    try {
      await run
    } finally {
      running = undefined
    }
  }

  /** the slot's stack destroyed, then the item made, taken to the cursor and put in the slot: each once the server took the one before */
  async function set (member: string, slot: number, made: Made | undefined): Promise<void> {
    const to = inventory.inventoryRef(slot)
    const make = async (ctx: FrameContext): Promise<void> => {
      if (made === undefined) return
      const { entry, count } = made
      await inventory.request(core, ctx, [
        { type: 'action', action: craftCreativeAction(version, entry.id), output: withCount(entry.stack, count) },
        { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, entry.stack)], 1) },
        { type: 'take', count, from: OUTPUT, to: CURSOR }
      ])
      await bot.clickWindow(slot, LEFT, 0)
    }
    await core.call(async ctx => {
      if (inventory.stackAt(CURSOR) !== undefined) throw new Error(`bot.creative.${member}: the cursor holds an item`)
      const held = inventory.stackAt(to)
      if (held === undefined) return await make(ctx)
      // not recorded: no recording empties a slot in creative
      await inventory.request(core, ctx, [{ type: 'destroy', count: held.count, from: to }])
      await core.call(make)
    })
  }

  /** the item's entry and count, if the slot takes them as the vanilla client puts an item there */
  function madeOf (slot: number, item: Item): Made {
    const entry = entryOf(item)
    if (item.count < 1 || item.count > item.stackSize) throw new Error(`bot.creative.setInventorySlot: ${item.count} ${item.name} make no stack`)
    if (!defaultAccepts(inventory.inventoryRef(slot), entry.stack, inventory.draft())) throw new Error(`bot.creative.setInventorySlot: ${item.name} does not go in slot ${slot}`)
    return { entry, count: item.count }
  }

  async function setInventorySlot (slot: number, item: Item | null): Promise<void> {
    assert.ok(slot >= 0 && slot <= LAST_SLOT)
    const current = bot.inventory.slots[slot] ?? null
    if (current === null || item === null ? current === item : Item.equal(current, item, true)) return
    if (slot < FIRST_SLOT) throw new Error(`bot.creative.setInventorySlot: the creative inventory has no crafting grid, slot ${slot} of bot.inventory`)
    creativeMode('setInventorySlot')
    const made = item === null ? undefined : madeOf(slot, item)
    if (setting.has(slot)) throw new Error(`Setting slot ${slot} cancelled due to calling bot.creative.setInventorySlot(${slot}, ...) again`)
    setting.add(slot)
    try {
      await onInventoryScreen('setInventorySlot', async () => { await set('setInventorySlot', slot, made) })
    } finally {
      setting.delete(slot)
    }
  }

  function unsupported (member: string): Error {
    return new Error(`bot.creative.${member} is not supported on Bedrock yet`)
  }

  bot.creative = {
    setInventorySlot,
    clearSlot: async slot => { await setInventorySlot(slot, null) },
    clearInventory: async () => {
      const slots = bot.inventory.slots.flatMap((item, slot) => item !== null && slot >= FIRST_SLOT ? [slot] : [])
      if (slots.length === 0) return
      creativeMode('clearInventory')
      await onInventoryScreen('clearInventory', async () => { for (const slot of slots) await set('clearInventory', slot, undefined) })
    },
    flyTo: async () => { throw unsupported('flyTo') },
    startFlying: () => { throw unsupported('startFlying') },
    stopFlying: () => { throw unsupported('stopFlying') }
  }
}
