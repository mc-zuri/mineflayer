// Vanilla's Mth.sin / Mth.cos: a 65536-entry float table, and the view vector the client builds with it
// (Entity.calculateViewVector), which every pick of what is under the crosshair starts from.
//
// Before 1.21.11 the table holds sin(i * 2PI / 65536) and the argument is a float scaled by 10430.378F in float
// arithmetic. Since 1.21.11 the table holds sin(i / 10430.378350470453) and the argument is a double scaled by that
// constant and truncated as a long. Math.sin builds both tables bit for bit like Java's (each entry rounded to a float).
const f32 = Math.fround

const SIN_SCALE_F = f32(10430.378)
const SIN_SCALE = 10430.378350470453
const DEG_TO_RAD_F = f32(0.017453292)
const PI_F = f32(Math.PI)

let legacyTable = null
let modernTable = null

function legacy () {
  if (!legacyTable) {
    legacyTable = new Float32Array(65536)
    for (let i = 0; i < 65536; i++) legacyTable[i] = Math.sin((i * Math.PI * 2) / 65536)
  }
  return legacyTable
}

function modern () {
  if (!modernTable) {
    modernTable = new Float32Array(65536)
    for (let i = 0; i < 65536; i++) modernTable[i] = Math.sin(i / SIN_SCALE)
  }
  return modernTable
}

// Java's (int) of a float: toward zero, NaN to 0, saturating at the int range
function javaInt (value) {
  if (Number.isNaN(value)) return 0
  if (value >= 2147483647) return 2147483647
  if (value <= -2147483648) return -2147483648
  return Math.trunc(value)
}

// the low 16 bits of Java's (long) of a double
function javaLongLow16 (value) {
  if (Number.isNaN(value)) return 0
  if (value >= 2 ** 63) return 65535
  if (value < -(2 ** 63)) return 0
  return Math.trunc(value) & 65535
}

const legacyMth = {
  sin: radians => legacy()[javaInt(f32(f32(radians) * SIN_SCALE_F)) & 65535],
  cos: radians => legacy()[javaInt(f32(f32(f32(radians) * SIN_SCALE_F) + 16384)) & 65535]
}

const modernMth = {
  sin: radians => modern()[javaLongLow16(radians * SIN_SCALE)],
  cos: radians => modern()[javaLongLow16(radians * SIN_SCALE + 16384)]
}

// The Mth of a version (a registry's version object)
function mthFor (version) {
  return version['>=']('1.21.11') ? modernMth : legacyMth
}

// The unit vector the player looks along, from its float rotation in degrees (xRot: pitch, yRot: yaw), as
// Entity.calculateViewVector (1.13+) or Entity.getVectorForRotation (before) builds it: float arithmetic, Mth's table.
function viewVector (version, xRot, yRot) {
  const mth = mthFor(version)
  xRot = f32(xRot)
  yRot = f32(yRot)
  if (version['<']('1.13')) {
    const yr = f32(f32(-yRot * DEG_TO_RAD_F) - PI_F)
    const xr = f32(-xRot * DEG_TO_RAD_F)
    const yCos = mth.cos(yr)
    const ySin = mth.sin(yr)
    const xCos = -mth.cos(xr)
    const xSin = mth.sin(xr)
    return { x: f32(ySin * xCos), y: xSin, z: f32(yCos * xCos) }
  }
  const realXRot = f32(xRot * DEG_TO_RAD_F)
  const realYRot = f32(-yRot * DEG_TO_RAD_F)
  const yCos = mth.cos(realYRot)
  const ySin = mth.sin(realYRot)
  const xCos = mth.cos(realXRot)
  const xSin = mth.sin(realXRot)
  // (-xSin of a float 0 is -0, as Java's)
  return { x: f32(ySin * xCos), y: -xSin, z: f32(yCos * xCos) }
}

module.exports = { mthFor, viewVector }
