import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import type { NBT, Tags, TagType } from 'prismarine-nbt'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion, oldestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { TestBot } from './common/server.ts'
import { ServerWorld, stoneFloor } from './common/world.ts'
import type { BlockAt, BlockProperties } from './common/world.ts'

// The lids as the vanilla client saw them against Bedrock Dedicated Server (dump_layouts, 1.16.201.2 – 1.26.60.5):
// a block set by `setblock 2 4 0` (2 -60 0 from 1.18.0) used and its screen closed. The server told block_event
// change_state 1 in the opening's batch and 0 in the close's, for a chest, a barrel (with its open_bit's update_block),
// an undyed shulker box and an ender chest; nothing for a hopper, a dispenser, a dropper or a crafter. No recording
// has a double chest: its halves' pairing is the chest block entity's (pairx, pairz), constructed here.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

type Compound = Record<string, undefined | Tags[TagType]>

const int = (value: number): Tags['int'] => ({ type: 'int', value })
const byte = (value: number): Tags['byte'] => ({ type: 'byte', value })
const string = (value: string): Tags['string'] => ({ type: 'string', value })

/** a chest's block entity at `at`, paired with the half at (`pair.x`, `pair.z`) if given */
function chestEntity ({ x, y, z }: At, pair?: At): Compound {
  const paired: Compound = pair === undefined ? {} : { pairlead: byte(x < pair.x ? 1 : 0), pairx: int(pair.x), pairz: int(pair.z) }
  return { Findable: byte(0), id: string('Chest'), isMovable: byte(1), ...paired, x: int(x), y: int(y), z: int(z) }
}

function nbtOf (value: Compound): NBT {
  return { type: 'compound', name: '', value }
}

const named = (block: Block | null): string => block === null ? 'null' : `${block.name} (${block.position.x}, ${block.position.y}, ${block.position.z})`

interface LidBot extends TestBot {
  world: ServerWorld
  errors: string[]
  /** the chestLidMove events since the last call, each as a line */
  moved: () => string[]
  /** block_event change_state `data` at `at` */
  lid: (at: At, data: number) => void
  tell: (at: At, value: Compound) => void
  setBlock: (at: At, name: string, properties?: BlockProperties) => void
}

/** joined with `blocks` in the columns around it, the block_actions plugin only */
async function lidBot (version: BedrockVersion, blocks: readonly BlockAt[]): Promise<LidBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { loadInternalPlugins: false, plugins: { block_actions: true } })
  const { bot, server } = testBot
  const world = new ServerWorld(server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks })
  await world.join(testBot)
  const Block = prismarineBlock(bot.registry)
  const errors: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  let events: string[] = []
  bot.on('chestLidMove', (block, isOpen, block2) => { events.push(`${named(block)} ${isOpen} ${named(block2)}`) })
  const moved = (): string[] => {
    const fresh = events
    events = []
    return fresh
  }
  return {
    ...testBot,
    world,
    errors,
    moved,
    lid: (position, data) => { server.send('block_event', { position, type: 'change_state', data }) },
    tell: (position, value) => { server.send('block_entity_data', { position, nbt: nbtOf(value) }) },
    // a state by its properties: block_network_ids_are_hashes leaves the registry no state ranges to search
    setBlock: (position, name, properties = {}) => { server.send('update_block', { position, block_runtime_id: Block.fromProperties(name, properties, 0).stateId, layer: 0 }) }
  }
}

interface RecordedLid {
  at: At
  open: string
  close: string
}

interface LidLayout {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  lids: (version: BedrockVersion) => readonly RecordedLid[]
}

