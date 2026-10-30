import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { FakeBedrockClient } from './server.ts'

type SlotItem = MCProtocol.Bedrock.Write.Types.ItemStack | MCProtocol.Bedrock.Write.Types.Item | MCProtocol.Bedrock.Write.Types.ItemV4

/** an item as a test gives it: its network id, count and metadata, its stack id (none: 0), its block's runtime id */
export interface Given {
  id: number
  count: number
  metadata?: number
  stackId?: number
  blockRuntimeId?: number
}

export type InventoryWindow = 'inventory' | 'armor' | 'offhand' | 'ui'

/** no NBT, no blocks to be placed on or destroy */
function extra (): { has_nbt: number, can_place_on: string[], can_destroy: string[] } {
  return { has_nbt: 0, can_place_on: [], can_destroy: [] }
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

  private item (given: Given | null, v4: boolean): SlotItem {
    const stackId = given?.stackId ?? 0
    if (!this.atLeast('bedrock_1.16.220')) {
      const item = given === null ? { network_id: 0 } : { network_id: given.id, auxiliary_value: ((given.metadata ?? 0) << 8) | given.count, ...extra() }
      return this.atLeast('bedrock_1.16.210') ? { stack_id: stackId, item } : { runtime_id: stackId, item }
    }
    if (given === null) return v4 ? { network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 } : { network_id: 0 }
    const item = { network_id: given.id, count: given.count, metadata: given.metadata ?? 0, block_runtime_id: given.blockRuntimeId ?? 0, extra: extra() }
    if (!v4) return stackId === 0 ? { ...item, has_stack_id: 0 } : { ...item, has_stack_id: 1, stack_id: stackId }
    if (stackId === 0) return { ...item, has_stack_id: false }
    // 1.26.20 and 1.26.30 name a stack id with its kind
    return { ...item, has_stack_id: true, stack_id: this.atLeast('bedrock_1.26.40') ? stackId : { type: 'item_stack_net_id', id: stackId } }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.version, since)
  }
}
