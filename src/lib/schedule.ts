import { CANCEL_WINDOW_MS, TEMPLATE, type ClassType, type CoachName } from '../data/catalog'

export interface StudioClass {
  id: string
  date: string // YYYY-MM-DD (local)
  time: string // HH:MM
  name: string
  type: ClassType
  coach: CoachName
  mins: number
  cap: number
  taken: number
  when: Date
  startMin: number // minutes since midnight
}

export const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const
export const DAY_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const

export const pad = (n: number): string => (n < 10 ? `0${n}` : String(n))

/** Local-date ISO key, never UTC-shifted. */
export const isoDate = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate())

/** FNV-1a 32-bit — Math.imul keeps it exact (plain multiply loses precision past 2^53). */
export function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h
}

/** `count` consecutive days starting `offsetDays` after the given day. */
export function buildDays(from: Date, count: number, offsetDays = 0): Date[] {
  const base = startOfDay(from)
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(base.getTime())
    d.setDate(base.getDate() + offsetDays + i)
    return d
  })
}

/** Today plus the next six days. */
export const buildWeek = (today: Date): Date[] => buildDays(today, 7)

/** Deterministic demo schedule for the given days; taken counts seeded from the id. */
export function buildClasses(week: Date[]): StudioClass[] {
  const out: StudioClass[] = []
  for (const d of week) {
    const slots = TEMPLATE[d.getDay()] ?? []
    for (const t of slots) {
      const [hh, mm] = t.time.split(':').map(Number)
      // Every run of non-word characters collapses to one dash, not just whitespace: "Core &
      // Mobility" used to yield an id containing a bare `&`, which splits a query string in
      // half and so made those two classes the only ones that could not be linked to. The id
      // is a key in three places that all care — a URL, a DOM selector, a storage key — so it
      // is kept to letters, digits, dashes and underscores at the source.
      const id = `${isoDate(d)}_${t.time}_${t.name.replace(/\W+/g, '-')}`
      const taken = Math.min(hash(id) % (t.cap + 3), t.cap) // sometimes full → waitlist demo
      out.push({
        id,
        date: isoDate(d),
        time: t.time,
        name: t.name,
        type: t.type,
        coach: t.coach,
        mins: t.mins,
        cap: t.cap,
        taken,
        when: new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm),
        startMin: hh * 60 + mm,
      })
    }
  }
  return out
}

export const isPast = (c: StudioClass, now: Date): boolean => c.when.getTime() <= now.getTime()
export const isCancellable = (c: StudioClass, now: Date): boolean => c.when.getTime() - now.getTime() > CANCEL_WINDOW_MS

/** The moment free cancellation closes — shown in the detail panel so the rule isn't a surprise. */
export const cancelDeadline = (c: StudioClass): Date => new Date(c.when.getTime() - CANCEL_WINDOW_MS)

export const formatTime = (d: Date): string => `${pad(d.getHours())}:${pad(d.getMinutes())}`
export const spotsLeft = (c: StudioClass): number => c.cap - c.taken
export const isFull = (c: StudioClass): boolean => spotsLeft(c) <= 0

/** A class carries only a start and a duration, so every end time is derived. */
export const endOf = (c: StudioClass): Date => new Date(c.when.getTime() + c.mins * 60_000)

/**
 * Do two classes collide? Half-open on both sides on purpose: the template is full of classes
 * that begin exactly when another ends — Sunrise Flow 06:30 for 60 minutes, then HIIT 45 at
 * 07:30 — and holding both of those is a normal Monday, not a clash.
 */
export const overlaps = (a: StudioClass, b: StudioClass): boolean =>
  a.when.getTime() < endOf(b).getTime() && b.when.getTime() < endOf(a).getTime()

export function formatDayLong(d: Date): string {
  return `${DAY_FULL[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`
}
