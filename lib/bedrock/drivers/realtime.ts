import type { BedrockCore } from '../core/core.ts'
import type { Ns } from '../core/types.ts'

export interface Timers {
  set: (run: () => void, ms: number) => void
}

/** nanoseconds since the clock was made, from the process's monotonic clock */
export function monotonicClock (): () => Ns {
  const origin = process.hrtime.bigint()
  return () => Number(process.hrtime.bigint() - origin)
}

const NODE_TIMERS: Timers = Object.freeze({ set: (run: () => void, ms: number) => { setTimeout(run, ms) } })

/**
 * Steps the bot's frames on the wall clock, one frame per tick: each wake steps one frame, and the next wake is just
 * after the next tick is due. A late wake still steps one frame, which runs at most two ticks.
 */
export function startRealtimeDriver (core: BedrockCore, now: () => Ns, timers: Timers = NODE_TIMERS): void {
  const step = (): void => {
    core.stepFrame(now())
    if (!core.closed) timers.set(step, Math.ceil(core.nsToNextTick() / 1_000_000) + 1)
  }
  timers.set(step, 0)
}
