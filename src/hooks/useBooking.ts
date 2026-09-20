import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { HORIZON_DAYS, PACK_SIZE, TYPE_KEYS } from '../data/catalog'
import {
  DOW,
  buildClasses,
  buildDays,
  isCancellable,
  isFull,
  isoDate,
  isPast,
  type StudioClass,
} from '../lib/schedule'
import { SERIES_LIMIT, alternativesFor, clashWith, queuePosition, seatsHeld, seatsToQueue, seriesOf } from '../lib/booking'
import { seedAttendance, statsFrom, type Attendance } from '../lib/history'

// Defined with the URL schema it has to survive a round trip through, and re-exported here so
// every consumer keeps importing it from the hook that owns the tab state.
export type { Tab } from '../lib/deeplink'

export interface BookingState {
  credits: number
  /** class id → taken count override (mutations from the member's own bookings). */
  taken: Record<string, number>
  booked: Record<string, true>
  waitlist: Record<string, true>
  /** Classes already attended, oldest first. Only grows, and only when a booking falls behind. */
  attended: Attendance[]
  /** class id → seats this session handed to that queue, which shortens it. */
  promoted: Record<string, number>
  /** Bookings the member brought somebody to. One guest per booking, so a flag is enough. */
  guests: Record<string, true>
}

/**
 * `charge` and `refund` are spelled at every call site on purpose. A late cancellation gives up
 * the seat without returning the credit, and undoing one has to put the seat back without
 * charging again — so whether money moves is a property of the occasion, not of the verb, and
 * hiding it inside `book` and `cancel` would make the one case that costs a member a credit the
 * least visible thing in the file.
 */
type Action =
  | { type: 'book'; id: string; charge: boolean }
  | { type: 'book_many'; ids: string[] }
  | { type: 'cancel_many'; ids: string[] }
  | { type: 'set_guest'; id: string; on: boolean }
  | { type: 'cancel'; id: string; refund: boolean; seats: number; toQueue: number }
  | { type: 'reschedule'; from: string; to: string; toQueue: number }
  | { type: 'join_waitlist'; id: string }
  | { type: 'leave_waitlist'; id: string }
  | { type: 'top_up'; amount: number }

export function reducer(s: BookingState, a: Action): BookingState {
  switch (a.type) {
    case 'book': {
      const booked = { ...s.booked, [a.id]: true as const }
      return {
        ...s,
        credits: a.charge ? s.credits - 1 : s.credits,
        booked,
        taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) + 1 },
      }
    }
    // A series is one action rather than a loop of them, so it is one entry in the reducer,
    // one render, and one thing for Undo to reverse.
    case 'book_many': {
      const booked = { ...s.booked }
      const taken = { ...s.taken }
      for (const id of a.ids) {
        booked[id] = true
        taken[id] = (taken[id] ?? 0) + 1
      }
      return { ...s, credits: s.credits - a.ids.length, booked, taken }
    }
    case 'cancel_many': {
      const booked = { ...s.booked }
      const taken = { ...s.taken }
      for (const id of a.ids) {
        delete booked[id]
        taken[id] = (taken[id] ?? 0) - 1
      }
      // No seat here can be owed to a queue: a queue only forms behind a class that was already
      // full, and a full class cannot be booked in the first place. So every seat a series
      // release gives up came from the pool and goes back to it.
      return { ...s, credits: s.credits + a.ids.length, booked, taken }
    }
    case 'cancel': {
      const booked = { ...s.booked }
      delete booked[a.id]
      const guests = { ...s.guests }
      delete guests[a.id]
      // A seat handed to the queue never returns to the pool, so the taken count stays where it
      // is and the class stays full. What changes is that the line behind it is one shorter.
      return {
        ...s,
        // Every seat given up is refunded, or none is: the deadline is a property of the class.
        credits: a.refund ? s.credits + a.seats : s.credits,
        booked,
        taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) - (a.seats - a.toQueue) },
        promoted: a.toQueue > 0 ? { ...s.promoted, [a.id]: (s.promoted[a.id] ?? 0) + a.toQueue } : s.promoted,
        guests,
      }
    }
    case 'reschedule': {
      const booked = { ...s.booked }
      delete booked[a.from]
      booked[a.to] = true
      // One seat changes hands, so `credits` is deliberately untouched: a cancel-then-book
      // round-trip would refund a credit and spend it again, which flashes the wallet up and
      // back down in the top bar and leaves a member on their last credit one failed step away
      // from having given up their spot for nothing.
      return {
        ...s,
        booked,
        taken: {
          ...s.taken,
          // Same rule as a cancellation: if a queue is waiting on the class being left, the
          // vacated seat goes to the next person rather than back to the pool, so a full class
          // does not quietly become bookable because somebody moved out of it.
          ...(a.toQueue > 0 ? {} : { [a.from]: (s.taken[a.from] ?? 0) - 1 }),
          [a.to]: (s.taken[a.to] ?? 0) + 1,
        },
        promoted: a.toQueue > 0 ? { ...s.promoted, [a.from]: (s.promoted[a.from] ?? 0) + a.toQueue } : s.promoted,
      }
    }
    case 'set_guest': {
      const guests = { ...s.guests }
      if (a.on) guests[a.id] = true
      else delete guests[a.id]
      // A guest is a real body in the room: it costs a credit and takes a seat from the class.
      return {
        ...s,
        credits: a.on ? s.credits - 1 : s.credits + 1,
        taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) + (a.on ? 1 : -1) },
        guests,
      }
    }
    case 'join_waitlist':
      return { ...s, waitlist: { ...s.waitlist, [a.id]: true } }
    case 'leave_waitlist': {
      const waitlist = { ...s.waitlist }
      delete waitlist[a.id]
      return { ...s, waitlist }
    }
    case 'top_up':
      return { ...s, credits: s.credits + a.amount }
  }
}

