import neostandard from 'neostandard'

// standard's style for JavaScript and TypeScript (files .gitignore lists are skipped). ESLint loads this file with
// Node's type stripping only behind its --flag unstable_native_nodejs_ts_config, which the npm scripts pass.
export default [
  // generated (pnpm gen:java-types and gen:bedrock-types in the workspace)
  { ignores: ['lib/types/protocol/Java.d.ts', 'lib/types/protocol/Bedrock.d.ts'] },
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
    // the Bedrock bot runs one frame at a time, at the time its driver gives: no clock, timer, randomness or state
    // outside a bot
    files: ['lib/bedrock/core/**/*.ts'],
    rules: {
      'no-restricted-globals': ['error', 'setTimeout', 'setInterval', 'setImmediate', 'queueMicrotask', 'clearTimeout', 'clearInterval', 'clearImmediate', 'Date', 'performance'],
      'no-restricted-properties': ['error', { object: 'Math', property: 'random' }, { object: 'process', property: 'hrtime' }],
      'no-restricted-imports': ['error', { paths: ['timers', 'node:timers', 'timers/promises', 'node:timers/promises', 'perf_hooks', 'node:perf_hooks'], patterns: ['bedrock-protocol', 'bedrock-protocol/*'] }],
      'no-restricted-syntax': ['error',
        { selector: ':matches(Program, ExportNamedDeclaration) > VariableDeclaration[kind!="const"]', message: 'no module-level mutable state' },
        { selector: 'Program > :matches(VariableDeclaration, ExportNamedDeclaration > VariableDeclaration) > VariableDeclarator > :matches(ObjectExpression, ArrayExpression, NewExpression)', message: 'no module-level mutable state (Object.freeze it)' }
      ]
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
