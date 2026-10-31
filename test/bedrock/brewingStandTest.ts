import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockBrewingStand, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The brewing stand as the vanilla client used it in reduced_brewing against Bedrock Dedicated Server: three potions
// put in, a blaze powder as fuel by a right click, the other as the ingredient, the brew, a brewed potion shift clicked
// out, the close. The bot loads the windows plugin and the stand's only.

const STAND_AT = Object.freeze({ x: 2, y: 12, z: 0 })
const TABLE_AT = Object.freeze({ x: -2, y: 12, z: 0 })
// the stand window's slots of the player's hotbar and inventory
const HOTBAR = 32
const INVENTORY = 5
const [BOTTLE, INGREDIENT, FUEL] = [0, 3, 4]
// recorded: a potion's metadata before and after the brew
const [AWKWARD, BREWED] = [4, 31]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

/** a slot as a request names it, without 1.21.20's dynamic id */
function refOf (info: SentSlot): SlotRef {
  const type = info.slot_type
  const container = info.container_id ?? (typeof type === 'object' ? type.container_id : type)
  const slot = info.slot ?? info.slot_id
  assert.ok(typeof container === 'string' && slot !== undefined)
  return { container, slot }
}

function nameOf (info: SentSlot): string {
  const { container, slot } = refOf(info)
  return `${container}:${slot}`
}

/** each request the bot sent since the last call, as the recorded ones are described: its id (`withIds`), its actions' types, counts and slots (with their stack ids) */
function requestsSince (server: FakeBedrockClient, withIds: boolean): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    const slot = (info: SentSlot): string => withIds ? `${nameOf(info)}#${info.stack_id}` : nameOf(info)
    return fresh.map(({ request_id: id, actions }) => [...withIds ? [id] : [], ...actions.map(({ type_id: type, count, source, destination }) =>
      [String(type), count, source === undefined ? undefined : slot(source), destination === undefined ? undefined : `→ ${slot(destination)}`].filter(part => part !== undefined).join(' '))].join(' '))
  }
}

interface StandBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  idOf: (name: string) => number
}

/** joined beside a brewing stand and a crafting table, with the windows plugin and the stand's */
async function standBot (version: BedrockVersion, screenAnimations = true): Promise<StandBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { screenAnimations, loadInternalPlugins: false, plugins: { windows: true, brewing_stand: true } })
  const blocks = [[STAND_AT.x, STAND_AT.y, STAND_AT.z, 'brewing_stand'], [TABLE_AT.x, TABLE_AT.y, TABLE_AT.z, 'crafting_table']] as const
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors, idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0 }
}

/** openBrewingStand on the stand, which the server opens with the properties `told` before, its 5 slots `items` in the next batch: shown at its opening */
async function openStand ({ bot, server, inventory, driver }: StandBot, id: number, told: ReadonlyArray<[number, number]>, items: ReadonlyArray<Given | null> = [null, null, null, null, null]): Promise<BedrockBrewingStand> {
  const block = bot.blockAt(new Vec3(STAND_AT.x, STAND_AT.y, STAND_AT.z))
  assert.ok(block !== null)
  let stand: BedrockBrewingStand | undefined
  const opening = bot.openBrewingStand(block).then(opened => { stand = opened })
  await driver.ticks(4)
  for (const [property, value] of told) inventory.setData(id, property, value)
  server.send('container_open', { window_id: id, window_type: 'brewing_stand', coordinates: STAND_AT, runtime_entity_id: -1n })
  await driver.tick()
  assert.strictEqual(bot.currentWindow?.type, 'minecraft:brewing_stand')
  inventory.content(id, items)
  await driver.runUntil(() => stand !== undefined, 10)
  await opening
  assert.ok(stand !== undefined)
  return stand
}

function described (item: Item | null): [string, number, number, number | null] | null {
  return item === null ? null : [item.name, item.count, item.metadata, item.stackId]
}

