import { fixedContainerScreen } from './container.ts'
import type { EntityNameOf } from './container.ts'
import type { ScreenDefinition } from '../modules/screens.ts'

/** The hopper's screen, and a hopper minecart's: its 5 slots, as on every version recorded. */
export function hopperScreen (type: 'hopper' | 'minecart_hopper', nameOf: EntityNameOf): ScreenDefinition {
  return fixedContainerScreen(type, 'minecraft:hopper', 'Hopper', 5, nameOf)
}
