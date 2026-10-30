import type { Ns } from './types.ts'

export const TICK_NS = 50_000_000
const MAX_FRAME_NS = 100_000_000

/** The client's frame timer: how many 20 Hz ticks a frame runs. A late frame runs at most two; the backlog is dropped. */
export class FrameTimer {
  private previous: Ns | undefined
  private carried: Ns = 0

  /** the ticks due at `now`; the first call only sets the epoch */
  advance (now: Ns): number {
    const refused = this.refuses(now)
    if (refused !== undefined) throw new Error(refused)
    if (this.previous === undefined) {
      this.previous = now
      return 0
    }
    const elapsed = Math.min(now - this.previous, MAX_FRAME_NS) + this.carried
    this.previous = now
    const ticks = Math.floor(elapsed / TICK_NS)
    this.carried = elapsed % TICK_NS
    return ticks
  }

  /** why `now` cannot be the next frame's time */
  refuses (now: Ns): string | undefined {
    if (!Number.isInteger(now)) return `frame time ${now} is not an integer of nanoseconds`
    if (this.previous !== undefined && now < this.previous) return `frame time went back from ${this.previous} to ${now}`
    return undefined
  }

  /** the fraction of a tick carried to the next frame */
  get alpha (): number {
    return this.carried / TICK_NS
  }

  /** the frame time from which one more tick is due */
  nsToNextTick (): Ns {
    return TICK_NS - this.carried
  }
}
