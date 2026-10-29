# API mismatches: docs, typings and code

mineflayer describes its API three times: in [api.md](../api.md), in its typings (`index.d.ts`, now
`lib/types/api/index.ts`) and in the code. Nothing checked that they agree: api.md and the typings are written by
hand, and as a declaration file the typings were not even type checked (`skipLibCheck` skips every `.d.ts`).

`scripts/api-audit.ts` compares them:

- **api.md**: its headings, `bot.<path>` / `bot.<path>(<params>)` from "Bot" on, the `"<event>" (...)` headings of
  "Events" and `<class>.<member>` in "Classes";
- **typings**: the `Bot` interface, `BotEvents` and the classes, read with the TypeScript compiler API;
- **code**: a bot logged in to a mock server of the latest supported version, and the event names `lib` emits.

`test/apiAuditTest.ts` keeps their disagreements to `test/apiAudit.snapshot.json`: every fix removes its entries
(`node scripts/api-audit.ts --update`), and a new disagreement fails the test. Each fix is its own commit, which also
moves its row below from **Open** to **Resolved**, saying which side was wrong.

In the tables: ✓ has it, ✗ does not; for parameters, what each side lists.

## Open

### Bot members

| Member | api.md | typings | code | Note |
| --- | --- | --- | --- | --- |
| `bot.chatPatterns` | ✓ | ✓ `ChatPattern[]` | ✗ | nothing assigns it: the chat plugin keeps its patterns to itself |
| `bot.game.minY` | ✓ | ✗ | ✓ | |
| `bot.game.height` | ✓ | ✗ | ✓ | |
| `bot.rainState` | ✓ | ✗ | ✓ | |
| `bot.settings.enableServerListing` | ✓ | ✗ | ✓ | |
| `bot.settings.enableTextFiltering` | ✓ | ✗ | ✓ | |
| `bot.settings.particleStatus` | ✓ | ✗ | ✓ | |
| `bot.settings.mainHand` | ✗ | ✓ | ✓ | |
| `bot.currentWindow` | ✗ | ✓ | ✓ | |
| `bot.version`, `bot.majorVersion`, `bot.protocolVersion` | ✗ | ✓ | ✓ | `bot.version` is only mentioned in passing |
| `bot.findPlayer(filter)`, `bot.findPlayers(filter)` | ✗ | ✗ | ✓ | |
| `bot.isAlive` | ✗ | ✗ | ✓ | |
| `bot.uuidToUsername` | ✗ | ✗ | ✓ | a map from player UUID to name |
| `bot.signBook(slot, pages, author, title)` | ✗ | ✗ | ✓ | |
| `bot.parseBedMetadata(bedBlock)` | ✗ | ✗ | ✓ | |
| `bot.QUICK_BAR_START` | ✗ | ✗ | ✓ | |
| `bot.jumpQueued`, `bot.jumpTicks` | ✗ | ✗ | ✓ | the physics plugin's state, on the bot |
| `bot.lastDigTime`, `bot.targetDigFace` | ✗ | ✗ | ✓ | the digging plugin's state, on the bot |
| `bot.attack` | `(entity, swing)` | `(entity)` | `(target, swing = true)` | the typings lack `swing` |
| `bot.blockAtCursor` | `(maxDistance)` | `(maxDistance, matcher)` | `(maxDistance = 256, matcher = null)` | api.md lacks `matcher` |
| `bot.blockAtEntityCursor` | `(entity, maxDistance)` | `(entity, maxDistance, matcher)` | `(entity = bot.entity, maxDistance = 256, matcher = null)` | api.md lacks `matcher` |
| `bot.openEntity` | `(entity)` | `(block: Entity, Class)` | `(entity)` | the typings describe a `Class` parameter the code does not have |

### Bot events

