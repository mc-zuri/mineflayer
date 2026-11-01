import type { Block } from 'prismarine-block'
import type { Window } from 'prismarine-windows'
import { iterators } from 'prismarine-world'
import { Vec3 } from 'vec3'
import type { BedrockCore } from '../core/core.ts'
import type { FrameContext, OutboxWriter } from '../core/types.ts'
import type { DueWait } from '../core/waits.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { BlockAction, Rotation, Vec3f } from './auth_input.ts'
import type { Inventory } from './inventory.ts'
import { heldItem } from './items.ts'
import type { Stack } from './items.ts'
import type { LocalPlayer } from './movement.ts'

type TransactionActions = NonNullable<BedrockServerboundPackets['inventory_transaction']['transaction']['actions']>

const OWNER = 'use'
const HOTBAR_START = 36
const OPEN_TICKS = 100
// the vanilla client ends a use at the first tick after the use key's release: the bot holds it through two ticks
const HELD_TICKS = 2
/** the vanilla client plants these, as seeds, rather than place them: where they cannot grow, the use names the block itself */
const CROPS: readonly string[] = Object.freeze(['nether_wart'])
/** Bedrock's faces, by number: down, up, north, south, west, east */
const FACES: readonly Vec3f[] = Object.freeze([
  { x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 0, z: 1 }, { x: -1, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }
].map(face => Object.freeze(face)))
const UP = 1
const ORIGIN = Object.freeze({ x: 0, y: 0, z: 0 })

/** a click on a block: where the player's pick met it, and what it holds */
export interface BlockClick {
  readonly position: Vec3f
  readonly face: number
  /** the point clicked, from the block's corner */
  readonly point: Vec3f
  readonly blockRuntimeId: number
  /** where the held item would go: beside the face for a block or an empty hand, else the block itself */
  readonly result: Vec3f
  readonly hotbarSlot: number
  readonly held: Stack | undefined
  /** whether the block takes the held item (a book a lectern does) */
  readonly takesHeld: boolean
  /** the eye, as the auth inputs report it */
  readonly eye: Vec3f
}

/** a hit's block action: the block's and the face's */
export interface HitAction extends BlockAction {
  readonly position: Vec3f
  readonly face: number
}

/** whether a block takes an item (by name) a use holds */
export type TakesHeld = (block: Block, item: string) => boolean

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

/** Java's: the face a direction points out of, by the sign of y, then z, then x */
function faceOf (direction: Vec3): number {
  const face = [[direction.y, 0], [direction.z, 2], [direction.x, 4]].find(([along]) => along !== 0)
  if (face === undefined) throw new Error(`invalid direction vector ${direction.toString()}`)
  const [along, down] = face as [number, number]
  return along < 0 ? down : down + 1
}

/** where the player looks, from Bedrock degrees */
export function lookDirection ({ yaw, pitch }: Rotation): Vec3 {
  const [yawRadians, pitchRadians] = [yaw * Math.PI / 180, pitch * Math.PI / 180]
  return new Vec3(-Math.sin(yawRadians) * Math.cos(pitchRadians), -Math.sin(pitchRadians), Math.cos(yawRadians) * Math.cos(pitchRadians))
}

/** a point of the block, from its corner, as the vanilla client writes it: from the float it found the point at */
function pointOn (block: Vec3, point: Vec3f): Vec3f {
  const along = (axis: 'x' | 'y' | 'z'): number => Math.fround(Math.fround(point[axis]) - block[axis])
  return { x: along('x'), y: along('y'), z: along('z') }
}

export function useItemOn (runtimeId: bigint, { position, face, result }: BlockClick): BedrockServerboundPackets['player_action'] {
  return { runtime_entity_id: runtimeId, action: 'start_item_use_on', position, result_position: result, face }
}

/** before start_item_use_on, the client followed the click with the block it used: 1.16.201 names the action ineract_block, its runtime id a varint */
export function interactBlock (version: BedrockVersion, runtimeId: bigint, { position, face }: BlockClick): BedrockServerboundPackets['player_action'] {
  return atLeast(version, 'bedrock_1.16.210')
    ? { runtime_entity_id: runtimeId, action: 'interact_block', position, face }
    : { runtime_entity_id: Number(BigInt.asIntN(32, runtimeId)), action: 'ineract_block', position, face }
}

/** the use's end names where the held item would have gone */
export function stopItemUseOn (runtimeId: bigint, { result }: BlockClick): BedrockServerboundPackets['player_action'] {
  return { runtime_entity_id: runtimeId, action: 'stop_item_use_on', position: result, result_position: ORIGIN, face: 0 }
}

