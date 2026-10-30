import type { ChatMessage } from 'prismarine-chat'
import { bedrockText } from '../text.ts'
import type { BedrockText } from '../text.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BossBar } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets, BedrockServerboundPackets } from '../../types/protocol/bedrock-client.ts'

// A Bedrock boss bar is a boss entity's (the ender dragon's, the wither's): boss_event's show_bar shows it, its other
// types change or hide it. The vanilla client shows the bar of an entity it has only, and tells the server so
// (register_player); the bar goes with its entity, which the server does not hide it for.

type BossEvent = BedrockClientboundPackets['boss_event']
type BossEventType = BossEvent['type']

interface Shown {
  bar: BedrockBossBar
  /** as the server sent them: the answers carry them from 1.26.30 */
  title: string
  filteredTitle: string
}

const OWNER = 'boss_bar'
// numbered up to 1.26.20, named from 1.26.30
const COLORS = Object.freeze(['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'rebecca_purple', 'white'] as const)
const OVERLAYS = Object.freeze(['progress', 'notched_6', 'notched_10', 'notched_12', 'notched_20'] as const)
const DIVIDERS: readonly number[] = Object.freeze([0, 6, 10, 12, 20])
const UPDATES: readonly BossEventType[] = Object.freeze(['show_bar', 'set_bar_progress', 'set_bar_title', 'update_properties', 'texture'])

class BedrockBossBar implements BossBar {
  entityUUID: string
  title: ChatMessage
  health = 0
  // up to 1.16.210 show_bar has no style
  dividers: number | undefined = 0
  color: BossBar['color'] = undefined
  shouldDarkenSky = false
  isDragonBar = false
  createFog = false

  constructor (entityUUID: string, title: ChatMessage) {
    this.entityUUID = entityUUID
    this.title = title
  }

  get shouldCreateFog (): boolean {
    return this.createFog
  }

  get flags (): number {
    return (this.shouldDarkenSky ? 0x1 : 0) | (this.isDragonBar ? 0x2 : 0) | (this.createFog ? 0x4 : 0)
  }

  set flags (flags: number) {
    this.shouldDarkenSky = (flags & 0x1) !== 0
    this.isDragonBar = (flags & 0x2) !== 0
    this.createFog = (flags & 0x4) !== 0
  }
}

/** Java has no rebecca purple */
function javaColor (color: NonNullable<BossEvent['color']>): BossBar['color'] {
  const name = typeof color === 'number' ? COLORS[color] : color
  return name === 'rebecca_purple' ? undefined : name
}

function dividersOf (overlay: NonNullable<BossEvent['overlay']>): number | undefined {
  return DIVIDERS[typeof overlay === 'number' ? overlay : OVERLAYS.indexOf(overlay)]
}

export default function inject (bot: BedrockBotInternal): void {
  // made at the first bar: a bot pays for the version's language (about 8 ms) only when it shows one
  let text: BedrockText | undefined
  const bars = new Map<bigint, Shown>()
  // the unique ids of the entities the server added
  const entities = new Set<bigint>()
  let localUniqueId = 0n
  // from 1.26.30 every type has every field; from 1.26.51 without the player
  const oneLayout = isBedrockVersionAtLeast(bot.version, 'bedrock_1.26.30')
  const withPlayer = !isBedrockVersionAtLeast(bot.version, 'bedrock_1.26.51')

  /** the server sends the entity's name key, which the vanilla client translates */
  function titleOf (title: string): ChatMessage {
    text ??= bedrockText(bot.registry)
    return Object.hasOwn(text.language, title) ? text.translation(title, []) : text.text(title)
  }

  /** the fields of the packet's type: from 1.26.30 the packet has the others too */
  function update (shown: Shown, packet: BossEvent): void {
    const { bar } = shown
    const { type } = packet
    if (type === 'show_bar' || type === 'set_bar_title') {
      shown.title = packet.title!
      shown.filteredTitle = packet.filtered_title ?? ''
      bar.title = titleOf(packet.title!)
    }
    if (type === 'show_bar' || type === 'set_bar_progress') bar.health = (packet.progress ?? packet.bar_progress)!
    // up to 1.16.210 only texture has the style
    if ((type === 'show_bar' || type === 'update_properties' || type === 'texture') && packet.color !== undefined) {
      bar.color = javaColor(packet.color)
      bar.dividers = dividersOf(packet.overlay!)
    }
    // show_bar and update_properties have it (up to 1.16.210 update_properties only), no type from 1.26.30
    const darkening = packet.screen_darkening ?? packet.darkness_factor
    if (darkening !== undefined) bar.shouldDarkenSky = darkening !== 0
  }

  function answer (type: 'register_player' | 'unregister_player', uniqueId: bigint, { title, filteredTitle }: Shown): BedrockServerboundPackets['boss_event'] {
    if (!oneLayout) return { boss_entity_id: uniqueId, type, player_id: localUniqueId }
    // as recorded: the bar's titles, and neither its progress nor its style
    const fields = { target_entity_id: uniqueId, type, title, filtered_title: filteredTitle, progress: 0, color: 'blue', overlay: 'progress' } as const
    return withPlayer ? { ...fields, player_id: localUniqueId } : fields
  }

  function remove (uniqueId: bigint): void {
    const shown = bars.get(uniqueId)
    if (shown === undefined) return
    bot._core.emit(bot, 'bossBarDeleted', shown.bar)
    bars.delete(uniqueId)
  }

  bot._core.handle(OWNER, 'boss_event', (packet, ctx) => {
    const uniqueId = (packet.target_entity_id ?? packet.boss_entity_id)!
    const shown = bars.get(uniqueId)
    if (shown === undefined) {
      // the vanilla client shows no bar of an entity it has not (yet): the server shows it again
      if (packet.type !== 'show_bar' || !entities.has(uniqueId)) return
      const created = { bar: new BedrockBossBar(String(uniqueId), titleOf(packet.title!)), title: '', filteredTitle: '' }
      update(created, packet)
      bars.set(uniqueId, created)
      bot._core.emit(bot, 'bossBarCreated', created.bar)
      ctx.outbox.queue('boss_event', answer('register_player', uniqueId, created))
    } else if (packet.type === 'hide_bar') {
      remove(uniqueId)
      ctx.outbox.queue('boss_event', answer('unregister_player', uniqueId, shown))
    } else if (UPDATES.includes(packet.type)) {
      update(shown, packet)
      bot._core.emit(bot, 'bossBarUpdated', shown.bar)
    }
  })

  bot._core.observe(OWNER, 'start_game', ({ entity_id: uniqueId }) => { localUniqueId = uniqueId })

  // up to 1.19.1 the unique id is entity_id_self
  bot._core.observe(OWNER, 'add_entity', (packet) => { entities.add((packet.unique_id ?? packet.entity_id_self)!) })

  bot._core.observe(OWNER, 'remove_entity', ({ entity_id_self: uniqueId }) => {
    entities.delete(uniqueId)
    remove(uniqueId)
  })

  // the vanilla client drops its entities there, and their bars with them
  bot._core.observe(OWNER, 'change_dimension', () => {
    entities.clear()
    for (const uniqueId of bars.keys()) remove(uniqueId)
  })

  Object.defineProperty(bot, 'bossBars', { get: () => [...bars.values()].map(({ bar }) => bar) })
}
