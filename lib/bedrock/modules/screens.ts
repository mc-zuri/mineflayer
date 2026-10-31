import type { Window } from 'prismarine-windows'
import type { FrameContext, OutboxWriter } from '../core/types.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { Vec3f } from './auth_input.ts'
import type { ClickedSlots, WindowClick } from './clicks.ts'
import type { Move } from './inventory.ts'
import type { ContainerName, ResponseSlot, SlotRef, Stack } from './items.ts'

type OpenPacket = BedrockClientboundPackets['container_open']
/** a window type as the codec reads it: a number for one the version does not name */
export type WindowType = OpenPacket['window_type']
export type WindowTypeName = Exclude<WindowType, number>
export type WindowId = OpenPacket['window_id']
/** where a container's items come from: one of the player's windows, the ui window, or the screen's own (its dynamic id) */
export type Store = 'inventory' | 'armor' | 'offhand' | 'ui' | 'open'

/** what opened a screen: container_open's fields, or those of update_trade or update_equipment */
export interface ScreenOpening {
  readonly id: WindowId
  readonly type: WindowType
  /** container_open's coordinates: (0, 0, 0) for an opening without */
  readonly position: Vec3f
  /** container_open's runtime_entity_id: -1 for a block's */
  readonly entity: bigint
}

export interface ScreenLayout {
  /** prismarine-windows' type */
  readonly windowType: string
  readonly title: string
  /** the Java slots before the player's 36, each as the vanilla client names it in a request */
  readonly slots: readonly SlotRef[]
  /** the Java slots after the player's 36: the inventory's offhand */
  readonly after?: readonly SlotRef[]
  /** -1: none */
  readonly craftingResultSlot: number
}

export interface ScreenDefinition {
  readonly type: WindowTypeName
  /** each container its slots name, and where its items come from: 'open' is the screen's own window */
  readonly containers: Readonly<Partial<Record<ContainerName, Store>>>
  /** 'open': shown at its opening; 'content': at its window's first inventory_content, which sizes it */
  readonly shown: 'open' | 'content'
  /** undefined: the bot does not show it, as one it has no definition for */
  readonly layout: (opening: ScreenOpening, contentSize: number | undefined) => ScreenLayout | undefined
  /** bot.inventory is its window: the inventory screen's */
  readonly playerWindow?: true
  /** the close's animation from 1.21.120: the inventory's, the crafting table's, or none */
  readonly animation: 'inventory' | 'workbench' | 'none'
  /** what its close gives back, in order, the cursor among them */
  readonly handBack: readonly SlotRef[]
  /** the id the client's container_close names: none for trading, else the screen's own */
  readonly closeId?: 'none'
  /** set_player_inventory_options' field its first opening sets (1.20.50 – 1.21.101) */
  readonly options?: 'layout' | 'crafting_layout'
  /** where a shift click sends a stack; undefined keeps the default: hotbar to inventory, inventory to hotbar, else either */
  readonly shiftTargets?: (from: SlotRef, stack: Stack) => readonly SlotRef[] | undefined
  /** whether the vanilla client puts the stack in `to`; undefined keeps the default: armor and the offhand */
  readonly accepts?: (to: SlotRef, stack: Stack, names: Pick<ClickedSlots, 'itemName' | 'enchantCategories'>) => boolean | undefined
  /** a click's moves; undefined keeps the default's. A click it throws for rejects */
  readonly moves?: (click: WindowClick, clicked: SlotRef | undefined, slots: ClickedSlots) => readonly Move[] | undefined
}

/** a screen shown: a new one at each opening, so that a feature keeps a screen's state by it */
export interface OpenScreen {
  readonly opening: ScreenOpening
  readonly definition: ScreenDefinition
  readonly window: Window
  /** container_set_data's for the screen's id, those sent before its opening too */
  readonly properties: ReadonlyMap<number, number>
}

