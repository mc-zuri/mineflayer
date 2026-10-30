# Bedrock

mineflayer connects to Bedrock Edition servers too: give `createBot` a Bedrock version, `bedrock_<version>` as
minecraft-data names it. A Bedrock bot is at its start: it connects, logs in, spawns, knows the time and ends; the rest
of the API is Java's only so far.

```js
const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  version: 'bedrock_1.21.130', // the server's version: a Bedrock bot does not ask the server for it
  host: '127.0.0.1', // default
  port: 19132, // default
  username: 'Player' // default; the bot logs in offline (without an Xbox account)
})

bot.on('spawn', () => console.log('spawned'))
bot.on('time', () => console.log(`time of day: ${bot.time.timeOfDay}`))
bot.on('kicked', (reason) => console.log(`kicked: ${reason}`))
bot.on('end', (reason) => console.log(`ended: ${reason}`))
```

In TypeScript, `createBot` gives a `BedrockBot` for a literal `bedrock_<version>`, a `Bot` for a Java version (any of
`testedVersions`, a `JavaVersion`) or none, and `Bot | BedrockBot` for a version only known as a `string`:
`mineflayer.isBedrockBot(bot)` tells them apart.

## Versions

Every Bedrock release from 1.16.201 to 1.26.60 (`mineflayer.testedBedrockVersions`, from
`oldestSupportedBedrockVersion` to `latestSupportedBedrockVersion`): the releases minecraft-data has, which
[bedrock-protocol](https://github.com/PrismarineJS/bedrock-protocol) speaks. A server build plays as its release: build
1.21.130.3 is `bedrock_1.21.130`. A build minecraft-data has no release of plays as the release of the same protocol:
1.20.11 is `bedrock_1.20.10` (both protocol 594), 1.26.61 is `bedrock_1.26.60`. Any other version throws.

## Options

| Option | Default | |
| --- | --- | --- |
| `version` | (required) | `bedrock_<version>` |
| `host` | `'127.0.0.1'` | |
| `port` | `19132` | |
| `username` | `'Player'` | offline: the server must allow it (`online-mode=false`) |
| `logErrors`, `hideErrors`, `loadInternalPlugins`, `plugins` | as Java's | a plugin is `(bot: BedrockBot, options) => void` |
| `raknetBackend` | `'raknet-native'` | bedrock-protocol's: `'raknet-native'` or `'jsp-raknet'` (not `'raknet-node'`: a failed connection attempt crashes the process) |
| `connectTimeout` | `9000` | ms to establish the connection; then `error` and `end` |
| `viewDistance` | `8`, from 1.21.90 `12` | the chunk radius asked of the server (the vanilla client's) |

The bot connects over RakNet; NetherNet and Xbox accounts are not supported yet.

## The bot

- `bot.version` (`'bedrock_1.21.130'`), `bot.majorVersion` (`'1.21'`), `bot.protocolVersion` (`898`),
  `bot.registry` (minecraft-data and prismarine-registry of the version), `bot.username`.
- `bot.time`: as Java's (see below).
- `bot.end(reason)`, `bot.quit(reason)`; `bot.loadPlugin`, `bot.loadPlugins`, `bot.hasPlugin`.
- Events, as Java's: `inject_allowed` (the bot's first frame), `login` (the server's start_game), `spawn` (play_status
  player_spawn: the bot tells the server the player is initialized), `time`, `physicsTick` (`physicTick`: every tick,
  from start_game), `kicked (reason, loggedIn)`, `end (reason)`, `error`.
  - `kicked`'s reason is the disconnect packet's message as it is (Java's is a JSON text), or its reason code's name
    when the server hides the message (1.21.20+).
  - `end`'s reason is the kick's, the one `bot.end(reason)` was given, or `'socketClosed'`. It comes shortly after the
    connection closed (50 ms), once bedrock-protocol has told the server the player left: a process may exit on it.

## Frames and ticks

A Bedrock bot runs the vanilla client's loop, one frame after another (`lib/bedrock/core`):

1. **packet pass**: the packets received since the last frame are handled, in the order they arrived. A packet is
   never handled when it arrives;
2. **input pass**: what the API was asked since the last frame is done, in call order;
3. **ticks**: the 20 per second the frame is due (one per frame, at most two after a stall), each running the tick's
   systems in the client's order, then `physicsTick`. Ticks are counted from start_game, never from the server's tick;
4. **look**, then one **flush**: the frame's packets leave together, in the order they were queued.

The bot steps a frame just after each tick is due. Events are emitted in the frame, where what they report happens;
a promise the frame resolves continues after it. Nothing in the bot reads a clock or sets a timer but its driver and
its link to bedrock-protocol (eslint keeps it so).

The bot answers the server itself, as the vanilla client of each version does, in the packet pass of the frame the
packet arrived before:

| The server sends | The bot answers |
| --- | --- |
| play_status login_success | client_cache_status: no cache (the bot keeps none) |
| resource_packs_info, then resource_pack_stack | resource_pack_client_response have_all_packs, then completed (from 1.26.40 with the status's name) |
| network_stack_latency, when it asks for an answer | the same timestamp, asking none |
| start_game | request_chunk_radius (`viewDistance`; from 1.19.80 with the vanilla client's maximum, 28), tick_sync (up to 1.20.50), serverbound_loading_screen 1 (from 1.21.20) |
| play_status player_spawn | set_local_player_as_initialized |

## Time

`bot.time` has Java's fields, and is every field `null` until both the time and the world's age are known (Java's starts
so too). Bedrock sends them apart, in packets that differ by version:

| Field | From |
| --- | --- |
| `time`, `bigTime` (ticks since day 0) | `set_time`, up to 1.26.20; from 1.26.30 the overworld's world clock (`sync_world_clocks`, in the protocol from 1.26.10) |
| `timeOfDay`, `day`, `isDay`, `moonPhase` | the time: `timeOfDay` in [0, 24000), day while it is below 13000 |
| `age`, `bigAge` (the world's ticks) | start_game's `current_tick`, and the server's answer to the bot's `tick_sync` (up to 1.20.50) |
| `doDaylightCycle` | the `dodaylightcycle` game rule (`doDayLightCycle` in later versions) of start_game and game_rules_changed, and from 1.26.30 that the clock is not paused: a server whose game rule stops the day still sends its clock as not paused. Not the time's sign, which is how Java says it |

The server sends the time on login (on some versions before start_game, on others after it) and then about every 256
ticks; each emits `time`. In between, the age advances every tick, and the time while the day goes on.

## Tests

- **Unit tests** (`npm run test:bedrock`, every supported version), which must cover `lib/bedrock` entirely (c8):
  - the bot is connected to `FakeBedrockClient` (`test/bedrock/common/server.ts`), the server end of its connection,
    and its frames are stepped by `ManualDriver` (`test/bedrock/common/driver.ts`) at the times a test chooses: a test
    sends packets, steps a frame or a tick, and reads what the bot flushed;
  - every packet goes through bedrock-protocol's codec of the version both ways, as on the wire. A test fails unless
    it reads back as exactly what was written (`test/bedrock/common/codec.ts`): bedrock-protocol writes a packet the
    version does not have, a field it does not have or lacks, a value its type does not hold, without an error but
    differently;
  - `BEDROCK_VERSIONS=1.16.201,1.26` runs some versions only.
- **What servers send**: the tests use the packets and values servers sent the vanilla Bedrock client, recorded on
  every version, small ones as their bytes. Versions whose servers send alike are a group, and each group's tests run
  on each of its versions (the time: `set_time` 1.16.201 – 1.26.20, world clocks 1.26.30+, `tick_sync` answers up to
  1.20.50). The workspace's `pnpm test:recorded` replays the recordings themselves.
- **e2e test** (the workspace's `pnpm test:e2e`): a bot on every Bedrock Dedicated Server build of a directory, each
  build started for it.

## Notes

What was found getting here, beyond mineflayer:

- **bedrock-protocol:** see [API mismatches](typescript/api-mismatches.md#dependency-typings) for its typings.
  - Its client's `disconnect()` writes the disconnect packet's `hide_disconnect_reason` under another name (so
    `false`) and no reason. The bot leaves with `close()`, which RakNet tells the server, but only 40 ms after it
    returns (raknet-native): the bot ends after that.
  - Without a version, `createClient` pings the server for it, and if the ping fails connects as its latest version
    (1.26.60). A Bedrock bot takes the version from the caller instead.
  - `createClient` answers some game packets itself, at its own times: resource packs, client_cache_status,
    tick_sync (every 500 ms up to 1.20.80), request_chunk_radius (500 ms after resource_packs_info), and
    set_local_player_as_initialized at once on player_spawn. The bot builds its `Client` itself
    (`delayedInit`, `autoInitPlayer: false`), so that it answers them, in its frames.
  - Up to 1.16.210 network_stack_latency's flag is named `unknown_flag`: bedrock-protocol, which checks
    `needs_response`, never answers there.
- **Bedrock Dedicated Server 1.26.30+** with `enable-lan-visibility=false` answers no unconnected ping, so a version
  cannot be asked for there; older builds answer.
- **minecraft-data** compares its legacy Bedrock versions (0.14, 0.15) wrongly: `bedrock_0.14`'s version `>=`
  1.16.201 is true. mineflayer's Bedrock versions are a list, not comparisons.
