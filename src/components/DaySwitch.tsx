import { DAY_FULL, MON, isoDate } from '../lib/schedule'

interface Props {
  week: Date[]
  index: number
  count: number
  today: Date
  onChange: (i: number) => void
}

/** Mobile-only prev/next control that drives the horizontally scrolling board. */
export function DaySwitch({ week, index, count, today, onChange }: Props) {
  const d = week[index]
  const isToday = isoDate(d) === isoDate(today)
  return (
    <div className="dayswitch">
      <button type="button" className="arrow" aria-label="Previous day" disabled={index === 0} onClick={() => onChange(index - 1)}>
        ‹
      </button>
      <div className="lbl" aria-live="polite">
        {isToday ? 'Today' : DAY_FULL[d.getDay()]}
        <small>
          {MON[d.getMonth()]} {d.getDate()} · {count} {count === 1 ? 'class' : 'classes'}
        </small>
      </div>
      <button type="button" className="arrow" aria-label="Next day" disabled={index === week.length - 1} onClick={() => onChange(index + 1)}>
        ›
      </button>
    </div>
  )
}
