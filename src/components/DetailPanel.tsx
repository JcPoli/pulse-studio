import { useCallback, useEffect, useRef, useState } from 'react'
import { COACHES, DESCRIPTIONS, TYPES } from '../data/catalog'
import { DOW, MON, DAY_FULL, cancelDeadline, formatTime, isCancellable, isFull, spotsLeft, type StudioClass } from '../lib/schedule'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar'
import { useIsMobile } from '../hooks/useIsMobile'

interface Props {
  c: StudioClass | null
  now: Date
  credits: number
  mine: boolean
  waitlisted: boolean
  open: boolean
  /** Other sittings of this class the booking could move to; empty unless `mine`. */
  alternatives: StudioClass[]
  onToggle: (id: string) => void
  onReschedule: (fromId: string, toId: string) => void
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** Sticky aside on desktop; slides up as a bottom sheet under 980px (see .panel in index.css). */
export function DetailPanel({ c, now, credits, mine, waitlisted, open, alternatives, onToggle, onReschedule, onClose }: Props) {
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
    cta = 'Join waitlist'
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
          <span>Cost</span>
          <b>1 credit</b>
        </div>
      </div>
      <div className="spots" aria-hidden="true">
        <i className={hot ? 'hot' : undefined} style={{ width: `${(c.taken / c.cap) * 100}%` }} />
      </div>
      <p className="d">{DESCRIPTIONS[c.type]}</p>
      <div className="coach">
        <div className="av" style={{ background: coach.color }} aria-hidden="true">
          {c.coach.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <b>
            {c.coach} · {coach.role}
          </b>
          <span>{coach.bio}</span>
        </div>
      </div>
      <button type="button" className={`cta ${cls}`} disabled={disabled} onClick={() => onToggle(c.id)}>
        {cta}
      </button>
      {mine && (
        <div className="postcta">
          <div className="pcrow">
            {cancellable && (
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
            <button type="button" className="addcal" onClick={() => downloadIcs(c)}>
              Calendar file
            </button>
            {/* A real link, not a scripted open: an in-app browser that silently swallows the
                .ics blob download will still follow an anchor. */}
            <a className="addcal" href={googleCalendarUrl(c)} target="_blank" rel="noopener noreferrer">
              Google Calendar
            </a>
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
          <small>
            {cancellable
              ? `Free cancellation until ${formatTime(deadline)}`
              : `Free cancellation closed at ${formatTime(deadline)} — cancelling now spends the credit.`}
          </small>
        </div>
      )}
    </aside>
  )
}
