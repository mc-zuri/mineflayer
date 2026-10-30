import assert from 'assert'
import { isDeepStrictEqual } from 'util'
import prismarineBlock from 'prismarine-block'
import type { Block } from 'prismarine-block'
import prismarineChunk from 'prismarine-chunk'
import type { BedrockChunk } from 'prismarine-chunk'
import prismarineRegistry from 'prismarine-registry'
import type { RegistryBedrock } from 'prismarine-registry'
import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { ClientboundPacketsToWrite, FakeBedrockClient, TestBot } from './server.ts'
import type { ManualDriver } from './driver.ts'

/** some properties of a block's state: the others are its default state's */
export type BlockProperties = Readonly<Record<string, string | number>>

/** [x, y, z, name, properties]: a block, in world coordinates, in its default state but for `properties` */
export type BlockAt = readonly [number, number, number, string, BlockProperties?]

export type Dimension = 'overworld' | 'nether' | 'end'

const DIMENSION_IDS = Object.freeze({ overworld: 0, nether: 1, end: 2 })

type WrittenEntries = NonNullable<MCProtocol.Bedrock.Write.Types.packet_subchunk['entries']>
type SubchunkRequest = MCProtocol.Bedrock.Write.Types.packet_subchunk_request

export interface AskedSection { dimension: number, x: number, y: number, z: number }

export type StartGame = Partial<ClientboundPacketsToWrite['start_game']>

/** the sections of a request, as [x, y, z] of world sections: one up to 1.18.0, offsets from an origin after */
function sectionsOf ({ x, y, z, origin, requests }: SubchunkRequest): Array<readonly [number, number, number]> {
  if (x !== undefined && y !== undefined && z !== undefined) return [[x, y, z]]
  assert.ok(origin !== undefined && requests !== undefined)
  return requests.map(offset => 'dx' in offset
    ? [origin.x + offset.dx, origin.y + offset.dy, origin.z + offset.dz] as const
    : [origin.x + offset.x, origin.y + offset.y, origin.z + offset.z] as const)
}

export interface Point3 { x: number, y: number, z: number }

/** Bedrock degrees */
export interface Rotation { yaw: number, pitch: number }

/** where a join made the bot's auth inputs start, and the player move */
export interface Joined {
  /** the tick of the first auth input */
  firstAuthInput: number
  /** the first tick the player moves */
  moving: number
}

/** a stone floor at y 11 under the column, and stone at (1, 12, 0) of column (0, 0) */
export function stoneFloor (x: number, z: number): BlockAt[] {
  const blocks: BlockAt[] = []
  for (let bx = 0; bx < 16; bx++) for (let bz = 0; bz < 16; bz++) blocks.push([x * 16 + bx, 11, z * 16 + bz, 'stone'])
  return x === 0 && z === 0 ? [...blocks, [1, 12, 0, 'stone']] : blocks
}

/**
 * The server's world in a test: its columns built with prismarine-chunk, sent as the version's servers send them, and
 * its answers to the sections the bot asks for.
 */
export class ServerWorld {
  readonly registry: RegistryBedrock
  readonly version: BedrockVersion
  private readonly server: FakeBedrockClient
  private readonly hashes: boolean
  private readonly dimension: Dimension
  /** blocks besides the floor of the columns around the feet */
  private readonly blocks: readonly BlockAt[]
  private readonly ChunkColumn: typeof BedrockChunk
  private readonly Block: typeof Block
  private readonly columns = new Map<string, BedrockChunk>()
  private answered = 0
  private feet: Point3 = { x: 0.5, y: 12, z: 0.5 }

  constructor (server: FakeBedrockClient, { hashes = false, dimension = 'overworld', blocks = [] }: { hashes?: boolean, dimension?: Dimension, blocks?: readonly BlockAt[] } = {}) {
    this.server = server
    this.version = server.codec.version
    this.hashes = hashes
    this.dimension = dimension
    this.blocks = blocks
    const registry = prismarineRegistry(this.version)
    assert.ok('handleStartGame' in registry)
    registry.handleStartGame({ block_network_ids_are_hashes: hashes })
    this.registry = registry
    this.ChunkColumn = prismarineChunk(registry)
    this.Block = prismarineBlock(registry)
  }

  get dimensionId (): number {
    return DIMENSION_IDS[this.dimension]
  }

