import { BOARD_END_HOUR, BOARD_START_HOUR, COLLAPSED_PX, HOUR_PX, MIN_COLLAPSE_HOURS } from '../data/catalog'
import type { StudioClass } from './schedule'

export type BoardRow =
  | { kind: 'hour'; hour: number; y: number; h: number }
  | { kind: 'gap'; fromHour: number; toHour: number; y: number; h: number }

export type GapRow = Extract<BoardRow, { kind: 'gap' }>

export interface BoardScale {
  rows: BoardRow[]
  gaps: GapRow[]
  height: number
  startMin: number
  endMin: number
  /** Minutes since midnight → pixels from the top of a column body. */
  yOf: (minute: number) => number
  /** True inside a collapsed band, where a now-line would point at nothing. */
  inGap: (minute: number) => boolean
  /** Hour rules as one gradient, since the rows are no longer evenly spaced. */
  background: string
}

/**
 * The board used to be a fixed 06:00–21:00 grid, which left a fifth of its height empty —
 * this studio has no classes at all between 14:00 and 17:00. The scale instead starts and
 * ends on the week's real first and last class, and squeezes any run of empty hours down to
 * a thin marker band, so the minute → pixel mapping is piecewise rather than linear.
 *
 * Built from the week's UNFILTERED classes on purpose: the board keeps its shape when you
 * change the type filter instead of reflowing under you.
 */
export function buildScale(weekClasses: StudioClass[]): BoardScale {
  let startHour = BOARD_START_HOUR
  let endHour = BOARD_END_HOUR
  const busy = new Set<number>()

  if (weekClasses.length > 0) {
    let first = Infinity
    let last = -Infinity
    for (const c of weekClasses) {
      const end = c.startMin + c.mins
      if (c.startMin < first) first = c.startMin
      if (end > last) last = end
      for (let h = Math.floor(c.startMin / 60); h < Math.ceil(end / 60); h++) busy.add(h)
    }
    startHour = Math.floor(first / 60)
    endHour = Math.ceil(last / 60)
  } else {
    for (let h = startHour; h < endHour; h++) busy.add(h)
  }

  // Group the hours into runs of busy / empty, collapsing only long-enough empty runs.
  const rows: BoardRow[] = []
  let y = 0
  let h = startHour
  while (h < endHour) {
    if (busy.has(h)) {
      rows.push({ kind: 'hour', hour: h, y, h: HOUR_PX })
      y += HOUR_PX
      h++
      continue
    }
    let run = h
    while (run < endHour && !busy.has(run)) run++
    if (run - h >= MIN_COLLAPSE_HOURS) {
      rows.push({ kind: 'gap', fromHour: h, toHour: run, y, h: COLLAPSED_PX })
      y += COLLAPSED_PX
    } else {
      for (let k = h; k < run; k++) {
        rows.push({ kind: 'hour', hour: k, y, h: HOUR_PX })
        y += HOUR_PX
      }
    }
    h = run
  }

  const height = y

  const yOf = (minute: number): number => {
    if (minute <= startHour * 60) return 0
    if (minute >= endHour * 60) return height
    for (const row of rows) {
      const from = row.kind === 'hour' ? row.hour * 60 : row.fromHour * 60
      const to = row.kind === 'hour' ? (row.hour + 1) * 60 : row.toHour * 60
      if (minute < to) {
        // A collapsed band never contains a class, so only the hour case interpolates.
        return row.kind === 'hour' ? row.y + ((minute - from) / 60) * row.h : row.y
      }
    }
    return height
  }

  const gaps = rows.filter((r): r is GapRow => r.kind === 'gap')
  const inGap = (minute: number): boolean =>
    gaps.some((g) => minute >= g.fromHour * 60 && minute < g.toHour * 60)

  const stops = rows
    .map((r) => `transparent ${r.y}px, var(--line-2) ${r.y}px, var(--line-2) ${r.y + 1}px, transparent ${r.y + 1}px`)
    .join(', ')

  return {
    rows,
    gaps,
    height,
    startMin: startHour * 60,
    endMin: endHour * 60,
    yOf,
    inGap,
    background: `linear-gradient(to bottom, ${stops})`,
  }
}
