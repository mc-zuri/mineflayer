import assert from 'assert'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import { Vec3 } from 'vec3'
import { isBedrockVersionAtLeast, latestSupportedBedrockVersion } from '../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../lib/types/api/index.ts'
import { bedrockCodec } from './common/codec.ts'
import { ServerInventory } from './common/inventory.ts'
import { bedrockTestBot, bedrockTestVersionsFrom } from './common/server.ts'
import type { ManualDriver } from './common/driver.ts'
import type { AuthInput, FakeBedrockClient, TestBot } from './common/server.ts'
import { ServerWorld } from './common/world.ts'
import type { BlockAt, Point3, Rotation } from './common/world.ts'

// the vanilla client at (0.5, y, 0.5) using the crafting table at (2, y, 0) by its west face, recorded on every build: the bot must send the same, byte for byte

/** the recorded clients' camera: their auth inputs up to 1.26.10 mostly report a rotation a little off it, which their clicks do not fit */
const CAMERA: Rotation = Object.freeze({ yaw: -90, pitch: Math.fround(29.197464) })
const COBBLESTONE = 4

/** the vanilla client holding 3 cobblestone in hotbar slot 0: player_action start_item_use_on, animate, inventory_transaction, then player_action stop_item_use_on */
interface RecordedUse {
  from: BedrockVersion
  to: BedrockVersion
  /** the feet's y, the table's too: 4 up to 1.17.40, whose overworld starts at 0 */
  feetY: number
  /** the cobblestone's block, as the server sent it (none up to 1.16.210) */
  heldBlock?: number
  /** from 1.19.1 */
  start?: string
  swing: string
  click: string
  /** from 1.19.1 */
  stop?: string
}

const USES: readonly RecordedUse[] = [
  {
    // recorded on 1.16.201.2
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    feetY: 4,
    swing: '2c0201',
    click: '1e000200000004040008000806000000000000003f1fd7b3400000003f000000007022483f0000003fd71a'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    feetY: 4,
    heldBlock: 966,
    swing: '2c0201',
    click: '1e00020000040400080008030000008c0f0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fd71a'
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    feetY: 4,
    heldBlock: 1277,
    swing: '2c0201',
    click: '1e0002000004040008000803000000fa130a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003f921d'
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.30',
    feetY: 4,
    heldBlock: 1317,
    swing: '2c0201',
    click: '1e0002000004040008000803000000ca140a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fba1d'
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.17.40',
    feetY: 4,
    heldBlock: 1318,
    swing: '2c0201',
    click: '1e0002000004040008000803000000cc140a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fbb1d'
  },
  {
    // recorded on 1.18.0.2
    from: 'bedrock_1.18.0',
    to: 'bedrock_1.18.11',
    feetY: -60,
    heldBlock: 1318,
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000cc140a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fbb1d'
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.18.30',
    feetY: -60,
    heldBlock: 3620,
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000c8380a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f922d'
  },
  {
    // recorded on 1.19.0.5
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.10',
    feetY: -60,
    heldBlock: 3615,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000be380a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fde2d',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.20.2
    from: 'bedrock_1.19.20',
    to: 'bedrock_1.19.40',
    feetY: -60,
    heldBlock: 3617,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000c2380a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fe02d',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.50',
    feetY: -60,
    heldBlock: 5008,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000a04e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff444',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.60.3
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.63',
    feetY: -60,
    heldBlock: 5074,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000a44f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fb645',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.70',
    feetY: -60,
    heldBlock: 5073,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000a24f0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fba45',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.80',
    to: 'bedrock_1.19.80',
    feetY: -60,
    heldBlock: 5504,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f000800080300000080560a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fd049',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.21.2',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000803000000dcb88bfd0c0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c306',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.20.3
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.111',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e000200000104c4ffffff0f0008000803000000dcb88bfd0c0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c30601',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.124',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020100000000',
    click: '1e000200000104c4ffffff0f0008000803000000dcb88bfd0c0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c30601',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.132.1
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.0',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0101000000000108696e746572616374',
    click: '1e000200000104c4ffffff0f0008000803000000dcb88bfd0c0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c30601',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.26.10.4
    from: 'bedrock_1.26.10',
    to: 'bedrock_1.26.20',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804770002770008',
    swing: '2c0101000000000108696e746572616374',
    click: '1e000200000104770008000803000000dcb88bfd0c0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c3060100',
    stop: '24013a02770000000000'
  },
  {
    // recorded on 1.26.30.5
    from: 'bedrock_1.26.30',
    to: 'bedrock_1.26.45',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804770002770008',
    swing: '2c0101000000000108696e746572616374',
    click: '1e00000102010000010477000400040003000000aedcc5be060a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c3060100',
    stop: '24013a02770000000000'
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804770002770008',
    swing: '2c0101000000000108696e746572616374',
    click: '1e000002000001047700040000040003000000aedcc5be060a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c3060100',
    stop: '24013a02770000000000'
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    feetY: -60,
    heldBlock: 1741778478,
    start: '24013804770002770008',
    swing: '2c0101000000000108696e74657261637400',
    click: '1e000002000001047700040000040003000000aedcc5be060a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c3060100',
    stop: '24013a02770000000000'
  }
]

