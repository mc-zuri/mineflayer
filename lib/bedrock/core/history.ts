export interface HistoryRecord<Input, Snapshot, Filing> {
  readonly tick: number
  readonly input: Input
  /** the state after the tick */
  snapshot: Snapshot
  readonly filings: Filing[]
}

const MAX_SIZE = 1000

/**
 * The local player's last ticks, newest last: what each tick read and what it left. A server packet that names a past
 * tick is filed on that tick's record, and the next tick replays from there.
 */
export class History<Input, Snapshot, Filing> {
  private records: Array<HistoryRecord<Input, Snapshot, Filing>> = []
  private size = 1

  /** start_game's rewind_history_size (0 keeps one tick); clears the ring */
  resize (size: number): void {
    this.size = Math.min(Math.max(size, 1), MAX_SIZE)
    this.clear()
  }

  clear (): void {
    this.records = []
  }

  /** a tick that does not follow the newest record starts the ring again */
  record (tick: number, input: Input, snapshot: Snapshot): void {
    if (this.newest !== undefined && tick !== this.newest + 1) this.clear()
    this.records.push({ tick, input, snapshot, filings: [] })
    if (this.records.length > this.size) this.records.shift()
  }

  get (tick: number): HistoryRecord<Input, Snapshot, Filing> | undefined {
    const oldest = this.oldest
    return oldest === undefined ? undefined : this.records[tick - oldest]
  }

  get oldest (): number | undefined {
    return this.records[0]?.tick
  }

  get newest (): number | undefined {
    return this.records[this.records.length - 1]?.tick
  }

  get capacity (): number {
    return this.size
  }

  /** files a packet on the record of its tick, which must be in the ring */
  file (tick: number, filing: Filing): void {
    const record = this.get(tick)
    if (record === undefined) throw new Error(`no record of tick ${tick} to file on`)
    record.filings.push(filing)
  }

  /** the oldest record a packet was filed on: the replay starts after it */
  get anchor (): HistoryRecord<Input, Snapshot, Filing> | undefined {
    return this.records.find(record => record.filings.length > 0)
  }

  get pending (): boolean {
    return this.anchor !== undefined
  }

  /** the records from `tick` on */
  from (tick: number): ReadonlyArray<HistoryRecord<Input, Snapshot, Filing>> {
    return this.records.filter(record => record.tick >= tick)
  }

  clearFilings (): void {
    for (const record of this.records) record.filings.length = 0
  }
}
