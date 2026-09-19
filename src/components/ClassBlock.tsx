import { BOARD_START_HOUR, HOUR_PX, TYPES } from '../data/catalog'
import { isFull, isPast, spotsLeft, type StudioClass } from '../lib/schedule'

interface Props {
  c: StudioClass
  now: Date
  mine: boolean
  waitlisted: boolean
  selected: boolean
  onSelect: (id: string) => void
}

export function ClassBlock({ c, now, mine, waitlisted, selected, onSelect }: Props) {
  const t = TYPES[c.type]
  const past = isPast(c, now)
  const full = isFull(c)
  const left = spotsLeft(c)
  const status = mine ? 'Booked' : waitlisted ? 'Waitlisted' : full ? 'Full' : `${left} left`
  const size = c.mins <= 30 ? 'short' : c.mins < 60 ? 'mid' : 'tall'
  const top = ((c.startMin - BOARD_START_HOUR * 60) / 60) * HOUR_PX
  const height = (c.mins / 60) * HOUR_PX - 3
  const cls = ['blk', size, mine && 'mine', full && 'full', past && 'past', selected && 'sel'].filter(Boolean).join(' ')

  return (
    <button
      type="button"
      className={cls}
      style={{ top, height, background: t.bg, color: t.fg }}
      disabled={past}
      aria-label={`${c.name} ${c.time}, ${status}`}
      aria-pressed={selected}
      onClick={() => onSelect(c.id)}
    >
      <span className="n">{c.name}</span>
      <span className="m">
        {c.time} · {c.coach}
      </span>
      <span className="s">{status}</span>
    </button>
  )
}
