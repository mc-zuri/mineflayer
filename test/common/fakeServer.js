// A bot against a fake server of a version (minecraft-protocol's), for the tests of what the bot writes: the bot's
// physics stepped by the test (physicsManual), a chunk at 0, 0 with the blocks asked for, and every packet the bot
// writes recorded in order.
const { Vec3 } = require('vec3')
const mc = require('minecraft-protocol')
const mineflayer = require('../../')
const { once } = require('../../lib/promise_utils')
const { getPort } = require('./util')

async function fakeServerBot (version, { blocks = [], spawn = null, gameMode = 'survival', options = {} } = {}) {
  const registry = require('prismarine-registry')(version)
  const Chunk = require('prismarine-chunk')(version)
  const Block = require('prismarine-block')(registry)
  const tall = registry.version['>=']('1.18')
  const port = await getPort()
  const server = mc.createServer({ 'online-mode': false, version, port })
  await once(server, 'listening')
  server.on('playerJoin', (joined) => {
    // like a vanilla server, tell a 1.21.4+ client its level's chunks are coming
    if (!registry.version['>=']('1.21.4')) return
    const write = joined.write.bind(joined)
    joined.write = (name, params) => {
      write(name, params)
      if (name === 'login' || name === 'respawn') write('game_state_change', { reason: 'level_chunks_load_start', gameMode: 0 })
    }
  })
  const bot = mineflayer.createBot({ username: 'player', version, port, physicsManual: true, ...options })
  const [client] = await once(server, 'playerJoin')
  const login = registry.supportFeature('usesLoginPacket')
    ? { ...registry.loginPacket, entityId: 0 }
    : { entityId: 0, levelType: 'default', gameMode: 0, previousGameMode: 255, worldNames: ['minecraft:overworld'], dimension: 0, worldName: 'minecraft:overworld', hashedSeed: [0, 0], difficulty: 0, maxPlayers: 20, reducedDebugInfo: false, enableRespawnScreen: true }
  client.write('login', login)
  client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
  const chunk = tall ? new Chunk({ minY: -64, worldHeight: 384 }) : new Chunk()
  for (const [x, y, z, name, properties = {}] of blocks) {
    let stateId
    try {
      stateId = Block.fromProperties(name, properties).stateId
    } catch (err) {
      stateId = registry.blocksByName[name].id << 4
    }
    chunk.setBlockStateId(new Vec3(x, y, z), stateId)
  }
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
  bot.game.gameMode = gameMode

  // the server's teleport, answered by the bot
  const teleportAnswer = registry.version['>=']('26.3') ? 'teleport_confirm' : 'position_look'
  async function teleport ({ x, y, z }, teleportId = 1) {
    const reply = once(client, teleportAnswer)
    client.write('position', {
      x,
      y,
      z,
      pitch: 0,
      yaw: 0,
      flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
      teleportId
    })
    await reply
  }
  if (spawn) {
    // 1.9 - 1.13 tick a player from the tick after its chunk loaded
    if (registry.version['>=']('1.9') && registry.version['<']('1.14')) bot.physicsTick()
    await teleport(spawn)
    bot.physicsTick()
  } else {
    bot.entity.position = new Vec3(0.5, 65, 0.5)
  }

  const written = []
  client.on('packet', (data, { name }) => written.push({ name, data }))
  return {
    bot,
    server,
    client,
    registry,
    written,
    teleport,
    // the names of the packets written, of those matching re
    names: (re = /./) => written.map(p => p.name).filter(name => re.test(name)),
    ticks (count = 1) {
      for (let i = 0; i < count; i++) bot.physicsTick()
    },
    close () {
      return new Promise(resolve => {
        bot.once('end', () => resolve())
        server.close()
      })
    }
  }
}

module.exports = { fakeServerBot }
