import type { Block } from 'prismarine-block'
import prismarineChunk from 'prismarine-chunk'
import type { BedrockChunk } from 'prismarine-chunk'
import nbt from 'prismarine-nbt'
import type { NBT } from 'prismarine-nbt'
import type { World } from 'prismarine-physics/lib/bedrock/index.ts'
import type { RegistryBedrock } from 'prismarine-registry'
import prismarineWorld, { iterators } from 'prismarine-world'
import type { world } from 'prismarine-world'
import { Vec3 } from 'vec3'
import type { BedrockCore } from '../core/core.ts'
import type { OutboxWriter } from '../core/types.ts'
import { isBedrockVersionAtLeast } from '../version.ts'
import type { BedrockVersion, RaycastMatcher } from '../../types/api/index.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'
import type { BedrockClientboundPackets } from '../../types/protocol/bedrock-client.ts'

const OWNER = 'world'
// prismarine-chunk's StorageType.Runtime (a const enum, which type stripping cannot inline): a palette of runtime ids
const RUNTIME_STORAGE = 2
const SECTIONS_ASKED_PER_TICK = 256
// the offsets of a section request are bytes (from 1.18.11; 1.18.0 is held to them too)
const MAX_OFFSET = 127
/** waitForChunksToLoad: the columns within 2 of the player's, as Java's, for at most 200 ticks */
const CHUNKS_TO_LOAD_RADIUS = 2
const CHUNKS_TO_LOAD_TICKS = 200
const DIMENSIONS = Object.freeze(['overworld', 'nether', 'end'])
const OVERWORLD_SECTIONS = sectionsFrom(-4, 19)
const NETHER_SECTIONS = sectionsFrom(0, 7)
const END_SECTIONS = sectionsFrom(0, 15)
const COMPOUND_TAG = 0x0a
/** what the physics take a cell the bot does not know below the player for */
const UNSENT_FLOOR = Object.freeze({ name: 'unsent', shapes: Object.freeze([Object.freeze([0, 0, 0, 1, 1, 1])]) })

function sectionsFrom (lowest: number, highest: number): readonly number[] {
  return Object.freeze(Array.from({ length: highest - lowest + 1 }, (_, index) => lowest + index))
}

/** the sections the client asks for in a column of the dimension (from 1.18.0, when it asks for them) */
function sectionsOf (dimension: number): readonly number[] {
  if (dimension === 1) return NETHER_SECTIONS
  if (dimension === 2) return END_SECTIONS
  return OVERWORLD_SECTIONS
}

interface Column {
  readonly x: number
  readonly z: number
  readonly chunk: BedrockChunk
  /** its sections come apart, each as the client asks for it (1.18.0+), rather than with the column */
  readonly requestMode: boolean
  /** the sections to ask for: not asked yet, or not given when asked */
  readonly unrequested: Set<number>
  /** the sections answered, from the tick after the answer */
  readonly known: Set<number>
}

function keyOf (x: number, z: number): string {
  return `${x},${z}`
}

/** the key of a block's block entity in its column: x and z in the column, y in the world */
function blockEntityKey ({ x, y, z }: { x: number, y: number, z: number }): string {
  return `${x & 15},${y},${z & 15}`
}

/** forgets the column's block entities of a section */
function dropBlockEntities (chunk: BedrockChunk, sectionY: number): void {
  for (const key of Object.keys(chunk.blockEntities)) {
    if (chunkCoordinate(Number(key.split(',')[1])) === sectionY) Reflect.deleteProperty(chunk.blockEntities, key)
  }
}

/** the length of the network section a subchunk payload starts with: the section's block entities follow it */
function sectionLength (payload: Buffer): number {
  const version = payload.readUInt8(0)
  // version 1 has one layer and no count; 9 adds the section's y
  const layers = version === 1 ? 1 : payload.readUInt8(1)
  let offset = version === 1 ? 1 : version === 9 ? 3 : 2
  for (let layer = 0; layer < layers; layer++) {
    const bits = payload.readUInt8(offset++) >> 1
    // a layer of 0 bits is one block state
    let states = 1
    if (bits > 0) {
      offset += Math.ceil(4096 / Math.floor(32 / bits)) * 4
      let size: number
      [size, offset] = readVarint(payload, offset)
      // a zigzag varint, positive
      states = size >>> 1
    }
    for (let state = 0; state < states; state++) offset = readVarint(payload, offset)[1]
  }
  return offset
}

