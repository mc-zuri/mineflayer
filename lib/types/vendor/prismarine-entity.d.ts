// prismarine-entity's typings (its index.d.ts) with what they get wrong about its runtime fixed; tsconfig.json maps
// prismarine-entity here. Upstream candidates, listed in docs/typescript/api-mismatches.md.
// - The module is its loader, taking a version or a registry; it has no named exports.
// - effects is an object by effect id, metadata holds any value of the protocol, vehicle is null on foot.
// - mineflayer sets members the typings lack: headYaw, headPitch, eyeHeight, crouching, attributes, dataBlobs.
import type { EventEmitter } from 'events'
import type { ChatMessage } from 'prismarine-chat'
import type { Item } from 'prismarine-item'
import type { Registry } from 'prismarine-registry'
import type { Vec3 } from 'vec3'

export interface Effect {
  id: number
  amplifier: number
  duration: number
}

/** prismarine-entity's types, and the ones minecraft-data's entities have */
export type EntityType = 'player' | 'mob' | 'object' | 'global' | 'orb' | 'projectile' | 'hostile' | 'other' | 'animal' | 'passive' | 'ambient' | 'living' | 'water_creature'

/** a metadata entry's value as the protocol reads it */
export type EntityMetadataValue = number | bigint | string | boolean | object | null

export interface EntityAttribute {
  value: number
  modifiers: object[]
}

export declare class Entity extends EventEmitter {
  constructor (id: number)
  id: number
  type: EntityType
  uuid?: string
  username?: string
  /** @deprecated displayName */
  mobType?: string
  displayName?: string
  entityType?: number
  kind?: string
  name?: string
  /** @deprecated displayName */
  objectType?: string
  count?: number
  position: Vec3
  velocity: Vec3
  yaw: number
  pitch: number
  headYaw?: number
  headPitch?: number
  height: number
  width: number
  eyeHeight?: number
  onGround: boolean
  equipment: Array<Item | undefined>
  get heldItem (): Item | undefined
  metadata: EntityMetadataValue[]
  isValid: boolean
  health?: number
  food?: number
  foodSaturation?: number
  crouching?: boolean
  elytraFlying?: boolean
  attributes?: { [name: string]: EntityAttribute }
  dataBlobs?: object
  player?: object
  effects: { [id: number]: Effect }
  vehicle: Entity | null
  passengers: Entity[]
  setEquipment (index: number, item: Item): void
  getCustomName (): ChatMessage | null
  getDroppedItem (): Item | null
}

declare const loader: (registryOrVersion: string | Registry) => typeof Entity
export default loader
