// Runs TypeScript 7's tsc with the given arguments. TypeScript 7 is installed under the typescript7 alias, because
// typescript itself stays at the version typescript-eslint supports; its bin is found wherever the package
// manager put it (npm: this package's node_modules, a hoisted pnpm workspace: the root's).
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import path from 'node:path'

const tsc = path.join(path.dirname(createRequire(import.meta.url).resolve('typescript7/package.json')), 'bin', 'tsc')

try {
  execFileSync(process.execPath, [tsc, ...process.argv.slice(2)], { stdio: 'inherit' })
} catch (error) {
  // tsc printed its diagnostics; only its exit code is left to pass on
  if (error instanceof Error && 'status' in error && typeof error.status === 'number') process.exitCode = error.status
  else throw error
}
