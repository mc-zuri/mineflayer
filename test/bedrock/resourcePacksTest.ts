import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'

// The packs the vanilla client was offered by Bedrock Dedicated Server (protocol_packs, 1.26.20.4, 1.26.51.1,
// 1.26.60.5): one texture pack the server requires (must_accept). The client asked for it (send_packs
// `<uuid>_<version>`), asked for every chunk at once after resource_pack_data_info, told have_all_packs after the last
// chunk and completed after resource_pack_stack. Offered no pack (every other recording), it told have_all_packs at
// once. No recording has a refusal, a behaviour pack, two packs or a URL: those are constructed.

/** the recorded pack's uuid as the uuid type reads it (from 1.21.50), and as it is (resource_pack_stack's) */
const WIRE_UUID = '1e4b436a-3e0f-0c5f-031c-6a7f5e0b2c9d'
const PACK_UUID = '5f0c0f3e-6a43-4b1e-9d2c-0b5e7f6a1c03'
const PACK_ID = `${PACK_UUID}_1.0.0`

type Offer = ClientboundPacketsToWrite['resource_packs_info']
type TexturePack = Offer['texture_packs'][number]
type BehaviourPack = NonNullable<Offer['behaviour_packs']>[number]

const atLeast = (version: BedrockVersion, since: BedrockVersion): boolean => isBedrockVersionAtLeast(version, since)

/** a texture pack's entry as the version lays it out, its uuid as the version's servers write it */
function texturePack (version: BedrockVersion, uuid: string, packVersion: string, cdnUrl = ''): TexturePack {
  return {
    uuid,
    version: packVersion,
    size: 1402435n,
    content_key: '',
    sub_pack_name: '',
    content_identity: '',
    has_scripts: false,
    ...atLeast(version, 'bedrock_1.21.20') ? { addon_pack: false } : {},
    rtx_enabled: false,
    ...atLeast(version, 'bedrock_1.21.42') ? { cdn_url: cdnUrl } : {}
  }
}

function behaviourPack (version: BedrockVersion, uuid: string, packVersion: string): BehaviourPack {
  return {
    uuid,
    version: packVersion,
    size: 1000n,
    content_key: '',
    sub_pack_name: '',
    content_identity: '',
    has_scripts: false,
    ...atLeast(version, 'bedrock_1.21.20') ? { addon_pack: false } : {}
  }
}

/** the pack's id field: package_id up to 1.16.210 */
function packIdField (version: BedrockVersion, id: string): { pack_id: string } | { package_id: string } {
  return atLeast(version, 'bedrock_1.16.220') ? { pack_id: id } : { package_id: id }
}

interface PacksBot extends TestBot {
  /** the resourcePack events since the last call, each as a line */
  offered: () => string[]
  errors: string[]
}

/** a bot whose resourcePack listener calls `decide` (none: no decision) */
async function packsBot (version: BedrockVersion, decide?: (bot: TestBot['bot']) => void): Promise<PacksBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  let lines: string[] = []
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  testBot.bot.on('resourcePack', (url, hash, uuid) => {
    lines.push(`${url === '' ? '-' : url} ${String(hash)} ${String(uuid)}`)
    decide?.(testBot.bot)
  })
  const offered = (): string[] => {
    const fresh = lines
    lines = []
    return fresh
  }
  return { ...testBot, offered, errors }
}

/** the bot's packets of the last flush, with where it queued them */
function lastFlush (server: FakeBedrockClient): string[] {
  return (server.batches.at(-1) ?? []).map(packet => `${packet.name} ${packet.phase}`)
}

/** the packs the bot answered since `from` packets were sent */
function answers (server: FakeBedrockClient, from: number): object[] {
  return server.sent.slice(from).map(({ name, params }) => ({ name, ...params }))
}

/** the bot's resource pack packets since `from`, as written */
function written (server: FakeBedrockClient, from: number): string[] {
  return server.batches.flat().slice(from).map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
}

/** an offer of the recorded pack, laid out as the version does, its uuid as the version's servers write it */
function offerRecordedPack (server: FakeBedrockClient, version: BedrockVersion): void {
  server.send('resource_packs_info', {
    must_accept: true,
    texture_packs: [texturePack(version, atLeast(version, 'bedrock_1.21.50') ? WIRE_UUID : PACK_UUID, '1.0.0')]
  })
}

