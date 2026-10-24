/* eslint-env mocha */
// A block used with no face given is used by the crosshair's hit on it, looking at its centre (Minecraft.startUseItem's
// BlockHitResult: its face, and its location less the block's position the cursor), not by its top from under the
// top, a face the eyes are behind (GrimAC's PositionPlace cancels that use: an enchanting table a block above the bot's
// floor never opened). The face and the cursor's floats are checked to the bit against vanilla's arithmetic: the
// rotation the bot sent, Entity.pick's ray to the pick range, AABB.clip on the block's outline box.

const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep } = require('../lib/promise_utils')
const { viewVector } = require('../lib/mth')
const { fakeServerBot } = require('./common/fakeServer')

const settle = () => sleep(100)
const spawn = { x: 4.5, y: 65, z: 4.5 }
const [DOWN, UP, NORTH, SOUTH, WEST, EAST] = [0, 1, 2, 3, 4, 5]
const EYE_HEIGHT = Math.fround(1.62)
// GameRenderer.pick's range in survival: the block interaction range 4.5 (the entity one, 3, is less)
const PICK_RANGE = 4.5

// AABB.clipPoint, in vanilla's order of operations
function clipPoint (scale, direction, da, db, dc, begin, minB, maxB, minC, maxC, newDirection, startA, startB, startC) {
  const d = (begin - startA) / da
  const e = startB + d * db
  const f = startC + d * dc
  if (d > 0 && d < scale[0] && minB - 1.0E-7 < e && e < maxB + 1.0E-7 && minC - 1.0E-7 < f && f < maxC + 1.0E-7) {
    scale[0] = d
    return newDirection
  }
  return direction
}

// Entity.pick's ray from the eyes along the rotation's view vector, then AABB.clip on the one box (AABB.getDirection,
// the BlockHitResult's location from.add(scale * delta)): { face, location } or null
function vanillaHit (version, eye, yaw, pitch, box) {
  const v = viewVector(version, pitch, yaw)
  const to = { x: eye.x + v.x * PICK_RANGE, y: eye.y + v.y * PICK_RANGE, z: eye.z + v.z * PICK_RANGE }
  const dx = to.x - eye.x
  const dy = to.y - eye.y
  const dz = to.z - eye.z
  const [minX, minY, minZ, maxX, maxY, maxZ] = box
  const scale = [1.0]
  let face = null
  if (dx > 1.0E-7) face = clipPoint(scale, face, dx, dy, dz, minX, minY, maxY, minZ, maxZ, WEST, eye.x, eye.y, eye.z)
  else if (dx < -1.0E-7) face = clipPoint(scale, face, dx, dy, dz, maxX, minY, maxY, minZ, maxZ, EAST, eye.x, eye.y, eye.z)
  if (dy > 1.0E-7) face = clipPoint(scale, face, dy, dz, dx, minY, minZ, maxZ, minX, maxX, DOWN, eye.y, eye.z, eye.x)
  else if (dy < -1.0E-7) face = clipPoint(scale, face, dy, dz, dx, maxY, minZ, maxZ, minX, maxX, UP, eye.y, eye.z, eye.x)
  if (dz > 1.0E-7) face = clipPoint(scale, face, dz, dx, dy, minZ, minX, maxX, minY, maxY, NORTH, eye.z, eye.x, eye.y)
  else if (dz < -1.0E-7) face = clipPoint(scale, face, dz, dx, dy, maxZ, minX, maxX, minY, maxY, SOUTH, eye.z, eye.x, eye.y)
  if (face === null) return null
  const s = scale[0]
  return { face, location: { x: eye.x + s * dx, y: eye.y + s * dy, z: eye.z + s * dz } }
}

