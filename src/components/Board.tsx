import { forwardRef, useMemo } from 'react'
import { DOW, isoDate, pad, type StudioClass } from '../lib/schedule'
import { buildScale } from '../lib/boardScale'
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

/** The weekly grid. `ref` lands on the scrolling columns wrapper so the mobile day switcher can drive it. */
export const Board = forwardRef<HTMLDivElement, Props>(function Board(
  { week, classes, now, filter, booked, waitlist, selected, onSelect },
  colsRef,
) {
  const todayKey = isoDate(now)
  const nowMin = now.getHours() * 60 + now.getMinutes()
  // Unfiltered on purpose, so picking a type filter does not reflow the grid.
  const scale = useMemo(() => buildScale(classes), [classes])
  const showNowLine = nowMin > scale.startMin && nowMin < scale.endMin && !scale.inGap(nowMin)

  return (
    <div className="board">
      <div className="rail" aria-hidden="true">
        <div className="h" />
        {scale.rows.map((r, i) =>
          r.kind === 'hour' ? (
            // Hour labels straddle the row's top edge, which after a band would collide with
            // the band's own label — `after-gap` drops this one inside its row instead.
            <div
              className={scale.rows[i - 1]?.kind === 'gap' ? 't after-gap' : 't'}
              key={`h${r.hour}`}
              style={{ height: r.h }}
            >
              {/* The first label would overflow above the board, so it stays blank. */}
              <span>{r.y === 0 ? '' : `${pad(r.hour)}:00`}</span>
            </div>
          ) : (
            <div className="gap" key={`g${r.fromHour}`} style={{ height: r.h }}>
              <span>
                {pad(r.fromHour)}–{pad(r.toHour)}
              </span>
            </div>
          ),
        )}
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
              <div className="body" style={{ height: scale.height, backgroundImage: scale.background }}>
                {scale.gaps.map((g) => (
                  <div className="gapband" key={g.y} style={{ top: g.y, height: g.h }} aria-hidden="true" />
                ))}
                {dayClasses.map((c) => (
                  <ClassBlock
                    key={c.id}
                    c={c}
                    now={now}
                    scale={scale}
                    mine={!!booked[c.id]}
                    waitlisted={!!waitlist[c.id]}
                    selected={selected === c.id}
                    onSelect={onSelect}
                  />
                ))}
                {isToday && showNowLine && (
                  <div className="nowline" style={{ top: scale.yOf(nowMin) }} aria-hidden="true" />
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
})
