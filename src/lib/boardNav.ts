import type { StudioClass } from './schedule'

/**
 * Arrow-key movement across the board, kept out of the component for the same reason
 * `boardScale` is: it is a pure function of the grid, and inside a keydown handler it could
 * only ever be checked by hand.
 *
 * The grid passed in is the *reachable* one — one array per day column, in the order the board
 * draws them, holding only the classes that can actually take focus. A day with nothing left
 * is an empty column, not a missing one, so the columns stay aligned with the week.
 */
export const NAV_KEYS = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'] as const

export type NavKey = (typeof NAV_KEYS)[number]

export const isNavKey = (key: string): key is NavKey => (NAV_KEYS as readonly string[]).includes(key)

export interface Cell {
  col: number
  row: number
}

export function locate(grid: StudioClass[][], id: string): Cell | null {
  for (let col = 0; col < grid.length; col++) {
    const row = grid[col].findIndex((c) => c.id === id)
    if (row >= 0) return { col, row }
  }
  return null
}

/**
 * The class a key should move focus to, or null to leave focus where it is — at the top of a
 * column, at the edge of the week, or on a key press from a block that is no longer in the grid.
 * Movement deliberately does not wrap: in a calendar, running off Saturday into Sunday reads as
 * a glitch rather than as navigation.
 */
export function nextBlock(grid: StudioClass[][], id: string, key: NavKey): StudioClass | null {
  const at = locate(grid, id)
  if (!at) return null
  const column = grid[at.col]
  const here = column[at.row]

  if (key === 'ArrowUp') return column[at.row - 1] ?? null
  if (key === 'ArrowDown') return column[at.row + 1] ?? null
  if (key === 'Home') return column[0] ?? null
  if (key === 'End') return column[column.length - 1] ?? null

  // Sideways aims at the nearest class in time, not at the same row index: the days hold
  // different numbers of classes at different hours, so an index would drift down the board as
  // you crossed the week. A day with nothing reachable is stepped over, not landed on.
  const step = key === 'ArrowRight' ? 1 : -1
  for (let col = at.col + step; col >= 0 && col < grid.length; col += step) {
    const cs = grid[col]
    if (cs.length === 0) continue
    return cs.reduce((best, c) =>
      Math.abs(c.startMin - here.startMin) < Math.abs(best.startMin - here.startMin) ? c : best,
    )
  }
  return null
}
