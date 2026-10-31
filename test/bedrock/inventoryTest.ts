import assert from 'assert'
import type { Item } from 'prismarine-item'
import type { Move } from '../../lib/bedrock/modules/inventory.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockBotInternal } from '../../lib/types/bedrock-internal.ts'
import type { MCProtocol } from '../../lib/types/protocol/Bedrock.d.ts'
import { bedrockCodec } from './common/codec.ts'
import type { ManualDriver } from './common/driver.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Joined } from './common/world.ts'

// recorded packets of the vanilla client and its servers, grouped by how versions write them: the bot must send the client's, byte for byte

type ContainerSlotType = MCProtocol.Bedrock.Write.Types.ContainerSlotType

const CURSOR = Object.freeze({ container: 'cursor', slot: 0 } as const)

/** recorded: 4 planks given in hotbar slot 0, taken to the cursor on the inventory screen, 1 placed in the grid and 3 back, then the close */
interface Recorded {
  name: string
  from: BedrockVersion
  to: BedrockVersion
  runtimeId: bigint
  /** the client process's first item stack request of the recording */
  firstRequest: number
  /** inventory_content giving the planks, player_hotbar */
  given: readonly string[]
  /** interact mouse_over_entity and mob_equipment: what the player holds */
  heldFour: readonly string[]
  openInventory: string
  opened: string
  take: string
  taken: string
  heldNothing: readonly string[]
  placeOne: string
  placedOne: string
  placeThree: string
  placedThree: string
  heldThree: readonly string[]
  handBack: string
  close: string
  handedBack: string
  closed: string
  heldFourAgain: string
}