describe('a block used with no face given (activateBlock, openContainer)', function () {
  this.timeout(15 * 1000)
  for (const version of ['1.20.4', '1.21.11', '26.3']) {
    it(`sends the crosshair's face and cursor, to the bit vanilla's, the top only when it is in sight, ${version}`, async () => {
      // the bot on stone (in the fake server's one chunk); an enchanting table (3/4 high) a block higher 2 east of it
      // and one at its feet' level 2 south, a chest a block higher 2 west
      const t = await fakeServerBot(version, {
        spawn,
        blocks: [[4, 64, 4, 'stone'], [6, 65, 4, 'stone'], [6, 66, 4, 'enchanting_table'], [4, 65, 6, 'enchanting_table'], [2, 65, 4, 'stone'], [2, 66, 4, 'chest']]
      })
      try {
        for (let i = 0; i < 20 && !t.bot.entity.onGround; i++) t.ticks(1)
        await settle()
        assert.deepStrictEqual(t.bot.entity.position, new Vec3(4.5, 65, 4.5))
        const eye = { x: 4.5, y: 65 + EYE_HEIGHT, z: 4.5 }
        // (the look waits for a tick: the test steps them)
        const ticking = async (promise) => {
          const state = { done: false }
          promise.then(() => { state.done = true }, () => { state.done = true })
          for (let i = 0; i < 20 && !state.done; i++) {
            t.ticks(1)
            await settle()
          }
          return await promise
        }
        // the use the bot sent, and the rotation of its last movement packet before it
        const sentUse = () => {
          const at = t.written.findIndex(p => p.name === 'block_place')
          assert.ok(at >= 0, t.written.map(p => p.name).join(' '))
          const look = t.written.slice(0, at).reverse().find(p => p.name === 'look' || p.name === 'position_look')
          assert.ok(look != null, 'a look sent before the use')
          return { use: t.written[at].data, yaw: look.data.yaw, pitch: look.data.pitch }
        }
        // the face and the cursor floats (the packet's: (float) of the location less the block's position)
        const expectUse = (sent, pos, box, face) => {
          const hit = vanillaHit(t.registry.version, eye, sent.yaw, sent.pitch, box.map((v, i) => v + [pos.x, pos.y, pos.z][i % 3]))
          assert.ok(hit != null, 'vanilla\'s crosshair is on the block')
          assert.strictEqual(hit.face, face)
          assert.strictEqual(sent.use.direction, face, JSON.stringify(sent.use))
          assert.deepStrictEqual(sent.use.location, { x: pos.x, y: pos.y, z: pos.z })
          assert.strictEqual(sent.use.cursorX, Math.fround(hit.location.x - pos.x))
          assert.strictEqual(sent.use.cursorY, Math.fround(hit.location.y - pos.y))
          assert.strictEqual(sent.use.cursorZ, Math.fround(hit.location.z - pos.z))
        }
        const TABLE = [0, 0, 0, 1, 12 / 16, 1]
        const CHEST = [1 / 16, 0, 1 / 16, 15 / 16, 14 / 16, 15 / 16]

        // the raised table: its top (66.75) over the eyes (66.62), the west side, facing the bot
        t.written.length = 0
        await ticking(t.bot.activateBlock(t.bot.blockAt(new Vec3(6, 66, 4))))
        expectUse(sentUse(), new Vec3(6, 66, 4), TABLE, WEST)

        // the table at the feet' level: its top in sight
        t.written.length = 0
        await ticking(t.bot.activateBlock(t.bot.blockAt(new Vec3(4, 65, 6))))
        expectUse(sentUse(), new Vec3(4, 65, 6), TABLE, UP)

        // a face given is kept, with the centre for its cursor
        t.written.length = 0
        await ticking(t.bot.activateBlock(t.bot.blockAt(new Vec3(6, 66, 4)), new Vec3(0, 1, 0)))
        const given = t.written.find(p => p.name === 'block_place').data
        assert.deepStrictEqual([given.direction, given.cursorX, given.cursorY, given.cursorZ], [UP, 0.5, 0.5, 0.5])

        // openContainer: the raised chest by the face the bot sees too, its east side, 1/16 in from the cell's
        t.written.length = 0
        const Item = require('prismarine-item')(t.registry)
        t.client.once('block_place', () => {
          const title = t.registry.version['>=']('1.20.3') ? { type: 'string', value: 'Chest' } : JSON.stringify({ text: 'Chest' })
          t.client.write('open_window', { windowId: 1, inventoryType: 2, windowTitle: title })
          t.client.write('window_items', { windowId: 1, stateId: 2, items: new Array(63).fill(Item.toNotch(null)), carriedItem: Item.toNotch(null) })
        })
        const chest = await ticking(t.bot.openContainer(t.bot.blockAt(new Vec3(2, 66, 4))))
        expectUse(sentUse(), new Vec3(2, 66, 4), CHEST, EAST)
        chest.close()
      } finally {
        await t.close()
      }
    })
  }
})
