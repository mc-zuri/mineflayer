import { History } from '../core/history.ts'
import type { HistoryRecord } from '../core/history.ts'
import type { CookedInput, Rotation, Vec3f } from './auth_input.ts'

/** the local player's movement after a tick: plain data, which the ring keeps as it was */
export interface MovementState {
  /** the feet */
  readonly position: Vec3f
  readonly velocity: Vec3f
  readonly onGround: boolean
}

/** what a tick's movement read: a rewind plays the tick again on it */
export interface TickInput {
  readonly cooked: CookedInput
  readonly rotation: Rotation
  /** the tick's auth input answers a teleport */
  readonly teleported: boolean
}

/** what a server packet says the player's movement was after a tick */
export type Filing = Partial<MovementState>

export type TickRecord = HistoryRecord<TickInput, MovementState, Filing>

/** a correction this near its tick's record (squared), on the ground alike, says nothing new */
const AGREEMENT = Math.fround(1e-5)

export function applied (state: MovementState, filing: Filing): MovementState {
  return { ...state, ...filing }
}

/** summed as the vanilla client sums it, in floats */
export function agrees (record: MovementState, correction: Pick<MovementState, 'position' | 'onGround'>): boolean {
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
  readonly history = new History<TickInput, MovementState, Filing>()
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
