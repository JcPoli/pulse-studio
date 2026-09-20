import { TYPES, type ClassType, type CoachName } from '../data/catalog'
import type { StudioClass } from './schedule'

/**
 * The board used to filter on a single class type. Three things were wrong with that: you could
 * not ask for "Yoga or Pilates", the studio's three natural attendance patterns (before work, at
 * lunch, after work) had no expression at all, and the coach — the reason a lot of members pick
 * one class over another — was visible in the panel but not searchable.
 *
 * An empty list means "no opinion", not "nothing": a filter with every field empty matches the
 * whole schedule, which is what makes `all` an absence rather than a special case to test for.
 */
export type TimeSlot = 'morning' | 'lunch' | 'evening'

export interface SlotRange {
  label: string
  /** Inclusive, in minutes since midnight. */
  fromMin: number
  /** Exclusive. */
  toMin: number
}

/**
 * Boundaries chosen from the template rather than from the clock: the studio runs 06:30–10:45,
 * then 12:00–12:15, then 17:30–19:15, so noon and four o'clock fall inside the two dead stretches
 * the board already collapses. No class can land ambiguously near an edge.
 */
export const SLOTS: Record<TimeSlot, SlotRange> = {
  morning: { label: 'Morning', fromMin: 0, toMin: 12 * 60 },
  lunch: { label: 'Lunch', fromMin: 12 * 60, toMin: 16 * 60 },
  evening: { label: 'Evening', fromMin: 16 * 60, toMin: 24 * 60 },
}

export const SLOT_KEYS = Object.keys(SLOTS) as TimeSlot[]

export interface ClassFilter {
  types: ClassType[]
  slots: TimeSlot[]
  /** One coach at a time: picking two is the same as picking none of them in particular. */
  coach: CoachName | null
}

export const EMPTY_FILTER: ClassFilter = { types: [], slots: [], coach: null }

export const isEmptyFilter = (f: ClassFilter): boolean =>
  f.types.length === 0 && f.slots.length === 0 && f.coach === null

/** Fields are AND-ed, the values within a field are OR-ed — "morning or lunch Yoga with Maya". */
export function matches(c: StudioClass, f: ClassFilter): boolean {
  if (f.types.length > 0 && !f.types.includes(c.type)) return false
  if (f.coach !== null && c.coach !== f.coach) return false
  if (f.slots.length > 0) {
    const inSlot = f.slots.some((s) => c.startMin >= SLOTS[s].fromMin && c.startMin < SLOTS[s].toMin)
    if (!inSlot) return false
  }
  return true
}

/** Adds a value to a filter field, or takes it out again if it is already there. */
export function toggleIn<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value]
}

/**
 * Names the filter for the empty state, so a board with nothing on it says what it was looking
 * for. Reads as a noun phrase around the word "classes" — "no morning Yoga classes with Maya" —
 * and degrades to plain "classes" when nothing is selected.
 */
export function describeFilter(f: ClassFilter): string {
  const words: string[] = []
  if (f.slots.length > 0) words.push(f.slots.map((s) => SLOTS[s].label.toLowerCase()).join(' or '))
  if (f.types.length > 0) words.push(f.types.map((t) => TYPES[t].label).join(' or '))
  const head = words.join(' ')
  return `${head ? `${head} ` : ''}classes${f.coach ? ` with ${f.coach}` : ''}`
}
