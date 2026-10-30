import assert from 'assert'
import prismarineChunk from 'prismarine-chunk'
import type { BedrockChunk } from 'prismarine-chunk'
import prismarineRegistry from 'prismarine-registry'
import type { RegistryBedrock } from 'prismarine-registry'
import { isBedrockVersionAtLeast } from '../../../lib/bedrock/version.ts'
import type { BedrockVersion } from '../../../lib/types/api/index.ts'
import type { MCProtocol } from '../../../lib/types/protocol/Bedrock.d.ts'
import type { FakeBedrockClient } from './server.ts'
import type { ManualDriver } from './driver.ts'

/** [x, y, z, name]: a block, in world coordinates */
export type BlockAt = readonly [number, number, number, string]

export type Dimension = 'overworld' | 'nether' | 'end'

const DIMENSION_IDS = Object.freeze({ overworld: 0, nether: 1, end: 2 })

type WrittenEntries = NonNullable<MCProtocol.Bedrock.Write.Types.packet_subchunk['entries']>
type SubchunkRequest = MCProtocol.Bedrock.Write.Types.packet_subchunk_request

export interface AskedSection { dimension: number, x: number, y: number, z: number }

/** the sections of a request, as [x, y, z] of world sections: one up to 1.18.0, offsets from an origin after */
function sectionsOf ({ x, y, z, origin, requests }: SubchunkRequest): Array<readonly [number, number, number]> {
  if (x !== undefined && y !== undefined && z !== undefined) return [[x, y, z]]
  assert.ok(origin !== undefined && requests !== undefined)
  return requests.map(offset => 'dx' in offset
    ? [origin.x + offset.dx, origin.y + offset.dy, origin.z + offset.dz] as const
    : [origin.x + offset.x, origin.y + offset.y, origin.z + offset.z] as const)
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
  private readonly ChunkColumn: typeof BedrockChunk
  private readonly columns = new Map<string, BedrockChunk>()
  private answered = 0

  constructor (server: FakeBedrockClient, { hashes = false, dimension = 'overworld' }: { hashes?: boolean, dimension?: Dimension } = {}) {
    this.server = server
    this.version = server.codec.version
    this.hashes = hashes
    this.dimension = dimension
    const registry = prismarineRegistry(this.version)
    assert.ok('handleStartGame' in registry)
    registry.handleStartGame({ block_network_ids_are_hashes: hashes })
    this.registry = registry
    this.ChunkColumn = prismarineChunk(registry)
  }

  get dimensionId (): number {
    return DIMENSION_IDS[this.dimension]
  }

  /** start_game, the player's feet at `feet` */
  startGame (feet = { x: 0.5, y: 12, z: 0.5 }): void {
    const eye = { x: feet.x, y: Math.fround(feet.y + 1.62001), z: feet.z }
    this.server.send('start_game', {
      runtime_entity_id: 1n,
      ...this.atLeast('bedrock_1.16.210') ? { player_position: eye } : { spawn: eye },
      dimension: this.atLeast('bedrock_1.18.30') ? this.dimension : this.dimensionId,
      ...this.atLeast('bedrock_1.19.80') ? { block_network_ids_are_hashes: this.hashes } : {}
    })
  }

  stateId (name: string): number {
    const block = this.registry.blocksByName[name]
    assert.ok(block !== undefined, `${this.version} has no ${name}`)
    return block.defaultState
  }

  /** column (x, z): air but `blocks` */
  column (x: number, z: number, blocks: readonly BlockAt[] = stoneFloor(x, z)): BedrockChunk {
    const column = new this.ChunkColumn({ x, z })
    for (const [bx, by, bz, name] of blocks) {
      assert.deepStrictEqual([bx >> 4, bz >> 4], [x, z], `${name} at (${bx}, ${by}, ${bz}) is not in column (${x}, ${z})`)
      column.setBlockStateId({ x: bx & 15, y: by, z: bz & 15 }, this.stateId(name))
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

  /** answers the sections the bot asked for since the last answer, as the version's servers do */
  async answer (): Promise<void> {
    const requests = this.server.sentOf('subchunk_request').slice(this.answered)
    this.answered += requests.length
    for (const request of requests) {
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

  /** the columns sent, then the answers to the bot's requests, until it knows every section */
  async load (driver: ManualDriver, columns: ReadonlyArray<readonly [number, number]>): Promise<void> {
    for (const [x, z] of columns) await this.sendColumn(x, z)
    await driver.tick()
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