/** the arm swings for a use (`interact`), a hit (`mine`) and a dropped item (`dropitem`): what for, from 1.21.130 */
export function swingArm (version: BedrockVersion, runtimeId: bigint, source: 'interact' | 'mine' | 'dropitem' = 'interact'): BedrockServerboundPackets['animate'] {
  const packet: BedrockServerboundPackets['animate'] = { action_id: 'swing_arm', runtime_entity_id: runtimeId }
  if (atLeast(version, 'bedrock_1.21.120')) packet.data = 0
  if (atLeast(version, 'bedrock_1.21.130')) {
    packet.has_swing_source = true
    packet.swing_source = source
  }
  if (atLeast(version, 'bedrock_1.26.60')) packet.hand = 'main_hand'
  return packet
}

/** a hit's start or abort as 1.16.201 sends it, before the auth input carried them: its runtime id a varint */
export function breakAction (runtimeId: bigint, { action, position, face }: HitAction): BedrockServerboundPackets['player_action'] {
  return { runtime_entity_id: Number(BigInt.asIntN(32, runtimeId)), action, position, face }
}

/** the click, as an item use transaction: from 1.26.60 naming the hotbar slot a block takes the held item from */
export function clickBlock (version: BedrockVersion, click: BlockClick): BedrockServerboundPackets['inventory_transaction'] {
  const data: Record<string, unknown> = {
    action_type: 'click_block',
    block_position: click.position,
    face: click.face,
    hotbar_slot: click.hotbarSlot,
    // an ItemV4 from 1.26.30, a version after mob_equipment's
    held_item: heldItem(atLeast(version, 'bedrock_1.26.30'), click.held),
    player_pos: click.eye,
    click_pos: click.point,
    block_runtime_id: click.blockRuntimeId
  }
  if (atLeast(version, 'bedrock_1.21.20')) {
    data['trigger_type'] = 'player_input'
    data['client_prediction'] = 'success'
  }
  if (atLeast(version, 'bedrock_1.26.10')) data['client_cooldown_state'] = 'off'
  if (atLeast(version, 'bedrock_1.26.51')) data['hand'] = 'main_hand'
  const packet = useTransaction(version, 'item_use', data)
  if (click.takesHeld && atLeast(version, 'bedrock_1.26.60')) {
    // ItemV4s, as from 1.26.30
    packet.transaction.actions = [{ source_type: 'container', window_id: 0, slot: click.hotbarSlot, old_item: heldItem(true, click.held), new_item: heldItem(true, undefined) }] as TransactionActions
  }
  return packet
}

/** a use's data, in a transaction that changes no slot, as the version wraps it */
export function useTransaction (version: BedrockVersion, type: 'item_use' | 'item_use_on_entity', data: Record<string, unknown>): BedrockServerboundPackets['inventory_transaction'] {
  // the fields are the version's
  const transactionData = data as NonNullable<BedrockServerboundPackets['inventory_transaction']['transaction']['transaction_data']>
  if (!atLeast(version, 'bedrock_1.16.210')) {
    return { transaction: { legacy_request_id: 0, transaction_type: type, network_ids: false, inventory_actions: [], transaction_data: transactionData } }
  }
  // 1.16.210 says whether the actions name items by network id
  const actions = atLeast(version, 'bedrock_1.16.220') ? [] : { network_ids: false, actions: [] }
  return { transaction: { legacy: { legacy_request_id: 0 }, transaction_type: type, actions, transaction_data: transactionData } }
}

/** a use, resolving with the screen the server opened, once shown: at its opening, or at its window's first content */
export async function openedBy (core: BedrockCore, bot: BedrockBotInternal, inventory: Inventory, name: string, use: () => Promise<void>): Promise<Window> {
  // a block or an entity cannot be used through a screen still up
  const closed = inventory.whenClosed()
  if (closed !== undefined) await closed
  const openings = inventory.openings
  const shown = core.waits.until(() => inventory.openings > openings, OPEN_TICKS, `the server did not open the ${name} in ${OPEN_TICKS} ticks`)
  await Promise.all([shown, use()])
  const window = bot.currentWindow
  if (window === null) throw new Error(`the server opened a ${String(inventory.lastOpened)} screen, which the bot does not show`)
  return window
}

/** an input pass a block or an entity can be used in */
export interface UsePass {
  readonly tick: number
  readonly outbox: OutboxWriter
  readonly runtimeId: bigint
}

/** how a block is used: `direction` and `cursorPos` as Java's activateBlock's */
export interface UseOptions {
  readonly direction?: Vec3 | undefined
  readonly cursorPos?: Vec3 | undefined
  /** the ticks the use key is held after the click's: the vanilla client's held it two or three */
  readonly heldTicks?: number
}

interface Use {
  readonly runtimeId: bigint
  readonly click: BlockClick
  /** the tick the stop goes in */
  readonly endsAt: number
  readonly ended: DueWait
}

