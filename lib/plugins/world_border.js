const { performance } = require('perf_hooks')

module.exports = inject

// The world border as the client knows it (WorldBorder: its centre, its size and a size moving to another), from the
// server's border packets: world_border before 1.17 (its action), initialize_world_border and one packet per change from
// 1.17. A new level (a login, a respawn) starts with the default border until the server says another.
const MAX_SIZE = 5.9999968e7
const ABSOLUTE_MAX_SIZE = 29999984

function inject (bot) {
  let border
  const reset = () => {
    border = { centerX: 0, centerZ: 0, from: MAX_SIZE, to: MAX_SIZE, lerpStart: 0, lerpTime: 0, lerpProgress: 0, size: MAX_SIZE, previousSize: MAX_SIZE, absoluteMaxSize: ABSOLUTE_MAX_SIZE, warningBlocks: 5, warningTime: 15 }
  }
  reset()
  // from 1.21.11 a moving border moves in the level's ticks (MovingBorderExtent.update, its lerpProgress counted down in
  // WorldBorder.tick from ClientLevel.tick, the packet's lerp time in ticks); before, in milliseconds (Util.getMillis)
  const ticked = () => bot.registry.version['>=']('1.21.11')

  const setCenter = (x, z) => { border.centerX = x; border.centerZ = z }
  const setSize = size => { Object.assign(border, { from: size, to: size, lerpTime: 0, lerpProgress: 0, size, previousSize: size }) }
  // (a size moving to another over the time given: ticks from 1.21.11, milliseconds before)
  const lerpSize = (from, to, time) => {
    time = Number(time)
    if (time <= 0 || from === to) return setSize(to)
    Object.assign(border, { from, to, lerpStart: performance.now(), lerpTime: time, lerpProgress: time })
    // (MovingBorderExtent's constructor: its size and previous size both where it starts)
    border.size = border.previousSize = tickedSize()
  }
  // MovingBorderExtent.calculateSize (1.21.11 WorldBorder.java:394-397)
  const tickedSize = () => {
    const d = (border.lerpTime - border.lerpProgress) / border.lerpTime
    return d < 1 ? border.from + d * (border.to - border.from) : border.to
  }
  const size = () => {
    if (ticked()) return border.size
    if (border.lerpTime <= 0) return border.to
    const progress = (performance.now() - border.lerpStart) / border.lerpTime
    return progress >= 1 ? border.to : border.from + (border.to - border.from) * progress
  }
  // the size the edges have (getMinX(0.0F)): from 1.21.11 lerp(0, previousSize, size), the size before the last tick
  const edgeSize = () => ticked() ? border.previousSize : size()
  // WorldBorder.tick: a step of a moving border, which ends static at its target when its progress runs out
  // (MovingBorderExtent.update, 1.21.11 WorldBorder.java:427-438)
  const tick = () => {
    if (!ticked() || border.lerpTime <= 0) return
    border.lerpProgress--
    border.previousSize = border.size
    border.size = tickedSize()
    if (border.lerpProgress <= 0) setSize(border.to)
  }
  const clamp = value => Math.min(Math.max(value, -border.absoluteMaxSize), border.absoluteMaxSize)

  bot.worldBorder = {
    get centerX () { return border.centerX },
    get centerZ () { return border.centerZ },
    get size () { return size() },
    get previousSize () { return edgeSize() },
    get absoluteMaxSize () { return border.absoluteMaxSize },
    get warningBlocks () { return border.warningBlocks },
    get warningTime () { return border.warningTime },
    get minX () { return clamp(border.centerX - edgeSize() / 2) },
    get maxX () { return clamp(border.centerX + edgeSize() / 2) },
    get minZ () { return clamp(border.centerZ - edgeSize() / 2) },
    get maxZ () { return clamp(border.centerZ + edgeSize() / 2) },
    // WorldBorder.isWithinBounds: a point (a block's corner for a block) inside, the max sides excluded
    isWithinBounds (x, z) {
      return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ
    },
    // (the physics plugin calls it at the end of each client tick, where ClientLevel.tick comes after the entities')
    tick
  }

  const initialize = (x, z, from, to, time, absoluteMaxSize, warningBlocks, warningTime) => {
    setCenter(x, z)
    if (Number(time) > 0) lerpSize(from, to, time)
    else setSize(to)
    Object.assign(border, { absoluteMaxSize, warningBlocks, warningTime })
  }

  bot._client.on('login', reset)
  bot._client.on('respawn', reset)
  // before 1.17: one packet, its action telling what changes (its radius fields are the diameter)
  bot._client.on('world_border', (packet) => {
    switch (packet.action) {
      case 0: return setSize(packet.radius)
      case 1: return lerpSize(packet.old_radius, packet.new_radius, packet.speed)
      case 2: return setCenter(packet.x, packet.z)
      case 3: return initialize(packet.x, packet.z, packet.old_radius, packet.new_radius, packet.speed, packet.portalBoundary, packet.warning_blocks, packet.warning_time)
      case 4: border.warningTime = packet.warning_time; return
      case 5: border.warningBlocks = packet.warning_blocks
    }
  })
  bot._client.on('initialize_world_border', (packet) => {
    initialize(packet.x, packet.z, packet.oldDiameter, packet.newDiameter, packet.speed, packet.portalTeleportBoundary, packet.warningBlocks, packet.warningTime)
  })
  bot._client.on('world_border_center', (packet) => setCenter(packet.x, packet.z))
  bot._client.on('world_border_size', (packet) => setSize(packet.diameter))
  bot._client.on('world_border_lerp_size', (packet) => lerpSize(packet.oldDiameter, packet.newDiameter, packet.speed))
  bot._client.on('world_border_warning_delay', (packet) => { border.warningTime = packet.warningTime })
  bot._client.on('world_border_warning_reach', (packet) => { border.warningBlocks = packet.warningBlocks })
}
