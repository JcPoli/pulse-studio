import { describe, expect, it } from 'vitest'
import { buildClasses, buildDays, endOf, isoDate, overlaps, type StudioClass } from './schedule'

/** Monday 21 Sep 2026, 05:00 local — before the first class of the day. */
const ANCHOR = new Date(2026, 8, 21, 5, 0)
const ALL = buildClasses(buildDays(ANCHOR, 28))

const at = (date: string, time: string): StudioClass => {
  const c = ALL.find((x) => x.date === date && x.time === time)
  if (!c) throw new Error(`no class at ${date} ${time}`)
  return c
}

describe('endOf', () => {
  it('derives the end from the duration', () => {
    const c = at('2026-09-21', '06:30') // Sunrise Flow, 60 min
    expect(endOf(c).getHours()).toBe(7)
    expect(endOf(c).getMinutes()).toBe(30)
  })
})

describe('overlaps', () => {
  const sunrise = at('2026-09-21', '06:30') // 60 min, so it ends at 07:30
  const hiit = at('2026-09-21', '07:30') // and this one starts exactly then

  it('does not treat back-to-back classes as a clash', () => {
    expect(endOf(sunrise).getTime()).toBe(hiit.when.getTime())
    expect(overlaps(sunrise, hiit)).toBe(false)
    expect(overlaps(hiit, sunrise)).toBe(false)
  })

  it('catches a real overlap from either side', () => {
    const shifted = { ...hiit, id: 'x', when: new Date(hiit.when.getTime() - 15 * 60_000) }
    expect(overlaps(sunrise, shifted)).toBe(true)
    expect(overlaps(shifted, sunrise)).toBe(true)
  })

  it('catches a class contained entirely within another', () => {
    const inner = { ...sunrise, id: 'y', mins: 10, when: new Date(sunrise.when.getTime() + 10 * 60_000) }
    expect(overlaps(sunrise, inner)).toBe(true)
    expect(overlaps(inner, sunrise)).toBe(true)
  })

  it('finds no clash anywhere in the shipped template', () => {
    // Documents why the booking clash guard cannot fire today: every day runs its classes
    // strictly in sequence. Making it reachable means parallel slots, which also means laying
    // overlapping blocks out side by side in a column — something the board does not do yet.
    let pairs = 0
    for (const a of ALL) for (const b of ALL) if (a.id < b.id && overlaps(a, b)) pairs++
    expect(pairs).toBe(0)
  })
})

describe('isoDate', () => {
  it('reads local date parts, never a UTC shift', () => {
    // 23:30 local on the 21st is already the 22nd in UTC east of Greenwich, and 00:15 is still
    // the 20th west of it. The board keys off the local day in both directions.
    expect(isoDate(new Date(2026, 8, 21, 23, 30))).toBe('2026-09-21')
    expect(isoDate(new Date(2026, 8, 21, 0, 15))).toBe('2026-09-21')
  })
})
