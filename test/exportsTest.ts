import assert from 'assert'
import * as mineflayer from '../index.ts'
import type * as api from '../lib/types/api/index.ts'

// What the public typings say mineflayer exports, and what it does: the assignment is checked by the typecheck (each
// export has the type the typings give it), the test checks that each one is there.
type ExportedValues = 'createBot' | 'Location' | 'Painting' | 'ScoreBoard' | 'BossBar' | 'Particle' |
  'testedVersions' | 'latestSupportedVersion' | 'oldestSupportedVersion' | 'supportFeature' |
  'testedBedrockVersions' | 'latestSupportedBedrockVersion' | 'oldestSupportedBedrockVersion' | 'isBedrockBot'

describe('exports', () => {
  it('exports the values the typings declare, with their types', () => {
    const typed: Pick<typeof api, ExportedValues> = mineflayer
    const names: ExportedValues[] = ['createBot', 'Location', 'Painting', 'ScoreBoard', 'BossBar', 'Particle',
      'testedVersions', 'latestSupportedVersion', 'oldestSupportedVersion', 'supportFeature',
      'testedBedrockVersions', 'latestSupportedBedrockVersion', 'oldestSupportedBedrockVersion', 'isBedrockBot']
    for (const name of names) assert.notStrictEqual(typed[name], undefined, `mineflayer.${name}`)
  })
})
