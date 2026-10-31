import type { Entity } from 'prismarine-entity'
import prismarineItem from 'prismarine-item'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { FrameContext } from '../core/types.ts'
import { HOTBAR_AND_INVENTORY, placesFor } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { craftRecipeAction, resultsAction, sameItem } from '../modules/items.ts'
import type { SlotRef } from '../modules/items.ts'
import { Ingredients, writtenResult } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { OpenScreen } from '../modules/screens.ts'
import { matches, readOffers } from '../modules/trades.ts'
import type { Offer, TradeItem } from '../modules/trades.ts'
import { TRADE_INGREDIENTS, TRADING_SCREEN } from '../screens/trading.ts'
import type { BedrockVillager, BedrockVillagerTrade } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const OWNER = 'villager'
/** the entities whose use opens the trading screen, as bot.entities names them */
const TRADERS: readonly string[] = Object.freeze(['villager_v2', 'villager', 'wandering_trader'])
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })
const NONE = -1
const [FIRST, SECOND] = TRADE_INGREDIENTS
const RESULT_SLOT = 2

interface Entry {
  readonly offer: Offer
  readonly trade: BedrockVillagerTrade
}

/** the trading screen shown */
interface Trading {
  readonly id: string
  readonly window: BedrockVillager
  readonly trader: Entity | undefined
  entries: readonly Entry[]
  /** the trade the screen shows selected, NONE before the first */
  selected: number
}

/** what update_trade opens the screen with */
interface Opening {
  readonly offers: readonly Offer[]
  readonly title: string
  readonly trader: Entity | undefined
}