  /**
   * start_game, the player's feet at `feet`: the movement authority as recorded (server up to 1.21.60, with rewind on
   * 1.21.70 and 1.21.80, none named after) and a ring of 20 ticks (none named on 1.16.201), but for `fields`
   */
  startGame (feet = this.feet, rotation: Rotation = { yaw: 0, pitch: 0 }, fields: StartGame = {}): void {
    this.feet = feet
    const eye = eyeOf(feet)
    this.server.send('start_game', {
      runtime_entity_id: 1n,
      rotation: { x: rotation.pitch, z: rotation.yaw },
      ...this.atLeast('bedrock_1.16.210') ? { player_position: eye, rewind_history_size: 20 } : { spawn: eye },
      ...this.atLeast('bedrock_1.21.90') ? {} : { movement_authority: this.atLeast('bedrock_1.21.70') ? 'server_with_rewind' : 'server' },
      dimension: this.atLeast('bedrock_1.18.30') ? this.dimension : this.dimensionId,
      ...this.atLeast('bedrock_1.19.80') ? { block_network_ids_are_hashes: this.hashes } : {},
      ...fields
    })
  }

  /** respawn's ready state at start_game's feet, then play_status player_spawn: the server spawned the player */
  spawn (): void {
    const eye = eyeOf(this.feet)
    if (this.atLeast('bedrock_1.16.220')) this.server.send('respawn', { position: eye, state: 1, runtime_entity_id: 1n })
    else this.server.send('respawn', { ...eye, state: 1, runtime_entity_id: this.atLeast('bedrock_1.16.210') ? 1n : 1 })
    this.server.send('play_status', { status: 'player_spawn' })
  }

  /**
   * start_game, the 3 × 3 columns around the feet (a stone floor under them) and the spawn; then ticks, answering the
   * bot's requests, until it spawned, with no error
   */
  async join ({ bot, internal, driver }: TestBot, { feet = this.feet, rotation, game }: { feet?: Point3, rotation?: Rotation, game?: StartGame } = {}): Promise<Joined> {
    let spawned = false
    bot.once('spawn', () => { spawned = true })
    const errors: string[] = []
    const onError = (error: Error): void => { errors.push(error.message) }
    bot.on('error', onError)
    this.startGame(feet, rotation, game)
    await this.sendAround()
    this.spawn()
    const { activation } = internal._core
    let firstAuthInput: number | undefined
    let moving: number | undefined
    for (let ticks = 0; ticks < 300; ticks++) {
      if (spawned) break
      await driver.tick()
      const tick = internal._core.tick ?? 0
      if (activation.present) firstAuthInput ??= tick + 1
      if (activation.active) moving ??= tick + 1
      await this.answer()
    }
    bot.off('error', onError)
    assert.ok(spawned && firstAuthInput !== undefined && moving !== undefined, `${this.version}: not spawned in 300 ticks`)
    assert.deepStrictEqual(errors, [], `${this.version}: errors joining`)
    return { firstAuthInput, moving }
  }

