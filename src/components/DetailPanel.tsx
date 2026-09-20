import { useCallback, useEffect, useRef, useState } from 'react'
import { COACHES, DESCRIPTIONS, TYPES, type CoachName } from '../data/catalog'
import { DOW, MON, DAY_FULL, cancelDeadline, formatTime, isCancellable, isFull, spotsLeft, type StudioClass } from '../lib/schedule'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar'
import { queuePosition } from '../lib/booking'
import { useIsMobile } from '../hooks/useIsMobile'

interface Props {
  c: StudioClass | null
  now: Date
  credits: number
  mine: boolean
  waitlisted: boolean
  /** Whether this booking is carrying a guest. */
  guest: boolean
  open: boolean
  /** Other sittings of this class the booking could move to; empty unless `mine`. */
  alternatives: StudioClass[]
  /** This class and the next few weeks of it at the same hour; empty unless it is bookable. */
  series: StudioClass[]
  onToggle: (id: string) => void
  onShare: () => void
  onCoach: (name: CoachName) => void
  onReschedule: (fromId: string, toId: string) => void
  onSeries: () => void
  onGuest: (on: boolean) => void
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** Sticky aside on desktop; slides up as a bottom sheet under 980px (see .panel in index.css). */
export function DetailPanel({ c, now, credits, mine, waitlisted, guest, open, alternatives, series, onToggle, onReschedule, onSeries, onGuest, onShare, onCoach, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const moveRef = useRef<HTMLButtonElement>(null)
  const mobile = useIsMobile()

  /** Whether the reschedule picker is expanded — a sub-step of the panel, not a second dialog. */
  const [moving, setMoving] = useState(false)

  // Picking a different class, or closing the sheet, ends the move. Without this the picker
  // would still be open, listing the wrong class's alternatives, on the next block you tap.
  useEffect(() => {
    setMoving(false)
  }, [c?.id, open])

  // The picker is opened by a button and replaces nothing, so focus has to be sent into it
  // deliberately; the panel's own Tab trap picks the new buttons up on its next keystroke.
  useEffect(() => {
    if (moving) pickerRef.current?.querySelector<HTMLElement>('button')?.focus()
  }, [moving])

  const stopMoving = useCallback(() => {
    setMoving(false)
    moveRef.current?.focus()
  }, [])

  // Below 980px this is a real modal, so it needs what `position: fixed` alone does not give it:
  // focus moves in, Tab cannot wander behind the scrim, and focus returns to whatever opened it.
  useEffect(() => {
    const el = panelRef.current
    if (!open || !mobile || !el) return
    restoreRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    el.querySelector<HTMLElement>('.close')?.focus()

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null)
      if (nodes.length === 0) return
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault()
        first.focus()
      }
    }
    el.addEventListener('keydown', onKeyDown)
    return () => {
      el.removeEventListener('keydown', onKeyDown)
      restoreRef.current?.focus()
    }
  }, [open, mobile])

  if (!c) {
    return (
      <aside className="panel" aria-live="polite">
        <div className="hint">
          <b>Pick a class</b>
          Click any block on the board to see details and book a spot.
        </div>
      </aside>
    )
  }

  const t = TYPES[c.type]
  const coach = COACHES[c.coach]
  const left = spotsLeft(c)
  const full = isFull(c)
  const cancellable = isCancellable(c, now)
  const hot = full || left <= 3
  const deadline = cancelDeadline(c)

  let cta: string
  let cls: 'book' | 'cancel' | 'wait'
  let disabled = false
  if (mine) {
    // Not disabled once the window closes. Refusing the cancellation left the seat empty, which
    // helps nobody — the studio would rather have it back for the waitlist. What the deadline
    // closes is the refund, and the button says so instead of pretending the door is shut.
    cta = cancellable ? 'Cancel booking' : 'Cancel · no refund'
    cls = 'cancel'
  } else if (waitlisted) {
    cta = 'Leave waitlist'
    cls = 'cancel'
  } else if (full) {
    cta = `Join waitlist · #${queuePosition(c)}`
    cls = 'wait'
  } else if (credits <= 0) {
    cta = 'No credits left'
    cls = 'book'
    disabled = true
  } else {
    cta = 'Book · 1 credit'
    cls = 'book'
  }

  return (
    <aside
      ref={panelRef}
      className={open ? 'panel open' : 'panel'}
      aria-live="polite"
      role="dialog"
      aria-modal={mobile && open ? true : undefined}
      aria-label={`${c.name} details`}
    >
      <button type="button" className="close" aria-label="Close" onClick={onClose}>
        ×
      </button>
      <span className="tag" style={{ background: t.bg, color: t.fg }}>
        {t.label}
      </span>
      <h2>{c.name}</h2>
      <div className="when">
        {DAY_FULL[c.when.getDay()]} {MON[c.when.getMonth()]} {c.when.getDate()} · {c.time} · {c.mins} min
      </div>
      <div className="kv">
        <div>
          <span>Spots</span>
          <b className={hot ? 'warn' : undefined}>{full ? 'Full' : `${left} of ${c.cap}`}</b>
        </div>
        <div>
          {/* A full class shows the queue instead of the price, because the price is not the
              thing standing between the member and the class. */}
          <span>{full ? (waitlisted ? 'Your place' : 'Waiting') : 'Cost'}</span>
          <b>{full ? (waitlisted ? `#${queuePosition(c)}` : `${c.waiting}`) : guest ? '2 credits' : '1 credit'}</b>
        </div>
      </div>
      <div className="spots" aria-hidden="true">
        <i className={hot ? 'hot' : undefined} style={{ width: `${(c.taken / c.cap) * 100}%` }} />
      </div>
      <p className="d">{DESCRIPTIONS[c.type]}</p>
      {/* The coach block became a button rather than gaining a page of its own. The board can
          already filter by coach, and "show me everything Maya teaches" is that filter — a
          separate coach view would have been a second way to render the same answer. */}
      <button type="button" className="coach" onClick={() => onCoach(c.coach)}>
        <span className="av" style={{ background: coach.color }} aria-hidden="true">
          {c.coach.slice(0, 2).toUpperCase()}
        </span>
        <span>
          <b>
            {c.coach} · {coach.role}
          </b>
          <span>{coach.bio}</span>
          <em>See all {c.coach}'s classes</em>
        </span>
      </button>
      <button type="button" className={`cta ${cls}`} disabled={disabled} onClick={() => onToggle(c.id)}>
        {cta}
      </button>
      {/* Only when there is actually a series to book, and only when booking is what the button
          above would do: offering "every Tuesday" next to "Join waitlist" would be two different
          answers to the same tap. */}
      {!mine && !waitlisted && !full && credits > 0 && series.length > 1 && (
        <button type="button" className="cta series" onClick={onSeries}>
          Book every {DOW[c.when.getDay()]} · {series.length} classes, {series.length} credits
        </button>
      )}
      <div className="postcta">
        <div className="pcrow">
          {mine && cancellable && (
            <button
              type="button"
              ref={moveRef}
              className="addcal"
              aria-expanded={moving}
              aria-controls="resched"
              onClick={() => (moving ? stopMoving() : setMoving(true))}
            >
              Reschedule
            </button>
          )}
          {mine && cancellable && (
            <button type="button" className={guest ? 'addcal on' : 'addcal'} onClick={() => onGuest(!guest)}>
              {guest ? 'Guest coming · remove' : 'Bring a friend · 1 credit'}
            </button>
          )}
          {/* Offered for every class, not only a booked one: the point of a class URL is
              sending it to somebody who has not booked it yet. */}
          <button type="button" className="addcal" onClick={onShare}>
            Copy link
          </button>
          {mine && (
            <>
              <button type="button" className="addcal" onClick={() => downloadIcs(c)}>
                Calendar file
              </button>
              {/* A real link, not a scripted open: an in-app browser that silently swallows the
                  .ics blob download will still follow an anchor. */}
              <a className="addcal" href={googleCalendarUrl(c)} target="_blank" rel="noopener noreferrer">
                Google Calendar
              </a>
            </>
          )}
        </div>
          {/* Gated on `cancellable`, not just `moving`: the live clock can cross the two-hour
              deadline with the picker open, and the panel should not keep offering a move the
              hook would now refuse. */}
          {moving && cancellable && (
            <div
              className="resched"
              id="resched"
              ref={pickerRef}
              role="group"
              aria-label={`Move ${c.name} to another time`}
              // Escape belongs to the picker while it is open. It has to stop here, or the
              // window-level handler in App closes the whole sheet and loses the booking view.
              onKeyDown={(e) => {
                if (e.key !== 'Escape') return
                e.stopPropagation()
                stopMoving()
              }}
            >
              {alternatives.length > 0 ? (
                <>
                  <ul>
                    {alternatives.map((a) => (
                      <li key={a.id}>
                        <button
                          type="button"
                          onClick={() => onReschedule(c.id, a.id)}
                          aria-label={`Move to ${DAY_FULL[a.when.getDay()]} ${MON[a.when.getMonth()]} ${a.when.getDate()}, ${a.time}, ${spotsLeft(a)} spots left`}
                        >
                          <b>
                            {DOW[a.when.getDay()]} {MON[a.when.getMonth()]} {a.when.getDate()}
                          </b>
                          <span className="num">{a.time}</span>
                          <em>{spotsLeft(a)} left</em>
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="keep" onClick={stopMoving}>
                    Keep this booking
                  </button>
                </>
              ) : (
                <p className="none">
                  No other {c.name} with room in the next four weeks.{' '}
                  <button type="button" className="keep" onClick={stopMoving}>
                    Back
                  </button>
                </p>
              )}
            </div>
          )}
        {mine && (
          <small>
            {cancellable
              ? `Free cancellation until ${formatTime(deadline)}`
              : `Free cancellation closed at ${formatTime(deadline)} — cancelling now spends the credit.`}
            {/* Said before the tap, not after: giving the spot up is not undoable once somebody
                else has it, and the member should know that while deciding. */}
            {c.waiting > 0 && ` ${c.waiting} ${c.waiting === 1 ? 'person is' : 'people are'} waiting — your spot goes to the next in line.`}
          </small>
        )}
      </div>
    </aside>
  )
}
