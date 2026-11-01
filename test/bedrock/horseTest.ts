import assert from 'assert'
import type { Compound, List, NBT, TagType } from 'prismarine-nbt'
import type { Entity } from 'prismarine-entity'
import type { Window } from 'prismarine-windows'
import type { ScreenOpening } from '../../lib/bedrock/modules/screens.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { addEntity, boundingBox, spawned, write } from './common/entities.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersions, bedrockTestVersionsFrom, inputFlags } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The horse's screen, as a scripted server opened it for the vanilla client on 1.26.20, 1.26.51 and 1.26.60
// (containers_horse): update_equipment, no container_open; on 1.26.20 and 1.26.60 its two slots' content and items in
// the same batch, on 1.26.51 none. 1.26.60.5's ids below; the saddle (374) and the diamond horse armour (543) by each
// version's ids.

interface HorseBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
}

async function horseBot (version: BedrockVersion): Promise<HorseBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0') })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors }
}

/** an item of update_equipment's slots: by its legacy name, any data */
function equipment (name: string): Compound {
  return { type: 'compound', value: { Aux: { type: 'short', value: 32767 }, Name: { type: 'string', value: `minecraft:${name}` } } }
}

function compounds (values: Array<Compound['value']>): List<TagType.Compound> {
  return { type: 'list', value: { type: 'compound', value: values } }
}

/** update_equipment as the scripted server sent it: the saddle's slot and the armour's, each taking what it names */
function openHorse (server: FakeBedrockClient, id: number, entity: bigint): void {
  const slots = ['saddle', 'horsearmordiamond'].map((name, slotNumber) => ({
    slotNumber: { type: 'int' as const, value: slotNumber },
    item: equipment(name),
    acceptedItems: compounds([{ slotItem: equipment(name) }])
  }))
  const inventory: NBT = { type: 'compound', name: '', value: { slots: compounds(slots) } }
  server.send('update_equipment', { window_id: id, window_type: 'horse', size: 0, entity_id: entity, inventory })
}

/** a window's Java type, title, slots, inventory part and result slot */
function shapeOf (window: Window | null): [string | number, string, number, number, number, number] | null {
  return window === null ? null : [window.type, window.title, window.slots.length, window.inventoryStart, window.inventoryEnd, window.craftingResultSlot]
}

