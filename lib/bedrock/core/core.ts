import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'
import { FrameTimer } from './frame_timer.ts'
import { Inbox } from './inbox.ts'
import { Outbox } from './outbox.ts'
import { resolveSchedule } from './schedule.ts'
import type { SystemDecl } from './schedule.ts'
import type { ClientboundName, FrameContext, Gate, HandlerContext, LinkNotice, Ns, OutboxWriter, Phase, TickContext, Transport } from './types.ts'
import { Waits } from './waits.ts'

export interface CoreHooks {
  /** a handler, system or hook threw; the frame goes on */
  error: (error: Error) => void
  /** the first frame: plugins may listen from here */
  firstFrame: () => void
  /** a tick ended (mineflayer's physicsTick) */
  tickEnded: (tick: number) => void
}

interface Handler {
  readonly owner: string
  readonly critical: boolean
  readonly handle: (params: object, ctx: HandlerContext) => void
}

interface PacketStats { handled: number, threw: number, unhandled: number }

const INERT_OUTBOX: OutboxWriter = Object.freeze({ queue: () => {} })

/**
 * One frame of the client's loop: received packets are handled in the packet pass, the user's commands in the input
 * pass, then the ticks run their systems, the look is applied, and the frame's packets leave in one flush. Nothing
 * here reads a clock: the driver gives each frame its time.
 */
export class BedrockCore {
  readonly inbox: Inbox
  readonly waits = new Waits()
  /** written by the session: whether the server shows the player, and whether it moves */
  readonly activation = { present: false, active: false }
  readonly stats = { frames: 0, ticks: 0, errors: 0, gated: 0, packets: new Map<string, PacketStats>() }

  private readonly hooks: CoreHooks
  private readonly timer = new FrameTimer()
  private readonly outbox: Outbox
  private readonly writers = new Map<string, OutboxWriter>()
  private readonly handlers = new Map<string, Handler>()
  private readonly observers = new Map<string, Handler[]>()
  private readonly noticeHooks: Array<{ owner: string, run: (notice: LinkNotice, ctx: FrameContext) => void }> = []
  private readonly inputHooks: Array<{ owner: string, run: (ctx: FrameContext) => void }> = []
  private readonly lookHooks: Array<{ owner: string, run: (ctx: FrameContext) => void }> = []
  private readonly endOfTickHooks: Array<{ owner: string, run: (ctx: TickContext) => void }> = []
  private readonly afterTickHooks: Array<{ owner: string, run: (ctx: TickContext) => void }> = []
  private readonly systems: Array<{ owner: string, system: SystemDecl }> = []
  private schedule: ReadonlyArray<{ owner: string, system: SystemDecl }> | undefined
  private commands: Array<(ctx: FrameContext) => void> = []
  private staged: Array<() => void> = []
  private transport: Transport | undefined
  private now: Ns = 0
  private currentTick: number | undefined
  private phase: Phase | undefined
  private ended = false
  private faulted: string | undefined

  constructor (hooks: CoreHooks) {
    this.hooks = hooks
    this.inbox = new Inbox(reason => { this.fault(reason) })
    this.outbox = new Outbox(() => ({ phase: this.phase, tick: this.currentTick }), reason => { this.fault(reason) })
  }

  /** the one handler of a packet, run in the packet pass; a critical packet's handler throwing faults */
  handle<Name extends ClientboundName> (owner: string, name: Name, handle: (params: BedrockClientboundPackets[Name], ctx: HandlerContext) => void, options: { critical?: boolean } = {}): void {
    this.registering(`a handler of ${name}`)
    const other = this.handlers.get(name)
    if (other !== undefined) throw new Error(`${other.owner} and ${owner} both handle ${name}`)
    // the packet was decoded as `name`
    this.handlers.set(name, { owner, critical: options.critical ?? false, handle: (params, ctx) => { handle(params as BedrockClientboundPackets[Name], ctx) } })
  }

  /** run in the packet pass after the packet's handler, for a module that only reads the packet */
  observe<Name extends ClientboundName> (owner: string, name: Name, observe: (params: BedrockClientboundPackets[Name], ctx: HandlerContext) => void): void {
    this.registering(`an observer of ${name}`)
    const observers = this.observers.get(name) ?? []
    // the packet was decoded as `name`
    observers.push({ owner, critical: false, handle: (params, ctx) => { observe(params as BedrockClientboundPackets[Name], ctx) } })
    this.observers.set(name, observers)
  }

