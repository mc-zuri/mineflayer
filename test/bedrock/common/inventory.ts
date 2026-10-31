import type { NBT } from 'prismarine-nbt'
import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { FakeBedrockClient } from './server.ts'

type SlotItem = MCProtocol.Bedrock.Write.Types.ItemStack | MCProtocol.Bedrock.Write.Types.Item | MCProtocol.Bedrock.Write.Types.ItemV4

/** an item as a test gives it: its network id, count and metadata, its stack id (none: 0), its block's runtime id, a shield's blocking tick, its NBT compound's ints */
export interface Given {
  id: number
  count: number
  metadata?: number
  stackId?: number
  blockRuntimeId?: number
  blockingTick?: bigint
  ints?: Readonly<Record<string, number>>
}

/** one of the player's windows, the ui, or a screen's own window by its dynamic id */
export type InventoryWindow = 'inventory' | 'armor' | 'offhand' | 'ui' | 'first' | number

/** a slot an ok item_stack_response lists: no stack id, from 1.26.40, is none written */
export interface RespondedSlot {
  container: Exclude<MCProtocol.Bedrock.Write.Types.ContainerSlotType, number>
  slot: number
  count: number
  stackId?: number
}

type Responses = MCProtocol.Bedrock.Write.Types.ItemStackResponses
type CreativeContent = MCProtocol.Bedrock.Write.Types.packet_creative_content
type InventoryTransaction = MCProtocol.Bedrock.Write.Types.packet_inventory_transaction

/** an action of the server's inventory transaction: a slot of a window, or of the creative inventory (where /give takes an item from, and /clear puts it) */
export interface TransactionAction {
  window: InventoryWindow | 'creative'
  slot: number
  from: Given | null
  to: Given | null
}

// the windows' numbers, which transactions write up to 1.16.210 and from 1.26.30
const WINDOW_NUMBERS = Object.freeze({ inventory: 0, first: 1, offhand: 119, armor: 120, ui: 124 })

/** no NBT, no blocks to be placed on or destroy; a shield's blocking tick, which only a shield is written with */
interface ExtraData {
  has_nbt: true | number
  nbt?: { version: number, nbt: NBT }
  can_place_on: string[]
  can_destroy: string[]
  blocking_tick?: bigint
}

function extra ({ blockingTick, ints }: Given): ExtraData {
  const value = Object.fromEntries(Object.entries(ints ?? {}).map(([name, int]) => [name, { type: 'int' as const, value: int }]))
  const nbt: Pick<ExtraData, 'has_nbt' | 'nbt'> = ints === undefined ? { has_nbt: 0 } : { has_nbt: true, nbt: { version: 1, nbt: { type: 'compound', name: '', value } } }
  const none = { ...nbt, can_place_on: [], can_destroy: [] }
  return blockingTick === undefined ? none : { ...none, blocking_tick: blockingTick }
}

/** The server's side of the player's items in a test: slots sent as the version's servers send them. */
export class ServerInventory {
  readonly version: BedrockVersion
  private readonly server: FakeBedrockClient

  constructor (server: FakeBedrockClient) {
    this.server = server
    this.version = server.codec.version
  }

  /** inventory_slot: up to 1.16.210 an aux item wrapped with its stack id, an ItemV4 from 1.26.20 */
  slot (window: InventoryWindow, slot: number, given: Given | null): void {
    this.server.send('inventory_slot', { window_id: window, slot, item: this.item(given, this.atLeast('bedrock_1.26.20')) })
  }

  /** inventory_content: ItemV4s from 1.26.30 */
  content (window: InventoryWindow, items: ReadonlyArray<Given | null>): void {
    const v4 = this.atLeast('bedrock_1.26.30')
    // all of one kind: the version's
    const input = items.map(given => this.item(given, v4)) as MCProtocol.Bedrock.Write.Types.ItemStacks
    // 1.16.201 names the window inventory_id
    this.server.send('inventory_content', this.atLeast('bedrock_1.16.210') ? { window_id: window, input } : { inventory_id: window, input })
  }

  /** item_stack_response, as the version's servers write it: a refusal by its status's number */
  respond (requestId: number, slots: readonly RespondedSlot[], status: 'ok' | number = 'ok'): void {
    const ok = status === 'ok'
    const container = (name: RespondedSlot['container']): object => {
      if (!this.atLeast('bedrock_1.16.210')) return { container_id: name }
      if (!this.atLeast('bedrock_1.21.20')) return { slot_type: name }
      return { slot_type: this.atLeast('bedrock_1.21.30') ? { container_id: name } : { container_id: name, dynamic_container_id: 0 } }
    }
    const presence = this.atLeast('bedrock_1.26.40') && !this.atLeast('bedrock_1.26.51')
    const slot = ({ slot, count, stackId }: RespondedSlot): object => ({
      slot,
      hotbar_slot: slot,
      count,
      ...presence ? { item_stack_id_presence: stackId !== undefined } : {},
      ...stackId === undefined && this.atLeast('bedrock_1.26.40') ? {} : { item_stack_id: stackId ?? 0 },
      custom_name: '',
      ...this.atLeast('bedrock_1.21.50') && !this.atLeast('bedrock_1.26.40') ? { filtered_custom_name: '' } : {},
      ...this.atLeast('bedrock_1.16.210') ? { durability_correction: 0 } : {}
    })
    const containers = slots.map(responded => ({ ...container(responded.container), slots: [slot(responded)] }))
    const answer = {
      ...this.atLeast('bedrock_1.16.210') ? { status } : { result: status },
      request_id: requestId,
      ...presence ? { containers_presence: ok } : {},
      ...ok ? { containers } : {}
    }
    // the version's layout
    this.server.send('item_stack_response', { responses: [answer] as Responses })
  }

