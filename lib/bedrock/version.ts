import type { BedrockVersion } from '../types/api/index.ts'

const testedBedrockVersions: readonly [BedrockVersion, ...BedrockVersion[]] = [
  'bedrock_1.16.201', 'bedrock_1.16.210', 'bedrock_1.16.220', 'bedrock_1.17.0', 'bedrock_1.17.10', 'bedrock_1.17.30',
  'bedrock_1.17.40', 'bedrock_1.18.0', 'bedrock_1.18.11', 'bedrock_1.18.30', 'bedrock_1.19.1', 'bedrock_1.19.10',
  'bedrock_1.19.20', 'bedrock_1.19.21', 'bedrock_1.19.30', 'bedrock_1.19.40', 'bedrock_1.19.50', 'bedrock_1.19.60',
  'bedrock_1.19.62', 'bedrock_1.19.63', 'bedrock_1.19.70', 'bedrock_1.19.80', 'bedrock_1.20.0', 'bedrock_1.20.10',
  'bedrock_1.20.15', 'bedrock_1.20.30', 'bedrock_1.20.40', 'bedrock_1.20.50', 'bedrock_1.20.61', 'bedrock_1.20.71',
  'bedrock_1.20.80', 'bedrock_1.21.0', 'bedrock_1.21.2', 'bedrock_1.21.20', 'bedrock_1.21.30', 'bedrock_1.21.42',
  'bedrock_1.21.50', 'bedrock_1.21.60', 'bedrock_1.21.70', 'bedrock_1.21.80', 'bedrock_1.21.90', 'bedrock_1.21.93',
  'bedrock_1.21.100', 'bedrock_1.21.111', 'bedrock_1.21.120', 'bedrock_1.21.124', 'bedrock_1.21.130', 'bedrock_1.26.0',
  'bedrock_1.26.10', 'bedrock_1.26.20', 'bedrock_1.26.30', 'bedrock_1.26.40', 'bedrock_1.26.45', 'bedrock_1.26.51',
  'bedrock_1.26.60'
]
const oldestSupportedBedrockVersion = testedBedrockVersions[0]
const latestSupportedBedrockVersion = testedBedrockVersions[testedBedrockVersions.length - 1]!

function isBedrockVersion (version: string | false | undefined): version is BedrockVersion {
  return typeof version === 'string' && version.startsWith('bedrock_')
}

function isSupportedBedrockVersion (version: BedrockVersion): boolean {
  return testedBedrockVersions.includes(version)
}

function bedrockProtocolVersionOf (version: BedrockVersion): string {
  return version.slice('bedrock_'.length)
}

export { testedBedrockVersions, oldestSupportedBedrockVersion, latestSupportedBedrockVersion, isBedrockVersion, isSupportedBedrockVersion, bedrockProtocolVersionOf }
