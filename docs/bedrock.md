# Bedrock

mineflayer connects to Bedrock Edition servers too: give `createBot` a Bedrock version, `bedrock_<version>` as
minecraft-data names it. A Bedrock bot is at its start: it connects, logs in, spawns, knows the game's state, the time,
the scoreboards, the titles, the boss bars, the sounds, the particles, the world's blocks, the entities the server shows
and the player list, walks, sprints, sneaks, jumps and falls by its controls and looks as the vanilla client does,
telling the server every tick, follows the server's corrections, chats, keeps the player's items and opens and closes
its inventory, crafts, and ends; the rest of the API is Java's only so far.

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
| `respawn` | `true` | as Java's: whether the bot asks to respawn as soon as the player dies (see health below) |
| `screenAnimations` | `true` | whether, from 1.21.120, a screen closes when its animation ends, as the vanilla client mostly does; `false` closes it at once (see the inventory below) |

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
- `bot.health`, `bot.food`, `bot.foodSaturation`, `bot.isAlive`, `bot.respawn()`: as Java's (see health below).
- `bot.experience`, `bot.oxygenLevel`: as Java's (see experience and breath below).
- `bot.spawnPoint`, `bot.isRaining`, `bot.rainState`, `bot.thunderState`: as Java's (see spawn point and weather
  below).
- `bot.abilities`: as Java's (see abilities below).
- `bot.time`: as Java's (see below).
- `bot.world`, `bot.blockAt(point)`, `bot.waitForChunksToLoad()`: the world's blocks (see below).
- `bot.entities`, `bot.nearestEntity(match)`, `bot.entityAtCursor(maxDistance)`, `bot.vehicle`: the entities the
  server shows, the one the player looks at, and the one it rides (see below).
- `bot.scoreboards`, `bot.scoreboard`, `bot.teams`, `bot.teamMap`, `bot.tablist`: as Java's, as Bedrock has them (see
  scoreboards below).
- `bot.bossBars`: as Java's, the bars of the boss entities the bot has (see boss bars below).
- `bot.players`, `bot.player`: the player list (see below).
- `bot.inventory`, `bot.currentWindow`, `bot.heldItem`, `bot.quickBarSlot`, `bot.openInventory()` (Bedrock's),
  `bot.closeWindow(window)`, `bot.clickWindow(slot, mouseButton, mode)`, `bot.activateBlock(block, direction,
  cursorPos)`, `bot.openBlock(block, direction, cursorPos)`, `bot.activateEntity(entity)`,
  `bot.activateEntityAt(entity, position)`: the player's items and screens, and using a block or an entity (see the
  inventory below).
- `bot.openContainer(block, direction, cursorPos)`, `bot.openChest`, `bot.openDispenser`, `bot.openEntity(entity)`: a
  container block's or entity's screen (see containers below).