  /** run in the packet pass, in the order the link notices arrived among the packets */
  onNotice (owner: string, run: (notice: LinkNotice, ctx: FrameContext) => void): void {
    this.registering('a link notice hook')
    this.noticeHooks.push({ owner, run })
  }

  system (owner: string, system: SystemDecl): void {
    this.registering(`system ${system.name}`)
    this.systems.push({ owner, system })
  }

  /** run in the input pass, after the commands */
  inputPass (owner: string, run: (ctx: FrameContext) => void): void {
    this.registering('an input pass hook')
    this.inputHooks.push({ owner, run })
  }

  /** run after the frame's ticks */
  lookPass (owner: string, run: (ctx: FrameContext) => void): void {
    this.registering('a look pass hook')
    this.lookHooks.push({ owner, run })
  }

  /** run at a tick's end, before physicsTick */
  endOfTick (owner: string, run: (ctx: TickContext) => void): void {
    this.registering('an end of tick hook')
    this.endOfTickHooks.push({ owner, run })
  }

  /** run at a tick's end, after physicsTick */
  afterTick (owner: string, run: (ctx: TickContext) => void): void {
    this.registering('an after tick hook')
    this.afterTickHooks.push({ owner, run })
  }

  /** the registrations are complete: the schedule is resolved */
  seal (): void {
    const order = resolveSchedule(this.systems.map(({ system }) => system))
    this.schedule = order.map(system => this.systems.find(entry => entry.system === system)).filter(entry => entry !== undefined)
  }

  attach (transport: Transport): void {
    this.transport = transport
  }

  /** an API call: applied in the next frame's input pass, in call order */
  command (run: (ctx: FrameContext) => void): void {
    this.commands.push(run)
  }

  /** a change that takes effect at the start of the next tick that runs */
  stage (commit: () => void): void {
    this.staged.push(commit)
  }

  /** start_game: the ticks start, numbered from 0 */
  startTicks (): void {
    if (this.currentTick !== undefined) throw new Error('the ticks already started (a second start_game)')
    this.currentTick = 0
  }

  get tick (): number | undefined {
    return this.currentTick
  }

  get closed (): boolean {
    return this.ended
  }

  get alpha (): number {
    return this.timer.alpha
  }

  nsToNextTick (): Ns {
    return this.timer.nsToNextTick()
  }

  /** the systems a rewind replays, run for a past tick: their packets are dropped */
  replay (tick: number): void {
    for (const { owner, system } of this.scheduled()) {
      if (system.replay && this.gateOpen(system.gate)) this.guard(owner, () => system.run({ tick, now: this.now, replaying: true, outbox: INERT_OUTBOX }))
    }
  }

  /** an unrecoverable error: the connection closes, and every wait rejects */
  fault (reason: string): void {
    if (this.faulted !== undefined) return
    this.faulted = reason
    const error = new Error(reason)
    this.report(error)
    this.outbox.close()
    this.waits.end(error)
    this.transport?.close()
  }

  stepFrame (now: Ns): void {
    if (this.ended) return
    const refused = this.timer.refuses(now)
    if (refused !== undefined) {
      this.fault(refused)
      return
    }
    const ticks = this.timer.advance(now)
    this.now = now
    if (this.stats.frames === 0) this.guard('core', () => { this.hooks.firstFrame() })
    this.runPacketPass()
    if (!this.ended) {
      this.runInputPass()
      for (let i = 0; i < ticks && this.currentTick !== undefined; i++) this.runTick(this.currentTick + 1)
      for (const hook of this.lookHooks) this.guard(hook.owner, () => { hook.run(this.frameContext(hook.owner)) })
      const batch = this.outbox.flush()
      if (batch.length > 0 && this.transport !== undefined) {
        const transport = this.transport
        this.guard('transport', () => { transport.flush(batch) })
      }
      this.waits.endOfFrame()
    }
    this.stats.frames++
  }

