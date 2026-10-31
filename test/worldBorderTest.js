/* eslint-env mocha */
// The world border the client knows (lib/plugins/world_border.js): how a moving border moves, and its absolute max size.

const assert = require('assert')
const { EventEmitter } = require('events')
const inject = require('../lib/plugins/world_border')

describe('world border', function () {
  function botOf (version) {
    const bot = new EventEmitter()
    bot.registry = require('prismarine-registry')(version)
    bot._client = new EventEmitter()
    inject(bot)
    return bot
  }
  const lerp = (bot, from, to, time) => bot._client.emit('world_border_lerp_size', { oldDiameter: from, newDiameter: to, speed: time })

  // from 1.21.11 a moving border steps once per WorldBorder.tick (MovingBorderExtent.update, 1.21.11
  // WorldBorder.java:427-438, from ClientLevel.tick :286), the packet's lerp time in ticks (ClientPacketListener.java:1819),
  // and its edges are where getMinX(0.0F) puts them: lerp(0, previousSize, size), the size before the last step (:350-356)
  it('moves in ticks from 1.21.11, its edges a tick behind', function () {
    const bot = botOf('1.21.11')
    lerp(bot, 100, 60, 4)
    const seen = [[bot.worldBorder.size, bot.worldBorder.previousSize, bot.worldBorder.maxX]]
    for (let i = 0; i < 4; i++) {
      bot.worldBorder.tick()
      seen.push([bot.worldBorder.size, bot.worldBorder.previousSize, bot.worldBorder.maxX])
    }
    assert.deepStrictEqual(seen, [[100, 100, 50], [90, 100, 50], [80, 90, 45], [70, 80, 40], [60, 60, 30]])
  })

  // before 1.21.11 the border moves in milliseconds (origin/client1.21.10 WorldBorder.java:299-329, Util.getMillis): a
  // tick does not move it
  it('does not step in ticks before 1.21.11', function () {
    const bot = botOf('1.21.10')
    lerp(bot, 100, 60, 60000)
    bot.worldBorder.tick()
    assert.ok(bot.worldBorder.size > 99)
    assert.ok(bot.worldBorder.previousSize > 99)
  })

  // WorldBorder.setAbsoluteMaxSize from the init packet (1.21.11 ClientPacketListener.java:1805) clamps each edge
  // (WorldBorder.java:558-561)
  it('clamps its edges to the absolute max size the server sends', function () {
    const bot = botOf('1.21.11')
    bot._client.emit('initialize_world_border', { x: 0, z: 0, oldDiameter: 5000, newDiameter: 5000, speed: 0, portalTeleportBoundary: 1000, warningBlocks: 5, warningTime: 15 })
    assert.deepStrictEqual([bot.worldBorder.absoluteMaxSize, bot.worldBorder.minX, bot.worldBorder.maxZ], [1000, -1000, 1000])
  })
})