function sendChunk (server: FakeBedrockClient, version: BedrockVersion, id: string, index: number): void {
  server.send('resource_pack_chunk_data', { ...packIdField(version, id), chunk_index: index, progress: BigInt(index * 102400), payload: Buffer.from([index]) })
}

/** a download of the recorded pack in 3 chunks, accepted, then the stack: what the bot sent at each step */
async function download (version: BedrockVersion): Promise<{ steps: object[][], flushes: string[][], offered: string[] }> {
  const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
  const steps: object[][] = []
  const flushes: string[][] = []
  const step = async (send: () => void): Promise<void> => {
    const from = server.sent.length
    send()
    await driver.frame(0)
    steps.push(answers(server, from))
    flushes.push(server.sent.length > from ? lastFlush(server) : [])
  }
  await step(() => { offerRecordedPack(server, version) })
  await step(() => { server.send('resource_pack_data_info', { ...packIdField(version, PACK_ID), max_chunk_size: 102400, chunk_count: 3 }) })
  await step(() => { sendChunk(server, version, PACK_ID, 2) })
  await step(() => { sendChunk(server, version, PACK_ID, 0) })
  await step(() => { sendChunk(server, version, PACK_ID, 1) })
  await step(() => { server.send('resource_pack_stack') })
  return { steps, flushes, offered: offered() }
}

