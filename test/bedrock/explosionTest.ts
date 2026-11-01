import assert from 'assert'
import { Vec3 } from 'vec3'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, receive, spawned, write } from './common/entities.ts'
import { bedrockTestBot } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt } from './common/world.ts'

// Java's getExplosionDamages over the blocks blockAt shows. The player stands at (0.5, 12, 0.5) on the test world's
// stone floor (y 11); explosions of power 4 (a radius of 8) go off at its feet's height, south of it. No version
// differs: the latest's.

const latest: BedrockVersion = latestSupportedBedrockVersion
const POWER = 4
const feet = new Vec3(0.5, 12, 0.5)
/** the explosion `distance` blocks south of the feet */
const south = (distance: number): Vec3 => feet.offset(0, 0, distance)

/** a bot joined to the test world with `blocks`, every section of its columns answered */
async function joined (blocks: readonly BlockAt[] = []): Promise<TestBot> {
  const testBot = await bedrockTestBot(bedrockCodec(latest))
  const world = new ServerWorld(testBot.server, { blocks })
  await world.join(testBot)
  await testBot.driver.runUntil(() => testBot.internal._world.loadedAround(testBot.internal.entity.position, 1), 20)
  await world.answer()
  return testBot
}

/** an attribute of `current` with these modifiers, as 1.26.60 writes it */
function attribute (name: string, current: number, modifiers: ReadonlyArray<readonly [number, number]> = []): object {
  return {
    min: 0,
    max: 1024,
    current,
    default: current,
    default_min: 0,
    default_max: 1024,
    name,
    modifiers: modifiers.map(([operation, amount], index) => ({ id: `0000000${index}-0000-0000-0000-000000000000`, name: `modifier ${index}`, amount, operation, operand: 0, serializable: false }))
  }
}

