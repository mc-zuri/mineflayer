import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import type { Given } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { Point3, Rotation } from './common/world.ts'

// The vanilla client at (0.5, y, 0.5) holding 4 dirt in hotbar slot 0, placing one against the west face of the stone at
// (2, y, 0), recorded on every build (features, mineflayer.place): the bot must send the same, byte for byte

/** the recorded clients' camera, as useBlockTest's */
const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const WEST = new Vec3(-1, 0, 0)
const UP = new Vec3(0, 1, 0)

/** the press, the hand told in the next tick, the use's end, and the server's update_block of the destination */
interface RecordedPlace {
  from: BedrockVersion
  to: BedrockVersion
  /** the feet's y, the stone's too: 4 up to 1.17.40, whose overworld starts at 0 */
  feetY: number
  /** the dirt's block, as the server sent it (none up to 1.16.210) */
  heldBlock?: number
  /** from 1.19.1 */
  start?: string
  swing: string
  click: string
  air: string
  equipment: string
  /** from 1.19.1 */
  stop?: string
  update: string
}

const START = '24013804c4ffffff0f0002c4ffffff0f0008'
const STOP = '24013a02c4ffffff0f0000000000'
/** y as a signed varint from 1.26.10 */
const START_ZIGZAG = '24013804770002770008'
const STOP_ZIGZAG = '24013a02770000000000'

