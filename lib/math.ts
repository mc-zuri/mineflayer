export function clamp (min, x, max) {
  return Math.max(min, Math.min(x, max))
}

export function euclideanMod (numerator, denominator) {
  const result = numerator % denominator
  return result < 0 ? result + denominator : result
}
