const nbt = require('prismarine-nbt')
module.exports = inject

// 26.1+: the world clocks vanilla registers (WorldClocks.bootstrap, in minecraft:world_clock order) and the clock each
// built-in dimension type follows (DimensionTypes.bootstrap: default_clock; the nether has none)
const VANILLA_CLOCKS = ['overworld', 'the_end']
const VANILLA_DEFAULT_CLOCKS = { overworld: 'overworld', overworld_caves: 'overworld', the_end: 'the_end' }

function inject (bot) {
  bot.time = {
    doDaylightCycle: null,
    bigTime: null,
    time: null,
    timeOfDay: null,
    day: null,
    isDay: null,
    moonPhase: null,
    bigAge: null,
    age: null
  }

  // 26.1+: update_time names each clock by its index in the minecraft:world_clock registry, and a dimension shows the
  // clock its dimension type names as default_clock (registry_data entries carry it when the server sends their data)
  let clockNames = VANILLA_CLOCKS
  const defaultClocks = { ...VANILLA_DEFAULT_CLOCKS }
  const clocks = {}
  bot._client.on('registry_data', (packet) => {
    if (packet.id === 'minecraft:world_clock') {
      clockNames = packet.entries.map(entry => entry.key.replace('minecraft:', ''))
    } else if (packet.id === 'minecraft:dimension_type') {
      for (const entry of packet.entries) {
        if (!entry.value) continue
        const defaultClock = nbt.simplify(entry.value).default_clock
        defaultClocks[entry.key.replace('minecraft:', '')] = defaultClock?.replace('minecraft:', '')
      }
    }
  })

  bot._client.on('update_time', (packet) => {
    const age = longToBigInt(packet.age)
    let time, doDaylightCycle
    if (packet.clockUpdates) {
      for (const update of packet.clockUpdates) clocks[clockNames[update.id] ?? String(update.id)] = update
      // a dimension without a clock of its own (the nether) tells the overworld's, as the older versions' level time
      const clock = clocks[defaultClocks[bot.game.dimension] ?? 'overworld']
      time = BigInt(clock?.totalTicks ?? 0)
      doDaylightCycle = (clock?.rate ?? 0) > 0
    } else {
      time = longToBigInt(packet.time)
      doDaylightCycle = packet.tickDayTime !== undefined ? !!packet.tickDayTime : time >= 0n
    }
    // When doDaylightCycle is false, we need to take the absolute value of time
    const finalTime = doDaylightCycle ? time : (time < 0n ? -time : time)

    bot.time.doDaylightCycle = doDaylightCycle
    bot.time.bigTime = finalTime
    bot.time.time = Number(finalTime)
    bot.time.timeOfDay = bot.time.time % 24000
    bot.time.day = Math.floor(bot.time.time / 24000)
    bot.time.isDay = bot.time.timeOfDay >= 0 && bot.time.timeOfDay < 13000
    bot.time.moonPhase = bot.time.day % 8
    bot.time.bigAge = age
    bot.time.age = Number(age)

    bot.emit('time')
  })
}

function longToBigInt (arr) {
  return BigInt.asIntN(64, (BigInt(arr[0]) << 32n)) | BigInt(arr[1])
}