/** what a feature does on its screen; each but output and close may be given by several */
export interface ScreenHooks {
  /** a click on the screen's creative_output, any but the drop key's, in its input pass: the feature makes the request */
  readonly output?: (ctx: FrameContext, click: WindowClick, screen: OpenScreen) => Promise<void>
  /** container_set_data for the screen's id, in the packet pass, once in its properties */
  readonly data?: (property: number, value: number, screen: OpenScreen) => void
  /** its slots shown, before windowOpen (Java's extendWindow) */
  readonly shown?: (screen: OpenScreen) => void
  /** after windowClose */
  readonly closed?: (screen: OpenScreen) => void
  /** a request made while the screen is open, its moves predicted */
  readonly requested?: (requestId: number, moves: readonly Move[], screen: OpenScreen) => void
  /** the item_stack_request packet about to be queued while the screen is open: what is queued here leaves before it */
  readonly beforeSend?: (outbox: OutboxWriter, screen: OpenScreen) => void
  /** a slot an ok response lists, settled: what the response tells of it besides its count and stack id */
  readonly settle?: (slot: ResponseSlot, stack: Stack, screen: OpenScreen) => Stack
  /** the close, in place of container_close: the screen then closes without the server's */
  readonly close?: (outbox: OutboxWriter, screen: OpenScreen) => void
}

function slotsOf (container: ContainerName, from: number, to: number): readonly SlotRef[] {
  return Object.freeze(Array.from({ length: to - from + 1 }, (_, index) => Object.freeze({ container, slot: from + index })))
}

export const CURSOR: SlotRef = Object.freeze({ container: 'cursor', slot: 0 })
export const OUTPUT: SlotRef = Object.freeze({ container: 'creative_output', slot: 50 })
/** the player's part of every screen's Java window, after the screen's slots */
export const PLAYER_SLOTS: readonly SlotRef[] = Object.freeze([...slotsOf('inventory', 9, 35), ...slotsOf('hotbar', 0, 8)])

/** a screen defined, with every feature's hooks on it, those added later too */
export interface Defined {
  readonly definition: ScreenDefinition
  readonly hooks: readonly ScreenHooks[]
}

const PLAYER_STORES: ReadonlyArray<readonly [string, Store]> = Object.freeze([
  ['hotbar_and_inventory', 'inventory'], ['hotbar', 'inventory'], ['inventory', 'inventory'], ['armor', 'armor'], ['offhand', 'offhand'], ['cursor', 'ui']
])

/** The screens a bot shows, each defined by its feature: filled at the plugins' injection. */
export class Screens {
  private readonly defined = new Map<WindowType, { definition: ScreenDefinition, hooks: ScreenHooks[] }>()
  private readonly stores = new Map<string, Store>(PLAYER_STORES)
  private readonly everyShown: Array<(screen: OpenScreen) => void> = []

  /** throws for a type defined already, and for a container another store has */
  add (definition: ScreenDefinition, hooks: ScreenHooks = {}): void {
    if (this.defined.has(definition.type)) throw new Error(`the ${definition.type} screen is defined twice`)
    // the record's keys are its containers
    const containers = Object.entries(definition.containers) as Array<[ContainerName, Store]>
    for (const [container, store] of containers) {
      const known = this.stores.get(container)
      if (known !== undefined && known !== store) throw new Error(`the ${definition.type} screen has ${container} in the ${store} store, which is in the ${known} store`)
    }
    for (const [container, store] of containers) this.stores.set(container, store)
    this.defined.set(definition.type, { definition, hooks: [] })
    this.extend(definition.type, hooks)
  }

  /** hooks of another feature on a screen defined: throws for a type not defined, and for a second output or close */
  extend (type: WindowTypeName, hooks: ScreenHooks): void {
    const all = this.defined.get(type)?.hooks
    if (all === undefined) throw new Error(`no ${type} screen is defined`)
    for (const only of ['output', 'close'] as const) {
      if (hooks[only] !== undefined && all.some(other => other[only] !== undefined)) throw new Error(`the ${type} screen has a hook for its ${only} already`)
    }
    all.push(hooks)
  }

  /** run for every screen shown, before its own shown hooks */
  onShown (run: (screen: OpenScreen) => void): void {
    this.everyShown.push(run)
  }

  definitionOf (type: WindowType): ScreenDefinition | undefined {
    return this.defined.get(type)?.definition
  }

  definedOf (type: WindowType): Defined | undefined {
    return this.defined.get(type)
  }

  storeOf (container: string): Store | undefined {
    return this.stores.get(container)
  }

  get shownHooks (): ReadonlyArray<(screen: OpenScreen) => void> {
    return this.everyShown
  }
}
