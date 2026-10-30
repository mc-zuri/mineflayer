import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { addEntity, atLeast, LOCAL_UNIQUE, receive, spawned, started, STILL, write } from './common/entities.ts'
import { bedrockTestVersionsFrom } from './common/server.ts'

// The rides the server links, from the packets servers sent the vanilla client, recorded (as their bytes): the local
// player McZuri5840 riding a boat. Versions are grouped by how set_entity_link is laid out; each group's tests run on
// each of its versions.

/** the recorded boat the local player rides */
const BOAT = Object.freeze({ unique: -8589934590n, runtime: 2, type: 'minecraft:boat', position: { x: -12.5, y: 12, z: 41.5 } })

/** a link as the version writes it: the vehicle's angular velocity from 1.21.20 */
function link (version: BedrockVersion, ridden: bigint, rider: bigint, type: number): object {
  const angular = atLeast(version, 'bedrock_1.21.20') ? { angular_velocity: 0 } : {}
  return { ridden_entity_id: ridden, rider_entity_id: rider, type, immediate: false, rider_initiated: true, ...angular }
}

/** the rides from now, each with its rider's and vehicle's ids, and the errors */
function rides (bot: BedrockBot): string[] {
  const events: string[] = []
  for (const name of ['entityAttach', 'entityDetach'] as const) bot.on(name, (rider: Entity, vehicle: Entity) => { events.push(`${name} ${rider.id} ${vehicle.id}`) })
  bot.on('mount', () => { events.push('mount') })
  bot.on('dismount', vehicle => { events.push(`dismount ${vehicle.id}`) })
  for (const name of ['entitySpawn', 'entityGone'] as const) bot.on(name, entity => { events.push(`${name} ${entity.id}`) })
  bot.on('error', error => { events.push(`error ${error.message}`) })
  return events
}

function riders (vehicle: Entity): number[] {
  return vehicle.passengers.map(passenger => passenger.id)
}