const PLACES: readonly RecordedPlace[] = [
  {
    // recorded on 1.16.201.2 and 1.16.210.5, alike
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    feetY: 4,
    swing: '2c0201',
    click: '1e0f011c01000200010000000608000000000606000000000004040008000608000000000000003f1fd7b3400000003f000000007022483f0000003f8b2e',
    air: '1e0002000001000000fe03000606000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f01060600000000000000',
    update: '15020400a21d0300'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    feetY: 4,
    heldBlock: 3746,
    swing: '2c0201',
    click: '1e0f011c010002010000000604000000c43a0a000000000000000000000603000000c43a0a000000000000000000000004040008000604000000c43a0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003f8b2e',
    air: '1e00020001000000fe03000603000000c43a0a000000000000000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f010603000000c43a0a00000000000000000000000000',
    update: '15020400a21d0300'
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    feetY: 4,
    heldBlock: 4433,
    swing: '2c0201',
    click: '1e0f011c010002010000000604000000a2450a000000000000000000000603000000a2450a000000000000000000000004040008000604000000a2450a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003f9636',
    air: '1e00020001000000fe03000603000000a2450a000000000000000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f010603000000a2450a00000000000000000000000000',
    update: '15020400d1220300'
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.10',
    feetY: 4,
    heldBlock: 4483,
    swing: '2c0201',
    click: '1e0f011c01000201000000060400000086460a00000000000000000000060300000086460a00000000000000000000000404000800060400000086460a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fac37',
    air: '1e00020001000000fe0300060300000086460a000000000000000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f01060300000086460a00000000000000000000000000',
    update: '1502040083230300'
  },
  {
    // recorded on 1.17.30.4
    from: 'bedrock_1.17.30',
    to: 'bedrock_1.17.30',
    feetY: 4,
    heldBlock: 4483,
    swing: '2c0201',
    click: '1e0f011c01000201000000060400000086460a00000000000000000000060300000086460a00000000000000000000000404000800060400000086460a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003f8838',
    air: '1e00020001000000fe0300060300000086460a000000000000000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f01060300000086460a00000000000000000000000000',
    update: '1502040083230300'
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.17.40',
    feetY: 4,
    heldBlock: 4484,
    swing: '2c0201',
    click: '1e0f011c01000201000000060400000088460a00000000000000000000060300000088460a00000000000000000000000404000800060400000088460a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003f8c38',
    air: '1e00020001000000fe0300060300000088460a000000000000000000000000003f1fd7b3400000003f00000000000000000000000000',
    equipment: '1f01060300000088460a00000000000000000000000000',
    update: '1502040084230300'
  },
  {
    // recorded on 1.18.0.2
    from: 'bedrock_1.18.0',
    to: 'bedrock_1.18.0',
    feetY: -60,
    heldBlock: 4484,
    swing: '2c0201',
    click: '1e0f011c01000201000000060400000088460a00000000000000000000060300000088460a000000000000000000000004c4ffffff0f000800060400000088460a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f8c38',
    air: '1e00020001000000fe0300060300000088460a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f01060300000088460a00000000000000000000000000',
    update: '1502c4ffffff0f0084230300'
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.11',
    feetY: -60,
    heldBlock: 4484,
    swing: '2c0201',
    click: '1e0f011c01000201000000060400000088460a00000000000000000000060300000088460a000000000000000000000004c4ffffff0f000800060400000088460a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f8938',
    air: '1e00020001000000fe0300060300000088460a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f01060300000088460a00000000000000000000000000',
    update: '1502c4ffffff0f0084230300'
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.18.30',
    feetY: -60,
    heldBlock: 5701,
    swing: '2c0201',
    click: '1e0f011c0100020100000006040000008a590a0000000000000000000006030000008a590a000000000000000000000004c4ffffff0f00080006040000008a590a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f9505',
    air: '1e00020001000000fe030006030000008a590a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f0106030000008a590a00000000000000000000000000',
    update: '1502c4ffffff0f00c52c0300'
  },
  {
    // recorded on 1.19.0.5 and 1.19.10.3, alike
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.10',
    feetY: -60,
    heldBlock: 5751,
    start: START,
    swing: '2c0201',
    click: '1e0f011c010002010000000604000000ee590a000000000000000000000603000000ee590a000000000000000000000004c4ffffff0f0008000604000000ee590a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f8d05',
    air: '1e00020001000000fe03000603000000ee590a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000ee590a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00f72c0300'
  },
  {
    // recorded on 1.19.20.2 to 1.19.40.2, alike
    from: 'bedrock_1.19.20',
    to: 'bedrock_1.19.40',
    feetY: -60,
    heldBlock: 5753,
    start: START,
    swing: '2c0201',
    click: '1e0f011c010002010000000604000000f2590a000000000000000000000603000000f2590a000000000000000000000004c4ffffff0f0008000604000000f2590a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f8f05',
    air: '1e00020001000000fe03000603000000f2590a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000f2590a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00f92c0300'
  },
  {
    // recorded on 1.19.50.2: the player's container numbered 29
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.50',
    feetY: -60,
    heldBlock: 8333,
    start: START,
    swing: '2c0201',
    click: '1e0f011d0100020100000006040000009a82010a0000000000000000000006030000009a82010a000000000000000000000004c4ffffff0f00080006040000009a82010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff409',
    air: '1e00020001000000fe030006030000009a82010a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f0106030000009a82010a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f008d410300'
  },
  {
    // recorded on 1.19.60.3 to 1.19.63.1, alike
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.63',
    feetY: -60,
    heldBlock: 8399,
    start: START,
    swing: '2c0201',
    click: '1e0f011d0100020100000006040000009e83010a0000000000000000000006030000009e83010a000000000000000000000004c4ffffff0f00080006040000009e83010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fb30a',
    air: '1e00020001000000fe030006030000009e83010a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f0106030000009e83010a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00cf410300'
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.70',
    feetY: -60,
    heldBlock: 8403,
    start: START,
    swing: '2c0201',
    click: '1e0f011d010002010000000604000000a683010a000000000000000000000603000000a683010a000000000000000000000004c4ffffff0f0008000604000000a683010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fb80a',
    air: '1e00020001000000fe03000603000000a683010a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000a683010a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00d3410300'
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.80',
    to: 'bedrock_1.19.80',
    feetY: -60,
    heldBlock: 8925,
    start: START,
    swing: '2c0201',
    click: '1e0f011d010002010000000604000000ba8b010a000000000000000000000603000000ba8b010a000000000000000000000004c4ffffff0f0008000604000000ba8b010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fd00d',
    air: '1e00020001000000fe03000603000000ba8b010a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000ba8b010a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00dd450300'
  },
  {
    // recorded on 1.20.0.1 to 1.20.40.1, alike
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.40',
    feetY: -60,
    heldBlock: 1745588518,
    start: START,
    swing: '2c0201',
    click: '1e0f011d010002010000000604000000ccc4dc800d0a000000000000000000000603000000ccc4dc800d0a000000000000000000000004c4ffffff0f0008000604000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fcb83bfd209',
    air: '1e00020001000000fe03000603000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000ccc4dc800d0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00a6a2aec0060300'
  },
  {
    // recorded on 1.20.50.3 to 1.20.80.5, alike
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.80',
    feetY: -60,
    heldBlock: 1745588518,
    start: START,
    swing: '2c0201',
    click: '1e0f011d010002010000000604000000ccc4dc800d0a000000000000000000000603000000ccc4dc800d0a000000000000000000000004c4ffffff0f0008000604000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc48108',
    air: '1e00020001000000fe03000603000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000ccc4dc800d0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00a6a2aec0060300'
  },
  {
    // recorded on 1.21.0.3 to 1.21.2.2, alike: legacy id -6, as the dig before it drew none
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.2',
    feetY: -60,
    heldBlock: 1745588518,
    start: START,
    swing: '2c0201',
    click: '1e0b011d010002010000000604000000ccc4dc800d0a000000000000000000000603000000ccc4dc800d0a000000000000000000000004c4ffffff0f0008000604000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc48108',
    air: '1e00020001000000fe03000603000000ccc4dc800d0a000000000000000000000000003f1c8569c20000003f00000000000000000000000000',
    equipment: '1f010603000000ccc4dc800d0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f00a6a2aec0060300'
  },
  {
    // recorded on 1.21.20.3 to 1.21.113.1, alike: the trigger and the prediction
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.111',
    feetY: -60,
    heldBlock: -2108756090,
    start: START,
    swing: '2c0201',
    click: '1e0b011d010002010000000604000000f3c188db0f0a000000000000000000000603000000f3c188db0f0a00000000000000000000000104c4ffffff0f0008000604000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc4810801',
    air: '1e0002000100000000fe03000603000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f0000000000000000000000000000',
    equipment: '1f010603000000f3c188db0f0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f0086dfbb92080300'
  },
  {
    // recorded on 1.21.120.4 and 1.21.124.2, alike: the swing's data
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    feetY: -60,
    heldBlock: -2108756090,
    start: START,
    swing: '2c020100000000',
    click: '1e0b011d010002010000000604000000f3c188db0f0a000000000000000000000603000000f3c188db0f0a00000000000000000000000104c4ffffff0f0008000604000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc4810801',
    air: '1e0002000100000000fe03000603000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f0000000000000000000000000000',
    equipment: '1f010603000000f3c188db0f0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f0086dfbb92080300'
  },
  {
    // recorded on 1.21.132.1, 1.26.0.2 and 1.26.3.1, alike: the swing's source, build
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.0',
    feetY: -60,
    heldBlock: -2108756090,
    start: START,
    swing: '2c01010000000001056275696c64',
    click: '1e0b011d010002010000000604000000f3c188db0f0a000000000000000000000603000000f3c188db0f0a00000000000000000000000104c4ffffff0f0008000604000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc4810801',
    air: '1e0002000100000000fe03000603000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f0000000000000000000000000000',
    equipment: '1f010603000000f3c188db0f0a00000000000000000000000000',
    stop: STOP,
    update: '1502c4ffffff0f0086dfbb92080300'
  },
  {
    // recorded on 1.26.10.4 and 1.26.13.1, alike: the cooldown, y as a signed varint
    from: 'bedrock_1.26.10',
    to: 'bedrock_1.26.10',
    feetY: -60,
    heldBlock: -2108756090,
    start: START_ZIGZAG,
    swing: '2c01010000000001056275696c64',
    click: '1e0b011d010002010000000604000000f3c188db0f0a000000000000000000000603000000f3c188db0f0a00000000000000000000000104770008000604000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc481080100',
    air: '1e0002000100000000fe03000603000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000000000000000000000000000',
    equipment: '1f010603000000f3c188db0f0a00000000000000000000000000',
    stop: STOP_ZIGZAG,
    update: '1502770086dfbb92080300'
  },
  {
    // recorded on 1.26.20.4: mob_equipment's ItemV4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.20',
    feetY: -60,
    heldBlock: -2108756090,
    start: START_ZIGZAG,
    swing: '2c01010000000001056275696c64',
    click: '1e0b011d010002010000000604000000f3c188db0f0a000000000000000000000603000000f3c188db0f0a00000000000000000000000104770008000604000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc481080100',
    air: '1e0002000100000000fe03000603000000f3c188db0f0a000000000000000000000000003f1c8569c20000003f000000000000000000000000000000',
    equipment: '1f0103000300000086dfbb92080a00000000000000000000000000',
    stop: STOP_ZIGZAG,
    update: '1502770086dfbb92080300'
  },
  {
    // recorded on 1.26.30.5 to 1.26.45.1, alike: ItemV4s, the presences
    from: 'bedrock_1.26.30',
    to: 'bedrock_1.26.45',
    feetY: -60,
    heldBlock: -2108756090,
    start: START_ZIGZAG,
    swing: '2c01010000000001056275696c64',
    click: '1e0b01011d0100010201010001010001000003000400000086dfbb92080a0000000000000000000003000300000086dfbb92080a000000000000000000000001047700040003000400000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc481080100',
    air: '1e0000010201000200000000ff0003000300000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000000000000000000000000000',
    equipment: '1f0103000300000086dfbb92080a00000000000000000000000000',
    stop: STOP_ZIGZAG,
    update: '1502770086dfbb92080300'
  },
  {
    // recorded on 1.26.50.4 and 1.26.51.1, alike: the hand
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    feetY: -60,
    heldBlock: -2108756090,
    start: START_ZIGZAG,
    swing: '2c01010000000001056275696c64',
    click: '1e0b01011d01000201000100000003000400000086dfbb92080a0000000000000000000003000300000086dfbb92080a00000000000000000000000104770004000003000400000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc481080100',
    air: '1e000002000200000000ff000003000300000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000000000000000000000000000',
    equipment: '1f0103000300000086dfbb92080a00000000000000000000000000',
    stop: STOP_ZIGZAG,
    update: '1502770086dfbb92080300'
  },
  {
    // recorded on 1.26.60.5: the swing's hand
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    feetY: -60,
    heldBlock: -2108756090,
    start: START_ZIGZAG,
    swing: '2c01010000000001056275696c6400',
    click: '1e0b01011d01000201000100000003000400000086dfbb92080a0000000000000000000003000300000086dfbb92080a00000000000000000000000104770004000003000400000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa19cc481080100',
    air: '1e000002000200000000ff000003000300000086dfbb92080a000000000000000000000000003f1c8569c20000003f000000000000000000000000000000',
    equipment: '1f0103000300000086dfbb92080a00000000000000000000000000',
    stop: STOP_ZIGZAG,
    update: '1502770086dfbb92080300'
  }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name, and no section request */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

interface AtStone extends TestBot {
  world: ServerWorld
  errors: string[]
  /** blockUpdate and blockPlaced, as emitted, of the blocks beside the player */
  events: string[]
  inventory: ServerInventory
  stone: Block
  floor: Block
}

interface Setting {
  feetY?: number
  rotation?: Rotation
  creative?: boolean
}

/** joined standing at (0.5, feetY, 0.5) on stone, stone at (2, feetY, 0), looking as the recorded clients' camera did */
async function atStone (version: BedrockVersion, { feetY = -60, rotation = CAMERA, creative = false }: Setting = {}): Promise<AtStone> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  // the recorded servers number the blocks by their hashes from 1.20.0
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[2, feetY, 0, 'stone'], [0, feetY - 1, 0, 'stone'], [1, feetY - 1, 0, 'stone']] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation, game: { runtime_entity_id: 1n, ...creative ? { player_gamemode: 'creative' } : {}, ...itemStates } })
  const { bot } = testBot
  const errors: string[] = []
  const events: string[] = []
  bot.on('error', error => { errors.push(error.message) })
  bot.on('blockUpdate', (oldBlock, newBlock) => { if (newBlock.position.y >= feetY) events.push(`blockUpdate ${newBlock.position.toString()} ${oldBlock?.name ?? 'none'} -> ${newBlock.name}`) })
  bot.on('blockPlaced', (oldBlock, newBlock) => { events.push(`blockPlaced ${newBlock.position.toString()} ${oldBlock?.name ?? 'none'} -> ${newBlock.name}`) })
  const stone = bot.blockAt(new Vec3(2, feetY, 0))
  const floor = bot.blockAt(new Vec3(1, feetY - 1, 0))
  assert.ok(stone !== null && floor !== null, `${version}: the stone's section is not loaded`)
  return { ...testBot, world, errors, events, inventory: new ServerInventory(testBot.server), stone, floor }
}

