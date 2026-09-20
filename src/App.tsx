import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { Filters } from './components/Filters'
import { DaySwitch } from './components/DaySwitch'
import { Board } from './components/Board'
import { DetailPanel } from './components/DetailPanel'
import { MyClasses } from './components/MyClasses'
import { Membership } from './components/Membership'
import { Toast } from './components/Toast'
import { MAX_WEEK_OFFSET, useBooking, type Tab } from './hooks/useBooking'
import { isMobile } from './hooks/useIsMobile'
import type { CoachName } from './data/catalog'
import { MON, isPast, isoDate, startOfDay } from './lib/schedule'
import { locationHref, parseLocation } from './lib/deeplink'
import { EMPTY_FILTER, describeFilter, isEmptyFilter, matches, type ClassFilter } from './lib/filter'

export default function App() {
  // `anchor` fixes the first day of the generated horizon, so the grid never reshuffles while
  // it is the same day. It advances at midnight — see below.
  const [anchor, setAnchor] = useState(() => new Date())
  // `clock` is the live one: it greys out classes as they start, walks the now-line down the
  // board, and closes the cancellation window. It only re-renders on a minute boundary.
  const [clock, setClock] = useState(() => new Date())
  useEffect(() => {
    const tick = window.setInterval(() => {
      setClock((prev) => {
        const next = new Date()
        // The day is part of the comparison, not just the time: a tab frozen for exactly
        // twenty-four hours would otherwise wake to a matching hour and minute and decide
        // nothing had changed, which is the one case that could keep the date stale.
        const same =
          next.getDate() === prev.getDate() &&
          next.getHours() === prev.getHours() &&
          next.getMinutes() === prev.getMinutes()
        return same ? prev : next
      })
    }, 30_000)
    return () => window.clearInterval(tick)
  }, [])

  // Midnight. A tab left open overnight kept yesterday as the board's first column, and
  // DaySwitch compares that column against the live clock to decide what to call "Today" — so
  // it found no match and labelled today's column by weekday instead. Advancing the anchor
  // rebuilds the horizon from the new today. The bookings are in state, not derived from the
  // anchor, so nothing is lost when the day rolls over.
  useEffect(() => {
    if (isoDate(clock) !== isoDate(anchor)) setAnchor(clock)
  }, [clock, anchor])

  // Read once, at mount, from the link that opened the app. After this the URL is an output of
  // state and never an input again — one direction only, so the two cannot fight.
  const [entry] = useState(() => parseLocation(window.location.search, MAX_WEEK_OFFSET))

  const [weekOffset, setWeekOffset] = useState(entry.weekOffset)
  const b = useBooking(anchor, weekOffset)

  const [tab, setTab] = useState<Tab>(entry.tab)
  const [filter, setFilter] = useState<ClassFilter>(EMPTY_FILTER)
  const [selected, setSelected] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [dayIndex, setDayIndex] = useState(0)
  const colsRef = useRef<HTMLDivElement>(null)
  /** True while a history entry of ours is on the stack, so Back closes the sheet. */
  const pushedRef = useRef(false)

  const selectedClass = selected ? (b.byId(selected) ?? null) : null

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    document.body.style.overflow = ''
    if (pushedRef.current) {
      pushedRef.current = false
      window.history.back()
    }
  }, [])

  const onSelect = useCallback((id: string) => {
    setSelected(id)
    setPanelOpen(true)
    if (isMobile()) {
      document.body.style.overflow = 'hidden'
      // The sheet is a modal, so the phone's Back gesture should dismiss it rather than leave
      // the app. Same URL, so this needs no router and no server rewrite.
      if (!pushedRef.current) {
        window.history.pushState({ pulsePanel: true }, '')
        pushedRef.current = true
      }
    }
  }, [])

  // The panel follows the booking rather than the slot just vacated: the member is looking at
  // what they hold now, and the toast's Undo can put it back without the view jumping again.
  const onReschedule = useCallback(
    (fromId: string, toId: string) => {
      b.reschedule(fromId, toId, setSelected)
    },
    [b.reschedule],
  )

  // Back / swipe-back while the sheet is up: our entry is already gone, so just close. The
  // selection is dropped with it, which is what lets the URL effect below take `?c=` back off.
  useEffect(() => {
    const onPop = () => {
      if (!pushedRef.current) return
      pushedRef.current = false
      setPanelOpen(false)
      setSelected(null)
      document.body.style.overflow = ''
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  // A class named in the opening link. Resolved here rather than in the initialiser because it
  // has to be looked up in the horizon, and dropped quietly if it is not there: a link shared
  // last week points at a class that no longer exists, and that should land on the schedule
  // rather than on an empty panel. The week follows the class, so `?c=` alone is a whole link —
  // there is no way to arrive with a class from week three while looking at week one.
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current || entry.classId === null) return
    openedRef.current = true
    const c = b.byId(entry.classId)
    if (!c || isPast(c, new Date())) return
    const days = Math.round((startOfDay(c.when).getTime() - startOfDay(anchor).getTime()) / 86_400_000)
    setWeekOffset(Math.min(Math.max(Math.floor(days / 7), 0), MAX_WEEK_OFFSET))
    onSelect(c.id)
  }, [entry.classId, b, anchor, onSelect])

  // Tapping the coach in the panel filters the board to them, clearing everything else: the
  // question being asked is "what does Maya teach", not "what does Maya teach that also
  // matches what I had narrowed down before". The panel closes because the answer is behind it.
  const onCoach = useCallback(
    (name: CoachName) => {
      setFilter({ ...EMPTY_FILTER, coach: name })
      setTab('schedule')
      closePanel()
      b.showToast(`Showing ${name}'s classes`)
    },
    [closePanel, b.showToast],
  )

  // Sharing is just handing over the address bar, since the effect below keeps it correct. The
  // clipboard can refuse — a denied permission, an insecure context — and the fallback says
  // where the link is rather than pretending the copy worked.
  const onShare = useCallback(() => {
    navigator.clipboard?.writeText(window.location.href).then(
      () => b.showToast('Link copied'),
      () => b.showToast('Copy blocked — the link is in the address bar'),
    )
  }, [b.showToast])

  // The address bar mirrors the view: replace, never push, because the only history entry this
  // app owns is the one the mobile sheet pushes for the Back gesture.
  useEffect(() => {
    const href = locationHref({ tab, weekOffset, classId: selected }, window.location.pathname)
    if (href !== window.location.pathname + window.location.search) {
      window.history.replaceState(window.history.state, '', href)
    }
  }, [tab, weekOffset, selected])

  const changeWeek = useCallback(
    (next: number) => {
      if (next < 0 || next > MAX_WEEK_OFFSET) return
      setWeekOffset(next)
      setDayIndex(0)
      setSelected(null)
      closePanel()
      colsRef.current?.scrollTo({ left: 0 })
    },
    [closePanel],
  )

  const onTab = useCallback(
    (t: Tab) => {
      setTab(t)
      if (t !== 'schedule') closePanel()
    },
    [closePanel],
  )

  // Escape closes the detail panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && panelOpen) closePanel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen, closePanel])

  // Mobile: prev/next scrolls the board one day-column; swiping updates the label.
  const scrollToDay = useCallback((i: number) => {
    const cols = colsRef.current
    if (!cols) return
    const col = cols.querySelector<HTMLElement>(`.col[data-di="${i}"]`)
    if (col) cols.scrollTo({ left: col.offsetLeft, behavior: 'smooth' })
  }, [])
  const onDayChange = useCallback(
    (i: number) => {
      setDayIndex(i)
      scrollToDay(i)
    },
    [scrollToDay],
  )
  useEffect(() => {
    const cols = colsRef.current
    if (!cols) return
    let t: number | undefined
    const onScroll = () => {
      if (!isMobile()) return
      window.clearTimeout(t)
      t = window.setTimeout(() => {
        const w = cols.clientWidth
        if (!w) return
        const i = Math.round(cols.scrollLeft / w)
        if (i >= 0 && i <= 6) setDayIndex(i)
      }, 80)
    }
    cols.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cols.removeEventListener('scroll', onScroll)
      window.clearTimeout(t)
    }
  }, [tab])

  const dayCount = useMemo(() => {
    const key = isoDate(b.week[dayIndex])
    return b.classes.filter((c) => c.date === key && matches(c, filter)).length
  }, [b.week, b.classes, dayIndex, filter])

  /** Only a booking of the member's own can be moved, so anything else gets an empty list. */
  const alternatives = useMemo(
    () => (selectedClass && b.booked[selectedClass.id] ? b.alternatives(selectedClass, clock) : []),
    [selectedClass, b.booked, b.alternatives, clock],
  )

  /** Whole-week total for the active filter, so a filter with no matches says so. */
  const weekCount = useMemo(
    () => b.classes.filter((c) => matches(c, filter)).length,
    [b.classes, filter],
  )

  // With a filter on, the count says how much of the week survived it rather than how big the
  // week is — "8 of 31" is the useful number once you have narrowed something down.
  const span = `${MON[b.week[0].getMonth()]} ${b.week[0].getDate()} – ${MON[b.week[6].getMonth()]} ${b.week[6].getDate()}`
  const range = isEmptyFilter(filter)
    ? `${span} · ${b.classes.length} classes`
    : `${span} · ${weekCount} of ${b.classes.length} classes`

  return (
    <>
      <TopBar tab={tab} credits={b.credits} onTab={onTab} />

      <main className="wrap">
        <section className={tab === 'schedule' ? 'view on' : 'view'} id="v-schedule" role="tabpanel">
          <div className="shead">
            <div>
              <h1>
                {weekOffset === 0 ? 'This' : weekOffset === 1 ? 'Next' : `In ${weekOffset}`} <span>week{weekOffset > 1 ? 's' : ''}</span>
              </h1>
              <div className="weeknav">
                <button
                  type="button"
                  className="arrow"
                  aria-label="Previous week"
                  disabled={weekOffset === 0}
                  onClick={() => changeWeek(weekOffset - 1)}
                >
                  ‹
                </button>
                <p aria-live="polite">{range}</p>
                <button
                  type="button"
                  className="arrow"
                  aria-label="Next week"
                  disabled={weekOffset === MAX_WEEK_OFFSET}
                  onClick={() => changeWeek(weekOffset + 1)}
                >
                  ›
                </button>
              </div>
            </div>
            <Filters value={filter} onChange={setFilter} />
          </div>
          <DaySwitch week={b.week} index={dayIndex} count={dayCount} today={clock} onChange={onDayChange} />
          <div className="layout">
            {weekCount === 0 ? (
              <div className="emptyb">
                No {describeFilter(filter)} this week.{' '}
                <button type="button" onClick={() => setFilter(EMPTY_FILTER)}>
                  Clear the filter
                </button>
              </div>
            ) : (
              <Board
                ref={colsRef}
                week={b.week}
                classes={b.classes}
                now={clock}
                filter={filter}
                booked={b.booked}
                waitlist={b.waitlist}
                selected={selected}
                onSelect={onSelect}
              />
            )}
            <DetailPanel
              c={selectedClass}
              now={clock}
              credits={b.credits}
              mine={!!(selected && b.booked[selected])}
              waitlisted={!!(selected && b.waitlist[selected])}
              open={panelOpen}
              alternatives={alternatives}
              onToggle={b.toggle}
              onReschedule={onReschedule}
              onShare={onShare}
              onCoach={onCoach}
              onClose={closePanel}
            />
          </div>
          <p className="note">
            <b>Demo with sample data.</b> The production build runs on Supabase — real members, live capacity shared across every phone, and pack payments. Bookings are saved in this browser only.
          </p>
        </section>

        <section className={tab === 'mine' ? 'view on' : 'view'} id="v-mine" role="tabpanel">
          <MyClasses upcoming={b.upcoming} waitlisted={b.waitlisted} now={clock} onToggle={b.toggle} onTab={onTab} />
        </section>

        <section className={tab === 'membership' ? 'view on' : 'view'} id="v-membership" role="tabpanel">
          <Membership
            credits={b.credits}
            bookedCount={b.upcoming.length}
            waitlistCount={b.waitlisted.length}
            stats={b.stats}
            today={anchor}
            onTopUp={b.topUp}
            onPlanClick={() => b.showToast('Pack change is part of the production build')}
          />
        </section>
      </main>

      <div className={panelOpen ? 'scrim open' : 'scrim'} onClick={closePanel} aria-hidden="true" />
      <Toast toast={b.toast} />
    </>
  )
}
