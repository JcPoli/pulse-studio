import { isFull, isPast, overlaps, type StudioClass } from './schedule'

/**
 * The booking rules that are pure functions of the schedule, kept out of `useBooking` so they
 * can be tested directly rather than through a rendered hook. What stays in the hook is the
 * part that genuinely needs React: dispatching, the toast, and reading the clock at the moment
 * of the tap.
 */

/** Five: the picker renders inside a bottom sheet on a phone, under a cancellation note. */
export const ALTERNATIVES_LIMIT = 5

/**
 * The class in `held` that collides with `c`, if there is one. `except` drops a single id from
 * the test, which is what makes a move possible: the slot being vacated must not be allowed to
 * veto the slot replacing it.
 */
export function clashWith(held: StudioClass[], c: StudioClass, except?: string): StudioClass | undefined {
  return held.find((h) => h.id !== c.id && h.id !== except && overlaps(h, c))
}

/**
 * Where a booking could move to: the same class on another day, still open, not already held,
 * and clear of the rest of the member's week.
 *
 * `held` doubles as the "already booked" test, because a class the member holds is by
 * definition in it — one input instead of a list and a matching set of flags that could drift
 * apart.
 */
export function alternativesFor(
  all: StudioClass[],
  c: StudioClass,
  held: StudioClass[],
  at: Date,
  limit: number = ALTERNATIVES_LIMIT,
): StudioClass[] {
  const heldIds = new Set(held.map((h) => h.id))
  return all
    .filter(
      (a) =>
        a.name === c.name &&
        a.id !== c.id &&
        !heldIds.has(a.id) &&
        !isPast(a, at) &&
        !isFull(a) &&
        !clashWith(held, a, c.id),
    )
    .slice(0, limit)
}

/**
 * The member's place in line, counting from one: everyone still waiting, and then them. Joining
 * always goes to the back, which is the only honest thing a queue can do.
 */
export const queuePosition = (c: StudioClass): number => c.waiting + 1

/**
 * How many of the seats being given up go to the queue rather than back to the pool. A full
 * class with people waiting does not become bookable again because one member dropped out — the
 * next in line takes the spot, and the board should keep showing the class as full. Releasing
 * two seats with one person waiting hands over one and returns the other, which is why this
 * counts rather than answering yes or no.
 */
export const seatsToQueue = (c: StudioClass, seats: number): number => Math.min(seats, c.waiting)

/** A booking is the member plus at most one guest, so releasing it frees one seat or two. */
export const seatsHeld = (guest: boolean): number => (guest ? 2 : 1)

/** How many sittings ahead a "book the series" offer reaches. */
export const SERIES_LIMIT = 4

/**
 * The same class at the same hour on the same weekday, from `c` forward through the horizon —
 * what a member means by "I do this every Tuesday".
 *
 * Narrower than `alternativesFor` on purpose. A reschedule wants any other sitting, because the
 * member is looking for a slot that suits them this once; a series wants the standing
 * appointment, so a Tuesday evening booking must not quietly enrol them in Saturday mornings.
 * `c` itself is the first element, so the length of the result is the number of seats and the
 * number of credits.
 */
export function seriesOf(
  all: StudioClass[],
  c: StudioClass,
  held: StudioClass[],
  at: Date,
  limit: number = SERIES_LIMIT,
): StudioClass[] {
  const heldIds = new Set(held.map((h) => h.id))
  return all
    .filter(
      (s) =>
        s.name === c.name &&
        s.time === c.time &&
        s.when.getDay() === c.when.getDay() &&
        s.date >= c.date &&
        !heldIds.has(s.id) &&
        !isPast(s, at) &&
        !isFull(s) &&
        !clashWith(held, s, c.id),
    )
    .slice(0, limit)
}