  private runPacketPass (): void {
    this.phase = 'F2'
    for (const entry of this.inbox.drain()) {
      if (this.ended) break
      if (entry.kind === 'notice') {
        for (const hook of this.noticeHooks) this.guard(hook.owner, () => { hook.run(entry.notice, this.frameContext(hook.owner)) })
        if (entry.notice.kind === 'closed') this.end()
        continue
      }
      const stats = this.packetStats(entry.name)
      const handler = this.handlers.get(entry.name)
      const observers = this.observers.get(entry.name) ?? []
      if (handler === undefined && observers.length === 0) {
        stats.unhandled++
        continue
      }
      const contextOf = (owner: string): HandlerContext => ({ ...this.frameContext(owner), arrivalTime: entry.arrivalTime, sequence: entry.sequence })
      if (handler !== undefined && !this.guard(handler.owner, () => { handler.handle(entry.params, contextOf(handler.owner)) })) {
        stats.threw++
        if (handler.critical) this.fault(`the ${entry.name} handler threw`)
        continue
      }
      stats.handled++
      for (const observer of observers) this.guard(observer.owner, () => { observer.handle(entry.params, contextOf(observer.owner)) })
    }
    this.phase = undefined
  }

  private runInputPass (): void {
    this.phase = 'F3'
    const commands = this.commands
    this.commands = []
    for (const command of commands) this.guard('command', () => { command(this.frameContext('command')) })
    for (const hook of this.inputHooks) this.guard(hook.owner, () => { hook.run(this.frameContext(hook.owner)) })
    this.phase = undefined
  }

  private runTick (tick: number): void {
    this.currentTick = tick
    const staged = this.staged
    this.staged = []
    for (const commit of staged) this.guard('staging', commit)
    this.phase = 'T3'
    for (const { owner, system } of this.scheduled()) {
      if (!this.gateOpen(system.gate)) {
        this.stats.gated++
        continue
      }
      this.guard(owner, () => { system.run(this.tickContext(owner, tick)) })
    }
    this.phase = undefined
    for (const hook of this.endOfTickHooks) this.guard(hook.owner, () => { hook.run(this.tickContext(hook.owner, tick)) })
    this.guard('core', () => { this.hooks.tickEnded(tick) })
    for (const hook of this.afterTickHooks) this.guard(hook.owner, () => { hook.run(this.tickContext(hook.owner, tick)) })
    this.waits.endOfTick(tick)
    this.stats.ticks++
  }

  private end (): void {
    this.ended = true
    this.outbox.close()
    this.waits.end(new Error('the bot ended'))
  }

  private scheduled (): ReadonlyArray<{ owner: string, system: SystemDecl }> {
    if (this.schedule === undefined) throw new Error('the core was not sealed')
    return this.schedule
  }

  private gateOpen (gate: Gate): boolean {
    return gate === 'always' || (gate === 'present' ? this.activation.present : this.activation.active)
  }

  private registering (what: string): void {
    if (this.schedule !== undefined) throw new Error(`${what} registered after the core was sealed`)
  }

  private writer (owner: string): OutboxWriter {
    let writer = this.writers.get(owner)
    if (writer === undefined) {
      writer = this.outbox.writer(owner)
      this.writers.set(owner, writer)
    }
    return writer
  }

  private frameContext (owner: string): FrameContext {
    return { now: this.now, tick: this.currentTick, outbox: this.writer(owner) }
  }

  private tickContext (owner: string, tick: number): TickContext {
    return { tick, now: this.now, replaying: false, outbox: this.writer(owner) }
  }

  private packetStats (name: string): PacketStats {
    let stats = this.stats.packets.get(name)
    if (stats === undefined) {
      stats = { handled: 0, threw: 0, unhandled: 0 }
      this.stats.packets.set(name, stats)
    }
    return stats
  }

  /** runs `run`, reporting what it throws; whether it returned */
  private guard (owner: string, run: () => void): boolean {
    try {
      run()
      return true
    } catch (error) {
      this.report(error instanceof Error ? error : new Error(`${owner} threw ${String(error)}`))
      return false
    }
  }

  private report (error: Error): void {
    this.stats.errors++
    try {
      this.hooks.error(error)
    } catch {
      // an error listener that throws itself is not reported again
    }
  }
}
