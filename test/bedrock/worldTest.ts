import assert from 'assert'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import type { MCProtocol } from '../../lib/types/protocol/Bedrock.d.ts'
import { bedrockCodec } from './common/codec.ts'
import type { BedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Dimension } from './common/world.ts'

// The world as servers send it, grouped by how the version's servers send a column: whole up to 1.17.40; from 1.18.0
// without its sections, which the client asks for, in a request whose shape changed at 1.18.11 and 1.26.30.

type Point = readonly [number, number, number]

function sectionsFrom (lowest: number, highest: number): number[] {
  return Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index)
}

function namesAt (bot: BedrockBot, points: readonly Point[]): Array<string | null> {
  return points.map(([x, y, z]) => bot.blockAt(new Vec3(x, y, z))?.name ?? null)
}

/** the world's events of the frames `step` steps, in order, and the ends of their ticks */
async function eventsOf (bot: BedrockBot, step: () => Promise<void>): Promise<string[]> {
  const events: string[] = []
  const chunkColumnLoad = (corner: Vec3): void => { events.push(`chunkColumnLoad ${corner.toString()}`) }
  const physicsTick = (): void => { events.push('physicsTick') }
  const blockUpdate = (oldBlock: Block | null, newBlock: Block): void => { events.push(`blockUpdate ${oldBlock?.name} -> ${newBlock.name}`) }
  const blockUpdateAt = ['blockUpdate:(1, 12, 0)', 'blockUpdate:(0, 20, 0)', 'blockUpdate:(17, 12, -2)'] as const
  const blockUpdatedAt = blockUpdateAt.map(at => (oldBlock: Block, newBlock: Block): void => { events.push(`${at} ${oldBlock.name} -> ${newBlock.name}`) })
  bot.on('chunkColumnLoad', chunkColumnLoad)
  bot.on('physicsTick', physicsTick)
  bot.on('blockUpdate', blockUpdate)
  blockUpdateAt.forEach((at, index) => { bot.on(at, blockUpdatedAt[index]!) })
  await step()
  bot.off('chunkColumnLoad', chunkColumnLoad)
  bot.off('physicsTick', physicsTick)
  bot.off('blockUpdate', blockUpdate)
  blockUpdateAt.forEach((at, index) => { bot.off(at, blockUpdatedAt[index]!) })
  return events
}

/** update_block: by coordinates and storage layer on 1.16.201, by position and layer after */
function updateBlock (server: FakeBedrockClient, [x, y, z]: Point, stateId: number, layer = 0): void {
  if (isBedrockVersionAtLeast(server.codec.version, 'bedrock_1.16.210')) server.send('update_block', { position: { x, y, z }, block_runtime_id: stateId, layer })
  else server.send('update_block', { coordinates: { x, y, z }, block_runtime_id: stateId, block_priority: 3, storage: layer })
}

/** a block of update_subchunk_blocks */
function subchunkBlock ([x, y, z]: Point, stateId: number): MCProtocol.Bedrock.Write.Types.BlockUpdate {
  return { position: { x, y, z }, runtime_id: stateId, flags: 3, entity_unique_id: 0n, transition_type: 'entity' }
}

/**
 * sections 0 to 2 of column (0, 0) answered (stone, air, and one the server could not give) show from the next tick:
 * not in the frame's packet pass; the one not given is asked for again
 */
async function showsAnsweredSectionsNextTick ({ bot, internal, driver }: TestBot, world: ServerWorld): Promise<void> {
  await driver.frame(0)
  assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 20, 0], [0, 40, 0]]), [null, null, null])
  await driver.tick()
  // section 1 is air; section 2 was not given, -1 not answered
  assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 15], [0, 12, 0], [0, 20, 0], [0, 40, 0], [0, -0.5, 0]]), ['stone', 'stone', 'air', 'air', null, null])
  assert.strictEqual(internal._world.loadedAround(new Vec3(0.5, 12, 0.5), 0), false)
  assert.deepStrictEqual(world.asked().slice(24), [{ dimension: 0, x: 0, y: 2, z: 0 }])
}