/** an item's name and count: the stack ids the members test's server gives are its own */
function counted (item: Item | null): [string, number] | null {
  return item === null ? null : [item.name, item.count]
}

/** the stand's state as its members tell it */
function stateOf (stand: BedrockBrewingStand): unknown[] {
  return [stand.brewTime, stand.fuel, stand.fuelTotal, stand.potionItems().map(described), described(stand.ingredientItem()), described(stand.fuelItem())]
}

/** recorded in reduced_brewing: the first request's id, the first potion's stack id; the stack ids after it go up by 2 a stack given, a stack the server made new taking the next */
interface Recorded {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  firstRequest: number
  stackId: number
  /** the frame, at the recorded rate (32 a second, 16 on 1.26.60), in which container_close leaves after closeWindow's */
  closeFrame: number
}

const RECORDED: readonly Recorded[] = [
  // recorded on 1.16.201.2
  { name: 'no close animation', from: 'bedrock_1.16.201', to: 'bedrock_1.21.111', firstRequest: -905, stackId: 620, closeFrame: 1 },
  // recorded on 1.26.51.1
  { name: 'the crafting table\'s close animation', from: 'bedrock_1.21.120', to: 'bedrock_1.26.51', firstRequest: -2253, stackId: 2134, closeFrame: 15 },
  // recorded on 1.26.60.5
  { name: 'the crafting table\'s close animation at 16 frames a second', from: 'bedrock_1.26.60', to: 'bedrock_1.26.60', firstRequest: -2419, stackId: 2266, closeFrame: 9 }
]

