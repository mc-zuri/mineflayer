/* eslint-env mocha */
// nativePhysics: the player, the boat it steers and the mob it rides move through the engines of the module given
// (minecraft-physics-native's NativePhysics, NativeBoatPhysics and NativeRiddenMobPhysics), on bot.world with its block
// events. A stand-in module here: mineflayer-physics-utils' engines, recording what the plugin made and the worlds it
// ticked the player on.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { BotcraftPhysics, BoatPhysics, RiddenMobPhysics } = require('@nxg-org/mineflayer-physics-util')
const { fakeServerBot } = require('./common/fakeServer')

function standInModule () {
  const made = []
  const worlds = []
  const recording = (name, Engine) => class extends Engine {
    constructor (registry) {
      super(registry)
      made.push(name)
    }

    simulate (ctx, world) {
      worlds.push(world)
      return super.simulate(ctx, world)
    }
  }
  const engines = { NativePhysics: BotcraftPhysics, NativeBoatPhysics: BoatPhysics, NativeRiddenMobPhysics: RiddenMobPhysics }
  const module = Object.fromEntries(Object.entries(engines).map(([name, Engine]) => [name, recording(name, Engine)]))
  return { module, made, worlds }
}

describe('nativePhysics (createBot option: minecraft-physics-native\'s engines)', function () {
  this.timeout(15 * 1000)
  const spawn = { x: 0.5, y: 65, z: 0.5 }
  const floor = []
  for (let x = -4; x <= 6; x++) for (let z = -4; z <= 6; z++) floor.push([x, 64, z, 'stone'])

  it('ticks the player through the module\'s NativePhysics, on bot.world with its block events', async () => {
    const native = standInModule()
    const t = await fakeServerBot('1.21.11', { spawn, blocks: floor, options: { nativePhysics: native.module } })
    try {
      assert.deepStrictEqual(native.made, ['NativePhysics', 'NativeBoatPhysics'])
      assert.ok(t.bot.physicsEngine instanceof native.module.NativePhysics)
      t.bot.setControlState('forward', true)
      t.ticks(5)
      assert.ok(t.bot.entity.position.z > spawn.z, `z ${t.bot.entity.position.z}`)
      const world = native.worlds.at(-1)
      const stone = new Vec3(0, 64, 0)
      assert.strictEqual(world.getBlockStateId(stone), t.bot.world.getBlockStateId(stone))
      assert.ok(world.getColumnAt(stone) != null)
      assert.ok(world.getColumnAt(new Vec3(40, 64, 0)) == null)
      const updated = []
      world.on('blockUpdate', (oldBlock, newBlock) => updated.push(newBlock.position))
      t.bot.world.setBlockStateId(new Vec3(1, 65, 0), t.bot.world.getBlockStateId(stone))
      assert.deepStrictEqual(updated, [new Vec3(1, 65, 0)])
    } finally {
      await t.close()
    }
  })

  it('leaves mineflayer-physics-utils\' engines and the plain world without it', async () => {
    const t = await fakeServerBot('1.21.11', { spawn, blocks: floor })
    try {
      assert.strictEqual(t.bot.physicsEngine.constructor, BotcraftPhysics)
      assert.deepStrictEqual(Object.keys(t.bot.physicsWorld), ['getBlock'])
    } finally {
      await t.close()
    }
  })
})
