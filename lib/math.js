exports.clamp = function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

exports.euclideanMod = function euclideanMod (numerator, denominator) {
  const result = numerator % denominator
  return result < 0 ? result + denominator : result
}

// Mth.sin / Mth.cos: a table of 65536 float sines, indexed by the angle times 65536 / (2 PI), cast to an integer whose
// low 16 bits pick the entry (the cosine's a quarter turn further). Before 1.21.11 the index is reckoned in float, from
// 1.21.11 in double.
let sinTable = null
function mthSinIndex (index) {
  if (sinTable === null) {
    sinTable = new Float32Array(65536)
    for (let i = 0; i < 65536; i++) sinTable[i] = Math.sin(i * Math.PI * 2 / 65536)
  }
  return sinTable[Math.trunc(index) & 65535]
}

exports.mthSin = function mthSin (radians, doubleIndex) {
  return mthSinIndex(doubleIndex ? radians * 10430.378350470453 : Math.fround(radians * Math.fround(10430.378)))
}

exports.mthCos = function mthCos (radians, doubleIndex) {
  return mthSinIndex(doubleIndex
    ? radians * 10430.378350470453 + 16384
    : Math.fround(Math.fround(radians * Math.fround(10430.378)) + 16384))
}