function itemOf (window: Window, slot: number): [string, number, number | null] | null {
  const item = window.slots[slot]
  return item === null || item === undefined ? null : [item.name, item.count, item.stackId]
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

/** a slot as a request names it, without 1.21.20's dynamic id */
function describeSlot (info: SentSlot): string {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  return `${String(container)}:${info.slot ?? info.slot_id}#${info.stack_id}`
}

/** each request the bot sent: its id, its actions (no legacy type id) */
function requests (server: FakeBedrockClient): string[] {
  return server.sentOf('item_stack_request').flatMap(({ requests }) => requests).map(({ request_id: id, actions }) =>
    `${id} ${actions.map(({ type_id: type, count, source, destination }) =>
      `${String(type)} ${count ?? ''} ${source === undefined ? '' : describeSlot(source)}${destination === undefined ? '' : ` → ${describeSlot(destination)}`}`).join(', ')}`)
}

/** the close the vanilla client sends: from 1.21.0 naming the screen's type none */
function close (version: BedrockVersion, id: number): BedrockServerboundPackets['container_close'] {
  return isBedrockVersionAtLeast(version, 'bedrock_1.21.0') ? { window_id: id, window_type: 'none', server: false } : { window_id: id, server: false }
}

/** the frame after the close's in which the vanilla client sends container_close: after the inventory's animation from 1.21.120, at the rate it was recorded at */
function closeFrame (version: BedrockVersion): number {
  if (!isBedrockVersionAtLeast(version, 'bedrock_1.21.120')) return 0
  return isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 5 : 9
}

/** the frames from the close's input pass to container_close's: 0, in the same */
async function framesUntilClose ({ server, driver }: Pick<TestBot, 'server' | 'driver'>, version: BedrockVersion): Promise<number> {
  await driver.tick()
  for (let frames = 0; frames <= 20; frames++) {
    if (server.sentOf('container_close').length > 0) return frames
    await driver.frame(isBedrockVersionAtLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
  }
  return Infinity
}

// The vanilla client opening a tamed horse's screen (protocol_item_stacks, protocol.horse_equip, 1.26.20, 1.26.51 and
// 1.26.60): standing at (0.5, -60, 0.5), its camera at yaw −90 and pitch 29.197464, a saddle in hotbar slot 0, the
// horse (box 1.4 × 1.6) at (2.5, -60, 0.5); the sneak key pressed, the use 5 to 9 ticks later, update_equipment answering

const CAMERA = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const HORSE_BOX = Object.freeze({ width: 1.399999976158142, height: 1.600000023841858 })

/** the client's use, its click's y as its camera, still lowering, put it (that y's bytes) */
const SNEAKING_USES: ReadonlyArray<{ version: BedrockVersion, runtime: number, click: string, y: string }> = [
  // the click at y -59.389625549316406, 0.338 below the auth inputs' eye
  { version: 'bedrock_1.26.20', runtime: 18, click: '1e000300120000a60601000000000a000000000000000000000000003f1c8569c20000003f9999d93ffa8e6dc20000003f', y: 'fa8e6dc2' },
  // -59.39645767211914: 0.345 below
  { version: 'bedrock_1.26.51', runtime: 4, click: '1e00000300040000760101000000000a000000000000000000000000003f1c8569c20000003f9999d93ff9956dc20000003f', y: 'f9956dc2' },
  // -59.39851379394531: 0.347 below
  { version: 'bedrock_1.26.60', runtime: 16, click: '1e0000030010000000760101000000000a000000000000000000000000003f1c8569c20000003f9999d93f14986dc20000003f', y: '14986dc2' }
]
/** the bot's click's y: its pick from the camera settled 0.35 below the eye, -59.40057373046875 */
const SNEAKING_Y = '309a6dc2'
/** that click's y over other feet: 4 up to 1.17.40, whose overworld starts at 0 */
const SNEAKING_CLICK_Y: { readonly [feetY: number]: number } = Object.freeze({ [-60]: -59.40057373046875, 4: 4.599422454833984 })

/** joined standing at (0.5, feetY, 0.5) on stone, looking as the recorded client's camera did, a saddle in hotbar slot 0 */
async function standingBot (version: BedrockVersion, feetY: number): Promise<HorseBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: isBedrockVersionAtLeast(version, 'bedrock_1.20.0'), blocks: [[0, feetY - 1, 0, 'stone']] })
  const itemStates = isBedrockVersionAtLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation: CAMERA, game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const inventory = new ServerInventory(testBot.server)
  inventory.slot('inventory', 0, { id: testBot.bot.registry.itemsByName['saddle']?.id ?? 0, count: 1, stackId: 62 })
  return { ...testBot, inventory, errors }
}

/** the entity of the type, a horse's box, at (2.5, feetY, 0.5), shown once the frame after ran */
async function showRidden ({ bot, server, driver }: TestBot, runtime: number, type: string, feetY: number): Promise<Entity> {
  const { version } = bot
  write(server, 'add_entity', addEntity(version, { unique: -BigInt(runtime), runtime, type: `minecraft:${type}`, position: { x: 2.5, y: feetY, z: 0.5 }, metadata: boundingBox(version, HORSE_BOX.width, HORSE_BOX.height) }))
  await driver.frame(0)
  return spawned(bot, runtime)
}

/** what the bot sent since the last call, in order: the sneak's starts and stops (1.16.201's player_action, later the auth inputs' flags), and the uses */
function sneaksAndUses (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen).flat()
    seen = server.batches.length
    return fresh.flatMap(({ name, params }): string[] => {
      if (name === 'inventory_transaction') return ['use']
      if (name === 'player_action') return [`player_action ${String((params as BedrockServerboundPackets['player_action']).action)}`]
      if (name !== 'player_auth_input') return []
      const sneaks = inputFlags(params as BedrockServerboundPackets['player_auth_input']).set.filter(flag => /^(start|stop)_sneaking$/.test(flag))
      return [['auth', ...sneaks].join(' ')]
    })
  }
}

