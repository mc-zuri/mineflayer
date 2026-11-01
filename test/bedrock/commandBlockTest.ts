import assert from 'assert'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockCommandBlock, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The command block's screen as the vanilla client showed it in containers_command_block against a scripted server
// (1.26.20.4, 1.26.51.1, 1.26.60.5): the server set a command block, told its block entity and opened its screen; the
// client's close sent nothing. setCommandBlock's command_block_update is not recorded (the server takes it from an
// operator in creative mode only): written from the protocol's layout of each version. The bot loads the game plugin,
// the windows plugin and the command block's only.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

// as recorded on 1.26.20.4 and 1.26.60.5 (1.26.51.1's at y 13)
const COMMAND_BLOCK_AT: At = Object.freeze({ x: 2, y: 12, z: 30 })
const REPEATING_AT: At = Object.freeze({ x: 3, y: 12, z: 30 })
const CHAIN_AT: At = Object.freeze({ x: 4, y: 12, z: 30 })
// beside the command block on one axis
const BESIDE_AT: At = Object.freeze({ x: 2, y: 12, z: 31 })
const STONE_AT: At = Object.freeze({ x: 5, y: 12, z: 30 })
// in no column the server sent
const UNLOADED_AT: At = Object.freeze({ x: 200, y: 12, z: 200 })
// the client's frame: 32 a second, 16 on 1.26.60
const FRAME_MS = (version: BedrockVersion): number => isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** the block entity as the scripted server told it: no field of the command's */
function scriptedEntity ({ x, y, z }: At): Compound {
  return { id: string('CommandBlock'), x: int(x), y: int(y), z: int(z), isMovable: byte(1) }
}

/** a command block's block entity with its command and settings, as Bedrock's block entity names them (not recorded) */
function toldEntity (at: At): Compound {
  return {
    ...scriptedEntity(at),
    Command: string('/say hi'),
    CustomName: string('note'),
    ExecuteOnFirstTick: byte(1),
    LastOutput: string('commands.say.success'),
    TickDelay: int(5),
    TrackOutput: byte(1),
    auto: byte(1),
    conditionalMode: byte(1)
  }
}

/** the screen's fields: the command, Java's mode, the settings, the tick delay, then the last output and the hover note */
function fieldsOf (window: BedrockCommandBlock): unknown[] {
  return [window.command, window.mode, window.trackOutput, window.conditional, window.alwaysActive, window.tickDelay, window.executeOnFirstTick, window.lastOutput, window.customName]
}

const UNTOLD_FIELDS = Object.freeze(['', 2, false, false, false, 0, false, '', ''])

/** each recorded build's container_open of window 2 and the block entity told before it, as received */
const RECORDED_OPENS: ReadonlyMap<BedrockVersion, { at: At, entity: string, open: string }> = new Map([
  ['bedrock_1.26.20', {
    at: COMMAND_BLOCK_AT,
    entity: '3804183c0a00080269640c436f6d6d616e64426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e021004183c01'
  }],
  ['bedrock_1.26.51', {
    at: { ...COMMAND_BLOCK_AT, y: 13 },
    entity: '38041a3c0a00080269640c436f6d6d616e64426c6f636b030178040301791a03017a3c010969734d6f7661626c650100',
    open: '2e0210041a3c01'
  }],
  ['bedrock_1.26.60', {
    at: COMMAND_BLOCK_AT,
    entity: '3804183c0a00080269640c436f6d6d616e64426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e021004183c01'
  }]
])

interface CommandBlockBot extends TestBot {
  errors: string[]
  /** block_entity_data at the block, as servers send it */
  tell: (value: Compound, at?: At) => void
  /** container_open of a command_block screen at the block, as the scripted server opened it: no use of the bot's */
  open: (id: number, at?: At) => Promise<BedrockCommandBlock>
  /** closeWindow, with the frames, at the client's rate, until the window closed (20 at most) */
  close: (window: Window) => Promise<number>
}