const STORAGE_KEY = 'pulse-studio/booking/v1'
const VERSION = 2

/**
 * Bookings whose date has passed, turned into attendance records instead of being deleted.
 * `classes` is the horizon, which no longer contains them — so the type and the name come from
 * the saved record where there is one, and a booking saved under v1 (ids only) is matched back
 * to the template by the slug in its own id. One that cannot be matched is still counted: a
 * class you attended is a fact, and losing it to a rename would be worse than a blank name.
 */
const isAttendance = (v: unknown): v is Attendance => {
  if (typeof v !== 'object' || v === null) return false
  const a = v as Record<string, unknown>
  return (
    typeof a.id === 'string' &&
    typeof a.date === 'string' &&
    typeof a.name === 'string' &&
    (TYPE_KEYS as readonly string[]).includes(a.type as string)
  )
}

function harvest(ids: string[], known: Attendance[], template: StudioClass[]): Attendance[] {
  const byId = new Map(known.map((a) => [a.id, a]))
  const bySlug = new Map(template.map((c) => [c.id.slice(11), c]))
  const out: Attendance[] = [...known]
  for (const id of ids) {
    if (byId.has(id)) continue
    const c = bySlug.get(id.slice(11))
    out.push({
      id,
      date: id.slice(0, 10),
      type: c?.type ?? 'hiit',
      name: c?.name ?? id.slice(17).replace(/-/g, ' '),
    })
  }
  return out.sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Restores state saved by an earlier visit, dropping any booking whose date is already behind
 * us. Ids are prefixed with their local date, so this is a string compare on an ISO date — and
 * it deliberately does NOT refund those credits, because that class was attended. Pruning by
 * date rather than by "is it in the week on screen" is what lets a booking three weeks out
 * survive a reload while you are looking at this week.
 */
export function loadState(fromDate: string, template: StudioClass[]): BookingState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    // v1 is still read rather than discarded: it had no attendance list, and its past bookings
    // are exactly what harvest() turns into one, so upgrading gains a history instead of
    // starting blank.
    if (o.v !== 1 && o.v !== VERSION) return null
    if (typeof o.credits !== 'number' || !Number.isFinite(o.credits)) return null

    const keep = (id: string): boolean => id.slice(0, 10) >= fromDate
    const past = (value: unknown): string[] =>
      typeof value === 'object' && value !== null
        ? Object.keys(value as Record<string, unknown>).filter((id) => !keep(id))
        : []
    const flags = (value: unknown): Record<string, true> => {
      const out: Record<string, true> = {}
      if (typeof value === 'object' && value !== null) {
        for (const id of Object.keys(value as Record<string, unknown>)) {
          if (keep(id)) out[id] = true
        }
      }
      return out
    }
    const taken: Record<string, number> = {}
    if (typeof o.taken === 'object' && o.taken !== null) {
      const src = o.taken as Record<string, unknown>
      for (const id of Object.keys(src)) {
        const n = src[id]
        if (keep(id) && typeof n === 'number' && Number.isFinite(n)) taken[id] = n
      }
    }
    return {
      credits: Math.max(0, Math.trunc(o.credits)),
      taken,
      booked: flags(o.booked),
      waitlist: flags(o.waitlist),
      attended: harvest(past(o.booked), Array.isArray(o.attended) ? o.attended.filter(isAttendance) : [], template),
      // Deliberately not restored: a promotion is the studio moving somebody else, and replaying
      // last week s queue shuffles onto this week s classes would be inventing history.
      promoted: {},
      guests: flags(o.guests),
    }
  } catch {
    return null // unparseable, or storage blocked (private window, disabled site data)
  }
}

