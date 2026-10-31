import type { FrameContext } from '../core/types.ts'
import { defaultAccepts } from '../modules/clicks.ts'
import type { WindowClick } from '../modules/clicks.ts'
import type { Draft, Move } from '../modules/inventory.ts'
import { sameItem } from '../modules/items.ts'
import type { SlotRef, Stack } from '../modules/items.ts'
import { CURSOR, OUTPUT } from '../modules/screens.ts'
import type { OpenScreen } from '../modules/screens.ts'
import type { BedrockBotInternal } from '../../types/bedrock-internal.ts'

/** Java's mode 5 buttons: the left button's start, slot and end, then the right's */
const LEFT_BUTTONS: readonly number[] = Object.freeze([0, 1, 2])
const RIGHT_BUTTONS: readonly number[] = Object.freeze([4, 5, 6])

interface Cell {
  readonly ref: SlotRef
  /** what the drag put in it */
  count: number
}

interface Drag {
  readonly screen: OpenScreen
  readonly right: boolean
  /** the cursor's stack at the start: none drags nothing */
  readonly stack: Stack | undefined
  readonly cells: Cell[]
}

function place (count: number, from: SlotRef, to: SlotRef): Move {
  return { type: 'place', count, from, to }
}

/** each cell holds what the drag put in it and the cursor the rest: anything else (another click, a refusal) ended the drag, as Java's server ends it */
function intact (stack: Stack, cells: readonly Cell[], stackAt: (ref: SlotRef) => Stack | undefined): boolean {
  const holds = (ref: SlotRef, count: number): boolean => {
    const held = stackAt(ref)
    return count === 0 ? held === undefined : held !== undefined && sameItem(held, stack) && held.count === count
  }
  return holds(CURSOR, stack.count - cells.reduce((sum, cell) => sum + cell.count, 0)) && cells.every(({ ref, count }) => holds(ref, count))
}

/** what each cell holds once `cell` is added: a left drag shares the stack evenly, a right one places one while the cursor has any */
function shareOf (right: boolean, stack: Stack, cells: readonly Cell[]): number {
  if (right) return stack.count > cells.length ? 1 : 0
  return Math.floor(stack.count / (cells.length + 1))
}

/**
 * A left drag shares the stack evenly, as the vanilla client does at each cell: the cells' excess goes to the new one,
 * the rest to the cursor, then the cursor makes up what the new one still needs. The second cell first takes back the
 * first's stack and puts it back, as recorded.
 */
function leftMoves (stack: Stack, cells: readonly Cell[], cell: SlotRef, share: number): Move[] {
  const [first] = cells
  if (first === undefined) return [place(share, CURSOR, cell)]
  const moves = cells.length === 1 ? [place(stack.count, first.ref, CURSOR), place(stack.count, CURSOR, first.ref)] : []
  let need = share
  for (const { ref, count } of cells) {
    const excess = count - share
    const given = Math.min(excess, need)
    if (given > 0) moves.push(place(given, ref, cell))
    if (excess > given) moves.push(place(excess - given, ref, CURSOR))
    need -= given
  }
  if (need > 0) moves.push(place(need, CURSOR, cell))
  return moves
}

/** Java's double click: the stacks of the cursor's item, partial ones first, in the window's order, until the cursor holds a stack; never an output */
function gatherMoves (view: readonly SlotRef[], cursor: Stack, draft: Draft): Move[] {
  const sources = view.flatMap(from => {
    const stack = from.container === OUTPUT.container ? undefined : draft.stackAt(from)
    return stack !== undefined && sameItem(stack, cursor) ? [{ from, stack, full: stack.count >= draft.stackSize(stack) }] : []
  })
  const moves: Move[] = []
  let need = draft.stackSize(cursor) - cursor.count
  for (const { from, stack } of [...sources.filter(({ full }) => !full), ...sources.filter(({ full }) => full)]) {
    if (need === 0) break
    const count = Math.min(need, stack.count)
    moves.push({ type: 'take', count, from, to: CURSOR })
    need -= count
  }
  return moves
}

/** clickWindow's modes 5 (drags) and 6 (double clicks), as the vanilla client makes them: each move a request, in one packet */
export default function drags (bot: BedrockBotInternal): void {
  const inventory = bot._inventory
  const core = bot._core
  let drag: Drag | undefined

  async function request (ctx: FrameContext, moves: readonly Move[]): Promise<void> {
    await Promise.all(moves.map(async move => { await inventory.request(core, ctx, [move]) }))
  }

  /** a cell the drag can fill: empty (so not one of its cells), taking the item (not an output, nor an armor slot it is not worn in) */
  function fills (stack: Stack, cell: SlotRef, draft: Draft): boolean {
    if (cell.container === OUTPUT.container || draft.stackAt(cell) !== undefined) return false
    return draft.accepts(cell, stack) ?? defaultAccepts(cell, stack, draft)
  }

  /** a drag ended by anything but its end: its bracket stops all the same, so that it never stays held */
  function discard (): void {
    drag = undefined
    inventory.releaseCursorDrag()
  }

  /** each slot added moves the items at once, as the vanilla client does, not at the end as Java's server */
  async function dragClick (ctx: FrameContext, { mouseButton }: WindowClick, screen: OpenScreen, clicked: SlotRef | undefined): Promise<void> {
    const right = RIGHT_BUTTONS.includes(mouseButton)
    const stage = (right ? RIGHT_BUTTONS : LEFT_BUTTONS).indexOf(mouseButton)
    const draft = inventory.draft()
    if (stage !== 1) {
      inventory.releaseCursorDrag()
      drag = stage === 0 ? { screen, right, stack: draft.stackAt(CURSOR), cells: [] } : undefined
      return
    }
    const stack = drag?.stack
    if (drag === undefined || stack === undefined || drag.screen !== screen || drag.right !== right || !intact(stack, drag.cells, ref => draft.stackAt(ref))) {
      discard()
      return
    }
    const { cells } = drag
    const share = shareOf(right, stack, cells)
    if (clicked === undefined || share === 0 || !fills(stack, clicked, draft)) return
    const moves = right ? [place(1, CURSOR, clicked)] : leftMoves(stack, cells, clicked, share)
    for (const cell of cells) cell.count = share
    cells.push({ ref: clicked, count: share })
    inventory.holdCursorDrag(ctx)
    await request(ctx, moves)
  }

  /** after the click that took the stack: its slot is empty, as Java's server wants it */
  async function doubleClick (ctx: FrameContext, _click: WindowClick, screen: OpenScreen, clicked: SlotRef | undefined): Promise<void> {
    // another click ends a drag, as Java's server ends it
    discard()
    const draft = inventory.draft()
    const cursor = draft.stackAt(CURSOR)
    if (clicked === undefined || cursor === undefined || draft.stackAt(clicked) !== undefined) return
    await request(ctx, gatherMoves(screen.view, cursor, draft))
  }

  inventory.addClickMode(5, { buttons: [...LEFT_BUTTONS, ...RIGHT_BUTTONS], click: dragClick })
  inventory.addClickMode(6, { buttons: [0], click: doubleClick })
}
