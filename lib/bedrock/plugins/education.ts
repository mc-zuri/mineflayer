import { clickMoves } from '../modules/clicks.ts'
import type { ClickedSlots, WindowClick } from '../modules/clicks.ts'
import type { Move } from '../modules/inventory.ts'
import { createAction, resultsAction, stackAction, withCount } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { Ingredients, writtenResult } from '../modules/recipes.ts'
import type { Ingredient } from '../modules/recipes.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import { COMPOUND_CREATOR_SCREEN } from '../screens/compound_creator.ts'
import { ELEMENT_CONSTRUCTOR_SCREEN } from '../screens/element_constructor.ts'
import { LAB_TABLE_INPUTS, LAB_TABLE_SCREEN } from '../screens/lab_table.ts'
import { MATERIAL_REDUCER_INPUT, MATERIAL_REDUCER_OUTPUTS, materialReducerScreen } from '../screens/material_reducer.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { MCProtocol } from '../../types/protocol/Bedrock.d.ts'

type ReadItem = MCProtocol.Bedrock.Read.Types.Item

const OWNER = 'education'
// crafting_data's metadata of any
const ANY = 32767

/** crafting_data's material reducer recipe: what one item of the ingredient reduces to, a stack each */
interface Reduction {
  readonly ingredient: Ingredient
  readonly items: ReadonlyArray<{ readonly network_id: number, readonly count: number }>
}

/** a transaction of no action, which the vanilla client sends after destroying the reducer's outputs, in the version's layout */
function inventoryMismatch (version: BedrockVersion): BedrockServerboundPackets['inventory_transaction'] {
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.16.210')) return { transaction: { legacy_request_id: 0, transaction_type: 'inventory_mismatch', network_ids: false, inventory_actions: [] } }
  // 1.16.210 says whether the actions name items by network id
  const actions = isBedrockVersionAtLeast(version, 'bedrock_1.16.220') ? [] : { network_ids: false, actions: [] }
  return { transaction: { legacy: { legacy_request_id: 0 }, transaction_type: 'inventory_mismatch', actions } }
}

/**
 * The Education screens: the compound creator, the element constructor, the material reducer and the lab table, their
 * slots in the `ui` window or the table's own, as the vanilla client named them on an Education world; the reducer's
 * reduction made by the click putting an item in it, and Bedrock's members for the compound and the table's combine.
 */
