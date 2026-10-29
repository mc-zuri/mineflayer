import assert from 'assert'
import prismarineRegistry from 'prismarine-registry'
import bossBarLoader from '../lib/bossbar.ts'
import { latestSupportedVersion } from '../lib/version.ts'

describe('BossBar', () => {
  const BossBar = bossBarLoader(prismarineRegistry(latestSupportedVersion))

  it('has its flags as booleans, and gives them back as the bits they came from', () => {
    for (let flags = 0; flags < 8; flags++) {
      const bar = new BossBar('uuid', JSON.stringify({ text: 'title' }), 1, 0, 0, flags)
      assert.strictEqual(bar.shouldDarkenSky, (flags & 0x1) !== 0, `shouldDarkenSky of ${flags}`)
      assert.strictEqual(bar.isDragonBar, (flags & 0x2) !== 0, `isDragonBar of ${flags}`)
      assert.strictEqual(bar.createFog, (flags & 0x4) !== 0, `createFog of ${flags}`)
      assert.strictEqual(bar.shouldCreateFog, (flags & 0x4) !== 0, `shouldCreateFog of ${flags}`)
      assert.strictEqual(bar.flags, flags, `flags of ${flags}`)

      const updated = new BossBar('uuid', JSON.stringify({ text: 'title' }), 1, 0, 0, 0)
      updated.flags = flags
      assert.strictEqual(updated.flags, flags, `flags set to ${flags}`)
    }
  })
})
