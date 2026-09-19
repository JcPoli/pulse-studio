import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { TopBar } from './components/TopBar'
import { Legend, type TypeFilter } from './components/Legend'
import { DaySwitch } from './components/DaySwitch'
import { Board } from './components/Board'
import { DetailPanel } from './components/DetailPanel'
import { MyClasses } from './components/MyClasses'
import { Membership } from './components/Membership'
import { Toast } from './components/Toast'
import { useBooking, type Tab } from './hooks/useBooking'
import { MON, isoDate } from './lib/schedule'

const MOBILE_QUERY = '(max-width: 980px)'
const isMobile = () => window.matchMedia(MOBILE_QUERY).matches

export default function App() {
  // "now" is fixed for the session so the schedule doesn't shift under the user mid-booking.
  const [now] = useState(() => new Date())
  const b = useBooking(now)

  const [tab, setTab] = useState<Tab>('schedule')
  const [filter, setFilter] = useState<TypeFilter>('all')
  const [selected, setSelected] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [dayIndex, setDayIndex] = useState(0)
  const colsRef = useRef<HTMLDivElement>(null)

  const selectedClass = selected ? (b.byId(selected) ?? null) : null

  const closePanel = useCallback(() => {
    setPanelOpen(false)
    document.body.style.overflow = ''
  }, [])

  const onSelect = useCallback((id: string) => {
    setSelected(id)
    setPanelOpen(true)
    if (isMobile()) document.body.style.overflow = 'hidden'
  }, [])

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
    return b.classes.filter((c) => c.date === key && (filter === 'all' || c.type === filter)).length
  }, [b.week, b.classes, dayIndex, filter])

  const range = `${MON[b.week[0].getMonth()]} ${b.week[0].getDate()} – ${MON[b.week[6].getMonth()]} ${b.week[6].getDate()} · ${b.classes.length} classes`

  return (
    <>
      <TopBar tab={tab} credits={b.credits} onTab={onTab} />

      <main className="wrap">
        <section className={tab === 'schedule' ? 'view on' : 'view'} id="v-schedule" role="tabpanel">
          <div className="shead">
            <div>
              <h1>
                This <span>week</span>
              </h1>
              <p>{range}</p>
            </div>
            <Legend value={filter} onChange={setFilter} />
          </div>
          <DaySwitch week={b.week} index={dayIndex} count={dayCount} today={now} onChange={onDayChange} />
          <div className="layout">
            <Board
              ref={colsRef}
              week={b.week}
              classes={b.classes}
              now={now}
              filter={filter}
              booked={b.booked}
              waitlist={b.waitlist}
              selected={selected}
              onSelect={onSelect}
            />
            <DetailPanel
              c={selectedClass}
              now={now}
              credits={b.credits}
              mine={!!(selected && b.booked[selected])}
              waitlisted={!!(selected && b.waitlist[selected])}
              open={panelOpen}
              onToggle={b.toggle}
              onClose={closePanel}
            />
          </div>
          <p className="note">
            <b>Demo with sample data.</b> The production build runs on Supabase — real members, live capacity shared across every phone, and pack payments. Bookings here reset on reload.
          </p>
        </section>

        <section className={tab === 'mine' ? 'view on' : 'view'} id="v-mine" role="tabpanel">
          <MyClasses upcoming={b.upcoming} waitlisted={b.waitlisted} now={now} onToggle={b.toggle} onTab={onTab} />
        </section>

        <section className={tab === 'membership' ? 'view on' : 'view'} id="v-membership" role="tabpanel">
          <Membership
            credits={b.credits}
            bookedCount={b.upcoming.length}
            waitlistCount={b.waitlisted.length}
            favouriteType={b.favouriteType}
            today={now}
            onTopUp={b.topUp}
            onPlanClick={() => b.showToast('Pack change is part of the production build')}
          />
        </section>
      </main>

      <div className={panelOpen ? 'scrim open' : 'scrim'} onClick={closePanel} aria-hidden="true" />
      <Toast message={b.toast} />
    </>
  )
}
