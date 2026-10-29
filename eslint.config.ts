import neostandard from 'neostandard'

// standard's style for JavaScript and TypeScript (files .gitignore lists are skipped). ESLint loads this file with
// Node's type stripping only behind its --flag unstable_native_nodejs_ts_config, which the npm scripts pass.
export default [
  // generated (pnpm gen:java-types in the workspace)
  { ignores: ['lib/types/protocol/Java.d.ts'] },
  ...neostandard({ ts: true }),
  {
    files: ['**/*.ts'],
    rules: {
      // A type and a value of the same name are separate declarations to TypeScript (an instance interface and the
      // loader exported under its name); tsc reports a real redeclaration itself.
      '@typescript-eslint/no-redeclare': 'off'
    }
  },
  {
    files: ['test/**'],
    languageOptions: {
      // mocha's BDD interface
      globals: { describe: 'readonly', it: 'readonly', before: 'readonly', after: 'readonly', beforeEach: 'readonly', afterEach: 'readonly' }
    }
  }
]
