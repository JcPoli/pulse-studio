import { describe, expect, it } from 'vitest'
import { HISTORY_WEEKS, seedAttendance, statsFrom, toAttendance, weekBucket, type Attendance } from './history'
import { buildClasses, buildDays, isoDate } from './schedule'

const TODAY = new Date(2026, 8, 21, 9, 0) // Monday 21 Sep 2026
const ago = (days: number) => isoDate(buildDays(TODAY, 1, -days)[0])

const rec = (date: string, type: Attendance['type'] = 'hiit'): Attendance => ({
  id: `${date}_07:30_X`,
  date,
  type,
  name: 'X',
})

describe('weekBucket', () => {
  it('puts today and the six days behind it in the same bucket', () => {
    for (let d = 0; d <= 6; d++) expect(weekBucket(ago(d), TODAY)).toBe(0)
  })

  it('starts a new bucket every seven days back', () => {
    expect(weekBucket(ago(7), TODAY)).toBe(1)
    expect(weekBucket(ago(13), TODAY)).toBe(1)
    expect(weekBucket(ago(14), TODAY)).toBe(2)
  })

  it('uses rolling windows, not calendar weeks', () => {
    // A Saturday and the Monday after it are three days apart and belong together, even though
    // a calendar week would have split them — which is what used to break a training streak.
    const sat = ago(2)
    const mon = ago(0)
    expect(weekBucket(sat, TODAY)).toBe(weekBucket(mon, TODAY))
  })
})

describe('statsFrom', () => {
  it('reports nothing for an empty history without dividing by zero', () => {
    const s = statsFrom([], TODAY)
    expect(s.total).toBe(0)
    expect(s.thisMonth).toBe(0)
    expect(s.streakWeeks).toBe(0)
    expect(s.favourite).toBeNull()
    expect(s.weeks).toEqual(Array.from({ length: HISTORY_WEEKS }, () => 0))
  })

  it('counts the calendar month, not the last thirty days', () => {
    const s = statsFrom([rec('2026-09-01'), rec('2026-09-20'), rec('2026-08-31')], TODAY)
    expect(s.total).toBe(3)
    expect(s.thisMonth).toBe(2)
  })

  it('fills the week buckets oldest first', () => {
    const s = statsFrom([rec(ago(0)), rec(ago(1)), rec(ago(10))], TODAY)
    expect(s.weeks[HISTORY_WEEKS - 1]).toBe(2) // this week
    expect(s.weeks[HISTORY_WEEKS - 2]).toBe(1) // last week
  })

  it('ignores anything older than the strip reaches', () => {
    const s = statsFrom([rec(ago(HISTORY_WEEKS * 7 + 3))], TODAY)
    expect(s.total).toBe(1) // still counted as attended
    expect(s.weeks.every((n) => n === 0)).toBe(true) // but off the left of the chart
  })

  it('does not break a streak just because this week has not started yet', () => {
    // It is Monday morning. Nothing attended in the last seven days, three weeks before that.
    const s = statsFrom([rec(ago(8)), rec(ago(15)), rec(ago(22))], TODAY)
    expect(s.streakWeeks).toBe(3)
  })

  it('counts the current week when it has something in it', () => {
    const s = statsFrom([rec(ago(1)), rec(ago(8)), rec(ago(15))], TODAY)
    expect(s.streakWeeks).toBe(3)
  })

  it('ends the streak at the first missed week', () => {
    // This week and last week, then a gap, then two more: only the recent run counts.
    const s = statsFrom([rec(ago(1)), rec(ago(8)), rec(ago(22)), rec(ago(29))], TODAY)
    expect(s.streakWeeks).toBe(2)
  })

  it('takes the favourite from the most attended type', () => {
    const s = statsFrom([rec(ago(1), 'yoga'), rec(ago(2), 'yoga'), rec(ago(3), 'spin')], TODAY)
    expect(s.favourite).toBe('yoga')
  })
})

describe('seedAttendance', () => {
  const seeded = seedAttendance(TODAY)

  it('gives the demo a plausible past', () => {
    expect(seeded.length).toBeGreaterThan(10)
    expect(seeded.length).toBeLessThan(HISTORY_WEEKS * 7) // not one every day
  })

  it('is entirely in the past', () => {
    for (const a of seeded) expect(a.date < isoDate(TODAY)).toBe(true)
  })

  it('is sorted oldest first and unique', () => {
    for (let i = 1; i < seeded.length; i++) expect(seeded[i - 1].date <= seeded[i].date).toBe(true)
    expect(new Set(seeded.map((a) => a.id)).size).toBe(seeded.length)
  })

  it('is identical on every machine, because a demo must not vary', () => {
    expect(seedAttendance(TODAY)).toEqual(seeded)
  })

  it('produces a streak and a clear favourite rather than a three-way tie', () => {
    const s = statsFrom(seeded, TODAY)
    expect(s.streakWeeks).toBeGreaterThanOrEqual(4)
    expect(s.favourite).toBe('hiit')
  })
})

describe('toAttendance', () => {
  it('copies the facts out of the class rather than referencing it', () => {
    const c = buildClasses(buildDays(TODAY, 1))[0]
    expect(toAttendance(c)).toEqual({ id: c.id, date: c.date, type: c.type, name: c.name })
  })
})