const PLANKS = 5

/** the vanilla client holding 4 planks in hotbar slot 0 and using a barrel in the table's place: as the table, but for player_action interact_block after the click up to 1.18.30 */
interface RecordedBarrelUse {
  from: BedrockVersion
  to: BedrockVersion
  feetY: number
  runtimeId: bigint
  /** the planks' block, as the server sent it (none up to 1.16.210) */
  heldBlock?: number
  /** from 1.19.1 */
  start?: string
  swing: string
  click: string
  /** up to 1.18.30 */
  interact?: string
  /** from 1.19.1 */
  stop?: string
}

const BARREL_USES: readonly RecordedBarrelUse[] = [
  {
    // recorded on 1.16.201.2, 1.16.201 naming the action ineract_block
    from: 'bedrock_1.16.201',
    to: 'bedrock_1.16.210',
    feetY: 4,
    runtimeId: 11n,
    swing: '2c020b',
    click: '1e000200000004040008000a08000000000000003f1fd7b3400000003f000000007022483f0000003fb901',
    interact: '240b3204040008'
  },
  {
    // recorded on 1.16.220.2
    from: 'bedrock_1.16.220',
    to: 'bedrock_1.16.220',
    feetY: 4,
    runtimeId: 11n,
    heldBlock: 4812,
    swing: '2c020b',
    click: '1e0002000004040008000a04000000984b0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fb901',
    interact: '240b3204040008'
  },
  {
    // recorded on 1.17.0.2
    from: 'bedrock_1.17.0',
    to: 'bedrock_1.17.0',
    feetY: 4,
    runtimeId: 11n,
    heldBlock: 5640,
    swing: '2c020b',
    click: '1e0002000004040008000a0400000090580a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fc901',
    interact: '240b3204040008'
  },
  {
    // recorded on 1.17.10.4
    from: 'bedrock_1.17.10',
    to: 'bedrock_1.17.10',
    feetY: 4,
    runtimeId: 10n,
    heldBlock: 5770,
    swing: '2c020a',
    click: '1e0002000004040008000a04000000945a0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fc901',
    interact: '240a3204040008'
  },
  {
    // recorded on 1.17.30.4
    from: 'bedrock_1.17.30',
    to: 'bedrock_1.17.30',
    feetY: 4,
    runtimeId: 11n,
    heldBlock: 5794,
    swing: '2c020b',
    click: '1e0002000004040008000a04000000c45a0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fc901',
    interact: '240b3204040008'
  },
  {
    // recorded on 1.17.40.6
    from: 'bedrock_1.17.40',
    to: 'bedrock_1.17.40',
    feetY: 4,
    runtimeId: 10n,
    heldBlock: 5797,
    swing: '2c020a',
    click: '1e0002000004040008000a04000000ca5a0a000000000000000000000000003f1fd7b3400000003f000000007022483f0000003fc901',
    interact: '240a3204040008'
  },
  {
    // recorded on 1.18.0.2
    from: 'bedrock_1.18.0',
    to: 'bedrock_1.18.0',
    feetY: -60,
    runtimeId: 1n,
    heldBlock: 5797,
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000a04000000ca5a0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc901',
    interact: '24013204c4ffffff0f0008'
  },
  {
    // recorded on 1.18.12.1
    from: 'bedrock_1.18.11',
    to: 'bedrock_1.18.11',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 5800,
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a04000000d05a0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc901',
    interact: '240b3204c4ffffff0f0008'
  },
  {
    // recorded on 1.18.30.4
    from: 'bedrock_1.18.30',
    to: 'bedrock_1.18.30',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 5995,
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a04000000d65d0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fe222',
    interact: '240b3204c4ffffff0f0008'
  },
  {
    // recorded on 1.19.0.5, 1.19.10.3
    from: 'bedrock_1.19.1',
    to: 'bedrock_1.19.10',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 6071,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000ee5e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa623',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.20.2
    from: 'bedrock_1.19.20',
    to: 'bedrock_1.19.20',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 6073,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000f25e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa823',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.21.1
    from: 'bedrock_1.19.21',
    to: 'bedrock_1.19.21',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 6073,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a04000000f25e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa823',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.30.4, 1.19.40.2
    from: 'bedrock_1.19.30',
    to: 'bedrock_1.19.40',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 6073,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000f25e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fa823',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.50.2
    from: 'bedrock_1.19.50',
    to: 'bedrock_1.19.50',
    feetY: -60,
    runtimeId: 1n,
    heldBlock: 9805,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000a040000009a99010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003f9b31',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.60.3 to 1.19.63.1
    from: 'bedrock_1.19.60',
    to: 'bedrock_1.19.63',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 9871,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a040000009e9a010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fdd31',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.70.2
    from: 'bedrock_1.19.70',
    to: 'bedrock_1.19.70',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 9885,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000ba9a010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fde31',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.19.80.2
    from: 'bedrock_1.19.80',
    to: 'bedrock_1.19.80',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 10437,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a040000008aa3010a000000000000000000000000003f1c8569c20000003f000000008022483f0000003fb035',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.0.1
    from: 'bedrock_1.20.0',
    to: 'bedrock_1.20.0',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 934006095,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a040000009eb5defa060a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.10.1 to 1.20.40.1
    from: 'bedrock_1.20.10',
    to: 'bedrock_1.20.40',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 934006095,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a040000009eb5defa060a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.50.3, 1.20.60.4
    from: 'bedrock_1.20.50',
    to: 'bedrock_1.20.61',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.72.1
    from: 'bedrock_1.20.71',
    to: 'bedrock_1.20.71',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 1921718966,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.20.80.5
    from: 'bedrock_1.20.80',
    to: 'bedrock_1.20.80',
    feetY: -60,
    runtimeId: 1n,
    heldBlock: 1921718966,
    start: '24013804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c0201',
    click: '1e0002000004c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '24013a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.0.3
    from: 'bedrock_1.21.0',
    to: 'bedrock_1.21.0',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e0002000004c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.2.2
    from: 'bedrock_1.21.2',
    to: 'bedrock_1.21.2',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 1921718966,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b',
    click: '1e0002000004c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.20.3 to 1.21.113.1
    from: 'bedrock_1.21.20',
    to: 'bedrock_1.21.111',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a',
    click: '1e000200000104c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e01',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.120.4
    from: 'bedrock_1.21.120',
    to: 'bedrock_1.21.120',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020a00000000',
    click: '1e000200000104c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e01',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.124.2
    from: 'bedrock_1.21.124',
    to: 'bedrock_1.21.124',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 1921718966,
    start: '240b3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c020b00000000',
    click: '1e000200000104c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e01',
    stop: '240b3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.21.132.1, 1.26.0.2
    from: 'bedrock_1.21.130',
    to: 'bedrock_1.26.0',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804c4ffffff0f0002c4ffffff0f0008',
    swing: '2c010a000000000108696e746572616374',
    click: '1e000200000104c4ffffff0f0008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e01',
    stop: '240a3a02c4ffffff0f0000000000'
  },
  {
    // recorded on 1.26.10.4
    from: 'bedrock_1.26.10',
    to: 'bedrock_1.26.10',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804770002770008',
    swing: '2c010a000000000108696e746572616374',
    click: '1e000200000104770008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '240a3a02770000000000'
  },
  {
    // recorded on 1.26.20.4
    from: 'bedrock_1.26.20',
    to: 'bedrock_1.26.20',
    feetY: -60,
    runtimeId: 9n,
    heldBlock: 1921718966,
    start: '24093804770002770008',
    swing: '2c0109000000000108696e746572616374',
    click: '1e000200000104770008000a04000000ecead8a80e0a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '24093a02770000000000'
  },
  {
    // recorded on 1.26.30.5
    from: 'bedrock_1.26.30',
    to: 'bedrock_1.26.30',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 1921718966,
    start: '240b3804770002770008',
    swing: '2c010b000000000108696e746572616374',
    click: '1e00000102010000010477000400050004000000b6b5ac94070a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '240b3a02770000000000'
  },
  {
    // recorded on 1.26.40.5, 1.26.45.1
    from: 'bedrock_1.26.40',
    to: 'bedrock_1.26.45',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804770002770008',
    swing: '2c010a000000000108696e746572616374',
    click: '1e00000102010000010477000400050004000000b6b5ac94070a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '240a3a02770000000000'
  },
  {
    // recorded on 1.26.50.4
    from: 'bedrock_1.26.51',
    to: 'bedrock_1.26.51',
    feetY: -60,
    runtimeId: 11n,
    heldBlock: 1921718966,
    start: '240b3804770002770008',
    swing: '2c010b000000000108696e746572616374',
    click: '1e000002000001047700040000050004000000b6b5ac94070a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '240b3a02770000000000'
  },
  {
    // recorded on 1.26.60.5
    from: 'bedrock_1.26.60',
    to: 'bedrock_1.26.60',
    feetY: -60,
    runtimeId: 10n,
    heldBlock: 1921718966,
    start: '240a3804770002770008',
    swing: '2c010a000000000108696e74657261637400',
    click: '1e000002000001047700040000050004000000b6b5ac94070a000000000000000000000000003f1c8569c20000003f000000008022483f0000003ff9e3bb5e0100',
    stop: '240a3a02770000000000'
  }
]

