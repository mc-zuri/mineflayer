/**
 * Bedrock serverbound packet adapter.
 *
 * The Bedrock plugins build the packets they write in the layout 1.21.130 has. 1.26.x reworked many of them (1.26.40
 * most: see KNOWN_ISSUES.md). This adapter rewrites each packet the bot writes into the layout of the bot's version, as
 * its protocol schema (registry.protocol) says it is, so a version laid out as 1.21.130 is written unchanged:
 * - an item is an ItemV4 where the schema says so (mob_equipment from 1.26.20, transactions from 1.26.30): has_stack_id
 *   a bool, an air item written in full
 * - inventory transaction actions name their window by number, window_id (1.26.30+); player_auth_input's do from 1.26.40
 * - an item use's face is a byte (1.26.30+), and it says its hand and cooldown state where the schema has them
 * - player_auth_input's input flags are a list of names, and each block action has a position and face (1.26.40+)
 * - presence bytes (1.26.30 - 1.26.45) are written as true, as the vanilla client writes them
 * - item stack request actions repeat their type as legacy_type_id, an auto craft names its ingredients and results by
 *   item name (1.26.40+)
 * - book_edit names the book's slot inventory_slot (1.26.0+)
 * - subchunk_request offsets are { x, y, z } (1.26.30+)
 *
 * It also gives the items the bot receives their stack id as a number where 1.26.20 - 1.26.30 send it as a variant.
 */
import type { BedrockBot } from '../../index.js';

type Schema = any;

// The item stack request action ids as 1.21.130 numbers them, which 1.26.40+ repeats as legacy_type_id
const LEGACY_STACK_ACTIONS = [
  'take',
  'place',
  'swap',
  'drop',
  'destroy',
  'consume',
  'create',
  'place_in_container',
  'take_out_container',
  'lab_table_combine',
  'beacon_payment',
  'mine_block',
  'craft_recipe',
  'craft_recipe_auto',
  'craft_creative',
  'optional',
  'craft_grindstone_request',
  'craft_loom_request',
  'non_implemented',
  'results_deprecated',
];

// RecipeIngredient2's descriptor kinds, by name
const INGREDIENT_KINDS: Record<string, number> = { invalid: 0, name: 1, molang: 2, item_tag: 3 };

/** how a transaction's actions are laid out (TransactionActions, or 1.26.30's TransactionActionsAuthInput) */
export interface ActionsLayout {
  /** the items are ItemV4 */
  itemV4: boolean;
  /** an action names its window by number (window_id) */
  windowId: boolean;
  /** container_presence and flag_presence come before window_id and flags (1.26.30 - 1.26.45) */
  presence: boolean;
}

/** how an inventory transaction is laid out: in inventory_transaction, or inside player_auth_input */
export interface TransactionLayout {
  actions: ActionsLayout;
  /** legacy_transactions is an optional (1.26.30+), left out when there are none */
  optionalLegacyTransactions: boolean;
  /** actions_presence comes before the actions (player_auth_input 1.26.40 - 1.26.45) */
  actionsPresence: boolean;
}

export interface ProtocolLayout {
  /** an ItemV4's stack id is a variant, { type, id } (1.26.20 - 1.26.30) */
  stackIdVariant: boolean;
  /** mob_equipment's item is an ItemV4 */
  mobEquipmentItemV4: boolean;
  /** inventory_transaction's layout */
  transaction: TransactionLayout;
  /** the layout of player_auth_input's transaction */
  authInputTransaction: TransactionLayout;
  /** an item use's held item (and those of entity uses and releases) is an ItemV4 */
  useItemV4: boolean;
  /** an item use says its hand */
  useItemHand: boolean;
  /** an item use says its cooldown state */
  useItemCooldown: boolean;
  /** an item use's face is a byte: no face (-1) is 255 */
  useItemFaceByte: boolean;
  /** player_auth_input's input flags are a list of names, in this order */
  inputDataOrder: string[] | null;
  /** player_auth_input's presence fields, written as true */
  authInputPresence: string[];
  /** item stack request actions repeat their type as legacy_type_id */
  stackLegacyTypeId: boolean;
  /** book_edit names the book's slot inventory_slot */
  bookInventorySlot: boolean;
  /** subchunk_request offsets are { x, y, z } */
  subchunkVec3: boolean;
  /** window ids by name */
  windowIds: Record<string, number>;
}

