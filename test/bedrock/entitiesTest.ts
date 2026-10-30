import assert from 'assert'
import type { Entity } from 'prismarine-entity'
import prismarineRegistry from 'prismarine-registry'
import { metadataKeyNumbers } from '../../lib/bedrock/metadata.ts'
import { latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBot, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, atLeast, boundingBox, entry, flags, LOCAL_UNIQUE, placed, positionOf, receive, runtimeId, spawned, started, STILL, write } from './common/entities.ts'
import type { Added } from './common/entities.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3 } from './common/world.ts'

// The entities the server shows, from the packets and values servers sent the vanilla client, recorded (small packets
// as their bytes). Versions are grouped by how the packets are laid out, how the metadata's flags are written and what
// minecraft-data knows of the entities; each group's tests run on each of its versions.

type EntityEventName = 'entitySpawn' | 'entityGone' | 'entityMoved' | 'entityUpdate' | 'entitySwingArm' | 'entityHurt' | 'entityDead' |
  'entityTaming' | 'entityTamed' | 'entityShakingOffWater' | 'entityEatingGrass' | 'entityWake' | 'entityEat' | 'entityCriticalEffect' |
  'entityMagicCriticalEffect' | 'entityCrouch' | 'entityUncrouch' | 'entitySleep' | 'entityElytraFlew' | 'entityAttributes' | 'itemDrop'

const SNEAKING = 1n << 1n
const GLIDING = 1n << 32n
const SLEEPING_EXTENDED = 1n << 11n
/** the recorded villager's: can_climb, walker, has_collision, affected_by_gravity, container_private */
const VILLAGER_FLAGS = 18858823444332544n
const EVENTS: readonly EntityEventName[] = Object.freeze(['entitySpawn', 'entityGone', 'entityMoved', 'entityUpdate', 'entitySwingArm', 'entityHurt', 'entityDead',
  'entityTaming', 'entityTamed', 'entityShakingOffWater', 'entityEatingGrass', 'entityWake', 'entityEat', 'entityCriticalEffect',
  'entityMagicCriticalEffect', 'entityCrouch', 'entityUncrouch', 'entitySleep', 'entityElytraFlew', 'entityAttributes', 'itemDrop'])

function extendedFlags (version: BedrockVersion, bits: bigint): object {
  return entry(version, 'flags_extended', 'long', version === 'bedrock_1.16.201' ? bits : { _value: bits })
}

const DELTA_FLAGS = Object.freeze(['has_x', 'has_y', 'has_z', 'has_rot_x', 'has_rot_y', 'has_rot_z', 'on_ground', 'teleport', 'force_move'])

/** move_entity_delta's flags up to 1.26.30, every one named: the fields are written by their names */
function deltaFlags (...set: string[]): object {
  const named = Object.fromEntries(DELTA_FLAGS.map(name => [name, set.includes(name)]))
  return { _value: DELTA_FLAGS.reduce((bits, name, bit) => set.includes(name) ? bits | 1 << bit : bits, 0), ...named }
}

/** the recorded move of a boat on water, along y only, as the version's servers send it */
function deltaOnlyY (version: BedrockVersion): string {
  if (atLeast(version, 'bedrock_1.26.51')) return '6f020001705f3f41000000000000000000'
  if (atLeast(version, 'bedrock_1.26.40')) return '6f020001705f3f410000000000000000'
  return atLeast(version, 'bedrock_1.26.20') ? '6f0202fc705f3f41' : '6f0202fe705f3f41'
}

function addItem (version: BedrockVersion, { unique, runtime, position, velocity = STILL, metadata = [] }: Omit<Added, 'type'>): object {
  return { entity_id_self: unique, runtime_entity_id: runtimeId(version, runtime), ...placed(version, position, velocity), metadata }
}

/** the recorded villager (1.26.60), its metadata as the version writes it */
function villager (version: BedrockVersion): Added {
  return {
    unique: -8589934590n,
    runtime: 4,
    type: 'minecraft:villager_v2',
    position: { x: 2.5, y: -60, z: 0.5 },
    velocity: { x: 0, y: -0.000009999999747378752, z: 0 },
    yaw: 90,
    attributes: [{ name: 'minecraft:health', min: 0, value: 20, max: 20 }, { name: 'minecraft:movement', min: 0, value: 0.5, max: 3.4028234663852886e38 }],
    metadata: [flags(version, VILLAGER_FLAGS), entry(version, 'nametag', 'string', ''), entry(version, 'owner_eid', 'long', -1n), ...boundingBox(version, 0.6000000238418579, 1.899999976158142)]
  }
}

/** the entity events from now, each with its entity's id, and the errors */
function recorded (bot: BedrockBot): string[] {
  const events: string[] = []
  for (const name of EVENTS) bot.on(name, (entity: Entity) => { events.push(`${name} ${entity.id}`) })
  bot.on('error', error => { events.push(`error ${error.message}`) })
  return events
}

