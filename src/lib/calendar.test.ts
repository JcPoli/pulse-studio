import { describe, expect, it } from 'vitest'
import { classIcs, googleCalendarUrl } from './calendar'
import { buildClasses, buildDays, endOf, type StudioClass } from './schedule'

const ANCHOR = new Date(2026, 8, 21, 5, 0)
const ALL = buildClasses(buildDays(ANCHOR, 7))

const at = (date: string, time: string): StudioClass => {
  const c = ALL.find((x) => x.date === date && x.time === time)
  if (!c) throw new Error(`no class at ${date} ${time}`)
  return c
}

const CLASS = at('2026-09-21', '07:30') // HIIT 45 with Dre
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

describe('classIcs', () => {
  const ics = classIcs(CLASS, ANCHOR)

  it('ends every line with CRLF, which Google and Apple both require', () => {
    expect(ics).toContain('\r\n')
    expect(ics.split('\r\n').length).toBeGreaterThan(10)
    // No bare LF anywhere: a single one is enough for a strict parser to reject the file.
    expect(ics.replace(/\r\n/g, '')).not.toContain('\n')
  })

  it('brackets a single event', () => {
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true)
    expect(ics.trimEnd().endsWith('END:VCALENDAR')).toBe(true)
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(1)
  })

  it('stamps the start and the derived end in UTC', () => {
    expect(ics).toContain(`DTSTART:${utc(CLASS.when)}`)
    expect(ics).toContain(`DTEND:${utc(endOf(CLASS))}`)
  })

  it('escapes the characters RFC 5545 reserves', () => {
    const tricky = { ...CLASS, name: 'Back; Core, Legs\\Arms' }
    const out = classIcs(tricky, ANCHOR)
    expect(out).toContain('SUMMARY:Back\\; Core\\, Legs\\\\Arms')
  })
})

describe('googleCalendarUrl', () => {
  const url = new URL(googleCalendarUrl(CLASS))

  it('points at the render endpoint with a template action', () => {
    expect(url.origin + url.pathname).toBe('https://calendar.google.com/calendar/render')
    expect(url.searchParams.get('action')).toBe('TEMPLATE')
  })

  it('passes the same UTC window as the file, as a stamp pair', () => {
    expect(url.searchParams.get('dates')).toBe(`${utc(CLASS.when)}/${utc(endOf(CLASS))}`)
  })

  it('agrees with the file on the title and the description', () => {
    // The point of sharing `summary` and `details` between the two exports: a member who adds
    // the same class twice, once each way, should not end up with two differently named events.
    const ics = classIcs(CLASS, ANCHOR)
    expect(ics).toContain(`SUMMARY:${url.searchParams.get('text')}`)
    expect(ics).toContain(`DESCRIPTION:${url.searchParams.get('details')}`)
  })

  it('percent-encodes the punctuation in the query rather than emitting it raw', () => {
    const raw = googleCalendarUrl(CLASS)
    expect(raw).not.toContain('·')
    expect(raw).not.toContain(' ')
    expect(url.searchParams.get('text')).toContain('·') // decoded again on the way out
  })

  it('survives a name with characters that would break a query string', () => {
    const tricky = { ...CLASS, name: 'Legs & Core / 50%' }
    const out = new URL(googleCalendarUrl(tricky))
    expect(out.searchParams.get('text')).toBe('Legs & Core / 50% · Pulse Studio')
  })
})
