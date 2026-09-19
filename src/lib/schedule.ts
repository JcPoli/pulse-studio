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

/** Today plus the next six days. */
export function buildWeek(today: Date): Date[] {
  const base = startOfDay(today)
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(base.getTime())
    d.setDate(base.getDate() + i)
    return d
  })
}

/** Deterministic demo schedule for the given days; taken counts seeded from the id. */
export function buildClasses(week: Date[]): StudioClass[] {
  const out: StudioClass[] = []
  for (const d of week) {
    const slots = TEMPLATE[d.getDay()] ?? []
    for (const t of slots) {
      const [hh, mm] = t.time.split(':').map(Number)
      const id = `${isoDate(d)}_${t.time}_${t.name.replace(/\s+/g, '-')}`
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
export const spotsLeft = (c: StudioClass): number => c.cap - c.taken
export const isFull = (c: StudioClass): boolean => spotsLeft(c) <= 0

export function formatDayLong(d: Date): string {
  return `${DAY_FULL[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`
}