export default function education (bot: BedrockBotInternal): void {
  const core = bot._core
  const inventory = bot._inventory
  const { version } = bot
  const ingredients = new Ingredients(bot.registry, version)
  let reductions: Reduction[] = []
  let mismatchDue = false

  core.observe(OWNER, 'crafting_data', packet => {
    if ((packet.clear_recipes ?? packet.is_clean) === true) reductions = []
    // the mix is the network id over the metadata's 16 bits
    for (const { mix, items } of packet.material_reducers ?? []) {
      const metadata = mix & 0xffff
      reductions.push({ ingredient: { count: 1, accepted: { kind: 'id', networkId: mix >> 16, metadata: metadata === ANY ? undefined : metadata }, written: undefined }, items })
    }
  })

  /** the state a block's item places: its block's first, as the elements' one; 0 for an item no block's */
  function blockRuntimeIdOf (networkId: number): number {
    const name = ingredients.nameOf(networkId)
    const state = bot.registry.blockStates?.find(state => state.name === name)
    // the ids start_game numbered the palette with, which minecraft-data's typings do not give
    return state === undefined ? 0 : Number(Reflect.get(state, 'stateId'))
  }

  /** an item as the vanilla client makes it: no NBT, an aux value up to 1.16.210, which withCount writes */
  function made (networkId: number, count: number, metadata: number): Stack {
    const extra = { has_nbt: 0, can_place_on: [], can_destroy: [] }
    const wire: ReadItem = isBedrockVersionAtLeast(version, 'bedrock_1.16.220')
      ? { network_id: networkId, count, metadata, has_stack_id: 0, block_runtime_id: blockRuntimeIdOf(networkId), extra }
      : { network_id: networkId, auxiliary_value: 0, ...extra }
    return withCount({ networkId, count, metadata, stackId: 0, wire }, count)
  }

  /**
   * A click putting an item in the empty input reduces one of it, in the click's request, as recorded: the stacks of
   * the first recipe taking it made and taken to the outputs, which must be empty, then the item placed; else the click's
   * own moves, none where the input would take another item or more than one.
   */
  function reducerMoves (click: WindowClick, clicked: SlotRef | undefined, slots: ClickedSlots): readonly Move[] {
    const moves = clickMoves(click, clicked, slots)
    if (!moves.some(move => 'to' in move && move.to.container === MATERIAL_REDUCER_INPUT.container)) return moves
    const [placed] = moves
    if (placed?.type !== 'place' || slots.stackAt(MATERIAL_REDUCER_INPUT) !== undefined) return []
    const source = slots.stackAt(placed.from)
    const reduction = reductions.find(({ ingredient }) => source !== undefined && ingredients.matches(ingredient, source))
    const results = reduction?.items.map(({ network_id: networkId, count }) => made(networkId, count, 0)) ?? []
    if (results.length === 0 || results.length > MATERIAL_REDUCER_OUTPUTS.length || MATERIAL_REDUCER_OUTPUTS.some(ref => slots.stackAt(ref) !== undefined)) return []
    return [
      { type: 'action', action: stackAction(version, 'non_implemented', {}) },
      { type: 'action', action: resultsAction(version, results.map(result => writtenResult(ingredients, version, result)), 1) },
      ...results.flatMap((result, index): Move[] => [
        { type: 'action', action: createAction(version, index), output: result },
        { type: 'take', count: result.count, from: OUTPUT, to: { container: 'matreduce_output', slot: 41 + index } }
      ]),
      { ...placed, count: 1 }
    ]
  }

  inventory.screens.add(COMPOUND_CREATOR_SCREEN)
  inventory.screens.add(ELEMENT_CONSTRUCTOR_SCREEN)
  inventory.screens.add(LAB_TABLE_SCREEN)
  // only its close destroys
  inventory.screens.add(materialReducerScreen(reducerMoves), {
    requested: (_requestId, moves) => {
      if (moves.some(move => move.type === 'destroy')) mismatchDue = true
    }
  })
  // in the tick, after the requests destroying the outputs left (recorded)
  core.system(OWNER, {
    name: 'education.mismatch',
    place: { after: 'inventory.request' },
    gate: 'always',
    replay: false,
    run: ({ outbox }) => {
      if (!mismatchDue) return
      mismatchDue = false
      outbox.queue('inventory_transaction', inventoryMismatch(version))
    }
  })

  /** the compound of the metadata, a stack of it taken from the open compound creator's output to the cursor, as recorded */
  async function createCompound (compound: number): Promise<void> {
    if (!Number.isInteger(compound) || compound < 0) throw new Error(`createCompound: ${compound} is not a compound's metadata`)
    await core.call(async ctx => {
      if (inventory.screenType !== COMPOUND_CREATOR_SCREEN.type) throw new Error('createCompound needs an open compound creator')
      if (inventory.stackAt(CURSOR) !== undefined) throw new Error('createCompound needs an empty cursor')
      const item = bot.registry.itemsByName['compound']
      const result = made(Number(item?.id), Number(item?.stackSize), compound)
      await inventory.request(core, ctx, [
        { type: 'action', action: stackAction(version, 'non_implemented', {}), output: result },
        { type: 'action', action: resultsAction(version, [writtenResult(ingredients, version, result)], 1) },
        { type: 'take', count: result.count, from: OUTPUT, to: CURSOR }
      ])
    })
  }

  /** the open lab table's combine, which destroys its items, as recorded; the vanilla client's screen then closes */
  async function combineLabTable (): Promise<void> {
    await core.call(async ctx => {
      const window = bot.currentWindow
      if (window === null || inventory.screenType !== LAB_TABLE_SCREEN.type) throw new Error('combineLabTable needs an open lab table')
      const used = LAB_TABLE_INPUTS.flatMap((from): Move[] => {
        const stack = inventory.stackAt(from)
        return stack === undefined ? [] : [{ type: 'destroy', count: stack.count, from }]
      })
      if (used.length === 0) throw new Error('combineLabTable needs items in the lab table')
      const combined = inventory.request(core, ctx, [{ type: 'action', action: stackAction(version, 'lab_table_combine', {}) }, ...used])
      await Promise.all([combined, bot.closeWindow(window)])
    })
  }

  bot.bedrock = {
    ...bot.bedrock,
    createCompound,
    combineLabTable
  }
}
