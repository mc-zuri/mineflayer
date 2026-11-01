import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The vanilla client at (0.5, -60, 0.5) looking west and down (yaw -90, pitch 52.6), holding an oak sign in hotbar slot
// 0, placing it on the grass block at (1, -61, 0), recorded on 1.26.20.4, 1.26.51.1 and 1.26.60.5 (protocol_blocks_ui,
// protocol.sign): the server put the sign, told its block entity, put it again (flags 19), told it again and opened its
// editor; the editor closed without typing, the client sent the block entity back as told, byte for byte. No sign is
// recorded before 1.26.20: the block entity before 1.19.80 (one Text) and the editor the client opened itself then
// (no open_sign) are not verified.

type Compound = Record<string, undefined | Tags[TagType]>

const UP = new Vec3(0, 1, 0)
/** the recorded client's camera, as its auth inputs reported it, but its yaw's float: the pick meets the floor's top where the recorded click did, but for a float step */
const CAMERA = Object.freeze({ yaw: -90, pitch: 52.600494384765625 })
/** the point the recorded click names, which the bot's pick, from floats, finds a float step off */
const CLICKED = new Vec3(0.7385685443878174, 1, 0.5)

/** the press, as recorded */
interface RecordedSign {
  version: BedrockVersion
  swing: string
  click: string
  /** the sign's block entity, as the server told it twice and the client sent it back */
  entity: string
}

const START = '24013802790002770002'
const INTERACT = '21040000'
const EMPTY_HAND = '1f010000000000000000000000'
const STOP = '24013a02770000000000'
/** the server's update_block of the sign, then of it again with its flags 19 */
const PUT = '150277008de5949a0b0300'
const PUT_AGAIN = '150277008de5949a0b1300'
const OPEN_SIGN = 'af0202770001'

const SIGNS: readonly RecordedSign[] = [
  {
    // the server's block entity isMovable
    version: 'bedrock_1.26.20',
    swing: '2c01010000000001056275696c64',
    click: '1e0002010000008c0601000000000a0000000000000000000000000102790002008c0601000000000a000000000000000000000000003f1c8569c20000003fd4123d3f0000803f0000003fb4d1c4f10d0100',
    entity: '380277000a000a084261636b54657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000a0946726f6e7454657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000107497357617865640004124c6f636b6564466f7245646974696e674279fdffffff3f08026964045369676e010969734d6f7661626c6501030178020301797703017a0000'
  },
  {
    // ItemV4s and the hand of the click; the server's block entity has its version
    version: 'bedrock_1.26.51',
    swing: '2c01010000000001056275696c64',
    click: '1e000002010001000000690101000000000a0000000000000000000000000000000000000001027900010000690101000000000a000000000000000000000000003f1c8569c20000003fd4123d3f0000803f0000003fb4d1c4f10d0100',
    entity: '380277000a000a084261636b54657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000312426c6f636b456e7469747956657273696f6e000a0946726f6e7454657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000107497357617865640004124c6f636b6564466f7245646974696e674279fdffffff3f08026964045369676e030178020301797703017a0000'
  },
  {
    // the swing's hand
    version: 'bedrock_1.26.60',
    swing: '2c01010000000001056275696c6400',
    click: '1e000002010001000000690101000000000a0000000000000000000000000000000000000001027900010000690101000000000a000000000000000000000000003f1c8569c20000003fd4123d3f0000803f0000003fb4d1c4f10d0100',
    entity: '380277000a000a084261636b54657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000312426c6f636b456e7469747956657273696f6e000a0946726f6e7454657874080c46696c74657265645465787400010f48696465476c6f774f75746c696e6500010e49676e6f72654c69676874696e6700011150657273697374466f726d617474696e6701030d5369676e54657874436f6c6f72ffffff0f080454657874000809546578744f776e657200000107497357617865640004124c6f636b6564466f7245646974696e674279fdffffff3f08026964045369676e030178020301797703017a0000'
  }
]

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** a side of a two-sided sign, as recorded */
function side (text: string): Tags['compound'] {
  return {
    type: 'compound',
    value: { FilteredText: string(''), HideGlowOutline: byte(0), IgnoreLighting: byte(0), PersistFormatting: byte(1), SignTextColor: int(-16777216), Text: string(text), TextOwner: string('') }
  }
}

/** a two-sided sign's block entity as 1.26.60 told it (its lock aside), from 1.19.80: not recorded before 1.26.20 */
function twoSided ({ x, y, z }: Point3, front = '', back = ''): Compound {
  return { BackText: side(back), BlockEntityVersion: int(0), FrontText: side(front), IsWaxed: byte(0), id: string('Sign'), x: int(x), y: int(y), z: int(z) }
}

