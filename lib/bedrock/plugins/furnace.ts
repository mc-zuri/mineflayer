import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { Stack } from '../modules/items.ts'
import type { OpenScreen, ScreenHooks } from '../modules/screens.ts'
import { FURNACE_TYPES, furnaceScreen, isFuel } from '../screens/furnace.ts'
import type { FurnaceType } from '../screens/furnace.ts'
import type { Furnace } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// container_set_data's properties of a furnace screen
const COOK_TIME = 0
const LIT_TIME = 1
const LIT_DURATION = 2
// no packet tells a block's cook time
const COOK_TICKS: Readonly<Record<FurnaceType, number>> = Object.freeze({ furnace: 200, blast_furnace: 100, smoker: 100 })
const SECONDS_PER_TICK = 0.05
const INPUT_SLOT = 0
const FUEL_SLOT = 1
const OUTPUT_SLOT = 2

/** Java's furnace fields */
interface FurnaceFields {
  totalFuel: number
  fuel: number
  totalFuelSeconds: number
  fuelSeconds: number
  totalProgress: number
  progress: number
  totalProgressSeconds: number
  progressSeconds: number
}

/** from the screen's properties, 0 for one the server did not send */
function fieldsOf (type: FurnaceType, { properties }: OpenScreen): FurnaceFields {
  const valueOf = (property: number): number => properties.get(property) ?? 0
  const totalFuel = valueOf(LIT_DURATION)
  const fuel = totalFuel === 0 ? 0 : valueOf(LIT_TIME) / totalFuel
  const totalFuelSeconds = totalFuel * SECONDS_PER_TICK
  const totalProgress = COOK_TICKS[type]
  const progress = valueOf(COOK_TIME) / totalProgress
  const totalProgressSeconds = totalProgress * SECONDS_PER_TICK
  return {
    totalFuel,
    fuel,
    totalFuelSeconds,
    fuelSeconds: fuel * totalFuelSeconds,
    totalProgress,
    progress,
    totalProgressSeconds,
    // the time left, as Java's
    progressSeconds: totalProgressSeconds - progress * totalProgressSeconds
  }
}

/** a furnace screen's window has the members since it was shown */
function isFurnace (window: Window): window is Furnace {
  return FURNACE_TYPES.some(type => window.type === `minecraft:${type}`)
}

/** the furnace, blast furnace and smoker screens; bot.openFurnace, and Java's Furnace members on their windows */
export default function furnace (bot: BedrockBotInternal): void {
  const core = bot._core
  const itemName = ({ networkId }: Stack): string | undefined => bot.registry.items[networkId]?.name

  // Java clicks whatever window is open
  function needsOpen (member: string, window: Window): void {
    if (bot.currentWindow !== window) throw new Error(`${member} needs the ${window.type} window open`)
  }

  async function take (member: string, window: Window, slot: number): Promise<Item> {
    needsOpen(member, window)
    const item = window.slots[slot]
    assert.ok(item, `${member}: slot ${slot} of the ${window.type} window is empty`)
    await bot.putAway(item.slot)
    return item
  }

  async function put (member: string, window: Window, slot: number, itemType: number, metadata: number | null, count: number): Promise<void> {
    needsOpen(member, window)
    await bot.transfer({ window, itemType, metadata, count, sourceStart: window.inventoryStart, sourceEnd: window.inventoryEnd, destStart: slot, destEnd: slot + 1 })
  }

  function hooksOf (type: FurnaceType): ScreenHooks {
    return {
      shown: screen => {
        const { window } = screen
        Object.assign(window, fieldsOf(type, screen), {
          inputItem: () => window.slots[INPUT_SLOT],
          fuelItem: () => window.slots[FUEL_SLOT],
          outputItem: () => window.slots[OUTPUT_SLOT],
          takeInput: async () => await take('takeInput', window, INPUT_SLOT),
          takeFuel: async () => await take('takeFuel', window, FUEL_SLOT),
          takeOutput: async () => await take('takeOutput', window, OUTPUT_SLOT),
          putInput: async (itemType: number, metadata: number | null, count: number) => { await put('putInput', window, INPUT_SLOT, itemType, metadata, count) },
          putFuel: async (itemType: number, metadata: number | null, count: number) => {
            const name = bot.registry.items[itemType]?.name
            // the fuel slot takes nothing else: the transfer's clicks would only put it back
            if (name !== undefined && !isFuel(name)) throw new Error(`putFuel: ${name} is not a fuel`)
            await put('putFuel', window, FUEL_SLOT, itemType, metadata, count)
          }
        })
      },
      data: (_property, _value, screen) => {
        Object.assign(screen.window, fieldsOf(type, screen))
        core.emitWindow(screen.window, 'update', [])
      }
    }
  }

  for (const type of FURNACE_TYPES) bot._inventory.screens.add(furnaceScreen(type, itemName), hooksOf(type))

  bot.openFurnace = async block => {
    const window = await bot.openBlock(block)
    if (!isFurnace(window)) throw new Error('This is not a furnace-like window')
    return window
  }
}
