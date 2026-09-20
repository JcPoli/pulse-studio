import { describe, expect, it } from 'vitest'
import { ALTERNATIVES_LIMIT, alternativesFor, clashWith } from './booking'
import { buildClasses, buildDays, isFull, isPast, type StudioClass } from './schedule'
import { reducer, type BookingState } from '../hooks/useBooking'

const ANCHOR = new Date(2026, 8, 21, 5, 0) // Monday, before the first class of the day
const ALL = buildClasses(buildDays(ANCHOR, 28))

const at = (date: string, time: string): StudioClass => {
  const c = ALL.find((x) => x.date === date && x.time === time)
  if (!c) throw new Error(`no class at ${date} ${time}`)
  return c
}

const THU_HIIT = at('2026-09-24', '07:30')
const SAT_HIIT = at('2026-09-26', '09:30')

describe('clashWith', () => {
  const sunrise = at('2026-09-21', '06:30') // ends exactly when the next class starts
  const hiit = at('2026-09-21', '07:30')

  it('leaves back-to-back bookings alone', () => {
    expect(clashWith([sunrise], hiit)).toBeUndefined()
  })

  it('does not report a class as clashing with itself', () => {
    expect(clashWith([hiit], hiit)).toBeUndefined()
  })

  it('names the held class that collides', () => {
    const shifted = { ...hiit, id: 'shifted', when: new Date(hiit.when.getTime() - 15 * 60_000) }
    expect(clashWith([sunrise], shifted)?.id).toBe(sunrise.id)
  })

  it('excludes the slot being vacated, which is what lets a move happen at all', () => {
    const overlapping = { ...THU_HIIT, id: 'overlapping', when: new Date(THU_HIIT.when.getTime() + 10 * 60_000) }
    expect(clashWith([THU_HIIT], overlapping)?.id).toBe(THU_HIIT.id)
    expect(clashWith([THU_HIIT], overlapping, THU_HIIT.id)).toBeUndefined()
  })
})

describe('alternativesFor', () => {
  const held = [THU_HIIT]
  const alts = alternativesFor(ALL, THU_HIIT, held, ANCHOR)

  it('offers other sittings of the same class', () => {
    expect(alts.length).toBeGreaterThan(0)
    for (const a of alts) {
      expect(a.name).toBe(THU_HIIT.name)
      expect(a.id).not.toBe(THU_HIIT.id)
    }
  })

  it('never offers one that is full, past, or already held', () => {
    for (const a of alts) {
      expect(isFull(a)).toBe(false)
      expect(isPast(a, ANCHOR)).toBe(false)
      expect(held.some((h) => h.id === a.id)).toBe(false)
    }
  })

  it('keeps them in chronological order', () => {
    for (let i = 1; i < alts.length; i++) {
      expect(alts[i - 1].when.getTime()).toBeLessThanOrEqual(alts[i].when.getTime())
    }
  })

  it('caps the list so the picker still fits in a phone sheet', () => {
    expect(alts.length).toBeLessThanOrEqual(ALTERNATIVES_LIMIT)
    expect(alternativesFor(ALL, THU_HIIT, held, ANCHOR, 2).length).toBe(2)
  })

  it('drops a sitting that would collide with something else the member holds', () => {
    const target = alts[0]
    const blocker = { ...target, id: 'blocker' } // same slot, a different booking
    const withBlocker = alternativesFor(ALL, THU_HIIT, [...held, blocker], ANCHOR)
    expect(withBlocker.some((a) => a.id === target.id)).toBe(false)
  })

  it('returns nothing for a class that never repeats', () => {
    const lonely = { ...THU_HIIT, name: 'One Off Workshop' }
    expect(alternativesFor(ALL, lonely, [], ANCHOR)).toEqual([])
  })
})

describe('reducer: reschedule', () => {
  const base: BookingState = {
    credits: 6,
    taken: { [THU_HIIT.id]: 1 },
    booked: { [THU_HIIT.id]: true },
    waitlist: {},
  }
  const moved = reducer(base, { type: 'reschedule', from: THU_HIIT.id, to: SAT_HIIT.id })

  it('moves the seat', () => {
    expect(moved.booked[THU_HIIT.id]).toBeUndefined()
    expect(moved.booked[SAT_HIIT.id]).toBe(true)
  })

  it('leaves credits alone, because one seat changed hands', () => {
    expect(moved.credits).toBe(base.credits)
  })

  it('applies the capacity deltas on both sides', () => {
    expect(moved.taken[THU_HIIT.id]).toBe(0)
    expect(moved.taken[SAT_HIIT.id]).toBe(1)
  })

  it('is undone exactly by the same move backwards', () => {
    const back = reducer(moved, { type: 'reschedule', from: SAT_HIIT.id, to: THU_HIIT.id })
    expect(back.booked).toEqual(base.booked)
    expect(back.credits).toBe(base.credits)
    expect(back.taken[THU_HIIT.id]).toBe(1)
    expect(back.taken[SAT_HIIT.id]).toBe(0)
  })

  it('avoids the credit flash that cancel-then-book would have caused', () => {
    const half = reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: true })
    expect(half.credits).toBe(7) // the intermediate state a single action exists to avoid
    expect(reducer(half, { type: 'book', id: SAT_HIIT.id, charge: true }).credits).toBe(6)
    expect(moved.credits).toBe(6)
  })

  it('is not a way to spend a credit the member does not have', () => {
    const broke: BookingState = { ...base, credits: 0 }
    expect(reducer(broke, { type: 'reschedule', from: THU_HIIT.id, to: SAT_HIIT.id }).credits).toBe(0)
  })
})

describe('reducer: cancelling late', () => {
  const base: BookingState = {
    credits: 6,
    taken: { [THU_HIIT.id]: 1 },
    booked: { [THU_HIIT.id]: true },
    waitlist: {},
  }

  it('gives up the seat either way', () => {
    for (const refund of [true, false]) {
      const out = reducer(base, { type: 'cancel', id: THU_HIIT.id, refund })
      expect(out.booked[THU_HIIT.id]).toBeUndefined()
      expect(out.taken[THU_HIIT.id]).toBe(0) // the spot goes back to the studio regardless
    }
  })

  it('withholds the credit only when the window has closed', () => {
    expect(reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: true }).credits).toBe(7)
    expect(reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: false }).credits).toBe(6)
  })

  it('restores a late cancellation without charging again', () => {
    // Undo has to be exact: nothing was refunded, so nothing may be taken.
    const late = reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: false })
    const back = reducer(late, { type: 'book', id: THU_HIIT.id, charge: false })
    expect(back.credits).toBe(base.credits)
    expect(back.booked[THU_HIIT.id]).toBe(true)
    expect(back.taken[THU_HIIT.id]).toBe(1)
  })

  it('restores an in-window cancellation by spending the refund back', () => {
    const early = reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: true })
    const back = reducer(early, { type: 'book', id: THU_HIIT.id, charge: true })
    expect(back.credits).toBe(base.credits)
    expect(back.taken[THU_HIIT.id]).toBe(1)
  })

  it('cannot be used to mint a credit by cancelling late and rebooking free', () => {
    const late = reducer(base, { type: 'cancel', id: THU_HIIT.id, refund: false })
    const rebooked = reducer(late, { type: 'book', id: THU_HIIT.id, charge: true })
    expect(rebooked.credits).toBe(5) // paying again, because the first credit was forfeited
  })
})