function atLeast (version: BedrockVersion, since: BedrockVersion): boolean {
  return isBedrockVersionAtLeast(version, since)
}

function hexOf (server: FakeBedrockClient, { name, params }: { name: string, params: object }): string {
  return server.codec.serializer.createPacketBuffer({ name, params }).toString('hex')
}

/** each batch the bot sent since the last call: its packets as written, but auth inputs by name and section requests */
function batchesSince (server: FakeBedrockClient): () => string[][] {
  let seen = server.batches.length
  return () => {
    const fresh = server.batches.slice(seen)
    seen = server.batches.length
    return fresh.map(batch => batch.filter(({ name }) => name !== 'subchunk_request').map(packet => packet.name === 'player_auth_input' ? packet.name : hexOf(server, packet)))
  }
}

interface AtTable extends TestBot {
  errors: string[]
  inventory: ServerInventory
  table: Block
}

interface Setting {
  feetY?: number
  rotation?: Rotation
  blocks?: readonly BlockAt[]
  /** in the table's place */
  block?: string
  runtimeId?: bigint
}

/** joined standing at (0.5, feetY, 0.5) on stone, a crafting table at (2, feetY, 0), looking as the recorded clients' camera did */
async function atTable (version: BedrockVersion, { feetY = -60, rotation = CAMERA, blocks = [], block = 'crafting_table', runtimeId = 1n }: Setting = {}): Promise<AtTable> {
  const testBot = await bedrockTestBot(bedrockCodec(version))
  // the recorded servers number the blocks by their hashes from 1.20.0
  const world = new ServerWorld(testBot.server, { hashes: atLeast(version, 'bedrock_1.20.0'), blocks: [[2, feetY, 0, block], [0, feetY - 1, 0, 'stone'], ...blocks] })
  const itemStates = atLeast(version, 'bedrock_1.21.60') ? {} : { itemstates: world.registry.writeItemStates() }
  await world.join(testBot, { feet: { x: 0.5, y: feetY, z: 0.5 }, rotation, game: { runtime_entity_id: runtimeId, ...itemStates } })
  const errors: string[] = []
  testBot.bot.on('error', error => { errors.push(error.message) })
  const table = testBot.bot.blockAt(new Vec3(2, feetY, 0))
  assert.ok(table !== null, `${version}: the table's section is not loaded`)
  return { ...testBot, errors, inventory: new ServerInventory(testBot.server), table }
}