/** the attack key pressed on a block: its start goes in the first tick after, its abort in the next */
interface Hit {
  readonly runtimeId: bigint
  readonly position: Vec3f
  readonly face: number
  readonly started: boolean
  readonly ended: DueWait
}

/** the vanilla client's use key: a use ends at the first tick after its release */
export class BlockUse {
  private readonly bot: BedrockBotInternal
  private readonly player: LocalPlayer
  private readonly inventory: Inventory
  private runtimeId: bigint | undefined
  /** the use going on, until its key's release */
  private pressed: Use | undefined
  /** the hit going on, until its abort */
  private hitting: Hit | undefined
  /** the blocks a use can put the held item in, by name */
  private readonly takers = new Map<string, TakesHeld>()

  constructor (bot: BedrockBotInternal, player: LocalPlayer, inventory: Inventory) {
    this.bot = bot
    this.player = player
    this.inventory = inventory
  }

  install (core: BedrockCore): void {
    this.bot.activateBlock = async (block, direction, cursorPos) => { await this.use(core, block, { direction, cursorPos }) }
    this.bot.openBlock = async (block, direction, cursorPos) => await this.open(core, block, { direction, cursorPos })
    core.observe(OWNER, 'start_game', packet => { this.runtimeId = packet.runtime_entity_id })
    core.system(OWNER, { name: 'use.end', place: { after: 'input.cook' }, gate: 'present', replay: false, run: ({ tick, outbox }) => { this.end(tick, outbox) } })
    core.system(OWNER, { name: 'use.hit', place: { after: 'use.end' }, gate: 'present', replay: false, run: ({ tick, outbox }) => { this.strike(tick, outbox) } })
  }

  /** a block a use puts the held item in, when `takes` says so */
  addTaker (block: string, takes: TakesHeld): void {
    this.takers.set(block, takes)
  }

  /** the use, resolving with the screen the server opened, once shown */
  async open (core: BedrockCore, block: Block, options: UseOptions = {}): Promise<Window> {
    return await openedBy(core, this.bot, this.inventory, block.name, async () => { await this.use(core, block, options) })
  }

  /** with the pick on the block (on the face asked for), at once; else after looking at the point, as Java's; resolves once the use ended */
  async use (core: BedrockCore, block: Block, { direction, cursorPos, heldTicks = HELD_TICKS }: UseOptions = {}): Promise<void> {
    const face = direction === undefined ? undefined : faceOf(direction)
    const picked = await this.whenFree(core, pass => {
      const pick = this.pick(block.position)
      if (pick === undefined || (face !== undefined && pick.face !== face)) return undefined
      return this.click(core, pass, { block, face: pick.face, point: cursorPos ?? pick.point, heldTicks })
    })
    if (picked !== undefined) return await picked.ended
    const aimed = face ?? UP
    const normal = FACES[aimed]!
    const point = cursorPos ?? new Vec3(0.5 + normal.x * 0.5, 0.5 + normal.y * 0.5, 0.5 + normal.z * 0.5)
    await this.bot.lookAt(block.position.plus(point))
    const clicked = await this.whenFree(core, pass => this.click(core, pass, { block, face: aimed, point, heldTicks }))
    await clicked.ended
  }

  /**
   * the vanilla client's hit of the block at `position`, the attack key pressed and released: the face its pick meets,
   * else the top after looking at its centre; resolves once the abort is sent
   */
  async hit (core: BedrockCore, position: Vec3): Promise<void> {
    const picked = await this.whenFree(core, pass => {
      const pick = this.pick(position)
      return pick === undefined ? undefined : this.press(core, pass, position, pick.face)
    })
    if (picked !== undefined) return await picked.ended
    await this.bot.lookAt(position.offset(0.5, 1, 0.5))
    const pressed = await this.whenFree(core, pass => this.press(core, pass, position, UP))
    await pressed.ended
  }

  /** run in the first input pass with no use or hit going on, as a held key cannot be pressed again, where `what` can be used */
  async whenFree<Result> (core: BedrockCore, run: (pass: UsePass) => Result, what = 'a block'): Promise<Result> {
    return await core.call(async ctx => this.pressed === undefined && this.hitting === undefined ? run(this.usable(core, ctx, what)) : await this.whenFree(core, run, what))
  }

  private usable (core: BedrockCore, { tick, outbox }: FrameContext, what: string): UsePass {
    const { runtimeId } = this
    if (!core.activation.present || tick === undefined || runtimeId === undefined) throw new Error(`${what} cannot be used before the player is shown`)
    const window = this.bot.currentWindow
    if (window !== null) throw new Error(`${what} cannot be used while the ${window.type} window is open`)
    return { tick, outbox, runtimeId }
  }