/** joined beside the command blocks (one at 1.26.51.1's recorded y too), in the game mode given */
async function commandBlockBot (version: BedrockVersion, gameMode: 'creative' | 'survival' = 'creative'): Promise<CommandBlockBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { game: true, windows: true, command_block: true } })
  const { bot, server, driver } = testBot
  const blocks = [
    [COMMAND_BLOCK_AT.x, COMMAND_BLOCK_AT.y, COMMAND_BLOCK_AT.z, 'command_block'],
    [COMMAND_BLOCK_AT.x, COMMAND_BLOCK_AT.y + 1, COMMAND_BLOCK_AT.z, 'command_block'],
    [REPEATING_AT.x, REPEATING_AT.y, REPEATING_AT.z, 'repeating_command_block'],
    [CHAIN_AT.x, CHAIN_AT.y, CHAIN_AT.z, 'chain_command_block'],
    [STONE_AT.x, STONE_AT.y, STONE_AT.z, 'stone']
  ] as const
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, player_gamemode: gameMode, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const tell = (value: Compound, { x, y, z }: At = COMMAND_BLOCK_AT): void => { server.send('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) }
  const open = async (id: number, at: At = COMMAND_BLOCK_AT): Promise<BedrockCommandBlock> => {
    server.send('container_open', { window_id: id, window_type: 'command_block', coordinates: at, runtime_entity_id: -1n })
    await driver.frame(FRAME_MS(version))
    const window = bot.currentWindow
    assert.ok(window !== null && window.id === id)
    // the window a command_block screen shows
    return window as BedrockCommandBlock
  }
  const close = async (window: Window): Promise<number> => {
    const closing = bot.closeWindow(window)
    let frames = 0
    while (bot.currentWindow === window && frames < 20) {
      frames++
      await driver.frame(FRAME_MS(version))
    }
    await closing
    return frames
  }
  return { ...testBot, errors, tell, open, close }
}

function receive (server: TestBot['server'], ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

describe('bedrock command block', () => {
  describe('its screen, as recorded on 1.26.20 – 1.26.60 (before: the protocol\'s container_open, alike)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: shows the screen the server opens with the block entity's fields, takes no click, and closes in the next frame sending nothing`, async () => {
        const { bot, server, driver, errors, tell, close } = await commandBlockBot(version)
        const opened: Window[] = []
        const closed: Window[] = []
        bot.on('windowOpen', window => { opened.push(window) })
        bot.on('windowClose', window => { closed.push(window) })
        const recorded = RECORDED_OPENS.get(version)
        if (recorded === undefined) {
          tell(scriptedEntity(COMMAND_BLOCK_AT))
          server.send('container_open', { window_id: 2, window_type: 'command_block', coordinates: COMMAND_BLOCK_AT, runtime_entity_id: -1n })
        } else {
          receive(server, recorded.entity, recorded.open)
        }
        await driver.frame(FRAME_MS(version))
        const window = bot.currentWindow as BedrockCommandBlock | null
        assert.ok(window !== null)
        assert.deepStrictEqual([opened, window.id, window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot],
          [[window], 2, 'minecraft:command_block', 'Command Block', 36, 0, -1])
        assert.deepStrictEqual(fieldsOf(window), UNTOLD_FIELDS)
        const clicked = assert.rejects(bot.clickWindow(0, 0, 0), { message: 'clickWindow: the command block window takes no clicks on Bedrock, whose screen shows no slot' })
        await driver.tick()
        await clicked
        assert.deepStrictEqual([await close(window), server.sentOf('container_close'), server.sentOf('command_block_update'), server.sentOf('item_stack_request'), closed, bot.currentWindow, errors],
          [1, [], [], [], [window], null, []])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('closes the screen the server closed, as the scripted server did before opening it again with another id', async () => {
      const { bot, server, driver, errors } = await commandBlockBot(version)
      const recorded = RECORDED_OPENS.get(version)
      assert.ok(recorded !== undefined)
      const closed: Window[] = []
      bot.on('windowClose', window => { closed.push(window) })
      receive(server, recorded.entity, recorded.open)
      await driver.frame(FRAME_MS(version))
      const first = bot.currentWindow
      // as recorded: the server's close of window 2, its block entity again, its opening as window 3
      receive(server, '2f021001', recorded.entity, '2e031004183c01')
      await driver.frame(FRAME_MS(version))
      assert.deepStrictEqual([first?.id, closed.map(window => window.id), bot.currentWindow?.id, server.sentOf('container_close'), errors], [2, [2], 3, [], []])
      bot.end()
    })

    it('reads the block entity told last at its position, while open too: the command and settings, the block\'s mode, fields of another type, another block entity there', async () => {
      const { bot, driver, errors, tell, open, close } = await commandBlockBot(version)
      tell(toldEntity(COMMAND_BLOCK_AT))
      // other command blocks', which are not this one's
      tell({ ...toldEntity(REPEATING_AT), Command: string('/say other') }, REPEATING_AT)
      tell({ ...toldEntity(BESIDE_AT), Command: string('/say beside') }, BESIDE_AT)
      const told = await open(2)
      assert.deepStrictEqual(fieldsOf(told), ['/say hi', 2, true, true, true, 5, true, 'commands.say.success', 'note'])
      tell({ ...toldEntity(COMMAND_BLOCK_AT), Command: int(1), TickDelay: string('5'), TrackOutput: byte(0), auto: byte(0) })
      await driver.tick()
      assert.deepStrictEqual(fieldsOf(told), ['', 2, false, true, false, 0, true, 'commands.say.success', 'note'])
      await close(told)
      const repeating = await open(3, REPEATING_AT)
      assert.deepStrictEqual([repeating.command, repeating.mode], ['/say other', 1])
      await close(repeating)
      const chain = await open(4, CHAIN_AT)
      assert.deepStrictEqual([chain.command, chain.mode], ['', 0])
      await close(chain)
      // a block that is no command block, and none the bot has: Java's mode of a command block as placed
      for (const [id, at] of [[5, STONE_AT], [6, UNLOADED_AT]] as const) {
        const other = await open(id, at)
        assert.strictEqual(other.mode, 2)
        await close(other)
      }
      // a block entity of another kind there forgets the command block
      tell({ CustomName: string('Box'), id: string('Chest'), x: int(COMMAND_BLOCK_AT.x), y: int(COMMAND_BLOCK_AT.y), z: int(COMMAND_BLOCK_AT.z) })
      const replaced = await open(7)
      assert.deepStrictEqual(fieldsOf(replaced), UNTOLD_FIELDS)
      await close(replaced)
      assert.deepStrictEqual(errors, [])
      bot.end()
    })
  })
})

// ---- setCommandBlock: not recorded, written from the protocol's command_block_update

interface Layout {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  /** setCommandBlock(pos, '/say hi') on an untold command block at (2, 12, 30), as written */
  hex: string
  /** the fields the version has besides the others' */
  extra: object
}

const LAYOUTS: readonly Layout[] = [
  { name: 'no filtered name, y a varint', from: 'bedrock_1.16.201', to: 'bedrock_1.21.50', hex: '4e01040c3c000100072f7361792068690000000000000000', extra: {} },
  { name: 'a filtered name, y a varint', from: 'bedrock_1.21.60', to: 'bedrock_1.26.0', hex: '4e01040c3c000100072f736179206869000000000000000000', extra: { filtered_name: '' } },
  { name: 'a filtered name, y a zigzag varint', from: 'bedrock_1.26.10', to: latestSupportedBedrockVersion, hex: '4e0104183c000100072f736179206869000000000000000000', extra: { filtered_name: '' } }
]

/** command_block_update for the command block at (2, 12, 30) */
function update (layout: Layout, fields: object): object {
  return {
    is_block: true,
    position: COMMAND_BLOCK_AT,
    mode: 'impulse',
    needs_redstone: true,
    conditional: false,
    command: '/say hi',
    last_output: '',
    name: '',
    ...layout.extra,
    should_track_output: false,
    tick_delay: 0,
    execute_on_first_tick: false,
    ...fields
  }
}

describe('bedrock setCommandBlock (not recorded)', () => {
  for (const layout of LAYOUTS) {
    describe(`${layout.name} (${layout.from.slice(8)} – ${layout.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(layout.from, layout.to)) {
        it(`bedrock ${version}: sends Java's options in the next frame, Java's defaults for those not given, the block entity's hover note, last output, tick delay and first tick`, async () => {
          const { bot, server, driver, errors, tell } = await commandBlockBot(version)
          // at the block the point is in
          bot.setCommandBlock(new Vec3(2.5, 12.9, 30.1), '/say hi')
          assert.deepStrictEqual(server.sentOf('command_block_update'), [])
          await driver.tick()
          const [sent] = server.batches.flat().filter(packet => packet.name === 'command_block_update')
          assert.ok(sent !== undefined)
          assert.strictEqual(server.codec.serializer.createPacketBuffer({ name: sent.name, params: sent.params }).toString('hex'), layout.hex)
          bot.setCommandBlock(new Vec3(2, 12, 30), '/say hi', { mode: 1, trackOutput: true, conditional: true, alwaysActive: true })
          bot.setCommandBlock(new Vec3(2, 12, 30), '/say hi', { mode: 0 })
          tell(toldEntity(COMMAND_BLOCK_AT))
          await driver.tick()
          bot.setCommandBlock(new Vec3(2.2, 12.5, 30.7), '/say hi', { trackOutput: false })
          await driver.tick()
          assert.deepStrictEqual(server.sentOf('command_block_update'), [
            update(layout, {}),
            update(layout, { mode: 'repeat', needs_redstone: false, conditional: true, should_track_output: true }),
            update(layout, { mode: 'chain' }),
            update(layout, { last_output: 'commands.say.success', name: 'note', tick_delay: 5, execute_on_first_tick: true })
          ])
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('throws, sending nothing, out of creative mode, for a block that is no command block or none, and for a mode Java has not', async () => {
      const survival = await commandBlockBot(version, 'survival')
      assert.throws(() => { survival.bot.setCommandBlock(new Vec3(2, 12, 30), '/say hi') }, { message: 'setCommandBlock: the bot has to be in creative mode to set a command block' })
      survival.bot.end()
      const { bot, server, driver, errors } = await commandBlockBot(version)
      for (const { x, y, z } of [STONE_AT, UNLOADED_AT]) {
        assert.throws(() => { bot.setCommandBlock(new Vec3(x, y, z), '/say hi') }, { message: 'setCommandBlock: the block isn\'t a command block' })
      }
      for (const mode of [3, -1, 1.5]) {
        assert.throws(() => { bot.setCommandBlock(new Vec3(2, 12, 30), '/say hi', { mode }) }, { message: `setCommandBlock: mode ${mode} is none of 0 (sequence), 1 (auto) and 2 (redstone)` })
      }
      await driver.tick()
      assert.deepStrictEqual([server.sentOf('command_block_update'), errors], [[], []])
      bot.end()
    })
  })
})
