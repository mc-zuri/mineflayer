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
    it('a cake the client eats is marked eaten (its bite predicted), one it does not eat not', () => {
      const bot = fakeBot('26.1', { food: 10 })
      const cake = bot.set(new Vec3(2, 101, 0), 'cake')
      const use = createUsePrediction(bot)
      assert.deepStrictEqual(use.useItemOn(cake, UP, center), { result: 'success', eat: true })
      bot.food = 20
      assert.deepStrictEqual(use.useItemOn(cake, UP, center), { result: 'consume' })
    })

    it('a spectator\'s use of a block is a Success before 1.21.2, a CONSUME from 1.21.2 (MultiPlayerGameMode.performUseItemOn)', () => {
      for (const [version, expected] of [['1.8.8', 'success'], ['1.12.2', 'success'], ['1.20.4', 'success'], ['1.21.1', 'success'], ['1.21.3', 'consume'], ['26.3', 'consume']]) {
        const bot = fakeBot(version, { gameMode: 'spectator' })
        const chest = bot.set(new Vec3(2, 101, 0), 'chest', { facing: 'west' })
        bot.hold('stone')
        assert.deepStrictEqual(createUsePrediction(bot).useItemOn(chest, WEST, center), { result: expected }, version)
      }
    })

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

    it('an invulnerable player eats no cake nor food before 1.15, a hungry one does (Player.canEat)', () => {
      for (const version of ['1.12.2', '1.14.4']) {
        const bot = fakeBot(version, { food: 10 })
        bot.entity.isInvulnerable = true
        const cake = bot.set(new Vec3(2, 101, 0), 'cake')
        const use = createUsePrediction(bot)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(cake, UP, center).result, 'pass', version)
        bot.hold('beef')
        assert.strictEqual(use.useItem(), 'fail', version)
        // (a golden apple neither, even on a full stomach)
        bot.hold('golden_apple')
        assert.strictEqual(use.useItem(), 'fail', version)
        bot.entity.isInvulnerable = false
        assert.strictEqual(use.useItem(), 'consume', version)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(cake, UP, center).result, 'success', version)
      }
      // from 1.15 an invulnerable player eats a full stomach's food and a golden apple is always eaten
      const bot = fakeBot('1.16.5')
      bot.hold('golden_apple')
      assert.strictEqual(createUsePrediction(bot).useItem(), 'consume')
    })

    it('before 1.20.5 the block\'s own use is asked for the off hand too: a full player\'s cake with an empty off hand', () => {
      for (const [version, expected] of [['1.12.2', 'success'], ['1.20.4', 'consume'], ['1.20.6', 'pass']]) {
        const bot = fakeBot(version)
        const cake = bot.set(new Vec3(2, 101, 0), 'cake')
        const use = createUsePrediction(bot)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(cake, UP, center).result, 'pass', version)
        assert.strictEqual(use.useItemOn(cake, UP, center, true).result, expected, version)
        // (a lectern without a book: an empty off hand passes, one with an item is consumed, as the main hand)
        if (version === '1.12.2') continue
        const lectern = bot.set(new Vec3(2, 101, 1), 'lectern', { facing: 'north', has_book: false, powered: false })
        assert.strictEqual(use.useItemOn(lectern, UP, center, true).result, 'pass', version)
        bot.inventory.slots[45] = bot.item('stick')
        assert.strictEqual(use.useItemOn(lectern, UP, center, true).result, version === '1.20.6' ? 'pass' : 'consume', version)
      }
    })

    it('before 1.15 a block\'s use that acts swings (a boolean Block.activate): a campfire\'s food, a flower pot', () => {
      for (const [version, expected] of [['1.13.2', 'success'], ['1.14.4', 'success'], ['1.15.2', 'consume']]) {
        const bot = fakeBot(version)
        const use = createUsePrediction(bot)
        const pot = bot.set(new Vec3(2, 101, 0), 'flower_pot')
        assert.strictEqual(use.useItemOn(pot, WEST, center).result, expected, `${version} flower pot`)
        if (version === '1.13.2') continue
        const campfire = bot.set(new Vec3(2, 101, 1), 'campfire', { lit: true, facing: 'north', signal_fire: false, waterlogged: false })
        bot.hold('beef')
        assert.strictEqual(use.useItemOn(campfire, UP, center).result, expected, `${version} campfire`)
        // (a lectern without a book: nothing before 1.15)
        const lectern = bot.set(new Vec3(2, 101, 2), 'lectern', { facing: 'north', has_book: false, powered: false })
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(lectern, UP, center).result, version === '1.14.4' ? 'pass' : 'consume', `${version} lectern`)
      }
    })

    it('a smithing table opens its screen from 1.16, does nothing before', () => {
      for (const [version, expected] of [['1.14.4', 'pass'], ['1.15.2', 'pass'], ['1.16.5', 'success']]) {
        const bot = fakeBot(version)
        const table = bot.set(new Vec3(2, 101, 0), 'smithing_table')
        assert.strictEqual(createUsePrediction(bot).useItemOn(table, WEST, center).result, expected, version)
      }
    })

    it('a cauldron before 1.17: an empty hand swings before 1.15, a block item in its water is consumed from 1.15', () => {
      for (const [version, empty, cobblestone] of [['1.13.2', 'success', 'success'], ['1.15.2', 'pass', 'consume'], ['1.16.5', 'pass', 'consume']]) {
        const bot = fakeBot(version)
        const cauldron = bot.set(new Vec3(2, 101, 0), 'cauldron', { level: 2 })
        const use = createUsePrediction(bot)
        assert.strictEqual(use.useItemOn(cauldron, UP, center).result, empty, `${version} empty hand`)
        // (before 1.15 the cobblestone is placed on the cauldron)
        bot.hold('cobblestone')
        assert.strictEqual(use.useItemOn(cauldron, UP, center).result, cobblestone, `${version} cobblestone`)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(cauldron, UP, center).result, 'pass', `${version} stick`)
      }
    })

    it('before 1.11 a cake\'s use swings whether a slice is eaten or not', () => {
      for (const [version, expected] of [['1.8.8', 'success'], ['1.10.2', 'success'], ['1.11.2', 'pass']]) {
        const bot = fakeBot(version)
        bot.entity.isInvulnerable = true
        const cake = bot.set(new Vec3(2, 101, 0), 'cake')
        bot.hold('stick')
        assert.strictEqual(createUsePrediction(bot).useItemOn(cake, UP, center).result, expected, version)
      }
    })

    it('before 1.9 a cauldron answers any use (a swing), an iron door before 1.11; since they pass a stick', () => {
      for (const [version, expected, doorExpected] of [['1.8.8', 'success', 'success'], ['1.10.2', 'pass', 'success'], ['1.11.2', 'pass', 'pass']]) {
        const bot = fakeBot(version)
        const use = createUsePrediction(bot)
        const door = bot.set(new Vec3(2, 101, 0), 'iron_door', {})
        const cauldron = bot.set(new Vec3(2, 101, 1), 'cauldron', {})
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(door, WEST, center).result, doorExpected, `${version} iron door`)
        assert.strictEqual(use.useItemOn(cauldron, UP, center).result, expected, `${version} cauldron`)
      }
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

    it('a shelf: a held item swings to 26.2 (26.3 says CONSUME), an empty hand passes from 1.21.11 (swings before)', () => {
      for (const [version, expected, empty] of [['1.21.9', 'success', 'success'], ['26.1', 'success', 'pass'], ['26.3', 'consume', 'pass']]) {
        const bot = fakeBot(version)
        const shelf = bot.set(new Vec3(2, 101, 0), 'oak_shelf', { facing: 'west' })
        const use = createUsePrediction(bot)
        assert.strictEqual(use.useItemOn(shelf, WEST, center).result, empty, version)
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

    it('a decorated pot has no use before 1.20.3, and is used without a swing until 1.21.2 (DecoratedPotBlock)', () => {
      for (const [version, expected] of [['1.20.1', 'pass'], ['1.20.4', 'consume'], ['1.21.1', 'consume'], ['1.21.4', 'success']]) {
        const bot = fakeBot(version)
        const pot = bot.set(new Vec3(2, 101, 0), 'decorated_pot', { facing: 'north' })
        assert.strictEqual(createUsePrediction(bot).useItemOn(pot, UP, center).result, expected, version)
      }
    })

    it('a decorated pot: nothing before 1.20.3, CONSUME on the client to 1.21.1 whatever the hand holds, a swing since', () => {
      for (const [version, expected] of [['1.20.1', 'pass'], ['1.20.4', 'consume'], ['1.21.1', 'consume'], ['1.21.4', 'success']]) {
        const bot = fakeBot(version)
        const pot = bot.set(new Vec3(2, 101, 0), 'decorated_pot', { facing: 'north', cracked: false, waterlogged: false })
        const use = createUsePrediction(bot)
        assert.strictEqual(use.useItemOn(pot, WEST, center).result, expected, `${version} empty hand`)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(pot, WEST, center).result, expected, `${version} stick`)
      }
    })

    it('before 1.20.5 a book goes on a lectern, before 1.21 a disc in a jukebox, from the item, a sneaking player too', () => {
      // (WritableBookItem / WrittenBookItem.useOn: LecternBlock.tryPlaceBook; RecordItem.useOn)
      for (const [version, book, disc] of [['1.20.4', 'success', 'success'], ['1.20.6', 'pass', 'success'], ['1.21.1', 'pass', 'pass']]) {
        const bot = fakeBot(version)
        const lectern = bot.set(new Vec3(2, 101, 0), 'lectern', { facing: 'north', has_book: false })
        const jukebox = bot.set(new Vec3(2, 101, 1), 'jukebox', { has_record: false })
        const use = createUsePrediction(bot)
        bot.setControlState('sneak', true)
        bot.hold('writable_book')
        assert.strictEqual(use.useItemOn(lectern, UP, center).result, book, version)
        bot.hold('music_disc_13')
        assert.strictEqual(use.useItemOn(jukebox, WEST, center).result, disc, version)
      }
    })

    it('a sneaking player\'s disc goes in a jukebox before 1.21, its book on a lectern from 1.14 to 1.20.4 (the item\'s useOn)', () => {
      for (const [version, disc, discIn, bookOn] of [['1.12.2', 'record_13', 'success', null], ['1.16.5', 'music_disc_13', 'success', 'success'],
        ['1.20.6', 'music_disc_13', 'success', 'pass'], ['1.21.1', 'music_disc_13', 'pass', 'pass']]) {
        const bot = fakeBot(version)
        const jukebox = bot.set(new Vec3(2, 101, 0), 'jukebox', { has_record: false })
        const use = createUsePrediction(bot)
        bot.setControlState('sneak', true)
        bot.hold(disc)
        assert.strictEqual(use.useItemOn(jukebox, WEST, center).result, discIn, `${version} disc`)
        // (one with a disc already: the disc passes on)
        const full = bot.set(new Vec3(2, 101, 1), 'jukebox', { has_record: true })
        assert.strictEqual(use.useItemOn(full, WEST, center).result, 'pass', `${version} full jukebox`)
        if (!bookOn) continue
        const lectern = bot.set(new Vec3(2, 101, 0), 'lectern', { facing: 'north', has_book: false, powered: false })
        bot.hold('writable_book')
        assert.strictEqual(use.useItemOn(lectern, UP, center).result, bookOn, `${version} book`)
        bot.hold('stick')
        assert.strictEqual(use.useItemOn(lectern, UP, center).result, 'pass', `${version} stick`)
      }
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

    it('before 1.13 a block item that cannot go where it would is not used on the block (no packet), an item is', () => {
      for (const version of ['1.8.8', '1.12.2', '1.13.2']) {
        const bot = fakeBot(version)
        const use = createUsePrediction(bot)
        const ahead = bot.blockAt(new Vec3(2, 100, 0))
        bot.set(new Vec3(2, 101, 0), 'cobblestone')
        bot.hold('cobblestone', 8)
        const refused = use.useItemOn(ahead, UP, center)
        assert.strictEqual(refused.result, 'fail', version)
        assert.strictEqual(!!refused.unsent, version !== '1.13.2', version)
        // (the stick is no block item: its use on the block is sent and passes)
        bot.hold('stick')
        assert.deepStrictEqual(use.useItemOn(ahead, UP, center), { result: 'pass', place: null }, version)
      }
    })

    it('shears carve a pumpkin from 1.13, pass on one before', () => {
      for (const [version, expected] of [['1.12.2', 'pass'], ['1.13.2', 'success']]) {
        const bot = fakeBot(version)
        const pumpkin = bot.set(new Vec3(2, 101, 0), 'pumpkin', version === '1.12.2' ? {} : undefined)
        bot.hold('shears')
        assert.strictEqual(createUsePrediction(bot).useItemOn(pumpkin, WEST, center).result, expected, version)
      }
    })

    it('a flower goes on dirt only and in a flower pot, by its names before 1.13 too (red_flower)', () => {
      for (const [version, flower] of [['1.12.2', 'red_flower'], ['1.13.2', 'poppy']]) {
        const bot = fakeBot(version)
        const use = createUsePrediction(bot)
        bot.hold(flower)
        assert.strictEqual(use.useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'fail', `${version} on stone`)
        const dirt = bot.set(new Vec3(2, 100, 0), 'dirt')
        assert.strictEqual(use.useItemOn(dirt, UP, center).result, 'success', `${version} on dirt`)
        // (and goes in a flower pot)
        const pot = bot.set(new Vec3(2, 101, 1), 'flower_pot', version === '1.12.2' ? {} : undefined)
        assert.strictEqual(use.useItemOn(pot, WEST, center).result, 'success', `${version} in a pot`)
        // (which takes it from the hand on the client too)
        assert.strictEqual(use.useItemOn(pot, WEST, center).takes, true, `${version} taken`)
      }
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

    it('1.8\'s firework on a block passes on the client (ItemFirework.onItemUse: the server launches it)', () => {
      const bot = fakeBot('1.8.8')
      bot.hold('fireworks')
      assert.strictEqual(createUsePrediction(bot).useItemOn(bot.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'pass')
      const later = fakeBot('1.9.4')
      later.hold('fireworks')
      assert.strictEqual(createUsePrediction(later).useItemOn(later.blockAt(new Vec3(2, 100, 0)), UP, center).result, 'success')
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

    it('a drink is a Success on 1.15 (it swings), a CONSUME from 1.16 (DrinkHelper.startDrinking)', () => {
      for (const [version, result] of [['1.15.2', 'success'], ['1.16.5', 'consume'], ['1.20.4', 'consume']]) {
        const bot = fakeBot(version)
        const use = createUsePrediction(bot)
        bot.hold('milk_bucket')
        assert.strictEqual(use.useItem(), result, version)
        bot.hold('potion')
        assert.strictEqual(use.useItem(), result, version)
        // (food is a CONSUME on both)
        bot.food = 10
        bot.hold('bread')
        assert.strictEqual(use.useItem(), 'consume', version)
      }
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

describe('the pick key\'s item before 1.21.4 (Block.getCloneItemStack, Entity.getPickResult)', () => {
  const { createPickResult } = require('../lib/pickResult')
  const at = new Vec3(2, 101, 0)
  const picked = item => item && [item.name, item.metadata]

  it('a block\'s item, or another\'s: a crop\'s seeds, a wall sign\'s sign, a potted plant, a sticky piston\'s head; none for a fluid', () => {
    const bot = fakeBot('1.20.4')
    const pick = createPickResult(bot)
    const cases = [
      ['stone', {}, ['stone', 0]],
      ['wheat', { age: 3 }, ['wheat_seeds', 0]],
      ['carrots', { age: 0 }, ['carrot', 0]],
      ['redstone_wire', { power: 0, north: 'none', south: 'none', east: 'none', west: 'none' }, ['redstone', 0]],
      ['oak_wall_sign', { facing: 'north', waterlogged: false }, ['oak_sign', 0]],
      ['wall_torch', { facing: 'north' }, ['torch', 0]],
      ['potted_poppy', {}, ['poppy', 0]],
      ['piston_head', { facing: 'up', short: false, type: 'sticky' }, ['sticky_piston', 0]],
      ['water_cauldron', { level: 1 }, ['cauldron', 0]],
      ['candle_cake', { lit: false }, ['cake', 0]],
      ['water', { level: 0 }, null],
      ['air', {}, null]
    ]
    for (const [name, properties, expected] of cases) assert.deepStrictEqual(picked(pick.blockItem(bot.set(at, name, properties))), expected, name)
  })

  it('before 1.13 the block\'s item with its kind (damageDropped): a log\'s wood, a slab\'s stone; cocoa\'s brown dye', () => {
    for (const version of ['1.8.8', '1.12.2']) {
      const bot = fakeBot(version)
      const pick = createPickResult(bot)
      const registry = bot.registry
      const set = (name, metadata) => {
        bot.world.setBlockStateId(at, (registry.blocksByName[name].id << 4) | metadata)
        return bot.blockAt(at)
      }
      assert.deepStrictEqual(picked(pick.blockItem(set('log', 4 | 1))), ['log', 1], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('stone', 3))), ['stone', 3], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('stone_slab', 8 | 1))), ['stone_slab', 1], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('double_stone_slab', 3))), ['stone_slab', 3], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('cocoa', 5))), ['dye', 3], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('standing_sign', 4))), ['sign', 0], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('furnace', 2))), ['furnace', 0], version)
      assert.deepStrictEqual(picked(pick.blockItem(set('piston_head', 8 | 1))), ['sticky_piston', 0], version)
      assert.strictEqual(pick.blockItem(set('flowing_water', 0)), null, version)
    }
  })

  it('an entity\'s item: a boat of its wood, a minecart of its kind, a mob\'s spawn egg, none for an item', () => {
    const bot = fakeBot('1.20.4')
    const pick = createPickResult(bot)
    const keys = name => bot.registry.entitiesByName[name].metadataKeys
    const boat = { name: 'boat', type: 'other', metadata: { [keys('boat').indexOf('type')]: 6 } }
    assert.deepStrictEqual(picked(pick.entityItem(boat)), ['dark_oak_boat', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'chest_boat', metadata: { [keys('chest_boat').indexOf('type')]: 8 } })), ['bamboo_chest_raft', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'hopper_minecart' })), ['hopper_minecart', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'spawner_minecart' })), ['minecart', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'cow', type: 'animal' })), ['cow_spawn_egg', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'item_frame', metadata: {} })), ['item_frame', 0])
    assert.deepStrictEqual(picked(pick.entityItem({ name: 'leash_knot' })), ['lead', 0])
    assert.strictEqual(pick.entityItem({ name: 'item', type: 'other' }), null)
    assert.strictEqual(pick.entityItem({ name: 'player', type: 'player' }), null)
    // (1.8: the spawn egg of the entity's id; no egg for a golem)
    const old = createPickResult(fakeBot('1.8.8'))
    assert.deepStrictEqual(picked(old.entityItem({ name: 'Pig', type: 'mob' })), ['spawn_egg', 90])
    assert.strictEqual(old.entityItem({ name: 'VillagerGolem', type: 'mob' }), null)
    assert.deepStrictEqual(picked(old.entityItem({ name: 'MinecartRideable', type: 'object' })), ['minecart', 0])
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

  it('before 1.13 meets a block by its one selection box: a cauldron\'s whole block, a brewing stand\'s base, a lever\'s own', () => {
    for (const version of ['1.12.2', '1.13.2']) {
      const legacy = version === '1.12.2'
      // a cauldron, its top crossed above its west wall
      let bot = fakeBot(version, { pitch: 18 })
      rayTrace(bot)
      bot.set(new Vec3(2, 101, 0), 'cauldron', legacy ? {} : { level: 0 })
      let hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block.name, 'cauldron', version)
      assert.strictEqual(hit.intersect.y === 102, legacy, `${version} cauldron ${hit.intersect.y}`)
      // a brewing stand: the ray passes over its base, and meets its rod from 1.13
      bot = fakeBot(version, { pitch: 30 })
      rayTrace(bot)
      bot.set(new Vec3(2, 101, 0), 'brewing_stand', {})
      hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block?.name === 'brewing_stand', !legacy, version)
      // a lever on the floor: 4/16 from its side before 1.13, 5/16 since
      bot = fakeBot(version, { pitch: 35 })
      rayTrace(bot)
      bot.set(new Vec3(2, 101, 0), 'lever', { face: 'floor', facing: 'north', powered: false })
      hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block.name, 'lever', version)
      assert.strictEqual(hit.intersect.x - 2, legacy ? 0.25 : 0.3125, version)
    }
  })

  // minecraft-data's one shape per block (1.8 - 1.11; 1.12 has the shapes of each state) is a closed door on its west
  // side, a closed bottom trapdoor, a gate across z: rays that only the boxes of the state meet (or miss). 1.12.2: the same
  // answers from either.
  it('before 1.13 misses a door turned away and meets an open trapdoor and a gate across x where their states put them', () => {
    const at = (bot, position, name, metadata) => bot.world.setBlockStateId(position, (bot.registry.blocksByName[name].id << 4) | metadata)
    for (const version of ['1.8.8', '1.11.2', '1.12.2']) {
      // a closed door facing north (lower half 3, upper half 8): its box is on the block's north side, out of a ray along x
      // through the block's middle, which the single shape (the west side) stops
      let bot = fakeBot(version, { pitch: 30 })
      rayTrace(bot)
      at(bot, new Vec3(2, 101, 0), 'wooden_door', 3)
      at(bot, new Vec3(2, 102, 0), 'wooden_door', 8)
      let hit = bot.raycastHitResult(4.5, 3)
      assert.notStrictEqual(hit.block?.name, 'wooden_door', `${version} door`)
      // an open bottom trapdoor facing east (4 | 3) stands up on the block's west side: met on its west face at x=2,
      // above the closed slab the single shape is
      bot = fakeBot(version, { pitch: 30 })
      rayTrace(bot)
      at(bot, new Vec3(2, 101, 0), 'trapdoor', 4 | 3)
      hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block?.name, 'trapdoor', `${version} trapdoor`)
      assert.strictEqual(hit.face, WEST, `${version} trapdoor`)
      assert.strictEqual(hit.intersect.x, 2, `${version} trapdoor`)
      // a gate facing east (3) runs across x: met 6/16 in, not at the block's west side
      bot = fakeBot(version, { pitch: 30 })
      rayTrace(bot)
      at(bot, new Vec3(2, 101, 0), 'fence_gate', 3)
      hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block?.name, 'fence_gate', `${version} gate`)
      assert.strictEqual(hit.intersect.x, 2.375, `${version} gate`)
    }
    // 1.8's redstone wire: the whole flat block, met on its top where the dot is not
    const bot = fakeBot('1.8.8', { pitch: 45 })
    rayTrace(bot)
    at(bot, new Vec3(2, 101, 0), 'redstone_wire', 0)
    bot.entity.pitchDegrees = Math.atan2(1.62 - 0.0625, 1.6) * 180 / Math.PI
    const wire = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(wire.block?.name, 'redstone_wire', '1.8.8 wire')
    assert.ok(wire.intersect.x - 2 < 3 / 16, `1.8.8 wire ${wire.intersect.x}`)
  })

  it('before 1.13 meets a door, a trapdoor and a gate by the boxes of their state (one shape per block in the data)', () => {
    const bot = fakeBot('1.12.2', { pitch: 18 })
    rayTrace(bot)
    const at = (position, name, metadata) => bot.world.setBlockStateId(position, (bot.registry.blocksByName[name].id << 4) | metadata)
    // an open trapdoor on the floor, facing east (metadata 4 | 3): the ray passes over its east side
    at(new Vec3(2, 101, 0), 'trapdoor', 4 | 3)
    assert.strictEqual(String(bot.blockAt(new Vec3(2, 101, 0)).getProperties().open), 'true')
    let hit = bot.raycastHitResult(4.5, 3)
    assert.ok(!(hit.block?.name === 'trapdoor' && hit.face === UP), JSON.stringify(hit.block?.position))
    // a closed one is met on its top
    at(new Vec3(2, 101, 0), 'trapdoor', 3)
    bot.entity.pitchDegrees = 40
    hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.block.name, 'trapdoor')
    assert.strictEqual(hit.face, UP)
    assert.strictEqual(hit.intersect.y, 101.1875)
    // a gate facing east: its middle, across x, from its west side 6/16 in
    at(new Vec3(2, 101, 0), 'fence_gate', 3)
    bot.entity.pitchDegrees = 30
    hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.block.name, 'fence_gate')
    assert.strictEqual(hit.intersect.x, 2.375)
  })

  it('before 1.13 meets a cake by its bites (two sixteenths off its west side a bite)', () => {
    for (const version of ['1.8.8', '1.12.2']) {
      const bot = fakeBot(version, { pitch: 35 })
      rayTrace(bot)
      bot.world.setBlockStateId(new Vec3(2, 101, 0), (bot.registry.blocksByName.cake.id << 4) | 2)
      const hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block.name, 'cake', version)
      assert.strictEqual(hit.face, WEST, version)
      assert.strictEqual(hit.intersect.x, 2 + 5 / 16, version)
    }
  })

  it('takes a hopper\'s top for a ray into its bowl (its interaction shape, from 1.13)', () => {
    for (const version of ['1.13.2', '26.1']) {
      const bot = fakeBot(version, { pitch: 18 })
      rayTrace(bot)
      bot.set(new Vec3(2, 101, 0), 'hopper', { facing: 'down', enabled: true })
      const hit = bot.raycastHitResult(4.5, 3)
      assert.strictEqual(hit.block.name, 'hopper', version)
      assert.ok(hit.intersect.y < 102, version)
      assert.strictEqual(hit.face, UP, version)
    }
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

  it('1.8\'s item frame is picked by its own box, its border 0 (EntityItemFrame.getCollisionBorderSize)', () => {
    const bot = fakeBot('1.8.8', { pitch: 0 })
    rayTrace(bot)
    // a frame facing west at eye height, its box 1/16 thick along x (as the entities plugin puts it)
    const frame = { id: 2, name: 'ItemFrame', type: 'object', position: new Vec3(2.96875, 102.62, 0.5), facing: [-1, 0, 0], width: 0.5, height: 0.5, isValid: true }
    bot.entities[2] = frame
    const hit = bot.raycastHitResult(4.5, 3)
    assert.strictEqual(hit.entity, frame)
    assert.ok(Math.abs(hit.intersect.x - 2.9375) < 1e-9, `${hit.intersect.x}`)
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
      set(7, 65, 0, 'cake')
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

    it('a spectator\'s use of a block is sent; before 1.21.2 it is a Success that swings, from 1.21.2 a CONSUME', async () => {
      bot.lookAt = async () => {}
      bot.game.gameMode = 'spectator'
      const stone = bot.blockAt(new Vec3(1, 64, 0))
      const success = !registry.version['>=']('1.21.2')
      assert.strictEqual(await bot.activateBlock(stone, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), success ? 'success' : 'consume')
      await settle()
      assert.deepStrictEqual(names(), success ? ['block_place', 'arm_animation'] : ['block_place'])
    })

    // the pick key's packets: [name, what they say]
    const Item = require('prismarine-item')(registry)
    const put = (slot, name, count = 1, metadata = 0) => bot.inventory.updateSlot(slot, name ? new Item(registry.itemsByName[name].id, count, metadata) : null)
    const picks = () => written.filter(p => /^(pick_item|custom_payload|set_creative_slot)/.test(p.name) && !(p.name === 'custom_payload' && p.data.channel !== 'MC|PickItem')).map(p => {
      if (p.name === 'custom_payload') return [p.name, p.data.channel, [...p.data.data]]
      if (p.name === 'set_creative_slot') {
        const item = Item.fromNotch(p.data.item)
        return [p.name, p.data.slot, item?.name, item?.count, item?.metadata, item?.nbt?.value?.EntityTag?.value?.id?.value]
      }
      return [p.name, p.data.slot ?? p.data.position?.x ?? p.data.entityId]
    })

    it('before 1.21.4 the pick key selects the block\'s item in the hotbar, and asks the server for one elsewhere from 1.9 (Minecraft.pickBlock)', async () => {
      if (registry.version['>=']('1.21.4')) return
      // (the slot the server selected as the player joined)
      client.write('held_item_slot', { slot: 0 })
      await settle()
      const stone = bot.blockAt(new Vec3(1, 64, 0))
      // (in the rest of the inventory: ServerboundPickItemPacket from 1.13, the MC|PickItem channel before, nothing in 1.8)
      put(20, 'stone', 8)
      bot.pickBlock(stone)
      await settle()
      const expected = registry.version['>=']('1.13') ? [['pick_item', 20]] : registry.version['>=']('1.9') ? [['custom_payload', 'MC|PickItem', [20]]] : []
      assert.deepStrictEqual(picks(), expected)
      assert.strictEqual(bot.quickBarSlot, 0)
      // (in the hotbar: selected on the client, nothing sent for the pick)
      written.length = 0
      put(39, 'stone', 8)
      bot.pickBlock(stone)
      await settle()
      assert.deepStrictEqual(picks(), [])
      assert.strictEqual(bot.quickBarSlot, 3)
      // (an item of another kind, and the block's own item for a crop: wheat seeds; nothing for air or an item not there)
      written.length = 0
      put(20, null)
      put(39, null)
      put(22, registry.version['>=']('1.13') ? 'granite' : 'stone', 1, registry.version['>=']('1.13') ? 0 : 1)
      bot.pickBlock(stone)
      bot.pickBlock(bot.blockAt(new Vec3(1, 66, 0)))
      await settle()
      assert.deepStrictEqual(picks(), [])
    })

    it('before 1.21.4 in creative the pick key puts the item in the hotbar and sets that slot, an entity\'s too (Inventory.setPickedItem)', async () => {
      if (registry.version['>=']('1.21.4')) return
      client.write('held_item_slot', { slot: 0 })
      await settle()
      bot.game.gameMode = 'creative'
      put(36, 'dirt', 8)
      bot.pickBlock(bot.blockAt(new Vec3(1, 64, 0)))
      await settle()
      assert.deepStrictEqual(picks(), [['set_creative_slot', 37, 'stone', 1, 0, undefined]])
      assert.strictEqual(bot.quickBarSlot, 1)
      assert.strictEqual(bot.heldItem?.name, 'stone')
      // (an entity: a mob's spawn egg, before 1.13 the one egg of the entity's id or with its EntityTag)
      written.length = 0
      const name = registry.entitiesByName.cow ? 'cow' : 'Cow'
      bot.pickEntity({ id: 42, name, type: registry.entitiesByName[name].type, position: new Vec3(2.5, 65, 0.5) })
      await settle()
      const egg = registry.version['>=']('1.13')
        ? ['cow_spawn_egg', 0, undefined]
        : registry.version['>=']('1.9') ? ['spawn_egg', 0, registry.version['>=']('1.11') ? 'minecraft:cow' : 'Cow'] : ['spawn_egg', registry.entitiesByName.Cow.id, undefined]
      assert.deepStrictEqual(picks(), [['set_creative_slot', 38, egg[0], 1, egg[1], egg[2]]])
      assert.strictEqual(bot.quickBarSlot, 2)
      // (the stone again: its hotbar slot selected and sent again)
      written.length = 0
      bot.pickBlock(bot.blockAt(new Vec3(1, 64, 0)))
      await settle()
      assert.deepStrictEqual(picks(), [['set_creative_slot', 37, 'stone', 1, 0, undefined]])
      assert.strictEqual(bot.quickBarSlot, 1)
    })

    it('the pick key asks the server for the block or the entity from 1.21.4 (ServerboundPickItemFromBlockPacket / FromEntity)', async () => {
      const stone = bot.blockAt(new Vec3(1, 64, 0))
      if (!registry.version['>=']('1.21.4')) {
        // (an entity's item in survival: nothing)
        bot.pickEntity({ id: 42, name: 'pig', type: 'animal' })
        await settle()
        assert.deepStrictEqual(picks(), [])
        return
      }
      bot.pickBlock(stone)
      bot.pickEntity({ id: 42 }, true)
      await settle()
      const sent = written.filter(p => /^pick_item/.test(p.name)).map(p => [p.name, p.data.position?.x ?? p.data.entityId, p.data.includeData])
      assert.deepStrictEqual(sent, [['pick_item_from_block', 1, false], ['pick_item_from_entity', 42, true]])
    })

    it('a block outside the world border is neither used nor dug: nothing is sent, the attack swings (WorldBorder)', async () => {
      bot.lookAt = async () => {}
      // a border of 10 around x -3.5: the chest at x 3 is outside it, the stone at x 1 inside
      if (registry.version['>=']('1.17')) {
        client.write('initialize_world_border', { x: -3.5, z: 0.5, oldDiameter: 10, newDiameter: 10, speed: 0, portalTeleportBoundary: 29999984, warningBlocks: 5, warningTime: 15 })
      } else {
        client.write('world_border', { action: 3, x: -3.5, z: 0.5, old_radius: 10, new_radius: 10, speed: 0, portalBoundary: 29999984, warning_time: 15, warning_blocks: 5 })
      }
      await settle()
      assert.deepStrictEqual([bot.worldBorder.minX, bot.worldBorder.maxX, bot.worldBorder.isWithinBounds(1, 0), bot.worldBorder.isWithinBounds(3, 0)], [-8.5, 1.5, true, false])
      const outside = bot.blockAt(new Vec3(3, 64, 0))
      assert.strictEqual(await bot.activateBlock(outside, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), 'fail')
      bot.dig(outside, 'ignore', 'auto', 1).catch(() => {})
      await settle()
      assert.deepStrictEqual(names(), registry.version['>=']('26.3') ? ['punch'] : ['arm_animation'])
      bot.stopDigging()
    })

    it('a slice of cake a hungry player eats is gone from the world at once (CakeBlock.eat on the client too)', async () => {
      bot.lookAt = async () => {}
      bot.food = 10
      const cake = bot.blockAt(new Vec3(7, 65, 0))
      assert.strictEqual(await bot.activateBlock(cake, new Vec3(0, 1, 0), new Vec3(0.5, 0.5, 0.5)), 'success')
      assert.strictEqual(Number(bot.blockAt(new Vec3(7, 65, 0)).getProperties().bites), 1)
      // (a full player eats nothing: the cake stays as it is)
      bot.food = 20
      await bot.activateBlock(bot.blockAt(new Vec3(7, 65, 0)), new Vec3(0, 1, 0), new Vec3(0.5, 0.5, 0.5))
      assert.strictEqual(Number(bot.blockAt(new Vec3(7, 65, 0)).getProperties().bites), 1)
    })

    it('a block placed into the player takes no swing (before 1.13 is not even sent: ItemBlock.canPlaceBlockOnSide)', async () => {
      bot.lookAt = async () => {}
      hold('dirt', 8)
      const under = bot.blockAt(new Vec3(0, 64, 0))
      assert.strictEqual(await bot.activateBlock(under, new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), 'fail')
      await settle()
      assert.deepStrictEqual(names(), registry.version['<']('1.13') ? [] : ['block_place'])
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

    it('a bucket of fish is not eaten (26.3 gives it food, but no consumable: BucketItem.use)', async () => {
      if (!registry.itemsByName.cod_bucket) return
      hold('cod_bucket', 1)
      // (a hungry player, who would eat a food)
      bot.food = 10
      bot.activateItem()
      await settle()
      assert.strictEqual(bot.usingHeldItem, false)
      assert.ok(!names().includes('block_dig'))
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

    it('from 1.19 a block placed is a prediction: acknowledged without it, what was there is back (BlockStatePredictionHandler)', async () => {
      if (!registry.version['>=']('1.19')) return
      bot.lookAt = async () => {}
      hold('torch', 4)
      assert.strictEqual(await bot.activateBlock(bot.blockAt(new Vec3(1, 64, 0)), new Vec3(0, 1, 0), new Vec3(0.5, 1, 0.5)), 'success')
      assert.strictEqual(bot.blockAt(new Vec3(1, 65, 0)).name, 'torch')
      await settle()
      const { sequence } = written.find(p => p.name === 'block_place').data
      client.write('acknowledge_player_digging', { sequenceId: sequence })
      await settle()
      assert.strictEqual(bot.blockAt(new Vec3(1, 65, 0)).type, 0)
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

    it('a dig goes on (and swings) in a tick the player itself does not tick', async () => {
      const block = bot.blockAt(new Vec3(1, 64, 0))
      const digging = bot.dig(block, 'ignore', 'auto', 1).catch(err => err)
      await settle()
      const before = names().filter(name => name === 'arm_animation' || name === 'punch').length
      bot.emit('clientTickWithoutPlayer')
      await settle()
      const after = names().filter(name => name === 'arm_animation' || name === 'punch').length
      assert.strictEqual(after, before + 1)
      bot.stopDigging()
      await digging
    })
  })
}

describe('a block\'s use that takes the held item (FlowerPotBlock.use: ItemStack.shrink on both sides)', function () {
  this.timeout(10 * 1000)
  it('1.8\'s use of a flower pot sends the hand as the pot left it: the last flower gone (PlayerControllerMP.onPlayerRightClick)', async () => {
    const { fakeServerBot } = require('./common/fakeServer')
    const t = await fakeServerBot('1.8.8', { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: [[0, 64, 0, 'stone'], [2, 65, 0, 'flower_pot']] })
    try {
      const Item = require('prismarine-item')(t.registry)
      t.bot.lookAt = async () => {}
      t.bot.inventory.updateSlot(36, new Item(t.registry.itemsByName.red_flower.id, 1))
      assert.strictEqual(await t.bot.activateBlock(t.bot.blockAt(new Vec3(2, 65, 0)), new Vec3(-1, 0, 0), new Vec3(0, 0.5, 0.5)), 'success')
      await sleep(100)
      const place = t.written.find(p => p.name === 'block_place')
      assert.strictEqual(place.data.heldItem.blockId, -1)
      assert.strictEqual(t.bot.heldItem, null)
    } finally {
      await t.close()
    }
  })
})
