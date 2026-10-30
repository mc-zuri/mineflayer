import assert from 'assert'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, write } from './common/entities.ts'
import { bedrockTestBot } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt, Point3 } from './common/world.ts'

// The entity the player looks at, as Java's entityAtCursor finds it: the player stands at (0.5, 12, 0.5) on the test
// world's stone floor, looking north (−z), its eye 1.62001 over its feet, as the vanilla client's. No version differs.

const version: BedrockVersion = latestSupportedBedrockVersion
/** the recorded villager's bounding box, Bedrock's metadata as it is the same for every version */
const VILLAGER_BOX = Object.freeze({ width: 0.6000000238418579, height: 1.899999976158142 })

async function joined (blocks: readonly BlockAt[] = []): Promise<TestBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  // Bedrock's yaw 180 is north, mineflayer's 0
  await new ServerWorld(testBot.server, { blocks }).join(testBot, { rotation: { yaw: 180, pitch: 0 } })
  return testBot
}

/** an entity of the type at the feet, its bounding box a villager's or the one given */
function show ({ server }: TestBot, runtime: number, type: string, position: Point3, { width, height }: { width: number, height: number } = VILLAGER_BOX): void {
  write(server, 'add_entity', addEntity(version, { unique: -BigInt(runtime), runtime, type, position, metadata: boundingBox(version, width, height) }))
}

/** the player turned by the bot's look, once an auth input carried it */
async function turn ({ bot, driver }: TestBot, yaw: number, pitch: number): Promise<void> {
  const looked = bot.look(yaw, pitch)
  await driver.ticks(3)
  await looked
}

describe('bedrock entityAtCursor (the latest; no version differs)', () => {
  it('finds the nearest entity the look ray from the eye meets within the distance, 3.5 by default', async () => {
    const testBot = await joined()
    const { bot, driver } = testBot
    assert.deepStrictEqual([bot.entity.yaw, bot.entity.pitch, bot.entityAtCursor()], [0, 0, null])
    show(testBot, 2, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -4 })
    show(testBot, 3, 'minecraft:villager_v2', { x: 1.5, y: 12, z: -1 })
    show(testBot, 4, 'minecraft:villager_v2', { x: 0.5, y: 12, z: 3 })
    await driver.frame(0)
    assert.deepStrictEqual([bot.entityAtCursor(), bot.entityAtCursor(4.2)?.id, bot.entityAtCursor(4.19)], [null, 2, null])
    show(testBot, 6, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -2 })
    show(testBot, 7, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -3 })
    await driver.frame(0)
    assert.deepStrictEqual([bot.entityAtCursor()?.id, bot.entityAtCursor(2.25)?.id, bot.entityAtCursor(2.15)], [6, 6, null])
    bot.end()
  })

  it('looks as the player does, up and down', async () => {
    const testBot = await joined()
    const { bot, driver } = testBot
    show(testBot, 2, 'minecraft:pig', { x: 0.5, y: 12, z: -1.5 }, { width: 0.8999999761581421, height: 0.8999999761581421 })
    show(testBot, 3, 'minecraft:villager_v2', { x: 3.5, y: 14, z: 0.5 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor(), null)
    await turn(testBot, 0, -Math.PI / 4)
    // its box 1.55 north of the eye, 1.55 below it
    assert.deepStrictEqual([bot.entityAtCursor()?.id, bot.entityAtCursor(2.2)?.id, bot.entityAtCursor(2.19)], [2, 2, null])
    await turn(testBot, -Math.PI / 2, Math.PI / 16)
    assert.strictEqual(bot.entityAtCursor()?.id, 3)
    bot.end()
  })

  it('casts the ray from the eye, 1.62001 over the feet', async () => {
    const testBot = await joined()
    const { bot, driver } = testBot
    show(testBot, 2, 'minecraft:pig', { x: 0.5, y: 13.63, z: -1 }, { width: 0.9, height: 0.9 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor(), null)
    show(testBot, 3, 'minecraft:pig', { x: 0.5, y: 12.73, z: -2 }, { width: 0.9, height: 0.9 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor()?.id, 3)
    bot.end()
  })

  it('stops at the block the ray meets, hiding a box no nearer than it', async () => {
    const testBot = await joined([[0, 13, -3, 'stone']])
    const { bot, driver } = testBot
    show(testBot, 2, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -3.5 })
    show(testBot, 3, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -1.5 })
    // its box's south face the block's, 2.5 from the eye
    show(testBot, 4, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -2.25 }, { width: 0.5, height: 1.899999976158142 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor(5)?.id, 3)
    write(testBot.server, 'remove_entity', { entity_id_self: -3n })
    await driver.tick()
    assert.deepStrictEqual([bot.entityAtCursor(5), bot.blockAt(bot.entity.position.offset(-0.5, 1, -3))?.name], [null, 'stone'])
    bot.end()
  })

  it('counts a box whose face is at the eye, not one around it', async () => {
    const testBot = await joined()
    const { bot, driver } = testBot
    // its south face 0.25 behind the eye
    show(testBot, 2, 'minecraft:villager_v2', { x: 0.5, y: 12, z: 0.25 }, { width: 1, height: 1.899999976158142 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor(), null)
    // its south face at the eye
    show(testBot, 3, 'minecraft:villager_v2', { x: 0.5, y: 12, z: 0 }, { width: 1, height: 1.899999976158142 })
    await driver.frame(0)
    assert.strictEqual(bot.entityAtCursor()?.id, 3)
    bot.end()
  })

  it("skips Java's objects, and never finds the player itself", async () => {
    const testBot = await joined()
    const { bot, driver } = testBot
    show(testBot, 2, 'minecraft:boat', { x: 0.5, y: 13.4, z: -1 }, { width: 1.399999976158142, height: 0.45500001311302185 })
    show(testBot, 3, 'minecraft:villager_v2', { x: 0.5, y: 12, z: -3 })
    await driver.frame(0)
    assert.deepStrictEqual([bot.entities[2]?.type, bot.entityAtCursor()?.id], ['object', 3])
    // a box under the eye, as a crouching player's
    bot.entity.height = 1.5
    await turn(testBot, 0, -Math.PI / 2)
    assert.strictEqual(bot.entityAtCursor(), null)
    bot.end()
  })
})
