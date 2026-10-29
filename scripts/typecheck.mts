// Runs TypeScript 7's tsc on the project. TypeScript 7 is installed under the typescript7 alias, because typescript
// itself stays at the version typescript-eslint supports; its bin is found wherever the package manager put it
// (npm: this package's node_modules, a hoisted pnpm workspace: the root's).
//
// While the sources are being typed, typecheck-baseline.json lists how many errors each file still has. A file's
// errors must match it exactly: more is a regression, fewer means the baseline is out of date. A file the baseline
// does not list must have none. `npm run typecheck -- --update-baseline` rewrites it from the current errors.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const baselineFile = path.join(root, 'typecheck-baseline.json')
const tsc = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript7/package.json')), 'bin', 'tsc')

const args = process.argv.slice(2)
const updateBaseline = args.includes('--update-baseline')
const tscArgs = args.filter(arg => arg !== '--update-baseline')

const result = spawnSync(process.execPath, [tsc, '--pretty', 'false', ...tscArgs], { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
if (result.error !== undefined) throw result.error
const output = result.stdout + result.stderr

const errors = new Map<string, number>()
for (const line of output.split(/\r?\n/)) {
  const match = /^(.+?)\(\d+,\d+\): error TS\d+:/.exec(line)
  if (match?.[1] !== undefined) errors.set(match[1], (errors.get(match[1]) ?? 0) + 1)
}
const total = [...errors.values()].reduce((sum, count) => sum + count, 0)

if (updateBaseline) {
  const sorted = Object.fromEntries([...errors].sort(([a], [b]) => a.localeCompare(b)))
  writeFileSync(baselineFile, JSON.stringify(sorted, null, 2) + '\n')
  console.log(`typecheck-baseline.json: ${total} errors in ${errors.size} files`)
} else {
  const baseline: Record<string, number> = existsSync(baselineFile) ? JSON.parse(readFileSync(baselineFile, 'utf8')) : {}
  const files = new Set([...Object.keys(baseline), ...errors.keys()])
  const mismatches: string[] = []
  for (const file of [...files].sort()) {
    const expected = baseline[file] ?? 0
    const actual = errors.get(file) ?? 0
    if (actual > expected) mismatches.push(`${file}: ${actual} errors, the baseline allows ${expected}`)
    else if (actual < expected) mismatches.push(`${file}: ${actual} errors, the baseline still says ${expected}`)
  }
  if (mismatches.length > 0) {
    // the errors of the files that got worse, then what differs
    const worse = new Set(mismatches.filter(m => m.includes('allows')).map(m => m.slice(0, m.indexOf(': '))))
    for (const line of output.split(/\r?\n/)) if ([...worse].some(file => line.startsWith(`${file}(`))) console.log(line)
    console.log(mismatches.join('\n'))
    console.log('(npm run typecheck -- --update-baseline records the current errors)')
    process.exitCode = 1
  } else if (result.status !== 0 && total === 0) {
    // tsc failed without a diagnostic of a file (a configuration error)
    console.log(output)
    process.exitCode = result.status ?? 1
  } else if (total > 0) {
    console.log(`typecheck: ${total} errors in ${errors.size} files, as typecheck-baseline.json records`)
  }
}
