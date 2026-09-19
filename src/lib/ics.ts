import { COACHES } from '../data/catalog'
import type { StudioClass } from './schedule'

/** RFC 5545 UTC stamp: 20260919T024500Z */
const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Backslash, semicolon, comma and newline are the four characters RFC 5545 requires escaping. */
const esc = (s: string): string => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n')

export function classIcs(c: StudioClass, at: Date): string {
  const end = new Date(c.when.getTime() + c.mins * 60_000)
  const coach = COACHES[c.coach]
  // CRLF line endings are mandatory; Google and Apple both reject bare LF.
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Pulse Studio//Booking//EN',
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${esc(c.id)}@pulse-studio`,
    `DTSTAMP:${stamp(at)}`,
    `DTSTART:${stamp(c.when)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${esc(`${c.name} · Pulse Studio`)}`,
    `DESCRIPTION:${esc(`${c.mins} min with ${c.coach} — ${coach.role}.`)}`,
    'LOCATION:Pulse Studio',
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

/** Hands the browser a .ics file. Object URL is revoked so the blob is not held for the session. */
export function downloadIcs(c: StudioClass): void {
  const blob = new Blob([classIcs(c, new Date())], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${c.name.replace(/[^\w-]+/g, '-').toLowerCase()}-${c.date}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
