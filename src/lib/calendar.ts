import { COACHES } from '../data/catalog'
import { endOf, type StudioClass } from './schedule'

/**
 * Calendar export, in the two forms that between them reach everyone: a downloaded .ics file,
 * and a Google Calendar URL. The URL is not a convenience — an in-app browser (Instagram,
 * Facebook, a bank app's webview) routinely swallows a blob download with no error and no file,
 * and on those the .ics button is simply dead. A link navigates.
 */

/** RFC 5545 UTC stamp: 20260919T024500Z. Google's URL format wants the same shape. */
const stamp = (d: Date): string => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** Title and description shared by both exports, so the two cannot drift apart. */
const summary = (c: StudioClass): string => `${c.name} · Pulse Studio`
const details = (c: StudioClass): string => `${c.mins} min with ${c.coach} — ${COACHES[c.coach].role}.`

/** Backslash, semicolon, comma and newline are the four characters RFC 5545 requires escaping. */
const esc = (s: string): string => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n')

/**
 * A Google Calendar pre-filled event. `dates` is the UTC stamp pair Google expects; everything
 * else is a query parameter, so `URLSearchParams` does the escaping that `esc` does for the file.
 */
export function googleCalendarUrl(c: StudioClass): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: summary(c),
    dates: `${stamp(c.when)}/${stamp(endOf(c))}`,
    details: details(c),
    location: 'Pulse Studio',
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

export function classIcs(c: StudioClass, at: Date): string {
  const end = endOf(c)
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
    `SUMMARY:${esc(summary(c))}`,
    `DESCRIPTION:${esc(details(c))}`,
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
