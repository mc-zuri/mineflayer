import neostandard from 'neostandard'

// standard's style for JavaScript and TypeScript (files .gitignore lists are skipped). ESLint loads this file with
// Node's type stripping only behind its --flag unstable_native_nodejs_ts_config, which the npm scripts pass.
export default [
  // generated (pnpm gen:java-types in the workspace)
  ...neostandard({ ts: true, ignores: ['lib/types/protocol/Java.d.ts'] }),
  {
    files: ['test/**'],
    languageOptions: {
      // mocha's BDD interface
      globals: { describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' }
    }
  }
]
