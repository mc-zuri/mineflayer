const FIRST_STACK_REQUEST = -3
const FIRST_LEGACY_TRANSACTION = -4

/** The vanilla client numbers its item stack requests -3, -5, -7 …, its legacy transactions -4, -6, -8 …, for as long as its process runs. */
export class RequestIds {
  private next = FIRST_STACK_REQUEST
  private nextLegacy = FIRST_LEGACY_TRANSACTION
  private continued = false

  nextStackRequest (): number {
    const id = this.next
    this.next -= 2
    return id
  }

  /** the id of an inventory_transaction that predicts slots */
  nextLegacyTransaction (): number {
    const id = this.nextLegacy
    this.nextLegacy -= 2
    return id
  }

  /** once a process, the vanilla client tells the server its screens */
  get freshProcess (): boolean {
    return !this.continued
  }

  /** a test's seam: a recording's client process, which sent requests (and transactions) before this connection */
  continueProcess (next: number, nextLegacy = this.nextLegacy): void {
    if (next > FIRST_STACK_REQUEST || next % 2 === 0) throw new Error(`${next} is no item stack request id: they are -3, -5, -7 …`)
    if (nextLegacy > FIRST_LEGACY_TRANSACTION || nextLegacy % 2 !== 0) throw new Error(`${nextLegacy} is no legacy transaction id: they are -4, -6, -8 …`)
    this.next = next
    this.nextLegacy = nextLegacy
    this.continued = true
  }
}
