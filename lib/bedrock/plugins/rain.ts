import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// bot.isRaining, bot.rainState and bot.thunderState, as Java's: start_game's rain and lightning levels, then level_event's
// start and stop of the rain and the thunder. The vanilla client eases the sky towards a level; the bot takes it at once.

const OWNER = 'rain'
/** level_event's data of a full rain or thunder */
const FULL_LEVEL = 65535

function levelOf (data: number): number {
  return Math.min(data / FULL_LEVEL, 1)
}

export default function inject (bot: BedrockBotInternal): void {
  bot.isRaining = false
  bot.rainState = 0
  bot.thunderState = 0

  /** rain when it starts or stops raining, then weatherUpdate when a level changes, as Java's */
  function setWeather (isRaining: boolean, rainState: number, thunderState: number): void {
    const rainChanged = isRaining !== bot.isRaining
    const levelChanged = rainState !== bot.rainState || thunderState !== bot.thunderState
    Object.assign(bot, { isRaining, rainState, thunderState })
    if (rainChanged) bot._core.emit(bot, 'rain')
    if (levelChanged) bot._core.emit(bot, 'weatherUpdate')
  }

  bot._core.observe(OWNER, 'start_game', packet => {
    setWeather(packet.rain_level > 0, packet.rain_level, packet.lightning_level)
  })

  bot._core.observe(OWNER, 'level_event', ({ event, data }) => {
    if (event === 'start_rain') setWeather(true, levelOf(data), bot.thunderState)
    else if (event === 'stop_rain') setWeather(false, 0, bot.thunderState)
    else if (event === 'start_thunder') setWeather(bot.isRaining, bot.rainState, levelOf(data))
    else if (event === 'stop_thunder') setWeather(bot.isRaining, bot.rainState, 0)
  })
}
