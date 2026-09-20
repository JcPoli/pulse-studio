import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { HORIZON_DAYS, PACK_SIZE, type ClassType } from '../data/catalog'
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
import { alternativesFor, clashWith } from '../lib/booking'

// Defined with the URL schema it has to survive a round trip through, and re-exported here so
// every consumer keeps importing it from the hook that owns the tab state.
export type { Tab } from '../lib/deeplink'

export interface BookingState {
  credits: number
  /** class id → taken count override (mutations from the member's own bookings). */
  taken: Record<string, number>
  booked: Record<string, true>
  waitlist: Record<string, true>
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
  | { type: 'cancel'; id: string; refund: boolean }
  | { type: 'reschedule'; from: string; to: string }
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
    case 'cancel': {
      const booked = { ...s.booked }
      delete booked[a.id]
      return {
        ...s,
        credits: a.refund ? s.credits + 1 : s.credits,
        booked,
        taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) - 1 },
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
          [a.from]: (s.taken[a.from] ?? 0) - 1,
          [a.to]: (s.taken[a.to] ?? 0) + 1,
        },
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

/**
 * Restores state saved by an earlier visit, dropping any booking whose date is already behind
 * us. Ids are prefixed with their local date, so this is a string compare on an ISO date — and
 * it deliberately does NOT refund those credits, because that class was attended. Pruning by
 * date rather than by "is it in the week on screen" is what lets a booking three weeks out
 * survive a reload while you are looking at this week.
 */
export function loadState(fromDate: string): BookingState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return null
    const o = parsed as Record<string, unknown>
    if (o.v !== 1 || typeof o.credits !== 'number' || !Number.isFinite(o.credits)) return null

    const keep = (id: string): boolean => id.slice(0, 10) >= fromDate
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
    }
  } catch {
    return null // unparseable, or storage blocked (private window, disabled site data)
  }
}

function saveState(state: BookingState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, ...state }))
  } catch {
    // Quota or a blocked store — the app works fine without persistence.
  }
}

/** Seed: two future bookings and one waitlist entry so the demo shows every state. */
export function seed(classes: StudioClass[], now: Date): BookingState {
  const state: BookingState = { credits: 6, taken: {}, booked: {}, waitlist: {} }
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
    () => loadState(isoDate(anchor)) ?? seed(baseClasses, anchor),
  )

  useEffect(() => {
    saveState(state)
  }, [state])

  /** Every class in the horizon, with the member's own effect on capacity applied. */
  const allClasses = useMemo<StudioClass[]>(
    () => baseClasses.map((c) => ({ ...c, taken: c.taken + (state.taken[c.id] ?? 0) })),
    [baseClasses, state.taken],
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
        dispatch({ type: 'cancel', id, refund })
        r = { ok: true, message: refund ? 'Cancelled · credit refunded' : 'Cancelled · credit spent' }
        undo = () => {
          dispatch({ type: 'book', id, charge: refund })
          showToast(refund ? 'Booking restored' : 'Booking restored · credit still yours')
        }
      } else if (state.waitlist[id]) {
        dispatch({ type: 'leave_waitlist', id })
        r = { ok: true, message: 'Left the waitlist' }
      } else if (isFull(c)) {
        // No clash check on this branch: a waitlist place is a maybe, not a seat, and the
        // studio texts you before it becomes one — that is where the collision gets settled.
        dispatch({ type: 'join_waitlist', id })
        r = { ok: true, message: "On the waitlist · we'll text you if a spot opens" }
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
          dispatch({ type: 'cancel', id, refund: true })
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
      else if (state.booked[toId]) r = { ok: false, message: "You're already booked into that one" }
      else if (isPast(to, at)) r = { ok: false, message: 'That class has already started' }
      else if (isFull(to)) r = { ok: false, message: 'That class filled up — pick another' }
      else if (!isCancellable(from, at)) r = { ok: false, message: 'Too late to move — under 2 hours to class' }
      else if (clash) r = { ok: false, message: `Clashes with ${clash.name} at ${clash.time}` }
      else {
        dispatch({ type: 'reschedule', from: fromId, to: toId })
        onMoved?.(toId)
        r = { ok: true, message: `Moved to ${DOW[to.when.getDay()]} ${to.time}` }
        // The inverse of a move is the same move backwards, and the seat just vacated is still
        // the member's to take back, so this cannot fail on capacity.
        undo = () => {
          dispatch({ type: 'reschedule', from: toId, to: fromId })
          onMoved?.(fromId)
          showToast(`Moved back to ${DOW[from.when.getDay()]} ${from.time}`)
        }
      }
      showToast(r.message, undo)
      return r
    },
    [byId, findClash, state.booked, showToast],
  )

  const alternatives = useCallback(
    (c: StudioClass, at: Date): StudioClass[] => alternativesFor(allClasses, c, upcoming, at),
    [allClasses, upcoming],
  )

  const topUp = useCallback(() => {
    dispatch({ type: 'top_up', amount: PACK_SIZE })
    showToast(`Added ${PACK_SIZE} credits`)
  }, [showToast])

  const waitlisted = useMemo(
    () => allClasses.filter((c) => state.waitlist[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [allClasses, state.waitlist],
  )
  const favouriteType = useMemo<ClassType | null>(() => {
    const count = new Map<ClassType, number>()
    for (const c of upcoming) count.set(c.type, (count.get(c.type) ?? 0) + 1)
    let best: ClassType | null = null
    let n = 0
    for (const [t, k] of count) if (k > n) { best = t; n = k }
    return best
  }, [upcoming])

  return {
    week,
    classes,
    byId,
    credits: state.credits,
    booked: state.booked,
    waitlist: state.waitlist,
    upcoming,
    waitlisted,
    favouriteType,
    toggle,
    reschedule,
    alternatives,
    topUp,
    toast,
    showToast,
  }
}

export type Booking = ReturnType<typeof useBooking>
