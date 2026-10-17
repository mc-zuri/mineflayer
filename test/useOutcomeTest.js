/* eslint-env mocha */
// What a right click comes to on the vanilla client (InteractionResult: the swing, and whether startUseItem goes on to
// the item and the off hand), and the crosshair it starts from (Minecraft.pick, Item.getPlayerPOVHitResult): unit tests
// on a bot made of the parts these read, and packet tests against a fake server.

const assert = require('assert')
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const mineflayer = require('../')
const { once, sleep } = require('../lib/promise_utils')
const { getPort } = require('./common/util')
const { createUsePrediction } = require('../lib/useResult')
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
const WEST = 4
const center = new Vec3(0.5, 0.5, 0.5)

describe('use outcome (InteractionResult as the client predicts it)', () => {
  describe('a block\'s own use (useItemOn / useWithoutItem)', () => {
    it('a cake is eaten by a hungry player, passes for a full one and takes no swing with an empty hand (1.15+)', () => {
      const bot = fakeBot('26.1', { food: 10 })
      const cake = bot.set(new Vec3(2, 101, 0), 'cake')
      const use = createUsePrediction(bot)
      assert.strictEqual(use.useItemOn(cake, UP, center).result, 'success')
      bot.food = 20
      assert.strictEqual(use.useItemOn(cake, UP, center).result, 'consume')
      bot.hold('stick')
      assert.strictEqual(use.useItemOn(cake, UP, center).result, 'pass')
      // (an invulnerable player always eats: Player.canEat)
      bot.entity.isInvulnerable = true
      assert.strictEqual(use.useItemOn(cake, UP, center).result, 'success')
    })

    it('an empty jukebox and an uncharged respawn anchor pass, a disc goes in', () => {
      const bot = fakeBot('26.1')
      const jukebox = bot.set(new Vec3(2, 101, 0), 'jukebox', { has_record: false })
      const anchor = bot.set(new Vec3(2, 101, 1), 'respawn_anchor', { charges: 0 })
      const use = createUsePrediction(bot)
      assert.strictEqual(use.useItemOn(jukebox, WEST, center).result, 'pass')
      assert.strictEqual(use.useItemOn(anchor, WEST, center).result, 'pass')
      bot.hold('music_disc_13')
      assert.strictEqual(use.useItemOn(jukebox, WEST, center).result, 'success')
    })

    it('a lectern without a book: a hand passes, another item is consumed, a book goes on it', () => {
      const bot = fakeBot('26.1')
      const lectern = bot.set(new Vec3(2, 101, 0), 'lectern', { facing: 'north', has_book: false })
      const use = createUsePrediction(bot)
      assert.strictEqual(use.useItemOn(lectern, UP, center).result, 'pass')
      bot.hold('stick')
      assert.strictEqual(use.useItemOn(lectern, UP, center).result, 'consume')
      bot.hold('writable_book')
      assert.strictEqual(use.useItemOn(lectern, UP, center).result, 'success')
    })

    it('a bed: a swing before 1.15, CONSUME to 1.21.1, the server\'s since', () => {
      for (const [version, name, expected] of [['1.12.2', 'bed', 'success'], ['1.20.4', 'white_bed', 'consume'], ['26.1', 'white_bed', 'success_server']]) {
        const bot = fakeBot(version)
        const bed = bot.set(new Vec3(2, 101, 0), name)
        assert.strictEqual(createUsePrediction(bot).useItemOn(bed, UP, center).result, expected, version)
      }
    })

    it('a pressed button is consumed without a swing from 1.15', () => {
      for (const [version, expected] of [['1.12.2', 'success'], ['1.16.5', 'consume']]) {
        const bot = fakeBot(version)
        const button = bot.set(new Vec3(2, 101, 0), 'stone_button', version === '1.12.2' ? { facing: 'up', powered: true } : { face: 'floor', facing: 'north', powered: true })
        assert.strictEqual(createUsePrediction(bot).useItemOn(button, UP, center).result, expected, version)
      }
    })

    it('a bell rings from a side it hangs toward, not from its top', () => {
      const bot = fakeBot('26.1')
      const bell = bot.set(new Vec3(2, 101, 0), 'bell', { attachment: 'floor', facing: 'east' })
      const use = createUsePrediction(bot)
      assert.strictEqual(use.useItemOn(bell, WEST, new Vec3(0.25, 0.6, 0.5)).result, 'success')
      assert.strictEqual(use.useItemOn(bell, UP, new Vec3(0.5, 0.8, 0.5)).result, 'pass')
    })

    it('a shelf: a held item swings to 26.2 (26.3 says CONSUME), an empty hand passes', () => {
      for (const [version, expected] of [['26.1', 'success'], ['26.3', 'consume']]) {
        const bot = fakeBot(version)
        const shelf = bot.set(new Vec3(2, 101, 0), 'oak_shelf', { facing: 'west' })
        const use = createUsePrediction(bot)
        assert.strictEqual(use.useItemOn(shelf, WEST, center).result, 'pass', version)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(shelf, WEST, center).result, expected, version)
      }
    })

    it('sneaking with something in hand passes over the block to the item', () => {
      const bot = fakeBot('26.1')
      const chest = bot.set(new Vec3(2, 101, 0), 'chest', { facing: 'west' })
      const use = createUsePrediction(bot)
      assert.strictEqual(use.useItemOn(chest, WEST, center).result, 'success')
      bot.hold('stick')
      bot.setControlState('sneak', true)
      assert.strictEqual(use.useItemOn(chest, WEST, center).result, 'pass')
      bot.hold(null)
      assert.strictEqual(use.useItemOn(chest, WEST, center).result, 'success')
    })
  })

  describe('the item on a block (Item.useOn) and in the air (Item.use)', () => {
    it('a block placed into the player fails (Level.isUnobstructed), next to it succeeds', () => {
      const bot = fakeBot('26.1')
      bot.hold('dirt', 8)
      const use = createUsePrediction(bot)
      // the stone under the player's feet, from its top: the block would go where the player stands
      const under = bot.blockAt(new Vec3(0, 100, 0))
      assert.strictEqual(use.useItemOn(under, UP, center).result, 'fail')
      const ahead = bot.blockAt(new Vec3(2, 100, 0))
      const outcome = use.useItemOn(ahead, UP, center)
      assert.strictEqual(outcome.result, 'success')
      assert.ok(outcome.place.position.equals(new Vec3(2, 101, 0)))
      // (into a block that is not replaceable)
      bot.set(new Vec3(2, 101, 0), 'cobblestone')
      assert.strictEqual(use.useItemOn(ahead, UP, center).result, 'fail')
    })

    it('a sign item places a sign (1.13 calls the item and the block sign)', () => {
      const bot = fakeBot('1.13.2')
      bot.hold('sign')
      assert.strictEqual(createUsePrediction(bot).useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'success')
    })

    it('tools only act where they change the block; shears on a pumpkin carve it', () => {
      const bot = fakeBot('26.1')
      const use = createUsePrediction(bot)
      const stone = bot.blockAt(new Vec3(2, 100, 0))
      bot.hold('iron_shovel')
      assert.strictEqual(use.useItemOn(stone, UP, center).result, 'pass')
      bot.set(new Vec3(2, 100, 0), 'grass_block')
      assert.strictEqual(use.useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'success')
      bot.hold('shears')
      assert.strictEqual(use.useItemOn(stone, UP, center).result, 'pass')
      const pumpkin = bot.set(new Vec3(3, 101, 0), 'pumpkin')
      assert.strictEqual(use.useItemOn(pumpkin, WEST, center).result, 'success')
    })

    it('a firework rocket on a block launches it; a bucket uses the ray of the item, not the block', () => {
      const bot = fakeBot('26.1')
      const use = createUsePrediction(bot)
      bot.hold('firework_rocket')
      assert.strictEqual(use.useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'success')
      bot.hold('water_bucket')
      assert.strictEqual(use.useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'pass')
    })

    it('buckets: water poured where the ray meets a block, a source picked up, nothing on stone', () => {
      const bot = fakeBot('26.1', { pitch: 40 })
      rayTrace(bot)
      const use = createUsePrediction(bot)
      bot.hold('water_bucket')
      assert.strictEqual(use.useItem(), 'success')
      bot.hold('bucket')
      assert.strictEqual(use.useItem(), 'fail')
      // the stone the ray meets turned to a water source
      bot.set(new Vec3(2, 100, 0), 'water', { level: 0 })
      bot.set(new Vec3(1, 100, 0), 'water', { level: 0 })
      assert.strictEqual(use.useItem(), 'success')
      // looking up: nothing within reach
      bot.entity.pitchDegrees = -90
      assert.strictEqual(use.useItem(), 'pass')
    })

    it('throws swing, food is consumed by a player who can eat, an item on cooldown passes', () => {
      const bot = fakeBot('26.1')
      const use = createUsePrediction(bot)
      bot.hold('snowball')
      assert.strictEqual(use.useItem(), 'success')
      bot.hold('bread')
      assert.strictEqual(use.useItem(), 'fail')
      bot.food = 10
      assert.strictEqual(use.useItem(), 'consume')
      bot.hold('ender_pearl')
      bot._itemCooldowns.ender_pearl = performance.now() + 1000
      assert.strictEqual(use.useItem(), 'pass')
    })
  })
})

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

  it('before 1.9 picks an entity by its box grown by 0.1 (Entity.getCollisionBorderSize)', () => {
    for (const [version, x] of [['1.8.8', 2.5 - 0.3 - 0.10000000149011612], ['1.9.4', 2.5 - 0.3]]) {
      const bot = fakeBot(version, { pitch: 0 })
      rayTrace(bot)
      bot.entities[2] = { id: 2, name: 'Zombie', type: 'mob', position: new Vec3(2.5, 101, 0.5), width: 0.6, height: 1.95, isValid: true }
      const hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.type, 'entity', version)
      assert.ok(Math.abs(hit.intersect.x - x) < 1e-6, `${version}: ${hit.intersect.x}`)
      assert.ok(Math.abs(bot._entityHitPoint(hit.entity).x - x) < 1e-6, version)
    }
  })
})

