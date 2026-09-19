import { useCallback, useMemo, useReducer, useRef, useState } from 'react'
import { PACK_SIZE, type ClassType } from '../data/catalog'
import {
  buildClasses,
  buildWeek,
  isCancellable,
  isFull,
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

export function useBooking(now: Date) {
  const week = useMemo(() => buildWeek(now), [now])
  const baseClasses = useMemo(() => buildClasses(week), [week])
  const [state, dispatch] = useReducer(reducer, undefined, () => seed(baseClasses, now))

  /** Classes with the member's own effect on capacity applied. */
  const classes = useMemo<StudioClass[]>(
    () => baseClasses.map((c) => ({ ...c, taken: c.taken + (state.taken[c.id] ?? 0) })),
    [baseClasses, state.taken],
  )
  const byId = useCallback((id: string) => classes.find((c) => c.id === id), [classes])

  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)
  const showToast = useCallback((m: string) => {
    setToast(m)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  /** One entry point for the primary action on a class; decides what the click means. */
  const toggle = useCallback(
    (id: string): ToggleResult => {
      const c = byId(id)
      if (!c || isPast(c, now)) return { ok: false, message: 'This class has already started' }
      let r: ToggleResult
      if (state.booked[id]) {
        if (!isCancellable(c, now)) r = { ok: false, message: 'Too late to cancel — under 2 hours to class' }
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
      }
      showToast(r.message)
      return r
    },
    [byId, now, state.booked, state.waitlist, state.credits, showToast],
  )

  const topUp = useCallback(() => {
    dispatch({ type: 'top_up', amount: PACK_SIZE })
    showToast(`Added ${PACK_SIZE} credits`)
  }, [showToast])

  const upcoming = useMemo(
    () => classes.filter((c) => state.booked[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [classes, state.booked],
  )
  const waitlisted = useMemo(
    () => classes.filter((c) => state.waitlist[c.id]).sort((a, b) => a.when.getTime() - b.when.getTime()),
    [classes, state.waitlist],
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
