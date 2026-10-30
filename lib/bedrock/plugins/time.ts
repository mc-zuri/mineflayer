import type { Time, TimeNotSynced } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// Bedrock sends the time (set_time up to 1.26.20, world clocks from 1.26.30) and the world's age (start_game) apart,
// in either order: bot.time stays NOT_SYNCED until both are known. Between the server's packets, both advance by one
// every client tick, the time only while the day goes on.

interface GameRule {
  name: string
  value?: boolean | number | undefined
}

interface WorldClock {
  name?: string
  time: number
  paused: boolean
}

const OWNER = 'time'
const TICKS_PER_DAY = 24000n
const OVERWORLD_CLOCK = 'minecraft:overworld'

const NOT_SYNCED: TimeNotSynced = Object.freeze({
  doDaylightCycle: null,
  bigTime: null,
  time: null,
  timeOfDay: null,
  day: null,
  isDay: null,
  moonPhase: null,
  bigAge: null,
  age: null
})

function timeOf (time: bigint, age: bigint, doDaylightCycle: boolean): Time {
  const timeOfDay = ((time % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY
  const day = (time - timeOfDay) / TICKS_PER_DAY
  return {
    doDaylightCycle,
    bigTime: time,
    time: Number(time),
    timeOfDay: Number(timeOfDay),
    day: Number(day),
    isDay: timeOfDay < 13000n,
    moonPhase: Number(((day % 8n) + 8n) % 8n),
    bigAge: age,
    age: Number(age)
  }
}

function daylightCycleRule (rules: Iterable<GameRule>): boolean | undefined {
  for (const rule of rules) {
    // doDayLightCycle in later versions
    if (rule.name.toLowerCase() === 'dodaylightcycle' && typeof rule.value === 'boolean') return rule.value
  }
  return undefined
}

export default function inject (bot: BedrockBotInternal): void {
  bot.time = { ...NOT_SYNCED }
  let time: bigint | undefined
  let age: bigint | undefined
  let daylightCycleRuleOn = true
  // a world clock is not paused when the game rule stops the day: both must let it advance
  let clockPaused = false
  const clocks = new Map<bigint, WorldClock>()

  function update (emitTime: boolean): void {
    if (time === undefined || age === undefined) return
    bot.time = timeOf(time, age, daylightCycleRuleOn && !clockPaused)
    if (emitTime) bot.emit('time')
  }

  function takeTimeFromOverworldClock (): void {
    const named = [...clocks.values()].find(clock => clock.name === OVERWORLD_CLOCK)
    // until the server names its clocks, the only one is the overworld's
    const clock = named ?? (clocks.size === 1 ? [...clocks.values()][0] : undefined)
    if (clock === undefined) return
    time = BigInt(clock.time)
    clockPaused = clock.paused
    update(true)
  }

  bot._core.observe(OWNER, 'start_game', (packet) => {
    age = packet.current_tick.valueOf()
    daylightCycleRuleOn = daylightCycleRule(packet.gamerules) ?? daylightCycleRuleOn
    update(true)
  })

  bot._core.handle(OWNER, 'set_time', (packet) => {
    time = BigInt(packet.time)
    update(true)
  })

  bot._core.handle(OWNER, 'game_rules_changed', (packet) => {
    const rule = daylightCycleRule(packet.rules)
    if (rule === undefined) return
    daylightCycleRuleOn = rule
    update(true)
  })

  // the server's answer to the bot's tick_sync (up to 1.20.50) carries its current tick
  bot._core.handle(OWNER, 'tick_sync', (packet) => {
    const serverTick = packet.response_time.valueOf()
    if (serverTick === 0n) return
    age = serverTick
    update(false)
  })

  bot._core.handle(OWNER, 'sync_world_clocks', (packet) => {
    if (packet.payload_type !== 'initialize_registry' && packet.payload_type !== 'sync_state') return
    for (const clock of packet.clocks ?? []) {
      clocks.set(clock.id, { name: clock.name, time: clock.time, paused: clock.paused })
    }
    for (const state of packet.sync_states ?? []) {
      clocks.set(state.clock_id, { ...clocks.get(state.clock_id), time: state.time, paused: state.paused })
    }
    takeTimeFromOverworldClock()
  })

  bot._core.endOfTick(OWNER, () => {
    if (age !== undefined) age++
    if (time !== undefined && daylightCycleRuleOn && !clockPaused) time++
    update(false)
  })
}