| Event | api.md | typings | code | Note |
| --- | --- | --- | --- | --- |
| `"blockPlaced"` | ✓ | ✗ | emitted | |
| `"chat:name"` | ✓ | ✗ | emitted | a chat pattern's `chat:<name>` |
| `"title_times"`, `"title_clear"` | ✓ | ✗ | emitted | |
| `"weatherUpdate"` | ✓ | ✗ | emitted | |
| `"blockUpdate:(x, y, z)"` | ✓ | ✓ | emitted as `blockUpdate:(1, 64, 2)` | the typings name it with its placeholders, so no real block's event type checks |
| `"physicTick"` | ✗ | ✓ | emitted | the deprecated name of `"physicsTick"` |
| `"unmatchedMessage"` | ✗ | ✓ | ✗ | nothing emits it |
| `"entityPlaced"` | ✗ | ✗ | emitted | `bot.placeEntity`'s entity |
| `"connect"` | ✗ | ✗ | emitted | the client connected |
| `"setSlot:<window id>"`, `"setWindowItems:<window id>"`, `"confirmTransaction<…>"` | ✗ | ✗ | emitted | the inventory plugins' own coordination |

### Classes

| Member | api.md | typings | code | Note |
| --- | --- | --- | --- | --- |
| `villager "ready"`, `villager.trades`, `villager.trade(tradeIndex, [times])` | under `mineflayer.anvil` | `Villager` | ✓ | api.md has no `mineflayer.Villager` heading: the villager's members read as the anvil's |
| `Anvil.rename(item, name)` | ✗ | ✓ | ✓ | |
| `EnchantmentTable.xpseed` | ✓ | ✗ | ✓ | |
| `BossBar.shouldCreateFog` | ✗ | ✓ | ✓ | the same flag as `createFog` |
| `Furnace.close()`, `EnchantmentTable.close()` | as `window.close()` | ✓ | ✓ | the typings declare it again on the subclasses |
| `Location.floored`, `.blockPoint`, `.chunkCorner`, `.blockIndex`, `.biomeBlockIndex`, `.chunkYIndex` | ✗ | ✓ | ✓ | api.md has the class's heading only |
| `ScoreBoard.add()`, `.remove()`, `.setTitle()` | ✗ | ✓ | ✓ | what the scoreboard plugin updates it with |
| `Team.add()`, `.remove()`, `.update()`, `.parseMessage()`, `.displayName()`, `.memberMap`, `.team` | ✗ | ✓ | ✓ | |

## Dependency typings

Typings of mineflayer's dependencies that disagree with what the dependency does at run time. Where mineflayer needs
them right, `lib/types/vendor/` has corrected typings (`tsconfig.json` maps the package there) or `lib/types/`
types the thing itself; each is a candidate for a fix upstream.

| Package | Typings say | Runtime | In mineflayer |
| --- | --- | --- | --- |
| prismarine-chat | the loader takes a version string | it takes a registry too (mineflayer passes `bot.registry`) | `lib/types/vendor/prismarine-chat.d.ts` |
| prismarine-chat | `ChatMessage.fromNotch(str: string)` | 1.20.3+ messages are NBT text components, which it takes | `lib/types/vendor/prismarine-chat.d.ts` |
| prismarine-chat | `new ChatMessage(message)` takes a string, a number or `MessageBuilder`s | it takes a JSON text component (an object, or an array of them), which mineflayer passes | `lib/types/vendor/prismarine-chat.d.ts` (`TextComponent`) |
| prismarine-entity | named exports only (`Entity`) | `module.exports` is the loader `(version) => Entity` | |
| minecraft-protocol | `once('sessionce', ...)`, `once('end', (reasonce) => ...)` | the events are `session` and `end` (a search and replace of `on` with `once` in the typings) | `TypedClient` |
| minecraft-protocol | no `connect_allowed` event, no `wait_connect` | autoVersion sets `wait_connect` and emits `connect_allowed` once it knows the server's version | `TypedClient` |
| minecraft-protocol | `on(event: string, ...)` takes any event name | only the packets of the client's version, and its own events | `TypedClient` (no catch-all) |

## Resolved

| Member | Was | Fixed in |
| --- | --- | --- |
| `Particle.name` | documented and set from the registry's particle (the constructor copies it), not in the typings | the typings |
| `BossBar.color`, `BossBar.dividers` | always one of the colors / divisions in the typings; `undefined` in the code for an index it does not know | the typings |
