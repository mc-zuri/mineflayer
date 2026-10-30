import type { InboxWriter, LinkNotice, Ns } from './types.ts'

export type InboxEntry =
  | { readonly kind: 'packet', readonly sequence: number, readonly arrivalTime: Ns, readonly name: string, readonly params: object }
  | { readonly kind: 'notice', readonly sequence: number, readonly arrivalTime: Ns, readonly notice: LinkNotice }

const MAX_ENTRIES = 8192
const MAX_BYTES = 64 * 1024 * 1024

/** Received packets and link notices, held until the next packet pass. Nothing is dropped: overflowing faults. */
export class Inbox implements InboxWriter {
  private entries: InboxEntry[] = []
  private bytes = 0
  private sequence = 0
  private lastArrival: Ns = 0
  private readonly fault: (reason: string) => void

  constructor (fault: (reason: string) => void) {
    this.fault = fault
  }

  packet (name: string, params: object, size: number, arrivalTime: Ns): void {
    if (!this.accept(arrivalTime, size)) return
    this.entries.push({ kind: 'packet', sequence: ++this.sequence, arrivalTime, name, params })
  }

  notice (notice: LinkNotice, arrivalTime: Ns): void {
    if (!this.accept(arrivalTime, 0)) return
    this.entries.push({ kind: 'notice', sequence: ++this.sequence, arrivalTime, notice })
  }

  /** the entries received so far, in arrival order; later ones wait for the next pass */
  drain (): readonly InboxEntry[] {
    const drained = this.entries
    this.entries = []
    this.bytes = 0
    return drained
  }

  get size (): number {
    return this.entries.length
  }

  private accept (arrivalTime: Ns, size: number): boolean {
    if (arrivalTime < this.lastArrival) {
      this.fault(`a packet arrived at ${arrivalTime}, before the previous one (${this.lastArrival})`)
      return false
    }
    if (this.entries.length >= MAX_ENTRIES || this.bytes + size > MAX_BYTES) {
      this.fault(`the inbox overflowed: ${this.entries.length} entries, ${this.bytes} bytes`)
      return false
    }
    this.lastArrival = arrivalTime
    this.bytes += size
    return true
  }
}
