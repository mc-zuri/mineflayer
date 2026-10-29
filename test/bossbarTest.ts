import assert from 'assert'
import nbt from 'prismarine-nbt'
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

  it('has its title as a ChatMessage, whichever form the packet gives it', () => {
    const titles = [
      ['1.16.5', JSON.stringify({ text: 'Wither' }), 'Wither'],
      [latestSupportedVersion, nbt.comp({ text: nbt.string('Wither') }), 'Wither'],
      // `/bossbar add <id> "<name>"` on 1.20.3+: the title is a bare NBT string
      [latestSupportedVersion, nbt.string('Ender Dragon'), 'Ender Dragon']
    ] as const
    for (const [version, title, text] of titles) {
      const bar = new (bossBarLoader(prismarineRegistry(version)))('uuid', title, 1, 0, 0, 0)
      assert.notStrictEqual(typeof bar.title, 'string', `the title of ${JSON.stringify(title)}`)
      assert.strictEqual(typeof bar.title.toAnsi, 'function', `the title of ${JSON.stringify(title)}`)
      assert.strictEqual(bar.title.toString(), text)
    }
  })
})
