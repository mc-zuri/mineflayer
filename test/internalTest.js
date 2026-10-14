/* eslint-env mocha */

const mineflayer = require('../')
const vec3 = require('vec3')
const mc = require('minecraft-protocol')
const assert = require('assert')
const { sleep } = require('../lib/promise_utils')
const nbt = require('prismarine-nbt')
const { once } = require('../lib/promise_utils')
const { getPort } = require('./common/util')
const conv = require('../lib/conversions')

describe('inventory simulator', () => {
  const registry = require('prismarine-registry')(mineflayer.latestSupportedVersion)
  const Item = require('prismarine-item')(registry)
  const windows = require('prismarine-windows')(registry)
  const simulateClick = require('../lib/inventory_simulator')(Item)
  const stone = registry.itemsByName.stone.id

  function windowWith (...items) {
    const window = windows.createWindow(1, 'minecraft:generic_9x3', 'Chest', 27)
    for (const [slot, count, type = stone] of items) {
      window.updateSlot(slot, new Item(type, count))
    }
    return window
  }

  function click (window, mode, mouseButton, slot = -999, gamemode = 0, offhandWindow) {
    return simulateClick(window, {
      mode,
      mouseButton,
      slot,
      item: slot === -999 ? null : window.slots[slot]
    }, gamemode, offhandWindow)
  }

  it('distributes left and right drag clicks', () => {
    const window = windowWith()
    window.selectedItem = new Item(stone, 10)

    click(window, 5, 0)
    click(window, 5, 1, 0)
    click(window, 5, 1, 1)
    click(window, 5, 1, 2)
    assert.deepStrictEqual(click(window, 5, 2), [0, 1, 2])
    assert.deepStrictEqual(window.slots.slice(0, 3).map(item => item.count), [3, 3, 3])
    assert.strictEqual(window.selectedItem.count, 1)

    click(window, 5, 4)
    click(window, 5, 5, 3)
    assert.deepStrictEqual(click(window, 5, 6), [3])
    assert.strictEqual(window.slots[3].count, 1)
    assert.strictEqual(window.selectedItem, null)
  })

  it('duplicates full stacks and clears the cursor with creative middle drag', () => {
    const window = windowWith()
    window.selectedItem = new Item(stone, 64)

    click(window, 5, 8, -999, 1)
    click(window, 5, 9, 0, 1)
    click(window, 5, 9, 1, 1)
    assert.deepStrictEqual(click(window, 5, 10, -999, 1), [0, 1])
    assert.deepStrictEqual(window.slots.slice(0, 2).map(item => item.count), [64, 64])
    assert.strictEqual(window.selectedItem, null)
  })

  it('collects matching stacks to the cursor without overflowing it', () => {
    const dirt = registry.itemsByName.dirt.id
    const window = windowWith([0, 64], [1, 2], [2, 10, dirt])
    window.selectedItem = new Item(stone, 60)

    assert.deepStrictEqual(click(window, 6, 0, 3), [0, 1])
    assert.strictEqual(window.selectedItem.count, 64)
    assert.strictEqual(window.slots[0].count, 62)
    assert.strictEqual(window.slots[1], null)
    assert.strictEqual(window.slots[2].count, 10)
  })

  it('swaps with the offhand and passes creative mode to middle click', () => {
    const dirt = registry.itemsByName.dirt.id
    const window = windowWith([0, 1])
    const inventory = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
    inventory.updateSlot(45, new Item(dirt, 1))

    assert.deepStrictEqual(click(window, 2, 40, 0, 0, inventory), [0])
    assert.strictEqual(window.slots[0].type, dirt)
    assert.strictEqual(inventory.slots[45].type, stone)

    window.selectedItem = null
    click(window, 3, 2, 0, 1)
    assert.strictEqual(window.selectedItem.count, window.slots[0].stackSize)
  })

  it('quick-moves stacks across both sides of a container', () => {
    const window = windowWith([0, 64], [26, 32], [27, 32], [62, 64])

    assert.deepStrictEqual(click(window, 1, 0, 26), [26, 27])
    assert.strictEqual(window.slots[26], null)
    assert.strictEqual(window.slots[27].count, 64)

    assert.deepStrictEqual(click(window, 1, 0, 62), [1, 62])
    assert.strictEqual(window.slots[0].count, 64)
    assert.strictEqual(window.slots[1].count, 64)
    assert.strictEqual(window.slots[62], null)

    const fullWindow = windowWith()
    const dirt = registry.itemsByName.dirt.id
    for (let slot = 0; slot < 27; slot++) fullWindow.updateSlot(slot, new Item(dirt, 64))
    fullWindow.updateSlot(27, new Item(stone, 10))
    assert.deepStrictEqual(click(fullWindow, 1, 0, 27), [27, 54])
    assert.strictEqual(fullWindow.slots[27], null)
    assert.strictEqual(fullWindow.slots[54].count, 10)
  })

  it('quick-moves between the main inventory and hotbar boundary slots', () => {
    const window = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
    window.updateSlot(35, new Item(stone, 10))

    assert.deepStrictEqual(click(window, 1, 0, 35), [35, 36])
    assert.strictEqual(window.slots[35], null)
    assert.strictEqual(window.slots[36].count, 10)

    assert.deepStrictEqual(click(window, 1, 0, 36), [9, 36])
    assert.strictEqual(window.slots[9].count, 10)
    assert.strictEqual(window.slots[36], null)
  })

  it('quick-moves every matching stack for a shift double click', () => {
    const dirt = registry.itemsByName.dirt.id
    const window = windowWith([0, 10], [1, 20], [2, 30, dirt])
    window.selectedItem = new Item(dirt, 1)

    for (const slot of [0, 1]) click(window, 1, 0, slot)

    assert.strictEqual(window.slots[0], null)
    assert.strictEqual(window.slots[1], null)
    assert.strictEqual(window.slots[2].count, 30)
    assert.strictEqual(window.slots[62].count, 30)
    assert.strictEqual(window.selectedItem.count, 1)
  })
})

