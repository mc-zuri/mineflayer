module.exports = inject

// the fail-safe of a placement the server does not answer, in the bot's ticks (the old 5 seconds at 20 a second)
const PLACE_TICKS = 100

function inject (bot) {
  // The server's answer to a placement, as vanilla's server gives it (ServerGamePacketListenerImpl.handleUseItemOn): the
  // block placed and its update, then the update of the block clicked and of the one on its face, whatever was placed;
  // from 1.19 the acknowledgement of the use's sequence closes it (ClientboundBlockChangedAckPacket, at the end of the
  // server's tick), which vanilla's client ends its prediction with (BlockStatePredictionHandler.endPredictionsUpTo).
  // Resolves with the block before and after, or with the block unchanged once the server answered.
  function waitForPlacement (dest, oldBlock, sequence, failSafeTicks) {
    return new Promise((resolve, reject) => {
      let ticks = 0
      const done = () => {
        bot.removeListener(`blockUpdate:${dest}`, onUpdate)
        bot._client.removeListener('acknowledge_player_digging', onAck)
        bot.removeListener('physicsTickBegin', onTick)
      }
      const onUpdate = (before, after) => {
        // (null, null when the world unloads)
        if (!before || !after) {
          done()
          return resolve([null, null])
        }
        // before 1.19 the server's update of the block is its answer, a change or not
        if (before.type !== after.type || sequence === null) {
          done()
          resolve([oldBlock, after])
        }
      }
      const onAck = (packet) => {
        if (sequence === null || packet.sequenceId < sequence) return
        done()
        resolve([oldBlock, bot.blockAt(dest)])
      }
      const onTick = () => {
        if (++ticks < failSafeTicks) return
        done()
        reject(new Error(`Event blockUpdate:${dest} did not fire within ${failSafeTicks} ticks`))
      }
      bot.on(`blockUpdate:${dest}`, onUpdate)
      bot._client.on('acknowledge_player_digging', onAck)
      bot.on('physicsTickBegin', onTick)
    })
  }

  async function placeBlockWithOptions (referenceBlock, faceVector, options) {
    const dest = referenceBlock.position.plus(faceVector)
    let oldBlock = bot.blockAt(dest)
    // (a timeout in milliseconds, as before, counted in ticks of 50)
    const failSafeTicks = options.timeoutTicks ?? (options.timeout ? Math.ceil(options.timeout / 50) : PLACE_TICKS)
    await bot._genericPlace(referenceBlock, faceVector, options)
    // (from 1.19 the use's sequence, which the server acknowledges)
    const sequence = bot.registry.version['>=']('1.19') ? bot._lastPlaceSequence : null

    let newBlock = bot.blockAt(dest)
    if (oldBlock.type === newBlock.type) {
      [oldBlock, newBlock] = await waitForPlacement(dest, oldBlock, sequence, failSafeTicks)
    }

    // blockUpdate emits (null, null) when the world unloads
    if (!oldBlock && !newBlock) {
      return
    }
    if (oldBlock?.type === newBlock.type) {
      throw new Error(`No block has been placed : the block is still ${oldBlock?.name}`)
    } else {
      bot.emit('blockPlaced', oldBlock, newBlock)
    }
  }

  async function placeBlock (referenceBlock, faceVector) {
    await placeBlockWithOptions(referenceBlock, faceVector, { swingArm: 'right' })
  }

  bot.placeBlock = placeBlock
  bot._placeBlockWithOptions = placeBlockWithOptions
}
