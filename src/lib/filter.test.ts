import { describe, expect, it } from 'vitest'
import {
  EMPTY_FILTER,
  SLOTS,
  describeFilter,
  isEmptyFilter,
  matches,
  toggleIn,
  type ClassFilter,
} from './filter'
import { buildClasses, buildDays, type StudioClass } from './schedule'

const ANCHOR = new Date(2026, 8, 21, 5, 0) // Monday
const WEEK = buildClasses(buildDays(ANCHOR, 7))

const filter = (over: Partial<ClassFilter> = {}): ClassFilter => ({ ...EMPTY_FILTER, ...over })
const kept = (f: ClassFilter): StudioClass[] => WEEK.filter((c) => matches(c, f))

describe('isEmptyFilter', () => {
  it('treats every field empty as no opinion at all', () => {
    expect(isEmptyFilter(EMPTY_FILTER)).toBe(true)
    expect(isEmptyFilter(filter({ types: ['yoga'] }))).toBe(false)
    expect(isEmptyFilter(filter({ slots: ['lunch'] }))).toBe(false)
    expect(isEmptyFilter(filter({ coach: 'Maya' }))).toBe(false)
  })
})

describe('matches', () => {
  it('keeps the whole week when nothing is selected', () => {
    expect(kept(EMPTY_FILTER).length).toBe(WEEK.length)
    expect(WEEK.length).toBe(31)
  })

  it('ORs the values inside one field', () => {
    const yoga = kept(filter({ types: ['yoga'] })).length
    const pilates = kept(filter({ types: ['pilates'] })).length
    const both = kept(filter({ types: ['yoga', 'pilates'] })).length
    expect(yoga).toBeGreaterThan(0)
    expect(pilates).toBeGreaterThan(0)
    expect(both).toBe(yoga + pilates) // the old single-select filter could not ask this
  })

  it('ANDs across fields', () => {
    const f = filter({ types: ['yoga'], slots: ['morning'], coach: 'Maya' })
    const out = kept(f)
    expect(out.length).toBeGreaterThan(0)
    for (const c of out) {
      expect(c.type).toBe('yoga')
      expect(c.coach).toBe('Maya')
      expect(c.startMin).toBeLessThan(SLOTS.morning.toMin)
    }
  })

  it('returns nothing for a combination the studio does not run', () => {
    // Dance is Kiara's, always in the evening; asking for it at lunch is legitimately empty.
    expect(kept(filter({ types: ['dance'], slots: ['lunch'] }))).toEqual([])
  })

  it('splits the day into three slots that partition it exactly', () => {
    const morning = kept(filter({ slots: ['morning'] })).length
    const lunch = kept(filter({ slots: ['lunch'] })).length
    const evening = kept(filter({ slots: ['evening'] })).length
    expect(morning + lunch + evening).toBe(WEEK.length)
    for (const c of kept(filter({ slots: ['lunch'] }))) {
      expect(c.startMin).toBeGreaterThanOrEqual(SLOTS.lunch.fromMin)
      expect(c.startMin).toBeLessThan(SLOTS.lunch.toMin)
    }
  })

  it('puts no class near enough to a slot boundary to be ambiguous', () => {
    // The boundaries sit in the two dead stretches the board collapses, so nothing starts at
    // 11:45 or 16:05 where a reader would have to guess which chip covers it.
    for (const c of WEEK) {
      expect(c.startMin).not.toBe(SLOTS.lunch.fromMin - 15)
      expect(Math.abs(c.startMin - SLOTS.evening.fromMin)).toBeGreaterThan(30)
    }
  })

  it('filters by coach alone', () => {
    const out = kept(filter({ coach: 'Ines' }))
    expect(out.length).toBeGreaterThan(0)
    for (const c of out) expect(c.coach).toBe('Ines')
  })
})

describe('toggleIn', () => {
  it('adds what is missing and removes what is there', () => {
    expect(toggleIn<string>([], 'yoga')).toEqual(['yoga'])
    expect(toggleIn(['yoga'], 'hiit')).toEqual(['yoga', 'hiit'])
    expect(toggleIn(['yoga', 'hiit'], 'yoga')).toEqual(['hiit'])
    expect(toggleIn(['yoga'], 'yoga')).toEqual([])
  })

  it('does not mutate the list it was given', () => {
    const before = ['yoga']
    toggleIn(before, 'hiit')
    expect(before).toEqual(['yoga'])
  })
})

describe('describeFilter', () => {
  it('degrades to the plain word when nothing is selected', () => {
    expect(describeFilter(EMPTY_FILTER)).toBe('classes')
  })

  it('reads as a noun phrase around the word classes', () => {
    expect(describeFilter(filter({ types: ['yoga'] }))).toBe('Yoga classes')
    expect(describeFilter(filter({ slots: ['morning'], types: ['yoga'] }))).toBe('morning Yoga classes')
    expect(describeFilter(filter({ coach: 'Maya' }))).toBe('classes with Maya')
    expect(describeFilter(filter({ slots: ['morning'], types: ['yoga'], coach: 'Maya' }))).toBe(
      'morning Yoga classes with Maya',
    )
  })

  it('joins several values in a field with or', () => {
    expect(describeFilter(filter({ types: ['yoga', 'pilates'] }))).toBe('Yoga or Pilates classes')
    expect(describeFilter(filter({ slots: ['morning', 'lunch'] }))).toBe('morning or lunch classes')
  })
})
