export function clamp (min: number, x: number, max: number): number {
  return Math.max(min, Math.min(x, max))
}

export function euclideanMod (numerator: number, denominator: number): number {
  const result = numerator % denominator
  return result < 0 ? result + denominator : result
}
