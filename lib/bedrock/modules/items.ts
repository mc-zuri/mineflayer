import type { Item } from 'prismarine-item'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { MCProtocol } from '../../types/protocol/Bedrock.d.ts'

type ReadItem = MCProtocol.Bedrock.Read.Types.Item
type ReadItemV4 = MCProtocol.Bedrock.Read.Types.ItemV4
type ReadItemStack = MCProtocol.Bedrock.Read.Types.ItemStack
type ReadResponses = MCProtocol.Bedrock.Read.Types.ItemStackResponses
type WriteItem = MCProtocol.Bedrock.Write.Types.Item | MCProtocol.Bedrock.Write.Types.ItemV4
type SlotInfo = MCProtocol.Bedrock.Write.Types.StackRequestSlotInfo
export type StackRequest = MCProtocol.Bedrock.Write.Types.ItemStackRequest
type StackAction = StackRequest['actions'][number]

export interface Stack {
  readonly networkId: number
  readonly count: number
  readonly metadata: number
  /** the server's stack net id, or the id of the pending request that made the stack */
  readonly stackId: number
  /** written back as the server sent it, but for the count */
  readonly wire: ReadItem | ReadItemV4
}

/** every container a request names, of every version: the codec writes the names, which 1.19.50 renumbered */
export type ContainerName = Exclude<MCProtocol.Bedrock.Write.Types.ContainerSlotType, number>

export interface SlotRef {
  readonly container: ContainerName
  readonly slot: number
}

export type ActionType = 'take' | 'place' | 'swap' | 'drop' | 'destroy' | 'consume' | 'create' | 'lab_table_combine' | 'beacon_payment' | 'mine_block' |
  'craft_recipe' | 'craft_recipe_auto' | 'craft_creative' | 'optional' | 'craft_grindstone_request' | 'craft_loom_request' | 'non_implemented' | 'results_deprecated'

/** the types as 1.18.11 – 1.26.30 numbered them, which 1.26.40 writes again after the type */
const LEGACY_TYPE_IDS: Readonly<Record<ActionType, number>> = Object.freeze({
  take: 0,
  place: 1,
  swap: 2,
  drop: 3,
  destroy: 4,
  consume: 5,
  create: 6,
  lab_table_combine: 9,
  beacon_payment: 10,
  mine_block: 11,
  craft_recipe: 12,
  craft_recipe_auto: 13,
  craft_creative: 14,
  optional: 15,
  craft_grindstone_request: 16,
  craft_loom_request: 17,
  non_implemented: 18,
  results_deprecated: 19
})
// 1.26.60's craft_reserved comes before these
const RESERVED_BEFORE = LEGACY_TYPE_IDS.non_implemented

/** Mojang's names: the protocol names only ok and error */
const STACK_RESULTS = Object.freeze([
  'Success', 'Error', 'InvalidRequestActionType', 'ActionRequestNotAllowed', 'ScreenHandlerEndRequestFailed',
  'ItemRequestActionHandlerCommitFailed', 'InvalidRequestCraftActionType', 'InvalidCraftRequest', 'InvalidCraftRequestScreen',
  'InvalidCraftResult', 'InvalidCraftResultIndex', 'InvalidCraftResultItem', 'InvalidItemNetId', 'MissingCreatedOutputContainer',
  'FailedToSetCreatedItemOutputSlot', 'RequestAlreadyInProgress', 'FailedToInitSparseContainer', 'ResultTransferFailed',
  'ExpectedItemSlotNotFullyConsumed', 'ExpectedAnywhereItemNotFullyConsumed', 'ItemAlreadyConsumedFromSlot',
  'ConsumedTooMuchFromSlot', 'MismatchSlotExpectedConsumedItem', 'MismatchSlotExpectedConsumedItemNetIdVariant',
  'FailedToMatchExpectedSlotConsumedItem', 'FailedToMatchExpectedAllowedAnywhereConsumedItem', 'ConsumedItemOutOfAllowedSlotRange',
  'ConsumedItemNotAllowed', 'PlayerNotInCreativeMode', 'InvalidExperimentalRecipeRequest', 'FailedToCraftCreative',
  'FailedToGetLevelRecipe', 'FailedToFindRecipeByNetId', 'MismatchedCraftingSize', 'MissingInputSparseContainer',
  'MismatchedRecipeForInputGridItems', 'EmptyCraftResults', 'FailedToEnchant', 'MissingInputItem',
  'InsufficientPlayerLevelToEnchant', 'MissingMaterialItem', 'MissingActor', 'UnknownPrimaryEffect', 'PrimaryEffectOutOfRange',
  'PrimaryEffectUnavailable', 'SecondaryEffectOutOfRange', 'SecondaryEffectUnavailable', 'DstContainerEqualToCreatedOutputContainer',
  'DstContainerAndSlotEqualToSrcContainerAndSlot', 'FailedToValidateSrcSlot', 'FailedToValidateDstSlot', 'InvalidAdjustedAmount',
  'InvalidItemSetType', 'InvalidTransferAmount', 'CannotSwapItem', 'CannotPlaceItem', 'UnhandledItemSetType', 'InvalidRemovedAmount',
  'InvalidRegion', 'CannotDropItem', 'CannotDestroyItem', 'InvalidSourceContainer', 'ItemNotConsumed', 'InvalidNumCrafts',
  'InvalidCraftResultStackSize', 'CannotRemoveItem', 'CannotConsumeItem', 'ScreenStackError'
])