// What the bot writes for a use, against a fake server: the swing goes with what the use comes to
for (const version of ['1.8.8', '1.12.2', '1.15.2', '1.20.4', '26.1', '26.3']) {
  const registry = require('prismarine-registry')(version)
  const Chunk = require('prismarine-chunk')(version)
  const tall = registry.version['>=']('1.18')
  // 26.3 sends no swing for a use, and a punch for an attack's
  const swings = !registry.version['>=']('26.3')

  describe(`use packets ${version}v`, function () {
    this.timeout(10 * 1000)
    let bot
    let server
    let client
    let written

    beforeEach(async () => {
      const port = await getPort()
      server = mc.createServer({ 'online-mode': false, version, port })
      await once(server, 'listening')
      server.on('playerJoin', (joined) => {
        if (!registry.version['>=']('1.21.4')) return
        const write = joined.write.bind(joined)
        joined.write = (name, params) => {
          write(name, params)
          if (name === 'login' || name === 'respawn') write('game_state_change', { reason: 'level_chunks_load_start', gameMode: 0 })
        }
      })
      bot = mineflayer.createBot({ username: 'player', version, port, physicsManual: true })
      ;[client] = await once(server, 'playerJoin')
      const login = registry.supportFeature('usesLoginPacket') ? { ...registry.loginPacket, entityId: 0 } : { entityId: 0, levelType: 'default', gameMode: 0, previousGameMode: 255, worldNames: ['minecraft:overworld'], dimension: 0, worldName: 'minecraft:overworld', hashedSeed: [0, 0], difficulty: 0, maxPlayers: 20, reducedDebugInfo: false, enableRespawnScreen: true }
      client.write('login', login)
      const chunk = tall ? new Chunk({ minY: -64, worldHeight: 384 }) : new Chunk()
      const set = (x, y, z, name, properties = {}) => {
        const Block = require('prismarine-block')(registry)
        chunk.setBlockStateId(new Vec3(x, y, z), Block.fromProperties(name, properties).stateId)
      }
      for (let x = 0; x < 8; x++) set(x, 64, 0, 'stone')
      set(3, 65, 0, registry.blocksByName.chest ? 'chest' : 'stone', { facing: 'west' })
      set(5, 65, 0, 'jukebox', registry.version['>=']('1.13') ? { has_record: false } : {})
      const lights = chunk.dumpLight?.()
      client.write('map_chunk', {
        x: 0,
        z: 0,
        groundUp: true,
        biomes: chunk.dumpBiomes?.(),
        heightmaps: { type: 'compound', name: '', value: { MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) } } },
        bitMap: chunk.getMask(),
        chunkData: chunk.dump(),
        blockEntities: [],
        trustEdges: false,
        skyLightMask: lights?.skyLightMask,
        blockLightMask: lights?.blockLightMask,
        emptySkyLightMask: lights?.emptySkyLightMask,
        emptyBlockLightMask: lights?.emptyBlockLightMask,
        skyLight: lights?.skyLight,
        blockLight: lights?.blockLight
      })
      await once(bot, 'chunkColumnLoad')
      bot.game.gameMode = 'survival'
      bot.entity.position = new Vec3(0.5, 65, 0.5)
      written = []
      client.on('packet', (data, { name }) => written.push({ name, data }))
    })

    afterEach((done) => {
      bot.on('end', () => done())
      server.close()
    })

    // an item in the selected hotbar slot, as the server's set_slot would put it
    const hold = (name, count) => {
      const Item = require('prismarine-item')(registry)
      bot.inventory.updateSlot(bot.QUICK_BAR_START + bot.quickBarSlot, new Item(registry.itemsByName[name].id, count))
      assert.strictEqual(bot.heldItem?.name, name)
    }
    const names = () => written.map(p => p.name).filter(name => /^(arm_animation|punch|block_place|use_item|block_dig)$/.test(name))
    const settle = () => sleep(100)

    it('a chest\'s use swings and ends the use; an empty jukebox\'s passes without a swing', async () => {
      const chest = bot.blockAt(new Vec3(3, 65, 0))
      if (chest.name !== 'chest') return
      bot.lookAt = async () => {}
      assert.strictEqual(await bot.activateBlock(chest, new Vec3(-1, 0, 0), new Vec3(0, 0.5, 0.5)), 'success')
      await settle()
      assert.deepStrictEqual(names(), swings ? ['block_place', 'arm_animation'] : ['block_place'])
      written.length = 0
      const jukebox = bot.blockAt(new Vec3(5, 65, 0))
      assert.strictEqual(await bot.activateBlock(jukebox, new Vec3(-1, 0, 0), new Vec3(0, 0.5, 0.5)), 'pass')
      await settle()
      assert.deepStrictEqual(names(), ['block_place'])
    })

    it('a block placed into the player takes no swing', async () => {
      bot.lookAt = async () => {}
      hold('dirt', 8)
      const under = bot.blockAt(new Vec3(0, 64, 0))
      assert.strictEqual(await bot.activateBlock(under, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), 'fail')
      await settle()
      assert.deepStrictEqual(names(), ['block_place'])
    })

    it('a fishing rod\'s use swings (from the item before 1.15), the use of an item before 1.9 at -1, -1, -1', async () => {
      hold('fishing_rod', 1)
      bot.activateItem()
      await settle()
      const use = registry.version['<']('1.9') ? 'block_place' : 'use_item'
      assert.deepStrictEqual(names(), swings ? [use, 'arm_animation'] : [use])
      if (use === 'block_place') {
        const { data } = written.find(p => p.name === 'block_place')
        assert.deepStrictEqual([data.location.x, data.location.y, data.location.z], [-1, -1, -1])
        assert.deepStrictEqual([data.cursorX, data.cursorY, data.cursorZ], [0, 0, 0])
      }
    })

    it('the drop key swings the arm from 1.15 to 26.2', async () => {
      hold('stone', 4)
      bot.dropHeldItem(false)
      await settle()
      const swing = registry.version['>=']('1.15') && swings
      assert.strictEqual(names().includes('arm_animation'), swing)
    })

    it('a torch placed against a block stands in the world at once, on the wall it was put against', async () => {
      if (!registry.version['>=']('1.13')) return
      bot.lookAt = async () => {}
      hold('torch', 4)
      const stone = bot.blockAt(new Vec3(1, 64, 0))
      assert.strictEqual(await bot.activateBlock(stone, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), 'success')
      assert.strictEqual(bot.blockAt(new Vec3(1, 65, 0)).name, 'torch')
      // (against the side of the jukebox, which takes no torch: a wall torch facing away from it)
      assert.strictEqual(await bot.activateBlock(bot.blockAt(new Vec3(5, 65, 0)), new Vec3(-1, 0, 0), new Vec3(0, 0.5, 0.5)), 'success')
      const wall = bot.blockAt(new Vec3(4, 65, 0))
      assert.strictEqual(wall.name, 'wall_torch')
      assert.strictEqual(wall.getProperties().facing, 'west')
    })

    it('an invulnerable player eats on a full stomach from 1.15 (Player.canEat: Abilities.invulnerable)', async () => {
      hold('bread', 2)
      bot.food = 20
      bot.activateItem()
      assert.strictEqual(bot.usingHeldItem, false)
      bot.deactivateItem()
      bot.entity.isInvulnerable = true
      bot.activateItem()
      assert.strictEqual(bot.usingHeldItem, registry.version['>=']('1.15'))
    })

    it('an item on cooldown is not used: no release follows', async () => {
      if (!registry.itemsByName.goat_horn) return
      hold('goat_horn', 1)
      bot.activateItem()
      assert.strictEqual(bot.usingHeldItem, true)
      bot.deactivateItem()
      bot._itemCooldowns.goat_horn = performance.now() + 1000
      bot.activateItem()
      assert.strictEqual(bot.usingHeldItem, false)
    })
  })
}