const LAYOUTS: readonly LidLayout[] = [
  {
    name: 'block_event\'s y a varint (1.16.201 – 1.26.0)',
    from: oldestSupportedBedrockVersion,
    to: 'bedrock_1.26.0',
    lids: version => [
      // recorded on 1.16.201.2
      { at: { x: 2, y: 4, z: 0 }, open: '1a0404000202', close: '1a0404000200' },
      // the open recorded on 1.26.0.2, the close as 1.16.201.2's
      ...isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? [{ at: { x: 2, y: -60, z: 0 }, open: '1a04c4ffffff0f000202', close: '1a04c4ffffff0f000200' }] : []
    ]
  },
  {
    // recorded on 1.26.10.4 and 1.26.60.5
    name: 'block_event\'s y zigzag (1.26.10+)',
    from: 'bedrock_1.26.10',
    to: latestSupportedBedrockVersion,
    lids: () => [{ at: { x: 2, y: -60, z: 0 }, open: '1a0477000202', close: '1a0477000200' }]
  }
]

describe('bedrock block actions: a lid\'s block_event', () => {
  for (const layout of LAYOUTS) {
    describe(layout.name, () => {
      for (const version of bedrockTestVersionsFrom(layout.from, layout.to)) {
        it(`bedrock ${version}: the recorded opens and close of a chest emit chestLidMove when the count changes; a double chest's halves told by block_entity_data, once for both`, async () => {
          const lids = layout.lids(version)
          // where the overworld starts at 0, 4
          const y = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4
          const [left, right] = [{ x: 5, y, z: 0 }, { x: 6, y, z: 0 }]
          const blocks: BlockAt[] = [...lids.map(({ at }): BlockAt => [at.x, at.y, at.z, 'chest']), [left.x, y, 0, 'chest'], [right.x, y, 0, 'chest']]
          const { bot, server, driver, moved, lid, tell } = await lidBot(version, blocks)
          const seen: string[][] = []
          for (const { open, close } of lids) {
            for (const bytes of [open, open, close, close, open]) {
              server.receive(Buffer.from(bytes, 'hex'))
              await driver.frame(0)
              seen.push(moved())
            }
          }
          assert.deepStrictEqual(seen, lids.flatMap(({ at: { x, y, z } }) => [[`chest (${x}, ${y}, ${z}) 1 null`], [], [`chest (${x}, ${y}, ${z}) 0 null`], [], [`chest (${x}, ${y}, ${z}) 1 null`]]))
          tell(left, chestEntity(left, right))
          tell(right, chestEntity(right, left))
          lid(right, 1)
          lid(left, 1)
          await driver.frame(0)
          const opened = moved()
          lid(left, 0)
          await driver.frame(0)
          assert.deepStrictEqual([opened, moved()], [[`chest (6, ${y}, 0) 1 chest (5, ${y}, 0)`], [`chest (5, ${y}, 0) 0 chest (6, ${y}, 0)`]])
          assert.deepStrictEqual(server.batches.flat().filter(packet => packet.owner === 'block_actions'), [])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const [barrel, shulkerBox, enderChest, chest] = [{ x: 2, y: -60, z: 0 }, { x: 4, y: -60, z: 0 }, { x: 6, y: -60, z: 0 }, { x: 8, y: -60, z: 0 }]

    it('a barrel (whose open_bit changes keep its count), an undyed shulker box and an ender chest emit as a chest', async () => {
      const blocks: BlockAt[] = [[barrel.x, -60, 0, 'barrel'], [shulkerBox.x, -60, 0, 'undyed_shulker_box'], [enderChest.x, -60, 0, 'ender_chest']]
      const { bot, driver, moved, lid, setBlock } = await lidBot(version, blocks)
      const seen: string[][] = []
      // as recorded: the barrel's block_event, then its update_block, in one batch
      lid(barrel, 1)
      setBlock(barrel, 'barrel', { facing_direction: 0, open_bit: 1 })
      await driver.frame(0)
      seen.push(moved())
      lid(barrel, 1)
      await driver.frame(0)
      seen.push(moved())
      lid(barrel, 0)
      setBlock(barrel, 'barrel', { facing_direction: 0, open_bit: 0 })
      await driver.frame(0)
      seen.push(moved())
      for (const at of [shulkerBox, enderChest]) {
        lid(at, 1)
        await driver.frame(0)
        lid(at, 0)
        await driver.frame(0)
        seen.push(moved())
      }
      assert.deepStrictEqual(seen, [
        ['barrel (2, -60, 0) 1 null'], [], ['barrel (2, -60, 0) 0 null'],
        ['undyed_shulker_box (4, -60, 0) 1 null', 'undyed_shulker_box (4, -60, 0) 0 null'],
        ['ender_chest (6, -60, 0) 1 null', 'ender_chest (6, -60, 0) 0 null']
      ])
      bot.end()
    })

    it('a lid replaced by another block forgets its count, as Java\'s: the server tells no close of a lid that is gone', async () => {
      const { bot, driver, moved, lid, setBlock } = await lidBot(version, [[chest.x, -60, 0, 'chest']])
      lid(chest, 1)
      await driver.frame(0)
      setBlock(chest, 'air')
      setBlock(chest, 'chest')
      lid(chest, 1)
      lid(chest, 2)
      await driver.frame(0)
      assert.deepStrictEqual(moved(), ['chest (8, -60, 0) 1 null', 'chest (8, -60, 0) 1 null', 'chest (8, -60, 0) 2 null'])
      bot.end()
    })

    it('a double chest\'s half replaced forgets the pair\'s count and its own pairing', async () => {
      const [left, right] = [{ x: 5, y: -60, z: 0 }, { x: 6, y: -60, z: 0 }]
      const { bot, driver, moved, lid, tell, setBlock } = await lidBot(version, [[left.x, -60, 0, 'chest'], [right.x, -60, 0, 'chest']])
      tell(left, chestEntity(left, right))
      tell(right, chestEntity(right, left))
      lid(left, 1)
      await driver.frame(0)
      setBlock(right, 'air')
      await driver.frame(0)
      lid(left, 1)
      await driver.frame(0)
      const reopened = moved()
      setBlock(right, 'chest')
      lid(right, 1)
      await driver.frame(0)
      assert.deepStrictEqual([reopened, moved()], [
        ['chest (5, -60, 0) 1 chest (6, -60, 0)', 'chest (5, -60, 0) 1 air (6, -60, 0)'],
        ['chest (6, -60, 0) 1 null']
      ])
      bot.end()
    })

    it('emits nothing for a block the bot has not, nor for block_event\'s sound type', async () => {
      const { bot, server, driver, errors, moved, lid } = await lidBot(version, [[chest.x, -60, 0, 'chest']])
      lid({ x: 100, y: -60, z: 100 }, 1)
      server.send('block_event', { position: chest, type: 'sound', data: 1 })
      await driver.frame(0)
      assert.deepStrictEqual([moved(), errors], [[], []])
      bot.end()
    })
  })

  describe('a double chest the column brought paired (1.16.201 – 1.17.40, whose columns come whole with their block entities)', () => {
    for (const version of bedrockTestVersionsFrom(oldestSupportedBedrockVersion, 'bedrock_1.17.40')) {
      it(`bedrock ${version}: pairs the halves as the column's block entities do, until block_entity_data tells them apart`, async () => {
        const [left, right] = [{ x: 2, y: 4, z: 0 }, { x: 3, y: 4, z: 0 }]
        const { bot, driver, world, moved, lid, tell } = await lidBot(version, [])
        const column = world.column(0, 0, [...stoneFloor(0, 0), [left.x, 4, 0, 'chest'], [right.x, 4, 0, 'chest']])
        column.addBlockEntity(nbtOf(chestEntity(left, right)))
        column.addBlockEntity(nbtOf(chestEntity(right, left)))
        await world.load(driver, [[0, 0]])
        lid(right, 1)
        lid(left, 1)
        await driver.frame(0)
        const paired = moved()
        // a pairx without its pairz, or one not an int, pairs nothing
        tell(left, { ...chestEntity(left), pairx: int(right.x) })
        tell(right, { ...chestEntity(right), pairx: { type: 'short', value: left.x }, pairz: int(left.z) })
        lid(left, 0)
        // the right half was not told open
        lid(right, 0)
        lid(right, 1)
        await driver.frame(0)
        assert.deepStrictEqual([paired, moved()], [['chest (3, 4, 0) 1 chest (2, 4, 0)'], ['chest (2, 4, 0) 0 null', 'chest (3, 4, 0) 1 null']])
        bot.end()
      })
    }
  })
})