describe('bedrock resource packs', () => {
  describe('responses with a status byte (1.16.201 – 1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.26.30')) {
      describe(`bedrock ${version}`, () => {
        it('has all packs when none is offered, then is done', async () => {
          const { server, driver, offered } = await packsBot(version)
          server.send('resource_packs_info')
          server.send('resource_pack_stack')
          await driver.frame(0)
          assert.deepStrictEqual(answers(server, 0), [
            { name: 'resource_pack_client_response', response_status: 'have_all_packs', resourcepackids: [] },
            { name: 'resource_pack_client_response', response_status: 'completed', resourcepackids: [] }
          ])
          assert.deepStrictEqual([offered(), server.batches.length], [[], 1])
        })

        it('has all packs offered when no listener decides', async () => {
          const { server, driver, offered } = await packsBot(version)
          offerRecordedPack(server, version)
          await driver.frame(0)
          assert.deepStrictEqual(offered(), [`- undefined ${PACK_UUID}`])
          assert.deepStrictEqual(answers(server, 0), [{ name: 'resource_pack_client_response', response_status: 'have_all_packs', resourcepackids: [] }])
        })

        it('downloads the packs accepted: every chunk asked at once, have_all_packs after the last', async () => {
          const ids = packIdField(version, PACK_ID)
          assert.deepStrictEqual(await download(version), {
            offered: [`- undefined ${PACK_UUID}`],
            steps: [
              [{ name: 'resource_pack_client_response', response_status: 'send_packs', resourcepackids: [PACK_ID] }],
              [0, 1, 2].map(index => ({ name: 'resource_pack_chunk_request', ...ids, chunk_index: index })),
              [],
              [],
              [{ name: 'resource_pack_client_response', response_status: 'have_all_packs', resourcepackids: [] }],
              [{ name: 'resource_pack_client_response', response_status: 'completed', resourcepackids: [] }]
            ],
            flushes: [
              ['resource_pack_client_response F2'],
              ['resource_pack_chunk_request F2', 'resource_pack_chunk_request F2', 'resource_pack_chunk_request F2'],
              [],
              [],
              ['resource_pack_client_response F2'],
              ['resource_pack_client_response F2']
            ]
          })
        })

        it('refuses the packs denied', async () => {
          const { server, driver } = await packsBot(version, bot => { bot.denyResourcePack() })
          offerRecordedPack(server, version)
          await driver.frame(0)
          assert.deepStrictEqual(answers(server, 0), [{ name: 'resource_pack_client_response', response_status: 'refused', resourcepackids: [] }])
          assert.deepStrictEqual(lastFlush(server), ['resource_pack_client_response F2'])
        })
      })
    }
  })

  describe('responses with a status and its name (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      describe(`bedrock ${version}`, () => {
        it('has all packs when none is offered, then is done', async () => {
          const { server, driver, offered } = await packsBot(version)
          server.send('resource_packs_info')
          server.send('resource_pack_stack')
          await driver.frame(0)
          assert.deepStrictEqual(answers(server, 0), [
            { name: 'resource_pack_client_response', response_status: 'have_all_packs', response_status_name: 'downloadingfinished' },
            { name: 'resource_pack_client_response', response_status: 'completed', response_status_name: 'resourcepackstackfinished' }
          ])
          assert.deepStrictEqual([offered(), server.batches.length], [[], 1])
        })

        it('has all packs offered when no listener decides', async () => {
          const { server, driver, offered } = await packsBot(version)
          offerRecordedPack(server, version)
          await driver.frame(0)
          assert.deepStrictEqual(offered(), [`- undefined ${PACK_UUID}`])
          assert.deepStrictEqual(answers(server, 0), [{ name: 'resource_pack_client_response', response_status: 'have_all_packs', response_status_name: 'downloadingfinished' }])
        })

        it('downloads the packs accepted: every chunk asked at once, have_all_packs after the last', async () => {
          assert.deepStrictEqual(await download(version), {
            offered: [`- undefined ${PACK_UUID}`],
            steps: [
              [{ name: 'resource_pack_client_response', response_status: 'send_packs', response_status_name: 'downloading', resourcepackids: [PACK_ID] }],
              [0, 1, 2].map(index => ({ name: 'resource_pack_chunk_request', pack_id: PACK_ID, chunk_index: index })),
              [],
              [],
              [{ name: 'resource_pack_client_response', response_status: 'have_all_packs', response_status_name: 'downloadingfinished' }],
              [{ name: 'resource_pack_client_response', response_status: 'completed', response_status_name: 'resourcepackstackfinished' }]
            ],
            flushes: [
              ['resource_pack_client_response F2'],
              ['resource_pack_chunk_request F2', 'resource_pack_chunk_request F2', 'resource_pack_chunk_request F2'],
              [],
              [],
              ['resource_pack_client_response F2'],
              ['resource_pack_client_response F2']
            ]
          })
        })

        it('refuses the packs denied, by the server\'s name of the status', async () => {
          const { server, driver } = await packsBot(version, bot => { bot.denyResourcePack() })
          offerRecordedPack(server, version)
          await driver.frame(0)
          assert.deepStrictEqual(answers(server, 0), [{ name: 'resource_pack_client_response', response_status: 'refused', response_status_name: 'cancel' }])
          assert.deepStrictEqual(lastFlush(server), ['resource_pack_client_response F2'])
        })
      })
    }
  })

  // the recorded packets, byte for byte, in the versions laying them out alike
  const recordedDownloads: Array<{ versions: BedrockVersion[], info: string, dataInfo: string, sendPacks: string, haveAllPacks: string, completed: string }> = [
    {
      // 1.26.20.4: the status a byte, the lists counted by a 16-bit length
      versions: bedrockTestVersionsFrom('bedrock_1.21.130', 'bedrock_1.26.30'),
      info: '06010000000000000000000000000000000000000005302e302e3001001e4b436a3e0f0c5f031c6a7f5e0b2c9d05312e302e30436615000000000000002435663063306633652d366134332d346231652d396432632d30623565376636613163303300000000',
      dataInfo: '522a35663063306633652d366134332d346231652d396432632d3062356537663661316330335f312e302e30009001000e0000001d6815000000000020b4c67ad3cc7a75a7e382ae8d992cc0e519a2631c1e3cb9b3b75df001d7dd66ff0006',
      sendPacks: '080201002a35663063306633652d366134332d346231652d396432632d3062356537663661316330335f312e302e30',
      haveAllPacks: '08030000',
      completed: '08040000'
    },
    {
      // 1.26.60.5 (1.26.51.1's but for the hash): the status a varint and its name
      versions: bedrockTestVersionsFrom('bedrock_1.26.40'),
      info: '06010000000000000000000000000000000000000005302e302e30011e4b436a3e0f0c5f031c6a7f5e0b2c9d05312e302e30436615000000000000002435663063306633652d366134332d346231652d396432632d30623565376636613163303300000000',
      dataInfo: '522a35663063306633652d366134332d346231652d396432632d3062356537663661316330335f312e302e30009001000e0000001d6815000000000020a6be139f4b5c9e506383b234d84aacc11d4baa32eec2c0ea2c2bd7f8247ac2690006',
      sendPacks: '08010b646f776e6c6f6164696e67012a35663063306633652d366134332d346231652d396432632d3062356537663661316330335f312e302e30',
      haveAllPacks: '080213646f776e6c6f6164696e6766696e6973686564',
      completed: '0803197265736f757263657061636b737461636b66696e6973686564'
    }
  ]
  const RECORDED_STACK = '0701012435663063306633652d366134332d346231652d396432632d30623565376636613163303305312e302e3000012a000000000000'
  // the order the chunks came in
  const RECORDED_CHUNK_ORDER = [0, 2, 6, 13, 12, 11, 10, 9, 8, 5, 7, 4, 1, 3]
  const recordedRequest = (index: number): string => `542a35663063306633652d366134332d346231652d396432632d3062356537663661316330335f312e302e30${index.toString(16).padStart(2, '0')}000000`

  for (const recorded of recordedDownloads) {
    describe(`the recorded download, byte for byte (${recorded.versions[0] ?? '-'} – ${recorded.versions.at(-1) ?? '-'})`, () => {
      for (const version of recorded.versions) {
        it(`bedrock ${version}: asks for the pack, its 14 chunks in one flush, and has it after the last`, async () => {
          const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
          server.receive(Buffer.from(recorded.info, 'hex'))
          await driver.frame(0)
          assert.deepStrictEqual([offered(), written(server, 0)], [[`- undefined ${PACK_UUID}`], [recorded.sendPacks]])
          server.receive(Buffer.from(recorded.dataInfo, 'hex'))
          await driver.frame(0)
          assert.deepStrictEqual([server.batches.length, written(server, 1)], [2, Array.from({ length: 14 }, (_, index) => recordedRequest(index))])
          for (const index of RECORDED_CHUNK_ORDER) {
            assert.strictEqual(written(server, 15).length, 0, `have_all_packs before chunk ${index}`)
            sendChunk(server, version, PACK_ID, index)
            await driver.frame(0)
          }
          server.receive(Buffer.from(RECORDED_STACK, 'hex'))
          await driver.frame(0)
          assert.deepStrictEqual(written(server, 15), [recorded.haveAllPacks, recorded.completed])
        })
      }
    })
  }

  describe('the packs an offer names, by how the version lays it out', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.15')) {
      it(`bedrock ${version}: texture and behaviour packs by their uuid strings, no URL`, async () => {
        const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
        server.send('resource_packs_info', {
          texture_packs: [texturePack(version, PACK_UUID, '1.0.0'), texturePack(version, '0a000000-0000-4000-8000-000000000001', '2.1.0')],
          behaviour_packs: [behaviourPack(version, '0b000000-0000-4000-8000-000000000002', '0.3.0')]
        })
        await driver.frame(0)
        assert.deepStrictEqual(offered(), [
          `- undefined ${PACK_UUID}`,
          '- undefined 0a000000-0000-4000-8000-000000000001',
          '- undefined 0b000000-0000-4000-8000-000000000002'
        ])
        assert.deepStrictEqual(server.sentOf('resource_pack_client_response'), [{
          response_status: 'send_packs',
          resourcepackids: [PACK_ID, '0a000000-0000-4000-8000-000000000001_2.1.0', '0b000000-0000-4000-8000-000000000002_0.3.0']
        }])
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.20.30', 'bedrock_1.21.30')) {
      it(`bedrock ${version}: a pack's URL in the links by its id, the others asked for`, async () => {
        const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
        const behaviour = atLeast(version, 'bedrock_1.21.30') ? {} : { behaviour_packs: [behaviourPack(version, '0b000000-0000-4000-8000-000000000002', '0.3.0')] }
        server.send('resource_packs_info', {
          texture_packs: [texturePack(version, PACK_UUID, '1.0.0'), texturePack(version, '0a000000-0000-4000-8000-000000000001', '2.1.0')],
          ...behaviour,
          resource_pack_links: [{ id: `${PACK_UUID}_0.9.0`, url: 'https://example.com/old.zip' }, { id: `${PACK_UUID}_1.0.0`, url: 'https://example.com/pack.zip' }]
        })
        await driver.frame(0)
        assert.deepStrictEqual(offered(), [
          `https://example.com/pack.zip undefined ${PACK_UUID}`,
          '- undefined 0a000000-0000-4000-8000-000000000001',
          ...atLeast(version, 'bedrock_1.21.30') ? [] : ['- undefined 0b000000-0000-4000-8000-000000000002']
        ])
        assert.deepStrictEqual(server.sentOf('resource_pack_client_response'), [{
          response_status: 'send_packs',
          resourcepackids: ['0a000000-0000-4000-8000-000000000001_2.1.0', ...atLeast(version, 'bedrock_1.21.30') ? [] : ['0b000000-0000-4000-8000-000000000002_0.3.0']]
        }])
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.21.42', 'bedrock_1.21.42')) {
      it(`bedrock ${version}: a URL per pack, the uuid a string`, async () => {
        const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
        server.send('resource_packs_info', {
          texture_packs: [texturePack(version, PACK_UUID, '1.0.0', 'https://example.com/pack.zip'), texturePack(version, '0a000000-0000-4000-8000-000000000001', '2.1.0')]
        })
        await driver.frame(0)
        assert.deepStrictEqual(offered(), [`https://example.com/pack.zip undefined ${PACK_UUID}`, '- undefined 0a000000-0000-4000-8000-000000000001'])
        assert.deepStrictEqual(server.sentOf('resource_pack_client_response'), [{ response_status: 'send_packs', resourcepackids: ['0a000000-0000-4000-8000-000000000001_2.1.0'] }])
      })
    }

    for (const version of bedrockTestVersionsFrom('bedrock_1.21.50')) {
      it(`bedrock ${version}: a URL per pack, the uuid read with each half reversed`, async () => {
        const { server, driver, offered } = await packsBot(version, bot => { bot.acceptResourcePack() })
        server.send('resource_packs_info', {
          texture_packs: [texturePack(version, WIRE_UUID, '1.0.0', 'https://example.com/pack.zip'), texturePack(version, '01000000-0000-000a-0200-000000008000', '2.1.0')]
        })
        await driver.frame(0)
        assert.deepStrictEqual(offered(), [`https://example.com/pack.zip undefined ${PACK_UUID}`, '- undefined 0a000000-0000-0001-0080-000000000002'])
        assert.deepStrictEqual(server.sentOf('resource_pack_client_response').map(({ resourcepackids }) => resourcepackids), [['0a000000-0000-0001-0080-000000000002_2.1.0']])
      })
    }
  })

  describe(`decisions and downloads (bedrock ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const response = (status: string): string => `resource_pack_client_response ${status}`
    const sentNames = (server: FakeBedrockClient, from: number): string[] => server.sent.slice(from).map(({ name, params }) =>
      'response_status' in params ? `${name} ${String(params.response_status)}` : `${name} ${'chunk_index' in params ? String(params.chunk_index) : ''}`)
    const offerTwo = (server: FakeBedrockClient, cdnUrl = ''): void => {
      server.send('resource_packs_info', { texture_packs: [texturePack(version, WIRE_UUID, '1.0.0'), texturePack(version, '01000000-0000-000a-0200-000000008000', '2.1.0', cdnUrl)] })
    }
    const OTHER_ID = '0a000000-0000-0001-0080-000000000002_2.1.0'
    const dataInfo = (server: FakeBedrockClient, id: string, chunkCount: number): void => {
      server.send('resource_pack_data_info', { pack_id: id, max_chunk_size: 102400, chunk_count: chunkCount })
    }

    it('throws when accept or deny is called with no offer being answered', async () => {
      const { bot, server, driver } = await packsBot(version)
      assert.throws(() => { bot.acceptResourcePack() }, /^Error: acceptResourcePack: no resource pack is offered now: call it from a resourcePack listener$/)
      assert.throws(() => { bot.denyResourcePack() }, /^Error: denyResourcePack: no resource pack is offered now: call it from a resourcePack listener$/)
      offerTwo(server)
      await driver.frame(0)
      assert.throws(() => { bot.acceptResourcePack() }, /acceptResourcePack: no resource pack is offered now/)
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 0), [response('have_all_packs')])
    })

    it('answers the whole offer once, by the last call of its listeners', async () => {
      const denied = await packsBot(version, bot => { bot.acceptResourcePack(); bot.denyResourcePack() })
      offerTwo(denied.server)
      await denied.driver.frame(0)
      assert.deepStrictEqual([denied.offered().length, sentNames(denied.server, 0)], [2, [response('refused')]])
      let calls = 0
      const accepted = await packsBot(version, bot => { if (++calls === 1) bot.denyResourcePack(); else bot.acceptResourcePack() })
      offerTwo(accepted.server)
      await accepted.driver.frame(0)
      assert.deepStrictEqual(accepted.server.sentOf('resource_pack_client_response'), [{ response_status: 'send_packs', response_status_name: 'downloading', resourcepackids: [PACK_ID, OTHER_ID] }])
    })

    it('has all packs at once when every pack accepted has a URL', async () => {
      const { server, driver } = await packsBot(version, bot => { bot.acceptResourcePack() })
      server.send('resource_packs_info', { texture_packs: [texturePack(version, WIRE_UUID, '1.0.0', 'https://example.com/pack.zip')] })
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 0), [response('have_all_packs')])
    })

    it('has all packs after the last chunk of the last pack, each chunk counted once', async () => {
      const { server, driver } = await packsBot(version, bot => { bot.acceptResourcePack() })
      offerTwo(server)
      await driver.frame(0)
      // a chunk before its pack's data info counts
      sendChunk(server, version, OTHER_ID, 1)
      dataInfo(server, PACK_ID, 2)
      sendChunk(server, version, PACK_ID, 0)
      sendChunk(server, version, PACK_ID, 0)
      sendChunk(server, version, PACK_ID, 1)
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 1), ['resource_pack_chunk_request 0', 'resource_pack_chunk_request 1'])
      dataInfo(server, OTHER_ID, 2)
      sendChunk(server, version, OTHER_ID, 1)
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 3), ['resource_pack_chunk_request 0', 'resource_pack_chunk_request 1'])
      sendChunk(server, version, OTHER_ID, 0)
      await driver.frame(0)
      sendChunk(server, version, OTHER_ID, 0)
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 5), [response('have_all_packs')])
    })

    it('has a pack of no chunks at once', async () => {
      const { server, driver } = await packsBot(version, bot => { bot.acceptResourcePack() })
      offerRecordedPack(server, version)
      await driver.frame(0)
      dataInfo(server, PACK_ID, 0)
      await driver.frame(0)
      assert.deepStrictEqual(sentNames(server, 1), [response('have_all_packs')])
    })

    it('asks for no pack it did not ask for, and forgets its downloads on a new offer', async () => {
      const { server, driver, errors } = await packsBot(version, bot => { bot.acceptResourcePack() })
      dataInfo(server, PACK_ID, 2)
      sendChunk(server, version, PACK_ID, 0)
      await driver.frame(0)
      offerTwo(server, 'https://example.com/other.zip')
      await driver.frame(0)
      dataInfo(server, OTHER_ID, 2)
      server.send('resource_packs_info', { texture_packs: [texturePack(version, WIRE_UUID, '1.0.0', 'https://example.com/pack.zip')] })
      dataInfo(server, PACK_ID, 1)
      sendChunk(server, version, PACK_ID, 0)
      await driver.frame(0)
      assert.deepStrictEqual([sentNames(server, 0), errors], [[response('send_packs'), response('have_all_packs')], []])
    })

    it('reports a listener throwing, and still answers', async () => {
      const { bot, server, driver, errors } = await packsBot(version)
      bot.on('resourcePack', () => { throw new Error('the listener threw') })
      offerRecordedPack(server, version)
      await driver.frame(0)
      assert.deepStrictEqual([errors, sentNames(server, 0)], [['the listener threw'], [response('have_all_packs')]])
    })
  })
})