const EMPTY_ITEM_V4 = Object.freeze({ network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 })

function stackIdOf (stackId: ReadItem['stack_id'] | ReadItemV4['stack_id']): number {
  return typeof stackId === 'object' ? stackId.id : stackId ?? 0
}

export function readStack (item: ReadItemStack | ReadItem | ReadItemV4): Stack | undefined {
  const [wire, stackId] = 'item' in item ? [item.item, Number(item.runtime_id ?? item.stack_id)] : [item, stackIdOf(item.stack_id)]
  if (wire.network_id === 0) return undefined
  if ('auxiliary_value' in wire && wire.auxiliary_value !== undefined) {
    return { networkId: wire.network_id, count: wire.auxiliary_value & 0xff, metadata: wire.auxiliary_value >> 8, stackId, wire }
  }
  return { networkId: wire.network_id, count: Number(wire.count), metadata: Number(wire.metadata), stackId, wire }
}

export function withCount (stack: Stack, count: number): Stack {
  const { wire } = stack
  if ('auxiliary_value' in wire && wire.auxiliary_value !== undefined) return { ...stack, count, wire: { ...wire, auxiliary_value: (stack.metadata << 8) | count } }
  return { ...stack, count, wire: { ...wire, count } }
}

function extraOf (wire: ReadItem | ReadItemV4): Pick<ReadItem, 'nbt' | 'can_place_on' | 'can_destroy'> | undefined {
  return 'auxiliary_value' in wire ? wire : wire.extra
}

function kindOf ({ networkId, metadata, wire }: Stack): Array<number | undefined> {
  return [networkId, metadata, 'block_runtime_id' in wire ? wire.block_runtime_id : 0]
}

/** two stacks of one item stack together */
function identityOf (stack: Stack): string {
  const extra = extraOf(stack.wire)
  // an empty compound is none: the decorated pot's multi recipe makes pots with one, which stack onto those without
  const nbt = Object.keys(extra?.nbt?.nbt.value ?? {}).length === 0 ? undefined : extra?.nbt
  return JSON.stringify([...kindOf(stack), nbt, extra?.can_place_on, extra?.can_destroy])
}

export function sameItem (a: Stack, b: Stack): boolean {
  return identityOf(a) === identityOf(b)
}

/** the vanilla client tells a new item in the hand by these, not by its NBT */
export function sameKind (a: Stack, b: Stack): boolean {
  return kindOf(a).every((value, index) => value === kindOf(b)[index])
}

export function itemOf (ItemClass: typeof Item, stack: Stack | undefined): Item | null {
  if (stack === undefined) return null
  return new ItemClass(stack.networkId, stack.count, stack.metadata, extraOf(stack.wire)?.nbt?.nbt, stack.stackId, true)
}

/** the vanilla client tells what it holds without a stack id */
export function heldItemOf (version: BedrockVersion, stack: Stack | undefined): WriteItem {
  return heldItem(isBedrockVersionAtLeast(version, 'bedrock_1.26.20'), stack)
}

/** a held item as an ItemV4 or an Item, whichever the packet has */
export function heldItem (v4: boolean, stack: Stack | undefined): WriteItem {
  if (stack === undefined) return v4 ? EMPTY_ITEM_V4 : { network_id: 0 }
  const { networkId, count, metadata, wire } = stack
  if (!('block_runtime_id' in wire) || wire.block_runtime_id === undefined) return wire
  const { block_runtime_id: blockRuntimeId, extra } = wire
  if (v4) return { network_id: networkId, count, metadata, has_stack_id: false, block_runtime_id: blockRuntimeId, extra }
  return { network_id: networkId, count, metadata, has_stack_id: 0, block_runtime_id: blockRuntimeId, extra }
}

export function slotInfo (version: BedrockVersion, { container, slot }: SlotRef, stackId: number): SlotInfo {
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  if (!atLeast('bedrock_1.16.210')) return { container_id: container, slot_id: slot, stack_id: stackId }
  if (!atLeast('bedrock_1.21.20')) return { slot_type: container, slot, stack_id: stackId }
  if (!atLeast('bedrock_1.21.30')) return { slot_type: { container_id: container, dynamic_container_id: 0 }, slot, stack_id: stackId }
  return { slot_type: { container_id: container }, slot, stack_id: stackId }
}

