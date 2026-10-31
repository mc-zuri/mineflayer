import assert from 'assert'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

const QUICK_BAR_START = 36

/** Java's simple_inventory: the hotbar selection */
export default function simpleInventory (bot: BedrockBotInternal): void {
  bot.QUICK_BAR_START = QUICK_BAR_START

  bot.setQuickBarSlot = slot => {
    assert.ok(slot >= 0)
    assert.ok(slot < 9)
    bot._inventory.askSlot(bot._core, slot)
  }
}
