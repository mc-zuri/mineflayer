import prismarineChat from 'prismarine-chat'
import type { ChatMessage } from 'prismarine-chat'
import type { Tags, TagType } from 'prismarine-nbt'
import type { Registry } from 'prismarine-registry'
import type { BossBar as BossBarApi } from './types/api/index.ts'

const colors = ['pink', 'blue', 'red', 'green', 'yellow', 'purple', 'white'] as const
const divisions = [0, 6, 10, 12, 20] as const

/** a boss bar's color, which the packets give by its index in colors */
export type BossBarColor = typeof colors[number]
/** a boss bar's title as the packets give it: JSON text before 1.20.3, an NBT text component from 1.20.3 */
export type BossBarTitle = string | Tags[TagType]

function loader (registry: Registry) {
  const ChatMessage = prismarineChat(registry)
  return class BossBar implements BossBarApi {
    private declare _entityUUID: string
    private declare _title: ChatMessage
    private declare _health: number
    private declare _dividers: number | undefined
    private declare _color: BossBarColor | undefined
    private declare _shouldDarkenSky: boolean
    private declare _isDragonBar: boolean
    private declare _createFog: boolean

    /** dividers and color: the packet's indexes of the bar's style and color; flags: its flags' bits */
    constructor (uuid: string, title: BossBarTitle, health: number, dividers: number, color: number, flags: number) {
      this._entityUUID = uuid
      this.title = title
      this._health = health
      this._dividers = divisions[dividers]
      this._color = colors[color]
      this.flags = flags
    }

    set entityUUID (uuid: string) {
      this._entityUUID = uuid
    }

    set title (title: BossBarTitle) {
      // JSON text before 1.20.3, an NBT text component (a bare string tag included) from 1.20.3
      this._title = ChatMessage.fromNotch(title)
    }

    set health (health: number) {
      this._health = health
    }

    /** the packet's index of the bar's style */
    set dividers (dividers: number) {
      this._dividers = divisions[dividers]
    }

    /** the packet's index of the bar's color */
    set color (color: number) {
      this._color = colors[color]
    }

    set flags (flags: number) {
      this._shouldDarkenSky = (flags & 0x1) !== 0
      this._isDragonBar = (flags & 0x2) !== 0
      this._createFog = (flags & 0x4) !== 0
    }

    get flags (): number {
      return (this._shouldDarkenSky ? 0x1 : 0) | (this._isDragonBar ? 0x2 : 0) | (this._createFog ? 0x4 : 0)
    }

    set shouldDarkenSky (darkenSky: boolean) {
      this._shouldDarkenSky = darkenSky
    }

    set isDragonBar (dragonBar: boolean) {
      this._isDragonBar = dragonBar
    }

    get createFog (): boolean {
      return this._createFog
    }

    set createFog (createFog: boolean) {
      this._createFog = createFog
    }

    get entityUUID (): string {
      return this._entityUUID
    }

    get title (): ChatMessage {
      return this._title
    }

    get health (): number {
      return this._health
    }

    get dividers (): number | undefined {
      return this._dividers
    }

    get color (): BossBarColor | undefined {
      return this._color
    }

    get shouldDarkenSky (): boolean {
      return this._shouldDarkenSky
    }

    get isDragonBar (): boolean {
      return this._isDragonBar
    }

    get shouldCreateFog (): boolean {
      return this._createFog
    }
  }
}

export default loader