for (const supportedVersion of mineflayer.testedVersions) {
  const registry = require('prismarine-registry')(supportedVersion)
  const version = registry.version
  const Chunk = require('prismarine-chunk')(supportedVersion)

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
      // like a vanilla server (PlayerList.placeNewPlayer, respawn), tell a 1.21.4+ client its level's chunks are coming
      server.on('playerJoin', (client) => {
        if (!registry.version['>=']('1.21.4')) return
        const write = client.write.bind(client)
        client.write = (name, params) => {
          write(name, params)
          if (name === 'login' || name === 'respawn') write('game_state_change', { reason: 'level_chunks_load_start', gameMode: 0 })
        }
      })
      bot = mineflayer.createBot({
        username: 'player',
        version: supportedVersion,
        port: PORT
      })
      bot.test = {}

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
      bot.on('end', () => {
        done()
      })
      server.close()
    })
    it('entity physics is opt-in', (done) => {
      bot.once('inject_allowed', () => {
        assert.strictEqual(bot.entityPhysicsEnabled, false)
        bot.entityPhysicsEnabled = true
        assert.strictEqual(bot.entityPhysicsEnabled, true)
        done()
      })
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

    describe('digging', () => {
      it('swings while digging on physics ticks', (done) => {
        const blockPos = vec3(1, 65, 1)
        const blockId = bot.registry.blocksByName.obsidian.id
        let armAnimations = 0
        const armAnimationWaiters = []

        function waitForArmAnimations (count) {
          if (armAnimations >= count) return Promise.resolve()

          return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
              reject(new Error(`Expected ${count} arm animations, got ${armAnimations}`))
            }, 1000)

            armAnimationWaiters.push(() => {
              if (armAnimations >= count) {
                clearTimeout(timeout)
                resolve()
                return true
              }
              return false
            })
          })
        }

        server.on('playerJoin', async (client) => {
          try {
            const loginPacket = bot.test.generateLoginPacket()
            loginPacket.gameMode = 0
            client.write('login', loginPacket)
            client.on('arm_animation', () => {
              armAnimations++
              for (let i = armAnimationWaiters.length - 1; i >= 0; i--) {
                if (armAnimationWaiters[i]()) armAnimationWaiters.splice(i, 1)
              }
            })

            const chunk = bot.test.buildChunk()
            chunk.setBlockType(blockPos, blockId)
            const chunkLoaded = once(bot, 'chunkColumnLoad')
            client.write('map_chunk', generateChunkPacket(chunk))
            await chunkLoaded

            bot.game.gameMode = 'survival'
            const block = bot.blockAt(blockPos)
            assert.strictEqual(block.type, blockId)

            const digging = bot.dig(block, 'ignore').catch(err => err)
            await waitForArmAnimations(1)

            for (let i = 0; i < 6; i++) bot.emit('physicsTick')
            await sleep(10)
            assert.strictEqual(armAnimations, 1)

            bot.emit('physicsTick')
            await waitForArmAnimations(2)

            for (let i = 0; i < 7; i++) bot.emit('physicsTick')
            await waitForArmAnimations(3)

            bot.stopDigging()
            const err = await digging
            assert.strictEqual(err.message, 'Digging aborted')

            for (let i = 0; i < 7; i++) bot.emit('physicsTick')
            await sleep(10)
            assert.strictEqual(armAnimations, 3)

            done()
          } catch (err) {
            done(err)
          }
        })
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
        server.on('playerJoin', async (client) => {
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
            pitch: 0,
            yaw: 0,
            teleportId: 1,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0
          }

          bot.entity.velocity.y = -1.0 // Give bot some velocity
          bot.entity.isCollidedHorizontally = true

          const p1 = once(bot, 'forcedMove')
          const response = once(client, 'position_look')
          client.write('position', absolutePositionPacket)
          await p1
          const [responsePacket] = await response

          // Assertions for absolute teleport
          assert.strictEqual(bot.entity.velocity.y, 0, 'Velocity should be reset to 0 after an absolute teleport')
          assert.deepStrictEqual(bot.entity.position, vec3(1.5, 80, 1.5), 'Position should be set absolutely')
          if (bot.registry.isNewerOrEqualTo('1.21.3')) {
            // ClientPacketListener.handleMovePlayer answers with ServerboundMovePlayerPacket.PosRot(..., false, false)
            assert.strictEqual(responsePacket.flags.hasHorizontalCollision, false,
              'Teleport response is not on the ground and has no horizontal collision')
          }

          // --- Test 2: Relative Position ---
          const relativePositionPacket = {
            x: 1.0,
            y: -2.0,
            z: 0.5,
            pitch: 0,
            yaw: 0,
            teleportId: 2,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: true, y: true, z: true, yaw: false, pitch: false } : 7
          }

          // Set a known velocity *before* the relative update
          bot.entity.velocity.y = -1.0
          const initialPosition = bot.entity.position.clone()
          const expectedPosition = initialPosition.plus(vec3(1.0, -2.0, 0.5))

          const p2 = once(bot, 'forcedMove')
          client.write('position', relativePositionPacket)
          await p2

          // Assertions for relative teleport
          assert.notStrictEqual(bot.entity.velocity.y, 0, 'Velocity should be preserved after a relative teleport')
          assert.deepStrictEqual(bot.entity.position, expectedPosition, 'Position should be updated relatively')

          done()
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
            pitch: 0,
            yaw: 0,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 0
          })
        })
      })
      it('physicsManual runs a tick only on bot.physicsTick()', async () => {
        const manual = mineflayer.createBot({ username: 'manual', version: supportedVersion, port: PORT, physicsManual: true })
        try {
          let client
          do [client] = await once(server, 'playerJoin'); while (client.username !== 'manual')
          client.write('login', bot.test.generateLoginPacket())
          const chunk = bot.test.buildChunk()
          chunk.setBlockType(pos, goldId)
          client.write('map_chunk', generateChunkPacket(chunk))
          await once(manual, 'chunkColumnLoad')
          const reply = once(client, 'position_look')
          client.write('position', {
            x: 1.5,
            y: 80,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 1
          })
          await reply

          let ticks = 0
          manual.on('physicsTick', () => ticks++)
          const moves = []
          client.on('packet', (data, { name }) => {
            if (['position', 'position_look', 'look', 'flying'].includes(name)) moves.push(name)
          })
          await sleep(300)
          assert.strictEqual(ticks, 0, 'no tick runs on its own')
          assert.deepStrictEqual(moves, [])

          manual.physicsTick()
          manual.physicsTick()
          manual.physicsTick()
          assert.strictEqual(ticks, 3)
          // falling toward the gold block, the bot moved and told the server
          assert.ok(manual.entity.position.y < 80)
          await sleep(100)
          assert.ok(moves.includes('position'), moves.join())
        } finally {
          manual.end()
        }
      })

      // A bot stepped tick by tick (physicsManual), standing on the gold block, and the tick of each packet it writes.
      async function standingManualBot ({ levelLoaded = null } = {}) {
        const manual = mineflayer.createBot({ username: 'manual', version: supportedVersion, port: PORT, physicsManual: true })
        manual.levelLoaded = levelLoaded
        let client
        do [client] = await once(server, 'playerJoin'); while (client.username !== 'manual')
        client.write('login', bot.test.generateLoginPacket())
        client.write('update_health', { health: 20, food: 20, foodSaturation: 5 })
        const chunk = bot.test.buildChunk()
        chunk.setBlockType(pos, goldId)
        client.write('map_chunk', generateChunkPacket(chunk))
        await once(manual, 'chunkColumnLoad')
        const reply = once(client, 'position_look')
        client.write('position', {
          x: 1.5,
          y: pos.y + 1,
          z: 1.5,
          pitch: 0,
          yaw: 0,
          flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
          teleportId: 1
        })
        await reply
        // the teleport's answer is not what the bot last sent: its first tick sends the position, as vanilla's does
        manual.physicsTick()
        const written = []
        let tick = 0
        const write = manual._client.write.bind(manual._client)
        manual._client.write = (name, params) => {
          written.push({ tick, name })
          write(name, params)
        }
        return {
          manual,
          client,
          written,
          runTicks (count) {
            for (let i = 0; i < count; i++) {
              tick++
              manual.physicsTick()
            }
          }
        }
      }

      it('a bot standing still sends its position every 20 ticks, 1.8 every 21 (LocalPlayer.positionReminder)', async () => {
        const { manual, written, runTicks } = await standingManualBot()
        try {
          runTicks(43)
          const reminders = manual.registry.isNewerOrEqualTo('1.9') ? [20, 40] : [21, 42]
          assert.deepStrictEqual(written.filter(p => p.name === 'position').map(p => p.tick), reminders)
          assert.strictEqual(manual.entity.position.y, pos.y + 1)
        } finally {
          manual.end()
        }
      })

      it('a teleport is answered straight, without counting as the position sent (ClientPacketListener.handleMovePlayer)', async () => {
        const { manual, client, written, runTicks } = await standingManualBot()
        try {
          runTicks(5)
          written.length = 0
          const answer = once(client, 'position_look')
          client.write('position', {
            x: 3.5,
            y: pos.y + 1,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 2
          })
          const [packet] = await answer
          assert.strictEqual(packet.x, 3.5)
          assert.strictEqual(packet.onGround ?? packet.flags.onGround, false)
          // 1.21.2 - 1.21.3 answer before confirming the teleport
          const answerFirst = manual.registry.version['>=']('1.21.2') && manual.registry.version['<']('1.21.4')
          const expected = !manual.supportFeature('teleportUsesOwnPacket') ? ['position_look'] : answerFirst ? ['position_look', 'teleport_confirm'] : ['teleport_confirm', 'position_look']
          assert.deepStrictEqual(written.map(p => p.name), expected)
          // what the bot last sent is still the spot it stood on, so its next tick sends the new position
          written.length = 0
          runTicks(1)
          assert.ok(written.some(p => p.name === 'position'), `sent ${written.map(p => p.name)}`)
        } finally {
          manual.end()
        }
      })

      it('a rotation from the server is answered with the rotation set (ClientPacketListener.handleRotatePlayer)', async function () {
        const { manual, client } = await standingManualBot()
        try {
          if (!manual.registry.version['>=']('1.21.2')) return this.skip()
          const answer = once(client, 'look')
          client.write('player_rotation', { yaw: 90, relativeYaw: false, pitch: 10, relativePitch: false })
          const [packet] = await answer
          assert.strictEqual(packet.yaw, 90)
          assert.strictEqual(packet.pitch, 10)
          assert.strictEqual(packet.flags.onGround, false)
        } finally {
          manual.end()
        }
      })

      it('a dead bot moves and sends until its 20th tick removes it (LivingEntity.tickDeath)', async () => {
        const { manual, client, written, runTicks } = await standingManualBot()
        try {
          const died = once(manual, 'death')
          client.write('update_health', { health: 0, food: 20, foodSaturation: 5 })
          await died
          runTicks(30)
          // standing still it sends its position every 20 ticks (21 on 1.8): the 20th tick after its death is its last
          const sent = written.filter(p => p.name === 'position').map(p => p.tick)
          assert.deepStrictEqual(sent, manual.registry.isNewerOrEqualTo('1.9') ? [20] : [])
          if (!manual.registry.isNewerOrEqualTo('1.9')) assert.deepStrictEqual(written.filter(p => p.name === 'flying').map(p => p.tick).at(-1), 20)
        } finally {
          manual.end()
        }
      })

      it('a teleport after a death is answered at once (ClientPacketListener.handleMovePlayer)', async () => {
        const { manual, client } = await standingManualBot()
        try {
          const died = once(manual, 'death')
          client.write('update_health', { health: 0, food: 20, foodSaturation: 5 })
          await died
          const answer = once(client, 'position_look')
          const sentAt = Date.now()
          client.write('position', {
            x: 1.5,
            y: pos.y + 1,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 2
          })
          await answer
          assert.ok(Date.now() - sentAt < 1000, `answered after ${Date.now() - sentAt} ms`)
        } finally {
          manual.end()
        }
      })

      it('a bot outside the loaded chunks still ends its client tick (ServerboundClientTickEndPacket)', async () => {
        const { manual, client, written, runTicks } = await standingManualBot()
        try {
          const answer = once(client, 'position_look')
          client.write('position', {
            x: 1000.5,
            y: pos.y + 1,
            z: 1000.5,
            pitch: 0,
            yaw: 0,
            flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 2
          })
          await answer
          written.length = 0
          runTicks(3)
          assert.deepStrictEqual(written.map(p => p.name), manual.registry.isNewerOrEqualTo('1.21.3') ? ['tick_end', 'tick_end', 'tick_end'] : [])
        } finally {
          manual.end()
        }
      })

      it('a 1.21.4+ bot does not move until the client has loaded the level (LocalPlayer.tick: hasClientLoaded)', async function () {
        if (version['<']('1.21.4')) return this.skip()
        let loaded = false
        const { manual, written, runTicks } = await standingManualBot({ levelLoaded: () => loaded })
        try {
          runTicks(30)
          assert.deepStrictEqual([...new Set(written.map(p => p.name))], ['tick_end'])
          assert.strictEqual(manual.entity.velocity.y, 0)
          loaded = true
          written.length = 0
          runTicks(1)
          assert.deepStrictEqual(written.map(p => p.name).slice(0, 2), ['player_loaded', 'position'])
        } finally {
          manual.end()
        }
      })

      it('a bot put to sleep lies on the bed and looks ahead (LivingEntity.setPosToBed)', async function () {
        if (version['<']('1.19.3')) return this.skip() // the test writes the metadata type by name
        const { manual, client, runTicks } = await standingManualBot()
        try {
          const updated = once(manual, 'entityUpdate')
          client.write('entity_metadata', {
            entityId: manual.entity.id,
            metadata: [{ key: 6, type: 'pose', value: 2 }, { key: 14, type: 'optional_block_pos', value: { x: 3, y: pos.y + 1, z: 1 } }]
          })
          await updated
          assert.deepStrictEqual(manual.entity.position, vec3(3.5, pos.y + 1.6875, 1.5))
          manual.look(0, 0.5, true)
          runTicks(1)
          assert.strictEqual(manual.entity.pitch, 0)
        } finally {
          manual.end()
        }
      })

      it('a bot landing tells the server it is on the ground (ServerboundMovePlayerPacket.StatusOnly)', async () => {
        const { manual, client, runTicks } = await standingManualBot()
        try {
          // the teleport left the bot off the ground and still: its second tick lands it on the block without moving it
          // (1.8 - 1.11 send one every tick; the landing tick's is the last)
          const statuses = []
          client.on('flying', packet => statuses.push(packet))
          runTicks(2)
          await sleep(100)
          const packet = statuses.at(-1)
          assert.strictEqual(manual.registry.isNewerOrEqualTo('1.21.3') ? packet.flags.onGround : packet.onGround, true)
        } finally {
          manual.end()
        }
      })

      it('a bot standing still sends a status-only move every tick on 1.8 only', async () => {
        const { manual, written, runTicks } = await standingManualBot()
        try {
          runTicks(2) // lands on the block
          const before = written.length
          runTicks(10)
          const idle = written.slice(before).filter(p => p.name === 'flying').length
          assert.strictEqual(idle, manual.registry.isNewerOrEqualTo('1.9') ? 0 : 10)
        } finally {
          manual.end()
        }
      })

      it('sneaking is told by the player command before 1.21.6, by player_input only since', async () => {
        const { manual, written, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          manual.setControlState('sneak', true)
          const before = written.length
          runTicks(1)
          const sent = written.slice(before).map(p => p.name)
          assert.strictEqual(sent.includes('entity_action'), !manual.registry.isNewerOrEqualTo('1.21.6'), sent.join())
        } finally {
          manual.end()
        }
      })

      it('the bot\'s pose synced back by the server refits its box (Entity.refreshDimensions, 1.14 - 1.16)', async function () {
        if (supportedVersion !== '1.16.5') this.skip() // the recording's version
        const { manual, client, runTicks } = await standingManualBot()
        try {
          // j_sneak_fr (1.16.5): sneaking forward and right at yaw 0 on flat ground from x 0.5; the server echoes the
          // crouching pose before tick 4, which refits the box on its lower corner and moves x by an ulp from then on
          const floor = bot.test.buildChunk()
          for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) floor.setBlockType(vec3(x, pos.y, z), goldId)
          client.write('map_chunk', generateChunkPacket(floor))
          const teleported = once(client, 'position_look')
          client.write('position', { x: 0.5, y: pos.y + 1, z: 1.5, pitch: 0, yaw: 0, flags: 0, teleportId: 2 })
          await teleported
          runTicks(2) // lands on the floor
          for (const key of ['forward', 'right', 'sneak']) manual.setControlState(key, true)
          runTicks(3)
          assert.strictEqual(manual.entity.position.x, 0.2947488879121817)
          const synced = once(manual._client, 'entity_metadata')
          client.write('entity_metadata', { entityId: manual.entity.id, metadata: [{ key: 6, type: 18, value: 5 }] })
          await synced
          runTicks(2)
          assert.strictEqual(manual.entity.position.x, 0.1637354082452381)
        } finally {
          manual.end()
        }
      })

      it('the server reads the sprint start as START_SPRINTING (the player command renumbered in 1.21.6)', async () => {
        const { manual, client, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          const command = once(client, 'entity_action')
          manual.setControlState('forward', true)
          manual.setControlState('sprint', true)
          runTicks(1)
          const [packet] = await command
          assert.strictEqual(packet.actionId, 'start_sprinting')
        } finally {
          manual.end()
        }
      })

      it('the server\'s swimming flag and pose apply to the bot (ClientPacketListener.handleSetEntityData)', async function () {
        // (the pose is entity data from 1.14, swimming from 1.13)
        const data = require('minecraft-data')(supportedVersion)
        if (!data.isNewerOrEqualTo('1.14')) return this.skip()
        const byName = data.supportFeature('mcDataHasEntityMetadata')
        const poseType = byName ? 'pose' : data.supportFeature('entityMetadataHasLong') ? 19 : 18
        const { manual, client, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          const update = once(manual, 'entityUpdate')
          client.write('entity_metadata', {
            entityId: manual.entity.id,
            metadata: [{ key: 0, type: byName ? 'byte' : 0, value: 0x10 }, { key: 6, type: poseType, value: 3 }]
          })
          await update
          assert.strictEqual(manual.entity.swimming, true)
          assert.strictEqual(manual.entity.pose, 3)
        } finally {
          manual.end()
        }
      })

      it('the bot flies when the abilities packet says so (ClientPacketListener.handlePlayerAbilities)', async () => {
        const { manual, client, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          const abilities = once(manual, 'abilities')
          client.write('abilities', { flags: 2 | 4, flyingSpeed: 0.05, walkingSpeed: 0.1 })
          await abilities
          // a flying player has no gravity: standing still in the air it keeps its height
          manual.entity.position.y += 2
          manual.entity.velocity.set(0, 0, 0)
          runTicks(3)
          assert.strictEqual(manual.entity.flying, true)
          assert.strictEqual(manual.entity.position.y, pos.y + 3)
        } finally {
          manual.end()
        }
      })

      it('the sprint goes before the shift key, from 1.21.2 after it (LocalPlayer.sendPosition, LocalPlayer.tick)', async () => {
        const { manual, client, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          manual.setControlState('forward', true)
          manual.setControlState('sprint', true)
          runTicks(3)
          await sleep(100)
          // one tick stops the sprint and presses the shift key
          const actions = []
          client.on('entity_action', packet => actions.push(packet.actionId))
          manual.clearControlStates()
          manual.setControlState('sneak', true)
          runTicks(1)
          await sleep(100)
          const expected = manual.registry.isNewerOrEqualTo('1.21.6')
            ? ['stop_sprinting']
            : manual.registry.isNewerOrEqualTo('1.21.2') ? ['start_sneaking', 'stop_sprinting'] : ['stop_sprinting', 'start_sneaking']
          assert.deepStrictEqual(actions, expected)
        } finally {
          manual.end()
        }
      })

      // The standing bot given an elytra and put 20 blocks up, falling for three ticks.
      async function fallingWithElytra () {
        const Item = require('prismarine-item')(supportedVersion)
        const itemRegistry = require('minecraft-data')(supportedVersion)
        const standing = await standingManualBot()
        const { manual, client, runTicks } = standing
        const equipped = once(manual.inventory, 'updateSlot:6')
        client.write('set_slot', { windowId: 0, stateId: 0, slot: 6, item: Item.toNotch(new Item(itemRegistry.itemsByName.elytra.id, 1)) })
        await equipped
        const reply = once(client, 'position_look')
        client.write('position', {
          x: 1.5,
          y: pos.y + 20,
          z: 1.5,
          pitch: 0,
          yaw: 0,
          flags: manual.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
          teleportId: 2
        })
        await reply
        runTicks(3)
        return standing
      }

      it('a press of jump while falling with an elytra asks to glide before the move (LocalPlayer.aiStep)', async function () {
        if (!require('minecraft-data')(supportedVersion).itemsByName.elytra) return this.skip() // 1.9+
        const { manual, client, written, runTicks } = await fallingWithElytra()
        try {
          const command = once(client, 'entity_action')
          manual.setControlState('jump', true)
          const before = written.length
          runTicks(1)
          const sent = written.slice(before).map(p => p.name)
          assert.strictEqual(sent[0], 'entity_action', sent.join())
          const [packet] = await command
          assert.strictEqual(packet.actionId, 'start_fall_flying')
        } finally {
          manual.end()
        }
      })

      it('a rocket attached to the gliding bot boosts it until the server removes it (FireworkRocketEntity.tick)', async function () {
        const itemRegistry = require('minecraft-data')(supportedVersion)
        const byName = itemRegistry.supportFeature('mcDataHasEntityMetadata')
        // (the attachment's metadata entry by name, with minecraft-data's metadata keys)
        if (!itemRegistry.itemsByName.elytra || !byName) return this.skip()
        const { manual, client, runTicks } = await fallingWithElytra()
        try {
          manual.setControlState('jump', true)
          runTicks(1)
          manual.setControlState('jump', false)
          manual.look(0, Math.PI / 2, true) // straight up, staying over the one loaded chunk
          // the server's glide flag (shared flag 0x80, a signed byte), which starts the glide before 1.15
          client.write('entity_metadata', { entityId: manual.entity.id, metadata: [{ key: 0, type: 'byte', value: -128 }] })
          const rocketType = itemRegistry.entitiesByName.firework_rocket ?? itemRegistry.entitiesByName.fireworks_rocket
          const used = once(manual, 'usedFirework')
          client.write('spawn_entity', {
            entityId: 99,
            objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
            type: rocketType.id,
            x: 1.5,
            y: pos.y + 20,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            headPitch: 0,
            objectData: 0,
            velocity: { x: 0, y: 0, z: 0 },
            velocityX: 0,
            velocityY: 0,
            velocityZ: 0
          })
          const attached = { key: rocketType.metadataKeys.indexOf('attached_to_target'), type: 'optional_unsigned_int', value: manual.entity.id + 1 }
          client.write('entity_metadata', { entityId: 99, metadata: [attached] })
          await used
          assert.strictEqual(manual.fireworkRockets, 1)
          runTicks(60) // longer than any rocket's own lifetime: the boost lasts while the server keeps the rocket
          assert.ok(manual.entity.velocity.y > 1.5, String(manual.entity.velocity))
          const gone = once(manual, 'entityGone')
          client.write('entity_destroy', { entityIds: [99] })
          await gone
          assert.strictEqual(manual.fireworkRockets, 0)
          const speed = manual.entity.velocity.y
          runTicks(1)
          assert.ok(manual.entity.velocity.y < speed, 'no boost once the rocket is gone')
        } finally {
          manual.end()
        }
      })

      it('before 1.14 a rocket naming entity 0 attaches to nothing (EntityFireworkRocket.wasShotByEntity: id > 0)', async function () {
        const itemRegistry = require('minecraft-data')(supportedVersion)
        if (!itemRegistry.supportFeature('fireworkMetadataVarInt7')) return this.skip() // 1.11 - 1.13
        const { manual, client } = await standingManualBot()
        try {
          assert.strictEqual(manual.entity.id, 0)
          client.write('spawn_entity', {
            entityId: 99,
            objectUUID: '00112233-4455-6677-8899-aabbccddeeff',
            type: itemRegistry.entitiesByName.fireworks_rocket.id,
            x: 1.5,
            y: pos.y + 1,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            objectData: 0,
            velocity: { x: 0, y: 0, z: 0 }
          })
          const updated = once(manual, 'entityUpdate')
          client.write('entity_metadata', { entityId: 99, metadata: [{ key: 7, type: 1, value: 0 }] })
          await updated
          assert.strictEqual(manual.fireworkRockets, 0)
        } finally {
          manual.end()
        }
      })

      it('a move is sent past 0.03 blocks, from 1.19 past 2.0E-4 (LocalPlayer.sendPosition)', async () => {
        const { manual, written, runTicks } = await standingManualBot()
        try {
          runTicks(1)
          // the moves come from here, not the physics: the packets still go every tick
          manual.physicsEnabled = false
          const sentPositions = () => written.filter(p => p.name === 'position').length

          manual.entity.position.x += 0.01
          runTicks(1)
          assert.strictEqual(sentPositions(), manual.registry.isNewerOrEqualTo('1.19') ? 1 : 0)

          manual.entity.position.x += 0.04
          runTicks(1)
          assert.strictEqual(sentPositions(), manual.registry.isNewerOrEqualTo('1.19') ? 2 : 1)
        } finally {
          manual.end()
        }
      })

      it('the look goes as the float degrees the player holds, unwrapped and without -0 (LocalPlayer.sendPosition)', async () => {
        const { manual, client, runTicks } = await standingManualBot()
        try {
          runTicks(2)
          // the server turns the player to 270 degrees, not wrapped to -90
          const reply = once(client, 'position_look')
          client.write('position', {
            x: 0,
            y: 0,
            z: 0,
            yaw: 270,
            pitch: 0,
            flags: manual.supportFeature('positionPacketHasBitflags') ? { x: true, y: true, z: true, yaw: false, pitch: false } : 7,
            teleportId: 2
          })
          await reply
          const look = once(client, 'look')
          runTicks(1)
          const [packet] = await look
          assert.strictEqual(packet.yaw, 270)
          assert.ok(Object.is(packet.pitch, 0), `pitch ${Object.is(packet.pitch, -0) ? '-0' : packet.pitch}`)
        } finally {
          manual.end()
        }
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

    describe('health', () => {
      it('notifies 1.21.4+ servers when the player has loaded, once its chunk is (LevelLoadStatusManager)', function (done) {
        if (version['<']('1.21.4')) this.skip()
        server.on('playerJoin', async (client) => {
          let chunkSent = false
          client.once('player_loaded', () => {
            assert.ok(chunkSent, 'player_loaded came before the chunk of the player')
            done()
          })
          // the login is followed by level_chunks_load_start (see beforeEach)
          await client.write('login', bot.test.generateLoginPacket())
          await client.write('update_health', { health: 20, food: 20, foodSaturation: 0 })
          await client.write('position', {
            x: 1.5,
            y: 80,
            z: 1.5,
            pitch: 0,
            yaw: 0,
            flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
            teleportId: 1
          })
          await new Promise(resolve => setTimeout(resolve, 300))
          chunkSent = true
          await client.write('map_chunk', generateChunkPacket(bot.test.buildChunk()))
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

      it('does not crash when skin texture is valid JSON', (done) => {
        const validJson = JSON.stringify({
          textures: {
            SKIN: {
              url: 'http://textures.minecraft.net/texture/def456',
              metadata: { model: 'default' }
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
              velocity: { x: 0, y: 0, z: 0 }
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

      it('metadata', (done) => {
        server.on('playerJoin', (client) => {
          bot.on('entitySpawn', (entity) => {
            assert.strictEqual(entity.displayName, 'Creeper')
            if (typeof entity.headYaw === 'number') {
              assert.strictEqual(entity.pitch, conv.fromNotchianPitchByte(14))
              assert.strictEqual(entity.headYaw, conv.fromNotchianYawByte(14))
              assert.strictEqual(entity.headPitch, undefined)
            }

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

    describe('item use', () => {
      // MultiPlayerGameMode.useItem (q_shield_walk and the other q_ cases): 1.17 - 1.20.6 send the position and look
      // just before the use (vanilla 1.20.4: position_look 0.5 101 38.5, yaw 0, pitch 0, on the ground)
      it('sends the position and look before using an item only from 1.17 to 1.20.6', function (done) {
        if (!bot.supportFeature('useItemWithOwnPacket')) return this.skip()
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
        })
        bot.once('login', () => {
          bot.entity.position.set(0.5, 101, 38.5)
          bot.entity.onGround = true
          bot.entity.yaw = Math.PI
          bot.entity.yawDegrees = undefined
          bot.entity.pitch = 0
          bot.entity.pitchDegrees = undefined
          const written = []
          const write = bot._client.write.bind(bot._client)
          bot._client.write = (name, params) => written.push({ name, params })
          bot.activateItem()
          bot._client.write = write
          if (bot.registry.version['>=']('1.17') && bot.registry.version['<']('1.21')) {
            assert.deepStrictEqual(written.map(p => p.name), ['position_look', 'use_item'])
            const { x, y, z, yaw, pitch, onGround } = written[0].params
            assert.deepStrictEqual([x, y, z, yaw, pitch, onGround], [0.5, 101, 38.5, 0, 0, true])
          } else {
            assert.deepStrictEqual(written.map(p => p.name), ['use_item'])
          }
          done()
        })
      })

      // LivingEntity.updatingUsingItem goes on using an item the server only resends (q_crossbow_load_walk: the
      // charged crossbow's set_slot): only a change of the held item's type or count stops it
      it('keeps using the held item when the server resends it unchanged', (done) => {
        const Item = require('prismarine-item')(supportedVersion)
        const notchItem = Item.toNotch(new Item(registry.itemsByName.stone.id, 1))
        server.on('playerJoin', (client) => {
          client.write('login', bot.test.generateLoginPacket())
          client.write('held_item_slot', { slot: 0 })
          setTimeout(() => {
            bot.once('heldItemChanged', () => {
              bot.activateItem()
              bot.once('heldItemChanged', () => {
                assert.strictEqual(bot.usingHeldItem, true)
                done()
              })
              client.write('set_slot', { windowId: 0, stateId: 1, slot: 36, item: notchItem })
            })
            client.write('set_slot', { windowId: 0, stateId: 0, slot: 36, item: notchItem })
          }, 100)
        })
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
          bot.activateItem()
        })
      })
    })
  })
}