const fields = (type: Schema): any[] => (Array.isArray(type) && type[0] === 'container' ? type[1] : []);
const field = (type: Schema, name: string) => fields(type).find((f) => f.name === name);
/** the type an option wraps, or the type itself */
const unwrapOption = (type: Schema) => (Array.isArray(type) && type[0] === 'option' ? type[1] : type);

/** the mappings of a mapper type ({ id: name }), or {} */
function mappings(type: Schema): Record<string, string> {
  return Array.isArray(type) && type[0] === 'mapper' ? type[1].mappings : {};
}

function actionsLayout(types: Record<string, Schema>, name: string): ActionsLayout {
  const actionFields = fields(types[name]?.[1]?.type);
  return {
    itemV4: actionFields.find((f) => f.name === 'old_item')?.type === 'ItemV4',
    windowId: actionFields.some((f) => f.name === 'window_id'),
    presence: actionFields.some((f) => f.name === 'container_presence'),
  };
}

/** the layout of a transaction container (its legacy, actions and data fields) */
function transactionLayout(types: Record<string, Schema>, transaction: Schema): TransactionLayout {
  const legacyType = field(transaction, 'legacy')?.type ?? 'TransactionLegacy';
  const actionsType = unwrapOption(field(transaction, 'actions')?.type) ?? 'TransactionActions';
  return {
    actions: actionsLayout(types, actionsType),
    optionalLegacyTransactions: field(types[legacyType], 'legacy_transactions')?.type?.[0] === 'option',
    actionsPresence: !!field(transaction, 'actions_presence'),
  };
}

/** the layout of a Bedrock version's serverbound packets, read from its protocol schema */
export function getProtocolLayout(types: Record<string, Schema> | undefined): ProtocolLayout {
  types ??= {};
  const authInput = types.packet_player_auth_input;
  const inputData = field(authInput, 'input_data')?.type;
  // player_auth_input's transaction: gated by its input flags (['switch', { fields: { true: container } }]) before
  // 1.26.40, an optional since
  const authTransaction = field(authInput, 'transaction')?.type;
  const authTransactionContainer = authTransaction?.[0] === 'option' ? authTransaction[1] : authTransaction?.[1]?.fields?.true;
  const requests = field(types.packet_subchunk_request, 'requests')?.type;
  return {
    stackIdVariant: !!types.ItemV4NetIdVariant,
    mobEquipmentItemV4: field(types.packet_mob_equipment, 'item')?.type === 'ItemV4',
    transaction: transactionLayout(types, types.Transaction),
    authInputTransaction: transactionLayout(types, authTransactionContainer),
    useItemV4: field(types.TransactionUseItem, 'held_item')?.type === 'ItemV4',
    useItemHand: !!field(types.TransactionUseItem, 'hand'),
    useItemCooldown: !!field(types.TransactionUseItem, 'client_cooldown_state'),
    useItemFaceByte: field(types.TransactionUseItem, 'face')?.type === 'u8',
    inputDataOrder: JSON.stringify(inputData ?? '').includes('"array"')
      ? Object.entries(mappings(types.InputData))
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([, name]) => name)
      : null,
    authInputPresence: fields(authInput)
      .map((f) => f.name)
      .filter((name) => name?.endsWith('_presence')),
    stackLegacyTypeId: JSON.stringify(types.ItemStackRequest ?? '').includes('"legacy_type_id"'),
    bookInventorySlot: !!field(types.packet_book_edit, 'inventory_slot'),
    subchunkVec3: Array.isArray(requests) && requests[1]?.type === 'vec3i8',
    windowIds: Object.fromEntries(Object.entries(mappings(types.WindowID)).map(([id, name]) => [name, Number(id)])),
  };
}

/** a window's name (WindowID) from the number 1.26.30+ gives a transaction action's window_id */
export function windowIdName(types: Record<string, Schema> | undefined, windowId: number): string | undefined {
  return mappings(types?.WindowID)[windowId];
}

