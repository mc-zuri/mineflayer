const assert = require('assert')
module.exports = inject

function inject (bot) {
  const Item = require('prismarine-item')(bot.registry)
  /**
   *
   * @param {import('prismarine-block').Block} referenceBlock
   * @param {import('vec3').Vec3} faceVector
   * @param {{half?: 'top'|'bottom', delta?: import('vec3').Vec3, forceLook?: boolean | 'ignore', offhand?: boolean, swingArm?: 'right' | 'left', showHand?: boolean, onSent?: () => void}} options
   *   onSent: called as the place goes (a packet held to the next tick's start goes then), after the block's prediction
   */
  async function _genericPlace (referenceBlock, faceVector, options) {
    let handToPlaceWith = 0
    if (options.offhand) {
      if (!bot.inventory.slots[45]) {
        throw new Error('must be holding an item in the off-hand to place')
      }
      handToPlaceWith = 1
    } else if (!bot.heldItem) {
      throw new Error('must be holding an item to place')
    }

    // Look at the center of the face
    let dx = 0.5 + faceVector.x * 0.5
    let dy = 0.5 + faceVector.y * 0.5
    let dz = 0.5 + faceVector.z * 0.5
    if (dy === 0.5) {
      if (options.half === 'top') dy += 0.25
      else if (options.half === 'bottom') dy -= 0.25
    }
    if (options.delta) {
      dx = options.delta.x
      dy = options.delta.y
      dz = options.delta.z
    }
    if (options.forceLook !== 'ignore') {
      await bot.lookAt(referenceBlock.position.offset(dx, dy, dz), options.forceLook)
    }
    // TODO: tell the server that we are sneaking while doing this
    const pos = referenceBlock.position
    // the slot picked since the last tick goes first, or the server uses what was in the hand before
    // (MultiPlayerGameMode.useItemOn: ensureHasSentCarriedItem)
    bot._ensureHasSentCarriedItem?.()

    // 26.3+: the server swings for a use itself, the client sends no swing (Minecraft.startUseItem)
    if (options.swingArm && !bot.registry.version['>=']('26.3')) {
      bot.swingArm(options.swingArm, options.showHand)
    }

    // the block placed goes into the client's world, and out of the stack, as the use goes (BlockItem.place on the client,
    // a prediction of the use's sequence from 1.19): without it a pillar's block was the server's and Grim's a tick before
    // the bot's, the bot falling where they had it stand (Grim's Simulation, mineflayer-survival e2e-m3)
    const { Vec3 } = require('vec3')
    const predict = bot._placePrediction?.(referenceBlock, vectorToDirection(faceVector), new Vec3(dx, dy, dz), handToPlaceWith === 1)
    const write = params => {
      if (predict || options.onSent) {
        Object.defineProperty(params, 'onSent', {
          value: () => {
            if (predict) predict(params.sequence ?? null)
            options.onSent?.()
          }
        })
      }
      bot._client.write('block_place', params)
    }

    if (bot.supportFeature('blockPlaceHasHeldItem')) {
      const packet = {
        location: pos,
        direction: vectorToDirection(faceVector),
        heldItem: Item.toNotch(bot.heldItem),
        cursorX: Math.floor(dx * 16),
        cursorY: Math.floor(dy * 16),
        cursorZ: Math.floor(dz * 16)
      }
      write(packet)
    } else if (bot.supportFeature('blockPlaceHasHandAndIntCursor')) {
      write({
        location: pos,
        direction: vectorToDirection(faceVector),
        hand: handToPlaceWith,
        cursorX: Math.floor(dx * 16),
        cursorY: Math.floor(dy * 16),
        cursorZ: Math.floor(dz * 16)
      })
    } else if (bot.supportFeature('blockPlaceHasHandAndFloatCursor')) {
      write({
        location: pos,
        direction: vectorToDirection(faceVector),
        hand: handToPlaceWith,
        cursorX: dx,
        cursorY: dy,
        cursorZ: dz
      })
    } else if (bot.supportFeature('blockPlaceHasInsideBlock')) {
      // (the use's sequence, from 1.19 acknowledged by the server: bot.placeBlock waits for it)
      bot._lastPlaceSequence = bot._nextInteractionSequence()
      write({
        location: pos,
        direction: vectorToDirection(faceVector),
        hand: handToPlaceWith,
        cursorX: dx,
        cursorY: dy,
        cursorZ: dz,
        insideBlock: false,
        sequence: bot._lastPlaceSequence,
        worldBorderHit: false // 1.21.3
      })
    }

    return pos
  }
  bot._genericPlace = _genericPlace
}

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
