const assert = require('assert')
const { Vec3 } = require('vec3')
const { once, sleep, createDoneTask, createTask, withTimeout } = require('../promise_utils')
const { toNotchianYaw, toNotchianPitch } = require('../conversions')

module.exports = inject

// ms to wait before clicking on a tool so the server can send the new
// damage information
const DIG_CLICK_TIMEOUT = 500
// The number of milliseconds to wait for the server to respond with consume completion.
// This number is larger than the eat time of 1.61 seconds to account for latency and low tps.
// The eat time comes from https://minecraft.wiki/w/Food#Usage
const CONSUME_TIMEOUT = 2500
// milliseconds to wait for the server to respond to a window click transaction
const WINDOW_TIMEOUT = 5000

const ALWAYS_CONSUMABLES = [
  'potion',
  'milk_bucket',
  'enchanted_golden_apple',
  'golden_apple'
]

// Items the client goes on using once used (Item.getUseDuration > 0), by vanilla's Item.use. Drinks always start;
// food when the player can eat it; the others by the checks in startsUsing.
const DRINKS = new Set(['potion', 'milk_bucket', 'honey_bottle', 'ominous_bottle'])
// FoodProperties.canAlwaysEat, from the version each became so
const ALWAYS_EDIBLE = { golden_apple: '1.8', enchanted_golden_apple: '1.8', chorus_fruit: '1.9', suspicious_stew: '1.17' }
const ARROWS = new Set(['arrow', 'spectral_arrow', 'tipped_arrow'])
const SPEAR = /^(wooden|stone|copper|iron|golden|diamond|netherite)_spear$/
// What a food or drink used up leaves in the hand (BowlFoodItem, HoneyBottleItem, MilkBucketItem, PotionItem; from
// 1.21.2 their use_remainder and consumable components)
const USE_REMAINDER = {
  mushroom_stew: 'bowl',
  rabbit_stew: 'bowl',
  beetroot_soup: 'bowl',
  suspicious_stew: 'bowl',
  honey_bottle: 'glass_bottle',
  milk_bucket: 'bucket',
  potion: 'glass_bottle'
}
// What a right click comes to on the client (InteractionResult), which decides the swing: ../useResult
const { createUsePrediction } = require('../useResult')

