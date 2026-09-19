import { useEffect, useRef } from 'react'
import { COACHES, DESCRIPTIONS, TYPES } from '../data/catalog'
import { MON, DAY_FULL, cancelDeadline, formatTime, isCancellable, isFull, spotsLeft, type StudioClass } from '../lib/schedule'
import { downloadIcs } from '../lib/ics'
import { useIsMobile } from '../hooks/useIsMobile'

interface Props {
  c: StudioClass | null
  now: Date
  credits: number
  mine: boolean
  waitlisted: boolean
  open: boolean
  onToggle: (id: string) => void
  onClose: () => void
}

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'

/** Sticky aside on desktop; slides up as a bottom sheet under 980px (see .panel in index.css). */
export function DetailPanel({ c, now, credits, mine, waitlisted, open, onToggle, onClose }: Props) {
  const panelRef = useRef<HTMLElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)
  const mobile = useIsMobile()

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
    cta = cancellable ? 'Cancel booking' : 'Booked · too late to cancel'
    cls = 'cancel'
    disabled = !cancellable
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
          <button type="button" className="addcal" onClick={() => downloadIcs(c)}>
            Add to calendar
          </button>
          <small>
            {cancellable
              ? `Free cancellation until ${formatTime(deadline)}`
              : `Cancellation closed at ${formatTime(deadline)}`}
          </small>
        </div>
      )}
    </aside>
  )
}
