/* eslint-env mocha */
// What a right click comes to on the vanilla client (InteractionResult: the swing, and whether startUseItem goes on to
// the item and the off hand), and the crosshair it starts from (Minecraft.pick, Item.getPlayerPOVHitResult): unit tests
// on a bot made of the parts these read, and packet tests against a fake server.

const assert = require('assert')
const { Vec3 } = require('vec3')
const rayTrace = require('../lib/plugins/ray_trace')

// A bot of the parts the prediction and the ray trace read: a world, the player standing at (0.5, 101, 0.5) on stone,
// looking along +x (yaw 270) and down by `pitch`
function fakeBot (version, { pitch = 30, gameMode = 'survival', food = 20 } = {}) {
  const registry = require('prismarine-registry')(version)
  const Block = require('prismarine-block')(registry)
  const Item = require('prismarine-item')(registry)
  const Chunk = require('prismarine-chunk')(registry)
  const World = require('prismarine-world')(registry)
  const tall = registry.version['>=']('1.18')
  const world = new World(null).sync
  for (const [cx, cz] of [[-1, -1], [0, -1], [-1, 0], [0, 0]]) world.setColumn(cx, cz, tall ? new Chunk({ minY: -64, worldHeight: 384 }) : new Chunk())
  const controls = {}
  const bot = {
    registry,
    version,
    username: 'player',
    world,
    game: { gameMode, minY: tall ? -64 : 0, height: tall ? 384 : 256 },
    food,
    entity: { position: new Vec3(0.5, 101, 0.5), yaw: 0, pitch: 0, yawDegrees: 270, pitchDegrees: pitch, width: 0.6, height: 1.8, eyeHeight: 1.62, onGround: true },
    entities: {},
    inventory: { slots: new Array(46).fill(null) },
    heldItem: null,
    usingHeldItem: false,
    _itemCooldowns: {},
    getControlState: (name) => !!controls[name],
    setControlState: (name, value) => { controls[name] = value },
    blockAt: (position) => world.getBlock(position),
    set: (position, name, properties = {}) => {
      let stateId
      try {
        stateId = Block.fromProperties(name, properties).stateId
      } catch (err) {
        // (before 1.13 a block without the states minecraft-data knows: its id and metadata 0)
        stateId = registry.blocksByName[name].id << 4
      }
      world.setBlockStateId(position, stateId)
      return world.getBlock(position)
    },
    item: (name, count = 1) => new Item(registry.itemsByName[name].id, count),
    hold: (name, count) => { bot.heldItem = name ? bot.item(name, count) : null }
  }
  bot.entities[1] = bot.entity
  for (let x = -2; x <= 6; x++) {
    for (let z = -3; z <= 3; z++) bot.set(new Vec3(x, 100, z), 'stone')
  }
  return bot
}

const UP = 1

describe('the crosshair (Minecraft.pick, Item.getPlayerPOVHitResult)', () => {
  it('meets a redstone wire, a torch and a lectern by their outline shapes', () => {
    const bot = fakeBot('26.1', { pitch: 40 })
    rayTrace(bot)
    bot.set(new Vec3(2, 101, 0), 'redstone_wire', { north: 'none', east: 'none', south: 'none', west: 'none', power: 0 })
    let hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'block')
    assert.strictEqual(hit.block.name, 'redstone_wire')
    assert.strictEqual(hit.face, UP)
    bot.set(new Vec3(2, 101, 0), 'torch')
    hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.block.name, 'torch')
    // straight down onto a lectern's top: its outline's top is the block's, its collision box's is at 14/16
    bot.set(new Vec3(2, 101, 0), 'air')
    bot.set(new Vec3(0, 99, 0), 'lectern', { facing: 'north' })
    bot.set(new Vec3(0, 100, 0), 'air')
    bot.entity.pitchDegrees = 90
    bot.entity.position = new Vec3(0.5, 100.5, 0.5)
    bot.entity.eyeHeight = 1.62
    hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.block.name, 'lectern')
    assert.strictEqual(hit.face, UP)
    assert.strictEqual(hit.intersect.y, 100)
  })

  it('an item\'s ray takes fluid sources as asked (ClipContext.Fluid)', () => {
    const bot = fakeBot('26.1', { pitch: 40 })
    rayTrace(bot)
    bot.set(new Vec3(1, 101, 0), 'water', { level: 0 })
    bot.set(new Vec3(2, 101, 0), 'water', { level: 0 })
    assert.strictEqual(bot._povHitResult('none').block.name, 'stone')
    const hit = bot._povHitResult('source_only')
    assert.strictEqual(hit.block.name, 'water')
    assert.strictEqual(hit.fluid, true)
    // (a flowing water block is no source)
    bot.set(new Vec3(1, 101, 0), 'water', { level: 3 })
    bot.set(new Vec3(2, 101, 0), 'water', { level: 3 })
    assert.strictEqual(bot._povHitResult('source_only').block.name, 'stone')
  })

  it('picks 26.3\'s cushion', () => {
    const bot = fakeBot('26.3', { pitch: 35 })
    rayTrace(bot)
    bot.entities[2] = { id: 2, name: 'cushion', type: 'other', position: new Vec3(2.5, 101, 0.5), width: 1, height: 0.25, isValid: true }
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.type, 'entity')
    assert.strictEqual(hit.entity.name, 'cushion')
  })
})
