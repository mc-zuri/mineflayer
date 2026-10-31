import assert from 'assert'
import type { Block } from 'prismarine-block'
import type { Window } from 'prismarine-windows'
import { Vec3 } from 'vec3'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The beacon as the vanilla client used it in reduced_stations against Bedrock Dedicated Server (station.beacon_screen):
// an iron ingot taken from the hotbar and put in the payment slot, an effect chosen, confirm, the close. The bot loads
// the windows plugin and the beacon's only.

interface At {
  readonly x: number
  readonly y: number
  readonly z: number
}

const BEACON_AT: At = Object.freeze({ x: 2, y: 12, z: 0 })
const TABLE_AT: At = Object.freeze({ x: -2, y: 12, z: 0 })
// the beacon window's slots: the payment, then the player's inventory and hotbar
const PAYMENT = 0
const INVENTORY = 1
const HOTBAR = 28

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentAction = SentRequest['actions'][number]
type SentSlot = NonNullable<SentAction['source']>

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

/** an action as the recorded ones are described: its type (`full`: and 1.26.40's legacy id), its effects, count and slots (`full`: with their stack ids) */
function actionOf (action: SentAction, full: boolean): string {
  const { type_id: type, primary_effect: primary, secondary_effect: secondary, count, source, destination } = action
  const legacy = 'legacy_type_id' in action ? action.legacy_type_id : undefined
  const slot = (info: SentSlot): string => full ? `${nameOf(info)}#${info.stack_id}` : nameOf(info)
  return [String(type), legacy === undefined || !full ? undefined : `L${legacy}`, primary === undefined ? undefined : `${primary}/${secondary}`, count,
    source === undefined ? undefined : slot(source), destination === undefined ? undefined : `→ ${slot(destination)}`].filter(part => part !== undefined).join(' ')
}

/** each request the bot sent since the last call: its id (`full`) and its actions */
function requestsSince (server: FakeBedrockClient, full: boolean): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => [...full ? [id] : [], ...actions.map(action => actionOf(action, full))].join(' '))
  }
}

interface BeaconBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  idOf: (name: string) => number
  blockOf: (at: At) => Block
}

/** joined beside a beacon and a crafting table, with the windows plugin and the beacon's */
async function beaconBot (version: BedrockVersion, screenAnimations = true): Promise<BeaconBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version), { screenAnimations, loadInternalPlugins: false, plugins: { windows: true, beacon: true } })
  const blocks = [[BEACON_AT.x, BEACON_AT.y, BEACON_AT.z, 'beacon'], [TABLE_AT.x, TABLE_AT.y, TABLE_AT.z, 'crafting_table']] as const
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const blockOf = ({ x, y, z }: At): Block => {
    const block = testBot.bot.blockAt(new Vec3(x, y, z))
    assert.ok(block !== null)
    return block
  }
  return { ...testBot, inventory: new ServerInventory(testBot.server), errors, idOf: name => testBot.bot.registry.itemsByName[name]?.id ?? 0, blockOf }
}

/** the server opens the beacon's screen (or the table's) once the bot used the block */
function opensOnUse ({ server }: BeaconBot, id: number, at: At = BEACON_AT): void {
  server.send('container_open', { window_id: id, window_type: at === BEACON_AT ? 'beacon' : 'workbench', coordinates: at, runtime_entity_id: -1n })
}

/** recorded in station.beacon_screen.beacon.speed: the window id, the first request's id, the ingot's stack id */
interface Recorded {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  windowId: number
  firstRequest: number
  stackId: number
  /** the frame, at the recorded rate (32 a second, 16 on 1.26.60), in which container_close leaves after closeWindow's */
  closeFrame: number
}

const RECORDED: readonly Recorded[] = [
  // recorded on 1.16.201.2
  { name: 'no close animation', from: 'bedrock_1.16.201', to: 'bedrock_1.21.111', windowId: 29, firstRequest: -4265, stackId: 3117, closeFrame: 1 },
  // recorded on 1.21.120.4
  { name: 'the crafting table\'s close animation', from: 'bedrock_1.21.120', to: 'bedrock_1.26.30', windowId: 31, firstRequest: -3681, stackId: 2863, closeFrame: 15 },
  // recorded on 1.26.51.1
  { name: 'the actions\' legacy ids', from: 'bedrock_1.26.40', to: 'bedrock_1.26.51', windowId: 31, firstRequest: -427, stackId: 154, closeFrame: 15 },
  // recorded on 1.26.60.5
  { name: 'the crafting table\'s close animation at 16 frames a second', from: 'bedrock_1.26.60', to: 'bedrock_1.26.60', windowId: 31, firstRequest: -3713, stackId: 2847, closeFrame: 9 }
]

