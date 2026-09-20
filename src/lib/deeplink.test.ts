import { describe, expect, it } from 'vitest'
import { HOME, TAB_KEYS, buildSearch, locationHref, parseLocation, type BoardLocation } from './deeplink'
import { buildClasses, buildDays } from './schedule'

const MAX = 3 // MAX_WEEK_OFFSET for a 28-day horizon
const parse = (search: string) => parseLocation(search, MAX)

describe('parseLocation', () => {
  it('reads a whole location', () => {
    expect(parse('?tab=mine&w=2&c=2026-09-24_07:30_HIIT-45')).toEqual({
      tab: 'mine',
      weekOffset: 2,
      classId: '2026-09-24_07:30_HIIT-45',
    })
  })

  it('lands on the schedule for a bare URL', () => {
    expect(parse('')).toEqual(HOME)
    expect(parse('?')).toEqual(HOME)
  })

  it('accepts every tab it advertises', () => {
    for (const tab of TAB_KEYS) expect(parse(`?tab=${tab}`).tab).toBe(tab)
  })

  it('falls back rather than throwing on anything it does not recognise', () => {
    // These arrive from a stranger's link, so a bad one has to land somewhere sensible.
    expect(parse('?tab=admin').tab).toBe('schedule')
    expect(parse('?w=banana').weekOffset).toBe(0)
    expect(parse('?w=').weekOffset).toBe(0)
    expect(parse('?c=').classId).toBeNull()
  })

  it('clamps the week into the horizon instead of showing an empty board', () => {
    expect(parse('?w=99').weekOffset).toBe(MAX)
    expect(parse('?w=-4').weekOffset).toBe(0)
    expect(parse('?w=2.7').weekOffset).toBe(2) // parseInt stops at the dot
  })

  it('rejects a class id that is not shaped like one', () => {
    // The id becomes part of a DOM query selector once the board moves focus to the block, so
    // a hand-edited link must not be able to put arbitrary text there.
    expect(parse('?c=../../etc/passwd').classId).toBeNull()
    expect(parse('?c=%22%5D%2C%5Bonerror%3D1').classId).toBeNull()
    expect(parse('?c=2026-09-24').classId).toBeNull()
    expect(parse('?c=2026-9-24_07:30_HIIT-45').classId).toBeNull()
  })

  it('accepts the ids the schedule actually generates', () => {
    for (const c of buildClasses(buildDays(new Date(2026, 8, 21), 28))) {
      expect(parse(`?c=${c.id}`).classId).toBe(c.id)
    }
  })
})

describe('buildSearch', () => {
  it('leaves the default location as a bare path', () => {
    expect(buildSearch(HOME)).toBe('')
    expect(locationHref(HOME, '/pulse-studio/')).toBe('/pulse-studio/')
  })

  it('omits each field that is already the default', () => {
    expect(buildSearch({ ...HOME, weekOffset: 2 })).toBe('?w=2')
    expect(buildSearch({ ...HOME, tab: 'membership' })).toBe('?tab=membership')
  })

  it('encodes the class id so the colon survives the round trip', () => {
    const id = '2026-09-24_07:30_HIIT-45'
    const search = buildSearch({ ...HOME, classId: id })
    expect(search).toContain('%3A') // URLSearchParams escapes the colon
    expect(parse(search).classId).toBe(id)
  })

  it('round-trips every location the app can be in', () => {
    const ids = ['2026-09-21_06:30_Sunrise-Flow', '2026-09-26_09:30_HIIT-45']
    for (const tab of TAB_KEYS) {
      for (let w = 0; w <= MAX; w++) {
        for (const classId of [null, ...ids]) {
          const loc: BoardLocation = { tab, weekOffset: w, classId }
          expect(parse(buildSearch(loc))).toEqual(loc)
        }
      }
    }
  })
})