/** a varint's value, and the offset after it */
function readVarint (buffer: Buffer, offset: number): [number, number] {
  let value = 0
  let shift = 0
  let byte: number
  do {
    byte = buffer.readUInt8(offset++)
    value |= (byte & 0x7f) << shift
    shift += 7
  } while ((byte & 0x80) !== 0)
  return [value, offset]
}

/** the NBT compounds from `offset` of a payload on */
function readBlockEntities (payload: Buffer, offset: number): NBT[] {
  const tags: NBT[] = []
  while (payload[offset] === COMPOUND_TAG) {
    // prismarine-nbt types its protocols as any
    const { data, metadata }: { data: NBT, metadata: { size: number } } = nbt.protos.littleVarint.parsePacketBuffer('nbt', payload, offset)
    tags.push(data)
    offset += metadata.size
  }
  return tags
}

/** a block a ray met: the face it entered by, and where it met the block's shapes */
export type RaycastHit = Block & { face: number, intersect: Vec3 }

/** the column (or section) holding a block coordinate */
export function chunkCoordinate (coordinate: number): number {
  return Math.floor(coordinate) >> 4
}

/**
 * The world as the server sends it: a column, a section or a block change is taken in the packet pass and shown from
 * the next tick on (a block change at once, where its section is shown already). From 1.18.0 a column comes without its
 * sections, and the client asks for them, a few each tick, nearest first.
 */
export class NetworkWorld {
  readonly world: world.WorldSync
  /** packets dropped: of another dimension, for the client cache the bot keeps none of, or about a column it has not */
  readonly stats = { otherDimension: 0, cached: 0, unknownColumn: 0 }
  private readonly bot: BedrockBotInternal
  private ChunkColumn: typeof BedrockChunk | undefined
  private dimension = 0
  private sections = OVERWORLD_SECTIONS
  /** the player's feet: its column is the requests' origin */
  private readonly playerFeet: () => Vec3
  /** the columns in bot.world */
  private readonly shown = new Map<string, Column>()
  /** each column as last received, shown or staged: what a section or block change writes to */
  private readonly latest = new Map<string, Column>()

  constructor (bot: BedrockBotInternal, playerFeet: () => Vec3) {
    this.bot = bot
    this.playerFeet = playerFeet
    this.world = new (prismarineWorld(bot.version))().sync
  }

  install (core: BedrockCore): void {
    this.bot.world = this.world
    this.bot.blockAt = point => this.sectionKnown(point.x, point.y, point.z) ? this.world.getBlock(point) : null
    this.bot.waitForChunksToLoad = async () => {
      const missing = this.notLoadedAround(this.playerFeet(), CHUNKS_TO_LOAD_RADIUS).length
      await core.waits.until(() => this.loadedAround(this.playerFeet(), CHUNKS_TO_LOAD_RADIUS), CHUNKS_TO_LOAD_TICKS, `Timeout waiting for ${missing} chunks to load after ${CHUNKS_TO_LOAD_TICKS} ticks`)
    }
    this.world.on('chunkColumnLoad', (corner: Vec3) => { core.emit(this.bot, 'chunkColumnLoad', corner) })
    this.world.on('chunkColumnUnload', (corner: Vec3) => { core.emit(this.bot, 'chunkColumnUnload', corner) })
    this.world.on('blockUpdate', (oldBlock: Block, newBlock: Block) => {
      core.emit(this.bot, 'blockUpdate', oldBlock, newBlock)
      const { x, y, z } = newBlock.position
      core.emit(this.bot, `blockUpdate:(${x}, ${y}, ${z})`, oldBlock, newBlock)
    })
    core.observe(OWNER, 'start_game', packet => { this.start(packet) })
    core.observe(OWNER, 'change_dimension', packet => { this.changeDimension(packet.dimension) })
    core.handle(OWNER, 'level_chunk', packet => { this.receiveColumn(core, packet) })
    core.handle(OWNER, 'subchunk', packet => { this.receiveSections(core, packet) })
    core.handle(OWNER, 'update_block', packet => {
      // 1.16.201 names them coordinates and storage
      const position = packet.position ?? packet.coordinates
      const layer = packet.layer ?? packet.storage
      if (position !== undefined && layer === 0) this.setBlock(position, packet.block_runtime_id)
    })
    core.handle(OWNER, 'update_subchunk_blocks', packet => {
      // extra is the second layer
      for (const block of packet.blocks) this.setBlock(block.position, block.runtime_id)
    })
    core.handle(OWNER, 'network_chunk_publisher_update', packet => { this.publish(packet) })
    core.handle(OWNER, 'block_entity_data', packet => { this.receiveBlockEntity(core, packet) })
    // after the tick's auth input, as the vanilla client asks
    core.system(OWNER, { name: 'world.requestSubchunks', place: { at: 'MolangUpdateSystem' }, gate: 'present', replay: false, run: ctx => { this.requestSections(ctx.outbox) } })
  }

