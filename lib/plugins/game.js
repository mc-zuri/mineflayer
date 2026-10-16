const nbt = require('prismarine-nbt')
module.exports = inject

const difficultyNames = ['peaceful', 'easy', 'normal', 'hard']
const gameModes = ['survival', 'creative', 'adventure', 'spectator']

const dimensionNames = {
  '-1': 'the_nether',
  0: 'overworld',
  1: 'the_end'
}

const parseGameMode = gameModeBits => {
  if (gameModeBits < 0 || gameModeBits > 0b11) {
    return 'survival'
  }
  return gameModes[(gameModeBits & 0b11)] // lower two bits
}

function inject (bot, options) {
  function getBrandCustomChannelName () {
    if (bot.supportFeature('customChannelMCPrefixed')) {
      return 'MC|Brand'
    } else if (bot.supportFeature('customChannelIdentifier')) {
      return 'minecraft:brand'
    }
    throw new Error('Unsupported brand channel name')
  }

  function handleRespawnPacketData (packet) {
    bot.game.levelType = packet.levelType ?? (packet.isFlat ? 'flat' : 'default')
    bot.game.hardcore = packet.isHardcore ?? Boolean(packet.gameMode & 0b100)
    // Either a respawn packet or a login packet. Depending on the packet it can be "gamemode" or "gameMode"
    if (bot.supportFeature('spawnRespawnWorldDataField')) { // 1.20.5
      bot.game.gameMode = packet.gamemode
    } else {
      bot.game.gameMode = parseGameMode(packet.gamemode ?? packet.gameMode)
    }
    if (bot.supportFeature('segmentedRegistryCodecData')) { // 1.20.5
      if (typeof packet.dimension === 'number') {
        bot.game.dimension = bot.registry.dimensionsArray[packet.dimension]?.name?.replace('minecraft:', '')
      } else if (typeof packet.dimension === 'string') { // iirc, in 1.21 it's back to a string
        bot.game.dimension = packet.dimension.replace('minecraft:', '')
      }
    } else if (bot.supportFeature('dimensionIsAnInt')) {
      bot.game.dimension = dimensionNames[packet.dimension]
    } else if (bot.supportFeature('dimensionIsAString')) {
      bot.game.dimension = packet.dimension.replace('minecraft:', '')
    } else if (bot.supportFeature('dimensionIsAWorld')) {
      if (bot.supportFeature('dimensionDataInCodec')) {
        // For 1.19+, we need the dimension TYPE name (not the world/level name) so
        // the codec lookup succeeds. In login packets the type is "worldType"; in
        // respawn packets it is "dimension". worldName is the level name which may
        // differ from the type on proxy/modded servers.
        const dimType = packet.worldType ?? packet.dimension
        bot.game.dimension = typeof dimType === 'string'
          ? dimType.replace('minecraft:', '')
          : packet.worldName.replace('minecraft:', '')
      } else {
        bot.game.dimension = packet.worldName.replace('minecraft:', '')
      }
    } else {
      throw new Error('Unsupported dimension type in login packet')
    }

    if (packet.dimensionCodec) {
      bot.registry.loadDimensionCodec(packet.dimensionCodec)
    }

    bot.game.minY = 0
    bot.game.height = 256

    if (bot.supportFeature('dimensionDataInCodec')) { // 1.19+
      const dimData = bot.registry.dimensionsByName[bot.game.dimension]
      if (dimData) {
        bot.game.minY = dimData.minY
        bot.game.height = dimData.height
      }
    } else if (bot.supportFeature('dimensionDataIsAvailable')) { // 1.16.2+
      const dimensionData = nbt.simplify(packet.dimension)
      bot.game.minY = dimensionData.min_y
      bot.game.height = dimensionData.height
    }

    if (packet.difficulty) {
      bot.game.difficulty = difficultyNames[packet.difficulty]
    }
  }

  bot.game = {}

  const brandChannel = getBrandCustomChannelName()
  bot._client.registerChannel(brandChannel, ['string', []])

  // 1.20.2
  bot._client.on('registry_data', (packet) => {
    bot.registry.loadDimensionCodec(packet.codec || packet)
  })

  bot._client.on('login', (packet) => {
    handleRespawnPacketData(packet.worldState || packet)

    bot.game.maxPlayers = packet.maxPlayers
    if (packet.enableRespawnScreen) {
      bot.game.enableRespawnScreen = packet.enableRespawnScreen
    }
    if (packet.viewDistance) {
      bot.game.serverViewDistance = packet.viewDistance
    }

    bot.emit('login')
    bot.emit('game')

    // varint length-prefixed string as data
    bot._client.writeChannel(brandChannel, options.brand)
  })

  bot._client.on('respawn', (packet) => {
    // in 1.20.5+ protocol we move the shared spawn data into one SpawnInfo type under .worldState
    handleRespawnPacketData(packet.worldState || packet)
    bot.emit('game')
  })

  // The world border (WorldBorder), which the physics keeps the bot inside: null for the default one, until the server
  // sets it. A border moving from one size to another (MovingBorderExtent) has the size it has reached: up to 1.21.10
  // over some milliseconds by the wall clock, from 1.21.11 over some ticks, a tick at a time at the end of each client
  // tick (ClientLevel.tick, after the player's; bot.worldBorder.tick). A new world starts with the default border, and
  // the server sends its own after login and respawn.
  bot.worldBorder = null
  const borderMovesByTicks = bot.registry.version['>=']('1.21.11')
  const toMs = speed => typeof speed === 'bigint' ? Number(speed) : Array.isArray(speed) ? speed[0] * 4294967296 + speed[1] : Number(speed)
  function setBorderSize (from, to, ms) {
    const border = bot.worldBorder ?? (bot.worldBorder = createWorldBorder())
    border.lerp = ms > 0 ? { from, to, start: Date.now(), ms, ticksLeft: ms } : { from: to, to, start: 0, ms: 0, ticksLeft: 0 }
  }
  function setBorderCenter (x, z) {
    const border = bot.worldBorder ?? (bot.worldBorder = createWorldBorder())
    border.centerX = x
    border.centerZ = z
  }
  function createWorldBorder () {
    return {
      centerX: 0,
      centerZ: 0,
      lerp: { from: 59999968, to: 59999968, start: 0, ms: 0, ticksLeft: 0 },
      get size () {
        const { from, to, start, ms, ticksLeft } = this.lerp
        if (ms <= 0) return to
        const progress = borderMovesByTicks ? (ms - ticksLeft) / ms : (Date.now() - start) / ms
        return progress < 1 ? from + progress * (to - from) : to
      },
      tick () {
        if (borderMovesByTicks && this.lerp.ticksLeft > 0) this.lerp.ticksLeft--
      }
    }
  }
  bot._client.on('login', () => { bot.worldBorder = null })
  bot._client.on('respawn', () => { bot.worldBorder = null })
  bot._client.on('initialize_world_border', (packet) => {
    setBorderCenter(packet.x, packet.z)
    setBorderSize(packet.oldDiameter, packet.newDiameter, toMs(packet.speed))
  })
  bot._client.on('world_border_center', (packet) => setBorderCenter(packet.x, packet.z))
  bot._client.on('world_border_size', (packet) => setBorderSize(packet.diameter, packet.diameter, 0))
  bot._client.on('world_border_lerp_size', (packet) => setBorderSize(packet.oldDiameter, packet.newDiameter, toMs(packet.speed)))
  // up to 1.16 one packet, by action: 0 size, 1 moving size, 2 center, 3 all (its radius fields are diameters)
  bot._client.on('world_border', (packet) => {
    if (packet.action === 2 || packet.action === 3) setBorderCenter(packet.x, packet.z)
    if (packet.action === 0) setBorderSize(packet.radius, packet.radius, 0)
    if (packet.action === 1 || packet.action === 3) setBorderSize(packet.old_radius, packet.new_radius, toMs(packet.speed))
  })

  bot._client.on('game_state_change', (packet) => {
    if ((packet.reason === 4 || packet.reason === 'win_game') && packet.gameMode === 1) {
      bot._client.write('client_command', { actionId: 'perform_respawn' })
    }
    if ((packet.reason === 3) || (packet.reason === 'change_game_mode')) {
      bot.game.gameMode = parseGameMode(packet.gameMode)
      bot.emit('game')
    }
  })

  bot._client.on('difficulty', (packet) => {
    bot.game.difficulty = difficultyNames[packet.difficulty]
  })

  bot._client.on(brandChannel, (serverBrand) => {
    bot.game.serverBrand = serverBrand
  })

  // Each ping is answered exactly once. In the play state the vanilla client answers from the
  // client thread, which handles every packet in arrival order at the start of the next tick
  // (before that tick's movement packet), so the pong joins the physics plugin's reply queue and
  // keeps its place relative to the teleports around it. Outside the play state, or without the
  // physics plugin, the pong is written immediately.
  bot._client.on('ping', (data) => {
    const pong = () => bot._client.write('pong', { id: data.id })
    if (bot._client.state === 'play' && bot._replyOnNextTick) bot._replyOnNextTick(pong)
    else pong()
  })
}
