import assert from 'assert'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// recorded packets of the vanilla client, grouped by how versions write them: the bot must send the client's, byte for byte

/** recorded in the features scenario (case mineflayer.hotbar): 2 dirt given in hotbar slot 0, key 2, then key 1 */
interface RecordedHotbar {
  from: BedrockVersion
  to: BedrockVersion
  /** the dirt as the recording's server gave it */
  dirt: Given
  /** interact mouse_over_entity: a new item in the hand */
  interact: string
  /** mob_equipment of hotbar slot 1, empty */
  emptySlot1: string
  /** mob_equipment of hotbar slot 0, the 2 dirt */
  dirtSlot0: string
}

const HOTBAR: readonly RecordedHotbar[] = [
  {
    // recorded on 1.16.201.2 and 1.16.210.5: aux items
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    dirt: { id: 3, count: 2, stackId: 2 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f01060400000000000000'
  },
  {
    // recorded on 1.16.220.2: a count and metadata, the block's runtime id
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.19.1',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: 3746 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000c43a0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.20.3: told before the tick's auth input
    from: 'bedrock_1.19.10',
    to: 'bedrock_1.21.124',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '210400000000000000000000000000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000f3c188db0f0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.132.1: the interact without a position
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.10',
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '21040000',
    emptySlot1: '1f0100010100',
    dirtSlot0: '1f010602000000f3c188db0f0a00000000000000000000000000'
  },
  {
    // recorded on 1.26.60.5: ItemV4s
    from: 'bedrock_1.26.20',
    to: latestSupportedBedrockVersion,
    dirt: { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 },
    interact: '21040000',
    emptySlot1: '1f010000000000000000010100',
    dirtSlot0: '1f0103000200000086dfbb92080a00000000000000000000000000'
  }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

/** the packets the bot sent in its last tick, as written, but its auth input by name and its section requests */
function lastTick (server: FakeBedrockClient, tick: number): string[] {
  return server.batches.flat().filter(packet => packet.tick === tick && packet.phase === 'T3' && packet.name !== 'subchunk_request')
    .map(({ name, params }) => name === 'player_auth_input' ? name : server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
}

/** the bot's packets since the last call, but its auth inputs and section requests, by name */
function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.map(({ name }) => name).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request')
  }
}

/** a bot joined, its items named by start_game's palette up to 1.21.50, holding `given` in hotbar slot 0 */
async function holding (version: BedrockVersion, given: Given | null): Promise<TestBot & { inventory: ServerInventory, tick: () => number }> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const inventory = new ServerInventory(testBot.server)
  if (given !== null) inventory.slot('inventory', 0, given)
  await testBot.driver.tick()
  return { ...testBot, inventory, tick: () => testBot.internal._core.tick ?? 0 }
}

