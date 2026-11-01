import assert from 'assert'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockStructureBlock, BedrockStructureBlockSettings, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The structure block's screen as the vanilla client showed it in containers_structure_editor against a scripted
// server (1.26.20.4, 1.26.51.1, 1.26.60.5): the server set a structure block, told its block entity and opened its
// screen; the client's close sent structure_block_update with the screen's settings and no container_close. The
// update with settings of the bot's, and a trigger, is not recorded (the server takes it from an operator in creative
// mode only): written from the protocol's layout of each version. The bot loads the game plugin, the windows plugin
// and the structure block's only.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

// as recorded on 1.26.20.4 and 1.26.60.5 (1.26.51.1's at y 13)
const STRUCTURE_AT: At = Object.freeze({ x: 2, y: 12, z: 30 })
const OTHER_AT: At = Object.freeze({ x: 3, y: 12, z: 30 })
const STONE_AT: At = Object.freeze({ x: 5, y: 12, z: 30 })
// in no column the server sent
const UNLOADED_AT: At = Object.freeze({ x: 200, y: 12, z: 200 })
// start_game's, as recorded
const UNIQUE_ID = -8589934591n
// the client's frame: 32 a second, 16 on 1.26.60
const FRAME_MS = (version: BedrockVersion): number => isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const float = (value: number): Tags['float'] => ({ type: 'float', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** the block entity as the scripted server told it: no field of the settings' */
function scriptedEntity ({ x, y, z }: At): Compound {
  return { id: string('StructureBlock'), x: int(x), y: int(y), z: int(z), isMovable: byte(1) }
}

/** a structure block's block entity with its settings, as Bedrock's block entity names them (not recorded): its seed a long, which the codec reads as a bigint */
function toldEntity (at: At): object {
  return {
    ...scriptedEntity(at),
    data: int(1),
    structureName: string('mystructure:house'),
    dataField: string('chest'),
    includePlayers: byte(1),
    showBoundingBox: byte(1),
    ignoreEntities: byte(1),
    removeBlocks: byte(1),
    xStructureSize: int(5),
    yStructureSize: int(4),
    zStructureSize: int(3),
    xStructureOffset: int(0),
    yStructureOffset: int(-1),
    zStructureOffset: int(2),
    rotation: byte(2),
    mirror: byte(3),
    animationMode: byte(1),
    animationSeconds: float(1.5),
    integrity: float(50),
    seed: { type: 'long', value: 0x1_0000_0007n },
    redstoneSaveMode: int(1)
  }
}

const TOLD_SETTINGS: BedrockStructureBlockSettings = Object.freeze({
  mode: 'save',
  structureName: 'mystructure:house',
  dataField: 'chest',
  includePlayers: true,
  showBoundingBox: true,
  ignoreEntities: true,
  removeBlocks: true,
  size: new Vec3(5, 4, 3),
  offset: new Vec3(0, -1, 2),
  rotation: '180_deg',
  mirror: 'both_axes',
  animationMode: 'layers',
  animationSeconds: 1.5,
  integrity: 50,
  seed: 7,
  redstoneSaveMode: 'disk'
})

const UNTOLD_SETTINGS: BedrockStructureBlockSettings = Object.freeze({
  mode: 'data',
  structureName: '',
  dataField: '',
  includePlayers: false,
  showBoundingBox: false,
  ignoreEntities: false,
  removeBlocks: false,
  size: new Vec3(0, 0, 0),
  offset: new Vec3(0, 0, 0),
  rotation: 'none',
  mirror: 'none',
  animationMode: 'none',
  animationSeconds: 0,
  integrity: 0,
  seed: 0,
  redstoneSaveMode: 'memory'
})

function settingsOf (window: BedrockStructureBlock): BedrockStructureBlockSettings {
  const { mode, structureName, dataField, includePlayers, showBoundingBox, ignoreEntities, removeBlocks, size, offset, rotation, mirror, animationMode, animationSeconds, integrity, seed, redstoneSaveMode } = window
  return { mode, structureName, dataField, includePlayers, showBoundingBox, ignoreEntities, removeBlocks, size, offset, rotation, mirror, animationMode, animationSeconds, integrity, seed, redstoneSaveMode }
}

/** each recorded build's block entity and container_open of window 2 as received, and the close's update as sent */
const RECORDED: ReadonlyMap<BedrockVersion, { at: At, entity: string, open: string, close: string }> = new Map([
  ['bedrock_1.26.20', {
    at: STRUCTURE_AT,
    entity: '3804183c0a00080269640e537472756374757265426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e020e04183c01',
    close: '5a04183c0000000000000764656661756c74000001000000000000fdffffff3f000000000000000000000000000000000000bf000000bf000000bf000000'
  }],
  ['bedrock_1.26.51', {
    at: { ...STRUCTURE_AT, y: 13 },
    entity: '38041a3c0a00080269640e537472756374757265426c6f636b030178040301791a03017a3c010969734d6f7661626c650100',
    open: '2e020e041a3c01',
    close: '5a041a3c0000000000000764656661756c74000001000000000000fdffffff3f000000000000000000000000000000000000bf000000bf000000bf000000'
  }],
  ['bedrock_1.26.60', {
    at: STRUCTURE_AT,
    entity: '3804183c0a00080269640e537472756374757265426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e020e04183c01',
    close: '5a04183c0000000000000764656661756c74000001000000000000fdffffff3f000000000000000000000000000000000000bf000000bf000000bf000000'
  }]
])

// ---- structure_block_update's layout of each version, from the protocol

interface Layout {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  /** setStructureBlock(untold structure block at (2, 12, 30), { rotation: '90_deg', mirror: 'z_axis', redstoneSaveMode: 'disk' }, true), as written */
  hex: string
  /** rotation and mirror as the protocol's names, from 1.17.0 */
  named: boolean
  /** the fields the version has besides the others', in the update and in its settings */
  extra: object
  settingsExtra: object
}

const LAYOUTS: readonly Layout[] = [
  {
    name: 'rotation and mirror numbers, no animation',
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    hex: '5a040c3c00000000000764656661756c740000000000000000fdffffff3f01020000000000000000000000bf000000bf000000bf0201',
    named: false,
    extra: {},
    settingsExtra: {}
  },
  {
    name: 'an animation',
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.18.11',
    hex: '5a040c3c00000000000764656661756c740000000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf0201',
    named: true,
    extra: {},
    settingsExtra: { animation_mode: 'none', animation_duration: 0 }
  },
  {
    name: 'ticking areas',
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.19.21',
    hex: '5a040c3c00000000000764656661756c74000001000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf0201',
    named: true,
    extra: {},
    settingsExtra: { animation_mode: 'none', animation_duration: 0, non_ticking_players_and_ticking_areas: true }
  },
  {
    name: 'water logged',
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.21.50',
    hex: '5a040c3c00000000000764656661756c74000001000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf020100',
    named: true,
    extra: { water_logged: false },
    settingsExtra: { animation_mode: 'none', animation_duration: 0, non_ticking_players_and_ticking_areas: true }
  },
  {
    name: 'a filtered name',
    from: 'bedrock_1.21.60',
    to: 'bedrock_1.26.0',
    hex: '5a040c3c0000000000000764656661756c74000001000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf020100',
    named: true,
    extra: { water_logged: false, filtered_structure_name: '' },
    settingsExtra: { animation_mode: 'none', animation_duration: 0, non_ticking_players_and_ticking_areas: true }
  },
  {
    name: 'y a zigzag varint',
    from: 'bedrock_1.26.10',
    to: 'bedrock_1.26.30',
    hex: '5a04183c0000000000000764656661756c74000001000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf020100',
    named: true,
    extra: { water_logged: false, filtered_structure_name: '' },
    settingsExtra: { animation_mode: 'none', animation_duration: 0, non_ticking_players_and_ticking_areas: true }
  },
  {
    name: 'the redstone save mode a byte',
    from: 'bedrock_1.26.40',
    to: latestSupportedBedrockVersion,
    hex: '5a04183c0000000000000764656661756c74000001000000000000fdffffff3f010200000000000000000000000000000000bf000000bf000000bf010100',
    named: true,
    extra: { water_logged: false, filtered_structure_name: '' },
    settingsExtra: { animation_mode: 'none', animation_duration: 0, non_ticking_players_and_ticking_areas: true }
  }
]

function layoutOf (version: BedrockVersion): Layout | undefined {
  return [...LAYOUTS].reverse().find(layout => isBedrockVersionAtLeast(version, layout.from))
}

/** structure_block_update for an untold structure block at (2, 12, 30) */
function update (layout: Layout, fields: object = {}, settings: object = {}): object {
  return {
    position: STRUCTURE_AT,
    structure_name: '',
    data_field: '',
    include_players: false,
    show_bounding_box: false,
    structure_block_type: 0,
    settings: {
      palette_name: 'default',
      ignore_entities: false,
      ignore_blocks: false,
      size: { x: 0, y: 0, z: 0 },
      structure_offset: { x: 0, y: 0, z: 0 },
      last_editing_player_unique_id: UNIQUE_ID,
      rotation: layout.named ? 'none' : 0,
      mirror: layout.named ? 'none' : 0,
      integrity: 0,
      seed: 0,
      pivot: { x: -0.5, y: -0.5, z: -0.5 },
      ...layout.settingsExtra,
      ...settings
    },
    redstone_save_mode: 0,
    should_trigger: false,
    ...layout.extra,
    ...fields
  }
}

interface StructureBlockBot extends TestBot {
  errors: string[]
  /** block_entity_data at the block, as servers send it */
  tell: (value: object, at?: At) => void
  /** container_open of a structure_editor screen at the block, as the scripted server opened it: no use of the bot's */
  open: (id: number, at?: At) => Promise<BedrockStructureBlock>
  /** closeWindow, with the frames, at the client's rate, until the window closed (20 at most) */
  close: (window: Window) => Promise<number>
  /** the first structure_block_update the bot sent, as written */
  sentHex: () => string | undefined
}

/** joined beside the structure blocks (one at 1.26.51.1's recorded y too), with start_game's recorded unique id, in the game mode given */
async function structureBlockBot (version: BedrockVersion, gameMode: 'creative' | 'survival' = 'creative'): Promise<StructureBlockBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { game: true, windows: true, structure_block: true } })
  const { bot, server, driver } = testBot
  const blocks = [
    [STRUCTURE_AT.x, STRUCTURE_AT.y, STRUCTURE_AT.z, 'structure_block'],
    [STRUCTURE_AT.x, STRUCTURE_AT.y + 1, STRUCTURE_AT.z, 'structure_block'],
    [OTHER_AT.x, OTHER_AT.y, OTHER_AT.z, 'structure_block'],
    [STONE_AT.x, STONE_AT.y, STONE_AT.z, 'stone']
  ] as const
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { entity_id: UNIQUE_ID, runtime_entity_id: 1n, player_gamemode: gameMode, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const tell = (value: object, { x, y, z }: At = STRUCTURE_AT): void => {
    server.receive(server.codec.serializer.createPacketBuffer({ name: 'block_entity_data', params: { position: { x, y, z }, nbt: { type: 'compound', name: '', value } } }))
  }
  const open = async (id: number, at: At = STRUCTURE_AT): Promise<BedrockStructureBlock> => {
    server.send('container_open', { window_id: id, window_type: 'structure_editor', coordinates: at, runtime_entity_id: -1n })
    await driver.frame(FRAME_MS(version))
    const window = bot.currentWindow
    assert.ok(window !== null && window.id === id)
    // the window a structure_editor screen shows
    return window as BedrockStructureBlock
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
  const sentHex = (): string | undefined => {
    const [sent] = server.batches.flat().filter(packet => packet.name === 'structure_block_update')
    return sent === undefined ? undefined : server.codec.serializer.createPacketBuffer({ name: sent.name, params: sent.params }).toString('hex')
  }
  return { ...testBot, errors, tell, open, close, sentHex }
}

function receive (server: TestBot['server'], ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

describe('bedrock structure block', () => {
  describe('its screen, as recorded on 1.26.20 – 1.26.60 (before: the protocol\'s, alike; no update before 1.16.220, whose protocol data has none)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: shows the screen the server opens with the block entity's settings, takes no click, and closes in the next frame sending its settings`, async () => {
        const { bot, server, driver, errors, tell, close, sentHex } = await structureBlockBot(version)
        const opened: Window[] = []
        const closed: Window[] = []
        bot.on('windowOpen', window => { opened.push(window) })
        bot.on('windowClose', window => { closed.push(window) })
        const recorded = RECORDED.get(version)
        if (recorded === undefined) {
          tell(scriptedEntity(STRUCTURE_AT))
          server.send('container_open', { window_id: 2, window_type: 'structure_editor', coordinates: STRUCTURE_AT, runtime_entity_id: -1n })
        } else {
          receive(server, recorded.entity, recorded.open)
        }
        await driver.frame(FRAME_MS(version))
        const window = bot.currentWindow as BedrockStructureBlock | null
        assert.ok(window !== null)
        assert.deepStrictEqual([opened, window.id, window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot],
          [[window], 2, 'minecraft:structure_block', 'Structure Block', 36, 0, -1])
        assert.deepStrictEqual(settingsOf(window), UNTOLD_SETTINGS)
        const clicked = assert.rejects(bot.clickWindow(0, 0, 0), { message: 'clickWindow: the structure block window takes no clicks on Bedrock, whose screen shows no slot' })
        await driver.tick()
        await clicked
        assert.deepStrictEqual([await close(window), server.sentOf('container_close'), server.sentOf('item_stack_request'), closed, bot.currentWindow, errors],
          [1, [], [], [window], null, []])
        const layout = layoutOf(version)
        if (recorded !== undefined) assert.strictEqual(sentHex(), recorded.close)
        if (layout === undefined) assert.deepStrictEqual(server.sentOf('structure_block_update'), [])
        else assert.deepStrictEqual(server.sentOf('structure_block_update'), [update(layout, recorded === undefined ? {} : { position: recorded.at })])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const layout = layoutOf(version)!

    it('reads the block entity told last at its position, while open too, and sends it back at the close: its settings, fields out of range or of another type, another block entity there', async () => {
      const { bot, server, driver, errors, tell, open, close } = await structureBlockBot(version)
      tell(toldEntity(STRUCTURE_AT))
      // another structure block's, which is not this one's
      tell({ ...toldEntity(OTHER_AT), structureName: string('other') }, OTHER_AT)
      const told = await open(2)
      assert.deepStrictEqual(settingsOf(told), TOLD_SETTINGS)
      tell({ ...toldEntity(STRUCTURE_AT), data: int(6), rotation: byte(-1), mirror: byte(4), animationMode: byte(3), redstoneSaveMode: int(2), structureName: int(1), integrity: string('50'), seed: int(-1) })
      await driver.tick()
      assert.deepStrictEqual(settingsOf(told), { ...TOLD_SETTINGS, mode: 'data', rotation: 'none', mirror: 'none', animationMode: 'none', redstoneSaveMode: 'memory', structureName: '', integrity: 0, seed: 0xffffffff })
      tell(toldEntity(STRUCTURE_AT))
      await close(told)
      assert.deepStrictEqual(server.sentOf('structure_block_update'), [update(layout, {
        structure_name: 'mystructure:house',
        data_field: 'chest',
        include_players: true,
        show_bounding_box: true,
        structure_block_type: 1,
        redstone_save_mode: 1
      }, {
        ignore_entities: true,
        ignore_blocks: true,
        size: { x: 5, y: 4, z: 3 },
        structure_offset: { x: 0, y: -1, z: 2 },
        rotation: '180_deg',
        mirror: 'both_axes',
        animation_mode: 'layers',
        animation_duration: 1.5,
        integrity: 50,
        seed: 7,
        pivot: { x: 2, y: 1.5, z: 1 }
      })])
      const other = await open(3, OTHER_AT)
      assert.strictEqual(other.structureName, 'other')
      await close(other)
      const unloaded = await open(4, UNLOADED_AT)
      assert.deepStrictEqual(settingsOf(unloaded), UNTOLD_SETTINGS)
      await close(unloaded)
      // a block entity of another kind there forgets the structure block
      tell({ CustomName: string('Box'), id: string('Chest'), x: int(STRUCTURE_AT.x), y: int(STRUCTURE_AT.y), z: int(STRUCTURE_AT.z) })
      const replaced = await open(5)
      assert.deepStrictEqual(settingsOf(replaced), UNTOLD_SETTINGS)
      await close(replaced)
      assert.deepStrictEqual(errors, [])
      bot.end()
    })

    it('closes the screen the server closed, as the scripted server did before opening it again with another id, sending nothing', async () => {
      const { bot, server, driver, errors } = await structureBlockBot(version)
      const recorded = RECORDED.get(version)!
      const closed: Window[] = []
      bot.on('windowClose', window => { closed.push(window) })
      receive(server, recorded.entity, recorded.open)
      await driver.frame(FRAME_MS(version))
      const first = bot.currentWindow
      // as recorded: the server's close of window 2, its block entity again, its opening as window 3
      receive(server, '2f020e01', recorded.entity, '2e030e04183c01')
      await driver.frame(FRAME_MS(version))
      assert.deepStrictEqual([first?.id, closed.map(window => window.id), bot.currentWindow?.id, server.sentOf('container_close'), server.sentOf('structure_block_update'), errors], [2, [2], 3, [], [], []])
      bot.end()
    })
  })
})

describe('bedrock setStructureBlock (not recorded)', () => {
  describe('no layout in the protocol data (1.16.201 – 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: throws, sending nothing`, async () => {
        const { bot, server, driver, errors } = await structureBlockBot(version)
        assert.throws(() => { bot.bedrock.setStructureBlock(bot.blockAt(new Vec3(2, 12, 30))!) }, { message: `setStructureBlock: the protocol data of ${version} has no structure_block_update` })
        await driver.tick()
        assert.deepStrictEqual([server.sentOf('structure_block_update'), errors], [[], []])
        bot.end()
      })
    }
  })

  for (const layout of LAYOUTS) {
    describe(`${layout.name} (${layout.from.slice(8)} – ${layout.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(layout.from, layout.to)) {
        it(`bedrock ${version}: sends the settings given in the next frame, the block entity's for the others, and the trigger`, async () => {
          const { bot, server, driver, errors, sentHex } = await structureBlockBot(version)
          bot.bedrock.setStructureBlock(bot.blockAt(new Vec3(2, 12, 30))!, { rotation: '90_deg', mirror: 'z_axis', redstoneSaveMode: 'disk' }, true)
          assert.deepStrictEqual(server.sentOf('structure_block_update'), [])
          await driver.tick()
          assert.strictEqual(sentHex(), layout.hex)
          assert.deepStrictEqual(server.sentOf('structure_block_update'), [update(layout, { redstone_save_mode: 1, should_trigger: true }, { rotation: layout.named ? '90_deg' : 1, mirror: layout.named ? 'z_axis' : 2 })])
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const layout = layoutOf(version)!

    it('keeps the block entity\'s settings not given, sends no trigger as null, and throws, sending nothing, out of creative mode and for a block that is no structure block', async () => {
      const survival = await structureBlockBot(version, 'survival')
      assert.throws(() => { survival.bot.bedrock.setStructureBlock(survival.bot.blockAt(new Vec3(2, 12, 30))!) }, { message: 'setStructureBlock: the bot has to be in creative mode to set a structure block' })
      survival.bot.end()
      const { bot, server, driver, errors, tell } = await structureBlockBot(version)
      assert.throws(() => { bot.bedrock.setStructureBlock(bot.blockAt(new Vec3(5, 12, 30))!) }, { message: 'setStructureBlock: stone is not a structure block' })
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('structure_block_update'), [])
      tell(toldEntity(STRUCTURE_AT))
      await driver.tick()
      const block = bot.blockAt(new Vec3(2, 12, 30))!
      bot.bedrock.setStructureBlock(block, { mode: 'load', structureName: 'other', size: new Vec3(1, 2, 3), integrity: 100 }, null)
      bot.bedrock.setStructureBlock(block, null, false)
      await driver.tick()
      const told = {
        data_field: 'chest',
        include_players: true,
        show_bounding_box: true,
        redstone_save_mode: 1
      }
      const toldSettings = {
        ignore_entities: true,
        ignore_blocks: true,
        structure_offset: { x: 0, y: -1, z: 2 },
        rotation: '180_deg',
        mirror: 'both_axes',
        animation_mode: 'layers',
        animation_duration: 1.5,
        seed: 7
      }
      assert.deepStrictEqual(server.sentOf('structure_block_update'), [
        update(layout, { ...told, structure_name: 'other', structure_block_type: 2 }, { ...toldSettings, size: { x: 1, y: 2, z: 3 }, integrity: 100, pivot: { x: 0, y: 0.5, z: 1 } }),
        update(layout, { ...told, structure_name: 'mystructure:house', structure_block_type: 1 }, { ...toldSettings, size: { x: 5, y: 4, z: 3 }, integrity: 50, pivot: { x: 2, y: 1.5, z: 1 } })
      ])
      assert.deepStrictEqual(errors, [])
      bot.end()
    })
  })
})
