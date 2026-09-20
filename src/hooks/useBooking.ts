import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { HORIZON_DAYS, PACK_SIZE, type ClassType } from '../data/catalog'
import {
  buildClasses,
  buildDays,
  isCancellable,
  isFull,
  isoDate,
  isPast,
  type StudioClass,
} from '../lib/schedule'

export type Tab = 'schedule' | 'mine' | 'membership'

export interface BookingState {
  credits: number
  /** class id → taken count override (mutations from the member's own bookings). */
  taken: Record<string, number>
  booked: Record<string, true>
  waitlist: Record<string, true>
}

type Action =
  | { type: 'book'; id: string }
  | { type: 'cancel'; id: string }
  | { type: 'join_waitlist'; id: string }
  | { type: 'leave_waitlist'; id: string }
  | { type: 'top_up'; amount: number }

export function reducer(s: BookingState, a: Action): BookingState {
  switch (a.type) {
    case 'book': {
      const booked = { ...s.booked, [a.id]: true as const }
      return { ...s, credits: s.credits - 1, booked, taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) + 1 } }
    }
    case 'cancel': {
      const booked = { ...s.booked }
      delete booked[a.id]
      return { ...s, credits: s.credits + 1, booked, taken: { ...s.taken, [a.id]: (s.taken[a.id] ?? 0) - 1 } }
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

  /** One entry point for the primary action on a class; decides what the click means. */
  const toggle = useCallback(
    (id: string): ToggleResult => {
      // Read the clock here, not at mount: a tab left open overnight must not let a class
      // that has already started be booked, nor misjudge the two-hour cancellation window.
      const at = new Date()
      const c = byId(id)
      if (!c || isPast(c, at)) return { ok: false, message: 'This class has already started' }
      let r: ToggleResult
      let undo: (() => void) | undefined
      if (state.booked[id]) {
        if (!isCancellable(c, at)) r = { ok: false, message: 'Too late to cancel — under 2 hours to class' }
        else {
          dispatch({ type: 'cancel', id })
          r = { ok: true, message: 'Cancelled · credit refunded' }
        }
      } else if (state.waitlist[id]) {
        dispatch({ type: 'leave_waitlist', id })
        r = { ok: true, message: 'Left the waitlist' }
      } else if (isFull(c)) {
        dispatch({ type: 'join_waitlist', id })
        r = { ok: true, message: "On the waitlist · we'll text you if a spot opens" }
      } else if (state.credits <= 0) {
        r = { ok: false, message: 'No credits left — add a pack' }
      } else {
        dispatch({ type: 'book', id })
        r = { ok: true, message: `Booked ${c.name} · ${c.time}` }
        // A single tap spends a credit, so offer the exact inverse while the toast is up.
        undo = () => {
          dispatch({ type: 'cancel', id })
          showToast('Booking undone · credit refunded')
        }
      }
      showToast(r.message, undo)
      return r
    },
    [byId, state.booked, state.waitlist, state.credits, showToast],
  )

  const topUp = useCallback(() => {
    dispatch({ type: 'top_up', amount: PACK_SIZE })
    showToast(`Added ${PACK_SIZE} credits`)
  }, [showToast])

  const upcoming = useMemo(
    () => allClasses.filter((c) => state.booked[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [allClasses, state.booked],
  )
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
    topUp,
    toast,
    showToast,
  }
}

export type Booking = ReturnType<typeof useBooking>
