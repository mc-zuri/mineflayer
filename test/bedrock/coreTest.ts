import assert from 'assert'
import { BedrockCore } from '../../lib/bedrock/core/core.ts'
import { FrameTimer, TICK_NS } from '../../lib/bedrock/core/frame_timer.ts'
import { History } from '../../lib/bedrock/core/history.ts'
import { resolveSchedule } from '../../lib/bedrock/core/schedule.ts'
import type { SystemDecl } from '../../lib/bedrock/core/schedule.ts'
import type { OutgoingPacket, TickContext } from '../../lib/bedrock/core/types.ts'
import { ManualDriver } from './common/driver.ts'

const MS = 1_000_000

interface Harness {
  core: BedrockCore
  driver: ManualDriver
  /** what happened, in order */
  log: string[]
  errors: Error[]
  batches: OutgoingPacket[][]
  closedTransport: () => boolean
}

function harness (setup: (core: BedrockCore, log: string[]) => void = () => {}): Harness {
  const log: string[] = []
  const errors: Error[] = []
  const batches: OutgoingPacket[][] = []
  let closed = false
  const core = new BedrockCore({
    error: error => { errors.push(error) },
    firstFrame: () => { log.push('first frame') },
    tickEnded: tick => { log.push(`tick ${tick} ended`) }
  })
  setup(core, log)
  core.seal()
  core.attach({ flush: batch => { batches.push([...batch]) }, close: () => { closed = true } })
  return { core, driver: new ManualDriver(core), log, errors, batches, closedTransport: () => closed }
}

function system (name: string, place: SystemDecl['place'], run: (ctx: TickContext) => void = () => {}, gate: SystemDecl['gate'] = 'always', replay = false): SystemDecl {
  return { name, place, gate, replay, run }
}

const names = (batch: OutgoingPacket[] | undefined): string[] => (batch ?? []).map(packet => `${packet.owner}:${packet.phase}:${packet.tick ?? '-'}`)

