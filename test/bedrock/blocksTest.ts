import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Tags } from 'prismarine-nbt'
import { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, spawned, write } from './common/entities.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld, stoneFloor } from './common/world.ts'
import type { BlockAt, Dimension } from './common/world.ts'

// Java's world queries over the blocks blockAt shows: findBlocks, findBlock, canSeeBlock and the block at the cursor.
// The player stands at (0.5, 12, 0.5) on the test world's stone floor (y 11) of the 3 × 3 columns around (0, 0), stone
// at (1, 12, 0), looking north (−z), its eye 1.62001 over its feet. No version differs but in the dimension's height:
// the overworld's 0 to 255 up to 1.17.40, −64 to 319 from 1.18.0, the nether's 0 to 127.

const latest: BedrockVersion = latestSupportedBedrockVersion
const string = (value: string): Tags['string'] => ({ type: 'string', value })
const int = (value: number): Tags['int'] => ({ type: 'int', value })

type Point = readonly [number, number, number]
type World = TestBot & { world: ServerWorld }

/** a bot joined to the test world with `blocks`, every section of its columns answered */
async function joined (version: BedrockVersion, { blocks = [], dimension = 'overworld', hashes = false }: { blocks?: readonly BlockAt[], dimension?: Dimension, hashes?: boolean } = {}): Promise<World> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { blocks, dimension, hashes })
  // Bedrock's yaw 180 is north, mineflayer's 0
  await world.join(testBot, { rotation: { yaw: 180, pitch: 0 } })
  await answered(testBot, world)
  return { ...testBot, world }
}

/** ticks, answering the bot, until it knows every section of the columns around the player's */
async function answered ({ internal, driver }: TestBot, world: ServerWorld): Promise<void> {
  await driver.runUntil(() => internal._world.loadedAround(internal.entity.position, 1), 20)
  await world.answer()
}

/** column (x, z) with `blocks` shown, its sections answered */
async function shown ({ driver }: TestBot, world: ServerWorld, x: number, z: number, blocks: readonly BlockAt[]): Promise<void> {
  world.column(x, z, [...stoneFloor(x, z), ...blocks])
  await world.load(driver, [[x, z]])
}

const at = (...points: Point[]): Vec3[] => points.map(point => new Vec3(...point))
const id = (bot: BedrockBot, name: string): number => bot.registry.blocksByName[name]!.id
/** a point's coordinates to 6 decimals: a ray's sines leave a little off */
const rounded = (point: Vec3): number[] => [point.x, point.y, point.z].map(value => Math.round(value * 1e6) / 1e6)

/** the player turned by the bot's look, once an auth input carried it */
async function turn ({ bot, driver }: TestBot, yaw: number, pitch: number): Promise<void> {
  const looked = bot.look(yaw, pitch)
  await driver.ticks(3)
  await looked
}