/** an action of a request, each screen's own among them: from 1.26.40 its type is written again, as a byte */
export function stackAction (version: BedrockVersion, type: ActionType, fields: Omit<StackAction, 'type_id'>): StackAction {
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.26.40')) return { type_id: type, ...fields }
  const legacy = LEGACY_TYPE_IDS[type]
  const reserved = legacy >= RESERVED_BEFORE && isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 1 : 0
  return { type_id: type, legacy_type_id: legacy + reserved, ...fields }
}

export function moveAction (version: BedrockVersion, type: 'take' | 'place', count: number, source: SlotInfo, destination: SlotInfo): StackAction {
  return stackAction(version, type, { count, source, destination })
}

export function swapAction (version: BedrockVersion, source: SlotInfo, destination: SlotInfo): StackAction {
  return stackAction(version, 'swap', { source, destination })
}

export function dropAction (version: BedrockVersion, count: number, source: SlotInfo): StackAction {
  return stackAction(version, 'drop', { count, source, randomly: false })
}

export function destroyAction (version: BedrockVersion, count: number, source: SlotInfo): StackAction {
  return stackAction(version, 'destroy', { count, source })
}

export function consumeAction (version: BedrockVersion, count: number, source: SlotInfo): StackAction {
  return stackAction(version, 'consume', { count, source })
}

export function createAction (version: BedrockVersion, index: number): StackAction {
  return stackAction(version, 'create', { result_slot_id: index })
}

// the times from 1.21.20
export function craftRecipeAction (version: BedrockVersion, networkId: number, times: number): StackAction {
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.21.20')) return stackAction(version, 'craft_recipe', { recipe_network_id: networkId })
  return stackAction(version, 'craft_recipe', { recipe_network_id: networkId, times_crafted: times })
}

type AutoIngredients = NonNullable<StackAction['ingredients']>
export type AutoIngredient = AutoIngredients[number]

// the times from 1.17.10 (twice over 1.21.20 – 1.26.30), the ingredients from 1.19.40
export function craftRecipeAutoAction (version: BedrockVersion, networkId: number, times: number, written: AutoIngredient[]): StackAction {
  // each of the version's kind
  const ingredients = written as AutoIngredients
  const atLeast = (since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)
  if (!atLeast('bedrock_1.17.10')) return stackAction(version, 'craft_recipe_auto', { recipe_network_id: networkId })
  if (!atLeast('bedrock_1.19.40')) return stackAction(version, 'craft_recipe_auto', { recipe_network_id: networkId, times_crafted: times })
  if (!atLeast('bedrock_1.21.20') || atLeast('bedrock_1.26.40')) return stackAction(version, 'craft_recipe_auto', { recipe_network_id: networkId, times_crafted: times, ingredients })
  return stackAction(version, 'craft_recipe_auto', { recipe_network_id: networkId, times_crafted_2: times, times_crafted: times, ingredients })
}

type ResultItems = NonNullable<StackAction['result_items']>
export type ResultItem = ResultItems[number]

export function resultsAction (version: BedrockVersion, items: ResultItem[], times: number): StackAction {
  // each of the version's kind
  return stackAction(version, 'results_deprecated', { result_items: items as ResultItems, times_crafted: times })
}

/** what a request tells besides its actions: the names an anvil gives, and from 1.19.30 why (-1: no text) */
export interface RequestText {
  readonly customNames?: readonly string[]
  readonly cause?: NonNullable<StackRequest['cause']>
}

export function stackRequest (version: BedrockVersion, requestId: number, actions: StackAction[], { customNames = [], cause = -1 }: RequestText = {}): StackRequest {
  const request = { request_id: requestId, actions, custom_names: [...customNames] }
  return isBedrockVersionAtLeast(version, 'bedrock_1.19.30') ? { ...request, cause } : request
}

export interface ResponseSlot {
  readonly container: string
  readonly slot: number
  readonly count: number
  readonly stackId: number
  /** an anvil's or a grindstone's result, as the server made it: its name ('' none), its damage */
  readonly customName: string
  readonly durabilityCorrection: number
}

export interface StackResponse {
  readonly requestId: number
  readonly ok: boolean
  readonly status: string
  readonly slots: readonly ResponseSlot[]
}

export function readResponses (responses: ReadResponses): StackResponse[] {
  return responses.map(response => {
    const status = response.status ?? response.result
    const code = status === 'ok' ? 0 : status === 'error' ? 1 : Number(status)
    const slots = (response.containers ?? []).flatMap(({ container_id: containerId, slot_type: slotType, slots }) => {
      const container = String(typeof slotType === 'object' ? slotType.container_id : slotType ?? containerId)
      return slots.map(({ slot, count, item_stack_id: stackId, custom_name: customName, durability_correction: durability }) => ({
        container, slot, count, stackId: stackId ?? 0, customName, durabilityCorrection: durability ?? 0
      }))
    })
    return { requestId: response.request_id, ok: code === 0, status: STACK_RESULTS[code] ?? `status ${code}`, slots }
  })
}
