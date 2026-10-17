// The hashes of an item's components a 1.21.5+ client sends in a container click (HashedStack, HashedPatchMap): each
// component's value encoded by its codec through vanilla's HashOps over CRC32C (Guava's Hashing.crc32c: little-endian
// puts, the hash read as a little-endian int). Only the components whose codec is known here are hashed; for any
// other the hash is undefined.

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? (c >>> 1) ^ 0x82F63B78 : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32c (bytes) {
  let crc = 0xFFFFFFFF
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xFF] ^ (crc >>> 8)
  return (crc ^ 0xFFFFFFFF) | 0
}

// a hash as Guava's HashCode.asBytes: the int, little-endian
const hashBytes = hash => [hash & 0xFF, (hash >>> 8) & 0xFF, (hash >>> 16) & 0xFF, (hash >>> 24) & 0xFF]
const intBytes = hashBytes

// HashOps
const TAG_MAP_START = 2
const TAG_MAP_END = 3
const TAG_LIST_START = 4
const TAG_LIST_END = 5
const TAG_INT = 8
const TAG_STRING = 12
const TAG_BOOLEAN = 13

const hashInt = value => crc32c([TAG_INT, ...intBytes(value)])
const hashBoolean = value => crc32c([TAG_BOOLEAN, value ? 1 : 0])
function hashString (value) {
  const bytes = [TAG_STRING, ...intBytes(value.length)]
  for (let i = 0; i < value.length; i++) {
    const char = value.charCodeAt(i)
    bytes.push(char & 0xFF, char >>> 8)
  }
  return crc32c(bytes)
}
// a map's entries in the order of their keys' hashes, then their values' (as unsigned ints: HashCode.padToLong)
function hashMap (entries) {
  const unsigned = hash => hash >>> 0
  const sorted = entries.slice().sort((a, b) => unsigned(a[0]) - unsigned(b[0]) || unsigned(a[1]) - unsigned(b[1]))
  const bytes = [TAG_MAP_START]
  for (const [key, value] of sorted) bytes.push(...hashBytes(key), ...hashBytes(value))
  bytes.push(TAG_MAP_END)
  return crc32c(bytes)
}
function hashList (hashes) {
  const bytes = [TAG_LIST_START]
  for (const hash of hashes) bytes.push(...hashBytes(hash))
  bytes.push(TAG_LIST_END)
  return crc32c(bytes)
}

// a text component that is plain text (ComponentSerialization's codec writes it as a string: tryCollapseToString);
// undefined for one with style or siblings
function plainText (data) {
  if (typeof data === 'string') return data
  if (data?.type === 'string') return data.value
  return undefined
}

module.exports = registry => {
  const enchantmentName = id => {
    const enchantment = registry.enchantments?.[id]
    return enchantment ? `minecraft:${enchantment.name}` : undefined
  }
  // ItemEnchantments.CODEC: the enchantments' ids to their levels
  function hashEnchantments (data) {
    const entries = []
    for (const { id, level } of data?.enchantments ?? []) {
      const name = enchantmentName(id)
      if (name === undefined) return undefined
      entries.push([hashString(name), hashInt(level)])
    }
    return hashMap(entries)
  }
  const CODECS = {
    custom_name: data => {
      const text = plainText(data)
      return text === undefined ? undefined : hashString(text)
    },
    item_name: data => {
      const text = plainText(data)
      return text === undefined ? undefined : hashString(text)
    },
    enchantments: hashEnchantments,
    stored_enchantments: hashEnchantments,
    repair_cost: data => Number.isInteger(data) ? hashInt(data) : undefined,
    damage: data => Number.isInteger(data) ? hashInt(data) : undefined,
    max_damage: data => Number.isInteger(data) ? hashInt(data) : undefined,
    max_stack_size: data => Number.isInteger(data) ? hashInt(data) : undefined,
    unbreakable: () => crc32c([TAG_MAP_START, TAG_MAP_END]),
    enchantment_glint_override: data => typeof data === 'boolean' ? hashBoolean(data) : undefined
  }
  /** the hash of a component ({ type, data }), or undefined when its codec is not known here */
  return function componentHash ({ type, data }) {
    const codec = CODECS[type]
    try {
      return codec ? codec(data) : undefined
    } catch (err) {
      return undefined
    }
  }
}

module.exports.crc32c = crc32c
module.exports.hashList = hashList