  /** whether the column of block (x, z) is shown */
  columnPresent (x: number, z: number): boolean {
    return this.shown.has(keyOf(chunkCoordinate(x), chunkCoordinate(z)))
  }

  /** whether the section of block (x, y, z) is shown: its column is, and the section was answered, if asked for */
  sectionKnown (x: number, y: number, z: number): boolean {
    const column = this.shown.get(keyOf(chunkCoordinate(x), chunkCoordinate(z)))
    return column !== undefined && this.knows(column, chunkCoordinate(y))
  }

  /**
   * the blocks as the physics read them: where the bot has no column, or asked for the section and has no answer yet,
   * a solid floor below the section of the feet (at `feetY`), so that the player does not fall through what the server
   * has not sent; air from that section up
   */
  physicsWorld (feetY: number): World {
    const feetSection = chunkCoordinate(feetY)
    return {
      getBlock: (x, y, z) => {
        if (!this.sectionKnown(x, y, z)) return chunkCoordinate(y) < feetSection ? UNSENT_FLOOR : null
        return this.world.getBlock(new Vec3(x, y, z))
      }
    }
  }

  /** whether every column within `radius` columns of `feet`'s is shown with every section */
  loadedAround (feet: Vec3, radius: number): boolean {
    return this.notLoadedAround(feet, radius).length === 0
  }

