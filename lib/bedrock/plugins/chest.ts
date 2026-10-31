import type { Block } from 'prismarine-block'
import type { Entity } from 'prismarine-entity'
import type { Window } from 'prismarine-windows'
import type { Vec3 } from 'vec3'
import { containerScreen } from '../screens/container.ts'
import { CRAFTER_SCREEN } from '../screens/crafter.ts'
import { DISPENSER_SCREEN } from '../screens/dispenser.ts'
import { DROPPER_SCREEN } from '../screens/dropper.ts'
import { HOPPER_SCREEN } from '../screens/hopper.ts'
import type { Chest } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

/** the blocks Java's openContainer opens, by their Bedrock names; a shulker box of any colour too */
const CONTAINER_BLOCKS: readonly string[] = Object.freeze(['chest', 'trapped_chest', 'ender_chest', 'barrel', 'dispenser', 'dropper', 'hopper'])
/** the windows Java's openContainer resolves with, by the start of their type */
const CONTAINER_WINDOWS: readonly string[] = Object.freeze(['minecraft:generic', 'minecraft:chest', 'minecraft:dispenser', 'minecraft:shulker_box', 'minecraft:hopper', 'minecraft:container', 'minecraft:dropper'])

function isContainerBlock ({ name }: Block): boolean {
  return CONTAINER_BLOCKS.includes(name) || name.endsWith('shulker_box')
}

/** a container's window, with Java's close, deposit and withdraw (the windows plugin's) */
function isChest (window: Window): window is Chest {
  return CONTAINER_WINDOWS.some(type => String(window.type).startsWith(type)) && 'deposit' in window
}

/** The container screens (chests, barrels, shulker boxes, hoppers, dispensers, droppers, crafters), and Java's openContainer. */
export default function chest (bot: BedrockBotInternal): void {
  const { screens } = bot._inventory
  screens.add(containerScreen(point => bot.blockAt(point)))
  for (const screen of [HOPPER_SCREEN, DISPENSER_SCREEN, DROPPER_SCREEN, CRAFTER_SCREEN]) screens.add(screen)

  /** Java's defaults (the top face's centre) are not passed: openBlock clicks where the look meets the block, as the vanilla client */
  async function openContainer (target: Block | Entity, direction?: Vec3, cursorPos?: Vec3): Promise<Chest> {
    if (!('stateId' in target)) throw new Error('openContainer does not open an entity\'s container on Bedrock yet')
    if (!isContainerBlock(target)) throw new Error('containerToOpen is neither a block nor an entity')
    const window = await bot.openBlock(target, direction, cursorPos)
    if (!isChest(window)) throw new Error(`Non-container window used as a container: ${JSON.stringify({ id: window.id, type: window.type, title: window.title })}`)
    return window
  }

  bot.openContainer = openContainer
  bot.openChest = openContainer
  bot.openDispenser = openContainer
}