/** ticks until `promise` settles */
async function settle (driver: ManualDriver, promise: Promise<unknown>): Promise<void> {
  let settled = false
  const done = promise.finally(() => { settled = true })
  await driver.runUntil(() => settled, 20)
  await done
}

function openScreen (server: FakeBedrockClient, type: 'inventory' | 'workbench' | 'furnace', { x, y, z }: Vec3 = new Vec3(2, -60, 0)): void {
  server.send('container_open', { window_id: 3, window_type: type, coordinates: { x, y, z }, runtime_entity_id: -1n })
}

describe('bedrock using a block', () => {
  for (const recorded of USES) {
    describe(`the vanilla client opening a crafting table (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        it(`bedrock ${version}: clicks the table where its pick meets it in one input pass, ends the use two ticks after the click's, and resolves with the screen`, async () => {
          const { bot, server, driver, inventory, table, errors } = await atTable(version, { feetY: recorded.feetY })
          inventory.slot('inventory', 0, { id: COBBLESTONE, count: 3, ...recorded.heldBlock === undefined ? {} : { blockRuntimeId: recorded.heldBlock } })
          await driver.ticks(2)
          const batches = batchesSince(server)
          let opened = false
          const opening = bot.openBlock(table).then(window => {
            opened = true
            return window
          })

          await driver.frame(10)
          assert.deepStrictEqual([batches(), errors], [[[...recorded.start === undefined ? [] : [recorded.start], recorded.swing, recorded.click]], []])
          await driver.tick()
          openScreen(server, 'workbench', table.position)
          await driver.tick()
          assert.deepStrictEqual([batches(), opened, bot.currentWindow?.type], [[['player_auth_input'], ['player_auth_input']], false, 'minecraft:crafting_table'])
          await driver.tick()
          assert.deepStrictEqual(batches(), [[...recorded.stop === undefined ? [] : [recorded.stop], 'player_auth_input']])
          const window = await opening
          assert.deepStrictEqual([window === bot.currentWindow, errors], [true, []])
          bot.end()
        })
      }
    })
  }

  for (const recorded of BARREL_USES) {
    describe(`the vanilla client using a barrel (${recorded.from.slice(8)} – ${recorded.to.slice(8)})`, () => {
      for (const version of bedrockTestVersionsFrom(recorded.from, recorded.to)) {
        const follows = recorded.interact === undefined ? 'nothing, as for the crafting table' : 'interact_block, as for every block it used but the crafting table'
        it(`bedrock ${version}: follows the click in its batch with ${follows}`, async () => {
          const { bot, server, driver, inventory, table: barrel, errors } = await atTable(version, { feetY: recorded.feetY, block: 'barrel', runtimeId: recorded.runtimeId })
          inventory.slot('inventory', 0, { id: PLANKS, count: 4, ...recorded.heldBlock === undefined ? {} : { blockRuntimeId: recorded.heldBlock } })
          await driver.ticks(2)
          const batches = batchesSince(server)
          const use = bot.activateBlock(barrel)

          await driver.frame(10)
          const pass = [recorded.start, recorded.swing, recorded.click, recorded.interact].filter(packet => packet !== undefined)
          assert.deepStrictEqual([batches(), errors], [[pass], []])
          await settle(driver, use)
          assert.deepStrictEqual([batches(), errors], [[['player_auth_input'], ['player_auth_input'], [...recorded.stop === undefined ? [] : [recorded.stop], 'player_auth_input']], []])
          bot.end()
        })
      }
    })
  }

  describe(`no version differs in: (on ${latestSupportedBedrockVersion})`, () => {
    const version = latestSupportedBedrockVersion

    /** each use's click, as the bot wrote it: the block, the face, the point, and where start_item_use_on said the item would go */
    function clicks (server: FakeBedrockClient): Array<[position: number[], face: number, point: Point3, result: Point3 | undefined]> {
      const starts = server.sentOf('player_action').filter(({ action }) => action === 'start_item_use_on')
      return server.sentOf('inventory_transaction').map(({ transaction: { transaction_data: data } }, index) => {
        assert.ok(data !== undefined && 'block_position' in data)
        const { x, y, z } = data.block_position
        return [[x, y, z], data.face, data.click_pos, starts[index]?.result_position]
      })
    }

    /** an auth input but for its tick */
    function untimed (input: AuthInput): AuthInput {
      return { ...input, tick: 0n }
    }

    it('clicks in the input pass of a frame with a tick, before its auth input, which carries nothing of the use', async () => {
      const { bot, server, driver, inventory, table, errors } = await atTable(version)
      inventory.slot('inventory', 0, { id: COBBLESTONE, count: 3, blockRuntimeId: 1741778478 })
      await driver.ticks(2)
      const before = server.sentOf('player_auth_input').at(-1)
      assert.ok(before !== undefined)
      const batches = batchesSince(server)
      let used = false
      const use = bot.activateBlock(table).then(() => { used = true })

      await driver.tick()
      await driver.tick()
      const [click, next] = batches()
      assert.deepStrictEqual([click?.map(packet => packet.slice(0, 4)), next, used], [['2401', '2c01', '1e00', 'play'], ['player_auth_input'], false])
      await driver.tick()
      assert.deepStrictEqual([batches(), used], [[['24013a02770000000000', 'player_auth_input']], true])
      await use
      assert.deepStrictEqual([server.sentOf('player_auth_input').slice(-3).map(untimed), errors], [[untimed(before), untimed(before), untimed(before)], []])
      bot.end()
    })

    it('resolves openBlock once the server opened the screen, the use having ended before', async () => {
      const { bot, server, driver, table } = await atTable(version)
      let opened = false
      const opening = bot.openBlock(table).then(() => { opened = true })
      await driver.ticks(4)
      assert.strictEqual(opened, false)
      openScreen(server, 'workbench')
      await driver.frame(10)
      await opening
      assert.strictEqual(bot.currentWindow?.type, 'minecraft:crafting_table')
      bot.end()
    })

    it('uses a block once the use before ended, as a held key cannot be pressed again', async () => {
      const { bot, server, driver, table } = await atTable(version)
      const batches = batchesSince(server)
      const uses = [bot.activateBlock(table), bot.activateBlock(table)]
      await driver.frame(10)
      await driver.ticks(3)
      await driver.frame(10)
      assert.deepStrictEqual(batches().map(batch => batch.map(packet => packet.slice(0, 4))), [
        ['2401', '2c01', '1e00'], ['play'], ['play'], ['2401', 'play'], ['2401', '2c01', '1e00']
      ])
      await driver.ticks(3)
      await Promise.all(uses)
      bot.end()
    })

    it("looks at the top's centre first, as Java's, when its pick does not meet the block, and clicks it there", async () => {
      const { bot, server, driver, table } = await atTable(version, { rotation: { yaw: 90, pitch: 0 } })
      const batches = batchesSince(server)
      const use = bot.activateBlock(table)
      await driver.frame(10)
      assert.deepStrictEqual(batches(), [])
      await settle(driver, use)
      const looked = server.sentOf('player_auth_input').find(({ yaw }) => yaw === -90)
      // from the eye at (0.5, -58.38, 0.5) to (2.5, -59, 0.5): 0.62 down, 2 east
      assert.deepStrictEqual([looked?.yaw, looked?.pitch, clicks(server)], [-90, 17.223697662353516, [[[2, -60, 0], 1, { x: 0.5, y: 1, z: 0.5 }, { x: 2, y: -59, z: 0 }]]])
      bot.end()
    })

    it("clicks the face asked for: where its pick meets it, or at cursorPos; another face after looking at cursorPos, or the face's centre", async () => {
      const { bot, server, driver, table } = await atTable(version)
      // the looks last: the pick meets the west face until then
      for (const [direction, cursorPos] of [[new Vec3(-1, 0, 0), undefined], [new Vec3(-1, 0, 0), new Vec3(0, 0.25, 0.75)], [new Vec3(0, 0, -1), undefined], [new Vec3(0, 1, 0), new Vec3(0.25, 1, 0.25)]] as const) {
        await settle(driver, bot.activateBlock(table, direction, cursorPos))
      }
      assert.deepStrictEqual(clicks(server).map(([, face, point]) => [face, point]), [
        [4, { x: 0, y: Math.fround(0.7817764), z: 0.5 }], [4, { x: 0, y: 0.25, z: 0.75 }], [2, { x: 0.5, y: 0.5, z: 0 }], [1, { x: 0.25, y: 1, z: 0.25 }]
      ])
      bot.end()
    })

    it("looks at the top's centre first when its pick meets another block, or meets none: the block is in a column the bot has not", async () => {
      const { bot, server, driver, table } = await atTable(version, { blocks: [[1, -59, 0, 'stone']] })
      await settle(driver, bot.activateBlock(table))
      // south, along air, then columns the bot has not
      await settle(driver, bot.look(Math.PI, 0))
      const unsent = prismarineBlock(bot.registry).fromStateId(table.stateId, 0)
      unsent.position = new Vec3(0, -59, 40)
      await settle(driver, bot.activateBlock(unsent))
      assert.deepStrictEqual([bot.blockAt(unsent.position), clicks(server)], [null, [[[2, -60, 0], 1, { x: 0.5, y: 1, z: 0.5 }, { x: 2, y: -59, z: 0 }], [[0, -59, 40], 1, { x: 0.5, y: 1, z: 0.5 }, { x: 0, y: -58, z: 40 }]]])
      bot.end()
    })

    it('says where the held item would go: beside the face for a block or an empty hand, else the block itself; the use ends naming it', async () => {
      const { bot, server, driver, inventory, table } = await atTable(version)
      for (const held of [{ id: COBBLESTONE, count: 3, blockRuntimeId: 1741778478 }, { id: bot.registry.itemsByName['stick']?.id ?? 0, count: 1 }, null]) {
        inventory.slot('inventory', 0, held)
        await driver.tick()
        const use = bot.activateBlock(table)
        await driver.frame(10)
        await driver.ticks(3)
        await use
      }
      const ends = server.sentOf('player_action').filter(({ action }) => action === 'stop_item_use_on').map(({ position, result_position: result, face }) => [position, result, face])
      assert.deepStrictEqual([clicks(server).map(([, , , result]) => result), ends], [
        [{ x: 1, y: -60, z: 0 }, { x: 2, y: -60, z: 0 }, { x: 1, y: -60, z: 0 }],
        [[{ x: 1, y: -60, z: 0 }, { x: 0, y: 0, z: 0 }, 0], [{ x: 2, y: -60, z: 0 }, { x: 0, y: 0, z: 0 }, 0], [{ x: 1, y: -60, z: 0 }, { x: 0, y: 0, z: 0 }, 0]]
      ])
      bot.end()
    })

    it('as recorded on 1.26.60.5: beside the table empty handed; the brewing stand itself holding nether wart, which is planted, not placed; the key held three ticks', async () => {
      const emptyHanded = await atTable(version, { runtimeId: 2n })
      const emptyHandedBatches = batchesSince(emptyHanded.server)
      const used = emptyHanded.bot.activateBlock(emptyHanded.table)
      await emptyHanded.driver.frame(10)
      await settle(emptyHanded.driver, used)
      assert.deepStrictEqual(emptyHandedBatches(), [
        ['24023804770002770008', '2c0102000000000108696e74657261637400', '1e00000200000104770004000000000000000000000000003f1c8569c20000003f000000008022483f0000003fc0d9c0c3060100'],
        ['player_auth_input'], ['player_auth_input'], ['24023a02770000000000', 'player_auth_input']
      ])
      emptyHanded.bot.end()

      const { bot, internal, server, driver, inventory, table: stand } = await atTable(version, { block: 'brewing_stand', runtimeId: 10n })
      inventory.slot('inventory', 0, { id: bot.registry.itemsByName['nether_wart']?.id ?? 0, count: 4 })
      await driver.ticks(2)
      const batches = batchesSince(server)
      // the client picks the stand by its outline, wider than the bot's shapes: the replay names the point it clicked
      const brewing = internal._blockUse.use(internal._core, stand, { cursorPos: new Vec3(0.125, Math.fround(0.7119217), 0.5), heldTicks: 3 })
      await driver.frame(10)
      await settle(driver, brewing)
      assert.deepStrictEqual(batches(), [
        ['240a3804770004770008', '2c010a000000000108696e74657261637400', '1e000002000001047700040000260104000000000a000000000000000000000000003f1c8569c20000003f0000003e8040363f0000003ff3b4d9be060100'],
        ['player_auth_input'], ['player_auth_input'], ['player_auth_input'], ['240a3a04770000000000', 'player_auth_input']
      ])
      bot.end()
    })

    it('holds the key the ticks a replay asks after looking first too', async () => {
      const { internal, server, driver, table } = await atTable(version, { rotation: { yaw: 90, pitch: 0 } })
      const batches = batchesSince(server)
      await settle(driver, internal._blockUse.use(internal._core, table, { heldTicks: 3 }))
      const sent = batches().flat().map(packet => packet.slice(0, 4))
      const click = sent.indexOf('1e00')
      assert.deepStrictEqual(sent.slice(click, sent.lastIndexOf('2401') + 1), ['1e00', 'play', 'play', 'play', '2401'])
      internal.end()
    })

    it('rejects a use before the player is shown, over a screen, and toward no face', async () => {
      const testBot = await bedrockTestBot(bedrockCodec(version))
      const world = new ServerWorld(testBot.server)
      world.startGame()
      await testBot.driver.frame(10)
      const block = prismarineBlock(testBot.bot.registry).fromStateId(world.stateId('crafting_table'), 0)
      block.position = new Vec3(2, 12, 0)
      const unshown = assert.rejects(testBot.bot.activateBlock(block), { message: 'a block cannot be used before the player is shown' })
      await testBot.driver.frame(10)
      await unshown
      testBot.bot.end()

      const { bot, server, driver, table } = await atTable(version)
      await assert.rejects(bot.activateBlock(table, new Vec3(0, 0, 0)), { message: 'invalid direction vector (0, 0, 0)' })
      openScreen(server, 'inventory')
      await driver.frame(10)
      const overScreen = [bot.activateBlock(table), bot.openBlock(table)].map(async use => { await assert.rejects(use, { message: 'a block cannot be used while the minecraft:inventory window is open' }) })
      await driver.frame(10)
      await Promise.all(overScreen)
      assert.deepStrictEqual(server.sentOf('inventory_transaction'), [])
      bot.end()
    })

    it('rejects the uses the bot ends before: one pressed, one waiting for it, one asked after', async () => {
      const { bot, driver, table } = await atTable(version)
      const ended: string[] = []
      const use = (name: string): void => { bot.activateBlock(table).catch((error: Error) => { ended.push(`${name}: ${error.message}`) }) }
      use('pressed')
      use('waiting')
      await driver.frame(10)
      bot.end()
      await driver.frame(10)
      use('after')
      await driver.frame(10)
      assert.deepStrictEqual(ended.sort(), ['after: the bot ended', 'pressed: the bot ended', 'waiting: the bot ended'])
    })

    it('rejects openBlock when the server opens a screen the bot does not show, or none in 100 ticks', async () => {
      const { bot, server, driver, table } = await atTable(version)
      const furnace = assert.rejects(bot.openBlock(table), { message: 'the server opened a furnace screen, which the bot does not show' })
      await driver.ticks(3)
      openScreen(server, 'furnace')
      await driver.tick()
      await furnace
      const none = assert.rejects(bot.openBlock(table), { message: 'the server did not open the crafting_table in 100 ticks' })
      await driver.ticks(100)
      await none
      bot.end()
    })
  })
})