export function createPacketAdapter(layout: ProtocolLayout, itemName: (networkId: number) => string | undefined) {
  // an item as ItemV4 (has_stack_id a bool, an air item written in full) where v4 says it is one
  function item(it: any, v4: boolean) {
    if (!v4) return it;
    if (!it || !it.network_id) return { network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 };
    const hasStackId = !!it.has_stack_id && it.stack_id != null;
    const stackId = hasStackId && layout.stackIdVariant && typeof it.stack_id === 'number' ? { type: 'item_stack_net_id', id: it.stack_id } : it.stack_id;
    return {
      ...it,
      count: it.count ?? 0,
      metadata: it.metadata ?? 0,
      has_stack_id: hasStackId,
      stack_id: hasStackId ? stackId : undefined,
      block_runtime_id: it.block_runtime_id ?? 0,
      extra: it.extra ?? { has_nbt: false, can_place_on: [], can_destroy: [] },
    };
  }

  function action(a: any, actions: ActionsLayout) {
    const out = { ...a, old_item: item(a.old_item, actions.itemV4), new_item: item(a.new_item, actions.itemV4) };
    if (!actions.windowId) return out;
    const { inventory_id: windowName, action: _craftAction, ...rest } = out;
    if (windowName !== undefined) {
      rest.window_id = typeof windowName === 'number' ? windowName : (layout.windowIds[windowName] ?? 0);
    }
    if (a.source_type !== 'world_interaction') delete rest.flags;
    if (actions.presence) {
      rest.container_presence = true;
      rest.flag_presence = true;
    }
    return rest;
  }

  function useItem(data: any) {
    if (!data) return data;
    const out = { ...data, held_item: item(data.held_item, layout.useItemV4) };
    if (layout.useItemHand) out.hand ??= 'main_hand';
    if (layout.useItemCooldown) out.client_cooldown_state ??= 'off';
    if (layout.useItemFaceByte && out.face < 0) out.face &= 0xff;
    return out;
  }

  // a transaction's legacy, actions and data (named transaction_data in inventory_transaction, data in player_auth_input)
  function transaction(t: any, transactionLayout: TransactionLayout) {
    const out = { ...t };
    if (transactionLayout.optionalLegacyTransactions && t.legacy && !t.legacy.legacy_transactions?.length) {
      out.legacy = { ...t.legacy, legacy_transactions: undefined };
    }
    if (Array.isArray(t.actions)) out.actions = t.actions.map((a: any) => action(a, transactionLayout.actions));
    if (transactionLayout.actionsPresence) out.actions_presence = true;
    if (t.transaction_data) out.transaction_data = useItem(t.transaction_data);
    if (t.data) out.data = useItem(t.data);
    return out;
  }

  const prefixed = (name: string) => (name.includes(':') ? name : `minecraft:${name}`);

  // an auto craft's ingredient as RecipeIngredient2: by item name, from an item network id or a crafting_data descriptor
  function ingredient(ing: any) {
    if (ing.legacy_type !== undefined) return ing;
    const kind = ing.type === 'valid' ? ing.descriptor_type : ing.type;
    const count = ing.count ?? 1;
    switch (kind) {
      case 'int_id_meta':
        return { type: 'name', legacy_type: INGREDIENT_KINDS.name, name: prefixed(itemName(ing.network_id) ?? ''), metadata: ing.metadata ?? 32767, count };
      case 'name':
      case 'string_id_meta':
      case 'complex_alias':
        return { type: 'name', legacy_type: INGREDIENT_KINDS.name, name: prefixed(ing.name), metadata: ing.metadata ?? 32767, count };
      case 'molang':
        return { type: 'molang', legacy_type: INGREDIENT_KINDS.molang, expression: ing.expression, version: ing.version, count };
      case 'item_tag':
        return { type: 'item_tag', legacy_type: INGREDIENT_KINDS.item_tag, tag: ing.tag, count };
      default:
        return { type: 'invalid', legacy_type: INGREDIENT_KINDS.invalid, count: 0 };
    }
  }

  // a craft's result as ItemStackRequestInstanceDescriptor: the item by name
  function resultDescriptor(it: any) {
    if (it?.legacy_type !== undefined) return it;
    if (!it || !it.network_id) return { type: 'invalid', legacy_type: 0, count: 0, block_runtime_id: 0 };
    return {
      type: 'name',
      legacy_type: 1,
      name: prefixed(itemName(it.network_id) ?? ''),
      metadata: it.metadata ?? 0,
      count: it.count,
      block_runtime_id: it.block_runtime_id ?? 0,
      extra: it.extra,
    };
  }

  function stackAction(a: any) {
    if (!layout.stackLegacyTypeId) return a;
    const out = { ...a, legacy_type_id: a.legacy_type_id ?? LEGACY_STACK_ACTIONS.indexOf(a.type_id) };
    if (a.type_id === 'craft_recipe_auto') {
      delete out.times_crafted_2;
      out.ingredients = (a.ingredients ?? []).map(ingredient);
    } else if (a.type_id === 'results_deprecated') {
      out.result_items = (a.result_items ?? []).map(resultDescriptor);
    }
    return out;
  }

  const stackRequest = (request: any) => (request ? { ...request, actions: (request.actions ?? []).map(stackAction) } : request);

  const adapters: Record<string, (params: any) => any> = {
    player_auth_input(params) {
      const out = { ...params };
      for (const name of layout.authInputPresence) out[name] = true;
      if (layout.inputDataOrder && params.input_data && !Array.isArray(params.input_data)) {
        out.input_data = layout.inputDataOrder.filter((name) => params.input_data[name]);
      }
      if (params.transaction) out.transaction = transaction(params.transaction, layout.authInputTransaction);
      if (params.block_action && layout.inputDataOrder) {
        out.block_action = params.block_action.map((a: any) => ({ position: { x: 0, y: 0, z: 0 }, face: 0, ...a }));
      }
      if (params.item_stack_request) out.item_stack_request = stackRequest(params.item_stack_request);
      return out;
    },
    inventory_transaction(params) {
      return { ...params, transaction: transaction(params.transaction, layout.transaction) };
    },
    item_stack_request(params) {
      return { ...params, requests: params.requests.map(stackRequest) };
    },
    mob_equipment(params) {
      return { ...params, item: item(params.item, layout.mobEquipmentItemV4) };
    },
    book_edit(params) {
      return layout.bookInventorySlot && params.inventory_slot === undefined ? { ...params, inventory_slot: params.slot } : params;
    },
    subchunk_request(params) {
      if (!layout.subchunkVec3 || !params.requests) return params;
      return { ...params, requests: params.requests.map((r: any) => ({ x: r.x ?? r.dx, y: r.y ?? r.dy, z: r.z ?? r.dz })) };
    },
  };

  return (name: string, params: any) => (adapters[name] && params ? adapters[name](params) : params);
}

