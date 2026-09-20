import { forwardRef, useCallback, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react'
import { DOW, isPast, isoDate, pad, type StudioClass } from '../lib/schedule'
import { buildScale } from '../lib/boardScale'
import { isNavKey, locate, nextBlock } from '../lib/boardNav'
import { ClassBlock } from './ClassBlock'
import { matches, type ClassFilter } from '../lib/filter'

interface Props {
  week: Date[]
  classes: StudioClass[]
  now: Date
  filter: ClassFilter
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

  // The forwarded ref belongs to App, which scrolls the columns from the day switcher; this one
  // is Board's own handle on the same node, for moving focus between blocks.
  const colsEl = useRef<HTMLDivElement | null>(null)
  const setCols = useCallback(
    (node: HTMLDivElement | null) => {
      colsEl.current = node
      if (typeof colsRef === 'function') colsRef(node)
      else if (colsRef) colsRef.current = node
    },
    [colsRef],
  )

  /** What each day column draws, in the order it draws it. */
  const columns = useMemo(
    () =>
      week.map((d) => {
        const key = isoDate(d)
        return classes.filter((c) => c.date === key && matches(c, filter))
      }),
    [week, classes, filter],
  )

  // Past blocks render `disabled`, and a disabled button cannot take focus, so the arrow keys
  // walk this reduced view instead of aiming at a hole and leaving focus where it was.
  const reachable = useMemo(() => columns.map((col) => col.filter((c) => !isPast(c, now))), [columns, now])

  const [activeId, setActiveId] = useState<string | null>(null)

  /**
   * The board is one tab stop, not thirty-one. The columns are day-major in the DOM, so Tab
   * used to walk all of Monday before reaching Tuesday, and Saturday's noon class — the
   * twenty-ninth block of the week — was twenty-nine presses away. The arrow keys move within
   * the grid instead, which is the roving-tabindex half of that bargain.
   *
   * Derived rather than stored, because everything that can make the remembered block vanish —
   * a type filter, a week change, a class simply starting — has to leave a tab stop behind.
   */
  const tabStopId = useMemo(() => {
    const flat = reachable.flat()
    if (activeId && flat.some((c) => c.id === activeId)) return activeId
    const today = reachable[week.findIndex((d) => isoDate(d) === todayKey)]
    return today?.[0]?.id ?? flat[0]?.id ?? null
  }, [reachable, activeId, week, todayKey])

  /** Clicking a block focuses it too, so the tab stop follows focus wherever it came from. */
  const onFocus = useCallback((e: FocusEvent<HTMLDivElement>) => {
    const id = (e.target as HTMLElement).dataset?.id
    if (id) setActiveId(id)
  }, [])

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLDivElement>) => {
      const id = (e.target as HTMLElement).dataset?.id
      if (!id || !isNavKey(e.key) || !locate(reachable, id)) return
      // Only once the key is one we own and the target is a block we know: an unhandled key has
      // to keep its default, and a handled one must not also scroll the board under the focus
      // it just moved.
      e.preventDefault()
      const target = nextBlock(reachable, id, e.key)
      if (!target || target.id === id) return
      setActiveId(target.id)
      colsEl.current?.querySelector<HTMLElement>(`.blk[data-id="${CSS.escape(target.id)}"]`)?.focus()
    },
    [reachable],
  )

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
      {/* Absolutely positioned by .sr-only, so this sits outside the flex row it is a child of. */}
      <p id="boardkeys" className="sr-only">
        Left and right arrow keys move between days, up and down between the classes in a day. Home and End jump to
        the first and last class of a day. Enter opens the class.
      </p>
      {/* Deliberately not role="grid". The DOM here is column-major — one element per day, with
          absolutely positioned blocks inside it on a piecewise scale — so row/gridcell semantics
          would describe a table that does not exist. The blocks are buttons that already name
          their own day, time, coach and status; the arrow keys are a convenience on top. */}
      <div className="cols" ref={setCols} role="group" aria-label="Class board" aria-describedby="boardkeys" onFocus={onFocus} onKeyDown={onKeyDown}>
        {week.map((d, di) => {
          const key = isoDate(d)
          const isToday = key === todayKey
          const dayClasses = columns[di]
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
                    tabIndex={c.id === tabStopId ? 0 : -1}
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
