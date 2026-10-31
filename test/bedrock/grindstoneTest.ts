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
import type { BedrockGrindstone, BedrockVersion } from '../../lib/types/api/index.ts'
import type { BedrockServerboundPackets } from '../../lib/types/protocol/bedrock-client.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'

// The vanilla client at a grindstone against Bedrock Dedicated Server, recorded on every build: two iron swords of
// Damage 200 combined, and an iron sword of Sharpness I disenchanted, each sword put in by a click on it and one on its
// slot, then the result clicked. Its requests are compared as their bytes. Versions whose requests are written alike
// (the layout, the craft's action and name, and up to 1.26.30 the sword's network id) are a group, each group's test
// run on each of its versions.

const GRINDSTONE_AT = Object.freeze({ x: 2, y: -60, z: 0 })
const HOTBAR = 30
const RESULT_SLOT = 2
const DROP = 4
const SHARPNESS = 9
const BINDING_CURSE = 27

interface RecordedGrind {
  windowId: number
  /** the first request's: the take of the first sword */
  requestId: number
  /** the stack ids of the swords, in hotbar slots 0 and 1 */
  swords: readonly number[]
  /** the client's requests up to the craft's, as their bytes */
  requests: readonly string[]
  /** the stack id the response gives the result */
  made: number
}

interface RecordedGrinds {
  from: BedrockVersion
  to: BedrockVersion
  combine: RecordedGrind
  disenchant: RecordedGrind
}

