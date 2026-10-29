# Bugs found during the TypeScript migration

Every bug found while mineflayer was migrated to TypeScript is fixed in its own commit, together with a test that
fails without the fix and its row here. `git log --grep '<bug>'` finds the commit; its message says the symptom,
the versions it affected and how it was found.

How a bug was found:

- **types**: the compiler rejected the code once it was typed (a property that does not exist, a value that can be
  `undefined`, a wrong argument type).
- **typing**: writing the types showed it (a packet field no version has, a branch for a type that never arrives,
  an API type that disagrees with the code).
- **tests**: running the test suite on every commit showed it (a flaky or wrong test).
- **strict mode**: ES modules always run in strict mode, where what sloppy-mode CommonJS silently ignored throws
  (a write to a property of a primitive, an assignment to an undeclared variable).

## Tests

| Bug | Versions | Found by | Test |
| --- | --- | --- | --- |
| The scoreboard reset test read `bot.teams` and `bot.scoreboards` right after the mock server's `playerJoin`, which can come before the plugins are injected; it then failed with `{} !== undefined` on a random few versions per run | all | tests | `mineflayer_internal` / scoreboard reset on login |
| The switchWorld respawn test wrote `respawnPacket.dimension.name` where the dimension is a string (1.19 - 1.20.4): the write never did anything, and in strict mode it throws, so the respawn was never sent | 1.19 - 1.20.4 | strict mode | `mineflayer_internal` / world / switchWorld respawn |
| The command block test passed `false` as `bot.setCommandBlock`'s options, which the docs and the typings describe as an object: the plugin's writes of its defaults to `false` did nothing, and in strict mode they throw, so the command was never set | all | strict mode | `mineflayer_external` / commandBlock |
