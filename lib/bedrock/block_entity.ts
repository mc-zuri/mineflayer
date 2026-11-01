import type { Tags, TagType } from 'prismarine-nbt'
import type { Vec3f } from './modules/auth_input.ts'

/** a block entity's fields, as block_entity_data tells them */
export type BlockEntity = Record<string, undefined | Tags[TagType]>

export function blockKey ({ x, y, z }: Vec3f): string {
  return `${x},${y},${z}`
}

/** the field's text: '' for one missing or of another type */
export function textOf (entity: BlockEntity, key: string): string {
  const value = entity[key]?.value
  return typeof value === 'string' ? value : ''
}

/** the field's number (a byte, short, int or float): 0 for one missing or of another type */
export function numberOf (entity: BlockEntity, key: string): number {
  const value = entity[key]?.value
  return typeof value === 'number' ? value : 0
}
