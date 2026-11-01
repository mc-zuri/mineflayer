import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { Vec3f } from '../modules/auth_input.ts'
import { stackAction } from '../modules/items.ts'
import { BEACON_PAYMENT, BEACON_SCREEN } from '../screens/beacon.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const MEMBER = 'setBeaconEffects'
/** the primary effects the screen's buttons choose, by Bedrock's effect ids */
const PRIMARY_EFFECTS: ReadonlyArray<readonly [string, number]> = Object.freeze([['speed', 1], ['haste', 3], ['resistance', 11], ['jump_boost', 8], ['strength', 5]])
/** the items that pay, the cheapest first */
const PAYMENTS: readonly string[] = Object.freeze(['iron_ingot', 'gold_ingot', 'emerald', 'diamond', 'netherite_ingot'])
/** the secondary effect besides the primary's level II, by Bedrock's effect id */
const REGENERATION: readonly [string, number] = Object.freeze(['regeneration', 10])
/** the blocks a beacon's pyramid is made of */
const BASES: readonly string[] = Object.freeze(['iron_block', 'gold_block', 'emerald_block', 'diamond_block', 'netherite_block'])
// the pyramid's levels the secondary effects need
const FULL_PYRAMID = 4
// the window's slot of the payment
const PAYMENT_SLOT = 0
// as recorded: no secondary effect
const NO_EFFECT = 0

/** The beacon's screen, and its confirm button (Java has no beacon helper). */
export default function beacon (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  /** the block of the beacon screen shown last, as container_open placed it: the one a confirm is made on */
  let shownAt: Vec3f = Object.freeze({ x: 0, y: 0, z: 0 })

  /** the vanilla client's full pyramid: under the beacon, a layer of the pyramid's blocks a block wider each way per level */
  function fullPyramid ({ x, y, z }: Vec3f): boolean {
    for (let level = 1; level <= FULL_PYRAMID; level++) {
      for (let bx = x - level; bx <= x + level; bx++) {
        for (let bz = z - level; bz <= z + level; bz++) {
          const block = bot.blockAt(new Vec3(bx, y - level, bz))
          if (block === null || !BASES.includes(block.name)) return false
        }
      }
    }
    return true
  }

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
  async function confirm (window: Window, primary: number, secondary: number): Promise<void> {
    if (secondary !== NO_EFFECT && !fullPyramid(shownAt)) {
      const { x, y, z } = shownAt
      throw new Error(`${MEMBER}: a secondary effect needs a pyramid of ${FULL_PYRAMID} levels, which the beacon at (${x}, ${y}, ${z}) has not`)
    }
    await putPayment(window)
    const action = stackAction(bot.version, 'beacon_payment', { primary_effect: primary, secondary_effect: secondary })
    await core.call(async ctx => { await inventory.request(core, ctx, [{ type: 'action', action }, { type: 'destroy', count: 1, from: BEACON_PAYMENT }]) })
  }

  inventory.screens.add(BEACON_SCREEN, { shown: ({ opening }) => { shownAt = opening.position } })

  /** the tier 4 buttons: regeneration, or the primary's level II, by the primary's id as Java's */
  function secondaryOf (secondary: string, [name, id]: readonly [string, number]): number {
    if (secondary === name) return id
    if (secondary === REGENERATION[0]) return REGENERATION[1]
    throw new Error(`${MEMBER}: no secondary effect is named ${secondary} (${REGENERATION[0]}, or the primary's level II: ${name})`)
  }

  bot.setBeaconEffects = async (primary, secondary, beaconBlock) => {
    const chosen = PRIMARY_EFFECTS.find(([name]) => name === primary)
    if (chosen === undefined) throw new Error(`${MEMBER}: no primary effect is named ${primary} (${PRIMARY_EFFECTS.map(([name]) => name).join(', ')})`)
    const [effect, second] = [chosen[1], secondary == null ? NO_EFFECT : secondaryOf(secondary, chosen)]
    const window = bot.currentWindow
    if (window !== null && inventory.screenType === 'beacon') return await confirm(window, effect, second)
    if (beaconBlock == null) throw new Error(`${MEMBER} needs a beacon open, or one given`)
    if (window !== null) throw new Error(`${MEMBER} cannot open the ${beaconBlock.name} over the ${window.type} window`)
    const opened = await bot.openBlock(beaconBlock)
    try {
      if (inventory.screenType !== 'beacon') throw new Error(`${MEMBER}: the ${beaconBlock.name} opened a ${opened.type} window`)
      await confirm(opened, effect, second)
    } catch (error) {
      await bot.closeWindow(opened).catch(() => {})
      throw error
    }
    await bot.closeWindow(opened)
  }
}
