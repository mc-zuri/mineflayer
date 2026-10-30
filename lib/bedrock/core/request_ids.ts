const FIRST_STACK_REQUEST = -3

/** The vanilla client numbers its item stack requests -3, -5, -7 … for as long as its process runs. */
export class RequestIds {
  private next = FIRST_STACK_REQUEST
  private continued = false

  nextStackRequest (): number {
    const id = this.next
    this.next -= 2
    return id
  }

  /** once a process, the vanilla client tells the server its screens */
  get freshProcess (): boolean {
    return !this.continued
  }

  /** a test's seam: a recording's client process, which sent requests before this connection */
  continueProcess (next: number): void {
    if (next > FIRST_STACK_REQUEST || next % 2 === 0) throw new Error(`${next} is no item stack request id: they are -3, -5, -7 …`)
    this.next = next
    this.continued = true
  }
}