- `bot.recipesFor(itemType, metadata, minResultCount, craftingTable)`, `bot.recipesAll(itemType, metadata,
  craftingTable)`, `bot.craft(recipe, count, craftingTable)`, `bot.placeRecipe(recipe, all)` (Bedrock's): the recipes
  crafting_data sends, and crafting them (see crafting below).
- `bot.openVillager(villager)`, `bot.trade(villager, tradeIndex, times)`: the trading screen of a villager or a
  wandering trader, its trades, and trading by its result's clicks (see trading below).
- `bot.openFurnace(furnaceBlock)`: a furnace's, a blast furnace's or a smoker's screen, Java's `Furnace` (see furnaces
  below).
- `bot.openEnchantmentTable(block)`: Java's, its window's options from player_enchant_options and its enchant (see the
  enchanting table below).
- `bot.bedrock.openGrindstone(block)` (Bedrock's): the grindstone, and its window's grind (see the grindstone below).
- `bot.bedrock.putBookOnLectern(lectern, book)`, `bot.bedrock.takeBookFromLectern(lectern)` (Bedrock's): a book put on
  a lectern by a use, and taken by a hit (see the lectern below).
- `bot.bedrock.jukeboxDisc(jukebox)`, `bot.bedrock.playDisc(jukebox, disc)`, `bot.bedrock.takeDisc(jukebox)`
  (Bedrock's): a jukebox's disc, put in and taken out by uses (see the jukebox below).
- `bot.setCommandBlock(pos, command, options)`: Java's, as command_block_update; the command block's screen (see the
  command block below).
- `bot.bedrock.setStructureBlock(structureBlock, settings, trigger)`, `bot.bedrock.setJigsaw(jigsaw, settings)`
  (Bedrock's): a structure block's settings as structure_block_update, a jigsaw block's as block_entity_data; their
  screens (see the structure block and the jigsaw block below).
- `bot.bedrock.createCompound(compound)`, `bot.bedrock.combineLabTable()` (Bedrock's, on an Education world): a
  compound made and a lab table's combine; the Education screens (see the Education screens below).
- `bot.openAnvil(block)`: Java's, its window's combine and rename, the result by Bedrock's rules (see the anvil below).
- `bot.setQuickBarSlot(slot)`, `bot.QUICK_BAR_START`: selecting a hotbar slot (see items below).
- `bot.equip(item, destination)`, `bot.unequip(destination)`, `bot.getEquipmentDestSlot(destination)`,
  `bot.entity.equipment`: as Java's, by clicks (see items below).
- `bot.toss(itemType, metadata, count)`, `bot.tossStack(item)`: as Java's, by clicks (see items below).
- `bot.creative` (`setInventorySlot(slot, item)`, `clearSlot(slot)`, `clearInventory()`): the creative inventory's
  items, by item stack requests (see items below).
- `bot.writeBook(slot, pages)`, `bot.signBook(slot, pages, author, title)`: as Java's, by book_edit (see items below).
- `bot.controlState`, `bot.setControlState(control, state)`, `bot.getControlState(control)`,
  `bot.clearControlStates()`, `bot.look(yaw, pitch)`, `bot.lookAt(point)`, `bot.waitForTicks(ticks)`: as Java's
  (see controls and look below).
- `bot.chat(message)`, `bot.whisper(username, message)`, `bot.addChatPattern`, `bot.addChatPatternSet`,
  `bot.removeChatPattern`, `bot.chatAddPattern`, `bot.awaitMessage(...)`; `bot.tabComplete` rejects (see chat below).
- `bot.end(reason)`, `bot.quit(reason)`; `bot.loadPlugin`, `bot.loadPlugins`, `bot.hasPlugin`.
- Events, as Java's: `inject_allowed` (the bot's first frame), `login` (the server's start_game), `game` (`bot.game`
  changed: see game state), `spawn` (the player is initialized: see the local player; and after a respawn or a dimension
  change: see health and dimension changes), `respawn` (a respawn, or a dimension change), `health`, `death` (see
  health), `experience`, `breath` (see experience and breath), `spawnReset`, `rain`, `weatherUpdate` (see spawn point
  and weather), `abilities (abilities)` (see abilities), `time`, `physicsTick` (`physicTick`: every tick, from
  start_game), `move (previousPosition)` (the auth input reported another position or rotation), `forcedMove` (the
  server moved the player), `chunkColumnLoad (corner)`, `blockUpdate (oldBlock, newBlock)`, `blockUpdate:(x, y, z)
  (oldBlock, newBlock)`, the entities' events and `mount`, `dismount (vehicle)` (see entities below),
  `scoreboardCreated`, `scoreboardDeleted`, `scoreboardTitleChanged`, `scoreUpdated`, `scoreRemoved`,
  `scoreboardPosition` (see scoreboards below), `title (text, type)`, `title_times (fadeIn, stay, fadeOut)`,
  `title_clear` (see titles below), `bossBarCreated (bossBar)`, `bossBarUpdated (bossBar)`, `bossBarDeleted (bossBar)`
  (see boss bars below), `soundEffectHeard (soundName, position, volume, pitch)`, `hardcodedSoundEffectHeard (soundId,
  soundCategory, position, volume, pitch)` (see sounds below), `particle (particle)` (see particles below), `message
  (jsonMsg, position)`, `messagestr (message, position, jsonMsg)`, `chat` and `whisper (username, message, translate,
  jsonMsg)`, `actionBar (jsonMsg)`, `chat:<name> (matches)`, `unmatchedMessage (message, jsonMsg)` (see chat below),
  `windowOpen (window)`, `windowClose (window)`, `heldItemChanged (item)` (see the inventory below),
  `kicked (reason, loggedIn)`, `end (reason)`, `error`. The team events (`teamCreated`, `teamRemoved`, `teamUpdated`,
  `teamMemberAdded`, `teamMemberRemoved`) are declared, so that code for both editions type checks, and never come.
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
| respawn, ready (its state 1), but the join's | player_action respawn (see health) |
| change_dimension | serverbound_loading_screen 1 with its loading screen, when it names one (from 1.21.20); a dead player's player_action dimension_change_ack, up to 1.19.40 (see dimension changes) |
| show_credits of the player, starting | show_credits, ended: at once, as Java answers the end of the game (the vanilla client once the credits rolled) |

In its ticks the bot sends its auth input (player_auth_input), then asks for the sections of the columns sent without
them (subchunk_request, from 1.18.0), as the vanilla client does, from when the server shows the player: see the local
player and the world.

Events come at their point in the frame:

| Event | When |
| --- | --- |
| `login`, `game`, `respawn`, `health`, `death`, `experience`, `breath`, `spawnReset`, `rain`, `weatherUpdate`, `abilities`, `time`, `forcedMove`, `blockUpdate`, `message`, `messagestr`, `chat`, `whisper`, `actionBar`, `chat:<name>`, `unmatchedMessage`, `windowOpen`, `windowClose`, the scoreboard, title, boss bar, sound and particle events, `kicked`, `end`, `error`; `entitySpawn`, `entityMoved`, `entityAttributes`, `entityEffect`, `entityEffectEnd`, `itemDrop`, `playerCollect`, `entityAttach`, `entityDetach`, `mount`, `dismount` and the events of entity_event and animate; `playerJoined`, `playerUpdated`, `playerLeft` | the packet pass |
| `heldItemChanged` | where the held slot changes: the packet pass, or the input pass (a request's prediction, a response taken in) |
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
world's says so as start_game is answered (see the answers above), as the vanilla client does. A dimension change
(change_dimension) sets `dimension`, `minY` and `height`, and emits `respawn`, then `game`, in the packet pass, as
Java's respawn packet (see dimension changes below).

## Health

`bot.health`, `bot.food` and `bot.foodSaturation` are the player's `minecraft:health`, `minecraft:player.hunger` and
`minecraft:player.saturation` attributes (update_attributes of start_game's runtime id), and set_health's health:
undefined until the server tells them, as Java's. `health` is emitted when a packet changes one of them (Java's on each
update_health: Bedrock servers send the attributes with others, and set_health after them, with the same values).

`bot.isAlive` is `true` from the start (hunger or saturation told before the health leave it so), `false` once the
health falls to 0, when `death` is emitted after `health`, and `true` again once the player has health. Servers
tell a death with update_attributes, health 0 (never set_health), in the batch that also has the death message and
respawn's searching state at the place of death. Then, as the vanilla client does on its death screen:

1. **Dead**: the bot sends no auth input from that frame on; it still asks for the sections of the columns sent, as the
   vanilla client does (but while a dimension change up to 1.19.40 hides the player). With the `respawn` option (the
   default) it asks to respawn in that frame's input pass
   (respawn, its state 2, at 0, 0, 0 with the player's runtime id), where the vanilla client asks when its button is
   clicked. `bot.respawn()` asks so in the next frame's input pass, while the player is dead (again on each call, as
   each click does); it does nothing while the player lives.
2. **Respawned**: respawn's ready state places the player, and the bot answers it with player_action respawn in that
   frame (from 1.19.1 with a result position), and emits `respawn`, then `game` (as Java emits both on its respawn
   packet). The vanilla client answers each ready state but the join's: also one that respawns a living player, after
   the credits. The bot sends its auth inputs again from that frame. Up to 1.19.40 the player moves at once; from
   1.19.50 once the 3 × 3 columns around it are loaded, as at the join (after 200 ticks without them it moves anyway,
   emitting an `error` that names them). It is not initialized again.
3. **Spawned**: `spawn` is emitted at the end of the first tick the player moves with health: servers send set_health
   and the attributes with its health some ticks after respawn's ready state (the vanilla client moves before them up
   to 1.18.30). Java emits it once the health comes back.

The recorded respawns change the dimension: the server sends change_dimension before respawn's ready state, and the
respawn is that change's (see dimension changes below), whose `respawn` and `game` the ready state does not emit again;
nor does the ready state after a change for the credits. A respawn in the same dimension is not recorded.

## Dimension changes

change_dimension puts the player's feet at its position, in the dimension it names: `bot.game` changes (see game state),
the world is emptied (see the world), and `respawn`, then `game`, are emitted. The vanilla client then holds the player
until the server placed it there, as the version does (these are the recorded changes through a portal, and to the
world's spawn after a death, of every version):

| Versions | While held | The client's dimension_change_ack (player_action) | Then |
| --- | --- | --- | --- |
| 1.16.201 – 1.17.40 | no auth input | once the column under the feet is shown; a dead player's at once, in the change's frame | auth inputs from the tick after the ack and the server's placement (move_player, or respawn's ready state), the player moving at once |
| 1.18.0 – 1.19.40 | as above | as above | as above, the player held until the 3 × 3 columns around it are loaded, as at the join; a respawned one moves at once |
| 1.19.50 – 1.21.2 | frozen auth inputs: the eye over change_dimension's position, then over the server's placement, no key, no move | after the server's dimension_change_ack (it comes with its placement), once the 3 × 3 columns around the player are loaded, after that tick's auth input; a dead player's once respawned; one that died during the change while dead | the player moves from the tick after the ack (one that died, once respawned) |
| 1.21.20 + | as above | as above | as above; with a loading screen, serverbound_loading_screen 1 at once, then 2 two ticks after the ack, and the player moves from the tick after it |

- The frozen auth inputs report the player's camera (from 1.21.42), and the collisions of the last tick it moved, as
  the vanilla client's; a move_player placing the frozen player is not answered as a teleport (no `handled_teleport`),
  as the vanilla client's. The keys pressed or released while frozen are reported once the player moves.
- `spawn` is emitted at the end of the first tick the player moves after the change, with health (see health).
- From 1.19.50 a player that dies during the change still ends it, as the vanilla client does: its acknowledgement, and
  the end of its loading screen, come once the server's acknowledgement has and the columns around it are loaded. Its
  respawn is asked for only then (the vanilla client shows its death screen once the change ended), with the `respawn`
  option or when `bot.respawn()` was called meanwhile. Up to 1.19.40 the change waits for the respawn (not recorded).
- After 200 ticks without what the bot waits for (the column under the feet, the server's placement, its
  acknowledgement, the columns around the player), it goes on, emitting an `error` that names what is missing.
- Where the vanilla client differs: up to 1.19.40 it asks for the new dimension's sections while the player is hidden;
  the bot from when it shows it. From 1.19.50 it acknowledges a dead player's change at once when the columns around the
  spawn are loaded already (its cache keeps them); the bot, which keeps none, once respawned and loaded. Its loading
  screen hides 2 ticks after the ack (on 1.26.20 1, on 1.26.60 4 to 7); the bot's 2. Where 1.19.1 – 1.19.62 stand is not
  recorded: the hidden player is recorded up to 1.18.30, the frozen one from 1.19.63; 1.19.50 is the boundary the bot
  takes.

## Experience and breath

`bot.experience` is Java's `{ level: null, points: null, progress: null }` until the server tells the player's
`minecraft:player.level` and `minecraft:player.experience` attributes (update_attributes of start_game's runtime id),
then their `level` and `progress` (the bar, 0 to 1). Bedrock servers send no total: `points` are the level's on
Java's curve, which Bedrock's equals (`L² + 6L` up to level 16, `2.5L² − 40.5L + 360` up to 31, `4.5L² − 162.5L +
2220` after), and the bar's share of the next level's (`2L + 7` below 15, `5L − 38` below 30, `9L − 158` after),
rounded: the recorded bar 0.1428571492433548 at level 0 is 1 point. A packet with one of them keeps the other.
`experience` is emitted when a packet changes one of them (Java's on each experience packet: Bedrock servers send them
again with the other attributes).

`bot.oxygenLevel` is the player's air (set_entity_data's `air`, 300 when full) in Java's 20 bubbles,
`Math.round(air / 15)`: undefined until the server tells it, as Java's. `breath` is emitted when the air changes (as
recorded, servers send it a point a tick under water, then 4 a tick back up).

## Spawn point and weather

`bot.spawnPoint` is the world's spawn, where compasses point, as Java's: `(0, 0, 0)` until start_game, then its spawn
position (set before `login`), then set_spawn_position's world position when the server moves the world's spawn, with
`game`, as Java's. Its y is 32767 where the spawn has no height (its highest block), as in most recorded worlds.
set_spawn_position also tells the player's own spawn (a bed's), which no member has: `spawnReset` is emitted when the
server unsets it (every coordinate −2147483648) after it was set, where Java tells that a respawn found no respawn
block. The login's set_spawn_position, recorded on every version, unsets it: no event.

`bot.isRaining`, `bot.rainState` and `bot.thunderState` are clear (`false`, 0, 0) until start_game, then its rain and
lightning levels (0 to 1; it rains above 0), then level_event's start_rain, stop_rain, start_thunder and stop_thunder: a
start's level is its data over 65535 (at most 1), a stop's 0; start_rain rains even at a level of 0. `rain` is emitted
when it starts or stops raining, then `weatherUpdate` when a level changes, as Java's, after `login`. The vanilla client
eases the sky towards the level; the bot takes the level at once (Java's server sends the eased levels). No recording
has weather (the recorded worlds are clear), nor a world spawn moved or a player's spawn set: the levels' scale and
these packets are as the protocol describes them, not checked against a server.

## Abilities

`bot.abilities` has Java's fields, and Java's defaults until the server tells them (not invulnerable, not flying, may
not fly, no instant building, a flying speed of 0.05 and a walking speed of 0.1). Bedrock keeps a player's abilities in
layers, from the lowest: cache, base, spectator, commands, editor and loading screen (a layer the version does not name
ranks by its number). Each layer allows some abilities and sets those; an ability is the one the highest layer allowing
it sets, or Java's default where none does. `invulnerable`, `flying`, `mayFly` and `instantBuild` are the layers'
invulnerable, flying, may fly and instant build abilities, `flyingSpeed` and `walkingSpeed` their fly and walk speeds.

- From 1.19.10 the server sends the layers with update_abilities: its base layer allows them all, as recorded. The
  server tells each player the other players' too: the bot's names start_game's unique id. Up to 1.19.1 it sends
  adventure_settings, whose `allow_flight` and `flying` flags are the base layer's `mayFly` and `flying` (whatever
  player it names: the protocol data says servers may leave it 0), and the speeds stay Java's.
- The game mode (see game state) sets the base layer's four flags as Java sets them: creative invulnerable, may fly
  and instant building, keeping the flight it has; spectator invulnerable, may fly and flying; survival and adventure
  none. Servers send no abilities after a game mode change (none after the recorded ones, 1.16.220 – 1.26.60), so
  the bot applies the game mode itself, when it changes (a game type packet naming the player's game mode leaves the
  layers). The recorded logins' base layer is the game mode's (a creative world's invulnerable, may fly and instant
  building), and so is the flight the server grants a creative player who asks for it (recorded on 1.19.80).

`abilities` is emitted with `bot.abilities` on each update_abilities of the player and adventure_settings, as Java's
on each abilities packet, and when a game mode changes them. Where Java differs: Java's server sends its abilities
packet after a game mode change. The speeds are 32-bit floats from update_abilities (0.05000000074505806, as Java's
abilities packet reads). The bot does not fly yet (the physics have no flight): `flying` is what the server says. No
recording has a layer but the base one: their order is the protocol's.

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

A dimension change (change_dimension) unloads every column in the packet pass, in the same `bot.world`, as Java's: the
bot asks for the new dimension's sections from then (see dimension changes), and a column received before the change
is not shown.

## Block actions

The block_actions plugin (`lib/bedrock/plugins/block_actions.ts`) emits Java's block action events from what the
server tells of a block that moves, in the packet pass; the bot sends nothing, as the vanilla client.

- **`chestLidMove (block, isOpen, block2)`**: block_event `change_state`, its data the number of players with the lid
  open (0 closed). Recorded on every version (dump_layouts, reduced_stations) for the chest, the barrel (with its
  `open_bit` update_block in the same batch; Java's server tells no barrel's lid), the undyed shulker box and the
  ender chest, in the batch of the screen's opening and of its close; none for a hopper, a dispenser, a dropper or a
  crafter. It is emitted when the count changes, as Java's, and a lid not told open counts 0: a close of one emits
  nothing (Java's emits it), so that a double chest's two closes emit once. A block replaced by another forgets its
  count, as Java's (the server tells no close of a lid that is gone); the barrel's `open_bit` keeps it.
- **A double chest**: a Bedrock chest has no state telling its half, its block entity pairs it (`pairx`, `pairz`).
  The two halves share one count, so one event comes whether the server tells one half or both: `block` the half told
  first and `block2` the other (Java's `block` is always the right half); a single chest's `block2` is null. The pair
  is the one block_entity_data told last (observed; a replaced half forgets its own), else the block entity its column
  brought: up to 1.17.40, whose columns come whole with their block entities (from 1.18.0 the world keeps no block
  entity of a section yet). Not recorded: no recording has a double chest. Against Bedrock Dedicated Server 1.16.210,
  1.17.0 and 1.21.42, two chests set side by side along x were told paired by block_entity_data (`pairlead` 1 on the
  half set first), their window 54 slots, and the lead half's block_event alone opened and closed the lid; along z,
  on 1.26.20 to 1.26.40, they stayed single chests.
- Nothing is emitted for block_event's `sound` type (never recorded, and Java has no such event), nor for a block the
  bot does not have. block_event's y is a varint up to 1.26.0, zigzag from 1.26.10.

Not yet: `pistonMove`, `noteHeard`.

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
| `position` | the feet | Bedrock's actor position: the feet of a mob, above them for some (a minecart on a rail by 0.35); a boat's and a chest boat's 0.375 under the point their packets name, where the vanilla client's box stands (recorded: a boat on every version, by where its use met the box; a chest boat moving as a boat on 1.26.20 and 1.26.60) |
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
  from 1.21.20. Run against the 1.16.201 – 1.26.61 servers, the console's `ride` linked the local player to a horse
  (`rider_initiated` true) and `stop_riding` removed the link: `bot.vehicle` the horse, then null.
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

## Inventory

The bot keeps the player's items as the server sends them, in Bedrock's containers, and shows them in prismarine-windows
`Window`s of Java's layouts (Java's before 1.14, which prismarine-windows gives Bedrock), `Item`s with their
`stackId`:

| `bot.inventory` slot | Bedrock | Crafting table window slot |
| --- | --- | --- |
| 0 | the crafting output (`ui` 50, `creative_output` in requests) | 0 |
| 1 – 4 | the inventory's 2 × 2 grid (`ui` 28 – 31, `crafting_input`), row by row | 1 – 9: the 3 × 3 grid (32 – 40) |
| 5 – 8 | the armor, 0 – 3 | |
| 9 – 35 | the inventory, 9 – 35 | 10 – 36 |
| 36 – 44 | the hotbar, 0 – 8 (`hotbar_and_inventory` 0 – 35 in requests) | 37 – 45 |
| 45 | the offhand (its window's one item; slot 1 in requests) | |

`window.selectedItem` is the cursor (`ui` 0). `bot.heldItem` is hotbar slot `bot.quickBarSlot`, which the server
selects (player_hotbar). `bot.currentWindow` is the screen open: `bot.inventory` while the inventory screen is, a
`minecraft:crafting_table` window while a crafting table's is, else `null`. A crafting table's window has the
server's id for the screen (its dynamic ids 1 and 100, which the protocol names `first` and `last`, as numbers).

- **Items** come in inventory_content and inventory_slot (the windows `inventory`, `armor`, `offhand` and `ui`, and the
  open screen's own window, by its id; others are counted and dropped), shown from the packet pass, and are named by the registry: from 1.21.60 the server names
  them in item_registry, which the registry takes (`registry.handleItemRegistry`); before, start_game does. An item is
  read as each version writes it: up to 1.16.210 an aux value of its metadata and count, wrapped with its stack id
  (`runtime_id` on 1.16.201, `stack_id` on 1.16.210); from 1.16.220 a count and metadata; from 1.26.20 an ItemV4,
  whose stack id is a variant naming its kind on 1.26.20 and 1.26.30. prismarine-item's `fromNotch` / `toNotch` read
  and write some of these wrongly (see the notes), so the bot does it itself.
- **Requests** (`item_stack_request`) are numbered -3, -5, -7 … with no gap, as the vanilla client numbers them (for as
  long as its process runs: the tests' seam `_core.requestIds.continueProcess(next)` goes on with a recording's). A
  request is made when asked, but leaves in the next tick, with the others made since in one packet, after what the
  player holds (below): up to 1.19.0 after the tick's auth input, from 1.19.10 just before it, as the vanilla client
  sends a click's on every recorded build (a hand-back's leave with the close when it leaves at once). A request names
  each slot it moves from or to as the client does, when it is made: by the id of the last request that changed it,
  earlier in the packet or still unanswered; else by its stack's id (0 when empty), the output's too. Its moves show at
  once; a move the slots cannot make rejects before the request takes an id. An ok response keeps them where it lists a
  slot (with the server's count and stack id, emptying it at 0; it never makes an item) and undoes them where not; a
  refusal undoes them all and rejects, naming the status (`FailedToValidateSrcSlot`: Mojang's names, as the protocol
  names only ok and error); no response in 100 ticks undoes them too and rejects (an answer after is ignored), and so
  does the answer to a later request for one still unanswered, as the server answers in order. Where a later request changed the slot too, what it
  changed it from is settled instead, so that once the last is answered the slot is the server's; a slot the server
  sends while a request on it is pending stays as sent. How the slots are written changes by version: `container_id` and `slot_id` on
  1.16.201, a `cause` (-1) from 1.19.30, a full container name from 1.21.20 (with a dynamic id of 0 on 1.21.20), the
  action's type again (`legacy_type_id`) and 32-bit stack ids from 1.26.40.
- **What the player holds** is told to the server in the first tick the player is shown (its first auth input's), and in
  the first tick after a packet changed the slots (inventory_content, inventory_slot, player_hotbar,
  item_stack_response), if it changed since it was last told: a new item in the hand (another item, or to or from none)
  as `interact mouse_over_entity` (no entity) then `mob_equipment` (another item being another network id, metadata or
  block); only its count or NBT, `mob_equipment` alone; the offhand's, `mob_equipment` alone (the offhand window, slot
  1). When first shown the hand is a new item, and an empty one is told by the interact alone (a respawn does not tell
  it again). Up to 1.19.0 after the tick's auth input, from 1.19.10 before it (at the tick's `ActorLegacyTickSystem`),
  as recorded. The item is the slot's without its stack id (an ItemV4 from 1.26.20).
- **`bot.openInventory()`** (Bedrock's: Java's inventory has no screen to open) sends `interact open_inventory` and
  resolves once the server opened the screen (container_open), with `bot.inventory`; at once if it is open, but while
  it is closing it waits for the server's close and opens it again. It rejects
  before start_game, over another screen, or when the server does not open it in 100 ticks. While the player rides a
  horse or another ride with a horse's inventory, it opens the ride's screen instead (see the horse's screen below).
- **`bot.closeWindow(window)`** gives back what the screen holds, one request for each slot an item goes to, in one
  packet: on the inventory screen the grid's items then the cursor's, on a crafting table the cursor's then the grid's;
  each to the stacks of its item with room (64 for an item that names no stack size, as the game has it), then to empty
  slots, from hotbar slot 0 on. What has no room is dropped, a request for each slot, after the arm's swing (as any
  drop: below), as recorded on 1.26.51 (a crafting table's grid with the inventory full). Then container_close (from 1.21.0 naming the screen's type
  `none`): up to 1.21.111 in the same input pass, with the hand-back; from 1.21.120 the hand-back leaves in the next
  tick, and the close in the frame after the screen's animation ended, 240 ms after the frame it was asked in for the
  inventory, 390 ms for a crafting table. Recorded at 32 frames a second (up to 1.26.51) the client closes in the 9th
  and 14th frames after the key's, at 16 (1.26.60) in the 5th and 8th: the frame after animations of about 228 to
  241 ms and 386 to 398 ms, which no close in the animation's last frame fits at both rates; on 1.26.60 an inventory
  closed after a recipe search, which a bot has not, closes a frame later still. Not every recorded client waits: some
  1.26.20 and 1.26.51 close at once, in the hand-back's batch, which the option `screenAnimations: false` does. It
  resolves once the server closed the screen too (its own container_close, which also closes a screen when the server
  closes it, and then gives the items back itself: closing a screen the server closed first hands nothing back), and
  rejects if the server refused to take an item back or did not close the screen in 100 ticks; asked again, it closes it
  again. Closing a window that is not open does nothing. Once the close handed the items back, the screen is gone, as the
  vanilla client's: a click, a craft or a select made after rejects, so that no request follows container_close.
- **`bot.clickWindow(slot, mouseButton, mode)`** clicks a slot of the open screen's window (Java's slot numbers,
  -999 outside the window) as the vanilla client does, sending the request it sends (none where it sends none), and
  resolves once the server took it; it rejects a refusal (undoing what it showed), a click with no screen open (on
  Bedrock the inventory too is a screen: `bot.openInventory()`), a slot the window has not, and the modes it does not
  make: 3 (creative middle click) and the middle drag (see drags below). As recorded on the inventory and crafting table
  screens (by every gesture on 1.26.51, the take and drop of the cursor and a shield put in the offhand on every build),
  but where marked:

  | Click | Cursor empty | Cursor holding an item |
  | --- | --- | --- |
  | mode 0, button 0 (left) | takes the slot's stack | places it all in an empty slot; onto a stack of its item what fits; swaps it with another item's stack, or with a full stack of its item (nothing when the two are alike) |
  | mode 0, button 1 (right) | takes half the stack, rounded up | places one, as left does otherwise |
  | mode 0, slot -999 | nothing | drops the stack (right: one) |
  | mode 1 (shift, either button) | moves the stack: from the hotbar to the inventory (9 – 35), from the inventory to the hotbar, from the armor, offhand or a grid to either (`hotbar_and_inventory`): onto the stacks of its item with room, in order, then to the first empty slot, in one request; what has no room stays | as with an empty cursor |
  | mode 2 (hotbar key: the button is its slot, 0 – 8) | moves the slot's stack to the key's slot (or that one's to the slot: recorded moving one item, the bot moves the stack), as a left click moves the cursor's onto a slot | places the cursor's stack in the key's slot if empty (recorded with one item on the cursor, the bot places the stack), else nothing (not recorded) |
  | mode 4 (drop key: button 1 with ctrl) | drops one of the slot's stack (with ctrl: the stack) | drops one of the cursor's stack (with ctrl: nothing) |

  A click that would put an item in an armor slot it is not worn in sends nothing, as the vanilla client's: a slot takes
  what the registry's `enchantCategories` say is worn there (the helmet `armor_head` and `cosmetic_head`, the chestplate
  `armor_torso` and `elytra`, the leggings `armor_legs`, the boots `armor_feet`). The offhand takes the vanilla items
  allowed there, which the registry does not tell: a shield, arrows, a totem of undying, a firework rocket, a nautilus
  shell and a filled map; for another the click sends nothing (recorded: a shield on every build, arrows taken and eggs
  refused on 1.26.51).
  A mouse click, shift click or hotbar key on a crafting output (slot 0) crafts what the grid holds (see crafting
  below); the drop key never takes from it, but drops one of the cursor's stack as anywhere. A drop swings the arm
  first, in the click's input pass, as recorded with the request on every build: `animate swing_arm`, for a dropped
  item (`dropitem`) from 1.21.130. Containers are named as the client names them: `hotbar` 0 – 8, `inventory` 9 – 35, `armor`,
  `offhand` 1, `crafting_input`, `cursor`. A click names its slots in the input pass it is made in, and its request
  leaves in the next tick, with the requests made since (the clicks of a frame, a hand-back) in one packet; a response
  is taken in after the input pass of the frame it came in. So neither a response that arrives between the click and
  that tick nor one that came in the click's own frame renames them, as the vanilla client named 250 slots on 1.26.51
  by a request whose response had arrived 6 to 31 ms (a frame or less) before its own request left, and none whose
  response had arrived 52 ms or more before. From 1.26.60 a click of a mouse button placing from the cursor is bracketed
  with serverbound_cursor_item_drag: its start in the click's input pass (before the request), its stop in the input
  pass of the frame after the request left (a second click before then shares the bracket); a take, a swap (not
  recorded), a key, a click outside and a hand-back have none.
- **`bot.activateBlock(block, direction, cursorPos)`** and **`bot.openBlock(block, direction, cursorPos)`** use a
  block as the vanilla client does when the use key is pressed with the crosshair on it. In one input pass:
  `player_action start_item_use_on` (from 1.19.1: the block, the face, and where the held item would go: beside the
  face for a block's item or an empty hand, else the block itself, nether wart's too, which is planted, not placed),
  `animate swing_arm` (with `data` 0 from 1.21.120, the swing's source `interact` from 1.21.130, the main hand from
  1.26.60), `inventory_transaction item_use click_block`, then up to 1.18.30 `player_action interact_block` (the block
  and the face; `ineract_block` on 1.16.201), recorded for every block the client used but the crafting table. The
  click changes no slot: the block, the face, the hotbar slot, the held item without its stack id (an ItemV4 from
  1.26.30, a version after mob_equipment's), the eye as the auth inputs report it, the point clicked from the block's
  corner and the block's runtime id; from 1.21.20 triggered by the player's input and predicted to succeed, from 1.26.10
  with no cooldown, from 1.26.51 by the main hand. A use whose block takes the held item (a book a lectern takes, a
  disc a jukebox: see the lectern and the jukebox below) changes the slot from 1.26.60: the click names the hotbar slot emptied of it (`container`, window
  0, the item as `held_item` then none), and the slot shows empty at once, the empty hand told in the use's tick (the
  inventory's rule above); up to 1.26.51 the click names no slot, and the hand is told once the server sent the slot. The face and the point are where the eye's ray, along the auth input's
  rotation, first meets a block, if that is this one (on `direction`'s face, if given), the point found as a float and
  less the block's corner as the client finds it (`cursorPos` instead, if given); else the bot first looks at `cursorPos`
  (the face's centre) on `direction`'s face (the top), as Java's, and clicks there once an auth input carried the look.
  The use ends with `player_action stop_item_use_on` (from 1.19.1, naming where the item would have gone) in the second
  tick after the click's, before its auth input: the vanilla client ends a use at the first tick after the key's release,
  and its recordings held the key through two or three ticks (logged on 1.26.60; a replay sets the hold of each use).
  The auth inputs carry nothing of a use, and a use waits for the one before to end. `activateBlock` resolves once the
  use ended, `openBlock` once the server opened the screen too, with its window. They reject before the player is
  shown, over a screen, and toward no face; `openBlock` also when the server opens a screen the bot does not show, or
  none in 100 ticks. As recorded opening a crafting table on every build: the client's clicks are the bot's, byte for
  byte, when the bot looks as the client's camera did (up to 1.26.10 its auth inputs mostly report a rotation a little
  off its camera's).
- **A hit of a block** (no API of its own: the lectern's `takeBook`, below) is the vanilla client's attack key pressed
  with the crosshair on it and released at once, as recorded in the interactions recordings of every build (1.16.201.2 –
  1.26.60.5). In the first tick after its input pass, before the tick's auth input: `animate swing_arm` (its source
  `mine` from 1.21.130), then the start: `start_break` (the block, the face) in the auth input's block actions from
  1.16.210 (its `block_action` flag set), with `crack_break` (the same) up to 1.20.80 as the client cracks the block in
  each tick it hits it; `player_action start_break` on 1.16.201, whose auth inputs carry no block action. In the next
  tick the abort: `abort_break` (the block, face 0, as recorded) the same way. The face is where the eye's ray first
  meets the block, else the bot first looks at its top's centre and hits the top. The vanilla client swings 3 to 8
  times in the start's tick; the bot once. A hit waits for a use or a hit before it to end, and a use
  for a hit.
- **`bot.activateEntity(entity)`** and **`bot.activateEntityAt(entity, position)`** use an entity as the vanilla client
  does when the use key is pressed with the crosshair on it: one `inventory_transaction item_use_on_entity interact`, in
  an input pass, before its auth input. It changes no slot: the entity's runtime id, the hotbar slot, the held item
  without its stack id (an ItemV4 from 1.26.30), from 1.26.60 the hand (the main one), the eye as the auth inputs
  report it, and the point clicked, not from the entity's feet. That point is where the client's pick meets the entity:
  its look's first 5.5 blocks from the eye, a segment clipped against each entity's box grown by 0.1 on each side, in
  floats (this reach and these float steps give every point recorded, to the bit), the nearest entity before the first
  block. Java's `activateEntity` looks at 1 over the feet, which misses a low box (a boat's), and sends `use_entity`
  without a point: the bot clicks at once when the pick meets the entity, else looks at its box's centre first and
  clicks once an auth input carried the look; `activateEntityAt` looks at `position` first, as Java's. After a look, the
  click is where the pick meets the entity, else (another entity or a block in the way, or farther than the pick
  reaches) at the point looked at, as Java's `activateEntityAt` names its position. No swing and no `player_action`:
  the swing recorded after an entity use is the server's `animate` copied by the recording's observer (10 µs apart). A
  use waits for a block's use to end, as a held key cannot be pressed again; both resolve once the use is sent. While
  the player sneaks, the pick starts at the camera the sneak lowered, 0.35 below the eye (the eye the auth inputs and
  the use report does not change): the vanilla client's camera lowers over a few ticks, and its picks recorded 5 to 9
  ticks into a sneak started 0.338, 0.345 and 0.347 below (1.26.20, 1.26.51, 1.26.60), so the bot's point is up to 0.012
  lower than theirs, the rest of the use the same bytes. They reject before the player is shown, over a screen, and for
  an entity not in `bot.entities`. As recorded using a boat on every build and a villager holding wheat on 1.26.20,
  1.26.51 and 1.26.60: the client's uses are the bot's, byte for byte, when the bot looks as the client's camera did, a
  boat's position its feet (see entities above).
- **set_player_inventory_options** (1.20.50 – 1.21.101): the client tells the server once a process, 120 ms after a
  screen's first opening, the screens it opened so far (the inventory's `layout`, the crafting table's
  `crafting_layout`: `recipe_book` once opened). A bot is a process of its own; a test that continues a recording's
  process sends none.
- **Events**: `windowOpen` (a screen shown: see the screens below), `windowClose` (the screen
  closed, then the window's own `close`), `heldItemChanged` (each update of the held slot, and a new selection).

Not yet: using a block with an item the use places or uses up but a lectern's book and a jukebox's disc (from 1.26.60
the client then names the slot it changes).

### Screens

A screen is shown when the server opens one the bot has a definition for: in container_open, or in another packet a
feature handles (update_trade and update_equipment open the villager's and the horse's screens). The inventory and the
crafting table are the bot's own; each other screen is one file, `lib/bedrock/screens/<window type>.ts`, which its
feature's plugin adds (`bot._inventory.screens.add`). A definition gives:

- the screen's Java window: prismarine-windows' type where its Bedrock table has the screen, else Java 1.14's, and its
  slots before the player's 36 (`inventory` 9 – 35, then `hotbar` 0 – 8, as the crafting table's), each as the vanilla
  client names it in a request, which can change by version;
- where each container it names has its items: the player's windows, the `ui` window at the slot the request names
  (`anvil_input` 1, `stonecutter_input` 3, … `creative_output` 50, alike on every version), or the screen's own window,
  by its dynamic id (a chest's `container`, a furnace's `furnace_ingredient` 0, `furnace_fuel` 1, `furnace_output` 2);
  a container is in one place on every screen;
- when it is shown: at its opening, or at its own window's first inventory_content, which sizes it (a chest of 27 or
  54), as servers send it right after the opening; `windowOpen` comes then, and `openBlock` resolves then;
- its close: which animation it has from 1.21.120 (the inventory's 240 ms: the inventory, the smithing table and the
  enchanting table; the crafting table's 390 ms: every other screen recorded; or none), what it destroys first (the
  material reducer's outputs), what it gives back and in which order (a UI station's inputs, a block container only the
  cursor), and the id container_close names (`none` for trading, whose close the server answers with the screen's id);
- its click rules where they are not the inventory's: where a shift click sends a stack, which slot takes which item,
  or a click's moves themselves.

Its feature adds what it does on it: the click on its `creative_output` (any but the drop key's: on a screen without
one it sends nothing), container_set_data for the screen's id (in the packet pass, kept in the screen's properties, as
those of a furnace, which come before its opening), what its window gets before `windowOpen` and after `windowClose`,
what a request on it is told (its custom names and cause), packets that leave before its requests, what a response
tells of a slot, a close of its own (a lectern's), and a click mode clickWindow does not make itself (a drag). A
screen the bot has no definition for is counted, not shown: `openBlock` rejects naming it.

### Window members

Java's members made of clicks are Java's code over `bot.clickWindow`, so each click sends the vanilla client's request
for it (see the clicks above), and waits for the server's answer (100 ticks) instead of Java's confirmation:

- **`bot.transfer(options)`** moves `count` (1) items of `itemType` (any metadata for null; an `nbt`, if given, as
  `findItemRange` matches it) from the slots `[sourceStart, sourceEnd)` (`sourceEnd` `sourceStart + 1`) to
  `[destStart, destEnd)` (`destStart` -999 tosses them): it takes the first stack of the item to the cursor, places it
  all where that is not more than wanted, else one item a right click, or takes back the larger half of the
  destination and places one at a time where that is fewer clicks, then puts the cursor's rest back where it took it.
  It rejects with Java's errors (`Can't find …`, `Invalid itemType`, `destination full`), and when the server leaves
  the cursor without the item it took.
- **`bot.putSelectedItemRange(start, end, window, slot)`** puts the cursor's item onto stacks of it with room in
  `[start, end)`, then into empty slots; with no room left into `slot`, if given, and drops the rest. It rejects a slot
  that does not take the item (an armor slot, the offhand), for which the vanilla client sends nothing: Java would
  click it forever.
- **`bot.putAway(slot)`** shift clicks the slot when the window's inventory part has room for its item, else (or on the
  window's `craftingResultSlot`, a shift click on which would craft again) clicks it and puts the cursor's item in the
  inventory part with `putSelectedItemRange`, dropping what has no room. It resolves once its clicks did: Java waits
  for an update of the slot, which never comes where the clicks changed nothing.
- **`bot.moveSlotItem(source, destination)`** clicks the source, the destination, then the source again while the
  cursor holds an item (what the destination held). `heldItemChanged` comes where the held slot changes, not again in
  between as Java's.
- **`bot.simpleClick.leftMouse(slot)` / `rightMouse(slot)`** are `clickWindow(slot, 0 or 1, 0)`.
- **`bot.updateHeldItem()`** emits `heldItemChanged` with `bot.heldItem` in the next input pass (Java's at once).
- **`window.close()`**, **`window.withdraw(itemType, metadata, count)`** and **`window.deposit(…)`** are on every
  screen's window, added before `windowOpen` (Java's only on those `openBlock` and `openEntity` resolve with):
  `close` is `bot.closeWindow(window)`; `withdraw` a transfer of `count` (1 for null) from the screen's slots to the
  window's inventory part, rejecting at once with `Unable to withdraw, Bot inventory is full.` when `bot.inventory` has
  no empty slot; `deposit` the reverse. The window's `close` event comes right after `windowClose`, whoever closed the
  screen (Java's only from `window.close()`, at once, before the server answered).

They click the window given (`transfer`'s `window`, else the screen open) or, for `putAway` and `moveSlotItem`, the
screen open; with none open they click `bot.inventory`, whose screen they open (`bot.openInventory()`) and close after,
also when they fail, so that the close gives back what the cursor holds. A window that is not open rejects
(`transfer needs the minecraft:chest window open`): Java clicks whatever window is open with its slots.

### Containers

The chest plugin adds the containers' screens (`lib/bedrock/screens/container.ts`, `hopper.ts`, `dispenser.ts`,
`dropper.ts`, `crafter.ts`), as the vanilla client shows them against Bedrock Dedicated Server, alike on every version
recorded (reduced_stations, reduced_slots):

| Block | container_open's type | `window.type`, `window.title` | Its slots | A request names them |
| --- | --- | --- | --- | --- |
| chest, trapped chest | `container` | `minecraft:chest`, Chest (Large Chest for 54) | 27, or 54 beside another chest | `container` |
| ender chest | `container` | `minecraft:container`, Ender Chest | 27 | `container` |
| barrel | `container` | `minecraft:generic_9x3`, Barrel | 27 | `barrel` |
| shulker box (any colour) | `container` | `minecraft:shulker_box`, Shulker Box | 27 | `shulker` |
| another block, or one the bot has not | `container` | `minecraft:container`, Container | 27, or as many as sent | `container` |
| hopper | `hopper` | `minecraft:hopper`, Hopper | 5 | `container` |
| dispenser | `dispenser` | `minecraft:dispenser`, Dispenser | 9 | `container` |
| dropper | `dropper` | `minecraft:dropper`, Dropper | 9 | `container` |
| crafter (from 1.20.50, recorded from 1.21.0) | `crafter` | `minecraft:crafter_3x3`, Crafter | 9 | `container` |

The window types are Java's before 1.14 (prismarine-windows' Bedrock table), whose chest window was a trapped chest's
too and whose generic container an ender chest's, else Java 1.14's (the barrel's `generic_9x3`, the crafter's
`crafter_3x3`, which has a result slot after the 9 that Bedrock's screen has not). A window's slots are the
container's, then the player's inventory and hotbar (`inventoryStart` the container's size, `craftingResultSlot` -1).

- **Shown** at the screen's first inventory_content, which the server sends in the opening's batch (two or three
  times), so that `windowOpen` comes with the items, as Java's after its window items, and `openBlock` resolves then. Its
  size makes a chest large (54: not recorded, nor how a large chest's slots are named past 26). A screen no content comes
  for is shown in the first tick after its opening's frame, with 27 slots for a `container` (a hopper's and the others'
  with theirs), and gets its items by inventory_slot: as recorded with a scripted server on 1.26.20, 1.26.51 and 1.26.60,
  which sends none, the vanilla client showing a small chest's screen.
- **Clicks** are the inventory's (see the clicks above), with the containers named as the table says. A shift click
  moves a stack of the container to the hotbar and the inventory (`hotbar_and_inventory`, from hotbar slot 0: recorded
  for the chest, the ender chest, the shulker box and the hopper), and one of the hotbar or the inventory into the
  container: onto its stacks with room, then into its first empty slot, in one request (not recorded: as Java's).
  Bedrock Dedicated Server sends a container's slots a request changed (inventory_slot) before the request's response:
  a container's slot the server sent in the packet pass of a request's response stands over the response, as the vanilla
  client went on from the slots a left drag's server sent (a dropper's on 1.26.60.5, its responses each listing the first
  slot). The response settles one sent in an earlier frame, and the player's own slots, which the server does not send
  again after a request (a request on the hotbar on 1.26.51 is followed only by its response): those may have been sent
  before the server took the request (a hopper's item, an item picked up).
- **The close** gives back the cursor's item, and from 1.21.120 waits for the crafting table's animation: the vanilla
  client closed each container 457 to 470 ms after the close key up to 1.26.51 (32 frames a second), 560 to 562 ms on
  1.26.60 (16), as it closes a crafting table.
- **`bot.openContainer(block, direction, cursorPos)`**, **`bot.openChest`** and **`bot.openDispenser`** (one function,
  as Java's) open a chest, a trapped chest, an ender chest, a barrel, a shulker box, a hopper, a dispenser or a dropper
  with `bot.openBlock` and resolve with its window, which has the window members above. `direction` and `cursorPos` are
  passed only when given: Java's defaults, the top face's centre, would make the bot look there first, where the vanilla
  client clicks where it looks. They reject with Java's errors: `containerToOpen is neither a block nor an entity` for
  another block (a crafter too, as Java's), and `Non-container window used as a container: …` when the server opens
  another screen, or the windows plugin is not loaded (naming the window's id, type and title: Java writes the whole
  window). An entity they open with `bot.openEntity`.
- **`bot.openEntity(entity, Class)`** is Java's: `bot.activateEntity(entity)`, resolving with the screen the server
  opens once shown, rejecting as `openBlock` does (no screen in 100 ticks, one the bot does not show); `Class` is
  ignored, as Java's. A horse, a donkey, a mule, a skeleton horse, a zombie horse, a llama or a trader llama it uses
  sneaking, as the vanilla client opens their screen (a use without the sneak rides them, unlike Java's openEntity,
  which does not sneak): unless the player sneaks already, it presses the sneak key, uses the entity in the input pass
  after the tick whose auth input started the sneak (1.16.201: its player_action `start_sneak`), and releases the key
  once the open resolved or rejected. It rejects if the player did not sneak in 20 ticks (physicsEnabled off holds it),
  sending no use. `openContainer` opens any entity with it, as Java's, and resolves with a container's window (a
  horse's screen is not one: it rejects with Java's error). The entities' screens, as a scripted server opened them on
  1.26.20, 1.26.51 and 1.26.60 (containers_minecart_chest, containers_minecart_hopper, containers_chest_boat: no use,
  no content, the slots by inventory_slot, the requests naming `container`):

  | Entity | container_open's type | `window.type`, `window.title` | Its slots |
  | --- | --- | --- | --- |
  | chest minecart | `container` naming its runtime id | `minecraft:chest`, Minecart with Chest | 27 |
  | chest boat | `container` naming its runtime id | `minecraft:chest`, Boat with Chest | 27 |
  | hopper minecart | `hopper` naming its runtime id | `minecraft:hopper`, Minecart with Hopper | 5 |

  The protocol has a type of each too (`minecart_chest`, `chest_boat` from 1.19.50, `minecart_hopper`), which the
  bot shows as the same screens: no server was recorded opening them by these, nor Bedrock Dedicated Server opening an
  entity's at all. An opening naming an entity without a container is the block's at its coordinates. Slots a server
  sends of the screen before it is shown (the scripted server, in the opening's batch) are its own.
- **The horse's screen** (`lib/bedrock/screens/horse.ts`) is opened by update_equipment (`window_type` `horse`, no
  container_open), as a scripted server opened it on 1.26.20, 1.26.51 and 1.26.60 (containers_horse): `window.type`
  `EntityHorse` (Java's before 1.14; Java's later `HorseWindow`), titled Horse as Java's, of 2 slots, the saddle's and
  the armour's, which requests name `horse_equip` 0 and 1 (recorded: `take 1 horse_equip:0` to the cursor). It is shown
  as a container's: at its content, which that server sent in the opening's batch on 1.26.20 and 1.26.60, else at the
  next tick (1.26.51, which sent none). Its close gives back the cursor's item and has the inventory's animation: the
  vanilla client closed it 310 to 314 ms after the close key on 1.26.51, as it closes the inventory, not a container's
  405 to 438 ms; 405 to 407 ms on 1.26.60, a container's 530 to 532 ms. The bot does not check which items its slots
  take: update_equipment names them (`acceptedItems`) by their legacy names (`horsearmordiamond`), which the registry
  has not. `bot.openEntity(horse)` opens it as the vanilla client did against Bedrock Dedicated Server on 1.26.20,
  1.26.51 and 1.26.60 (protocol_item_stacks, protocol.horse_equip: a tamed horse, the sneak pressed, the use, the
  answer update_equipment of window 7, in the use's next batch): by a sneaking use (see `openEntity` above). Tests
  (`test/bedrock/horseTest.ts`): every version plays 1.26.60's opening, click and close with its ids, and opens the
  horse with `openEntity`, the sneak's start (player_action on 1.16.201, later the auth input's flag) before the use,
  its stop after the screen is shown; on 1.26.20, 1.26.51 and 1.26.60 the use is the recorded bytes but the click's y
  (see `activateEntity` above). Not recorded: the screen of a donkey, a mule, a llama or the other kin the bot opens
  sneaking, nor an untamed horse's answer.
- **The horse's screen opened while riding it**: while `bot.vehicle` is a horse, a donkey, a mule, a llama, a trader
  llama, a camel, a camel husk, a nautilus, a zombie nautilus or (from 1.21.130) a zombie horse, the rides with a
  horse's inventory in the vanilla behaviour packs, `bot.openInventory()` sends `interact open_inventory` naming the
  ride, as the vanilla client's inventory key does, and resolves with the screen the server opens once shown, as
  `openEntity` does (rejecting as it does, naming the ride: `the server did not open the horse in 100 ticks`). The
  interact is the inventory's (the runtime id a varint on 1.16.201, `has_position` false from 1.21.130); the recorded
  ones name the player, none was recorded while riding. On another ride (a skeleton horse, a boat, a minecart) it names
  the player and opens the inventory, as when not riding. Run against the 1.16.201, 1.19.10, 1.19.40, 1.19.70, 1.21.0
  and 1.26.61 servers, the player put on a tamed saddled horse with the console's `ride`: the server answered with
  update_equipment of the horse's screen (its saddle in slot 0 by inventory_content), whichever entity the packet named,
  and the close as any; on 1.21.0 and 1.26.61 a donkey, a llama and a camel alike, a skeleton horse with the
  inventory's container_open. The e2e opens it on every build it starts (1.16.201 – 1.26.61; the console's `ride`
  exists on all of them) with a free spot beside the player: not 1.20.80, 1.21.60 and 1.21.100, whose saved players
  stand in lava or water; 1.26.51.1, which it only reuses, is not checked. Tests (`test/bedrock/horseTest.ts`): each
  version names the horse ridden as its interact writes it and resolves with update_equipment's screen; a zombie horse
  is named from 1.21.130, the player before.

Not yet: a donkey's, a mule's or a llama's chest slots. A lid's opening and closing: see block actions.

### Drags and double clicks

The drags plugin (`lib/bedrock/plugins/drags.ts`) makes `bot.clickWindow`'s modes 5 and 6 on every screen, as the
vanilla client made them against Bedrock Dedicated Server (reduced_stations: a dropper's left drag, a dispenser's right
drag and a chest's double click, the same moves on all 59 builds but for the ids and the slots a response not yet in
names; clicks_mouse on 1.26.51: the same on the inventory screen). Each request has one action, and those a click makes
leave in one packet.

- **Mode 5** (Java's drag, `-999` for the start and the end): buttons 0, 1, 2 start a left drag, add a slot, end it;
  4, 5, 6 the right's. The start sends nothing and remembers the cursor's stack, the end sends nothing; each slot added
  moves the items at once, as the vanilla client does while the mouse moves, where Java's server moves them all at the
  end. A right drag places one item in each slot. A left drag shares the stack evenly: the first slot takes it all;
  each next one gets what the slots before hold over the new share (`⌊count / slots⌋`), slot by slot, their rest going
  to the cursor, then what it still needs from the cursor; the second slot first takes the first's stack back and
  places it again, as recorded (64 planks over 9 slots: 64, 32 × 2, 21 × 3 and 1 on the cursor, … 7 × 9 and 1). The
  rest stays on the cursor. From 1.26.60 the drag is bracketed with serverbound_cursor_item_drag: its start with the
  first slot's requests, its stop at the drag's end. A slot added to no drag, to the other button's, outside the
  window, holding an item, already in the drag, that does not take the item (an armor slot it is not worn in, the
  output), or once each slot would get none, sends nothing (not recorded but the empty slots of one item's drag: the bot
  drags only over empty slots). A drag whose slots or cursor changed since (another click, the server) is ended, as
  Java's server ends it at another click. A drag ended otherwise than by its end (broken, by another click, or its
  screen closed or another opened) stops its bracket all the same, so that it is never left held (whether the vanilla
  client stops it there is not recorded): a click placing from the cursor sends the stop before its own start, a close
  before its container_close. Buttons 8 – 10 (the creative middle drag) reject.
- **Mode 6** (Java's double click: button 0, after the click that took the slot's stack): the cursor gathers its item
  from the window's stacks, partial ones before full ones, each in the window's order, until it holds a stack, one
  `take` request a stack; never from a crafting output. Nothing on a slot holding an item, outside the window or with
  an empty cursor. Recorded with one stack to gather (a chest's, a hotbar's on the inventory screen): the order of
  several is Java's.

Tests (`test/bedrock/dragTest.ts`): every version plays the three recorded gestures with 1.26.51's ids, 1.26.60 with
its brackets where 1.26.60.5 recorded them, and stops the bracket of a drag broken or whose screen ended.

## Crafting

The recipes are crafting_data's, as the server sends them for the connection (their network ids are the
connection's): up to 1.26.30 in one list naming each one's type, from 1.26.40 a list for each type; a packet that
clears the recipes (`clear_recipes`, `is_clean` up to 1.17.10) replaces them, another adds its own (the recipes given
out before still craft). They are read when first asked for. Each recipe with an input and an output is one
`BedrockRecipe`, however many items a cell takes:

- Java's fields: `result`, `inShape` (a shaped recipe's rows top to bottom, each left to right, as Java's: the wire has
  the cells row by row; empty cells id -1), `outShape` (always null), `ingredients` (a shapeless recipe's, counted
  negative), `delta` and `requiresTable` (a shaped recipe wider or higher than 2, a shapeless one of more than 4
  ingredients). A cell that takes several items shows the first: a tag's first item in the registry's order, a complex
  alias's first.
- Bedrock's: `id` (the recipe id), `type`, `networkId` (what requests name), `uuid` (what crafting_event names),
  `priority`, `block` (`crafting_table` for the crafting table's) and `results` (every output: the cake's buckets too,
  which Java leaves in the grid).

A cell takes, by its descriptor: up to 1.19.21 an item by network id and data; from 1.19.30 `int_id_meta` the same,
`item_tag` the items whose `tags` (in the registry, from minecraft-data) include the tag, `complex_alias` (1.19.70 –
1.26.30) the alias's items; from 1.26.40 `name` an item by name, or first a complex alias's (with a data value, the
alias's item of that index), 1.26.60 writing the data after the name (`minecraft:stone:0`). Data 32767 is any. A molang
expression takes no item. From 1.16.220 the server sends a block's item with data 0 and the block state it places (as
acacia planks the planks block of `wood_type` acacia): its data is that state's legacy data, each state's value in its
own bits, the state the version's palette varies fastest lowest (acacia planks 4, stripped acacia wood 12).

- **`bot.recipesAll(itemType, metadata, craftingTable)`** and **`bot.recipesFor(itemType, metadata, minResultCount,
  craftingTable)`** are Java's: the crafting table's recipes making the item (of the metadata, unless null or
  undefined), but those needing a table without one; `recipesFor` only those whose ingredients the inventory
  (`hotbar_and_inventory`) has, for enough crafts to make `minResultCount` (1; 0 needs no craft, so every one, as
  Java's).
- **`bot.craft(recipe, count, craftingTable)`** crafts as the recipe book does (auto), `count` times (1, as Java's
  `null`; 0 crafts nothing, as Java's; a `null` table is none, as Java's): on the screen open if it crafts the recipe (a
  crafting table's crafts any, the inventory's those that fit its grid, without a table given), else on the crafting
  table's it opens with `bot.openBlock(craftingTable)`, or the inventory's with `bot.openInventory()`, closing it again
  (only a screen it opened, and when the craft fails too, which it then rejects with). A request crafts a stack's worth
  of the result at most (`count` 100 of sticks: 16 times, 16, … then 4), all in one input pass. Each request is
  `craft_recipe_auto` (the times from 1.17.10, twice over 1.21.20 – 1.26.30 as `times_crafted_2`; the ingredients from
  1.19.40: each cell's, as the recipe names it, a tag's or an alias's by the item it took, of any metadata up to
  1.26.30, by name with the item's metadata from 1.26.40), `results_deprecated` (the outputs as crafting_data has them,
  a craft's count, the times), a `consume` for each cell and slot it takes from (the slots in order, a slot's items
  going to the first cells: a slot is named by its stack id the first time, by the request after), then each output
  moved from the created output (50) to the inventory, onto the stacks of its item with room then to the first empty
  slots, a stack's size each: with several outputs, the others before the result, `create` naming the output before
  each place (the 256 glass bottles of 64 honey blocks four stacks of 64, each after its `create`). Without the
  ingredients it rejects before opening a screen; without room for an output it rejects, sending nothing, as the
  vanilla client sent nothing on 1.26.51.
- **The grid's output** (`bot.clickWindow(0, …)`) crafts what the output shows: the recipe `bot.placeRecipe` selected
  on the screen, while the grid makes it, until a craft; else, of the recipes that match the grid (a shaped one where
  the grid's items fill its cells, mirrored too unless it says it is not symmetric; a shapeless one by exactly its
  ingredients in any cells; with enough of each), the lowest priority, then the earliest in crafting_data, or the
  multi recipe that stands for it (below). On 1.26.51 a white bed from a grid filled by hand was the earlier of two
  recipes alike, whichever the recipe book selects. A request is `craft_recipe` (the times from 1.21.20),
  `results_deprecated` (always once), a `consume` for each slot of the grid it uses, then the result: with a mouse
  button (either: right takes the whole result too) taken to the cursor, with a hotbar key to the key's slot, unless
  the cursor or the slot holds another item or has no room for it (then nothing is sent: a second unstackable result
  too); with a shift click to the inventory as above, from 1.18.30 firework rockets to the offhand first (onto its
  stack, then the inventory: as the vanilla client did on the inventory screen, 63 rockets then 1 more there and 2 in
  the inventory), as often as the grid allows (once in a select's pass), up to 1.21.2 a request a craft, from 1.21.20 a
  stack's worth a request, while there is room. With several outputs, the result first, the others to the inventory,
  `create` goes before each place. A grid no recipe matches sends nothing.
- **Multi recipes**: crafting_data names one by its uuid alone, without an input or an output; the vanilla client
  crafts one where it stands for the recipe the grid matches, naming the multi recipe's network id and uuid (in
  crafting_event too) and telling what that recipe makes. As recorded, a select's first craft is the selected recipe's
  and the crafts after it, by a shift click, the multi recipe's (up to 1.21.2 a request a craft, from 1.21.20 after the
  first stack's worth). The bot knows three:
  - fireworks (`00000000-0000-0000-0200-000000000000` as the codec reads it): firework rockets, and firework stars,
    from 1.20.10 not a star of a dye item not named `…_dye` (recorded: an ink sac's black star by its own recipe, a
    lime dye's by the multi recipe);
  - map extending (`4b43944b-9422-cdae-2793-2cbb99446786`): an empty map and a compass (a shapeless recipe of those
    two), not the locator map's eight paper and compass;
  - the decorated pot (`4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88`): its result with an empty NBT compound, which stacks
    onto the pots without one.

  `recipesAll`, `recipesFor`, `craft` and `placeRecipe` take the recipes they stand for, as the vanilla client's recipe
  book does: no recording crafts a multi recipe by `craft_recipe_auto` or selects one.
- **The grid's special recipes**: a grid no recipe matches is crafted by the multi recipe that makes it, when
  crafting_data sent it, by the output's clicks as any grid (each mode, a shift click repeating while the grid has the
  items); the request names the multi recipe and tells the result, a `consume` of one from each cell but those the
  craft keeps. They have no `BedrockRecipe`: as the vanilla client's recipe book shows none, `recipesAll`,
  `recipesFor`, `craft` and `placeRecipe` do not take them, and Java's bot has none either (minecraft-data's recipes),
  only `clickWindow` on the output. None is recorded, so the results are the game's rules, Java's where Bedrock's are
  not known (the keys of a compound written in their byte order, as every recorded item's):
  - repair (`00000000-0000-0000-0100-000000000000`): two items of a kind with durability, the result their
    durability and 5% of the most more (NBT `Damage`, 0 at least), the first's curses then those of the second the
    first has not (`ench`), every other tag gone; not with an enchantment the registry does not know;
  - map cloning (`9d4d10ba-5597-9385-c443-e9a8b7efcca4`): a filled map and empty maps (any data), a copy of the
    filled map (its NBT) for each, the map too;
  - book cloning (`2f4f8e33-846b-cad1-8dd9-4b8bcc766b9c`): a written book and books and quills, a copy for each,
    its `generation` one more, the written book kept in the grid (not consumed); not a copy's copy (generation 2);
  - banner duplicate (`7640a275-05d1-c5b5-f04b-bfa23e922baf`): a banner of patterns and one without, of one color
    (data), a copy of the patterned one, which is kept in the grid;
  - banner add pattern (`404472e1-afae-1ad8-7bd2-30f08d862592`), at the crafting table: a banner of fewer than 6
    patterns and dyes (`…_dye`) of one color in one of the 32 shapes of the loom's dye patterns (Java's old table:
    `ts` the top row, `mc` the middle, …), the banner in another cell: the pattern added as the loom adds it;
  - the decorated pot (`4e4a2ec4-2a74-5a68-5b8e-c93fb85eea88`), at the crafting table: bricks and sherds (the
    registry's `minecraft:decorated_pot_sherds`) on its four sides, crafting_data's pot with NBT `sherds`, the items'
    names (`minecraft:brick` too) back, left, right, front (top, left, right, bottom cell), as Java's;
  - fireworks (`00000000-0000-0000-0200-000000000000`), crafting_data's rocket or star with its NBT made of the
    grid: rockets of paper, 1 – 3 gunpowder (`Flight`) and stars (their `FireworksItem` the `Explosions`, in the
    grid's order; none: a list of no tag, as crafting_data's); a star of a gunpowder, dyes (`FireworkColor`, their
    indices: black 0 … white 15, as the loom's), a shape or none (`FireworkType`: a fire charge 1, a gold nugget 2, a
    head 3, a feather 4), a diamond (`FireworkTrail`) and a glowstone dust (`FireworkFlicker`), of the first dye's
    data and the colors' mix as `customColor` (each channel's mean of crafting_data's one-dye stars' colors); a star
    and dyes, the star's `FireworkFade` the dyes'. Up to 1.20.0 an ink sac, cocoa beans, lapis lazuli and bone meal
    are dyes too, as crafting_data's stars take them by the multi recipe then (above).

  Not supported, so nothing is sent: map extending (`ae40a14b-75b0-92d3-cef6-568d86af8987`, a filled map amid 8
  paper: the map's scale, which decides whether it extends, is not in its item, and the extended item's NBT is not
  known), the multi recipe `00000000-0000-0000-c800-000000000000` (1.19.80 – 1.26.60 here; what it makes is not
  known), and a banner pattern of an item at the crafting table (which items the grid takes is not known).
- **`bot.placeRecipe(recipe, all)`** (Bedrock's) selects a recipe as the recipe book does: the grid's items go back to
  the inventory first (as a close hands them back), then each cell's items from the inventory, a `place` for each cell
  and slot it takes from, a shaped recipe's from the grid's top left, a shapeless one's in the first slots; `all`
  places as many crafts' as each slot takes (a stack of the item, 64 crafts at most) and the inventory has. With an
  output click in the same pass, as the vanilla client's select by the keyboard, it is one packet; a shift click in
  that pass crafts once, as the vanilla client's select with shift did on 1.26.51 (4 planks: 2 a cell, then 4
  sticks). Lacking some of a craft's ingredients, it places a craft's of those the inventory has (`all` too), the
  others' cells left empty, as the vanilla client placed a bamboo bed's wool without its bamboo planks (experimental
  on 1.19.50 – 1.19.80). A recipe that does not fit the inventory's grid, no screen open, or none of the ingredients
  reject before anything is sent.
- **What a craft says it makes** is the output as crafting_data has it, but: a grid's damageable item (that the
  registry gives a `maxDurability`) has NBT `Damage` 0; a dyed bundle keeps the `bundle_id` of the one it was (the
  server gives a bundle one); from 1.26.40 a block's item of data 0 takes the legacy data of the block state
  crafting_data gives it, as an ingredient's is read (a chest's `minecraft:cardinal_direction` south 0, west 1, north 2,
  east 3; a dispenser's `facing_direction` 3 is 3), as the chest's 2 and the dispenser's 3 were recorded. Up to
  1.16.210 an item is an aux item; from 1.26.40 it is named (`minecraft:<name>`, a custom item by its own namespace),
  and the action's type is repeated as a byte (results 19, 20 on 1.26.60, which adds `craft_reserved` before it).
- **crafting_event** (up to 1.20.40) goes before each craft's request, in the input pass the craft is made in: the
  recipe's uuid, `inventory` or `crafting` by the screen, and the result, as many as the request crafts.

Recorded and replayed by the tests on every build: the recipe book's craft of an acacia button on the inventory screen
(from 1.16.220 to 1.20.40 the planks named by their block state), of all the honey blocks 256 honey bottles make, of
all the cakes its ingredients make, of all the cobblestone slabs 33 cobblestone make at a crafting table, its select
by the keyboard, by the mouse then a shift click (a set of ingredients, and a stack's worth: a craft a request up to
1.21.2), and by the mouse then a click taking the result to the cursor and on to the hotbar; from 1.17.0 firework
rockets selected, then shift clicked (to the offhand from 1.18.30); on 1.19.50 – 1.19.80 a bamboo bed's select without
the bamboo planks; from 1.19.40 sticks from a tag; from 1.26.40 a cake and a dispenser; on 1.26.51 the grid's crafts by
a mouse click, a right click, a hotbar key and shift clicks, a select with shift, a wooden pickaxe by the recipe book
(no `Damage`), a dyed bundle. Recorded and replayed on some builds: 22 rockets' worth selected with all then shift
clicked, the crafts after the first by the fireworks' multi recipe (1.20.0 – 1.20.40 each after its crafting_event,
from 1.21.20 21 crafts to the offhand then the multi recipe's one), and on 1.21.0 – 1.21.2 64 enhanced empty maps and
64 decorated pots the same way. Not recorded, so as the bot does it: what a select does with what the grid holds, a
select with `all` or a cell of several items lacking some ingredients, a hotbar key over a slot holding another item,
an extra output with no room or going onto stacks of its item, a selection forgotten when a screen opens, which
recipe type crafting_event names when the inventory's recipe is crafted at a crafting table, firework rockets shift
clicked at a crafting table or with the offhand empty and a stack of rockets in the inventory, the grid mirrored
before 1.20.80 (crafting_data has no `assume_symmetry` then: the bot mirrors every shaped recipe), a block's item
facing other than north or the dispenser's way from 1.26.40, a grid filled by hand that a multi recipe stands for, the
stars of cocoa beans, lapis lazuli and bone meal from 1.20.10, and the decorated pot's multi recipe before 1.20.50.
The grid's special recipes are not recorded at all (their tests check the request's layout on every version and the
results on 1.26.60): which multi recipe the vanilla client names for each, the results it tells (the colors' mix and
a star's data, the pot's sherds and their order, the curses a repair keeps, a copy's NBT), which cells it keeps (Java
keeps the written book and the patterned banner), whether it takes more than one empty map or book and quill, and
whether the server checks the told result. A grid crafting_data's own recipe matches is crafted by it even where the
special recipe would differ (rockets of paper, a gunpowder and a star of another star's data: crafting_data's rockets
of that data, matched by the star's data alone).

Not yet: map extending in the grid and the other multi recipes above, and the recipe book's choice between recipes
alike (the bot crafts the one given). The stations have their own sections below.

## Trading

The trading screen is opened by update_trade (no container_open on any recorded build): its window is Java's villager
window before 1.14 (`minecraft:villager`, 39 slots): 0 and 1 the ingredient slots (`trade2_ingredient1` and
`trade2_ingredient2` in requests, `ui` 4 and 5), 2 the result (`creative_output` 50, its `craftingResultSlot`), 3 – 38
the inventory part. Its title is the offer's `display_name` as a translation (`{"translate":"entity.villager.mason"}`),
as Java's window titles are JSON. update_trade has one layout on every version; its `villager_unique_id` names the
trader by its unique id, zigzag on the wire (see the notes).

- **`bot.openVillager(villager)`** uses the entity (`bot.activateEntity`'s use) and resolves at the end of the frame
  the screen opened, with its window, its trades read and `ready` emitted. It takes the entities whose use opens the
  screen, by `entity.name` (which the bot has on every version): `villager_v2`, `villager` and `wandering_trader`;
  Java's asserts the registry's villager type, and refuses a wandering trader, whose Bedrock screen is the same. It
  rejects another entity before the use, a screen of another kind, one the bot does not show, and none in 100 ticks.
- **`window.trades`** are Java's `VillagerTrade`s, read from the offers' NBT (`Recipes`): `inputItem1` (`buyA`),
  `inputItem2` (`buyB`, null without), `hasItem2`, `outputItem` (`sell`), `inputs` and `outputs`, `nbTradeUses` and
  `maximumNbTradeUses` (`uses`, `maxUses`), `tradeDisabled` (no use left: Bedrock tells no flag), `xp` (`traderExp`),
  `demand`, `priceMultiplier` (`priceMultiplierA`), `realPrice` (`buyCountA`, the price the server computed with the
  demand and the discounts: Bedrock tells no `specialPrice` apart, which is undefined), and Bedrock's `tier` (the
  villager level the trade needs). An item is the registry's of its `Name`, `Count` and `Damage` (32767, any, as every
  recorded price names it: shown as 0, matching any), its `tag` as its NBT, a block's item placing the state its `Block`
  compound names (by the palette start_game numbered, so that a sale stacks with the inventory's), a shield written with
  the blocking tick its item layout needs (no recorded trade sells a block or a shield). A trade the server took counts
  a use up (the server sends the offers again only when they change otherwise, as recorded). update_trade again for the
  screen open replaces the trades, without another `ready`, as Java's later trade lists. container_open opening a
  trading screen shows it without trades.
- **`ready`** is emitted on the window right after `windowOpen`, in the packet pass of update_trade.
- **What the vanilla client does at the opening**: in that frame's input pass, it selects the first trade (below), so
  that the stack of its item goes from the inventory to the ingredient slot (recorded: 64 wheat for a price of 1).
  With none of the items in the inventory nothing is sent. Java's `openVillager` moves nothing.
- **`window.selectedTrade`** is the trade the screen shows selected: the first once opened, then the one selected
  or traded last (Java's, the one `trade` selected).
- **`window.selectTrade(index)`** (Bedrock's) is the vanilla client's click on a trade in the list: in one input pass,
  what the ingredient slots hold goes back to the inventory (a request for each slot it goes to, as a hand-back), then
  the trade's items from the inventory (`hotbar_and_inventory` 0 – 35, of the data value the trade costs) into its
  ingredient slots, a request for each stack, until the slot holds a stack's worth; an item the inventory lacks is
  left out, and what has no room in the inventory stays (recorded: a click on the trade selected, and on the second
  trade with its emerald on the cursor). It resolves once the server took the requests.
- **The result** (`bot.clickWindow(2, button, 0)`, either button) trades once, as the vanilla client's mouse click,
  when the selected trade has a use left, its ingredient slots hold its price (`buyCountA`, `buyCountB`) and the
  cursor holds nothing or its item with room: one request, `craft_recipe` (the offer's `netId`, the times from 1.21.20),
  `results_deprecated` (the sale, as crafting writes a result), a `consume` of each price, then the sale taken from
  the created output to the cursor. Otherwise nothing is sent, as recorded for an unmet trade. A hotbar key
  (`bot.clickWindow(2, key, 2)`) makes the same request with the sale taken to the key's hotbar slot, unless that holds
  another item or has no room for it; a shift click (`bot.clickWindow(2, button, 1)`, Java's way to trade) places the
  sale in the inventory (`hotbar_and_inventory`), onto its stacks with room first, then the first empty slot, if all of
  it fits, else sends nothing. A shift click trades once, as the stations' results do: whether the vanilla client's
  trades again while the price lasts, as Java's does, is not recorded, nor are its shift click and hotbar key here;
  they are written as the stations' results recorded on 1.26.51 (see Stations).
- **`bot.trade(villager, tradeIndex, times)`** and **`window.trade(tradeIndex, times)`** are Java's code over these
  clicks: `tradeIndex` parsed as Java's, `times` (0 or none: the uses left); it rejects as Java's (`trade blocked`,
  `Not enough item 1 to trade`, `Not enough item 2 to trade`) counting what the ingredient slots, the inventory part
  and the cursor hold (the opening's select moved the items to the ingredient slots), and for no such trade, more trades
  than uses left, or a window that is not the screen open. It puts the cursor's item away first (the result is taken to
  the cursor), selects the trade (Java selects it and the server moves the items), then for each trade tops the
  ingredient slots up with `bot.transfer` and takes the result with `bot.putAway(2)` (a click on the result, then the
  cursor's sale to the inventory), and finally puts away what the ingredient slots hold. Each click waits for the
  server's answer.
- **The close** (`bot.closeWindow`, `window.close()`) hands back the cursor, then ingredient slot 1, then 2, and names
  no window in its container_close (`none`, `window_type` `none` from 1.21.0), which the server answers naming the
  screen's id. From 1.21.120 it comes after the crafting table's animation, as recorded on 1.26.51 and 1.26.60 (466 to
  655 ms after the close step); on 1.26.20 the recorded client closed at once, in the hand-back's packet.
- **The trader's death** (`entityDead`): the vanilla client closes the screen itself, as `closeWindow` does (recorded on
  1.26.20, 1.26.51 and 1.26.60, before the server's close).

Recorded on 1.26.20, 1.26.51 and 1.26.60 only, with a server trading wheat for an emerald and an emerald and wheat for
bread, and replayed by the tests on those builds byte for byte: the use holding wheat, the opening's select, a click on
the selected trade, a trade, a select of the second trade, a click on its unmet result and the close; the trader's
death. A trader walking as it is used (recorded on 1.26.51 and 1.26.60) is clicked where the client draws it, between
the positions the server sent, and by the bot where the server last put it: the use's point differs. Not recorded, so as
the bot does it: versions before 1.26.20 (written from the protocol data: one update_trade layout, the requests and the
close each the version's), which count a trade consumes when `buyCountA` is not `buyA`'s `Count` (the bot consumes
`buyCountA`; every recorded one is 1), a select with several stacks of an item, a wandering trader's screen, an item
sold with NBT, a shift click or a hotbar key on the result, and whether the screen closes when the trader is removed
without dying.

Tests (`test/bedrock/villagerTest.ts`): the recorded session played with the bot on 1.26.20, 1.26.51 and 1.26.60;
on every version the screen update_trade opens, its trades, the opening's select, a trade and the close at the
trader's death, a shift click and a hotbar key on the result, each request read back; on the latest, `bot.trade` and
its rejections, the result's rules, the select's and the offers' edge cases.

Not yet: `bot.openEntity` (the containers' feature), the trades' locked tiers, the villager's level and experience
(`trade_tier`, `TierExpRequirements`: Java has no API for them), the mouse-over naming the entity under the
crosshair (the inventory's `interact` names none).

## Brewing stand

Java has no brewing helper: a Java bot opens a brewing stand with `openBlock` and reads its brew time and fuel from
`craft_progress_bar` with a listener of its own. On Bedrock the stand is a screen of its own (`brewing_stand`), whose
window is Java's: the three bottles in slots 0 – 2 (`brewing_result` 1 – 3 in requests), the ingredient in 3
(`brewing_input` 0), the blaze powder in 4 (`brewing_fuel` 4), then the player's 36. Its items are its own window's, by
the dynamic id the server opens it with (`inventory_content` of 5 slots, `inventory_slot` as the server changes them:
the powder it burns, the potions it brews); clicks on them make the vanilla client's requests (see the clicks above).
Its close has the crafting table's animation from 1.21.120 and gives back only the cursor: the stand keeps its items.

- **`bot.openBrewingStand(block)`** (Bedrock's, at the level of Java's `openFurnace`) is `openBlock`, resolving with
  the stand's window; a block the server opens another screen for rejects (`openBrewingStand: the crafting_table
  opened a minecraft:crafting_table window`), that screen closed first. `openBlock` resolves with the same window.
- **`brewTime`**, **`fuel`** and **`fuelTotal`** are container_set_data's properties 0, 1 and 2 for the screen's id,
  as the server sends them, those before its opening too (three of 0 at every opening recorded), null until it tells
  one: the ticks the brew still takes (400 when it starts, then one less a tick, 0 at its end), the brews the fuel
  still makes (20 a blaze powder, one less a brew) and the brews the last powder gave (20). Raw, not Java furnace's
  fractions and seconds. The window's **`update`** event comes in the packet pass of each, after the value changed.
- **`potionItems()`**, **`ingredientItem()`**, **`fuelItem()`** read the slots; **`putPotion(bottle, itemType,
  metadata)`** (one), **`putIngredient(itemType, metadata, count)`** and **`putFuel(…)`** are Java furnace's puts:
  `bot.transfer` from the window's inventory part (one powder of two is a right click, as recorded, the other put
  back); **`takePotion(bottle)`**, **`takePotions()`** (each bottle holding one), **`takeIngredient()`** and
  **`takeFuel()`** are `bot.putAway` of the slot (a shift click, as recorded), resolving with the item taken. A bottle
  other than 0, 1 or 2, an empty slot, or a take with the stand not open reject naming the member.

Recorded on every build (reduced_brewing): the properties before the opening, three potions put in, a blaze powder of
two put as fuel by a right click (the server burns it at once: fuel 20), the other as the ingredient, the brew's 400
ticks, a brewed potion shift clicked out, the close. Not recorded, so as on every screen: a shift click from the
player's slots (the bot moves the stack between the inventory and the hotbar), and which items the vanilla client lets
into which slot (the bot sends the click, which the server may refuse).

## Beacon

Java has no beacon helper: a Java bot opens a beacon with `openBlock`, clicks a payment in, and sends the effects
itself. On Bedrock the beacon is a screen of its own (`beacon`), whose window is Java's: the payment in slot 0
(`beacon_payment` 27 of the ui container in requests), then the player's 36. Choosing an effect sends nothing; the
confirm button sends one request, which pays for the effect and uses the payment up. Its close has the crafting table's
animation from 1.21.120 and gives back the cursor, then the payment.

- **`bot.setBeaconEffects(primary, secondary, beacon)`** (Bedrock's) is the confirm button: one request of
  `beacon_payment` (the primary and secondary effects' ids, 0 for no secondary) and `destroy` of the payment's one
  item, made in the input pass, resolving on the server's answer. The primary is `'speed'` (1), `'haste'` (3),
  `'resistance'` (11), `'jump_boost'` (8) or `'strength'` (5). The secondary, the tier 4 buttons, is `'regeneration'`
  (10) or the primary's own name, its level II, written as the primary's id (as Java's). It pays with the payment
  slot's item, or first puts one there with the window's clicks (`bot.transfer` of one): the first the inventory has of
  an iron ingot, a gold ingot, an emerald, a diamond and a netherite ingot. With no beacon open it opens the `beacon`
  block given, and closes it after, also when it fails. An unknown effect, a secondary other than those two, a
  secondary without a full pyramid, a payment slot holding something else, an inventory with nothing to pay with, no
  beacon open or given, another window open, or a block opening another screen reject naming the member, before any
  click.
- **The full pyramid**, which the vanilla client's tier 4 buttons need: under the block container_open names, four
  layers of 3 × 3, 5 × 5, 7 × 7 and 9 × 9 blocks, each an iron, gold, emerald, diamond or netherite block, as the bot's
  world has them (no packet tells a beacon's levels: its block entity holds only `primary` and `secondary`). A layer
  in a chunk the bot has not received is not whole. The primary is sent whatever the pyramid, as the vanilla client
  did.

Recorded on every build (reduced_stations): an iron ingot taken from the hotbar and put in the payment slot, each of
the five effects confirmed, the close; the server took the payment. The beacons stood on a full pyramid of iron
blocks; in 1.26.20's stations on stone, where the vanilla client confirmed the five primaries all the same. Not
recorded: a secondary effect (every recorded confirm wrote 0; the field is a zigzag32 on every version, and the bot
writes it from protocol data: which id the vanilla client writes for level II and that its tier 4 buttons need the
full pyramid are Java's and the game's rules, not verified), the other payments (paid as the ingot is), and which
items the vanilla client lets into the payment slot. A payment left in the slot was given back at the close against
a scripted server (containers_beacon); the cursor's place before it is not recorded.

## Lectern

Java has no lectern helper: a Java bot opens a lectern with `openBlock`, whose window holds the book in slot 0, and
turns its page or takes it with `container_button_click`. On Bedrock the server opens the lectern's book screen
(`lectern`) when the lectern holds a book: a screen with no slot, the book being the lectern's block entity's, which
block_entity_data tells (`book`, `page`, `totalPages`). Its window is Java's type with the player's 36 slots only (the
inventory part from 0): the vanilla client's book screen shows no slot, so `clickWindow` on it rejects, and nothing is
given back at its close. The close has no animation and no container_close from either side: in the next frame the
bot sends `lectern_update` with the page the book is open at (`page`, `page_count` the book's pages, the lectern's
`position`; `drop_book: false` up to 1.20.61) and closes the screen at once, `windowClose` and `closeWindow` with it.
For a lectern the server told no book of, the close sends nothing, as the vanilla client's.

- **`openBlock(lectern)`** resolves with a **`BedrockLectern`**: **`book`** (the book as an item, null for a lectern
  the server told no book of), **`page`** and **`totalPages`** read the last block_entity_data the bot received at the
  lectern's position, while the screen is open too (0 untold). A lectern whose block entity came only in its chunk is
  untold: the bot reads no block entity of a chunk.
- **`setPage(page)`** (Java has no lectern helper) turns the book to `page` (from 0, below `totalPages`) in the next
  frame: it sends `lectern_update` with that page (`drop_book: false` up to 1.20.61) and shows it at once in `page`,
  which the close then tells, until the server tells another; it resolves once sent. It rejects, sending nothing, a
  page the book has not (a book and quill's 0 pages have none), a lectern told holding no book and a window that is
  not the one open.
- **`takeBook()`** (Java has no lectern helper) takes the book as a player does: it closes the
  screen (as above, telling the page), then hits the lectern (see using a block above: the start of a hit, its abort in
  the next tick), and resolves once the server told the lectern holds no book. The server drops the book beside the
  lectern as an item entity (the lectern staying), which a bot standing near picks up as any item; the bot does not
  walk to it. It rejects, sending nothing, a lectern told holding no book and a window that is not the one open, and
  rejects when the server tells the book still on 100 ticks after the hit. No recording takes a lectern's book: run
  against the 1.16.201, 1.16.210, 1.20.61, 1.20.71, 1.21.0, 1.21.50, 1.26.0, 1.26.40 and 1.26.61 servers, the
  vanilla client's hit of each build (player_action on 1.16.201, the auth input's block actions after) dropped the
  book at once: block_entity_data with no book, add_item_entity of the book, `level_event block_stop_break`. The
  servers ignore `lectern_update`'s `drop_book: true` (up to 1.20.61; 1.20.71 removed the field): run against the
  1.16.201, 1.16.220, 1.18.30, 1.19.80, 1.20.10 and 1.20.61 servers, it took nothing, with the screen open or not. A
  `player_action start_break` drops the book on the servers up to 1.26.0 too, the 1.26.61 server closing the
  connection on it. The book and quill dropped is named "Book & Quill" up to 1.21.20, "Book and Quill" from 1.21.30.
  On the servers that open no lectern screen (see below), `bot.bedrock.takeBookFromLectern` takes it.
- **`activateBlock(lectern)`** holding a book and quill or a written book puts it on a lectern the server told no book
  of, as the vanilla client's use does (see using a block above): the use names the hotbar slot emptied from 1.26.60,
  none before; the server then sends the slot emptied and block_entity_data with the book. A lectern told holding a
  book (or untold: one whose block entity came only in its chunk, which the bot takes for empty) is used as any block.
- **`bot.bedrock.putBookOnLectern(lectern, book)`** (Java has no lectern helper) equips `book` (the hand's, as null),
  uses the lectern, and resolves once the server told it holds a book; it rejects, sending nothing, a block that is no
  lectern, a lectern told holding a book and a given or held item that is no book, and rejects when the server tells no book in 100
  ticks.
- **`bot.bedrock.takeBookFromLectern(lectern)`** (Java has no lectern helper) is `takeBook` with no screen open: it
  hits the lectern as `takeBook` does, the vanilla client's hit of the version (looking at the lectern's top first when
  the player's pick does not meet it), and resolves once the server told the lectern holds no book. It rejects,
  sending nothing, a block that is no lectern and a lectern told holding no book (or untold); a hit cannot be made
  while a screen is open (close the lectern's with `takeBook`), and it rejects when the server tells the book still on
  100 ticks after the hit. It reaches the book on every version, the servers that open no screen included (in the e2e,
  those before 1.20.61).

Recorded on 1.26.20, 1.26.51 and 1.26.60 (protocol_blocks_ui): a book and quill put on a lectern by a use, byte for
byte the bot's (the slot named and the empty hand told in the use's frame on 1.26.60; on 1.26.20 and 1.26.51 no slot,
the hand told after the server's inventory_content, with the use's end on 1.26.51; then block_entity_data
`hasBook 1`, page 0 of 0), its screen opened, the close sending `lectern_update {page 0, page_count 0, position}` 5,
31 and 61 ms after the close step, which is the next frame; against a scripted server (containers_lectern) a lectern
told no book of, whose close sent nothing. Not recorded, written from the protocol: page turns (whether the vanilla
client tells each turn or only the close, and whether the server answers with block_entity_data); the book's take
(a hit, run against the servers: see `takeBook`). Not recorded either: a written book's pages, a lectern screen before 1.26.20, a written book put on a
lectern (taken as the book and quill), and a book put on before 1.26.20 (taken as 1.26.20's: no slot named). Run against
the 1.19.50, 1.21.80 and 1.26.61 servers, `putBookOnLectern` puts the book on; 1.21.80's and 1.26.61's open the lectern's screen on the use; 1.19.50's opens none, sending nothing of the
lectern, so `openBlock` rejects there as for any screen not opened, and `setPage` cannot be reached: the
vanilla client of such a build presumably shows the book screen itself, which is not recorded. In the e2e the servers
up to 1.20.50 open none, those from 1.20.61 open it.

## Jukebox

Java has no jukebox helper: a Java bot plays a disc with `activateBlock` holding it. On Bedrock too the server takes
the held disc on a use, and tells the disc in the jukebox's block entity (block_entity_data `RecordItem`, absent for
none); a use of a jukebox holding a disc gives it back, the server dropping it as an item.

- **`activateBlock(jukebox)`** holding a music disc (`music_disc_*`; a disc fragment is no disc) puts it in a jukebox
  the server told no disc of, as the vanilla client's use does (see using a block above): the use names the hotbar slot
  emptied from 1.26.60, none before; the server then sends the slot emptied and block_entity_data with the disc. A
  jukebox told holding a disc (or untold: one whose block entity came only in its chunk, which the bot takes for empty)
  is used as any block.
- **`bot.bedrock.jukeboxDisc(jukebox)`** (Java has no jukebox helper) is the disc the last block_entity_data at the
  jukebox's position told (a disc item of count 1), null for none and for a jukebox untold; it throws for a block that is
  no jukebox.
- **`bot.bedrock.playDisc(jukebox, disc)`** (Java has no jukebox helper) equips `disc` (the hand's, as null), uses the
  jukebox, and resolves once the server told it holds a disc; it rejects, sending nothing, a block that is no jukebox, a
  jukebox told holding a disc and a given or held item that is no music disc, and rejects when the server tells no disc
  in 100 ticks.
- **`bot.bedrock.takeDisc(jukebox)`** (Java has no jukebox helper) uses the jukebox again, as the vanilla client does,
  with whatever the hand holds (a disc held is not put in, the jukebox being told holding one; no slot is named), and
  resolves once the server told the jukebox holds no disc. The bot does not walk to the dropped disc. It rejects,
  sending nothing, a block that is no jukebox and a jukebox told holding no disc, and rejects when the server tells the
  disc still in 100 ticks after the use.

Recorded on 1.26.20, 1.26.51 and 1.26.60 (protocol_blocks_ui): a music disc (cat) put in a jukebox by a use, byte for
byte the bot's, the arm swinging as for any use (the slot named and the empty hand told in the use's frame on 1.26.60;
on 1.26.20 and 1.26.51 no slot, the hand told after the server's inventory_content, with the use's end on 1.26.51),
then the server's `jukebox_popup` text (`record.nowPlaying`), block_entity_data with `RecordItem`, the disc's sound
(`level_sound_event RecordCat` on 1.26.20; `play_sound record.cat` and `record_started` from 1.26.51). Not recorded:
a disc put in before 1.26.20 (taken as 1.26.20's: no slot named, as a lectern's book), and the disc taken out (the use
is the vanilla client's of the version; whether the server answers with block_entity_data without `RecordItem` is
not recorded).

## Command block

A command block is an operator's editor: the vanilla client opens its screen in creative mode only, and the server
takes its edits (command_block_update) from an operator in creative mode only, as Java's (Java's setCommandBlock asserts
creative mode; its server needs an operator too). The bot is never made an operator, so neither is checked against a
server: the tests are written from the recordings below and from the protocol.

- **The screen** (`command_block`, `lib/bedrock/screens/command_block.ts`, added by the `command_block` plugin) is
  shown at its opening: a screen with no slot, the command and its settings being the block entity's, which
  block_entity_data tells. Its window is a **`BedrockCommandBlock`** (Java has no command block window: the type
  `minecraft:command_block`, with the player's 36 slots only, the inventory part from 0), whose members read the last
  block_entity_data at the screen's position, while it is open too: **`command`** (`Command`), **`trackOutput`**
  (`TrackOutput`), **`conditional`** (`conditionalMode`), **`alwaysActive`** (`auto`), **`tickDelay`**
  (`TickDelay`), **`executeOnFirstTick`** (`ExecuteOnFirstTick`), **`lastOutput`** (`LastOutput`), **`customName`**
  (the hover note, `CustomName`); a field the block entity lacks (or untold: one whose block entity came only in its
  chunk) reads as `''`, 0 or false. **`mode`** is Java's of the block, a Bedrock command block's mode being the block
  itself: 0 sequence (`chain_command_block`), 1 auto (`repeating_command_block`), 2 redstone (`command_block`, and a
  block the bot has not). `clickWindow` on it rejects; its close has no animation, gives nothing back and sends nothing
  (no container_close), closing the screen in the next frame, `windowClose` and `closeWindow` with it.
- **`bot.setCommandBlock(pos, command, options)`** (Java's) throws, as Java's asserts do, out of creative mode and
  for a block (the one `pos` is in) that is no command block, and for a mode other than 0, 1 and 2; else it sends
  command_block_update in the next frame: the block's position, Java's `mode` (2, as null) as Bedrock's (`chain`,
  `repeat`, `impulse`), `needs_redstone` as not `alwaysActive`, `conditional`, the command, `should_track_output`
  as `trackOutput` (each option false, as null, as Java's defaults), then what the screen would keep: the block
  entity's last output, hover note (`name`), tick delay and first tick (`''`, 0 and false untold), and from 1.21.60 an
  empty `filtered_name`. Its position's y is a varint up to 1.26.0 and a zigzag varint from 1.26.10. It returns at
  once, as Java's: the server tells the change in block_entity_data (and a mode change as the block), which the
  screen's members read. Java's `MC|AdvCmd` channel of old versions has no Bedrock counterpart.

Recorded on 1.26.20, 1.26.51 and 1.26.60 against a scripted server (containers_command_block): block_entity_data with no
field of the command's (`id CommandBlock`, the position, `isMovable`), container_open of `command_block` at the
block, the close sending nothing, the server's later container_close of the screen's id before it opened the screen
again; before 1.26.20 the same packets, from the protocol. Not recorded: command_block_update (the vanilla client's
edits need an operator, so whether it sends them at the close or at each edit, and which last output it sends, is not
known), a real server's command block entity (the field names are Bedrock's block entity format's), and a command
block minecart's screen and update.

## Structure block

A structure block is an operator's editor, as a command block is: the vanilla client opens its screen in creative mode
only, and the server takes its settings (structure_block_update) from an operator in creative mode only. Java has no
helper for it, so its member is Bedrock's. The bot is never made an operator, so the update with settings of the
bot's is not checked against a server: the tests are written from the recordings below and from the protocol.

- **The screen** (`structure_editor`, `lib/bedrock/screens/structure_editor.ts`, added by the `structure_block` plugin)
  is shown at its opening: a screen with no slot, the settings being the block entity's, which block_entity_data
  tells. Its window is a **`BedrockStructureBlock`** (the type `minecraft:structure_block`, with the player's 36 slots
  only, the inventory part from 0), whose members read the last block_entity_data at the screen's position, while it
  is open too: **`mode`** (`data`: `data`, `save`, `load`, `corner`, `invalid`, `export`), **`structureName`**
  (`structureName`), **`dataField`** (`dataField`), **`includePlayers`**, **`showBoundingBox`**,
  **`ignoreEntities`**, **`removeBlocks`** (each its own name), **`size`** (`xStructureSize` …), **`offset`**
  (`xStructureOffset` …), **`rotation`** (`rotation`: `none`, `90_deg`, `180_deg`, `270_deg`), **`mirror`**
  (`mirror`: `none`, `x_axis`, `z_axis`, `both_axes`), **`animationMode`** (`animationMode`: `none`, `layers`,
  `blocks`), **`animationSeconds`**, **`integrity`**, **`seed`** (the long's low 32 bits, as the protocol's),
  **`redstoneSaveMode`** (`redstoneSaveMode`: `memory`, `disk`). A field the block entity lacks (or untold) reads as
  `''`, 0, false or the first name, as the vanilla client's update showed them; a number out of the names, the first
  name. `clickWindow` on it rejects; its close has no animation, gives nothing back, and sends the settings in
  structure_block_update, no container_close, closing the screen in the next frame (`windowClose` and `closeWindow`
  with it).
- **`bot.bedrock.setStructureBlock(structureBlock, settings, trigger)`** throws out of creative mode and for a block
  that is no structure block; else it sends structure_block_update in the next frame, as the screen's close: the
  settings given, the block entity's for those not given (all of them, as null), and `should_trigger` as `trigger`
  (false, as null: true asks the server to run the block's mode at once, as the protocol defines it). What the screen
  keeps of its own is sent as recorded: the palette `default`, `non_ticking_players_and_ticking_areas` true, the player's
  unique id (start_game's) as the last editor, the pivot at the structure's middle (half the size less a half on each
  axis), an empty filtered name, `water_logged` false (the bot keeps no block's second layer). The layout is the
  version's: rotation and mirror as numbers and no animation on 1.16.220, the animation from 1.17.0, the ticking areas
  from 1.18.30, `water_logged` from 1.19.30, the filtered name from 1.21.60, the position's y a zigzag varint from
  1.26.10, the redstone save mode a byte from 1.26.40. The protocol data of 1.16.201 and 1.16.210 has no layout of
  structure_block_update (an empty packet), so there it throws, naming the version, and the screen's close sends
  nothing. It returns at once: the server tells the change in block_entity_data, which the screen's members read.
  structure_template_data_export_request (the export and the load's size query) is not sent.

Recorded on 1.26.20, 1.26.51 and 1.26.60 against a scripted server (containers_structure_editor): block_entity_data
with no field of the settings (`id StructureBlock`, the position, `isMovable`), container_open of `structure_editor`
at the block, the close's structure_block_update (structure block type 0, integrity 0, pivot (-0.5, -0.5, -0.5), the
start_game unique id), which the tests replay byte for byte, the server's later container_close of the screen's id
before it opened the screen again; before 1.26.20 the same packets, from the protocol. Not recorded: an update with
settings or a trigger (the vanilla client's edits need an operator), the pivot of a size other than 0, the filtered
name of a name, `water_logged` of a waterlogged block, and a real server's structure block entity (the field names are
Bedrock's block entity format's).

## Jigsaw block

A jigsaw block is an operator's editor too. The protocol has no packet of its own for its edits, so the bot sends the
block entity back in block_entity_data, which either side sends (jigsaw_structure_data is the server's, of the world's
jigsaw structures, which the bot does not read).

- **The screen** (`jigsaw_editor`, `lib/bedrock/screens/jigsaw_editor.ts`, added by the `jigsaw` plugin) is shown at
  its opening: a screen with no slot. Its window is a **`BedrockJigsaw`** (the type `minecraft:jigsaw`, with the
  player's 36 slots only), whose members read the last block_entity_data at the screen's position, while it is open
  too: **`name`** (`name`), **`target`** (`target`), **`pool`** (`target_pool`), **`finalState`** (`final_state`),
  **`joint`** (`joint`), each `''` when the block entity lacks it. `clickWindow` on it rejects; its close has no
  animation, gives nothing back and sends nothing (no container_close), closing the screen in the next frame.
- **`bot.bedrock.setJigsaw(jigsaw, settings)`** throws out of creative mode and for a block that is no jigsaw block;
  else it sends block_entity_data in the next frame: the block entity as last told (`id JigsawBlock` and the position
  for one untold), its other fields kept, with the settings given and the block entity's for the others, each a
  string. Its position's y is a varint up to 1.26.0 and a zigzag varint from 1.26.10. It returns at once.

Recorded on 1.26.20, 1.26.51 and 1.26.60 against a scripted server (containers_jigsaw_editor): block_entity_data with
no field of the settings (`id JigsawBlock`, the position, `isMovable`), container_open of `jigsaw_editor` at the block,
which the tests replay byte for byte, the close sending nothing, the server's later container_close before it opened
the screen again; before 1.26.20 the same packets, from the protocol. Not recorded: an edit (whether the vanilla
client sends it as block_entity_data, at the close or at its button, and which fields, is not known: the field names
are Bedrock's block entity format's), and the jigsaw's generate button.

## Education screens

The compound creator, the element constructor, the material reducer and the lab table are on an Education world only
(the world's Education features on). Java has none of them, so their members are Bedrock's. No Education world is
tested against a server: the tests replay protocol_education, the vanilla client on an Education world of Bedrock
Dedicated Server (1.26.20, 1.26.51 and 1.26.60, the 1.26.20 client without the screens' animations), and are written
from the protocol before 1.26.20.

Their screens (`lib/bedrock/screens/compound_creator.ts`, `element_constructor.ts`, `material_reducer.ts` and
`lab_table.ts`, added by the `education` plugin) are shown at their opening. Each window is of Java 1.14's kind
(`minecraft:<window type>`), its slots before the player's 36 as the vanilla client names them in requests (the
protocol data's ContainerSlotType names, alike on every version), and each close has the crafting table's animation
from 1.21.120 (the recorded closes left 435 to 562 ms after the escape key or the combine, on 1.26.51 and 1.26.60):

- the compound creator: 0 – 8 the inputs (`ui` 18 – 26, `compcreate_input`), 9 the output (`ui` 50,
  `creative_output`); its close gives back the cursor's item, then the inputs' (recorded: two inputs);
- the element constructor: 0 the output (`ui` 50): its element is chosen by the screen's sliders, which the bot has
  not, and a click on it sends nothing, as the vanilla client's with none chosen (recorded); its close gives back the
  cursor's item;
- the material reducer: 0 the input (`ui` 8, `matreduce_input`), 1 – 9 the outputs (`ui` 41 – 49,
  `matreduce_output`);
- the lab table: 0 – 8 its slots, in its own window (`labtable_input`), whose items stay in the table: its close gives
  back only the cursor's item.

- **The reduction**: a click putting an item in the reducer's empty input (a mouse button from the cursor, as recorded,
  or a hotbar key) reduces one of it in the click's request: `non_implemented`, `results_deprecated` with the stacks
  of crafting_data's first material reducer recipe taking the item (its network id, and its metadata but 32767), then
  each stack's `create` and its `take` from `creative_output` to the next output from 41, then one item placed. The
  server keeps it in the input (recorded: one stone made 33 silicon and 64 and 3 oxygen). No click puts an item in an
  output (recorded: nothing sent); a click takes an output's stack as any slot's. It reduces nothing where the input
  holds an item, an output does, no recipe takes the item, or a recipe has more than nine stacks; up to 1.17.10 the
  protocol data's crafting_data has no material reducer recipe. Its close destroys each output's stack (a request
  each), then gives back the cursor's item and the input's, and in the next tick, after those requests, tells an
  inventory mismatch (inventory_transaction `inventory_mismatch`, no action): recorded before container_close with the
  animation, after it without.
- **`bot.bedrock.createCompound(compound)`** makes a stack of the compound of that metadata (water is 26) with the
  compound creator open: `non_implemented`, `results_deprecated` with the compound (the item's stack size, 64), its
  `take` from `creative_output` to the cursor, which must be empty; it resolves when the server answers. The vanilla
  client knows the compounds' elements itself (crafting_data sends no chemistry recipe: recorded), so the bot leaves
  the inputs to the server, and a click on the output sends nothing. The server keeps the inputs (recorded: water of
  two hydrogen and an oxygen, the inputs given back at the close). It rejects, sending nothing, a metadata that is not
  a whole number from 0 (the server judges the rest), without the screen, and with an item on the cursor.
- **`bot.bedrock.combineLabTable()`** with the lab table open and holding items sends `lab_table_combine` and a
  `destroy` of each slot's stack, in order, then closes the screen, as the vanilla client's button does (recorded on
  every build); it resolves once the server answered and closed the screen. The server tells the reaction in lab_table,
  which the bot does not read. It rejects, sending nothing, without the screen and with the table's slots empty.

Recorded and replayed byte for byte on 1.26.20, 1.26.51 and 1.26.60: each screen's opening, the elements placed from
the cursor in the creator's and the table's slots, water made, stone reduced, the combine, and the closes with their
hand-back (the input's stone onto the hotbar's); before 1.26.20 the same requests in the version's layout. Not
recorded: a server's chemistry recipes, the gestures but a mouse click from the cursor, an output's element taken (and
what the server then does with the reducer's input), the cursor's place in the hand-back, an element constructed, and
an Education world on other builds.

## Furnaces

A furnace's, a blast furnace's and a smoker's screen (`lib/bedrock/screens/furnace.ts`, added by the `furnace` plugin)
shows as Java's window, `minecraft:furnace`, `minecraft:blast_furnace` or `minecraft:smoker` ("Furnace", "Blast
Furnace", "Smoker"): slot 0 the input, 1 the fuel, 2 the output (its `craftingResultSlot`), 3 – 29 the inventory, 30 –
38 the hotbar. Its three slots are the screen's own window, sent by its id; a request names the input
`furnace_ingredient`, `blast_furnace_ingredient` or `smoker_ingredient`, the fuel `furnace_fuel`, the output
`furnace_output`, alike on every version (the codec writes their numbers, which 1.19.50 renumbered). Its clicks are
the vanilla client's where they differ from the inventory's:

- the fuel slot takes only an item that burns: for another (an egg) the client sends nothing, no place and no swap.
  No packet tells which items burn: the bot knows the vanilla game's fuels by every version's item names (coal, wood
  and wooden items, wool, carpets, …; the nether woods do not burn);
- the output is never placed into: a left click with its item on the cursor takes it all onto the cursor, a right click
  half of it rounded up, only what fits; with another item, or a full stack, on the cursor it sends nothing;
- a shift click from the inventory or the hotbar puts a fuel in the fuel slot and anything else in the input (eggs, an
  iron sword); one from the furnace's slots goes to the hotbar or inventory, as anywhere;
- hotbar keys over the furnace's slots do nothing; the drop key drops from the output too.

Its close gives back the cursor's stack only (the furnace keeps its slots), and from 1.21.120 leaves after the
crafting table's animation (390 ms), as recorded for the three screens on every build. When the server closes a
screen during the animation, the bot still sends its container_close when the animation ends, and the server answers
it with its own again: the vanilla client did so each of the 153 times recorded on 1.26.51 (gestures: furnaces, blast
furnaces and chests). This holds for every screen (the window module's close). Until that close left, the vanilla
client's screen stays up: `closeWindow` resolves only then, and an `openInventory`, `openBlock` or `openEntity` asked
while a screen is being closed waits until the server closed it and the close left.

Up to 1.18.0 the vanilla client rolls the experience of a take from the output itself and, before the take's request,
asks the server for its orb (spawn_experience_orb, the player's position and the experience; recorded on 1.16.201 –
1.18.0, and never from 1.18.11, where the server rolls it). The bot sends none: no packet tells a recipe's experience,
and a roll is random. On those versions the server gives the bot no experience for a take.

As recorded on every build (reduced_stations: an input and a coal put in from the hotbar, the furnace's and the
smoker's output taken to the cursor and put in the hotbar, the blast furnace's shift clicked; `furnaceTest` plays it
in ten groups by how the requests and the close are written) and, on 1.26.51, every gesture over the three slots of the
three screens. Not recorded, so as the bot does it: a shift click of an item that both burns and cooks there (to the
fuel slot), into a slot holding another item or full (nothing), a take from the output onto a cursor with room for part
of it (what fits), a hotbar key with an item on the cursor over a furnace's slot (nothing). The fuels besides coal, oak
planks and a wooden sword (accepted) and an egg (refused) are the game's table, not recorded.

`bot.openFurnace(furnaceBlock)` is `bot.openBlock(furnaceBlock)` resolving with the window, Java's `Furnace`; another
screen rejects with Java's `This is not a furnace-like window` and stays open. Every furnace screen's window has the
`Furnace` members from its `windowOpen`, however it was opened:

- **`furnace.fuel`, `furnace.progress`**, and Java's untyped `totalFuel`, `totalFuelSeconds`, `fuelSeconds`,
  `totalProgress`, `totalProgressSeconds`, `progressSeconds` (the time left), come from container_set_data, which the
  server sends before the screen opens (so they are known at `windowOpen`) and then at each change, every tick while it
  burns: property 1 is the fuel's ticks left and 2 its whole (`fuel` is 1 over 2, 0 while 2 is), 0 the cook's ticks.
  No packet tells the cook time: it is the block's, 200 ticks for a furnace and 100 for a blast furnace or a smoker, as
  every recorded cook ended at 199 or 99. Property 3 (the stored experience) was 0 on every recorded opening and is
  not shown. A property the server has not sent counts as 0 (Java's fields are null until the first one comes, which a
  Java server sends before the bot listens). The window's `update` comes after each property of the open screen, in the
  packet pass; none comes after `windowClose`, though the server goes on sending them until its close.
- **`inputItem()`, `fuelItem()`, `outputItem()`** are its slots 0, 1 and 2.
- **`putInput(itemType, metadata, count)`, `putFuel(…)`** are Java's: `bot.transfer` from the window's inventory part
  into slot 0 or 1. `putFuel` rejects an item that does not burn (`putFuel: egg is not a fuel`) before clicking: the
  vanilla client sends nothing for one, and the transfer would put it back.
- **`takeInput()`, `takeFuel()`, `takeOutput()`** are Java's: `bot.putAway` of slot 0, 1 or 2 (a shift click; the
  output to the cursor, then into the inventory part's first stack of it with room or first empty slot), resolving with
  the item as it was. An empty slot rejects with an `AssertionError`, as Java's.
- The members reject while their window is not the screen open (`takeOutput needs the minecraft:smoker window open`):
  Java's click whatever window is open. `furnace.close()` and the `close` event are every window's (see window members).

As recorded in cooking_00 on 1.26.60 (the properties of a furnace opened lit and of a smoker's cook); `furnaceTest`
plays them, and Java's members against a server taking the bot's requests as it predicts them.

## Enchanting table

The enchanting table's screen (container_open's `enchantment`) is a `minecraft:enchanting_table` window of Java's 38
slots: 0 the item (`ui` 14, `enchanting_input` in requests), 1 the lapis lazuli (`ui` 15, `enchanting_lapis`), 2 – 37
the player's. Its close gives back the cursor, the item, then the lapis lazuli (the item before the lapis lazuli as
recorded on 1.26.20, 1.26.51 and 1.26.60; where the cursor goes is not recorded), and from 1.21.120 waits for the
inventory's animation (240 ms), as recorded.

- **`bot.openEnchantmentTable(block)`** is Java's: it asserts the block is an `enchanting_table`, opens it with
  `bot.openBlock(block)` and rejects a window whose type does not start with `minecraft:enchant` (Java's message).
  Every enchanting table's window has the members below before `windowOpen`, whoever opened it.
- **`table.enchantments`**: three entries, from the server's last player_enchant_options (`enchant_options` up to
  1.16.210): `level` the option's cost (the level its button asks for), `expected` its first enchantment
  (`{ enchant: id, level }`), and Bedrock's `enchants` (every enchantment it gives, `{ id, name, level }` by Bedrock's
  ids and the registry's names, the equipment's, the held item's then its own: the order the item gets them) and
  `optionId` (what the enchant names). An entry without an option is Java's -1s (`optionId` -1, no `enchants`). Java
  reads them from window properties, which Bedrock does not send for a table: the server sends empty options before
  it opens the table, the three options with the response to the request putting an item in, and empty ones with the
  responses to the enchant and to taking the item out.
- **`ready`** (the window's event) comes in the packet pass of the player_enchant_options that brings options while
  the table is open, once until empty options come (Java's: once the three levels are known, so when an item is in).
- **`table.enchant(choice)`** waits for `ready` (400 ticks, Java's 20 s), reads `choice` with Java's `parseInt`, and
  asserts as Java's that the option has a level. It makes the vanilla client's request in an input pass, which leaves
  in the next tick, and nothing else: `craft_recipe` naming the option's id (the times from 1.21.20),
  `results_deprecated` with the enchanted item (the item with its NBT and `ench`, the option's enchantments as `id` and
  `lvl` shorts, written as a crafted result is), a `consume` of the item, a `place` of the enchanted item from the
  created output back into the item's slot (named by the request, as the consume renamed it), and a `consume` of
  `choice + 1` lapis lazuli. It resolves with slot 0's item once the server took the request. It rejects before
  sending, where the vanilla client's button does nothing: with fewer than `choice + 1` lapis lazuli, and outside
  creative below the level the option asks for or `choice + 1` (a level the server has not told is 0); and when the
  options are gone or the item was taken before its input pass, and for a book (an enchanted book is not recorded).
- **`table.takeTargetItem()`**, **`putTargetItem(item)`**, **`putLapis(item)`** and **`targetItem()`** are Java's: a
  shift click on slot 0 (`bot.putAway(0)`), resolving with the item; `bot.moveSlotItem(item.slot, 0)` (`1` for the
  lapis lazuli), resolving with nothing as Java's code does (its typings say an `Item`); slot 0's item, `null` when
  empty. They and `enchant` reject when the table is not the screen open.
- **`table.xpseed`** is always -1: Java reads a window property; Bedrock tells the player's seed in start_game alone,
  and not again after an enchant changed it.

Recorded and replayed by the tests on every build: an iron sword enchanted with one of its options, each group playing
the server's options and the client's request with the bot, byte for byte. The groups are by how the options are
written (`enchant_options` 1.16.201 – 1.16.210, a varint cost up to 1.26.10, a byte from 1.26.20), how the request is
(`container_id` 1.16.201, the actions numbered anew at 1.17.40 and 1.18.11, a `cause` from 1.19.30, the containers
renumbered at 1.19.50, the times and full container names from 1.21.20, the result by name from 1.26.40, renumbered
at 1.26.60) and the sword's network id; and on 1.26.60 the lapis lazuli given back on close. Not recorded, so as the
bot does it: the button with too little lapis lazuli or too low a level, an enchant in creative, an option of no
enchantment, the cursor's place in the hand-back, a book.

## Grindstone

Java's bot has no grindstone: Bedrock's is under `bot.bedrock`, with the members Java's bot has not. The grindstone's
screen (container_open's `grindstone`) is a `minecraft:grindstone` window of Java's 39 slots: 0 the first item (`ui`
16, `grindstone_input` in requests), 1 the second (`ui` 17, `grindstone_additional`), 2 the result (`ui` 50, the
created output, its crafting result slot), 3 – 38 the player's. Its close gives back the cursor, the second item, then
the first (the second before the first as recorded on 1.26.20, 1.26.51 and 1.26.60; where the cursor goes is not
recorded), and from 1.21.120 waits for the crafting table's animation (390 ms), as recorded.

- **`bot.bedrock.openGrindstone(block)`** opens it with `bot.openBlock(block)` and rejects a window that is no
  grindstone's. Every grindstone's window has `grind` before `windowOpen`, whoever opened it.
- **`grindstone.grind(itemOne, itemTwo)`** does what the vanilla client does: `itemOne` moved into slot 0 by
  `bot.moveSlotItem`, the same for `itemTwo`, if given, into slot 1, a click on the result, then the cursor put in the
  first empty slot of the window's inventory (`bot.putSelectedItemRange`). Each item moves from the window's slot
  holding its stack, else, as Java's `bot.transfer`, the first of its type, metadata and NBT in the window's inventory,
  so an item of `bot.inventory` works (its `slot` is the inventory's, not the window's). It resolves with the result
  once the server took the craft. It rejects before sending where the vanilla client shows no result: one item without
  enchantments, two items of different kinds; and, as Java's grindstone (not recorded), two of an item without
  durability one to a stack (two enchanted books) and an item of a stack of more than one. It rejects two of an item
  without durability that stacks, which Java's makes two of (not recorded), an item with an enchantment the registry
  does not know (newer than it, its curse unknown), when the grindstone is not the screen open, and an item in no slot of
  the window.
- **A click on the result** (`bot.clickWindow(2, button, 0)`) makes the vanilla client's request, which leaves in the
  next tick: the grindstone's action (`non_implemented` up to 1.17.30, whose protocol has none;
  `craft_grindstone_request` with a cost of 0 after, the times from 1.21.20), `results_deprecated` with the result, a
  `consume` of each item, the first's first, and a `take` of the result to the cursor. The result is the first item
  without its enchantments and, from 1.17.10, with `RepairCost` 0; of two items, its `Damage` leaves what both had left
  and 5 % of the durability (`Damage` 138 of two iron swords of `Damage` 200). Not recorded, as Java's grindstone: its
  curses (binding and vanishing) stay, the second item's the first has not after the first's, and from 1.17.10 its
  `RepairCost` is one level of prior work for each (1, 3); an enchanted book left without an enchantment becomes a
  `book`, keeping the rest of its NBT (its name), and one left with a curse stays an enchanted book; an enchanted item
  without durability (a compass of vanishing) is ground too. Its NBT's keys are written in their byte order, as every
  recorded item's. The action names no recipe but the grindstone's
  slots as the last request putting an item in or taking one out left them: up to 1.19.80 that request's id, from
  1.20.0 the first item's name right after it (its stack id, or the request's while that was not answered), as
  recorded on every build. A shift click (`bot.clickWindow(2, button, 1)`, either button) places the result in the
  first slot of the inventory with room (`hotbar_and_inventory`), a hotbar key (`bot.clickWindow(2, key, 2)`) takes
  it to the key's slot, each in the same request, as recorded on 1.26.51; with no room, or the key's slot holding an
  item, they send nothing (not recorded).

Recorded and replayed by the tests on every build: two iron swords of `Damage` 200 combined, and one of Sharpness I
disenchanted, each group playing the client's requests with the bot, byte for byte. The groups are the enchanting
table's, with 1.17.10 apart (`RepairCost`); on 1.26.60 the items given back on close; on 1.26.51 two swords combined by
a shift left click, a shift right click and the key 1, played on every version (byte for byte on 1.26.51). Not
recorded (no enchanted book or curse is in any recorded grindstone), so as Java's grindstone and tested on every
version in two groups (1.16.201 – 1.17.0 without `RepairCost`, 1.17.10 on with it): an enchanted book into a book, and
a sword keeping both curses. Not recorded either, so as the bot does it: the second slot alone, the name of a first
slot a request emptied (the request's), the other items the vanilla client takes, the cursor's place in the
hand-back; whether the vanilla client writes the book's `RepairCost` 0 (Java's book has none to show) or an empty NBT
up to 1.17.0, and whether Bedrock's grindstone takes a single item with only curses, as Java's does. The experience a
grindstone gives comes as orbs
the server spawns; up to 1.17.40 the vanilla client also asks for one before the take (spawn_experience_orb, an
experience it rolls at random, recorded on every disenchant there), which the bot does not send, as for the furnaces'.

## Anvil

The anvil's screen (container_open's `anvil`, of every anvil block) is a `minecraft:anvil` window of Java's 39 slots: 0
the item (`ui` 1, `anvil_input` in requests), 1 the material (`ui` 2, `anvil_material`), 2 the result (`ui` 50, the
created output, its crafting result slot), 3 – 38 the player's. Its close gives back the cursor, the item, then the
material (the item before the material as recorded on 1.26.20, 1.26.51 and 1.26.60; where the cursor goes is not
recorded), and from 1.21.120 waits for the crafting table's animation (390 ms), as recorded.

- **`bot.openAnvil(block)`** is Java's: it opens the anvil with `bot.openBlock(block)` and rejects a window that is no
  anvil's (`Not a anvil-like window: <type>`). Every anvil's window has `combine` and `rename` before `windowOpen`,
  whoever opened it.
- **`anvil.combine(itemOne, itemTwo, name)`** and **`anvil.rename(item, name)`** check as Java's, with its messages: a
  name longer than 35 characters, no result (`Not anvil-able (in either direction), cancelling.`, `Not valid rename,
  cancelling.`), and outside creative a level below the cost (`Player does not have enough xp to do action,
  cancelling.`). `combine` takes the items in the order that makes a result, as Java's the cheaper where both do (the
  given order where both cost the same). Then they do what the vanilla client does: the item moved into slot 0 by
  `bot.moveSlotItem`, the same for the material into slot 1 (an item already in its slot stays there), a click on the
  result, and up to 1.19.40 the cursor put in the first empty slot of the window's inventory
  (`bot.putSelectedItemRange`). Each item moves from the window's slot holding its stack, else, as Java's
  `bot.transfer`, the first of its type, metadata and NBT in the window's inventory, so an item of `bot.inventory` works
  as in Java; an item in no slot of the window rejects (`<member>: the <name> given is in no slot of the window`). They
  resolve once the server took the request and, outside creative, told the level it took (100 ticks), as Java's wait for
  `experience`; Java's rename waits in creative too, and never resolves there.
- **A click on the result** (`bot.clickWindow(2, button, 0)`) makes the vanilla client's request, which leaves in the
  next tick: `optional` (no recipe, no filtered name), a `consume` of the material it takes, then of the item, and the
  result taken to the cursor (up to 1.19.40) or placed in the first slot of the inventory with room (from 1.19.50). Its
  custom names are up to 1.19.40 always one, the new name or else the item's (its custom name, else the registry's
  display name: `Iron Sword` as recorded), with the cause `anvil_text` from 1.19.30; from 1.19.50 the new name and
  `anvil_text`, or none and -1. In the same input pass, before the request: up to 1.18.11 a renaming result's
  filter_text_packet with the new name (the vanilla client sends one for each letter typed too, which the bot does
  not), on 1.16.201 outside creative entity_event `player_add_xp_levels` with the levels taken (negative, as
  recorded; in creative not recorded), and anvil_damage with the anvil's position on every version but 1.17.0 and
  from 1.26.40. A click that makes no result and a level below the cost outside creative reject, sending nothing.
- **A shift click** (`bot.clickWindow(2, button, 1)`, either button) makes the same request with the result placed in
  the first slot of the inventory with room, as a mouse click from 1.19.50 (recorded on 1.26.51; up to 1.19.40, where a
  mouse click takes it to the cursor, not recorded); **a hotbar key** (`bot.clickWindow(2, key, 2)`) takes it to the
  key's slot (recorded on 1.26.51), and sends nothing while that slot holds an item (not recorded).
- **The anvil's damage**: the vanilla client rolls whether its use damages the anvil and tells it in anvil_damage
  (`damage` 1 in 28 of 159 recorded uses), and up to 1.26.30 the server applies what it is told. The bot always sends
  0, so that its use of an anvil does not depend on chance: it never breaks an anvil itself. On 1.17.0 and from
  1.26.40 the client sends none, and the server rolls.
- **The result** is the vanilla client's, by Bedrock's rules: a material the item is repaired with mends a quarter of
  the durability for each one, as many as it needs, each a level; two of an item leave what both had left and 12 % of
  the durability, for 2 levels; a new name costs a level more, and a rename alone keeps the item's `RepairCost`
  (written, 0 when it had none), where a repair writes the larger of the two's twice over plus one. The cost adds both
  items' `RepairCost` (Java's prior work), a cost of 40 makes no result, a rename alone costs 39 at most. Its NBT is
  the item's with `Damage`, `ench`, `RepairCost` and `display` (`Name`, beside what the item's display had), its keys
  in their byte order, as in every item NBT recorded from the vanilla client and the server (`Damage`, `RepairCost`,
  `display`, `ench`; a book's `author`, `generation`, `pages`, `title`, `xuid`). Recorded: `Damage` 200 and 2 iron
  ingots make `Damage` 76 and `RepairCost` 1 for 2 levels, two of `Damage` 200 `Damage` 120 for 2, a rename of
  `Damage` 0 `RepairCost` 0 with its name for 1.
- **Enchantments** come, as Java's, from an enchanted book (Bedrock's keeps them in `ench`, as an item) on any item or
  on another book, or from a second of an item with durability; a material only mends, keeping the item's. Each of the
  second item's enchantments that goes on the first, and that none of the first's excludes (the registry's `exclude`),
  is added, its level one more where both have it at the same level (at most its `maxLevel`), else the higher of the
  two; one that some of the first's exclude is not added and costs nothing. Each costs only the levels it rises over
  the first's (Bedrock's rules; Java's charges its whole final level and a level for each of the first's enchantments
  excluding one): a level by the enchantment's weight 1, 2, 4 or 8 (`weight` 10, 5, 2, 1), Impaling 2 (Java's 4), half
  of it and at least 1 from a book. Where the second has enchantments and none of them is added, or nothing changes
  (no repair and no level risen), there is no result. The result's `ench` is the first's, levels raised in place, then
  the new ones in the second's order. What an enchantment goes on is by the registry's
  enchant categories of the item: the enchantment's category (armour, a piece of it, `weapon` a sword or a spear,
  `digger` a pickaxe, shovel, axe or hoe, a bow, a fishing rod, a trident, a crossbow; `breakable` an item with
  durability and an enchant category, `vanishable` also a compass or a head, `wearable` armour, an elytra or a head), as
  Bedrock's anvil, also Thorns on any armour, Sharpness, Smite and Bane of Arthropods on an axe, Smite, Bane of
  Arthropods and Fire Aspect on a mace, Efficiency on shears; on a book all. An enchantment the registry has not (newer
  than its data), or of a weight or a category these rules do not know, rejects (`the anvil with an enchantment of
  <name> it does not know is not supported on Bedrock yet`).

Recorded and replayed by the tests on every build: an iron sword of `Damage` 200 repaired with 2 iron ingots, two
combined, and one renamed, each group playing the client's packets with the bot, byte for byte (the anvil's damage as
0), and from 1.19.50 its tell of the result in the hand. The groups are the grindstone's, with 1.17.0 (no
anvil_damage), 1.18.11 (the last with filter_text_packet) and 1.26.10 (the anvil's position written anew) apart; on
1.26.60 the item and the material given back on close; on 1.26.51 a sword of `Damage` 200 repaired with an ingot by a
shift left click, a shift right click and the key 1, played on every version in two groups (up to 1.19.40 and from
1.19.50; byte for byte on 1.26.51). The request names no item, so the tests play an enchanted book of Sharpness I and
Unbreaking I in place of the second sword on a sword of Sharpness I in each group, with the recorded combine's packets
but the tell of the result held and, on 1.16.201, of the levels taken. Not recorded, so as the bot does it or
rejecting: every enchantment rule above (Bedrock's, as the game documents them: the vanilla client's levels, costs,
the items each enchantment goes on and the order of the result's `ench` are not recorded; in creative Java's anvil
puts any enchantment on any item, which the bot does not), an empty name, more material than needed, prior work, 40
levels and the rename's cap (Java's rules), the result with no room in the inventory, the cursor's place in the
hand-back, how long a name Bedrock's box takes (Java's 35 kept).

## Stations

Java's bot has no helper for these stations: it opens one with `openBlock` and clicks its window, its server crafting
the recipe a button selected. Each station's screen is a window of Java's layout, its slots in the `ui` window; a click
on its output crafts as the vanilla client's does, in the click's request; and the members Java's bot has not are
Bedrock's own, under `bot.bedrock`.

On 1.26.51 the vanilla client's shift clicks (left and right) and key 1 on the results of the anvil, the grindstone,
the stonecutter, the loom, the cartography table and the smithing table are recorded, one craft each with hotbar slot 0
empty: a shift click makes the mouse click's request with the result placed (`place`) in the first slot of the
inventory with room, the key 1 with the result taken (`take`) to hotbar slot 0, but on the smithing table, where the
key sent nothing. The tests play them on 1.26.51 byte for byte; the trading result's are written by the same rule.

### The stonecutter

Its window is `minecraft:stonecutter`, of Java's 38 slots: 0 the input (`ui` 3, `stonecutter_input` in requests), 1 the
result (`ui` 50, `creative_output`), then the inventory (9 – 35) and the hotbar. Its close gives back the cursor's item,
then the input's (the cursor's place is not recorded: as the crafting table's), and from 1.21.120 waits for the
crafting table's animation (390 ms), as recorded on every build. Its recipes are crafting_data's of block
`stonecutter` (one ingredient each), which `bot.recipesAll`, `recipesFor` and `craft` leave to it.

- **`bot.bedrock.stonecutterRecipes(itemType, metadata)`**: the stonecutter's recipes whose ingredient, as the recipe
  shows it, is the item (of the metadata, unless null or undefined), in crafting_data's order. The vanilla client's
  buttons are the recipes taking the input's item in that order, as its button and craft were on all 338 recorded
  crafts (1.26.51 and 1.26.60); their priority does not order them. From 1.16.220 a block item's `Item.metadata` is
  0, its variant only in the block state the server sends, so for a variant sharing its id with others (granite's
  `stone`) the item's metadata lists data 0's (plain stone's) recipes: given null, it lists them all, and
  `stonecut`, which matches by the state, rejects those the inventory has not the ingredients of.
- **`bot.bedrock.selectStonecutterRecipe(recipe)`** is the button: the output then crafts the recipe, for as long as
  the input holds an item it takes; emptying the input or swapping another item in forgets it, a craft leaving items
  does not. Up to 1.26.51 the vanilla client tells the server nothing (the server crafts the recipe the request names);
  1.26.60 tells it `serverbound_stonecutter_set_recipe`, with the window's id and twice the button's index among those
  the input shows, in the select's input pass. It rejects without a stonecutter open, for a recipe not the
  stonecutter's or not of the last crafting_data, and when the input does not take it, sending nothing.
- **The output** (`bot.clickWindow(1, …)`) crafts the recipe selected, if the input takes it; else it sends nothing,
  as a Java server takes nothing from an empty result slot. A request is, by version: up to 1.17.40
  `non_implemented` (naming no recipe) and `results_deprecated` (the recipe's output, once); 1.18.0 – 1.18.11
  `craft_recipe` and `results_deprecated`; from 1.18.30 `craft_recipe` alone (the times from 1.21.20); then a `consume`
  of the input, and the result moved: with a mouse button (either) taken to the cursor, with a hotbar key to the key's
  slot (recorded on 1.26.51), unless that slot holds another item or has no room for it; with a shift
  click to the inventory as a shift click moves a stack, as often as the input allows while there is room, up to
  1.21.2 a request a craft, from 1.21.20 a stack's worth a request (4 stone: four requests of a stair each, one of 8
  slabs). Up to 1.21.2 the vanilla client then takes one request id more, which it never sends, and the bot does too.
- **1.26.60's reset**: at the screen's opening, and before every request that fills the empty input or empties it (a
  click, a craft, the hand-back), the vanilla client tells `serverbound_stonecutter_set_recipe` index 0 twice, in that
  request's packet; a request leaving items in the input tells nothing. The server answers each with
  `clientbound_stonecutter_set_recipe`, which the bot reads and nothing depends on (the server crafted a recipe whose
  last selection said 0).
- **`bot.bedrock.stonecut(recipe, count, stonecutter)`** cuts `count` crafts (1, as null; 0 cuts nothing) at the
  stonecutter open, else at the one given, which it opens with `bot.openBlock` and closes after, also when it fails:
  it tops the input up to the crafts' ingredients with `bot.transfer` from the inventory's slots holding them, one
  slot at a time (a take, then places, the rest put back, as the vanilla client's clicks), selects the recipe, and
  shift clicks the output. It rejects, sending nothing, for a recipe not the stonecutter's, a count that is not a whole
  number, without the ingredients, for more crafts than a stack of the ingredient, an input of another item or of more
  than the crafts take, an item on the cursor, and with no stonecutter open or given; it rejects after cutting what
  fits when the inventory has no room for all.

Recorded and replayed by the tests: a craft to the cursor on every build, of the request's layout by version (one
build each, byte for byte); 4 stone shift clicked to stairs (1.21.2) and to slabs (1.21.20, 1.26.51); on 1.26.51 one
stone cut to cobblestone by a shift left click, a shift right click and the key 1; on 1.26.60 the selections, resets,
drags, crafts and hand-back of two screens, byte for byte. Not recorded, so as the bot does it: a hotbar key over a
slot holding an item, a shift click making more than a stack, and before 1.26.60 the selection forgotten when the
input empties (1.26.60's reset tells it).

### The smithing table

Its window is `minecraft:smithing`: up to 1.19.80 Java's 1.16 layout of 39 slots, 0 the base (`ui` 51,
`smithing_table_input` in requests), 1 the addition (`ui` 52, `smithing_table_material`), 2 the result (`ui` 50); from
1.20.0 Java's 1.20 layout of 40, the template first (`ui` 53, `smithing_table_template`), then the base, the addition
and the result (3). Its close gives back the cursor's item (its place is not recorded: as the crafting table's), then
the base's, the addition's and the template's, as recorded on 1.26.51, and from 1.21.120 waits for the inventory's
animation (240 ms), as recorded on every build.

Its recipes are crafting_data's: none up to 1.18.0; the shapeless ones of block `smithing_table` (the base, then a
netherite ingot) on 1.18.11 – 1.19.50; from 1.19.60 `smithing_transform` (a template from 1.19.80, invalid on 1.19.80,
where an empty template slot takes it) and from 1.20.0 `smithing_trim`, of item tags (`minecraft:trim_templates`,
`trimmable_armors`, `trim_materials`), up to 1.26.30 in the recipes' list and from 1.26.40 in lists of their own. A
trim's names are the last `trim_data`'s: the pattern of the template's item, the material of the addition's (empty
on 1.19.80, as recorded).

- **The output** (`bot.clickWindow(2, …)`, `3` from 1.20.0) crafts the recipe the slots match; up to 1.18.0, with no
  recipe, a diamond item and a netherite ingot make the netherite item, as the vanilla client's request names none.
  With none matching it sends nothing. A request is, by version: up to 1.18.0 `non_implemented`; from 1.18.11
  `craft_recipe` (the times from 1.21.20); then `results_deprecated` (the result, once); the consumes, up to 1.19.70
  the addition then the base, from 1.19.80 the template (when the recipe has one), the base and the addition; and the
  result moved: with a mouse button taken to the cursor, as recorded, unless it holds an item, and with a shift click
  placed in the inventory as a shift click moves a stack (recorded on 1.26.51). A hotbar key on it sends nothing, as
  the vanilla client's key 1 over it did on 1.26.51 with hotbar slot 0 empty (unlike the other stations'). The result a
  transform makes is its recipe's, a trim's the base with `Trim` (`Material`, `Pattern`); a damageable one has
  `Damage` 0 before it (the NBT's order as recorded), an item of no durability no NBT (netherite horse armor,
  recorded). The base's own NBT is kept, its `Damage` too (not recorded: the bases recorded had none).
- **`bot.bedrock.smith(base, addition, template, smithingTable)`** smiths at the smithing table open, else at the one
  given, which it opens with `bot.openBlock` and closes after, also when it fails: it puts one of each in its slot
  with `bot.transfer` from the inventory slot holding it, in the recorded order (the template, the base, the
  addition), and shift clicks the output. Java's null template or table is none. It rejects, sending nothing, when no
  recipe takes the items (a template is needed from 1.20.0, none takes one before), when the inventory has not one of
  them, with an item on the cursor or in the table's slots, and with no smithing table open or given.

Recorded and replayed by the tests: a netherite upgrade to the cursor on every build, and a trim from 1.20.0, of the
request's layout by version (one build each, byte for byte); on 1.26.51 an upgrade by a shift left click and a shift
right click, and the key 1 sending nothing. Not recorded, so as the bot does it: a base with NBT, and the cursor's
place in the hand-back.

### The loom

Its window is `minecraft:loom`, of Java's 40 slots: 0 the banner (`ui` 9, `loom_input` in requests), 1 the dye (`ui`
10, `loom_dye`), 2 the banner pattern item (`ui` 11, `loom_material`), 3 the result (`ui` 50, `creative_output`). Its
close gives back the cursor's item (its place is not recorded: as the crafting table's), then the banner's, the pattern
item's and the dye's, as recorded on 1.26.51, and from 1.21.120 waits for the crafting table's animation (390 ms), as
recorded on every build. It has no recipe: a request names the pattern.

- **`bot.bedrock.selectLoomPattern(pattern)`** is the pattern's button, by Bedrock's code: one of the 32 of a dye
  alone, which the vanilla client's buttons show in this order (recorded on 1.26.20, 1.26.51 and 1.26.60): `bo mc cr
  ld rud lud rd gra gru hh hhb vh vhr mr ss bl br tl tr sc bs cs dls drs ls ms rs ts bt tt bts tts`. The vanilla client
  tells the server nothing (every build). The selection lasts until another loom opens, a craft too (not recorded). It
  rejects without a loom open, for another code, and for those of a banner pattern item (`cre sku flo moj bri cbo pig
  glb flw gus`), which are not recorded, so not supported.
- **The output** (`bot.clickWindow(3, …)`) makes the pattern selected on the banner, in the dye's color, when the slots
  hold a banner and a `<color>_dye` item (other dyes are not recorded); else it sends nothing. The result is the banner
  with the pattern after its own (`Patterns`, a list of `Color`, Bedrock's index of the color, black 0 … white 15, red 1
  recorded, and `Pattern`), before the banner's other tags: from 1.20.61 the server gives banners `Type` 0, so the
  result is `{Patterns, Type}`, as recorded. A request is, by version: up to 1.17.30 `non_implemented` (naming no
  pattern), from 1.17.40 `craft_loom_request` (the times from 1.21.20); then `results_deprecated` (the result, once),
  a `consume` of the banner then of the dye, and the result moved: with a mouse button taken to the cursor, as recorded,
  with a hotbar key to the key's slot (not while the slot holds an item), with a shift click to the inventory as a
  shift click moves a stack, onto a banner of the same patterns first (both recorded on 1.26.51 into empty slots).
- **`bot.bedrock.applyBannerPattern(pattern, dye, banner, loom)`** patterns a banner at the loom open, else at the one
  given, which it opens with `bot.openBlock` and closes after, also when it fails: it puts the banner (the inventory's
  first, as null) and then one dye in their slots with `bot.transfer`, as recorded, selects the pattern and shift
  clicks the output. It rejects, sending nothing, for a pattern `selectLoomPattern` rejects, an item that is no banner
  or no dye, one the inventory has not, an item on the cursor or in the loom's slots, and with no loom open or given;
  it rejects after the transfers when the inventory has no room for the result.

Recorded and replayed by the tests: the first pattern on a white banner with red dye, to the cursor, on every build, of
the request's layout by version (one build each, byte for byte); on 1.26.51 by a shift left click, a shift right click
and the key 1. Not recorded, so as the bot does it: the other dyes' colors, a banner with patterns already (no limit to
their number is checked: the server's), the selection after a craft, a hotbar key over a slot holding an item, a shift
click onto a banner of the same patterns, the patterns of a banner pattern item, and the cursor's place in the
hand-back.

### The cartography table

Its window is `minecraft:cartography`, of Java's 39 slots: 0 the input (`ui` 12, `cartography_input` in requests), 1
the addition (`ui` 13, `cartography_additional`), 2 the result (`ui` 50, `creative_output`). Its close gives back the
cursor's item (its place is not recorded: as the crafting table's), then the input's and the addition's, as recorded
on 1.26.51, and from 1.21.120 waits for the crafting table's animation (390 ms), as recorded on every build. Its
recipes are crafting_data's of block `cartography_table`, on every version two: paper makes an empty map, paper and a
compass a locator map. Java's bot has no cartography helper, and the slots decide what the output makes, so it has no
member of its own: `bot.openBlock`, `bot.clickWindow` and `bot.closeWindow` drive it.

- **The output** (`bot.clickWindow(2, …)`) makes the recipe whose ingredients the slots hold in its order, as
  recorded: the input its first, the addition its second or nothing; else a filled map in the input and a glass pane
  added lock the map, by crafting_data's multi recipe `5343c1ca-e434-2260-4b02-70ffebb1b78b` (on every version), one
  of each. Else it sends nothing: extending, cloning and renaming a map are not supported. A request is `optional` (the
  recipe, the text 0), a `consume` of the input, then of the addition, and the result moved: with a mouse button taken
  to the cursor, as recorded, with a hotbar key to the key's slot, unless that slot holds another item or has no room
  for it, with a shift click to the inventory as a shift click moves a stack (both recorded on 1.26.51 into empty
  slots). Its custom names are `[""]`, the map's name unchanged, and from 1.19.30 its cause `cartography_text`; from
  1.26.40 each action's legacy type. No packet tells the locked map's NBT (the server's own map id): the bot shows the
  input's.
- **The preview**: once a request (any click's) leaves a filled map and a glass pane in the slots where the one before
  it on this screen did not leave that map with a pane, the bot sends `map_create_locked_copy` (the map's id, from its
  `map_uuid`, and the copy's) in the click's frame, before the request, as the vanilla client previews the copy, as
  recorded on 1.26.20, 1.26.51 and 1.26.60. The client's copy id is random (below 2^31, recorded); the bot's is
  random-looking from the username, the map and how many it previewed, as a command's origin. A map without a
  `map_uuid` is not locked. Up to 1.16.210 the protocol data give the packet no fields, so the bot sends none there.

Recorded and replayed by the tests: an empty map and a locator map to the cursor on every build, of the request's
layout by version (byte for byte on 1.16.201, 1.16.210, 1.19.30, 1.21.20, 1.21.30, 1.26.40 and 1.26.60); on 1.26.51
an empty map by a shift left click, a shift right click and the key 1; and a map locked (protocol_maps'
`protocol.map_locked_copy`: the pane placed from the cursor, the preview, the lock to the cursor; byte for byte on
1.26.20, 1.26.51 and 1.26.60, but for the copy's id). Not recorded, so as the bot does it: a hotbar key over a slot
holding an item, a hotbar key or a shift click locking a map, the slots' items in the other order, the map placed
after the pane, a stack of maps or panes, a map locked already (the server's to refuse), when the client previews
again (the bot: as above, so also after a lock leaving maps and panes), and the cursor's place in the hand-back. The
client then asks for the locked map's pixels (`map_info_request`); the bot has no maps and does not.

## Items

- **`bot.setQuickBarSlot(slot)`** selects a hotbar slot as the vanilla client's number key does. It throws Java's
  `AssertionError` for a slot out of 0 – 8. `bot.quickBarSlot` and `bot.heldItem` read the slot at once (as
  `getControlState` reads a control); the next input pass selects it, emitting `heldItemChanged` there, the last slot
  asked in a frame winning: a slot selected already, or the one the frame started with, selects nothing, emits nothing
  and sends nothing, as the client's key on the slot selected sends nothing. Java emits `heldItemChanged` at once, for
  each call. A block or an entity used after it in the same input pass names the new slot, as the client's key then
  click, and the slot is told before the use (not in the tick): the server reads the use with the slot it was told and
  refuses it for that slot's item (traced on 1.16.201, a disc put in a jukebox refused).
- **What is told**: the next tick tells the slot as any change of what the player holds (see the inventory above):
  `interact mouse_over_entity` then `mob_equipment` naming the slot as `slot` and `selected_slot`, as recorded on
  every build moving between an empty slot and one of dirt. The vanilla client never sends player_hotbar. A slot holding
  an item alike the one held before (or both empty) is told by `mob_equipment` alone, the slot being the server's
  selection: no recording moves between alike slots. The server answers nothing.
- **`bot.QUICK_BAR_START`** is Java's 36, `bot.inventory`'s first hotbar slot.
- **`bot.equip(item, destination)`** is Java's: `item` an `Item` of `bot.inventory`, or an item id, found as Java finds
  it (`findInventoryItem`); `destination` the hand for null. An item already there does nothing; no item rejects with
  Java's error. To the hand, an item of the hotbar is selected (`setQuickBarSlot`); another goes to the first empty
  hotbar slot, else to the next of Java's turns over the hotbar (whose item goes where it came from), which is
  selected first, by `moveSlotItem`'s clicks. To an armor slot or the offhand, it goes by `moveSlotItem` too: a take to
  the cursor, then a place, each once the server took the one before, as recorded on every build putting an iron
  helmet on the head (and a shield in the offhand, see the clicks above). It rejects, sending nothing, an item the slot
  does not take (`equip: dirt is not worn on head`; the clicks' rule: the armor where it is worn, the offhand's items),
  as the vanilla client sends nothing for that click: Java sends its clicks and resolves after the server's refusal,
  so `equip(dirt, 'off-hand')` of Java's examples rejects on Bedrock.
- **`bot.unequip(destination)`** is Java's: the hand selects an empty hotbar slot, else moves its stack to the first
  empty slot of the inventory, else drops it (Java's `tossStack` drops it too, and closes the window open); the armor
  and the offhand are put away (`putAway`: a shift click, to the hotbar and the inventory). `null` throws Java's
  `AssertionError`.
- Both click on the screen open, in its slots that show `bot.inventory`'s (Java clicks the inventory's numbers in any
  window), and reject a slot it does not show (`equip: the minecraft:crafting_table window open shows no slot 5 of the
  inventory`: the armor and the offhand are on the inventory screen only; Java asserts no window is open to unequip
  them); with none open, on the inventory screen, opened and closed again. A selection is told in the next tick,
  which may come while the screen is open: not recorded.
- **`bot.getEquipmentDestSlot(destination)`** is Java's: the hand's hotbar slot, `head` 5, `torso` 6, `legs` 7, `feet`
  8 and `off-hand` 45 (every Bedrock version has an offhand); an `AssertionError` for another. **`bot.entity.equipment`**
  is Java's: the held item, the offhand's, then the feet's, the legs', the torso's and the head's.
- **`bot.tossStack(item)`** is Java's two clicks (`moveSlotItem(slot, -999)`): the item's stack taken to the cursor,
  then dropped outside the window, the arm swinging with the drop, each click once the server took the one before, as
  recorded on every build dropping a stack from the cursor. It clicks the screen open (an `Item` of `bot.inventory`
  where the screen shows it, as `equip` does; another item, the window's own, at its slot, as Java reads it), else the
  inventory screen, opened and closed again. It closes only a screen it opened: Java closes the window open too, the
  caller's. No item throws Java's `AssertionError`.
- **`bot.toss(itemType, metadata, count)`** is Java's: `transfer` of `count` (1 for null) items of `itemType` (any
  metadata for null) from the player's slots of the screen open (`inventoryStart` to `inventoryEnd`; else
  `bot.inventory`'s, on its screen opened and closed again) to outside the window: the first stack taken, dropped
  whole where that is not more than wanted, else one item a right click, the rest put back. Too few items reject with
  Java's `Can't find …` after dropping those found, an unknown item with `Invalid itemType`. The drop key outside any
  screen, the vanilla client's other way to drop the held item (a legacy inventory transaction), is not used.
- **`bot.creative.setInventorySlot(slot, item)`** makes, in creative mode, an item of the server's creative_content as
  the vanilla client takes one from its creative inventory, on the inventory screen (the screen open, else one opened
  and closed again): the slot's stack destroyed first, then the item made and taken to the cursor (`craft_creative` of
  its entry, `results_deprecated` of the entry's item, a take of `item.count` from `creative_output` 50), then put in
  the slot by a click, each once the server took the one before. Java writes any item and NBT (set_creative_slot) and
  waits for the slot; Bedrock has no such packet, and the requests make only what the creative inventory lists: the
  entry of the item's id and metadata (a block's legacy data, as recipes name it) with the item's NBT, else the one
  with none (prismarine-item gives a new tool a `Damage` 0 no entry has). It resolves at once for what the slot holds
  (Java's `Item.equal`); a second call for a slot still being set rejects with Java's message. It rejects, sending
  nothing, outside creative mode (the vanilla client shows the creative inventory there only), for slots 0 – 4 (the
  creative inventory has no crafting grid; slot 45, the offhand, is set too: Java asserts 0 – 44), for an item the
  creative inventory has not, a count no stack has, an item the slot does not take (the clicks' rule for the armor and
  the offhand), with another screen open or an item on the cursor. Calls run one after another, each on its screen.
  Java's `waitTimeout` is ignored: a refusal rejects naming the server's reason (`PlayerNotInCreativeMode`).
- **`bot.creative.clearSlot(slot)`** is Java's `setInventorySlot(slot, null)`: the slot's stack destroyed.
  **`bot.creative.clearInventory()`** destroys the stack of each slot 5 – 45, one after another, on one screen (the
  grid's items go back at its close). No recording destroys an item in creative.
- **`bot.creative.flyTo`, `startFlying` and `stopFlying`** throw (`flyTo` rejects) `bot.creative.<name> is not
  supported on Bedrock yet`: flying is the movement's.
- **The server's inventory transactions** (inventory_transaction) change the slots their container actions name, in
  the packet pass, as inventory_slot does (`heldItemChanged` for the held slot, what the player holds told in the next
  tick): the windows `inventory`, `armor`, `offhand` and `ui`, named or numbered as each version writes them (by
  number up to 1.16.210 and from 1.26.30; the offhand's one item numbered 1, as requests number it), with the stack id
  the item has (up to 1.16.210, the action's). Other actions (the creative inventory a command takes an item from or
  puts it in, the world an item is picked up from) and other windows are not slots of the player's. Servers report an
  item picked up by a transaction alone (with take_item_entity), and some new stack ids of an item held alone too; a
  command's change (`/give`, `/clear`), an item eaten (item_release) or a screen's item handed back come with
  inventory_content or inventory_slot of the same state, in every recording.
- **`bot.writeBook(slot, pages)`** is Java's: a writable book of `bot.inventory`'s slots 0 – 44 (Java's
  `AssertionError`s for another slot or no book) is moved to the hotbar's first slot and back after (`moveSlotItem`, on
  the screen open, else the inventory screen opened and closed again), its hotbar slot selected and the selection given
  back; the selection is told to the server a tick before the edits, as the vanilla client edits the book it holds. The
  pages are written as the vanilla client's book screen writes them, by book_edit, an edit at a time, each once the
  server showed the one before: the first page that differs replaced (an empty page past the book's end is left to a
  later page's replace, the server adding the pages before it empty), then the pages past `pages` deleted from the last;
  a book with the pages already sends nothing. A book without pages (one given by a command) is first used as the
  vanilla client uses it to open its screen (an item use in the air, the book predicted with an empty page list, told
  as held a tick before the edits), once: a server edits no book without pages, and answers the use with nothing (the
  Bedrock Dedicated Servers 1.19.80, 1.21.30, 1.21.120 and 1.26.61 left the edits of a book given by `/give`
  unanswered until it was used) or, as 1.17.40.06 does, with the inventory (inventory_content), the book given an empty
  tag and a new stack id but still no pages, and edits it then: a book used again while it has no pages would be used
  until the timeout. Each edit follows the legacy inventory transaction the vanilla client
  sends with it (the slot's book as the edit leaves it, the book given to the creative inventory and the edited one
  taken from it), which the server refuses, answering with the book as it was (inventory_content), then with it edited,
  with a new stack id (an inventory transaction): the bot shows the edited book at once, telling it as held (as the
  vanilla client does), and resolves once the server shows it so with a new stack id; after 400 ticks (Java's 20 s)
  without, it rejects. Java sends the whole book at once, and resolves on any slot update with pages.
- **`bot.signBook(slot, pages, author, title)`** is Java's (typed on `Bot` too, which Java's typings left out):
  `writeBook`'s, then the book signed by book_edit with the title, the author given and the player's xuid from the
  player list (none unlisted, as the bot plays offline), after the vanilla client's transaction, numbered and naming
  the slot; it resolves once the server shows a written book.

Recorded and replayed by the tests: the selection of an empty slot, then of one of dirt, on every build, in groups by
how the items and the interact are written and where the tick tells them (up to 1.19.0 after its auth input, from
1.19.10 before it).

Recorded and replayed by the tests too: an iron helmet put on the head from hotbar slot 0 on the inventory screen, played
by `equip` on every build, byte for byte, in groups by how requests are written.

Recorded and replayed by the tests too: 10 sticks in hotbar slot 0 taken to the cursor on the inventory screen, then
dropped by a click outside it, played by `tossStack` on every build, byte for byte, with the arm's swing (for a dropped
item from 1.21.130), in groups by how requests are written.

Recorded and replayed by the tests too: in creative mode, on the inventory screen, the creative inventory's first item,
oak planks, taken to the cursor as a stack of 64, played by `setInventorySlot` byte for byte on 1.26.20 – 1.26.30, 1.26.51
and 1.26.60, the builds recorded in creative, then put in the slot by the inventory screen's click (the recording gives
the stack back at the close instead). Every other version makes the same requests, written by its codec, in groups by
how creative_content numbers its entries (`runtime_id` 1.16.201, `stack_id` 1.16.210, `entry_id` from 1.16.220, in
groups from 1.21.60) and craft_creative names them (`creative_item_network_id` 1.16.201, `item_id`, with the times from
1.21.20).

Recorded and replayed by the tests too: an item picked up into an empty hotbar slot, which the server reports by an
inventory transaction alone, shown with its stack id and told by the bot's `mob_equipment` as the vanilla client's, byte
for byte, on every build, in groups by how the transaction is written (the actions inline 1.16.201, after network_ids
1.16.210, windows by name and Items 1.16.220 – 1.26.20, ItemV4s and windows by number after their presence 1.26.30 –
1.26.45, the window an option from 1.26.51). Recorded too: a golden apple eaten (item_release, 1.26.60), the offhand
cleared and an item of the grid put in the hotbar (recorded on 1.26.51, played on 1.26.60).

Recorded and replayed by the tests too: a writable book written on its screen by the vanilla client (a first page, an
empty third page, the fifth page deleted), then signed, played by `writeBook` and `signBook` byte for byte (each edit's
transaction and book_edit, the book told as held) with the server's answers as recorded, on 1.26.20 and 1.26.51 – 1.26.60,
the builds recorded writing a book (1.26.51 sends the same bytes as 1.26.60 but for the signature's legacy id). Every
other version sends the same edits and transactions, written by its codec, in groups by how book_edit names the slot
(`slot`, then from 1.26.0 `inventory_slot` first) and how the transaction is written (as the server's above; the
player's container in a signature's legacy transaction 28 up to 1.19.40, 29 from 1.19.50). The use of a book given
without pages before its first page is played byte for byte on the same builds; every other version sends it written by
its codec, with the fields of the version's use (the trigger and the failed prediction from 1.21.20, the cooldown from
1.26.10, the hand from 1.26.51). No book_edit before 1.26.20 is recorded. On 1.17.40 the tests answer a book given by
`/give` (stack id 6) as the Bedrock Dedicated Server 1.17.40.06 did in the e2e test: its use by the inventory, the book
with an empty tag (7), and its first page by the book as it was, then edited (8); the bot uses it once.

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
- **What servers send**: the tests use the packets and values servers sent the vanilla Bedrock client, recorded on every
  version, small ones as their bytes. Versions whose servers send alike are a group, and each group's tests run on each
  of its versions (the time: `set_time` 1.16.201 – 1.26.20, world clocks 1.26.30+, `tick_sync` answers up to 1.20.50;
  the world: by how a column comes, a block changes and the dimension is named; the corrections: by the ring's size, the
  correction's shape, the movement authority, how the velocity is set and the player respawned; the local player: by
  when it is held and initialized, the auth input's layout, its flags, and how a teleport is answered; the game state:
  by how start_game names the engine, the dimension and whether the world is hardcore, how high the overworld is, how
  the game type is stamped, which game types are spectator, and where the start_game answer says the game type falls
  back to the world's; the health and the experience: by how update_attributes writes an attribute, how the player
  action respawn is written and when a respawned player moves; the breath: by how set_entity_data writes the air; the
  spawn point and the weather: alike on every version; the abilities: by whether the server sends adventure_settings or
  update_abilities, and which abilities its base layer allows; the dimension changes: by whether the player is hidden or
  frozen, when it moves, how the acknowledgement is written and whether a loading screen is named; the settings: by how
  the chunk radius is asked for and the vanilla client's radius; the physics: by how a jump, a sprint, a sneak, a
  landing, a step up and an auto-jump are told, when an auto-jump jumps and a sprint speeds the player, which collisions
  are reported, how a column comes, how the echo is sent and how a correction acts; the entities: by the layouts of the
  add packets, move_entity_delta, set_entity_motion, the attributes and an effect's removal, how the metadata's flags
  are written, and what minecraft-data knows of the entities; the links: by how set_entity_link is laid out; the
  players: by the layouts of player_list, add_player, move_player and update_player_game_type; the scoreboards: by
  set_score's layout, one action for the packet's entries 1.16.220 – 1.26.30, each entry its own type 1.26.40+; the
  titles: by set_title's layout, the type by its number 1.16.201, by its name 1.16.210 – 1.17.0, with an xuid 1.17.10 –
  1.21.2, with a filtered message 1.21.20+; the boss bars: by boss_event's layout, no style with the bar 1.16.201 –
  1.16.210, a numbered style 1.16.220 – 1.21.50, a filtered title 1.21.60 – 1.26.20, every field of every type with the
  player 1.26.30 – 1.26.45, without it 1.26.51+; the sounds: by level_sound_event's layout and names, numbers 1.16.201 –
  1.16.210, misaligned names 1.16.220 – 1.17.40, names 1.18.0 – 1.21.60, with the entity 1.21.70 – 1.26.10, with where
  it fires 1.26.20, the server's names 1.26.30+, and by play_sound's, a varint y 1.16.201 – 1.26.0, a signed y 1.26.10,
  a handle 1.26.20 – 1.26.30, the loops 1.26.40 – 1.26.45, the range check and playback position 1.26.51+; the
  particles: by spawn_particle_effect's layout, without molang variables 1.16.201 – 1.18.11, with them 1.18.30+; the
  chat: by how the text packet, a command's output and an action bar title are laid out, and how the bot's chat and
  commands are; the inventory: by how items, requests, responses, held items and closes are written, and when the held
  item is told, each group playing a recorded spawn, give, move and close with the bot, byte for byte; using a block: by
  how its packets are written and the block numbered, each group playing a recorded opening of a crafting table with the
  bot, byte for byte, and a recorded use of a barrel; using an entity: by how its transaction is written, the legacy
  wrapper 1.16.201 – 1.16.210, an Item 1.16.220 – 1.26.20, an ItemV4 and the transaction's type and actions present
  1.26.30 – 1.26.45, without them 1.26.51, the hand 1.26.60, each group playing a recorded use of a boat with the bot,
  byte for byte; the clicks: by how a request names its containers and stacks, each
  group playing the recorded drop of the cursor's stack and a shield put in the offhand, with every gesture recorded on
  1.26.51 played from 1.26.40, the slots named in the click's frame from 1.26.51 and the cursor drags from 1.26.60; the
  crafting: by how crafting_data lists recipes and descriptors and how craft_recipe, craft_recipe_auto,
  results_deprecated and crafting_event (up to 1.20.40) are written, each group playing a recorded craft with the bot,
  byte for byte; the block actions: by block_event's y, a varint 1.16.201 – 1.26.0, zigzag 1.26.10+, each group
  playing the recorded open and close of a chest, and by the columns that bring a double chest's block entities, whole
  1.16.201 – 1.17.40). The physics' values are the recorded ones, the same on every version unless a group says otherwise. The
  workspace's `pnpm test:recorded` replays the recordings themselves.
- **e2e test** (the workspace's `pnpm test:e2e`): a bot on every Bedrock Dedicated Server build of a directory, each
  build started for it.

## Notes

What was found getting here, beyond mineflayer:

- **bedrock-protocol:** see [API mismatches](typescript/api-mismatches.md#dependency-typings) for its typings.
  - Its client's `disconnect()` writes the disconnect packet's `hide_disconnect_reason` under another name (so
    `false`) and no reason. The bot leaves with `close()`, which RakNet tells the server, but only 40 ms after it
    returns (raknet-native): the bot ends after that.
  - Its client reads what RakNet received a turn later (`process.nextTick`), but closes, dropping its listeners, as
    soon as RakNet tells it the connection closed. A server kicks with the disconnect packet and closes the connection
    at once: when RakNet hands both over together (raknet-native polls them in one batch, which a busy process makes
    likely), the kick was lost, the bot ending with `socketClosed` and no `kicked`. The bot's link defers the client's
    own closes by a timer, after what came before them is read; its own close is at once.
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
- **prismarine-item:** its Bedrock `fromNotch` / `toNotch` write an aux item without its network id (1.16.201,
  1.16.210), write 1.16.220's items as aux items and cannot read them, and write a number as an ItemV4's stack id
  variant as 0 (1.26.20, 1.26.30). `new Item()` without a stack id takes one of its own counting (`Item.nextStackId()`),
  not the server's. The bot reads and writes items itself and gives every `Item` its stack id.
- **prismarine-windows:** it has no Bedrock windows, and gives Java's layouts before 1.14; its inventory has no offhand
  slot (45 slots), so the bot's has 46. Its loader takes a registry, which the bot gives it, so that a window names the
  items it makes as item_registry does. See [API mismatches](typescript/api-mismatches.md#dependency-typings) for its
  typings.
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
- **minecraft-data** read update_trade's `villager_unique_id` and `entity_unique_id` unsigned, where the game writes
  them zigzag, as every unique id: the workspace's minecraft-data reads them as `zigzag64` on every version (the
  recorded villager -8589934590 read as 17179869179).