describe('bedrock beacon', () => {
  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: shows the beacon, makes the recorded clicks, pays for speed in one request, and closes`, async () => {
          const testBot = await beaconBot(version)
          const { bot, internal, server, driver, inventory, errors, idOf, blockOf } = testBot
          const { windowId, firstRequest: request, stackId: id } = recorded
          const legacy = atLeast(version, 'bedrock_1.26.40')
          internal._core.requestIds.continueProcess(request)
          inventory.slot('inventory', 0, { id: idOf('iron_ingot'), count: 1, stackId: id })
          const opened: Window[] = []
          bot.on('windowOpen', window => { opened.push(window) })
          let beacon: Window | undefined
          const opening = bot.openBlock(blockOf(BEACON_AT)).then(window => { beacon = window })
          await driver.ticks(4)
          opensOnUse(testBot, windowId)
          await driver.runUntil(() => beacon !== undefined, 10)
          await opening
          assert.ok(beacon !== undefined)
          assert.deepStrictEqual([opened, beacon.id, beacon.type, beacon.title, beacon.slots.length, beacon.inventoryStart, beacon.inventoryEnd, beacon.craftingResultSlot, beacon.slots[HOTBAR]?.name],
            [[beacon], windowId, 'minecraft:beacon', 'Beacon', 37, INVENTORY, 37, -1, 'iron_ingot'])
          const requests = requestsSince(server, true)

          async function answered (made: Promise<void>, answer: () => void): Promise<void> {
            await driver.tick()
            answer()
            await driver.tick()
            await made
          }
          await answered(bot.clickWindow(HOTBAR, 0, 0), () => {
            inventory.respond(request, [{ container: 'hotbar', slot: 0, count: 0, stackId: 0 }, { container: 'cursor', slot: 0, count: 1, stackId: id }])
          })
          await answered(bot.clickWindow(PAYMENT, 0, 0), () => {
            inventory.respond(request - 2, [{ container: 'cursor', slot: 0, count: 0, stackId: 0 }, { container: 'beacon_payment', slot: 27, count: 1, stackId: id }])
          })
          assert.deepStrictEqual([beacon.slots[PAYMENT]?.name, beacon.slots[PAYMENT]?.stackId, beacon.selectedItem], ['iron_ingot', id, null])
          await answered(bot.setBeaconEffects('speed'), () => {
            inventory.respond(request - 4, [{ container: 'beacon_payment', slot: 27, count: 0, stackId: 0 }])
          })
          const [take, place, beaconPayment, destroy] = legacy ? [' L0', ' L1', ' L10', ' L4'] : ['', '', '', '']
          assert.deepStrictEqual(requests(), [
            `${request} take${take} 1 hotbar:0#${id} → cursor:0#0`,
            `${request - 2} place${place} 1 cursor:0#${id} → beacon_payment:27#0`,
            `${request - 4} beacon_payment${beaconPayment} 1/0 destroy${destroy} 1 beacon_payment:27#${id}`
          ])
          assert.deepStrictEqual(beacon.slots[PAYMENT], null)

          const closed: Window[] = []
          bot.on('windowClose', window => { closed.push(window) })
          const closing = bot.closeWindow(beacon)
          let frames = 0
          while (server.sentOf('container_close').length === 0 && frames < 20) {
            frames++
            await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
          }
          server.send('container_close', { window_id: windowId, server: false })
          await driver.tick()
          await closing
          const close = atLeast(version, 'bedrock_1.21.0') ? { window_id: windowId, window_type: 'none', server: false } : { window_id: windowId, server: false }
          assert.deepStrictEqual([frames, server.sentOf('container_close'), requests(), closed, bot.currentWindow, errors], [recorded.closeFrame, [close], [], [beacon], null, []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** ticks until `done` holds, the server taking each request as the bot predicts it (a stack made new gets a stack id of its own) and answering each close */
    function servingBy ({ internal, server, driver, inventory }: BeaconBot): (done: () => boolean) => Promise<void> {
      let [answered, closes, nextStackId] = [0, 0, 500]
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
          for (const { window_id: id } of server.sentOf('container_close').slice(closes)) server.send('container_close', { window_id: id, server: false })
          closes = server.sentOf('container_close').length
        }
      }
    }

    /** ticks until `operation` settles, served */
    function servedBy (testBot: BeaconBot): <Result>(operation: Promise<Result>) => Promise<Result> {
      const serve = servingBy(testBot)
      return async operation => {
        let done = false
        operation.then(() => { done = true }, () => { done = true })
        await serve(() => done)
        return await operation
      }
    }

    /** an operation that opens a block, whose screen the server opens once the bot used it, served */
    async function servedOpening<Result> (testBot: BeaconBot, operation: Promise<Result>, id: number, at: At = BEACON_AT): Promise<Result> {
      await testBot.driver.ticks(4)
      opensOnUse(testBot, id, at)
      return await servedBy(testBot)(operation)
    }

    it('opens the beacon given, puts the cheapest payment the inventory has, pays, and closes it; with the beacon open, keeps it open', async () => {
      const testBot = await beaconBot(version, false)
      const { bot, server, inventory, errors, idOf, blockOf } = testBot
      const served = servedBy(testBot)
      inventory.slot('inventory', 0, { id: idOf('diamond'), count: 2, stackId: 10 })
      inventory.slot('inventory', 1, { id: idOf('gold_ingot'), count: 1, stackId: 11 })
      inventory.slot('inventory', 2, { id: idOf('iron_ingot'), count: 3, stackId: 12 })
      const requests = requestsSince(server, false)
      await servedOpening(testBot, bot.setBeaconEffects('jump_boost', null, blockOf(BEACON_AT)), 3)
      assert.deepStrictEqual([requests(), server.sentOf('container_close').length, bot.currentWindow], [
        ['take 3 hotbar:2 → cursor:0', 'place 1 cursor:0 → beacon_payment:27', 'place 2 cursor:0 → inventory:9', 'beacon_payment 8/0 destroy 1 beacon_payment:27'],
        1, null
      ])

      const beacon = await servedOpening(testBot, bot.openBlock(blockOf(BEACON_AT)), 4)
      await served(bot.setBeaconEffects('haste', undefined, blockOf(TABLE_AT)))
      await served(bot.setBeaconEffects('resistance'))
      await served(bot.setBeaconEffects('strength'))
      assert.deepStrictEqual([requests(), bot.currentWindow, beacon.slots.slice(INVENTORY, INVENTORY + 1).map(item => item?.count)], [[
        'take 2 inventory:9 → cursor:0', 'place 1 cursor:0 → beacon_payment:27', 'place 1 cursor:0 → inventory:9', 'beacon_payment 3/0 destroy 1 beacon_payment:27',
        'take 1 inventory:9 → cursor:0', 'place 1 cursor:0 → beacon_payment:27', 'beacon_payment 11/0 destroy 1 beacon_payment:27',
        'take 1 hotbar:1 → cursor:0', 'place 1 cursor:0 → beacon_payment:27', 'beacon_payment 5/0 destroy 1 beacon_payment:27'
      ], beacon, [undefined]])

      // with a payment in its slot, the beacon pays with it, which needs not be the cheapest
      await served(bot.simpleClick.leftMouse(HOTBAR))
      await served(bot.simpleClick.rightMouse(PAYMENT))
      await served(bot.setBeaconEffects('speed'))
      assert.deepStrictEqual([requests(), errors], [[
        'take 2 hotbar:0 → cursor:0', 'place 1 cursor:0 → beacon_payment:27', 'beacon_payment 1/0 destroy 1 beacon_payment:27'
      ], []])
      bot.end()
    })

    it('rejects an effect it does not know, a secondary effect, a payment slot holding no payment, and an inventory with none, sending nothing', async () => {
      const testBot = await beaconBot(version, false)
      const { bot, server, inventory, errors, idOf, blockOf } = testBot
      const served = servedBy(testBot)
      inventory.slot('inventory', 0, { id: idOf('stone'), count: 1, stackId: 10 })
      const requests = requestsSince(server, false)
      await assert.rejects(bot.setBeaconEffects('regeneration'), { message: 'setBeaconEffects: no primary effect is named regeneration (speed, haste, resistance, jump_boost, strength)' })
      await assert.rejects(bot.setBeaconEffects('toString'), { message: 'setBeaconEffects: no primary effect is named toString (speed, haste, resistance, jump_boost, strength)' })
      await assert.rejects(bot.setBeaconEffects('speed', 'regeneration'), { message: 'setBeaconEffects: a secondary effect is not supported on Bedrock, which no recording chose' })
      await assert.rejects(bot.setBeaconEffects('speed'), { message: 'setBeaconEffects needs a beacon open, or one given' })
      const beacon = await servedOpening(testBot, bot.openBlock(blockOf(BEACON_AT)), 3)
      await assert.rejects(served(bot.setBeaconEffects('speed')), { message: 'setBeaconEffects: the inventory has nothing to pay with (iron_ingot, gold_ingot, emerald, diamond, netherite_ingot)' })
      await served(bot.moveSlotItem(HOTBAR, PAYMENT))
      requests()
      await assert.rejects(served(bot.setBeaconEffects('speed')), { message: 'setBeaconEffects: the beacon\'s payment slot holds stone, which pays for no effect' })
      assert.deepStrictEqual([requests(), bot.currentWindow, errors], [[], beacon, []])
      bot.end()
    })

    it('shows the ui container\'s slot 27 as the payment, and gives back the cursor, then the payment, at its close', async () => {
      const testBot = await beaconBot(version, false)
      const { bot, server, driver, inventory, idOf, blockOf } = testBot
      const served = servedBy(testBot)
      inventory.slot('inventory', 0, { id: idOf('iron_ingot'), count: 1, stackId: 10 })
      const beacon = await servedOpening(testBot, bot.openBlock(blockOf(BEACON_AT)), 3)
      // as the scripted server of containers_beacon filled it
      inventory.slot('ui', 27, { id: idOf('iron_ingot'), count: 1, stackId: 20 })
      await driver.tick()
      assert.deepStrictEqual([beacon.slots[PAYMENT]?.name, beacon.slots[PAYMENT]?.stackId], ['iron_ingot', 20])
      await served(bot.simpleClick.leftMouse(HOTBAR))
      const requests = requestsSince(server, false)
      await served(bot.closeWindow(beacon))
      assert.deepStrictEqual([requests(), bot.currentWindow], [['place 1 cursor:0 → hotbar_and_inventory:0', 'place 1 beacon_payment:27 → hotbar_and_inventory:0'], null])
      bot.end()
    })

    it('rejects a beacon given over another window, and a block the server opens another screen for, closing that one; and closes the beacon it opened when it cannot pay', async () => {
      const testBot = await beaconBot(version, false)
      const { bot, server, errors, blockOf } = testBot
      const served = servedBy(testBot)
      const requests = requestsSince(server, false)
      await assert.rejects(servedOpening(testBot, bot.setBeaconEffects('speed', null, blockOf(TABLE_AT)), 3, TABLE_AT), { message: 'setBeaconEffects: the crafting_table opened a minecraft:crafting_table window' })
      assert.deepStrictEqual([server.sentOf('container_close').map(({ window_id: id }) => id), bot.currentWindow], [[3], null])
      const table = await servedOpening(testBot, bot.openBlock(blockOf(TABLE_AT)), 4, TABLE_AT)
      await assert.rejects(bot.setBeaconEffects('speed', null, blockOf(BEACON_AT)), { message: 'setBeaconEffects cannot open the beacon over the minecraft:crafting_table window' })
      await served(bot.closeWindow(table))
      await assert.rejects(servedOpening(testBot, bot.setBeaconEffects('speed', null, blockOf(BEACON_AT)), 5), { message: 'setBeaconEffects: the inventory has nothing to pay with (iron_ingot, gold_ingot, emerald, diamond, netherite_ingot)' })
      assert.deepStrictEqual([server.sentOf('container_close').map(({ window_id: id }) => id), bot.currentWindow, requests(), errors], [[3, 4, 5], null, [], []])
      bot.end()
    })
  })
})
