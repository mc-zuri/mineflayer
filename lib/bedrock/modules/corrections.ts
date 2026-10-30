import { correctTo, teleportTo } from 'prismarine-physics/lib/bedrock/index.ts'
import type { Correction, MovementState, TickInput, Vec3Data } from 'prismarine-physics/lib/bedrock/index.ts'
import { History } from '../core/history.ts'
import type { HistoryRecord } from '../core/history.ts'

/** what a tick's movement read: the engine's input, or that it held the player (physicsEnabled false) */
export type MovementInput = TickInput | 'held'

/** what a server packet says the player's movement was after a tick */
export type Filing =
  | { readonly kind: 'teleport', readonly position: Vec3Data, readonly onGround: boolean }
  | ({ readonly kind: 'correction' } & Correction)
  | { readonly kind: 'motion', readonly velocity: Vec3Data }

export type TickRecord = HistoryRecord<MovementInput, MovementState, Filing>

/** a correction this near its tick's record (squared), on the ground alike, says nothing new */
const AGREEMENT = Math.fround(1e-5)

/** the movement with a server packet applied: the box follows the feet the packet gives */
export function applied (state: MovementState, filing: Filing): MovementState {
  if (filing.kind === 'teleport') return teleportTo(state, filing.position, filing.onGround)
  if (filing.kind === 'correction') return correctTo(state, filing)
  return { ...state, velocity: filing.velocity }
}

/** summed as the vanilla client sums it, in floats */
export function agrees (record: Pick<MovementState, 'position' | 'onGround'>, correction: Pick<MovementState, 'position' | 'onGround'>): boolean {
  const f = Math.fround
  const [dx, dy, dz] = [f(correction.position.x - record.position.x), f(correction.position.y - record.position.y), f(correction.position.z - record.position.z)]
  return f(f(dz * dz) + f(f(dy * dy) + f(dx * dx))) <= AGREEMENT && correction.onGround === record.onGround
}

/** start_game names the authority up to 1.21.80 (1.16.201 its rewind server_v2_rewind); from 1.21.90 it rewinds */
export function rewindsUnder (authority: string | number | undefined): boolean {
  return authority === undefined || authority === 'server_with_rewind' || authority === 'server_v2_rewind'
}

/**
 * The local player's last ticks, and what became of the server's packets that name one of them. Under a movement
 * authority that rewinds, such a packet is filed on its tick's record, and the next tick plays the ticks since again
 * from there; under another it acts at once.
 */
export class Corrections {
  readonly history = new History<MovementInput, MovementState, Filing>()
  readonly stats = { filed: 0, agreed: 0, echoes: 0, unstamped: 0, tooOld: 0, anomalies: 0, rewinds: 0, replayedTicks: 0, abandoned: 0 }
  rewinds = true

  /** the record of a stamped packet's tick: none when the tick is older than the ring, or after its newest (an anomaly) */
  recordOf (tick: number): TickRecord | undefined {
    const record = this.history.get(tick)
    if (record === undefined && tick > (this.history.newest ?? tick)) this.stats.anomalies++
    else if (record === undefined) this.stats.tooOld++
    return record
  }

  /** a packet the next tick rewinds to */
  file (record: TickRecord, filing: Filing): void {
    this.history.file(record.tick, filing, true)
    this.stats.filed++
  }
}
