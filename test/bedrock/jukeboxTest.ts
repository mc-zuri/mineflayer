import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Tags, TagType } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Rotation } from './common/world.ts'

// The jukebox as the vanilla client used it in protocol_blocks_ui against Bedrock Dedicated Server (1.26.20.4, 1.26.51.1,
// 1.26.60.5): standing at (0.5, -60, 0.5), a music disc (cat) put in the jukebox at (2, -60, 0) by a use. No recording
// takes a disc out. The bot loads the windows plugin and the jukebox's only (and simple_inventory, which equips the disc).

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

/** the recorded client's camera */
const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const TOLD_TICKS = 100

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

function long (value: number): Tags['long'] {
  const tag: Tags['long'] = { type: 'long', value: [0, value] }
  // block_entity_data's network NBT writes a long from a bigint, which prismarine-nbt's typings do not give
  Reflect.set(tag, 'value', BigInt(value))
  return tag
}

/** the disc put in, as block_entity_data told it on 1.26.51.1 and 1.26.60.5 */
const RECORDED_DISC: Compound = Object.freeze({
  Count: byte(1), Damage: { type: 'short', value: 0 }, Name: string('minecraft:music_disc_cat'), WasPickedUp: byte(0)
})

/** the jukebox's block entity, playing `record`, as told on 1.26.51.1 and 1.26.60.5 (once set, and once the disc was put in) */
function jukeboxEntity ({ x, y, z }: At, record?: Compound): Compound {
  const playing: Compound = record === undefined ? {} : { RecordItem: { type: 'compound', value: record } }
  return {
    BlockEntityVersion: int(0), FinishedRecording: byte(0), ...playing, TicksPlaying: long(record === undefined ? 0 : 1), id: string('Jukebox'), x: int(x), y: int(y), z: int(z)
  }
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

/** the actions of each use's transaction, as the version writes them (without the fields an item read from the server leaves undefined) */
function actionsOf (server: FakeBedrockClient): unknown[] {
  const actions = server.sentOf('inventory_transaction').map(({ transaction }) => 'inventory_actions' in transaction ? transaction.inventory_actions : transaction.actions)
  return JSON.parse(JSON.stringify(actions)) as unknown[]
}

/** the actions of a transaction that changes no slot: 1.16.210 says whether they name items by network id */
function noActions (version: BedrockVersion): object {
  return isBedrockVersionAtLeast(version, 'bedrock_1.16.210') && !isBedrockVersionAtLeast(version, 'bedrock_1.16.220') ? { network_ids: false, actions: [] } : []
}

/** a slot of the inventory emptied of a disc, as an ItemV4 from 1.26.60 */
function emptied (slot: number, networkId: number): object {
  const none = { network_id: 0, count: 0, metadata: 0, has_stack_id: false, block_runtime_id: 0 }
  return { source_type: 'container', window_id: 0, slot, old_item: { ...none, network_id: networkId, count: 1, extra: { has_nbt: 0, can_place_on: [], can_destroy: [] } }, new_item: none }
}

interface JukeboxBot extends TestBot {
  errors: string[]
  inventory: ServerInventory
  jukebox: Block
  /** block_entity_data at the jukebox */
  tell: (value: Compound) => void
  /** the item's network id */
  idOf: (name: string) => number
}

/** joined looking at a jukebox as the recorded client did (at y -60; 4 where the overworld starts at 0), which the server told plays nothing */
async function jukeboxBot (version: BedrockVersion, rotation: Rotation = CAMERA): Promise<JukeboxBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { windows: true, jukebox: true, simple_inventory: true } })
  const { bot, server } = testBot
  const y = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks: [[2, y, 0, 'jukebox'], [0, y - 1, 0, 'stone']] })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y, z: 0.5 }, rotation, game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const at: At = { x: 2, y, z: 0 }
  const jukebox = bot.blockAt(new Vec3(at.x, at.y, at.z))
  assert.ok(jukebox !== null)
  const tell = (value: Compound): void => { server.send('block_entity_data', { position: at, nbt: { type: 'compound', name: '', value } }) }
  // as recorded once the jukebox was set
  tell(jukeboxEntity(at))
  const idOf = (name: string): number => {
    const item = bot.registry.itemsByName[name]
    assert.ok(item !== undefined)
    return item.id
  }
  return { ...testBot, errors, inventory: new ServerInventory(server), jukebox, tell, idOf }
}

