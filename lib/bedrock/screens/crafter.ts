import { fixedContainerScreen } from './container.ts'

/**
 * The crafter's screen (from 1.20.50): its 9 slots, which requests name container, not crafter, as recorded from 1.21.0.
 * Java's crafter_3x3 has a result slot after them, which Bedrock's screen has not.
 */
export const CRAFTER_SCREEN = fixedContainerScreen('crafter', 'minecraft:crafter_3x3', 'Crafter', 9)