const RECORDED: readonly RecordedGrinds[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.201',
    combine: {
      windowId: 8,
      requestId: -3959,
      swords: [2991, 2993],
      requests: [
        '930101ed3d0100011b00de2e3a000000',
        '930101f13d0101013a00de2e31100000',
        '930101f53d0100011b01e22e3a000000',
        '930101f93d0101013a00e22e32110000',
        '930101fd3d050d0e01e60402ffff010a00030644616d61676594020000000105013110de2e05013211e22e00013b32fd3d3a000000'
      ],
      made: 2994
    },
    disenchant: {
      windowId: 27,
      requestId: -4249,
      swords: [3111],
      requests: [
        '930101b1420100011b00ce303a000000',
        '930101b5420101013a00ce3031100000',
        '930101b942040d0e01e60402ffff010a00030644616d616765000000000105013110ce3000013b32b9423a000000'
      ],
      made: 3112
    }
  },
  {
    // recorded on 1.16.210.5
    from: 'bedrock_1.16.210',
    to: 'bedrock_1.16.210',
    combine: {
      windowId: 8,
      requestId: -4923,
      swords: [3477, 3479],
      requests: [
        '930101f54c0100011b00aa363a000000',
        '930101f94c0101013a00aa3631100000',
        '930101fd4c0100011b01ae363a000000',
        '930101814d0101013a00ae3632110000',
        '930101854d050e0f01e60402ffff010a00030644616d61676594020000000105013110aa3605013211ae3600013b32854d3a000000'
      ],
      made: 3480
    },
    disenchant: {
      windowId: 27,
      requestId: -5213,
      swords: [3599],
      requests: [
        '930101b9510100011b009e383a000000',
        '930101bd510101013a009e3831100000',
        '930101c151040e0f01e60402ffff010a00030644616d6167650000000001050131109e3800013b32c1513a000000'
      ],
      made: 3600
    }
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.17.0',
    combine: {
      windowId: 8,
      requestId: -1715,
      swords: [997, 999],
      requests: [
        '930101e51a0100011b00ca0f3a000000',
        '930101e91a0101013a00ca0f31100000',
        '930101ed1a0100011b01ce0f3a000000',
        '930101f11a0101013a00ce0f32110000',
        '930101f51a050e0f01e604010000001cffff010a000003060044616d6167658a0000000000000000000000000105013110ca0f05013211ce0f00013b32f51a3a000000'
      ],
      made: 1000
    },
    disenchant: {
      windowId: 27,
      requestId: -2005,
      swords: [1119],
      requests: [
        '930101a91f0100011b00be113a000000',
        '930101ad1f0101013a00be1131100000',
        '930101b11f040e0f01e604010000001cffff010a000003060044616d616765000000000000000000000000000105013110be1100013b32b11f3a000000'
      ],
      made: 1120
    }
  },
  {
    // recorded on 1.17.30.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    combine: {
      windowId: 8,
      requestId: -4053,
      swords: [2944, 2946],
      requests: [
        '930101a93f0100011b00802e3a000000',
        '930101ad3f0101013a00802e31100000',
        '930101b13f0100011b01842e3a000000',
        '930101b53f0101013a00842e32110000',
        '930101b93f050e0f01e604010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013110802e05013211842e00013b32b93f3a000000'
      ],
      made: 2947
    },
    disenchant: {
      windowId: 27,
      requestId: -4343,
      swords: [3066],
      requests: [
        '930101ed430100011b00f42f3a000000',
        '930101f1430101013a00f42f31100000',
        '930101f543040e0f01e604010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013110f42f00013b32f5433a000000'
      ],
      made: 3067
    }
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.18.0',
    combine: {
      windowId: 8,
      requestId: -1715,
      swords: [997, 999],
      requests: [
        '930101e51a0100011b00ca0f3a000000',
        '930101e91a0101013a00ca0f31100000',
        '930101ed1a0100011b01ce0f3a000000',
        '930101f11a0101013a00ce0f32110000',
        '930101f51a050ef11a001101e604010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013110ca0f05013211ce0f00013b32f51a3a000000'
      ],
      made: 1000
    },
    disenchant: {
      windowId: 27,
      requestId: -2005,
      swords: [1119],
      requests: [
        '930101a91f0100011b00be113a000000',
        '930101ad1f0101013a00be1131100000',
        '930101b11f040ead1f001101e604010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013110be1100013b32b11f3a000000'
      ],
      made: 1120
    }
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.19.21',
    combine: {
      windowId: 8,
      requestId: -3225,
      swords: [2534, 2536],
      requests: [
        '930101b1320100011b00cc273a000000',
        '930101b5320101013a00cc2731100000',
        '930101b9320100011b01d0273a000000',
        '930101bd320101013a00d02732110000',
        '930101c1320510bd32001301e604010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013110cc2705013211d02700013b32c1323a000000'
      ],
      made: 2537
    },
    disenchant: {
      windowId: 27,
      requestId: -3515,
      swords: [2627],
      requests: [
        '930101f5360100011b0086293a000000',
        '930101f9360101013a00862931100000',
        '930101fd360410f936001301e604010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013110862900013b32fd363a000000'
      ],
      made: 2628
    }
  },
  {
    // recorded on 1.19.40.2
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    combine: {
      windowId: 8,
      requestId: -4873,
      swords: [3455, 3457],
      requests: [
        '930101914c0100011b00fe353a000000ffffffff',
        '930101954c0101013a00fe3531100000ffffffff',
        '930101994c0100011b0182363a000000ffffffff',
        '9301019d4c0101013a00823632110000ffffffff',
        '930101a14c05109d4c001301e604010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013110fe3505013211823600013b32a14c3a000000ffffffff'
      ],
      made: 3458
    },
    disenchant: {
      windowId: 27,
      requestId: -5163,
      swords: [3550],
      requests: [
        '930101d5500100011b00bc373a000000ffffffff',
        '930101d9500101013a00bc3731100000ffffffff',
        '930101dd500410d950001301e604010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013110bc3700013b32dd503a000000ffffffff'
      ],
      made: 3551
    }
  },
  {
    // recorded on 1.19.63.1
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.63',
    combine: {
      windowId: 8,
      requestId: -4685,
      swords: [3313, 3315],
      requests: [
        '93010199490100011c00e2333b000000ffffffff',
        '9301019d490101013b00e23332100000ffffffff',
        '930101a1490100011c01e6333b000000ffffffff',
        '930101a5490101013b00e63333110000ffffffff',
        '930101a9490510a549001301e604010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013210e23305013311e63300013c32a9493b000000ffffffff'
      ],
      made: 3316
    },
    disenchant: {
      windowId: 27,
      requestId: -4975,
      swords: [3408],
      requests: [
        '930101dd4d0100011c00a0353b000000ffffffff',
        '930101e14d0101013b00a03532100000ffffffff',
        '930101e54d0410e14d001301e604010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013210a03500013c32e54d3b000000ffffffff'
      ],
      made: 3409
    }
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.80',
    combine: {
      windowId: 8,
      requestId: -2923,
      swords: [2114, 2116],
      requests: [
        '930101d52d0100011c0084213b000000ffffffff',
        '930101d92d0101013b00842132100000ffffffff',
        '930101dd2d0100011c0188213b000000ffffffff',
        '930101e12d0101013b00882133110000ffffffff',
        '930101e52d0510e12d001301e804010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013210842105013311882100013c32e52d3b000000ffffffff'
      ],
      made: 2117
    },
    disenchant: {
      windowId: 27,
      requestId: -3213,
      swords: [2209],
      requests: [
        '93010199320100011c00c2223b000000ffffffff',
        '9301019d320101013b00c22232100000ffffffff',
        '930101a13204109d32001301e804010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013210c22200013c32a1323b000000ffffffff'
      ],
      made: 2210
    }
  },
  {
    // recorded on 1.20.15.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    combine: {
      windowId: 8,
      requestId: -3911,
      swords: [2847, 2849],
      requests: [
        '9301018d3d0100011c00be2c3b000000ffffffff',
        '930101913d0101013b00be2c32100000ffffffff',
        '930101953d0100011c01c22c3b000000ffffffff',
        '930101993d0101013b00c22c33110000ffffffff',
        '9301019d3d0510be2c001301ea04010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013210be2c05013311c22c00013c329d3d3b000000ffffffff'
      ],
      made: 2850
    },
    disenchant: {
      windowId: 28,
      requestId: -4221,
      swords: [2951],
      requests: [
        '930101f9410100011c008e2e3b000000ffffffff',
        '930101fd410101013b008e2e32100000ffffffff',
        '93010181420410fd41001301ea04010000002dffff010a000003060044616d61676500000000030a00526570616972436f73740000000000000000000000000001050132108e2e00013c3281423b000000ffffffff'
      ],
      made: 2952
    }
  },
  {
    // recorded on 1.20.50.3
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    combine: {
      windowId: 8,
      requestId: -4621,
      swords: [3268, 3270],
      requests: [
        '93010199480100011c0088333b000000ffffffff',
        '9301019d480101013b00883332100000ffffffff',
        '930101a1480100011c018c333b000000ffffffff',
        '930101a5480101013b008c3333110000ffffffff',
        '930101a94805108833001301ec04010000002dffff010a000003060044616d6167658a000000030a00526570616972436f73740000000000000000000000000001050132108833050133118c3300013c32a9483b000000ffffffff'
      ],
      made: 3271
    },
    disenchant: {
      windowId: 28,
      requestId: -4931,
      swords: [3372],
      requests: [
        '930101854d0100011c00d8343b000000ffffffff',
        '930101894d0101013b00d83432100000ffffffff',
        '9301018d4d0410894d001301ec04010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013210d83400013c328d4d3b000000ffffffff'
      ],
      made: 3373
    }
  },
  {
    // recorded on 1.21.1.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    combine: {
      windowId: 8,
      requestId: -4861,
      swords: [3437, 3439],
      requests: [
        '930101f94b0100011c00da353b000000ffffffff',
        '930101fd4b0101013b00da3532100000ffffffff',
        '930101814c0100011c01de353b000000ffffffff',
        '930101854c0101013b00de3533110000ffffffff',
        '930101894c0510da35001301f204010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013210da3505013311de3500013c32894c3b000000ffffffff'
      ],
      made: 3440
    },
    disenchant: {
      windowId: 29,
      requestId: -5179,
      swords: [3545],
      requests: [
        '930101f5500100011c00b2373b000000ffffffff',
        '930101f9500101013b00b23732100000ffffffff',
        '930101fd500410f950001301f204010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013210b23700013c32fd503b000000ffffffff'
      ],
      made: 3546
    }
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.20',
    combine: {
      windowId: 8,
      requestId: -3217,
      swords: [2586, 2588],
      requests: [
        '930101a1320100011c0000000000b4283b00000000000000ffffffff',
        '930101a5320101013b0000000000b4283200000000100000ffffffff',
        '930101a9320100011c0000000001b8283b00000000000000ffffffff',
        '930101ad320101013b0000000000b8283300000000110000ffffffff',
        '930101b1320510b42801001301f404010000002dffff010a000003060044616d6167658a000000030a00526570616972436f737400000000000000000000000000010501320000000010b4280501330000000011b82800013c0000000032b1323b00000000000000ffffffff'
      ],
      made: 2589
    },
    disenchant: {
      windowId: 29,
      requestId: -3535,
      swords: [2694],
      requests: [
        '9301019d370100011c00000000008c2a3b00000000000000ffffffff',
        '930101a1370101013b00000000008c2a3200000000100000ffffffff',
        '930101a5370410a13701001301f404010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013200000000108c2a00013c0000000032a5373b00000000000000ffffffff'
      ],
      made: 2695
    }
  },
  {
    // recorded on 1.21.30.3
    from: 'bedrock_1.21.30',
    to: 'bedrock_1.21.30',
    combine: {
      windowId: 8,
      requestId: -3217,
      swords: [2586, 2588],
      requests: [
        '930101a1320100011c0000b4283b00000000ffffffff',
        '930101a5320101013b0000b4283200100000ffffffff',
        '930101a9320100011c0001b8283b00000000ffffffff',
        '930101ad320101013b0000b8283300110000ffffffff',
        '930101b1320510b42801001301f404010000002dffff010a000003060044616d6167658a000000030a00526570616972436f737400000000000000000000000000010501320010b4280501330011b82800013c0032b1323b00000000ffffffff'
      ],
      made: 2589
    },
    disenchant: {
      windowId: 29,
      requestId: -3535,
      swords: [2694],
      requests: [
        '9301019d370100011c00008c2a3b00000000ffffffff',
        '930101a1370101013b00008c2a3200100000ffffffff',
        '930101a5370410a13701001301f404010000002dffff010a000003060044616d61676500000000030a00526570616972436f7374000000000000000000000000000105013200108c2a00013c0032a5373b00000000ffffffff'
      ],
      made: 2695
    }
  },
  {
    // recorded on 1.21.124.2
    from: 'bedrock_1.21.42',
    to: 'bedrock_1.21.124',
    combine: {
      windowId: 8,
      requestId: -3349,
      swords: [2749, 2751],
      requests: [
        '930101a9340100011c0000fa2a3b00000000ffffffff',
        '930101ad340101013b0000fa2a3200100000ffffffff',
        '930101b1340100011c0001fe2a3b00000000ffffffff',
        '930101b5340101013b0000fe2a3300110000ffffffff',
        '930101b9340510fa2a010013019605010000002dffff010a000003060044616d6167658a000000030a00526570616972436f737400000000000000000000000000010501320010fa2a0501330011fe2a00013c0032b9343b00000000ffffffff'
      ],
      made: 2752
    },
    disenchant: {
      windowId: 29,
      requestId: -3667,
      swords: [2857],
      requests: [
        '930101a5390100011c0000d22c3b00000000ffffffff',
        '930101a9390101013b0000d22c3200100000ffffffff',
        '930101ad390410a939010013019605010000002dffff010a000003060044616d61676500000000030a00526570616972436f737400000000000000000000000000010501320010d22c00013c0032ad393b00000000ffffffff'
      ],
      made: 2858
    }
  },
  {
    // recorded on 1.26.10.4
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.10',
    combine: {
      windowId: 8,
      requestId: -3349,
      swords: [2749, 2751],
      requests: [
        '930101a9340100011c0000fa2a3b00000000ffffffff',
        '930101ad340101013b0000fa2a3200100000ffffffff',
        '930101b1340100011c0001fe2a3b00000000ffffffff',
        '930101b5340101013b0000fe2a3300110000ffffffff',
        '930101b9340510fa2a01001301a405010000002dffff010a000003060044616d6167658a000000030a00526570616972436f737400000000000000000000000000010501320010fa2a0501330011fe2a00013c0032b9343b00000000ffffffff'
      ],
      made: 2752
    },
    disenchant: {
      windowId: 29,
      requestId: -3667,
      swords: [2857],
      requests: [
        '930101a5390100011c0000d22c3b00000000ffffffff',
        '930101a9390101013b0000d22c3200100000ffffffff',
        '930101ad390410a93901001301a405010000002dffff010a000003060044616d61676500000000030a00526570616972436f737400000000000000000000000000010501320010d22c00013c0032ad393b00000000ffffffff'
      ],
      made: 2858
    }
  },
  {
    // recorded on 1.26.20.4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.30',
    combine: {
      windowId: 8,
      requestId: -95,
      swords: [42, 44],
      requests: [
        '930101bd010100011c0000543b00000000ffffffff',
        '930101c1010101013b0000543200100000ffffffff',
        '930101c5010100011c0001583b00000000ffffffff',
        '930101c9010101013b0000583300110000ffffffff',
        '930101cd0105105401001301a405010000002dffff010a000003060044616d6167658a000000030a00526570616972436f7374000000000000000000000000000105013200105405013300115800013c0032cd013b00000000ffffffff'
      ],
      made: 45
    },
    disenchant: {
      windowId: 29,
      requestId: -413,
      swords: [148],
      requests: [
        '930101b9060100011c0000a8023b00000000ffffffff',
        '930101bd060101013b0000a8023200100000ffffffff',
        '930101c1060410bd0601001301a405010000002dffff010a000003060044616d61676500000000030a00526570616972436f737400000000000000000000000000010501320010a80200013c0032c1063b00000000ffffffff'
      ],
      made: 149
    }
  },
  {
    // recorded on 1.26.40.5
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.51',
    combine: {
      windowId: 8,
      requestId: -3333,
      swords: [2726, 2728],
      requests: [
        '9301018934010000011c0000a60a00003b00000000000000ffffffff',
        '9301018d34010101013b0000a60a00003200100000000000ffffffff',
        '9301019134010000011c0001a80a00003b00000000000000ffffffff',
        '9301019534010101013b0000a80a00003300110000000000ffffffff',
        '9301019934050e10a60a000001001113010101146d696e6563726166743a69726f6e5f73776f7264000100002dffff010a000003060044616d6167658a000000030a00526570616972436f73740000000000000000000000000001050501320010a60a0000050501330011a80a00000000013c0032f3f2ffff3b00000000000000ffffffff'
      ],
      made: 2729
    },
    disenchant: {
      windowId: 29,
      requestId: -3651,
      swords: [2834],
      requests: [
        '9301018539010000011c0000120b00003b00000000000000ffffffff',
        '9301018939010101013b0000120b00003200100000000000ffffffff',
        '9301018d39040e10bbf1ffff01001113010101146d696e6563726166743a69726f6e5f73776f7264000100002dffff010a000003060044616d61676500000000030a00526570616972436f73740000000000000000000000000001050501320010120b00000000013c0032b9f1ffff3b00000000000000ffffffff'
      ],
      made: 2835
    }
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    combine: {
      windowId: 8,
      requestId: -3381,
      swords: [2733, 2735],
      requests: [
        '930101e934010000011c0000ad0a00003b00000000000000ffffffff',
        '930101ed34010101013b0000ad0a00003200100000000000ffffffff',
        '930101f134010000011c0001af0a00003b00000000000000ffffffff',
        '930101f534010101013b0000af0a00003300110000000000ffffffff',
        '930101f934050e10ad0a000001001214010101146d696e6563726166743a69726f6e5f73776f7264000100002dffff010a000003060044616d6167658a000000030a00526570616972436f73740000000000000000000000000001050501320010ad0a0000050501330011af0a00000000013c0032c3f2ffff3b00000000000000ffffffff'
      ],
      made: 2736
    },
    disenchant: {
      windowId: 29,
      requestId: -3699,
      swords: [2841],
      requests: [
        '930101e539010000011c0000190b00003b00000000000000ffffffff',
        '930101e939010101013b0000190b00003200100000000000ffffffff',
        '930101ed39040e108bf1ffff01001214010101146d696e6563726166743a69726f6e5f73776f7264000100002dffff010a000003060044616d61676500000000030a00526570616972436f73740000000000000000000000000001050501320010190b00000000013c003289f1ffff3b00000000000000ffffffff'
      ],
      made: 2842
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

/** the bot's packets of `name` since the last call, as their bytes */
function bytesSince (server: FakeBedrockClient, name: 'item_stack_request' | 'container_close'): () => string[] {
  let seen = server.batches.flat().length
  return () => {
    const all = server.batches.flat()
    const fresh = all.slice(seen)
    seen = all.length
    return fresh.filter(packet => packet.name === name).map(({ params }) => server.codec.serializer.createPacketBuffer({ name, params }).toString('hex'))
  }
}

/** each request the bot sent since the last call: its id, then its actions' types, recipes, counts and slots */
function requestsSince (server: FakeBedrockClient): () => string[] {
  let seen = server.sentOf('item_stack_request').length
  return () => {
    const sent = server.sentOf('item_stack_request')
    const fresh = sent.slice(seen).flatMap(({ requests }) => requests)
    seen = sent.length
    return fresh.map(({ request_id: id, actions }) => [String(id), ...actions.map(({ type_id: type, recipe_network_id: recipe, count, source, destination }) =>
      [String(type), recipe, count, source === undefined ? undefined : slotName(source), destination === undefined ? undefined : `→ ${slotName(destination)}`].filter(part => part !== undefined).join(' '))].join(', '))
  }
}

function isGrindstone (window: Window | null): window is BedrockGrindstone {
  return window !== null && 'grind' in window
}

function grindstoneOf (window: Window | null): BedrockGrindstone {
  assert.ok(isGrindstone(window))
  return window
}

function itemAt (window: Window, slot: number): Item {
  const item = window.slots[slot]
  assert.ok(item !== null && item !== undefined)
  return item
}

function ench (enchantments: readonly number[]): NbtValue {
  return { ench: { type: 'list', value: { type: 'compound', value: enchantments.map(id => ({ id: { type: 'short', value: id }, lvl: { type: 'short', value: 1 } })) } } }
}

/** the result as the vanilla client predicts it: RepairCost from 1.17.10 */
function resultNbt (version: BedrockVersion, damage: number): object {
  const repairCost = atLeast(version, 'bedrock_1.17.10') ? { RepairCost: { type: 'int', value: 0 } } : {}
  return { type: 'compound', name: '', value: { Damage: { type: 'int', value: damage }, ...repairCost } }
}

interface GrindstoneBot extends TestBot {
  inventory: ServerInventory
  errors: string[]
  sword: (stackId: number, damage: number) => Given
  /** the item in `ref` given enchantments, as the server's enchant command does */
  enchant: (ref: SlotRef, ...enchantments: number[]) => void
}

async function grindstoneBot (version: BedrockVersion): Promise<GrindstoneBot> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0') })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { game: { runtime_entity_id: 1n, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const swordId = testBot.bot.registry.itemsByName['iron_sword']?.id ?? 0
  const inventory = testBot.internal._inventory
  return {
    ...testBot,
    inventory: new ServerInventory(testBot.server),
    errors,
    sword: (stackId, damage) => ({ id: swordId, count: 1, stackId, ints: { Damage: damage } }),
    // the server tells it with an inventory_transaction, which the bot does not read yet
    enchant: (ref, ...enchantments) => {
      const stack = inventory.stackAt(ref)
      assert.ok(stack !== undefined)
      inventory.predictSlot(ref, withNbt(stack, ench(enchantments)))
    }
  }
}

function openGrindstone (server: FakeBedrockClient, windowId: number): void {
  server.send('container_open', { window_id: windowId, window_type: 'grindstone', coordinates: GRINDSTONE_AT, runtime_entity_id: -1n })
}

/** the operation's requests answered as the server answers them: each stack keeps its id, the result gets `made` */
async function served<T> ({ internal, server, driver, inventory }: GrindstoneBot, operation: Promise<T>, made: number): Promise<T> {
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

describe('bedrock grindstone', () => {
  for (const { from, to, combine, disenchant } of RECORDED) {
    describe(`the vanilla client grinding iron swords (${from.slice(8)} – ${to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(from, to)) {
        it(`bedrock ${version}: two of Damage 200 combined into one of Damage 138, then put away`, async () => {
          const testBot = await grindstoneBot(version)
          const { bot, internal, server, driver, inventory, errors, sword } = testBot
          internal._core.requestIds.continueProcess(combine.requestId)
          combine.swords.forEach((stackId, slot) => { inventory.slot('inventory', slot, sword(stackId, 200)) })
          openGrindstone(server, combine.windowId)
          await driver.tick()
          const grindstone = grindstoneOf(bot.currentWindow)
          const sent = bytesSince(server, 'item_stack_request')
          const item = await served(testBot, grindstone.grind(itemAt(grindstone, HOTBAR), itemAt(grindstone, HOTBAR + 1)), combine.made)
          const requests = sent()
          assert.deepStrictEqual([requests.slice(0, -1), requests.length, item.name, item.stackId, item.nbt, grindstone.slots.slice(0, 4).map(slot => slot?.stackId), errors],
            [combine.requests, combine.requests.length + 1, 'iron_sword', combine.made, resultNbt(version, 138), [undefined, undefined, undefined, combine.made], []])
          bot.end()
        })

        it(`bedrock ${version}: one of Sharpness I disenchanted`, async () => {
          const testBot = await grindstoneBot(version)
          const { bot, internal, server, driver, inventory, errors, sword, enchant } = testBot
          internal._core.requestIds.continueProcess(disenchant.requestId)
          inventory.slot('inventory', 0, sword(disenchant.swords[0] ?? 0, 0))
          openGrindstone(server, disenchant.windowId)
          await driver.tick()
          enchant({ container: 'hotbar', slot: 0 }, SHARPNESS)
          const grindstone = grindstoneOf(bot.currentWindow)
          const sent = bytesSince(server, 'item_stack_request')
          const item = await served(testBot, grindstone.grind(itemAt(grindstone, HOTBAR)), disenchant.made)
          assert.deepStrictEqual([sent().slice(0, -1), item.stackId, item.nbt, errors], [disenchant.requests, disenchant.made, resultNbt(version, 0), []])
          bot.end()
        })
      }
    })
  }

  describe('the vanilla client closing the grindstone: its second item, then its first given back, the close after the crafting table\'s animation (1.26.60)', () => {
    for (const version of bedrockTestVersionsFrom('bedrock_1.26.60')) {
      it(`bedrock ${version}: 18 and 17 iron ingots, both to hotbar slot 0`, async () => {
        const { bot, internal, server, driver, inventory, errors } = await grindstoneBot(version)
        internal._core.requestIds.continueProcess(-409)
        const ingot = bot.registry.itemsByName['iron_ingot']?.id ?? 0
        openGrindstone(server, 3)
        inventory.slot('ui', 16, { id: ingot, count: 17, stackId: 1314 })
        inventory.slot('ui', 17, { id: ingot, count: 18, stackId: 1315 })
        await driver.tick()
        const sent = bytesSince(server, 'item_stack_request')
        const closing = bot.closeWindow(grindstoneOf(bot.currentWindow))
        await driver.tick()
        // recorded on 1.26.60.5, both in one packet
        assert.deepStrictEqual(sent(), ['930102b10601010112330011230500000c00000000000000ffffffffb50601010111320010220500000c000067feffff00ffffffff'])
        inventory.respond(-409, [{ container: 'grindstone_additional', slot: 17, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 18, stackId: 1315 }])
        inventory.respond(-411, [{ container: 'grindstone_input', slot: 16, count: 0 }, { container: 'hotbar_and_inventory', slot: 0, count: 35, stackId: 1315 }])
        const closes = bytesSince(server, 'container_close')
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
        assert.deepStrictEqual([bot.currentWindow, bot.inventory.slots[36]?.count, errors], [null, 35, []])
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

    function idOf (bot: TestBot['bot'], name: string): number {
      return bot.registry.itemsByName[name]?.id ?? 0
    }

    it('opens the grindstone with openBlock, rejecting a window that is no grindstone\'s', async () => {
      const { bot, internal, server, driver } = await grindstoneBot(version)
      const used: Block[] = []
      let type: 'grindstone' | 'workbench' = 'grindstone'
      internal.openBlock = async block => {
        used.push(block)
        server.send('container_open', { window_id: 3, window_type: type, coordinates: GRINDSTONE_AT, runtime_entity_id: -1n })
        await bot.waitForTicks(1)
        assert.ok(bot.currentWindow !== null)
        return bot.currentWindow
      }
      const grindstone = block(bot, 'grindstone')
      const opening = bot.bedrock.openGrindstone(grindstone)
      await driver.ticks(2)
      const window = await opening
      assert.deepStrictEqual([used, window.type, window.slots.length, window.inventoryStart, window.craftingResultSlot], [[grindstone], 'minecraft:grindstone', 39, 3, 2])
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      type = 'workbench'
      const wrong = bot.bedrock.openGrindstone(grindstone).then(() => 'resolved', (error: Error) => error.message)
      await driver.ticks(2)
      assert.strictEqual(await wrong, 'openGrindstone: the block opened a minecraft:crafting_table window, not a grindstone')
      bot.end()
    })

    it('rejects, sending nothing, where the vanilla client shows no result, what is not recorded, and a grindstone not open', async () => {
      const { bot, server, driver, inventory, sword, enchant } = await grindstoneBot(version)
      inventory.slot('inventory', 0, sword(20, 0))
      inventory.slot('inventory', 1, { id: idOf(bot, 'diamond_sword'), count: 1, stackId: 21, ints: { Damage: 0 } })
      inventory.slot('inventory', 2, { id: idOf(bot, 'enchanted_book'), count: 1, stackId: 22 })
      inventory.slot('inventory', 3, sword(23, 0))
      openGrindstone(server, 3)
      await driver.tick()
      enchant({ container: 'hotbar', slot: 3 }, SHARPNESS, BINDING_CURSE)
      const grindstone = grindstoneOf(bot.currentWindow)
      const requests = requestsSince(server)
      const [plain, diamond, book, cursed] = [0, 1, 2, 3].map(slot => itemAt(grindstone, HOTBAR + slot))
      assert.ok(plain !== undefined && diamond !== undefined && book !== undefined && cursed !== undefined)
      const messages = [
        await rejection(driver, grindstone.grind(plain)),
        await rejection(driver, grindstone.grind(plain, null)),
        await rejection(driver, grindstone.grind(plain, diamond)),
        await rejection(driver, grindstone.grind(book)),
        await rejection(driver, grindstone.grind(plain, book)),
        await rejection(driver, grindstone.grind(cursed)),
        await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 0)),
        await rejection(driver, bot.clickWindow(RESULT_SLOT, 0, 1))
      ]
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      await driver.tick()
      messages.push(await rejection(driver, grindstone.grind(plain, plain)))
      assert.deepStrictEqual([messages, requests()], [[
        'the grindstone makes nothing of iron_sword without enchantments',
        'the grindstone makes nothing of iron_sword without enchantments',
        'the grindstone makes nothing of iron_sword and diamond_sword',
        'grinding enchanted_book is not supported on Bedrock yet',
        'grinding enchanted_book is not supported on Bedrock yet',
        'grinding iron_sword with a curse is not supported on Bedrock yet',
        'the grindstone holds nothing to grind',
        'clickWindow: mode 1 on the grindstone\'s result is not supported on Bedrock yet',
        'grind needs the grindstone open'
      ], []])
      bot.end()
    })

    it('names its slots anew in each grindstone opened, a drop not changing them; grinds its second slot alone', async () => {
      const testBot = await grindstoneBot(version)
      const { bot, internal, server, driver, inventory, sword, enchant } = testBot
      internal._core.requestIds.continueProcess(-3)
      inventory.slot('inventory', 0, sword(20, 0))
      inventory.slot('inventory', 1, { id: idOf(bot, 'stick'), count: 1, stackId: 21 })
      openGrindstone(server, 3)
      await driver.tick()
      const first = grindstoneOf(bot.currentWindow)
      await served(testBot, bot.moveSlotItem(HOTBAR, 0), 0)
      server.send('container_close', { window_id: 3, window_type: 'none', server: true })
      openGrindstone(server, 4)
      inventory.slot('ui', 16, null)
      inventory.slot('ui', 17, sword(30, 100))
      await driver.tick()
      enchant({ container: 'grindstone_additional', slot: 17 }, SHARPNESS)
      const second = grindstoneOf(bot.currentWindow)
      const requests = requestsSince(server)
      await served(testBot, bot.clickWindow(HOTBAR + 1, 0, DROP), 0)
      await served(testBot, bot.clickWindow(RESULT_SLOT, 0, 0), 31)
      const made = second.selectedItem?.nbt
      // not recorded: a slot emptied is named by the request emptying it
      await served(testBot, bot.clickWindow(0, 0, 0), 0)
      await served(testBot, bot.clickWindow(0, 0, 0), 0)
      await served(testBot, bot.clickWindow(HOTBAR + 2, 0, 0), 0)
      inventory.slot('ui', 17, sword(32, 0))
      await driver.tick()
      enchant({ container: 'grindstone_additional', slot: 17 }, SHARPNESS)
      await served(testBot, bot.clickWindow(RESULT_SLOT, 0, 0), 33)
      assert.deepStrictEqual([first === second, requests(), made], [false, [
        '-7, drop 1 hotbar:1#21',
        '-9, craft_grindstone_request 0, results_deprecated, consume 1 grindstone_additional:17#30, take 1 creative_output:50#-9 → cursor:0#0',
        '-11, place 1 cursor:0#31 → grindstone_input:16#0',
        '-13, take 1 grindstone_input:16#31 → cursor:0#0',
        '-15, place 1 cursor:0#31 → hotbar:2#0',
        '-17, craft_grindstone_request -13, results_deprecated, consume 1 grindstone_additional:17#32, take 1 creative_output:50#-17 → cursor:0#0'
      ], { type: 'compound', name: '', value: { Damage: { type: 'int', value: 100 }, RepairCost: { type: 'int', value: 0 } } }])
      bot.end()
    })

    it('combines what both items have left and 5 % of the most, never below Damage 0 (not recorded)', async () => {
      const testBot = await grindstoneBot(version)
      const { bot, server, driver, inventory, sword } = testBot
      for (const [slot, damage] of [200, 100, 10, 0].entries()) inventory.slot('inventory', slot, sword(20 + slot, damage))
      openGrindstone(server, 3)
      await driver.tick()
      const grindstone = grindstoneOf(bot.currentWindow)
      const [first, second, third, fourth] = [0, 1, 2, 3].map(slot => itemAt(grindstone, HOTBAR + slot))
      assert.ok(first !== undefined && second !== undefined && third !== undefined && fourth !== undefined)
      const damages = [
        (await served(testBot, grindstone.grind(first, second), 30)).durabilityUsed,
        (await served(testBot, grindstone.grind(third, fourth), 31)).durabilityUsed
      ]
      assert.deepStrictEqual(damages, [38, 0])
      bot.end()
    })

    it('finds the items given in the window, as Java\'s transfer an item of bot.inventory: its own stack, else the first of its type, metadata and NBT; rejects one in no slot', async () => {
      const testBot = await grindstoneBot(version)
      const { bot, server, driver, inventory, sword } = testBot
      inventory.slot('inventory', 0, sword(101, 200))
      inventory.slot('inventory', 1, sword(103, 100))
      inventory.slot('inventory', 2, sword(107, 50))
      inventory.slot('inventory', 3, sword(109, 10))
      inventory.slot('inventory', 7, { id: idOf(bot, 'dirt'), count: 1, stackId: 105 })
      openGrindstone(server, 3)
      await driver.tick()
      const grindstone = grindstoneOf(bot.currentWindow)
      const requests = requestsSince(server)
      const [one, two, three, four] = [36, 37, 38, 39].map(slot => bot.inventory.slots[slot])
      assert.ok(one != null && two != null && three != null && four != null)
      await served(testBot, grindstone.grind(one, two), 30)
      // an item the program made: the dirt's stack id, the fourth sword's NBT
      const Item = prismarineItem(bot.registry)
      await served(testBot, grindstone.grind(new Item(four.type, 1, 0, four.nbt ?? undefined, 105), three), 31)
      // and one of the first result's NBT but another metadata
      const missing = await rejection(driver, grindstone.grind(new Item(one.type, 1, 5, itemAt(grindstone, 3).nbt ?? undefined, 999), itemAt(grindstone, 4)))
      assert.deepStrictEqual([requests(), missing], [[
        '-3, take 1 hotbar:0#101 → cursor:0#0',
        '-5, place 1 cursor:0#101 → grindstone_input:16#0',
        '-7, take 1 hotbar:1#103 → cursor:0#0',
        '-9, place 1 cursor:0#103 → grindstone_additional:17#0',
        '-11, craft_grindstone_request 101, results_deprecated, consume 1 grindstone_input:16#101, consume 1 grindstone_additional:17#103, take 1 creative_output:50#-11 → cursor:0#0',
        '-13, place 1 cursor:0#30 → inventory:9#0',
        '-15, take 1 hotbar:3#109 → cursor:0#0',
        '-17, place 1 cursor:0#109 → grindstone_input:16#0',
        '-19, take 1 hotbar:2#107 → cursor:0#0',
        '-21, place 1 cursor:0#107 → grindstone_additional:17#0',
        '-23, craft_grindstone_request 109, results_deprecated, consume 1 grindstone_input:16#109, consume 1 grindstone_additional:17#107, take 1 creative_output:50#-23 → cursor:0#0',
        '-25, place 1 cursor:0#31 → inventory:10#0'
      ], 'grind: the iron_sword given is in no slot of the window'])
      bot.end()
    })

    it('gives back the cursor\'s item, the second item, then the first on close', async () => {
      const { bot, server, driver, inventory, sword } = await grindstoneBot(version)
      openGrindstone(server, 3)
      inventory.slot('ui', 0, { id: idOf(bot, 'stick'), count: 1, stackId: 22 })
      inventory.slot('ui', 16, sword(20, 0))
      inventory.slot('ui', 17, sword(21, 0))
      await driver.tick()
      const requests = requestsSince(server)
      bot.closeWindow(grindstoneOf(bot.currentWindow)).catch(() => {})
      await driver.ticks(2)
      assert.deepStrictEqual(requests(), [
        '-3, place 1 cursor:0#22 → hotbar_and_inventory:0#0',
        '-5, place 1 grindstone_additional:17#21 → hotbar_and_inventory:1#0',
        '-7, place 1 grindstone_input:16#20 → hotbar_and_inventory:2#0'
      ])
      bot.end()
    })
  })
})