describe('bedrock entity links', () => {
  const linkLayouts: Array<[string, BedrockVersion, BedrockVersion, string, string]> = [
    ['without an angular velocity (1.16.201 – 1.21.2)', 'bedrock_1.16.201', 'bedrock_1.21.2', '29fbffffff3ffdffffff3f010001', '29fbffffff3ffdffffff3f000001'],
    ["with the vehicle's angular velocity (1.21.20 – 1.26.60)", 'bedrock_1.21.20', latestSupportedBedrockVersion, '29fbffffff3ffdffffff3f01000100000000', '29fbffffff3ffdffffff3f00000100000000']
  ]
  for (const [layout, from, to, mounted, dismounted] of linkLayouts) {
    describe(`servers sending set_entity_link ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: mounts the local player on the recorded boat and dismounts it, in the packet pass`, async () => {
          const { bot, server, driver } = await started(version)
          write(server, 'add_entity', addEntity(version, BOAT))
          await driver.frame(0)
          const boat = spawned(bot, 2)
          const events = rides(bot)
          assert.deepStrictEqual([bot.vehicle, bot.entity.vehicle, riders(boat)], [null, null, []])
          receive(server, mounted)
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), bot.vehicle, bot.entity.vehicle, riders(boat)], [['entityAttach 1 2', 'mount'], boat, boat, [1]])
          receive(server, dismounted)
          await driver.frame(0)
          assert.deepStrictEqual([events, bot.vehicle, bot.entity.vehicle, riders(boat)], [['entityDetach 1 2', 'dismount 2'], null, null, []])
          bot.end()
        })
      }
    })
  }

  describe('servers alike on every version (the latest)', () => {
    const version = latestSupportedBedrockVersion

    it("links other entities: a rider linked to another vehicle leaves the first without entityDetach, as Java, and the local player's vehicle stays", async () => {
      const { bot, internal, server, driver } = await started(version)
      for (const [unique, runtime, type] of [[-2n, 2, 'minecraft:horse'], [-3n, 3, 'minecraft:minecart'], [-4n, 4, 'minecraft:pig']] as const) {
        write(server, 'add_entity', addEntity(version, { unique, runtime, type, position: STILL }))
      }
      await driver.frame(0)
      const [horse, minecart, pig] = [spawned(bot, 2), spawned(bot, 3), spawned(bot, 4)]
      const events = rides(bot)
      write(server, 'set_entity_link', { link: link(version, -2n, -4n, 2) })
      await driver.frame(0)
      assert.deepStrictEqual([events.splice(0), pig.vehicle, riders(horse)], [['entityAttach 4 2'], horse, [4]])
      write(server, 'set_entity_link', { link: link(version, -3n, -4n, 1) })
      write(server, 'set_entity_link', { link: link(version, -3n, -4n, 1) })
      write(server, 'set_entity_link', { link: link(version, -2n, -4n, 0) })
      await driver.frame(0)
      assert.deepStrictEqual([events.splice(0), pig.vehicle, riders(horse), riders(minecart), internal._entities.stats.unlinked], [['entityAttach 4 3', 'entityAttach 4 3'], minecart, [], [4], 1])
      write(server, 'set_entity_link', { link: link(version, -3n, -4n, 0) })
      write(server, 'set_entity_link', { link: link(version, -3n, -9n, 1) })
      write(server, 'set_entity_link', { link: link(version, -9n, -4n, 1) })
      await driver.frame(0)
      assert.deepStrictEqual([events, pig.vehicle, riders(minecart), bot.vehicle, internal._entities.stats.unknownEntity], [['entityDetach 4 3'], null, [], null, 2])
      bot.end()
    })

    it('spawns an entity with the rides add_entity shows, after its entitySpawn', async () => {
      const { bot, server, driver } = await started(version)
      const events = rides(bot)
      write(server, 'add_entity', addEntity(version, { unique: -2n, runtime: 2, type: 'minecraft:horse', position: STILL }))
      write(server, 'add_entity', addEntity(version, { unique: -4n, runtime: 4, type: 'minecraft:pig', position: STILL, links: [link(version, -2n, -4n, 1)] }))
      await driver.frame(0)
      assert.deepStrictEqual([events, spawned(bot, 4).vehicle, riders(spawned(bot, 2))], [['entitySpawn 2', 'entitySpawn 4', 'entityAttach 4 2'], spawned(bot, 2), [4]])
      bot.end()
    })

    it("ends the rides of a removed entity with it, the local player's with dismount, as Java", async () => {
      const { bot, server, driver } = await started(version)
      write(server, 'add_entity', addEntity(version, BOAT))
      write(server, 'add_entity', addEntity(version, { unique: -4n, runtime: 4, type: 'minecraft:pig', position: STILL }))
      write(server, 'add_entity', addEntity(version, { unique: -5n, runtime: 5, type: 'minecraft:horse', position: STILL }))
      write(server, 'set_entity_link', { link: link(version, BOAT.unique, LOCAL_UNIQUE, 1) })
      write(server, 'set_entity_link', { link: link(version, BOAT.unique, -4n, 2) })
      write(server, 'set_entity_link', { link: link(version, -5n, BOAT.unique, 2) })
      await driver.frame(0)
      const [boat, horse] = [spawned(bot, 2), spawned(bot, 5)]
      assert.deepStrictEqual([riders(boat), riders(horse)], [[1, 4], [2]])
      const events = rides(bot)
      write(server, 'remove_entity', { entity_id_self: -4n })
      await driver.tick()
      assert.deepStrictEqual([events.splice(0), bot.vehicle, riders(boat)], [['entityGone 4'], boat, [1]])
      write(server, 'remove_entity', { entity_id_self: BOAT.unique })
      await driver.frame(0)
      assert.deepStrictEqual([events, bot.vehicle], [[], boat])
      await driver.tick()
      assert.deepStrictEqual([events, bot.vehicle, bot.entity.vehicle, boat.vehicle, riders(horse)], [['entityGone 2', 'dismount 2'], null, null, null, []])
      bot.end()
    })
  })
})