describe('bedrock findBlocks and findBlock (the latest; no version differs)', () => {
  const blocks: BlockAt[] = [[3, 12, 0, 'diamond_block'], [0, 12, -5, 'diamond_block'], [-6, 14, 2, 'diamond_block'], [0, 13, 2, 'gold_block']]

  it('finds the blocks of a type, of types, or a matcher takes, nearest the floored point first, as Java', async () => {
    // the block states numbered by their hashes, as servers do from 1.20.0
    const { bot } = await joined(latest, { blocks, hashes: true })
    const diamond = id(bot, 'diamond_block')
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond }), at([3, 12, 0]))
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, count: 10 }), at([3, 12, 0], [0, 12, -5], [-6, 14, 2]))
    assert.deepStrictEqual(bot.findBlocks({ matching: [diamond, id(bot, 'gold_block')], count: 10 }), at([0, 13, 2], [3, 12, 0], [0, 12, -5], [-6, 14, 2]))
    assert.deepStrictEqual(bot.findBlocks({ matching: block => block.name === 'gold_block', count: 10 }), at([0, 13, 2]))
    // a corner's distance from the point's block, within maxDistance
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, count: 10, maxDistance: 5 }), at([3, 12, 0], [0, 12, -5]))
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, count: 10, maxDistance: 4.99 }), at([3, 12, 0]))
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, point: new Vec3(0.9, 12.9, -4.1), maxDistance: 0.5 }), at([0, 12, -5]))
    // Java's: a maxDistance or a count of 0 is the default
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, count: 10, maxDistance: 0 }), at([3, 12, 0], [0, 12, -5], [-6, 14, 2]))
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, count: 0 }), at([3, 12, 0]))
    assert.deepStrictEqual(bot.findBlocks({ matching: id(bot, 'emerald_block') }), [])
    const found = bot.findBlock({ matching: diamond, point: new Vec3(-5, 13, 2) })
    assert.deepStrictEqual([found?.name, found?.position], ['diamond_block', new Vec3(-6, 14, 2)])
    assert.strictEqual(bot.findBlock({ matching: id(bot, 'emerald_block') }), null)
    bot.end()
  })

  it("searches Java's octahedron of sections: the start's alone once it has the count, else a layer started and the next one's first", async () => {
    const testBot = await joined(latest, { blocks: [[0, 12, 8, 'diamond_block'], [16, 12, 8, 'diamond_block'], [-16, 12, 0, 'gold_block'], [16, 12, 7, 'gold_block'], [31, 12, 8, 'emerald_block'], [-1, 12, -1, 'emerald_block']] })
    const { bot, world } = testBot
    // the first section of the second layer, after the six of the first
    await shown(testBot, world, -2, 0, [[-17, 12, 8, 'emerald_block']])
    const [diamond, gold, emerald] = [id(bot, 'diamond_block'), id(bot, 'gold_block'), id(bot, 'emerald_block')]
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, point: new Vec3(15, 12, 8) }), at([0, 12, 8]))
    assert.deepStrictEqual(bot.findBlocks({ matching: diamond, point: new Vec3(15, 12, 8), count: 2 }), at([16, 12, 8], [0, 12, 8]))
    // section (−1, 0, 0) is the first layer's first, (1, 0, 0) its last
    assert.deepStrictEqual(bot.findBlocks({ matching: gold, point: new Vec3(0, 12, 8), maxDistance: 20 }), at([16, 12, 7]))
    assert.deepStrictEqual(bot.findBlocks({ matching: emerald, point: new Vec3(0, 12, 8), maxDistance: 32 }), at([-17, 12, 8]))
    // the octahedron reaches maxDistance + 8 blocks out, in sections
    assert.deepStrictEqual(bot.findBlocks({ matching: emerald, point: new Vec3(0, 12, 8), maxDistance: 10 }), at([-1, 12, -1]))
    // each section once, though the octahedron gives some again
    assert.deepStrictEqual(bot.findBlocks({ matching: emerald, point: new Vec3(0, 12, 8), maxDistance: 32, count: 4 }), at([-1, 12, -1], [-17, 12, 8], [31, 12, 8]))
    bot.end()
  })

  it('skips the sections blockAt does not show, and those of air but with useExtraInfo true', async () => {
    const testBot = await joined(latest, { blocks })
    const { bot, internal, server, driver, world } = testBot
    world.column(2, 0, [...stoneFloor(2, 0), [33, 12, 0, 'emerald_block']])
    await world.sendColumn(2, 0)
    await driver.ticks(2)
    // a block change in a section not answered yet, which the answer replaces
    server.send('update_block', { position: { x: 34, y: 12, z: 0 }, block_runtime_id: world.stateId('emerald_block'), layer: 0 })
    await driver.frame(0)
    const emerald = id(bot, 'emerald_block')
    assert.deepStrictEqual([internal._world.columnPresent(33, 0), bot.findBlocks({ matching: emerald, maxDistance: 40 })], [true, []])
    await world.answer()
    await driver.tick()
    assert.deepStrictEqual(bot.findBlocks({ matching: emerald, maxDistance: 40 }), at([33, 12, 0]))
    // Java's: a section of air is none, but read with useExtraInfo true
    const air = id(bot, 'air')
    assert.deepStrictEqual(bot.findBlocks({ matching: air, point: new Vec3(0, 100, 0) }), [])
    assert.deepStrictEqual(bot.findBlocks({ matching: air, point: new Vec3(0, 100, 0), useExtraInfo: true }), at([0, 100, 0]))
    assert.deepStrictEqual(bot.findBlocks({ matching: air, point: new Vec3(0, 12, 0) }), at([0, 12, 0]))
    bot.end()
  })

  it('reads the blocks with their block entities; useExtraInfo true skips the section palettes, a function takes the blocks matched', async () => {
    const testBot = await joined(latest, { blocks: [...blocks, [2, 12, 2, 'chest'], [-2, 12, 3, 'chest']] })
    const { bot, server, driver } = testBot
    server.send('block_entity_data', { position: { x: -2, y: 12, z: 3 }, nbt: { type: 'compound', name: '', value: { id: string('Chest'), CustomName: string('Loot'), x: int(-2), y: int(12), z: int(3) } } })
    await driver.frame(0)
    const chest = id(bot, 'chest')
    const named = (block: Block): boolean => block.entity?.value['CustomName'] !== undefined
    assert.deepStrictEqual(bot.findBlocks({ matching: chest, count: 10 }), at([2, 12, 2], [-2, 12, 3]))
    assert.deepStrictEqual(bot.findBlocks({ matching: chest, count: 10, useExtraInfo: named }), at([-2, 12, 3]))
    assert.deepStrictEqual(bot.findBlocks({ matching: id(bot, 'diamond_block'), count: 10, useExtraInfo: () => true }), at([3, 12, 0], [0, 12, -5], [-6, 14, 2]))
    assert.deepStrictEqual(bot.findBlocks({ matching: named, count: 10, useExtraInfo: true }), at([-2, 12, 3]))
    // a palette's blocks have no position
    const placed = (block: Block): boolean => block.position?.y === 12 && block.name === 'diamond_block'
    assert.deepStrictEqual([bot.findBlocks({ matching: placed }), bot.findBlocks({ matching: placed, useExtraInfo: true })], [[], at([3, 12, 0])])
    bot.end()
  })
})

