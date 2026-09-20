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
