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

## Tests

| Bug | Versions | Found by | Test |
| --- | --- | --- | --- |
| The scoreboard reset test read `bot.teams` and `bot.scoreboards` right after the mock server's `playerJoin`, which can come before the plugins are injected; it then failed with `{} !== undefined` on a random few versions per run | all | tests | `mineflayer_internal` / scoreboard reset on login |
