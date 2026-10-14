/* eslint-env mocha */

const mineflayer = require('../')
const mc = require('minecraft-protocol')
const vec3 = require('vec3')
const assert = require('assert')
const { once } = require('../lib/promise_utils')

for (const supportedVersion of mineflayer.testedVersions) {
  const registry = require('prismarine-registry')(supportedVersion)
  const Block = require('prismarine-block')(supportedVersion)
  const Chunk = require('prismarine-chunk')(supportedVersion)
  const hasSetPassengers = registry.version['>=']('1.9')
  const usesLegacySteerVehicle = !registry.supportFeature('newPlayerInputPacket')

  describe(`mineflayer_vehicle_lifecycle ${supportedVersion}v`, function () {
    this.timeout(10 * 1000)
    let bot
    let server

    beforeEach((done) => {
      server = mc.createServer({
        'online-mode': false,
        version: supportedVersion,
        port: 25568
      })
      server.on('listening', () => {
        bot = mineflayer.createBot({
          username: 'player',
          version: supportedVersion,
          port: 25568
        })
        bot.test = {}
        bot.test.generateLoginPacket = () => {
          if (bot.supportFeature('usesLoginPacket')) {
            const loginPacket = registry.loginPacket
            loginPacket.entityId = 0
            return loginPacket
          }
          return {
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
        done()
      })
    })

    afterEach((done) => {
      bot.on('end', () => done())
      server.close()
    })

    function captureWrites () {
      const writes = []
      const oldWrite = bot._client.write
      bot._client.write = function (name, data) {
        writes.push({ name, data })
        return oldWrite.apply(bot._client, arguments)
      }
      return writes
    }

    function loginBot (client) {
      client.write('login', bot.test.generateLoginPacket())
      // like a vanilla server (PlayerList.placeNewPlayer), tell a 1.21.4+ client its level's chunks are coming: it does
      // not tick before (LocalPlayer.tick: hasClientLoaded)
      if (registry.version['>=']('1.21.4')) client.write('game_state_change', { reason: 'level_chunks_load_start', gameMode: 0 })
      client.write('position', {
        x: 0,
        y: 64,
        z: 0,
        yaw: 0,
        pitch: 0,
        flags: bot.supportFeature('positionPacketHasBitflags') ? { x: false, y: false, z: false, yaw: false, pitch: false } : 0,
        teleportId: 1
      })
    }

    function stubPassableWorld () {
      const air = Block.fromStateId(0, 0)
      bot.blockAt = () => air
      loadPlayerChunk()
    }

    // like a vanilla server, send the chunk the player stands in: 1.9 - 1.16 tick the player only in a chunk the client
    // has loaded (World.updateEntityWithOptionalForce, ClientLevel.tickNonPassenger)
    function loadPlayerChunk () {
      const column = new Chunk({ minY: bot.game.minY, worldHeight: bot.game.height })
      bot.world.setColumn(Math.floor(bot.entity.position.x / 16), Math.floor(bot.entity.position.z / 16), column)
    }

    function setupBoat (vehicleId, position, name = 'boat') {
      const boat = bot.entities[vehicleId] ?? { id: vehicleId, passengers: [] }
      boat.name = name
      boat.position = position
      boat.width = 1.375
      boat.height = 0.5625
      boat.velocity = vec3(0, 0, 0)
      boat.metadata ??= []
      boat.effects ??= []
      boat.equipment ??= []
      bot.entities[vehicleId] = boat
      bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
      return bot.entities[vehicleId]
    }

    function setupMinecart (vehicleId, position) {
      const minecart = bot.entities[vehicleId] ?? { id: vehicleId, passengers: [] }
      minecart.name = 'minecart'
      minecart.position = position
      minecart.width = 0.98
      minecart.height = 0.7
      minecart.velocity = vec3(0, 0, 0)
      minecart.metadata ??= []
      minecart.effects ??= []
      minecart.equipment ??= []
      bot.entities[vehicleId] = minecart
      bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
      return bot.entities[vehicleId]
    }

    function setupHorse (vehicleId, position) {
      const horse = bot.entities[vehicleId] ?? { id: vehicleId, passengers: [] }
      horse.name = 'horse'
      horse.position = position
      horse.width = 1.4
      horse.height = 1.6
      horse.velocity = vec3(0, 0, 0)
      horse.metadata ??= []
      horse.effects ??= []
      horse.equipment ??= []
      bot.entities[vehicleId] = horse
      bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
      return bot.entities[vehicleId]
    }

    if (usesLegacySteerVehicle) {
      it('moveVehicle(0, 0, false) sends steer_vehicle jump mask 0', (done) => {
        server.on('playerJoin', (client) => {
          loginBot(client)
          const writes = captureWrites()
          bot.moveVehicle(0, 0, false)
          const packet = writes.find(w => w.name === 'steer_vehicle')
          assert(packet, 'expected steer_vehicle packet')
          assert.strictEqual(packet.data.jump, 0)
          done()
        })
      })

      it('moveVehicle(0, 0, true) sends steer_vehicle jump mask 1', (done) => {
        server.on('playerJoin', (client) => {
          loginBot(client)
          const writes = captureWrites()
          bot.moveVehicle(0, 0, true)
          const packet = writes.find(w => w.name === 'steer_vehicle')
          assert(packet, 'expected steer_vehicle packet')
          assert.strictEqual(packet.data.jump, 0x01)
          done()
        })
      })

      it('dismount() sends steer_vehicle jump mask 2', (done) => {
        server.on('playerJoin', (client) => {
          loginBot(client)
          const vehicleId = 42
          bot.entities[vehicleId] = bot.entities[vehicleId] || { id: vehicleId, passengers: [] }
          bot.vehicle = bot.entities[vehicleId]
          const writes = captureWrites()
          bot.dismount()
          const packet = writes.find(w => w.name === 'steer_vehicle')
          assert(packet, 'expected steer_vehicle packet')
          assert.strictEqual(packet.data.jump, 0x02)
          done()
        })
      })

      if (hasSetPassengers) {
        it('keeps dismount bit on steer_vehicle until set_passengers confirms', (done) => {
          server.on('playerJoin', (client) => {
            bot.once('login', async () => {
              bot.blockAt = () => ({})
              loadPlayerChunk()

              const vehicleId = 100
              bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })

              const writes = captureWrites()
              bot.dismount()

              for (let i = 0; i < 4; i++) {
                await once(bot, 'physicsTick')
              }

              const duringDismount = writes.filter(w => w.name === 'steer_vehicle')
              assert(duringDismount.length >= 5, 'expected dismount + physics steer_vehicle packets')
              for (const packet of duringDismount) {
                assert.strictEqual(packet.data.jump & 0x02, 0x02, `expected dismount bit, got jump=${packet.data.jump}`)
                assert.notStrictEqual(packet.data.jump, 0, 'periodic steer_vehicle must not clear dismount bit')
              }

              bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [] })
              assert.strictEqual(bot.vehicle, null)

              writes.length = 0
              bot.moveVehicle(0, 0, false)
              const afterConfirm = writes.filter(w => w.name === 'steer_vehicle')
              assert.strictEqual(afterConfirm.length, 1)
              assert.strictEqual(afterConfirm[0].data.jump, 0)

              done()
            })
            loginBot(client)
          })
        })
      }
    }

    if (hasSetPassengers) {
      it('syncs mounted player state from vehicle on physicsTick', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', async () => {
            // tickPhysics bails when blockAt returns null; stub so the mounted path is testable
            // without version-specific map_chunk wiring.
            bot.blockAt = () => ({})
            loadPlayerChunk()

            const vehicleId = 100
            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
            const vehicle = bot.entities[vehicleId]
            vehicle.position = vec3(1, 63, 2)
            vehicle.velocity = vec3(0.25, 0.1, -0.5)
            vehicle.height = 1
            vehicle.onGround = true
            bot.entity.position.set(0, 50, 0)
            bot.entity.velocity.set(0, -5, 0)
            const positionRef = bot.entity.position

            await once(bot, 'physicsTick')

            assert.strictEqual(bot.entity.position, positionRef, 'position Vec3 must not be replaced')
            assert.strictEqual(bot.entity.position.x, 1)
            assert.strictEqual(bot.entity.position.y, 64)
            assert.strictEqual(bot.entity.position.z, 2)
            // the passenger keeps its own velocity: gravity after Entity.rideTick zeroed it
            assert.strictEqual(bot.entity.velocity.x, 0)
            assert.strictEqual(bot.entity.velocity.y, -0.0784000015258789)
            assert.strictEqual(bot.entity.velocity.z, 0)
            // the passenger itself is not on the ground (Entity.rideTick)
            assert.strictEqual(bot.entity.onGround, false)
            done()
          })
          loginBot(client)
        })
      })

      it('set_passengers mount and dismount lifecycle', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', () => {
            const vehicleId = 100
            let mountCount = 0
            let dismountCount = 0
            bot.on('mount', () => { mountCount++ })
            bot.on('dismount', () => { dismountCount++ })

            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
            assert.strictEqual(bot.vehicle?.id, vehicleId)
            assert.strictEqual(bot.entity.vehicle?.id, vehicleId)
            assert.strictEqual(mountCount, 1)
            assert.strictEqual(dismountCount, 0)

            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
            assert.strictEqual(mountCount, 1, 'duplicate mount packet must not re-emit mount')
            assert.strictEqual(dismountCount, 0)

            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [] })
            assert.strictEqual(bot.vehicle, null)
            assert.strictEqual(bot.entity.vehicle, undefined)
            assert.strictEqual(mountCount, 1)
            assert.strictEqual(dismountCount, 1)

            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [] })
            assert.strictEqual(dismountCount, 1, 'duplicate dismount packet must not re-emit dismount')

            done()
          })
          loginBot(client)
        })
      })

      it('snaps boat passenger position on mount and emits one move event', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', () => {
            const oldPos = bot.entity.position.clone()
            const moves = []
            bot.on('move', previousPosition => moves.push(previousPosition))

            const boat = setupBoat(100, vec3(1, 63, 2))
            // <= 1.20.1: Boat.positionRider's float (-0.1 - 0.35); 1.20.2 - 1.20.4: the float attachment + the player's
            // -0.6F; 1.20.5+: attachment - 0.6
            const f32 = Math.fround
            const expectedOffset = registry.isNewerOrEqualTo('1.20.5')
              ? -0.4125
              : registry.isNewerOrEqualTo('1.20.2') ? 0.1875 + f32(-0.6) : f32(-0.45)

            assert.strictEqual(bot.entity.position.x, boat.position.x)
            assert.strictEqual(bot.entity.position.y, boat.position.y + expectedOffset)
            assert.strictEqual(bot.entity.position.z, boat.position.z)
            assert.strictEqual(moves.length, 1)
            assert(moves[0].equals(oldPos), 'move event must contain the pre-mount position')
            done()
          })
          loginBot(client)
        })
      })

      if (['1.20.1', '1.20.2', '1.21.4'].includes(supportedVersion)) {
        it('snaps modern minecart passenger position on mount', (done) => {
          server.on('playerJoin', (client) => {
            bot.once('login', async () => {
              bot.entity.position.set(0, 50, 0)
              const oldPos = bot.entity.position.clone()
              const moves = []
              bot.on('move', previousPosition => moves.push(previousPosition))

              const minecart = setupMinecart(100, vec3(1, 63, 2))
              // 1.20.2 - 1.20.4 add the player's float ridingOffset(), -0.6F
              const expectedOffset = supportedVersion === '1.20.1' ? -0.35 : supportedVersion === '1.20.2' ? 0.1875 + Math.fround(-0.6) : -0.4125

              assert.strictEqual(bot.entity.position.x, minecart.position.x)
              assert.strictEqual(bot.entity.position.y, minecart.position.y + expectedOffset)
              assert.strictEqual(bot.entity.position.z, minecart.position.z)
              assert.strictEqual(moves.length, 1)
              assert(moves[0].equals(oldPos), 'move event must contain the pre-mount position')
              done()
            })
            loginBot(client)
          })
        })
      }

      if (supportedVersion === '1.21.4') {
        it('uses the modern bamboo raft passenger offset', (done) => {
          server.on('playerJoin', (client) => {
            bot.once('login', async () => {
              bot.entity.position.set(0, 50, 0)
              const oldPos = bot.entity.position.clone()
              const moves = []
              bot.on('move', previousPosition => moves.push(previousPosition))

              const raft = setupBoat(100, vec3(1, 63, 2), 'bamboo_raft')

              assert.strictEqual(bot.entity.position.x, raft.position.x)
              assert.ok(Math.abs(bot.entity.position.y - (raft.position.y - 0.1)) < 1e-6)
              assert.strictEqual(bot.entity.position.z, raft.position.z)
              assert.strictEqual(moves.length, 1)
              assert(moves[0].equals(oldPos), 'move event must contain the pre-mount position')
              done()
            })
            loginBot(client)
          })
        })

        it('sends player_input once on input change while riding minecart', (done) => {
          server.on('playerJoin', (client) => {
            bot.once('login', async () => {
              stubPassableWorld()
              await once(bot, 'forcedMove')
              await once(bot, 'physicsTick')

              setupMinecart(100, vec3(0, 63, 0))
              await once(bot, 'physicsTick')

              const writes = captureWrites()

              bot.setControlState('forward', true)
              for (let i = 0; i < 3; i++) {
                await once(bot, 'physicsTick')
              }

              const inputPackets = writes.filter(w => w.name === 'player_input')
              assert.strictEqual(inputPackets.length, 1, 'player_input must be sent only on input change')
              assert.strictEqual(inputPackets[0].data.inputs.forward, true)

              const countAfterForward = inputPackets.length
              for (let i = 0; i < 3; i++) {
                await once(bot, 'physicsTick')
              }
              assert.strictEqual(
                writes.filter(w => w.name === 'player_input').length,
                countAfterForward,
                'holding forward must not emit extra player_input packets'
              )

              bot.clearControlStates()
              done()
            })
            loginBot(client)
          })
        })
      }

      it('seats a horse passenger at the vanilla seat height (Entity.positionRider)', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', async () => {
            bot.entity.position.set(0, 50, 0)
            bot.blockAt = () => ({})
            loadPlayerChunk()
            const oldPos = bot.entity.position.clone()
            const moves = []
            bot.on('move', previousPosition => moves.push(previousPosition))
            const horse = setupHorse(100, vec3(1, 63, 2))
            // <= 1.20.1: 1.6F * 0.75 - 0.35; 1.20.2 - 1.20.4: (1.6F - 0.15625F) - 0.6F; 1.20.5+: 1.44375F - 0.6
            const f32 = Math.fround
            const seat = registry.version['>=']('1.20.5')
              ? f32(1.44375) - 0.6
              : registry.version['>=']('1.20.2') ? f32(f32(1.6) - f32(0.15625)) + f32(-0.6) : f32(1.6) * 0.75 - 0.35

            if (supportedVersion === '1.17.1') {
              assert.strictEqual(bot.entity.position.y, horse.position.y + seat)
              assert.strictEqual(moves.length, 1)
            } else {
              assert(bot.entity.position.equals(oldPos), 'horse mount must not resync immediately')
              assert.strictEqual(moves.length, 0)
            }

            await once(bot, 'physicsTick')
            assert.strictEqual(bot.entity.position.y, horse.position.y + seat)
            done()
          })
          loginBot(client)
        })
      })

      it('set_passengers removes absent passengers from vehicle.passengers', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', () => {
            const vehicleId = 100
            const otherPassengerId = 200
            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id, otherPassengerId] })

            const vehicle = bot.entities[vehicleId]
            assert.strictEqual(vehicle.passengers.length, 2)

            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [bot.entity.id] })
            assert.strictEqual(vehicle.passengers.length, 1)
            assert.strictEqual(vehicle.passengers[0].id, bot.entity.id)
            assert.strictEqual(bot.entities[otherPassengerId].vehicle, null)

            done()
          })
          loginBot(client)
        })
      })

      it('emits remote passenger attach and detach after updating vehicle state', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', () => {
            const firstVehicleId = 100
            const secondVehicleId = 101
            const passengerId = 200
            const events = []

            bot.on('entityAttach', (passenger, vehicle) => {
              if (passenger.id !== passengerId) return
              events.push({
                type: 'attach',
                vehicleId: vehicle.id,
                passengerVehicleId: passenger.vehicle?.id,
                vehiclePassengerIds: vehicle.passengers.map(({ id }) => id)
              })
            })
            bot.on('entityDetach', (passenger, vehicle) => {
              if (passenger.id !== passengerId) return
              events.push({
                type: 'detach',
                vehicleId: vehicle.id,
                passengerVehicleId: passenger.vehicle?.id ?? null,
                vehiclePassengerIds: vehicle.passengers.map(({ id }) => id)
              })
            })

            bot._client.emit('set_passengers', { entityId: firstVehicleId, passengers: [passengerId] })
            bot._client.emit('set_passengers', { entityId: firstVehicleId, passengers: [passengerId] })
            bot._client.emit('set_passengers', { entityId: secondVehicleId, passengers: [passengerId] })
            bot._client.emit('set_passengers', { entityId: secondVehicleId, passengers: [passengerId] })
            bot._client.emit('set_passengers', { entityId: secondVehicleId, passengers: [] })
            bot._client.emit('set_passengers', { entityId: secondVehicleId, passengers: [] })

            assert.deepStrictEqual(events, [
              { type: 'attach', vehicleId: firstVehicleId, passengerVehicleId: firstVehicleId, vehiclePassengerIds: [passengerId] },
              { type: 'detach', vehicleId: firstVehicleId, passengerVehicleId: null, vehiclePassengerIds: [] },
              { type: 'attach', vehicleId: secondVehicleId, passengerVehicleId: secondVehicleId, vehiclePassengerIds: [passengerId] },
              { type: 'detach', vehicleId: secondVehicleId, passengerVehicleId: null, vehiclePassengerIds: [] }
            ])
            assert.deepStrictEqual(bot.entities[firstVehicleId].passengers, [])
            assert.deepStrictEqual(bot.entities[secondVehicleId].passengers, [])
            assert.strictEqual(bot.entities[passengerId].vehicle, null)

            done()
          })
          loginBot(client)
        })
      })

      it('keeps the dismounted player where it sat, for the server to move it (LivingEntity.stopRiding)', (done) => {
        server.on('playerJoin', (client) => {
          bot.once('login', async () => {
            stubPassableWorld()

            const vehicleId = 100
            setupBoat(vehicleId, vec3(10, 63, 20))

            await once(bot, 'physicsTick')
            const seat = bot.entity.position.clone()
            const positionRef = bot.entity.position

            // the client does not move a dismounted player (dismountVehicle is the server's): the teleport that comes
            // with the dismount does
            bot._client.emit('set_passengers', { entityId: vehicleId, passengers: [] })

            assert.strictEqual(bot.vehicle, null)
            assert.strictEqual(bot.entity.vehicle, undefined)
            assert.strictEqual(bot.entity.position, positionRef)
            assert.ok(bot.entity.position.equals(seat), `moved to ${bot.entity.position} from ${seat}`)
            done()
          })
          loginBot(client)
        })
      })
    }

    if (usesLegacySteerVehicle) {
      it('setControlState sneak asks to dismount with the next input, on press only (LocalPlayer.tick)', (done) => {
        server.on('playerJoin', (client) => {
          loginBot(client)
          const vehicleId = 42
          bot.entities[vehicleId] = bot.entities[vehicleId] || { id: vehicleId, passengers: [] }
          bot.vehicle = bot.entities[vehicleId]

          const writes = captureWrites()
          bot.setControlState('sneak', true)
          bot.setControlState('sneak', false)
          // no packet of its own: the next input carries the dismount bit
          assert.strictEqual(writes.filter(w => w.name === 'steer_vehicle').length, 0)
          bot.moveVehicle(0, 0, false)
          const inputs = writes.filter(w => w.name === 'steer_vehicle')
          assert.strictEqual(inputs.length, 1)
          assert.strictEqual(inputs[0].data.jump, 0x02)
          done()
        })
      })
    }
  })
}
