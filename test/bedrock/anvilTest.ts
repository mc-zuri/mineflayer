import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import prismarineItem from 'prismarine-item'
import type { Block } from 'prismarine-block'
import type { Item } from 'prismarine-item'
import type { Window } from 'prismarine-windows'
import type { SlotRef } from '../../lib/bedrock/modules/items.ts'
import { withNbt } from '../../lib/bedrock/modules/recipes.ts'
import type { NbtValue } from '../../lib/bedrock/modules/recipes.ts'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockAnvil, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The vanilla client at an anvil against Bedrock Dedicated Server, recorded on every build: an iron sword of Damage
// 200 repaired with 2 iron ingots at level 30, two of Damage 200 combined at level 58, and one of Damage 0 renamed
// "Iron Swordfixture" at level 170, each item put in by a click on it and one on its slot, then the result clicked.
// Its packets from the first click to the result's (and its tell of the held result, from 1.19.50) are compared as
// their bytes, but for the anvil's damage, which the vanilla client rolls and the bot sends as 0. Versions whose
// packets are written alike (the layout, the name, filter_text_packet up to 1.18.11, anvil_damage but on 1.17.0 and
// from 1.26.40, the result's place, and up to 1.26.30 the sword's network id) are a group, each group's test run on
// each of its versions.

type Attributes = ClientboundPacketsToWrite['update_attributes']['attributes']

const HOTBAR = 30
const RESULT_SLOT = 2
const SHARPNESS = 9
const PACKETS = ['item_stack_request', 'filter_text_packet', 'entity_event', 'anvil_damage', 'interact', 'mob_equipment'] as const

interface RecordedUse {
  windowId: number
  /** the first request's: the take of the sword */
  requestId: number
  /** the stack ids of the sword and the material, in hotbar slots 0 and 1 */
  stacks: readonly number[]
  /** the player's level before */
  level: number
  /** the client's packets from the first click to the result's, as their names and bytes */
  packets: readonly string[]
  /** the stack id the response gives the result */
  made: number
}

interface RecordedUses {
  from: BedrockVersion
  to: BedrockVersion
  /** the player's runtime id, which its tells of the held item name */
  player: bigint
  at: { x: number, y: number, z: number }
  repair: RecordedUse
  combine: RecordedUse
  rename: RecordedUse
}

