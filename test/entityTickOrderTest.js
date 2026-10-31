/* eslint-env mocha */
// The slots of 1.14 - 1.16 ClientLevel's entity map (fastutil's Int2ObjectOpenHashMap: 1.14 ClientWorld.java:65,
// 113-133, 389-400; 1.16.5 :74), which order the client's entity ticks, and what puts entities into it and takes them
// out: the spawns, the destroy, the collect (1.14 ClientPlayNetworkHandler.java:815; 1.16.5 :835-843) and a living
// entity's removal at deathTime 20 through the entry set's iterator (1.14 LivingEntity.java:590-601; 1.16.5 :736-739).

const assert = require('assert')
const { Vec3 } = require('vec3')
const { once } = require('../lib/promise_utils')
const { createEntityTickOrder } = require('../lib/entityTickOrder')
const { fakeServerBot } = require('./common/fakeServer')

describe('entity tick order', () => {
  // The walks below are fastutil 8's own (Int2ObjectOpenHashMap, int2ObjectEntrySet().iterator()): the player (1) and
  // 29 more puts grow the table to 64 slots on the 25th; the iterator's removals leave it at 64 where the map's remove
  // halves it once fewer than maxFill / 4 (12) are left, so the same ids land elsewhere afterwards; the null key first.
  const grown = () => {
    const order = createEntityTickOrder()
    for (let id = 1; id <= 30; id++) order.add(id)
    return order
  }
  const later = [280, 287, 294, 301, 308, 315, 322, 329]

  it('grows the table on the 25th put, as fastutil walks it', () => {
    const order = grown()
    assert.strictEqual(order.slots, 64)
    assert.deepStrictEqual(order.ids(), [29, 25, 4, 12, 13, 8, 9, 30, 28, 24, 26, 18, 16, 17, 19, 23, 20, 22, 21, 2, 27, 6, 15, 14, 11, 10, 1, 3, 7, 5])
  })

  it('shifts the entries after one the iterator takes out, without the rehash', () => {
    const order = grown()
    for (let id = 2; id <= 25; id++) order.removeInTick(id)
    assert.deepStrictEqual(order.ids(), [29, 30, 28, 26, 27, 1])
    for (let id = 26; id <= 30; id++) order.removeInTick(id)
    // (the server's destroy finds no entry: no rehash)
    for (let id = 2; id <= 30; id++) order.remove(id)
    for (const id of later) order.add(id)
    assert.strictEqual(order.slots, 64)
    assert.deepStrictEqual(order.ids(), [301, 322, 280, 308, 315, 287, 1, 329, 294])
  })

  it('halves the table once the removals leave fewer than maxFill / 4, the null key first', () => {
    const order = grown()
    for (let id = 2; id <= 30; id++) order.remove(id)
    for (const id of later) order.add(id)
    assert.strictEqual(order.slots, 32)
    assert.deepStrictEqual(order.ids(), [301, 322, 287, 280, 1, 329, 308, 294, 315])
    for (const id of [0, 100, 37]) order.add(id)
    assert.deepStrictEqual(order.ids(), [0, 301, 37, 322, 287, 280, 100, 1, 329, 308, 294, 315])
    assert.strictEqual(order.ticksBefore(0, 1), true)
  })
})

describe('entity tick order of the bot', function () {
  this.timeout(30000)

  const floor = []
  for (let x = -1; x <= 5; x++) for (let z = -1; z <= 2; z++) floor.push([x, 64, z, 'stone'])
  const botOf = (version) => fakeServerBot(version, { spawn: { x: 0.5, y: 65, z: 0.5 }, blocks: floor })

  function spawn (t, id, name, x, metadata = []) {
    const fixed = t.registry.supportFeature('fixedPointPosition') ? 32 : 1
    const data = t.registry.entitiesByName[name]
    const object = name === 'item'
    t.client.write(object ? 'spawn_entity' : 'spawn_entity_living', {
      entityId: id,
      entityUUID: '00112233-4455-6677-8899-aabbccddee' + String(id).padStart(2, '0'),
      objectUUID: '00112233-4455-6677-8899-aabbccddee' + String(id).padStart(2, '0'),
      type: data.id,
      x: x * fixed,
      y: 65 * fixed,
      z: 0.5 * fixed,
      yaw: 0,
      pitch: 0,
      headPitch: 0,
      objectData: 1,
      velocity: { x: 0, y: 0, z: 0 },
      metadata
    })
    return once(t.bot, 'entitySpawn')
  }

  for (const version of ['1.14.4', '1.15.2']) {
    it(`takes the collected entity out at once (${version})`, async () => {
      const t = await botOf(version)
      try {
        await spawn(t, 5, 'cow', 3.5)
        assert.ok(t.bot._entityTickOrder.slotOf(5) >= 0)
        t.client.write('collect', { collectedEntityId: 5, collectorEntityId: t.bot.entity.id, pickupItemCount: 1 })
        await once(t.bot, 'playerCollect')
        assert.strictEqual(t.bot._entityTickOrder.slotOf(5), -1)
      } finally {
        await t.close()
      }
    })
  }

  it('takes an item out once the collect leaves its stack empty (1.16.5)', async () => {
    const t = await botOf('1.16.5')
    try {
      await spawn(t, 5, 'item', 3.5)
      const item = t.registry.itemsByName.stone.id
      t.client.write('entity_metadata', { entityId: 5, metadata: [{ key: 7, type: 6, value: { present: true, itemId: item, itemCount: 3 } }] })
      await once(t.bot, 'entityUpdate')
      t.client.write('collect', { collectedEntityId: 5, collectorEntityId: t.bot.entity.id, pickupItemCount: 2 })
      await once(t.bot, 'playerCollect')
      assert.ok(t.bot._entityTickOrder.slotOf(5) >= 0)
      t.client.write('collect', { collectedEntityId: 5, collectorEntityId: t.bot.entity.id, pickupItemCount: 1 })
      await once(t.bot, 'playerCollect')
      assert.strictEqual(t.bot._entityTickOrder.slotOf(5), -1)
    } finally {
      await t.close()
    }
  })

  it('takes a dead mob out on its 20th tick dead, through the iterator (1.15.2)', async () => {
    const t = await botOf('1.15.2')
    try {
      await spawn(t, 5, 'cow', 3.5)
      t.client.write('entity_metadata', { entityId: 5, metadata: [{ key: 8, type: 2, value: 0 }] })
      await once(t.bot, 'entityUpdate')
      t.ticks(19)
      assert.ok(t.bot._entityTickOrder.slotOf(5) >= 0)
      t.ticks(1)
      assert.strictEqual(t.bot._entityTickOrder.slotOf(5), -1)
      assert.ok(t.bot.entities[5], 'the bot keeps the entity till the server destroys it')
      assert.ok(t.bot.entity.position instanceof Vec3)
    } finally {
      await t.close()
    }
  })
})
