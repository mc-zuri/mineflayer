import type { JavaVersion } from './types/api/index.ts'

// oldest first; never empty
const testedVersions: readonly [JavaVersion, ...JavaVersion[]] = ['1.8.8', '1.9.4', '1.10.2', '1.11.2', '1.12.2', '1.13.2', '1.14.4', '1.15.2', '1.16.5', '1.17.1', '1.18.2', '1.19', '1.19.2', '1.19.3', '1.19.4', '1.20.1', '1.20.2', '1.20.4', '1.20.6', '1.21.1', '1.21.3', '1.21.4', '1.21.5', '1.21.6', '1.21.8', '1.21.9', '1.21.11', '26.1']
const latestSupportedVersion = testedVersions[testedVersions.length - 1]!
const oldestSupportedVersion = testedVersions[0]

/**
 * The protocol version of the latest supported version, from minecraft-data's table of Java versions
 * (versionsByMinecraftVersion.pc). A minecraft-data older than mineflayer does not have that version.
 */
function latestSupportedProtocolVersionOf (pcVersions: { [minecraftVersion: string]: { version?: number } | undefined }): number {
  const protocolVersion = pcVersions[latestSupportedVersion]?.version
  if (!protocolVersion) throw new Error(`Version '${latestSupportedVersion}' not supported by minecraft-data - is it up to date?`)
  return protocolVersion
}

export { testedVersions, latestSupportedVersion, oldestSupportedVersion, latestSupportedProtocolVersionOf }