describe('bedrock entities', () => {
  const keyNumberings: Array<[string, BedrockVersion, BedrockVersion, Array<number | undefined>]> = [
    ['the flags named index, the keys from 85 one lower (1.16.201)', 'bedrock_1.16.201', 'bedrock_1.16.201', [0, undefined, 1, 4, 15, 26, 53, 54, 91]],
    ['the flags named flags (1.16.210 – 1.26.60)', 'bedrock_1.16.210', latestSupportedBedrockVersion, [undefined, 0, 1, 4, 15, 26, 53, 54, 92]]
  ]
  for (const [numbering, from, to, numbers] of keyNumberings) {
    describe(`metadata keys numbered with ${numbering}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: numbers the keys as the protocol does`, () => {
          const keys = metadataKeyNumbers(prismarineRegistry(version))
          const names = ['index', 'flags', 'health', 'nametag', 'experience_value', 'player_flags', 'boundingbox_width', 'boundingbox_height', 'flags_extended']
          assert.deepStrictEqual(names.map(name => keys.get(name)), numbers)
        })
      }
    })
  }

  const addEntityLayouts: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['x, y, z and the speeds (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210'],
    ['a position and a velocity (1.16.220 – 1.19.1)', 'bedrock_1.16.220', 'bedrock_1.19.1'],
    ['unique_id and runtime_id (1.19.10 – 1.26.60)', 'bedrock_1.19.10', latestSupportedBedrockVersion]
  ]
  for (const [layout, from, to] of addEntityLayouts) {
    describe(`servers sending add_entity with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: spawns the recorded villager in the packet pass, as the metadata and the attributes say`, async () => {
          const { bot, internal, server, driver } = await started(version)
          const events = recorded(bot)
          write(server, 'add_entity', addEntity(version, villager(version)))
          await driver.frame(0)
          assert.deepStrictEqual(events, ['entitySpawn 4'])
          const entity = spawned(bot, 4)
          assert.strictEqual(entity.name, 'villager_v2')
          assert.deepStrictEqual([positionOf(entity), entity.velocity.y, entity.yaw, entity.headYaw, entity.pitch], [{ x: 2.5, y: -60, z: 0.5 }, -0.000009999999747378752, Math.PI / 2, Math.PI / 2, 0])
          assert.deepStrictEqual([entity.width, entity.height], [0.6000000238418579, 1.899999976158142])
          assert.deepStrictEqual([entity.metadata[0], entity.metadata[4], entity.metadata[5]], [VILLAGER_FLAGS, '', -1n])
          assert.deepStrictEqual([entity.crouching, entity.elytraFlying, entity.getCustomName()], [false, false, null])
          assert.deepStrictEqual(entity.attributes, { 'minecraft:health': { value: 20, modifiers: [] }, 'minecraft:movement': { value: 0.5, modifiers: [] } })
          assert.strictEqual(internal._entities.byUniqueId(-8589934590n), entity)
          assert.strictEqual(internal._entities.byRuntimeId(4n), entity)
          await driver.tick()
          assert.deepStrictEqual(events, ['entitySpawn 4'])
          bot.end()
        })
      }
    })
  }

  const registryEntities: Array<[string, BedrockVersion, BedrockVersion, Pick<Entity, 'type' | 'kind' | 'displayName' | 'entityType' | 'width' | 'height'>, number]> = [
    ['none (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210', { type: 'other', kind: 'unknown', width: 0, height: 0 }, 0],
    ['those of 1.18.11 (1.16.220 – 1.18.30)', 'bedrock_1.16.220', 'bedrock_1.18.30', { type: 'animal', kind: 'UNKNOWN', displayName: 'Pig', entityType: 2, width: 0, height: 0.9 }, 0.25],
    ['those of 1.19.1, without types or sizes (1.19.1 – 1.20.80)', 'bedrock_1.19.1', 'bedrock_1.20.80', { type: 'object', kind: 'UNKNOWN', displayName: 'Pig', entityType: 5, width: 0, height: 0 }, 0],
    ['those with categories (1.21.0 – 1.26.60)', 'bedrock_1.21.0', latestSupportedBedrockVersion, { type: 'animal', kind: 'Passive mobs', displayName: 'Pig', entityType: 2, width: 0, height: 0.9 }, 0.25]
  ]
  for (const [entities, from, to, pig, itemSize] of registryEntities) {
    describe(`minecraft-data having ${entities} of the Bedrock entities`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: types a pig as minecraft-data does, its size and an item's the registry's without a bounding box`, async () => {
          const { bot, server, driver } = await started(version)
          write(server, 'add_entity', addEntity(version, { unique: -4294967292n, runtime: 4, type: 'minecraft:pig', position: { x: 2.5, y: -60, z: 0.5 } }))
          write(server, 'add_item_entity', addItem(version, { unique: -4294967291n, runtime: 5, position: STILL }))
          await driver.frame(0)
          const { type, kind, displayName, entityType, width, height } = spawned(bot, 4)
          assert.deepStrictEqual({ type, kind, displayName, entityType, width, height }, { displayName: undefined, entityType: undefined, ...pig })
          assert.deepStrictEqual([spawned(bot, 5).width, spawned(bot, 5).height], [itemSize, itemSize])
          bot.end()
        })
      }
    })
  }

  const addItemLayouts: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['x, y, z and the speeds (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210'],
    ['a position and a velocity (1.16.220 – 1.26.60)', 'bedrock_1.16.220', latestSupportedBedrockVersion]
  ]
  for (const [layout, from, to] of addItemLayouts) {
    describe(`servers sending add_item_entity with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: spawns the item the recorded husk dropped, then emits itemDrop; its stack is not known yet`, async () => {
          const { bot, server, driver } = await started(version)
          const events = recorded(bot)
          const velocity = { x: 0.08696038275957108, y: 0.20000000298023224, z: -0.06767696887254715 }
          write(server, 'add_item_entity', addItem(version, { unique: -8589934587n, runtime: 7, position: { x: -1.634958028793335, y: -59.92499923706055, z: 0.5000317096710205 }, velocity, metadata: boundingBox(version, 0.25, 0.25) }))
          await driver.frame(0)
          assert.deepStrictEqual(events, ['entitySpawn 7', 'itemDrop 7'])
          const item = spawned(bot, 7)
          const { x, y, z } = item.velocity
          assert.deepStrictEqual([item.name, positionOf(item), { x, y, z }, item.width, item.height], ['item', { x: -1.634958028793335, y: -59.92499923706055, z: 0.5000317096710205 }, velocity, 0.25, 0.25])
          assert.throws(() => item.getDroppedItem(), /entity\.getDroppedItem\(\) is not supported on Bedrock yet/)
          bot.end()
        })
      }
    })
  }

  const paintingLayouts: Array<[string, BedrockVersion, BedrockVersion, Point3]> = [
    ['block coordinates (1.16.201 – 1.16.210)', 'bedrock_1.16.201', 'bedrock_1.16.210', { x: 1, y: 64, z: 0 }],
    ['a position (1.16.220 – 1.26.60)', 'bedrock_1.16.220', latestSupportedBedrockVersion, { x: 1.96875, y: -58.5, z: 0.5 }]
  ]
  for (const [layout, from, to, coordinates] of paintingLayouts) {
    describe(`servers sending add_painting at ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: spawns the recorded painting there, without a name, removed by its unique id`, async () => {
          const { bot, internal, server, driver } = await started(version)
          const events = recorded(bot)
          write(server, 'add_painting', { entity_id_self: -8589934589n, runtime_entity_id: runtimeId(version, 5), coordinates, direction: 1, title: 'Wasteland' })
          await driver.frame(0)
          assert.deepStrictEqual(events, ['entitySpawn 5'])
          const painting = spawned(bot, 5)
          assert.deepStrictEqual([painting.name, positionOf(painting), painting.getCustomName(), internal._entities.byUniqueId(-8589934589n)], ['painting', coordinates, null, painting])
          write(server, 'remove_entity', { entity_id_self: -8589934589n })
          await driver.tick()
          assert.deepStrictEqual([events, bot.entities[5]], [['entitySpawn 5', 'entityGone 5'], undefined])
          bot.end()
        })
      }
    })
  }

  const flagEncodings: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['as a long named index, the extended flags at key 91 (1.16.201)', 'bedrock_1.16.201', 'bedrock_1.16.201'],
    ['as named bits, the extended flags at key 92 (1.16.210 – 1.26.60)', 'bedrock_1.16.210', latestSupportedBedrockVersion]
  ]
  for (const [encoding, from, to] of flagEncodings) {
    describe(`servers sending the metadata's flags ${encoding}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        describe(`bedrock ${version}`, () => {
          it('applies set_entity_data at the start of the next tick, with the crouch, the elytra and the sleep it tells, as Java', async () => {
            const { bot, server, driver } = await started(version)
            write(server, 'add_entity', addEntity(version, villager(version)))
            await driver.frame(0)
            const events = recorded(bot)
            const villagerData = (...metadata: object[]): void => { write(server, 'set_entity_data', { runtime_entity_id: runtimeId(version, 4), metadata }) }
            villagerData(flags(version, VILLAGER_FLAGS | SNEAKING), entry(version, 'nametag', 'string', '§cBob'), ...boundingBox(version, 0.5, 0.75))
            await driver.frame(0)
            assert.deepStrictEqual([events, spawned(bot, 4).metadata[0]], [[], VILLAGER_FLAGS])
            await driver.tick()
            const entity = spawned(bot, 4)
            assert.deepStrictEqual(events.splice(0), ['entityUpdate 4', 'entityCrouch 4'])
            assert.deepStrictEqual([entity.metadata[0], entity.metadata[5], entity.crouching, entity.getCustomName()?.json, entity.width, entity.height], [VILLAGER_FLAGS | SNEAKING, -1n, true, { text: 'Bob', color: 'red' }, 0.5, 0.75])
            villagerData(flags(version, VILLAGER_FLAGS | SNEAKING))
            await driver.tick()
            assert.deepStrictEqual(events.splice(0), ['entityUpdate 4', 'entityCrouch 4'])
            villagerData(flags(version, VILLAGER_FLAGS))
            await driver.tick()
            villagerData(flags(version, VILLAGER_FLAGS))
            await driver.tick()
            assert.deepStrictEqual(events.splice(0), ['entityUpdate 4', 'entityUncrouch 4', 'entityUpdate 4'])
            villagerData(flags(version, VILLAGER_FLAGS | GLIDING))
            await driver.tick()
            villagerData(flags(version, VILLAGER_FLAGS | GLIDING))
            await driver.tick()
            assert.deepStrictEqual([events.splice(0), entity.elytraFlying], [['entityUpdate 4', 'entityElytraFlew 4', 'entityUpdate 4'], true])
            villagerData(flags(version, VILLAGER_FLAGS | SNEAKING), extendedFlags(version, SLEEPING_EXTENDED))
            villagerData(entry(version, 'player_flags', 'byte', 2))
            villagerData(entry(version, 'player_flags', 'byte', 0), extendedFlags(version, 0n))
            await driver.tick()
            assert.deepStrictEqual(events.splice(0), ['entityUpdate 4', 'entitySleep 4', 'entityCrouch 4', 'entityUpdate 4', 'entitySleep 4', 'entityUpdate 4'])
            assert.deepStrictEqual([entity.elytraFlying, entity.crouching], [false, true])
            bot.end()
          })

          it("keeps the metadata by the protocol's key numbers, an experience orb's experience as its count", async () => {
            const { bot, internal, server, driver } = await started(version)
            const orb = { unique: -4294967289n, runtime: 7, type: 'minecraft:xp_orb', position: { x: 4.381684303283691, y: -60, z: 0.5 }, yaw: 156.09375 }
            write(server, 'add_entity', addEntity(version, { ...orb, metadata: [entry(version, 'experience_value', 'int', 1), ...boundingBox(version, 0.25, 0.25)] }))
            await driver.frame(0)
            assert.deepStrictEqual([spawned(bot, 7).count, spawned(bot, 7).width], [1, 0.25])
            write(server, 'set_entity_data', { runtime_entity_id: runtimeId(version, 7), metadata: [entry(version, 'experience_value', 'int', 3), entry(version, 200, 'int', 5), entry(version, 'health', 99)] })
            write(server, 'set_entity_data', { runtime_entity_id: runtimeId(version, 9), metadata: [entry(version, 'health', 'int', 5)] })
            await driver.tick()
            const metadata = spawned(bot, 7).metadata
            assert.deepStrictEqual([spawned(bot, 7).count, metadata[15], metadata[200], 1 in metadata, metadata[53]], [3, 3, 5, false, 0.25])
            assert.strictEqual(internal._entities.stats.unknownEntity, 1)
            bot.end()
          })

          it("keeps the local player's metadata and flags, its size and its movement left to movement", async () => {
            const { bot, server, driver } = await started(version)
            const events = recorded(bot)
            write(server, 'set_entity_data', { runtime_entity_id: runtimeId(version, 1), metadata: [flags(version, SNEAKING), ...boundingBox(version, 0.5, 0.75)] })
            await driver.tick()
            assert.deepStrictEqual(events, ['entityUpdate 1', 'entityCrouch 1'])
            assert.deepStrictEqual([bot.entity.metadata[0], bot.entity.metadata[53], bot.entity.crouching, bot.entity.width, bot.entity.height], [SNEAKING, 0.5, true, 0.6, 1.8])
            bot.end()
          })
        })
      }
    })
  }

  const deltaLayouts: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['flags naming the fields present (1.16.201 – 1.26.30)', 'bedrock_1.16.201', 'bedrock_1.26.30'],
    ['each field optional (1.26.40 – 1.26.45)', 'bedrock_1.26.40', 'bedrock_1.26.45'],
    ['each field optional, and its ticks (1.26.51 – 1.26.60)', 'bedrock_1.26.51', latestSupportedBedrockVersion]
  ]
  for (const [layout, from, to] of deltaLayouts) {
    describe(`servers sending move_entity_delta with ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: moves the entity along the axes and rotations present, in the packet pass`, async () => {
          const { bot, internal, server, driver } = await started(version)
          const boat = { unique: -8589934590n, runtime: 2, type: 'minecraft:boat', position: { x: -12.5, y: 12, z: 41.5 }, yaw: 90 }
          write(server, 'add_entity', addEntity(version, boat))
          await driver.frame(0)
          const events = recorded(bot)
          const entity = spawned(bot, 2)
          receive(server, deltaOnlyY(version))
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), positionOf(entity), entity.yaw, entity.onGround], [['entityMoved 2'], { x: -12.5, y: 11.960800170898438, z: 41.5 }, Math.PI / 2, false])
          if (atLeast(version, 'bedrock_1.26.40')) write(server, 'move_entity_delta', { runtime_entity_id: 2n, x: 6.319220542907715, z: 33.68252182006836, rot_x: 32, rot_y: 244, rot_z: 64, on_ground: true })
          else write(server, 'move_entity_delta', { runtime_entity_id: 2n, flags: deltaFlags('has_x', 'has_z', 'has_rot_x', 'has_rot_y', 'has_rot_z', 'on_ground'), x: 6.319220542907715, z: 33.68252182006836, rot_x: 32, rot_y: 244, rot_z: 64 })
          await driver.frame(0)
          assert.deepStrictEqual([events.splice(0), positionOf(entity), entity.pitch, entity.yaw, entity.headYaw, entity.onGround], [['entityMoved 2'], { x: 6.319220542907715, y: 11.960800170898438, z: 33.68252182006836 }, -Math.PI / 4, 3.436116964863836, Math.PI / 2, true])
          write(server, 'move_entity_delta', { runtime_entity_id: 1n, ...atLeast(version, 'bedrock_1.26.40') ? { y: 20 } : { flags: deltaFlags('has_y'), y: 20 } })
          write(server, 'move_entity_delta', { runtime_entity_id: 9n, ...atLeast(version, 'bedrock_1.26.40') ? { y: 20 } : { flags: deltaFlags('has_y'), y: 20 } })
          await driver.frame(0)
          assert.deepStrictEqual([events, internal._entities.stats.local, internal._entities.stats.unknownEntity], [[], 1, 1])
          bot.end()
        })
      }
    })
  }

  describe('servers sending move_entity_delta as recorded on 1.26.60', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51')) {
      it(`bedrock ${version}: walks the villager, on the ground`, async () => {
        const { bot, server, driver } = await started(version, 3)
        write(server, 'add_entity', addEntity(version, villager(version)))
        receive(server, '6f0401ef091f4000000000000100000000')
        await driver.frame(0)
        const entity = spawned(bot, 4)
        assert.deepStrictEqual([positionOf(entity), entity.onGround], [{ x: 2.4849812984466553, y: -60, z: 0.5 }, true])
        receive(server, '6f0401de0dfa3f000150680c3f00011201380100000000')
        await driver.frame(0)
        assert.deepStrictEqual([positionOf(entity), entity.yaw, entity.headYaw, entity.pitch], [{ x: 1.9535481929779053, y: -60, z: 0.548466682434082 }, 2.6998061866787286, 1.7671458676442586, 0])
        bot.end()
      })
    }
  })

  describe('servers sending move_entity (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: places the entity, turned, on the ground or not, in the packet pass`, async () => {
        const { bot, internal, server, driver } = await started(version)
        write(server, 'add_entity', addEntity(version, { unique: -8589934590n, runtime: 2, type: 'minecraft:boat', position: { x: -12.5, y: 12, z: 41.5 }, yaw: 90, headYaw: 180 }))
        await driver.frame(0)
        const events = recorded(bot)
        const entity = spawned(bot, 2)
        assert.deepStrictEqual([entity.yaw, entity.headYaw], [Math.PI / 2, 0])
        const [recordedMove, y] = version === 'bedrock_1.16.201' ? ['1202f8000048c1a3183f4100002642000000', 11.943514823913574] : ['1202f8000048c189493f4100002642000000', 11.955452919006348]
        receive(server, recordedMove)
        await driver.frame(0)
        assert.deepStrictEqual([events.splice(0), positionOf(entity), entity.yaw, entity.onGround], [['entityMoved 2'], { x: -12.5, y, z: 41.5 }, Math.PI, false])
        write(server, 'move_entity', { runtime_entity_id: runtimeId(version, 2), flags: 1, position: { x: 1, y: 2, z: 3 }, rotation: { yaw: 90, pitch: 45, head_yaw: 180 } })
        write(server, 'move_entity', { runtime_entity_id: runtimeId(version, 1), flags: 1, position: { x: 1, y: 2, z: 3 }, rotation: { yaw: 90, pitch: 45, head_yaw: 180 } })
        await driver.frame(0)
        assert.deepStrictEqual([events, positionOf(entity), entity.yaw, entity.pitch, entity.headYaw, entity.onGround], [['entityMoved 2'], { x: 1, y: 2, z: 3 }, Math.PI / 2, -Math.PI / 4, 0, true])
        assert.notDeepStrictEqual(positionOf(bot.entity), { x: 1, y: 2, z: 3 })
        assert.strictEqual(internal._entities.stats.local, 1)
        bot.end()
      })
    }
  })

  const motionLayouts: Array<[string, BedrockVersion, BedrockVersion, string, Point3]> = [
    ['without a tick (1.16.201 – 1.20.61)', 'bedrock_1.16.201', 'bedrock_1.20.61', '2804ecaf99bd42ce47be3d6e70bc', { x: -0.07504257559776306, y: -0.19512274861335754, z: -0.014674720354378223 }],
    ['with a tick (1.20.71 – 1.26.60)', 'bedrock_1.20.71', latestSupportedBedrockVersion, '2804d53188bd42ce47bec99aa0bd00', { x: -0.06650129705667496, y: -0.19512274861335754, z: -0.0784202292561531 }]
  ]
  for (const [layout, from, to, motion, velocity] of motionLayouts) {
    describe(`servers sending set_entity_motion ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: sets another entity's velocity, without an event; the local player's is movement's`, async () => {
          const { bot, internal, server, driver } = await started(version)
          write(server, 'add_item_entity', addItem(version, { unique: -8589934587n, runtime: 4, position: { x: 0, y: 12, z: 0 } }))
          await driver.frame(0)
          const events = recorded(bot)
          receive(server, motion)
          write(server, 'set_entity_motion', { runtime_entity_id: runtimeId(version, 9), velocity: { x: 1, y: 1, z: 1 } })
          await driver.frame(0)
          const { x, y, z } = spawned(bot, 4).velocity
          assert.deepStrictEqual([events, { x, y, z }, internal._entities.stats.unknownEntity], [[], velocity, 1])
          write(server, 'set_entity_motion', { runtime_entity_id: runtimeId(version, 1), velocity: { x: 0, y: 0.5, z: 0 } })
          await driver.frame(0)
          assert.deepStrictEqual([bot.entity.velocity.y, internal._entities.stats.local], [0.5, 1])
          bot.end()
        })
      }
    })
  }

  const attributeLayouts: Array<[string, BedrockVersion, BedrockVersion]> = [
    ['without modifiers (1.16.201 – 1.19.10)', 'bedrock_1.16.201', 'bedrock_1.19.10'],
    ['with modifiers (1.19.20 – 1.26.60)', 'bedrock_1.19.20', latestSupportedBedrockVersion]
  ]
  for (const [layout, from, to] of attributeLayouts) {
    describe(`servers sending update_attributes ${layout}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: keeps each attribute's value and modifiers by Bedrock's name, emitting entityAttributes`, async () => {
          const { bot, internal, server, driver } = await started(version)
          write(server, 'add_entity', addEntity(version, villager(version)))
          await driver.frame(0)
          const events = recorded(bot)
          const modifier = { id: '5d6f0ba2-1186-46ac-b896-c61c5cee99cc', name: 'Sprinting speed boost', amount: 0.3, operation: 2, operand: 2, serializable: false }
          const health = (current: number): object => ({
            min: 0,
            max: 20,
            current,
            default: 20,
            name: 'minecraft:health',
            ...atLeast(version, 'bedrock_1.19.20') ? { modifiers: [modifier] } : {},
            ...atLeast(version, 'bedrock_1.21.30') ? { default_min: 0, default_max: 20 } : {}
          })
          write(server, 'update_attributes', { runtime_entity_id: 4n, attributes: [health(8)] })
          write(server, 'update_attributes', { runtime_entity_id: 1n, attributes: [health(19)] })
          write(server, 'update_attributes', { runtime_entity_id: 9n, attributes: [health(1)] })
          await driver.frame(0)
          const modifiers = atLeast(version, 'bedrock_1.19.20') ? [{ ...modifier, amount: 0.30000001192092896 }] : []
          assert.deepStrictEqual(events, ['entityAttributes 4', 'entityAttributes 1'])
          assert.deepStrictEqual(spawned(bot, 4).attributes, { 'minecraft:health': { value: 8, modifiers }, 'minecraft:movement': { value: 0.5, modifiers: [] } })
          assert.deepStrictEqual([bot.entity.attributes, internal._entities.stats.unknownEntity], [{ 'minecraft:health': { value: 19, modifiers } }, 1])
          bot.end()
        })
      }
    })
  }

  const effectRemovals: Array<[string, BedrockVersion, BedrockVersion, string]> = [
    ['amplifier and duration 0 (1.16.201 – 1.20.61)', 'bedrock_1.16.201', 'bedrock_1.20.61', '1c010316000000'],
    ['the effect, and a tick of 8 bytes (1.20.71 – 1.21.30)', 'bedrock_1.20.71', 'bedrock_1.21.30', '1c010316fe0300aeb3180000000000000000'],
    ['the effect, and a varint tick (1.21.42 – 1.21.124)', 'bedrock_1.21.42', 'bedrock_1.21.124', '1c010316fe0300c2b31800'],
    ['the effect, a varint tick and whether it is ambient (1.21.130 – 1.26.60)', 'bedrock_1.21.130', latestSupportedBedrockVersion, '1c010316fe0300a0b3180000']
  ]
  for (const [removal, from, to, removed] of effectRemovals) {
    describe(`servers removing an effect with ${removal}`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: keeps the effects by Bedrock's id, and ends the one kept, as Java`, async () => {
          const { bot, internal, server, driver } = await started(version)
          const effects: Array<[string, number, object]> = []
          bot.on('entityEffect', (entity, effect) => { effects.push(['entityEffect', entity.id, effect]) })
          bot.on('entityEffectEnd', (entity, effect) => { effects.push(['entityEffectEnd', entity.id, effect]) })
          const effect = (event: number, amplifier: number): void => { write(server, 'mob_effect', { runtime_entity_id: runtimeId(version, 1), event_id: event, effect_id: 11, amplifier, particles: false, duration: 199980 }) }
          if (atLeast(version, 'bedrock_1.20.71')) effect(1, 255)
          else receive(server, '1c010116fe0300d8b418')
          effect(2, 1)
          await driver.frame(0)
          assert.deepStrictEqual(bot.entity.effects, { 11: { id: 11, amplifier: 1, duration: 199980 } })
          receive(server, removed, removed)
          effect(9, 0)
          write(server, 'mob_effect', { runtime_entity_id: runtimeId(version, 9), event_id: 1, effect_id: 1, amplifier: 0, particles: false, duration: 1 })
          await driver.frame(0)
          assert.deepStrictEqual(effects, [
            ['entityEffect', 1, { id: 11, amplifier: 255, duration: 199980 }],
            ['entityEffect', 1, { id: 11, amplifier: 1, duration: 199980 }],
            ['entityEffectEnd', 1, { id: 11, amplifier: 1, duration: 199980 }],
            ['entityEffectEnd', 1, { id: 11, amplifier: -1, duration: -1 }]
          ])
          assert.deepStrictEqual([bot.entity.effects, internal._entities.stats.unknownEntity], [{}, 1])
          bot.end()
        })
      }
    })
  }

  describe('servers sending entity_event and animate (every version, each laid out as the version does)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: emits Java's event of each, in the packet pass; entityHurt without a source`, async () => {
        const { bot, internal, server, driver } = await started(version)
        write(server, 'add_entity', addEntity(version, { unique: -8589934588n, runtime: 5, type: 'minecraft:husk', position: STILL }))
        await driver.frame(0)
        const events = recorded(bot)
        const hurtArguments: number[] = []
        bot.on('entityHurt', (...args) => { hurtArguments.push(args.length) })
        receive(server, atLeast(version, 'bedrock_1.26.20') ? '1b05030000' : '1b050300')
        for (const event of ['hurt_animation', 'arm_swing', 'tame_fail', 'tame_success', 'shake_wet', 'eat_grass_animation', 'eating_item', 'jump']) {
          write(server, 'entity_event', { runtime_entity_id: runtimeId(version, 5), event_id: event, data: 0 })
        }
        write(server, 'entity_event', { runtime_entity_id: runtimeId(version, 9), event_id: 'death_animation', data: 0 })
        write(server, 'entity_event', { runtime_entity_id: runtimeId(version, 9), event_id: 'jump', data: 0 })
        for (const action of ['swing_arm', 'wake_up', 'critical_hit', 'magic_critical_hit', 'none']) {
          write(server, 'animate', { action_id: action, runtime_entity_id: 5n })
        }
        await driver.frame(0)
        assert.deepStrictEqual(events, ['entityDead 5', 'entityHurt 5', 'entitySwingArm 5', 'entityTaming 5', 'entityTamed 5', 'entityShakingOffWater 5', 'entityEatingGrass 5', 'entityEat 5',
          'entitySwingArm 5', 'entityWake 5', 'entityCriticalEffect 5', 'entityMagicCriticalEffect 5'])
        assert.deepStrictEqual([hurtArguments, internal._entities.stats.unknownEntity], [[1], 1])
        bot.end()
      })
    }
  })

  describe('servers removing an entity by its unique id (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: keeps it until the end of the next tick, then emits entityGone before physicsTick`, async () => {
        const { bot, internal, server, driver } = await started(version)
        write(server, 'add_entity', addEntity(version, villager(version)))
        await driver.frame(0)
        const villagerEntity = spawned(bot, 4)
        const events = recorded(bot)
        bot.on('physicsTick', () => { events.push('physicsTick') })
        receive(server, '0efbffffff3f')
        write(server, 'remove_entity', { entity_id_self: -1n })
        write(server, 'remove_entity', { entity_id_self: LOCAL_UNIQUE })
        await driver.frame(0)
        assert.deepStrictEqual([events, bot.entities[4], villagerEntity.isValid], [[], villagerEntity, true])
        await driver.tick()
        assert.deepStrictEqual([events, bot.entities[4], villagerEntity.isValid, internal._entities.byUniqueId(-8589934590n)], [['entityGone 4', 'physicsTick'], undefined, false, undefined])
        assert.deepStrictEqual([bot.entities[1], internal._entities.stats], [bot.entity, { unknownEntity: 1, unlisted: 0, local: 1, replaced: 0, unlinked: 0 }])
        write(server, 'add_entity', addEntity(version, { unique: -5n, runtime: 4, type: 'minecraft:pig', position: STILL }))
        await driver.frame(0)
        assert.deepStrictEqual([internal._entities.byUniqueId(-8589934590n), internal._entities.byUniqueId(-5n)], [undefined, spawned(bot, 4)])
        bot.end()
      })
    }
  })

  describe('servers changing the dimension (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: drops every entity but the local player at the end of the next tick, as the vanilla client`, async () => {
        const { bot, internal, server, driver } = await started(version)
        write(server, 'add_entity', addEntity(version, villager(version)))
        write(server, 'add_item_entity', addItem(version, { unique: -4294967291n, runtime: 5, position: STILL }))
        await driver.frame(0)
        const events = recorded(bot)
        write(server, 'change_dimension', { dimension: 1, position: { x: 0.5, y: 70, z: 0.5 }, respawn: false })
        write(server, 'add_entity', addEntity(version, { unique: -6n, runtime: 5, type: 'minecraft:pig', position: STILL }))
        await driver.frame(0)
        assert.deepStrictEqual([events.splice(0), Object.keys(bot.entities)], [['entityGone 5', 'entitySpawn 5'], ['1', '4', '5']])
        await driver.tick()
        assert.deepStrictEqual([events, Object.keys(bot.entities), internal._entities.byUniqueId(LOCAL_UNIQUE), internal._entities.byUniqueId(-6n)], [['entityGone 4'], ['1', '5'], bot.entity, spawned(bot, 5)])
        bot.end()
      })
    }
  })

  describe('servers telling an item was picked up (every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: emits playerCollect with the collector and the item`, async () => {
        const { bot, internal, server, driver } = await started(version)
        write(server, 'add_item_entity', addItem(version, { unique: -4294967291n, runtime: 5, position: { x: 1, y: 12, z: 1 } }))
        await driver.frame(0)
        const collected: Array<[number, number] | string> = []
        bot.on('playerCollect', (collector, item) => { collected.push([collector.id, item.id]) })
        bot.on('error', error => { collected.push(error.message) })
        receive(server, '110501')
        write(server, 'take_item_entity', { runtime_entity_id: runtimeId(version, 9), target: 1 })
        write(server, 'take_item_entity', { runtime_entity_id: runtimeId(version, 5), target: 9 })
        await driver.frame(0)
        assert.deepStrictEqual([collected, internal._entities.stats.unknownEntity], [[[1, 5]], 2])
        bot.end()
      })
    }
  })

  describe('servers alike on every version (the latest)', () => {
    const version = latestSupportedBedrockVersion

    it('has the local player among the entities from start_game, and emits its entitySpawn right after spawn', async () => {
      const testBot = await bedrockTestBot(bedrockCodec(version))
      const { bot, internal, server } = testBot
      const events: string[] = []
      bot.on('spawn', () => { events.push('spawn') })
      bot.on('entitySpawn', entity => { events.push(entity === bot.entity ? 'entitySpawn bot.entity' : 'entitySpawn') })
      bot.on('physicsTick', () => { if (events.length > 0) events.push('physicsTick') })
      await new ServerWorld(server).join(testBot)
      assert.deepStrictEqual(events, ['spawn', 'entitySpawn bot.entity', 'physicsTick'])
      assert.deepStrictEqual([bot.entities[1], internal._entities.byUniqueId(0n), bot.entity.eyeHeight], [bot.entity, bot.entity, Math.fround(1.62001)])
      bot.end()
    })

    it("keys an entity by its runtime id's low 32 bits, as the packets writing it as a varint carry it", async () => {
      const { bot, internal, server, driver } = await started(version)
      write(server, 'add_entity', addEntity(version, { unique: -2n, runtime: 2 ** 32 + 4, type: 'minecraft:pig', position: STILL }))
      await driver.frame(0)
      const pig = spawned(bot, 4)
      assert.deepStrictEqual([pig.id, internal._entities.byRuntimeId(2n ** 32n + 4n), internal._entities.byRuntimeId(4)], [4, pig, pig])
      bot.end()
    })

    it('finds the nearest entity but the bot, that the filter takes', async () => {
      const { bot, server, driver } = await started(version)
      assert.strictEqual(bot.nearestEntity(), null)
      write(server, 'add_entity', addEntity(version, { unique: -2n, runtime: 2, type: 'minecraft:pig', position: { x: 0, y: 0, z: 3 } }))
      write(server, 'add_entity', addEntity(version, { unique: -3n, runtime: 3, type: 'minecraft:cow', position: { x: 0, y: 0, z: 2 } }))
      write(server, 'add_entity', addEntity(version, { unique: -4n, runtime: 4, type: 'minecraft:pig', position: { x: 0, y: 0, z: 5 } }))
      // as near as the cow: the first found stays, as Java
      write(server, 'add_entity', addEntity(version, { unique: -5n, runtime: 5, type: 'minecraft:cow', position: { x: 0, y: 0, z: -2 } }))
      await driver.frame(0)
      bot.entity.position.set(0, 0, 0)
      assert.deepStrictEqual([bot.nearestEntity()?.id, bot.nearestEntity(entity => entity.name === 'pig')?.id, bot.nearestEntity(entity => entity.name === 'sheep')], [3, 2, null])
      bot.end()
    })

    it('spawns a live runtime id again in place, and destroys one being removed before spawning it anew', async () => {
      const { bot, internal, server, driver } = await started(version)
      const events = recorded(bot)
      write(server, 'add_entity', addEntity(version, { ...villager(version), metadata: [flags(version, VILLAGER_FLAGS | SNEAKING)] }))
      await driver.frame(0)
      const first = spawned(bot, 4)
      assert.strictEqual(first.crouching, true)
      write(server, 'add_entity', addEntity(version, { ...villager(version), type: 'minecraft:pig' }))
      await driver.frame(0)
      assert.deepStrictEqual([spawned(bot, 4), first.name, first.crouching, internal._entities.stats.replaced], [first, 'pig', false, 1])
      receive(server, '0efbffffff3f')
      write(server, 'add_item_entity', addItem(version, { unique: -8589934590n, runtime: 4, position: STILL }))
      await driver.frame(0)
      assert.deepStrictEqual(events, ['entitySpawn 4', 'entitySpawn 4', 'entityGone 4', 'entitySpawn 4', 'itemDrop 4'])
      assert.deepStrictEqual([first.isValid, spawned(bot, 4) === first, spawned(bot, 4).name, internal._entities.byUniqueId(-8589934590n)?.name], [false, false, 'item', 'item'])
      await driver.tick()
      assert.strictEqual(events.length, 5)
      bot.end()
    })

    it('gives a unique id spawned again under another runtime id to the new entity, and forgets the one a runtime id spawned again leaves', async () => {
      const { bot, internal, server, driver } = await started(version)
      const events = recorded(bot)
      write(server, 'add_entity', addEntity(version, villager(version)))
      write(server, 'add_entity', addEntity(version, { unique: -5n, runtime: 5, type: 'minecraft:pig', position: STILL }))
      await driver.frame(0)
      const first = spawned(bot, 4)
      receive(server, '0efbffffff3f')
      write(server, 'add_entity', addEntity(version, { ...villager(version), runtime: 6 }))
      write(server, 'add_entity', addEntity(version, { unique: -7n, runtime: 5, type: 'minecraft:pig', position: STILL }))
      await driver.tick()
      assert.deepStrictEqual([events.splice(0), first.isValid], [['entitySpawn 4', 'entitySpawn 5', 'entitySpawn 6', 'entitySpawn 5', 'entityGone 4'], false])
      const { byUniqueId } = internal._entities
      assert.deepStrictEqual([byUniqueId(-8589934590n), byUniqueId(-5n), byUniqueId(-7n)], [spawned(bot, 6), undefined, spawned(bot, 5)])
      receive(server, '0efbffffff3f')
      write(server, 'remove_entity', { entity_id_self: -5n })
      await driver.tick()
      assert.deepStrictEqual([events, internal._entities.stats.unknownEntity], [['entityGone 6'], 1])
      bot.end()
    })

    it('reports a listener that throws, and the other listeners still hear the event', async () => {
      const { bot, internal, server, driver } = await started(version)
      const errors: string[] = []
      bot.on('error', error => { errors.push(error.message) })
      bot.on('entitySpawn', () => { throw new Error('a listener failed') })
      let heard = 0
      bot.on('entitySpawn', () => { heard++ })
      write(server, 'add_entity', addEntity(version, villager(version)))
      await driver.frame(0)
      assert.deepStrictEqual([errors, heard, internal._core.stats.packets.get('add_entity')], [['a listener failed'], 1, { handled: 1, threw: 0, unhandled: 0 }])
      bot.end()
    })

    it('handles no entity packet without its plugin', async () => {
      const { bot, internal, server, driver } = await bedrockTestBot(bedrockCodec(version), { plugins: { entities: false, boss_bar: false } })
      server.send('start_game', { entity_id: LOCAL_UNIQUE, runtime_entity_id: 1n })
      write(server, 'add_entity', addEntity(version, villager(version)))
      await driver.frame(0)
      assert.deepStrictEqual([bot.entities, internal._core.stats.packets.get('add_entity')], [undefined, { handled: 0, threw: 0, unhandled: 1 }])
      bot.end()
    })
  })
})
