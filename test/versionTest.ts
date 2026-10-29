import assert from 'assert'
import minecraftData from 'minecraft-data'
import { latestSupportedProtocolVersionOf, latestSupportedVersion } from '../lib/version.ts'

describe('version', () => {
  it("reads the latest supported version's protocol from minecraft-data", () => {
    assert.strictEqual(latestSupportedProtocolVersionOf(minecraftData.versionsByMinecraftVersion.pc), minecraftData(latestSupportedVersion)?.version.version)
  })

  it('says minecraft-data is outdated when it does not have the latest supported version', () => {
    assert.throws(() => latestSupportedProtocolVersionOf({ '1.8.8': { version: 47 } }), /not supported by minecraft-data - is it up to date\?/)
  })
})