/** the heightmap fields of a section of a subchunk, as the version's servers write them (none sent) */
function noHeightmaps (version: BedrockVersion): { heightmap_type: 'no_data', render_heightmap_type?: 'no_data' } {
  return isBedrockVersionAtLeast(version, 'bedrock_1.21.90') ? { heightmap_type: 'no_data', render_heightmap_type: 'no_data' } : { heightmap_type: 'no_data' }
}

describe('bedrock world', () => {
  describe('servers sending whole columns (up to 1.17.40)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40')) {
      describe(`bedrock ${version}`, () => {
        let codec: BedrockCodec
        before(() => { codec = bedrockCodec(version) })

        it('shows a column from the start of the next tick', async () => {
          const { bot, internal, server, driver } = await bedrockTestBot(codec)
          const world = new ServerWorld(server)
          world.startGame()
          server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: 1, payload: await world.column(0, 0).networkEncodeNoCache() })
          server.send('level_chunk', { x: 1, z: 0, sub_chunk_count: 0, payload: await world.column(1, 0, []).networkEncodeNoCache() })
          assert.deepStrictEqual(await eventsOf(bot, async () => { await driver.frame(0) }), [])
          assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), [null])
          assert.deepStrictEqual([internal._world.columnPresent(1, 0), internal._world.sectionKnown(1, 12, 0)], [false, false])
          assert.deepStrictEqual(await eventsOf(bot, async () => { await driver.tick() }), ['chunkColumnLoad (0, 0, 0)', 'chunkColumnLoad (16, 0, 0)', 'physicsTick'])
          assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 15], [15, 11, 15], [0, 12, 0], [15, 200, 15], [16, 11, 0], [32, 11, 0], [0, 11, -1]]), ['stone', 'stone', 'stone', 'air', 'air', 'air', null, null])
          assert.ok(internal._world.loadedAround(new Vec3(0.5, 12, 0.5), 0))
          assert.deepStrictEqual(server.sentOf('subchunk_request'), [])
        })

        it('shows a column sent again from the next tick, with the blocks changed in its frame', async () => {
          const { bot, server, driver } = await bedrockTestBot(codec)
          const world = new ServerWorld(server)
          world.startGame()
          world.column(0, 0)
          await world.load(driver, [[0, 0]])
          const sentAgain = await eventsOf(bot, async () => {
            await world.sendColumn(0, 0)
            updateBlock(server, [1, 12, 0], world.stateId('dirt'))
            await driver.frame(0)
          })
          assert.deepStrictEqual(sentAgain, [])
          assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), ['stone'])
          assert.deepStrictEqual(await eventsOf(bot, async () => { await driver.tick() }), ['chunkColumnLoad (0, 0, 0)', 'physicsTick'])
          assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 0]]), ['dirt', 'stone'])
        })

        it('reports a column whose sections it would ask for, which a column before 1.18.0 cannot', async () => {
          const { bot, internal, server, driver } = await bedrockTestBot(codec)
          const errors: string[] = []
          bot.on('error', error => { errors.push(error.message) })
          new ServerWorld(server).startGame()
          server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: -1, payload: Buffer.from([0]) })
          await driver.tick()
          assert.deepStrictEqual(errors, ['level_chunk (0, 0) asks for its sections, which a column before 1.18.0 cannot'])
          assert.deepStrictEqual(internal._core.stats.packets.get('level_chunk'), { handled: 0, threw: 1, unhandled: 0 })
          assert.strictEqual(internal._world.columnPresent(0, 0), false)
        })
      })
    }
  })

  describe('servers sending a column without its sections, then each section asked for in its own packet (1.18.0)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.18.0')) {
      it(`bedrock ${version}: asks for every section in the tick that shows the column, and shows each answer from the next tick`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { bot, internal, server, driver } = testBot
        const world = new ServerWorld(server)
        world.startGame()
        const column = world.column(0, 0)
        server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: -1, payload: await column.networkEncodeNoCache() })
        await driver.tick()
        assert.deepStrictEqual(server.inTick(internal._core.tick ?? -1), Array(24).fill('subchunk_request'))
        assert.deepStrictEqual(server.sentOf('subchunk_request'), sectionsFrom(-4, 19).map(y => ({ dimension: 0, x: 0, y, z: 0 })))
        assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), [null])
        // 1.18.0 has no result for a section of air: it is a section of air
        column.setBlockStateId({ x: 0, y: 16, z: 0 }, world.stateId('air'))
        server.send('subchunk', { dimension: 0, x: 0, y: 0, z: 0, data: await column.networkEncodeSubChunkNoCache(0), request_result: 'success', heightmap_type: 'no_data' })
        server.send('subchunk', { dimension: 0, x: 0, y: 1, z: 0, data: await column.networkEncodeSubChunkNoCache(1), request_result: 'success', heightmap_type: 'no_data' })
        server.send('subchunk', { dimension: 0, x: 0, y: 2, z: 0, data: Buffer.alloc(0), request_result: 'chunk_not_found', heightmap_type: 'no_data' })
        await showsAnsweredSectionsNextTick(testBot, world)
      })
    }
  })

  describe('servers sending a column with no sections as a whole column of air (1.18.0 – 1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: shows a column of a count of 0 as air, asking for none of its sections`, async () => {
        const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: 0, payload: await world.column(0, 0, []).networkEncodeNoCache() })
        await driver.ticks(2)
        assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, -64, 0]]), ['air', 'air'])
        assert.ok(internal._world.loadedAround(new Vec3(0.5, 12, 0.5), 0))
        assert.deepStrictEqual(server.sentOf('subchunk_request'), [])
      })
    }
  })

  describe('servers sending a column without its sections, then the sections asked for by offsets from the player\'s column (1.18.11 – 1.26.20)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.11', 'bedrock_1.26.20')) {
      it(`bedrock ${version}: asks for every section in the tick that shows the column, and shows each answer from the next tick`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { internal, server, driver } = testBot
        const world = new ServerWorld(server)
        world.startGame({ x: 40.5, y: 12, z: -7.5 })
        const column = world.column(0, 0)
        server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: -2, highest_subchunk_count: 4, payload: await column.networkEncodeNoCache() })
        await driver.tick()
        assert.deepStrictEqual(server.inTick(internal._core.tick ?? -1), ['subchunk_request'])
        const origin = { x: 2, y: 0, z: -1 }
        assert.deepStrictEqual(server.sentOf('subchunk_request'), [{ dimension: 0, origin, requests: sectionsFrom(-4, 19).map(y => ({ dx: -2, dy: y, dz: 1 })) }])
        server.send('subchunk', {
          cache_enabled: false,
          dimension: 0,
          origin,
          entries: [
            { dx: -2, dy: 0, dz: 1, result: 'success', payload: await column.networkEncodeSubChunkNoCache(0), ...noHeightmaps(version) },
            { dx: -2, dy: 1, dz: 1, result: 'success_all_air', payload: Buffer.alloc(0), ...noHeightmaps(version) },
            { dx: -2, dy: 2, dz: 1, result: 'player_not_found', payload: Buffer.alloc(0), ...noHeightmaps(version) }
          ]
        })
        await showsAnsweredSectionsNextTick(testBot, world)
      })
    }
  })

  describe('servers sending a column without its sections, then the sections asked for by byte offsets from the player\'s column (1.26.30)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.30', 'bedrock_1.26.30')) {
      it(`bedrock ${version}: asks for every section in the tick that shows the column, and shows each answer from the next tick`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { server, driver } = testBot
        const world = new ServerWorld(server)
        world.startGame({ x: 40.5, y: 12, z: -7.5 })
        const column = world.column(0, 0)
        server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: -2, highest_subchunk_count: 5, payload: await column.networkEncodeNoCache() })
        await driver.tick()
        const origin = { x: 2, y: 0, z: -1 }
        assert.deepStrictEqual(server.sentOf('subchunk_request'), [{ dimension: 0, requests: sectionsFrom(-4, 19).map(y => ({ x: -2, y, z: 1 })), origin }])
        server.send('subchunk', {
          cache_enabled: false,
          dimension: 0,
          origin,
          entries: [
            { dx: -2, dy: 0, dz: 1, result: 'success', payload: await column.networkEncodeSubChunkNoCache(0), heightmap_type: 'no_data', render_heightmap_type: 'no_data' },
            { dx: -2, dy: 1, dz: 1, result: 'success_all_air', payload: Buffer.alloc(0), heightmap_type: 'no_data', render_heightmap_type: 'no_data' },
            { dx: -2, dy: 2, dz: 1, result: 'player_not_found', payload: Buffer.alloc(0), heightmap_type: 'no_data', render_heightmap_type: 'no_data' }
          ]
        })
        await showsAnsweredSectionsNextTick(testBot, world)
      })
    }
  })

  describe('servers sending a column of no sections, then the sections asked for by byte offsets from the player\'s column (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: asks for every section in the tick that shows the column, and shows each answer from the next tick`, async () => {
        const testBot = await bedrockTestBot(bedrockCodec(version))
        const { server, driver } = testBot
        const world = new ServerWorld(server)
        world.startGame({ x: 40.5, y: 12, z: -7.5 })
        const column = world.column(0, 0)
        server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: 0, highest_subchunk_count: 0, payload: await column.networkEncodeNoCache() })
        await driver.tick()
        const origin = { x: 2, y: 0, z: -1 }
        assert.deepStrictEqual(server.sentOf('subchunk_request'), [{ dimension: 0, requests: sectionsFrom(-4, 19).map(y => ({ x: -2, y, z: 1 })), origin }])
        server.send('subchunk', {
          cache_enabled: false,
          dimension: 0,
          origin,
          entries: [
            { dx: -2, dy: 0, dz: 1, result: 'success', payload: await column.networkEncodeSubChunkNoCache(0), heightmap_type: 'no_data', render_heightmap_type: 'no_data' },
            { dx: -2, dy: 1, dz: 1, result: 'success_all_air', heightmap_type: 'no_data', render_heightmap_type: 'no_data' },
            { dx: -2, dy: 2, dz: 1, result: 'player_not_found', heightmap_type: 'no_data', render_heightmap_type: 'no_data' }
          ]
        })
        await showsAnsweredSectionsNextTick(testBot, world)
      })
    }
  })

  describe('servers changing a block by update_block (by its coordinates and storage layer on 1.16.201)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201')) {
      it(`bedrock ${version}: changes a shown block in the packet pass, and only its column before the column is shown`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        world.column(0, 0)
        world.column(1, -1, [])
        await world.load(driver, [[0, 0]])
        const dirt = world.stateId('dirt')
        const changes = await eventsOf(bot, async () => {
          updateBlock(server, [1, 12, 0], dirt)
          updateBlock(server, [0, 12, 0], dirt, 1)
          await driver.frame(0)
        })
        assert.deepStrictEqual(changes, ['blockUpdate stone -> dirt', 'blockUpdate:(1, 12, 0) stone -> dirt'])
        assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 12, 0]]), ['dirt', 'air'])
        const stagedChanges = await eventsOf(bot, async () => {
          await world.sendColumn(1, -1)
          updateBlock(server, [17, 12, -2], dirt)
          await driver.tick()
        })
        assert.deepStrictEqual(stagedChanges, ['chunkColumnLoad (16, 0, -16)', 'physicsTick'])
        // the column holds it; from 1.18.0 its section shows once answered
        assert.strictEqual(bot.world.getBlock(new Vec3(17, 12, -2)).name, 'dirt')
      })
    }
  })

  describe('servers changing the blocks of a section together (1.17.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.17.30')) {
      it(`bedrock ${version}: changes the first layer's blocks in the packet pass`, async () => {
        const { bot, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        world.column(0, 0)
        await world.load(driver, [[0, 0]])
        const dirt = world.stateId('dirt')
        const changes = await eventsOf(bot, async () => {
          server.send('update_subchunk_blocks', { x: 0, y: 0, z: 0, blocks: [subchunkBlock([1, 12, 0], dirt)], extra: [subchunkBlock([0, 12, 0], dirt)] })
          await driver.frame(0)
        })
        assert.deepStrictEqual(changes, ['blockUpdate stone -> dirt', 'blockUpdate:(1, 12, 0) stone -> dirt'])
        assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 12, 0]]), ['dirt', 'air'])
      })
    }
  })

  describe('servers sending each column with its dimension (1.20.61+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.61')) {
      it(`bedrock ${version}: drops a column of another dimension`, async () => {
        const { internal, server, driver } = await bedrockTestBot(bedrockCodec(version))
        const world = new ServerWorld(server)
        world.startGame()
        server.send('level_chunk', { x: 0, z: 0, dimension: 1, sub_chunk_count: 0, payload: await world.column(0, 0).networkEncodeNoCache() })
        await driver.ticks(2)
        assert.strictEqual(internal._world.stats.otherDimension, 1)
        assert.strictEqual(internal._world.columnPresent(0, 0), false)
        assert.deepStrictEqual(server.sentOf('subchunk_request'), [])
      })
    }
  })

  /**
   * the sections the bot asks for in a column of the dimension, as [dimension, x, y, z], and whether it knows the blocks
   * at `heights` before an answer
   */
  async function sectionsAskedIn (codec: BedrockCodec, dimension: Dimension, heights: readonly number[]): Promise<[number[][], boolean[]]> {
    const { internal, server, driver } = await bedrockTestBot(codec)
    const world = new ServerWorld(server, { dimension })
    world.startGame()
    world.column(0, 0, [])
    await world.sendColumn(0, 0)
    await driver.tick()
    return [world.asked().map(section => [section.dimension, section.x, section.y, section.z]), heights.map(y => internal._world.sectionKnown(0, y, 0))]
  }

  describe('servers numbering the dimension in start_game (1.18.0 – 1.18.11)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.0', 'bedrock_1.18.11')) {
      it(`bedrock ${version}: asks for the sections of the nether's and the end's columns, the blocks above and below them air`, async () => {
        const codec = bedrockCodec(version)
        assert.deepStrictEqual(await sectionsAskedIn(codec, 'nether', [-1, 0, 127, 128]), [sectionsFrom(0, 7).map(y => [1, 0, y, 0]), [true, false, false, true]])
        assert.deepStrictEqual(await sectionsAskedIn(codec, 'end', [-1, 0, 255, 256]), [sectionsFrom(0, 15).map(y => [2, 0, y, 0]), [true, false, false, true]])
      })
    }
  })

  describe('servers naming the dimension in start_game (1.18.30+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.18.30')) {
      it(`bedrock ${version}: asks for the sections of the nether's and the end's columns, the blocks above and below them air`, async () => {
        const codec = bedrockCodec(version)
        assert.deepStrictEqual(await sectionsAskedIn(codec, 'nether', [-1, 0, 127, 128]), [sectionsFrom(0, 7).map(y => [1, 0, y, 0]), [true, false, false, true]])
        assert.deepStrictEqual(await sectionsAskedIn(codec, 'end', [-1, 0, 255, 256]), [sectionsFrom(0, 15).map(y => [2, 0, y, 0]), [true, false, false, true]])
      })
    }
  })

  /** the block (and its state) at (1, 12, 0), in a world whose start_game numbers the block states by hash or not */
  async function stoneAt (codec: BedrockCodec, hashes: boolean): Promise<[string | null, number | null, number]> {
    const { bot, server, driver } = await bedrockTestBot(codec)
    const world = new ServerWorld(server, { hashes })
    world.startGame()
    world.column(0, 0)
    await world.load(driver, [[0, 0]])
    const block = bot.blockAt(new Vec3(1, 12, 0))
    return [block?.name ?? null, block?.stateId ?? null, world.stateId('stone')]
  }

  describe('servers numbering the block states by their hash (1.20.0+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.0')) {
      it(`bedrock ${version}: reads the hashed states of the sections`, async () => {
        const [name, stateId, stone] = await stoneAt(bedrockCodec(version), true)
        assert.deepStrictEqual([name, stateId], ['stone', stone])
        assert.ok(stone < 0 || stone > 100_000, `${stone} is the hash of stone`)
      })
    }
  })

  describe('servers that could number the block states by their hash, numbering them in order (1.19.80)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.80', 'bedrock_1.19.80')) {
      it(`bedrock ${version}: reads the states of the sections in order`, async () => {
        const [name, stateId, stone] = await stoneAt(bedrockCodec(version), false)
        assert.deepStrictEqual([name, stateId], ['stone', stone])
        assert.ok(stone > 0 && stone < 100_000, `${stone} is the index of stone`)
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    let codec: BedrockCodec
    before(() => { codec = bedrockCodec(latestSupportedBedrockVersion) })

    it('asks for at most 256 sections a tick, the nearest columns first, each section once, and none in a replayed tick', async () => {
      const { internal, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame({ x: 16.5, y: 12, z: 31.5 })
      const arrived = [[4, 1], [1, 1], [0, 2], [3, 3], [2, 1], [1, -1], [-2, -2], [2, 2], [1, 3], [-1, 1], [3, 0]] as const
      for (const [x, z] of arrived) {
        world.column(x, z, [])
        await world.sendColumn(x, z)
      }
      const columnsAsked = (): string[] => [...new Set(world.asked().map(({ x, z }) => `${x},${z}`))]
      await driver.tick()
      assert.strictEqual(world.asked().length, 256)
      assert.deepStrictEqual(columnsAsked(), ['1,1', '0,2', '2,1', '2,2', '3,3', '1,-1', '1,3', '-1,1', '3,0', '4,1', '-2,-2'])
      assert.deepStrictEqual(world.asked().slice(240).map(({ y }) => y), sectionsFrom(-4, 11))
      internal._core.replay(internal._core.tick ?? -1)
      await driver.tick()
      assert.deepStrictEqual(world.asked().slice(256).map(({ x, y, z }) => [x, y, z]), sectionsFrom(12, 19).map(y => [-2, y, -2]))
      await driver.ticks(2)
      assert.strictEqual(server.sentOf('subchunk_request').length, 2)
    })

    it('asks for no section of a column too far from the player\'s for a byte offset', async () => {
      const { server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      for (const [x, z] of [[128, 0], [0, -128], [127, -127]] as const) {
        world.column(x, z, [])
        await world.sendColumn(x, z)
      }
      await driver.ticks(2)
      assert.deepStrictEqual([...new Set(world.asked().map(({ x, z }) => `${x},${z}`))], ['127,-127'])
    })

    it('knows a column, its sections and the columns around a point as the answers come, and air above and below the sections', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      const around = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 0], [0, 1], [1, -1], [1, 1]] as const
      for (const [x, z] of around) world.column(x, z)
      const feet = new Vec3(0.5, 12, 0.5)
      const known = (): boolean[] => [
        internal._world.columnPresent(15.9, -0.5),
        internal._world.columnPresent(-16.5, 0.5),
        internal._world.sectionKnown(1, 12, 0),
        internal._world.sectionKnown(-0.5, 12, 0),
        internal._world.sectionKnown(0.5, 12, -16.5),
        internal._world.sectionKnown(1, 320, 0),
        internal._world.sectionKnown(1, -65, 0),
        internal._world.loadedAround(feet, 0),
        internal._world.loadedAround(feet, 1)
      ]
      for (const [x, z] of around) await world.sendColumn(x, z)
      await driver.frame(0)
      assert.deepStrictEqual(known(), [false, false, false, false, false, false, false, false, false])
      await driver.tick()
      assert.deepStrictEqual(known(), [true, false, false, false, false, true, true, false, false])
      assert.deepStrictEqual(namesAt(bot, [[1, 330, 0], [1, -70, 0]]), ['air', 'air'])
      await world.answer()
      await driver.tick()
      assert.deepStrictEqual(known(), [true, false, true, true, false, true, true, true, false])
      world.column(1, 0)
      await world.load(driver, [[1, 0]])
      // the columns around (0, 0), not those around (-1, 0), (0, -1) or (0, 1)
      assert.deepStrictEqual([feet, new Vec3(-0.5, 12, 0.5), new Vec3(0.5, 12, -15.5), new Vec3(0.5, 12, 16.5)].map(point => internal._world.loadedAround(point, 1)), [true, false, false, false])
    })

    it('changes only the column of a block whose section was answered in the frame', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      world.column(0, 0)
      await world.sendColumn(0, 0)
      await driver.tick()
      const changes = await eventsOf(bot, async () => {
        await world.answer()
        server.send('update_block', { position: { x: 0, y: 20, z: 0 }, block_runtime_id: world.stateId('dirt'), layer: 0 })
        await driver.frame(0)
      })
      assert.deepStrictEqual(changes, [])
      await driver.tick()
      assert.deepStrictEqual(namesAt(bot, [[0, 20, 0], [1, 12, 0]]), ['dirt', 'stone'])
    })

    it('shows a column sent again from the next tick, with the blocks changed in its frame, and asks for its sections again', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      const column = world.column(0, 0)
      await world.load(driver, [[0, 0]])
      const dirt = world.stateId('dirt')
      column.setBlockStateId({ x: 1, y: 12, z: 0 }, dirt)
      const sentAgain = await eventsOf(bot, async () => {
        await world.sendColumn(0, 0)
        server.send('update_block', { position: { x: 1, y: 12, z: 0 }, block_runtime_id: dirt, layer: 0 })
        await driver.frame(0)
      })
      assert.deepStrictEqual(sentAgain, [])
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), ['stone'])
      assert.deepStrictEqual(await eventsOf(bot, async () => { await driver.tick() }), ['chunkColumnLoad (0, 0, 0)', 'physicsTick'])
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 0]]), [null, null])
      assert.strictEqual(internal._world.loadedAround(new Vec3(0.5, 12, 0.5), 0), false)
      assert.strictEqual(bot.world.getBlock(new Vec3(1, 12, 0)).name, 'dirt')
      assert.deepStrictEqual(world.asked().slice(24), sectionsFrom(-4, 19).map(y => ({ dimension: 0, x: 0, y, z: 0 })))
      await world.answer()
      await driver.tick()
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 0]]), ['dirt', 'stone'])
      assert.ok(internal._world.loadedAround(new Vec3(0.5, 12, 0.5), 0))
    })

    it('takes the answers that follow a column sent again into it, without asking for them again', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      world.column(0, 0)
      await world.sendColumn(0, 0)
      await driver.tick()
      await world.sendColumn(0, 0)
      await world.answer()
      await driver.ticks(2)
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 11, 0]]), ['stone', 'stone'])
      assert.strictEqual(world.asked().length, 24)
    })

    it('calls each listener apart: one that throws is reported, and the others and the rest of the packet go on', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      world.column(0, 0)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      const fail = (): void => { throw new Error('a listener failed') }
      bot.on('chunkColumnLoad', fail)
      bot.on('blockUpdate', fail)
      bot.on('blockUpdate:(1, 12, 0)', fail)
      let heardOnce = 0
      bot.once('blockUpdate', () => { heardOnce++ })
      const dirt = world.stateId('dirt')
      const events = await eventsOf(bot, async () => {
        await world.load(driver, [[0, 0]])
        server.send('update_subchunk_blocks', { x: 0, y: 0, z: 0, blocks: [subchunkBlock([1, 12, 0], dirt), subchunkBlock([2, 12, 0], dirt)], extra: [] })
        await driver.frame(0)
      })
      assert.deepStrictEqual(events, ['chunkColumnLoad (0, 0, 0)', 'physicsTick', 'physicsTick', 'blockUpdate stone -> dirt', 'blockUpdate:(1, 12, 0) stone -> dirt', 'blockUpdate air -> dirt'])
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [2, 12, 0]]), ['dirt', 'dirt'])
      assert.strictEqual(heardOnce, 1)
      assert.deepStrictEqual(errors, Array(4).fill('a listener failed'))
      assert.strictEqual(internal._core.stats.errors, 4)
    })

    it('waits for the columns within 2 of the player\'s to load, from before start_game', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      let loaded = false
      bot.waitForChunksToLoad().then(() => { loaded = true }, () => {})
      const world = new ServerWorld(server)
      world.startGame({ x: 40.5, y: 12, z: -7.5 })
      // the 5 × 5 around column (2, -1) but its corner (4, 1): 576 sections, 256 asked a tick
      for (let x = 0; x <= 4; x++) {
        for (let z = -3; z <= 1; z++) {
          world.column(x, z, [])
          if (x !== 4 || z !== 1) await world.sendColumn(x, z)
        }
      }
      for (let round = 0; round < 4; round++) {
        await driver.tick()
        await world.answer()
      }
      assert.strictEqual(loaded, false)
      await world.load(driver, [[4, 1]])
      assert.strictEqual(loaded, true)
    })

    it('stops waiting for the columns around the player\'s after 200 ticks, naming how many it waited for', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      const nearest = sectionsFrom(-1, 1).flatMap(x => sectionsFrom(-1, 1).map(z => [x, z] as const))
      for (const [x, z] of nearest) world.column(x, z, [])
      await world.load(driver, nearest)
      let failure: string | undefined
      bot.waitForChunksToLoad().catch((error: Error) => { failure = error.message })
      await driver.ticks(199)
      assert.strictEqual(failure, undefined)
      await driver.tick()
      assert.strictEqual(failure, 'Timeout waiting for 16 chunks to load after 200 ticks')
    })

    it('reads a column sent with its sections (a count above 0) whole', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      const column = world.column(0, 0, [[0, -64, 0, 'air'], [0, -48, 0, 'air'], [0, -32, 0, 'air'], [0, -16, 0, 'air'], [1, 12, 0, 'stone']])
      const sections = await Promise.all(sectionsFrom(-4, 0).map(async y => await column.networkEncodeSubChunkNoCache(y)))
      server.send('level_chunk', { x: 0, z: 0, sub_chunk_count: 5, payload: Buffer.concat([...sections, await column.networkEncodeNoCache()]) })
      await driver.ticks(2)
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0], [0, 12, 0], [0, 100, 0]]), ['stone', 'air', 'air'])
      assert.deepStrictEqual(server.sentOf('subchunk_request'), [])
    })

    it('places each section answered at the origin plus its offset', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      const column = world.column(0, 0)
      await world.sendColumn(0, 0)
      await driver.tick()
      const section = { result: 'success', payload: await column.networkEncodeSubChunkNoCache(0), heightmap_type: 'no_data', render_heightmap_type: 'no_data' } as const
      server.send('subchunk', { cache_enabled: false, dimension: 0, origin: { x: 1, y: 2, z: -1 }, entries: [{ dx: -1, dy: -2, dz: 1, ...section }] })
      await driver.tick()
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), ['stone'])
    })

    it('drops columns and sections sent for the client cache, which the bot keeps none of', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      const world = new ServerWorld(server)
      world.startGame()
      world.column(0, 0)
      server.send('level_chunk', { x: 1, z: 0, sub_chunk_count: 0, cache_enabled: true, blobs: [7n], payload: Buffer.from([0]) })
      await world.sendColumn(0, 0)
      await driver.tick()
      server.send('subchunk', { cache_enabled: true, dimension: 0, origin: { x: 0, y: 0, z: 0 }, entries: [{ dx: 0, dy: 0, dz: 0, result: 'success', heightmap_type: 'no_data', render_heightmap_type: 'no_data', blob_id: 9n }] })
      await driver.tick()
      assert.strictEqual(internal._world.stats.cached, 2)
      assert.strictEqual(internal._world.columnPresent(16, 0), false)
      assert.deepStrictEqual(namesAt(bot, [[1, 12, 0]]), [null])
    })

    it('drops the sections and block changes of a column it was not sent', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(codec)
      new ServerWorld(server).startGame()
      const changes = await eventsOf(bot, async () => {
        server.send('subchunk', { cache_enabled: false, dimension: 0, origin: { x: 0, y: 0, z: 0 }, entries: [{ dx: 0, dy: 0, dz: 0, result: 'success_all_air', heightmap_type: 'no_data', render_heightmap_type: 'no_data' }] })
        server.send('update_block', { position: { x: 1, y: 12, z: 0 }, block_runtime_id: 0, layer: 0 })
        await driver.tick()
      })
      assert.deepStrictEqual(changes, ['physicsTick'])
      assert.strictEqual(internal._world.stats.unknownColumn, 2)
      assert.strictEqual(internal._world.sectionKnown(0, 0, 0), false)
    })

    it('reports a column sent before start_game', async () => {
      const { bot, server, driver } = await bedrockTestBot(codec)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      server.send('level_chunk', { x: 0, z: 0 })
      await driver.frame(0)
      assert.deepStrictEqual(errors, ['level_chunk before start_game'])
    })
  })
})
