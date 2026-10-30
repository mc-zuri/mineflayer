# Bedrock

mineflayer connects to Bedrock Edition servers too: give `createBot` a Bedrock version, `bedrock_<version>` as
minecraft-data names it. A Bedrock bot is at its start: it connects, logs in, spawns, knows the game's state, the time, the scoreboards,
the titles, the boss bars, the sounds, the particles, the world's blocks, the entities the server shows and the player
list, walks, sprints, sneaks, jumps and falls by its controls and looks as the vanilla client does, telling the server
every tick, follows the server's corrections, chats, and ends; the rest of the API is Java's only so far.

```js
const mineflayer = require('mineflayer')

const bot = mineflayer.createBot({
  version: 'bedrock_1.21.130', // the server's version: a Bedrock bot does not ask the server for it
  host: '127.0.0.1', // default
  port: 19132, // default
  username: 'Player' // default; the bot logs in offline (without an Xbox account)
})

bot.on('spawn', () => {
  bot.setControlState('forward', true) // walks from the next tick
  bot.lookAt(bot.entity.position.offset(10, 1.62001, 0)).then(() => console.log('looking east'))
})
bot.on('time', () => console.log(`time of day: ${bot.time.timeOfDay}`))
bot.on('chat', (username, message) => console.log(`${username}: ${message}`))
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
| `viewDistance` | `8`, from 1.21.90 `12` (the vanilla client's) | the chunk radius asked of the server: a number of chunks, or one of Java's names (see settings below) |
| `physicsEnabled` | `true` | whether the physics move the player (see physics below) |
| `autoJump` | `false` | whether the player jumps by itself onto a block in its way, as the vanilla client's auto-jump (on there by default) does (see physics below) |
| `defaultChatPatterns` | `true` | as Java's: the chat patterns that emit `chat` and `whisper` (see chat below) |
| `chatLengthLimit` | `512` | as Java's: a longer line is sent in parts (see chat below) |

The bot connects over RakNet; NetherNet and Xbox accounts are not supported yet.

## The bot

- `bot.version` (`'bedrock_1.21.130'`), `bot.majorVersion` (`'1.21'`), `bot.protocolVersion` (`898`),
  `bot.registry` (minecraft-data and prismarine-registry of the version), `bot.username`.
- `bot.entity`: the local player (a prismarine-entity `Entity`, from start_game): its feet's `position`, `velocity`,
  `yaw` and `pitch` (mineflayer's radians), `onGround`, and `isCollidedHorizontally` / `isCollidedVertically`
  (see the local player below).
- `bot.physicsEnabled`: whether the physics move the player (see physics below).
- `bot.autoJump`: whether the player jumps by itself onto a block in its way (see physics below).
- `bot.game`: as Java's but `maxPlayers`, which throws (see game state below).
- `bot.settings`, `bot.setSettings(options)`: as Java's; only the view distance reaches the server (see settings
  below).
- `bot.time`: as Java's (see below).
- `bot.world`, `bot.blockAt(point)`, `bot.waitForChunksToLoad()`: the world's blocks (see below).
- `bot.entities`, `bot.nearestEntity(match)`, `bot.entityAtCursor(maxDistance)`, `bot.vehicle`: the entities the
  server shows, the one the player looks at, and the one it rides (see below).
- `bot.scoreboards`, `bot.scoreboard`, `bot.teams`, `bot.teamMap`, `bot.tablist`: as Java's, as Bedrock has them (see
  scoreboards below).
- `bot.bossBars`: as Java's, the bars of the boss entities the bot has (see boss bars below).
- `bot.players`, `bot.player`: the player list (see below).
- `bot.controlState`, `bot.setControlState(control, state)`, `bot.getControlState(control)`,
  `bot.clearControlStates()`, `bot.look(yaw, pitch)`, `bot.lookAt(point)`, `bot.waitForTicks(ticks)`: as Java's
  (see controls and look below).
- `bot.chat(message)`, `bot.whisper(username, message)`, `bot.addChatPattern`, `bot.addChatPatternSet`,
  `bot.removeChatPattern`, `bot.chatAddPattern`, `bot.awaitMessage(...)`; `bot.tabComplete` rejects (see chat below).
- `bot.end(reason)`, `bot.quit(reason)`; `bot.loadPlugin`, `bot.loadPlugins`, `bot.hasPlugin`.
- Events, as Java's: `inject_allowed` (the bot's first frame), `login` (the server's start_game), `game` (`bot.game`
  changed: see game state), `spawn` (the player is initialized: see the local player), `time`, `physicsTick` (`physicTick`: every tick, from start_game),
  `move (previousPosition)` (the auth input reported another position or rotation), `forcedMove` (the server moved
  the player), `chunkColumnLoad (corner)`, `blockUpdate (oldBlock, newBlock)`,
  `blockUpdate:(x, y, z) (oldBlock, newBlock)`, the entities' events and `mount`, `dismount (vehicle)` (see entities
  below), `scoreboardCreated`, `scoreboardDeleted`, `scoreboardTitleChanged`, `scoreUpdated`, `scoreRemoved`,
  `scoreboardPosition` (see scoreboards below), `title (text, type)`,
  `title_times (fadeIn, stay, fadeOut)`, `title_clear` (see titles below), `bossBarCreated (bossBar)`,
  `bossBarUpdated (bossBar)`, `bossBarDeleted (bossBar)` (see boss bars below),
  `soundEffectHeard (soundName, position, volume, pitch)`,
  `hardcodedSoundEffectHeard (soundId, soundCategory, position, volume, pitch)` (see sounds below),
  `particle (particle)` (see particles below),
  `message (jsonMsg, position)`, `messagestr (message, position, jsonMsg)`, `chat` and
  `whisper (username, message, translate, jsonMsg)`, `actionBar (jsonMsg)`, `chat:<name> (matches)`,
  `unmatchedMessage (message, jsonMsg)` (see chat below), `kicked (reason, loggedIn)`, `end (reason)`, `error`. The
  team events (`teamCreated`, `teamRemoved`, `teamUpdated`, `teamMemberAdded`, `teamMemberRemoved`) are declared, so
  that code for both editions type checks, and never come.
  - `blockUpdate:(x, y, z)` is typed for every position (`blockUpdate:(1, 64, 2)`), not only by its placeholder name
    as Java's.
  - `kicked`'s reason is the disconnect packet's message as it is (Java's is a JSON text), or its reason code's name
    when the server hides the message (1.21.20+).
  - `end`'s reason is the kick's, the one `bot.end(reason)` was given, or `'socketClosed'`. It comes shortly after the
    connection closed (50 ms), once bedrock-protocol has told the server the player left: a process may exit on it.

## Frames and ticks

A Bedrock bot runs the vanilla client's loop, one frame after another (`lib/bedrock/core`):

1. **packet pass**: the packets received since the last frame are handled, in the order they arrived. A packet is
   never handled when it arrives;
2. **input pass**: what the API was asked since the last frame is done, in call order;
3. **ticks**: the 20 per second the frame is due (one per frame, at most two after a stall), each starting with what
   the packet passes before it staged (a column, a section), then running the tick's systems in the client's order,
   then `physicsTick`. Ticks are counted from start_game, never from the server's tick;
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
| boss_event show_bar of an entity the bot has, which has no bar yet | boss_event register_player (see boss bars) |
| boss_event hide_bar of a bar the bot shows | boss_event unregister_player |
| start_game | request_chunk_radius (the view distance; from 1.19.80 with the vanilla client's maximum, 28), tick_sync (up to 1.20.50), serverbound_loading_screen 1 (from 1.21.20); when the player's game type falls back to the world's, set_player_game_type fallback after tick_sync (up to 1.26.10), from 1.26.20 first |

In its ticks the bot sends its auth input (player_auth_input), then asks for the sections of the columns sent without
them (subchunk_request, from 1.18.0), as the vanilla client does, from when the server shows the player: see the local
player and the world.

Events come at their point in the frame:

| Event | When |
| --- | --- |
| `login`, `game`, `time`, `forcedMove`, `blockUpdate`, `message`, `messagestr`, `chat`, `whisper`, `actionBar`, `chat:<name>`, `unmatchedMessage`, the scoreboard, title, boss bar, sound and particle events, `kicked`, `end`, `error`; `entitySpawn`, `entityMoved`, `entityAttributes`, `entityEffect`, `entityEffectEnd`, `itemDrop`, `playerCollect`, `entityAttach`, `entityDetach`, `mount`, `dismount` and the events of entity_event and animate; `playerJoined`, `playerUpdated`, `playerLeft` | the packet pass |
| `chunkColumnLoad`; `entityUpdate`, `entitySleep`, `entityElytraFlew`, `entityCrouch`, `entityUncrouch` | the start of a tick |
| `spawn` (and `entitySpawn` of `bot.entity` right after it), `entityGone` (and `dismount` of the vehicle gone), `physicsTick`, `physicTick`, `move` | the end of a tick, in this order, once `bot.entity` shows where the tick left the player |

## The local player

The server places the player, and shows it: the bot sends an auth input every tick from then, as the vanilla client
of the version does (these are the recorded joins of every version):

1. **start_game** creates `bot.entity` where it says (its eye: the feet are 1.62001 below, as floats), looking as it
   says; `onGround` is false.
2. **respawn**, ready (its state 1; `x`, `y`, `z` up to 1.16.210, `position` after), places it, and with
   **play_status player_spawn** spawns it. Once both came and the column under the feet is shown, the server shows the
   player: the bot sends an auth input from the next tick on. After 200 ticks without that column it shows the player
   anyway, emitting an `error` that names the column.
3. **Held**: from 1.18.0 the player does not move until the 3 × 3 columns around it are shown with every section
   asked for answered (or 200 ticks passed, with an `error` naming the columns missing). Its auth inputs until then
   report no key and no move. Up to 1.17.40 it moves from its first auth input.
4. **Initialized**: the bot sends set_local_player_as_initialized right after the auth input of the vanilla client's
   tick, and emits `spawn` at the end of that tick, or of the first tick the player moves, whichever is later:

| Versions | set_local_player_as_initialized | `spawn` |
| --- | --- | --- |
| 1.16.201 – 1.17.40 | after the auth input of the 5th tick the player moves | that tick |
| 1.18.0 – 1.20.50 | after the 13th's | that tick |
| 1.20.61 – 1.21.2 | after the 8th's | that tick |
| 1.21.20+ | after the last held auth input, right after serverbound_loading_screen 2 | the first tick the player moves |

The vanilla client sends it a while after play_status player_spawn (bedrock-protocol at once). The server shows the
player in two steps here, auth inputs and then movement, as the recordings show: not on player_spawn alone.

From the tick it moves, the physics move the player every tick (see physics below). The server moves it in the packet
pass:

- **move_player** of the player's runtime id (start_game's, by its low 32 bits: move_player's is a varint) places it,
  without velocity, emitting `forcedMove`, and turns it; its `rotation` mode only turns it. The next auth input
  answers it: it reports where the server put the eye, without velocity; from 1.19.60 with the `handled_teleport`
  flag; from 1.21.70 client_camera_aim_assist clears the aim assist after it. The last move of a frame is answered,
  also in the first auth input when it came before the server showed the player.
- **correct_player_move_prediction** and **set_entity_motion** (of the player's runtime id) correct it: see
  corrections below.
- **set_entity_data** of the player's runtime id echoes its flags: see the echo under physics below.
- `bot.entity` shows the player's position, velocity, `onGround` and `isCollidedHorizontally` /
  `isCollidedVertically` as the packet pass leaves them, and as each tick ends.
- `move` is emitted at the end of a tick whose auth input reported another position or rotation than the one before,
  with the feet that one reported.

The auth input, as each version writes it (the vanilla client's values: a keyboard and a mouse, on the screen):

| Versions | Fields |
| --- | --- |
| 1.16.201 | the rotation (`head_yaw` its yaw), the eye, the move vector, the flags (a varint), `input_mode` `touch` (minecraft-data names 1.16.201's mouse so), `play_mode` `screen`, the tick, `delta` |
| 1.16.210 – 1.18.30 | the flags a varint64, `input_mode` `mouse`; no item, item stack or block action |
| 1.19.1 – 1.19.63 | `interaction_model` `touch` |
| 1.19.70 – 1.21.30 | `analogue_move_vector` (0, 0); no vehicle |
| 1.21.42 | `interact_rotation` and `camera_orientation`, (0, 0) and (0, 0, 0) while held |
| 1.21.50 – 1.26.30 | `raw_move_vector`: the move vector before sneaking scales it; the flags a varint128 |
| 1.26.40 – 1.26.45 | the flags a list of those set; every absent field written present, then absent, as the vanilla client does |
| 1.26.51+ | the flags a list; the absent fields absent |

The tick is the bot's (from start_game), never the server's. Its `position` is the eye the physics report (answering a
teleport, where the server put the eye), its `delta` the velocity they left (0 answering a teleport), its `move_vector`
the move they were given (scaled while sneaking), `raw_move_vector` the keys' direction. The flags, by their names in
the version, while the player moves (held, only `block_breaking_delay_enabled`, and a teleport's):

| Flag | When |
| --- | --- |
| `up`, `down`, `left`, `right` | forward, back, left, right held |
| `jump_down`, `jumping`, `want_up`; `north_jump` up to 1.20.80 | jump held |
| `sprint_down`, `sprinting` | sprint held (as recorded: a wall stopping the sprint does not clear `sprinting`) |
| `sneak_down`, `sneaking`, `want_down` | sneak held |
| `start_sprinting`, `stop_sprinting`, `start_sneaking`, `stop_sneaking`, `start_jumping`, from 1.16.210 | the tick's physics started or stopped a sprint or a sneak, or jumped |
| `horizontal_collision`, `vertical_collision`, from 1.21.30 | the move was stopped along x or z, along y (as the last tick left it, answering a teleport) |
| `jump_pressed_raw`, `jump_released_raw`, `jump_current_raw` (and sneak's), from 1.21.50 | jump (sneak) pressed, released since the last auth input that reported the keys; held |
| `block_breaking_delay_enabled`, from 1.21.0 | always |
| `handled_teleport`, from 1.19.60 | the auth input answers a teleport |

## Corrections

The server corrects the player with correct_player_move_prediction (where its eye was after one of the bot's ticks,
its velocity, and whether it stood on the ground), set_entity_motion (its velocity; stamped with a tick from 1.20.71)
and move_player (stamped from 1.21.70). How they act depends on the server's movement authority:

| Versions | The movement authority |
| --- | --- |
| 1.16.201 – 1.21.80 | start_game names it: `server` (recorded up to 1.21.60), `server_with_rewind` (recorded on 1.21.70 and 1.21.80; 1.16.201 names it `server_v2_rewind`) or `client` |
| 1.21.90+ | start_game names none: it rewinds |
| 1.21.42+ | set_movement_authority changes it |

- **Under the `server` or `client` authority** a correction acts at once, in the packet pass, as set_entity_motion
  does; the next auth input reports it. (Under the `client` authority the vanilla client would send move_player instead
  of its auth inputs: the bot does not.)
- **Under an authority that rewinds**, the bot keeps a ring of its last ticks: start_game's `rewind_history_size` of
  them (0 is 1, at most 1000; 1.16.201 names none: one), each with what its movement read (the keys, the rotation,
  whether it answered a teleport, whether the auto-jump was on) and where it left the player. In the packet pass a
  packet that names one of these ticks is filed on it; the next tick starts by playing the ticks since again from it
  (the first system of its tick, as the vanilla client's LocalPlayerRewindSystem), with the packets filed on each in the
  order they came, and its auth input reports where they lead: a correction of tick 61 received after the auth input of
  tick 62 shows in that of tick 63, as recorded on 1.26.51. A tick played again sends nothing and emits nothing; the
  tick counter is the bot's own, which no correction moves.

What is filed:

| Packet | Filed on its tick | Otherwise |
| --- | --- | --- |
| correct_player_move_prediction | unless it agrees with the tick: its feet within 1e-5 (squared, summed z, y, x as floats, as the vanilla client sums it) and on the ground alike, while no rewind is asked for | tick 0, a tick older than the ring, or one after its last (the server can only correct a tick the bot sent): dropped, and counted; a vehicle's (from 1.20.80) is ignored |
| set_entity_motion | unless the velocity is exactly the player's present one: an echo, counted | without a tick, or tick 0: set at once; a tick older than the ring, or after its last: dropped |
| move_player | a teleport of less than 16 blocks, asking for no rewind: a rewind over its tick plays it again | a reset, a teleport of 16 blocks or more, tick 0, a tick not in the ring (counted as a correction's) |

move_player places the player at once either way. A packet that acts at once (move_player, unless filed; respawn;
set_entity_motion; a correction under the `server` or `client` authority) starts the ring again: the ticks before it
would lead elsewhere. An echo of other flags than the player's (see physics) acts on the next tick only, and a tick
played again acts on no echo: a rewind that tick begins with plays the ticks before it again as they were, and the ring
starts again with that tick. A system that throws while a tick is played again abandons the rewind: the player stays
where it was, and the ring starts again.

A tick played again is the physics' tick again, on what the tick read (its input to the physics, or that
physicsEnabled held the player), from where the packets filed before it put the player (its box following its feet).
The bot counts what became of the server's packets (filed, agreed, echoes, unstamped, too old, anomalies, rewinds,
replayed ticks and abandoned rewinds): an internal bot's `_player.corrections.stats`.

## Controls and look

- **`setControlState(control, state)`** (forward, back, left, right, jump, sprint, sneak): `getControlState` and
  `controlState` read it at once (`controlState.jump = true` sets it too). The key is pressed or released in the next
  frame's input pass; the tick's input system makes the keys the move vector (x left, z forward; a diagonal as long as
  a side, 0.70710677; the physics take 0.3 of it while sneaking) and the flags. A control set in a `physicsTick`
  listener of tick n shows in the auth input of tick n + 1. A press or a release is kept until an auth input that
  reports the keys: a tap shorter than a tick, or one before the player moves, still reaches the server.
- **`look(yaw, pitch)`** and **`lookAt(point)`** (from the eye, 1.62001 above the feet) turn the player to
  mineflayer's radians, as Bedrock's degrees (floats), the yaw in (−180, 180]: the vanilla client reports looking east
  as −90 (recorded), not 270; whether it reports north as 180 or −180 was not recorded. The look is taken in the next
  frame's input pass, applied after that frame's ticks (`bot.entity` turns then: the last look of a frame wins), and
  reported by the auth input of the frame after: a look asked for in a `physicsTick` listener of tick n shows in the
  auth input of tick n + 2, and resolves at the end of that tick. A look the player looks already, with no look under
  way, resolves at once. `force` does nothing: the look is always whole.
- **`waitForTicks(ticks)`** resolves at the end of the tick `ticks` ticks on (counted from start_game's tick 0
  before it); 0 or less resolves at once.
- Every promise the bot gave rejects when it ends.

## Physics

The physics are prismarine-physics' Bedrock engine (`prismarine-physics/lib/bedrock`), which moves the player as the
vanilla client of the version does, in floats: walking, sprinting, sneaking (and keeping the player on an edge),
jumping, gravity, drag and friction (ice, soul sand ...), stepping up, and the collisions with the blocks' shapes. It
runs at the vanilla client's PredictedMovementSystem, each tick the player moves, on the tick's input:

- the move the keys ask for (x left, z forward), scaled to 0.3 while sneak is held, and on the tick it is released;
- the yaw and the pitch (Bedrock degrees), and jump, sneak and sprint held;
- whether the tick answers a teleport (that tick ends after the jump);
- whether the auto-jump is on (see below).

A sprint starts on the sprint key only: a second forward press does not start one (the vanilla client's double tap), so
that a bot pressing forward again and again does not sprint. Releasing sprint does not stop a sprint (Bedrock's rule):
the move does, when it no longer goes forward, and a wall (but on 1.21.60). The bot keeps no food level yet: hunger
never stops a sprint.

The physics read `bot.world`, as `bot.blockAt` does. Where the bot has no column, or asked for the section and has no
answer yet, a cell below the section of the feet is solid and one from it up is air: the player stands on what the
server has not sent rather than falls through it.

What the tick did is reported in its auth input (see the local player above), and `bot.entity` shows it at the end of
the tick. A step up is reported as the vanilla client reports it:

| Versions | The eye reported |
| --- | --- |
| 1.16.201 – 1.16.220 | it slides up the step: on the step's tick where it was, then up 0.6 of what is left each tick |
| 1.17.0 – 1.20.61 | on the step's tick, over the feet the step started from; over the feet from the tick after |
| 1.20.71+ | over the feet |

Besides the auth input, before it in the tick, the vanilla client tells the server, and so does the bot:

| Versions | What | When |
| --- | --- | --- |
| 1.16.201 | player_action `start_sprint`, `stop_sprint`, `start_sneak`, `stop_sneak`, `jump`, in this order | the tick started or stopped a sprint or a sneak, or jumped (later versions: the auth input's flags) |
| 1.16.201 – 1.20.40 | move_player `normal`, on the ground, at the eye the auth input reports | the tick landed |

`bot.physicsEnabled = false` (or the option `physicsEnabled: false`) holds the player: from the next frame it stands
where it is, without velocity, moving into nothing (`bot.entity` shows no collision), and its auth inputs report its
eye over its feet (on the tick after a step too), no key and no move (looks, a teleport's answer and the server's
corrections still act; a held tick drops an echo the server sent before it and a jump the auto-jump asked for, see
below). Set back to true, it moves from the next frame.

**The echo.** The server sends set_entity_data of the player's flags. Up to 1.21.60 it is unstamped (tick 0), with the
flags as the server last saw them, a tick or two behind, and the vanilla client takes its sprint and sneak as its own in
the packet pass: its next tick starts or stops them again by the keys, and tells the server so again. As recorded: after
the keys are released, every echo still saying it sprints gives the next auth input `stop_sprinting` again (on
1.16.201 player_action `stop_sprint`), and a sneak's alike; falling with sprint held, an echo saying it does not sprint
gives `start_sprinting` again; a sprint a wall stopped, echoed as sprinting, is stopped again, not started and stopped.
It moves as its own last tick left it, though: in its pose (an echo resizes nothing) and as fast as its sprint was. The
bot does so with the last echo before a tick that differs from the player's flags (that tick starts the ring again, see
corrections): the tick's starts and stops, and whether it sprints after it, follow the echoed flags; its move follows
the player's own, and so does a jump the auto-jump starts in it (see below). So, though not recorded, a sprint the
sprint key no longer holds ends on an echo saying it does not sprint; and released from a sneak against a block it has
room to jump onto sneaking only, the player does not jump by itself, whatever the echo says of its sneak. An echo
without the flags changes nothing (minecraft-data names them `index` on 1.16.201). From 1.21.70 the server stamps the
echo with a tick; recorded, it always agrees with the player's flags when it arrives, and the bot ignores it.

**The auto-jump.** `bot.autoJump = true` (or the option `autoJump: true`) makes the player jump by itself onto a block
in its way, as the vanilla client's auto-jump does: walking on the ground, not sneaking, into a block too high to step
onto and low enough to jump onto (prismarine-physics' README tells the rule). It is off unless set, though the vanilla
client's is on by default: a Java bot does not jump by itself, and a bot following a path must not be surprised by a
jump it did not ask for. Set or unset, it acts from the next frame: unset, it drops a jump the look ahead (from 1.21.0)
asked for in the tick before, as a held tick does. A tick played again jumps as it did.

| Versions | The auto-jump jumps |
| --- | --- |
| 1.16.201 – 1.20.80 | on the tick whose move runs into the block; up to 1.16.220 the step onto a block no higher than a step takes the player off the ground instead |
| 1.21.0+ | on the tick after a move that ended on the ground, looking ahead, found the block |

Its tick is told as a jump, but not as the jump key: the auth input reports `jumping` and (from 1.16.210)
`start_jumping`, not `jump_down`, `want_up`, `north_jump` nor (from 1.21.50) the raw jump flags; on 1.16.201 the bot
sends player_action `jump`, and up to 1.20.40 move_player on the landing, as recorded on the walk against a top slab
and up stairs.

There is no `bot.physics` (Java's gravity, speeds and friction to tune): the vanilla client's are fixed floats, which
the engine takes from the version.

Where the bot differs from the vanilla client:

- on the builds where the engine's sine and cosine are not the vanilla client's routine (prismarine-physics' README
  says which), in the last float bits of a move turned by the yaw; the walk, the jump and the fall at yaw 0 are exact
  on every version;
- liquids, climbing, flight, gliding, riding, effects, slime and honey, cobwebs and powder snow, and the other blocks
  prismarine-physics' README lists are not modelled: the player moves through them as through air, or on them as on a
  full block;
- the vanilla client's auto-jump is on unless its player turns it off; the bot's is off unless set (see above);
- up to 1.20.0 the vanilla client also sends level_sound_event `Land` (or `Fall`, after a fall) in the tick it lands,
  before its move_player; the bot does not;
- up to 1.18.0 the vanilla client writes `head_yaw` (of the auth input and the landing move_player) in [0, 360); the
  bot writes the yaw.

## Game state

`bot.game` has Java's fields from start_game on (none before it, as Java's before its login packet): `login`, then
`game`, are emitted once start_game filled it in.

| Field | From |
| --- | --- |
| `dimension` | start_game's dimension (numbered up to 1.18.11, named from 1.18.30): `overworld`, `the_nether` or `the_end` |
| `minY`, `height` | the dimension's lowest block and its height: the overworld's 0 and 256 up to 1.17.40, −64 and 384 from 1.18.0; the nether's 0 and 128; the end's 0 and 256 |
| `gameMode` | start_game's game type of the player, then set_player_game_type and update_player_game_type (the server tells each player every player's: the bot's names start_game's unique id). Survival, creative and adventure are themselves; the survival and creative spectator game types, and from 1.18.30 spectator, are `spectator`; a game type falling back to the world's is the world's (start_game's, then set_default_game_type's); one the version does not name is `survival`, as Java takes a game mode out of range |
| `difficulty` | start_game's, then set_difficulty's, without an event (as Java's); one the version does not name changes nothing |
| `hardcore` | start_game's, from 1.20.80; `false` before |
| `levelType` | start_game's generator: `flat` (the recorded worlds'), `default_1_1` for the old limited worlds, `default` for the others |
| `serverBrand` | start_game's engine (from 1.17.0, none up to 1.16.220): the server's release, such as `'1.26.60'`. Bedrock servers name no brand (Java's is the server software's name) |
| `maxPlayers` | no packet tells it (only the server's answer to a ping, which servers from 1.26.30 may not give): reading it throws. It is not enumerable, so that `{ ...bot.game }` and `JSON.stringify(bot.game)` leave it out |

`game` is emitted again on each set_player_game_type and update_player_game_type of the player, and on
set_default_game_type while the player's game type falls back to the world's. A player whose game type falls back to the
world's says so as start_game is answered (see the answers above), as the vanilla client does. Dimension changes are
not followed yet (see the world below).

## Settings

`bot.settings` has Java's fields and defaults, but for the view distance: the `viewDistance` option, or the vanilla
client's chunk radius (8, from 1.21.90 12). `bot.setSettings(options)` merges `options` into them, checked as Java
checks them: a chat level, a view distance or a main hand it does not know throws, and changes nothing. A view distance
is one of Java's names (`'far'`, 12 chunks; `'normal'`, 10; `'short'`, 8; `'tiny'`, 6) or a whole number of chunks
above 0 (Java takes any number above 0: Bedrock's radius is whole), the option's alike (`createBot` throws).

The view distance is the only setting a Bedrock server is told: a new one is asked for in the next frame's input pass
(request_chunk_radius, from 1.19.80 with the vanilla client's maximum, 28), or set before start_game, in its answer. The
server answers with the radius it allows (chunk_radius_update). A view distance asked for already is not asked for
again. No packet tells a Bedrock server the others (the skin goes with the login): they are kept, and change nothing.

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

## World

`bot.world` is a prismarine-world world of prismarine-chunk columns (its synchronous view, as Java's), holding what
the server sent. `bot.blockAt(point)` reads it, and is `null` where the bot has no column, or where it asked for the
section and has no answer yet; above and below the sections it asks for, a column is air.
`bot.waitForChunksToLoad()` resolves at the end of the frame where the columns within 2 of the player's (5 × 5, as
Java's; around where the player is then) are shown with every section, and rejects after 200 ticks (Java's after
10 s). The server's packets act at their point in the frame:

- **A column** (level_chunk) is read in the packet pass, and shown from the start of the next tick, which emits
  `chunkColumnLoad`: always the next tick, with no random delay. The bot keeps every column: it unloads none. A
  column sent again replaces the shown one there too: the block changes and answers that follow it go to it, and the
  bot asks for its sections again, but for those answered in between.
- **A section** (subchunk) answering the bot is read in the packet pass too, and `blockAt` shows it from the start of
  the next tick (`bot.world` has it already).
- **A block change** (update_block, and update_subchunk_blocks from 1.17.30; the first layer only) changes a shown block
  in the packet pass, emitting `blockUpdate` and `blockUpdate:(x, y, z)`. In a column not shown yet, or a section not
  answered yet, it changes the column only, without an event.
- Each listener of these events is called apart: one that throws is reported (`error`), and the other listeners and
  the rest of the packet go on.
- **start_game** gives the dimension, and whether the block states are numbered by their hash
  (`block_network_ids_are_hashes`, from 1.19.80: true from 1.20.0, false on 1.19.80, as recorded): the registry takes
  it (`registry.handleStartGame`).

How a column comes depends on the version:

| Versions | level_chunk | The sections |
| --- | --- | --- |
| 1.16.201 – 1.17.40 | the whole column (its sections counted) | with the column |
| 1.18.0 | the column without its sections (a count of −1) | the bot asks for each in its own subchunk_request (x, y, z); a subchunk answers each |
| 1.18.11 – 1.26.20 | as 1.18.0, or −2 with the highest section | one subchunk_request a tick asks for them, as offsets from the player's column (origin); one subchunk answers them |
| 1.26.30 | as 1.18.11 | as 1.18.11, the offsets named x, y, z (vec3i8) and before the origin |
| 1.26.40+ | a count of 0, the highest section an option | as 1.26.30; a section of air comes without a payload |

The bot asks for every section of the dimension (the overworld's −4 to 19, the nether's 0 to 7, the end's 0 to 15),
the highest section a server names notwithstanding (the vanilla client asks above it too), in the tick that shows the
column, after the tick's auth input: from the tick after the server shows the player (see the local player), at most
256 sections a tick, the columns nearest the player's first, as offsets from the player's column (where the server
placed it); a column more than 127 columns from it is not asked for, on every version (from 1.18.11 the offsets are
bytes). A section answered as air is known air; one the server could not give (any other result, such as
`player_not_found`) is asked for again in a later tick. Up to 1.26.30 a column with a count of 0 is
whole, and air.

Dropped (and counted): a column of another dimension (level_chunk names it from 1.20.61), a column or section for the
client cache, which the bot keeps none of, and a section or block change of a column the bot was not sent. A column
sent without its sections before 1.18.0 (a negative count) cannot be asked for, and is an error.

Dimension changes are not followed yet: the world stays in start_game's dimension.

## Entities

`bot.entities` holds the entities the server shows, each a prismarine-entity `Entity`, by runtime id; the local
player's `bot.entity` is there from start_game. `bot.nearestEntity(match)` is Java's: the entity nearest the player's
feet that `match` takes, never `bot.entity`. `bot.entityAtCursor(maxDistance = 3.5)` is Java's too: the nearest entity
whose box the player's look ray meets within `maxDistance`, before the first block it meets in `bot.world`, never
`bot.entity` nor an entity of type `object`. The server's packets act at their point in the frame:

| The server sends | The bot |
| --- | --- |
| add_entity, add_item_entity, add_painting | spawns the entity in the packet pass: `entitySpawn`, then for an item `itemDrop` |
| add_player | spawns a player of the player list in the packet pass, at its feet, as its player's `entity`: `entitySpawn` |
| move_entity, move_entity_delta | moves it in the packet pass, to the position, the rotation and on the ground or not as told (move_entity_delta: the axes and rotations it carries): `entityMoved` |
| move_player | moves another player in the packet pass to the feet under the eye it tells, turned, on the ground or not: `entityMoved` |
| set_entity_motion | sets its velocity in the packet pass, without an event, as Java |
| set_entity_data | merges its metadata at the start of the next tick: `entityUpdate`, then as Java `entitySleep` when the update says it sleeps, `entityElytraFlew` when it starts gliding, `entityCrouch` while it sneaks, and `entityUncrouch` once it stops |
| update_attributes | sets `entity.attributes[name]` to `{ value, modifiers }` in the packet pass: `entityAttributes` |
| mob_effect | adds the effect to `entity.effects` by id, or removes it, in the packet pass: `entityEffect (entity, effect)` / `entityEffectEnd (entity, effect)`, with the effect kept (Java's `{ id, amplifier: -1, duration: -1 }` for one it was not told of) |
| entity_event | in the packet pass `entityHurt`, `entityDead`, `entitySwingArm`, `entityTaming`, `entityTamed`, `entityShakingOffWater`, `entityEatingGrass`, `entityEat` |
| animate | in the packet pass `entitySwingArm`, `entityWake`, `entityCriticalEffect`, `entityMagicCriticalEffect` |
| take_item_entity | `playerCollect (collector, collected)` in the packet pass |
| set_entity_link, and the links of add_entity and add_player | in the packet pass, a rider's `vehicle` and its vehicle's `passengers`: `entityAttach (rider, vehicle)` (a rider linked to another vehicle leaves the first without `entityDetach`, as Java), or for a removed link `entityDetach (rider, vehicle)`; the local player's ride sets `bot.vehicle` too, with `mount` / `dismount (vehicle)` |
| remove_entity | removes it at the end of the next tick, before `physicsTick`: `entityGone`, then `isValid` is false and its rides end without `entityDetach` (`dismount` if the player rode it), as Java; it stays in `bot.entities` until then |
| change_dimension | removes every entity but `bot.entity` as remove_entity does: the vanilla client drops the old dimension's entities, which servers do not remove |

`entitySpawn (bot.entity)` comes right after `spawn`, as Java's. The local player's position, velocity, rotation,
`onGround` and size are the movement's (see the local player): a move or a velocity the server sends of it is the
movement's, and its metadata, attributes, effects, `crouching` and `elytraFlying` are kept as any entity's. Its
`eyeHeight` is the vanilla client's, 1.62001 (a float).

Where a Bedrock entity differs from Java's, and why:

| | Java | Bedrock |
| --- | --- | --- |
| `entity.id`, the keys of `bot.entities` | the entity id | the runtime id (its low 32 bits): most packets name an entity by it, remove_entity by its unique id |
| `entity.metadata` | by the protocol's key | by Bedrock's key numbers (the name tag 4, the bounding box 53 and 54; 1.16.201 numbers the keys from 85 one lower), the flags (0) and the extended flags as a bigint |
| `name`, `type`, `displayName`, `entityType`, `kind` | the registry's of the entity type | the registry's of the identifier the server names, without `minecraft:` (`villager_v2`): an empty type is `object`, as Java; one minecraft-data does not have (all up to 1.16.210) is `other` of kind `unknown`, without a displayName |
| `width`, `height` | the registry's | the metadata's bounding box, which servers send with every entity, else the registry's (on 1.19.1 – 1.20.80 minecraft-data has no sizes) |
| `position` | the feet | Bedrock's actor position: the feet of a mob, above them for some (a boat by 0.375, a minecart on a rail by 0.35) |
| `count` | an experience orb's count | an experience orb's experience |
| `attributes` | Java's names | Bedrock's (`minecraft:health`, `minecraft:movement`) |
| `effects`, `entityEffect` | Java's effect ids | Bedrock's: minecraft-data names none |
| `entityHurt` | with its source from 1.20 | without one: entity_event tells none |
| `entityEat` | animation 3 | entity_event `eating_item` |
| `entityCrouch`, `entityUncrouch` | set the height (1.5, 1.8) and the eye height | leave the size to the bounding box |
| `entityUpdate` and the events of the flags | in the packet's handler | at the start of the next tick: the vanilla client applies set_entity_data then |
| `entityGone` | in the packet's handler | at the end of the next tick: the vanilla client destroys a removed entity then |
| a dimension change | the old dimension's entities stay in `bot.entities` | they are gone at the end of the next tick (`entityGone`), as the vanilla client drops them |
| `getCustomName()` | metadata 2, a JSON text | the name tag as a message, its § codes styling it as the vanilla client draws it; null without one or when empty |
| `getDroppedItem()` | the item stack | throws: the bot reads no Bedrock items yet |
| `entityHandSwap` | entity_status 55 | none: Bedrock tells no hand swap |
| `entityAttach`, `entityDetach` | a leash from 1.9 (attach_entity) | a ride (set_entity_link): Bedrock's leashes are metadata (`lead_holder_eid`), without an event |
| `bot.vehicle` | set by the code, not in `Bot`'s typings | in `BedrockBot`'s; `mount()`, `dismount()` and `moveVehicle()` are not there yet, and the physics still walk a riding player |
| `entityEquip`, `usedFirework`, `equipment`, `heldItem` | | not yet: the bot reads no Bedrock items |
| `bot.entityAtCursor()` | the ray from the eye (`eyeHeight`); the block's ray from `height` over the feet; the distances from the feet; an entity whose feet are farther than `maxDistance` skipped | every ray and distance from the eye, 1.62001 over the feet, as `lookAt`'s; an entity counts by where the ray meets its box. The vanilla client's pick, which sends what the player points at, comes with the actions |
| a player's `position` in move_entity and move_entity_delta | the feet | taken as its eye, as move_player tells it (Bedrock's player position is its eye), and moved to the feet under it; servers were not recorded sending these of a player |

The vanilla client answers none of these packets. How they differ by version:

- **move_entity_delta** carries flags naming the fields present up to 1.26.30 (servers set bits above them too), each
  field optional from 1.26.40, and its ticks from 1.26.51.
- **mob_effect**'s removal carries an amplifier and a duration of 0 up to 1.20.61, the effect's from 1.20.71: the bot
  ends the effect it kept, as Java.
- **set_entity_link** names the rider and the vehicle by their unique ids, and carries the vehicle's angular velocity
  from 1.21.20.
- **The ids**: the runtime id is a varint on 1.16.201 (a varint64 after) in the add packets, move_entity,
  set_entity_motion, set_entity_data, entity_event and mob_effect; add_entity names its ids unique_id and runtime_id
  from 1.19.10. Up to 1.16.210 the add packets give x, y, z and the speeds, and add_painting block coordinates.

### Players

`bot.players` holds the player list by username, each entry Java's `Player`: its `uuid`, `username`, `displayName`
(Java's message of the username), `gamemode` (Java's number) and `entity`, the player's entity while the server shows
it, else null. `bot.player` is the local player's entry, from start_game. The server's packets act in the packet pass:

| The server sends | The bot |
| --- | --- |
| player_list, an add | lists a new uuid (`playerJoined`), or updates a listed one (`playerUpdated`): its entity is the one the server shows of its unique id |
| player_list, a removal | unlists the player (`playerLeft`), its `entity` then null, as Java; never the local player. Its entity stays until the server removes it |
| add_player | spawns the player's entity, if it is listed: the vanilla client and Java show no other |
| update_player_game_type | sets a listed player's `gamemode`: `playerUpdated` |
| remove_entity | at the end of the next tick, as any entity, the player's `entity` is null |

Where the player list differs from Java's, and why:

| | Java | Bedrock |
| --- | --- | --- |
| the local player's entry | after `login` | before it: servers list the local player before start_game, then again (`playerUpdated`), and `bot.player` and its `entity` are set from start_game |
| `gamemode` | the server's | Java's of Bedrock's: survival 0, creative 1, adventure 2, any spectator 3; the fallback is the world's (start_game's); the local player's is start_game's until update_player_game_type, another's the world's until add_player (1.18.30+) or update_player_game_type tells it |
| `ping` | the latency | 0: Bedrock tells no other player's latency |
| `skinData` | the skin's url | undefined: Bedrock skins are images |
| `displayName` | the server's, else the username | the username: Bedrock lists no display name |

How the player packets differ by version:

- **player_list** has one type for all its records up to 1.26.30 (and a verified flag per record, for a removal too up
  to 1.16.210), each record its own type from 1.26.40; the records add whether they are a subclient from 1.20.61, a
  color from 1.21.80, and a PlayFab id from 1.26.60.
- **add_player** names the unique id entity_id_self up to 1.18.11, unique_entity_id up to 1.19.1, unique_id (an li64)
  from 1.19.10; it tells the game mode from 1.18.30, and up to 1.16.210 x, y, z and the speeds. Its position is the
  feet, move_player's the eye.
- **update_player_game_type** tells a tick from 1.20.80; the spectator mode is named from 1.18.30.
- **Before 1.16.220** bedrock-protocol cannot read a player_list of two players with their skins, as servers send it
  once another player joins: other players are then neither listed nor spawned.

## Scoreboards, teams and the tab list

The server's scoreboard packets act in the packet pass, as Java's; the bot answers none, as the vanilla client.

- **Objectives**: Bedrock announces an objective only when it displays it (set_display_objective; a server sends the
  scores of displayed objectives only): its first display creates it in `bot.scoreboards` (`scoreboardCreated`), and
  each display emits `scoreboardPosition (position, scoreboard, previous)` with the slot's number (0 list, 1 sidebar,
  2 belowName: Bedrock has no team sidebars) and the objective shown there before. A display naming no objective
  clears the slot, without an event (Java has none either). A display with another display name changes the title
  (`scoreboardTitleChanged`: no vanilla command renames an objective). remove_objective deletes the objective
  (`scoreboardDeleted`, before it is deleted) from `bot.scoreboards` and from every slot showing it (Java's clears
  the first only).
- **Titles and names** are Bedrock text (its § codes), not Java's JSON.
- **Scores** (set_score): each entry set emits `scoreUpdated (scoreboard, item)` and each removed one
  `scoreRemoved (scoreboard, item)`, in the packet's order; an entry of an objective not displayed is ignored. An
  item is named as Java names it: a player by its username, which the player list gave its unique id when the score
  is set (while the bot does not know the player, by the unique id in decimal: `'-8589934562'`; an entry named
  otherwise than before is removed and set again), a fake player by its name, an entity by its unique id in decimal
  (Java's by its UUID). From 1.26.40 a removal naming no objective removes the entry from every objective.
- **`items`** are sorted as the objective's last display sorts them: descending (Java's) unless the server displays
  it ascending; equal values by name ignoring case.
- **Up to 1.16.210** minecraft-data reads set_score wrongly (see the notes): the bot emits an `error` for each and
  follows no score there; the objectives work.
- **Teams and the tab list**: Bedrock has neither teams nor a tab list header and footer (no version has a packet for
  them): `bot.teams` and `bot.teamMap` stay empty, the team events never come, and `bot.tablist`'s header and footer
  stay empty. The tab list's players are the player list's.

## Titles

The server's set_title acts in the packet pass, as Java's title packets; the bot answers none, as the vanilla client.

- **A title or subtitle** emits `title (text, 'title' | 'subtitle')`, its text as a string without its § codes, as
  Java gives a JSON text's.
- **A JSON title or subtitle** is Bedrock's rawtext (`{"rawtext":[{"text":…},{"translate":…,"with":…}]}`), not Java's
  JSON text: its `title` is the rawtext as the vanilla client shows it, translated with the version's language
  (`item.apple.name` is `'Apple'`). JSON that is not rawtext emits nothing: the vanilla client shows nothing of it
  (Java's shows the text as it is).
- **The times** (set_durations) emit `title_times (fadeIn, stay, fadeOut)`, in ticks; **clear** and **reset** emit
  `title_clear` (Java's clear and reset both do).
- **The action bar** (set_title's action bar types) is chat's (`actionBar`), as on Java, where it comes as a chat
  message: the title plugin emits nothing for it.

## Boss bars

Bedrock has no `/bossbar`: a bar is a boss entity's (the ender dragon's, the wither's). The server's boss_event acts in
the packet pass, as Java's boss bar packets, and the bot answers as the vanilla client.

- **A bar is shown** (`bossBarCreated`) by the first show_bar of an entity the bot has (add_entity): the vanilla
  client shows no bar of an entity it has not, and the server shows it again (every second in the End). The bot then
  tells the server it shows it (register_player, with the player's unique id; from 1.26.30 with the bar's titles,
  progress 0 and the style blue and progress, as the vanilla client writes it).
- **It changes** (`bossBarUpdated`, for every packet, changed or not, as Java's) by show_bar again, the progress, the
  title, the properties and the texture: from 1.26.30 every type carries every field, and each takes its own.
- **It goes** (`bossBarDeleted`, before it leaves `bot.bossBars`, as Java's) with its entity (remove_entity: the
  server does not hide it), by hide_bar (answered with unregister_player), and, every bar, with a dimension change,
  where the vanilla client drops its entities.
- **A `BossBar`** is Java's: `entityUUID` is the entity's unique id in decimal (`'-8589934590'`: Bedrock has no
  UUID); `title` the server's title as Bedrock text, translated when it is a key of the version's language
  (`entity.ender_dragon.name` is `'Ender Dragon'`); `health` the progress (0 – 1); `color` the bar's colour, Java's
  names (Bedrock's rebecca purple, which Java has not, is `undefined`); `dividers` 0, 6, 10, 12 or 20 from the
  overlay; `shouldDarkenSky` from the screen darkening (none from 1.26.30). Bedrock has no dragon bar or fog flag:
  `isDragonBar` and `createFog` are false. Up to 1.16.210 show_bar has no style: the colour is `undefined` and the
  dividers 0 until the server sends its texture.

## Sounds

The server's sounds act in the packet pass, as Java's sound packets; the bot answers none, as the vanilla client.

- **A sound by its name** (play_sound, as `/playsound`) emits `soundEffectHeard (soundName, position, volume, pitch)`:
  Bedrock's name (`random.orb`), the position (the packet's coordinates / 8, as Java's), its volume and pitch.
- **A sound by its type** (level_sound_event: the game's own sounds, a furnace, a step, a hit) emits
  `soundEffectHeard` with the type's name, and volume and pitch 1: the packet has neither, the vanilla client takes
  them from its sound definitions. Up to 1.26.20 the name is minecraft-data's (`FurnaceUse`), from 1.26.30 the
  server's own (`block.furnace.lit`). minecraft-data's names are wrong for some types on 1.16.220 – 1.17.40, differ
  between versions, and some types share the name `_` (see the notes).
- **A type the version does not name** (always up to 1.16.210, where minecraft-data names none) emits
  `hardcodedSoundEffectHeard (soundId, soundCategory, position, volume, pitch)` with its number, the category 0
  (Java's master: Bedrock has no categories), and volume and pitch 1.
- **Not yet:** `noteHeard`, which no recording of a note block shows yet. stop_sound and the music have no Java event.

## Particles

The server's spawn_particle_effect (`/particle`) acts in the packet pass, as Java's particle packet: it emits
`particle (particle)`; the bot answers none, as the vanilla client.

- **A `Particle`** has Java's shape, for an effect Bedrock names: `name` is the effect's (`minecraft:heart_particle`),
  `id` -1 (Bedrock has no particle ids, and minecraft-data no Bedrock particles), `position` where the server puts it,
  one particle (`count` 1) without `offset` (0, 0, 0), `movementSpeed` 0 or `longDistanceRender`: the effect itself
  spreads and moves its particles. When the packet names an entity, the position is relative to it: the bot gives it
  as sent (no recording has one).
- **Not yet:** the particles of level events, which no recording has: no command makes a server send one.

## Chat

`bot.chat(message)`, `bot.whisper(username, message)`, the events `message`, `messagestr`, `chat`, `whisper`,
`actionBar` and `chat:<name>`, the chat patterns (`addChatPattern`, `addChatPatternSet`, `removeChatPattern`,
`chatAddPattern`) and `bot.awaitMessage(...)` are Java's, over what the vanilla client shows in its chat and above
the hotbar and sends of what is typed:

| The server sends | `message`'s position | Also |
| --- | --- | --- |
| text `chat` (a player's chat, `<name> message`, as `chat.type.text`; the text of `/me` without a name), `whisper` (`name whispers to you: message`, as `commands.message.display.incoming`), `announcement` (`/say`), `json_announcement` (1.19.30+) | `chat` | |
| text `raw`, `translation`, `system`, `json` (`/tellraw`, a command's feedback), `json_whisper`; the output of the bot's commands (`command_output`, each message; a failure in red) | `system` | |
| text `tip`, `popup`, `jukebox_popup`; the action bar of a title (`set_title` `action_bar_message`, `action_bar_message_json`) | `game_info` | `actionBar` |

- **Messages** are prismarine-chat `ChatMessage`s that read as the vanilla client shows them: the text is translated
  in the version's language as the vanilla client translates it (a message that is a key, `%key` tokens, `%key`
  parameters, Bedrock's `%s`, `%d`, `%1$s` and `%1`), `§` codes become styles (`toString()` has none, `toMotd()` has
  them), and rawtext JSON becomes components (`text`, `translate` and `with`, `selector`, `score`). A message the
  vanilla client would not show is not one either: a text type it does not know, a rawtext it cannot read.
- Per message, in the packet pass: `message`, the events of the chat patterns it matched (`chat`, `whisper`, the
  name a `chatAddPattern` was given, `chat:<name>`), `messagestr`, `unmatchedMessage` when it matched none, then
  `actionBar` above the hotbar. Java's patterns read `messagestr` first too, so its listeners hear them in the same
  order. Each listener is called apart: one that throws is reported (`error`).
- **Differences from Java's:**
  - `message` and `messagestr` have no `sender` and `verified` (not in the typings either): Bedrock does not sign
    chat, and its text names a player by its XUID, not its UUID.
  - `unmatchedMessage (message, jsonMsg)` is emitted (Java declares it but never emits it).
  - `actionBar` comes for an action bar title too (Java's comes for the system chat's overlay only).
  - `bot.awaitMessage`'s timeout (ms, by default 20000) counts the game's ticks (ms / 50, rounded up), which start
    with start_game; it resolves at the end of the frame the message came in, and rejects when the bot ends.
  - `bot.tabComplete` rejects: a Bedrock server has no tab completion (the vanilla client completes a command from
    the server's `available_commands` itself).
  - `bot.chatPatterns` is not there: Java never sets it.
- **Kept from Java's**, quirks included: `addChatPatternSet` returns the number of patterns and sets added so far
  (the set's index is one less), and a set waiting for its next message ends the matching of the message it matched,
  so a later pattern does not see it; the default `chat` pattern also reads a whisper and an action bar.
- **Sending**: `bot.chat(message)` sends a line as a `text` packet of type `chat`, as the vanilla client sends what is
  typed (without an XUID: the bot logs in offline), and a line starting with `/` as a `command_request`, as the
  vanilla client sends a typed command (from the player, with a UUID of its own). They leave in the next frame's input
  pass, in call order. As Java's: a message starting with `/` is sent whole, any other line by line (empty lines
  skipped) in parts of `chatLengthLimit` characters; `bot.whisper(username, message)` sends each part as
  `/tell <username> <part>`; a number is sent as its text; before `login` both throw Java's errors.

| Versions | A chat message (`text`) | A command (`command_request`) |
| --- | --- | --- |
| 1.16.201 – 1.19.50 | type `chat`, the bot's name, the message, an empty XUID and platform chat id | the command, the origin (`player`, its UUID), not internal |
| 1.19.60 – 1.20.80 | | + the command version (below) |
| 1.21.0 – 1.21.124 | + an empty filtered message | |
| 1.21.130 | + the `authored` category and its types' names (`chat`, `whisper`, `announcement`: a server disconnects a client naming them otherwise), no filtered message | the origin's type as a string, its player entity id 0, the version `latest` |
| 1.26.0+ | + the `authored` category, no filtered message | as 1.21.130 |

- **The command version** (1.19.60 – 1.21.124) is the version of the commands' syntax the server parses the command
  with. The bot sends the vanilla client's, its build's `CommandVersion::CurrentVersion`:

| Versions | Command version |
| --- | --- |
| 1.19.60 – 1.19.63 | 26 |
| 1.19.70 | 32 |
| 1.19.80 | 33 |
| 1.20.0 | 34 |
| 1.20.10 – 1.20.15 | 35 |
| 1.20.30 – 1.20.50 | 36 |
| 1.20.61 | 37 |
| 1.20.71 – 1.20.80 | 38 |
| 1.21.0 – 1.21.2 | 39 |
| 1.21.20 | 41 |
| 1.21.30 – 1.21.60 | 42 |
| 1.21.70 – 1.21.80 | 43 |
| 1.21.90 – 1.21.124 | 44 |

  - Read from each version's Bedrock Dedicated Server executable: up to 1.21.2 the constant its symbols name; from
    1.21.20 the bound its command registrations give `/damage`'s overload, which is registered up to it. 1.21.0's is
    the vanilla client's too (39).
  - Checked on running servers of 1.21.0, 1.21.50, 1.21.90, 1.21.93 and 1.21.100 only: `/damage @s 0` parses with
    that version and is a syntax error with the next one. The other versions are the executables' reading. Other
    commands take a higher version too (`/tell @s hi` runs with any from 1 to 60 on 1.21.0), and a lower one can pick
    an older syntax (`/tell @s hi` is a syntax error with version 0), so the e2e test's `/tell` and `/list` do not
    tell a right version from a near one.
  - The server reads the field as a signed (zigzag) varint, which bedrock-protocol writes unsigned: the bot writes
    twice the version (an odd number reads as a negative version, which fails the command at its `/`).
- **Differences from Java's** in sending:
  - `chatLengthLimit` is 512 by default (Java's 256): the bound the server's text handler checks. It is not a limit
    servers enforce: servers of 1.17.0, 1.21.0, 1.21.130 and 1.26.20 deliver a 600-character chat whole.
  - `whisper` quotes a name with other characters than letters, digits and `_` (`/tell "Steve Two" hi`): Bedrock's
    names can have spaces, which its target parser splits at.
  - A server of 1.17.0 finds no offline player by name as a `/tell` target, even the sender's own, quoted or not
    (`No targets matched selector`; `/tell @s` is delivered). Servers from 1.21.120 refuse a member's player name (a
    member is a server's default) with `<insufficient permissions for selector expansion>` (1.21.120, 1.21.124,
    1.21.130, 1.26.0, 1.26.20). Either is a `system` message. Servers of 1.19.20 – 1.21.111 deliver a member's
    `/tell <name>` (the e2e test's builds: 1.17.10 – 1.19.10 not tried), and 1.21.0 an operator's.
  - Java's waiting for a command before a chat message on 1.19.0 is not needed.

## Tests

- **Unit tests** (`npm run test:bedrock`, every supported version), which must cover `lib/bedrock` entirely (c8):
  - the bot is connected to `FakeBedrockClient` (`test/bedrock/common/server.ts`), the server end of its connection,
    and its frames are stepped by `ManualDriver` (`test/bedrock/common/driver.ts`) at the times a test chooses: a test
    sends packets, steps a frame or a tick, and reads what the bot flushed;
  - every packet goes through bedrock-protocol's codec of the version both ways, as on the wire. A test fails unless
    it reads back as exactly what was written (`test/bedrock/common/codec.ts`): bedrock-protocol writes a packet the
    version does not have, a field it does not have or lacks, a value its type does not hold, without an error but
    differently;
  - `ServerWorld` (`test/bedrock/common/world.ts`) is the server's world: columns built with prismarine-chunk, sent
    and answered as the version's servers do, and `join`, which spawns the player as servers do and ticks until
    `spawn`, failing on any `error`; its start_game names the movement authority the version's servers named, and
    keeps 20 ticks;
  - `BEDROCK_VERSIONS=1.16.201,1.26` runs some versions only.
  - the versions are dealt to 4 processes run at once (`BEDROCK_TEST_JOBS` sets how many), each running every file
    for its versions (`scripts/test-bedrock.ts`); the tests of the latest version only run in each. Nothing waits real
    time: a tick is as long as the test takes to step it.
- **What servers send**: the tests use the packets and values servers sent the vanilla Bedrock client, recorded on
  every version, small ones as their bytes. Versions whose servers send alike are a group, and each group's tests run
  on each of its versions (the time: `set_time` 1.16.201 – 1.26.20, world clocks 1.26.30+, `tick_sync` answers up to
  1.20.50; the world: by how a column comes, a block changes and the dimension is named; the corrections: by the
  ring's size, the correction's shape, the movement authority, how the velocity is set and the player respawned; the
  local player: by when it is held and initialized, the auth input's layout, its flags, and how a teleport is
  answered; the game state: by how start_game names the engine, the dimension and whether the world is hardcore, how
  high the overworld is, how the game type is stamped, which game types are spectator, and where the start_game answer
  says the game type falls back to the world's; the settings: by how the chunk radius is asked for and the vanilla
  client's radius; the physics: by how a jump, a sprint, a sneak, a landing, a step up and an auto-jump are told, when an
  auto-jump jumps and a sprint speeds the player, which collisions are reported, how a column comes, how the echo is
  sent and how a correction acts; the entities: by the layouts of the add packets, move_entity_delta, set_entity_motion,
  the attributes and an effect's removal, how the metadata's flags are written, and what minecraft-data knows of the
  entities; the links: by how set_entity_link is laid out; the players: by the layouts of player_list, add_player,
  move_player and update_player_game_type; the scoreboards: by set_score's layout, one action for the packet's entries
  1.16.220 – 1.26.30, each entry its own type 1.26.40+; the titles: by set_title's layout, the type by its number
  1.16.201, by its name 1.16.210 – 1.17.0, with an xuid 1.17.10 – 1.21.2, with a filtered message 1.21.20+; the boss
  bars: by boss_event's layout, no style with the bar 1.16.201 – 1.16.210, a numbered style 1.16.220 – 1.21.50, a
  filtered title 1.21.60 – 1.26.20, every field of every type with the player 1.26.30 – 1.26.45, without it 1.26.51+;
  the sounds: by level_sound_event's layout and names, numbers 1.16.201 – 1.16.210, misaligned names
  1.16.220 – 1.17.40, names 1.18.0 – 1.21.60, with the entity 1.21.70 – 1.26.10, with where it fires 1.26.20, the
  server's names 1.26.30+, and by play_sound's, a varint y 1.16.201 – 1.26.0, a signed y 1.26.10, a handle
  1.26.20 – 1.26.30, the loops 1.26.40 – 1.26.45, the range check and playback position 1.26.51+; the particles: by
  spawn_particle_effect's layout, without molang variables 1.16.201 – 1.18.11, with them 1.18.30+; the chat: by how the
  text packet, a command's output and an action bar title are laid out, and how the bot's chat and commands are). The
  physics' values are the recorded ones, the same on every version unless a group says otherwise. The workspace's
  `pnpm test:recorded` replays the recordings themselves.
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
  - Its `createSerializer` and `createDeserializer` compile the version's protocol each time, and what they compile
    stays in memory (about 5 MB a codec): the tests compile each version once.
  - Only the shield's item has a blocking tick, and from 1.16.220 the protocol takes the shield's id from a variable,
    `ShieldItemID`, which its client sets from the item states of start_game (item_registry from 1.21.60). A codec
    of `createSerializer` or `createDeserializer` has none until it is set, and reads a shield wrongly: the tests'
    codec sets it from the start_game or item_registry it reads or writes, for its connection only.
- **prismarine-registry, prismarine-chunk, prismarine-world, prismarine-entity:** see
  [API mismatches](typescript/api-mismatches.md#dependency-typings) for their typings.
  - Up to 1.17.40 a column (prismarine-chunk's 1.3 column) cannot be read without its sections:
    `networkDecodeNoCache` throws on a count of −1, and reads −2 as no sections.
  - `newSection(y)`, a section of air, is given its options as its `y`; the tests' server makes a section of air by
    setting a block of air instead.
- **Bedrock Dedicated Server 1.26.30+** with `enable-lan-visibility=false` answers no unconnected ping, so a version
  cannot be asked for there; older builds answer.
- **minecraft-data** reads set_score's entries of 1.16.201 and 1.16.210 the wrong way round: its layout carries an
  entry's identity on a removal, where the wire carries it on a change, so a change reads short and a removal reads
  bytes the packet does not have.
- **minecraft-data** names level_sound_event's types wrongly on 1.16.220 – 1.17.40: its table is shifted, so the
  furnace's 283 reads as `JumpPrevent` (1.18.0 names it `FurnaceUse`). Its names of a type also change between
  versions (`MobArmorStandPlace` and `ArmorStandPlace`), and from 1.19.1 some types share the name `_`.
- **minecraft-data** compares its legacy Bedrock versions (0.14, 0.15) wrongly: `bedrock_0.14`'s version `>=`
  1.16.201 is true. mineflayer's Bedrock versions are a list, not comparisons.