function saveState(state: BookingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: VERSION, ...state }))
  } catch {
    // Quota or a blocked store — the app works fine without persistence.
  }
}

/** Seed: two future bookings and one waitlist entry so the demo shows every state. */
export function seed(classes: StudioClass[], now: Date): BookingState {
  const state: BookingState = { credits: 6, taken: {}, booked: {}, waitlist: {}, attended: seedAttendance(now), promoted: {}, guests: {} }
  const open = classes.filter((c) => !isPast(c, now) && !isFull(c))
  for (const i of [1, 4]) {
    const c = open[i]
    if (c) {
      state.booked[c.id] = true
      state.taken[c.id] = 1
    }
  }
  const full = classes.find((c) => !isPast(c, now) && isFull(c))
  if (full) state.waitlist[full.id] = true
  return state
}

export type ToggleResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

/** A toast may carry one reversing action, rendered as an Undo button. */
export interface ToastState {
  message: string
  undo?: () => void
}

/** Highest `weekOffset` the generated horizon can actually fill. */
export const MAX_WEEK_OFFSET = Math.floor(HORIZON_DAYS / 7) - 1

/**
 * `anchor` fixes the first day of the horizon, so the grid never reshuffles under the user.
 * Anything time-sensitive (past, cancellable) reads the clock fresh instead — see `toggle`.
 *
 * Classes are generated for the whole horizon, not just the week on screen: `classes` is the
 * board's slice of it, while bookings, the waitlist and `byId` span all of it, so browsing to
 * another week never hides what you have booked.
 */