/** a sign's block entity before 1.19.80, its one text (not recorded) */
function oneSided ({ x, y, z }: Point3, text = ''): Compound {
  return { IgnoreLighting: byte(0), SignTextColor: int(-16777216), Text: string(text), TextOwner: string(''), id: string('Sign'), isMovable: byte(1), x: int(x), y: int(y), z: int(z) }
}

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name, and no section request */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

interface AtFloor extends TestBot {
  world: ServerWorld
  inventory: ServerInventory
  /** where a sign placed on the floor goes */
  dest: Point3
  floor: Block
  /** blockPlaced and signOpen, as emitted */
  events: string[]
  errors: string[]
  /** block_entity_data of a block, as servers send it */
  tell: (value: Compound, at?: Point3) => void
}

/** joined standing at (0.5, feetY, 0.5) on grass, looking at the floor's top at (1, feetY - 1, 0) as the recorded client did, holding an oak sign */
async function atFloor (version: BedrockVersion): Promise<AtFloor> {
  // the overworld starts at 0 up to 1.17.40
  const feetY = atLeast(version, 'bedrock_1.18.0') ? -60 : 4
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const grass = 'grass_block' in testBot.bot.registry.blocksByName ? 'grass_block' : 'grass'
  // the recorded servers number the blocks by their hashes from 1.20.0
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[0, feetY - 1, 0, grass], [1, feetY - 1, 0, grass]] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation: CAMERA, game: { runtime_entity_id: 1n, ...itemStates } })
  const { bot, server, driver } = testBot
  const events: string[] = []
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  bot.on('blockPlaced', (oldBlock, newBlock) => { events.push(`blockPlaced ${newBlock.position.toString()} ${oldBlock?.name ?? 'none'} -> ${newBlock.name}`) })
  bot.on('signOpen', block => { events.push(`signOpen ${block === null ? 'null' : `${block.position.toString()} ${block.name}`}`) })
  const inventory = new ServerInventory(server)
  inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_sign']?.id ?? 0, count: 1 })
  await driver.tick()
  const floor = bot.blockAt(new Vec3(1, feetY - 1, 0))
  assert.ok(floor !== null, `${version}: the floor's section is not loaded`)
  const tell = (value: Compound, { x, y, z }: Point3 = { x: 1, y: feetY, z: 0 }): void => { server.send('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) }
  return { ...testBot, world, inventory, dest: { x: 1, y: feetY, z: 0 }, floor, events, errors, tell }
}

/** ticks until `promise` settles */
async function settle (driver: TestBot['driver'], promise: Promise<unknown>): Promise<void> {
  let settled = false
  const done = promise.finally(() => { settled = true })
  await driver.runUntil(() => settled, 120)
  await done
}

/** placeBlock of the oak sign on the floor, the server's standing sign put at the destination in the tick after */
async function placeSign ({ bot, server, world, driver, floor, dest }: AtFloor): Promise<Block> {
  const placing = bot.placeBlock(floor, UP)
  await driver.frame(10)
  const block = world.stateId('standing_sign')
  // 1.16.201 names the fields apart
  if (atLeast(bot.version, 'bedrock_1.16.210')) server.send('update_block', { position: dest, block_runtime_id: block, layer: 0 })
  else server.send('update_block', { coordinates: dest, block_runtime_id: block })
  await settle(driver, placing)
  const sign = bot.blockAt(new Vec3(dest.x, dest.y, dest.z))
  assert.ok(sign !== null)
  return sign
}

function sentEntities (server: FakeBedrockClient): Array<BedrockServerboundPackets['block_entity_data']> {
  return server.sentOf('block_entity_data')
}

function entityData ({ x, y, z }: Point3, value: Compound): object {
  return { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }
}

describe('bedrock signs', () => {
  for (const recorded of SIGNS) {
    describe(`the vanilla client placing an oak sign, its editor opened and closed (${recorded.version.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.version, recorded.version)) {
        it(`bedrock ${version}: builds the sign beside the face (_placeBlockWithOptions at the point clicked), emits signOpen at open_sign, and updateSign sends the block entity back as told in the next frame`, async () => {
          const at = await atFloor(version)
          const { bot, internal, server, driver, floor, events, errors } = at
          const batches = batchesSince(server)
          const placing = internal._placeBlockWithOptions(floor, UP, { delta: CLICKED })
          await driver.frame(10)
          assert.deepStrictEqual([batches(), bot.heldItem, errors], [[[START, recorded.swing, recorded.click]], null, []])
          await driver.tick()
          assert.deepStrictEqual(batches(), [[INTERACT, EMPTY_HAND, 'player_auth_input']])
          await driver.ticks(2)
          assert.deepStrictEqual(batches(), [['player_auth_input'], [STOP, 'player_auth_input']])
          for (const packet of [PUT, recorded.entity, PUT_AGAIN, recorded.entity, OPEN_SIGN]) server.receive(Buffer.from(packet, 'hex'))
          await driver.frame(10)
          await placing
          assert.deepStrictEqual(events, ['blockPlaced (1, -60, 0) air -> standing_sign', 'signOpen (1, -60, 0) standing_sign'])
          const sign = bot.blockAt(new Vec3(1, -60, 0))
          assert.ok(sign !== null)
          bot.updateSign(sign, '')
          assert.deepStrictEqual(batches(), [])
          await driver.frame(10)
          assert.deepStrictEqual([batches(), errors], [[[recorded.entity]], []])
          bot.end()
        })
      }
    })
  }

  describe('servers telling one text before 1.19.80, the vanilla client opening its editor itself (1.16.201 – 1.19.70, not recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.19.70')) {
      it(`bedrock ${version}: emits signOpen once at the block entity of the sign the bot built, and updateSign sends its text, a back emitting error`, async () => {
        const at = await atFloor(version)
        const { bot, server, driver, events, errors, tell, dest } = at
        const sign = await placeSign(at)
        tell(oneSided(dest))
        await driver.tick()
        tell(oneSided(dest))
        await driver.tick()
        const where = sign.position.toString()
        assert.deepStrictEqual(events, [`blockPlaced ${where} air -> standing_sign`, `signOpen ${where} standing_sign`])
        bot.updateSign(sign, 'a\nb', true)
        bot.updateSign(sign, 'a\nb')
        await driver.tick()
        assert.deepStrictEqual([sentEntities(server), errors], [[entityData(dest, oneSided(dest, 'a\nb'))], [`updateSign: the sign at ${where} has no back`]])
        bot.end()
      })
    }
  })

  describe('servers opening the editor (1.19.80 – 1.26.60; recorded from 1.26.20)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.80', latestSupportedBedrockVersion)) {
      it(`bedrock ${version}: emits signOpen at open_sign only, and updateSign sends the side's text`, async () => {
        const at = await atFloor(version)
        const { bot, server, driver, events, errors, tell, dest } = at
        const sign = await placeSign(at)
        tell(twoSided(dest))
        await driver.tick()
        assert.strictEqual(events.length, 1)
        server.send('open_sign', { position: dest, is_front: true })
        await driver.tick()
        assert.deepStrictEqual(events.at(-1), `signOpen ${sign.position.toString()} standing_sign`)
        bot.updateSign(sign, 'front')
        bot.updateSign(sign, 'back', true)
        await driver.tick()
        assert.deepStrictEqual([sentEntities(server), errors], [[entityData(dest, twoSided(dest, 'front')), entityData(dest, twoSided(dest, '', 'back'))], []])
        bot.end()
      })
    }
  })

  describe('the editor the vanilla client opens itself (on 1.19.70)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.70', 'bedrock_1.19.70')) {
      it(`bedrock ${version}: opens for the block entity of a sign the bot built there in the last 100 ticks, not for another item's build, a use, another place's or a later one's`, async () => {
        const at = await atFloor(version)
        const { bot, internal, driver, inventory, events, tell, dest, floor } = at
        const elsewhere = { x: 3, y: dest.y, z: 3 }
        tell(oneSided(elsewhere), elsewhere)
        await driver.tick()
        // a build of another item there
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName['dirt']?.id ?? 0, count: 2 })
        await driver.tick()
        await settle(driver, internal._genericPlace(floor, UP, {}))
        tell(oneSided(dest))
        await driver.tick()
        assert.deepStrictEqual(events, [])
        // a use holding a sign, which builds nothing
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_sign']?.id ?? 0, count: 2 })
        await driver.tick()
        await settle(driver, bot.activateBlock(floor))
        tell(oneSided(dest))
        await driver.tick()
        assert.deepStrictEqual(events, [])
        await settle(driver, internal._genericPlace(floor, UP, {}))
        tell(oneSided(elsewhere), elsewhere)
        // 100 ticks after the build
        await driver.ticks(97)
        tell(oneSided(dest))
        await driver.tick()
        assert.deepStrictEqual(events, ['signOpen (1, -60, 0) air'])
        // the next sign's block entity, a tick late
        await settle(driver, internal._genericPlace(floor, UP, {}))
        await driver.ticks(98)
        tell(oneSided(dest))
        await driver.tick()
        assert.deepStrictEqual(events, ['signOpen (1, -60, 0) air'])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const RECORDED = SIGNS.find(sign => sign.version === version)!.entity

    it("keeps the block entity as told but the side's text: its other fields, their order, the lock; a hanging sign's too", async () => {
      const at = await atFloor(version)
      const { bot, server, driver, events, errors, tell, dest } = at
      // the block entity written as recorded, but its lock
      assert.strictEqual(hexOf(server, { name: 'block_entity_data', params: entityData(dest, twoSided(dest)) }), RECORDED.replace('04124c6f636b6564466f7245646974696e674279fdffffff3f', ''))
      const sign = await placeSign(at)
      server.receive(Buffer.from(RECORDED, 'hex'))
      server.receive(Buffer.from(OPEN_SIGN, 'hex'))
      await driver.tick()
      bot.updateSign(sign, '1\n2\n3\n')
      bot.updateSign(sign, 'back', true)
      await driver.tick()
      const hanging = { x: 2, y: dest.y, z: 0 }
      tell({ ...twoSided(hanging), id: string('HangingSign') }, hanging)
      await driver.tick()
      bot.updateSign(bot.blockAt(new Vec3(2, dest.y, 0))!, 'hung')
      await driver.tick()
      const [front, back, hung] = sentEntities(server).map(({ position, nbt: { value } }) => {
        const text = (name: string): unknown => { const tag = value[name]; return tag?.type === 'compound' ? tag.value['Text']?.value : undefined }
        return [position, Object.keys(value), text('FrontText'), text('BackText'), value['LockedForEditingBy']?.value, value['id']?.value]
      })
      const keys = ['BackText', 'BlockEntityVersion', 'FrontText', 'IsWaxed', 'LockedForEditingBy', 'id', 'x', 'y', 'z']
      assert.deepStrictEqual([front, back, hung, events.at(-1), errors], [
        [dest, keys, '1\n2\n3\n', '', -8589934591n, 'Sign'],
        [dest, keys, '', 'back', -8589934591n, 'Sign'],
        [hanging, keys.filter(key => key !== 'LockedForEditingBy'), 'hung', '', undefined, 'HangingSign'],
        'signOpen (1, -60, 0) standing_sign',
        []
      ])
      bot.end()
    })

    it("emits Java's errors and the sign's, sending nothing: too many lines, a line too long, no block entity told (or another block's since), a waxed sign", async () => {
      const at = await atFloor(version)
      const { bot, server, driver, errors, tell, dest } = at
      const sign = await placeSign(at)
      const where = sign.position.toString()
      bot.updateSign(sign, 'a')
      tell(twoSided(dest))
      await driver.tick()
      bot.updateSign(sign, '1\n2\n3\n4\n5')
      bot.updateSign(sign, `${'x'.repeat(45)}\n${'y'.repeat(46)}`)
      tell({ ...twoSided(dest), IsWaxed: byte(1) })
      await driver.tick()
      bot.updateSign(sign, 'waxed')
      tell({ id: string('Chest'), x: int(dest.x), y: int(dest.y), z: int(dest.z) })
      await driver.tick()
      bot.updateSign(sign, 'gone')
      await driver.tick()
      assert.deepStrictEqual([errors, sentEntities(server).length], [[
        `updateSign: the server told no block entity of the sign at ${where}`,
        'too many lines for sign text',
        'Signs have a maximum of 45 characters per line',
        `updateSign: the sign at ${where} is waxed`,
        `updateSign: the server told no block entity of the sign at ${where}`
      ], 0])
      // the longest text Java's takes
      bot.updateSign(sign, ['1', '2', '3', 'z'.repeat(45)].join('\n'))
      tell(twoSided(dest))
      await driver.tick()
      bot.updateSign(sign, ['1', '2', '3', 'z'.repeat(45)].join('\n'))
      await driver.tick()
      assert.deepStrictEqual(sentEntities(server).at(-1), entityData(dest, twoSided(dest, `1\n2\n3\n${'z'.repeat(45)}`)))
      bot.end()
    })

    it('emits signOpen with null for a sign whose column is not loaded', async () => {
      const { bot, server, driver, events } = await atFloor(version)
      server.send('open_sign', { position: { x: 0, y: -60, z: 400 }, is_front: false })
      await driver.tick()
      assert.deepStrictEqual(events, ['signOpen null'])
      bot.end()
    })
  })
})
