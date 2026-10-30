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
| `"setSlot:<window id>"`, `"setWindowItems:<window id>"`, `"confirmTransaction<…>"` | ✗ | ✗ | emitted | the inventory plugins' own coordination |

### createBot options

| Option | api.md | typings | code | Note |
| --- | --- | --- | --- | --- |
| `hideErrors` | "true by default" | ✓ | `false` by default | api.md is wrong |
| `enableServerListing` | ✓ | ✗ | read, but `false` is ignored (`options.enableServerListing \|\| true`) | |
| `enableTextFiltering`, `skinParts` | ✓ | ✗ | read | |
| `storageBuilder` | ✓ | ✗ | read | |
| `particleStatus` | ✓ | ✗ | ignored: the settings always say `'all'` | |
| `mainHand`, `maxCatchupTicks` | ✗ | ✓ | read | |

### Classes

| Member | api.md | typings | code | Note |
| --- | --- | --- | --- | --- |
| `villager "ready"`, `villager.trades`, `villager.trade(tradeIndex, [times])` | under `mineflayer.anvil` | `Villager` | ✓ | api.md has no `mineflayer.Villager` heading: the villager's members read as the anvil's |
| `Anvil.rename(item, name)` | ✗ | ✓ | ✓ | |
| `EnchantmentTable.xpseed` | ✓ | ✗ | ✓ | |
| `BossBar.shouldCreateFog`, `BossBar.flags` | ✗ | ✓ | ✓ | `shouldCreateFog` is the same flag as `createFog`; `flags` their bits |
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
| prismarine-chat | `MessageBuilder.fromString(str)` returns a `MessageBuilder` | it returns `null` for an empty string (mineflayer checks) | |
| prismarine-entity | named exports only (`Entity`) | `module.exports` is the loader `(version) => Entity` (a registry too) | the Bedrock movement module asserts the default import is a function, which types it as the loader |
| minecraft-protocol | `once('sessionce', ...)`, `once('end', (reasonce) => ...)` | the events are `session` and `end` (a search and replace of `on` with `once` in the typings) | `TypedClient` |
| minecraft-protocol | no `connect_allowed` event, no `wait_connect` | autoVersion sets `wait_connect` and emits `connect_allowed` once it knows the server's version | `TypedClient` |
| minecraft-protocol | `createClient(options)` takes a string `version` | it sets `version: false` itself when none is given (ask the server for its version), and takes it | `lib/types/vendor/minecraft-protocol.d.ts` |
| minecraft-protocol | `on(event: string, ...)` takes any event name | only the packets of the client's version, and its own events | `TypedClient` (no catch-all) |
| bedrock-protocol | `Client` has no event typings (EventEmitter's) | `packet` (every packet, parsed), `status`, `connect_allowed`, `close`, `error`, and an event per packet of the client's version | `lib/types/vendor/bedrock-protocol-client.d.ts` (the events the bot listens to) |
| bedrock-protocol | `Client` has no `init`, `connect`, `onTick` or `serializer` | `new Client({ delayedInit: true })`, then `init()` (emits `connect_allowed`) and `connect()`; `onTick()` sends what `sendBuffer` queued as one batch; `serializer.createPacketBuffer` writes a packet | `lib/types/vendor/bedrock-protocol-client.d.ts` |
| bedrock-protocol | `new Client(options: Options)`: no `username`, `connectTimeout`, `conLog`, `delayedInit`, `autoInitPlayer` | it takes them (`ClientOptions` has the first three, for `createClient`) | `lib/types/vendor/bedrock-protocol-client.d.ts` |
| bedrock-protocol | `Client.close(reason?: string)` | `close()` takes no reason | |
| bedrock-protocol | no typings for `src/transforms/serializer.js` | `createSerializer` / `createDeserializer` of a version | `lib/types/vendor/bedrock-protocol-serializer.d.ts` |
| bedrock-protocol | `ServerAdvertisement.protocol: number` (what `ping` resolves with) | a string | |
| bedrock-protocol | `ClientStatus` is `Disconnected, Authenticating, Initializing, Initialized` | it has `Connecting` after `Disconnected`, so the typings' numbers are off by one from `Authenticating` on | |
| bedrock-protocol | `ClientOptions.conLog?: any` | a function logging connection messages, `null` for none | |
| prismarine-registry | the loader gives a `Registry` of either edition for any version | a `bedrock_` version's is a `RegistryBedrock` | the Bedrock world module tells it by its `handleStartGame` |
| prismarine-chunk | `StorageType` is an ambient `const enum` | there is no value to name, and type stripping inlines none | the Bedrock world module passes `Runtime`'s number, 2 |
| prismarine-world | `WorldSync.getBlock(pos)` returns a `Block` | `null` where no column is loaded | the Bedrock bot's `blockAt` checks the column first |

## Resolved

| Member | Was | Fixed in |
| --- | --- | --- |
| `Particle.name` | documented and set from the registry's particle (the constructor copies it), not in the typings | the typings |
| `BossBar.color`, `BossBar.dividers` | always one of the colors / divisions in the typings; `undefined` in the code for an index it does not know | the typings |
| `Team.membersMap`, `Team.add()`, `Team.remove()`, `new Team()` | the typings named the members map `memberMap` (the code's is `membersMap`), gave `add` a second parameter and `add` / `remove` no result (they return the member's value), and the constructor a boolean `friendlyFire` (the property's number: the packet's bits) | the typings |
| `ScoreBoard.remove()`, `new ScoreBoard()`, `setTitle()`, `add()` | the typings said `remove` always returns an item (it returns `undefined` for a name the scoreboard does not have) and typed the packet's texts as `object` | the typings |
| `createBot(options)`: `username`, `version` | the typings required `username` (minecraft-protocol's `ClientOptions` does) where api.md and the code default it to `'Player'`, and did not take `version: false` (detect the server's version), which createBot and minecraft-protocol set themselves; `createBot()` takes no options at all too | the typings |
| `bot.protocolVersion` | a string in the typings; the protocol number in the code (minecraft-data's `version.version`) | the typings |
| `"connect"` | emitted when the client connects, but neither documented nor typed | api.md and the typings |
| `mineflayer.ScoreBoard`, `mineflayer.BossBar`, `mineflayer.Particle` | the typings declared them as the classes (`new mineflayer.Particle(...)` type checked); mineflayer exports their loaders, a bot's or a version's class: `mineflayer.Particle(registry)` | the typings: the instance types are interfaces, the exports loaders returning `ScoreBoardClass` / `BossBarClass` / `ParticleClass` |
| `Team`, `Chest`, `Furnace`, `Dispenser`, `EnchantmentTable`, `Anvil`, `Villager` | the typings declared them as classes, as if mineflayer exported them (`new mineflayer.Chest()` type checked); it exports none of them, they are the types of what the bot gives | the typings: interfaces |
| `testedVersions`, `latestSupportedVersion`, `oldestSupportedVersion` | declared with `let`, as if they could be assigned, and `testedVersions` as any string array | the typings: constants, a non-empty list |
| `supportFeature(feature, version)` | any string as the feature, and a boolean result; minecraft-data's features are named, and some have a value | the typings |
| `bot.time.bigTime`, `bot.time.bigAge` | the typings said `BigInt`, the type of a BigInt wrapper object (`Object(1n)`), which takes no arithmetic (`bot.time.bigAge + 1n` did not type check); the code sets primitive bigints | the typings: `bigint` |
