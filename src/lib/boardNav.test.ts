import { describe, expect, it } from 'vitest'
import { NAV_KEYS, isNavKey, locate, nextBlock } from './boardNav'
import { buildClasses, buildDays, isPast, isoDate, type StudioClass } from './schedule'

const ANCHOR = new Date(2026, 8, 21, 5, 0) // Monday, before the first class of the day
const ALL = buildClasses(buildDays(ANCHOR, 28))
const WEEK = buildDays(ANCHOR, 7)

/** Exactly what Board hands the keys: one column per day, reachable classes only. */
const GRID: StudioClass[][] = WEEK.map((d) => ALL.filter((c) => c.date === isoDate(d) && !isPast(c, ANCHOR)))
const times = (cs: StudioClass[]) => cs.map((c) => c.time).join(' ')

describe('isNavKey', () => {
  it('claims exactly the six keys the board handles', () => {
    for (const k of NAV_KEYS) expect(isNavKey(k)).toBe(true)
    for (const k of ['Enter', ' ', 'Tab', 'Escape', 'a', 'PageDown']) expect(isNavKey(k)).toBe(false)
  })
})

describe('locate', () => {
  it('finds a block, and nothing for a stranger', () => {
    expect(locate(GRID, GRID[0][1].id)).toEqual({ col: 0, row: 1 })
    expect(locate(GRID, 'not-a-class')).toBeNull()
  })
})

describe('nextBlock', () => {
  it('ignores a key press from a block that is not in the grid', () => {
    expect(nextBlock(GRID, 'not-a-class', 'ArrowDown')).toBeNull()
  })

  it('steps down and back up through one day in time order', () => {
    const col = GRID[0]
    for (let i = 0; i < col.length - 1; i++) {
      expect(col[i].startMin).toBeLessThan(col[i + 1].startMin)
      expect(nextBlock(GRID, col[i].id, 'ArrowDown')?.id).toBe(col[i + 1].id)
      expect(nextBlock(GRID, col[i + 1].id, 'ArrowUp')?.id).toBe(col[i].id)
    }
  })

  it('does not wrap at either end of a day', () => {
    const col = GRID[0]
    expect(nextBlock(GRID, col[0].id, 'ArrowUp')).toBeNull()
    expect(nextBlock(GRID, col[col.length - 1].id, 'ArrowDown')).toBeNull()
  })

  it('sends Home and End to the ends of the same day', () => {
    const col = GRID[3]
    expect(nextBlock(GRID, col[2].id, 'Home')?.id).toBe(col[0].id)
    expect(nextBlock(GRID, col[2].id, 'End')?.id).toBe(col[col.length - 1].id)
  })

  it('lands sideways on the nearest class in time, where a row index would have missed', () => {
    // Saturday holds four classes and Sunday two, so row three does not exist to move onto.
    expect(times(GRID[5])).toBe('08:00 09:30 10:45 12:00')
    expect(times(GRID[6])).toBe('09:00 10:30')
    const noon = GRID[5][3]
    expect(locate(GRID, noon.id)?.row).toBe(3)
    expect(nextBlock(GRID, noon.id, 'ArrowRight')?.time).toBe('10:30') // 90 minutes away, not 180
    expect(nextBlock(GRID, GRID[6][1].id, 'ArrowLeft')?.time).toBe('10:45') // 15 minutes away, not 60
  })

  it('does not wrap at either edge of the week', () => {
    expect(nextBlock(GRID, GRID[6][0].id, 'ArrowRight')).toBeNull()
    expect(nextBlock(GRID, GRID[0][0].id, 'ArrowLeft')).toBeNull()
  })

  it('steps over a day with nothing reachable rather than swallowing the key', () => {
    const sparse = [GRID[0], [], GRID[2]]
    const target = nextBlock(sparse, GRID[0][1].id, 'ArrowRight')
    expect(target).not.toBeNull()
    expect(locate(sparse, target!.id)?.col).toBe(2)
  })

  it('breaks a tie towards the earlier class', () => {
    const base = GRID[0][0]
    const pin = { ...base, id: 'pin', startMin: 600 } // 10:00
    const early = { ...base, id: 'early', startMin: 540 } // 09:00, an hour before
    const late = { ...base, id: 'late', startMin: 660 } // 11:00, an hour after
    expect(nextBlock([[pin], [early, late]], 'pin', 'ArrowRight')?.id).toBe('early')
  })

  it('never hands back a class that has already started', () => {
    for (const col of GRID) for (const c of col) expect(isPast(c, ANCHOR)).toBe(false)
    for (const col of GRID)
      for (const c of col)
        for (const k of NAV_KEYS) {
          const t = nextBlock(GRID, c.id, k)
          if (t) expect(isPast(t, ANCHOR)).toBe(false)
        }
  })

  it('reaches every block in the week from the first one, arrow keys alone', () => {
    // The strongest test here. A day left unreachable, or a class quietly skipped by the
    // nearest-in-time rule, shows up in this walk and in none of the others.
    const start = GRID.find((c) => c.length > 0)?.[0]
    expect(start).toBeDefined()
    const seen = new Set([start!.id])
    const queue = [start!]
    while (queue.length > 0) {
      const cur = queue.shift()!
      for (const k of NAV_KEYS) {
        const t = nextBlock(GRID, cur.id, k)
        if (t && !seen.has(t.id)) {
          seen.add(t.id)
          queue.push(t)
        }
      }
    }
    expect(seen.size).toBe(GRID.flat().length)
  })
})