interface RecordedPut {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  /** the use's transaction names the disc's slot emptied, and the hand is told empty in the use's tick */
  predicts: boolean
  /** by build, as recorded: the use's batch, then the use's end's, the server having sent the slot emptied */
  recorded: Readonly<Partial<Record<BedrockVersion, readonly [use: readonly string[], end: readonly string[]]>>>
}

const START = '24013804770004770008'
const STOP = '24013a04770000000000'
const SWING = '2c0101000000000108696e746572616374'
const EMPTY_HAND = ['21040000', '1f010000000000000000000000']

const PUTS: readonly RecordedPut[] = [
  {
    // recorded on 1.26.20.4 and 1.26.51.1 (music_disc_cat 574 and 545); before, as a lectern's book: no slot named
    name: 'no slot named, the hand told once the server sent the slot emptied',
    from: oldestSupportedBedrockVersion,
    to: 'bedrock_1.26.51',
    predicts: false,
    recorded: {
      'bedrock_1.26.20': [
        [START, SWING, '1e00020000010477000800fc0801000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa68fc9fd050100', 'player_auth_input'],
        [STOP, ...EMPTY_HAND, 'player_auth_input']
      ],
      'bedrock_1.26.51': [
        [START, SWING, '1e000002000001047700040000210201000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa68fc9fd050100', 'player_auth_input'],
        [STOP, ...EMPTY_HAND, 'player_auth_input']
      ]
    }
  },
  {
    // recorded on 1.26.60.5
    name: 'the disc\'s slot named emptied, the hand told empty in the use\'s tick',
    from: 'bedrock_1.26.60',
    to: latestSupportedBedrockVersion,
    predicts: true,
    recorded: {
      'bedrock_1.26.60': [
        [
          START,
          `${SWING}00`,
          '1e000002010001000000210201000000000a0000000000000000000000000000000000000001047700040000210201000000000a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa68fc9fd050100',
          ...EMPTY_HAND,
          'player_auth_input'
        ],
        [STOP, 'player_auth_input']
      ]
    }
  }
]

