import assert from 'assert'
import type { Compound, List, NBT, TagType } from 'prismarine-nbt'
import type { Window } from 'prismarine-windows'
import type { ScreenOpening } from '../../lib/bedrock/modules/screens.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersions } from './common/server.ts'
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
})
