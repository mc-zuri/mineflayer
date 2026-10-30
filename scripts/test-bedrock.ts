// Runs the Bedrock unit tests in several processes at once, each with its share of the versions (BEDROCK_VERSIONS, or
// every supported version), dealt in turn so that each gets old and new ones. A test file pays for its versions' data
// and codecs in every process that runs it, so splitting by version, not by file, keeps that cost from multiplying.
// Tests of the latest version only run in every process. BEDROCK_TEST_JOBS sets how many (default 4); arguments go to
// mocha in place of test/bedrock. Under c8, the processes' coverage is measured together.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'
import { bedrockTestVersions } from '../test/bedrock/common/server.ts'

const root = path.resolve(import.meta.dirname, '..')
const mocha = createRequire(import.meta.url).resolve('mocha/bin/mocha.js')
const args = process.argv.slice(2)
const versions = bedrockTestVersions().map(version => version.slice('bedrock_'.length))
const jobs = Math.max(1, Math.min(Number(process.env['BEDROCK_TEST_JOBS'] ?? 4), versions.length))
const shares = Array.from({ length: jobs }, (_share, job) => versions.filter((_version, index) => index % jobs === job))

// the tests wait no real time: a timeout only catches a hang, so it allows for the processes slowing each other
const runs = shares.map(share => new Promise<{ share: string[], code: number, output: string }>((resolve, reject) => {
  const child = spawn(process.execPath, [mocha, '--extension', 'ts', '--exit', '--timeout', '30000', ...(args.length > 0 ? args : ['test/bedrock'])], {
    cwd: root,
    env: { ...process.env, BEDROCK_VERSIONS: share.join(',') }
  })
  let output = ''
  child.stdout.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.stderr.on('data', (chunk: Buffer) => { output += chunk.toString() })
  child.on('error', reject)
  child.on('close', code => { resolve({ share, code: code ?? 1, output }) })
}))

let failed = false
for (const { share, code, output } of await Promise.all(runs)) {
  process.stdout.write(`\n=== ${share.join(', ')}\n${output}`)
  failed ||= code !== 0
}
process.exitCode = failed ? 1 : 0
