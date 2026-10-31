import type { Entity } from 'prismarine-entity'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { BedrockCore } from '../core/core.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { Vec3f } from './auth_input.ts'
import { lookDirection, openedBy, useTransaction } from './block_use.ts'
import type { BlockUse, UsePass } from './block_use.ts'
import type { Inventory } from './inventory.ts'
import { heldItem } from './items.ts'
import type { Stack } from './items.ts'
import type { LocalPlayer } from './movement.ts'

/** the vanilla client picks along the first 5.5 blocks of its look, in floats: its points are these (recorded) */
const PICK_REACH = 5.5
/** it picks an entity by its box grown by 0.1 on each side */
const PICK_GROWTH = 0.1
const AXES = Object.freeze(['x', 'y', 'z'] as const)

/** a use of an entity: where the player's pick met it, and what it holds */
export interface EntityClick {
  readonly runtimeId: bigint
  /** the point clicked, not from the entity's feet */
  readonly point: Vec3f
  readonly hotbarSlot: number
  readonly held: Stack | undefined
  /** the eye, as the auth inputs report it */
  readonly eye: Vec3f
}

/** the use, as an item use transaction on the entity that changes no slot: an ItemV4 from 1.26.30, the hand from 1.26.60 */
export function useEntity (version: BedrockVersion, click: EntityClick): BedrockServerboundPackets['inventory_transaction'] {
  const data: Record<string, unknown> = { entity_runtime_id: click.runtimeId, action_type: 'interact', hotbar_slot: click.hotbarSlot }
  if (isBedrockVersionAtLeast(version, 'bedrock_1.26.60')) data['hand'] = 'main_hand'
  data['held_item'] = heldItem(isBedrockVersionAtLeast(version, 'bedrock_1.26.30'), click.held)
  data['player_pos'] = click.eye
  data['click_pos'] = click.point
  return useTransaction(version, 'item_use_on_entity', data)
}

/** where the pick's segment, from the eye, enters the entity's grown box: how far along, and the point, as the client's floats */
function entryOf (eye: Vec3f, segment: Vec3f, { position, width, height }: Entity): { along: number, point: Vec3f } | undefined {
  const f = Math.fround
  const half = width / 2
  const min = { x: f(f(position.x - half) - PICK_GROWTH), y: f(f(position.y) - PICK_GROWTH), z: f(f(position.z - half) - PICK_GROWTH) }
  const max = { x: f(f(position.x + half) + PICK_GROWTH), y: f(f(position.y + height) + PICK_GROWTH), z: f(f(position.z + half) + PICK_GROWTH) }
  for (const axis of AXES) {
    const face = segment[axis] > 0 ? min[axis] : max[axis]
    // along an axis the segment does not move, NaN or infinite: no point
    const along = (face - eye[axis]) / segment[axis]
    if (along < 0 || along > 1) continue
    const at = (other: 'x' | 'y' | 'z'): number => other === axis ? face : f(eye[other] + f(segment[other] * along))
    const point = { x: at('x'), y: at('y'), z: at('z') }
    // a box's entry is the one face the segment meets it on
    if (AXES.every(other => point[other] >= min[other] && point[other] <= max[other])) return { along, point }
  }
  return undefined
}

/** using an entity as the vanilla client's use key does, with its pick on it */
export class EntityUse {
  private readonly bot: BedrockBotInternal
  private readonly player: LocalPlayer
  private readonly inventory: Inventory
  private readonly blockUse: BlockUse

  constructor (bot: BedrockBotInternal, player: LocalPlayer, inventory: Inventory, blockUse: BlockUse) {
    this.bot = bot
    this.player = player
    this.inventory = inventory
    this.blockUse = blockUse
  }

  install (core: BedrockCore): void {
    this.bot.activateEntity = async entity => { await this.use(core, entity) }
    this.bot.activateEntityAt = async (entity, position) => { await this.use(core, entity, position) }
  }

  /** the use, resolving with the screen the server opened, once shown */
  async open (core: BedrockCore, entity: Entity): Promise<Window> {
    return await openedBy(core, this.bot, this.inventory, String(entity.name), async () => { await this.use(core, entity) })
  }

  /**
   * with the pick on the entity, at once; else after looking at its box's centre (Java's look, 1 over the feet, misses a
   * low box), or at `aimed` first, as Java's activateEntityAt; resolves once sent
   */
  async use (core: BedrockCore, entity: Entity, aimed?: Vec3): Promise<void> {
    const picked = await this.whenFree(core, entity, pass => {
      const point = aimed === undefined ? this.pick(entity) : undefined
      if (point !== undefined) this.click(pass, entity, point)
      return point !== undefined
    })
    if (picked) return
    const at = aimed ?? entity.position.offset(0, entity.height / 2, 0)
    await this.bot.lookAt(at)
    // the pick's point once it meets the entity, else the point looked at, as Java's
    await this.whenFree(core, entity, pass => { this.click(pass, entity, this.pick(entity) ?? at) })
  }

  /** in the first input pass no block use holds the key in, an entity the bot has */
  private async whenFree<Result> (core: BedrockCore, entity: Entity, run: (pass: UsePass) => Result): Promise<Result> {
    return await this.blockUse.whenFree(core, pass => {
      if (this.bot.entities[entity.id] !== entity) throw new Error(`the bot has no ${String(entity.name)} ${entity.id}`)
      return run(pass)
    }, 'an entity')
  }

  /** the point where the pick meets the entity, if it is the first entity it meets before a block */
  private pick (target: Entity): Vec3f | undefined {
    const { eye, rotation } = this.player
    const direction = lookDirection(rotation)
    const f = Math.fround
    const end = (axis: 'x' | 'y' | 'z'): number => f(f(eye[axis] + f(direction[axis] * PICK_REACH)) - eye[axis])
    const segment = { x: end('x'), y: end('y'), z: end('z') }
    const from = new Vec3(eye.x, eye.y, eye.z)
    const block = this.bot.world.raycast(from, direction, PICK_REACH)
    let nearest = block === null ? Infinity : block.intersect.distanceTo(from) / PICK_REACH
    let picked: { entity: Entity, point: Vec3f } | undefined
    // the player's own box, around the eye, is never entered
    for (const entity of Object.values(this.bot.entities)) {
      const entry = entryOf(eye, segment, entity)
      if (entry === undefined || entry.along >= nearest) continue
      nearest = entry.along
      picked = { entity, point: entry.point }
    }
    return picked?.entity === target ? picked.point : undefined
  }

  private click ({ outbox }: UsePass, entity: Entity, { x, y, z }: Vec3f): void {
    const f = Math.fround
    outbox.queue('inventory_transaction', useEntity(this.bot.version, {
      runtimeId: BigInt(entity.id),
      point: { x: f(x), y: f(y), z: f(z) },
      hotbarSlot: this.inventory.quickBarSlot,
      held: this.inventory.mainHand(),
      eye: this.player.eye
    }))
  }
}