function useOf (server: FakeBedrockClient): { player: unknown, click: unknown } {
  const data = server.sentOf('inventory_transaction')[0]?.transaction.transaction_data
  assert.ok(data !== undefined && 'entity_runtime_id' in data)
  return { player: data.player_pos, click: data.click_pos }
}

/** opens the horse with openEntity, the bot not sneaking: what it sent each frame, the use's eye and click, the window, the sneak after */
async function openedSneaking (version: BedrockVersion): Promise<string[][]> {
  // the overworld starts at 0 up to 1.17.40
  const feetY = isBedrockVersionAtLeast(version, 'bedrock_1.18.0') ? -60 : 4
  const testBot = await standingBot(version, feetY)
  const { bot, server, driver, errors } = testBot
  const horse = await showRidden(testBot, 2, 'horse', feetY)
  const sent = sneaksAndUses(server)
  const opening = bot.openEntity(horse)
  const frames: string[][] = []
  for (let tick = 0; tick < 2; tick++) {
    await driver.tick()
    frames.push(sent())
  }
  openHorse(server, 7, -2n)
  testBot.inventory.content(7, [null, null])
  await driver.frame(0)
  const window = await opening
  frames.push(sent())
  await driver.tick()
  frames.push(sent())
  // the camera 0.35 below the eye: 1.27001 over the feet
  const eyeY = Math.fround(feetY + Math.fround(1.62001))
  assert.deepStrictEqual([useOf(server), window === bot.currentWindow, window.type, bot.getControlState('sneak'), errors], [
    { player: { x: 0.5, y: eyeY, z: 0.5 }, click: { x: 1.6999999284744263, y: SNEAKING_CLICK_Y[feetY], z: 0.5 } }, true, 'EntityHorse', false, []
  ])
  bot.end()
  return frames
}

