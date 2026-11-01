import assert from 'assert'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockJigsaw, BedrockJigsawSettings, BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The jigsaw block's screen as the vanilla client showed it in containers_jigsaw_editor against a scripted server
// (1.26.20.4, 1.26.51.1, 1.26.60.5): the server set a jigsaw block, told its block entity and opened its screen; the
// client's close sent nothing. setJigsaw's block_entity_data is not recorded (the server takes it from an operator in
// creative mode only): written from the protocol's layout of each version. The bot loads the game plugin, the windows
// plugin and the jigsaw block's only.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

// as recorded on 1.26.20.4 and 1.26.60.5 (1.26.51.1's at y 13)
const JIGSAW_AT: At = Object.freeze({ x: 2, y: 12, z: 30 })
const OTHER_AT: At = Object.freeze({ x: 3, y: 12, z: 30 })
const STONE_AT: At = Object.freeze({ x: 5, y: 12, z: 30 })
// the client's frame: 32 a second, 16 on 1.26.60
const FRAME_MS = (version: BedrockVersion): number => isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** the block entity as the scripted server told it: no field of the settings' */
function scriptedEntity ({ x, y, z }: At): Compound {
  return { id: string('JigsawBlock'), x: int(x), y: int(y), z: int(z), isMovable: byte(1) }
}

/** a jigsaw block's block entity with its settings, as Bedrock's block entity names them (not recorded) */
function toldEntity (at: At): Compound {
  return {
    ...scriptedEntity(at),
    name: string('minecraft:bottom'),
    target: string('minecraft:top'),
    target_pool: string('minecraft:village/houses'),
    final_state: string('minecraft:air'),
    joint: string('aligned')
  }
}

const TOLD_SETTINGS: BedrockJigsawSettings = Object.freeze({
  name: 'minecraft:bottom', target: 'minecraft:top', pool: 'minecraft:village/houses', finalState: 'minecraft:air', joint: 'aligned'
})
const UNTOLD_SETTINGS: BedrockJigsawSettings = Object.freeze({ name: '', target: '', pool: '', finalState: '', joint: '' })

function settingsOf ({ name, target, pool, finalState, joint }: BedrockJigsaw): BedrockJigsawSettings {
  return { name, target, pool, finalState, joint }
}

/** each recorded build's block entity and container_open of window 2, as received */
const RECORDED: ReadonlyMap<BedrockVersion, { entity: string, open: string }> = new Map([
  ['bedrock_1.26.20', {
    entity: '3804183c0a00080269640b4a6967736177426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e022004183c01'
  }],
  ['bedrock_1.26.51', {
    entity: '38041a3c0a00080269640b4a6967736177426c6f636b030178040301791a03017a3c010969734d6f7661626c650100',
    open: '2e0220041a3c01'
  }],
  ['bedrock_1.26.60', {
    entity: '3804183c0a00080269640b4a6967736177426c6f636b030178040301791803017a3c010969734d6f7661626c650100',
    open: '2e022004183c01'
  }]
])

interface JigsawBot extends TestBot {
  errors: string[]
  /** block_entity_data at the block, as servers send it */
  tell: (value: Compound, at?: At) => void
  /** container_open of a jigsaw_editor screen at the block, as the scripted server opened it: no use of the bot's */
  open: (id: number, at?: At) => Promise<BedrockJigsaw>
  /** closeWindow, with the frames, at the client's rate, until the window closed (20 at most) */
  close: (window: Window) => Promise<number>
}

