/* eslint-env mocha */
// The boxes the client gives another player, a slime and a scaled mob (Entity.refreshDimensions), as floats.

const assert = require('assert')
const { entityDimensions } = require('../lib/entitySize')

const f32 = Math.fround
const size = (version, entity, options) => {
  const dims = entityDimensions(require('prismarine-registry')(version), entity, options)
  return dims && [dims.width, dims.height]
}

describe('entity dimensions', () => {
  it('sizes a slime by its size: 0.51000005F times it to 1.13, 2.04F times 0.255F times it to 1.20.4, 0.52F times it after', () => {
    // 1.8.9 SlimeEntity.java:53, 145 (the size at 16); 1.9.4 :68; 1.14 :328; 1.21.11 Slime.java:342-343
    const slime = (name, index, value) => {
      const metadata = []
      metadata[index] = value
      return { name, type: 'mob', metadata }
    }
    assert.deepStrictEqual(size('1.8.8', slime('Slime', 16, 4)), [f32(f32(0.51000005) * 4), f32(f32(0.51000005) * 4)])
    assert.deepStrictEqual(size('1.12.2', slime('slime', 12, 2)), [f32(f32(0.51000005) * 2), f32(f32(0.51000005) * 2)])
    const legacy = f32(f32(2.04) * f32(f32(0.255) * 3))
    assert.deepStrictEqual(size('1.16.5', slime('magma_cube', 15, 3)), [legacy, legacy])
    const keys = require('prismarine-registry')('1.21.11').entitiesByName.slime.metadataKeys
    assert.deepStrictEqual(size('1.21.11', slime('slime', keys.indexOf('size'), 4)), [f32(f32(0.52) * 4), f32(f32(0.52) * 4)])
  })

  it('sizes a player by its synced pose from 1.14, the ordinal 6 dying to 1.16 and long jumping from 1.17', () => {
    // 1.14 PlayerEntity.java:109-118, EntityPose.java:4-10; 1.16.5 PlayerEntity.java:120, EntityPose.java:4-10; 1.17
    // EntityPose.java:4-11
    const player = pose => {
      const metadata = []
      metadata[6] = pose
      return { name: 'player', type: 'player', metadata }
    }
    assert.deepStrictEqual(size('1.14.4', player(6)), [0.2, 0.2])
    assert.deepStrictEqual(size('1.16.5', player(6)), [0.2, 0.2])
    assert.deepStrictEqual(size('1.17.1', player(6)), [0.6, 1.8])
    assert.deepStrictEqual(size('1.17.1', player(7)), [0.2, 0.2])
    assert.deepStrictEqual(size('1.16.5', player(5)), [0.6, 1.5])
  })

  it('sizes a player in a bed 0.2F by 0.2F before 1.14, 1.8 too', () => {
    // 1.8.9 PlayerEntity.java:1150, 1205; 1.9.4 PlayerEntity.java:362-386
    const player = { name: 'player', type: 'player', metadata: [0] }
    assert.deepStrictEqual(size('1.8.8', player, { inBed: true }), [0.2, 0.2])
    assert.deepStrictEqual(size('1.8.8', player), [0.6, 1.8])
    assert.deepStrictEqual(size('1.12.2', player, { inBed: true }), [0.2, 0.2])
  })

  it('scales a mob by its scale attribute, and gives it back the type size once the scale is 1 again', () => {
    // LivingEntity.getDimensions: getDefaultDimensions(pose).scale(getScale()), refreshed whenever the scale changes
    // (1.20.5 LivingEntity.java:2462-2465)
    const cow = value => ({ name: 'cow', type: 'mob', metadata: [], attributes: { 'minecraft:scale': { value, modifiers: [] } } })
    assert.deepStrictEqual(size('1.21.11', cow(2)), [f32(f32(0.9) * 2), f32(f32(1.4) * 2)])
    assert.strictEqual(size('1.21.11', cow(1)), null)
    assert.deepStrictEqual(size('1.21.11', cow(1), { scaled: true }), [0.9, 1.4])
  })
})