describe('bedrock horse screen', () => {
  describe('update_equipment opens it, its content in the same batch, its slots named horse_equip (1.26.60\'s ids on every version)', () => {
    for (const version of bedrockTestVersions()) {
      it(`bedrock ${version}: shown with its saddle and armour, a click takes the saddle, and it closes after the inventory's animation`, async () => {
        const testBot = await horseBot(version)
        const { bot, internal, server, driver, inventory, errors } = testBot
        const { saddle, diamond_horse_armor: armour } = bot.registry.itemsByName
        assert.ok(saddle !== undefined && armour !== undefined)
        internal._core.requestIds.continueProcess(-433)
        const opened: Array<ReturnType<typeof shapeOf>> = []
        bot.on('windowOpen', window => { opened.push(shapeOf(window)) })
        const openings: ScreenOpening[] = []
        internal._inventory.screens.onShown(({ opening }) => { openings.push(opening) })
        openHorse(server, 3, 1003n)
        inventory.content(3, [null, null])
        inventory.slot(3, 0, { id: saddle.id, count: 1, stackId: 1437 })
        inventory.slot(3, 1, { id: armour.id, count: 1, stackId: 1438 })
        await driver.frame(0)
        const window = bot.currentWindow
        assert.ok(window !== null)
        assert.deepStrictEqual([opened, openings, window.id, itemOf(window, 0), itemOf(window, 1)], [
          [['EntityHorse', 'Horse', 38, 2, 38, -1]], [{ id: 3, type: 'horse', position: { x: 0, y: 0, z: 0 }, entity: 1003n }], 3, ['saddle', 1, 1437], ['diamond_horse_armor', 1, 1438]
        ])

        const clicked = bot.clickWindow(0, 0, 0)
        await driver.tick()
        inventory.respond(-433, [{ container: 'horse_equip', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 1437 }])
        await driver.tick()
        await clicked
        inventory.slot('ui', 0, null)
        const closing = bot.closeWindow(window)
        const frames = await framesUntilClose(testBot, version)
        server.send('container_close', { window_id: 3, server: false })
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([requests(server), frames, server.sentOf('container_close'), bot.currentWindow, errors], [
          ['-433 take 1 horse_equip:0#1437 → cursor:0#0'], closeFrame(version), [close(version, 3)], null, []
        ])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    it('a horse screen no content comes for, as on 1.26.51, is shown at the next tick with its 2 slots empty, and gets its items by inventory_slot', async () => {
      const { bot, server, driver, inventory, errors } = await horseBot(latestSupportedBedrockVersion)
      const { saddle } = bot.registry.itemsByName
      assert.ok(saddle !== undefined)
      openHorse(server, 2, 1002n)
      await driver.frame(0)
      const unshown = bot.currentWindow
      await driver.tick()
      const window = bot.currentWindow
      assert.ok(window !== null)
      const empty = [itemOf(window, 0), itemOf(window, 1)]
      inventory.slot(2, 0, { id: saddle.id, count: 1, stackId: 1421 })
      await driver.frame(0)
      assert.deepStrictEqual([unshown, shapeOf(window), empty, itemOf(window, 0), errors], [
        null, ['EntityHorse', 'Horse', 38, 2, 38, -1], [null, null], ['saddle', 1, 1421], []
      ])
      bot.end()
    })

    it('its close gives back the item the cursor holds, before container_close (not recorded: as a container\'s)', async () => {
      const { bot, internal, server, driver, inventory, errors } = await horseBot(latestSupportedBedrockVersion)
      const { saddle } = bot.registry.itemsByName
      assert.ok(saddle !== undefined)
      internal._core.requestIds.continueProcess(-433)
      openHorse(server, 3, 1003n)
      inventory.content(3, [{ id: saddle.id, count: 1, stackId: 1437 }, null])
      await driver.frame(0)
      const clicked = bot.clickWindow(0, 0, 0)
      await driver.tick()
      inventory.respond(-433, [{ container: 'horse_equip', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: 1437 }])
      await driver.tick()
      await clicked
      const window = bot.currentWindow
      assert.ok(window !== null)
      const closing = bot.closeWindow(window)
      await driver.ticks(2)
      inventory.respond(-435, [{ container: 'cursor', slot: 0, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: 1437 }])
      await driver.ticks(20)
      server.send('container_close', { window_id: 3, window_type: 'none', server: false })
      await driver.tick()
      await closing
      assert.deepStrictEqual([requests(server), server.sentOf('container_close'), bot.inventory.slots[36]?.name, bot.currentWindow, errors], [
        ['-433 take 1 horse_equip:0#1437 → cursor:0#0', '-435 place 1 cursor:0#1437 → hotbar_and_inventory:0#0'], [close(latestSupportedBedrockVersion, 3)], 'saddle', null, []
      ])
      bot.end()
    })
  })

  describe("openEntity sneaks for the use, as the vanilla client opens a tamed horse's screen (1.16.201: player_action)", () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: start_sneak before the next auth input, the use in the input pass after, stop_sneak once the screen is shown`, async () => {
        assert.deepStrictEqual(await openedSneaking(version), [
          ['player_action start_sneak', 'auth'], ['use', 'auth'], [], ['player_action stop_sneak', 'auth']
        ])
      })
    }
  })

  describe("openEntity sneaks for the use, as the vanilla client opens a tamed horse's screen (1.16.210 – 1.26.60: the auth input's flags)", () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.210', latestSupportedBedrockVersion)) {
      it(`bedrock ${version}: start_sneaking in the next auth input, the use in the input pass after, stop_sneaking once the screen is shown`, async () => {
        assert.deepStrictEqual(await openedSneaking(version), [
          ['auth start_sneaking'], ['use', 'auth'], [], ['auth stop_sneaking']
        ])
      })
    }
  })

  describe("the vanilla client's sneaking use of a horse holding a saddle (1.26.20, 1.26.51, 1.26.60)", () => {
    for (const recorded of SNEAKING_USES.filter(({ version }) => bedrockTestVersionsFrom(version, version).length > 0)) {
      it(`bedrock ${recorded.version}: the recorded bytes, but the click's y, from the camera settled lower`, async () => {
        const testBot = await standingBot(recorded.version, -60)
        const { bot, server, driver, errors } = testBot
        const horse = await showRidden(testBot, recorded.runtime, 'horse', -60)
        const opening = bot.openEntity(horse)
        await driver.ticks(2)
        const sent = server.sentOf('inventory_transaction').map(params => server.codec.serializer.createPacketBuffer({ name: 'inventory_transaction', params }).toString('hex'))
        openHorse(server, 7, -BigInt(recorded.runtime))
        testBot.inventory.content(7, [null, null])
        await driver.frame(0)
        await opening
        assert.deepStrictEqual([sent, errors], [[recorded.click.replace(recorded.y, SNEAKING_Y)], []])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    it('the player sneaking already: the use goes out in the next input pass, and the sneak stays held', async () => {
      const testBot = await standingBot(version, -60)
      const { bot, server, driver } = testBot
      const horse = await showRidden(testBot, 2, 'horse', -60)
      bot.setControlState('sneak', true)
      await driver.tick()
      const sent = sneaksAndUses(server)
      const opening = bot.openEntity(horse)
      await driver.tick()
      openHorse(server, 7, -2n)
      testBot.inventory.content(7, [null, null])
      await driver.frame(0)
      await opening
      await driver.tick()
      assert.deepStrictEqual([sent(), bot.getControlState('sneak')], [['use', 'auth', 'auth'], true])
      bot.end()
    })

    it('a donkey, a mule, a skeleton horse, a zombie horse, a llama and a trader llama: sneaks too; a villager: not', async () => {
      const kin = ['donkey', 'mule', 'skeleton_horse', 'zombie_horse', 'llama', 'trader_llama', 'villager_v2']
      const sneaked: Array<[string, string[]]> = []
      for (const [index, type] of kin.entries()) {
        const testBot = await standingBot(version, -60)
        const { bot, server, driver } = testBot
        const entity = await showRidden(testBot, 2 + index, type, -60)
        const sent = sneaksAndUses(server)
        const opening = bot.openEntity(entity)
        await driver.ticks(2)
        openHorse(server, 7, -BigInt(2 + index))
        testBot.inventory.content(7, [null, null])
        await driver.frame(0)
        await opening
        sneaked.push([type, sent()])
        bot.end()
      }
      const sneaking = ['auth start_sneaking', 'use', 'auth']
      assert.deepStrictEqual(sneaked, [
        ['donkey', sneaking], ['mule', sneaking], ['skeleton_horse', sneaking], ['zombie_horse', sneaking], ['llama', sneaking], ['trader_llama', sneaking], ['villager_v2', ['use', 'auth', 'auth']]
      ])
    })

    it("openContainer opens it sneaking too, and rejects it with Java's error: a horse's screen is not a container's", async () => {
      const testBot = await standingBot(version, -60)
      const { bot, server, driver } = testBot
      const horse = await showRidden(testBot, 2, 'horse', -60)
      const opening = assert.rejects(bot.openContainer(horse), { message: 'Non-container window used as a container: {"id":7,"type":"EntityHorse","title":"Horse"}' })
      await driver.ticks(2)
      openHorse(server, 7, -2n)
      testBot.inventory.content(7, [null, null])
      await driver.frame(0)
      await opening
      assert.deepStrictEqual([server.sentOf('inventory_transaction').length, bot.getControlState('sneak')], [1, false])
      bot.end()
    })

    it('rejects once 20 ticks went by without a sneak (physicsEnabled off), sending no use, the sneak released', async () => {
      const testBot = await standingBot(version, -60)
      const { bot, server, driver } = testBot
      const horse = await showRidden(testBot, 2, 'horse', -60)
      bot.physicsEnabled = false
      let settled = false
      const opening = assert.rejects(bot.openEntity(horse), { message: "the player did not sneak in 20 ticks, as a use opening the horse's screen does" }).finally(() => { settled = true })
      await driver.ticks(19)
      const early = settled
      await driver.tick()
      await opening
      assert.deepStrictEqual([early, server.sentOf('inventory_transaction'), bot.getControlState('sneak')], [false, [], false])
      bot.end()
    })
  })
})
