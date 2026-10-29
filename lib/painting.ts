import type { Vec3 } from 'vec3'
import type { Painting as PaintingApi } from './types/api/index.ts'

class Painting implements PaintingApi {
  declare id: number
  declare position: Vec3
  declare name: string
  declare direction: Vec3

  constructor (id: number, pos: Vec3, name: string, direction: Vec3) {
    this.id = id
    this.position = pos
    this.name = name
    this.direction = direction
  }
}
export default Painting
