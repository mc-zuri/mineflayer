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

  it('does not pick an item minecraft-data calls a mob (1.14.4): the block behind it is dug', () => {
    // a block just broken drops its item in front of the next one (m_dig on 1.14.4 - 1.15.2)
    const bot = fakeBot('1.14.4', 30)
    bot.set(new Vec3(3, 101, 0), 'stone')
    const data = bot.registry.entitiesByName.item
    assert.strictEqual(data.type, 'mob')
    bot.entities[2] = { id: 2, name: 'item', type: data.type, position: new Vec3(2.4, 101.4, 0.5), width: 0.25, height: 0.25, isValid: true }
    bot.entities[3] = { id: 3, name: 'arrow', type: 'mob', position: new Vec3(2.0, 101.6, 0.5), width: 0.5, height: 0.5, isValid: true }
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'block')
    assert.ok(hit.block.position.equals(new Vec3(3, 101, 0)))
    // (an item frame, which is not living either, is picked)
    bot.entities[4] = { id: 4, name: 'item_frame', type: 'mob', position: new Vec3(2.5, 101.4, 0.5), width: 0.5, height: 0.5, isValid: true }
    assert.strictEqual(bot.raycastHitResult(4.5, 3).entity?.name, 'item_frame')
  })

  it('before 1.13 a torch is met by its narrower box (BlockTorch: 0.4 - 0.6 on the floor)', () => {
    // the ray passes over the stone at (3, 100) just west of the torch on it at (3, 101): x 3.375 at y 101.01
    for (const [version, hitsTorch] of [['1.12.2', false], ['1.13.2', true]]) {
      const bot = fakeBot(version, 29.249000549316406)
      const torch = bot.registry.blocksByName.torch
      // (1.12: its metadata 5, on the floor)
      bot.world.setBlockStateId(new Vec3(3, 101, 0), version === '1.12.2' ? (torch.id << 4) | 5 : torch.defaultState)
      const hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block.name, hitsTorch ? 'torch' : 'stone', version)
      assert.strictEqual(hit.face, hitsTorch ? 4 : 1, version)
    }
  })

  for (const version of ['1.20.4', '1.21.11', '26.3']) {
    it(`meets a crop by its outline, which grows with its age (CropBlock, CarrotBlock): ${version}`, () => {
      // down by 30: the ray is at y 101.75 over the crop's west face at x 2, and meets the floor at x 3.3
      const bot = fakeBot(version, 30)
      bot.set(new Vec3(2, 101, 0), 'wheat', { age: 7 })
      let hit = bot.raycastHitResult(4.5, 3)
      assert.deepStrictEqual([hit.block.name, hit.face, hit.block.position.x], ['wheat', 4, 2])
      // a young one, 2 sixteenths high: the ray goes over it (101.17 at its east side) to the floor beyond
      bot.set(new Vec3(2, 101, 0), 'wheat', { age: 0 })
      hit = bot.raycastHitResult(4.5, 3)
      assert.deepStrictEqual([hit.block.name, hit.block.position.x], ['stone', 3])
      // carrots grown are 9 sixteenths high: under the ray at x 2 (101.75), which meets their top further on
      bot.set(new Vec3(2, 101, 0), 'carrots', { age: 7 })
      hit = bot.raycastHitResult(4.5, 3)
      assert.deepStrictEqual([hit.block.name, hit.face], ['carrots', 1])
    })
  }

  it('before 1.13 grass is the grass block: its top is met, not a plant\'s outline', () => {
    // the ray meets y 101 at x 3.9, over the grass block's east edge: a plant's outline (0.8125 high, to 0.875) it misses
    const bot = fakeBot('1.12.2', 25.5)
    bot.world.setBlockStateId(new Vec3(3, 100, 0), bot.registry.blocksByName.grass.id << 4)
    const hit = bot.raycastHitResult(4.5, 3)
    assert.deepStrictEqual([hit.block.name, hit.face, hit.block.position.x], ['grass', 1, 3])
  })

  it('an entity hit beyond the entity range is a miss where it was (LocalPlayer.filterHitResult)', () => {
    const bot = fakeBot('1.20.4', 0)
    bot.entities[3] = { id: 3, name: 'pig', type: 'animal', position: new Vec3(4.0, 102, 0.5), width: 0.9, height: 0.9, isValid: true }
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'miss')
    assert.ok(Math.abs(hit.intersect.x - 3.55) < 1e-6)
  })
})
