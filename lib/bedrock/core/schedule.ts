import type { Gate, TickContext } from './types.ts'

/**
 * The vanilla client's systems the bot's systems are placed at, by their position in its tick (measured on 1.26.51,
 * and in the same order on the builds before).
 */
const ANCHORS = Object.freeze({
  LocalPlayerRewindSystem: 0,
  ClientInputUpdateSystem: 145,
  PredictedMovementSystem: 228,
  ActorLegacyTickSystem: 230,
  SendPlayerInputPacketSystem: 453,
  HitResultSystem: 485,
  MolangUpdateSystem: 493
})

export type Anchor = keyof typeof ANCHORS

type NextTo = { readonly after: string } | { readonly before: string }

export type Placement = { readonly at: Anchor } | NextTo

export interface SystemDecl {
  readonly name: string
  readonly place: Placement
  readonly gate: Gate
  /** run again when a rewind replays a past tick */
  readonly replay: boolean
  readonly run: (ctx: TickContext) => void
}

interface AnchoredSystem extends SystemDecl { readonly place: { readonly at: Anchor } }
interface NextToSystem extends SystemDecl { readonly place: NextTo }

function isAnchored (system: SystemDecl): system is AnchoredSystem {
  return 'at' in system.place
}

function isNextTo (system: SystemDecl): system is NextToSystem {
  return !('at' in system.place)
}

function neighbourOf (system: NextToSystem): { side: 'after' | 'before', name: string } {
  return 'after' in system.place ? { side: 'after', name: system.place.after } : { side: 'before', name: system.place.before }
}

/** The tick's systems in order. Two systems at one point, or next to a system that is not there, throw. */
export function resolveSchedule (systems: readonly SystemDecl[]): readonly SystemDecl[] {
  const names = new Set<string>()
  for (const system of systems) {
    if (names.has(system.name)) throw new Error(`two systems are named ${system.name}`)
    names.add(system.name)
  }
  const anchored: AnchoredSystem[] = []
  for (const system of systems.filter(isAnchored)) {
    const taken = anchored.find(other => other.place.at === system.place.at)
    if (taken !== undefined) throw new Error(`${taken.name} and ${system.name} are both at ${system.place.at}`)
    anchored.push(system)
  }
  const order: SystemDecl[] = anchored.sort((a, b) => ANCHORS[a.place.at] - ANCHORS[b.place.at])
  const placed: NextToSystem[] = []
  let unplaced = systems.filter(isNextTo)
  while (unplaced.length > 0) {
    const placeable = unplaced.filter(system => order.some(other => other.name === neighbourOf(system).name))
    if (placeable.length === 0) {
      throw new Error(`no system to place ${unplaced.map(system => `${system.name} ${neighbourOf(system).side} ${neighbourOf(system).name}`).join(', ')}`)
    }
    for (const system of placeable) {
      const { side, name } = neighbourOf(system)
      const twin = placed.find(other => neighbourOf(other).side === side && neighbourOf(other).name === name)
      if (twin !== undefined) throw new Error(`${twin.name} and ${system.name} are both ${side} ${name}`)
      const index = order.findIndex(other => other.name === name)
      order.splice(side === 'after' ? index + 1 : index, 0, system)
      placed.push(system)
    }
    unplaced = unplaced.filter(system => !placeable.includes(system))
  }
  return Object.freeze(order)
}
