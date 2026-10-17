const { performance } = require('perf_hooks')
const { createDoneTask, createTask } = require('../promise_utils')
const BlockFaces = require('prismarine-world').iterators.BlockFace
const { Vec3 } = require('vec3')

module.exports = inject

// A dig as vanilla's client runs it while the attack key is held on a block (Minecraft.startAttack / continueAttack,
// MultiPlayerGameMode.startDestroyBlock / continueDestroyBlock / stopDestroyBlock): START (with the block interaction
// sequence from 1.19) and a swing, then once a tick, before the tick's movement, the block's destroy progress is added
// and the arm swings; STOP goes the tick the progress reaches 1, and the next block starts only after a destroy delay
// of 5 ticks.
function inject (bot) {
  // 26.3 put CHANGE_DESTROY_DIRECTION at 1 of ServerboundPlayerActionPacket.Action, after START_DESTROY_BLOCK
  const actionShift = bot.registry.version['>=']('26.3') ? 1 : 0
  const START = 0
  const ABORT = 1 + actionShift
  const STOP = 2 + actionShift
  const CHANGE_DESTROY_DIRECTION = 1
  const sequenced = bot.registry.version['>=']('1.19')
  // 1.8 swings before it sends the action (Minecraft.clickMouse)
  const swingFirst = bot.supportFeature('armAnimationBeforeUse')
  // MultiPlayerGameMode.DEFAULT_DESTROY_COOLDOWN_TICKS
  const destroyCooldownTicks = 5
  const Item = require('prismarine-item')(bot.registry)

  let diggingTask = createDoneTask()

  // MultiPlayerGameMode's state: whether a dig was started (isDestroying), the block last started with its face, the
  // item it is dug with and its progress, and the delay after a break
  let isDestroying = false
  let destroyBlockPos = null
  let destroyDirection = null
  let destroyingItem = null
  let destroyProgress = 0
  let destroyDelay = 0
  // the block at the crosshair the attack key is held on (what bot.dig was asked for), with its face
  let target = null

  bot.targetDigBlock = null
  bot.targetDigFace = null
  bot.lastDigTime = null
  // whether a dig was started and goes on (MultiPlayerGameMode.isDestroying): not while the delay after a break runs
  Object.defineProperty(bot, 'isDestroying', { get: () => isDestroying, configurable: true })

  function writeAction (status, location, face, sequence) {
    const packet = { status, location, face }
    if (sequenced) packet.sequence = sequence ?? 0
    if (acknowledged) unAckedActions.set(actionKey(location, status), { position: bot.entity.position.clone(), yaw: bot.entity.yaw, pitch: bot.entity.pitch, yawDegrees: bot.entity.yawDegrees, pitchDegrees: bot.entity.pitchDegrees })
    bot._client.write('block_dig', packet)
  }

  // 1.14 - 1.18: the server acknowledges each action with the block's state (ClientboundBlockBreakAckPacket). The
  // client keeps where the player was as it sent the action (MultiPlayerGameMode.unAckedActions, the 50 latest); an
  // action refused, unknown, or (but a start) leaving the block another state than the client's puts the server's
  // state back and the player where it was (handleBlockBreakAck: absMoveTo, with its rotation before 1.16; from 1.16 only
  // when the block's state changes, and only a player the block now collides with)
  const acknowledged = bot.registry.version['>=']('1.14') && !sequenced
  const unAckedActions = new Map()
  const actionKey = (location, status) => `${location.x},${location.y},${location.z},${status}`
  if (acknowledged) {
    bot._client.on('acknowledge_player_digging', (packet) => {
      const position = new Vec3(packet.location.x, packet.location.y, packet.location.z)
      const key = actionKey(position, packet.status)
      const before = unAckedActions.get(key)
      unAckedActions.delete(key)
      const known = bot.blockAt(position)
      const differs = known?.stateId !== packet.block
      const refused = !before || !packet.successful || (packet.status !== START && differs)
      if (refused && (differs || !bot.registry.version['>=']('1.16'))) {
        bot._updateBlockState(position, packet.block)
        if (before && (!bot.registry.version['>=']('1.16') || collidesWith(bot.blockAt(position)))) {
          bot.entity.position.set(before.position.x, before.position.y, before.position.z)
          if (!bot.registry.version['>=']('1.16')) {
            Object.assign(bot.entity, { yaw: before.yaw, pitch: before.pitch })
            if (before.yawDegrees !== undefined) Object.assign(bot.entity, { yawDegrees: before.yawDegrees, pitchDegrees: before.pitchDegrees })
          }
        }
      }
      while (unAckedActions.size >= 50) unAckedActions.delete(unAckedActions.keys().next().value)
    })
  }
  // Player.isColliding: the block's collision shapes meet the player's box
  function collidesWith (block) {
    if (!block?.shapes) return false
    const { x, y, z } = bot.entity.position
    const w = (bot.entity.width ?? 0.6) / 2
    const h = bot.entity.height ?? 1.8
    const { x: bx, y: by, z: bz } = block.position
    return block.shapes.some(([x0, y0, z0, x1, y1, z1]) => bx + x0 < x + w && bx + x1 > x - w && by + y0 < y + h && by + y1 > y && bz + z0 < z + w && bz + z1 > z - w)
  }
  const nextSequence = () => sequenced ? bot._nextInteractionSequence() : 0

  async function dig (block, forceLook, digFace, face, { held = false } = {}) {
    if (block === null || block === undefined) {
      throw new Error('dig was called with an undefined or null block')
    }

    if (!digFace || typeof digFace === 'function') {
      digFace = 'auto'
    }

    const initialDigTime = bot.digTime(block)
    if (initialDigTime === Infinity) {
      throw new Error(`dig time for ${block?.name ?? block} is Infinity`)
    }

    bot.targetDigFace = face ?? 1 // Default (top)

    if (forceLook !== 'ignore') {
      if (digFace?.x || digFace?.y || digFace?.z) {
        // Determine the block face the bot should mine
        if (digFace.x) {
          bot.targetDigFace = digFace.x > 0 ? BlockFaces.EAST : BlockFaces.WEST
        } else if (digFace.y) {
          bot.targetDigFace = digFace.y > 0 ? BlockFaces.TOP : BlockFaces.BOTTOM
        } else if (digFace.z) {
          bot.targetDigFace = digFace.z > 0 ? BlockFaces.SOUTH : BlockFaces.NORTH
        }
        await bot.lookAt(
          block.position.offset(0.5, 0.5, 0.5).offset(digFace.x * 0.5, digFace.y * 0.5, digFace.z * 0.5),
          forceLook
        )
      } else if (digFace === 'raycast') {
        // Check faces that could be seen from the current position. If the delta is smaller then 0.5 that means the
        // bot can most likely not see the face as the block is 1 block thick
        // this could be false for blocks that have a smaller bounding box than 1x1x1
        const dx = bot.entity.position.x - (block.position.x + 0.5)
        const dy = bot.entity.position.y + bot.entity.eyeHeight - (block.position.y + 0.5)
        const dz = bot.entity.position.z - (block.position.z + 0.5)
        // Check y first then x and z
        const visibleFaces = {
          y: Math.sign(Math.abs(dy) > 0.5 ? dy : 0),
          x: Math.sign(Math.abs(dx) > 0.5 ? dx : 0),
          z: Math.sign(Math.abs(dz) > 0.5 ? dz : 0)
        }
        const validFaces = []
        const closerBlocks = []
        for (const i in visibleFaces) {
          if (!visibleFaces[i]) continue // skip as this face is not visible
          // target position on the target block face. -> 0.5 + (current face) * 0.5
          const targetPos = block.position.offset(
            0.5 + (i === 'x' ? visibleFaces[i] * 0.5 : 0),
            0.5 + (i === 'y' ? visibleFaces[i] * 0.5 : 0),
            0.5 + (i === 'z' ? visibleFaces[i] * 0.5 : 0)
          )
          const startPos = bot.entity.position.offset(0, bot.entity.eyeHeight, 0)
          const rayBlock = bot.world.raycast(startPos, targetPos.clone().subtract(startPos).normalize(), 5)
          if (rayBlock) {
            if (startPos.distanceTo(rayBlock.intersect) < startPos.distanceTo(targetPos)) {
              // Block is closer then the raycasted block
              closerBlocks.push(rayBlock)
              // continue since if distance is ever less, then we did not intersect the block we wanted,
              // meaning that the position of the intersected block is not what we want.
              continue
            }
            const rayPos = rayBlock.position
            if (
              rayPos.x === block.position.x &&
              rayPos.y === block.position.y &&
              rayPos.z === block.position.z
            ) {
              validFaces.push({
                face: rayBlock.face,
                targetPos: rayBlock.intersect
              })
            }
          }
        }

        if (validFaces.length > 0) {
          // Chose closest valid face
          let closest
          let distSqrt = 999
          for (const i in validFaces) {
            const tPos = validFaces[i].targetPos
            const cDist = new Vec3(tPos.x, tPos.y, tPos.z).distanceSquared(
              bot.entity.position.offset(0, bot.entity.eyeHeight, 0)
            )
            if (distSqrt > cDist) {
              closest = validFaces[i]
              distSqrt = cDist
            }
          }
          await bot.lookAt(closest.targetPos, forceLook)
          bot.targetDigFace = closest.face
        } else if (closerBlocks.length === 0 && block.shapes.length === 0) {
          // no other blocks were detected and the block has no shapes.
          // The block in question is replaceable (like tall grass) so we can just dig it
          // TODO: do AABB + ray intercept check to this position for digFace.
          await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), forceLook)
        } else {
          // Block is obstructed return error?
          throw new Error('Block not in view')
        }
      } else {
        await bot.lookAt(block.position.offset(0.5, 0.5, 0.5), forceLook)
      }
    }

    const targetFace = bot.targetDigFace
    // the same block at the crosshair again: only the face can have changed (the tick tells it, 26.3)
    if (target && target.block.position.equals(block.position)) {
      target.face = targetFace
      return diggingTask.promise
    }

    // another dig asked for before this one ends it
    if (!diggingTask.done) diggingTask.cancel(new Error('Digging aborted'))
    diggingTask = createTask()
    const task = diggingTask
    target = { block, face: targetFace }
    bot.targetDigBlock = block
    bot.targetDigFace = targetFace

    // a press of the attack key (Minecraft.startAttack) starts the dig at once and swings; held on from another block
    // (continueAttack) the tick starts it
    if (!held) {
      if (swingFirst) bot.swingArm()
      startDestroyBlock(block, targetFace)
      if (!swingFirst) bot.swingArm()
    }

    await task.promise
  }

  // the dig ends: the block was broken (the server's block change, or the break the client predicts)
  function completed (newBlock) {
    const task = diggingTask
    const block = target?.block
    target = null
    bot.targetDigBlock = null
    bot.targetDigFace = null
    bot.lastDigTime = performance.now()
    bot.emit('diggingCompleted', newBlock ?? block)
    task.finish()
  }

  bot.on('blockUpdate', (oldBlock, newBlock) => {
    // vanilla server never actually interrupt digging, but some server send block update when you start digging
    // so ignore block update if not air
    // All block update listeners receive (null, null) when the world is unloaded. So newBlock can be null.
    if (!target || !newBlock || newBlock.type !== 0 || !newBlock.position?.equals(target.block.position)) return
    completed(newBlock)
  })

  // the block is broken on the client (MultiPlayerGameMode.destroyBlock): it turns to air at once, a prediction of the
  // action of that sequence (from 1.19, MultiPlayerGameMode.startPrediction)
  function destroyBlock (position, sequence) {
    // before 1.14 the break takes the block last started off its place (PlayerControllerMP.onPlayerDestroyBlock: the
    // current block's y -1): one put back there is started anew, not dug on
    if (!bot.registry.version['>=']('1.14') && destroyBlockPos && !isAir(position)) {
      destroyBlockPos = new Vec3(destroyBlockPos.x, -1, destroyBlockPos.z)
    }
    if (bot._predictBlockState) bot._predictBlockState(position, 0, sequenced ? sequence : null)
    else bot._updateBlockState(position, 0)
  }
  // the action that breaks the block, then the break it predicts
  function breakWith (status, position, face) {
    const sequence = nextSequence()
    writeAction(status, position, face, sequence)
    destroyBlock(position, sequence)
  }

  const isAir = position => bot.blockAt(position)?.type === 0
  // MultiPlayerGameMode.sameDestroyTarget: the block last started, with the same item (its count aside)
  // (ItemStack.isSameItemSameComponents: from 1.20.5 its components, a tool's damage among them)
  const sameItem = (a, b) => Item.equal(a ?? null, b ?? null, false, true) &&
    JSON.stringify(a?.components ?? null) === JSON.stringify(b?.components ?? null) &&
    JSON.stringify(a?.removedComponents ?? null) === JSON.stringify(b?.removedComponents ?? null)
  const sameDestroyTarget = position => destroyBlockPos !== null && destroyBlockPos.equals(position) &&
    sameItem(bot.heldItem, destroyingItem)

  // a block outside the world border is not dug: nothing is sent (MultiPlayerGameMode.startDestroyBlock,
  // continueDestroyBlock)
  const withinBorder = position => !bot.worldBorder || bot.worldBorder.isWithinBounds(position.x, position.z)

  // MultiPlayerGameMode.startDestroyBlock
  function startDestroyBlock (block, face) {
    const position = block.position
    if (!withinBorder(position)) return false
    if (bot.game.gameMode === 'creative') {
      breakWith(START, position, face)
      destroyDelay = destroyCooldownTicks
    } else if (!isDestroying || !sameDestroyTarget(position)) {
      if (isDestroying) writeAction(ABORT, destroyBlockPos, face)
      const instant = !isAir(position) && bot.digTime(block) <= 0
      const sequence = nextSequence()
      writeAction(START, position, face, sequence)
      if (instant) {
        destroyBlock(position, sequence)
      } else {
        isDestroying = true
        destroyBlockPos = position.clone()
        destroyDirection = face
        destroyingItem = bot.heldItem
        destroyProgress = 0
      }
    }
    return true
  }

  // MultiPlayerGameMode.continueDestroyBlock: true when the arm swings
  function continueDestroyBlock (block, face) {
    bot._ensureHasSentCarriedItem?.()
    const position = block.position
    if (destroyDelay > 0) {
      destroyDelay--
      return true
    }
    if (bot.game.gameMode === 'creative' && withinBorder(position)) {
      destroyDelay = destroyCooldownTicks
      breakWith(START, position, face)
      return true
    }
    if (!sameDestroyTarget(position)) return startDestroyBlock(block, face)
    if (isAir(position)) {
      isDestroying = false
      return false
    }
    // getDestroyProgress: the share of the break one tick does, under this tick's conditions
    const digTime = bot.digTime(block)
    if (digTime !== Infinity) destroyProgress += digTime <= 0 ? 1 : 50 / digTime
    if (destroyProgress >= 1 - 1e-9) {
      isDestroying = false
      breakWith(STOP, position, face)
      destroyDirection = null
      destroyProgress = 0
      destroyDelay = destroyCooldownTicks
    } else if (actionShift && destroyDirection !== face) {
      destroyDirection = face
      writeAction(CHANGE_DESTROY_DIRECTION, position, face)
    }
    return true
  }

  // Each tick the attack key is held on the block (Minecraft.continueAttack), before the tick's movement as the
  // client's key handling is: the dig goes on and the arm swings
  const continueAttack = () => {
    if (!target || isAir(target.block.position)) return
    if (continueDestroyBlock(target.block, target.face)) bot.swingArm()
  }
  bot.on('physicsTickBegin', continueAttack)
  // (a tick the player itself does not tick: 1.21.4+ before the level loaded)
  bot.on('clientTickWithoutPlayer', continueAttack)

  // 26.3: a teleport stops the dig (ClientPacketListener.handleMovePlayer: stopDestroyBlock); the key held on the same
  // block goes on with it from no progress, without a new START (MultiPlayerGameMode.sameDestroyTarget)
  if (bot.registry.version['>=']('26.3')) {
    bot._client.on('position', () => {
      if (!isDestroying) return
      writeAction(ABORT, destroyBlockPos, 0)
      isDestroying = false
      destroyProgress = 0
    })
  }

  // MultiPlayerGameMode.stopDestroyBlock: ABORT with the face down, if a dig was started
  function stopDigging () {
    if (!target) {
      // a dig the server's break ended (the block's change to air) goes on on the client till the key lets go or the
      // crosshair leaves the block (isDestroying)
      if (isDestroying) {
        writeAction(ABORT, destroyBlockPos, 0)
        isDestroying = false
        destroyProgress = 0
      }
      return
    }
    const task = diggingTask
    const { block } = target
    target = null
    bot.targetDigBlock = null
    bot.targetDigFace = null
    if (isDestroying) {
      writeAction(ABORT, destroyBlockPos, 0)
      isDestroying = false
      destroyProgress = 0
    }
    bot.lastDigTime = performance.now()
    bot.emit('diggingAborted', block)
    task.cancel(new Error('Digging aborted'))
  }

  bot.on('death', () => {
    try {
      bot.removeAllListeners('diggingAborted')
      bot.removeAllListeners('diggingCompleted')
      bot.stopDigging()
    } catch (_) {}
  })

  // TODO: normalize "reach" here to be bot-global.
  function canDigBlock (block, reach = 5.1) {
    // TODO: make this an AABB check.
    return (
      block &&
      block.diggable &&
      block.position.offset(0.5, 0.5, 0.5).distanceTo(bot.entity.position.offset(0, bot.entity.eyeHeight, 0)) <= reach
    )
  }

  function digTime (block) {
    let type = null
    let enchantments = []

    // Retrieve currently held item ID and active enchantments from heldItem
    const currentlyHeldItem = bot.heldItem
    if (currentlyHeldItem) {
      type = currentlyHeldItem.type
      enchantments = currentlyHeldItem.enchants
    }

    // Append helmet enchantments (because Aqua Affinity actually affects dig speed)
    const headEquipmentSlot = bot.getEquipmentDestSlot('head')
    const headEquippedItem = bot.inventory.slots[headEquipmentSlot]
    if (headEquippedItem) {
      const helmetEnchantments = headEquippedItem.enchants
      enchantments = [...(enchantments ?? []), ...(helmetEnchantments ?? [])]
    }

    const creative = bot.game.gameMode === 'creative'
    return block.digTime(
      type,
      creative,
      ['water', 'flowing_water'].includes(bot._getBlockAtEyeLevel()?.name),
      !bot.entity.onGround,
      enchantments,
      bot.entity.effects
    )
  }

  bot._getBlockAtEyeLevel = () => bot.entity.position && bot.blockAt(bot.entity.position.offset(0, bot.entity.eyeHeight, 0))
  bot.dig = dig
  bot.stopDigging = stopDigging
  bot.canDigBlock = canDigBlock
  bot.digTime = digTime
}
