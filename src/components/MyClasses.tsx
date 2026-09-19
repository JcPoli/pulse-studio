import type { ReactNode } from 'react'
import { TYPES } from '../data/catalog'
import { DOW, isCancellable, isPast, type StudioClass } from '../lib/schedule'
import type { Tab } from '../hooks/useBooking'

interface RowProps {
  c: StudioClass
  now: Date
  kind: 'booked' | 'waitlist'
  onToggle: (id: string) => void
}

function Row({ c, now, kind, onToggle }: RowProps) {
  const t = TYPES[c.type]
  const past = isPast(c, now)
  let action: ReactNode
  if (past) action = <small>Done</small>
  else if (kind === 'waitlist')
    action = (
      <button type="button" onClick={() => onToggle(c.id)}>
        Leave waitlist
      </button>
    )
  else if (isCancellable(c, now))
    action = (
      <button type="button" onClick={() => onToggle(c.id)}>
        Cancel
      </button>
    )
  else action = <small>Too late to cancel</small>

  return (
    <div className={past ? 'row past' : 'row'}>
      <div className="stripe" style={{ background: t.fg }} aria-hidden="true" />
      <div className="d">
        <b className="num">{c.when.getDate()}</b>
        <span>{DOW[c.when.getDay()]}</span>
      </div>
      <div className="i">
        <b>{c.name}</b>
        <span>
          {c.time} · {c.mins} min · {c.coach}
        </span>
      </div>
      <div className="act">{action}</div>
    </div>
  )
}

interface Props {
  upcoming: StudioClass[]
  waitlisted: StudioClass[]
  now: Date
  onToggle: (id: string) => void
  onTab: (t: Tab) => void
}

export function MyClasses({ upcoming, waitlisted, now, onToggle, onTab }: Props) {
  return (
    <>
      <div className="shead">
        <div>
          <h1>
            My <span>classes</span>
          </h1>
          <p>Cancel up to 2 hours before and your credit comes back.</p>
        </div>
      </div>
      <div className="sec">
        <h3>
          Upcoming <span>{upcoming.length ? `${upcoming.length} booked` : ''}</span>
        </h3>
        {upcoming.length ? (
          upcoming.map((c) => <Row key={c.id} c={c} now={now} kind="booked" onToggle={onToggle} />)
        ) : (
          <div className="emptyb">
            Nothing booked yet.{' '}
            <button type="button" onClick={() => onTab('schedule')}>
              Open the schedule
            </button>
          </div>
        )}
      </div>
      <div className="sec">
        <h3>
          Waitlist <span>{waitlisted.length ? `${waitlisted.length} waiting` : ''}</span>
        </h3>
        {waitlisted.length ? (
          waitlisted.map((c) => <Row key={c.id} c={c} now={now} kind="waitlist" onToggle={onToggle} />)
        ) : (
          <div className="emptyb">You're not on any waitlist.</div>
        )}
      </div>
    </>
  )
}
