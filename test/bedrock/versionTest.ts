import assert from 'assert'
import minecraftData from 'minecraft-data'
import { testedBedrockVersions, oldestSupportedBedrockVersion, latestSupportedBedrockVersion, isBedrockVersion, isSupportedBedrockVersion, bedrockProtocolVersionOf } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'

describe('bedrock version', () => {
  it('supports every Bedrock release minecraft-data has, from the oldest to the latest supported one', () => {
    // newest first
    const protocolOf = (version: BedrockVersion): number | undefined => minecraftData.versionsByMinecraftVersion.bedrock[bedrockProtocolVersionOf(version)]?.version
    const oldest = protocolOf(oldestSupportedBedrockVersion)
    const latest = protocolOf(latestSupportedBedrockVersion)
    assert.ok(oldest !== undefined && latest !== undefined, 'minecraft-data has the oldest and the latest supported Bedrock version')
    const releases = minecraftData.versions.bedrock
      .filter(version => version.releaseType === 'release' && version.version >= oldest && version.version <= latest)
      .map(version => `bedrock_${version.minecraftVersion}`)
      .reverse()
    assert.deepStrictEqual([...testedBedrockVersions], releases)
  })

  it('has minecraft-data for every supported Bedrock version', () => {
    for (const version of testedBedrockVersions) assert.ok(minecraftData(version) !== null, version)
  })

  it('tells Bedrock versions from Java ones', () => {
    assert.strictEqual(isBedrockVersion('bedrock_1.21.130'), true)
    assert.strictEqual(isBedrockVersion('1.21.4'), false)
    assert.strictEqual(isBedrockVersion(false), false)
    assert.strictEqual(isBedrockVersion(undefined), false)
  })

  it('supports only the tested Bedrock versions', () => {
    assert.strictEqual(isSupportedBedrockVersion('bedrock_1.21.130'), true)
    assert.strictEqual(isSupportedBedrockVersion('bedrock_1.20.11'), false)
    assert.strictEqual(isSupportedBedrockVersion('bedrock_1.0.0'), false)
  })

  it('names a version as bedrock-protocol does, without the prefix', () => {
    assert.strictEqual(bedrockProtocolVersionOf('bedrock_1.21.130'), '1.21.130')
  })
})