  /** the first block the eye's ray meets, if it is the one at `position`: the face, and the point, from the block's corner */
  private pick (position: Vec3): { face: number, point: Vec3f } | undefined {
    const { eye, rotation } = this.player
    const from = new Vec3(eye.x, eye.y, eye.z)
    const direction = lookDirection(rotation)
    // far enough to reach any point of the block
    const ray = new iterators.RaycastIterator(from, direction, from.distanceTo(position.offset(0.5, 0.5, 0.5)) + 1)
    for (let cell: Vec3f | null = from.floored(); cell !== null; cell = ray.next()) {
      const at = new Vec3(cell.x, cell.y, cell.z)
      const met = this.bot.world.getBlock(at)
      const hit = met === null ? null : ray.intersect(met.shapes, at)
      if (hit !== null) return at.equals(position) ? { face: hit.face, point: pointOn(at, hit.pos) } : undefined
    }
    return undefined
  }

  /** the use's end, not a promise: a promise resolved with one waits for it */
  private click (core: BedrockCore, { tick, outbox, runtimeId }: UsePass, { block, face, point, heldTicks }: { block: Block, face: number, point: Vec3f, heldTicks: number }): { ended: Promise<void> } {
    const { bot } = this
    const held = this.inventory.mainHand()
    const item = held === undefined ? undefined : bot.registry.items[held.networkId]
    const placesBeside = held === undefined || (item !== undefined && item.name in bot.registry.blocksByName && !CROPS.includes(item.name))
    const takesHeld = item !== undefined && (this.takers.get(block.name)?.(block, item.name) ?? false)
    const normal = FACES[face]!
    const { x, y, z } = block.position
    const click: BlockClick = {
      position: { x, y, z },
      face,
      point: { x: Math.fround(point.x), y: Math.fround(point.y), z: Math.fround(point.z) },
      blockRuntimeId: block.stateId,
      result: placesBeside ? { x: x + normal.x, y: y + normal.y, z: z + normal.z } : { x, y, z },
      hotbarSlot: this.inventory.quickBarSlot,
      held,
      takesHeld,
      eye: this.player.eye
    }
    const { version } = bot
    if (atLeast(version, 'bedrock_1.19.1')) outbox.queue('player_action', useItemOn(runtimeId, click))
    outbox.queue('animate', swingArm(version, runtimeId))
    outbox.queue('inventory_transaction', clickBlock(version, click))
    // from 1.26.60 the client shows the slot emptied at once, telling the server its empty hand in the tick
    if (takesHeld && atLeast(version, 'bedrock_1.26.60')) this.inventory.predictSlot(this.inventory.inventoryRef(HOTBAR_START + click.hotbarSlot), undefined)
    // as recorded: every block the client used but the crafting table
    if (!atLeast(version, 'bedrock_1.19.1') && block.name !== 'crafting_table') outbox.queue('player_action', interactBlock(version, runtimeId, click))
    const ended = core.waits.untilDue()
    // the click's tick is the next to run
    this.pressed = { runtimeId, click, endsAt: tick + 1 + heldTicks, ended }
    return { ended: ended.promise }
  }

  private end (tick: number, outbox: OutboxWriter): void {
    const { pressed: use } = this
    if (use === undefined || tick < use.endsAt) return
    const { version } = this.bot
    if (atLeast(version, 'bedrock_1.19.1')) outbox.queue('player_action', stopItemUseOn(use.runtimeId, use.click))
    this.pressed = undefined
    use.ended.due(tick)
  }

  /** the hit's abort, not a promise: a promise resolved with one waits for it */
  private press (core: BedrockCore, { runtimeId }: UsePass, { x, y, z }: Vec3, face: number): { ended: Promise<void> } {
    const ended = core.waits.untilDue()
    this.hitting = { runtimeId, position: { x, y, z }, face, started: false, ended }
    return { ended: ended.promise }
  }

  /**
   * the hit's start with a swing, then its abort in the next tick (face 0, as recorded): in the auth input from
   * 1.16.210, the start cracking the block up to 1.20.80; as player_action on 1.16.201
   */
  private strike (tick: number, outbox: OutboxWriter): void {
    const { hitting: hit } = this
    if (hit === undefined) return
    const { version } = this.bot
    const { runtimeId, position, face } = hit
    const act = (action: HitAction): void => {
      if (atLeast(version, 'bedrock_1.16.210')) this.player.act(action)
      else outbox.queue('player_action', breakAction(runtimeId, action))
    }
    if (!hit.started) {
      outbox.queue('animate', swingArm(version, runtimeId, 'mine'))
      act({ action: 'start_break', position, face })
      if (atLeast(version, 'bedrock_1.16.210') && !atLeast(version, 'bedrock_1.21.0')) act({ action: 'crack_break', position, face })
      this.hitting = { ...hit, started: true }
      return
    }
    act({ action: 'abort_break', position, face: 0 })
    this.hitting = undefined
    hit.ended.due(tick)
  }
}
