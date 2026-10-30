import assert from 'assert'
import { EventEmitter } from 'events'
import { Client } from 'bedrock-protocol'
import type { ParsedPacket } from 'bedrock-protocol/src/transforms/serializer.js'
import { BedrockCore } from '../../lib/bedrock/core/core.ts'
import type { InboxWriter, LinkNotice, OutgoingPacket } from '../../lib/bedrock/core/types.ts'
import { monotonicClock, startRealtimeDriver } from '../../lib/bedrock/drivers/realtime.ts'
import { connectTransport, createProtocolClient } from '../../lib/bedrock/transport/adapter.ts'
import type { ProtocolClient } from '../../lib/bedrock/transport/adapter.ts'

/** bedrock-protocol's Client as the adapter sees it: the test emits its events */
class FakeProtocolClient extends EventEmitter implements ProtocolClient {
  readonly calls: string[] = []
  readonly serializer = {
    createPacketBuffer: (packet: { name: string, params: object }): Buffer => {
      if (packet.name === 'text') throw new Error('no text')
      return Buffer.from(packet.name)
    }
  }

  initFails: Error | string | undefined

  init (): void {
    this.calls.push('init')
    if (this.initFails !== undefined) throw this.initFails
    this.emit('connect_allowed')
  }

  connect (): void { this.calls.push('connect') }
  close (): void { this.calls.push('close') }
  sendBuffer (buffer: Buffer): void { this.calls.push(`send ${buffer.toString()}`) }
  onTick (): void { this.calls.push('tick') }
}

function parsed (name: string | number, params: object | undefined, size = 3): ParsedPacket {
  return { data: { name, params }, metadata: { size }, buffer: Buffer.alloc(size), fullBuffer: Buffer.alloc(size) }
}

interface Received { packets: string[], notices: LinkNotice[] }

function recorder (): { inbox: InboxWriter, received: Received } {
  const received: Received = { packets: [], notices: [] }
  return {
    received,
    inbox: {
      packet: (name, _params, size, arrivalTime) => { received.packets.push(`${name} ${size} @${arrivalTime}`) },
      notice: notice => { received.notices.push(notice) }
    }
  }
}

function outgoing (name: OutgoingPacket['name']): OutgoingPacket {
  return { order: 1, name, params: {}, phase: 'T3', tick: 4, owner: 'movement' }
}

