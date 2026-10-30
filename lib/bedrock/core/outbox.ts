import type { BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'
import type { OutboxWriter, OutgoingPacket, Phase, ServerboundName } from './types.ts'

const MAX_ENTRIES = 8192

/** The packets queued since the last flush, in queue order: never reordered, merged or dropped. */
export class Outbox {
  private entries: OutgoingPacket[] = []
  private order = 0
  private closed = false
  dropped = 0
  private readonly where: () => { phase: Phase | undefined, tick: number | undefined }
  private readonly fault: (reason: string) => void

  constructor (where: () => { phase: Phase | undefined, tick: number | undefined }, fault: (reason: string) => void) {
    this.where = where
    this.fault = fault
  }

  writer (owner: string): OutboxWriter {
    return {
      queue: <Name extends ServerboundName>(name: Name, params: BedrockServerboundPackets[Name]): void => {
        this.queue(owner, name, params)
      }
    }
  }

  flush (): readonly OutgoingPacket[] {
    const batch = this.entries
    this.entries = []
    return batch
  }

  /** after the connection closed: later packets are counted, not queued */
  close (): void {
    this.closed = true
    this.entries = []
  }

  private queue (owner: string, name: ServerboundName, params: object): void {
    if (this.closed) {
      this.dropped++
      return
    }
    const { phase, tick } = this.where()
    if (phase === undefined) throw new Error(`${owner} queued ${name} outside a packet pass, input pass or tick`)
    if (this.entries.length >= MAX_ENTRIES) {
      this.fault(`the outbox overflowed: ${this.entries.length} packets`)
      return
    }
    this.entries.push({ order: ++this.order, name, params, phase, tick, owner })
  }
}
