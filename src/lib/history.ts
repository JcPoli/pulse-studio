import type { ClassType } from '../data/catalog'
import { buildClasses, buildDays, hash, parseIsoDate, startOfDay, type StudioClass } from './schedule'

/**
 * Attendance. The app used to throw the member's past away: pruning dropped every booking whose
 * date had passed, so after a reload there was no evidence you had ever been to the studio, and
 * the Membership tab could only count what was still ahead of you.
 *
 * A record is a fact about the past, so it carries the type and the name rather than a reference
 * to the schedule. Past classes fall out of the generated horizon within a day, and deriving the
 * type from today's template would rewrite last month's history the moment the studio renamed a
 * class or moved it to another coach.
 */
export interface Attendance {
  id: string
  /** YYYY-MM-DD, local. */
  date: string
  type: ClassType
  name: string
}

export const toAttendance = (c: StudioClass): Attendance => ({
  id: c.id,
  date: c.date,
  type: c.type,
  name: c.name,
})

/** How far back the activity strip reaches. */
export const HISTORY_WEEKS = 8

export interface Stats {
  total: number
  thisMonth: number
  streakWeeks: number
  favourite: ClassType | null
  /** Attendance per week for the last HISTORY_WEEKS, oldest first. */
  weeks: number[]
}

/**
 * Which weekly bucket a date falls in, counting back from today: 0 is the last seven days,
 * 1 the seven before that. Rolling windows rather than calendar weeks, so a streak does not
 * reset at midnight on Sunday for someone who trains on Saturdays and Mondays.
 */
export function weekBucket(date: string, today: Date): number {
  const days = Math.floor((startOfDay(today).getTime() - parseIsoDate(date).getTime()) / 86_400_000)
  return Math.floor(days / 7)
}

export function statsFrom(attended: Attendance[], today: Date): Stats {
  const month = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const weeks = Array.from({ length: HISTORY_WEEKS }, () => 0)
  const byType = new Map<ClassType, number>()
  let thisMonth = 0

  for (const a of attended) {
    if (a.date.startsWith(month)) thisMonth++
    byType.set(a.type, (byType.get(a.type) ?? 0) + 1)
    const bucket = weekBucket(a.date, today)
    if (bucket >= 0 && bucket < HISTORY_WEEKS) weeks[HISTORY_WEEKS - 1 - bucket]++
  }

  let favourite: ClassType | null = null
  let best = 0
  for (const [type, n] of byType) {
    if (n > best) {
      favourite = type
      best = n
    }
  }

  // The current week not having a class yet is not a broken streak — it is Tuesday. Counting
  // starts at the first bucket that has anything in it, and only then does a gap end it.
  let streakWeeks = 0
  let started = false
  for (let bucket = 0; bucket < HISTORY_WEEKS; bucket++) {
    const n = weeks[HISTORY_WEEKS - 1 - bucket]
    if (n > 0) {
      started = true
      streakWeeks++
    } else if (started || bucket > 0) {
      break
    }
  }

  return { total: attended.length, thisMonth, streakWeeks, favourite, weeks }
}

/**
 * A demo needs a past. The records are generated from the same weekly template walked backwards,
 * so they line up with classes the studio really runs, and selection is by hash of the id so the
 * history is identical on every machine. HIIT is over-represented on purpose: a favourite that
 * comes out of a three-way tie tells the reader nothing.
 */
export function seedAttendance(anchor: Date): Attendance[] {
  const days = HISTORY_WEEKS * 7
  return buildClasses(buildDays(anchor, days, -days))
    .filter((c) => c.when.getTime() < anchor.getTime())
    .filter((c) => {
      const h = hash(c.id)
      return h % 9 === 0 || (c.type === 'hiit' && h % 4 === 0)
    })
    .map(toAttendance)
}