for (const [title, versions, lowest, highest] of [
  ['the overworld 0 to 255 (1.16.201 – 1.17.40)', bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.17.40'), 0, 255],
  ['the overworld −64 to 319 (1.18.0+)', bedrockTestVersionsFrom('bedrock_1.18.0'), -64, 319]
] as const) {
  describe(`bedrock findBlocks in ${title}`, () => {
    for (const version of versions) {
      it(`${version}: searches the dimension's sections only`, async () => {
        const { bot } = await joined(version, { blocks: [[2, lowest + 4, 3, 'diamond_block']] })
        const [air, diamond] = [id(bot, 'air'), id(bot, 'diamond_block')]
        assert.deepStrictEqual(bot.findBlocks({ matching: air, point: new Vec3(0, lowest - 1, 0), useExtraInfo: true }), at([0, lowest, 0]))
        assert.deepStrictEqual(bot.findBlocks({ matching: air, point: new Vec3(0, highest + 1, 0), useExtraInfo: true }), at([0, highest, 0]))
        assert.deepStrictEqual(bot.findBlocks({ matching: diamond, point: new Vec3(0, lowest + 10, 0) }), at([2, lowest + 4, 3]))
        bot.end()
      })

      it(`${version}: in the nether, 0 to 127`, async () => {
        const { bot } = await joined(version, { blocks: [[2, 5, 3, 'netherrack']], dimension: 'nether' })
        assert.deepStrictEqual(bot.findBlocks({ matching: id(bot, 'air'), point: new Vec3(0, 128, 0), useExtraInfo: true }), at([0, 127, 0]))
        assert.deepStrictEqual(bot.findBlocks({ matching: id(bot, 'netherrack') }), at([2, 5, 3]))
        bot.end()
      })
    }
  })
}

describe('bedrock blockAtCursor, blockAtEntityCursor and blockInSight (the latest; no version differs)', () => {
  it("finds the block whose shapes the eye's look ray meets, with the face and the point, as Java's rayTrace test", async () => {
    const testBot = await joined(latest)
    const { bot } = testBot
    await turn(testBot, 0, Math.PI / 2)
    assert.deepStrictEqual([bot.blockAtCursor(), bot.blockInSight()], [null, undefined])
    await turn(testBot, 0, -Math.PI / 2)
    for (const block of [bot.blockAtCursor(), bot.blockInSight(), bot.blockAtCursor(1.63), bot.blockInSight(2, 0.82)]) {
      assert.deepStrictEqual([block?.name, block?.position, Reflect.get(block ?? {}, 'face'), rounded(Reflect.get(block ?? {}, 'intersect'))], ['stone', new Vec3(0, 11, 0), 1, [0.5, 12, 0.5]])
    }
    assert.deepStrictEqual([bot.blockAtCursor(1.61), bot.blockInSight(2, 0.8)], [null, undefined])
    bot.end()
  })

  it('casts from the eye, 1.62001 over the feet, at a yaw and a pitch of 0 too', async () => {
    const { bot } = await joined(latest, { blocks: [[0, 13, -2, 'smooth_stone_slab'], [0, 13, -4, 'stone'], [0, 14, -3, 'stone']] })
    assert.deepStrictEqual([bot.entity.yaw, bot.entity.pitch], [0, 0])
    const block = bot.blockAtCursor()
    const eye = bot.entity.position.y + bot.entity.eyeHeight!
    assert.strictEqual(bot.entity.eyeHeight, Math.fround(1.62001))
    assert.deepStrictEqual([block?.position, Reflect.get(block ?? {}, 'face'), Reflect.get(block ?? {}, 'intersect')], [new Vec3(0, 13, -4), 3, new Vec3(0.5, eye, -3)])
    bot.end()
  })

  it('stops at the first block a matcher takes, from the eye’s block, without a face', async () => {
    // the matcher passes the stone before the glass
    const { bot } = await joined(latest, { blocks: [[0, 13, -2, 'stone'], [0, 13, -3, 'glass']] })
    const block = bot.blockAtCursor(5, met => met.name === 'glass')
    assert.deepStrictEqual([block?.position, Reflect.get(block ?? {}, 'face')], [new Vec3(0, 13, -3), undefined])
    assert.deepStrictEqual(bot.blockAtCursor(5, () => true)?.position, new Vec3(0, 13, 0))
    assert.strictEqual(bot.blockAtCursor(2, met => met.name === 'glass'), null)
    bot.end()
  })

  it("meets the block the eye is in where the block is: prismarine-world's would be offset", async () => {
    const { bot } = await joined(latest, { blocks: [[0, 13, 0, 'smooth_stone_slab', { 'minecraft:vertical_half': 'top' }]] })
    const block = bot.blockAtCursor()
    assert.deepStrictEqual([block?.position, rounded(Reflect.get(block ?? {}, 'intersect'))], [new Vec3(0, 13, 0), [0.5, 13.62001, 1]])
    bot.end()
  })

  it("finds another entity's block from its eye, else the top of its box", async () => {
    const testBot = await joined(latest, { blocks: [[5, 13, -3, 'stone'], [5, 14, -2, 'smooth_stone_slab']] })
    const { bot, server, driver } = testBot
    // a villager looking north, its box 1.9 high
    write(server, 'add_entity', addEntity(latest, { unique: -2n, runtime: 2, type: 'minecraft:villager_v2', position: { x: 5.5, y: 12, z: 0.5 }, yaw: 180, metadata: boundingBox(latest, 0.6000000238418579, 1.899999976158142) }))
    await driver.frame(0)
    const villager = spawned(bot, 2)
    let block = bot.blockAtEntityCursor(villager)
    assert.deepStrictEqual([block?.position, Reflect.get(block ?? {}, 'intersect')], [new Vec3(5, 13, -3), new Vec3(5.5, 12 + villager.height, -2)])
    villager.eyeHeight = 2.2
    block = bot.blockAtEntityCursor(villager, 3)
    assert.deepStrictEqual([block?.position, Reflect.get(block ?? {}, 'intersect')], [new Vec3(5, 14, -2), new Vec3(5.5, 14.2, -1)])
    assert.strictEqual(bot.blockAtEntityCursor(villager, 1), null)
    assert.deepStrictEqual(bot.blockAtEntityCursor()?.position, bot.blockAtCursor()?.position)
    bot.end()
  })

  it('meets no block in a section blockAt does not show', async () => {
    const testBot = await joined(latest)
    const { bot, server, driver, world } = testBot
    world.column(0, -2)
    await world.sendColumn(0, -2)
    await driver.ticks(2)
    server.send('update_block', { position: { x: 0, y: 13, z: -20 }, block_runtime_id: world.stateId('stone'), layer: 0 })
    await driver.frame(0)
    const stone = new Vec3(0, 13, -20)
    assert.deepStrictEqual([bot.world.getBlock(stone).name, bot.blockAt(stone), bot.blockAtCursor(30)], ['stone', null, null])
    assert.strictEqual(bot.canSeeBlock(bot.world.getBlock(stone)), false)
    bot.end()
  })
})

describe('bedrock canSeeBlock (the latest; no version differs)', () => {
  it('sees a block the ray from the eye towards its centre meets before any other', async () => {
    const { bot } = await joined(latest, { blocks: [[3, 12, 0, 'stone'], [2, 12, 0, 'stone'], [0, 14, -4, 'stone'], [0, 13, -2, 'smooth_stone_slab'], [4, 14, 0, 'stone'], [2, 13, 0, 'smooth_stone_slab', { 'minecraft:vertical_half': 'top' }]] })
    const seen = (x: number, y: number, z: number): boolean => bot.canSeeBlock(bot.blockAt(new Vec3(x, y, z))!)
    // the ray passes over the bottom slab at (0, 13, −2), through the top one at (2, 13, 0); it reaches air too
    assert.deepStrictEqual([seen(1, 12, 0), seen(3, 12, 0), seen(0, 14, -4), seen(4, 14, 0), seen(0, 13, -3)], [true, false, true, false, true])
    bot.end()
  })
})
