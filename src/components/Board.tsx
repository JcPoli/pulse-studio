import { forwardRef } from 'react'
import { BOARD_END_HOUR, BOARD_START_HOUR, HOUR_PX } from '../data/catalog'
import { DOW, isoDate, pad, type StudioClass } from '../lib/schedule'
import { ClassBlock } from './ClassBlock'
import type { TypeFilter } from './Legend'

interface Props {
  week: Date[]
  classes: StudioClass[]
  now: Date
  filter: TypeFilter
  booked: Record<string, true>
  waitlist: Record<string, true>
  selected: string | null
  onSelect: (id: string) => void
}

const HOURS = Array.from({ length: BOARD_END_HOUR - BOARD_START_HOUR }, (_, i) => BOARD_START_HOUR + i)

/** The weekly grid. `ref` lands on the scrolling columns wrapper so the mobile day switcher can drive it. */
export const Board = forwardRef<HTMLDivElement, Props>(function Board(
  { week, classes, now, filter, booked, waitlist, selected, onSelect },
  colsRef,
) {
  const todayKey = isoDate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const bodyHeight = (BOARD_END_HOUR - BOARD_START_HOUR) * HOUR_PX
  const showNowLine = nowMin > BOARD_START_HOUR * 60 && nowMin < BOARD_END_HOUR * 60

  return (
    <div className="board">
      <div className="rail" aria-hidden="true">
        <div className="h" />
        {HOURS.map((h) => (
          <div className="t" key={h}>
            <span>{h === BOARD_START_HOUR ? '' : `${pad(h)}:00`}</span>
          </div>
        ))}
      </div>
      <div className="cols" ref={colsRef}>
        {week.map((d, di) => {
          const key = isoDate(d)
          const isToday = key === todayKey
          const dayClasses = classes.filter((c) => c.date === key && (filter === 'all' || c.type === filter))
          return (
            <div className={isToday ? 'col today' : 'col'} key={key} data-di={di}>
              <div className="h">
                <span className="dow">{isToday ? 'Today' : DOW[d.getDay()]}</span>
                <span className="dn num">{d.getDate()}</span>
              </div>
              <div className="body" style={{ height: bodyHeight }}>
                {dayClasses.map((c) => (
                  <ClassBlock
                    key={c.id}
                    c={c}
                    now={now}
                    mine={!!booked[c.id]}
                    waitlisted={!!waitlist[c.id]}
                    selected={selected === c.id}
                    onSelect={onSelect}
                  />
                ))}
                {isToday && showNowLine && (
                  <div className="nowline" style={{ top: ((nowMin - BOARD_START_HOUR * 60) / 60) * HOUR_PX }} aria-hidden="true" />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