describe('bedrock getExplosionDamages (the latest; no version differs)', () => {
  it("gives Java's raw damages: (impact² + impact) × 7 × power + 1, the impact by the distance and the box's exposure", async () => {
    const { bot } = await joined()
    const damages = (distance: number): number | null => bot.getExplosionDamages(bot.entity, south(distance), POWER, true)
    // fully exposed: impact 1 at the feet, 0.5 at 4 blocks, none from twice the power
    assert.deepStrictEqual([damages(0), damages(4), damages(7.9), damages(8), damages(9)], [57, 22, 1, 0, 0])
    bot.end()
  })

  it('counts the samples of the 0.6 × 1.8 box the rays reach without meeting a block', async () => {
    // a bottom slab 2 blocks south hides the 36 lowest of the 45 samples: an exposure of 0.2, an impact of 0.1
    const slab = await joined([[0, 12, 2, 'smooth_stone_slab']])
    assert.strictEqual(slab.bot.getExplosionDamages(slab.bot.entity, south(4), POWER, true), 4)
    slab.bot.end()
    // a wall 1 block south, at the rays' far end, hides them all: the 1 of no impact
    const stone = await joined([[0, 12, 1, 'stone'], [0, 13, 1, 'stone']])
    assert.strictEqual(stone.bot.getExplosionDamages(stone.bot.entity, south(4), POWER, true), 1)
    stone.bot.end()
    // power 16 from 1 block east of the slab's explosion: a wall at (1, 12 – 13, 2) hides all but the 5 samples of the
    // box's south-west edge, an exposure of 1 / 9, where the whole box would take 183
    const wall = await joined([[1, 12, 2, 'stone'], [1, 13, 2, 'stone']])
    assert.strictEqual(wall.bot.getExplosionDamages(wall.bot.entity, south(4).offset(1, 0, 0), 16, true), 12)
    wall.bot.end()
  })

  it('gives null without rawDamages: the attributes servers send hold no armor, as Java for an entity without one', async () => {
    const { bot, server, driver } = await joined()
    assert.strictEqual(bot.getExplosionDamages(bot.entity, south(4), POWER), null)
    // the player's attributes 1.26.60.5 sent at the join
    receive(server, '1d0111000000000000a0410000a041000000000000a0410000a041176d696e6563726166743a706c617965722e68756e67657200000000000000a0410000a040000000000000a0410000a0401b6d696e6563726166743a706c617965722e73617475726174696f6e00000000000000a04100000000000000000000a041000000001b6d696e6563726166743a706c617965722e65786861757374696f6e000000000000aec146000000000000000000aec14600000000166d696e6563726166743a706c617965722e6c6576656c00000000000000803f00000000000000000000803f000000001b6d696e6563726166743a706c617965722e657870657269656e636500000000000000a0410000a041000000000000a0410000a041106d696e6563726166743a6865616c746800000000000000004500008041000000000000004500008041166d696e6563726166743a666f6c6c6f775f72616e676500000000c00000803f00000000000000c00000803f000000001e6d696e6563726166743a6b6e6f636b6261636b5f726573697374616e63650000000000ffff7f7fcdcccc3d00000000ffff7f7fcdcccc3d126d696e6563726166743a6d6f76656d656e740000000000ffff7f7f0ad7a33c00000000ffff7f7f0ad7a33c1d6d696e6563726166743a756e64657277617465725f6d6f76656d656e740000000000ffff7f7f0ad7a33c00000000ffff7f7f0ad7a33c176d696e6563726166743a6c6176615f6d6f76656d656e74000000803f0000803f0000803f0000803f0000803f0000803f176d696e6563726166743a61747461636b5f64616d61676500000000000000804100000000000000000000804100000000146d696e6563726166743a6162736f727074696f6e00000080c40000804400000000000080c400008044000000000e6d696e6563726166743a6c75636b0000000000000080430000803f00000000000080430000803f1b6d696e6563726166743a6672696374696f6e5f6d6f64696669657200000000000000803f00000000000000000000803f00000000146d696e6563726166743a626f756e63696e6573730000000000000080430000803f00000000000080430000803f1b6d696e6563726166743a6169725f647261675f6d6f6469666965720000')
    await driver.frame(0)
    assert.deepStrictEqual([Object.keys(bot.entity.attributes ?? {}).length, bot.getExplosionDamages(bot.entity, south(4), POWER)], [17, null])
    assert.deepStrictEqual([bot.getExplosionDamages(bot.entity, south(4), POWER, true), bot.getExplosionDamages(bot.entity, south(9), POWER)], [22, 0])
    bot.end()
  })

  it("reduces them by a generic.armor attribute as Java's, its modifiers' operations 0, 1 and 2, and a player's by the difficulty", async () => {
    const { bot, server, driver } = await joined()
    // armor (2 + 1 + 1) × (1 + 0.5 + 0.25) × 1.5 × 1.25 = 13.125, the cap's operation 3 left out; a toughness of 8
    const armor = attribute('generic.armor', 2, [[2, 0.5], [0, 1], [3, 8], [1, 0.5], [0, 1], [1, 0.25], [2, 0.25]])
    write(server, 'update_attributes', { runtime_entity_id: 1n, attributes: [armor, attribute('generic.armorToughness', 8)] })
    write(server, 'set_difficulty', { difficulty: 3 })
    await driver.frame(0)
    const damages = (): Array<number | null> => [bot.getExplosionDamages(bot.entity, south(0), POWER), bot.getExplosionDamages(bot.entity, south(4), POWER)]
    // 57 less the armor's least, a fifth of it: 51.015; 22 less 13.125 − 22 / 4: 15.29; × 1.5 when hard
    assert.deepStrictEqual(damages(), [76, 22])
    const byDifficulty: Array<Array<number | null>> = []
    for (const difficulty of [2, 1, 0]) {
      write(server, 'set_difficulty', { difficulty })
      await driver.frame(0)
      byDifficulty.push(damages())
    }
    assert.deepStrictEqual(byDifficulty, [[51, 15], [25, 7], [0, 0]])
    bot.end()
  })

  it("does not reduce another entity's by the difficulty, and takes no toughness as none", async () => {
    const { bot, server, driver } = await joined()
    write(server, 'add_entity', addEntity(latest, { unique: -2n, runtime: 2, type: 'minecraft:villager_v2', position: { x: 5.5, y: 12, z: 0.5 }, metadata: boundingBox(latest, 0.6000000238418579, 1.899999976158142) }))
    write(server, 'update_attributes', { runtime_entity_id: 2n, attributes: [attribute('generic.armor', 16)] })
    write(server, 'set_difficulty', { difficulty: 3 })
    await driver.frame(0)
    const villager = spawned(bot, 2)
    const at = villager.position.offset(0, 0, 4)
    // 22 less 16 − 22 / 2 of 25
    assert.strictEqual(bot.getExplosionDamages(villager, at, POWER), 17)
    // the armor counts up to 20
    write(server, 'update_attributes', { runtime_entity_id: 2n, attributes: [attribute('generic.armor', 40)] })
    await driver.frame(0)
    assert.deepStrictEqual([bot.getExplosionDamages(villager, at, POWER), bot.getExplosionDamages(villager, at, POWER, true)], [4, 22])
    bot.end()
  })
})