describe('bedrock items', () => {
  for (const recorded of HOTBAR) {
    describe(`selecting a hotbar slot as the vanilla client's key (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: reads the slot at once, selects it in the next input pass and tells it in the next tick`, async () => {
          const { bot, server, driver, tick } = await holding(version, recorded.dirt)
          const held: Array<string | undefined> = []
          bot.on('heldItemChanged', item => { held.push(item?.name) })
          const placed = (told: string[]): string[] => atLeast(version, 'bedrock_1.19.10') ? [...told, 'player_auth_input'] : ['player_auth_input', ...told]

          bot.setQuickBarSlot(1)
          assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem, held], [1, null, []])
          await driver.frame(10)
          assert.deepStrictEqual(held, [undefined])
          await driver.tick()
          assert.deepStrictEqual(lastTick(server, tick()), placed([recorded.interact, recorded.emptySlot1]))

          bot.setQuickBarSlot(0)
          assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.count], [0, 2])
          await driver.tick()
          assert.deepStrictEqual([held, lastTick(server, tick())], [[undefined, bot.heldItem?.name], placed([recorded.interact, recorded.dirtSlot0])])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const dirt: Given = { id: 3, count: 2, stackId: 2, blockRuntimeId: -2108756090 }

    it('throws Java\'s assertion for a slot out of the hotbar', async () => {
      const { bot } = await holding(version, null)
      assert.throws(() => { bot.setQuickBarSlot(-1) }, { name: 'AssertionError' })
      assert.throws(() => { bot.setQuickBarSlot(9) }, { name: 'AssertionError' })
      assert.strictEqual(bot.QUICK_BAR_START, 36)
      bot.end()
    })

    it('selects nothing and tells nothing for the slot selected, as the vanilla client\'s key (recorded on 1.26.51.1)', async () => {
      const { bot, server, driver } = await holding(version, dirt)
      const sent = sentSince(server)
      let changes = 0
      bot.on('heldItemChanged', () => { changes++ })
      bot.setQuickBarSlot(0)
      await driver.tick()
      assert.deepStrictEqual([changes, sent()], [0, []])
      bot.end()
    })

    it('selects the last slot asked in a frame, and none when it is the one the frame started with', async () => {
      const { bot, internal, server, driver } = await holding(version, dirt)
      const sent = sentSince(server)
      const held: Array<number | undefined> = []
      bot.on('heldItemChanged', item => { held.push(item?.count) })
      bot.setQuickBarSlot(1)
      bot.setQuickBarSlot(0)
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.count], [0, 2])
      await driver.tick()
      assert.deepStrictEqual([held, sent()], [[], []])
      bot.setQuickBarSlot(1)
      bot.setQuickBarSlot(2)
      await driver.frame(10)
      assert.deepStrictEqual([internal._inventory.quickBarSlot, held], [2, [undefined]])
      await driver.tick()
      assert.deepStrictEqual([sent(), server.sentOf('mob_equipment').at(-1)?.selected_slot], [['interact', 'mob_equipment'], 2])
      bot.end()
    })

    it('selects a slot asked while the input pass selects another', async () => {
      const { bot, driver } = await holding(version, dirt)
      const selected: number[] = []
      bot.once('heldItemChanged', () => { bot.setQuickBarSlot(3) })
      bot.on('heldItemChanged', () => { selected.push(bot.quickBarSlot) })
      bot.setQuickBarSlot(1)
      await driver.frame(10)
      await driver.frame(10)
      assert.deepStrictEqual(selected, [3, 3])
      bot.end()
    })

    it('reads the server\'s selection after its own', async () => {
      const { bot, server, driver } = await holding(version, dirt)
      bot.setQuickBarSlot(1)
      await driver.frame(10)
      server.send('player_hotbar', { selected_slot: 2, window_id: 'inventory', select_slot: true })
      await driver.frame(10)
      assert.strictEqual(bot.quickBarSlot, 2)
      bot.end()
    })

    it('emits heldItemChanged for the slot asked, when the server changes it before the input pass selects it', async () => {
      const { bot, inventory, driver } = await holding(version, null)
      const held: Array<number | undefined> = []
      bot.on('heldItemChanged', item => { held.push(item?.count) })
      bot.setQuickBarSlot(1)
      inventory.slot('inventory', 1, dirt)
      inventory.slot('inventory', 0, { ...dirt, count: 5 })
      await driver.frame(10)
      assert.deepStrictEqual(held, [2, 2])
      bot.end()
    })

    it('tells another slot of an alike item by mob_equipment alone, its slot being the server\'s selection (not recorded)', async () => {
      const { bot, inventory, server, driver } = await holding(version, null)
      const sent = sentSince(server)
      bot.setQuickBarSlot(4)
      await driver.tick()
      const told = server.sentOf('mob_equipment').at(-1)
      assert.deepStrictEqual([sent(), told?.slot, told?.selected_slot, told?.item.network_id], [['mob_equipment'], 4, 4, 0])
      // another slot changed: the hand and its slot are as told
      inventory.slot('inventory', 8, dirt)
      await driver.tick()
      assert.deepStrictEqual(sent(), [])
      bot.end()
    })
  })
})
