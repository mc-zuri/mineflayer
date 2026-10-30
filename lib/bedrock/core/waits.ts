interface TickWait {
  /** the tick it resolves at the end of; unknown yet while infinite */
  readonly at: { tick: number }
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

interface ConditionWait {
  readonly predicate: () => boolean
  ticksLeft: number
  readonly timeoutMessage: string
  readonly resolve: () => void
  readonly reject: (error: Error) => void
}

/** a tick wait whose tick is told later */
export interface DueWait {
  readonly promise: Promise<void>
  /** it resolves at the end of tick `tick` */
  due: (tick: number) => void
}

/** Waits resolve inside a frame, at fixed phases (a tick's end, the frame's end): never on a timer. */
export class Waits {
  private tickWaits: TickWait[] = []
  private conditionWaits: ConditionWait[] = []
  private ended: Error | undefined

  /** resolves at the end of tick `tick` */
  untilTick (tick: number): Promise<void> {
    return this.tickWait(tick).promise
  }

  /** resolves at the end of the tick it is told is due; until then only the bot's end settles it */
  untilDue (): DueWait {
    return this.tickWait(Number.POSITIVE_INFINITY)
  }

  /** resolves at the end of the first frame where `predicate` holds; rejects after `timeoutTicks` ticks */
  until (predicate: () => boolean, timeoutTicks: number, timeoutMessage: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ended !== undefined) reject(this.ended)
      else this.conditionWaits.push({ predicate, ticksLeft: timeoutTicks, timeoutMessage, resolve, reject })
    })
  }

  /** a tick's end: tick waits resolve, condition waits use up a tick */
  endOfTick (tick: number): void {
    const due = this.tickWaits.filter(wait => wait.at.tick <= tick)
    this.tickWaits = this.tickWaits.filter(wait => wait.at.tick > tick)
    for (const wait of due) wait.resolve()
    for (const wait of this.conditionWaits) wait.ticksLeft--
    const expired = this.conditionWaits.filter(wait => wait.ticksLeft <= 0 && !wait.predicate())
    this.conditionWaits = this.conditionWaits.filter(wait => !expired.includes(wait))
    for (const wait of expired) wait.reject(new Error(wait.timeoutMessage))
  }

  /** the frame's end */
  endOfFrame (): void {
    const met = this.conditionWaits.filter(wait => wait.predicate())
    this.conditionWaits = this.conditionWaits.filter(wait => !met.includes(wait))
    for (const wait of met) wait.resolve()
  }

  /** the bot ended: every wait, pending or later, rejects */
  end (error: Error): void {
    this.ended = error
    const pending = [...this.tickWaits, ...this.conditionWaits]
    this.tickWaits = []
    this.conditionWaits = []
    for (const wait of pending) wait.reject(error)
  }

  private tickWait (tick: number): DueWait {
    const at = { tick }
    const promise = new Promise<void>((resolve, reject) => {
      if (this.ended !== undefined) reject(this.ended)
      else this.tickWaits.push({ at, resolve, reject })
    })
    return { promise, due: tick => { at.tick = tick } }
  }
}