  /** container_set_data */
  setData (window: InventoryWindow, property: number, value: number): void {
    this.server.send('container_set_data', { window_id: window, property, value })
  }

  /** creative_content, the items its entries 1, 2, …: up to 1.16.210 numbered as an item's stack id, from 1.16.220 without one; from 1.21.60 in one group */
  creativeContent (items: readonly Given[]): void {
    const grouped = this.atLeast('bedrock_1.21.60')
    const entries = items.map((given, index) => {
      if (!this.atLeast('bedrock_1.16.220')) return this.item({ ...given, stackId: index + 1 }, false)
      const item = { network_id: given.id, count: given.count, metadata: given.metadata ?? 0, block_runtime_id: given.blockRuntimeId ?? 0, extra: extra(given) }
      return grouped ? { entry_id: index + 1, item, group_index: 0 } : { entry_id: index + 1, item }
    })
    // from 1.26.40 an empty item is written whole
    const none = this.atLeast('bedrock_1.26.40') ? { network_id: 0, count: 0, metadata: 0, block_runtime_id: 0 } : { network_id: 0 }
    const groups = grouped ? { groups: [{ category: 'construction', name: '', icon_item: none }] } : {}
    // the version's layout
    this.server.send('creative_content', { ...groups, items: entries } as CreativeContent)
  }

  /** inventory_transaction normal, as the version's servers write it: up to 1.16.210 aux items, the stack ids the actions' (network_ids); up to 1.26.20 Items */
  transaction (actions: readonly TransactionAction[]): void {
    this.server.send('inventory_transaction', this.transactionPacket(actions))
  }

  /** the inventory_transaction that transaction sends */
  transactionPacket (actions: readonly TransactionAction[]): InventoryTransaction {
    const numbered = !this.atLeast('bedrock_1.16.220') || this.atLeast('bedrock_1.26.30')
    const written = actions.map(({ window, slot, from, to }) => {
      const id = typeof window === 'number' || !numbered || window === 'creative' ? window : WINDOW_NUMBERS[window]
      const items = { slot, old_item: this.transactionItem(from), new_item: this.transactionItem(to) }
      if (window === 'creative') {
        const presence = this.atLeast('bedrock_1.26.30') && !this.atLeast('bedrock_1.26.51') ? { container_presence: true, flag_presence: true } : {}
        return { source_type: 'creative', ...presence, ...items, ...this.atLeast('bedrock_1.16.220') ? {} : { new_item_stack_id: 0 } }
      }
      if (!this.atLeast('bedrock_1.16.220')) return { source_type: 'container', inventory_id: id, ...items, new_item_stack_id: to?.stackId ?? 0 }
      if (!this.atLeast('bedrock_1.26.30')) return { source_type: 'container', inventory_id: id, ...items }
      if (!this.atLeast('bedrock_1.26.51')) return { source_type: 'container', container_presence: true, window_id: id, flag_presence: true, ...items }
      return { source_type: 'container', window_id: id, ...items }
    })
    const transaction = this.atLeast('bedrock_1.16.210')
      ? { legacy: { legacy_request_id: 0 }, transaction_type: 'normal', actions: this.atLeast('bedrock_1.16.220') ? written : { network_ids: true, actions: written } }
      : { legacy_request_id: 0, transaction_type: 'normal', network_ids: true, inventory_actions: written }
    // the version's layout
    return { transaction } as InventoryTransaction
  }

  /** a transaction's item: up to 1.16.210 not wrapped with its stack id, an ItemV4 from 1.26.30 */
  private transactionItem (given: Given | null): SlotItem {
    const item = this.item(given, this.atLeast('bedrock_1.26.30'))
    return 'item' in item ? item.item : item
  }

  private item (given: Given | null, v4: boolean): SlotItem {
    const stackId = given?.stackId ?? 0
    if (!this.atLeast('bedrock_1.16.220')) {
      const item = given === null ? { network_id: 0 } : { network_id: given.id, auxiliary_value: ((given.metadata ?? 0) << 8) | given.count, ...extra(given) }
      return this.atLeast('bedrock_1.16.210') ? { stack_id: stackId, item } : { runtime_id: stackId, item }
    }
    if (given === null) return v4 ? { network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 } : { network_id: 0 }
    const item = { network_id: given.id, count: given.count, metadata: given.metadata ?? 0, block_runtime_id: given.blockRuntimeId ?? 0, extra: extra(given) }
    if (!v4) return stackId === 0 ? { ...item, has_stack_id: 0 } : { ...item, has_stack_id: 1, stack_id: stackId }
    if (stackId === 0) return { ...item, has_stack_id: false }
    // 1.26.20 and 1.26.30 name a stack id with its kind
    return { ...item, has_stack_id: true, stack_id: this.atLeast('bedrock_1.26.40') ? stackId : { type: 'item_stack_net_id', id: stackId } }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.version, since)
  }
}