describe('bedrock brewing stand', () => {
  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: opens the stand with the properties sent before, makes the recorded clicks, tells the brew, and closes giving nothing back`, async () => {
          const standBotted = await standBot(version)
          const { bot, internal, server, driver, inventory, errors, idOf } = standBotted
          const { firstRequest: request, stackId: id } = recorded
          const [potion, splash, lingering, blaze] = [idOf('potion'), idOf('splash_potion'), idOf('lingering_potion'), idOf('blaze_powder')]
          internal._core.requestIds.continueProcess(request)
          inventory.slot('inventory', 0, { id: potion, count: 1, metadata: AWKWARD, stackId: id })
          inventory.slot('inventory', 1, { id: splash, count: 1, metadata: AWKWARD, stackId: id + 2 })
          inventory.slot('inventory', 2, { id: lingering, count: 1, metadata: AWKWARD, stackId: id + 4 })
          inventory.slot('inventory', 3, { id: blaze, count: 2, stackId: id + 6 })
          const opened: Window[] = []
          bot.on('windowOpen', window => { opened.push(window) })
          const stand = await openStand(standBotted, 2, [[0, 0], [1, 0], [2, 0]])
          assert.deepStrictEqual([opened, stand.id, stand.type, stand.title, stand.slots.length, stand.inventoryStart, stand.inventoryEnd, stateOf(stand)],
            [[stand], 2, 'minecraft:brewing_stand', 'Brewing Stand', 41, INVENTORY, 41, [0, 0, 0, [null, null, null], null, null]])
          let updates = 0
          stand.on('update', () => { updates++ })
          const requests = requestsSince(server, true)

          /** a click, then the server's answer, as recorded: its slots of the stand first, in the response's batch */
          async function click (slot: number, mouseButton: number, mode: number, answer: () => void): Promise<void> {
            const clicked = bot.clickWindow(slot, mouseButton, mode)
            await driver.tick()
            answer()
            await driver.tick()
            await clicked
          }
          /** the answer to the `n`th request, taking hotbar slot's stack to the cursor */
          function taken (n: number, hotbar: number, count: number, stackId: number): () => void {
            return () => { inventory.respond(request - 2 * n, [{ container: 'hotbar', slot: hotbar, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count, stackId }]) }
          }
          /** the answer to the `n`th request, placing the cursor's one item in the stand */
          function placed (n: number, container: 'brewing_result' | 'brewing_input', slot: number, given: Given): () => void {
            return () => {
              inventory.slot(2, slot, given)
              inventory.respond(request - 2 * n, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container, slot, count: 1, stackId: given.stackId ?? 0 }])
            }
          }
          await click(HOTBAR, 0, 0, taken(0, 0, 1, id))
          await click(BOTTLE, 0, 0, placed(1, 'brewing_result', 1, { id: potion, count: 1, metadata: AWKWARD, stackId: id }))
          await click(HOTBAR + 1, 0, 0, taken(2, 1, 1, id + 2))
          await click(BOTTLE + 1, 0, 0, placed(3, 'brewing_result', 2, { id: splash, count: 1, metadata: AWKWARD, stackId: id + 2 }))
          await click(HOTBAR + 2, 0, 0, taken(4, 2, 1, id + 4))
          await click(BOTTLE + 2, 0, 0, placed(5, 'brewing_result', 3, { id: lingering, count: 1, metadata: AWKWARD, stackId: id + 4 }))
          await click(HOTBAR + 3, 0, 0, taken(6, 3, 2, id + 6))
          // the server takes the powder put as fuel at once
          await click(FUEL, 1, 0, () => {
            inventory.slot(2, 4, { id: blaze, count: 1, stackId: id + 7 })
            inventory.respond(request - 14, [{ container: 'cursor', slot: 0, count: 1, stackId: id + 6 }, { container: 'brewing_fuel', slot: 4, count: 1, stackId: id + 7 }])
            inventory.slot(2, 4, null)
            inventory.setData(2, 1, 20)
            inventory.setData(2, 2, 20)
          })
          assert.deepStrictEqual([updates, stateOf(stand)], [2, [0, 20, 20, [['potion', 1, AWKWARD, id], ['splash_potion', 1, AWKWARD, id + 2], ['lingering_potion', 1, AWKWARD, id + 4]], null, null]])
          await click(INGREDIENT, 0, 0, placed(8, 'brewing_input', 0, { id: blaze, count: 1, stackId: id + 6 }))
          inventory.setData(2, 0, 400)
          await driver.tick()
          inventory.setData(2, 0, 399)
          await driver.tick()
          assert.deepStrictEqual([updates, stand.brewTime, described(stand.ingredientItem())], [4, 399, ['blaze_powder', 1, 0, id + 6]])
          // the brew's end, 400 ticks on
          for (const bottle of [1, 2, 3]) inventory.slot(2, bottle, { id: [potion, splash, lingering][bottle - 1] ?? 0, count: 1, metadata: BREWED, stackId: id + 7 + bottle })
          inventory.slot(2, 0, null)
          inventory.setData(2, 0, 0)
          inventory.setData(2, 1, 19)
          await driver.tick()
          assert.deepStrictEqual([updates, stateOf(stand)], [6, [0, 19, 20, [['potion', 1, BREWED, id + 8], ['splash_potion', 1, BREWED, id + 9], ['lingering_potion', 1, BREWED, id + 10]], null, null]])
          await click(BOTTLE, 0, 1, () => {
            inventory.slot(2, 1, null)
            inventory.respond(request - 18, [{ container: 'brewing_result', slot: 1, count: 0, stackId: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: id + 8 }])
          })
          assert.deepStrictEqual(requests(), [
            `${request} take 1 hotbar:0#${id} → cursor:0#0`,
            `${request - 2} place 1 cursor:0#${id} → brewing_result:1#0`,
            `${request - 4} take 1 hotbar:1#${id + 2} → cursor:0#0`,
            `${request - 6} place 1 cursor:0#${id + 2} → brewing_result:2#0`,
            `${request - 8} take 1 hotbar:2#${id + 4} → cursor:0#0`,
            `${request - 10} place 1 cursor:0#${id + 4} → brewing_result:3#0`,
            `${request - 12} take 2 hotbar:3#${id + 6} → cursor:0#0`,
            `${request - 14} place 1 cursor:0#${id + 6} → brewing_fuel:4#0`,
            `${request - 16} place 1 cursor:0#${id + 6} → brewing_input:0#0`,
            `${request - 18} place 1 brewing_result:1#${id + 8} → hotbar_and_inventory:0#0`
          ])

          const closed: Window[] = []
          bot.on('windowClose', window => { closed.push(window) })
          const closing = bot.closeWindow(stand)
          let frames = 0
          while (server.sentOf('container_close').length === 0 && frames < 20) {
            frames++
            await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
          }
          server.send('container_close', { window_id: 2, server: false })
          await driver.tick()
          await closing
          assert.deepStrictEqual([frames, requests(), closed, bot.currentWindow, described(bot.inventory.slots[36] ?? null), errors], [recorded.closeFrame, [], [stand], null, ['potion', 1, BREWED, id + 8], []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** ticks until `done` holds, the server taking each request as the bot predicts it (a stack made new gets a stack id of its own) */
    function servingBy ({ internal, server, driver, inventory }: StandBot): (done: () => boolean) => Promise<void> {
      let [answered, nextStackId] = [0, 500]
      return async done => {
        for (let tick = 0; tick < 300 && !done(); tick++) {
          await driver.tick()
          const requests = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
          for (const { request_id: id, actions } of requests.slice(answered)) {
            const slots = new Map(actions.flatMap(({ source, destination }) => [source, destination]).filter(info => info !== undefined).map(info => [nameOf(info), refOf(info)]))
            inventory.respond(id, [...slots.values()].map(ref => {
              const stack = internal._inventory.stackAt(ref)
              return { ...ref, count: stack?.count ?? 0, stackId: stack === undefined ? 0 : stack.stackId > 0 ? stack.stackId : nextStackId++ }
            }))
          }
          answered = requests.length
        }
      }
    }

    /** ticks until `operation` settles, served */
    function servedBy (testBot: StandBot): <Result>(operation: Promise<Result>) => Promise<Result> {
      const serve = servingBy(testBot)
      return async operation => {
        let done = false
        operation.then(() => { done = true }, () => { done = true })
        await serve(() => done)
        return await operation
      }
    }

    it('puts and takes with the stand\'s members, as Java\'s furnace\'s: transfers from the inventory part, putAway back', async () => {
      const standBotted = await standBot(version, false)
      const { bot, server, driver, inventory, errors, idOf } = standBotted
      const [serve, served] = [servingBy(standBotted), servedBy(standBotted)]
      const [potion, splash, blaze, wart] = [idOf('potion'), idOf('splash_potion'), idOf('blaze_powder'), idOf('nether_wart')]
      inventory.slot('inventory', 0, { id: potion, count: 1, stackId: 10 })
      inventory.slot('inventory', 1, { id: splash, count: 1, stackId: 11 })
      inventory.slot('inventory', 2, { id: blaze, count: 2, stackId: 12 })
      inventory.slot('inventory', 3, { id: wart, count: 3, stackId: 13 })
      const stand = await openStand(standBotted, 5, [])
      const requests = requestsSince(server, false)
      assert.deepStrictEqual(stateOf(stand), [null, null, null, [null, null, null], null, null])

      await served(stand.putPotion(0, potion, null))
      // a bottle holding one: Java's transfer rejects, the potion it took left on the cursor
      await assert.rejects(served(stand.putPotion(0, splash, 0)), { message: 'destination full' })
      await served(bot.simpleClick.leftMouse(HOTBAR + 1))
      await served(stand.putPotion(2, splash, 0))
      await served(stand.putFuel(blaze, null, 1))
      await served(stand.putIngredient(wart, null, 2))
      assert.deepStrictEqual(requests(), [
        'take 1 hotbar:0 → cursor:0', 'place 1 cursor:0 → brewing_result:1',
        'take 1 hotbar:1 → cursor:0', 'place 1 cursor:0 → hotbar:1',
        'take 1 hotbar:1 → cursor:0', 'place 1 cursor:0 → brewing_result:3',
        // one by a right click, the rest put back
        'take 2 hotbar:2 → cursor:0', 'place 1 cursor:0 → brewing_fuel:4', 'place 1 cursor:0 → inventory:9',
        'take 3 hotbar:3 → cursor:0', 'place 1 cursor:0 → brewing_input:0', 'place 1 cursor:0 → brewing_input:0', 'place 1 cursor:0 → inventory:10'
      ])
      assert.deepStrictEqual([stand.potionItems().map(counted), counted(stand.ingredientItem()), counted(stand.fuelItem())], [[['potion', 1], null, ['splash_potion', 1]], ['nether_wart', 2], ['blaze_powder', 1]])

      await assert.rejects(stand.takePotion(1), { message: 'takePotion: the brewing stand\'s slot 1 is empty' })
      await assert.rejects(stand.putPotion(3, potion, null), { message: 'putPotion: the brewing stand has the bottles 0, 1 and 2, not 3' })
      await assert.rejects(stand.takePotion(-1), { message: 'takePotion: the brewing stand has the bottles 0, 1 and 2, not -1' })
      const potions = await served(stand.takePotions())
      const ingredient = await served(stand.takeIngredient())
      const fuel = await served(stand.takeFuel())
      assert.deepStrictEqual([requests(), [...potions, ingredient, fuel].map(counted)], [
        // shift clicks: the potions to the first empty slots, the wart and the powder onto the stacks put back
        ['place 1 brewing_result:1 → hotbar_and_inventory:0', 'place 1 brewing_result:3 → hotbar_and_inventory:1', 'place 2 brewing_input:0 → hotbar_and_inventory:10', 'place 1 brewing_fuel:4 → hotbar_and_inventory:9'],
        [['potion', 1], ['splash_potion', 1], ['nether_wart', 2], ['blaze_powder', 1]]
      ])
      await served(stand.putPotion(1, potion, null))
      assert.deepStrictEqual(counted(await served(stand.takePotion(1))), ['potion', 1])
      requests()

      // the potion back on the cursor: the close gives it back, nothing of the stand's
      await served(bot.simpleClick.leftMouse(HOTBAR))
      const closing = stand.close()
      await serve(() => server.sentOf('container_close').length > 0)
      server.send('container_close', { window_id: 5, server: false })
      await driver.tick()
      await closing
      assert.deepStrictEqual(requests(), ['take 1 hotbar:0 → cursor:0', 'place 1 cursor:0 → hotbar_and_inventory:0'])
      await assert.rejects(stand.takeFuel(), { message: 'takeFuel needs the brewing stand open' })
      await assert.rejects(stand.putFuel(blaze, null, 1), { message: 'transfer needs the minecraft:brewing_stand window open' })
      assert.deepStrictEqual([requests(), errors], [[], []])
      bot.end()
    })

    it('rejects openBrewingStand on a block the server opens another screen for, which it closes', async () => {
      const { bot, server, driver, errors } = await standBot(version, false)
      const table = bot.blockAt(new Vec3(TABLE_AT.x, TABLE_AT.y, TABLE_AT.z))
      assert.ok(table !== null)
      const opening = assert.rejects(bot.openBrewingStand(table), { message: 'openBrewingStand: the crafting_table opened a minecraft:crafting_table window' })
      await driver.ticks(4)
      server.send('container_open', { window_id: 6, window_type: 'workbench', coordinates: TABLE_AT, runtime_entity_id: -1n })
      await driver.runUntil(() => server.sentOf('container_close').length > 0, 10)
      server.send('container_close', { window_id: 6, server: false })
      await driver.tick()
      await opening
      assert.deepStrictEqual([server.sentOf('container_close'), bot.currentWindow, errors], [[{ window_id: 6, window_type: 'none', server: false }], null, []])
      bot.end()
    })
  })
})