  /** the 3 × 3 columns around start_game's feet, a stone floor under them, and the world's other blocks there */
  async sendAround (): Promise<void> {
    const [x, z] = [Math.floor(this.feet.x) >> 4, Math.floor(this.feet.z) >> 4]
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) {
        const blocks = this.blocks.filter(([bx, , bz]) => bx >> 4 === x + dx && bz >> 4 === z + dz)
        this.column(x + dx, z + dz, [...stoneFloor(x + dx, z + dz), ...blocks])
        await this.sendColumn(x + dx, z + dz)
      }
    }
  }

  /** the state of the block `name`: its default one, but for `properties` */
  stateId (name: string, properties: BlockProperties = {}): number {
    const block = this.registry.blocksByName[name]
    assert.ok(block !== undefined, `${this.version} has no ${name}`)
    if (Object.keys(properties).length === 0) return block.defaultState
    const wanted = { ...this.Block.fromStateId(block.defaultState, 0).getProperties(), ...properties }
    for (let stateId = block.minStateId ?? 0; stateId <= (block.maxStateId ?? -1); stateId++) {
      if (isDeepStrictEqual(this.Block.fromStateId(stateId, 0).getProperties(), wanted)) return stateId
    }
    assert.fail(`${this.version} has no ${name} ${JSON.stringify(properties)}`)
  }

  /** column (x, z): air but `blocks` */
  column (x: number, z: number, blocks: readonly BlockAt[] = stoneFloor(x, z)): BedrockChunk {
    const column = new this.ChunkColumn({ x, z })
    for (const [bx, by, bz, name, properties] of blocks) {
      assert.deepStrictEqual([bx >> 4, bz >> 4], [x, z], `${name} at (${bx}, ${by}, ${bz}) is not in column (${x}, ${z})`)
      column.setBlockStateId({ x: bx & 15, y: by, z: bz & 15 }, this.stateId(name, properties))
    }
    this.columns.set(`${x},${z}`, column)
    return column
  }

  /** level_chunk, as the version's servers send it: whole up to 1.17.40, its sections asked for after */
  async sendColumn (x: number, z: number): Promise<void> {
    const column = this.columnAt(x, z)
    const payload = await column.networkEncodeNoCache()
    const dimension = this.atLeast('bedrock_1.20.61') ? { dimension: this.dimensionId } : {}
    if (!this.atLeast('bedrock_1.18.0')) {
      let sections = 0
      while (column.getSectionAtIndex(sections) !== undefined) sections++
      this.server.send('level_chunk', { x, z, sub_chunk_count: sections, payload })
    } else if (!this.atLeast('bedrock_1.26.40')) {
      this.server.send('level_chunk', { x, z, ...dimension, sub_chunk_count: -1, payload })
    } else {
      this.server.send('level_chunk', { x, z, ...dimension, sub_chunk_count: 0, payload })
    }
  }

  /** the sections the bot asked for, in the order it asked, whatever the version's request */
  asked (): AskedSection[] {
    return this.server.sentOf('subchunk_request').flatMap(request => sectionsOf(request).map(([x, y, z]) => ({ dimension: request.dimension, x, y, z })))
  }

  /** answers the sections of its dimension the bot asked for since the last answer, as the version's servers do */
  async answer (): Promise<void> {
    const requests = this.server.sentOf('subchunk_request').slice(this.answered)
    this.answered += requests.length
    for (const request of requests.filter(({ dimension }) => dimension === this.dimensionId)) {
      const { dimension, x, y, z, origin } = request
      if (x !== undefined && y !== undefined && z !== undefined) {
        this.server.send('subchunk', { dimension, x, y, z, data: await this.encodedSection(x, y, z, true), request_result: 'success', heightmap_type: 'no_data' })
      } else {
        assert.ok(origin !== undefined)
        const offsets = sectionsOf(request).map(([x, y, z]) => [x - origin.x, y - origin.y, z - origin.z] as const)
        this.server.send('subchunk', { cache_enabled: false, dimension, origin, entries: await this.entries(origin, offsets) })
      }
    }
  }

  /**
   * the columns sent, then the answers to the bot's requests, until it knows every section: a bot that sends no auth
   * input yet starts asking the tick after the player's column shows
   */
  async load (driver: ManualDriver, columns: ReadonlyArray<readonly [number, number]>): Promise<void> {
    for (const [x, z] of columns) await this.sendColumn(x, z)
    await driver.ticks(2)
    await this.answer()
    await driver.tick()
  }

  private async entries (origin: { x: number, y: number, z: number }, offsets: ReadonlyArray<readonly [number, number, number]>): Promise<WrittenEntries> {
    const sections = await Promise.all(offsets.map(async ([dx, dy, dz]) => ({ dx, dy, dz, payload: await this.encodedSection(origin.x + dx, origin.y + dy, origin.z + dz, false) })))
    const heightmaps: { heightmap_type: 'no_data', render_heightmap_type?: 'no_data' } = this.atLeast('bedrock_1.21.90') ? { heightmap_type: 'no_data', render_heightmap_type: 'no_data' } : { heightmap_type: 'no_data' }
    if (!this.atLeast('bedrock_1.26.40')) {
      return sections.map(({ dx, dy, dz, payload }) => ({ dx, dy, dz, result: payload === undefined ? 'success_all_air' : 'success', payload: payload ?? Buffer.alloc(0), ...heightmaps }))
    }
    // from 1.26.40 a section of air has no payload
    return sections.map(({ dx, dy, dz, payload }) => ({ dx, dy, dz, result: payload === undefined ? 'success_all_air' : 'success', ...payload === undefined ? {} : { payload }, heightmap_type: 'no_data', render_heightmap_type: 'no_data' }))
  }

  /** a section's payload; undefined for one of air, unless the version cannot say so */
  private async encodedSection (x: number, y: number, z: number, encodeAir: boolean): Promise<Buffer | undefined> {
    const column = this.columnAt(x, z)
    if (column.getSectionAtIndex(y) === undefined) {
      if (!encodeAir) return undefined
      column.setBlockStateId({ x: 0, y: y * 16, z: 0 }, this.stateId('air'))
    }
    return await column.networkEncodeSubChunkNoCache(y)
  }

  private columnAt (x: number, z: number): BedrockChunk {
    const column = this.columns.get(`${x},${z}`)
    assert.ok(column !== undefined, `the server has no column (${x}, ${z})`)
    return column
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.version, since)
  }
}

/** the vanilla client's eye over the feet, a float */
export function eyeOf (feet: Point3): Point3 {
  return { x: feet.x, y: Math.fround(feet.y + Math.fround(1.62001)), z: feet.z }
}
