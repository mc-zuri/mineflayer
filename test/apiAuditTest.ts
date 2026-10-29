import assert from 'assert'
import { readFileSync } from 'fs'
import { audit, docsSide, emittedEvents, loggedInBot, snapshotFile, typesSide } from '../scripts/api-audit.ts'
import { latestSupportedVersion } from '../lib/version.ts'

// docs/api.md, the public typings and a logged-in bot disagree exactly where test/apiAudit.snapshot.json says
// (docs/typescript/api-mismatches.md explains each): a fix removes its entry, and a new disagreement fails here.
describe(`api audit ${latestSupportedVersion}v`, function () {
  this.timeout(60 * 1000)

  it('the docs, the typings and the bot disagree only where the snapshot says', async () => {
    const { bot, close } = await loggedInBot()
    try {
      const result = audit(docsSide(), typesSide(), bot, emittedEvents())
      const expected = JSON.parse(readFileSync(snapshotFile, 'utf8'))
      assert.deepStrictEqual(result, expected, 'node scripts/api-audit.ts --update records the current disagreements')
    } finally {
      close()
    }
  })
})