/** Java's villager plugin: the trading screen update_trade opens, its trades, and trading by its result's clicks */
export default function villager (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version, registry } = bot
  const ItemClass = prismarineItem(registry)
  const ingredients = new Ingredients(registry, version)
  let opening: Opening | undefined
  let trading: Trading | undefined

  function itemOf ({ stack: { networkId, count, metadata }, nbt }: TradeItem): Item {
    return new ItemClass(networkId, count, metadata, nbt, 0, true)
  }

  function tradeOf ({ buyA, buyB, sell, countA, uses, maxUses, tier, traderExp, demand, priceMultiplierA }: Offer): BedrockVillagerTrade {
    const [inputItem1, outputItem] = [itemOf(buyA), itemOf(sell)]
    const inputItem2 = buyB === undefined ? null : itemOf(buyB)
    const inputs = inputItem2 === null ? [inputItem1] : [inputItem1, inputItem2]
    return {
      inputItem1,
      outputItem,
      inputItem2,
      hasItem2: inputItem2 !== null,
      tradeDisabled: uses >= maxUses,
      nbTradeUses: uses,
      maximumNbTradeUses: maxUses,
      xp: traderExp,
      priceMultiplier: priceMultiplierA,
      demand,
      realPrice: countA,
      inputs,
      outputs: [outputItem],
      tier
    }
  }

  function entriesOf (offers: readonly Offer[]): Entry[] {
    return offers.map(offer => ({ offer, trade: tradeOf(offer) }))
  }

  function show ({ opening: { id }, window: shown }: OpenScreen): void {
    // container_open opens it with no trades
    const { offers, title, trader } = opening ?? { offers: [], title: shown.title, trader: undefined }
    const entries = entriesOf(offers)
    // the windows plugin gave it close (screens.onShown) before this
    const window = Object.assign(shown as BedrockVillager, {
      trades: entries.map(({ trade }) => trade),
      selectedTrade: null,
      selectTrade: async (index: number) => { await core.call(async ctx => { await select(ctx, state, index) }) },
      trade: async (index: string | number, times?: number) => { await bot.trade(window, index, times) }
    })
    window.title = title
    const state: Trading = { id: String(id), window, trader, entries, selected: NONE }
    trading = state
  }

  function replace (state: Trading, offers: readonly Offer[]): void {
    state.entries = entriesOf(offers)
    state.window.trades = state.entries.map(({ trade }) => trade)
    state.window.selectedTrade = state.entries[state.selected]?.trade ?? null
  }

  /** the vanilla client's click on a trade: the ingredient slots' stacks back to the inventory, then the trade's items from it, a stack's worth each */
  async function select (ctx: FrameContext, state: Trading, index: number): Promise<void> {
    if (trading !== state) throw new Error('selectTrade needs the villager\'s window open')
    const entry = state.entries[index]
    if (entry === undefined) throw new Error(`the villager has no trade ${index}`)
    state.selected = index
    state.window.selectedTrade = entry.trade
    const draft = inventory.draft()
    const moves: Move[] = []
    const move = (made: Move): void => {
      draft.apply([made])
      moves.push(made)
    }
    for (const from of TRADE_INGREDIENTS) {
      const stack = draft.stackAt(from)
      if (stack !== undefined) for (const { to, count } of placesFor(stack, HOTBAR_AND_INVENTORY, draft)) move({ type: 'place', count, from, to })
    }
    const wanted: ReadonlyArray<readonly [TradeItem | undefined, SlotRef]> = [[entry.offer.buyA, FIRST], [entry.offer.buyB, SECOND]]
    for (const [item, to] of wanted) {
      if (item === undefined) continue
      for (const from of HOTBAR_AND_INVENTORY) {
        const [stack, held] = [draft.stackAt(from), draft.stackAt(to)]
        const room = held === undefined ? draft.stackSize(item.stack) : sameItem(held, item.stack) ? draft.stackSize(held) - held.count : 0
        if (room <= 0) break
        if (stack !== undefined && matches(stack, item)) move({ type: 'place', count: Math.min(room, stack.count), from, to })
      }
    }
    await Promise.all(moves.map(made => inventory.request(core, ctx, [made])))
  }

  /** a mouse click on the result trades once, to the cursor, while the ingredient slots hold the price and the cursor has room */
  async function take (ctx: FrameContext, { mode }: WindowClick): Promise<void> {
    if (mode !== 0) throw new Error(`clickWindow: on Bedrock the trading result takes a mouse click only, not mode ${mode}`)
    const entry = trading?.entries[trading.selected]
    if (entry === undefined || entry.trade.tradeDisabled) return
    const { offer, trade } = entry
    const draft = inventory.draft()
    const holds = (wanted: TradeItem, from: SlotRef, count: number): boolean => {
      const stack = draft.stackAt(from)
      return stack !== undefined && matches(stack, wanted) && stack.count >= count
    }
    if (!holds(offer.buyA, FIRST, offer.countA) || (offer.buyB !== undefined && !holds(offer.buyB, SECOND, offer.countB))) return
    const sell = offer.sell.stack
    const cursor = draft.stackAt(CURSOR)
    if (cursor !== undefined && (!sameItem(cursor, sell) || cursor.count + sell.count > draft.stackSize(cursor))) return
    await inventory.request(core, ctx, [
      { type: 'action', action: craftRecipeAction(version, offer.netId, 1), output: sell },
      { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, sell)], 1) },
      { type: 'consume', count: offer.countA, from: FIRST },
      ...offer.buyB === undefined ? [] : [{ type: 'consume' as const, count: offer.countB, from: SECOND }],
      { type: 'take', count: sell.count, from: OUTPUT, to: CURSOR }
    ])
    // the server sends the offers again only when they change otherwise (recorded)
    trade.nbTradeUses++
    trade.tradeDisabled = trade.nbTradeUses >= trade.maximumNbTradeUses
  }

  /** what the window's ingredient slots, its inventory part and the cursor hold of the item */
  function holding (wanted: TradeItem): number {
    return [...TRADE_INGREDIENTS, ...HOTBAR_AND_INVENTORY, CURSOR].reduce((sum, ref) => {
      const stack = inventory.stackAt(ref)
      return stack !== undefined && matches(stack, wanted) ? sum + stack.count : sum
    }, 0)
  }

  /** Java's: the ingredient slots topped up to a trade's price from the window's inventory part */
  async function putRequirements (window: Window, { buyA, buyB, countA, countB }: Offer): Promise<void> {
    const required: ReadonlyArray<readonly [TradeItem | undefined, number, number]> = [[buyA, 0, countA], [buyB, 1, countB]]
    for (const [wanted, slot, count] of required) {
      const missing = count - (window.slots[slot]?.count ?? 0)
      if (wanted === undefined || missing <= 0) continue
      await bot.transfer({
        window,
        itemType: wanted.stack.networkId,
        metadata: wanted.metadata ?? null,
        count: missing,
        sourceStart: window.inventoryStart,
        sourceEnd: window.inventoryEnd,
        destStart: slot,
        destEnd: slot + 1
      })
    }
  }

  inventory.screens.add(TRADING_SCREEN, {
    shown: show,
    output: async (ctx, click) => { await take(ctx, click) },
    closed: () => { trading = undefined }
  })
  // another screen shown is not the trading one
  inventory.screens.onShown(() => { trading = undefined })

  core.handle(OWNER, 'update_trade', (packet, ctx) => {
    const offers = readOffers(registry, version, packet.offers)
    const open = trading
    if (open !== undefined && open.id === String(packet.window_id)) return replace(open, offers)
    const trader = bot._entities.byUniqueId(packet.villager_unique_id)
    opening = { offers, title: JSON.stringify({ translate: packet.display_name }), trader }
    inventory.openScreen(core, ctx, { id: packet.window_id, type: packet.window_type, position: ORIGIN, entity: trader === undefined ? -1n : BigInt(trader.id) })
    opening = undefined
    const shown = trading
    if (shown === open || shown === undefined) return
    core.emitWindow(shown.window, 'ready', [])
    // the vanilla client puts the first trade's items in at once (a screen without trades has none to select)
    core.command(ctx => { select(ctx, shown, 0).catch(() => {}) })
  })

  // the vanilla client closes the screen as its trader dies
  bot.on('entityDead', entity => {
    if (trading !== undefined && entity === trading.trader) bot.closeWindow(trading.window).catch(() => {})
  })

  bot.openVillager = async entity => {
    const name = String(entity.name)
    if (!TRADERS.includes(name)) throw new Error(`openVillager: a ${name} does not trade`)
    const window = await bot._entityUse.open(core, entity)
    // the trading screen, if shown, is the one open
    if (trading === undefined) throw new Error(`openVillager: the server opened a ${window.type} window, not the ${name}'s`)
    return trading.window
  }

  bot.trade = async (villager, tradeIndex, times) => {
    const state = trading
    if (state?.window !== villager) throw new Error('trade needs the villager\'s window open')
    const choice = parseInt(String(tradeIndex), 10)
    const entry = state.entries[choice]
    if (entry === undefined) throw new Error(`the villager has no trade ${String(tradeIndex)}`)
    const { offer, trade } = entry
    const left = trade.maximumNbTradeUses - trade.nbTradeUses
    // Java's: none or 0 is every use left
    const count = times === undefined || times === 0 ? left : times
    if (left <= 0) throw new Error('trade blocked')
    if (count > left) throw new Error(`trade ${choice} has ${left} uses left, not ${count}`)
    if (holding(offer.buyA) < offer.countA * count) throw new Error('Not enough item 1 to trade')
    if (offer.buyB !== undefined && holding(offer.buyB) < offer.countB * count) throw new Error('Not enough item 2 to trade')
    const { inventoryStart: start, inventoryEnd: end } = villager
    // the result is taken to the cursor
    if (villager.selectedItem !== null) await bot.putSelectedItemRange(start, end, villager, null)
    await villager.selectTrade(choice)
    for (let traded = 0; traded < count; traded++) {
      await putRequirements(villager, offer)
      await bot.putAway(RESULT_SLOT)
    }
    for (const slot of [0, 1]) if (villager.slots[slot] != null) await bot.putAway(slot)
  }
}
