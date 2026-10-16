const assert = require('assert')
const { Vec3 } = require('vec3')
const { sleep, onceWithCleanup } = require('../promise_utils')
const { once } = require('../promise_utils')

module.exports = inject

function inject (bot) {
  const Item = require('prismarine-item')(bot.registry)

  // these features only work when you are in creative mode.
  bot.creative = {
    setInventorySlot,
    flyTo,
    startFlying,
    stopFlying,
    clearSlot: slotNum => setInventorySlot(slotNum, null),
    clearInventory
  }

  // the update of each slot still waiting for the server: { item, superseded } (called when another call sets the slot)
  const creativeSlotsUpdates = []

  // A slot set again before the server answered the first call is sent again too, as vanilla's creative screen sends
  // every change (ServerboundSetCreativeModeSlotPacket): the earlier call stops waiting and resolves.
  async function setInventorySlot (slot, item, waitTimeout = 400) {
    assert(slot >= 0 && slot <= 44)

    // (the item of a call still waiting for the server, which the slot does not hold yet before 1.21.3)
    const pending = creativeSlotsUpdates[slot]
    if (Item.equal(pending ? pending.item : bot.inventory.slots[slot], item, true)) return
    pending?.superseded()
    const update = { item }
    const superseded = new Promise(resolve => { update.superseded = resolve })
    creativeSlotsUpdates[slot] = update
    const done = () => { if (creativeSlotsUpdates[slot] === update) creativeSlotsUpdates[slot] = null }
    bot._client.write('set_creative_slot', {
      slot,
      item: Item.toNotch(item)
    })

    if (bot.supportFeature('noAckOnCreateSetSlotPacket')) {
      // No ack
      bot._setSlot(slot, item)
      if (waitTimeout === 0) return done() // no wait
      // allow some time to see if server rejects
      return new Promise((resolve, reject) => {
        function updateSlot (oldItem, newItem) {
          // (another call's item, which it set itself)
          if (creativeSlotsUpdates[slot] !== update) return
          if (newItem?.itemId !== item?.itemId) {
            finish()
            reject(Error('Server rejected'))
          }
        }
        const timer = setTimeout(() => { finish(); resolve() }, waitTimeout)
        function finish () {
          clearTimeout(timer)
          bot.inventory.off(`updateSlot:${slot}`, updateSlot)
          done()
        }
        bot.inventory.once(`updateSlot:${slot}`, updateSlot)
        superseded.then(() => { finish(); resolve() })
      })
    }

    await Promise.race([
      onceWithCleanup(bot.inventory, `updateSlot:${slot}`, {
        timeout: 5000,
        checkCondition: (oldItem, newItem) => item === null ? newItem === null : newItem?.name === item.name && newItem?.count === item.count && newItem?.metadata === item.metadata
      }),
      superseded
    ]).finally(done)
  }

  async function clearInventory () {
    return Promise.all(bot.inventory.slots.filter(item => item).map(item => setInventorySlot(item.slot, null)))
  }

  const flyingSpeedPerUpdate = 0.5

  // straight line, so make sure there's a clear path.
  async function flyTo (destination) {
    // TODO: consider sending 0x13
    startFlying()

    let vector = destination.minus(bot.entity.position)
    let magnitude = vecMagnitude(vector)

    while (magnitude > flyingSpeedPerUpdate) {
      bot.physicsSettings.gravity = 0
      bot.entity.velocity = new Vec3(0, 0, 0)

      // small steps
      const normalizedVector = vector.scaled(1 / magnitude)
      bot.entity.position.add(normalizedVector.scaled(flyingSpeedPerUpdate))

      await sleep(50)

      vector = destination.minus(bot.entity.position)
      magnitude = vecMagnitude(vector)
    }

    // last step
    bot.entity.position = destination
    await once(bot, 'move', /* no timeout */ 0)
  }

  function startFlying () {
    bot.physicsSettings.overrides.gravity = 0
  }

  function stopFlying () {
    bot.physicsSettings.overrides.gravity = 0.08
  }
}

// this should be in the vector library
function vecMagnitude (vec) {
  return Math.sqrt(vec.x * vec.x + vec.y * vec.y + vec.z * vec.z)
}
