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
    border = { centerX: 0, centerZ: 0, from: MAX_SIZE, to: MAX_SIZE, lerpStart: 0, lerpTime: 0, absoluteMaxSize: ABSOLUTE_MAX_SIZE, warningBlocks: 5, warningTime: 15 }
  }
  reset()

  const setCenter = (x, z) => { border.centerX = x; border.centerZ = z }
  const setSize = size => { border.from = border.to = size; border.lerpTime = 0 }
  // (a size moving to another over the time given; vanilla times it in milliseconds, from 26.3 in game ticks, which are
  // 50 ms each)
  const lerpSize = (from, to, time) => {
    time = Number(time)
    if (time <= 0) return setSize(to)
    Object.assign(border, { from, to, lerpStart: performance.now(), lerpTime: time * (bot.registry.version['>=']('26.3') ? 50 : 1) })
  }
  const size = () => {
    if (border.lerpTime <= 0) return border.to
    const progress = (performance.now() - border.lerpStart) / border.lerpTime
    return progress >= 1 ? border.to : border.from + (border.to - border.from) * progress
  }
  const clamp = value => Math.min(Math.max(value, -border.absoluteMaxSize), border.absoluteMaxSize)

  bot.worldBorder = {
    get centerX () { return border.centerX },
    get centerZ () { return border.centerZ },
    get size () { return size() },
    get warningBlocks () { return border.warningBlocks },
    get warningTime () { return border.warningTime },
    get minX () { return clamp(border.centerX - size() / 2) },
    get maxX () { return clamp(border.centerX + size() / 2) },
    get minZ () { return clamp(border.centerZ - size() / 2) },
    get maxZ () { return clamp(border.centerZ + size() / 2) },
    // WorldBorder.isWithinBounds: a point (a block's corner for a block) inside, the max sides excluded
    isWithinBounds (x, z) {
      return x >= this.minX && x < this.maxX && z >= this.minZ && z < this.maxZ
    }
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
