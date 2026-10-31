// The order 1.14 - 1.16 clients tick their entities in: ClientLevel keeps them in a fastutil
// Int2ObjectOpenHashMap (new Int2ObjectOpenHashMap(): 16 expected, load factor 0.75, so 32 slots holding up to 24
// entries) and tickEntities walks its entry set from the last slot down, the null key (id 0) first (1.14
// ClientWorld.java:65, 113-133; 1.15 :75; 1.16.5 :74). Where an id lands depends on what came in and went out before:
// linear probing, a rehash to the next table on the 25th put (and so on), the shift of the entries after a removed one,
// and a rehash to half the table once fewer than maxFill / 4 are left, but for a removal through the entry set's
// iterator (tickEntities and finishRemovingEntities taking out a removed entity), which shifts without the rehash. This
// is the map's keys alone, as fastutil 8 keeps them (Int2ObjectOpenHashMap.insert, removeEntry, shiftKeys, rehash,
// MapIterator.remove; HashCommon.mix, arraySize, maxFill).

const INT_PHI = 0x9E3779B9 | 0
const DEFAULT_INITIAL_SIZE = 16
const LOAD_FACTOR = Math.fround(0.75)

// HashCommon.mix(int)
function mix (x) {
  const h = Math.imul(x, INT_PHI)
  return h ^ (h >>> 16)
}

// HashCommon.nextPowerOfTwo(long)
function nextPowerOfTwo (x) {
  let n = 1
  while (n < x) n *= 2
  return n
}

// HashCommon.arraySize(expected, f): max(2, nextPowerOfTwo(ceil(expected / f)))
function arraySize (expected, f) {
  return Math.max(2, nextPowerOfTwo(Math.ceil(Math.fround(expected / f))))
}

// HashCommon.maxFill(n, f): min(ceil(n * f), n - 1)
function maxFill (n, f) {
  return Math.min(Math.ceil(Math.fround(n * f)), n - 1)
}

function createEntityTickOrder () {
  let n, mask, key, containsNullKey, size, fill, minN

  function reset () {
    n = arraySize(DEFAULT_INITIAL_SIZE, LOAD_FACTOR)
    minN = n
    mask = n - 1
    fill = maxFill(n, LOAD_FACTOR)
    key = new Int32Array(n + 1)
    containsNullKey = false
    size = 0
  }

  // the slot of the id, or -1 when the map does not hold it
  function find (k) {
    if (k === 0) return containsNullKey ? n : -1
    let pos = mix(k) & mask
    while (key[pos] !== 0) {
      if (key[pos] === k) return pos
      pos = (pos + 1) & mask
    }
    return -1
  }

  function rehash (newN) {
    const newMask = newN - 1
    const newKey = new Int32Array(newN + 1)
    let i = n
    for (let j = containsNullKey ? size - 1 : size; j-- !== 0;) {
      while (key[--i] === 0);
      let pos = mix(key[i]) & newMask
      if (newKey[pos] !== 0) while (newKey[pos = (pos + 1) & newMask] !== 0);
      newKey[pos] = key[i]
    }
    n = newN
    mask = newMask
    fill = maxFill(n, LOAD_FACTOR)
    key = newKey
  }

  function put (k) {
    k |= 0
    if (find(k) >= 0) return
    if (k === 0) {
      containsNullKey = true
    } else {
      let pos = mix(k) & mask
      while (key[pos] !== 0) pos = (pos + 1) & mask
      key[pos] = k
    }
    if (size++ >= fill) rehash(arraySize(size + 1, LOAD_FACTOR))
  }

  function shiftKeys (pos) {
    for (;;) {
      const last = pos
      pos = (last + 1) & mask
      let curr
      for (;;) {
        curr = key[pos]
        if (curr === 0) {
          key[last] = 0
          return
        }
        const slot = mix(curr) & mask
        if (last <= pos ? last >= slot || slot > pos : last >= slot && slot > pos) break
        pos = (pos + 1) & mask
      }
      key[last] = curr
    }
  }

  function remove (k) {
    k |= 0
    const pos = find(k)
    if (pos < 0) return
    if (pos === n) containsNullKey = false
    size--
    if (pos !== n) shiftKeys(pos)
    if (n > minN && size < Math.floor(fill / 4) && n > DEFAULT_INITIAL_SIZE) rehash(n / 2)
  }

  // MapIterator.remove: the shift, no rehash (the iterator's wrapped entries change the walk of that pass alone)
  function removeInTick (k) {
    k |= 0
    const pos = find(k)
    if (pos < 0) return
    if (pos === n) containsNullKey = false
    size--
    if (pos !== n) shiftKeys(pos)
  }

  // ClientLevel.addEntity / addPlayer -> addEntityPrivate: removeEntity(id), then put
  function add (k) {
    remove(k)
    put(k)
  }

  // the client ticks `id` before `other`: a higher slot (the null key's is n)
  function ticksBefore (id, other) {
    const slot = find(id | 0)
    const otherSlot = find(other | 0)
    return slot >= 0 && otherSlot >= 0 && slot > otherSlot
  }

  // the ids in the order tickEntities walks them: the null key, then the slots from the last down
  function ids () {
    const out = containsNullKey ? [0] : []
    for (let i = n; i-- !== 0;) if (key[i] !== 0) out.push(key[i])
    return out
  }

  reset()
  return { reset, add, remove, removeInTick, put, slotOf: k => find(k | 0), ticksBefore, ids, get size () { return size }, get slots () { return n } }
}

module.exports = { createEntityTickOrder }
