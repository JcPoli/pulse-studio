/**
 * The board's place in the schedule, carried in the query string.
 *
 * Until now every view of this app had the same URL. You could not send someone a class, you
 * could not bookmark the week you were looking at, and a reload dropped you back on today with
 * the panel shut — the mobile sheet even pushed a history entry with no URL change behind it, so
 * the Back gesture worked while the address bar stayed silent about where you were.
 *
 * Parsing is defensive on purpose, because these values arrive from a stranger's link: anything
 * unrecognised falls back rather than throwing, since a malformed share link should land on the
 * schedule, not on a blank page.
 */

export const TAB_KEYS = ['schedule', 'mine', 'membership'] as const

export type Tab = (typeof TAB_KEYS)[number]

export interface BoardLocation {
  tab: Tab
  weekOffset: number
  classId: string | null
}

export const HOME: BoardLocation = { tab: 'schedule', weekOffset: 0, classId: null }

const isTab = (v: string | null): v is Tab => v !== null && (TAB_KEYS as readonly string[]).includes(v)

/**
 * Class ids are `YYYY-MM-DD_HH:MM_Some-Name`. The shape is checked before the id is trusted as a
 * lookup key, so a hand-edited link cannot push arbitrary text into a DOM query selector.
 */
const ID_PATTERN = /^\d{4}-\d{2}-\d{2}_\d{2}:\d{2}_[\w-]+$/

export function parseLocation(search: string, maxWeekOffset: number): BoardLocation {
  const q = new URLSearchParams(search)

  const tab = isTab(q.get('tab')) ? (q.get('tab') as Tab) : 'schedule'

  const rawWeek = Number.parseInt(q.get('w') ?? '', 10)
  const weekOffset = Number.isInteger(rawWeek) ? Math.min(Math.max(rawWeek, 0), maxWeekOffset) : 0

  const rawId = q.get('c')
  const classId = rawId !== null && ID_PATTERN.test(rawId) ? rawId : null

  return { tab, weekOffset, classId }
}

/**
 * The query string for a location, or '' for the default one — a link to today's schedule should
 * be the bare path, not `?tab=schedule&w=0`.
 */
export function buildSearch(loc: BoardLocation): string {
  const q = new URLSearchParams()
  if (loc.tab !== 'schedule') q.set('tab', loc.tab)
  if (loc.weekOffset > 0) q.set('w', String(loc.weekOffset))
  if (loc.classId !== null) q.set('c', loc.classId)
  const s = q.toString()
  return s === '' ? '' : `?${s}`
}

/** Round trip, for the effect that keeps the address bar in step with the view. */
export const locationHref = (loc: BoardLocation, pathname: string): string => `${pathname}${buildSearch(loc)}`
