import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { OpenScreen } from '../modules/screens.ts'
import { BREWING_STAND_SCREEN } from '../screens/brewing_stand.ts'
import type { BedrockBrewingStand } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// container_set_data's properties of the stand
const BREW_TIME = 0
const FUEL = 1
const FUEL_TOTAL = 2
// the window's slots
const BOTTLE_SLOTS: readonly number[] = Object.freeze([0, 1, 2])
const INGREDIENT_SLOT = 3
const FUEL_SLOT = 4

/** what the plugin adds to the screen's window: windows.ts gives its close, the properties are the screen's */
type Members = Omit<BedrockBrewingStand, keyof Window | 'close' | 'brewTime' | 'fuel' | 'fuelTotal'>

function isBrewingStand (window: Window): window is BedrockBrewingStand {
  return 'brewTime' in window
}

/** The brewing stand's screen, and a window of Java's furnace's kind for it (Java has no brewing helper). */
export default function brewingStand (bot: BedrockBotInternal): void {
  const core = bot._core

  function bottleSlot (member: string, bottle: number): number {
    const slot = BOTTLE_SLOTS[bottle]
    if (slot === undefined) throw new Error(`${member}: the brewing stand has the bottles 0, 1 and 2, not ${bottle}`)
    return slot
  }

  /** Java's furnace's: a transfer from the window's inventory part */
  async function put (window: Window, slot: number, itemType: number, metadata: number | null, count: number): Promise<void> {
    await bot.transfer({ window, itemType, metadata, count, sourceStart: window.inventoryStart, sourceEnd: window.inventoryEnd, destStart: slot, destEnd: slot + 1 })
  }

  /** Java's furnace's: putAway, which clicks the screen open */
  async function take (member: string, window: Window, slot: number): Promise<Item> {
    if (window !== bot.currentWindow) throw new Error(`${member} needs the brewing stand open`)
    const item = window.slots[slot]
    if (item == null) throw new Error(`${member}: the brewing stand's slot ${slot} is empty`)
    await bot.putAway(slot)
    return item
  }

  /** its window before windowOpen: the properties as the screen has them, those sent before its opening too */
  function extend ({ window, properties }: OpenScreen): void {
    const told = (property: number): PropertyDescriptor => ({ get: () => properties.get(property) ?? null })
    Object.defineProperties(window, { brewTime: told(BREW_TIME), fuel: told(FUEL), fuelTotal: told(FUEL_TOTAL) })
    const members: Members = {
      potionItems: () => BOTTLE_SLOTS.map(slot => window.slots[slot] ?? null),
      ingredientItem: () => window.slots[INGREDIENT_SLOT] ?? null,
      fuelItem: () => window.slots[FUEL_SLOT] ?? null,
      putPotion: async (bottle, itemType, metadata) => { await put(window, bottleSlot('putPotion', bottle), itemType, metadata, 1) },
      putIngredient: async (itemType, metadata, count) => { await put(window, INGREDIENT_SLOT, itemType, metadata, count) },
      putFuel: async (itemType, metadata, count) => { await put(window, FUEL_SLOT, itemType, metadata, count) },
      takePotion: async bottle => await take('takePotion', window, bottleSlot('takePotion', bottle)),
      takePotions: async () => {
        const taken: Item[] = []
        for (const slot of BOTTLE_SLOTS) if (window.slots[slot] != null) taken.push(await take('takePotions', window, slot))
        return taken
      },
      takeIngredient: async () => await take('takeIngredient', window, INGREDIENT_SLOT),
      takeFuel: async () => await take('takeFuel', window, FUEL_SLOT)
    }
    Object.assign(window, members)
  }

  bot._inventory.screens.add(BREWING_STAND_SCREEN, {
    shown: extend,
    data: (_property, _value, { window }) => { core.emitWindow(window, 'update', []) }
  })

  bot.openBrewingStand = async block => {
    const window = await bot.openBlock(block)
    if (isBrewingStand(window)) return window
    await bot.closeWindow(window)
    throw new Error(`openBrewingStand: the ${block.name} opened a ${window.type} window`)
  }
}