describe('bedrock jukebox: a disc put in by a use', () => {
  for (const put of PUTS) {
    describe(`${put.name} (${put.from.slice(8)} – ${put.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(put.from, put.to)) {
        it(`bedrock ${version}: uses the jukebox holding the disc, resolving once the server told the jukebox holds it`, async () => {
          const { bot, server, driver, errors, inventory, jukebox, tell, idOf } = await jukeboxBot(version)
          const disc = idOf('music_disc_cat')
          inventory.slot('inventory', 0, { id: disc, count: 1 })
          await driver.ticks(2)
          const batches = batchesSince(server)
          const told = server.sentOf('mob_equipment').length
          let done = false
          const playing = bot.bedrock.playDisc(jukebox).then(() => { done = true })

          await driver.tick()
          const use = batches()
          assert.deepStrictEqual([actionsOf(server), bot.heldItem?.name, server.sentOf('mob_equipment').length - told],
            put.predicts ? [[[emptied(0, disc)]], undefined, 1] : [[noActions(version)], 'music_disc_cat', 0])
          await driver.tick()
          inventory.slot('inventory', 0, null)
          await driver.tick()
          const end = batches()
          const recorded = put.recorded[version]
          if (recorded !== undefined) assert.deepStrictEqual([use, end], [[recorded[0]], [['player_auth_input'], recorded[1]]])
          assert.deepStrictEqual([server.sentOf('mob_equipment').length - told, bot.heldItem, done, bot.bedrock.jukeboxDisc(jukebox), errors], [1, null, false, null, []])
          tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
          await driver.tick()
          assert.strictEqual(done, true)
          await playing
          const record = bot.bedrock.jukeboxDisc(jukebox)
          assert.deepStrictEqual([record?.name, record?.count], ['music_disc_cat', 1])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('takes no disc to a jukebox told holding one, nor another item (a disc fragment), nor from an empty hand; playDisc rejects them, sending nothing', async () => {
      const { bot, server, driver, errors, inventory, jukebox, tell, idOf } = await jukeboxBot(version)
      inventory.slot('inventory', 0, { id: idOf('music_disc_cat'), count: 1 })
      tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
      await driver.ticks(2)
      await assert.rejects(bot.bedrock.playDisc(jukebox), { message: 'playDisc: the jukebox holds a disc' })
      const floor = bot.blockAt(jukebox.position.offset(-2, -1, 0))
      assert.ok(floor !== null)
      await assert.rejects(bot.bedrock.playDisc(floor), { message: 'playDisc: stone is not a jukebox' })
      // the vanilla client's use takes the disc out
      const used = bot.activateBlock(jukebox)
      await driver.ticks(4)
      await used
      tell(jukeboxEntity(jukebox.position))
      inventory.slot('inventory', 0, { id: idOf('disc_fragment_5'), count: 1 })
      await driver.tick()
      await assert.rejects(bot.bedrock.playDisc(jukebox), { message: 'playDisc needs a music disc in the hand, not disc_fragment_5' })
      const fragment = bot.activateBlock(jukebox)
      await driver.ticks(4)
      await fragment
      inventory.slot('inventory', 0, null)
      await driver.tick()
      await assert.rejects(bot.bedrock.playDisc(jukebox), { message: 'playDisc needs a music disc in the hand, not nothing' })
      const emptyHanded = bot.activateBlock(jukebox)
      await driver.ticks(4)
      await emptyHanded
      assert.deepStrictEqual([actionsOf(server), errors], [[[], [], []], []])
      bot.end()
    })

    it('rejects a disc given while the jukebox is told holding one, and a given stick, before selecting them, sending nothing', async () => {
      const { bot, server, driver, errors, inventory, jukebox, tell, idOf } = await jukeboxBot(version)
      inventory.slot('inventory', 3, { id: idOf('music_disc_pigstep'), count: 1 })
      inventory.slot('inventory', 4, { id: idOf('stick'), count: 1 })
      tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
      await driver.ticks(2)
      const [disc, stick] = [bot.inventory.slots[39], bot.inventory.slots[40]]
      assert.ok(disc !== null && disc !== undefined && stick !== null && stick !== undefined)
      const told = server.sentOf('mob_equipment').length
      await assert.rejects(bot.bedrock.playDisc(jukebox, disc), { message: 'playDisc: the jukebox holds a disc' })
      tell(jukeboxEntity(jukebox.position))
      await driver.tick()
      await assert.rejects(bot.bedrock.playDisc(jukebox, stick), { message: 'playDisc needs a music disc in the hand, not stick' })
      await driver.ticks(2)
      assert.deepStrictEqual([actionsOf(server), server.sentOf('mob_equipment').length - told, server.sentOf('item_stack_request'), bot.quickBarSlot, errors], [[], 0, [], 0, []])
      bot.end()
    })

    it('puts a disc given in another hotbar slot, which it selects first, naming that slot', async () => {
      const { bot, server, driver, errors, inventory, jukebox, tell, idOf } = await jukeboxBot(version)
      const disc = idOf('music_disc_pigstep')
      inventory.slot('inventory', 3, { id: disc, count: 1 })
      await driver.ticks(2)
      const given = bot.inventory.slots[39]
      assert.ok(given !== null && given !== undefined)
      const playing = bot.bedrock.playDisc(jukebox, given)
      await driver.ticks(2)
      assert.deepStrictEqual([actionsOf(server), bot.quickBarSlot, bot.heldItem], [[[emptied(3, disc)]], 3, null])
      tell(jukeboxEntity(jukebox.position, { ...RECORDED_DISC, Name: string('minecraft:music_disc_pigstep') }))
      await driver.ticks(3)
      await playing
      assert.deepStrictEqual([bot.bedrock.jukeboxDisc(jukebox)?.name, errors], ['music_disc_pigstep', []])
      bot.end()
    })

    it(`rejects when the server tells no disc in the jukebox in ${TOLD_TICKS} ticks`, async () => {
      const { bot, driver, inventory, jukebox, idOf } = await jukeboxBot(version)
      inventory.slot('inventory', 0, { id: idOf('music_disc_cat'), count: 1 })
      await driver.ticks(2)
      const playing = assert.rejects(bot.bedrock.playDisc(jukebox), { message: `the server put no disc in the jukebox in ${TOLD_TICKS} ticks` })
      await driver.ticks(TOLD_TICKS + 4)
      await playing
      bot.end()
    })

    it('reads the disc of the jukebox told last: none for one untold (another one told), one of no disc it knows, an item not a disc, and a block entity no longer a jukebox\'s', async () => {
      const { bot, server, driver, jukebox, tell } = await jukeboxBot(version)
      const other = bot.blockAt(jukebox.position.offset(0, 0, 1))
      assert.ok(other !== null)
      // another jukebox's, beside it
      const beside = { x: other.position.x, y: other.position.y, z: other.position.z }
      server.send('block_entity_data', { position: beside, nbt: { type: 'compound', name: '', value: jukeboxEntity(beside, RECORDED_DISC) } })
      await driver.tick()
      const disc = (): string | undefined => bot.bedrock.jukeboxDisc(jukebox)?.name
      const read: Array<string | undefined> = [disc()]
      tell(jukeboxEntity(jukebox.position, { ...RECORDED_DISC, Name: string('minecraft:no_such_disc') }))
      await driver.tick()
      read.push(disc())
      tell({ ...jukeboxEntity(jukebox.position), RecordItem: { type: 'compound', value: { Count: byte(1) } } })
      await driver.tick()
      read.push(disc())
      tell(jukeboxEntity(jukebox.position, { ...RECORDED_DISC, Name: string('minecraft:stone') }))
      await driver.tick()
      read.push(disc())
      tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
      await driver.tick()
      read.push(disc())
      tell({ id: string('Lectern'), x: int(jukebox.position.x), y: int(jukebox.position.y), z: int(jukebox.position.z) })
      await driver.tick()
      read.push(disc())
      assert.deepStrictEqual([read, bot.bedrock.jukeboxDisc(jukebox)], [[undefined, undefined, undefined, undefined, 'music_disc_cat', undefined], null])
      assert.throws(() => bot.bedrock.jukeboxDisc(other), { message: 'jukeboxDisc: air is not a jukebox' })
      bot.end()
    })
  })
})

// ---- the disc taken out by another use: not recorded (no recording takes a disc out); the use is the vanilla
// client's of each version (see useBlockTest), with the hand empty or holding another disc, naming no slot

describe('bedrock jukebox: the disc taken out by a use (not recorded)', () => {
  describe(`every version (${oldestSupportedBedrockVersion.slice(8)} – ${latestSupportedBedrockVersion.slice(8)})`, () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion)) {
      it(`bedrock ${version}: uses the jukebox with a swing, naming no slot, and resolves once the server told no disc`, async () => {
        const { bot, server, driver, errors, jukebox, tell } = await jukeboxBot(version)
        tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
        await driver.ticks(2)
        let taken = false
        const taking = bot.bedrock.takeDisc(jukebox).then(() => { taken = true })
        await driver.ticks(4)
        const click = server.sentOf('inventory_transaction').map(({ transaction: { transaction_data: data } }) => data !== undefined && 'block_position' in data ? [data.action_type, data.block_position, data.held_item.network_id] : [])
        const at = { x: 2, y: jukebox.position.y, z: 0 }
        assert.deepStrictEqual([click, actionsOf(server), server.sentOf('animate').map(({ action_id: action }) => action), taken],
          [[['click_block', at, 0]], [noActions(version)], ['swing_arm'], false])
        tell(jukeboxEntity(jukebox.position))
        await driver.tick()
        await taking
        assert.deepStrictEqual([taken, bot.bedrock.jukeboxDisc(jukebox), errors], [true, null, []])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('takes the disc out holding another, naming no slot', async () => {
      const { bot, server, driver, errors, inventory, jukebox, tell, idOf } = await jukeboxBot(version)
      inventory.slot('inventory', 0, { id: idOf('music_disc_13'), count: 1 })
      tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
      await driver.ticks(2)
      const taking = bot.bedrock.takeDisc(jukebox)
      await driver.ticks(4)
      tell(jukeboxEntity(jukebox.position))
      await driver.tick()
      await taking
      assert.deepStrictEqual([actionsOf(server), bot.heldItem?.name, errors], [[[]], 'music_disc_13', []])
      bot.end()
    })

    it('takes no disc out of a jukebox told holding none, nor of another block, sending nothing', async () => {
      const { bot, server, driver, errors, jukebox } = await jukeboxBot(version)
      await driver.ticks(2)
      await assert.rejects(bot.bedrock.takeDisc(jukebox), { message: 'takeDisc: the jukebox holds no disc' })
      const floor = bot.blockAt(jukebox.position.offset(-2, -1, 0))
      assert.ok(floor !== null)
      await assert.rejects(bot.bedrock.takeDisc(floor), { message: 'takeDisc: stone is not a jukebox' })
      await driver.ticks(4)
      assert.deepStrictEqual([server.sentOf('inventory_transaction'), server.sentOf('animate'), errors], [[], [], []])
      bot.end()
    })

    it(`rejects when the server tells the disc still in ${TOLD_TICKS} ticks after the use`, async () => {
      const { bot, driver, jukebox, tell } = await jukeboxBot(version)
      tell(jukeboxEntity(jukebox.position, RECORDED_DISC))
      await driver.ticks(2)
      const taking = assert.rejects(bot.bedrock.takeDisc(jukebox), { message: `the server took no disc out of the jukebox in ${TOLD_TICKS} ticks` })
      await driver.ticks(TOLD_TICKS + 8)
      await taking
      bot.end()
    })
  })
})