describe('bedrock core', () => {
  describe('frame timer', () => {
    it('starts with the first frame, then runs a tick per 50 ms, carrying the rest', () => {
      const timer = new FrameTimer()
      assert.strictEqual(timer.advance(1000 * MS), 0)
      assert.strictEqual(timer.advance(1050 * MS), 1)
      assert.deepStrictEqual([10, 20, 30, 40].map(ms => timer.advance((1050 + ms) * MS)), [0, 0, 0, 0])
      assert.strictEqual(timer.alpha, 0.8)
      assert.strictEqual(timer.nsToNextTick(), 10 * MS)
      assert.strictEqual(timer.advance(1100 * MS), 1)
      assert.strictEqual(timer.alpha, 0)
    })

    it('runs at most two ticks after a stall, dropping the backlog', () => {
      const timer = new FrameTimer()
      timer.advance(0)
      timer.advance(30 * MS)
      assert.strictEqual(timer.advance(1030 * MS), 2)
      assert.strictEqual(timer.nsToNextTick(), 20 * MS)
    })

    it('refuses a time that goes back or is not whole nanoseconds', () => {
      const timer = new FrameTimer()
      timer.advance(TICK_NS)
      assert.throws(() => timer.advance(TICK_NS - 1), { message: `frame time went back from ${TICK_NS} to ${TICK_NS - 1}` })
      assert.throws(() => timer.advance(TICK_NS + 0.5), { message: `frame time ${TICK_NS + 0.5} is not an integer of nanoseconds` })
    })
  })

  describe('a frame', () => {
    it('handles the packets received before it in its packet pass, in arrival order, among the link notices', async () => {
      const { core, driver, log } = harness((core, log) => {
        core.handle('test', 'set_time', (params, ctx) => { log.push(`set_time ${params.time} #${ctx.sequence} at ${ctx.arrivalTime}`) })
        core.handle('test', 'start_game', () => { log.push('start_game') })
        core.onNotice('test', notice => { log.push(notice.kind) })
      })
      core.inbox.packet('set_time', { time: 1 }, 3, 0)
      core.inbox.notice({ kind: 'connected' }, 0)
      core.inbox.packet('start_game', {}, 3, 0)
      core.inbox.packet('set_time', { time: 2 }, 3, 0)
      assert.deepStrictEqual(log, [])
      await driver.frame(0)
      assert.deepStrictEqual(log, ['first frame', 'set_time 1 #1 at 0', 'connected', 'start_game', 'set_time 2 #4 at 0'])
      assert.deepStrictEqual(core.stats.packets.get('set_time'), { handled: 2, threw: 0, unhandled: 0 })
    })

    it('counts a packet no one handles', async () => {
      const { core, driver } = harness()
      core.inbox.packet('text', {}, 1, 0)
      await driver.frame(0)
      assert.deepStrictEqual(core.stats.packets.get('text'), { handled: 0, threw: 0, unhandled: 1 })
    })

    it('leaves a packet received during the frame to the next one', async () => {
      const { driver, log } = harness((core, log) => {
        core.handle('test', 'set_time', params => { log.push(`set_time ${params.time}`) })
        core.inputPass('test', ctx => { core.inbox.packet('set_time', { time: 2 }, 3, ctx.now) })
      })
      await driver.frame(0)
      assert.deepStrictEqual(log, ['first frame'])
      await driver.frame(0)
      assert.deepStrictEqual(log, ['first frame', 'set_time 2'])
    })

    it('runs commands, then the input pass, the ticks, the look pass and one flush; promises continue after it', async () => {
      const { core, driver, log, batches } = harness((core, log) => {
        core.handle('session', 'start_game', (_params, ctx) => {
          core.startTicks()
          log.push('start_game')
          ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n })
        })
        core.inputPass('input', () => { log.push('input pass') })
        core.system('movement', system('move', { at: 'PredictedMovementSystem' }, ctx => {
          log.push(`move ${ctx.tick}`)
          ctx.outbox.queue('set_local_player_as_initialized', { runtime_entity_id: BigInt(ctx.tick) })
        }))
        core.lookPass('input', () => { log.push('look pass') })
        core.endOfTick('session', ctx => { log.push(`end of tick ${ctx.tick}`) })
        core.afterTick('movement', ctx => { log.push(`after tick ${ctx.tick}`) })
      })
      await driver.frame(0)
      core.inbox.packet('start_game', {}, 1, 0)
      core.command(ctx => {
        log.push('command')
        ctx.outbox.queue('tick_sync', { request_time: 1n, response_time: 0n })
      })
      core.waits.untilTick(2).then(() => { log.push('waited') })
      log.length = 0
      core.stepFrame(driver.now + 2 * TICK_NS)
      assert.deepStrictEqual(log, [
        'start_game', 'command', 'input pass',
        'move 1', 'end of tick 1', 'tick 1 ended', 'after tick 1',
        'move 2', 'end of tick 2', 'tick 2 ended', 'after tick 2',
        'look pass'
      ])
      await driver.frame(0)
      assert.strictEqual(log[log.length - 1], 'waited')
      assert.deepStrictEqual(names(batches[0]), ['session:F2:0', 'command:F3:0', 'movement:T3:1', 'movement:T3:2'])
      assert.deepStrictEqual(batches[0]?.map(packet => packet.order), [1, 2, 3, 4])
      assert.strictEqual(batches.length, 1)
    })

    it('runs no tick before start_game started them, and numbers them from 1 after it', async () => {
      const { core, driver, log } = harness()
      await driver.ticks(2)
      await driver.frame(10)
      assert.strictEqual(core.alpha, 0.2)
      assert.strictEqual(core.tick, undefined)
      core.startTicks()
      await driver.ticks(2)
      assert.deepStrictEqual(log, ['first frame', 'tick 1 ended', 'tick 2 ended'])
      assert.throws(() => { core.startTicks() }, { message: 'the ticks already started (a second start_game)' })
    })

    it('commits staged changes at the start of the next tick that runs', async () => {
      const { core, driver, log } = harness((core, log) => {
        core.system('world', system('read', { at: 'LocalPlayerRewindSystem' }, () => { log.push('system') }))
      })
      core.startTicks()
      await driver.frame(0)
      core.stage(() => { log.push('commit') })
      await driver.frame(10)
      assert.deepStrictEqual(log, ['first frame'])
      await driver.tick()
      assert.deepStrictEqual(log, ['first frame', 'commit', 'system', 'tick 1 ended'])
    })

    it('flushes the packet pass\'s replies in a frame that runs no tick, and nothing when nothing was queued', async () => {
      const { core, driver, batches } = harness(core => {
        core.handle('session', 'network_stack_latency', (_params, ctx) => { ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n }) })
      })
      await driver.frame(0)
      assert.strictEqual(batches.length, 0)
      core.inbox.packet('network_stack_latency', {}, 1, 0)
      await driver.frame(10)
      assert.deepStrictEqual(names(batches[0]), ['session:F2:-'])
    })

    it('refuses a packet queued outside the frame\'s passes', () => {
      let outbox: TickContext['outbox'] | undefined
      const { core } = harness(core => { core.inputPass('input', ctx => { outbox = ctx.outbox }) })
      core.stepFrame(0)
      assert.throws(() => outbox?.queue('tick_sync', { request_time: 0n, response_time: 0n }), { message: 'input queued tick_sync outside a packet pass, input pass or tick' })
    })
  })

  describe('systems', () => {
    it('run at their anchors and next to each other', () => {
      const order = resolveSchedule([
        system('send', { at: 'SendPlayerInputPacketSystem' }),
        system('after send', { after: 'send' }),
        system('rewind', { at: 'LocalPlayerRewindSystem' }),
        system('requests', { after: 'after send' }),
        system('before send', { before: 'send' }),
        system('input', { at: 'ClientInputUpdateSystem' })
      ])
      assert.deepStrictEqual(order.map(entry => entry.name), ['rewind', 'input', 'before send', 'send', 'after send', 'requests'])
    })

    it('are refused when their order is not one', () => {
      assert.throws(() => resolveSchedule([system('a', { at: 'HitResultSystem' }), system('b', { at: 'HitResultSystem' })]), { message: 'a and b are both at HitResultSystem' })
      assert.throws(() => resolveSchedule([system('a', { at: 'HitResultSystem' }), system('b', { after: 'a' }), system('c', { after: 'a' })]), { message: 'b and c are both after a' })
      assert.throws(() => resolveSchedule([system('a', { at: 'HitResultSystem' }), system('b', { before: 'a' }), system('c', { before: 'a' })]), { message: 'b and c are both before a' })
      assert.throws(() => resolveSchedule([system('a', { at: 'HitResultSystem' }), system('a', { after: 'a' })]), { message: 'two systems are named a' })
      assert.throws(() => resolveSchedule([system('b', { after: 'c' }), system('c', { before: 'b' })]), { message: 'no system to place b after c, c before b' })
    })

    it('run only while their gate is open; a rewind replays only the replaying ones, dropping their packets', async () => {
      const ran: string[] = []
      const record = (ctx: TickContext, name: string): void => {
        ran.push(`${name} ${ctx.tick}${ctx.replaying ? ' replayed' : ''}`)
        ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n })
      }
      const { core, driver, batches } = harness(core => {
        core.system('m', system('always', { at: 'LocalPlayerRewindSystem' }, ctx => { record(ctx, 'always') }))
        core.system('m', system('present', { at: 'ClientInputUpdateSystem' }, ctx => { record(ctx, 'present') }, 'present', true))
        core.system('m', system('active', { at: 'PredictedMovementSystem' }, ctx => { record(ctx, 'active') }, 'active', true))
      })
      core.startTicks()
      await driver.frame(0)
      await driver.tick()
      core.activation.present = true
      await driver.tick()
      core.activation.active = true
      await driver.tick()
      core.replay(2)
      core.activation.active = false
      core.replay(3)
      assert.deepStrictEqual(ran, ['always 1', 'always 2', 'present 2', 'always 3', 'present 3', 'active 3', 'present 2 replayed', 'active 2 replayed', 'present 3 replayed'])
      assert.strictEqual(core.stats.gated, 3)
      assert.strictEqual(batches.flat().length, 6)
    })

    it('are registered before the core is sealed, and a packet has one handler', () => {
      const core = new BedrockCore({ error: () => {}, firstFrame: () => {}, tickEnded: () => {} })
      core.handle('a', 'set_time', () => {})
      assert.throws(() => { core.handle('b', 'set_time', () => {}) }, { message: 'a and b both handle set_time' })
      assert.throws(() => { core.replay(1) }, { message: 'the core was not sealed' })
      core.seal()
      assert.throws(() => { core.system('a', system('late', { at: 'HitResultSystem' })) }, { message: 'system late registered after the core was sealed' })
      assert.throws(() => { core.onNotice('a', () => {}) }, { message: 'a link notice hook registered after the core was sealed' })
      assert.throws(() => { core.inputPass('a', () => {}) }, { message: 'an input pass hook registered after the core was sealed' })
      assert.throws(() => { core.lookPass('a', () => {}) }, { message: 'a look pass hook registered after the core was sealed' })
      assert.throws(() => { core.endOfTick('a', () => {}) }, { message: 'an end of tick hook registered after the core was sealed' })
      assert.throws(() => { core.afterTick('a', () => {}) }, { message: 'an after tick hook registered after the core was sealed' })
      assert.throws(() => { core.handle('a', 'start_game', () => {}) }, { message: 'a handler of start_game registered after the core was sealed' })
    })
  })

  describe('errors', () => {
    it('are reported, and the frame goes on', async () => {
      const { core, driver, errors, log } = harness((core, log) => {
        core.handle('test', 'set_time', () => { throw new Error('handler') })
        core.handle('test', 'text', () => { log.push('text') })
        core.system('test', system('failing', { at: 'HitResultSystem' }, () => { throw new Error('system') }))
        core.endOfTick('test', () => { throw new Error('hook') })
        core.inputPass('test', () => { throw 'not an error' }) // eslint-disable-line no-throw-literal
      })
      core.startTicks()
      core.inbox.packet('set_time', {}, 1, 0)
      core.inbox.packet('text', {}, 1, 0)
      await driver.frame(0)
      await driver.tick()
      assert.deepStrictEqual(errors.map(error => error.message), ['handler', 'test threw not an error', 'test threw not an error', 'system', 'hook'])
      assert.deepStrictEqual(log, ['first frame', 'text', 'tick 1 ended'])
      assert.deepStrictEqual(core.stats.packets.get('set_time'), { handled: 0, threw: 1, unhandled: 0 })
      assert.strictEqual(core.stats.errors, 5)
    })

    it('of a critical handler fault: the connection closes and the waits reject', async () => {
      const { core, driver, errors, closedTransport } = harness(core => {
        core.handle('session', 'start_game', () => { throw new Error('bad start_game') }, { critical: true })
      })
      const rejected = assert.rejects(core.waits.untilTick(1), { message: 'the start_game handler threw' })
      core.inbox.packet('start_game', {}, 1, 0)
      await driver.frame(0)
      assert.deepStrictEqual(errors.map(error => error.message), ['bad start_game', 'the start_game handler threw'])
      assert.strictEqual(closedTransport(), true)
      await rejected
      core.fault('again')
      assert.strictEqual(errors.length, 2)
    })

    it('reported to a listener that throws are not reported again', async () => {
      const core = new BedrockCore({ error: () => { throw new Error('listener') }, firstFrame: () => {}, tickEnded: () => {} })
      core.handle('test', 'set_time', () => { throw new Error('handler') })
      core.seal()
      core.inbox.packet('set_time', {}, 1, 0)
      core.stepFrame(0)
      assert.strictEqual(core.stats.errors, 1)
    })

    it('of time going back fault', async () => {
      const { core, driver, errors } = harness()
      await driver.frame(10)
      core.stepFrame(0)
      assert.deepStrictEqual(errors.map(error => error.message), [`frame time went back from ${10 * MS} to 0`])
    })

    it('of a transport\'s flush are reported', async () => {
      const errors: Error[] = []
      const core = new BedrockCore({ error: error => { errors.push(error) }, firstFrame: () => {}, tickEnded: () => {} })
      core.handle('session', 'network_stack_latency', (_params, ctx) => { ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n }) })
      core.seal()
      core.attach({ flush: () => { throw new Error('socket') }, close: () => {} })
      core.inbox.packet('network_stack_latency', {}, 1, 0)
      core.stepFrame(0)
      assert.deepStrictEqual(errors.map(error => error.message), ['socket'])
    })
  })

  describe('the inbox', () => {
    it('faults when a packet arrives before the previous one', async () => {
      const { core, errors } = harness()
      core.inbox.packet('text', {}, 1, 20)
      core.inbox.packet('text', {}, 1, 10)
      core.inbox.notice({ kind: 'connected' }, 15)
      assert.deepStrictEqual(errors.map(error => error.message), ['a packet arrived at 10, before the previous one (20)'])
      assert.strictEqual(core.inbox.size, 1)
    })

    it('faults rather than dropping a packet when full', async () => {
      const { core, errors } = harness()
      for (let i = 0; i < 8193; i++) core.inbox.packet('text', {}, 1, 0)
      assert.deepStrictEqual(errors.map(error => error.message), ['the inbox overflowed: 8192 entries, 8192 bytes'])
      const big = harness()
      big.core.inbox.packet('level_chunk', {}, 64 * 1024 * 1024, 0)
      big.core.inbox.notice({ kind: 'connected' }, 0)
      big.core.inbox.packet('level_chunk', {}, 1, 0)
      assert.deepStrictEqual(big.errors.map(error => error.message), [`the inbox overflowed: 2 entries, ${64 * 1024 * 1024} bytes`])
    })

    it('counts only the bytes still waiting', async () => {
      const { core, driver, errors } = harness()
      core.inbox.packet('level_chunk', {}, 64 * 1024 * 1024, 0)
      await driver.frame(0)
      core.inbox.packet('level_chunk', {}, 64 * 1024 * 1024, 0)
      assert.deepStrictEqual(errors, [])
    })
  })

  describe('the outbox', () => {
    it('faults when full, and drops what is queued after the connection closed', async () => {
      const { driver, errors, batches } = harness(core => {
        core.inputPass('flood', ctx => { for (let i = 0; i < 8193; i++) ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n }) })
      })
      await driver.frame(0)
      assert.deepStrictEqual(errors.map(error => error.message), ['the outbox overflowed: 8192 packets'])
      assert.strictEqual(batches.length, 0)
    })

    it('closes with the connection: what is queued after is counted', async () => {
      let queue: (() => void) | undefined
      const { core, driver, batches, log } = harness((core, log) => {
        core.onNotice('session', (notice, ctx) => {
          log.push(notice.kind)
          queue = () => { ctx.outbox.queue('tick_sync', { request_time: 0n, response_time: 0n }) }
        })
        core.handle('session', 'text', () => { log.push('text') })
      })
      const rejected = assert.rejects(core.waits.until(() => false, 100, 'never'), { message: 'the bot ended' })
      core.inbox.notice({ kind: 'closed', byServer: true }, 0)
      core.inbox.packet('text', {}, 1, 0)
      await driver.frame(0)
      queue?.()
      assert.deepStrictEqual(log, ['first frame', 'closed'])
      assert.strictEqual(core.closed, true)
      await rejected
      await assert.rejects(core.waits.untilTick(5), { message: 'the bot ended' })
      await assert.rejects(core.waits.until(() => true, 1, 'never'), { message: 'the bot ended' })
      core.command(() => { log.push('command') })
      await driver.frame(0)
      assert.deepStrictEqual(log, ['first frame', 'closed'])
      assert.deepStrictEqual(batches, [])
    })
  })

  describe('waits', () => {
    it('resolve at the end of their tick, or of the first frame their condition holds', async () => {
      const { core, driver } = harness()
      core.startTicks()
      await driver.frame(0)
      let ready = false
      const done: string[] = []
      core.waits.untilTick(2).then(() => { done.push(`tick 2 at ${core.tick ?? '-'}`) })
      core.waits.until(() => ready, 10, 'not ready').then(() => { done.push(`ready at ${core.tick ?? '-'}`) })
      await driver.tick()
      assert.deepStrictEqual(done, [])
      ready = true
      await driver.frame(10)
      assert.deepStrictEqual(done, ['ready at 1'])
      await driver.tick()
      assert.deepStrictEqual(done, ['ready at 1', 'tick 2 at 2'])
    })

    it('time out on their last tick', async () => {
      const { core, driver } = harness()
      core.startTicks()
      await driver.frame(0)
      let rejected: string | undefined
      core.waits.until(() => false, 3, 'too slow').catch((error: Error) => { rejected = error.message })
      await driver.ticks(2)
      assert.strictEqual(rejected, undefined)
      await driver.tick()
      assert.strictEqual(rejected, 'too slow')
    })

    it('are met on their last tick if their condition holds then', async () => {
      const { core, driver } = harness()
      core.startTicks()
      await driver.frame(0)
      let met = false
      core.waits.until(() => core.tick === 1, 1, 'too slow').then(() => { met = true })
      await driver.tick()
      assert.strictEqual(met, true)
    })
  })

  it('makes two cores in one process run alike, sharing nothing', async () => {
    const run = async (): Promise<OutgoingPacket[][]> => {
      const { core, driver, batches } = harness(core => {
        core.system('m', system('send', { at: 'SendPlayerInputPacketSystem' }, ctx => { ctx.outbox.queue('tick_sync', { request_time: BigInt(ctx.tick), response_time: 0n }) }))
      })
      core.startTicks()
      await driver.frame(0)
      await driver.ticks(3)
      return batches
    }
    const [a, b] = await Promise.all([run(), run()])
    assert.deepStrictEqual(a, b)
    assert.strictEqual(a.length, 3)
  })

  describe('history', () => {
    it('keeps the last ticks, from one to a thousand', () => {
      const history = new History<string, number, string>()
      history.resize(0)
      assert.strictEqual(history.capacity, 1)
      history.resize(5000)
      assert.strictEqual(history.capacity, 1000)
      history.resize(3)
      for (const tick of [1, 2, 3, 4]) history.record(tick, `input ${tick}`, tick * 10)
      assert.deepStrictEqual([history.oldest, history.newest], [2, 4])
      assert.strictEqual(history.get(3)?.input, 'input 3')
      assert.strictEqual(history.get(1), undefined)
      assert.deepStrictEqual(history.from(3).map(record => record.snapshot), [30, 40])
    })

    it('starts again after a gap, and empty', () => {
      const history = new History<string, number, string>()
      history.resize(5)
      assert.strictEqual(history.get(1), undefined)
      history.record(1, 'a', 1)
      history.record(3, 'c', 3)
      assert.deepStrictEqual([history.oldest, history.newest], [3, 3])
      history.clear()
      assert.deepStrictEqual([history.oldest, history.newest], [undefined, undefined])
    })

    it('files packets on their tick; the oldest filed record anchors a rewind', () => {
      const history = new History<string, number, string>()
      history.resize(5)
      for (const tick of [1, 2, 3]) history.record(tick, '', tick)
      assert.strictEqual(history.pending, false)
      history.file(3, 'late')
      history.file(2, 'early')
      assert.strictEqual(history.anchor?.tick, 2)
      assert.strictEqual(history.pending, true)
      assert.throws(() => { history.file(9, 'ahead') }, { message: 'no record of tick 9 to file on' })
      history.clearFilings()
      assert.strictEqual(history.pending, false)
      assert.deepStrictEqual(history.get(3)?.filings, [])
    })
  })
})
