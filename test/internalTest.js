/* eslint-env mocha */

const mineflayer = require('../')
const vec3 = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const nbt = require('prismarine-nbt')
const { once, onceWithCleanup } = require('../lib/promise_utils')
const { EventEmitter } = require('events')
const { getPort } = require('./common/util')

for (const supportedVersion of mineflayer.testedVersions) {
  const registry = require('prismarine-registry')(supportedVersion)
  const version = registry.version
  const Chunk = require('prismarine-chunk')(supportedVersion)
  const Item = require('prismarine-item')(registry)

  const hasSignedChat = registry.supportFeature('signedChat')
  function chatText (text) {
    // TODO: move this to prismarine-chat in a new ChatMessage(text).toNotch(asNbt) method
    return registry.supportFeature('chatPacketsUseNbtComponents')
      ? nbt.comp({ text: nbt.string(text) })
      : JSON.stringify({ text })
  }

  function generateChunkPacket (chunk) {
    const lights = chunk.dumpLight()
    return {
      x: 0,
      z: 0,
      groundUp: true,
      biomes: chunk.dumpBiomes !== undefined ? chunk.dumpBiomes() : undefined,
      heightmaps: {
        type: 'compound',
        name: '',
        value: {
          MOTION_BLOCKING: { type: 'longArray', value: new Array(36).fill([0, 0]) }
        }
      }, // send fake heightmap
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
    }
  }

  describe(`mineflayer_internal ${supportedVersion}v`, function () {
    this.timeout(10 * 1000)
    let bot
    let server
    let PORT
    beforeEach(async function () {
      PORT = await getPort()
      server = mc.createServer({
        'online-mode': false,
        version: supportedVersion,
        port: PORT
      })
      await once(server, 'listening')
      bot = mineflayer.createBot({
        username: 'player',
        version: supportedVersion,
        port: PORT
      })
      bot.test = {}
      // Plugins are injected on a timer after createBot, which can lose the
      // race against the mock server's playerJoin
      bot.test.pluginsLoaded = new Promise(resolve => bot.once('inject_allowed', resolve))

      bot.test.buildChunk = () => {
        if (bot.supportFeature('tallWorld')) {
          return new Chunk({ minY: -64, worldHeight: 384 })
        } else {
          return new Chunk()
        }
      }

      bot.test.generateLoginPacket = () => {
        let loginPacket
        if (bot.supportFeature('usesLoginPacket')) {
          loginPacket = registry.loginPacket
          loginPacket.entityId = 0 // Default login packet in minecraft-data 1.16.5 is 1, so set it to 0
        } else {
          loginPacket = {
            entityId: 0,
            levelType: 'fogetaboutit',
            gameMode: 0,
            previousGameMode: 255,
            worldNames: ['minecraft:overworld'],
            dimension: 0,
            worldName: 'minecraft:overworld',
            hashedSeed: [0, 0],
            difficulty: 0,
            maxPlayers: 20,
            reducedDebugInfo: 1,
            enableRespawnScreen: true
          }
        }
        return loginPacket
      }
    })
    afterEach((done) => {
      if (bot._client.ended) done()
      else bot.on('end', () => done())
      server.close()
    })
    it('chat', (done) => {
      bot.once('chat', (username, message) => {
        assert.strictEqual(username, 'gary')
        assert.strictEqual(message, 'hello')
        bot.chat('hi')
      })
      server.on('playerJoin', (client) => {
        client.write('login', bot.test.generateLoginPacket())
        const message = hasSignedChat
          ? JSON.stringify({ text: 'hello' })
          : JSON.stringify({
            translate: 'chat.type.text',
            with: [{
              text: 'gary'
            },
            'hello'
            ]
          })

        if (hasSignedChat) {
          const uuid = 'd3527a0b-bc03-45d5-a878-2aafdd8c8a43' // random
          const networkName = chatText('gary')

          if (registry.supportFeature('incrementedChatType')) {
            client.write('player_chat', {
              plainMessage: 'hello',
              filterType: 0,
              type: { chatType: 0 },
              networkName,
              previousMessages: [],
              senderUuid: uuid,
              timestamp: Date.now(),
              index: 0,
              salt: 1n
            })
          } else if (registry.supportFeature('useChatSessions')) {
            client.write('player_chat', {
              plainMessage: 'hello',
              filterType: 0,
              type: { chatType: 0 },
              networkName,
              previousMessages: [],
              senderUuid: uuid,
              timestamp: Date.now(),
              index: 0,
              salt: 2n
            })
          } else if (registry.supportFeature('chainedChatWithHashing')) {
            client.write('player_chat', {
              plainMessage: 'hello',
              filterType: 0,
              type: 0,
              networkName,
              previousMessages: [],
              senderUuid: uuid,
              timestamp: Date.now(),
              salt: 3n,
              signature: Buffer.alloc(0)
            })
          } else {
            client.write('player_chat', {
              signedChatContent: '',
              unsignedChatContent: message,
              type: 0,
              senderUuid: uuid,
              senderName: JSON.stringify({ text: 'gary' }),
              senderTeam: undefined,
              timestamp: Date.now(),
              salt: 4n,
              signature: Buffer.alloc(0)
            })
          }
        } else {
          client.write('chat', { message, position: 0, sender: '0' })
        }
        function onChat (packet) {
          const msg = packet.message || packet.unsignedChatContent || packet.signedChatContent
          assert.strictEqual(msg, 'hi')
          done()
        }
        client.on('chat_message', onChat)
        client.on('chat', onChat)
      })
    })
    it('chat before login throws a descriptive error', async () => {
      await once(bot, 'inject_allowed')
      const early = /before the client entered the play state; wait for/
      assert.throws(() => bot.chat('hi'), early)
      assert.throws(() => bot.whisper('gary', 'hi'), early)
    })
    it('chat after a kick during login throws a descriptive error', async () => {
      // Replaces the server's login handler so the client is rejected while still in the login state.
      server.on('connection', (client) => {
        client.removeAllListeners('login_start')
        client.once('login_start', () => client.end('kicked'))
      })
      const [reason] = await once(bot, 'end')
      const kicked = new RegExp(`disconnected before entering the play state \\(${reason}\\)`)
      assert.throws(() => bot.chat('hi'), kicked)
      assert.throws(() => bot.whisper('gary', 'hi'), kicked)
    })
    it('entity effects', (done) => {
      bot.once('entityEffect', (entity, effect) => {
        assert.strictEqual(entity.id, 8)
        assert.strictEqual(effect.id, 10)
        assert.strictEqual(effect.amplifier, 1)
        assert.strictEqual(effect.duration, 11)
        done()
      })
      // Versions prior to 1.11 have capital first letter
      const entities = bot.registry.entitiesByName
      const creeperId = entities.creeper ? entities.creeper.id : entities.Creeper.id
      server.on('playerJoin', (client) => {
        client.write(bot.registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living', {
          entityId: 8, // random
          entityUUID: '00112233-4455-6677-8899-aabbccddeeff',
          objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
          type: creeperId,
          x: 10,
          y: 11,
          z: 12,
          yaw: 13,
          pitch: 14,
          headPitch: 14,
          velocity: { x: 15, y: 16, z: 17 },
          metadata: []
        })
        client.write('entity_effect', {
          entityId: 8,
          effectId: 10,
          amplifier: 1,
          duration: 11,
          hideParticles: false
        })
      })
    })
    it('blockAt', (done) => {
      const pos = vec3(1, 65, 1)
      const goldId = bot.registry.blocksByName.gold_block.id
      bot.on('chunkColumnLoad', (columnPoint) => {
        assert.strictEqual(columnPoint.x, 0)
        assert.strictEqual(columnPoint.z, 0)
        assert.strictEqual(bot.blockAt(pos).type, goldId)
        done()
      })
      server.on('playerJoin', (client) => {
        client.write('login', bot.test.generateLoginPacket())
        const chunk = bot.test.buildChunk()
        chunk.setBlockType(pos, goldId)
        client.write('map_chunk', generateChunkPacket(chunk))
      })
    })

    describe('digTime', () => {
      it('should use eye-level water check instead of isInWater for dig speed', (done) => {
        const blockPos = vec3(1, 65, 1)
        const playerPos = vec3(1.5, 66, 1.5)
        // eyeHeight is 1.62, so eye level at y=67.62 -> block at y=67
        // A second position where eye level has water: player at y=70, eye at y=71.62 -> block y=71
        const playerPos2 = vec3(1.5, 70, 1.5)
        const eyeLevelBlockPos2 = vec3(1, 71, 1)
        const dirtId = bot.registry.blocksByName.dirt.id
        const waterId = bot.registry.blocksByName.water.id
        const blockPos2 = vec3(1, 69, 1)

        bot.on('chunkColumnLoad', () => {
          // Set bot entity properties
          bot.entity.eyeHeight = 1.62
          bot.entity.onGround = true
          bot.entity.isInWater = false
          bot.entity.effects = {}
          bot.game = bot.game || {}
          bot.game.gameMode = 'survival'

          // Test 1: No water at eye level -> normal dig speed
          bot.entity.position = playerPos
          const block1 = bot.blockAt(blockPos)
          const digTimeNoWater = bot.digTime(block1)

          // Test 2: Water at eye level -> slower dig speed
          bot.entity.position = playerPos2
          const block2 = bot.blockAt(blockPos2)
          const digTimeWithWater = bot.digTime(block2)

          // Digging in water should be slower (higher dig time)
          assert(digTimeWithWater > digTimeNoWater,
            `Dig time with water at eye level (${digTimeWithWater}) should be greater than without (${digTimeNoWater})`)

          // Test 3: isInWater=true but no water block at eye level should NOT slow digging
          // (this is the bug that was fixed - previously isInWater incorrectly affected dig speed)
          bot.entity.position = playerPos
          bot.entity.isInWater = true
          const digTimeFeetInWater = bot.digTime(block1)
          assert.strictEqual(digTimeFeetInWater, digTimeNoWater,
            'isInWater should not affect dig time when eye level is not in water')

          done()
        })
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          const chunk = bot.test.buildChunk()
          // Place dirt blocks to dig at two locations
          chunk.setBlockType(blockPos, dirtId)
          chunk.setBlockType(blockPos2, dirtId)
          // Place water only at the second eye-level position
          chunk.setBlockType(eyeLevelBlockPos2, waterId)
          client.write('map_chunk', generateChunkPacket(chunk))
        })
      })
    })

    describe('physics', () => {
      const pos = vec3(1, 65, 1)
      const goldId = 41
      it('no physics if there is no chunk', (done) => {
        let fail = 0
        const basePosition = {
          x: 1.5,
          y: 66,
          z: 1.5,
          dx: 0, // 1.21.3
          dy: 0, // 1.21.3
          dz: 0, // 1.21.3
          pitch: 0,
          yaw: 0,
          flags: bot.registry.version['>=']('1.21.3') ? {} : 0,
          teleportId: 0
        }
        server.on('playerJoin', async (client) => {
          await client.write('login', bot.test.generateLoginPacket())
          await client.write('position', basePosition)
          client.on('packet', (data, meta) => {
            const packetName = meta.name
            switch (packetName) {
              case 'position':
                fail++
                break
              case 'position_look':
                fail++
                break
              case 'look':
                fail++
                break
            }
            if (fail > 1) assert.fail('position packet sent')
          })
          await sleep(2000)
          done()
        })
      })
      it('absolute position & relative position (velocity)', (done) => {
        // forcedMove fires when the teleport is answered at the start of a physics tick, so the state
        // it produces has to be read then; awaiting the event resumes after that tick's simulation.
        const onForcedMove = () => new Promise(resolve => {
          bot.once('forcedMove', () => resolve({ velocity: bot.entity.velocity.clone(), position: bot.entity.position.clone() }))
        })
        server.on('playerJoin', async (client) => {
          try {
            await client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(pos, goldId)
            await client.write('map_chunk', generateChunkPacket(chunk))

            await once(bot, 'chunkColumnLoad')

            // --- Test 1: Absolute Position ---
            const absolutePositionPacket = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0
            }

            bot.entity.velocity.y = -1.0 // Give bot some velocity

            const p1 = onForcedMove()
            client.write('position', absolutePositionPacket)
            const afterAbsolute = await p1

            // Assertions for absolute teleport
            assert.strictEqual(afterAbsolute.velocity.y, 0, 'Velocity should be reset to 0 after an absolute teleport')
            assert.deepStrictEqual(afterAbsolute.position, vec3(1.5, 80, 1.5), 'Position should be set absolutely')

            // --- Test 2: Relative Position ---
            // (from 1.21.2 the velocity has flags of its own)
            const relativePositionPacket = {
              x: 1.0,
              y: -2.0,
              z: 0.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 2,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: true, y: true, z: true, yaw: false, pitch: false, dx: true, dy: true, dz: true } : 7
            }

            // Set a known velocity *before* the relative update
            bot.entity.velocity.y = -1.0
            const initialPosition = bot.entity.position.clone()
            const expectedPosition = initialPosition.plus(vec3(1.0, -2.0, 0.5))

            const p2 = onForcedMove()
            client.write('position', relativePositionPacket)
            const afterRelative = await p2

            // Assertions for relative teleport
            assert.notStrictEqual(afterRelative.velocity.y, 0, 'Velocity should be preserved after a relative teleport')
            assert.deepStrictEqual(afterRelative.position, expectedPosition, 'Position should be updated relatively')

            done()
          } catch (err) {
            done(err)
          }
        })
      })
      // From 1.21.2 a teleport sets the velocity it carries, adds the player's along the axes it flags (dx, dy, dz),
      // turned first by the teleport's turn when it flags yawDelta (PositionMoveRotation.calculateAbsolute)
      it('sets the velocity a teleport carries', function (done) {
        if (!bot.registry.version['>=']('1.21.2')) return this.skip()
        // the velocity just before and just after the bot handles the teleport
        const teleport = (client, teleportId, yaw, dy, flags) => new Promise(resolve => {
          let before
          bot._client.prependOnceListener('position', () => { before = bot.entity.velocity.clone() })
          bot._client.once('position', () => resolve([before, bot.entity.velocity.clone()]))
          client.write('position', {
            x: 1.5,
            y: 80,
            z: 1.5,
            dx: teleportId === 0 ? 0.1 : 0,
            dy,
            dz: teleportId === 0 ? 0.3 : 0,
            pitch: 0,
            yaw,
            teleportId,
            flags: { x: false, y: false, z: false, yaw: false, pitch: false, dx: false, dy: false, dz: false, yawDelta: false, ...flags }
          })
        })
        server.on('playerJoin', async (client) => {
          try {
            await client.write('login', bot.test.generateLoginPacket())
            await client.write('map_chunk', generateChunkPacket(bot.test.buildChunk()))
            await once(bot, 'chunkColumnLoad')

            let [before, after] = await teleport(client, 0, 0, 0.2, {})
            assert.deepStrictEqual(after, vec3(0.1, 0.2, 0.3))
            for (let i = 0; i < 2; i++) await once(bot, 'physicsTick')

            ;[before, after] = await teleport(client, 1, 0, -0.05, { dx: true, dy: true, dz: true })
            assert.deepStrictEqual(after, vec3(before.x + 0, before.y - 0.05, before.z + 0))

            // facing south, the player turns to face west: what it moved south it moves west, what it moved east south
            ;[before, after] = await teleport(client, 2, 90, 0, { dx: true, dy: true, dz: true, yawDelta: true })
            assert.deepStrictEqual(after, vec3(-before.z + 0, before.y + 0, before.x + 0))
            done()
          } catch (err) {
            done(err)
          }
        })
      })
      it('drops the tick backlog after an event-loop stall instead of draining it', (done) => {
        server.on('playerJoin', async (client) => {
          client.write('login', bot.test.generateLoginPacket())
          const chunk = bot.test.buildChunk()
          chunk.setBlockType(pos, goldId)
          await client.write('map_chunk', generateChunkPacket(chunk))
          await client.write('position', {
            x: 1.5,
            y: 66,
            z: 1.5,
            dx: 0,
            dy: 0,
            dz: 0,
            pitch: 0,
            yaw: 0,
            teleportId: 1,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0
          })
          await once(bot, 'physicsTick')
          await sleep(300)
          // No physics tick can run during the stall (30 ticks' worth).
          const stallUntil = Date.now() + 1500
          while (Date.now() < stallUntil) { /* busy wait */ }
          let ticks = 0
          const count = () => ticks++
          bot.on('physicsTick', count)
          await sleep(500)
          bot.off('physicsTick', count)
          // 10 ticks at 20 tps plus one burst of at most maxCatchupTicks (4).
          assert.ok(ticks <= 18, `${ticks} physics ticks in the 500 ms after a 1.5 s stall`)
          assert.ok(ticks >= 8, `only ${ticks} physics ticks in 500 ms`)
          done()
        })
      })
      it('answers only the latest teleport when a second one lands inside the respawn reply delay', (done) => {
        // After a death the reply to the next teleport waits 1.5 s. A teleport that arrives inside
        // that window replaces it: the deferred reply must not go out with the older coordinates.
        const teleport = (teleportId, x, y, z) => ({
          x,
          y,
          z,
          dx: 0,
          dy: 0,
          dz: 0,
          pitch: 0,
          yaw: 0,
          flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0,
          teleportId
        })
        server.on('playerJoin', async (client) => {
          try {
            await client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(pos, goldId)
            await client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const replies = []
            client.on('packet', (data, meta) => {
              if (meta.name === 'position_look') replies.push([data.x, data.y, data.z])
            })
            await client.write('position', teleport(0, 1.5, 80, 1.5))
            while (replies.length === 0) await once(client, 'packet')
            replies.length = 0

            bot.emit('death')
            await client.write('position', teleport(1, 3.5, 80, 3.5))
            await sleep(100)
            await client.write('position', teleport(2, 1.5, 66, 1.5))
            // Outlive the 1.5 s reply delay.
            await sleep(1700)

            assert.deepStrictEqual(replies, [[1.5, 66, 1.5]], `teleport replies: ${JSON.stringify(replies)}`)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
      it('gravity + land on solid block + jump', (done) => {
        let y = 80
        let landed = false
        bot.on('move', () => {
          if (landed) return
          assert.ok(bot.entity.position.y <= y)
          assert.ok(bot.entity.position.y >= pos.y)
          y = bot.entity.position.y
          if (bot.entity.position.y <= pos.y + 1) {
            assert.strictEqual(bot.entity.position.y, pos.y + 1)
            assert.strictEqual(bot.entity.onGround, true)
            landed = true
            done()
          } else {
            assert.strictEqual(bot.entity.onGround, false)
          }
        })
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          const chunk = bot.test.buildChunk()

          chunk.setBlockType(pos, goldId)
          client.write('map_chunk', generateChunkPacket(chunk))
          client.write('position', {
            x: 1.5,
            y: 80,
            z: 1.5,
            dx: 0,
            dy: 0,
            dz: 0,
            pitch: 0,
            yaw: 0,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 0
          })
        })
      })
      it('no movement packets during a server transfer configuration phase', function (done) {
        // Regression test for https://github.com/PrismarineJS/mineflayer/issues/3776
        // While the client is in the configuration phase (Velocity/BungeeCord server
        // transfer), sending play-state movement packets gets the bot kicked.
        // NOTE: the mock server's client.on('packet') cannot be used here, because
        // the server-side mock connection stays in the play state while only the
        // bot's client transitions to configuration — outbound movement packets then
        // fail to deserialize on the mock server and are silently dropped. Intercept
        // the bot's own client.write() instead, which directly captures what the bot
        // attempts to send, whatever the state.
        if (!bot.supportFeature('hasConfigurationState')) {
          this.skip()
          return
        }
        const positionPacket = {
          x: 1.5,
          y: 80,
          z: 1.5,
          dx: 0,
          dy: 0,
          dz: 0,
          pitch: 0,
          yaw: 0,
          flags: bot.registry.version['>=']('1.21.3') ? {} : 0,
          teleportId: 0
        }
        const movementPackets = ['position', 'position_look', 'look', 'flying']
        let phase = 'play'
        let movementDuringConfig = 0
        server.on('playerJoin', async (client) => {
          const originalWrite = bot._client.write.bind(bot._client)
          bot._client.write = (name, params) => {
            if (phase === 'configuration' && movementPackets.includes(name)) {
              movementDuringConfig++
            }
            return originalWrite(name, params)
          }

          await client.write('login', bot.test.generateLoginPacket())
          const chunk = bot.test.buildChunk()
          chunk.setBlockType(pos, goldId)
          await client.write('map_chunk', generateChunkPacket(chunk))
          await once(bot, 'chunkColumnLoad')
          // The initial position enables physics and movement packets
          const p1 = once(bot, 'forcedMove')
          await client.write('position', positionPacket)
          await p1

          // Wait until the in-flight teleport response has been sent so it is
          // not miscounted, then have the proxy pull the client back into the
          // configuration phase.
          await sleep(100)
          await client.write('start_configuration', {})
          // Confirm the client state actually flipped before observing.
          if (bot._client.state !== 'configuration') {
            await once(bot._client, 'state')
          }
          phase = 'configuration'
          await sleep(500)
          phase = 'play'

          assert.strictEqual(movementDuringConfig, 0,
            `physics loop sent ${movementDuringConfig} movement packet(s) during configuration phase`)
          done()
        })
      })

      it('cancels the delayed respawn teleport reply when a transfer lands inside its delay', function (done) {
        // After a death the reply to the respawn teleport is deferred 1.5 s. A proxy transfer that
        // starts inside that window must not make the timer write a play packet in the
        // configuration state.
        if (!bot.supportFeature('hasConfigurationState')) {
          this.skip()
          return
        }
        const positionPacket = {
          x: 1.5,
          y: 80,
          z: 1.5,
          dx: 0,
          dy: 0,
          dz: 0,
          pitch: 0,
          yaw: 0,
          flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0,
          teleportId: 0
        }
        const movementPackets = ['position', 'position_look', 'look', 'flying']
        const sent = []
        server.on('playerJoin', async (client) => {
          try {
            const originalWrite = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (movementPackets.includes(name)) sent.push(`${name} in ${bot._client.state}`)
              return originalWrite(name, params)
            }

            await client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(pos, goldId)
            await client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const p1 = once(bot, 'forcedMove')
            await client.write('position', positionPacket)
            await p1

            bot.emit('death')
            sent.length = 0
            await client.write('position', { ...positionPacket, teleportId: 1 })
            await sleep(100)
            await client.write('start_configuration', {})
            if (bot._client.state !== 'configuration') {
              await once(bot._client, 'state')
            }
            // Outlive the 1.5 s reply delay.
            await sleep(1700)

            assert.deepStrictEqual(sent, [], `movement packets written after the transfer began: ${sent.join(', ')}`)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
      it('accepts a configuration-phase resource pack with the real UUID bytes', function () {
        // The accept must carry the pack's real UUID bytes; a uuid-1345 object serializes to
        // 16 zero bytes.
        // The mock server never reaches the configuration phase, so the plugin is driven directly.
        if (!registry.supportFeature('resourcePackUsesUUID')) {
          this.skip()
          return
        }
        const packUuid = '8ef4746b-93b7-3c32-9dcb-b375016c114d'
        const expectedBytes = Buffer.from(packUuid.replace(/-/g, ''), 'hex')
        const serializer = mc.createSerializer({ state: 'configuration', isServer: false, version: supportedVersion })

        const client = new EventEmitter()
        client.state = 'configuration'
        const writes = []
        client.write = (name, params) => { writes.push({ name, params }) }
        const fakeBot = new EventEmitter()
        fakeBot._client = client
        fakeBot.supportFeature = registry.supportFeature.bind(registry)
        require('../lib/plugins/resource_pack')(fakeBot)

        client.emit('add_resource_pack', {
          uuid: packUuid,
          url: 'https://example.invalid/pack.zip',
          hash: '88b406352dc8a335b1050a4bf9577a878c812012',
          forced: false
        })

        const accept = writes.find((w) => w.name === 'resource_pack_receive')
        assert(accept, 'bot should answer the pack during the configuration phase')
        const buf = serializer.createPacketBuffer({ name: accept.name, params: accept.params })
        assert(buf.includes(expectedBytes),
          'resource_pack_receive must carry the pack UUID bytes, not a zero UUID')
      })
    })

    describe('tick_end', () => {
      const basePosition = () => ({
        x: 1.5,
        y: 66,
        z: 1.5,
        dx: 0,
        dy: 0,
        dz: 0,
        pitch: 0,
        yaw: 0,
        teleportId: 0,
        flags: bot.registry.version['>=']('1.21.3') ? {} : 0
      })
      it('ends every tick with tick_end on 1.21.2+', function (done) {
        if (!bot.supportFeature('sendsClientTickEndPacket')) return this.skip()
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          client.write('position', basePosition())
          let ticks = 0
          client.on('tick_end', () => { if (++ticks === 5) done() })
        })
      })
    })

    describe('player_input', () => {
      // LocalPlayer.tick: after the physics step, a player_input with every movement key whenever they changed, first in
      // the tick: before its movement packet and its tick_end
      it('sends the movement keys whenever they change on 1.21.2+', function (done) {
        if (!bot.supportFeature('newPlayerInputPacket')) return this.skip()
        const held = inputs => Object.keys(inputs).filter(key => key !== '_value' && inputs[key]).sort()
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const sent = []
            client.on('packet', (data, meta) => {
              if (meta.name === 'player_input' || meta.name === 'tick_end' || movement.includes(meta.name)) sent.push({ name: meta.name, data })
            })
            // a few ticks, and the time for their packets to reach the server
            const ticks = async () => { await bot.waitForTicks(3); await sleep(100) }
            bot.setControlState('forward', true)
            bot.setControlState('sprint', true)
            await ticks()
            bot.setControlState('left', true)
            bot.setControlState('jump', true)
            await ticks()
            bot.clearControlStates()
            await ticks()

            const inputs = sent.filter(p => p.name === 'player_input')
            assert.deepStrictEqual(inputs.map(p => held(p.data.inputs)), [['forward', 'sprint'], ['forward', 'jump', 'left', 'sprint'], []])
            for (const input of inputs) {
              const i = sent.indexOf(input)
              assert.ok(i === 0 || sent[i - 1].name === 'tick_end', 'player_input comes first in its tick')
              const tickEnd = sent.findIndex((p, j) => j > i && p.name === 'tick_end')
              assert.ok(tickEnd > i, 'the tick ends after its player_input')
              assert.ok(sent.slice(i + 1, tickEnd).every(p => p.name !== 'player_input'), 'one player_input per change')
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // LocalPlayer.tick while a passenger: the look every tick and, up to 1.21.1, steer_vehicle after it (the impulses
      // times 0.98F, sneaking times 0.3F first up to 1.20.1; jump and sneak flags), with no sneak command
      // Entity.rideTick: a passenger ticks from no motion with its own input, as in the air, and stays where its vehicle
      // puts it
      it('moves a rider by its own input from no motion, where it sits', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', { x: 1.5, y: 80, z: 1.5, dx: 0, dy: 0, dz: 0, pitch: 0, yaw: 0, teleportId: 1, flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0 })
            await once(bot, 'forcedMove')
            // as the entities plugin does when the server seats the bot
            bot.vehicle = { id: 1 }
            bot.emit('mount')
            bot.entity.velocity.set(0.3, 0.2, 0)
            const seat = bot.entity.position.clone()
            bot.setControlState('forward', true)
            await sleep(150)
            bot.clearControlStates()
            const f = Math.fround
            // 0.02 times the forward impulse, slowed by 0.91; falling from no motion
            assert.ok(Math.abs(bot.entity.velocity.z - f(0.02) * f(0.98) * f(0.91)) < 1e-9, `${bot.entity.velocity.z}`)
            assert.strictEqual(bot.entity.velocity.x, 0)
            assert.strictEqual(bot.entity.velocity.y, -0.0784000015258789)
            assert.deepStrictEqual(bot.entity.position, seat)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('sends a rider\'s look and keys every tick', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            await sleep(150)
            // as the entities plugin does when the server seats the bot
            bot.vehicle = { id: 1 }
            bot.emit('mount')
            const sent = []
            client.on('packet', (data, meta) => { if (!['keep_alive', 'tick_end'].includes(meta.name)) sent.push({ name: meta.name, data }) })
            bot.setControlState('forward', true)
            bot.setControlState('sneak', true)
            await sleep(300)
            bot.clearControlStates()
            const names = sent.map(p => p.name)
            assert.ok(names.filter(n => n === 'look').length >= 3, 'a look every tick')
            if (bot.supportFeature('newPlayerInputPacket')) {
              assert.strictEqual(names.filter(n => n === 'player_input').length, 1)
              assert.ok(!names.includes('steer_vehicle'))
            } else {
              assert.ok(!names.includes('entity_action'), 'no sneak command')
              const f = Math.fround
              const forward = bot.registry.version['<']('1.20.2') ? f(f(0.3) * f(0.98)) : f(0.98)
              const steers = sent.filter(p => p.name === 'steer_vehicle')
              assert.ok(steers.length >= 3, 'steer_vehicle every tick')
              assert.deepStrictEqual([steers[0].data.sideways, steers[0].data.forward, steers[0].data.jump], [0, forward, 2])
              assert.strictEqual(names[names.indexOf('steer_vehicle') - 1], 'look', 'the look comes first')
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // moveVehicle and dismount go through the rider's keys, which the next ticks send
      it('steers and dismounts through the rider\'s keys', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            await sleep(150)
            bot.vehicle = { id: 1 }
            bot.emit('mount')
            const steers = []
            const inputs = []
            client.on('steer_vehicle', packet => steers.push(packet))
            client.on('player_input', packet => inputs.push(packet.inputs))
            bot.moveVehicle(1, 1)
            await sleep(250)
            bot.dismount()
            await sleep(150)
            if (bot.supportFeature('newPlayerInputPacket')) {
              assert.ok(inputs.some(i => i.forward && i.left && !i.shift), 'steering')
              assert.ok(inputs[inputs.length - 1].shift, 'dismounting')
            } else {
              const f = Math.fround
              const held = steers.filter(p => p.sideways === f(0.98) && p.forward === f(0.98))
              assert.ok(held.length >= 2, 'the steering is held')
              assert.strictEqual(steers[steers.length - 1].jump & 2, 2, 'dismounting')
            }
            bot.clearControlStates()
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('sends a rider\'s keys too', function (done) {
        if (!bot.supportFeature('newPlayerInputPacket')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const inputs = []
            client.on('player_input', packet => inputs.push(packet.inputs.shift))
            // as the entities plugin does when the server seats the bot (no physics ticks while riding)
            bot.vehicle = { id: 1 }
            bot.emit('mount')
            bot.setControlState('sneak', true)
            await sleep(300)
            assert.deepStrictEqual(inputs, [true])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('sprint command', () => {
      // LocalPlayer.sendIsSprintingIfNeeded: start_sprinting / stop_sprinting when the player's sprint state changed,
      // first in the tick's movement packets. The sprint state is the physics' (entity.isSprinting).
      function physicsReportsSprinting () {
        const { PlayerState } = require('prismarine-physics')
        const fake = {
          registry: bot.registry,
          version: bot.version,
          entity: { position: vec3(0, 0, 0), velocity: vec3(0, 0, 0), yaw: 0, pitch: 0, effects: {} },
          inventory: { slots: [] },
          jumpTicks: 0,
          jumpQueued: false,
          fireworkRocketDuration: 0
        }
        return 'isSprinting' in new PlayerState(fake, {})
      }

      it('tells the server when the player starts and stops sprinting', function (done) {
        if (!physicsReportsSprinting()) return this.skip()
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const sent = []
            client.on('packet', (data, meta) => {
              if (meta.name === 'entity_action' || movement.includes(meta.name)) sent.push({ name: meta.name, action: data.actionId })
            })
            const sprintCommands = () => sent.filter(p => p.name === 'entity_action').map(p => p.action)
            // a few ticks, and the time for their packets to reach the server
            const ticks = async () => { await bot.waitForTicks(3); await sleep(100) }

            bot.setControlState('sprint', true) // no forward input: no sprint
            await ticks()
            assert.deepStrictEqual(sprintCommands(), [])
            bot.setControlState('forward', true)
            await ticks()
            assert.deepStrictEqual(sprintCommands(), ['start_sprinting'])
            const start = sent.findIndex(p => p.name === 'entity_action')
            assert.ok(movement.includes(sent[start + 1]?.name), 'the sprint command comes right before a movement packet')
            bot.setControlState('forward', false) // a sprint stops without forward input
            await ticks()
            assert.deepStrictEqual(sprintCommands(), ['start_sprinting', 'stop_sprinting'])
            bot.setControlState('sprint', false)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('sneak command', () => {
      // LocalPlayer sends the sneak key's state on the tick, when it changed: up to 1.21.1 after the sprint command in
      // sendPosition, on 1.21.2 to 1.21.5 before player_input (sendShiftKeyState); from 1.21.6 player_input alone carries it
      it('tells the server about the sneak key on the tick, when it changed', function (done) {
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const sent = []
            client.on('packet', (data, meta) => {
              if (meta.name === 'entity_action' || meta.name === 'player_input' || movement.includes(meta.name)) sent.push({ name: meta.name, action: data.actionId })
            })
            const commands = () => sent.filter(p => p.name === 'entity_action').map(p => p.action)
            // a few ticks, and the time for their packets to reach the server
            const ticks = async () => { await bot.waitForTicks(3); await sleep(100) }

            bot.setControlState('sneak', true) // pressed and released between two ticks: nothing to tell
            bot.setControlState('sneak', false)
            await ticks()
            assert.deepStrictEqual(commands(), [])
            bot.setControlState('sneak', true)
            await ticks()
            if (!bot.supportFeature('sneakUsesEntityAction')) {
              assert.deepStrictEqual(commands(), [])
            } else {
              assert.deepStrictEqual(commands(), ['start_sneaking'])
              const command = sent.findIndex(p => p.name === 'entity_action')
              const next = sent[command + 1]?.name
              if (bot.supportFeature('newPlayerInputPacket')) assert.strictEqual(next, 'player_input')
              else assert.ok(movement.includes(next), 'the sneak command comes right before a movement packet')
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('sends the sneak command after the sprint command up to 1.21.1', function (done) {
        if (bot.supportFeature('newPlayerInputPacket')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const commands = []
            client.on('entity_action', packet => commands.push(packet.actionId))
            // the sprint state and the sneak key change in the same tick (the physics off, so the sprint state stays as set)
            bot.physicsEnabled = false
            bot.entity.isSprinting = true
            bot.setControlState('sneak', true)
            await sleep(300) // no physicsTick events with the physics off
            assert.deepStrictEqual(commands.slice(0, 2), ['start_sprinting', 'start_sneaking'])
            bot.clearControlStates()
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('movement packets', () => {
      // LocalPlayer.sendPosition sends the position only after a move whose squared length is over 9.0E-4 (0.03 blocks)
      // up to 1.18.1, over (2.0E-4)² from 1.18.2
      it('sends the position only after a move as long as vanilla needs', function (done) {
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            bot.physicsEnabled = false // the bot stays where it is put (no physicsTick events from here)
            await sleep(150)
            const sent = []
            client.on('packet', (data, meta) => { if (movement.includes(meta.name)) sent.push(meta.name) })
            const positions = () => sent.filter(name => name === 'position' || name === 'position_look').length
            const ticks = async () => { await sleep(200) }

            bot.entity.position = bot.entity.position.offset(0.0001, 0, 0)
            await ticks()
            assert.strictEqual(positions(), 0, 'a move of 0.0001')
            bot.entity.position = bot.entity.position.offset(0.02, 0, 0)
            await ticks()
            assert.strictEqual(positions(), bot.registry.version['>=']('1.18.2') ? 1 : 0, 'a move of 0.02')
            bot.entity.position = bot.entity.position.offset(0.05, 0, 0)
            await ticks()
            assert.strictEqual(positions(), bot.registry.version['>=']('1.18.2') ? 2 : 1, 'a move of 0.05')
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('horizontal collision flag', () => {
      // From 1.21.2 every movement packet carries the horizontal collision next to the ground flag, and a change of it
      // alone sends the ground-only packet (LocalPlayer.sendPosition, lastHorizontalCollision)
      it('tells the server about a horizontal collision from 1.21.2', function (done) {
        const sends = bot.registry.version['>=']('1.21.2')
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            bot.physicsEnabled = false // the bot stays as it is set (no physicsTick events from here)
            await sleep(150)
            const sent = []
            client.on('packet', (data, meta) => { if (movement.includes(meta.name)) sent.push({ name: meta.name, data }) })
            const ticks = async () => { await sleep(200) }

            bot.entity.isCollidedHorizontally = true
            bot.entity.position = bot.entity.position.offset(0.1, 0, 0)
            await ticks()
            const moved = sent.find(p => p.name === 'position')
            assert.ok(moved, 'the move is sent')
            if (sends) assert.strictEqual(moved.data.flags.hasHorizontalCollision, true)
            sent.length = 0
            bot.entity.isCollidedHorizontally = false // the collision ends without a move
            await ticks()
            const flying = sent.filter(p => p.name === 'flying')
            if (sends) {
              assert.strictEqual(flying.length, 1, 'one ground-only packet')
              assert.strictEqual(flying[0].data.flags.hasHorizontalCollision, false)
            } else if (!bot.supportFeature('positionUpdateSentEveryTick')) {
              assert.strictEqual(flying.length, 0)
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('ground-only packet', () => {
      // When nothing else is due, the 1.8 client sends the ground-only movement packet every tick; from 1.9 only when the
      // ground flag changed (LocalPlayer.sendPosition)
      it('sends the ground-only packet every tick only on 1.8', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            bot.physicsEnabled = false // the bot stays as it is (no physicsTick events from here)
            await sleep(150)
            let flying = 0
            client.on('flying', () => { flying++ })
            await sleep(300) // about 6 ticks, well inside the position reminder's 20
            if (bot.registry.version['<']('1.9')) assert.ok(flying >= 3, `${flying} ground-only packets`)
            else assert.strictEqual(flying, 0)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('position reminder', () => {
      // LocalPlayer.positionReminder counts the ticks since the position was last sent and sends it again at 20: counted
      // before the check from 1.9 (every 20 ticks), after it on 1.8 (every 21)
      it('sends the position again every 20 ticks (21 on 1.8)', function (done) {
        this.timeout(10000)
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // the bot stands on this block
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            let tick = 0
            bot.on('physicsTick', () => { tick++ })
            const sentAt = []
            const write = bot._client.write
            bot._client.write = function (name, params) {
              if (name === 'position' || name === 'position_look') sentAt.push(tick)
              return write.call(this, name, params)
            }
            while (sentAt.length < 3) await bot.waitForTicks(1)
            bot._client.write = write
            const period = bot.registry.version['<']('1.9') ? 21 : 20
            assert.deepStrictEqual([sentAt[2] - sentAt[1]], [period])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('continuous yaw', () => {
      // The client sends its yRot as it is, never wrapped: from a teleport to 270, a turn of 10 is sent as 280
      it('sends the yaw on from the teleport\'s, without wrapping it', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 270,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            await bot.waitForTicks(2) // the teleport answer goes out first
            await sleep(100)
            const yaws = []
            client.on('packet', (data, meta) => { if (meta.name === 'look' || meta.name === 'position_look') yaws.push(data.yaw) })
            bot.entity.yaw = require('../lib/conversions').fromNotchianYaw(280)
            await bot.waitForTicks(2)
            await sleep(100)
            assert.ok(yaws.length > 0, 'a look was sent')
            assert.ok(Math.abs(yaws[yaws.length - 1] - 280) < 1e-3, `the yaw is ${yaws[yaws.length - 1]}`)
            // a teleport that turns the look by 10 from there: the client answers 290, its yRot plus 10
            const answers = []
            client.on('packet', (data, meta) => { if (meta.name === 'position_look') answers.push(data.yaw) })
            client.write('position', {
              x: 0,
              y: 0,
              z: 0,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 10,
              teleportId: 2,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: true, y: true, z: true, yaw: true, pitch: true } : 0x1f
            })
            await once(bot, 'forcedMove')
            await bot.waitForTicks(2)
            await sleep(100)
            assert.ok(answers.length > 0, 'the teleport was answered')
            assert.ok(Math.abs(answers[0] - 290) < 1e-3, `the answer's yaw is ${answers[0]}`)
            // the entity keeps the same yaw for the physics (bot.entity.yRot)
            assert.ok(Math.abs(bot.entity.yRot - 290) < 1e-3, `the entity's yRot is ${bot.entity.yRot}`)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('elytra command', () => {
      // LocalPlayer.aiStep sends start_fall_flying when a press of jump in the air with an elytra asks to glide, before
      // the tick's movement packets. The physics decide when (PlayerState.fallFlyingRequested).
      function physicsRequestsGliding () {
        const { PlayerState } = require('prismarine-physics')
        const fake = {
          registry: bot.registry,
          version: bot.version,
          entity: { position: vec3(0, 0, 0), velocity: vec3(0, 0, 0), yaw: 0, pitch: 0, effects: {} },
          inventory: { slots: [] },
          jumpTicks: 0,
          jumpQueued: false,
          fireworkRocketDuration: 0
        }
        return 'fallFlyingRequested' in new PlayerState(fake, {})
      }

      it('asks the server to start gliding on a press of jump in the air', function (done) {
        if (!bot.registry.itemsByName.elytra || !physicsRequestsGliding()) return this.skip()
        const movement = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41) // an empty chunk does not load on every version
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              teleportId: 1,
              flags: bot.supportFeature('positionPacketHasBitflags') ? {} : 0
            })
            await once(bot, 'forcedMove')
            const Item = require('prismarine-item')(bot.registry)
            bot.inventory.updateSlot(bot.getEquipmentDestSlot('torso'), new Item(bot.registry.itemsByName.elytra.id, 1))
            const sent = []
            client.on('packet', (data, meta) => {
              if (meta.name === 'entity_action' || meta.name === 'player_input' || movement.includes(meta.name)) sent.push({ name: meta.name, action: data.actionId })
            })
            const commands = () => sent.filter(p => p.name === 'entity_action').map(p => p.action)
            // a few ticks, and the time for their packets to reach the server
            const ticks = async () => { await bot.waitForTicks(3); await sleep(100) }

            await ticks() // falling
            assert.deepStrictEqual(commands(), [])
            bot.setControlState('jump', true) // held from here: one press, one request
            await ticks()
            assert.deepStrictEqual(commands(), ['start_fall_flying'])
            const command = sent.findIndex(p => p.name === 'entity_action')
            const next = sent[command + 1]?.name
            if (bot.supportFeature('newPlayerInputPacket')) assert.strictEqual(next, 'player_input')
            else assert.ok(movement.includes(next), 'the command comes right before a movement packet')
            bot.clearControlStates()
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('world', () => {
      const pos = vec3(1, 65, 1)
      const goldId = 41
      it('switchWorld respawn', (done) => {
        const loginPacket = bot.test.generateLoginPacket()
        let respawnPacket
        if (bot.supportFeature('usesLoginPacket')) {
          loginPacket.worldName = 'minecraft:overworld'
          loginPacket.hashedSeed = [0, 0]
          loginPacket.entityId = 0
          respawnPacket = {
            // 1.19+ the `dimension` filed is a string in respawn packet and undefined in login packet, in previous versions it's same NBT data in login/respawn
            dimension: bot.supportFeature('dimensionDataInCodec') ? 'minecraft:overworld' : loginPacket.dimension,
            worldName: loginPacket.worldName,
            hashedSeed: loginPacket.hashedSeed,
            gamemode: 0,
            previousGamemode: 255,
            isDebug: false,
            isFlat: false,
            copyMetadata: true,
            death: {
              dimensionName: '',
              location: {
                x: 0,
                y: 0,
                z: 0
              }
            }
          }
          if (bot.supportFeature('spawnRespawnWorldDataField')) {
            respawnPacket = {
              worldState: respawnPacket
            }
            respawnPacket.worldState.name = loginPacket.worldName
            respawnPacket.worldState.dimension = loginPacket.dimension
          }
        } else {
          respawnPacket = {
            dimension: 0,
            hashedSeed: [0, 0],
            gamemode: 0,
            levelType: 'default'
          }
        }
        const chunk = bot.test.buildChunk()
        chunk.setBlockType(pos, goldId)
        const chunkPacket = generateChunkPacket(chunk)
        const positionPacket = {
          x: 1.5,
          y: 80,
          z: 1.5,
          pitch: 0,
          yaw: 0,
          flags: 0,
          teleportId: 0
        }
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          bot.once('respawn', () => {
            assert.ok(bot.world.getColumn(0, 0) !== undefined)
            bot.once('respawn', () => {
              assert.ok(bot.world.getColumn(0, 0) === undefined)
              done()
            })
            if (bot.supportFeature('spawnRespawnWorldDataField')) {
              respawnPacket.worldState.name = 'minecraft:nether'
            } else {
              respawnPacket.worldName = 'minecraft:nether'
            }
            if (bot.supportFeature('spawnRespawnWorldDataField')) {
              respawnPacket.worldState.dimension = 1
            } else if (bot.supportFeature('usesLoginPacket')) {
              respawnPacket.dimension.name = 'e'
            } else {
              respawnPacket.dimension = 1
            }
            client.write('respawn', respawnPacket)
          })
          await client.write('login', loginPacket)
          await client.write('map_chunk', chunkPacket)
          await client.write('position', positionPacket)
          await client.write('update_health', {
            health: 20,
            food: 20,
            foodSaturation: 0
          })
          await bot.waitForTicks(1)
          await client.write('respawn', respawnPacket)
        })
      })
    })

    describe('game', () => {
      it('responds to ping / transaction packets', (done) => { // only on 1.17
        server.on('playerJoin', async (client) => {
          if (bot.supportFeature('transactionPacketExists')) {
            const transactionPacket = { windowId: 0, action: 42, accepted: false }
            client.once('transaction', (data, meta) => {
              assert.ok(meta.name === 'transaction')
              assert.ok(data.action === 42)
              assert.ok(data.accepted === true)
              done()
            })
            client.write('transaction', transactionPacket)
          } else {
            client.once('pong', (data) => {
              assert(data.id === 42)
              done()
            })
            client.write('ping', { id: 42 })
          }
        })
      })

      it('window titles are ChatMessages whatever shape the server sends', async () => {
        const Item = require('prismarine-item')(registry)
        // A component title plus the bare-string form third-party servers send.
        const titles = registry.supportFeature('chatPacketsUseNbtComponents')
          ? [nbt.comp({ text: nbt.string('Test Chest') }), nbt.string('Test Chest')]
          : [JSON.stringify({ text: 'Test Chest' }), 'Test Chest']
        const chest = registry.supportFeature('village&pillageInventoryWindows')
          ? { inventoryType: 2 }
          : { inventoryType: 'minecraft:chest', slotCount: 27 }
        const [client] = await once(server, 'playerJoin')
        client.write('login', bot.test.generateLoginPacket())
        for (const [i, windowTitle] of titles.entries()) {
          const windowId = i + 1
          client.write('open_window', { windowId, windowTitle, ...chest })
          client.write('window_items', { windowId, stateId: 0, items: [], carriedItem: Item.toNotch(null) })
          const [window] = await once(bot, 'windowOpen')
          assert.strictEqual(window.id, windowId)
          assert.strictEqual(window.title.constructor.name, 'ChatMessage')
          assert.strictEqual(window.title.toString(), 'Test Chest')
        }
      })

      it('pong is written at the next tick boundary, after the movement packet of the tick that received the ping', function (done) {
        if (bot.supportFeature('transactionPacketExists')) {
          this.skip()
          return
        }
        const movementPackets = ['position', 'position_look', 'look', 'flying']
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), 41)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')

            // Falling takes a few ticks to leave the teleport height.
            await bot.waitForTicks(4)

            const seen = []
            client.on('packet', (data, meta) => seen.push({ name: meta.name, data }))

            // The ping is processed inside a tick: after the simulation, before
            // the movement packet carrying this tick's position.
            const { tickY, pingedAt } = await new Promise(resolve => {
              bot.once('physicsTick', () => {
                bot._client.emit('ping', { id: 123 })
                resolve({ tickY: bot.entity.position.y, pingedAt: Date.now() })
              })
            })
            assert.ok(tickY < 80, 'bot must be falling so every tick writes a movement packet')

            const [pong] = await onceWithCleanup(client, 'pong', { timeout: 200 })
            const pongedAt = Date.now()
            assert.strictEqual(pong.id, 123)
            assert.ok(pongedAt - pingedAt <= 200, `pong took ${pongedAt - pingedAt} ms`)

            await sleep(100)
            const pongs = seen.filter(p => p.name === 'pong')
            assert.strictEqual(pongs.length, 1, 'each ping is answered exactly once')
            const pongIndex = seen.indexOf(pongs[0])
            const before = seen.slice(0, pongIndex)
            // The pong is written at the tick boundary, after that tick's movement packet. On 1.21.2+ the tick also ends
            // with a tick_end packet, so tick_end (not the movement packet) is what immediately precedes the pong; only
            // tick_end may sit between the movement packet and the pong.
            const lastMovement = [...before].reverse().find(p => movementPackets.includes(p.name))
            assert.ok(lastMovement !== undefined, 'a movement packet precedes the pong')
            assert.strictEqual(lastMovement.data.y, tickY, 'the pong follows the movement packet of the tick that received the ping')
            const between = before.slice(before.lastIndexOf(lastMovement) + 1)
            assert.ok(between.every(p => p.name === 'tick_end'), `only tick_end may separate the movement packet from the pong, saw ${between.map(p => p.name).join(', ')}`)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('pong is written within one tick when physics is not ticking', function (done) {
        if (bot.supportFeature('transactionPacketExists')) {
          this.skip()
          return
        }
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            const pongs = []
            client.on('pong', (data) => pongs.push(data))
            const pingedAt = Date.now()
            client.write('ping', { id: 123 })
            const [pong] = await onceWithCleanup(client, 'pong', { timeout: 200 })
            const pongedAt = Date.now()
            assert.strictEqual(pong.id, 123)
            assert.ok(pongedAt - pingedAt <= 200, `pong took ${pongedAt - pingedAt} ms`)
            await sleep(100)
            assert.strictEqual(pongs.length, 1, 'each ping is answered exactly once')
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('closeWindow follows close_window with a no-op inventory click on pre-1.17 only', (done) => {
        server.on('playerJoin', (client) => {
          const clicks = []
          let closed = false
          client.on('packet', (data, meta) => {
            if (meta.name === 'close_window') closed = true
            if (meta.name !== 'window_click') return
            clicks.push(data)
            assert.ok(closed, 'the sync click must follow close_window')
            client.write('transaction', { windowId: data.windowId, action: data.action, accepted: true })
          })
          const loggedIn = once(bot, 'login')
          client.write('login', bot.test.generateLoginPacket())
          loggedIn
            .then(() => bot.closeWindow(bot.inventory))
            .then(() => sleep(100))
            .then(() => {
              if (bot.supportFeature('stateIdUsed')) {
                assert.strictEqual(clicks.length, 0)
              } else {
                assert.strictEqual(clicks.length, 1)
                assert.strictEqual(clicks[0].windowId, 0)
                assert.strictEqual(clicks[0].slot, -999)
                assert.strictEqual(clicks[0].mode, 0)
                assert.strictEqual(clicks[0].mouseButton, 0)
              }
            })
            .then(done, done)
        })
      })

      it('dimension type lookup uses worldType over worldName on 1.19-1.20.4', function (done) {
        // On proxy/modded servers the worldName (level name) may differ from
        // the dimension type. For versions with dimensionDataInCodec but
        // without segmentedRegistryCodecData (1.19-1.20.4), the bot should
        // prefer worldType (login) / dimension (respawn) for the codec lookup.
        if (!bot.supportFeature('dimensionDataInCodec') || bot.supportFeature('segmentedRegistryCodecData')) {
          this.skip()
          return
        }

        const loginPacket = bot.test.generateLoginPacket()
        // Simulate a proxy/modded server: worldName is a custom level name
        // but worldType is still the real dimension type
        loginPacket.worldName = 'modded:custom_world'
        loginPacket.worldType = 'minecraft:overworld'

        server.on('playerJoin', (client) => {
          client.write('login', loginPacket)
          bot.once('login', () => {
            assert.strictEqual(bot.game.dimension, 'overworld',
              'should use worldType for dimension, not worldName')
            assert.ok(bot.game.minY !== undefined,
              'minY should be set from codec lookup')
            assert.ok(bot.game.height !== undefined,
              'height should be set from codec lookup')
            done()
          })
        })
      })
    })

    describe('rain', () => {
      it('flips isRaining on rain level zero-crossings without start_raining', (done) => {
        // Vanilla 26.1 can bring rain in with only rain_level_change ramps,
        // never sending start_raining/stop_raining (observed on a quick
        // weather flip), so level crossings alone must drive isRaining.
        const mapped = JSON.stringify(registry.protocol.play.toClient.types.packet_game_state_change).includes('rain_level_change')
        const reason = mapped ? 'rain_level_change' : 7
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          // Plugins inject after a deferred inject_allowed, so bot state is
          // only readable once the bot has seen login.
          bot.once('login', () => {
            assert.strictEqual(bot.isRaining, false)
            bot.once('rain', () => {
              assert.strictEqual(bot.isRaining, true)
              bot.once('rain', () => {
                assert.strictEqual(bot.isRaining, false)
                assert.strictEqual(bot.rainState, 0)
                done()
              })
              client.write('game_state_change', { reason, gameMode: 0 })
            })
            client.write('game_state_change', { reason, gameMode: 0.01 })
            // A second wet level must not emit again: if it did, the inner
            // once would run with isRaining still true and fail the assert.
            client.write('game_state_change', { reason, gameMode: 0.5 })
          })
        })
      })
    })

    describe('block actions', () => {
      it('emits chestLidMove again once an open chest has been replaced', async () => {
        const pos = vec3(1, 65, 1)
        const chestId = bot.registry.blocksByName.chest.id
        const location = { x: pos.x, y: pos.y, z: pos.z }
        const [client] = await once(server, 'playerJoin')
        client.write('login', bot.test.generateLoginPacket())
        const chunk = bot.test.buildChunk()
        chunk.setBlockType(pos, chestId)
        client.write('map_chunk', generateChunkPacket(chunk))
        await once(bot, 'chunkColumnLoad')
        const chestStateId = bot.blockAt(pos).stateId

        const opened = onceWithCleanup(bot, 'chestLidMove', { timeout: 2000 })
        client.write('block_action', { location, byte1: 1, byte2: 1, blockId: chestId })
        await opened

        // Breaking the chest while it is open never yields a closing block
        // action, so the open count must not survive the block change.
        client.write('block_change', { location, type: 0 })
        client.write('block_change', { location, type: chestStateId })
        const reopened = onceWithCleanup(bot, 'chestLidMove', { timeout: 2000 })
        client.write('block_action', { location, byte1: 1, byte2: 1, blockId: chestId })
        const [block, isOpen] = await reopened
        assert.ok(block.position.equals(pos))
        assert.strictEqual(isOpen, 1)
      })
    })

    describe('abilities', () => {
      it('tracks what the server allows', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('abilities', (abilities) => {
            assert.strictEqual(abilities.invulnerable, true)
            assert.strictEqual(abilities.flying, true)
            assert.strictEqual(abilities.mayFly, true)
            assert.strictEqual(abilities.instantBuild, false)
            assert.strictEqual(abilities.flyingSpeed, 0.05000000074505806)
            assert.strictEqual(abilities.walkingSpeed, 0.10000000149011612)
            assert.strictEqual(bot.abilities, abilities)
            // prismarine-physics reads the flight state off the entity
            assert.strictEqual(bot.entity.flying, true)
            done()
          })
          client.write('login', bot.test.generateLoginPacket())
          bot.once('login', () => {
            // Abilities' own defaults hold until the server sends the packet
            assert.deepStrictEqual(bot.abilities, {
              invulnerable: false,
              flying: false,
              mayFly: false,
              instantBuild: false,
              flyingSpeed: 0.05,
              walkingSpeed: 0.1
            })
            client.write('abilities', { flags: 7, flyingSpeed: 0.05, walkingSpeed: 0.1 })
          })
        })
      })

      // LocalPlayer.aiStep: a second press of jump within 6 ticks toggles flight, and the client sends its abilities
      it('starts flying on a double press of jump and tells the server', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('abilities', { flags: 4 | 8, flyingSpeed: 0.05, walkingSpeed: 0.1 })
            await once(bot, 'abilities')
            client.write('position', {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            for (let i = 0; i < 3; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
            const sent = new Promise(resolve => client.once('abilities', resolve))
            for (const jump of [true, false, true]) {
              bot.setControlState('jump', jump)
              await new Promise(resolve => bot.once('physicsTick', resolve))
            }
            bot.setControlState('jump', false)
            const packet = await sent
            assert.strictEqual(packet.flags, bot.registry.version['<']('1.16') ? 2 | 4 | 8 : 2)
            assert.strictEqual(bot.abilities.flying, true)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // Entity.onSyncedDataUpdated: from 1.14 the bot takes the pose the server sets in its entity data
      it('takes the pose the server sets for the bot', function (done) {
        if (bot.registry.version['<']('1.14')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            const poseType = bot.registry.supportFeature('mcDataHasEntityMetadata') ? 'pose' : bot.supportFeature('entityMetadataHasLong') ? 19 : 18
            client.write('entity_metadata', { entityId: bot.entity.id, metadata: [{ key: 6, type: poseType, value: 5 }] })
            await once(bot._client, 'entity_metadata')
            assert.strictEqual(bot.entity.pose, 'crouching')
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // The client puts a sleeping player on its bed: up to 1.13 on the use_bed packet (EntityPlayer.trySleep, 0.4 towards
      // the head, motion stopped), from 1.14 on the sleeping position in its entity data (LivingEntity.setPosToBed). The
      // sleeping player has no input, and from 1.14 looks straight ahead after its tick.
      it('puts the sleeping bot on its bed', (done) => {
        const bedPos = vec3(3, 66, 1)
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            if (bot.registry.version['<']('1.13')) {
              chunk.setBlockType(bedPos, registry.blocksByName.bed.id)
              chunk.setBlockData(bedPos, 8 | 3) // the head, facing east
            } else {
              const Block = require('prismarine-block')(registry)
              chunk.setBlockStateId(bedPos, Block.fromProperties('red_bed', { facing: 'east', part: 'head', occupied: true }, 0).stateId)
            }
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', { x: 1.5, y: 66, z: 1.5, dx: 0, dy: 0, dz: 0, pitch: 0, yaw: 0, flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0, teleportId: 0 })
            await once(bot, 'forcedMove')
            bot.setControlState('forward', true)
            if (bot.registry.version['<']('1.14')) {
              client.write('bed', { entityId: bot.entity.id, location: bedPos })
              await once(bot._client, 'bed')
              assert.deepStrictEqual(bot.entity.position, vec3(3.9000000953674316, 66.6875, 1.5))
              assert.deepStrictEqual(bot.entity.velocity, vec3(0, 0, 0))
            } else {
              const named = bot.registry.supportFeature('mcDataHasEntityMetadata')
              const keys = bot.registry.entitiesByName.player.metadataKeys
              const sleepingPosKey = keys ? keys.indexOf('sleeping_pos') : bot.registry.version['<']('1.15') ? 12 : bot.registry.version['<']('1.17') ? 13 : 14
              client.write('entity_metadata', {
                entityId: bot.entity.id,
                metadata: [
                  { key: 6, type: named ? 'pose' : 18, value: 2 },
                  { key: sleepingPosKey, type: named ? 'optional_block_pos' : 10, value: bedPos }
                ]
              })
              await once(bot._client, 'entity_metadata')
              assert.deepStrictEqual(bot.entity.position, vec3(3.5, 66.6875, 1.5))
            }
            assert.strictEqual(bot.isSleeping, true)
            assert.strictEqual(bot.entity.pose, 'sleeping')
            // (up to 1.13 its motion was stopped, so it falls from the second tick)
            bot.entity.pitch = 0.5
            for (let i = 0; i < 2; i++) await once(bot, 'physicsTick')
            assert.strictEqual(bot.entity.position.x, bot.registry.version['<']('1.14') ? 3.9000000953674316 : 3.5)
            assert.ok(bot.entity.position.y < 66.6875, 'it falls onto the bed')
            assert.strictEqual(bot.entity.pitch, bot.registry.version['<']('1.14') ? 0.5 : 0)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // ClientPacketListener.handleMovePlayer moves the player and leaves it on the ground or off it; a new player (at
      // login and respawn) starts off it
      it('keeps the bot on the ground through a teleport', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            assert.strictEqual(bot.entity.onGround, false)
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')
            for (let i = 0; i < 3; i++) await once(bot, 'physicsTick')
            assert.strictEqual(bot.entity.onGround, true)
            client.write('position', { ...teleport, y: 66.0625, teleportId: 1 })
            await once(bot._client, 'position')
            assert.strictEqual(bot.entity.onGround, true)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // LocalPlayer.aiStep: the auto-jump option presses jump for a tick, and from 1.21.2 the keys sent show it
      it('sends jump pressed when the auto-jump option jumps', function (done) {
        if (!bot.supportFeature('newPlayerInputPacket')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            for (let x = 0; x < 6; x++) chunk.setBlockType(vec3(x, 65, 1), registry.blocksByName.stone.id)
            chunk.setBlockType(vec3(4, 66, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: -90,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            bot.physics.autoJump = true
            const jumped = new Promise(resolve => {
              const onInput = (packet) => { if (packet.inputs?.jump) { client.removeListener('player_input', onInput); resolve() } }
              client.on('player_input', onInput)
            })
            bot.setControlState('forward', true)
            await jumped
            bot.setControlState('forward', false)
            bot.physics.autoJump = false
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // PistonBaseBlock.triggerEvent: a piston extending into the bot pushes it out of the way, after its tick
      it('is pushed by an extending piston', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            for (let x = 0; x < 6; x++) chunk.setBlockType(vec3(x, 64, 1), registry.blocksByName.stone.id)
            chunk.setBlockType(vec3(0, 65, 1), registry.blocksByName.piston.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 65,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            client.write('block_action', { location: { x: 0, y: 65, z: 1 }, byte1: 0, byte2: 5, blockId: registry.blocksByName.piston.id })
            await once(bot, 'pistonMove')
            assert.deepStrictEqual(bot.movingPistons.map(piston => [piston.position.toString(), piston.direction]), [[vec3(1, 65, 1).toString(), 'east']])
            for (let i = 0; i < 3; i++) await once(bot, 'physicsTick')
            assert.ok(bot.entity.position.x > 2.2, `pushed east, at ${bot.entity.position.x}`)
            assert.deepStrictEqual(bot.movingPistons, [])
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // LivingEntity.aiStep: a dead player goes on moving with no input (isImmobile). LivingEntity.tickDeath: up to 1.16
      // the client removes it 20 ticks after death, from 1.17 only the server does
      it('keeps a dead bot moving with no input, up to 1.16 for 20 ticks', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 1, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 200,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            bot.setControlState('forward', true)
            client.write('update_health', { health: 0, food: 20, foodSaturation: 5 })
            await once(bot, 'death')
            const start = bot.entity.position.clone()
            let ticks = 0
            const onTick = () => { ticks++ }
            bot.on('physicsTick', onTick)
            await sleep(1500)
            bot.removeListener('physicsTick', onTick)
            bot.setControlState('forward', false)
            assert.ok(bot.entity.position.y < start.y, 'it falls')
            assert.strictEqual(bot.entity.position.z, start.z, 'with no input')
            if (bot.registry.version['<']('1.17')) assert.ok(ticks <= 20, `removed after 20 ticks, ticked ${ticks}`)
            else assert.ok(ticks > 20, `still ticking, ticked ${ticks}`)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // LocalPlayer.aiStep: a flyer that lands stops flying and sends its abilities
      it('ends flight on landing and tells the server', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('abilities', { flags: 2 | 4 | 8, flyingSpeed: 0.05, walkingSpeed: 0.1 })
            await once(bot, 'abilities')
            client.write('position', {
              x: 1.5,
              y: 67,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            for (let i = 0; i < 3; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
            assert.strictEqual(bot.entity.flying, true, 'hovering')
            const [sent] = await new Promise(resolve => {
              client.once('abilities', (...args) => resolve(args))
              bot.setControlState('sneak', true) // down to the ground
            })
            bot.setControlState('sneak', false)
            assert.strictEqual(sent.flags, bot.registry.version['<']('1.16') ? 4 | 8 : 0)
            if (bot.registry.version['<']('1.16')) {
              assert.strictEqual(sent.flyingSpeed, Math.fround(0.05))
              assert.strictEqual(sent.walkingSpeed, Math.fround(0.1))
            }
            assert.ok(bot.entity.onGround)
            assert.strictEqual(bot.entity.flying, false)
            assert.strictEqual(bot.abilities.flying, false)
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('entities', () => {
      it('entity id changes on login', (done) => {
        const loginPacket = bot.test.generateLoginPacket()
        server.on('playerJoin', (client) => {
          if (bot.supportFeature('usesLoginPacket')) {
            loginPacket.entityId = 0 // Default login packet in minecraft-data 1.16.5 is 1, so set it to 0
          }
          client.write('login', loginPacket)
          bot.once('login', () => {
            assert.ok(bot.entity.id === 0)
            loginPacket.entityId = 42
            bot.once('login', () => {
              assert.ok(bot.entity.id === 42)
              done()
            })
            client.write('login', loginPacket)
          })
        })
      })

      // LocalPlayer.onGameModeChanged: from 1.20 the player made a spectator stops falling
      it('stops the bot falling when the server makes it a spectator', function (done) {
        if (!registry.supportFeature('playerInfoActionIsBitfield')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            client.write('player_info', {
              action: { add_player: true, update_game_mode: true },
              data: [{ uuid: bot._client.uuid, player: { name: bot.username, properties: [] }, gamemode: 0 }]
            })
            await once(bot, 'playerJoined')
            bot.entity.velocity.y = -0.5
            client.write('player_info', { action: { update_game_mode: true }, data: [{ uuid: bot._client.uuid, gamemode: 3 }] })
            await once(bot._client, 'player_info')
            assert.strictEqual(bot.entity.velocity.y, bot.registry.version['>=']('1.20') ? 0 : -0.5)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // WorldBorder: the border the server sets, and a moving one's size by the wall clock
      it('keeps the world border the server sets', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            assert.strictEqual(bot.worldBorder, null)
            const own = bot.registry.version['>=']('1.17')
            const initialize = (oldDiameter, newDiameter, speed) => own
              ? client.write('initialize_world_border', { x: 8, z: -8, oldDiameter, newDiameter, speed, portalTeleportBoundary: 29999984, warningBlocks: 5, warningTime: 15 })
              : client.write('world_border', { action: 3, x: 8, z: -8, old_radius: oldDiameter, new_radius: newDiameter, speed, portalBoundary: 29999984, warning_time: 15, warning_blocks: 5 })
            initialize(10, 10, 0)
            await once(bot._client, own ? 'initialize_world_border' : 'world_border')
            assert.deepStrictEqual([bot.worldBorder.centerX, bot.worldBorder.centerZ, bot.worldBorder.size], [8, -8, 10])
            initialize(10, 20, 100000)
            await once(bot._client, own ? 'initialize_world_border' : 'world_border')
            assert.ok(bot.worldBorder.size >= 10 && bot.worldBorder.size < 10.5, `moving from 10, at ${bot.worldBorder.size}`)
            if (bot.registry.version['>=']('1.21.11')) {
              // from 1.21.11 the border moves a tick at a time: 10 of 20 ticks take it half way
              const chunk = bot.test.buildChunk()
              chunk.setBlockType(vec3(1, 65, 1), 41)
              client.write('map_chunk', generateChunkPacket(chunk))
              await once(bot, 'chunkColumnLoad')
              client.write('position', { x: 1.5, y: 80, z: 1.5, dx: 0, dy: 0, dz: 0, pitch: 0, yaw: 0, teleportId: 1, flags: {} })
              await once(bot, 'forcedMove')
              // (the size each tick sees, before the level's tick moves the border on)
              const sizes = []
              initialize(10, 20, 20)
              await once(bot._client, 'initialize_world_border')
              const seen = () => sizes.push(bot.worldBorder.size)
              bot.on('physicsTick', seen)
              while (sizes.length < 11) await once(bot, 'physicsTick')
              bot.removeListener('physicsTick', seen)
              assert.deepStrictEqual([sizes[0], sizes[10]], [10, 15])
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('player displayName', (done) => {
        server.on('playerJoin', (client) => {
          bot.on('entitySpawn', (entity) => {
            const player = bot.players[entity.username]
            assert.strictEqual(entity.username, player.displayName.toString())
            if (registry.supportFeature('playerInfoActionIsBitfield')) {
              client.write('player_info', {
                action: { update_display_name: true },
                data: [{
                  uuid: '1-2-3-4',
                  displayName: chatText('wvffle')
                }]
              })
            } else {
              client.write('player_info', {
                action: 'update_display_name',
                data: [{
                  uuid: '1-2-3-4',
                  displayName: chatText('wvffle')
                }]
              })
            }
          })

          bot.once('playerUpdated', (player) => {
            assert.strictEqual('wvffle', player.displayName.toString())
            if (registry.supportFeature('playerInfoActionIsBitfield')) {
              client.write('player_info', {
                action: { update_display_name: true },
                data: [{
                  uuid: '1-2-3-4',
                  displayName: null
                }]
              })
            } else {
              client.write('player_info', {
                action: 'update_display_name',
                data: [{
                  uuid: '1-2-3-4',
                  displayName: null
                }]
              })
            }

            bot.once('playerUpdated', (player) => {
              assert.strictEqual(player.entity.username, player.displayName.toString())
              done()
            })
          })

          if (registry.supportFeature('playerInfoActionIsBitfield')) {
            client.write('player_info', {
              action: { add_player: true },
              data: [{
                uuid: '1-2-3-4',
                player: {
                  name: 'bot5',
                  properties: []
                },
                gamemode: 0,
                latency: 0
              }]
            })
          } else {
            client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: '1-2-3-4',
                name: 'bot5',
                properties: [],
                gamemode: 0,
                ping: 0
              }]
            })
          }

          if (bot.registry.supportFeature('unifiedPlayerAndEntitySpawnPacket')) {
            client.write('spawn_entity', {
              entityId: 56,
              objectUUID: '1-2-3-4',
              type: bot.registry.entitiesByName.player.internalId,
              x: 1,
              y: 2,
              z: 3,
              pitch: 0,
              yaw: 0,
              headPitch: 0,
              objectData: 1,
              velocity: { x: 0, y: 0, z: 0 }
            })
          } else {
            client.write('named_entity_spawn', {
              entityId: 56,
              playerUUID: '1-2-3-4',
              x: 1,
              y: 2,
              z: 3,
              yaw: 0,
              pitch: 0,
              currentItem: -1,
              metadata: []
            })
          }
        })
      })

      it('does not crash when skin texture is mojangson format', (done) => {
        // Mojangson-style texture data (not valid JSON, but valid mojangson)
        const mojangsonStr = '{textures:{SKIN:{url:"http://textures.minecraft.net/texture/abc123",metadata:{model:"slim"}}}}'
        const mojangsonBase64 = Buffer.from(mojangsonStr).toString('base64')

        server.on('playerJoin', (client) => {
          bot.on('entitySpawn', (entity) => {
            const player = bot.players[entity.username]
            assert.ok(player, 'player should exist')
            assert.ok(player.skinData, 'skinData should be parsed from mojangson')
            assert.strictEqual(player.skinData.url, 'http://textures.minecraft.net/texture/abc123')
            assert.strictEqual(player.skinData.model, 'slim')
            assert.strictEqual(player.skinData.capeUrl, undefined)
            done()
          })

          if (registry.supportFeature('playerInfoActionIsBitfield')) {
            client.write('player_info', {
              action: { add_player: true },
              data: [{
                uuid: '1-2-3-4',
                player: {
                  name: 'bot5',
                  properties: [{
                    name: 'textures',
                    value: mojangsonBase64,
                    signature: ''
                  }]
                },
                gamemode: 0,
                latency: 0
              }]
            })
          } else {
            client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: '1-2-3-4',
                name: 'bot5',
                properties: [{
                  name: 'textures',
                  value: mojangsonBase64,
                  signature: ''
                }],
                gamemode: 0,
                ping: 0
              }]
            })
          }

          if (bot.registry.supportFeature('unifiedPlayerAndEntitySpawnPacket')) {
            client.write('spawn_entity', {
              entityId: 56,
              objectUUID: '1-2-3-4',
              type: bot.registry.entitiesByName.player.internalId,
              x: 1,
              y: 2,
              z: 3,
              pitch: 0,
              yaw: 0,
              headPitch: 0,
              objectData: 1,
              velocity: { x: 0, y: 0, z: 0 },
              velocityX: 0,
              velocityY: 0,
              velocityZ: 0
            })
          } else {
            client.write('named_entity_spawn', {
              entityId: 56,
              playerUUID: '1-2-3-4',
              x: 1,
              y: 2,
              z: 3,
              yaw: 0,
              pitch: 0,
              currentItem: -1,
              metadata: []
            })
          }
        })
      })

      it('does not crash when skin texture is valid JSON', (done) => {
        const validJson = JSON.stringify({
          textures: {
            SKIN: {
              url: 'http://textures.minecraft.net/texture/def456',
              metadata: { model: 'default' }
            },
            CAPE: {
              url: 'http://textures.minecraft.net/texture/cape789'
            }
          }
        })
        const jsonBase64 = Buffer.from(validJson).toString('base64')

        server.on('playerJoin', (client) => {
          bot.on('entitySpawn', (entity) => {
            const player = bot.players[entity.username]
            assert.ok(player, 'player should exist')
            assert.ok(player.skinData, 'skinData should be parsed from JSON')
            assert.strictEqual(player.skinData.url, 'http://textures.minecraft.net/texture/def456')
            assert.strictEqual(player.skinData.model, 'default')
            assert.strictEqual(player.skinData.capeUrl, 'http://textures.minecraft.net/texture/cape789')
            done()
          })

          if (registry.supportFeature('playerInfoActionIsBitfield')) {
            client.write('player_info', {
              action: { add_player: true },
              data: [{
                uuid: '1-2-3-4',
                player: {
                  name: 'bot6',
                  properties: [{
                    name: 'textures',
                    value: jsonBase64,
                    signature: ''
                  }]
                },
                gamemode: 0,
                latency: 0
              }]
            })
          } else {
            client.write('player_info', {
              action: 'add_player',
              data: [{
                uuid: '1-2-3-4',
                name: 'bot6',
                properties: [{
                  name: 'textures',
                  value: jsonBase64,
                  signature: ''
                }],
                gamemode: 0,
                ping: 0
              }]
            })
          }

          if (bot.registry.supportFeature('unifiedPlayerAndEntitySpawnPacket')) {
            client.write('spawn_entity', {
              entityId: 57,
              objectUUID: '1-2-3-4',
              type: bot.registry.entitiesByName.player.internalId,
              x: 1,
              y: 2,
              z: 3,
              pitch: 0,
              yaw: 0,
              headPitch: 0,
              objectData: 1,
              velocity: { x: 0, y: 0, z: 0 },
              velocityX: 0,
              velocityY: 0,
              velocityZ: 0
            })
          } else {
            client.write('named_entity_spawn', {
              entityId: 57,
              playerUUID: '1-2-3-4',
              x: 1,
              y: 2,
              z: 3,
              yaw: 0,
              pitch: 0,
              currentItem: -1,
              metadata: []
            })
          }
        })
      })

      it('sets players[player].entity to null upon despawn', (done) => {
        let serverClient = null
        bot.once('entitySpawn', (entity) => {
          if (bot.version !== '1.17') {
            serverClient.write('entity_destroy', {
              entityIds: [8]
            })
          } else {
            serverClient.write('destroy_entity', {
              entityIds: 8
            })
          }
        })
        bot.once('entityGone', (entity) => {
          assert.strictEqual(bot.players[entity.username], undefined)
          done()
        })
        server.on('playerJoin', (client) => {
          serverClient = client

          if (registry.supportFeature('playerInfoActionIsBitfield')) {
            client.write('player_info', {
              action: { add_player: true },
              data: [{
                uuid: '1-2-3-4',
                player: { name: 'bot5', properties: [] },
                gamemode: 0,
                latency: 0
              }]
            })
          } else {
            client.write('player_info', {
              id: 56,
              state: 'play',
              action: 'add_player',
              length: 1,
              data: [{
                uuid: '1-2-3-4',
                name: 'bot5',
                propertiesLength: 0,
                properties: [],
                gamemode: 0,
                ping: 0,
                hasDisplayName: false
              }]
            })
          }

          if (bot.registry.supportFeature('unifiedPlayerAndEntitySpawnPacket')) {
            client.write('spawn_entity', {
              entityId: 56,
              objectUUID: '1-2-3-4',
              type: bot.registry.entitiesByName.player.internalId,
              x: 1,
              y: 2,
              z: 3,
              pitch: 0,
              yaw: 0,
              headPitch: 0,
              objectData: 1,
              velocity: { x: 0, y: 0, z: 0 }
            })
          } else {
            client.write('named_entity_spawn', {
              entityId: 56,
              playerUUID: '1-2-3-4',
              x: 1,
              y: 2,
              z: 3,
              yaw: 0,
              pitch: 0,
              currentItem: -1,
              metadata: []
            })
          }
        })
      })

      // 1.11 to 1.13: the rocket's boosted entity is a plain id, where 0 is none (isAttachedToEntity), so a rocket
      // attached to nothing does not boost a bot whose entity id is 0
      it('is not boosted by a rocket attached to nothing', function (done) {
        if (!bot.registry.supportFeature('fireworkMetadataVarInt7')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            const login = bot.test.generateLoginPacket()
            login.entityId = 0
            client.write('login', login)
            await once(bot, 'login')
            // the firework rocket's object type
            client.write('spawn_entity', { entityId: 57, objectUUID: '1-2-3-5', type: 76, x: 1, y: 2, z: 3, pitch: 0, yaw: 0, objectData: 0, velocity: { x: 0, y: 0, z: 0 } })
            await once(bot, 'entitySpawn')
            let boosted = false
            bot.once('usedFirework', () => { boosted = true })
            client.write('entity_metadata', { entityId: 57, metadata: [{ key: 7, type: 1, value: 0 }] })
            await once(bot._client, 'entity_metadata')
            assert.strictEqual(boosted, false)
            bot.entity.id = 9
            client.write('entity_metadata', { entityId: 57, metadata: [{ key: 7, type: 1, value: 9 }] })
            await once(bot._client, 'entity_metadata')
            assert.strictEqual(boosted, true)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // ClientPacketListener.handleSetEntityMotion: the motion in 1/8000 of a block per tick, from 1.21.9 (LpVec3) in
      // blocks per tick
      it('takes the motion the server sets for the bot', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            await once(bot, 'login')
            const blocksPerTick = bot.registry.supportFeature('entityVelocityIsLpVec3')
            client.write('entity_velocity', { entityId: bot.entity.id, velocity: blocksPerTick ? { x: 0.4, y: 0.36, z: 0 } : { x: -1759, y: 323, z: 0 } })
            await once(bot._client, 'entity_velocity')
            if (blocksPerTick) {
              assert.ok(Math.abs(bot.entity.velocity.x - 0.4) < 1e-3, `x is ${bot.entity.velocity.x}`)
              assert.ok(Math.abs(bot.entity.velocity.y - 0.36) < 1e-3, `y is ${bot.entity.velocity.y}`)
            } else {
              // (divided by 8000, as the client does: -1759 * (1 / 8000) is a double further off)
              assert.strictEqual(bot.entity.velocity.x, -1759 / 8000)
              assert.strictEqual(bot.entity.velocity.y, 323 / 8000)
            }
            assert.strictEqual(bot.entity.velocity.z, 0)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('metadata', (done) => {
        server.on('playerJoin', (client) => {
          bot.on('entitySpawn', (entity) => {
            assert.strictEqual(entity.displayName, 'Creeper')

            const lastMeta = entity.metadata
            bot.on('entityUpdate', (entity) => {
              assert.ok('0' in entity.metadata)
              assert.strictEqual(entity.metadata[0], 1)
              assert.strictEqual(entity.metadata[1], lastMeta[1])
              done()
            })

            client.write('entity_metadata', {
              entityId: 8,
              metadata: [
                { key: 0, type: bot.registry.supportFeature('mcDataHasEntityMetadata') ? 'int' : 0, value: 1 }
              ]
            })
          })

          // Versions prior to 1.11 have capital first letter
          const entities = bot.registry.entitiesByName
          const creeperId = entities.creeper ? entities.creeper.id : entities.Creeper.id
          client.write(bot.registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living', {
            entityId: 8, // random
            entityUUID: '00112233-4455-6677-8899-aabbccddeeff',
            objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
            type: creeperId,
            x: 10,
            y: 11,
            z: 12,
            yaw: 13,
            pitch: 14,
            headPitch: 14,
            velocity: { x: 15, y: 16, z: 17 },
            metadata: [
              { type: 0, key: bot.registry.supportFeature('mcDataHasEntityMetadata') ? 'byte' : 0, value: 0 },
              { type: 0, key: bot.registry.supportFeature('mcDataHasEntityMetadata') ? 'int' : 1, value: 1 }
            ]
          })
        })
      })

      it('only updates oxygen level from bot metadata', function (done) {
        if (!bot.registry.supportFeature('mcDataHasEntityMetadata')) this.skip()

        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          bot.once('login', () => {
            bot.oxygenLevel = 20
            let breathEvents = 0
            bot.on('breath', () => { breathEvents++ })

            bot.once('entitySpawn', (entity) => {
              const airSupplyKey = bot.registry.entitiesByName[entity.name].metadataKeys.indexOf('air_supply')
              bot._client.once('entity_metadata', () => {
                try {
                  assert.strictEqual(bot.oxygenLevel, 20)
                  assert.strictEqual(breathEvents, 0)

                  bot.once('breath', () => {
                    try {
                      assert.strictEqual(bot.oxygenLevel, 10)
                      assert.strictEqual(breathEvents, 1)
                      done()
                    } catch (err) {
                      done(err)
                    }
                  })
                  client.write('entity_metadata', {
                    entityId: bot.entity.id,
                    metadata: [{ key: airSupplyKey, type: 'int', value: 150 }]
                  })
                } catch (err) {
                  done(err)
                }
              })
              client.write('entity_metadata', {
                entityId: entity.id,
                metadata: [{ key: airSupplyKey, type: 'int', value: 15 }]
              })
            })

            const cowId = bot.registry.entitiesByName.cow.id
            client.write(bot.registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living', {
              entityId: 8,
              entityUUID: '00112233-4455-6677-8899-aabbccddeeff',
              objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
              type: cowId,
              x: 10,
              y: 11,
              z: 12,
              yaw: 13,
              pitch: 14,
              headPitch: 14,
              velocity: { x: 0, y: 0, z: 0 }
            })
          })
        })
      })

      it('\'itemDrop\' event', function (done) {
        const itemData = {
          itemId: 149,
          itemCount: 5
        }

        server.on('playerJoin', (client) => {
          bot.on('itemDrop', (entity) => {
            const slotPosition = metadataPacket.metadata[0].key

            if (bot.supportFeature('itemsAreAlsoBlocks')) {
              assert.strictEqual(entity.metadata[slotPosition].blockId, itemData.itemId)
            } else if (bot.supportFeature('itemsAreNotBlocks')) {
              assert.strictEqual(entity.metadata[slotPosition].itemId, itemData.itemId)
            }
            assert.strictEqual(entity.metadata[slotPosition].itemCount, itemData.itemCount)

            done()
          })

          let entityType
          if (['1.8', '1.9', '1.10', '1.11', '1.12'].includes(bot.majorVersion)) {
            entityType = 2
          } else {
            entityType = bot.registry.entitiesArray.find(e => e.name.toLowerCase() === 'item' || e.name.toLowerCase() === 'item_stack').id
          }
          client.write('spawn_entity', {
            entityId: 16,
            objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
            type: Number(entityType),
            x: 0,
            y: 0,
            z: 0,
            pitch: 0,
            yaw: 0,
            headPitch: 0,
            objectData: 1,
            velocity: { x: 0, y: 0, z: 0 }
          })

          const metadataPacket = {
            entityId: 16,
            metadata: [
              { key: 7, type: 6, value: { itemCount: itemData.itemCount } }
            ]
          }
          // Versions prior to 1.13 use 5 as type field value of metadata for storing a slot. 1.13 and so on, use 6
          // Also the structure of a slot changes from 1.12 to 1.13
          if (bot.supportFeature('itemsAreAlsoBlocks')) {
            metadataPacket.metadata[0].key = 6
            metadataPacket.metadata[0].type = 5
            metadataPacket.metadata[0].value.blockId = itemData.itemId
            metadataPacket.metadata[0].value.itemDamage = 0
          } else if (bot.supportFeature('itemsAreNotBlocks')) {
            if (bot.majorVersion === '1.13') metadataPacket.metadata[0].key = 6
            metadataPacket.metadata[0].value.itemId = itemData.itemId
            metadataPacket.metadata[0].value.present = true
          }

          if (bot.supportFeature('entityMetadataHasLong')) {
            metadataPacket.metadata[0].type = 7
          }

          if (bot.registry.supportFeature('mcDataHasEntityMetadata')) {
            metadataPacket.metadata[0].type = 'item_stack'
          }
          metadataPacket.metadata[0].value.addedComponentCount = 0
          metadataPacket.metadata[0].value.removedComponentCount = 0
          metadataPacket.metadata[0].value.components = []
          metadataPacket.metadata[0].value.removeComponents = []

          client.write('entity_metadata', metadataPacket)
        })
      })
    })

    it('bed', (done) => {
      const blocks = bot.registry.blocksByName
      const entities = bot.registry.entitiesByName

      const playerPos = vec3(10, 0, 0)
      const zombiePos = vec3(0, 0, 0)
      const beds = [
        { head: vec3(10, 0, 3), foot: vec3(10, 0, 2), facing: 2, throws: false },
        { head: vec3(9, 0, 4), foot: vec3(10, 0, 4), facing: 3, throws: true, error: new Error('the bed is too far') },
        { head: vec3(8, 0, 0), foot: vec3(8, 0, 1), facing: 0, throws: true, error: new Error('there are monsters nearby') },
        { head: vec3(12, 0, 0), foot: vec3(11, 0, 0), facing: 1, throws: false }
      ]

      const zombieId = entities.zombie ? entities.zombie.id : entities.Zombie.id
      let bedBlock
      if (bot.supportFeature('oneBlockForSeveralVariations', version.majorVersion)) {
        bedBlock = blocks.bed
      } else if (bot.supportFeature('blockSchemeIsFlat', version.majorVersion)) {
        bedBlock = blocks.red_bed
      }
      const bedId = bedBlock.id

      bot.once('chunkColumnLoad', (columnPoint) => {
        for (const bed in beds) {
          const bedBock = bot.blockAt(beds[bed].foot)
          const bedBockMetadata = bot.parseBedMetadata(bedBock)
          assert.strictEqual(bedBockMetadata.facing, beds[bed].facing, 'The facing property seems to be wrong')
          assert.strictEqual(bedBockMetadata.part, false, 'The part property seems to be wrong') // Is the foot

          if (beds[bed].throws) {
            bot.sleep(bedBock).catch(err => assert.strictEqual(err, beds[bed].error))
          } else {
            bot.sleep(bedBock).catch(err => assert.ifError(err))
          }
        }

        done()
      })

      server.once('playerJoin', (client) => {
        const loginPacket = bot.test.generateLoginPacket()
        client.write('login', loginPacket)
        // Set timeOfDay after login is processed so bot.time is initialized
        bot.once('login', () => { bot.time.timeOfDay = 18000 })

        const chunk = bot.test.buildChunk()

        for (const bed in beds) {
          chunk.setBlockType(beds[bed].head, bedId)
          chunk.setBlockType(beds[bed].foot, bedId)
        }

        if (bot.supportFeature('blockStateId', version.majorVersion)) {
          chunk.setBlockStateId(beds[0].foot, 3 + bedBlock.minStateId) // { facing: north, occupied: false, part: foot }
          chunk.setBlockStateId(beds[0].head, 2 + bedBlock.minStateId) // { facing:north, occupied: false, part: head }

          chunk.setBlockStateId(beds[1].foot, 15 + bedBlock.minStateId) // { facing: east, occupied:false, part:foot }
          chunk.setBlockStateId(beds[1].head, 14 + bedBlock.minStateId) // { facing: east, occupied: false, part: head }

          chunk.setBlockStateId(beds[2].foot, 7 + bedBlock.minStateId) // { facing: south, occupied: false, part: foot }
          chunk.setBlockStateId(beds[2].head, 6 + bedBlock.minStateId) // { facing: south, occupied: false, part: head }

          chunk.setBlockStateId(beds[3].foot, 11 + bedBlock.minStateId) // { facing: west, occupied: false, part: foot }
          chunk.setBlockStateId(beds[3].head, 10 + bedBlock.minStateId) // { facing: west, occupied: false, part: head }
        } else if (bot.supportFeature('blockMetadata', version.majorVersion)) {
          chunk.setBlockData(beds[0].foot, 2) // { facing: north, occupied: false, part: foot }
          chunk.setBlockData(beds[0].head, 10) // { facing:north, occupied: false, part: head }

          chunk.setBlockData(beds[1].foot, 3) // { facing: east, occupied:false, part:foot }
          chunk.setBlockData(beds[1].head, 11) // { facing: east, occupied: false, part: head }

          chunk.setBlockData(beds[2].foot, 0) // { facing: south, occupied: false, part: foot }
          chunk.setBlockData(beds[2].head, 8) // { facing: south, occupied: false, part: head }

          chunk.setBlockData(beds[3].foot, 1) // { facing: west, occupied: false, part: foot }
          chunk.setBlockData(beds[3].head, 9) // { facing: west, occupied: false, part: head }
        }

        client.write('position', {
          x: playerPos.x,
          y: playerPos.y,
          z: playerPos.z,
          yaw: 0,
          pitch: 0,
          flags: 0,
          teleportId: 1
        })

        client.write(bot.registry.supportFeature('consolidatedEntitySpawnPacket') ? 'spawn_entity' : 'spawn_entity_living', {
          entityId: 8,
          entityUUID: '00112233-4455-6677-8899-aabbccddeeff',
          objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
          type: zombieId,
          x: zombiePos.x,
          y: zombiePos.y,
          z: zombiePos.z,
          yaw: 0,
          pitch: 0,
          headPitch: 0,
          velocity: { x: 0, y: 0, z: 0 },
          metadata: []
        })

        client.write('map_chunk', generateChunkPacket(chunk))
      })
    })

    describe('activateBlock', () => {
      it('defaults the cursor to the centre of the clicked face and swings after use_item_on', (done) => {
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          bot.lookAt = async () => {}
          const writes = []
          bot._client.write = (name, params) => { writes.push({ name, params }) }
          const block = { position: vec3(1, 65, 1) }
          await bot.activateBlock(block)
          await bot.activateBlock(block, vec3(-1, 0, 0))
          try {
            const scale = bot.supportFeature('blockPlaceHasHandAndFloatCursor') || bot.supportFeature('blockPlaceHasInsideBlock') ? 1 : 16
            assert.deepStrictEqual(writes.map(w => w.name), ['block_place', 'arm_animation', 'block_place', 'arm_animation'])
            const cursor = ({ params }) => [params.cursorX / scale, params.cursorY / scale, params.cursorZ / scale, params.direction]
            assert.deepStrictEqual(cursor(writes[0]), [0.5, 1, 0.5, 1])
            assert.deepStrictEqual(cursor(writes[2]), [0, 0.5, 0.5, 4])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('activateItem', () => {
      it('does nothing with an empty hand', (done) => {
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          const writes = []
          bot._client.write = (name, params) => { writes.push(name) }
          bot.quickBarSlot = 0
          bot.activateItem()
          bot.activateItem(true)
          try {
            assert.deepStrictEqual(writes, [])
            assert.strictEqual(bot.usingHeldItem, false)
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))
            bot.activateItem()
            const sendsPosition = bot.registry.version['>=']('1.17') && bot.registry.version['<']('1.21')
            assert.deepStrictEqual(writes, [...(sendsPosition ? ['position_look'] : []), bot.supportFeature('useItemWithOwnPacket') ? 'use_item' : 'block_place'])
            assert.strictEqual(bot.usingHeldItem, false, 'stone is not used for a time')
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // Item.use: only an item used for a time (LivingEntity.startUsingItem) keeps the player using it
      it('uses only an item used for a time', (done) => {
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          bot._client.write = () => {}
          bot.quickBarSlot = 0
          // in survival (a creative player's bow shoots without arrows; some versions' login packet is creative)
          bot.game.gameMode = 'survival'
          const usingWith = (name, food = 20, arrows = false, metadata = 0) => {
            bot.food = food
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName[name].id, 1, metadata))
            bot.inventory.updateSlot(bot.QUICK_BAR_START + 1, arrows ? new Item(registry.itemsByName.arrow.id, 1) : null)
            bot.activateItem()
            const using = bot.usingHeldItem
            bot.usingHeldItem = false
            return using
          }
          try {
            assert.strictEqual(usingWith('stone'), false)
            assert.strictEqual(usingWith('snowball'), false)
            assert.strictEqual(usingWith('potion'), true)
            assert.strictEqual(usingWith('bow'), false, 'a bow with no arrows')
            assert.strictEqual(usingWith('bow', 20, true), true)
            assert.strictEqual(usingWith('apple', 20), false, 'an apple when full')
            assert.strictEqual(usingWith('apple', 10), true)
            // up to 1.8 a splash potion is a potion with data bit 16384, thrown at once
            if (registry.version['<']('1.9')) assert.strictEqual(usingWith('potion', 20, false, 16384), false, 'a splash potion')
            // the client starts using a bundle from 1.21.4, a spear from 1.21.11
            if (registry.itemsByName.bundle && registry.version['>=']('1.21.2')) assert.strictEqual(usingWith('bundle'), registry.version['>=']('1.21.4'), 'a bundle')
            if (registry.itemsByName.wooden_spear) assert.strictEqual(usingWith('wooden_spear'), true, 'a spear')
            // a spectator uses no item
            bot.game.gameMode = 'spectator'
            assert.strictEqual(usingWith('potion'), false, 'a spectator')
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // CrossbowItem.use: shooting a charged crossbow empties it on the client too (its NBT up to 1.20.4, its item
      // components from 1.20.5)
      it('empties a charged crossbow it shoots', function (done) {
        if (!registry.itemsByName.crossbow) return this.skip()
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          bot._client.write = () => {}
          bot.quickBarSlot = 0
          const components = bot.registry.version['>=']('1.20.5')
          const crossbow = new Item(registry.itemsByName.crossbow.id, 1)
          if (components) {
            const arrow = { itemCount: 1, itemId: registry.itemsByName.arrow.id, addedComponentCount: 0, removedComponentCount: 0, components: [], removeComponents: [] }
            const charged = { type: 'charged_projectiles', data: { projectiles: [arrow] } }
            crossbow.components = [charged]
            crossbow.componentMap.set('charged_projectiles', charged)
          } else {
            const arrow = { id: { type: 'string', value: 'minecraft:arrow' }, Count: { type: 'byte', value: 1 } }
            crossbow.nbt = { type: 'compound', name: '', value: { Charged: { type: 'byte', value: 1 }, ChargedProjectiles: { type: 'list', value: { type: 'compound', value: [arrow] } } } }
          }
          bot.inventory.updateSlot(bot.QUICK_BAR_START, crossbow)
          try {
            bot.activateItem()
            if (components) {
              assert.strictEqual(bot.heldItem.componentMap.has('charged_projectiles'), false)
              assert.deepStrictEqual(bot.heldItem.components, [])
            } else {
              assert.strictEqual(bot.heldItem.nbt.value.Charged.value, 0)
              assert.deepStrictEqual(bot.heldItem.nbt.value.ChargedProjectiles.value.value, [])
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // LivingEntity.updatingUsingItem: from 1.14 the server changing the held item's count or data keeps the use,
      // another item ends it; up to 1.13 any update of the held item ends it
      it('keeps using an item the server updates, until it is another item', (done) => {
        const keeps = registry.version['>=']('1.14')
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          bot._client.write = () => {}
          bot.quickBarSlot = 0
          try {
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.potion.id, 2))
            bot.activateItem()
            bot.usingHeldItem = true
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.potion.id, 1))
            assert.strictEqual(bot.usingHeldItem, keeps, 'the same item, another count')
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))
            assert.strictEqual(bot.usingHeldItem, false, 'another item')
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.potion.id, 1))
            bot.activateItem()
            bot.usingHeldItem = true
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.potion.id, 1))
            assert.strictEqual(bot.usingHeldItem, keeps, 'the same item after a change')
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // Player.handleEntityEvent: only the player's own event 9 completes its use
      it('keeps using an item through other entity events', (done) => {
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          const write = bot._client.write.bind(bot._client)
          bot._client.write = (name, params) => { if (name !== 'use_item' && name !== 'block_place' && name !== 'position_look') write(name, params) }
          bot.quickBarSlot = 0
          bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.potion.id, 1))
          try {
            bot.activateItem()
            const twoEvents = new Promise(resolve => {
              let n = 0
              const count = () => { if (++n === 2) { bot._client.removeListener('entity_status', count); resolve() } }
              bot._client.on('entity_status', count)
            })
            client.write('entity_status', { entityId: bot.entity.id + 1, entityStatus: 9 })
            client.write('entity_status', { entityId: bot.entity.id, entityStatus: 2 })
            await twoEvents
            assert.strictEqual(bot.usingHeldItem, true)
            client.write('entity_status', { entityId: bot.entity.id, entityStatus: 9 })
            await once(bot._client, 'entity_status')
            assert.strictEqual(bot.usingHeldItem, false)
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // TridentItem.releaseUsing: a riptide trident let go of after 10 ticks of use, in water or rain, pushes the bot
      it('lets go of a riptide trident used for 10 ticks', function (done) {
        if (!registry.itemsByName.trident) return this.skip()
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          bot._client.write = () => {}
          bot.quickBarSlot = 0
          bot.isRaining = true
          const trident = new Item(registry.itemsByName.trident.id, 1)
          trident.enchants = [{ name: 'riptide', lvl: 2 }]
          bot.inventory.updateSlot(bot.QUICK_BAR_START, trident)
          const useFor = (ticks) => {
            bot.riptide = 0
            bot.activateItem()
            for (let i = 0; i < ticks; i++) bot.emit('physicsTick')
            bot.deactivateItem()
            return bot.riptide
          }
          try {
            assert.strictEqual(useFor(9), 0)
            assert.strictEqual(useFor(10), 2)
            done()
          } catch (err) {
            done(err)
          } finally {
            bot.isRaining = false
          }
        })
      })

      // MultiPlayerGameMode.useItem: from 1.17 to 1.20.6 the position and look as they are, before the use
      it('sends the position and look before using an item on 1.17 to 1.20.6', function (done) {
        if (bot.registry.version['<']('1.17') || bot.registry.version['>=']('1.21')) return this.skip()
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            client.write('position', {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 90,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            })
            await once(bot, 'forcedMove')
            await bot.look(bot.entity.yaw, -Math.PI / 4, true)
            bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))
            bot.quickBarSlot = 0
            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => { writes.push({ name, params }); return write(name, params) }
            const { x, y, z } = bot.entity.position
            bot.activateItem()
            bot._client.write = write
            assert.deepStrictEqual(writes.map(w => w.name), ['position_look', bot.supportFeature('useItemWithOwnPacket') ? 'use_item' : 'block_place'])
            const sent = writes[0].params
            assert.deepStrictEqual([sent.x, sent.y, sent.z, sent.yaw, sent.pitch], [x, y, z, 90, 45])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('heldItemChanged', () => {
      it('emits heldItemChanged when the held slot is updated via set_slot', (done) => {
        const Item = require('prismarine-item')(supportedVersion)
        const QUICK_BAR_SLOT = 0
        const HOTBAR_START = 36
        const stoneId = registry.itemsByName.stone.id
        const stoneItem = new Item(stoneId, 1)
        const notchItem = Item.toNotch(stoneItem)

        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          client.write('held_item_slot', { slot: QUICK_BAR_SLOT })

          // Wait for the held_item_slot to be processed, then listen for the
          // heldItemChanged triggered by the set_slot update to the held slot
          setTimeout(() => {
            bot.once('heldItemChanged', (newItem) => {
              assert.ok(newItem, 'heldItemChanged should provide the new item')
              assert.strictEqual(newItem.type, stoneId)
              done()
            })
            client.write('set_slot', {
              windowId: 0,
              slot: HOTBAR_START + QUICK_BAR_SLOT,
              item: notchItem
            })
          }, 100)
        })
      })

      it('emits heldItemChanged via updateSlot on the inventory', (done) => {
        const Item = require('prismarine-item')(supportedVersion)
        const QUICK_BAR_SLOT = 0
        const stoneId = registry.itemsByName.stone.id
        const stoneItem = new Item(stoneId, 1)

        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          client.write('held_item_slot', { slot: QUICK_BAR_SLOT })

          setTimeout(() => {
            bot.once('heldItemChanged', (newItem) => {
              assert.ok(newItem, 'heldItemChanged should provide the new item')
              assert.strictEqual(newItem.type, stoneId)
              done()
            })
            // Directly call updateSlot on the inventory to simulate
            // the set_player_inventory code path
            bot.inventory.updateSlot(
              QUICK_BAR_SLOT + bot.inventory.hotbarStart,
              stoneItem
            )
          }, 100)
        })
      })
    })

    describe('held_item_slot', () => {
      function collectHeldItemSlots (client) {
        const sent = []
        client.on('packet', (data, meta) => {
          if (meta.name === 'held_item_slot') sent.push(data.slotId)
        })
        return sent
      }

      it('applies a server-sent slot equal to the carried one without echoing it', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            const sent = collectHeldItemSlots(client)
            client.write('login', bot.test.generateLoginPacket())
            client.write('held_item_slot', { slot: 0 })
            await sleep(300)
            assert.strictEqual(bot.quickBarSlot, 0)
            assert.deepStrictEqual(sent, [])
            bot.setQuickBarSlot(3)
            await sleep(300)
            assert.deepStrictEqual(sent, [3])
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('sends a server-sent slot that differs from the carried one, once per login', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            const sent = collectHeldItemSlots(client)
            const changes = []
            bot.on('heldItemChanged', () => changes.push(bot.quickBarSlot))
            client.write('login', bot.test.generateLoginPacket())
            client.write('held_item_slot', { slot: 3 })
            await sleep(300)
            assert.strictEqual(bot.quickBarSlot, 3)
            assert.deepStrictEqual(sent, [3])
            assert.deepStrictEqual(changes, [3])
            client.write('held_item_slot', { slot: 3 })
            bot.setQuickBarSlot(3)
            await sleep(300)
            assert.deepStrictEqual(sent, [3])
            assert.deepStrictEqual(changes, [3])
            client.write('login', bot.test.generateLoginPacket())
            client.write('held_item_slot', { slot: 3 })
            await sleep(300)
            assert.deepStrictEqual(sent, [3, 3])
            assert.deepStrictEqual(changes, [3])
            client.write('held_item_slot', { slot: 0 })
            await sleep(300)
            assert.strictEqual(bot.quickBarSlot, 0)
            assert.deepStrictEqual(sent, [3, 3, 0])
            assert.deepStrictEqual(changes, [3, 0])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('generic place', () => {
      it('swings the arm after use_item_on', (done) => {
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          const writes = []
          bot._client.write = (name, params) => { writes.push(name) }
          bot.quickBarSlot = 0
          bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))
          await bot._genericPlace({ position: vec3(1, 65, 1) }, vec3(0, 1, 0), { forceLook: 'ignore', swingArm: 'right' })
          try {
            assert.deepStrictEqual(writes, ['block_place', 'arm_animation'])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('windows', () => {
      const Item = require('prismarine-item')(supportedVersion)
      const pWindows = require('prismarine-windows')(supportedVersion)
      // legacy 'minecraft:chest' has a dynamic size resolved from the packet's
      // slotCount (container slots only); the modern equivalent is fixed
      const chestData = pWindows.windows['minecraft:generic_9x3'] ?? { type: 'minecraft:chest', slots: 63 }
      const merchantData = pWindows.windows['minecraft:merchant'] ?? pWindows.windows['minecraft:villager']
      const emptyItems = (n) => Array.from({ length: n }, () => Item.toNotch(null))
      const openWindowPacket = (windowId, winData) => ({
        windowId,
        inventoryType: winData.type,
        windowTitle: chatText(''),
        slotCount: winData.slots - 36,
        entityId: 0
      })
      const windowItemsPacket = (windowId, items) => ({
        windowId,
        stateId: 1,
        items,
        carriedItem: Item.toNotch(null)
      })

      it('opens a window whose early window_items reuses the id of a closed window', (done) => {
        const emeraldId = registry.itemsByName.emerald.id

        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())

          bot.once('windowOpen', () => {
            bot.closeWindow(bot.currentWindow)
          })
          client.on('close_window', () => {
            bot.once('windowOpen', (window) => {
              assert.strictEqual(window.type, merchantData.key)
              assert.strictEqual(window.slots[0]?.type, emeraldId)
              done()
            })
            // a villager window sends its contents before open_window, and
            // reuses the chest's id when a respawn reset the server's window
            // id counter in between
            const items = emptyItems(merchantData.slots)
            items[0] = Item.toNotch(new Item(emeraldId, 3))
            client.write('window_items', windowItemsPacket(1, items))
            client.write('open_window', openWindowPacket(1, merchantData))
          })

          client.write('open_window', openWindowPacket(1, chestData))
          client.write('window_items', windowItemsPacket(1, emptyItems(chestData.slots)))
        })
      })

      it('applies the player-inventory region of a trailing sync for a closed window', (done) => {
        const stoneId = registry.itemsByName.stone.id
        // chest slot 30 is in the window's player-inventory region and maps
        // back to inventory slot 12
        const chestSlot = 30
        const invSlot = 12

        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())

          bot.once('windowOpen', () => {
            bot.closeWindow(bot.currentWindow)
          })
          client.on('close_window', () => {
            bot.inventory.once(`updateSlot:${invSlot}`, (oldItem, newItem) => {
              assert.strictEqual(newItem?.type, stoneId)
              done()
            })
            const items = emptyItems(chestData.slots)
            items[chestSlot] = Item.toNotch(new Item(stoneId, 5))
            client.write('window_items', windowItemsPacket(1, items))
          })

          client.write('open_window', openWindowPacket(1, chestData))
          client.write('window_items', windowItemsPacket(1, emptyItems(chestData.slots)))
        })
      })
    })

    describe('scoreboard', () => {
      it('enumerates only the display slots that hold an objective', async () => {
        server.on('playerJoin', (client) => client.write('login', bot.test.generateLoginPacket()))
        await once(bot, 'login')
        bot._client.emit('scoreboard_objective', { name: 'test1', action: 0, displayText: JSON.stringify({ text: 'Test 1' }) })
        bot._client.emit('scoreboard_display_objective', { name: 'test1', position: 1 })
        assert.strictEqual(bot.scoreboard.sidebar, bot.scoreboards.test1)
        assert.strictEqual(bot.scoreboard.list, undefined)
        assert.deepStrictEqual(Object.keys(bot.scoreboard), ['1'])
        assert.ok(Object.values(bot.scoreboard).every(sb => sb !== undefined))
        assert.doesNotThrow(() => { for (const sb of Object.values(bot.scoreboard)) assert.strictEqual(sb.title, 'Test 1') })
        bot._client.emit('scoreboard_objective', { name: 'test1', action: 1 })
        assert.deepStrictEqual(Object.keys(bot.scoreboard), [])
        assert.strictEqual(bot.scoreboard.sidebar, undefined)
      })
    })
    describe('tablist', () => {
      it('handles newlines in header and footer', (done) => {
        const HEADER = 'asd\ndsa'
        const FOOTER = '\nas\nas\nas\n'
        bot._client.on('playerlist_header', (packet) => {
          setImmediate(() => {
            assert.strictEqual(bot.tablist.header.toString(), HEADER)
            assert.strictEqual(bot.tablist.footer.toString(), FOOTER)
            done()
          })
        })
        // TODO: figure out how the "extra" should be encoded in NBT so this branch can be removed
        if (registry.supportFeature('chatPacketsUseNbtComponents')) {
          server.on('playerJoin', (client) => {
            client.write('playerlist_header', {
              header: chatText(HEADER),
              footer: chatText(FOOTER)
            })
          })
        } else {
          server.on('playerJoin', (client) => {
            client.write('playerlist_header', {
              header: JSON.stringify({ text: '', extra: [{ text: HEADER, color: 'yellow' }] }),
              footer: JSON.stringify({ text: '', extra: [{ text: FOOTER, color: 'yellow' }] })
            })
          })
        }
      })
    })

    describe('scoreboard reset on login', () => {
      function teamAddPacket (teamName, players) {
        const text = registry.supportFeature('teamUsesChatComponents') ? chatText : (s) => s
        const mappedMode = registry.version['>=']('1.21.6')
        const enumRules = registry.version['>=']('1.21.5') && registry.version['<']('1.21.6')
        return {
          team: teamName,
          mode: mappedMode ? 'add' : 0,
          name: text(teamName),
          prefix: text(''),
          suffix: text(''),
          friendlyFire: 1,
          flags: { friendly_fire: true, see_friendly_invisible: false },
          nameTagVisibility: enumRules ? 0 : 'always',
          collisionRule: enumRules ? 0 : 'always',
          color: 0,
          formatting: 0,
          players
        }
      }

      function objectiveAddPacket (name) {
        const typeField = registry.protocol.play.toClient.types.packet_scoreboard_objective[1].find(f => f.name === 'type')
        return {
          name,
          action: 0,
          displayText: chatText(name),
          type: typeField.type[1].fields[0] === 'string' ? 'integer' : 0
        }
      }

      function respawnPacket (loginPacket) {
        if (!bot.supportFeature('usesLoginPacket')) {
          return { dimension: 0, hashedSeed: [0, 0], gamemode: 0, levelType: 'default' }
        }
        // The respawn packet names the world the login packet declared.
        loginPacket.worldName = 'minecraft:overworld'
        loginPacket.hashedSeed = [0, 0]
        loginPacket.entityId = 0
        const packet = {
          dimension: bot.supportFeature('dimensionDataInCodec') ? 'minecraft:overworld' : loginPacket.dimension,
          worldName: loginPacket.worldName,
          hashedSeed: loginPacket.hashedSeed,
          gamemode: 0,
          previousGamemode: 255,
          isDebug: false,
          isFlat: false,
          copyMetadata: true,
          death: { dimensionName: '', location: { x: 0, y: 0, z: 0 } }
        }
        if (!bot.supportFeature('spawnRespawnWorldDataField')) return packet
        packet.name = loginPacket.worldName
        packet.dimension = loginPacket.dimension
        return { worldState: packet }
      }

      it('clears teams and objectives on login but not on respawn', async () => {
        const teamPacketName = bot.supportFeature('teamUsesScoreboard') ? 'scoreboard_team' : 'teams'
        const [client] = await once(server, 'playerJoin')
        const loginPacket = bot.test.generateLoginPacket()
        const teams = bot.teams
        const teamMap = bot.teamMap
        const scoreboards = bot.scoreboards
        const positions = bot.scoreboard

        await client.write('login', loginPacket)
        client.write(teamPacketName, teamAddPacket('red', ['alice']))
        await once(bot, 'teamCreated')
        client.write('scoreboard_objective', objectiveAddPacket('kills'))
        client.write('scoreboard_display_objective', { position: 1, name: 'kills' })
        await once(bot, 'scoreboardPosition')
        assert.deepStrictEqual(bot.teams.red.members, ['alice'])
        assert.strictEqual(bot.teamMap.alice, bot.teams.red)
        assert.strictEqual(bot.scoreboards.kills.name, 'kills')
        assert.strictEqual(bot.scoreboard.sidebar, bot.scoreboards.kills)
        assert.strictEqual(bot.scoreboard[1], bot.scoreboards.kills)

        let removedEvents = 0
        bot.on('teamRemoved', () => removedEvents++)
        bot.on('scoreboardDeleted', () => removedEvents++)
        client.write('login', loginPacket)
        await once(bot, 'login')
        assert.strictEqual(bot.teams, teams)
        assert.strictEqual(bot.teamMap, teamMap)
        assert.strictEqual(bot.scoreboards, scoreboards)
        assert.strictEqual(bot.scoreboard, positions)
        assert.deepStrictEqual(Object.keys(bot.teams), [])
        assert.deepStrictEqual(Object.keys(bot.teamMap), [])
        assert.deepStrictEqual(Object.keys(bot.scoreboards), [])
        assert.strictEqual(bot.scoreboard[1], undefined)
        assert.strictEqual(bot.scoreboard.sidebar, undefined)
        assert.strictEqual(bot.scoreboard.list, undefined)
        assert.strictEqual(bot.scoreboard.belowName, undefined)
        assert.strictEqual(removedEvents, 0)

        client.write(teamPacketName, teamAddPacket('red', ['bob']))
        await once(bot, 'teamCreated')
        assert.deepStrictEqual(bot.teams.red.members, ['bob'])
        assert.strictEqual(bot.teamMap.alice, undefined)

        client.write('respawn', respawnPacket(loginPacket))
        await once(bot, 'respawn')
        assert.deepStrictEqual(bot.teams.red.members, ['bob'])
        assert.strictEqual(bot.teamMap.bob, bot.teams.red)
      })
    })

    describe('block prediction sequence', () => {
      it('shares one pre-incremented counter across use_item and use_item_on, 0 on release', function (done) {
        const useItemFields = registry.protocol?.play?.toServer?.types?.packet_use_item?.[1]
        if (!useItemFields?.some(f => f.name === 'sequence')) {
          this.skip()
          return
        }
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          const writes = []
          bot._client.write = (name, params) => { writes.push([name, params.sequence]) }
          bot.quickBarSlot = 0
          bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))

          bot.activateItem()
          bot.deactivateItem()
          await bot._genericPlace({ position: vec3(1, 65, 1) }, vec3(0, 1, 0), { forceLook: 'ignore' })
          bot.activateItem()

          try {
            // (1.19 to 1.20.6 also send the position before a use, which has no sequence)
            assert.deepStrictEqual(writes.filter(([name]) => name !== 'position_look'), [
              ['use_item', 1],
              ['block_dig', 0],
              ['block_place', 2],
              ['use_item', 3]
            ])
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('gives both packets of a boat placement their own value, interleaved with use_item', function (done) {
        const useItemFields = registry.protocol?.play?.toServer?.types?.packet_use_item?.[1]
        if (!useItemFields?.some(f => f.name === 'sequence')) {
          this.skip()
          return
        }
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          const loggedIn = once(bot, 'login')
          await client.write('login', bot.test.generateLoginPacket())
          await loggedIn
          // serialize every packet with the real protocol, so a missing field throws here
          const serializer = mc.createSerializer({ state: 'play', isServer: false, version: bot.version })
          const writes = []
          bot._client.write = (name, params) => {
            serializer.createPacketBuffer({ name, params })
            writes.push([name, params.sequence])
          }
          bot.lookAt = async () => {}
          bot.quickBarSlot = 0
          const boat = registry.itemsByName.oak_boat ?? registry.itemsByName.boat
          bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(boat.id, 1))

          try {
            bot.activateItem()
            bot.deactivateItem()
            const placed = bot.placeEntity({ position: vec3(1, 64, 1) }, vec3(0, 1, 0))
            await sleep(0)
            bot.emit('entitySpawn', { name: bot.supportFeature('entityNameUpperCaseNoUnderscore') ? 'Boat' : 'boat', position: vec3(1.5, 65, 1.5) })
            await placed
            bot.activateItem()

            assert.deepStrictEqual(writes.filter(([name]) => name !== 'arm_animation' && name !== 'position_look'), [
              ['use_item', 1],
              ['block_dig', 0],
              ['block_place', 2],
              ['use_item', 3],
              ['use_item', 4]
            ])
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('activateBlock rotation', () => {
      it('faces the point on the clicked face that the packet reports', async () => {
        const blockPos = vec3(1, 65, 1)
        const stoneId = registry.blocksByName.stone.id
        const chunk = bot.test.buildChunk()
        for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) chunk.setBlockType(vec3(x, 64, z), stoneId)
        chunk.setBlockType(blockPos, stoneId)
        let sent = null
        await new Promise(resolve => {
          server.on('playerJoin', async (client) => {
            client.write('login', bot.test.generateLoginPacket())
            client.write('map_chunk', generateChunkPacket(chunk))
            client.write('position', {
              x: 1.5,
              y: 65,
              z: 4.5,
              dx: 0,
              dy: 0,
              dz: 0,
              yaw: 0,
              pitch: 0,
              flags: bot.registry.version['>=']('1.21.3') ? {} : 0,
              teleportId: 0
            })
            client.on('packet', (data, meta) => { if (meta.name === 'block_place') sent = data })
            await sleep(400)
            resolve()
          })
        })

        // the south face, the one an eye at z = 4.5 can see
        await bot.activateBlock(bot.blockAt(blockPos), vec3(0, 0, 1))
        await sleep(200)
        assert.ok(sent, 'no block_place packet')

        const eye = bot.entity.position.offset(0, bot.entity.eyeHeight, 0)
        const aim = (point) => {
          const d = point.minus(eye)
          return { yaw: Math.atan2(-d.x, -d.z), pitch: Math.atan2(d.y, Math.sqrt(d.x * d.x + d.z * d.z)) }
        }
        const hit = aim(blockPos.offset(0.5, 0.5, 1))
        const middle = aim(blockPos.offset(0.5, 0.5, 0.5))
        assert.ok(Math.abs(hit.pitch - middle.pitch) > 0.05, 'the two aims must be far enough apart to tell apart')
        assert.ok(Math.abs(bot.entity.pitch - hit.pitch) < 0.02,
          `pitch ${bot.entity.pitch} should face the reported hit at ${hit.pitch}, the block's middle is ${middle.pitch}`)
        assert.ok(Math.abs(bot.entity.yaw - hit.yaw) < 0.02, `yaw ${bot.entity.yaw} should face the reported hit at ${hit.yaw}`)
      })
    })

    describe('activateItem rotation', () => {
      it('should send the bot rotation in the use_item packet', function (done) {
        // The rotation field in use_item was added in 1.21.1
        const useItemFields = registry.protocol?.play?.toServer?.types?.packet_use_item?.[1]
        const hasRotation = useItemFields && useItemFields.some(f => f.name === 'rotation')
        if (!hasRotation) {
          this.skip()
          return
        }
        const { toNotchianYaw, toNotchianPitch } = require('../lib/conversions')
        const testYaw = 1.5
        const testPitch = -0.3
        server.on('playerJoin', async (client) => {
          await bot.test.pluginsLoaded
          await client.write('login', bot.test.generateLoginPacket())
          await client.write('position', {
            x: 0,
            y: 66,
            z: 0,
            dx: 0,
            dy: 0,
            dz: 0,
            yaw: 0,
            pitch: 0,
            flags: bot.registry.version['>=']('1.21.3') ? {} : 0,
            teleportId: 0
          })

          client.on('packet', (data, meta) => {
            if (meta.name === 'use_item') {
              const expectedYaw = toNotchianYaw(testYaw)
              const expectedPitch = toNotchianPitch(testPitch)
              assert.ok(data.rotation, 'use_item packet should have rotation field')
              assert.ok(Math.abs(data.rotation.x - expectedYaw) < 0.001,
                `Expected yaw ${expectedYaw}, got ${data.rotation.x}`)
              assert.ok(Math.abs(data.rotation.y - expectedPitch) < 0.001,
                `Expected pitch ${expectedPitch}, got ${data.rotation.y}`)
              done()
            }
          })

          await sleep(100)
          bot.entity.yaw = testYaw
          bot.entity.pitch = testPitch
          bot.quickBarSlot = 0
          bot.inventory.updateSlot(bot.QUICK_BAR_START, new Item(registry.itemsByName.stone.id, 1))
          bot.activateItem()
        })
      })
    })

    describe('teleports', () => {
      it('answers a teleport at the next tick instead of from inside the packet handler', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => { writes.push(name); return write(name, params) }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              writes.length = 0
              bot._client.emit('position', { ...teleport, y: 90, teleportId: 1 })
              assert.deepStrictEqual(writes, [], 'the teleport must not be answered from inside the packet handler')
              await once(bot, 'forcedMove')
              assert.ok(writes.includes('position_look'), 'the teleport is answered on the next tick')
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('answers pings and teleports in the order the packets arrived', function (done) {
        if (bot.supportFeature('transactionPacketExists')) {
          this.skip()
          return
        }
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => { writes.push({ name, params }); return write(name, params) }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              writes.length = 0
              // Between two ticks the server's ping, teleport and second ping arrive in that order.
              bot._client.emit('ping', { id: 1 })
              bot._client.emit('position', { ...teleport, y: 90, teleportId: 1 })
              bot._client.emit('ping', { id: 2 })
              assert.deepStrictEqual(writes, [], 'nothing is answered from inside the packet handlers')
              await once(bot, 'forcedMove')
              const replies = writes
                .filter(w => ['pong', 'teleport_confirm', 'position_look'].includes(w.name))
                .map(w => (w.name === 'pong' ? `pong ${w.params.id}` : w.name))
              // 1.21.2 and 1.21.3 send the position before confirming the teleport
              const confirmedLast = bot.registry.version['>=']('1.21.2') && bot.registry.version['<']('1.21.4')
              assert.deepStrictEqual(replies, ['pong 1', ...(confirmedLast ? ['position_look', 'teleport_confirm'] : ['teleport_confirm', 'position_look']), 'pong 2'])
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('answers every teleport queued for a tick, in arrival order', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const replies = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (name === 'position_look') replies.push(params.y)
              return write(name, params)
            }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              replies.length = 0
              bot._client.emit('position', { ...teleport, y: 90, teleportId: 1 })
              bot._client.emit('position', { ...teleport, y: 100, teleportId: 2 })
              await new Promise(resolve => bot.once('physicsTick', resolve))
              assert.deepStrictEqual(replies, [90, 100], 'each queued teleport gets its own reply on the same tick')
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('a rotation arriving after a queued teleport is not overwritten by it', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const replies = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (name === 'position_look') replies.push(params.yaw)
              return write(name, params)
            }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              replies.length = 0
              bot._client.emit('position', { ...teleport, yaw: 30, teleportId: 1 })
              bot._client.emit('player_rotation', { yaw: 90, pitch: 0 })
              await once(bot, 'forcedMove')
              // the answer carries the teleport's rotation (a later tick may send the bot's own look)
              assert.deepStrictEqual(replies.slice(0, 1), [30], 'the teleport is answered with its own rotation')
              assert.strictEqual(bot.entity.yaw, require('../lib/conversions').fromNotchianYaw(90), 'the later rotation wins')
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // the answer goes straight to the connection: what the player last sent stays, so its next tick sends the
      // teleported position, as the client does
      it('sends the teleported position on the tick after the answer', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            chunk.setBlockType(vec3(1, 65, 3), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')
            for (let i = 0; i < 5; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
            assert.ok(bot.entity.onGround, 'standing before the teleport')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (['position', 'look', 'position_look', 'flying'].includes(name)) writes.push({ name, z: params.z })
              return write(name, params)
            }
            try {
              bot._client.emit('position', { ...teleport, z: 3.5, teleportId: 1 })
              await once(bot, 'forcedMove')
              for (let i = 0; i < 3; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
              assert.deepStrictEqual(writes.slice(0, 2), [{ name: 'position_look', z: 3.5 }, { name: 'position', z: 3.5 }])
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // the respawned player is a new LocalPlayer that has sent nothing: its first tick sends its position and look,
      // even where the old player last sent the same ones
      it('sends the position and look again after a respawn', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 90,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')
            for (let i = 0; i < 5; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
            assert.ok(bot.entity.onGround, 'standing before the respawn')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (['position', 'look', 'position_look', 'flying'].includes(name)) writes.push({ name, yaw: params.yaw })
              return write(name, params)
            }
            try {
              bot.emit('respawn') // as the respawn packet does
              bot._client.emit('position', { ...teleport, teleportId: 1 })
              await once(bot, 'forcedMove')
              for (let i = 0; i < 3; i++) await new Promise(resolve => bot.once('physicsTick', resolve))
              assert.deepStrictEqual(writes.slice(0, 2), [{ name: 'position_look', yaw: 90 }, { name: 'position_look', yaw: 90 }])
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      // the teleport turns the player as it arrives: a look forced before the next tick is the one that tick sends
      it('keeps a look forced between a teleport and its answer', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 66,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')
            for (let i = 0; i < 5; i++) await new Promise(resolve => bot.once('physicsTick', resolve))

            const yaws = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => {
              if (['look', 'position_look'].includes(name)) yaws.push(params.yaw)
              return write(name, params)
            }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              bot._client.emit('position', { ...teleport, yaw: 30, teleportId: 1 })
              bot.look(require('../lib/conversions').fromNotchianYaw(90), 0, true)
              await once(bot, 'forcedMove')
              await new Promise(resolve => bot.once('physicsTick', resolve))
              assert.strictEqual(yaws[0], 30, 'the answer carries the teleport\'s rotation')
              assert.ok(Math.abs(yaws[1] - 90) < 1e-3, `the tick sends the forced look, not ${yaws[1]}`)
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('drops a teleport queued before a respawn but still answers pings', function (done) {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => { writes.push(name); return write(name, params) }
            let forcedMoves = 0
            const onForcedMove = () => { forcedMoves++ }
            bot.on('forcedMove', onForcedMove)
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              writes.length = 0
              const pings = !bot.supportFeature('transactionPacketExists')
              if (pings) bot._client.emit('ping', { id: 1 })
              bot._client.emit('position', { ...teleport, y: 90, teleportId: 1 })
              bot.emit('respawn')
              await sleep(150)
              assert.ok(!writes.includes('teleport_confirm'), 'the old teleport is not confirmed')
              assert.ok(!writes.includes('position_look'), 'the old teleport is not answered')
              assert.strictEqual(forcedMoves, 0, 'physics is not re-enabled by the old teleport')
              if (pings) assert.ok(writes.includes('pong'), 'the ping is still answered')
            } finally {
              bot._client.write = write
              bot.off('forcedMove', onForcedMove)
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })

      it('drops queued replies when the client leaves the play state', (done) => {
        server.on('playerJoin', async (client) => {
          try {
            client.write('login', bot.test.generateLoginPacket())
            const chunk = bot.test.buildChunk()
            chunk.setBlockType(vec3(1, 65, 1), registry.blocksByName.stone.id)
            client.write('map_chunk', generateChunkPacket(chunk))
            await once(bot, 'chunkColumnLoad')
            const teleport = {
              x: 1.5,
              y: 80,
              z: 1.5,
              dx: 0,
              dy: 0,
              dz: 0,
              pitch: 0,
              yaw: 0,
              flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
              teleportId: 0
            }
            client.write('position', teleport)
            await once(bot, 'forcedMove')

            const writes = []
            const write = bot._client.write.bind(bot._client)
            bot._client.write = (name, params) => { writes.push(name); return write(name, params) }
            try {
              await new Promise(resolve => bot.once('physicsTick', resolve))
              writes.length = 0
              bot._client.emit('position', { ...teleport, y: 90, teleportId: 1 })
              // Only the transition is simulated; the connection itself stays in play.
              bot._client.emit('state', 'configuration', 'play')
              await sleep(150)
              assert.ok(!writes.includes('position_look'), 'the teleport from the previous play session is not answered')
            } finally {
              bot._client.write = write
            }
            done()
          } catch (err) {
            done(err)
          }
        })
      })
    })

    describe('onceWithCleanup', () => {
      it('rejects instead of throwing out of emit when checkCondition throws', async () => {
        // A condition that throws used to unwind whatever was emitting. For a
        // client event that is the socket read path, which then stops delivering
        // packets entirely and the bot dies on the next keepalive.
        const emitter = new EventEmitter()
        const boom = new Error('condition blew up')
        const promise = onceWithCleanup(emitter, 'thing', {
          checkCondition: () => { throw boom }
        })
        assert.doesNotThrow(() => emitter.emit('thing'))
        await assert.rejects(promise, err => err === boom)
        assert.strictEqual(emitter.listenerCount('thing'), 0)
      })

      it('rejects and removes the listener when the signal is aborted', async () => {
        const emitter = new EventEmitter()
        const abort = new AbortController()
        const reason = new Error('no longer interested')
        const promise = onceWithCleanup(emitter, 'thing', { signal: abort.signal })
        abort.abort(reason)
        await assert.rejects(promise, err => err === reason)
        assert.strictEqual(emitter.listenerCount('thing'), 0)
      })
    })
  })
}
