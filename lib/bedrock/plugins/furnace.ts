import type { Stack } from '../modules/items.ts'
import { FURNACE_TYPES, furnaceScreen } from '../screens/furnace.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

/** the furnace, blast furnace and smoker screens */
export default function furnace (bot: BedrockBotInternal): void {
  const itemName = ({ networkId }: Stack): string | undefined => bot.registry.items[networkId]?.name
  for (const type of FURNACE_TYPES) bot._inventory.screens.add(furnaceScreen(type, itemName))
}
