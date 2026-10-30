import assert from 'assert'
import minecraftData from 'minecraft-data'
import { latestSupportedProtocolVersionOf, latestSupportedVersion } from '../lib/version.ts'
import type { JavaVersion } from '../lib/types/api/index.ts'

describe('version', () => {
  it("reads the latest supported version's protocol from minecraft-data", () => {
    assert.strictEqual(latestSupportedProtocolVersionOf(minecraftData.versionsByMinecraftVersion.pc), minecraftData(latestSupportedVersion)?.version.version)
  })

  it('says minecraft-data is outdated when it does not have the latest supported version', () => {
    assert.throws(() => latestSupportedProtocolVersionOf({ '1.8.8': { version: 47 } }), /not supported by minecraft-data - is it up to date\?/)
  })

  it('types Java versions apart from Bedrock ones', () => {
    const versions: JavaVersion[] = ['1.8.8', '1.19', '26.1']
    // @ts-expect-error a Bedrock version is no Java version
    const bedrock: JavaVersion = 'bedrock_1.21.130'
    assert.strictEqual(versions.includes(bedrock), false)
  })
})