function inject (bot, { hideErrors }) {
  const Item = require('prismarine-item')(bot.registry)
  const Block = require('prismarine-block')(bot.registry)
  // ServerboundContainerClickPacket: since 1.21.5 the slots are HashedStack, an empty one absent (HashedStack.EMPTY),
  // not an item of count 0
  const hashedClickSlots = bot.registry.version['>=']('1.21.5')
  const componentHash = require('../component_hash')(bot.registry)
  // 1.21.5+: a click's stacks go as HashedStack, each added component as the hash of its value (HashedPatchMap)
  const clickItem = item => {
    if (!hashedClickSlots) return Item.toNotch(item)
    if (item == null || item.count === 0) return undefined
    const notch = Item.toNotch(item)
    return {
      ...notch,
      components: (notch.components ?? []).map(component => ({ type: component.type, hash: component.hash ?? componentHash(component) ?? 0 })),
      removeComponents: (notch.removeComponents ?? []).map(({ type }) => ({ type }))
    }
  }
  const windows = require('prismarine-windows')(bot.version)
  const simulateInventoryClick = require('../inventory_simulator')(Item, bot.registry)

  let eatingTask = createDoneTask()
  let sequence = 0
  bot._nextInteractionSequence = () => ++sequence

  let stateId = -1
  if (bot.supportFeature('stateIdUsed')) {
    const listener = packet => {
      stateId = packet.stateId
      bot._stateId = stateId
    }
    bot._client.on('window_items', listener)
    bot._client.on('set_slot', listener)
  }
  const windowClickQueue = []
  let windowItems

  // 0-8, null = uninitialized
  // which quick bar slot is selected
  bot.quickBarSlot = null
  bot.inventory = windows.createWindow(0, 'minecraft:inventory', 'Inventory')
  bot.currentWindow = null
  bot.usingHeldItem = false

  Object.defineProperty(bot, 'heldItem', {
    get: function () {
      return bot.inventory.slots[bot.QUICK_BAR_START + bot.quickBarSlot]
    }
  })

  bot.on('spawn', () => {
    Object.defineProperty(bot.entity, 'equipment', {
      get: bot.supportFeature('doesntHaveOffHandSlot')
        ? function () {
          return [bot.heldItem, bot.inventory.slots[8], bot.inventory.slots[7],
            bot.inventory.slots[6], bot.inventory.slots[5]]
        }
        : function () {
          return [bot.heldItem, bot.inventory.slots[45], bot.inventory.slots[8],
            bot.inventory.slots[7], bot.inventory.slots[6], bot.inventory.slots[5]]
        }
    })
  })

  // the slot of the hand whose item is in use (LivingEntity.getUsedItemHand)
  let usedSlot = null
  // The use effects of the item in use (1.21.11 UseEffects, DataComponents.USE_EFFECTS): whether a sprint goes on and
  // the factor of the move input, which the physics reads; null for UseEffects.DEFAULT (no sprint, 0.2F). A spear's
  // let the player sprint at full speed (Item.Properties.spear: UseEffects(true, false, 1.0F)).
  bot.usingItemEffects = null
  function useEffectsOf (item) {
    const component = item?.componentMap?.get?.('use_effects')?.data
    if (component) return { canSprint: !!(component.canSprint ?? component.can_sprint), speedMultiplier: component.speedMultiplier ?? component.speed_multiplier ?? 0.2 }
    if (SPEAR.test(item?.name ?? '') && bot.registry.version['>=']('1.21.11')) return { canSprint: true, speedMultiplier: 1 }
    return null
  }
  function startUsing (slot) {
    bot.usingHeldItem = true
    usedSlot = slot
    bot.usingItemEffects = useEffectsOf(bot.inventory.slots[slot])
  }
  // The server says the use is complete (Player.handleEntityEvent 9: LivingEntity.completeUsingItem): the client
  // finishes the item itself (Item.finishUsingItem): a food or drink is used up, but in creative, and what it leaves
  // (a bowl, a bottle, a bucket) takes its place in the hand at once
  function completeUsingItem () {
    const item = usedSlot != null ? bot.inventory.slots[usedSlot] : null
    if (!bot.usingHeldItem || !item || bot.game.gameMode === 'creative') return
    if (!DRINKS.has(item.name) && !bot.registry.foodsByName[item.name]) return
    let rest = null
    if (item.count > 1) {
      rest = Item.fromNotch(Item.toNotch(item))
      rest.count = item.count - 1
    } else if (bot.registry.itemsByName[USE_REMAINDER[item.name]]) {
      rest = new Item(bot.registry.itemsByName[USE_REMAINDER[item.name]].id, 1)
    }
    bot.inventory.updateSlot(usedSlot, rest)
  }

  // Before 1.17 the item in use is the very stack in the hand (EntityLivingBase.updateActiveHand: itemstack ==
  // activeItemStack): a stack the server puts in its slot, the same one too, ends the use at the player's next tick
  let usedStackReplaced = false
  bot._client.on('set_slot', (packet) => {
    if (bot.usingHeldItem && packet.windowId === 0 && packet.slot === usedSlot && !bot.registry.version['>=']('1.17')) usedStackReplaced = true
  })
  bot.on('physicsTickBegin', () => {
    if (usedStackReplaced && bot.usingHeldItem) bot.usingHeldItem = false
    usedStackReplaced = false
  })

  // The server's living entity flags of the player (LivingEntity.DATA_LIVING_ENTITY_FLAGS: bit 1 an item in use, bit 2
  // in the off hand) start or stop its use on the client too (LocalPlayer.onSyncedDataUpdated, from 1.11
  // EntityPlayerSP.notifyDataManagerChange; 1.9 and 1.10 do not start a use on the server's flag): at the
  // version's index (named from 1.19.4; after the entity's data: 6 to 1.13, 7 to 1.16, 8 since)
  const livingFlagsIndex = (() => {
    const named = bot.registry.entitiesByName.player?.metadataKeys?.indexOf('living_entity_flags') ?? -1
    if (named >= 0) return named
    const v = bot.registry.version
    if (!v['>=']('1.11')) return -1
    return !v['>=']('1.14') ? 6 : !v['>=']('1.17') ? 7 : 8
  })()
  bot._client.on('entity_metadata', (packet) => {
    if (livingFlagsIndex < 0 || !bot.entity || packet.entityId !== bot.entity.id) return
    const flags = packet.metadata?.find(entry => entry.key === livingFlagsIndex)?.value
    if (typeof flags !== 'number') return
    const using = (flags & 1) !== 0
    const slot = (flags & 2) !== 0 ? 45 : bot.QUICK_BAR_START + bot.quickBarSlot
    // (LocalPlayer.startUsingItem: not with an empty hand)
    if (using && !bot.usingHeldItem && bot.inventory.slots[slot]) {
      startUsing(slot)
    } else if (!using && bot.usingHeldItem) {
      bot.usingHeldItem = false
    }
  })

  bot._client.on('entity_status', (packet) => {
    if (packet.entityId === bot.entity.id && packet.entityStatus === 9) {
      completeUsingItem()
      if (!eatingTask.done) eatingTask.finish()
    }
    bot.usingHeldItem = false
  })

  let previousHeldItem = null
  bot.on('heldItemChanged', (heldItem) => {
    // we only disable the item if the item type or count changes
    const same = heldItem?.type === previousHeldItem?.type && heldItem?.count === previousHeldItem?.count
    previousHeldItem = heldItem
    if (same) return
    if (!eatingTask.done) {
      eatingTask.finish()
    }
    bot.usingHeldItem = false
  })

  // the items on cooldown (ItemCooldowns): the item (before 1.21.4 its id, since its cooldown group), and until when
  bot._itemCooldowns = {}
  const predictUse = createUsePrediction(bot)
  bot._predictUse = predictUse
  bot._client.on('set_cooldown', (packet) => {
    const group = packet.cooldownGroup != null ? String(packet.cooldownGroup).replace(/^minecraft:/, '') : bot.registry.items[packet.itemID]?.name
    if (group) bot._itemCooldowns[group] = performance.now() + (packet.cooldownTicks ?? 0) * 50
  })
  // (a cooldown does not stop the item in use: ClientPacketListener.handleItemCooldown only adds it, a goat horn's
  // during its use; the use goes on until released)
  bot._client.on('set_cooldown', (packet) => {
    if (bot.heldItem && bot.heldItem.type !== packet.itemID) return
    if (!eatingTask.done) {
      eatingTask.finish()
    }
  })

  async function consume () {
    if (!eatingTask.done) {
      eatingTask.cancel(new Error('Consuming cancelled due to calling bot.consume() again'))
    }

    if (bot.game.gameMode !== 'creative' && !ALWAYS_CONSUMABLES.includes(bot.heldItem.name) && bot.food === 20) {
      throw new Error('Food is full')
    }

    eatingTask = createTask()

    activateItem()

    await withTimeout(eatingTask.promise, CONSUME_TIMEOUT)
  }

  // Item.use as the client runs it: whether using the item starts using it (LivingEntity.startUsingItem), which keeps
  // the player slowed until it is released or done; an instant use (a snowball, a rod) or a failed one does not
  function startsUsing (item) {
    if (!item) return false
    const version = bot.registry.version
    const name = item.name
    // (Abilities.invulnerable: creative and spectator, or as the server's abilities give it)
    const invulnerable = bot.game.gameMode === 'creative' || bot.game.gameMode === 'spectator' || !!bot.entity?.isInvulnerable
    if (DRINKS.has(name)) return true
    // (26.3 gives the buckets of fish food, but nothing to consume them by: a bucket's use, MobBucketItem)
    if (/_bucket$/.test(name)) return false
    if (bot.registry.foodsByName[name]) {
      // Player.canEat: before 1.15 never while invulnerable, since always then
      const hungry = (ALWAYS_EDIBLE[name] != null && bot.registry.version['>='](ALWAYS_EDIBLE[name])) || bot.food < 20
      return version['>=']('1.15') ? invulnerable || hungry : !invulnerable && hungry
    }
    // Player.getProjectile: the arrows (and for a crossbow a firework rocket in hand) a bow or crossbow shoots, any in
    // creative (Abilities.instabuild: hasInfiniteMaterials; ItemBow.onItemRightClick's isCreativeMode before 1.14), not
    // for an invulnerable player
    const instabuild = bot.game.gameMode === 'creative' || !!bot.entity?.canInstantlyBuild
    const hasAmmo = (fireworks) => instabuild || bot.inventory.slots.some(slot =>
      slot && (ARROWS.has(slot.name) || (fireworks && /^firework_rocket$|^fireworks$/.test(slot.name) &&
        (slot === bot.heldItem || slot.slot === 45))))
    // 1.21.11's spears (Item.Properties.spear: a KineticWeapon, used while held)
    if (SPEAR.test(name) && version['>=']('1.21.11')) return true
    switch (name) {
      case 'shield':
      case 'spyglass':
      case 'goat_horn':
        return true
      case 'bow':
        return hasAmmo(false)
      case 'crossbow': {
        // a charged crossbow shoots at once
        const charged = item.componentMap?.get('charged_projectiles')?.data?.projectiles?.length > 0 ||
          !!item.nbt?.value?.Charged?.value
        return !charged && hasAmmo(true)
      }
      case 'trident': {
        // not when the next use would break it (a trident lasts 250 uses; minecraft-data's 1.20.6 says 1), and with
        // riptide only in water or rain
        if ((item.durabilityUsed ?? 0) >= 250 - 1) return false
        const riptide = (Array.isArray(item.enchants) ? item.enchants : []).some(e => /riptide$/.test(e.name))
        return !riptide || !!bot.entity.isInWater || bot.isRaining
      }
    }
    // 1.8 swords block (ItemSword.onItemRightClick)
    return version['<']('1.9') && name.endsWith('_sword')
  }

  // What a use of the item in a hand in the air comes to on the client (InteractionResult: 'success', 'consume',
  // 'fail', 'pass'...), which it returns: a Success ends Minecraft.startUseItem, anything else goes on to the off hand
  function activateItem (offHand = false) {
    // a spectator uses no item: nothing is sent (MultiPlayerGameMode.useItem)
    if (bot.game.gameMode === 'spectator') return 'pass'
    bot._ensureHasSentCarriedItem()
    const item = offHand ? bot.inventory.slots[45] : bot.heldItem
    let result = predictUse.useItem(offHand)
    // (an item on cooldown is not used: MultiPlayerGameMode.useItem)
    bot.usingHeldItem = startsUsing(item) && !predictUse.onCooldown(item)
    if (bot.usingHeldItem) startUsing(offHand ? 45 : bot.QUICK_BAR_START + bot.quickBarSlot)
    // (an item the player goes on using: LivingEntity.startUsingItem, InteractionResult.CONSUME)
    if (bot.usingHeldItem && (result === 'pass' || result === 'fail')) result = 'consume'

    // 1.17 - 1.20.6 MultiPlayerGameMode.useItem first sends the player's position and look as they are (without
    // touching what the player's own movement packets last sent)
    if (bot.registry.version['>=']('1.17') && bot.registry.version['<']('1.21')) {
      const { position, onGround } = bot.entity
      bot._client.write('position_look', {
        x: position.x,
        y: position.y,
        z: position.z,
        yaw: bot.entity.yawDegrees?.valueOf() ?? Math.fround(toNotchianYaw(bot.entity.yaw)),
        // (a level look is a pitch of 0, never -0)
        pitch: bot.entity.pitchDegrees?.valueOf() ?? Math.fround(toNotchianPitch(bot.entity.pitch)) + 0,
        onGround
      })
    }

    if (bot.supportFeature('useItemWithBlockPlace')) {
      // (the position C08PacketPlayerBlockPlacement gives a use of the item: -1, -1, -1)
      bot._client.write('block_place', {
        location: new Vec3(-1, -1, -1),
        direction: -1,
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: 0,
        cursorY: 0,
        cursorZ: 0
      })
    } else if (bot.supportFeature('useItemWithOwnPacket')) {
      bot._client.write('use_item', {
        hand: offHand ? 1 : 0,
        sequence: bot._nextInteractionSequence(),
        // the player's rotation as it holds it (Player.getYRot / getXRot): the float degrees the movement packets send,
        // whole turns and the sign of a level look kept
        rotation: {
          x: bot.entity.yawDegrees?.valueOf() ?? toNotchianYaw(bot.entity.yaw),
          y: bot.entity.pitchDegrees?.valueOf() ?? toNotchianPitch(bot.entity.pitch)
        }
      })
    }
    // 1.15 - 26.2: the arm swings after a use the client predicts succeeds (26.3 sends no swing for a use); before
    // 1.15 only a fishing rod swings it, from the item's own use (ItemFishingRod.onItemRightClick)
    const swings = bot.registry.version['>=']('1.15') ? result === 'success' : item?.name === 'fishing_rod'
    if (swings && !bot.registry.version['>=']('26.3')) bot.swingArm(offHand ? 'left' : 'right', bot.registry.version['>=']('1.9'))
    return result
  }

  function deactivateItem () {
    bot._ensureHasSentCarriedItem()
    // MultiPlayerGameMode.releaseUsingItem: RELEASE_USE_ITEM at the origin, facing down, on every version (6 from 26.3,
    // which put CHANGE_DESTROY_DIRECTION at 1 of ServerboundPlayerActionPacket.Action)
    const body = {
      status: bot.registry.version['>=']('26.3') ? 6 : 5,
      location: new Vec3(0, 0, 0),
      face: 0
    }

    if (bot.supportFeature('useItemWithOwnPacket')) {
      body.sequence = 0
    }

    bot._client.write('block_dig', body)

    bot.usingHeldItem = false
  }

  // ServerboundPlayerActionPacket's actions about the hands (26.3 put CHANGE_DESTROY_DIRECTION before them)
  function writeHandAction (status) {
    const body = { status: status + (bot.registry.version['>=']('26.3') ? 1 : 0), location: new Vec3(0, 0, 0), face: 0 }
    if (bot.supportFeature('useItemWithOwnPacket')) body.sequence = 0
    bot._client.write('block_dig', body)
  }

  // The drop key (MultiPlayerGameMode.dropItem): one of the held item, or the whole stack, is dropped from the hand;
  // the client takes it out of the slot at once and, from 1.15 to 26.2, sends the swing that goes with it
  function dropHeldItem (all = false) {
    const slot = bot.QUICK_BAR_START + bot.quickBarSlot
    const item = bot.inventory.slots[slot]
    if (item) {
      const left = all ? 0 : item.count - 1
      let rest = null
      if (left > 0) {
        rest = Item.fromNotch(Item.toNotch(item))
        rest.count = left
      }
      bot.inventory.updateSlot(slot, rest)
      updateHeldItem()
    }
    bot._ensureHasSentCarriedItem()
    writeHandAction(all ? 3 : 4)
    if (item && bot.registry.version['>=']('1.15') && !bot.registry.version['>=']('26.3')) bot.swingArm()
  }

  // The swap-hands key: the server swaps the main and off hand items (SWAP_ITEM_WITH_OFFHAND, 1.9+)
  function swapHands () {
    writeHandAction(6)
  }

  async function putSelectedItemRange (start, end, window, slot) {
    // put the selected item back indow the slot range in window

    // try to put it in an item that already exists and just increase
    // the count.

    while (window.selectedItem) {
      const item = window.findItemRange(start, end, window.selectedItem.type, window.selectedItem.metadata, true, window.selectedItem.nbt)

      if (item && item.stackSize !== item.count) { // something to join with
        await clickWindow(item.slot, 0, 0)
      } else { // nothing to join with
        const emptySlot = window.firstEmptySlotRange(start, end)
        if (emptySlot === null) { // no room left
          if (slot === null) { // no room => drop it
            await tossLeftover()
          } else { // if there is still some leftover and slot is not null, click slot
            await clickWindow(slot, 0, 0)
            await tossLeftover()
          }
        } else {
          await clickWindow(emptySlot, 0, 0)
        }
      }
    }

    async function tossLeftover () {
      if (window.selectedItem) {
        await clickWindow(-999, 0, 0)
      }
    }
  }

  // Vanilla's client puts the block it places into its world at once (BlockItem.place under the block interaction's
  // prediction, BlockStatePredictionHandler) and takes it out of the stack; the server's block change confirms or puts
  // back what is there. Predicted here for a whole block that needs no facing (its default state a full cube), when the
  // client places it (the use's predicted outcome: ../useResult).
  function predictPlacement (place, offHand, sequence) {
    if (!place || bot.game.gameMode === 'spectator' || bot.game.gameMode === 'adventure') return
    const handSlot = offHand ? 45 : bot.QUICK_BAR_START + bot.quickBarSlot
    const item = bot.inventory.slots[handSlot]
    const placed = item && bot.registry.blocksByName[item.name]
    if (!placed || placed !== place.block || placed.defaultState == null) return
    let stateId = placed.defaultState
    const state = Block.fromStateId(stateId, 0)
    if (/torch$/.test(placed.name) && bot.registry.version['>=']('1.13')) {
      // a torch stands on a floor, or hangs on the wall it was put against, facing away from it (WallTorchBlock)
      const facing = ['down', 'up', 'north', 'south', 'west', 'east'][place.face]
      if (facing === 'down') return
      if (facing !== 'up') {
        const wall = bot.registry.blocksByName[placed.name.replace(/torch$/, 'wall_torch')]
        if (!wall) return
        stateId = Block.fromProperties(wall.name, { facing }).stateId
      }
    } else if (state.shapes.length !== 1 || state.shapes[0].join() !== '0,0,0,1,1,1') return
    // (from 1.19 a prediction until the server acknowledges the use's sequence: BlockStatePredictionHandler)
    if (bot._predictBlockState) bot._predictBlockState(place.position, stateId, sequence)
    else bot._updateBlockState(place.position, stateId)
    if (bot.game.gameMode !== 'creative') {
      let rest = null
      if (item.count > 1) {
        rest = Item.fromNotch(Item.toNotch(item))
        rest.count = item.count - 1
      }
      bot.inventory.updateSlot(handSlot, rest)
      updateHeldItem()
    }
  }

  // A slice of cake eaten, as the client's world has it at once (CakeBlock.eat, BlockCake.eatCake: the client eats it
  // too): one bite more, the last one leaves air; a candle cake is a cake with one bite (its candle dropped).
  function predictBite (block) {
    const registry = bot.registry
    const legacy = !registry.version['>=']('1.13')
    const bites = /candle_cake$/.test(block.name) ? 0 : Number(block.getProperties().bites ?? 0)
    // (air is state 0 in every version)
    let stateId = 0
    if (bites < 6) stateId = legacy ? (registry.blocksByName.cake.id << 4) | (bites + 1) : Block.fromProperties('cake', { bites: bites + 1 }).stateId
    bot._updateBlockState(block.position, stateId)
  }

  // offHand: the off hand's use on the block (vanilla tries it when the main hand's passes, Minecraft.startUseItem).
  // Returns what the client predicts the use comes to (InteractionResult: 'success', 'success_server', 'consume', 'fail'
  // or 'pass'): a 'pass' goes on to the item's own use, then to the off hand.
  async function activateBlock (block, direction, cursorPos, offHand = false) {
    direction = direction ?? new Vec3(0, 1, 0)
    const directionNum = vectorToDirection(direction) // The packet needs a number as the direction
    cursorPos = cursorPos ?? new Vec3(0.5, 0.5, 0.5)
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), false)
    bot._ensureHasSentCarriedItem()
    // a block outside the world border is not used: nothing is sent, a FAIL (MultiPlayerGameMode.useItemOn)
    if (bot.worldBorder && !bot.worldBorder.isWithinBounds(block.position.x, block.position.z)) return 'fail'
    // (predicted on the world as it is before the use: MultiPlayerGameMode.performUseItemOn)
    const outcome = directionNum >= 0 && directionNum <= 5
      ? predictUse.useItemOn(block, directionNum, cursorPos, offHand)
      : { result: 'pass' }
    // place block message (none for a block item that cannot go there before 1.13: the use is a FAIL the client keeps
    // to itself)
    let sequence = null
    // TODO: logic below can likely be simplified
    if (outcome.unsent) {
      // (nothing sent)
    } else if (bot.supportFeature('blockPlaceHasHeldItem')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: cursorPos.scaled(16).x,
        cursorY: cursorPos.scaled(16).y,
        cursorZ: cursorPos.scaled(16).z
      })
    } else if (bot.supportFeature('blockPlaceHasHandAndIntCursor')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: offHand ? 1 : 0,
        cursorX: cursorPos.scaled(16).x,
        cursorY: cursorPos.scaled(16).y,
        cursorZ: cursorPos.scaled(16).z
      })
    } else if (bot.supportFeature('blockPlaceHasHandAndFloatCursor')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: offHand ? 1 : 0,
        cursorX: cursorPos.x,
        cursorY: cursorPos.y,
        cursorZ: cursorPos.z
      })
    } else if (bot.supportFeature('blockPlaceHasInsideBlock')) {
      bot._client.write('block_place', {
        location: block.position,
        direction: directionNum,
        hand: offHand ? 1 : 0,
        cursorX: cursorPos.x,
        cursorY: cursorPos.y,
        cursorZ: cursorPos.z,
        insideBlock: false,
        sequence: (sequence = bot._nextInteractionSequence()),
        worldBorderHit: false // 1.21.3+
      })
    }

    // the arm swings for a use the client predicts succeeds (26.3+: the server swings for a use itself, the client sends
    // no swing, Minecraft.startUseItem)
    if (!bot.registry.version['>=']('26.3') && outcome.result === 'success') bot.swingArm(offHand ? 'left' : 'right')
    predictPlacement(outcome.place, offHand, sequence)
    if (outcome.eat) predictBite(block)
    return outcome.result
  }

  // A right click on the entity, as vanilla's (bot._interactEntity: INTERACT_AT then INTERACT before 26.1, one
  // interaction since, and the swing of a use the client predicts succeeds). Resolves to that prediction: 'success',
  // 'consume' or 'pass' (vanilla would go on to the item in hand, then to the off hand).
  async function activateEntity (entity, offHand = false) {
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(entity.position.offset(0, 1, 0), false)
    // where the crosshair meets the entity
    return bot._interactEntity(entity, undefined, offHand)
  }

  // The pick key on a block or an entity (Minecraft.pickBlockOrEntity): from 1.21.4 the server picks it
  // (MultiPlayerGameMode.handlePickItemFromBlock / handlePickItemFromEntity), with its data when includeData (the
  // control key held). Before 1.21.4 the client picked the item itself, which is not done here.
  function pickBlock (block, includeData = false) {
    assert.ok(bot.registry.version['>=']('1.21.4'), 'pickBlock: the server picks the item from 1.21.4 only')
    bot._client.write('pick_item_from_block', { position: block.position, includeData })
  }

  function pickEntity (entity, includeData = false) {
    assert.ok(bot.registry.version['>=']('1.21.4'), 'pickEntity: the server picks the item from 1.21.4 only')
    bot._client.write('pick_item_from_entity', { entityId: entity.id, includeData })
  }

  async function activateEntityAt (entity, position, offHand = false) {
    // TODO: tell the server that we are not sneaking while doing this
    await bot.lookAt(position, false)
    return bot._interactEntity(entity, position, offHand)
  }

  async function transfer (options) {
    const window = options.window || bot.currentWindow || bot.inventory
    const itemType = options.itemType
    const metadata = options.metadata
    const nbt = options.nbt
    let count = (options.count === undefined || options.count === null) ? 1 : options.count
    let firstSourceSlot = null

    // ranges
    const sourceStart = options.sourceStart
    const destStart = options.destStart
    assert.notStrictEqual(sourceStart, null)
    assert.notStrictEqual(destStart, null)
    const sourceEnd = options.sourceEnd === null ? sourceStart + 1 : options.sourceEnd
    const destEnd = options.destEnd === null ? destStart + 1 : options.destEnd

    await transferOne()

    async function transferOne () {
      if (count === 0) {
        await putSelectedItemRange(sourceStart, sourceEnd, window, firstSourceSlot)
        return
      }
      if (!window.selectedItem || window.selectedItem.type !== itemType ||
        (metadata != null && window.selectedItem.metadata !== metadata) ||
        (nbt != null && window.selectedItem.nbt !== nbt)) {
        // we are not holding the item we need. click it.
        const sourceItem = window.findItemRange(sourceStart, sourceEnd, itemType, metadata, false, nbt)
        const mcDataEntry = bot.registry.itemsArray.find(x => x.id === itemType)
        assert(mcDataEntry, 'Invalid itemType')
        if (!sourceItem) throw new Error(`Can't find ${mcDataEntry.name} in slots [${sourceStart} - ${sourceEnd}], (item id: ${itemType})`)
        if (firstSourceSlot === null) firstSourceSlot = sourceItem.slot
        // number of item that can be moved from that slot
        await clickWindow(sourceItem.slot, 0, 0)
      }
      await clickDest()

      async function clickDest () {
        assert.notStrictEqual(window.selectedItem.type, null)
        assert.notStrictEqual(window.selectedItem.metadata, null)
        let destItem
        let destSlot
        // special case for tossing
        if (destStart === -999) {
          destSlot = -999
        } else {
          // find a non full item that we can drop into
          destItem = window.findItemRange(destStart, destEnd,
            window.selectedItem.type, window.selectedItem.metadata, true, nbt)
          // if that didn't work find an empty slot to drop into
          destSlot = destItem
            ? destItem.slot
            : window.firstEmptySlotRange(destStart, destEnd)
          // if that didn't work, give up
          if (destSlot === null) {
            throw new Error('destination full')
          }
        }
        // move the maximum number of item that can be moved
        const destSlotCount = destItem && destItem.count ? destItem.count : 0
        const movedItems = Math.min(window.selectedItem.stackSize - destSlotCount, window.selectedItem.count)
        // if the number of item the left click moves is less than the number of item we want to move
        // several at the same time (left click)
        if (movedItems <= count) {
          await clickWindow(destSlot, 0, 0)
          // update the number of item we want to move (count)
          count -= movedItems
          await transferOne()
        } else {
          // one by one (right click)
          await clickWindow(destSlot, 1, 0)
          count -= 1
          await transferOne()
        }
      }
    }
  }

  function extendWindow (window) {
    window.close = () => {
      closeWindow(window)
      window.emit('close')
    }

    window.withdraw = async (itemType, metadata, count, nbt) => {
      if (bot.inventory.emptySlotCount() === 0) {
        throw new Error('Unable to withdraw, Bot inventory is full.')
      }
      const options = {
        window,
        itemType,
        metadata,
        count,
        nbt,
        sourceStart: 0,
        sourceEnd: window.inventoryStart,
        destStart: window.inventoryStart,
        destEnd: window.inventoryEnd
      }
      await transfer(options)
    }
    window.deposit = async (itemType, metadata, count, nbt) => {
      const options = {
        window,
        itemType,
        metadata,
        count,
        nbt,
        sourceStart: window.inventoryStart,
        sourceEnd: window.inventoryEnd,
        destStart: 0,
        destEnd: window.inventoryStart
      }
      await transfer(options)
    }
  }

  async function openBlock (block, direction, cursorPos) {
    bot.activateBlock(block, direction, cursorPos)
    const [window] = await once(bot, 'windowOpen')
    extendWindow(window)
    return window
  }

  // The horses whose inventory their rider opens with the inventory key (MultiPlayerGameMode.isServerControlledInventory;
  // 1.8 - 1.10 name every horse EntityHorse)
  // The vehicles whose inventory their rider opens with the inventory key (HasCustomInventoryScreen: the horse family,
  // the nautiluses, chest boats); the client asks the server (MultiPlayerGameMode.isServerControlledInventory)
  const CUSTOM_INVENTORY_VEHICLE = /^(EntityHorse|horse|donkey|mule|skeleton_horse|zombie_horse|llama|trader_llama|camel|camel_husk|nautilus|zombie_nautilus|.*chest_boat|.*chest_raft)$/
  bot._hasCustomInventoryScreen = entity => CUSTOM_INVENTORY_VEHICLE.test(entity?.name ?? '')

  async function openEntity (entity) {
    if (entity === bot.vehicle && CUSTOM_INVENTORY_VEHICLE.test(entity.name ?? '')) {
      // the rider asks the server to open its mount's inventory (LocalPlayer.sendOpenInventory)
      bot._client.write('entity_action', { entityId: bot.entity.id, actionId: 'open_inventory', jumpBoost: 0 })
    } else {
      bot.activateEntity(entity)
    }
    const [window] = await once(bot, 'windowOpen')
    extendWindow(window)
    return window
  }

  // < 1.17: each menu counts its own clicks (AbstractContainerMenu's transaction id, from 1 as it opens); the player's
  // inventory menu goes on counting through the session
  function createActionNumber (window) {
    const last = window.actionNumber ?? 0
    window.actionNumber = last === 32767 ? 1 : last + 1
    return window.actionNumber
  }

  function updateHeldItem () {
    bot.emit('heldItemChanged', bot.heldItem)
  }

  function closeWindow (window) {
    bot._client.write('close_window', {
      windowId: window.id
    })
    copyInventory(window)
    bot.currentWindow = null
    bot.emit('windowClose', window)
  }

  function copyInventory (window) {
    const slotOffset = window.inventoryStart - bot.inventory.inventoryStart
    for (let i = window.inventoryStart; i < window.inventoryEnd; i++) {
      const item = window.slots[i]
      const slot = i - slotOffset
      if (item) {
        item.slot = slot
      }
      if (!Item.equal(bot.inventory.slots[slot], item, true)) bot.inventory.updateSlot(slot, item)
    }
  }

  function tradeMatch (limitItem, targetItem) {
    return (
      targetItem !== null &&
      limitItem !== null &&
      targetItem.type === limitItem.type &&
      targetItem.count >= limitItem.count
    )
  }

  function expectTradeUpdate (window) {
    const trade = window.selectedTrade
    const hasItem = !!window.slots[2]

    if (hasItem !== tradeMatch(trade.inputItem1, window.slots[0])) {
      if (trade.hasItem2) {
        return hasItem !== tradeMatch(trade.inputItem2, window.slots[1])
      }
      return true
    }
    return false
  }

  async function waitForWindowUpdate (window, slot) {
    if (window.type === 'minecraft:inventory') {
      if (slot >= 1 && slot <= 4) {
        await once(bot.inventory, 'updateSlot:0')
      }
    } else if (window.type === 'minecraft:crafting') {
      if (slot >= 1 && slot <= 9) {
        await once(bot.currentWindow, 'updateSlot:0')
      }
    } else if (window.type === 'minecraft:merchant') {
      const toUpdate = []
      if (slot <= 1 && !window.selectedTrade.tradeDisabled && expectTradeUpdate(window)) {
        toUpdate.push(once(bot.currentWindow, 'updateSlot:2'))
      }
      if (slot === 2) {
        for (const item of bot.currentWindow.containerItems()) {
          toUpdate.push(once(bot.currentWindow, `updateSlot:${item.slot}`))
        }
      }
      await Promise.all(toUpdate)

      if (slot === 2 && !window.selectedTrade.tradeDisabled && expectTradeUpdate(window)) {
        // After the trade goes through, if the inputs are still satisfied,
        // expect another update in slot 2
        await once(bot.currentWindow, 'updateSlot:2')
      }
    }
  }

  function confirmTransaction (windowId, actionId, accepted) {
    // drop the queue entries for all the clicks that the server did not send
    // transaction packets for.
    // Also reject transactions that aren't sent from mineflayer
    let click = windowClickQueue[0]
    if (click === undefined || !windowClickQueue.some(clicks => clicks.id === actionId)) {
      // mimic vanilla client and send a rejection for faulty transaction packets
      bot._client.write('transaction', {
        windowId,
        action: actionId,
        accepted: true
        // bot.emit(`confirmTransaction${click.id}`, false)
      })
      return
    }
    // shift it later if packets are sent out of order
    click = windowClickQueue.shift()

    assert.ok(click.id <= actionId)
    while (actionId > click.id) {
      onAccepted()
      click = windowClickQueue.shift()
    }
    assert.ok(click)

    if (accepted) {
      onAccepted()
    } else {
      onRejected()
    }
    updateHeldItem()

    // (the click was played on the menu as it was sent; a refused one is put right by the menu the server resends)
    function onAccepted () {
      bot.emit(`confirmTransaction${click.id}`, true)
    }

    function onRejected () {
      bot._client.write('transaction', {
        windowId: click.windowId,
        action: click.id,
        accepted: true
      })
      bot.emit(`confirmTransaction${click.id}`, false)
    }
  }

  function acceptClick (window, click) {
    const gamemode = bot.player?.gamemode ?? (bot.game.gameMode === 'creative' ? 1 : 0)
    return simulateInventoryClick(window, click, gamemode, bot.inventory)
  }

  // The changed slots in the order vanilla's client writes them: the iteration order of its Int2ObjectOpenHashMap
  // (fastutil: slot 0 first, then the hash table from its last bucket down; keys put in slot order, linear probing)
  function changedSlotsOrder (slots) {
    const keys = [...new Set(slots)].sort((a, b) => a - b)
    let n = 32
    while (keys.length >= Math.min(Math.ceil(n * 0.75), n - 1)) n *= 2
    const mask = n - 1
    const table = new Array(n).fill(null)
    const mix = key => {
      const h = Math.imul(key, 0x9E3779B9 | 0)
      return h ^ (h >>> 16)
    }
    let zero = false
    for (const key of keys) {
      if (key === 0) {
        zero = true
        continue
      }
      let pos = mix(key) & mask
      while (table[pos] !== null) pos = (pos + 1) & mask
      table[pos] = key
    }
    const ordered = zero ? [0] : []
    for (let pos = n - 1; pos >= 0; pos--) if (table[pos] !== null) ordered.push(table[pos])
    return ordered
  }

  // < 1.17: the stack the client's menu returns from a click (AbstractContainerMenu.clicked), which its packet carries: a
  // pick up's slot as it was; a quick move's slot as it was when the move took something from it (before 1.12: Container.
  // slotClick keeps what transferStackInSlot returned) and, from 1.12, left the same item there, so that the move goes on
  // (doClick's QUICK_MOVE loop): a part the inventory had no room for, or a result there again (a trade the payment left
  // pays for again); nothing for the other clicks
  function transactionClickItem (window, click) {
    if (click.slot === -999 || !click.item) return null
    if (click.mode === 0) return click.item
    if (click.mode !== 1) return null
    // the quick move played on a copy of the window
    const copy = item => item && Object.assign(Object.create(Object.getPrototypeOf(item)), item)
    const dry = Object.create(window)
    dry.emit = () => false
    dry.slots = window.slots.map(copy)
    dry.selectedItem = copy(window.selectedItem)
    dry.quickcraftSlots = [...(window.quickcraftSlots ?? [])]
    if (window.selectedTrade) dry.selectedTrade = { ...window.selectedTrade }
    // (a result taken and there again: the move went on)
    let again = false
    dry.updateSlot = function (slot, item) {
      if (slot === click.slot && item?.type === click.item.type) again = true
      return Object.getPrototypeOf(dry).updateSlot.call(this, slot, item)
    }
    acceptClick(dry, { ...click, item: dry.slots[click.slot] })
    const moved = dry.slots.some((item, i) => (item?.type ?? -1) !== (window.slots[i]?.type ?? -1) || (item?.count ?? 0) !== (window.slots[i]?.count ?? 0))
    if (!moved) return null
    if (!bot.registry.version['>=']('1.12')) return click.item
    return again || dry.slots[click.slot]?.type === click.item.type ? click.item : null
  }

  async function clickWindow (slot, mouseButton, mode) {
    // if you click on the quick bar and have dug recently,
    // wait a bit
    if (slot >= bot.QUICK_BAR_START && bot.lastDigTime != null) {
      let timeSinceLastDig
      while ((timeSinceLastDig = new Date() - bot.lastDigTime) < DIG_CLICK_TIMEOUT) {
        await sleep(DIG_CLICK_TIMEOUT - timeSinceLastDig)
      }
    }
    const window = bot.currentWindow || bot.inventory

    assert.ok(mode >= 0 && mode <= 6)
    // 1.16 - 26.2: a click that drops an item out of the screen (the cursor's outside it, or a slot's with the drop key)
    // swings the arm as the client predicts the drop, before the click is sent (LivingEntity.drop)
    const drops = (slot === -999 && mode === 0 && window.selectedItem) || (mode === 4 && slot >= 0 && window.slots[slot] && !window.selectedItem)
    if (drops && bot.registry.version['>=']('1.16') && !bot.registry.version['>=']('26.3')) bot.swingArm()
    const actionId = createActionNumber(window)

    const click = {
      slot,
      mouseButton,
      mode,
      id: actionId,
      windowId: window.id,
      item: slot === -999 ? null : window.slots[slot],
      time: Date.now()
    }

    let changedSlots
    let transactionItem
    if (bot.supportFeature('transactionPacketExists')) {
      // < 1.17: the client plays the click on its menu at once and sends what that returned, the stack as the click
      // found it (AbstractContainerMenu.clicked, MultiPlayerGameMode.handleInventoryMouseClick): the server's answer
      // comes later, and a next click starts from the menu the click left
      transactionItem = Item.toNotch(transactionClickItem(window, click))
      windowClickQueue.push(click)
      acceptClick(window, click)
    } else {
      changedSlots = changedSlotsOrder(acceptClick(window, click))

      changedSlots = changedSlots.map(slot => {
        return {
          location: slot,
          item: clickItem(window.slots[slot])
        }
      })
    }

    if (bot.supportFeature('stateIdUsed')) { // 1.17.1 +
      bot._client.write('window_click', {
        windowId: window.id,
        stateId,
        slot,
        mouseButton,
        mode,
        changedSlots,
        cursorItem: clickItem(window.selectedItem)
      })
    } else if (bot.supportFeature('actionIdUsed')) { // <= 1.16.5
      bot._client.write('window_click', {
        windowId: window.id,
        slot,
        mouseButton,
        action: actionId,
        mode,
        item: transactionItem
      })
    } else { // 1.17
      bot._client.write('window_click', {
        windowId: window.id,
        slot,
        mouseButton,
        mode,
        changedSlots,
        cursorItem: clickItem(window.selectedItem)
      })
    }

    if (bot.supportFeature('transactionPacketExists')) {
      const response = once(bot, `confirmTransaction${actionId}`)
      if (!window.transactionRequiresConfirmation(click)) {
        confirmTransaction(window.id, actionId, true)
      }
      const [success] = await withTimeout(response, WINDOW_TIMEOUT)
        .catch(() => {
          throw new Error(`Server didn't respond to transaction for clicking on slot ${slot} on window with id ${window?.id}.`)
        })
      if (!success) {
        throw new Error(`Server rejected transaction for clicking on slot ${slot}, on window with id ${window?.id}.`)
      }
    } else {
      await waitForWindowUpdate(window, slot)
    }
  }

  async function putAway (slot) {
    const window = bot.currentWindow || bot.inventory
    const promisePutAway = once(window, `updateSlot:${slot}`)
    await clickWindow(slot, 0, 0)
    const start = window.inventoryStart
    const end = window.inventoryEnd
    await putSelectedItemRange(start, end, window, null)
    await promisePutAway
  }

  async function moveSlotItem (sourceSlot, destSlot) {
    await clickWindow(sourceSlot, 0, 0)
    await clickWindow(destSlot, 0, 0)
    // if we're holding an item, put it back where the source item was.
    // otherwise we're done.
    updateHeldItem()
    if (bot.inventory.selectedItem) {
      await clickWindow(sourceSlot, 0, 0)
    }
  }

  bot._client.on('transaction', (packet) => {
    // confirm transaction
    confirmTransaction(packet.windowId, packet.action, packet.accepted)
  })

  bot._client.on('held_item_slot', (packet) => {
    // the server selects a slot (ClientPacketListener.handleSetHeldSlot): the client answers only as its next tick
    // finds the slot is not the one it last sent
    bot._selectQuickBarSlotBeforeTick(packet.slot)
  })

  function prepareWindow (window) {
    if (!windowItems || window.id !== windowItems.windowId) {
      // don't emit windowOpen until we have the slot data
      bot.once(`setWindowItems:${window.id}`, () => {
        extendWindow(window)
        bot.emit('windowOpen', window)
      })
    } else {
      for (let i = 0; i < windowItems.items.length; ++i) {
        const item = Item.fromNotch(windowItems.items[i])
        window.updateSlot(i, item)
      }
      updateHeldItem()
      extendWindow(window)
      bot.emit('windowOpen', window)
    }
  }

  bot._client.on('open_window', (packet) => {
    // open window
    bot.currentWindow = windows.createWindow(packet.windowId,
      packet.inventoryType, packet.windowTitle, packet.slotCount)
    prepareWindow(bot.currentWindow)
  })
  // The slots of a mount's screen before the player's (HorseInventoryMenu): the saddle (0), the body armor (1), then the
  // chest. What the packet's count says: until 1.20.4 the mount's whole inventory (the saddle, the armor and the chest);
  // 1.20.5 - 1.20.6 the inventory without the armor (worn as body armor since, not in the inventory); from 1.21 the
  // chest's columns of three slots (AbstractHorse.getInventorySize: a llama's are its strength)
  function mountScreenSlots (count) {
    if (bot.registry.version['>=']('1.21')) return 2 + 3 * count
    if (bot.registry.version['>=']('1.20.5')) return count + 1
    return count
  }
  bot._client.on('open_horse_window', (packet) => {
    // open window
    const window = windows.createWindow(packet.windowId, 'HorseWindow', 'Horse', mountScreenSlots(packet.nbSlots))
    bot.currentWindow = window
    // 1.21.5+: the saddle slot is the mount's saddle (HorseInventoryMenu's slot over EquipmentSlot.SADDLE), so a click
    // that takes it off or puts it on changes the mount at once, before the server says so
    const mount = bot.entities[packet.entityId]
    if (mount && bot.registry.version['>=']('1.21.5')) {
      window.on('updateSlot', (slot, oldItem, newItem) => {
        if (slot === 0 && bot.currentWindow === window && typeof mount.setEquipment === 'function') mount.setEquipment(7, newItem)
      })
    }
    // what the saddle (0) and body armor (1) slots take (their mayPlace: Mob.isEquippableInSlot, before 1.21.5 the
    // horse's isSaddleable / isArmor): a saddle on a mount that wears one, horse armor on a horse, a carpet on a llama,
    // nautilus armor on a nautilus
    if (mount) {
      const name = mount.name ?? ''
      window.mayPlace = (slot, item) => {
        if (slot === 0) return item.name === 'saddle' && !/llama/.test(name)
        if (slot === 1) {
          if (/llama/.test(name)) return /_carpet$|^carpet$/.test(item.name)
          if (/nautilus/.test(name)) return /_nautilus_armor$/.test(item.name)
          if (/^(horse|EntityHorse|zombie_horse)$/.test(name)) return /_horse_armor$|^(iron|golden|diamond)_horse_armor$/.test(item.name)
          return false
        }
        return true
      }
    }
    prepareWindow(window)
  })
  bot._client.on('close_window', (packet) => {
    // close window
    const oldWindow = bot.currentWindow
    bot.currentWindow = null
    bot.emit('windowClose', oldWindow)
  })
  bot._client.on('login', () => {
    // close window when switch subserver
    const oldWindow = bot.currentWindow
    if (!oldWindow) return
    bot.currentWindow = null
    bot.emit('windowClose', oldWindow)
  })
  bot._setSlot = (slotId, newItem, window = bot.inventory) => {
    // set slot
    const oldItem = window.slots[slotId]
    window.updateSlot(slotId, newItem)
    updateHeldItem()
    bot.emit(`setSlot:${window.id}`, oldItem, newItem)
  }
  // The stack on the cursor the server says (AbstractContainerMenu.setCarried, of the open menu): set_slot's slot -1 of
  // window -1 before 1.21.2 (before 1.17 the player inventory's, the one cursor of every screen), set_cursor_item from
  // 1.21.2, and from 1.17 the carried stack of window_items (initializeContents)
  const setCarried = (window, item) => { window.selectedItem = Item.fromNotch(item) }
  bot._client.on('set_cursor_item', (packet) => setCarried(bot.currentWindow ?? bot.inventory, packet.contents))
  bot._client.on('set_slot', (packet) => {
    if (packet.windowId === -1 && packet.slot === -1) return setCarried(bot.currentWindow ?? bot.inventory, packet.item)
    const window = packet.windowId === 0 ? bot.inventory : bot.currentWindow
    if (!window || window.id !== packet.windowId) return
    const newItem = Item.fromNotch(packet.item)
    // very hacky solution. if the server doesnt send the slots in the proper order, then the window will still never emit 'windowOpen'
    if (bot.currentWindow && packet.slot === bot.currentWindow.slots.length - 1) {
      // window is probably ready
      bot.emit(`setWindowItems:${window.id}`)
    }
    bot._setSlot(packet.slot, newItem, window)
  })
  // 1.21.9+ uses set_player_inventory for server-initiated inventory changes
  // (e.g. console /give) instead of set_slot
  bot._client.on('set_player_inventory', (packet) => {
    const newItem = Item.fromNotch(packet.contents)
    bot._setSlot(packet.slotId, newItem)
  })
  bot.inventory.on('updateSlot', (index) => {
    if (index === bot.quickBarSlot + bot.inventory.hotbarStart) {
      bot.emit('heldItemChanged', bot.heldItem)
    }
  })
  bot._client.on('window_items', (packet) => {
    const window = packet.windowId === 0 ? bot.inventory : bot.currentWindow
    if (!window || window.id !== packet.windowId) {
      windowItems = packet
      return
    }

    // set window items
    for (let i = 0; i < packet.items.length; ++i) {
      const item = Item.fromNotch(packet.items[i])
      window.updateSlot(i, item)
    }
    if (packet.carriedItem !== undefined) setCarried(window, packet.carriedItem)
    updateHeldItem()
    bot.emit(`setWindowItems:${window.id}`)
    window.fullUpdateTime = Date.now()
  })

  /**
   * Convert a vector direction to minecraft packet number direction
   * @param {Vec3} v
   * @returns {number}
   */
  function vectorToDirection (v) {
    if (v.y < 0) {
      return 0
    } else if (v.y > 0) {
      return 1
    } else if (v.z < 0) {
      return 2
    } else if (v.z > 0) {
      return 3
    } else if (v.x < 0) {
      return 4
    } else if (v.x > 0) {
      return 5
    }
    assert.ok(false, `invalid direction vector ${v}`)
  }

  bot.activateBlock = activateBlock
  bot.pickBlock = pickBlock
  bot.pickEntity = pickEntity
  bot.activateEntity = activateEntity
  bot.activateEntityAt = activateEntityAt
  bot.consume = consume
  bot.activateItem = activateItem
  bot.deactivateItem = deactivateItem
  bot.dropHeldItem = dropHeldItem
  bot.swapHands = swapHands

  // not really in the public API
  bot.clickWindow = clickWindow
  bot.putSelectedItemRange = putSelectedItemRange
  bot.putAway = putAway
  bot.closeWindow = closeWindow
  bot.transfer = transfer
  bot.openBlock = openBlock
  bot.openEntity = openEntity
  bot.moveSlotItem = moveSlotItem
  bot.updateHeldItem = updateHeldItem
}
