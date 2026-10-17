/* eslint-env mocha */
// What is under the crosshair as vanilla's client picks it (GameRenderer.pick: Entity.pick's block clip against the
// outline shapes, ProjectileUtil.getEntityHitResult over the pickable entities), on a bot made of the parts the ray
// trace reads.

const assert = require('assert')
const { Vec3 } = require('vec3')
const rayTrace = require('../lib/plugins/ray_trace')

// the player at (0.5, 101, 0.5) on stone, looking along +x (yaw 270) and down by `pitch`
function fakeBot (version, pitch) {
  const registry = require('prismarine-registry')(version)
  const Block = require('prismarine-block')(registry)
  const Chunk = require('prismarine-chunk')(registry)
  const World = require('prismarine-world')(registry)
  const world = new World(null).sync
  for (const [cx, cz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) world.setColumn(cx, cz, new Chunk({ minY: -64, worldHeight: 384 }))
  const bot = {
    registry,
    version,
    username: 'player',
    world,
    game: { gameMode: 'survival' },
    entity: { position: new Vec3(0.5, 101, 0.5), yaw: 0, pitch: 0, yawDegrees: 270, pitchDegrees: pitch, width: 0.6, height: 1.8, eyeHeight: 1.62 },
    entities: {},
    blockAt: (position) => world.getBlock(position),
    set: (position, name, properties = {}) => world.setBlockStateId(position, Block.fromProperties(name, properties).stateId)
  }
  bot.entities[1] = bot.entity
  for (let x = -2; x <= 6; x++) {
    for (let z = -3; z <= 3; z++) bot.set(new Vec3(x, 100, z), 'stone')
  }
  rayTrace(bot)
  return bot
}

describe('the crosshair (GameRenderer.pick)', () => {
  it('meets a fence by its outline, which stops at the top of the block (ClipContext.Block.OUTLINE)', () => {
    // level, at the eyes' height (102.62): over a fence post at y 101, through where its 1.5 high collision box is
    const bot = fakeBot('1.20.4', 0)
    bot.set(new Vec3(2, 101, 0), 'oak_fence')
    bot.entity.position = new Vec3(0.5, 100.5, 0.5)
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'miss')
    assert.strictEqual(bot.blockAtCursor(4.5), null)
  })

  it('picks the living and the pickable entities only (Entity.isPickable): not an arrow', () => {
    const bot = fakeBot('1.20.4', 25)
    bot.entities[2] = { id: 2, name: 'arrow', type: 'projectile', position: new Vec3(2.5, 101.5, 0.5), width: 0.5, height: 0.5, isValid: true }
    assert.strictEqual(bot.raycastHitResult(4.5, 3).type, 'block')
    assert.strictEqual(bot.entityAtCursor(3.5), null)
    bot.entities[3] = { id: 3, name: 'pig', type: 'animal', position: new Vec3(2.5, 101, 0.5), width: 0.9, height: 0.9, isValid: true }
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'entity')
    assert.strictEqual(hit.entity.name, 'pig')
  })

  it('an entity hit beyond the entity range is a miss where it was (LocalPlayer.filterHitResult)', () => {
    const bot = fakeBot('1.20.4', 0)
    bot.entities[3] = { id: 3, name: 'pig', type: 'animal', position: new Vec3(4.0, 102, 0.5), width: 0.9, height: 0.9, isValid: true }
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'miss')
    assert.ok(Math.abs(hit.intersect.x - 3.55) < 1e-6)
  })
})
