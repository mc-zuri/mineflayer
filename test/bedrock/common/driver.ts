import type { BedrockCore } from '../../../lib/bedrock/core/core.ts'
import type { Ns } from '../../../lib/bedrock/core/types.ts'

/** Steps a bot's frames at chosen times; after each frame, the promise continuations it resolved run. */
export class ManualDriver {
  now: Ns = 0
  private readonly core: BedrockCore

  constructor (core: BedrockCore) {
    this.core = core
  }

  /** one frame, `ms` after the previous one */
  async frame (ms = 50): Promise<void> {
    await this.step(Math.round(ms * 1e6))
  }

  /** one frame that runs exactly one tick */
  async tick (): Promise<void> {
    await this.step(this.core.nsToNextTick())
  }

  async ticks (count: number): Promise<void> {
    for (let i = 0; i < count; i++) await this.tick()
  }

  /** one frame per entry, each `ms` after the previous one */
  async frames (ms: readonly number[]): Promise<void> {
    for (const dt of ms) await this.frame(dt)
  }

  /** ticks until `done` holds; throws after `maxTicks` */
  async runUntil (done: () => boolean, maxTicks: number): Promise<void> {
    for (let i = 0; i < maxTicks && !done(); i++) await this.tick()
    if (!done()) throw new Error(`not done after ${maxTicks} ticks`)
  }

  private async step (dt: Ns): Promise<void> {
    this.now += dt
    this.core.stepFrame(this.now)
    await new Promise(resolve => setImmediate(resolve))
  }
}