const RECORDED: readonly RecordedUses[] = [
  {
    // recorded on 1.16.201.2 (its combine rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    player: 9n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3935,
      stacks: [2981, 2983],
      level: 30,
      packets: [
        'item_stack_request 930101bd3d0100011b00ca2e3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0900000000',
        'item_stack_request 930101c13d0101013a00ca2e00010000',
        'item_stack_request 930101c53d0100021b01ce2e3a000000',
        'item_stack_request 930101c93d0101023a00ce2e01020000',
        'entity_event 1b092203',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101cd3d040c000000000005020102ce2e05010001ca2e00013b32cd3d3a0000010a49726f6e2053776f7264'
      ],
      made: 2984
    },
    combine: {
      windowId: 7,
      requestId: -3947,
      stacks: [2986, 2988],
      level: 58,
      packets: [
        'item_stack_request 930101d53d0100011b00d42e3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0900000000',
        'item_stack_request 930101d93d0101013a00d42e00010000',
        'item_stack_request 930101dd3d0100011b01d82e3a000000',
        'item_stack_request 930101e13d0101013a00d82e01020000',
        'entity_event 1b092203',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101e53d040c000000000005010102d82e05010001d42e00013b32e53d3a0000010a49726f6e2053776f7264'
      ],
      made: 2989
    },
    rename: {
      windowId: 28,
      requestId: -4257,
      stacks: [3114],
      level: 170,
      packets: [
        'item_stack_request 930101c1420100011b00d4303a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0900000000',
        'item_stack_request 930101c5420101013a00d43000010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'entity_event 1b092201',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101c942030c000000000005010001d43000013b32c9423a0000011149726f6e2053776f726466697874757265'
      ],
      made: 3115
    }
  },
  {
    // recorded on 1.16.210.5 (its repair rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    player: 12n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4899,
      stacks: [3467, 3469],
      level: 30,
      packets: [
        'item_stack_request 930101c54c0100011b0096363a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101c94c0101013a00963600010000',
        'item_stack_request 930101cd4c0100021b019a363a000000',
        'item_stack_request 930101d14c0101023a009a3601020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101d54c040d0000000000050201029a3605010001963600013b32d54c3a0000010a49726f6e2053776f7264'
      ],
      made: 3470
    },
    combine: {
      windowId: 7,
      requestId: -4911,
      stacks: [3472, 3474],
      level: 58,
      packets: [
        'item_stack_request 930101dd4c0100011b00a0363a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101e14c0101013a00a03600010000',
        'item_stack_request 930101e54c0100011b01a4363a000000',
        'item_stack_request 930101e94c0101013a00a43601020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101ed4c040d000000000005010102a43605010001a03600013b32ed4c3a0000010a49726f6e2053776f7264'
      ],
      made: 3475
    },
    rename: {
      windowId: 28,
      requestId: -5221,
      stacks: [3602],
      level: 170,
      packets: [
        'item_stack_request 930101c9510100011b00a4383a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101cd510101013a00a43800010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101d151030d000000000005010001a43800013b32d1513a0000011149726f6e2053776f726466697874757265'
      ],
      made: 3603
    }
  },
  {
    // recorded on 1.16.220.2 (its repair rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    player: 12n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -1609,
      stacks: [923, 925],
      level: 30,
      packets: [
        'item_stack_request 93010191190100011b00b60e3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010195190101013a00b60e00010000',
        'item_stack_request 93010199190100021b01ba0e3a000000',
        'item_stack_request 9301019d190101023a00ba0e01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101a119040d000000000005020102ba0e05010001b60e00013b32a1193a0000010a49726f6e2053776f7264'
      ],
      made: 926
    },
    combine: {
      windowId: 7,
      requestId: -1621,
      stacks: [928, 930],
      level: 58,
      packets: [
        'item_stack_request 930101a9190100011b00c00e3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101ad190101013a00c00e00010000',
        'item_stack_request 930101b1190100011b01c40e3a000000',
        'item_stack_request 930101b5190101013a00c40e01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101b919040d000000000005010102c40e05010001c00e00013b32b9193a0000010a49726f6e2053776f7264'
      ],
      made: 931
    },
    rename: {
      windowId: 28,
      requestId: -1931,
      stacks: [1058],
      level: 170,
      packets: [
        'item_stack_request 930101951e0100011b00c4103a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101991e0101013a00c41000010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'anvil_damage 8d0100040400',
        'item_stack_request 9301019d1e030d000000000005010001c41000013b329d1e3a0000011149726f6e2053776f726466697874757265'
      ],
      made: 1059
    }
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    player: 12n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -1691,
      stacks: [987, 989],
      level: 30,
      packets: [
        'item_stack_request 930101b51a0100011b00b60f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101b91a0101013a00b60f00010000',
        'item_stack_request 930101bd1a0100021b01ba0f3a000000',
        'item_stack_request 930101c11a0101023a00ba0f01020000',
        'item_stack_request 930101c51a040d000000000005020102ba0f05010001b60f00013b32c51a3a0000010a49726f6e2053776f7264'
      ],
      made: 990
    },
    combine: {
      windowId: 7,
      requestId: -1703,
      stacks: [992, 994],
      level: 58,
      packets: [
        'item_stack_request 930101cd1a0100011b00c00f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101d11a0101013a00c00f00010000',
        'item_stack_request 930101d51a0100011b01c40f3a000000',
        'item_stack_request 930101d91a0101013a00c40f01020000',
        'item_stack_request 930101dd1a040d000000000005010102c40f05010001c00f00013b32dd1a3a0000010a49726f6e2053776f7264'
      ],
      made: 995
    },
    rename: {
      windowId: 28,
      requestId: -2013,
      stacks: [1122],
      level: 170,
      packets: [
        'item_stack_request 930101b91f0100011b00c4113a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101bd1f0101013a00c41100010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'item_stack_request 930101c11f030d000000000005010001c41100013b32c11f3a0000011149726f6e2053776f726466697874757265'
      ],
      made: 1123
    }
  },
  {
    // recorded on 1.17.30.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    player: 12n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4029,
      stacks: [2934, 2936],
      level: 30,
      packets: [
        'item_stack_request 930101f93e0100011b00ec2d3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101fd3e0101013a00ec2d00010000',
        'item_stack_request 930101813f0100021b01f02d3a000000',
        'item_stack_request 930101853f0101023a00f02d01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101893f040d000000000005020102f02d05010001ec2d00013b32893f3a0000010a49726f6e2053776f7264'
      ],
      made: 2937
    },
    combine: {
      windowId: 7,
      requestId: -4041,
      stacks: [2939, 2941],
      level: 58,
      packets: [
        'item_stack_request 930101913f0100011b00f62d3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101953f0101013a00f62d00010000',
        'item_stack_request 930101993f0100011b01fa2d3a000000',
        'item_stack_request 9301019d3f0101013a00fa2d01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101a13f040d000000000005010102fa2d05010001f62d00013b32a13f3a0000010a49726f6e2053776f7264'
      ],
      made: 2942
    },
    rename: {
      windowId: 28,
      requestId: -4351,
      stacks: [3069],
      level: 170,
      packets: [
        'item_stack_request 930101fd430100011b00fa2f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010181440101013a00fa2f00010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'anvil_damage 8d0100040400',
        'item_stack_request 9301018544030d000000000005010001fa2f00013b3285443a0000011149726f6e2053776f726466697874757265'
      ],
      made: 3070
    }
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    player: 11n,
    at: { x: 2, y: 4, z: 0 },
    repair: {
      windowId: 6,
      requestId: -1691,
      stacks: [987, 989],
      level: 30,
      packets: [
        'item_stack_request 930101b51a0100011b00b60f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101b91a0101013a00b60f00010000',
        'item_stack_request 930101bd1a0100021b01ba0f3a000000',
        'item_stack_request 930101c11a0101023a00ba0f01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101c51a040d000000000005020102ba0f05010001b60f00013b32c51a3a0000010a49726f6e2053776f7264'
      ],
      made: 990
    },
    combine: {
      windowId: 7,
      requestId: -1703,
      stacks: [992, 994],
      level: 58,
      packets: [
        'item_stack_request 930101cd1a0100011b00c00f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101d11a0101013a00c00f00010000',
        'item_stack_request 930101d51a0100011b01c40f3a000000',
        'item_stack_request 930101d91a0101013a00c40f01020000',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101dd1a040d000000000005010102c40f05010001c00f00013b32dd1a3a0000010a49726f6e2053776f7264'
      ],
      made: 995
    },
    rename: {
      windowId: 28,
      requestId: -2013,
      stacks: [1122],
      level: 170,
      packets: [
        'item_stack_request 930101b91f0100011b00c4113a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101bd1f0101013a00c41100010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'anvil_damage 8d0100040400',
        'item_stack_request 930101c11f030d000000000005010001c41100013b32c11f3a0000011149726f6e2053776f726466697874757265'
      ],
      made: 1123
    }
  },
  {
    // recorded on 1.18.12.1 (its repair and rename rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.11',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4029,
      stacks: [2929, 2931],
      level: 30,
      packets: [
        'item_stack_request 930101f93e0100011b00e22d3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101fd3e0101013a00e22d00010000',
        'item_stack_request 930101813f0100021b01e62d3a000000',
        'item_stack_request 930101853f0101023a00e62d01020000',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101893f040f000000000005020102e62d05010001e22d00013b32893f3a0000010a49726f6e2053776f7264'
      ],
      made: 2932
    },
    combine: {
      windowId: 7,
      requestId: -4041,
      stacks: [2934, 2936],
      level: 58,
      packets: [
        'item_stack_request 930101913f0100011b00ec2d3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101953f0101013a00ec2d00010000',
        'item_stack_request 930101993f0100011b01f02d3a000000',
        'item_stack_request 9301019d3f0101013a00f02d01020000',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101a13f040f000000000005010102f02d05010001ec2d00013b32a13f3a0000010a49726f6e2053776f7264'
      ],
      made: 2937
    },
    rename: {
      windowId: 28,
      requestId: -4351,
      stacks: [3037],
      level: 170,
      packets: [
        'item_stack_request 930101fd430100011b00ba2f3a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010181440101013a00ba2f00010000',
        'filter_text_packet a3011149726f6e2053776f72646669787475726500',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018544030f000000000005010001ba2f00013b3285443a0000011149726f6e2053776f726466697874757265'
      ],
      made: 3038
    }
  },
  {
    // recorded on 1.18.30.4 (its combine rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.19.21',
    player: 7n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3201,
      stacks: [2524, 2526],
      level: 30,
      packets: [
        'item_stack_request 93010181320100011b00b8273a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0700000000',
        'item_stack_request 93010185320101013a00b82700010000',
        'item_stack_request 93010189320100021b01bc273a000000',
        'item_stack_request 9301018d320101023a00bc2701020000',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019132040f000000000005020102bc2705010001b82700013b3291323a0000010a49726f6e2053776f7264'
      ],
      made: 2527
    },
    combine: {
      windowId: 7,
      requestId: -3213,
      stacks: [2529, 2531],
      level: 58,
      packets: [
        'item_stack_request 93010199320100011b00c2273a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0700000000',
        'item_stack_request 9301019d320101013a00c22700010000',
        'item_stack_request 930101a1320100011b01c6273a000000',
        'item_stack_request 930101a5320101013a00c62701020000',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101a932040f000000000005010102c62705010001c22700013b32a9323a0000010a49726f6e2053776f7264'
      ],
      made: 2532
    },
    rename: {
      windowId: 28,
      requestId: -3523,
      stacks: [2630],
      level: 170,
      packets: [
        'item_stack_request 93010185370100011b008c293a000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0700000000',
        'item_stack_request 93010189370101013a008c2900010000',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018d37030f0000000000050100018c2900013b328d373a0000011149726f6e2053776f726466697874757265'
      ],
      made: 2631
    }
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    player: 11n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4849,
      stacks: [3445, 3447],
      level: 30,
      packets: [
        'item_stack_request 930101e14b0100011b00ea353a000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101e54b0101013a00ea3500010000ffffffff',
        'item_stack_request 930101e94b0100021b01ee353a000000ffffffff',
        'item_stack_request 930101ed4b0101023a00ee3501020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101f14b040f000000000005020102ee3505010001ea3500013b32f14b3a0000010a49726f6e2053776f726403000000'
      ],
      made: 3448
    },
    combine: {
      windowId: 7,
      requestId: -4861,
      stacks: [3450, 3452],
      level: 58,
      packets: [
        'item_stack_request 930101f94b0100011b00f4353a000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101fd4b0101013a00f43500010000ffffffff',
        'item_stack_request 930101814c0100011b01f8353a000000ffffffff',
        'item_stack_request 930101854c0101013a00f83501020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101894c040f000000000005010102f83505010001f43500013b32894c3a0000010a49726f6e2053776f726403000000'
      ],
      made: 3453
    },
    rename: {
      windowId: 28,
      requestId: -5171,
      stacks: [3553],
      level: 170,
      packets: [
        'item_stack_request 930101e5500100011b00c2373a000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0b00000000',
        'item_stack_request 930101e9500101013a00c23700010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101ed50030f000000000005010001c23700013b32ed503a0000011149726f6e2053776f72646669787475726503000000'
      ],
      made: 3554
    }
  },
  {
    // recorded on 1.19.63.1 (its combine rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.63',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4665,
      stacks: [3303, 3305],
      level: 30,
      packets: [
        'item_stack_request 930101f1480100011c00ce333b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101f5480101013b00ce3300010000ffffffff',
        'item_stack_request 930101f9480100021c01d2333b000000ffffffff',
        'item_stack_request 930101fd480101023b00d23301020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018149040f000000000005020102d23305010001ce3301013c3281490c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0ce60401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3306
    },
    combine: {
      windowId: 7,
      requestId: -4675,
      stacks: [3308, 3310],
      level: 58,
      packets: [
        'item_stack_request 93010185490100011c00d8333b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010189490101013b00d83300010000ffffffff',
        'item_stack_request 9301018d490100011c01dc333b000000ffffffff',
        'item_stack_request 93010191490101013b00dc3301020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019549040f000000000005010102dc3305010001d83301013c3295490c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0ce60401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3311
    },
    rename: {
      windowId: 28,
      requestId: -4983,
      stacks: [3411],
      level: 170,
      packets: [
        'item_stack_request 930101ed4d0100011c00a6353b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101f14d0101013b00a63500010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101f54d030f000000000005010001a63501013c32f54d0c0000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0ce604010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 3412
    }
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    player: 13n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -2903,
      stacks: [2104, 2106],
      level: 30,
      packets: [
        'item_stack_request 930101ad2d0100011c00f0203b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 930101b12d0101013b00f02000010000ffffffff',
        'item_stack_request 930101b52d0100021c01f4203b000000ffffffff',
        'item_stack_request 930101b92d0101023b00f42001020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101bd2d040f000000000005020102f42005010001f02001013c32bd2d0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0de80401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2107
    },
    combine: {
      windowId: 7,
      requestId: -2913,
      stacks: [2109, 2111],
      level: 58,
      packets: [
        'item_stack_request 930101c12d0100011c00fa203b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 930101c52d0101013b00fa2000010000ffffffff',
        'item_stack_request 930101c92d0100011c01fe203b000000ffffffff',
        'item_stack_request 930101cd2d0101013b00fe2001020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101d12d040f000000000005010102fe2005010001fa2001013c32d12d0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0de80401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2112
    },
    rename: {
      windowId: 28,
      requestId: -3221,
      stacks: [2212],
      level: 170,
      packets: [
        'item_stack_request 930101a9320100011c00c8223b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 930101ad320101013b00c82200010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101b132030f000000000005010001c82201013c32b1320c0000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0de804010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2213
    }
  },
  {
    // recorded on 1.20.15.1 (its repair rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3891,
      stacks: [2837, 2839],
      level: 30,
      packets: [
        'item_stack_request 930101e53c0100011c00aa2c3b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101e93c0101013b00aa2c00010000ffffffff',
        'item_stack_request 930101ed3c0100021c01ae2c3b000000ffffffff',
        'item_stack_request 930101f13c0101023b00ae2c01020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101f53c040f000000000005020102ae2c05010001aa2c01013c32f53c0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cea0401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2840
    },
    combine: {
      windowId: 7,
      requestId: -3901,
      stacks: [2842, 2844],
      level: 58,
      packets: [
        'item_stack_request 930101f93c0100011c00b42c3b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101fd3c0101013b00b42c00010000ffffffff',
        'item_stack_request 930101813d0100011c01b82c3b000000ffffffff',
        'item_stack_request 930101853d0101013b00b82c01020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101893d040f000000000005010102b82c05010001b42c01013c32893d0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cea0401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2845
    },
    rename: {
      windowId: 29,
      requestId: -4229,
      stacks: [2954],
      level: 170,
      packets: [
        'item_stack_request 93010189420100011c00942e3b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 9301018d420101013b00942e00010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019142030f000000000005010001942e01013c3291420c0000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cea04010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2955
    }
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4601,
      stacks: [3258, 3260],
      level: 30,
      packets: [
        'item_stack_request 930101f1470100011c00f4323b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101f5470101013b00f43200010000ffffffff',
        'item_stack_request 930101f9470100021c01f8323b000000ffffffff',
        'item_stack_request 930101fd470101023b00f83201020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018148040f000000000005020102f83205010001f43201013c3281480c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cec0401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3261
    },
    combine: {
      windowId: 7,
      requestId: -4611,
      stacks: [3263, 3265],
      level: 58,
      packets: [
        'item_stack_request 93010185480100011c00fe323b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010189480101013b00fe3200010000ffffffff',
        'item_stack_request 9301018d480100011c0182333b000000ffffffff',
        'item_stack_request 93010191480101013b00823301020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019548040f000000000005010102823305010001fe3201013c3295480c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cec0401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3266
    },
    rename: {
      windowId: 29,
      requestId: -4939,
      stacks: [3375],
      level: 170,
      packets: [
        'item_stack_request 930101954d0100011c00de343b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101994d0101013b00de3400010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019d4d030f000000000005010001de3401013c329d4d0c0000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cec04010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 3376
    }
  },
  {
    // recorded on 1.21.1.3 (its rename rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -4841,
      stacks: [3427, 3429],
      level: 30,
      packets: [
        'item_stack_request 930101d14b0100011c00c6353b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101d54b0101013b00c63500010000ffffffff',
        'item_stack_request 930101d94b0100021c01ca353b000000ffffffff',
        'item_stack_request 930101dd4b0101023b00ca3501020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101e14b040f000000000005020102ca3505010001c63501013c32e14b0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf20401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3430
    },
    combine: {
      windowId: 7,
      requestId: -4851,
      stacks: [3432, 3434],
      level: 58,
      packets: [
        'item_stack_request 930101e54b0100011c00d0353b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101e94b0101013b00d03500010000ffffffff',
        'item_stack_request 930101ed4b0100011c01d4353b000000ffffffff',
        'item_stack_request 930101f14b0101013b00d43501020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101f54b040f000000000005010102d43505010001d03501013c32f54b0c000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf20401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 3435
    },
    rename: {
      windowId: 30,
      requestId: -5187,
      stacks: [3548],
      level: 170,
      packets: [
        'item_stack_request 93010185510100011c00b8373b000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010189510101013b00b83700010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018d51030f000000000005010001b83701013c328d510c0000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf204010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 3549
    }
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3197,
      stacks: [2576, 2578],
      level: 30,
      packets: [
        'item_stack_request 930101f9310100011c0000000000a0283b00000000000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101fd310101013b0000000000a0280000000000010000ffffffff',
        'item_stack_request 93010181320100021c0000000001a4283b00000000000000ffffffff',
        'item_stack_request 93010185320101023b0000000000a4280100000000020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018932040f00000000000502010000000002a4280501000000000001a02801013c000000003289320c00000000000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf40401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2579
    },
    combine: {
      windowId: 7,
      requestId: -3207,
      stacks: [2581, 2583],
      level: 58,
      packets: [
        'item_stack_request 9301018d320100011c0000000000aa283b00000000000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010191320101013b0000000000aa280000000000010000ffffffff',
        'item_stack_request 93010195320100011c0000000001ae283b00000000000000ffffffff',
        'item_stack_request 93010199320101013b0000000000ae280100000000020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019d32040f00000000000501010000000002ae280501000000000001aa2801013c00000000329d320c00000000000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf40401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2584
    },
    rename: {
      windowId: 30,
      requestId: -3543,
      stacks: [2697],
      level: 170,
      packets: [
        'item_stack_request 930101ad370100011c0000000000922a3b00000000000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101b1370101013b0000000000922a0000000000010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101b537030f00000000000501000000000001922a01013c0000000032b5370c000000000000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf404010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2698
    }
  },
  {
    // recorded on 1.21.30.3 (its combine and rename rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3197,
      stacks: [2576, 2578],
      level: 30,
      packets: [
        'item_stack_request 930101f9310100011c0000a0283b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101fd310101013b0000a0280000010000ffffffff',
        'item_stack_request 93010181320100021c0001a4283b00000000ffffffff',
        'item_stack_request 93010185320101023b0000a4280100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018932040f00000000000502010002a4280501000001a02801013c003289320c00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf40401000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2579
    },
    combine: {
      windowId: 7,
      requestId: -3207,
      stacks: [2581, 2583],
      level: 58,
      packets: [
        'item_stack_request 9301018d320100011c0000aa283b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010191320101013b0000aa280000010000ffffffff',
        'item_stack_request 93010195320100011c0001ae283b00000000ffffffff',
        'item_stack_request 93010199320101013b0000ae280100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019d32040f00000000000501010002ae280501000001aa2801013c00329d320c00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf40401000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2584
    },
    rename: {
      windowId: 30,
      requestId: -3543,
      stacks: [2697],
      level: 170,
      packets: [
        'item_stack_request 930101ad370100011c0000922a3b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101b1370101013b0000922a0000010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101b537030f00000000000501000001922a01013c0032b5370c000000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0cf404010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2698
    }
  },
  {
    // recorded on 1.21.124.2
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.124',
    player: 13n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3329,
      stacks: [2739, 2741],
      level: 30,
      packets: [
        'item_stack_request 93010181340100011c0000e62a3b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 93010185340101013b0000e62a0000010000ffffffff',
        'item_stack_request 93010189340100021c0001ea2a3b00000000ffffffff',
        'item_stack_request 9301018d340101023b0000ea2a0100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301019134040f00000000000502010002ea2a0501000001e62a01013c003291340c00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d960501000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2742
    },
    combine: {
      windowId: 7,
      requestId: -3339,
      stacks: [2744, 2746],
      level: 58,
      packets: [
        'item_stack_request 93010195340100011c0000f02a3b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 93010199340101013b0000f02a0000010000ffffffff',
        'item_stack_request 9301019d340100011c0001f42a3b00000000ffffffff',
        'item_stack_request 930101a1340101013b0000f42a0100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101a534040f00000000000501010002f42a0501000001f02a01013c0032a5340c00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d960501000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2747
    },
    rename: {
      windowId: 30,
      requestId: -3675,
      stacks: [2860],
      level: 170,
      packets: [
        'item_stack_request 930101b5390100011c0000d82c3b00000000ffffffff',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d00000000',
        'item_stack_request 930101b9390101013b0000d82c0000010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101bd39030f00000000000501000001d82c01013c0032bd390c000000011149726f6e2053776f72646669787475726503000000',
        'interact 210400000000000000000000000000',
        'mob_equipment 1f0d9605010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2861
    }
  },
  {
    // recorded on 1.21.132.1 (its rename rolled damage 1: the bot's 0 here)
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.0',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3305,
      stacks: [2711, 2713],
      level: 30,
      packets: [
        'item_stack_request 930101d1330100011c0000ae2a3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101d5330101013b0000ae2a0000010000ffffffff',
        'item_stack_request 930101d9330100021c0001b22a3b00000000ffffffff',
        'item_stack_request 930101dd330101023b0000b22a0100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101e133040f00000000000502010002b22a0501000001ae2a01013c0032e1330c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0ca40501000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2714
    },
    combine: {
      windowId: 7,
      requestId: -3315,
      stacks: [2716, 2718],
      level: 58,
      packets: [
        'item_stack_request 930101e5330100011c0000b82a3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101e9330101013b0000b82a0000010000ffffffff',
        'item_stack_request 930101ed330100011c0001bc2a3b00000000ffffffff',
        'item_stack_request 930101f1330101013b0000bc2a0100020000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 930101f533040f00000000000501010002bc2a0501000001b82a01013c0032f5330c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0ca40501000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2719
    },
    rename: {
      windowId: 30,
      requestId: -3651,
      stacks: [2832],
      level: 170,
      packets: [
        'item_stack_request 93010185390100011c0000a02c3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010189390101013b0000a02c0000010000ffffffff',
        'anvil_damage 8d010004c4ffffff0f00',
        'item_stack_request 9301018d39030f00000000000501000001a02c01013c00328d390c000000011149726f6e2053776f72646669787475726503000000',
        'interact 21040000',
        'mob_equipment 1f0ca405010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2833
    }
  },
  {
    // recorded on 1.26.10.4
    from: 'bedrock_1.26.10',
    to: 'bedrock_1.26.10',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3329,
      stacks: [2739, 2741],
      level: 30,
      packets: [
        'item_stack_request 93010181340100011c0000e62a3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010185340101013b0000e62a0000010000ffffffff',
        'item_stack_request 93010189340100021c0001ea2a3b00000000ffffffff',
        'item_stack_request 9301018d340101023b0000ea2a0100020000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 9301019134040f00000000000502010002ea2a0501000001e62a01013c003291340c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0ca40501000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2742
    },
    combine: {
      windowId: 7,
      requestId: -3339,
      stacks: [2744, 2746],
      level: 58,
      packets: [
        'item_stack_request 93010195340100011c0000f02a3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 93010199340101013b0000f02a0000010000ffffffff',
        'item_stack_request 9301019d340100011c0001f42a3b00000000ffffffff',
        'item_stack_request 930101a1340101013b0000f42a0100020000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 930101a534040f00000000000501010002f42a0501000001f02a01013c0032a5340c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0ca40501000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2747
    },
    rename: {
      windowId: 30,
      requestId: -3675,
      stacks: [2860],
      level: 170,
      packets: [
        'item_stack_request 930101b5390100011c0000d82c3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c00000000',
        'item_stack_request 930101b9390101013b0000d82c0000010000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 930101bd39030f00000000000501000001d82c01013c0032bd390c000000011149726f6e2053776f72646669787475726503000000',
        'interact 21040000',
        'mob_equipment 1f0ca405010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2861
    }
  },
  {
    // recorded on 1.26.20.4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.30',
    player: 2n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -75,
      stacks: [32, 34],
      level: 30,
      packets: [
        'item_stack_request 93010195010100011c0000403b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f020000000000000000000000',
        'item_stack_request 93010199010101013b0000400000010000ffffffff',
        'item_stack_request 9301019d010100021c0001443b00000000ffffffff',
        'item_stack_request 930101a1010101023b0000440100020000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 930101a501040f000000000005020100024405010000014001013c0032a5010c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f02520101000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 35
    },
    combine: {
      windowId: 7,
      requestId: -85,
      stacks: [37, 39],
      level: 58,
      packets: [
        'item_stack_request 930101a9010100011c00004a3b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f020000000000000000000000',
        'item_stack_request 930101ad010101013b00004a0000010000ffffffff',
        'item_stack_request 930101b1010100011c00014e3b00000000ffffffff',
        'item_stack_request 930101b5010101013b00004e0100020000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 930101b901040f000000000005010100024e05010000014a01013c0032b9010c00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f02520101000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 40
    },
    rename: {
      windowId: 30,
      requestId: -421,
      stacks: [151],
      level: 170,
      packets: [
        'item_stack_request 930101c9060100011c0000ae023b00000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f020000000000000000000000',
        'item_stack_request 930101cd060101013b0000ae020000010000ffffffff',
        'anvil_damage 8d0100047700',
        'item_stack_request 930101d106030f00000000000501000001ae0201013c0032d1060c000000011149726f6e2053776f72646669787475726503000000',
        'interact 21040000',
        'mob_equipment 1f025201010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 152
    }
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3313,
      stacks: [2716, 2718],
      level: 30,
      packets: [
        'item_stack_request 930101e133010000011c00009c0a00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 930101e533010101013b00009c0a00000000010000000000ffffffff',
        'item_stack_request 930101e933010000021c00019e0a00003b00000000000000ffffffff',
        'item_stack_request 930101ed33010101023b00009e0a00000100020000000000ffffffff',
        'item_stack_request 930101f133040d0f00000000000505020100029e0a00000505010000019c0a00000101013c003207f3ffff0c00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c350101000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2719
    },
    combine: {
      windowId: 7,
      requestId: -3323,
      stacks: [2721, 2723],
      level: 58,
      packets: [
        'item_stack_request 930101f533010000011c0000a10a00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 930101f933010101013b0000a10a00000000010000000000ffffffff',
        'item_stack_request 930101fd33010000011c0001a30a00003b00000000000000ffffffff',
        'item_stack_request 9301018134010101013b0000a30a00000100020000000000ffffffff',
        'item_stack_request 9301018534040d0f0000000000050501010002a30a0000050501000001a10a00000101013c0032fdf2ffff0c00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c350101000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2724
    },
    rename: {
      windowId: 30,
      requestId: -3659,
      stacks: [2837],
      level: 170,
      packets: [
        'item_stack_request 9301019539010000011c0000150b00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 9301019939010101013b0000150b00000000010000000000ffffffff',
        'item_stack_request 9301019d39030d0f0000000000050501000001150b00000101013c0032b1f1ffff0c000000000000011149726f6e2053776f72646669787475726503000000',
        'interact 21040000',
        'mob_equipment 1f0c3501010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2838
    }
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    player: 12n,
    at: { x: 2, y: -60, z: 0 },
    repair: {
      windowId: 6,
      requestId: -3361,
      stacks: [2723, 2725],
      level: 30,
      packets: [
        'item_stack_request 930101c134010000011c0000a30a00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 930101c534010101013b0000a30a00000000010000000000ffffffff',
        'item_stack_request 930101c934010000021c0001a50a00003b00000000000000ffffffff',
        'item_stack_request 930101cd34010101023b0000a50a00000100020000000000ffffffff',
        'item_stack_request 930101d134040d0f0000000000050502010002a50a0000050501000001a30a00000101013c0032d7f2ffff0c00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c350101000000002dffff010a000003060044616d6167654c000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2726
    },
    combine: {
      windowId: 7,
      requestId: -3371,
      stacks: [2728, 2730],
      level: 58,
      packets: [
        'item_stack_request 930101d534010000011c0000a80a00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 930101d934010101013b0000a80a00000000010000000000ffffffff',
        'item_stack_request 930101dd34010000011c0001aa0a00003b00000000000000ffffffff',
        'item_stack_request 930101e134010101013b0000aa0a00000100020000000000ffffffff',
        'item_stack_request 930101e534040d0f0000000000050501010002aa0a0000050501000001a80a00000101013c0032cdf2ffff0c00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c350101000000002dffff010a000003060044616d61676578000000030a00526570616972436f737401000000000000000000000000000000'
      ],
      made: 2731
    },
    rename: {
      windowId: 30,
      requestId: -3707,
      stacks: [2844],
      level: 170,
      packets: [
        'item_stack_request 930101f539010000011c00001c0b00003b00000000000000ffffffff',
        'interact 21040000',
        'mob_equipment 1f0c0000000000000000000000',
        'item_stack_request 930101f939010101013b00001c0b00000000010000000000ffffffff',
        'item_stack_request 930101fd39030d0f00000000000505010000011c0b00000101013c003281f1ffff0c000000000000011149726f6e2053776f72646669787475726503000000',
        'interact 21040000',
        'mob_equipment 1f0c3501010000000052ffff010a000003060044616d61676500000000030a00526570616972436f7374000000000a0700646973706c61790804004e616d65110049726f6e2053776f72646669787475726500000000000000000000000000'
      ],
      made: 2845
    }
  },
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

type SentRequest = BedrockServerboundPackets['item_stack_request']['requests'][number]
type SentSlot = NonNullable<SentRequest['actions'][number]['source']>

function refOf (info: SentSlot): SlotRef {
  const type = info.slot_type
  const container = typeof type === 'object' ? type.container_id : type ?? info.container_id
  const slot = info.slot ?? info.slot_id
  assert.ok(typeof container === 'string' && slot !== undefined)
  return { container, slot }
}

function slotName (info: SentSlot): string {
  const { container, slot } = refOf(info)
  return `${container}:${slot}#${info.stack_id}`
}

/** the bot's packets the vanilla client's are compared with, since the last call, as their names and bytes */
function packetsSince (server: FakeBedrockClient): () => string[] {
  const names = new Set<string>(PACKETS)
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(({ name }) => names.has(name)).map(({ name, params }) => `${name} ${server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')}`)
  }
}

/** each request the bot sent since the last call: its id, then its actions' types, counts and slots, then its names and cause */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions, custom_names: names, cause }) => [String(id), ...actions.map(({ type_id: type, count, source, destination }) =>
      [String(type), count, source === undefined ? undefined : slotName(source), destination === undefined ? undefined : `→ ${slotName(destination)}`].filter(part => part !== undefined).join(' ')),
    `${JSON.stringify(names)} ${String(cause)}`].join(', '))
  }
}

function isAnvil (window: Window | null): window is BedrockAnvil {
  return window !== null && 'combine' in window
}

function anvilOf (window: Window | null): BedrockAnvil {
  assert.ok(isAnvil(window))
  return window
}

function itemAt (window: Window, slot: number): Item {
  const item = window.slots[slot]
  assert.ok(item !== null && item !== undefined)
  return item
}

function int (value: number): NbtValue[string] {
  return { type: 'int', value }
}

function compound (value: NbtValue): object {
  return { type: 'compound', name: '', value }
}

/** the player's level, as the version's update_attributes writes it */
function levelAttribute (version: BedrockVersion, level: number): Attributes {
  return [{
    min: 0,
    max: 24791,
    current: level,
    default: 0,
    name: 'minecraft:player.level',
    ...atLeast(version, 'bedrock_1.19.20') ? { modifiers: [] } : {},
    ...atLeast(version, 'bedrock_1.21.30') ? { default_min: 0, default_max: 24791 } : {}
  }]
}

interface AnvilBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  level: (level: number) => void
  sword: (stackId: number, damage: number, repairCost?: number) => Given
  given: (name: string, stackId: number, count?: number) => Given
  /** the item in `ref` given NBT, as the server's commands do */
  nbt: (ref: SlotRef, value: NbtValue) => void
}

async function anvilBot (version: BedrockVersion, player = 1n): Promise<AnvilBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: player, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const idOf = (name: string): number => testBot.bot.registry.itemsByName[name]?.id ?? 0
  const inventory = testBot.internal._inventory
  return {
    ...testBot,
    inventory: new ServerInventory(testBot.server),
    errors,
    level: level => { testBot.server.send('update_attributes', { runtime_entity_id: player, attributes: levelAttribute(version, level), tick: 0n }) },
    sword: (stackId, damage, repairCost) => ({ id: idOf('iron_sword'), count: 1, stackId, ints: repairCost === undefined ? { Damage: damage } : { Damage: damage, RepairCost: repairCost } }),
    given: (name, stackId, count = 1) => ({ id: idOf(name), count, stackId }),
    // the server tells enchantments with an inventory_transaction, which the bot does not read yet
    nbt: (ref, value) => {
      const stack = inventory.stackAt(ref)
      assert.ok(stack !== undefined)
      inventory.predictSlot(ref, withNbt(stack, value))
    }
  }
}

function openAnvil (server: FakeBedrockClient, windowId: number, at = { x: 2, y: -60, z: 0 }): void {
  server.send('container_open', { window_id: windowId, window_type: 'anvil', coordinates: at, runtime_entity_id: -1n })
}

/** the operation's requests answered as the server answers them: each stack keeps its id, the result gets `made`; the level after the result's, if given */
async function served<T> ({ internal, driver, inventory, level: tellLevel, server }: AnvilBot, operation: Promise<T>, made: number, level?: number): Promise<T> {
  let answered = server.sentOf('item_stack_request').length
  let done = false
  operation.then(() => { done = true }, () => { done = true })
  const settled = (): boolean => done
  for (let tick = 0; tick < 60 && !settled(); tick++) {
    await driver.tick()
    const sent = server.sentOf('item_stack_request').flatMap(({ requests }) => requests)
    for (const { request_id: id, actions } of sent.slice(answered)) {
      // a stack the request named keeps the id of the one it came from
      const moved = new Map(actions.flatMap(({ source, destination }) => source === undefined || destination === undefined ? [] : [[slotName(destination), refOf(source).container === 'creative_output' ? made : source.stack_id]]))
      const infos = actions.flatMap(({ source, destination }) => [source, destination]).filter(info => info !== undefined)
      inventory.respond(id, infos.filter(info => refOf(info).container !== 'creative_output').map(info => {
        const ref = refOf(info)
        const stack = internal._inventory.stackAt(ref)
        return { ...ref, count: stack?.count ?? 0, stackId: stack === undefined ? 0 : stack.stackId > 0 ? stack.stackId : Number(moved.get(slotName(info)) ?? 0) }
      }))
      if (level !== undefined && actions.some(({ type_id: type }) => type === 'optional')) tellLevel(level)
    }
    answered = sent.length
  }
  return await operation
}

/** the message `promise` rejects with once a tick ran */
async function rejection (driver: TestBot['driver'], promise: Promise<unknown>): Promise<string> {
  let message = 'resolved'
  const settled = promise.then(() => {}, (error: Error) => { message = error.message })
  await driver.tick()
  await settled
  return message
}

interface Replayed {
  /** the bot's packets: the vanilla client's, then the result put away up to 1.19.40 */
  packets: string[]
  result: object | undefined
  level: number | null
  errors: string[]
}

/** the recorded items given in hotbar slots 0 and 1, the anvil opened, `use` answered as the server did */
async function replay (version: BedrockVersion, { player, at }: RecordedUses, recorded: RecordedUse, given: (testBot: AnvilBot) => Given[], cost: number, use: (anvil: BedrockAnvil) => Promise<void>): Promise<Replayed> {
  const testBot = await anvilBot(version, player)
  const { bot, internal, server, driver, inventory, errors } = testBot
  internal._core.requestIds.continueProcess(recorded.requestId)
  given(testBot).forEach((item, slot) => { inventory.slot('inventory', slot, item) })
  testBot.level(recorded.level)
  openAnvil(server, recorded.windowId, at)
  await driver.ticks(2)
  const anvil = anvilOf(bot.currentWindow)
  const packets = packetsSince(server)
  await served(testBot, use(anvil), recorded.made, recorded.level - cost)
  const replayed = { packets: packets(), result: bot.inventory.slots.find(item => item?.stackId === recorded.made)?.nbt ?? undefined, level: bot.experience.level, errors }
  bot.end()
  return replayed
}

describe('bedrock anvil', () => {
  for (const recordedUses of RECORDED) {
    const { from, to, repair, combine, rename } = recordedUses
    describe(`the vanilla client at an anvil (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        // up to 1.19.40 the result comes to the cursor, which is put away
        const putAway = atLeast(version, 'bedrock_1.19.50') ? [] : ['item_stack_request']

        function compared ({ packets, result, level, errors }: Replayed, recorded: RecordedUse): unknown[] {
          return [packets.slice(0, recorded.packets.length), packets.slice(recorded.packets.length).map(packet => packet.split(' ')[0]), result, level, errors]
        }

        it(`bedrock ${version}: an iron sword of Damage 200 repaired with 2 iron ingots`, async () => {
          const replayed = await replay(version, recordedUses, repair, ({ sword, given }) => [sword(repair.stacks[0] ?? 0, 200), given('iron_ingot', repair.stacks[1] ?? 0, 2)], 2,
            async anvil => { await anvil.combine(itemAt(anvil, HOTBAR), itemAt(anvil, HOTBAR + 1)) })
          assert.deepStrictEqual(compared(replayed, repair), [repair.packets, putAway, compound({ Damage: int(76), RepairCost: int(1) }), repair.level - 2, []])
        })

        it(`bedrock ${version}: two of Damage 200 combined`, async () => {
          const replayed = await replay(version, recordedUses, combine, ({ sword }) => [sword(combine.stacks[0] ?? 0, 200), sword(combine.stacks[1] ?? 0, 200)], 2,
            async anvil => { await anvil.combine(itemAt(anvil, HOTBAR), itemAt(anvil, HOTBAR + 1)) })
          assert.deepStrictEqual(compared(replayed, combine), [combine.packets, putAway, compound({ Damage: int(120), RepairCost: int(1) }), combine.level - 2, []])
        })

        it(`bedrock ${version}: one of Damage 0 renamed`, async () => {
          const replayed = await replay(version, recordedUses, rename, ({ sword }) => [sword(rename.stacks[0] ?? 0, 0)], 1,
            async anvil => { await anvil.rename(itemAt(anvil, HOTBAR), 'Iron Swordfixture') })
          const display: NbtValue = { display: { type: 'compound', value: { Name: { type: 'string', value: 'Iron Swordfixture' } } } }
          assert.deepStrictEqual(compared(replayed, rename), [rename.packets, putAway, compound({ Damage: int(0), RepairCost: int(0), ...display }), rename.level - 1, []])
        })
      }
    })
  }

  describe('the vanilla client closing the anvil: its item, then its material given back, the close after the crafting table\'s animation (1.26.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60')) {
      it(`bedrock ${version}: 2 and 3 diamonds, both to hotbar slot 0`, async () => {
        const { bot, internal, server, driver, inventory, errors, given } = await anvilBot(version)
        internal._core.requestIds.continueProcess(-11)
        openAnvil(server, 3)
        inventory.slot('ui', 1, given('diamond', 118, 2))
        inventory.slot('ui', 2, given('diamond', 119, 3))
        await driver.tick()
        const requests = packetsSince(server)
        const closing = bot.closeWindow(anvilOf(bot.currentWindow))
        await driver.tick()
        // recorded on 1.26.60.5, both in one packet
        assert.deepStrictEqual(requests(), ['item_stack_request 9301021501010102000001760000000c00000000000000ffffffff1901010103010002770000000c0000f5ffffff00ffffffff'])
        inventory.respond(-11, [{ container: 'anvil_input', slot: 1, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 2, stackId: 118 }])
        inventory.respond(-13, [{ container: 'anvil_material', slot: 2, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 5, stackId: 118 }])
        const closes = packetsOf(server, 'container_close')
        const frames: string[][] = []
        for (let frame = 0; frame < 8; frame++) {
          await driver.frame(62.5)
          frames.push(closes())
        }
        // recorded 501 ms after the hand-back
        assert.deepStrictEqual(frames, [[], [], [], [], [], [], [], ['2f03f700']])
        server.send('container_close', { window_id: 3, window_type: 'none', server: false })
        await driver.tick()
        await closing
        assert.deepStrictEqual([bot.currentWindow, bot.inventory.slots[36]?.count, errors], [null, 5, []])
        bot.end()
      })
    }
  })

  describe('on 1.16.201 in creative, which takes no level, no tell of the levels taken (not recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.16.201', 'bedrock_1.16.201')) {
      it(`bedrock ${version}: a sword renamed`, async () => {
        const testBot = await anvilBot(version)
        const { bot, server, driver, inventory, sword } = testBot
        inventory.slot('inventory', 0, sword(20, 0))
        server.send('set_player_game_type', { gamemode: 'creative' })
        openAnvil(server, 3)
        await driver.tick()
        const anvil = anvilOf(bot.currentWindow)
        const packets = packetsSince(server)
        await served(testBot, anvil.rename(itemAt(anvil, HOTBAR), 'Blade'), 30)
        assert.deepStrictEqual(packets().map(packet => packet.split(' ')[0]), ['item_stack_request', 'interact', 'mob_equipment', 'item_stack_request', 'filter_text_packet', 'anvil_damage', 'item_stack_request', 'item_stack_request'])
        bot.end()
      })
    }
  })

  describe('up to 1.19.40, the name a request tells of an item not renamed: its custom name (not recorded)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.19.40', 'bedrock_1.19.40')) {
      it(`bedrock ${version}: a named sword repaired`, async () => {
        const testBot = await anvilBot(version)
        const { bot, server, driver, inventory, sword, given, nbt } = testBot
        inventory.slot('inventory', 0, sword(20, 100))
        inventory.slot('inventory', 1, given('iron_ingot', 21, 2))
        testBot.level(30)
        openAnvil(server, 3)
        await driver.tick()
        nbt({ container: 'hotbar', slot: 0 }, { display: { type: 'compound', value: { Name: { type: 'string', value: 'Blade' } } } })
        const anvil = anvilOf(bot.currentWindow)
        const requests = requestsSince(server)
        await served(testBot, anvil.combine(itemAt(anvil, HOTBAR), itemAt(anvil, HOTBAR + 1)), 30, 28)
        assert.deepStrictEqual(requests().at(-2), '-11, optional, consume 2 anvil_material:2#21, consume 1 anvil_input:1#20, take 1 creative_output:50#-11 → cursor:0#0, ["Blade"] anvil_text')
        bot.end()
      })
    }
  })

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    function block (bot: TestBot['bot'], name: string): Block {
      const state = bot.registry.blocksByName[name]?.defaultState ?? 0
      return prismarineBlock(bot.registry).fromStateId(state, 0)
    }

    const display = (value: NbtValue): NbtValue => ({ display: { type: 'compound', value } })
    const text = (value: string): NbtValue[string] => ({ type: 'string', value })

    it('opens the anvil with openBlock, rejecting a window that is no anvil\'s', async () => {
      const { bot, internal, server, driver } = await anvilBot(version)
      const used: Block[] = []
      let type: 'anvil' | 'workbench' = 'anvil'
      internal.openBlock = async block => {
        used.push(block)
        server.send('container_open', { window_id: 3, window_type: type, coordinates: { x: 2, y: -60, z: 0 }, runtime_entity_id: -1n })
        await bot.waitForTicks(1)
        assert.ok(bot.currentWindow !== null)
        return bot.currentWindow
      }
      const anvil = block(bot, 'anvil')
      const opening = bot.openAnvil(anvil)
      await driver.ticks(2)
      const window = await opening
      assert.deepStrictEqual([used, window.type, window.slots.length, window.inventoryStart, window.craftingResultSlot], [[anvil], 'minecraft:anvil', 39, 3, 2])
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      type = 'workbench'
      const wrong = bot.openAnvil(anvil).then(() => 'resolved', (error: Error) => error.message)
      await driver.ticks(2)
      assert.strictEqual(await wrong, 'Not a anvil-like window: minecraft:crafting_table')
      bot.end()
    })

    it('rejects with Java\'s messages, sending nothing, where the vanilla client shows no result or the player lacks the level; and what is not recorded', async () => {
      const { bot, server, driver, inventory, sword, given, nbt } = await anvilBot(version)
      inventory.slot('inventory', 0, sword(20, 0))
      inventory.slot('inventory', 1, sword(21, 100))
      inventory.slot('inventory', 2, given('stick', 22))
      inventory.slot('inventory', 3, given('iron_ingot', 23, 2))
      inventory.slot('inventory', 4, sword(24, 100))
      inventory.slot('inventory', 5, given('enchanted_book', 25))
      inventory.slot('inventory', 6, { ...given('shears', 26), ints: { Damage: 100 } })
      openAnvil(server, 3)
      await driver.tick()
      nbt({ container: 'hotbar', slot: 4 }, { ench: { type: 'list', value: { type: 'compound', value: [{ id: { type: 'short', value: SHARPNESS }, lvl: { type: 'short', value: 1 } }] } } })
      const anvil = anvilOf(bot.currentWindow)
      const requests = requestsSince(server)
      const [plain, damaged, stick, ingots, enchanted, book, shears] = [0, 1, 2, 3, 4, 5, 6].map(slot => itemAt(anvil, HOTBAR + slot))
      assert.ok(plain !== undefined && damaged !== undefined && stick !== undefined && ingots !== undefined && enchanted !== undefined && book !== undefined && shears !== undefined)
      const messages = [
        await rejection(driver, anvil.combine(plain, ingots)),
        await rejection(driver, anvil.combine(damaged, stick)),
        await rejection(driver, anvil.combine(shears, ingots)),
        await rejection(driver, anvil.combine(damaged, ingots, 'x'.repeat(36))),
        await rejection(driver, anvil.combine(damaged, ingots, 'x'.repeat(35))),
        await rejection(driver, anvil.rename(plain, 'Iron Sword')),
        await rejection(driver, anvil.rename(plain)),
        await rejection(driver, anvil.rename(plain, 'x'.repeat(36))),
        await rejection(driver, anvil.rename(plain, 'Sword')),
        await rejection(driver, anvil.rename(plain, '')),
        await rejection(driver, anvil.combine(enchanted, ingots)),
        await rejection(driver, anvil.combine(damaged, book)),
        await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0)),
        await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 1))
      ]
      inventory.slot('ui', 1, sword(27, 100))
      inventory.slot('ui', 2, given('iron_ingot', 28, 2))
      await driver.tick()
      messages.push(await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0)))
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      await driver.tick()
      messages.push(await rejection(driver, anvil.combine(damaged, ingots)), await rejection(driver, anvil.rename(plain, 'Sword')))
      assert.deepStrictEqual([messages, requests()], [[
        'Not anvil-able (in either direction), cancelling.',
        'Not anvil-able (in either direction), cancelling.',
        'Not anvil-able (in either direction), cancelling.',
        'Name is too long.',
        'Player does not have enough xp to do action, cancelling.',
        'Not valid rename, cancelling.',
        'Not valid rename, cancelling.',
        'Name is too long.',
        'Player does not have enough xp to do action, cancelling.',
        'the anvil with an empty name is not supported on Bedrock yet',
        'the anvil with enchantments is not supported on Bedrock yet',
        'the anvil with enchantments is not supported on Bedrock yet',
        'the anvil holds nothing to repair or name',
        'clickWindow: mode 1 on the anvil\'s result is not supported on Bedrock yet',
        'clickWindow: the anvil\'s result costs 2 levels, and the player has 0',
        'combine needs the anvil open',
        'rename needs the anvil open'
      ], []])
      bot.end()
    })

    it('a click on the result makes nothing without a result or below its level, and forgets the name after a rename', async () => {
      const testBot = await anvilBot(version)
      const { bot, internal, server, driver, inventory, sword, given } = testBot
      internal._core.requestIds.continueProcess(-3)
      inventory.slot('inventory', 0, sword(20, 0))
      inventory.slot('inventory', 1, sword(21, 100))
      inventory.slot('inventory', 2, given('iron_ingot', 22, 2))
      testBot.level(1)
      openAnvil(server, 3)
      await driver.tick()
      const anvil = anvilOf(bot.currentWindow)
      const requests = requestsSince(server)
      const listeners = bot.listenerCount('experience')
      const renaming = anvil.rename(itemAt(anvil, HOTBAR), 'Sword')
      let done = false
      renaming.then(() => { done = true }, () => {})
      // the server took the request; the rename waits for the level it took
      await served(testBot, bot.waitForTicks(20), 30)
      const waited = !done
      testBot.level(0)
      await driver.tick()
      await renaming
      const renamed = bot.inventory.slots[36]?.customName
      await served(testBot, bot.moveSlotItem(HOTBAR + 1, 0), 0)
      const messages = [await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0))]
      await served(testBot, bot.moveSlotItem(HOTBAR + 2, 1), 0)
      messages.push(await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0)))
      testBot.level(2)
      await driver.tick()
      await served(testBot, bot.clickWindow(RESULT_SLOT, 0, 0), 31)
      assert.deepStrictEqual([waited, renamed, messages, requests(), bot.listenerCount('experience') === listeners], [true, 'Sword', [
        'clickWindow: the anvil shows no result',
        'clickWindow: the anvil\'s result costs 2 levels, and the player has 0'
      ], [
        '-3, take 1 hotbar:0#20 → cursor:0#0, [] -1',
        '-5, place 1 cursor:0#20 → anvil_input:1#0, [] -1',
        '-7, optional, consume 1 anvil_input:1#20, place 1 creative_output:50#-7 → hotbar_and_inventory:0#0, ["Sword"] anvil_text',
        '-9, take 1 hotbar:1#21 → cursor:0#0, [] -1',
        '-11, place 1 cursor:0#21 → anvil_input:1#0, [] -1',
        '-13, take 2 hotbar:2#22 → cursor:0#0, [] -1',
        '-15, place 2 cursor:0#22 → anvil_material:2#0, [] -1',
        '-17, optional, consume 2 anvil_material:2#22, consume 1 anvil_input:1#21, place 1 creative_output:50#-17 → hotbar_and_inventory:1#0, [] -1'
      ], true])
      bot.end()
    })

    it('takes the material it needs, adds the prior work, takes the way that makes a result and refuses 40 levels, as Java\'s rules (not recorded)', async () => {
      const testBot = await anvilBot(version)
      const { bot, internal, server, driver, inventory, sword, given } = testBot
      internal._core.requestIds.continueProcess(-3)
      inventory.slot('inventory', 0, sword(20, 0, 3))
      inventory.slot('inventory', 1, sword(21, 240, 1))
      inventory.slot('inventory', 2, sword(22, 100, 37))
      inventory.slot('inventory', 3, sword(23, 100, 38))
      inventory.slot('inventory', 4, given('iron_ingot', 24, 2))
      inventory.slot('inventory', 5, sword(25, 200))
      inventory.slot('inventory', 6, given('iron_ingot', 26, 5))
      testBot.level(5)
      openAnvil(server, 3)
      await driver.tick()
      const anvil = anvilOf(bot.currentWindow)
      const requests = requestsSince(server)
      const [fresh, used, pricey, tooPricey, ingots, worn, more] = [0, 1, 2, 3, 4, 5, 6].map(slot => itemAt(anvil, HOTBAR + slot))
      assert.ok(fresh !== undefined && used !== undefined && pricey !== undefined && tooPricey !== undefined && ingots !== undefined && worn !== undefined && more !== undefined)
      // only the used sword first makes a result: the fresh one has nothing to repair; 2 levels and both's prior work
      const worked = await rejection(driver, anvil.combine(fresh, used))
      testBot.level(6)
      await driver.tick()
      await served(testBot, anvil.combine(fresh, used), 30, 0)
      const tooExpensive = await rejection(driver, anvil.combine(tooPricey, ingots))
      testBot.level(38)
      await driver.tick()
      const short = await rejection(driver, anvil.combine(pricey, ingots))
      testBot.level(39)
      await driver.tick()
      await served(testBot, anvil.combine(pricey, ingots), 31, 0)
      testBot.level(4)
      await driver.tick()
      const unnamed = await rejection(driver, anvil.combine(worn, more, 'Mended'))
      testBot.level(5)
      await driver.tick()
      await served(testBot, anvil.combine(worn, more, 'Mended'), 32, 0)
      assert.deepStrictEqual([worked, tooExpensive, short, unnamed, [36, 37, 38].map(slot => bot.inventory.slots[slot]?.nbt), anvil.slots[1]?.count, requests().filter(request => request.includes('optional'))], [
        'Player does not have enough xp to do action, cancelling.',
        'Not anvil-able (in either direction), cancelling.',
        'Player does not have enough xp to do action, cancelling.',
        'Player does not have enough xp to do action, cancelling.',
        [
          compound({ Damage: int(0), RepairCost: int(7) }),
          compound({ Damage: int(0), RepairCost: int(75) }),
          compound({ Damage: int(0), RepairCost: int(1), ...display({ Name: text('Mended') }) })
        ],
        1,
        [
          '-11, optional, consume 1 anvil_material:2#20, consume 1 anvil_input:1#21, place 1 creative_output:50#-11 → hotbar_and_inventory:0#0, [] -1',
          '-21, optional, consume 2 anvil_material:2#24, consume 1 anvil_input:1#22, place 1 creative_output:50#-21 → hotbar_and_inventory:1#0, [] -1',
          '-31, optional, consume 4 anvil_material:2#26, consume 1 anvil_input:1#25, place 1 creative_output:50#-31 → hotbar_and_inventory:2#0, ["Mended"] anvil_text'
        ]
      ])
      bot.end()
    })

    it('renames a named item keeping the rest of its display, at most 39 levels for its prior work; in creative at any level, without waiting for it; an item of no NBT', async () => {
      const testBot = await anvilBot(version)
      const { bot, server, driver, inventory, sword, given, nbt } = testBot
      inventory.slot('inventory', 0, sword(20, 0, 50))
      inventory.slot('inventory', 1, given('stick', 21))
      testBot.level(38)
      openAnvil(server, 3)
      await driver.tick()
      const lore: NbtValue = { Lore: { type: 'list', value: { type: 'string', value: ['old'] } } }
      nbt({ container: 'hotbar', slot: 0 }, display({ Name: text('Old'), ...lore }))
      const anvil = anvilOf(bot.currentWindow)
      const [named, stick] = [0, 1].map(slot => itemAt(anvil, HOTBAR + slot))
      assert.ok(named !== undefined && stick !== undefined)
      const messages = [await rejection(driver, anvil.rename(named, 'Old')), await rejection(driver, anvil.rename(named, 'New'))]
      testBot.level(39)
      await driver.tick()
      await served(testBot, anvil.rename(named, 'New'), 30, 0)
      const renamed = bot.inventory.slots[36]?.nbt
      server.send('set_player_game_type', { gamemode: 'creative' })
      await driver.tick()
      await served(testBot, anvil.rename(stick, 'Free'), 31)
      assert.deepStrictEqual([messages, renamed, bot.inventory.slots[37]?.nbt, bot.experience.level], [
        ['Not valid rename, cancelling.', 'Player does not have enough xp to do action, cancelling.'],
        compound({ Damage: int(0), RepairCost: int(50), ...display({ Name: text('New'), ...lore }) }),
        compound({ RepairCost: int(0), ...display({ Name: text('Free') }) }),
        0
      ])
      bot.end()
    })

    it('leaves an item already in its slot there, as the vanilla client renames the item it holds', async () => {
      const testBot = await anvilBot(version)
      const { bot, server, driver, inventory, sword, given } = testBot
      inventory.slot('inventory', 1, sword(22, 100))
      openAnvil(server, 3)
      inventory.slot('ui', 1, sword(20, 0))
      testBot.level(30)
      await driver.tick()
      const anvil = anvilOf(bot.currentWindow)
      const requests = requestsSince(server)
      await served(testBot, anvil.rename(itemAt(anvil, 0), 'Blade'), 30, 29)
      inventory.slot('ui', 2, given('iron_ingot', 21, 2))
      await driver.tick()
      await served(testBot, anvil.combine(itemAt(anvil, HOTBAR + 1), itemAt(anvil, 1)), 31, 27)
      assert.deepStrictEqual(requests(), [
        '-3, optional, consume 1 anvil_input:1#20, place 1 creative_output:50#-3 → hotbar_and_inventory:0#0, ["Blade"] anvil_text',
        '-5, take 1 hotbar:1#22 → cursor:0#0, [] -1',
        '-7, place 1 cursor:0#22 → anvil_input:1#0, [] -1',
        '-9, optional, consume 2 anvil_material:2#21, consume 1 anvil_input:1#22, place 1 creative_output:50#-9 → hotbar_and_inventory:1#0, [] -1'
      ])
      bot.end()
    })

    it('finds the item given in the window, as Java\'s anvil an item of bot.inventory: its own stack, else the first of its type, metadata and NBT; rejects one in no slot', async () => {
      const testBot = await anvilBot(version)
      const { bot, server, driver, inventory, sword, given } = testBot
      inventory.slot('inventory', 0, sword(101, 200))
      inventory.slot('inventory', 1, sword(103, 200))
      inventory.slot('inventory', 7, given('dirt', 105))
      inventory.slot('inventory', 9, sword(107, 100))
      openAnvil(server, 3)
      testBot.level(30)
      await driver.tick()
      const anvil = anvilOf(bot.currentWindow)
      const requests = requestsSince(server)
      const [one, two] = [bot.inventory.slots[36], bot.inventory.slots[37]]
      assert.ok(one != null && two != null)
      await served(testBot, anvil.combine(one, two), 200, 28)
      const made = itemAt(anvil, HOTBAR)
      // an item the program made: the dirt's stack id, the result's NBT
      const Item = prismarineItem(bot.registry)
      await served(testBot, anvil.rename(new Item(made.type, 1, 0, made.nbt ?? undefined, 105), 'Blade'), 201, 26)
      // and one of the fourth sword's NBT but another metadata
      const missing = await rejection(driver, anvil.rename(new Item(one.type, 1, 5, itemAt(anvil, 3).nbt ?? undefined, 999), 'Blade'))
      assert.deepStrictEqual([requests(), missing], [[
        '-3, take 1 hotbar:0#101 → cursor:0#0, [] -1',
        '-5, place 1 cursor:0#101 → anvil_input:1#0, [] -1',
        '-7, take 1 hotbar:1#103 → cursor:0#0, [] -1',
        '-9, place 1 cursor:0#103 → anvil_material:2#0, [] -1',
        '-11, optional, consume 1 anvil_material:2#103, consume 1 anvil_input:1#101, place 1 creative_output:50#-11 → hotbar_and_inventory:0#0, [] -1',
        '-13, take 1 hotbar:0#200 → cursor:0#0, [] -1',
        '-15, place 1 cursor:0#200 → anvil_input:1#0, [] -1',
        '-17, optional, consume 1 anvil_input:1#200, place 1 creative_output:50#-17 → hotbar_and_inventory:0#0, ["Blade"] anvil_text'
      ], 'rename: the iron_sword given is in no slot of the window'])
      bot.end()
    })

    it('rejects a result the inventory has no room for (not recorded)', async () => {
      const testBot = await anvilBot(version)
      const { bot, server, driver, inventory, sword, given } = testBot
      inventory.content('inventory', Array.from({ length: 36 }, (_, slot) => given('stick', 100 + slot)))
      openAnvil(server, 3)
      inventory.slot('ui', 1, sword(20, 100))
      inventory.slot('ui', 2, given('iron_ingot', 21, 2))
      testBot.level(30)
      await driver.tick()
      const requests = requestsSince(server)
      assert.deepStrictEqual([await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0)), requests()], ['the anvil\'s result with no room in the inventory is not supported on Bedrock yet', []])
      bot.end()
    })

    it('gives back the cursor\'s item, the item, then the material on close', async () => {
      const { bot, server, driver, inventory, sword, given } = await anvilBot(version)
      openAnvil(server, 3)
      inventory.slot('ui', 0, given('stick', 22))
      inventory.slot('ui', 1, sword(20, 0))
      inventory.slot('ui', 2, given('iron_ingot', 21))
      await driver.tick()
      const requests = requestsSince(server)
      bot.closeWindow(anvilOf(bot.currentWindow)).catch(() => {})
      await driver.ticks(2)
      assert.deepStrictEqual(requests(), [
        '-3, place 1 cursor:0#22 → hotbar_and_inventory:0#0, [] -1',
        '-5, place 1 anvil_input:1#20 → hotbar_and_inventory:1#0, [] -1',
        '-7, place 1 anvil_material:2#21 → hotbar_and_inventory:2#0, [] -1'
      ])
      bot.end()
    })
  })
})

/** the bot's packets of `name` since the last call, as their bytes */
function packetsOf (server: FakeBedrockClient, name: 'container_close'): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(packet => packet.name === name).map(({ params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}