/** joined beside the jigsaw blocks (one at 1.26.51.1's recorded y too), in the game mode given */
async function jigsawBot (version: BedrockVersion, gameMode: 'creative' | 'survival' = 'creative'): Promise<JigsawBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { game: true, windows: true, jigsaw: true } })
  const { bot, server, driver } = testBot
  const blocks = [
    [JIGSAW_AT.x, JIGSAW_AT.y, JIGSAW_AT.z, 'jigsaw'],
    [JIGSAW_AT.x, JIGSAW_AT.y + 1, JIGSAW_AT.z, 'jigsaw'],
    [OTHER_AT.x, OTHER_AT.y, OTHER_AT.z, 'jigsaw'],
    [STONE_AT.x, STONE_AT.y, STONE_AT.z, 'stone']
  ] as const
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, player_gamemode: gameMode, ...itemStates } })
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  const tell = (value: Compound, { x, y, z }: At = JIGSAW_AT): void => { server.send('block_entity_data', { position: { x, y, z }, nbt: { type: 'compound', name: '', value } }) }
  const open = async (id: number, at: At = JIGSAW_AT): Promise<BedrockJigsaw> => {
    server.send('container_open', { window_id: id, window_type: 'jigsaw_editor', coordinates: at, runtime_entity_id: -1n })
    await driver.frame(FRAME_MS(version))
    const window = bot.currentWindow
    assert.ok(window !== null && window.id === id)
    // the window a jigsaw_editor screen shows
    return window as BedrockJigsaw
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

describe('bedrock jigsaw block', () => {
  describe('its screen, as recorded on 1.26.20 – 1.26.60 (before: the protocol\'s container_open, alike)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: shows the screen the server opens with the block entity's settings, takes no click, and closes in the next frame sending nothing`, async () => {
        const { bot, server, driver, errors, tell, close } = await jigsawBot(version)
        const opened: Window[] = []
        const closed: Window[] = []
        bot.on('windowOpen', window => { opened.push(window) })
        bot.on('windowClose', window => { closed.push(window) })
        const recorded = RECORDED.get(version)
        if (recorded === undefined) {
          tell(scriptedEntity(JIGSAW_AT))
          server.send('container_open', { window_id: 2, window_type: 'jigsaw_editor', coordinates: JIGSAW_AT, runtime_entity_id: -1n })
        } else {
          receive(server, recorded.entity, recorded.open)
        }
        await driver.frame(FRAME_MS(version))
        const window = bot.currentWindow as BedrockJigsaw | null
        assert.ok(window !== null)
        assert.deepStrictEqual([opened, window.id, window.type, window.title, window.slots.length, window.inventoryStart, window.craftingResultSlot],
          [[window], 2, 'minecraft:jigsaw', 'Jigsaw Block', 36, 0, -1])
        assert.deepStrictEqual(settingsOf(window), UNTOLD_SETTINGS)
        const clicked = assert.rejects(bot.clickWindow(0, 0, 0), { message: 'clickWindow: the jigsaw block window takes no clicks on Bedrock, whose screen shows no slot' })
        await driver.tick()
        await clicked
        assert.deepStrictEqual([await close(window), server.sentOf('container_close'), server.sentOf('block_entity_data'), server.sentOf('item_stack_request'), closed, bot.currentWindow, errors],
          [1, [], [], [], [window], null, []])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('reads the block entity told last at its position, while open too: its settings, fields of another type, another block entity there', async () => {
      const { bot, driver, errors, tell, open, close } = await jigsawBot(version)
      tell(toldEntity(JIGSAW_AT))
      // another jigsaw block's, which is not this one's
      tell({ ...toldEntity(OTHER_AT), name: string('other') }, OTHER_AT)
      const told = await open(2)
      assert.deepStrictEqual(settingsOf(told), TOLD_SETTINGS)
      tell({ ...toldEntity(JIGSAW_AT), target: int(1), joint: string('rollable') })
      await driver.tick()
      assert.deepStrictEqual(settingsOf(told), { ...TOLD_SETTINGS, target: '', joint: 'rollable' })
      await close(told)
      const other = await open(3, OTHER_AT)
      assert.strictEqual(other.name, 'other')
      await close(other)
      // a block entity of another kind there forgets the jigsaw block
      tell({ CustomName: string('Box'), id: string('Chest'), x: int(JIGSAW_AT.x), y: int(JIGSAW_AT.y), z: int(JIGSAW_AT.z) })
      const replaced = await open(4)
      assert.deepStrictEqual(settingsOf(replaced), UNTOLD_SETTINGS)
      await close(replaced)
      assert.deepStrictEqual(errors, [])
      bot.end()
    })
  })
})

// ---- setJigsaw: not recorded, written from the protocol's block_entity_data

interface Layout {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  /** setJigsaw(untold jigsaw block at (2, 12, 30), { name: 'a', joint: 'rollable' }), as written */
  hex: string
}

const LAYOUTS: readonly Layout[] = [
  { name: 'y a varint', from: 'bedrock_1.16.201', to: 'bedrock_1.26.0', hex: '38040c3c0a00080269640b4a6967736177426c6f636b030178040301791803017a3c08046e616d650161080674617267657400080b7461726765745f706f6f6c00080b66696e616c5f73746174650008056a6f696e7408726f6c6c61626c6500' },
  { name: 'y a zigzag varint', from: 'bedrock_1.26.10', to: latestSupportedBedrockVersion, hex: '3804183c0a00080269640b4a6967736177426c6f636b030178040301791803017a3c08046e616d650161080674617267657400080b7461726765745f706f6f6c00080b66696e616c5f73746174650008056a6f696e7408726f6c6c61626c6500' }
]

/** block_entity_data of the jigsaw block at (2, 12, 30) */
function entityData (value: Compound): object {
  return { position: JIGSAW_AT, nbt: { type: 'compound', name: '', value } }
}

describe('bedrock setJigsaw (not recorded)', () => {
  for (const layout of LAYOUTS) {
    describe(`${layout.name} (${layout.from.slice(8)} – ${layout.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(layout.from, layout.to)) {
        it(`bedrock ${version}: sends the block entity in the next frame with the settings given, the others empty for one untold`, async () => {
          const { bot, server, driver, errors } = await jigsawBot(version)
          bot.bedrock.setJigsaw(bot.blockAt(new Vec3(2, 12, 30))!, { name: 'a', joint: 'rollable' })
          assert.deepStrictEqual(server.sentOf('block_entity_data'), [])
          await driver.tick()
          const [sent] = server.batches.flat().filter(packet => packet.name === 'block_entity_data')
          assert.ok(sent !== undefined)
          assert.strictEqual(server.codec.serializer.createPacketBuffer({ name: sent.name, params: sent.params }).toString('hex'), layout.hex)
          assert.deepStrictEqual(server.sentOf('block_entity_data'), [entityData({
            id: string('JigsawBlock'),
            x: int(2),
            y: int(12),
            z: int(30),
            name: string('a'),
            target: string(''),
            target_pool: string(''),
            final_state: string(''),
            joint: string('rollable')
          })])
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('keeps the block entity\'s settings not given and its other fields, and throws, sending nothing, out of creative mode and for a block that is no jigsaw block', async () => {
      const survival = await jigsawBot(version, 'survival')
      assert.throws(() => { survival.bot.bedrock.setJigsaw(survival.bot.blockAt(new Vec3(2, 12, 30))!, {}) }, { message: 'setJigsaw: the bot has to be in creative mode to set a jigsaw block' })
      survival.bot.end()
      const { bot, server, driver, errors, tell } = await jigsawBot(version)
      assert.throws(() => { bot.bedrock.setJigsaw(bot.blockAt(new Vec3(5, 12, 30))!, {}) }, { message: 'setJigsaw: stone is not a jigsaw block' })
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('block_entity_data'), [])
      tell({ ...toldEntity(JIGSAW_AT), placement_priority: int(3) })
      await driver.tick()
      bot.bedrock.setJigsaw(bot.blockAt(new Vec3(2, 12, 30))!, { target: 'minecraft:side', pool: 'minecraft:empty', finalState: 'minecraft:stone' })
      await driver.tick()
      assert.deepStrictEqual(server.sentOf('block_entity_data'), [entityData({
        ...toldEntity(JIGSAW_AT),
        placement_priority: int(3),
        target: string('minecraft:side'),
        target_pool: string('minecraft:empty'),
        final_state: string('minecraft:stone')
      })])
      assert.deepStrictEqual(errors, [])
      bot.end()
    })
  })
})
