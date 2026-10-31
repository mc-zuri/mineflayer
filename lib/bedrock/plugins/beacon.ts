import type { Window } from 'prismarine-windows'
import { stackAction } from '../modules/items.ts'
import { BEACON_PAYMENT, BEACON_SCREEN } from '../screens/beacon.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const MEMBER = 'setBeaconEffects'
/** the primary effects the screen's buttons choose, by Bedrock's effect ids */
const PRIMARY_EFFECTS: ReadonlyArray<readonly [string, number]> = Object.freeze([['speed', 1], ['haste', 3], ['resistance', 11], ['jump_boost', 8], ['strength', 5]])
/** the items that pay, the cheapest first */
const PAYMENTS: readonly string[] = Object.freeze(['iron_ingot', 'gold_ingot', 'emerald', 'diamond', 'netherite_ingot'])
// the window's slot of the payment
const PAYMENT_SLOT = 0
// as recorded: no secondary effect
const NO_EFFECT = 0

/** The beacon's screen, and its confirm button (Java has no beacon helper). */
export default function beacon (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory

  /** the vanilla client's take and place of one payment of the inventory part, when the slot holds none */
  async function putPayment (window: Window): Promise<void> {
    const held = window.slots[PAYMENT_SLOT]
    if (held != null) {
      if (!PAYMENTS.includes(held.name)) throw new Error(`${MEMBER}: the beacon's payment slot holds ${held.name}, which pays for no effect`)
      return
    }
    const items = window.items()
    const [payment] = PAYMENTS.flatMap(name => items.filter(item => item.name === name))
    if (payment === undefined) throw new Error(`${MEMBER}: the inventory has nothing to pay with (${PAYMENTS.join(', ')})`)
    await bot.transfer({ window, itemType: payment.type, metadata: null, count: 1, sourceStart: window.inventoryStart, sourceEnd: window.inventoryEnd, destStart: PAYMENT_SLOT, destEnd: PAYMENT_SLOT + 1 })
  }

  /** the confirm button: one request, made in the input pass, which uses the payment up */
  async function confirm (window: Window, primary: number): Promise<void> {
    await putPayment(window)
    const action = stackAction(bot.version, 'beacon_payment', { primary_effect: primary, secondary_effect: NO_EFFECT })
    await core.call(async ctx => { await inventory.request(core, ctx, [{ type: 'action', action }, { type: 'destroy', count: 1, from: BEACON_PAYMENT }]) })
  }

  inventory.screens.add(BEACON_SCREEN)

  bot.setBeaconEffects = async (primary, secondary, beaconBlock) => {
    const effect = PRIMARY_EFFECTS.find(([name]) => name === primary)?.[1]
    if (effect === undefined) throw new Error(`${MEMBER}: no primary effect is named ${primary} (${PRIMARY_EFFECTS.map(([name]) => name).join(', ')})`)
    if (secondary != null) throw new Error(`${MEMBER}: a secondary effect is not supported on Bedrock, which no recording chose`)
    const window = bot.currentWindow
    if (window !== null && inventory.screenType === 'beacon') return await confirm(window, effect)
    if (beaconBlock == null) throw new Error(`${MEMBER} needs a beacon open, or one given`)
    if (window !== null) throw new Error(`${MEMBER} cannot open the ${beaconBlock.name} over the ${window.type} window`)
    const opened = await bot.openBlock(beaconBlock)
    try {
      if (inventory.screenType !== 'beacon') throw new Error(`${MEMBER}: the ${beaconBlock.name} opened a ${opened.type} window`)
      await confirm(opened, effect)
    } catch (error) {
      await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    await bot.closeWindow(opened)
  }
}
