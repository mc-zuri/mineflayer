import { bedrockText } from '../text.ts'
import type { BedrockText } from '../text.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

// set_title shows, times or clears the title and the subtitle, as Java's title packets; its JSON types carry rawtext.
// Its action bar types are chat's (actionBar), as on Java, where the action bar comes as a chat message.

const OWNER = 'title'
// up to 1.16.201 minecraft-data reads the type as its number
const TYPES = Object.freeze(['clear', 'reset', 'set_title', 'set_subtitle', 'action_bar_message', 'set_durations', 'set_title_json', 'set_subtitle_json', 'action_bar_message_json'] as const)

export default function inject (bot: BedrockBotInternal): void {
  // made at the first title: a bot pays for the version's language (about 8 ms) only when it shows one
  let text: BedrockText | undefined

  function showTitle (title: string, json: boolean, type: 'title' | 'subtitle'): void {
    text ??= bedrockText(bot.registry)
    const message = json ? text.rawText(title) : text.text(title)
    // the vanilla client shows nothing of JSON that is not rawtext
    if (message === undefined) return
    bot._core.emit(bot, 'title', message.toString(), type)
  }

  bot._core.handle(OWNER, 'set_title', (packet) => {
    const type = typeof packet.type === 'number' ? TYPES[packet.type] : packet.type
    if (type === 'set_title' || type === 'set_title_json') showTitle(packet.text, type === 'set_title_json', 'title')
    else if (type === 'set_subtitle' || type === 'set_subtitle_json') showTitle(packet.text, type === 'set_subtitle_json', 'subtitle')
    else if (type === 'set_durations') bot._core.emit(bot, 'title_times', packet.fade_in_time, packet.stay_time, packet.fade_out_time)
    else if (type === 'clear' || type === 'reset') bot._core.emit(bot, 'title_clear')
  })
}
