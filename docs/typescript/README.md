# mineflayer in TypeScript

mineflayer's sources, tests and tools are TypeScript that Node runs as they are: Node (>= 22.18) strips the types
when it loads a `.ts` file, so there is no build step and no emitted JavaScript.

- [Bugs found during the migration](hidden-bugs.md): each fixed in its own commit, with a test.
- [API mismatches](api-mismatches.md): where api.md, the typings and the code disagree, and how each was resolved.

## How it runs

- `package.json` is `"type": "module"` with `"main": "index.ts"`; relative imports name the `.ts` file.
- `index.ts` exports the API's names, a `default` export (`import mineflayer from 'mineflayer'`) and
  `'module.exports'`, so `require('mineflayer')` (require of an ES module, Node >= 22.12) returns the same object
  as before.
- Only syntax that stripping erases is allowed (`erasableSyntaxOnly`): no enums, namespaces, parameter properties or
  `import =`. Imports of types only are `import type` (`verbatimModuleSyntax`).
- `module: preserve` with `moduleResolution: bundler`: the CommonJS prismarine packages' typings `export default`
  their loader, and their `module.exports` is that loader; `preserve` types the default import as the loader, as
  Node gives it, where `nodenext` types it as the whole module.
- ES modules run in strict mode: what sloppy-mode CommonJS ignored (a write to a property of a primitive) throws.

## Checks

- `npm run typecheck`: TypeScript 7 (the `typescript7` alias; `typescript` is `@typescript/typescript6`, for
  typescript-eslint and the compiler API) with the strictest settings: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noPropertyAccessFromIndexSignature`, `noImplicitOverride`, `noImplicitReturns`,
  `noUnusedLocals` / `noUnusedParameters` and the rest of `tsconfig.json`.
- `npm run lint`: the typecheck, ESLint with neostandard (standard's style, TypeScript included) and
  standard-markdown.
- `test/apiAuditTest.ts`: api.md, the typings and a logged-in bot disagree only where `test/apiAudit.snapshot.json`
  says.

## Progress

While the sources are being typed, two files record what is left; each change has to keep them exact, so they are
the status:

- `typecheck-baseline.json`: the type errors each file still has. `npm run typecheck` fails when a file has more or
  fewer than it records; `npm run typecheck -- --update-baseline` rewrites it. A file it does not list is typed.
- `test/apiAudit.snapshot.json`: the disagreements between api.md, the typings and the code that are not resolved
  yet; `node scripts/api-audit.ts --update` rewrites it.

## Types

- `lib/types/api/`: the public API, which `index.d.ts` re-exports. It is TypeScript, so it is type checked with the
  code (as a `.d.ts`, `skipLibCheck` skipped it).
- `lib/types/internal.ts`: `BotInternal`, the plugins' view of the bot: the public `Bot`, the typed client and the
  helpers plugins share (`bot._<name>`).
- `lib/types/protocol/Java.d.ts`: the packets of every Java version mineflayer accepts, merged (generated from
  minecraft-data's protocol definitions: `pnpm gen:java-types` in the workspace). A field every version has is
  required, one only some versions have is optional with the versions in its JSDoc, a field whose type changed is the
  union.
- `lib/types/protocol/client.ts`: `TypedClient`, the minecraft-protocol client typed by those packets, with no
  catch-all overload: listening to or writing a packet no version has is a type error.
- `lib/types/vendor/`: corrected typings for dependencies whose own typings disagree with their runtime, which
  `tsconfig.json` maps the package to, and typings of modules that have none (listed in
  [API mismatches](api-mismatches.md#dependency-typings)).

[Bedrock](../bedrock.md) has its own:

- `BedrockBot`, `BedrockBotOptions` and the rest in `lib/types/api/`, which import no protocol type: the public API
  stays protocol-free.
- `lib/types/bedrock-internal.ts`: `BedrockBotInternal`, the Bedrock plugins' view of the bot.
- `lib/types/protocol/Bedrock.d.ts`: the packets of every Bedrock version mineflayer connects to, merged as the Java
  ones (`pnpm gen:bedrock-types` in the workspace).
- `lib/types/protocol/bedrock-client.ts`: those packets by name, as read and as written, with no catch-all name (the
  core's handlers and outbox take them).
- `lib/types/vendor/bedrock-protocol-client.d.ts`: what bedrock-protocol's `Client` has beyond its typings.

## Known limitations

- Node does not strip the types of a `.ts` file inside `node_modules`: a package installed from npm would need
  JavaScript emitted from these sources. Inside a workspace (or with `npm link`), where the package is a symlink
  outside `node_modules`, it runs as it is.
