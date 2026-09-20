import { TYPES } from '../data/catalog'
import { DAY_FULL, isFull, isPast, spotsLeft, type StudioClass } from '../lib/schedule'
import type { BoardScale } from '../lib/boardScale'

interface Props {
  c: StudioClass
  now: Date
  scale: BoardScale
  mine: boolean
  waitlisted: boolean
  selected: boolean
  /** 0 on the board's single tab stop, -1 on every other block — see Board's arrow keys. */
  tabIndex: number
  onSelect: (id: string) => void
}

export function ClassBlock({ c, now, scale, mine, waitlisted, selected, tabIndex, onSelect }: Props) {
  const t = TYPES[c.type]
  const past = isPast(c, now)
  const full = isFull(c)
  const left = spotsLeft(c)
  const status = mine ? 'Booked' : waitlisted ? 'Waitlisted' : full ? 'Full' : `${left} left`
  const size = c.mins <= 30 ? 'short' : c.mins < 60 ? 'mid' : 'tall'
  // Through the scale, not linear arithmetic: the board collapses empty hour bands.
  const top = scale.yOf(c.startMin)
  const height = scale.yOf(c.startMin + c.mins) - top - 3
  const cls = ['blk', size, mine && 'mine', full && 'full', past && 'past', selected && 'sel'].filter(Boolean).join(' ')
  // An aria-label replaces the block's visible text rather than adding to it, so it has to
  // carry all of it — including the day, which a bare time on a seven-day board leaves
  // ambiguous ("07:30, 4 left" could be any of seven columns).
  const label = `${c.name}, ${DAY_FULL[c.when.getDay()]} ${c.time}, ${c.mins} min with ${c.coach}, ${status}`

  // `data-id` is how Board moves focus onto a specific block: the arrow keys work out which
  // class should have it, and a React key is not something you can query the DOM for.
  return (
    <button
      type="button"
      className={cls}
      style={{ top, height, background: t.bg, color: t.fg }}
      disabled={past}
      data-id={c.id}
      tabIndex={tabIndex}
      aria-label={label}
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