  /** the columns within `radius` columns of `feet`'s not shown with every section */
  notLoadedAround (feet: Vec3, radius: number): Array<{ x: number, z: number }> {
    const [x, z] = [chunkCoordinate(feet.x), chunkCoordinate(feet.z)]
    const missing: Array<{ x: number, z: number }> = []
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const column = this.shown.get(keyOf(x + dx, z + dz))
        if (column === undefined || !this.sections.every(y => this.knows(column, y))) missing.push({ x: x + dx, z: z + dz })
      }
    }
    return missing
  }

  /** the block states of a section's first layer, where blockAt shows it; none for a section the column has not (air) */
  sectionStates (chunkX: number, sectionY: number, chunkZ: number): readonly number[] | undefined {
    const column = this.shown.get(keyOf(chunkX, chunkZ))
    if (column === undefined || !this.knows(column, sectionY)) return undefined
    return column.chunk.getSectionAtIndex(sectionY)?.getPalette(0).map(entry => entry.stateId) ?? []
  }

  /**
   * prismarine-world's raycast over the blocks blockAt shows (a section the bot does not know has none): the first
   * block whose shapes the ray meets, with the face and the point, or without a face the first `matcher` takes
   */
  raycast (from: Vec3, direction: Vec3, range: number): RaycastHit | null
  raycast (from: Vec3, direction: Vec3, range: number, matcher: RaycastMatcher | null): Block | null
  raycast (from: Vec3, direction: Vec3, range: number, matcher: RaycastMatcher | null = null): Block | null {
    const ray = new iterators.RaycastIterator(from, direction, range)
    // the first cell's shapes where its block is: prismarine-world offsets them by where the ray starts in it
    for (let cell: { x: number, y: number, z: number } | null = from.floored(); cell !== null; cell = ray.next()) {
      const position = new Vec3(cell.x, cell.y, cell.z)
      const block = this.bot.blockAt(position)
      if (block === null) continue
      if (matcher !== null) {
        if (matcher(block, ray)) return block
        continue
      }
      const hit = ray.intersect(block.shapes, position)
      if (hit !== null) return Object.assign(block, { face: hit.face, intersect: hit.pos })
    }
    return null
  }

  /** a section of a whole column, an answered one, or one above or below those asked for (air) */
  private knows (column: Column, sectionY: number): boolean {
    return !column.requestMode || column.known.has(sectionY) || !this.sections.includes(sectionY)
  }

  private start (packet: BedrockClientboundPackets['start_game']): void {
    const registry = this.bot.registry
    // a Bedrock version's registry, though prismarine-registry's typings give either edition's
    if ('handleStartGame' in registry) this.startRegistry(registry, packet)
    // a name from 1.18.30
    this.dimension = typeof packet.dimension === 'number' ? packet.dimension : DIMENSIONS.indexOf(packet.dimension)
    this.sections = sectionsOf(this.dimension)
  }

  /** as Java's: the columns of the dimension left are unloaded, in the same world */
  private changeDimension (dimension: number): void {
    this.dimension = dimension
    this.sections = sectionsOf(dimension)
    for (const { x, z } of this.shown.values()) this.world.unloadColumn(x, z)
    this.shown.clear()
    this.latest.clear()
  }

  /**
   * unloads every column farther from the publisher's, along x or z, than its radius (in blocks) in columns, but those
   * it saves: servers send their columns within that square, and forget those that leave it (as recorded); its y is
   * not read, servers fill it with anything
   */
  private publish ({ coordinates, radius, saved_chunks: saved = [] }: BedrockClientboundPackets['network_chunk_publisher_update']): void {
    const [x, z, reach] = [coordinates.x >> 4, coordinates.z >> 4, radius >> 4]
    const kept = new Set(saved.map(column => keyOf(column.x, column.z)))
    for (const [key, column] of this.latest) {
      if (Math.max(Math.abs(column.x - x), Math.abs(column.z - z)) <= reach || kept.has(key)) continue
      // one staged in the frame then never shows, nor emits
      this.latest.delete(key)
      if (this.shown.delete(key)) this.world.unloadColumn(column.x, column.z)
    }
  }

  private startRegistry (registry: RegistryBedrock, packet: BedrockClientboundPackets['start_game']): void {
    // the block states are numbered by their hash when the packet says so
    registry.handleStartGame(packet)
    this.ChunkColumn = prismarineChunk(registry)
  }

  private receiveColumn (core: BedrockCore, packet: BedrockClientboundPackets['level_chunk']): void {
    const { x, z, sub_chunk_count: sectionCount } = packet
    const { ChunkColumn } = this
    if (ChunkColumn === undefined) throw new Error('level_chunk before start_game')
    // level_chunk names its dimension from 1.20.61
    if (packet.dimension !== undefined && packet.dimension !== this.dimension) {
      this.stats.otherDimension++
      return
    }
    if (packet.cache_enabled) {
      this.stats.cached++
      return
    }
    if (sectionCount < 0 && !this.atLeast('bedrock_1.18.0')) throw new Error(`level_chunk (${x}, ${z}) asks for its sections, which a column before 1.18.0 cannot`)
    const chunk = new ChunkColumn({ x, z })
    // a negative count (and 0 from 1.26.40) reads the biomes only
    chunk.networkDecodeNoCache(packet.payload, sectionCount)
    const requestMode = sectionCount < 0 || (sectionCount === 0 && this.atLeast('bedrock_1.26.40'))
    const column: Column = { x, z, chunk, requestMode, unrequested: new Set(requestMode ? this.sections : []), known: new Set() }
    this.latest.set(keyOf(x, z), column)
    core.stage(() => {
      // replaced before it showed: sent again, or of the dimension left
      if (this.latest.get(keyOf(x, z)) !== column) return
      this.shown.set(keyOf(x, z), column)
      this.world.setColumn(x, z, chunk)
    })
  }

  private receiveSections (core: BedrockCore, packet: BedrockClientboundPackets['subchunk']): void {
    if (packet.cache_enabled === true) {
      this.stats.cached++
      return
    }
    const { x, y, z, data, origin, entries } = packet
    // up to 1.18.0: a section a packet
    if (x !== undefined && y !== undefined && z !== undefined && data !== undefined) this.receiveSection(core, x, y, z, packet.request_result, data)
    if (origin !== undefined && entries !== undefined) {
      for (const entry of entries) this.receiveSection(core, origin.x + entry.dx, origin.y + entry.dy, origin.z + entry.dz, entry.result, entry.payload)
    }
  }

  private receiveSection (core: BedrockCore, x: number, y: number, z: number, result: string | number | undefined, payload: Buffer | undefined): void {
    const column = this.latest.get(keyOf(x, z))
    if (column === undefined) {
      this.stats.unknownColumn++
      return
    }
    if (result !== 'success' && result !== 'success_all_air') {
      column.unrequested.add(y)
      return
    }
    // answered, also where the column was sent again since it asked: the answer came after it
    column.unrequested.delete(y)
    // the answer gives the section's block entities: those after its blocks, none for air
    dropBlockEntities(column.chunk, y)
    // from 1.26.40 a section of air has no payload; before, an empty one
    if (result === 'success' && payload !== undefined) column.chunk.newSection(y, RUNTIME_STORAGE, payload)
    // staged before the block entities are read: a section whose block entities fail to read still shows
    core.stage(() => { column.known.add(y) })
    if (result === 'success' && payload !== undefined) {
      for (const tag of readBlockEntities(payload, sectionLength(payload))) column.chunk.addBlockEntity(tag)
    }
  }

  /** whether the block shows where the column was last received: its column is shown, and its section known */
  private shows (key: string, column: Column, y: number): boolean {
    return this.shown.get(key) === column && this.knows(column, chunkCoordinate(y))
  }

  private setBlock (position: { x: number, y: number, z: number }, stateId: number): void {
    const key = keyOf(chunkCoordinate(position.x), chunkCoordinate(position.z))
    const column = this.latest.get(key)
    if (column === undefined) {
      this.stats.unknownColumn++
      return
    }
    // a block's entity goes with it (a furnace lit keeps the furnace's): servers tell a new one after its block
    if (stateId === this.bot.registry.blocksByName['air']?.defaultState) Reflect.deleteProperty(column.chunk.blockEntities, blockEntityKey(position))
    if (this.shows(key, column, position.y)) this.world.setBlockStateId(new Vec3(position.x, position.y, position.z), stateId)
    // a column takes a block by its world coordinates: it keeps their low bits
    else column.chunk.setBlockStateId(position, stateId)
  }

  /**
   * a block entity told: one naming its id replaces the one held, one without (a furnace's fuel, a crafter's slots)
   * adds its fields to it; where the block shows, `blockEntityData` is emitted with it
   */
  private receiveBlockEntity (core: BedrockCore, { position, nbt: told }: BedrockClientboundPackets['block_entity_data']): void {
    const key = keyOf(chunkCoordinate(position.x), chunkCoordinate(position.z))
    const column = this.latest.get(key)
    if (column === undefined) {
      this.stats.unknownColumn++
      return
    }
    const { blockEntities } = column.chunk
    const held: NBT | undefined = blockEntities[blockEntityKey(position)]
    blockEntities[blockEntityKey(position)] = told.value['id'] !== undefined || held === undefined ? told : { ...held, value: { ...held.value, ...told.value } }
    if (this.shows(key, column, position.y)) core.emit(this.bot, 'blockEntityData', this.bot.blockAt(new Vec3(position.x, position.y, position.z)))
  }

  requestSections (outbox: OutboxWriter): void {
    const feet = this.playerFeet()
    const [originX, originZ] = [chunkCoordinate(feet.x), chunkCoordinate(feet.z)]
    const distance = (column: Column): number => Math.max(Math.abs(column.x - originX), Math.abs(column.z - originZ))
    const columns = [...this.shown.values()]
      .filter(column => distance(column) <= MAX_OFFSET)
      .sort((a, b) => distance(a) - distance(b))
    const sections: Array<{ x: number, y: number, z: number }> = []
    for (const column of columns) {
      for (const y of [...column.unrequested].slice(0, SECTIONS_ASKED_PER_TICK - sections.length)) {
        column.unrequested.delete(y)
        sections.push({ x: column.x, y, z: column.z })
      }
    }
    if (sections.length === 0) return
    const { dimension } = this
    if (!this.atLeast('bedrock_1.18.11')) {
      for (const section of sections) outbox.queue('subchunk_request', { dimension, ...section })
    } else if (!this.atLeast('bedrock_1.26.30')) {
      const requests = sections.map(({ x, y, z }) => ({ dx: x - originX, dy: y, dz: z - originZ }))
      outbox.queue('subchunk_request', { dimension, origin: { x: originX, y: 0, z: originZ }, requests })
    } else {
      const requests = sections.map(({ x, y, z }) => ({ x: x - originX, y, z: z - originZ }))
      outbox.queue('subchunk_request', { dimension, requests, origin: { x: originX, y: 0, z: originZ } })
    }
  }

  private atLeast (since: BedrockVersion): boolean {
    return isBedrockVersionAtLeast(this.bot.version, since)
  }
}