const RECORDED: readonly Recorded[] = [
  {
    // recorded on 1.16.201.2
    name: 'aux items wrapped with their runtime_id',
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    runtimeId: 11n,
    firstRequest: -957,
    given: ['310024980a0a080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0b0a0800000000000000'],
    openInventory: '21060b',
    opened: '2e04ff00050001',
    take: '930101f90e0100041b00980a3a000000',
    taken: '94010100f90e021b0100000000003a01000004980a00',
    heldNothing: ['210400000000000000000000000000', '1f0b00000000'],
    placeOne: '930101fd0e0101013a00980a0d1c0000',
    placedOne: '94010100fd0e023a01000003980a000d011c1c019a0a00',
    placeThree: '930101810f0101033a00980a1b000000',
    placedThree: '94010100810f023a0100000000001b01000003980a00',
    heldThree: ['210400000000000000000000000000', '1f0b0a0600000000000000'],
    handBack: '930101850f0101010d1c9a0a0c00980a00',
    close: '2f0400',
    handedBack: '94010100850f020d011c1c0000000c01000004980a00',
    closed: '2f0400',
    heldFourAgain: '1f0b0a0800000000000000'
  },
  {
    // recorded on 1.16.210.5
    name: 'aux items wrapped with their stack_id',
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    runtimeId: 11n,
    firstRequest: -4075,
    given: ['3100248a300a080000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0b0a0800000000000000'],
    openInventory: '21060b',
    opened: '2e04ff00050001',
    take: '930101d53f0100041b008a303a000000',
    taken: '94010100d53f021b010000000000003a010000048a300000',
    heldNothing: ['210400000000000000000000000000', '1f0b00000000'],
    placeOne: '930101d93f0101013a008a300d1c0000',
    placedOne: '94010100d93f023a010000038a3000000d011c1c018c300000',
    placeThree: '930101dd3f0101033a008a301b000000',
    placedThree: '94010100dd3f023a010000000000001b010000038a300000',
    heldThree: ['210400000000000000000000000000', '1f0b0a0600000000000000'],
    handBack: '930101e13f0101010d1c8c300c008a3000',
    close: '2f0400',
    handedBack: '94010100e13f020d011c1c000000000c010000048a300000',
    closed: '2f0400',
    heldFourAgain: '1f0b0a0800000000000000'
  },
  {
    // recorded on 1.16.220.2
    name: 'items with a count and metadata; mob_equipment after the auth input',
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.19.1',
    runtimeId: 11n,
    firstRequest: -785,
    given: ['3100240a04000001aa08984b0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0b0a04000000984b0a00000000000000000000000000'],
    openInventory: '21060b',
    opened: '2e04ff00050001',
    take: '930101a10c0100041b00aa083a000000',
    taken: '94010100a10c021b010000000000003a01000004aa080000',
    heldNothing: ['210400000000000000000000000000', '1f0b00000000'],
    placeOne: '930101a50c0101013a00aa080d1c0000',
    placedOne: '94010100a50c023a01000003aa0800000d011c1c01ac080000',
    placeThree: '930101a90c0101033a00aa081b000000',
    placedThree: '94010100a90c023a010000000000001b01000003aa080000',
    heldThree: ['210400000000000000000000000000', '1f0b0a03000000984b0a00000000000000000000000000'],
    handBack: '930101ad0c0101010d1cac080c00aa0800',
    close: '2f0400',
    handedBack: '94010100ad0c020d011c1c000000000c01000004aa080000',
    closed: '2f0400',
    heldFourAgain: '1f0b0a04000000984b0a00000000000000000000000000'
  },
  {
    // recorded on 1.19.10.3
    name: 'mob_equipment before the auth input',
    from: 'bedrock_1.19.10',
    to: 'bedrock_1.19.21',
    runtimeId: 10n,
    firstRequest: -3173,
    given: ['3100240a040000019a27ee5e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ee5e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101c9310100041b009a273a000000',
    taken: '94010100c931021b010000000000003a010000049a270000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '930101cd310101013a009a270d1c0000',
    placedOne: '94010100cd31023a010000039a2700000d011c1c019c270000',
    placeThree: '930101d1310101033a009a271b000000',
    placedThree: '94010100d131023a010000000000001b010000039a270000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ee5e0a00000000000000000000000000'],
    handBack: '930101d5310101010d1c9c270c009a2700',
    close: '2f0400',
    handedBack: '94010100d531020d011c1c000000000c010000049a270000',
    closed: '2f0400',
    heldFourAgain: '1f0a0a04000000ee5e0a00000000000000000000000000'
  },
  {
    // recorded on 1.19.30.4
    name: 'requests with a cause',
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    runtimeId: 10n,
    firstRequest: -3173,
    given: ['3100240a040000019a27f25e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000f25e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101c9310100041b009a273a000000ffffffff',
    taken: '94010100c931021b010000000000003a010000049a270000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '930101cd310101013a009a270d1c0000ffffffff',
    placedOne: '94010100cd31023a010000039a2700000d011c1c019c270000',
    placeThree: '930101d1310101033a009a271b000000ffffffff',
    placedThree: '94010100d131023a010000000000001b010000039a270000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000f25e0a00000000000000000000000000'],
    handBack: '930101d5310101010d1c9c270c009a2700ffffffff',
    close: '2f0400',
    handedBack: '94010100d531020d011c1c000000000c010000049a270000',
    closed: '2f0400',
    heldFourAgain: '1f0a0a04000000f25e0a00000000000000000000000000'
  },
  {
    // recorded on 1.19.50.2
    name: 'the containers renumbered',
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.20.80',
    runtimeId: 1n,
    firstRequest: -11,
    given: ['3100240a040000010c9a99010a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f010a040000009a99010a00000000000000000000000000'],
    openInventory: '210601',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101150100041c000c3b000000ffffffff',
    taken: '9401010015021c010000000000003b010000040c0000',
    heldNothing: ['210400000000000000000000000000', '1f0100000000'],
    placeOne: '930101190101013b000c0d1c0000ffffffff',
    placedOne: '9401010019023b010000030c00000d011c1c010e0000',
    placeThree: '9301011d0101033b000c1c000000ffffffff',
    placedThree: '940101001d023b010000000000001c010000030c0000',
    heldThree: ['210400000000000000000000000000', '1f010a030000009a99010a00000000000000000000000000'],
    handBack: '930101210101010d1c0e0c000c00ffffffff',
    close: '2f0400',
    handedBack: '9401010021020d011c1c000000000c010000040c0000',
    closed: '2f0400',
    heldFourAgain: '1f010a040000009a99010a00000000000000000000000000'
  },
  {
    // recorded on 1.21.0.3
    name: 'container_close with a window type',
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    runtimeId: 10n,
    firstRequest: -3943,
    given: ['3100240a04000001f02eecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101cd3d0100041c00f02e3b000000ffffffff',
    taken: '94010100cd3d021c010000000000003b01000004f02e0000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '930101d13d0101013b00f02e0d1c0000ffffffff',
    placedOne: '94010100d13d023b01000003f02e00000d011c1c01f22e0000',
    placeThree: '930101d53d0101033b00f02e1c000000ffffffff',
    placedThree: '94010100d53d023b010000000000001c01000003f02e0000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '930101d93d0101010d1cf22e0c00f02e00ffffffff',
    close: '2f04f700',
    handedBack: '94010100d93d020d011c1c000000000c01000004f02e0000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.20.3
    name: 'full container names with a dynamic id of 0',
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    runtimeId: 10n,
    firstRequest: -2307,
    given: ['3100240a04000001d021ecead8a80e0a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '93010185240100041c0000000000d0213b00000000000000ffffffff',
    taken: '940101008524021c00000000010000000000003b0000000001000004d0210000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '93010189240101013b0000000000d0210d000000001c0000ffffffff',
    placedOne: '940101008924023b0000000001000003d02100000d00000000011c1c01d2210000',
    placeThree: '9301018d240101033b0000000000d0211c00000000000000ffffffff',
    placedThree: '940101008d24023b00000000010000000000001c0000000001000003d0210000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '93010191240101010d000000001cd2210c0000000000d02100ffffffff',
    close: '2f04f700',
    handedBack: '940101009124020d00000000011c1c000000000c0000000001000004d0210000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.30.3
    name: 'full container names, inventory_content naming its container',
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    runtimeId: 10n,
    firstRequest: -2307,
    given: ['3100240a04000001d021ecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '93010185240100041c0000d0213b00000000ffffffff',
    taken: '940101008524021c00010000000000003b0001000004d0210000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '93010189240101013b0000d0210d001c0000ffffffff',
    placedOne: '940101008924023b0001000003d02100000d00011c1c01d2210000',
    placeThree: '9301018d240101033b0000d0211c00000000ffffffff',
    placedThree: '940101008d24023b00010000000000001c0001000003d0210000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '93010191240101010d001cd2210c0000d02100ffffffff',
    close: '2f04f700',
    handedBack: '940101009124020d00011c1c000000000c0001000004d0210000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.43.1
    name: 'inventory_content with a storage item',
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.42',
    runtimeId: 10n,
    firstRequest: -2351,
    given: ['3100240a04000001ba22ecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101dd240100041c0000ba223b00000000ffffffff',
    taken: '94010100dd24021c00010000000000003b0001000004ba220000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '930101e1240101013b0000ba220d001c0000ffffffff',
    placedOne: '94010100e124023b0001000003ba2200000d00011c1c01bc220000',
    placeThree: '930101e5240101033b0000ba221c00000000ffffffff',
    placedThree: '94010100e524023b00010000000000001c0001000003ba220000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '930101e9240101010d001cbc220c0000ba2200ffffffff',
    close: '2f04f700',
    handedBack: '94010100e924020d00011c1c000000000c0001000004ba220000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.50.7
    name: 'responses with a filtered custom name',
    from: 'bedrock_1.21.50',
    to: 'bedrock_1.21.111',
    runtimeId: 10n,
    firstRequest: -2351,
    given: ['3100240a04000001ba22ecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101dd240100041c0000ba223b00000000ffffffff',
    taken: '94010100dd24021c0001000000000000003b0001000004ba22000000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '930101e1240101013b0000ba220d001c0000ffffffff',
    placedOne: '94010100e124023b0001000003ba220000000d00011c1c01bc22000000',
    placeThree: '930101e5240101033b0000ba221c00000000ffffffff',
    placedThree: '94010100e524023b0001000000000000001c0001000003ba22000000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '930101e9240101010d001cbc220c0000ba2200ffffffff',
    close: '2f04f700',
    handedBack: '94010100e924020d00011c1c00000000000c0001000004ba22000000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.120.4
    name: 'container_close when the screen animation ends',
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    runtimeId: 10n,
    firstRequest: -2439,
    given: ['3100240a040000019624ecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['210400000000000000000000000000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a',
    opened: '2e04ff00c5ffffff0f0001',
    take: '9301018d260100041c000096243b00000000ffffffff',
    taken: '940101008d26021c0001000000000000003b00010000049624000000',
    heldNothing: ['210400000000000000000000000000', '1f0a00000000'],
    placeOne: '93010191260101013b000096240d001c0000ffffffff',
    placedOne: '940101009126023b000100000396240000000d00011c1c019824000000',
    placeThree: '93010195260101033b000096241c00000000ffffffff',
    placedThree: '940101009526023b0001000000000000001c00010000039624000000',
    heldThree: ['210400000000000000000000000000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '93010199260101010d001c98240c0000962400ffffffff',
    close: '2f04f700',
    handedBack: '940101009926020d00011c1c00000000000c00010000049624000000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.21.132.1
    name: 'interact with has_position',
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.10',
    runtimeId: 10n,
    firstRequest: -2415,
    given: ['3100240a04000001de23ecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f0a0a04000000ecead8a80e0a00000000000000000000000000'],
    openInventory: '21060a00',
    opened: '2e04ff00c5ffffff0f0001',
    take: '930101dd250100041c0000de233b00000000ffffffff',
    taken: '94010100dd25021c0001000000000000003b0001000004de23000000',
    heldNothing: ['21040000', '1f0a00000000'],
    placeOne: '930101e1250101013b0000de230d001c0000ffffffff',
    placedOne: '94010100e125023b0001000003de230000000d00011c1c01e023000000',
    placeThree: '930101e5250101033b0000de231c00000000ffffffff',
    placedThree: '94010100e525023b0001000000000000001c0001000003de23000000',
    heldThree: ['21040000', '1f0a0a03000000ecead8a80e0a00000000000000000000000000'],
    handBack: '930101e9250101010d001ce0230c0000de2300ffffffff',
    close: '2f04f700',
    handedBack: '94010100e925020d00011c1c00000000000c0001000004de23000000',
    closed: '2f04f700',
    heldFourAgain: '1f0a0a04000000ecead8a80e0a00000000000000000000000000'
  },
  {
    // recorded on 1.26.20.4
    name: 'mob_equipment with an ItemV4',
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.20',
    runtimeId: 9n,
    firstRequest: -1847,
    given: ['3100240a04000001d21eecead8a80e0a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f09050004000000b6b5ac94070a00000000000000000000000000'],
    openInventory: '21060900',
    opened: '2e04ff00750001',
    take: '930101ed1c0100041c0000d21e3b00000000ffffffff',
    taken: '94010100ed1c021c0001000000000000003b0001000004d21e000000',
    heldNothing: ['21040000', '1f090000000000000000000000'],
    placeOne: '930101f11c0101013b0000d21e0d001c0000ffffffff',
    placedOne: '94010100f11c023b0001000003d21e0000000d00011c1c01d41e000000',
    placeThree: '930101f51c0101033b0000d21e1c00000000ffffffff',
    placedThree: '94010100f51c023b0001000000000000001c0001000003d21e000000',
    heldThree: ['21040000', '1f09050003000000b6b5ac94070a00000000000000000000000000'],
    handBack: '930101f91c0101010d001cd41e0c0000d21e00ffffffff',
    close: '2f04f700',
    handedBack: '94010100f91c020d00011c1c00000000000c0001000004d21e000000',
    closed: '2f04f700',
    heldFourAgain: '1f09050004000000b6b5ac94070a00000000000000000000000000'
  },
  {
    // recorded on 1.26.30.5
    name: 'inventory_content with ItemV4s, stack ids as variants',
    from: 'bedrock_1.26.30',
    to: 'bedrock_1.26.30',
    runtimeId: 11n,
    firstRequest: -2439,
    given: ['310024050004000001009624b6b5ac94070a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f0b050004000000b6b5ac94070a00000000000000000000000000'],
    openInventory: '21060b00',
    opened: '2e04ff00750001',
    take: '9301018d260100041c000096243b00000000ffffffff',
    taken: '940101008d26021c0001000000000000003b00010000049624000000',
    heldNothing: ['21040000', '1f0b0000000000000000000000'],
    placeOne: '93010191260101013b000096240d001c0000ffffffff',
    placedOne: '940101009126023b000100000396240000000d00011c1c019824000000',
    placeThree: '93010195260101033b000096241c00000000ffffffff',
    placedThree: '940101009526023b0001000000000000001c00010000039624000000',
    heldThree: ['21040000', '1f0b050003000000b6b5ac94070a00000000000000000000000000'],
    handBack: '93010199260101010d001c98240c0000962400ffffffff',
    close: '2f04f700',
    handedBack: '940101009926020d00011c1c00000000000c00010000049624000000',
    closed: '2f04f700',
    heldFourAgain: '1f0b050004000000b6b5ac94070a00000000000000000000000000'
  },
  {
    // recorded on 1.26.40.5
    name: 'legacy action types, li32 stack ids, responses with presence flags',
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    runtimeId: 10n,
    firstRequest: -2439,
    given: ['310024050004000001f623b6b5ac94070a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f0a050004000000b6b5ac94070a00000000000000000000000000'],
    openInventory: '21060a00',
    opened: '2e04ff00750001',
    take: '9301018d26010000041c0000fb0800003b00000000000000ffffffff',
    taken: '940101008d260101021c000100000001000000003b00010000040101f623000000',
    heldNothing: ['21040000', '1f0a0000000000000000000000'],
    placeOne: '9301019126010101013b0000fb0800000d001c0000000000ffffffff',
    placedOne: '9401010091260101023b00010000030101f6230000000d00011c1c010101f823000000',
    placeThree: '9301019526010101033b0000fb0800001c00000000000000ffffffff',
    placedThree: '9401010095260101023b000100000001000000001c00010000030101f623000000',
    heldThree: ['21040000', '1f0a050003000000b6b5ac94070a00000000000000000000000000'],
    handBack: '9301019926010101010d001cfc0800000c0000fb08000000ffffffff',
    close: '2f04f700',
    handedBack: '9401010099260101020d00011c1c0001000000000c00010000040101f623000000',
    closed: '2f04f700',
    heldFourAgain: '1f0a050004000000b6b5ac94070a00000000000000000000000000'
  },
  {
    // recorded on 1.26.51.1
    name: 'responses with options',
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    runtimeId: 11n,
    firstRequest: -2305,
    given: ['310024050004000001ee21b6b5ac94070a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f0b050004000000b6b5ac94070a00000000000000000000000000'],
    openInventory: '21060b00',
    opened: '2e04ff00750001',
    take: '9301018124010000041c0000770800003b00000000000000ffffffff',
    taken: '94010100812401021c0001000000000000003b000100000401ee21000000',
    heldNothing: ['21040000', '1f0b0000000000000000000000'],
    placeOne: '9301018524010101013b0000770800000d001c0000000000ffffffff',
    placedOne: '94010100852401023b000100000301ee210000000d00011c1c0101f021000000',
    placeThree: '9301018924010101033b0000770800001c00000000000000ffffffff',
    placedThree: '94010100892401023b0001000000000000001c000100000301ee21000000',
    heldThree: ['21040000', '1f0b050003000000b6b5ac94070a00000000000000000000000000'],
    handBack: '9301018d24010101010d001c780800000c00007708000000ffffffff',
    close: '2f04f700',
    handedBack: '940101008d2401020d00011c1c00000000000c000100000401ee21000000',
    closed: '2f04f700',
    heldFourAgain: '1f0b050004000000b6b5ac94070a00000000000000000000000000'
  },
  {
    // recorded on 1.26.60.5, less the cursor drags its clicks bracket the places with, which a request does not send (clickTest.ts)
    name: 'clicks dragging the cursor',
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    runtimeId: 10n,
    firstRequest: -2471,
    given: ['310024050004000001f623b6b5ac94070a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000', '30000000'],
    heldFour: ['21040000', '1f0a050004000000b6b5ac94070a00000000000000000000000000'],
    openInventory: '21060a00',
    opened: '2e04ff00750001',
    take: '930101cd26010000041c0000fb0800003b00000000000000ffffffff',
    taken: '94010100cd2601021c0001000000000000003b000100000401f623000000',
    heldNothing: ['21040000', '1f0a0000000000000000000000'],
    placeOne: '930101d126010101013b0000fb0800000d001c0000000000ffffffff',
    placedOne: '94010100d12601023b000100000301f6230000000d00011c1c0101f823000000',
    placeThree: '930101d526010101033b0000fb0800001c00000000000000ffffffff',
    placedThree: '94010100d52601023b0001000000000000001c000100000301f623000000',
    heldThree: ['21040000', '1f0a050003000000b6b5ac94070a00000000000000000000000000'],
    handBack: '930101d926010101010d001cfc0800000c0000fb08000000ffffffff',
    close: '2f04f700',
    handedBack: '94010100d92601020d00011c1c00000000000c000100000401f623000000',
    closed: '2f04f700',
    heldFourAgain: '1f0a050004000000b6b5ac94070a00000000000000000000000000'
  }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function receive (server: FakeBedrockClient, ...hex: readonly string[]): void {
  for (const packet of hex) server.receive(Buffer.from(packet, 'hex'))
}

/** the packets the bot sent since the last call, as written, but its auth inputs and section requests */
function sentSince (server: FakeBedrockClient): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => name !== 'player_auth_input' && name !== 'subchunk_request')
      .map(({ name, params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

/** the packets of the bot's last batch, but its section requests */
function lastBatch (server: FakeBedrockClient): string[] {
  return (server.batches.at(-1) ?? []).map(({ name }) => name).filter(name => name !== 'subchunk_request')
}

/** a request of the bot's, made in the next input pass */
function request (internal: BedrockBotInternal, moves: readonly Move[]): Promise<void> {
  return new Promise((resolve, reject) => {
    internal._core.command(ctx => { internal._inventory.request(internal._core, ctx, moves).then(resolve, reject) })
  })
}

/** the frame in which the vanilla client sends container_close, after the close's, at the rate it was recorded at */
function closeFrame (version: BedrockVersion, screen: 'inventory' | 'workbench'): number {
  const halfRate = atLeast(version, 'bedrock_1.26.60')
  if (screen === 'inventory') return halfRate ? 5 : 9
  return halfRate ? 8 : 14
}

// at the vanilla client's recorded frame rate: 32 a second, 16 on 1.26.60
async function framesUntilClose (driver: ManualDriver, version: BedrockVersion, sent: () => string[], seen: (packets: string[]) => void = () => {}): Promise<number> {
  for (let frames = 1; frames <= 20; frames++) {
    await driver.frame(atLeast(version, 'bedrock_1.26.60') ? 62.5 : 31.25)
    const packets = sent()
    seen(packets)
    if (packets.some(packet => packet.startsWith('2f'))) return frames
  }
  return Infinity
}

/** the packets the bot sent in a tick, as written, but its auth input by name and its section requests */
function sentInTick (server: FakeBedrockClient, tick: number): string[] {
  return server.batches.flat().filter(packet => packet.tick === tick && packet.phase === 'T3' && packet.name !== 'subchunk_request')
    .map(({ name, params }) => name === 'player_auth_input' ? name : server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
}

/** a bot joined, its items named by start_game's palette up to 1.21.50, the server sending `atLogin` after start_game */
async function joined (version: BedrockVersion, runtimeId = 1n, options: { screenAnimations?: boolean } = {}, atLogin: readonly string[] = []): Promise<TestBot & Joined & { errors: string[] }> {
  const testBot = await bedrockTestBot(bedrockCodec(version), options)
  const world = new ServerWorld(testBot.server)
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  testBot.bot.once('login', () => { receive(testBot.server, ...atLogin) })
  const ticks = await world.join(testBot, { game: { runtime_entity_id: runtimeId, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  return { ...testBot, ...ticks, errors }
}

describe('bedrock inventory', () => {
  describe('request ids', () => {
    it('numbers the item stack requests -3, -5, -7 …, a client process\'s first connection telling the server its screens', async () => {
      const { internal } = await bedrockTestBot(bedrockCodec(latestSupportedBedrockVersion))
      const ids = internal._core.requestIds
      assert.strictEqual(ids.freshProcess, true)
      assert.deepStrictEqual([ids.nextStackRequest(), ids.nextStackRequest(), ids.nextStackRequest()], [-3, -5, -7])
      internal.end()
    })

    it('goes on with a process\'s ids from an earlier connection, and takes only a request id', async () => {
      const { internal } = await bedrockTestBot(bedrockCodec(latestSupportedBedrockVersion))
      const ids = internal._core.requestIds
      ids.continueProcess(-2297)
      assert.strictEqual(ids.freshProcess, false)
      assert.deepStrictEqual([ids.nextStackRequest(), ids.nextStackRequest()], [-2297, -2299])
      assert.throws(() => { ids.continueProcess(-4) }, { message: '-4 is no item stack request id: they are -3, -5, -7 …' })
      assert.throws(() => { ids.continueProcess(-1) }, { message: '-1 is no item stack request id: they are -3, -5, -7 …' })
      internal.end()
    })
  })

  for (const recorded of RECORDED) {
    describe(`${recorded.name} (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: holds, moves and hands back the planks as the vanilla client, telling what it holds`, async () => {
          const { bot, internal, server, driver, errors, firstAuthInput } = await joined(version, recorded.runtimeId)
          // shown with an empty hand, the vanilla client tells it in its first auth input's tick by the interact alone
          const [shown] = recorded.heldNothing
          assert.deepStrictEqual(sentInTick(server, firstAuthInput), atLeast(version, 'bedrock_1.19.10') ? [shown, 'player_auth_input'] : ['player_auth_input', shown])
          internal._core.requestIds.continueProcess(recorded.firstRequest)
          const sent = sentSince(server)
          const held: Array<Item | null> = []
          bot.on('heldItemChanged', item => { held.push(item) })

          receive(server, ...recorded.given)
          await driver.tick()
          assert.deepStrictEqual(sent(), recorded.heldFour)
          // up to 1.19.0 the vanilla client sends it after the tick's auth input, from 1.19.10 before
          const tick = internal._core.tick ?? 0
          assert.deepStrictEqual(server.inTick(tick).filter(name => name !== 'subchunk_request'),
            atLeast(version, 'bedrock_1.19.10') ? ['interact', 'mob_equipment', 'player_auth_input'] : ['player_auth_input', 'interact', 'mob_equipment'])
          const planks = bot.heldItem
          assert.deepStrictEqual([planks?.name, planks?.count, held.at(-1)], [bot.registry.items[5]?.name, 4, planks])

          let open = false
          const opening = bot.openInventory()
          opening.then(() => { open = true }, () => {})
          await driver.frame(10)
          assert.deepStrictEqual([sent(), open], [[recorded.openInventory], false])
          receive(server, recorded.opened)
          await driver.frame(10)
          assert.strictEqual(await opening, bot.inventory)
          assert.strictEqual(bot.currentWindow, bot.inventory)

          const take = request(internal, [{ type: 'take', count: 4, from: { container: 'hotbar', slot: 0 }, to: CURSOR }])
          await driver.tick()
          assert.deepStrictEqual(sent(), [recorded.take])
          // up to 1.19.0 the vanilla client sends it in the tick after its auth input, from 1.19.10 before
          assert.deepStrictEqual(lastBatch(server), atLeast(version, 'bedrock_1.19.10') ? ['item_stack_request', 'player_auth_input'] : ['player_auth_input', 'item_stack_request'])
          assert.deepStrictEqual([bot.heldItem, bot.inventory.selectedItem?.count], [null, 4])
          receive(server, recorded.taken)
          await driver.tick()
          assert.deepStrictEqual(sent(), recorded.heldNothing)
          await take

          const placeOne = request(internal, [{ type: 'place', count: 1, from: CURSOR, to: { container: 'crafting_input', slot: 28 } }])
          await driver.tick()
          assert.deepStrictEqual(sent(), [recorded.placeOne])
          receive(server, recorded.placedOne)
          await driver.tick()
          assert.deepStrictEqual(sent(), [])
          await placeOne
          const placeThree = request(internal, [{ type: 'place', count: 3, from: CURSOR, to: { container: 'hotbar', slot: 0 } }])
          await driver.tick()
          assert.deepStrictEqual(sent(), [recorded.placeThree])
          receive(server, recorded.placedThree)
          await driver.tick()
          assert.deepStrictEqual(sent(), recorded.heldThree)
          await placeThree
          assert.deepStrictEqual([bot.inventory.slots[1]?.count, bot.heldItem?.count, bot.inventory.selectedItem], [1, 3, null])

          const closing = bot.closeWindow(bot.inventory)
          await driver.frame(10)
          if (!atLeast(version, 'bedrock_1.21.120')) {
            assert.deepStrictEqual(sent(), [recorded.handBack, recorded.close])
            receive(server, recorded.handedBack, recorded.closed)
            await driver.tick()
            assert.deepStrictEqual(sent(), [recorded.heldFourAgain])
          } else {
            // from 1.21.120 the hand-back leaves in the next tick, the close in the frame after the screen's animation ended
            assert.deepStrictEqual(sent(), [])
            const after: string[] = []
            const frames = await framesUntilClose(driver, version, sent, packets => {
              after.push(...packets)
              if (!packets.includes(recorded.handBack)) return
              assert.deepStrictEqual(lastBatch(server), ['item_stack_request', 'player_auth_input'])
              receive(server, recorded.handedBack)
            })
            assert.deepStrictEqual([after, frames], [[recorded.handBack, recorded.heldFourAgain, recorded.close], closeFrame(version, 'inventory')])
            receive(server, recorded.closed)
            await driver.frame(10)
          }
          await closing
          assert.strictEqual(bot.currentWindow, null)
          assert.deepStrictEqual([bot.heldItem?.count, bot.heldItem?.stackId, bot.inventory.slots[1], held.at(-1)], [4, planks?.stackId, null, bot.heldItem])
          assert.deepStrictEqual(errors, [])
          bot.end()
        })
      }
    })
  }

  // recorded on 1.26.51.1; 1.26.60's client hands back the same, and closes at its recorded frame rate
  describe('the vanilla client handing back a screen\'s items, each to the stacks of its item before empty slots (1.26.51+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51')) {
      it(`bedrock ${version}: a bed to the first empty slot, the wool to the next, the planks to the one after`, async () => {
        const { bot, internal, server, driver, errors } = await joined(version)
        const inventory = new ServerInventory(server)
        internal._core.requestIds.continueProcess(-863)
        const sent = sentSince(server)
        let opened = null
        bot.on('windowOpen', window => { opened = window })
        receive(server, '2e090104770001')
        const idOf = (name: string): number => bot.registry.itemsByName[name]?.id ?? 0
        const [bed, wool, planks] = [idOf('bed'), idOf('white_wool'), idOf('oak_planks')]
        inventory.slot('ui', 0, { id: bed, count: 1, stackId: 392 })
        const grid: Array<[number, number, number]> = [[32, wool, 388], [33, wool, 389], [34, wool, 385], [35, planks, 390], [36, planks, 391], [37, planks, 387]]
        for (const [slot, id, stackId] of grid) inventory.slot('ui', slot, { id, count: 1, stackId })
        await driver.tick()
        const table = bot.currentWindow
        assert.strictEqual(opened, table)
        assert.deepStrictEqual([table?.type, table?.id, table?.slots.slice(1, 10).map(item => item?.name ?? null), table?.selectedItem?.name],
          ['minecraft:crafting_table', 9, ['white_wool', 'white_wool', 'white_wool', 'oak_planks', 'oak_planks', 'oak_planks', null, null, null], 'bed'])

        assert.ok(table !== null)
        const closing = bot.closeWindow(table)
        await driver.tick()
        assert.deepStrictEqual(sent(), ['930107bd0d010101013b0000880100000c00000000000000ffffffffc10d010101010d0020840100000c00010000000000ffffffffc50d010101010d0021850100000c00019ffcffff00ffffffffc90d010101010d0022810100000c00019dfcffff00ffffffffcd0d010101010d0023860100000c00020000000000ffffffffd10d010101010d0024870100000c000299fcffff00ffffffffd50d010101010d0025830100000c000297fcffff00ffffffff'])
        receive(server, '94010700bd0d01023b0001000000000000000c000100000101900600000000c10d01020d0001202000000000000c000101010101880600000000c50d01020d0001212100000000000c000101010201880600000000c90d01020d0001222200000000000c000101010301880600000000cd0d01020d0001232300000000000c0001020201018c0600000000d10d01020d0001242400000000000c0001020202018c0600000000d50d01020d0001252500000000000c0001020203018c06000000')
        const after: string[] = []
        const frames = await framesUntilClose(driver, version, sent, packets => { after.push(...packets) })
        // the bed handed back to the hand
        assert.deepStrictEqual([after, frames], [['21040000', '1f01a50101000000000a00000000000000000000000000', '2f09f700'], closeFrame(version, 'workbench')])
        receive(server, '2f09f700')
        await driver.frame(10)
        await closing
        assert.deepStrictEqual(bot.inventory.slots.slice(36, 39).map(item => [item?.name, item?.count, item?.stackId]), [['bed', 1, 392], ['white_wool', 3, 388], ['oak_planks', 3, 390]])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })

      it(`bedrock ${version}: the inventory's cursor onto a stack of its item, past an empty hotbar slot`, async () => {
        // recorded on 1.26.51.1
        const { bot, internal, server, driver, errors } = await joined(version)
        const inventory = new ServerInventory(server)
        internal._core.requestIds.continueProcess(-51)
        const planks: Given = { id: bot.registry.itemsByName['oak_planks']?.id ?? 0, count: 10, stackId: 24, blockRuntimeId: 1921718966 }
        inventory.slot('inventory', 9, planks)
        receive(server, '2e09ff00750001')
        inventory.slot('ui', 0, { ...planks, stackId: 23 })
        await driver.tick()
        const sent = sentSince(server)
        const closing = bot.closeWindow(bot.inventory)
        await driver.tick()
        assert.deepStrictEqual(sent(), ['930101650101010a3b0000170000000c00091800000000ffffffff'])
        receive(server, '940101006501023b0001000000000000000c00010909140130000000')
        const after: string[] = []
        const frames = await framesUntilClose(driver, version, sent, packets => { after.push(...packets) })
        assert.deepStrictEqual([after, frames], [['2f09f700'], closeFrame(version, 'inventory')])
        receive(server, '2f09f700')
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([bot.inventory.slots[9]?.count, bot.inventory.slots[9]?.stackId, bot.inventory.slots[36], bot.inventory.selectedItem], [20, 24, null, null])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })

      it(`bedrock ${version}: the grid's items with no room dropped, a request a slot, each after the arm's swing`, async () => {
        // recorded on 1.26.51.1: 17 planks left in each of a crafting table's first three slots, the inventory full of cobblestone
        const { bot, internal, server, driver, errors } = await joined(version)
        const inventory = new ServerInventory(server)
        internal._core.requestIds.continueProcess(-585)
        const idOf = (name: string): number => bot.registry.itemsByName[name]?.id ?? 0
        inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => ({ id: idOf('cobblestone'), count: 64, stackId: 152 + slot, blockRuntimeId: 1741778478 })))
        receive(server, '2e1d0104770001')
        for (const [slot, stackId] of [[32, 114], [33, 115], [34, 116]] as const) inventory.slot('ui', slot, { id: idOf('oak_planks'), count: 17, stackId, blockRuntimeId: 1921718966 })
        await driver.tick()
        const sent = sentSince(server)
        const closing = bot.closeWindow(bot.currentWindow ?? bot.inventory)
        await driver.tick()
        // from 1.26.60 the swing names the hand
        const swing = atLeast(version, 'bedrock_1.26.60') ? '2c010100000000010864726f706974656d00' : '2c010100000000010864726f706974656d'
        assert.deepStrictEqual(sent(), [swing, swing, swing, '9301039109010303110d0020720000000000ffffffff9509010303110d0021730000000000ffffffff9909010303110d0022740000000000ffffffff'])
        receive(server, '94010300910901010d00012020000000000000950901010d00012121000000000000990901010d000122220000000000')
        const after: string[] = []
        const frames = await framesUntilClose(driver, version, sent, packets => { after.push(...packets) })
        assert.deepStrictEqual([after, frames], [['2f1df700'], closeFrame(version, 'workbench')])
        receive(server, '2f1df700')
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([bot.inventory.slots.slice(1, 4), errors], [[null, null, null], []])
        bot.end()
      })

      it(`bedrock ${version}: the inventory's grid first, then its cursor`, async () => {
        const { bot, internal, server, driver, errors } = await joined(version)
        const inventory = new ServerInventory(server)
        internal._core.requestIds.continueProcess(-1043)
        const sent = sentSince(server)
        receive(server, '2e13ff00750001')
        inventory.slot('ui', 28, { id: bot.registry.itemsByName['poppy']?.id ?? 0, count: 1, stackId: 482 })
        inventory.slot('ui', 0, { id: bot.registry.itemsByName['red_dye']?.id ?? 0, count: 1, stackId: 483 })
        await driver.tick()
        const closing = bot.closeWindow(bot.inventory)
        await driver.tick()
        assert.deepStrictEqual(sent(), ['930102a510010101010d001ce20100000c00000000000000ffffffffa910010101013b0000e30100000c00010000000000ffffffff'])
        receive(server, '94010200a51001020d00011c1c00000000000c000100000101c40700000000a91001023b0001000000000000000c000101010101c607000000')
        const after: string[] = []
        const frames = await framesUntilClose(driver, version, sent, packets => { after.push(...packets) })
        // the poppy handed back to the hand
        assert.deepStrictEqual([after, frames], [['21040000', '1f01260001000000000a00000000000000000000000000', '2f13f700'], closeFrame(version, 'inventory')])
        receive(server, '2f13f700')
        await driver.frame(10)
        await closing
        assert.deepStrictEqual(bot.inventory.slots.slice(36, 38).map(item => [item?.name, item?.stackId]), [['poppy', 482], ['red_dye', 483]])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })
    }
  })

  describe('the vanilla client closing a crafting table at once, without screen animations (1.26.51+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.51')) {
      it(`bedrock ${version}: the grid's sticks to the hotbar, then the close, in one batch`, async () => {
        const { bot, internal, server, driver, errors } = await joined(version, 1n, { screenAnimations: false })
        const inventory = new ServerInventory(server)
        internal._core.requestIds.continueProcess(-79)
        const idOf = (name: string): number => bot.registry.itemsByName[name]?.id ?? 0
        inventory.slot('inventory', 0, { id: idOf('oak_planks'), count: 4, stackId: 470 })
        receive(server, '2e020104770001')
        inventory.slot('ui', 32, { id: idOf('stick'), count: 1, stackId: 109 })
        inventory.slot('ui', 35, { id: idOf('stick'), count: 1, stackId: 108 })
        await driver.frame(10)
        const sent = sentSince(server)
        const closing = bot.closeWindow(bot.currentWindow ?? bot.inventory)
        await driver.frame(10)
        assert.deepStrictEqual(sent(), ['9301029d01010101010d00206d0000000c00010000000000ffffffffa101010101010d00236c0000000c0001b1ffffff00ffffffff', '2f02f700'])
        receive(server, '940102009d0101020d0001202000000000000c000101010101da0100000000a10101020d0001232300000000000c000101010201da01000000', '2f02f700')
        await driver.frame(10)
        await closing
        assert.deepStrictEqual([bot.inventory.slots[37]?.name, bot.inventory.slots[37]?.count, bot.inventory.slots[37]?.stackId, errors], ['stick', 2, 109, []])
        bot.end()
      })
    }
  })

  describe('the vanilla client telling the screens it opened, once a process, 2 to 4 ticks after each first opens (1.20.50 – 1.21.101)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.20.50', 'bedrock_1.21.100')) {
      it(`bedrock ${version}: the inventory, then the crafting table, each once`, async () => {
        const { bot, server, driver, errors } = await joined(version)
        const sent = sentSince(server)
        receive(server, '2e02ff00c5ffffff0f0001')
        await driver.frame(10)
        await driver.frame(119)
        assert.deepStrictEqual(sent(), [])
        await driver.frame(1)
        assert.deepStrictEqual(sent(), ['b3020a04000400'])
        // from 1.21.0 container_close names the type of the screen it closes: none
        receive(server, atLeast(version, 'bedrock_1.21.0') ? '2f02f700' : '2f0200', '2e030104c4ffffff0f0001')
        await driver.frame(10)
        await driver.frame(120)
        assert.deepStrictEqual(sent(), ['b3020a04000404'])
        receive(server, atLeast(version, 'bedrock_1.21.0') ? '2f03f700' : '2f0300', '2e04ff00c5ffffff0f0001')
        await driver.frame(10)
        await driver.frame(200)
        assert.deepStrictEqual(sent(), [])
        assert.deepStrictEqual(errors, [])
        bot.end()
      })

      it(`bedrock ${version}: the crafting table alone, when it opens first`, async () => {
        const { bot, server, driver } = await joined(version)
        const sent = sentSince(server)
        receive(server, '2e020104c4ffffff0f0001')
        await driver.frame(10)
        await driver.frame(120)
        assert.deepStrictEqual(sent(), ['b3020a04000004'])
        bot.end()
      })

      it(`bedrock ${version}: nothing, when the process told them on an earlier connection`, async () => {
        const { bot, internal, server, driver } = await joined(version)
        internal._core.requestIds.continueProcess(-3)
        const sent = sentSince(server)
        receive(server, '2e02ff00c5ffffff0f0001')
        await driver.frame(10)
        await driver.frame(200)
        assert.deepStrictEqual(sent(), [])
        bot.end()
      })
    }
  })

  describe('the vanilla client never telling its screens (1.16.201 – 1.20.40, 1.21.111+)', () => {
    for (const version of [...bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.20.40'), ...bedrockTestVersionsFrom('bedrock_1.21.111')]) {
      it(`bedrock ${version}: nothing, when a fresh process opens a screen`, async () => {
        const { bot, server, driver, errors } = await joined(version)
        server.send('container_open', { window_id: 2, window_type: 'inventory', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
        await driver.frame(10)
        await driver.frame(200)
        assert.deepStrictEqual([bot.currentWindow, server.sentOf('set_player_inventory_options'), errors], [bot.inventory, [], []])
        bot.end()
      })
    }
  })

  describe('servers naming the items in item_registry (1.21.60+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.21.60')) {
      it(`bedrock ${version}: takes their names and stack sizes`, async () => {
        const { bot, server, driver } = await joined(version)
        server.send('item_registry', { itemstates: [{ name: 'minecraft:stick', runtime_id: 1000, component_based: false, version: 'legacy', nbt: { type: 'compound', name: '', value: {} } }] })
        new ServerInventory(server).slot('inventory', 0, { id: 1000, count: 2, stackId: 7 })
        await driver.frame(10)
        assert.deepStrictEqual([bot.heldItem?.name, bot.heldItem?.stackSize], ['stick', 64])
        bot.end()
      })

      it(`bedrock ${version}: names the items a window makes by them`, async () => {
        const { bot, server, driver } = await joined(version)
        server.send('item_registry', { itemstates: [{ name: 'minecraft:stick', runtime_id: 5000, component_based: false, version: 'legacy', nbt: { type: 'compound', name: '', value: {} } }] })
        new ServerInventory(server).slot('ui', 0, { id: 5000, count: 2, stackId: 7 })
        await driver.frame(10)
        // a right click puts one of the cursor's items in an empty slot: a new Item of the window's
        bot.inventory.acceptClick({ mode: 0, mouseButton: 1, slot: 9 }, 0)
        assert.deepStrictEqual([bot.inventory.slots[9]?.name, bot.inventory.slots[9]?.count], ['stick', 1])
        bot.end()
      })
    }
  })

  describe('servers writing an item\'s metadata and count in one aux value (1.16.201 – 1.16.210)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.210')) {
      it(`bedrock ${version}: keeps the metadata when the count changes`, async () => {
        const { bot, internal, server, driver } = await joined(version)
        new ServerInventory(server).slot('inventory', 0, { id: 5, count: 2, metadata: 4, stackId: 10 })
        await driver.tick()
        const place = request(internal, [{ type: 'place', count: 1, from: { container: 'hotbar', slot: 0 }, to: { container: 'crafting_input', slot: 28 } }])
        await driver.tick()
        const slot = { slot: 0, hotbar_slot: 0, count: 1, item_stack_id: 10, custom_name: '' }
        // 1.16.201 names the status result and the container container_id; 1.16.210 corrects a slot's durability
        const containers = atLeast(version, 'bedrock_1.16.210') ? [{ slot_type: 'hotbar' as const, slots: [{ ...slot, durability_correction: 0 }] }] : [{ container_id: 'hotbar' as const, slots: [slot] }]
        server.send('item_stack_response', { responses: [{ ...atLeast(version, 'bedrock_1.16.210') ? { status: 'ok' as const } : { result: 'ok' as const }, request_id: -3, containers }] })
        await driver.tick()
        await place
        const held = server.sentOf('mob_equipment').at(-1)?.item
        assert.deepStrictEqual([bot.heldItem?.metadata, bot.heldItem?.count, held !== undefined && 'auxiliary_value' in held ? held.auxiliary_value : undefined], [4, 1, 0x401])
        bot.end()
      })
    }
  })

  describe('servers sending an item with NBT (1.26.40+)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.40')) {
      it(`bedrock ${version}: shows it on the item`, async () => {
        const { bot, server, driver } = await joined(version)
        receive(server, '32780000005a0101000001ee23001cffff010a000003060044616d61676500000000000000000000000000')
        await driver.frame(10)
        const helmet = bot.inventory.slots[5]
        assert.deepStrictEqual([helmet?.type, helmet?.stackId, helmet?.nbt], [346, 2295, { type: 'compound', name: '', value: { Damage: { type: 'int', value: 0 } } }])
        bot.end()
      })
    }
  })

  describe('the vanilla client telling what its offhand holds, alone', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201')) {
      it(`bedrock ${version}: in the offhand window's slot 1`, async () => {
        const { bot, server, driver, internal } = await joined(version)
        const stick = bot.registry.itemsByName['stick']?.id ?? 0
        new ServerInventory(server).content('offhand', [{ id: stick, count: 1, stackId: 3018 }])
        await driver.tick()
        const [equipment, ...others] = server.inTick(internal._core.tick ?? 0).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request')
        const held = server.sentOf('mob_equipment').at(-1)
        assert.deepStrictEqual([equipment, others, held?.slot, held?.selected_slot, held?.window_id ?? held?.windows_id, held?.item.network_id], ['mob_equipment', [], 1, 0, 'offhand', stick])
        assert.deepStrictEqual(bot.inventory.slots[45]?.stackId, 3018)
        new ServerInventory(server).slot('offhand', 0, { id: stick, count: 2, stackId: 3018 })
        await driver.tick()
        const told = server.sentOf('mob_equipment').at(-1)
        const count = told === undefined ? undefined : 'count' in told.item ? told.item.count : (told.item.auxiliary_value ?? 0) & 0xff
        assert.deepStrictEqual([server.inTick(internal._core.tick ?? 0).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request'), told?.window_id ?? told?.windows_id, count], [['mob_equipment'], 'offhand', 2])
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const planks: Given = { id: 5, count: 4, stackId: 10, blockRuntimeId: 1921718966 }
    const HOTBAR_0 = Object.freeze({ container: 'hotbar', slot: 0 } as const)
    const GRID_28 = Object.freeze({ container: 'crafting_input', slot: 28 } as const)

    interface Slot { container: ContainerSlotType, slot: number, count: number, stackId?: number }

    /** item_stack_response as the version's servers write it */
    function respond (server: FakeBedrockClient, requestId: number, status: 'ok' | number, slots: readonly Slot[] = []): void {
      const containers = slots.map(({ container, slot, count, stackId }) => ({
        slot_type: { container_id: container },
        slots: [{ slot, hotbar_slot: slot, count, ...stackId === undefined ? {} : { item_stack_id: stackId }, custom_name: '', durability_correction: 0 }]
      }))
      server.send('item_stack_response', { responses: [{ status, request_id: requestId, ...status === 'ok' ? { containers } : {} }] })
    }

    async function withPlanks (): Promise<TestBot & { errors: string[], inventory: ServerInventory }> {
      const bot = await joined(version)
      const inventory = new ServerInventory(bot.server)
      inventory.slot('inventory', 0, planks)
      await bot.driver.tick()
      return { ...bot, inventory }
    }

    it('undoes a refused request, and rejects naming the refusal', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const take = request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }])
      await driver.frame(10)
      assert.deepStrictEqual([bot.heldItem, bot.inventory.selectedItem?.count], [null, 4])
      const refused = assert.rejects(take, { message: 'the server refused item stack request -3: FailedToValidateSrcSlot' })
      respond(server, -3, 49)
      await driver.frame(10)
      await refused
      assert.deepStrictEqual([bot.heldItem?.count, bot.heldItem?.stackId, bot.inventory.selectedItem], [4, 10, null])
      bot.end()
    })

    it('names a status it has no name for by its number', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const take = request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }])
      await driver.frame(10)
      const refused = assert.rejects(take, { message: 'the server refused item stack request -3: status 200' })
      respond(server, -3, 200)
      await driver.frame(10)
      await refused
      const error = request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }])
      const refusedAgain = assert.rejects(error, { message: 'the server refused item stack request -5: Error' })
      await driver.frame(10)
      server.send('item_stack_response', { responses: [{ status: 'error', request_id: -5 }] })
      await driver.frame(10)
      await refusedAgain
      bot.end()
    })

    it('keeps what an ok response lists, with its count and stack id, and undoes what it does not', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const place = request(internal, [{ type: 'place', count: 2, from: HOTBAR_0, to: GRID_28 }, { type: 'place', count: 1, from: HOTBAR_0, to: CURSOR }])
      await driver.frame(10)
      assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]?.count, bot.inventory.slots[1]?.stackId, bot.inventory.selectedItem?.count], [1, 2, -3, 1])
      // a slot of a container the bot's requests do not name, and one the request left empty: no item is made there
      respond(server, -3, 'ok', [{ container: 'crafting_input', slot: 28, count: 3, stackId: 11 }, { container: 'beacon_payment', slot: 0, count: 1, stackId: 12 }, { container: 'hotbar', slot: 5, count: 1, stackId: 13 }])
      await driver.frame(10)
      await place
      assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]?.count, bot.inventory.slots[1]?.stackId, bot.inventory.selectedItem, bot.inventory.slots[41]], [4, 3, 11, null, null])
      bot.end()
    })

    it('names a slot by the request that changed it while that request is unanswered, and leaves it to it', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const sent = sentSince(server)
      const first = request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }])
      const second = request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }])
      await driver.tick()
      const [packet] = server.sentOf('item_stack_request').slice(-1)
      assert.deepStrictEqual([sent().length, packet?.requests.map(({ actions }) => actions.map(({ source, destination }) => [source?.stack_id, destination?.stack_id]))], [1, [[[10, 0]], [[-3, -3]]]])
      respond(server, -3, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 3, stackId: 10 }, { container: 'crafting_input', slot: 28, count: 1, stackId: 11 }])
      await driver.frame(10)
      await first
      assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]?.count, bot.inventory.slots[1]?.stackId], [2, 2, -3])
      respond(server, -5, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 2, stackId: 10 }, { container: 'crafting_input', slot: 28, count: 2, stackId: 11 }])
      await driver.frame(10)
      await second
      assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]?.count, bot.inventory.slots[1]?.stackId], [2, 2, 11])
      bot.end()
    })

    it('puts back what the server holds when a chain of requests on a slot is refused', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const shown = (): unknown[] => [bot.heldItem?.count, bot.heldItem?.stackId, bot.inventory.slots[1]?.count, bot.inventory.slots[1]?.stackId]
      // a plank placed in the grid twice, the second request naming it by the first; the server refuses the second
      const chain = async (first: number, answerFirst: () => void): Promise<void> => {
        const placed = Promise.allSettled([0, 1].map(async () => { await request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]) }))
        await driver.tick()
        assert.deepStrictEqual(shown(), [2, 10, 2, first])
        answerFirst()
        respond(server, first - 2, 49)
        await driver.tick()
        await placed
      }
      await chain(-3, () => { respond(server, -3, 49) })
      assert.deepStrictEqual(shown(), [4, 10, undefined, undefined])
      // an ok response that lists neither slot undoes both
      await chain(-7, () => { respond(server, -7, 'ok') })
      assert.deepStrictEqual(shown(), [4, 10, undefined, undefined])
      // one that lists them leaves them as the server counts and numbers them
      await chain(-11, () => { respond(server, -11, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 3, stackId: 10 }, { container: 'crafting_input', slot: 28, count: 1, stackId: 11 }]) })
      assert.deepStrictEqual(shown(), [3, 10, 1, 11])
      bot.end()
    })

    it('empties a slot an ok response lists with no items', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const place = request(internal, [{ type: 'place', count: 2, from: HOTBAR_0, to: GRID_28 }])
      await driver.frame(10)
      respond(server, -3, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 0 }, { container: 'crafting_input', slot: 28, count: 4, stackId: 11 }])
      await driver.frame(10)
      await place
      assert.deepStrictEqual([bot.heldItem, bot.inventory.slots[1]?.count], [null, 4])
      bot.end()
    })

    it('keeps what the server sends of a slot while a request on it is pending, whatever the response', async () => {
      const { bot, internal, inventory, server, driver } = await withPlanks()
      const shown = (): unknown[] => [bot.heldItem?.count, bot.heldItem?.stackId, bot.inventory.selectedItem?.count]
      const refused = assert.rejects(request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }]), { message: 'the server refused item stack request -3: FailedToValidateSrcSlot' })
      await driver.frame(10)
      inventory.content('inventory', [{ ...planks, count: 2, stackId: 30 }])
      respond(server, -3, 49)
      await driver.frame(10)
      await refused
      assert.deepStrictEqual(shown(), [2, 30, undefined])
      const unlisted = request(internal, [{ type: 'take', count: 2, from: HOTBAR_0, to: CURSOR }])
      await driver.frame(10)
      inventory.slot('inventory', 0, { ...planks, count: 1, stackId: 31 })
      respond(server, -5, 'ok')
      await driver.frame(10)
      await unlisted
      assert.deepStrictEqual(shown(), [1, 31, undefined])
      bot.end()
    })

    it('hands back an item that names no stack size as stacking to 64', async () => {
      const { bot, server, driver } = await joined(version)
      const inventory = new ServerInventory(server)
      const components = { type: 'compound' as const, value: { item_properties: { type: 'compound' as const, value: {} } } }
      server.send('item_registry', { itemstates: [{ name: 'test:gem', runtime_id: 5000, component_based: true, version: 'data_driven', nbt: { type: 'compound', name: '', value: { components } } }] })
      inventory.slot('inventory', 0, { id: 5000, count: 60, stackId: 7 })
      receive(server, '2e02ff00750001')
      inventory.slot('ui', 28, { id: 5000, count: 10, stackId: 8 })
      await driver.frame(10)
      bot.closeWindow(bot.inventory).catch(() => {})
      await driver.tick()
      const moves = server.sentOf('item_stack_request').at(-1)?.requests.map(({ actions }) => actions.map(({ count, source, destination }) => [count, source?.stack_id, destination?.slot, destination?.stack_id]))
      assert.deepStrictEqual(moves, [[[4, 8, 0, 7]], [[6, -3, 1, 0]]])
      bot.end()
    })

    it('makes a request when asked, naming its slots then, and sends it in the next tick, after what the player holds', async () => {
      // recorded on 1.26.51.1: the take's response arrives between the place and the tick its request leaves in
      const { bot, internal, inventory, server, driver } = await withPlanks()
      inventory.slot('inventory', 0, { ...planks, count: 1, stackId: 2 })
      await driver.tick()
      const take = request(internal, [{ type: 'take', count: 1, from: HOTBAR_0, to: CURSOR }])
      await driver.tick()
      assert.deepStrictEqual(sentInTick(server, internal._core.tick ?? 0), ['93010105010000011c0000020000003b00000000000000ffffffff', 'player_auth_input'])
      const sent = sentSince(server)
      const place = request(internal, [{ type: 'place', count: 1, from: CURSOR, to: GRID_28 }])
      await driver.frame(10)
      assert.deepStrictEqual(sent(), [])
      receive(server, '940101000501021c0001000000000000003b00010000010104000000')
      await driver.tick()
      assert.deepStrictEqual(sentInTick(server, internal._core.tick ?? 0), ['21040000', '1f010000000000000000000000', '93010109010101013b0000fdffffff0d001c0000000000ffffffff', 'player_auth_input'])
      await take
      respond(server, -5, 'ok')
      await driver.tick()
      await place
      bot.end()
    })

    it('tells what the player holds after the server answered, not after its own prediction', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      await driver.tick()
      const take = request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }])
      await driver.tick()
      assert.deepStrictEqual(lastBatch(server), ['item_stack_request', 'player_auth_input'])
      respond(server, -3, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 0 }, { container: 'cursor', slot: 0, count: 4, stackId: 10 }])
      await driver.tick()
      await take
      assert.deepStrictEqual(lastBatch(server), ['interact', 'mob_equipment', 'player_auth_input'])
      assert.deepStrictEqual(server.sentOf('mob_equipment').at(-1)?.item.network_id, 0)
      bot.end()
    })

    it('tells a hand that holds an item when first shown by the interact, then mob_equipment', async () => {
      // recorded on 1.26.60.5: the hotbar's slot 0 given before the player spawned
      const content = '31002476010100000144000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'
      const { bot, server, firstAuthInput } = await joined(version, 12n, {}, [content, '30000001'])
      assert.deepStrictEqual(sentInTick(server, firstAuthInput), ['21040000', '1f0c760101000000000a00000000000000000000000000', 'player_auth_input'])
      bot.end()
    })

    it('tells an item of another block as a new item', async () => {
      const { bot, inventory, server, driver } = await withPlanks()
      await driver.tick()
      inventory.slot('inventory', 0, { ...planks, blockRuntimeId: 1 })
      await driver.tick()
      assert.deepStrictEqual(lastBatch(server), ['interact', 'mob_equipment', 'player_auth_input'])
      bot.end()
    })

    it('tells an item whose NBT alone changed by mob_equipment alone', async () => {
      // recorded on 1.26.60.5: a bundle given, then given its bundle_id
      const { bot, server, driver } = await joined(version, 3n)
      await driver.tick()
      const sent = sentSince(server)
      receive(server, '310024610301000001f80f000a000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
      await driver.tick()
      assert.deepStrictEqual(sent(), ['21040000', '1f03610301000000000a00000000000000000000000000'])
      receive(server, '310024610301000001fc0f001fffff010a000003090062756e646c655f6964020000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000')
      await driver.tick()
      assert.deepStrictEqual(sent(), ['1f03610301000000001fffff010a000003090062756e646c655f696402000000000000000000000000000000'])
      assert.deepStrictEqual(bot.heldItem?.nbt, { type: 'compound', name: '', value: { bundle_id: { type: 'int', value: 2 } } })
      bot.end()
    })

    it('ignores a response to no request of its own', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      await driver.tick()
      const sent = sentSince(server)
      respond(server, -99, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 1, stackId: 10 }])
      await driver.tick()
      assert.deepStrictEqual([internal._inventory.stats.unknownResponses, bot.heldItem?.count, sent()], [1, 4, []])
      bot.end()
    })

    it('undoes a request the server does not answer, so that the next on its slots names and tells them as the server has them', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const unanswered = assert.rejects(request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]), { message: 'the server did not answer item stack request -3 in 100 ticks' })
      await driver.ticks(101)
      await unanswered
      assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]], [4, null])
      const placed = request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }])
      await driver.tick()
      respond(server, -5, 'ok', [{ container: 'hotbar_and_inventory', slot: 0, count: 3, stackId: 30 }, { container: 'crafting_input', slot: 28, count: 1, stackId: 31 }])
      await driver.tick()
      await placed
      const held = server.sentOf('mob_equipment').at(-1)?.item
      request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]).catch(() => {})
      await driver.tick()
      const named = server.sentOf('item_stack_request').at(-1)?.requests[0]?.actions.map(({ source, destination }) => [source?.stack_id, destination?.stack_id])
      assert.deepStrictEqual([held !== undefined && 'count' in held ? held.count : undefined, named], [3, [[30, 31]]])
      respond(server, -3, 'ok')
      await driver.tick()
      assert.deepStrictEqual(internal._inventory.stats.unknownResponses, 1)
      bot.end()
    })

    it('undoes and rejects a request the server skipped, answering a later one first', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      const skipped = assert.rejects(request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]), { message: 'the server refused item stack request -3: skipped by the answer to -5' })
      const refused = assert.rejects(request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]), { message: 'the server refused item stack request -5: FailedToValidateSrcSlot' })
      await driver.tick()
      respond(server, -5, 49)
      await driver.tick()
      await Promise.all([skipped, refused])
      assert.deepStrictEqual([bot.heldItem?.count, bot.heldItem?.stackId, bot.inventory.slots[1]], [4, 10, null])
      bot.end()
    })

    it('rejects a request the server does not answer in 100 ticks', async () => {
      const { bot, internal, driver } = await withPlanks()
      const take = request(internal, [{ type: 'take', count: 4, from: HOTBAR_0, to: CURSOR }])
      const rejected = assert.rejects(take, { message: 'the server did not answer item stack request -3 in 100 ticks' })
      await driver.ticks(101)
      await rejected
      bot.end()
    })

    it('refuses moves it cannot predict: more items than a slot has, onto another item', async () => {
      const { bot, internal, inventory, server, driver } = await withPlanks()
      inventory.slot('ui', 0, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 1, stackId: 20 })
      await driver.frame(10)
      const refused = Promise.all([
        assert.rejects(request(internal, [{ type: 'take', count: 5, from: HOTBAR_0, to: GRID_28 }]), { message: 'hotbar 0 has not 5 items' }),
        assert.rejects(request(internal, [{ type: 'take', count: 1, from: HOTBAR_0, to: CURSOR }]), { message: 'cursor 0 holds another item' })
      ])
      await driver.frame(10)
      await refused
      // left unanswered: the bot's end rejects it
      request(internal, [{ type: 'place', count: 1, from: HOTBAR_0, to: GRID_28 }]).catch(() => {})
      await driver.tick()
      assert.deepStrictEqual([bot.heldItem?.count, server.sentOf('item_stack_request').at(-1)?.requests[0]?.request_id], [3, -3])
      bot.end()
    })

    it('reads a slot\'s item that has no stack id as stack id 0', async () => {
      const { bot, inventory, driver } = await withPlanks()
      inventory.slot('armor', 0, { id: bot.registry.itemsByName['iron_helmet']?.id ?? 0, count: 1 })
      await driver.frame(10)
      assert.deepStrictEqual([bot.inventory.slots[5]?.name, bot.inventory.slots[5]?.stackId], ['iron_helmet', 0])
      bot.end()
    })

    it('keeps no slot of a window it has no view of', async () => {
      const { bot, internal, server, driver } = await withPlanks()
      server.send('inventory_slot', { window_id: 7, slot: 0, item: { network_id: 5, count: 1, metadata: 0, has_stack_id: true, stack_id: 30, block_runtime_id: 0, extra: { has_nbt: 0, can_place_on: [], can_destroy: [] } } })
      server.send('inventory_content', { window_id: 'beacon', input: [] })
      await driver.frame(10)
      assert.deepStrictEqual(internal._inventory.stats.otherWindows, 2)
      bot.end()
    })

    it('selects the hotbar slot the server selects, and tells what the player holds there', async () => {
      const { bot, inventory, server, driver } = await withPlanks()
      inventory.slot('inventory', 2, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 3, stackId: 21 })
      await driver.tick()
      const sent = sentSince(server)
      const held: Array<Item | null> = []
      bot.on('heldItemChanged', item => { held.push(item) })
      server.send('player_hotbar', { selected_slot: 2, window_id: 'inventory', select_slot: true })
      server.send('player_hotbar', { selected_slot: 2, window_id: 'inventory', select_slot: true })
      server.send('player_hotbar', { selected_slot: 1, window_id: 'inventory', select_slot: false })
      await driver.tick()
      assert.deepStrictEqual([bot.quickBarSlot, bot.heldItem?.name, held.map(item => item?.name)], [2, 'stick', ['stick']])
      const equipment = server.sentOf('mob_equipment').at(-1)
      // the stick, a new item in the hand
      assert.deepStrictEqual([sent().length, lastBatch(server), equipment?.slot, equipment?.selected_slot, equipment?.item.network_id], [2, ['interact', 'mob_equipment', 'player_auth_input'], 2, 2, bot.registry.itemsByName['stick']?.id])
      bot.end()
    })

    describe('opening the inventory', () => {
      it('cannot before start_game', async () => {
        const { bot } = await bedrockTestBot(bedrockCodec(version))
        await assert.rejects(bot.openInventory(), { message: 'the inventory cannot open before start_game' })
        bot.end()
      })

      it('resolves at once while it is open, and cannot over a crafting table', async () => {
        const { bot, server, driver } = await joined(version)
        receive(server, '2e02ff00750001')
        await driver.frame(10)
        assert.strictEqual(await bot.openInventory(), bot.inventory)
        receive(server, '2f02f700', '2e090104770001')
        await driver.frame(10)
        await assert.rejects(bot.openInventory(), { message: 'the inventory cannot open over the minecraft:crafting_table window' })
        bot.end()
      })

      it('opens it again when asked while it is closing, once the server closed it', async () => {
        const { bot, server, driver } = await joined(version)
        receive(server, '2e02ff00750001')
        await driver.frame(10)
        bot.closeWindow(bot.inventory).catch(() => {})
        await driver.frame(10)
        const opened = bot.openInventory()
        await driver.frames([300, 10, 10])
        const asked = (): unknown[] => server.sentOf('interact').map(({ action_id: action }) => action).filter(action => action === 'open_inventory')
        assert.deepStrictEqual([server.sentOf('container_close').length, asked()], [1, []])
        receive(server, '2f02f700')
        await driver.frames([10, 10])
        assert.deepStrictEqual(asked(), ['open_inventory'])
        receive(server, '2e02ff00750001')
        await driver.frame(10)
        assert.deepStrictEqual([await opened, bot.currentWindow], [bot.inventory, bot.inventory])
        bot.end()
      })

      it('rejects when the server does not open it in 100 ticks', async () => {
        const { bot, driver } = await joined(version)
        const rejected = assert.rejects(bot.openInventory(), { message: 'the server did not open the inventory in 100 ticks' })
        await driver.ticks(101)
        await rejected
        bot.end()
      })

      it('gives a crafting table\'s window the server\'s id, also the first and last dynamic ids, which the protocol names', async () => {
        const { bot, server, driver } = await joined(version)
        const ids: number[] = []
        for (const id of ['01', '64']) {
          receive(server, `2e${id}0104770001`)
          await driver.frame(10)
          ids.push(bot.currentWindow?.id ?? 0)
          receive(server, `2f${id}f700`)
          await driver.frame(10)
        }
        assert.deepStrictEqual([ids, bot.currentWindow], [[1, 100], null])
        bot.end()
      })

      it('shows no screen it has no window for', async () => {
        const { bot, internal, server, driver } = await joined(version)
        server.send('container_open', { window_id: 5, window_type: 'furnace', coordinates: { x: 0, y: 0, z: 0 }, runtime_entity_id: -1n })
        await driver.frame(10)
        assert.deepStrictEqual([bot.currentWindow, internal._inventory.stats.otherScreens], [null, 1])
        bot.end()
      })
    })

    describe('closing a window', () => {
      it('does nothing for a window that is not open', async () => {
        const { bot, server, driver } = await joined(version)
        const sent = sentSince(server)
        await bot.closeWindow(bot.inventory)
        await driver.frame(10)
        assert.deepStrictEqual(sent(), [])
        bot.end()
      })

      it('closes once, when it was first asked, when asked twice, and sends its close once', async () => {
        const { bot, server, driver } = await joined(version)
        receive(server, '2e02ff00750001')
        await driver.frame(10)
        const sent = sentSince(server)
        const closings = [bot.closeWindow(bot.inventory)]
        await driver.frame(10)
        await driver.frame(100)
        closings.push(bot.closeWindow(bot.inventory))
        await driver.frames([200, 10, 10, 10])
        assert.deepStrictEqual(sent(), ['2f02f700'])
        receive(server, '2f02f700')
        await driver.frame(10)
        await Promise.all(closings)
        bot.end()
      })

      it('hands nothing back when the server closed the screen in the frame it was asked', async () => {
        const { bot, inventory, server, driver } = await withPlanks()
        receive(server, '2e02ff00750001')
        inventory.slot('ui', 28, { ...planks, count: 1, stackId: 11 })
        await driver.frame(10)
        const sent = sentSince(server)
        const closing = bot.closeWindow(bot.inventory)
        receive(server, '2f02f700')
        await driver.frame(10)
        await closing
        await driver.frames([100, 200, 10])
        assert.deepStrictEqual([sent(), bot.currentWindow], [[], null])
        bot.end()
      })

      it('takes the server closing the screen, and no other window\'s close', async () => {
        const { bot, server, driver } = await joined(version)
        const closed: unknown[] = []
        bot.on('windowClose', window => { closed.push(window) })
        receive(server, '2e02ff00750001', '2f05f700')
        await driver.frame(10)
        assert.deepStrictEqual([bot.currentWindow, closed], [bot.inventory, []])
        server.send('container_close', { window_id: 2, window_type: 'none', server: true })
        await driver.frame(10)
        assert.deepStrictEqual([bot.currentWindow, closed], [null, [bot.inventory]])
        bot.end()
      })

      it('rejects when the server does not close it in 100 ticks, and closes it again when asked', async () => {
        const { bot, server, driver } = await joined(version)
        receive(server, '2e02ff00750001')
        await driver.frame(10)
        const sent = sentSince(server)
        const rejected = assert.rejects(bot.closeWindow(bot.inventory), { message: 'the server did not close the inventory screen in 100 ticks' })
        await driver.ticks(101)
        await rejected
        const closing = bot.closeWindow(bot.inventory)
        await driver.frames([10, 300, 10])
        assert.deepStrictEqual(sent(), ['2f02f700', '2f02f700'])
        receive(server, '2f02f700')
        await driver.frame(10)
        await closing
        bot.end()
      })

      it('rejects, once the screen closed, when the server refused to take an item back', async () => {
        const { bot, inventory, server, driver } = await withPlanks()
        receive(server, '2e02ff00750001')
        inventory.slot('ui', 28, { ...planks, count: 1, stackId: 11 })
        await driver.tick()
        let settled = false
        const closing = bot.closeWindow(bot.inventory)
        closing.then(() => { settled = true }, () => { settled = true })
        await driver.tick()
        respond(server, -3, 49)
        await driver.frame(310)
        assert.strictEqual(settled, false)
        receive(server, '2f02f700')
        await driver.frame(10)
        await assert.rejects(closing, { message: 'the server refused item stack request -3: FailedToValidateSrcSlot' })
        assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[1]?.count], [4, 1])
        bot.end()
      })

      it('hands back to a stack only what it has room for, the rest to an empty slot', async () => {
        const { bot, inventory, server, driver } = await withPlanks()
        inventory.slot('inventory', 0, { ...planks, count: 60 })
        receive(server, '2e02ff00750001')
        inventory.slot('ui', 28, { ...planks, count: 10, stackId: 11 })
        await driver.frame(10)
        bot.closeWindow(bot.inventory).catch(() => {})
        await driver.tick()
        const moves = server.sentOf('item_stack_request').at(-1)?.requests.map(({ request_id: id, actions }) => [id, ...actions.map(({ count, source, destination }) => [count, source?.slot, source?.stack_id, destination?.slot, destination?.stack_id])])
        assert.deepStrictEqual(moves, [[-3, [4, 28, 11, 0, 10]], [-5, [6, 28, -3, 1, 0]]])
        assert.deepStrictEqual([bot.heldItem?.count, bot.inventory.slots[37]?.count, bot.inventory.slots[1]], [64, 6, null])
        bot.end()
      })

      it('hands back what has room, and drops the rest', async () => {
        const { bot, inventory, server, driver } = await withPlanks()
        const stick = bot.registry.itemsByName['stick']?.id ?? 0
        inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => slot === 0 ? { ...planks, count: 60, stackId: 100 } : { id: stick, count: 64, stackId: 100 + slot }))
        receive(server, '2e02ff00750001')
        inventory.slot('ui', 28, { ...planks, count: 10, stackId: 11 })
        await driver.tick()
        bot.closeWindow(bot.inventory).catch(() => {})
        await driver.tick()
        const moves = server.sentOf('item_stack_request').at(-1)?.requests.map(({ request_id: id, actions }) => [id, ...actions.map(({ type_id: type, count, source, destination }) => [type, count, source?.slot, destination?.slot])])
        assert.deepStrictEqual(moves, [[-3, ['place', 4, 28, 0]], [-5, ['drop', 6, 28, undefined]]])
        assert.deepStrictEqual(server.sentOf('animate').map(({ action_id: action }) => action), ['swing_arm'])
        bot.end()
      })

      it('rejects a click once the close handed the items back, as the vanilla client\'s screen is gone, and a request alike', async () => {
        const { bot, internal, server, driver } = await withPlanks()
        receive(server, '2e02ff00750001')
        await driver.tick()
        const closing = bot.closeWindow(bot.inventory)
        const refused = Promise.all([
          assert.rejects(bot.clickWindow(9, 0, 0), { message: 'the minecraft:inventory window is closing' }),
          assert.rejects(request(internal, [{ type: 'take', count: 1, from: HOTBAR_0, to: CURSOR }]), { message: 'the minecraft:inventory window is closing' })
        ])
        await driver.tick()
        await refused
        assert.deepStrictEqual(server.sentOf('item_stack_request'), [])
        await driver.frames([310, 10])
        receive(server, '2f02f700')
        await driver.frame(10)
        await closing
        bot.end()
      })
    })
  })
})