describe('bedrock transport', () => {
  describe('the bedrock-protocol adapter', () => {
    it('starts the client, and connects once it may', () => {
      const client = new FakeProtocolClient()
      connectTransport(client, recorder().inbox, () => 0, () => {})
      assert.deepStrictEqual(client.calls, ['init', 'connect'])
    })

    it('hands the received game packets to the inbox, stamped, and nothing of the handshake', () => {
      const client = new FakeProtocolClient()
      const { inbox, received } = recorder()
      let now = 5
      connectTransport(client, inbox, () => now++, () => {})
      client.emit('packet', parsed('network_settings', {}))
      client.emit('packet', parsed('server_to_client_handshake', {}))
      client.emit('packet', parsed(300, undefined))
      client.emit('packet', parsed('play_status', {}, 7))
      client.emit('packet', parsed('start_game', {}, 900))
      assert.deepStrictEqual(received.packets, ['play_status 7 @5', 'start_game 900 @6'])
    })

    it('tells the inbox the connection is up, its errors, and its close 50 ms later, kicked or not', () => {
      for (const kicked of [false, true]) {
        const client = new FakeProtocolClient()
        const { inbox, received } = recorder()
        const delays: Array<{ run: () => void, ms: number }> = []
        connectTransport(client, inbox, () => 0, (run, ms) => { delays.push({ run, ms }) })
        client.emit('status', 2)
        client.emit('status', 1)
        client.emit('error', new Error('socket'))
        if (kicked) client.emit('packet', parsed('disconnect', {}))
        client.emit('close')
        assert.deepStrictEqual(received.notices.map(notice => notice.kind), ['connected', 'error'])
        assert.deepStrictEqual(delays.map(delay => delay.ms), [50])
        delays[0]?.run()
        assert.deepStrictEqual(received.notices[2], { kind: 'closed', byServer: kicked })
      }
    })

    it('closes the client when it cannot start, and says why', () => {
      for (const failure of [new Error('Unsupported version'), 'not an error']) {
        const client = new FakeProtocolClient()
        client.initFails = failure
        const { inbox, received } = recorder()
        connectTransport(client, inbox, () => 0, () => {})
        assert.deepStrictEqual(client.calls, ['init', 'close'])
        const notice = received.notices[0]
        assert.ok(notice?.kind === 'error')
        assert.strictEqual(notice.error.message, String(failure).replace('Error: ', ''))
      }
    })

    it('sends a frame\'s packets as one batch, and none of a batch with a packet it cannot write', () => {
      const client = new FakeProtocolClient()
      const transport = connectTransport(client, recorder().inbox, () => 0, () => {})
      client.calls.length = 0
      transport.flush([outgoing('player_auth_input'), outgoing('subchunk_request')])
      assert.deepStrictEqual(client.calls, ['send player_auth_input', 'send subchunk_request', 'tick'])
      client.calls.length = 0
      assert.throws(() => { transport.flush([outgoing('player_auth_input'), outgoing('text')]) }, { message: 'movement queued text (T3, tick 4), which cannot be written: Error: no text' })
      assert.throws(() => { transport.flush([{ ...outgoing('text'), phase: 'F2', tick: undefined }]) }, { message: 'movement queued text (F2), which cannot be written: Error: no text' })
      assert.deepStrictEqual(client.calls, [])
      transport.close()
      assert.deepStrictEqual(client.calls, ['close'])
    })

    it('makes a client that answers nothing itself and starts when told, with the options given', () => {
      const connection = { host: '127.0.0.1', port: 19132, username: 'test', version: '1.21.130' }
      const client = createProtocolClient({ ...connection, raknetBackend: undefined, connectTimeout: undefined })
      assert.ok(client instanceof Client)
      const { offline, transport, conLog, delayedInit, autoInitPlayer, raknetBackend, connectTimeout } = client.options
      assert.deepStrictEqual({ offline, transport, conLog, delayedInit, autoInitPlayer, raknetBackend, connectTimeout },
        { offline: true, transport: 'raknet', conLog: null, delayedInit: true, autoInitPlayer: false, raknetBackend: 'raknet-native', connectTimeout: 9000 })
      client.close()
      const given = createProtocolClient({ ...connection, raknetBackend: 'jsp-raknet', connectTimeout: 500 })
      assert.ok(given instanceof Client)
      assert.deepStrictEqual([given.options.raknetBackend, given.options.connectTimeout], ['jsp-raknet', 500])
      given.close()
    })
  })

  describe('the realtime driver', () => {
    it('steps a frame just after each tick is due, until the bot ends', () => {
      const core = new BedrockCore({ error: () => {}, firstFrame: () => {}, tickEnded: () => {} })
      core.seal()
      const wakes: Array<{ run: () => void, ms: number }> = []
      let now = 0
      startRealtimeDriver(core, () => now, { set: (run, ms) => { wakes.push({ run, ms }) } })
      assert.deepStrictEqual(wakes.map(wake => wake.ms), [0])
      wakes[0]?.run()
      now = 30_000_000
      wakes[1]?.run()
      assert.deepStrictEqual(wakes.map(wake => wake.ms), [0, 51, 21])
      core.inbox.notice({ kind: 'closed', byServer: false }, now)
      wakes[2]?.run()
      assert.strictEqual(wakes.length, 3)
      assert.strictEqual(core.closed, true)
    })

    it('reads a monotonic clock in nanoseconds', () => {
      const now = monotonicClock()
      const first = now()
      assert.ok(Number.isInteger(first) && first >= 0)
      assert.ok(now() >= first)
    })
  })
})