export function useBooking(anchor: Date, weekOffset: number) {
  const horizon = useMemo(() => buildDays(anchor, HORIZON_DAYS), [anchor])
  const baseClasses = useMemo(() => buildClasses(horizon), [horizon])
  const [state, dispatch] = useReducer(
    reducer,
    undefined,
    () => loadState(isoDate(anchor), baseClasses) ?? seed(baseClasses, anchor),
  )

  useEffect(() => {
    saveState(state)
  }, [state])

  /** Every class in the horizon, with the member's own effect on capacity applied. */
  const allClasses = useMemo<StudioClass[]>(
    () =>
      baseClasses.map((c) => ({
        ...c,
        taken: c.taken + (state.taken[c.id] ?? 0),
        waiting: Math.max(0, c.waiting - (state.promoted[c.id] ?? 0)),
      })),
    [baseClasses, state.taken, state.promoted],
  )
  const week = useMemo(() => buildDays(anchor, 7, weekOffset * 7), [anchor, weekOffset])
  const classes = useMemo<StudioClass[]>(() => {
    const keys = new Set(week.map(isoDate))
    return allClasses.filter((c) => keys.has(c.date))
  }, [allClasses, week])
  const byId = useCallback((id: string) => allClasses.find((c) => c.id === id), [allClasses])

  const [toast, setToast] = useState<ToastState | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  /** An undoable toast lingers longer, since it is now something to act on rather than just read. */
  const showToast = useCallback((message: string, undo?: () => void) => {
    setToast({ message, undo })
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), undo ? 6000 : 2200)
  }, [])

  const upcoming = useMemo(
    () => allClasses.filter((c) => state.booked[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [allClasses, state.booked],
  )

  /** Bound to what the member holds; the rule itself lives in lib/booking.ts. */
  const findClash = useCallback(
    (c: StudioClass, except?: string): StudioClass | undefined => clashWith(upcoming, c, except),
    [upcoming],
  )

  /** One entry point for the primary action on a class; decides what the click means. */
  const toggle = useCallback(
    (id: string): ToggleResult => {
      // Read the clock here, not at mount: a tab left open overnight must not let a class
      // that has already started be booked, nor misjudge the two-hour cancellation window.
      const at = new Date()
      const c = byId(id)
      if (!c || isPast(c, at)) return { ok: false, message: 'This class has already started' }
      const clash = findClash(c)
      let r: ToggleResult
      let undo: (() => void) | undefined
      if (state.booked[id]) {
        // Inside the two-hour window the booking can still be given up — refusing outright just
        // left the seat empty, which serves nobody: the studio would rather have it back for the
        // waitlist. What closes is the refund, not the cancellation. Undo is the safety net
        // instead of a confirmation step, and it has to put the seat back without charging,
        // since nothing was returned to charge against.
        const refund = isCancellable(c, at)
        const seats = seatsHeld(!!state.guests[id])
        const toQueue = seatsToQueue(c, seats)
        dispatch({ type: 'cancel', id, refund, seats, toQueue })
        const fate = toQueue > 0 ? ` · ${toQueue === seats ? 'spot went' : 'a spot went'} to the waitlist` : ''
        r = {
          ok: true,
          message: `${refund ? 'Cancelled · credit refunded' : 'Cancelled · credit spent'}${fate}`,
        }
        // Undoing a cancellation that fed the queue has to take the seat back off whoever got
        // it, which is the studio's call and not a member's. So there is no undo in that case.
        if (toQueue === 0) {
          undo = () => {
            dispatch({ type: 'book', id, charge: refund })
            showToast(refund ? 'Booking restored' : 'Booking restored · credit still yours')
          }
        }
      } else if (state.waitlist[id]) {
        dispatch({ type: 'leave_waitlist', id })
        r = { ok: true, message: 'Left the waitlist' }
      } else if (isFull(c)) {
        // No clash check on this branch: a waitlist place is a maybe, not a seat, and the
        // studio texts you before it becomes one — that is where the collision gets settled.
        dispatch({ type: 'join_waitlist', id })
        r = { ok: true, message: `On the waitlist · number ${queuePosition(c)} in line` }
      } else if (clash) {
        // Checked before credits because it is about the schedule, not the wallet: topping up
        // would not make this bookable.
        r = { ok: false, message: `Clashes with ${clash.name} at ${clash.time}` }
      } else if (state.credits <= 0) {
        r = { ok: false, message: 'No credits left — add a pack' }
      } else {
        dispatch({ type: 'book', id, charge: true })
        r = { ok: true, message: `Booked ${c.name} · ${c.time}` }
        // A single tap spends a credit, so offer the exact inverse while the toast is up.
        undo = () => {
          dispatch({ type: 'cancel', id, refund: true, seats: 1, toQueue: 0 })
          showToast('Booking undone · credit refunded')
        }
      }
      showToast(r.message, undo)
      return r
    },
    [byId, findClash, state.booked, state.waitlist, state.credits, showToast],
  )

  /**
   * Moves a booking to another sitting in one dispatch. The two-hour window that has to still
   * be open is the one on the class being given up, not the one being taken: walking out of a
   * class the studio can no longer refill is the part that costs them, and that rule must not
   * be sidestepped by calling a cancellation a move.
   *
   * `onMoved` is handed whichever class the member holds afterwards — the new one, and the old
   * one again if they press Undo — so the view can follow the booking instead of sitting on a
   * slot that is no longer theirs.
   */
  const reschedule = useCallback(
    (fromId: string, toId: string, onMoved?: (heldId: string) => void): ToggleResult => {
      const at = new Date()
      const from = byId(fromId)
      const to = byId(toId)
      if (!from || !to || !state.booked[fromId]) return { ok: false, message: 'That booking is no longer yours' }
      let r: ToggleResult
      let undo: (() => void) | undefined
      const clash = findClash(to, fromId)
      if (fromId === toId) r = { ok: false, message: "That's the class you're already in" }
      // A move carries one seat. Moving a booking with a guest on it would need two spots at the
      // far end, and the alternatives offered were only checked for one — so rather than move
      // half a party, or silently leave the guest behind on a class nobody is booked into, this
      // asks for the guest to come off first.
      else if (state.guests[fromId]) r = { ok: false, message: 'Remove the guest before moving this booking' }
      else if (state.booked[toId]) r = { ok: false, message: "You're already booked into that one" }
      else if (isPast(to, at)) r = { ok: false, message: 'That class has already started' }
      else if (isFull(to)) r = { ok: false, message: 'That class filled up — pick another' }
      else if (!isCancellable(from, at)) r = { ok: false, message: 'Too late to move — under 2 hours to class' }
      else if (clash) r = { ok: false, message: `Clashes with ${clash.name} at ${clash.time}` }
      else {
        const toQueue = seatsToQueue(from, 1)
        dispatch({ type: 'reschedule', from: fromId, to: toId, toQueue })
        onMoved?.(toId)
        r = { ok: true, message: `Moved to ${DOW[to.when.getDay()]} ${to.time}` }
        // The inverse of a move is the same move backwards, and the seat just vacated is still
        // the member's to take back, so this cannot fail on capacity.
        // As with a cancellation, a seat already handed to the queue is not the member to
        // take back, so a move out of a class with a line behind it is one way only.
        if (toQueue === 0) {
          undo = () => {
            dispatch({ type: 'reschedule', from: toId, to: fromId, toQueue: 0 })
            onMoved?.(fromId)
            showToast(`Moved back to ${DOW[from.when.getDay()]} ${from.time}`)
          }
        }
      }
      showToast(r.message, undo)
      return r
    },
    [byId, findClash, state.booked, showToast],
  )

  /** The standing appointment this class belongs to: itself plus the next few weeks of it. */
  const series = useCallback(
    (c: StudioClass, at: Date): StudioClass[] => seriesOf(allClasses, c, upcoming, at),
    [allClasses, upcoming],
  )

  /**
   * Books a whole series in one action. Partial success is deliberate and reported rather than
   * refused: a member with two credits asking for four Tuesdays wants the two, and telling them
   * "no" would leave them booking one at a time to reach the same place.
   */
  const bookSeries = useCallback(
    (c: StudioClass): ToggleResult => {
      const at = new Date()
      const all = series(c, at)
      const ids = all.slice(0, state.credits).map((s) => s.id)
      if (ids.length === 0) {
        return { ok: false, message: state.credits <= 0 ? 'No credits left — add a pack' : 'Nothing left to book' }
      }
      dispatch({ type: 'book_many', ids })
      const short = ids.length < all.length
      const message = `Booked ${ids.length} ${DOW[c.when.getDay()]}${ids.length === 1 ? '' : 's'}${
        short ? ` · ${all.length - ids.length} more than you have credits for` : ''
      }`
      showToast(message, () => {
        dispatch({ type: 'cancel_many', ids })
        showToast('Series undone · credits refunded')
      })
      return { ok: true, message }
    },
    [series, state.credits, showToast],
  )

  const alternatives = useCallback(
    (c: StudioClass, at: Date): StudioClass[] => alternativesFor(allClasses, c, upcoming, at),
    [allClasses, upcoming],
  )

  /**
   * Adds or drops the one guest a booking may carry. A guest is a real body in the room, so it
   * costs a credit and takes a seat from the class — which is also why it can be refused for
   * want of either.
   */
  const setGuest = useCallback(
    (id: string, on: boolean): ToggleResult => {
      const c = byId(id)
      if (!c || !state.booked[id]) return { ok: false, message: 'Book the class first' }
      if (on && isFull(c)) return { ok: false, message: 'No spot left to bring anyone into' }
      if (on && state.credits <= 0) return { ok: false, message: 'No credits left — add a pack' }
      if (!on && !isCancellable(c, new Date())) {
        // The same deadline the member's own seat is under. Dropping a guest late would
        // otherwise be a way to get a credit back that a cancellation could not.
        return { ok: false, message: 'Too late to change — under 2 hours to class' }
      }
      dispatch({ type: 'set_guest', id, on })
      const message = on ? 'Guest added · 1 credit' : 'Guest removed · credit refunded'
      showToast(message, () => {
        dispatch({ type: 'set_guest', id, on: !on })
        showToast(on ? 'Guest removed' : 'Guest added again')
      })
      return { ok: true, message }
    },
    [byId, state.booked, state.credits, showToast],
  )

  const topUp = useCallback(() => {
    dispatch({ type: 'top_up', amount: PACK_SIZE })
    showToast(`Added ${PACK_SIZE} credits`)
  }, [showToast])

  const waitlisted = useMemo(
    () => allClasses.filter((c) => state.waitlist[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [allClasses, state.waitlist],
  )


  /** Derived, never stored: the records are the facts, the numbers are a reading of them. */
  const stats = useMemo(() => statsFrom(state.attended, anchor), [state.attended, anchor])

  return {
    week,
    classes,
    byId,
    attended: state.attended,
    stats,
    credits: state.credits,
    booked: state.booked,
    waitlist: state.waitlist,
    upcoming,
    waitlisted,
    toggle,
    reschedule,
    alternatives,
    series,
    bookSeries,
    setGuest,
    guests: state.guests,
    SERIES_LIMIT,
    topUp,
    toast,
    showToast,
  }
}

export type Booking = ReturnType<typeof useBooking>