// The items of the packets the plugins read, by packet
const RECEIVED_ITEMS: Record<string, (packet: any) => any[]> = {
  inventory_content: (p) => [...(p.input ?? []), p.storage_item],
  inventory_slot: (p) => [p.item, p.storage_item],
  mob_equipment: (p) => [p.item],
  mob_armor_equipment: (p) => [p.helmet, p.chestplate, p.leggings, p.boots, p.body],
  add_player: (p) => [p.held_item],
  add_item_entity: (p) => [p.item],
  inventory_transaction: (p) => [...(p.transaction?.actions ?? []).flatMap((a: any) => [a.old_item, a.new_item]), p.transaction?.transaction_data?.held_item],
};

/**
 * Give the items of the packets the bot receives their stack id as a number, where the version's ItemV4 sends it as a
 * variant, { type, id } (1.26.20 - 1.26.30): the plugins read it as every other version sends it
 */
function installReceivedItemAdapter(client: any, layout: ProtocolLayout) {
  if (!layout.stackIdVariant) return;
  for (const [name, items] of Object.entries(RECEIVED_ITEMS)) {
    client.prependListener(name, (packet: any) => {
      for (const item of items(packet)) {
        if (item?.stack_id != null && typeof item.stack_id === 'object') item.stack_id = item.stack_id.id;
      }
    });
  }
}

/** Make the bot's client write its packets in the layout of the bot's version, and read its items as the plugins do */
export default function installProtocolAdapter(bot: BedrockBot) {
  const layout = getProtocolLayout((bot.registry as any).protocol?.types);
  const adapt = createPacketAdapter(layout, (networkId) => bot.registry.items[networkId]?.name);
  const client = bot._client as any;
  const write = client.write.bind(client);
  const queue = client.queue.bind(client);
  client.write = (name: string, params: any) => write(name, adapt(name, params));
  client.queue = (name: string, params: any) => queue(name, adapt(name, params));
  installReceivedItemAdapter(client, layout);
}