/** ticks until `promise` settles */
async function settle (driver: TestBot['driver'], promise: Promise<unknown>): Promise<void> {
  let settled = false
  const done = promise.finally(() => { settled = true })
  await driver.runUntil(() => settled, 120)
  await done
}

/** the server's update_block of (x, y, z), as servers from 1.16.210 write it */
function updateBlock ({ server, world }: AtStone, { x, y, z }: Point3, name: string): void {
  server.send('update_block', { position: { x, y, z }, block_runtime_id: world.stateId(name), layer: 0 })
}

describe('bedrock placing a block', () => {
  for (const recorded of PLACES) {
    describe(`the vanilla client placing dirt against the stone (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: builds where its pick meets the face in one input pass, shows and tells the slot one fewer, ends the use two ticks after, and resolves once the server put dirt there`, async () => {
          const { bot, internal, server, driver, inventory, stone, errors, events } = await atStone(version, { feetY: recorded.feetY })
          // the recorded process drew -4 and -6 before (a dig's -6 up to 1.20.80)
          internal._core.requestIds.continueProcess(-3, atLeast(version, 'bedrock_1.21.0') ? -6 : -8)
          inventory.slot('inventory', 0, { id: bot.registry.itemsByName['dirt']?.id ?? 0, count: 4, ...recorded.heldBlock === undefined ? {} : { blockRuntimeId: recorded.heldBlock } })
          await driver.ticks(2)
          const batches = batchesSince(server)
          let placed = false
          const placing = bot.placeBlock(stone, WEST).then(() => { placed = true })

          await driver.frame(10)
          assert.deepStrictEqual([batches(), bot.heldItem?.count, errors], [[[...recorded.start === undefined ? [] : [recorded.start], recorded.swing, recorded.click, recorded.air]], 3, []])
          await driver.tick()
          // up to 1.19.0 the tick tells the hand after its auth input
          const told = atLeast(version, 'bedrock_1.19.10') ? [recorded.equipment, 'player_auth_input'] : ['player_auth_input', recorded.equipment]
          assert.deepStrictEqual(batches(), [told])
          await driver.ticks(2)
          assert.deepStrictEqual([batches(), placed], [[['player_auth_input'], [...recorded.stop === undefined ? [] : [recorded.stop], 'player_auth_input']], false])
          server.receive(Buffer.from(recorded.update, 'hex'))
          await driver.frame(10)
          const at = `(1, ${recorded.feetY}, 0)`
          assert.deepStrictEqual([placed, events, bot.blockAt(new Vec3(1, recorded.feetY, 0))?.name, errors], [true, [`blockUpdate ${at} air -> dirt`, `blockPlaced ${at} air -> dirt`], 'dirt', []])
          await placing
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion
    const DEST = new Vec3(1, -60, 0)
    const DEST_AT: Point3 = { x: 1, y: -60, z: 0 }

    /** each item use the bot sent: its action, the legacy id written, the counts of the slots it predicts, the held count, the point clicked */
    function uses (server: FakeBedrockClient): Array<[action: string, legacyId: number | undefined, changes: number[], held: number, point: Point3]> {
      return server.sentOf('inventory_transaction').map(({ transaction: { legacy, actions, transaction_data: data } }) => {
        assert.ok(data !== undefined && 'block_position' in data && Array.isArray(actions))
        return [String(data.action_type), legacy?.legacy_request_id, actions.map(({ new_item: item }) => Number(item.count)), Number(data.held_item.count), data.click_pos]
      })
    }

    /** where start_item_use_on said the item would go */
    function results (server: FakeBedrockClient): Array<Point3 | undefined> {
      return server.sentOf('player_action').filter(({ action }) => action === 'start_item_use_on').map(({ result_position: result }) => result)
    }

    function dirt ({ bot }: AtStone, count: number): Given {
      return { id: bot.registry.itemsByName['dirt']?.id ?? 0, count, blockRuntimeId: -2108756090 }
    }

    /** at the stone holding `count` dirt, told a tick before */
    async function holdingDirt (count: number, setting: Setting = {}): Promise<AtStone> {
      const at = await atStone(version, setting)
      at.inventory.slot('inventory', 0, dirt(at, count))
      await at.driver.ticks(2)
      return at
    }

    it('places the last item of the hand as the sign and the painting were recorded: no use in the air, legacy id 0, the empty hand told by interact then mob_equipment', async () => {
      const at = await holdingDirt(1)
      const { bot, server, driver, stone, events } = at
      const sent = server.batches.length
      const placing = bot.placeBlock(stone, WEST)
      await driver.frame(10)
      assert.deepStrictEqual([uses(server), bot.heldItem], [[['click_block', 0, [0], 1, { x: 0, y: Math.fround(0.7817764), z: 0.5 }]], null])
      updateBlock(at, DEST, 'dirt')
      await settle(driver, placing)
      const names = server.batches.slice(sent).flat().map(({ name }) => name).filter(name => name !== 'subchunk_request')
      assert.deepStrictEqual([names.slice(0, 6), events], [
        ['player_action', 'animate', 'inventory_transaction', 'interact', 'mob_equipment', 'player_auth_input'],
        ['blockUpdate (1, -60, 0) air -> dirt', 'blockPlaced (1, -60, 0) air -> dirt']
      ])
      bot.end()
    })

    it('resolves once the use ended when the server put the block before: blockPlaced in that packet pass, after blockUpdate (_placeBlockWithOptions, as placeBlock)', async () => {
      const at = await holdingDirt(4)
      const { bot, internal, driver, stone, events } = at
      let placed = false
      const placing = internal._placeBlockWithOptions(stone, WEST, {}).then(() => { placed = true })
      await driver.frame(10)
      updateBlock(at, DEST, 'dirt')
      await driver.tick()
      // the update a sign gets again (its flags 19)
      updateBlock(at, DEST, 'dirt')
      await driver.tick()
      assert.deepStrictEqual([events, placed], [['blockUpdate (1, -60, 0) air -> dirt', 'blockPlaced (1, -60, 0) air -> dirt', 'blockUpdate (1, -60, 0) dirt -> dirt'], false])
      await driver.tick()
      assert.strictEqual(placed, true)
      await placing
      bot.end()
    })

    it("rejects with Java's message when the server updates the destination to the same block, or gives the item back (not recorded)", async () => {
      const at = await holdingDirt(4)
      const { bot, driver, inventory, stone, events } = at
      const refusal = { message: 'Server refused to place dirt at (1, -60, 0): the block is still air' }
      const updated = assert.rejects(bot.placeBlock(stone, WEST), refusal)
      await driver.frame(10)
      updateBlock(at, DEST, 'air')
      await settle(driver, updated)
      const givenBack = assert.rejects(bot.placeBlock(stone, WEST), refusal)
      await driver.frame(10)
      assert.strictEqual(bot.heldItem?.count, 2)
      inventory.slot('inventory', 0, dirt(at, 3))
      await settle(driver, givenBack)
      // a block put there later is no placement's
      updateBlock(at, DEST, 'dirt')
      await driver.tick()
      assert.deepStrictEqual(events, ['blockUpdate (1, -60, 0) air -> air', 'blockUpdate (1, -60, 0) air -> dirt'])
      bot.end()
    })

    it('is not refused by another item of that count given to the slot, nor answered by an update elsewhere', async () => {
      const at = await holdingDirt(4)
      const { bot, driver, inventory, stone, events } = at
      let placed = false
      const placing = bot.placeBlock(stone, WEST).then(() => { placed = true })
      await driver.frame(10)
      inventory.slot('inventory', 0, { id: bot.registry.itemsByName['cobblestone']?.id ?? 0, count: 4 })
      updateBlock(at, { x: 0, y: -60, z: 1 }, 'dirt')
      await driver.ticks(5)
      assert.strictEqual(placed, false)
      updateBlock(at, DEST, 'dirt')
      await settle(driver, placing)
      assert.deepStrictEqual(events, ['blockUpdate (0, -60, 1) air -> dirt', 'blockUpdate (1, -60, 0) air -> dirt', 'blockPlaced (1, -60, 0) air -> dirt'])
      bot.end()
    })

    it('rejects when the server answers nothing in 100 ticks from the call', async () => {
      const { bot, driver, stone } = await holdingDirt(4)
      let settled = false
      const unanswered = assert.rejects(bot.placeBlock(stone, WEST), { message: 'Server did not answer the placement at (1, -60, 0) in 100 ticks' }).finally(() => { settled = true })
      await driver.frame(10)
      await driver.ticks(99)
      assert.strictEqual(settled, false)
      await driver.tick()
      await unanswered
      assert.strictEqual(settled, true)
      bot.end()
    })

    it("settles every placement at a destination by its update, as Java's: blockPlaced once", async () => {
      const at = await holdingDirt(4)
      const { bot, server, driver, stone, events } = at
      const placings = [bot.placeBlock(stone, WEST), bot.placeBlock(stone, WEST)]
      await driver.frame(10)
      await driver.ticks(3)
      await driver.frame(10)
      assert.deepStrictEqual(uses(server).map(([action, , changes]) => [action, changes]), [['click_block', [3]], ['click_air', []], ['click_block', [2]], ['click_air', []]])
      updateBlock(at, DEST, 'dirt')
      await settle(driver, Promise.all(placings))
      assert.deepStrictEqual(events, ['blockUpdate (1, -60, 0) air -> dirt', 'blockPlaced (1, -60, 0) air -> dirt'])
      bot.end()
    })

    it("rejects, sending nothing, without an item, holding an item that places no block (with Java's refusal) or a block of another name (not recorded), from the off-hand, and toward no face", async () => {
      const at = await atStone(version)
      const { bot, internal, server, driver, inventory, stone } = at
      const sent = server.batches.length
      await assert.rejects(bot.placeBlock(stone, WEST), { message: 'must be holding an item to place' })
      await assert.rejects(internal._genericPlace(stone, WEST, {}), { message: 'must be holding an item to place' })
      for (const item of ['stick', 'painting']) {
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName[item]?.id ?? 0, count: 1 })
        await driver.tick()
        await assert.rejects(bot.placeBlock(stone, WEST), { message: `Server refused to place ${item} at (1, -60, 0): the block is still air` })
      }
      for (const item of ['redstone', 'wheat_seeds', 'nether_wart', 'banner', 'powder_snow_bucket', 'water_bucket', 'axolotl_bucket']) {
        inventory.slot('inventory', 0, { id: bot.registry.itemsByName[item]?.id ?? 0, count: 1 })
        await driver.tick()
        await assert.rejects(bot.placeBlock(stone, WEST), { message: `placeBlock: ${item} places a block of another name, which is not supported on Bedrock yet` })
      }
      inventory.slot('inventory', 0, { id: bot.registry.itemsByName['painting']?.id ?? 0, count: 1 })
      await driver.tick()
      // a block in a column the bot has not
      const unsent = prismarineBlock(bot.registry).fromStateId(stone.stateId, 0)
      unsent.position = new Vec3(0, -59, 40)
      await assert.rejects(bot.placeBlock(unsent, UP), { message: 'Server refused to place painting at (0, -58, 40): the block is still not loaded' })
      inventory.slot('inventory', 0, dirt(at, 4))
      await driver.tick()
      const offhand = 'placing from the off-hand is not supported on Bedrock: the vanilla client places what the main hand holds'
      await assert.rejects(internal._placeBlockWithOptions(stone, WEST, { offhand: true }), { message: `_placeBlockWithOptions: ${offhand}` })
      await assert.rejects(internal._genericPlace(stone, WEST, { offhand: true }), { message: `_genericPlace: ${offhand}` })
      await assert.rejects(bot.placeBlock(stone, new Vec3(0, 0, 0)), { message: 'invalid direction vector (0, 0, 0)' })
      await driver.frame(10)
      assert.deepStrictEqual(server.batches.slice(sent).flat().map(({ name }) => name).filter(name => name !== 'player_auth_input' && name !== 'subchunk_request' && name !== 'interact'), Array(11).fill('mob_equipment'))
      bot.end()
    })

    it("clicks where its pick meets the face, at Java's cursor where `half` (a side face's) or `delta` names one; else after looking at that cursor (the face's centre); with forceLook 'ignore' at once, without looking", async () => {
      const { internal, server, driver, stone, floor } = await holdingDirt(64)
      for (const options of [{}, { half: 'top' as const }, { delta: new Vec3(0, 0.125, 0.25) }]) await settle(driver, internal._genericPlace(stone, WEST, options))
      // the top of the floor, which its pick does not meet: half is a side face's
      await settle(driver, internal._genericPlace(floor, UP, { half: 'bottom' }))
      const looked = server.sentOf('player_auth_input').at(-1)
      await settle(driver, internal._genericPlace(stone, UP, { forceLook: 'ignore', half: 'top' }))
      const ignored = server.sentOf('player_auth_input').at(-1)
      await settle(driver, internal._genericPlace(stone, new Vec3(0, 0, 1), { half: 'bottom' }))
      assert.deepStrictEqual([uses(server).filter(([action]) => action === 'click_block').map(([, , , , point]) => point), results(server)], [
        [{ x: 0, y: Math.fround(0.7817764), z: 0.5 }, { x: 0, y: 0.75, z: 0.5 }, { x: 0, y: 0.125, z: 0.25 }, { x: 0.5, y: 1, z: 0.5 }, { x: 0.5, y: 1, z: 0.5 }, { x: 0.5, y: 0.25, z: 1 }],
        [DEST_AT, DEST_AT, DEST_AT, DEST_AT, { x: 2, y: -59, z: 0 }, { x: 2, y: -60, z: 1 }]
      ])
      // from the eye at (0.5, -58.38, 0.5) to (1.5, -60, 0.5): the look before the floor's click, which the click 'ignore' did not change
      assert.deepStrictEqual([looked?.yaw, Math.round(looked?.pitch ?? 0), ignored?.yaw, ignored?.pitch], [-90, 58, -90, looked?.pitch])
      internal.end()
    })

    it('resolves _genericPlace with the reference block once the use ended, not waiting for the server', async () => {
      const { internal, driver, stone } = await holdingDirt(4)
      let clicked: Vec3 | undefined
      const placing = internal._genericPlace(stone, WEST, {}).then(position => { clicked = position })
      await driver.frame(10)
      await driver.ticks(2)
      assert.strictEqual(clicked, undefined)
      await driver.tick()
      await placing
      assert.deepStrictEqual(clicked, stone.position)
      internal.end()
    })

    it('says a sign goes beside the face, as recorded on 1.26.60.5 placing an oak sign on the floor, its blocks named apart (standing_sign)', async () => {
      const at = await atStone(version)
      const { bot, server, driver, inventory, floor } = at
      inventory.slot('inventory', 0, { id: bot.registry.itemsByName['oak_sign']?.id ?? 0, count: 1 })
      await driver.tick()
      const placing = bot.placeBlock(floor, UP)
      await driver.ticks(4)
      updateBlock(at, DEST, 'standing_sign')
      await settle(driver, placing)
      assert.deepStrictEqual([results(server), uses(server).map(([action, legacyId, changes]) => [action, legacyId, changes])], [[DEST_AT], [['click_block', 0, [0]]]])
      bot.end()
    })

    it('draws a legacy transaction id for each click, the use in the air too: activateBlock then placeBlock in a fresh process write 0, then -6', async () => {
      const at = await holdingDirt(4)
      const { bot, internal, server, driver, stone } = at
      await settle(driver, bot.activateBlock(stone))
      const placing = bot.placeBlock(stone, WEST)
      await driver.frame(10)
      updateBlock(at, DEST, 'dirt')
      await settle(driver, placing)
      assert.deepStrictEqual([uses(server).map(([action, legacyId]) => [action, legacyId]), internal._core.requestIds.nextLegacyTransaction()], [[['click_block', 0], ['click_block', -6], ['click_air', 0]], -10])
      bot.end()
    })

    it('predicts no slot change in creative mode, where a build takes no item (not recorded): legacy id 0, the use in the air with the stack held', async () => {
      const at = await holdingDirt(4, { creative: true })
      const { bot, server, driver, stone } = at
      const placing = bot.placeBlock(stone, WEST)
      await driver.frame(10)
      await driver.ticks(5)
      updateBlock(at, DEST, 'dirt')
      await settle(driver, placing)
      assert.deepStrictEqual([uses(server).map(([action, legacyId, changes, held]) => [action, legacyId, changes, held]), bot.heldItem?.count], [[['click_block', 0, [], 4], ['click_air', 0, [], 4]], 4])
      bot.end()
    })

    it('rejects the placements the bot ends before: one pressed, one waiting for it', async () => {
      const { bot, driver, stone } = await holdingDirt(4)
      const ended: string[] = []
      for (const name of ['pressed', 'waiting']) bot.placeBlock(stone, WEST).catch((error: Error) => { ended.push(`${name}: ${error.message}`) })
      await driver.frame(10)
      bot.end()
      await driver.frame(10)
      assert.deepStrictEqual(ended.sort(), ['pressed: the bot ended', 'waiting: the bot ended'])
    })
  })
})
