import type { Tab } from '../hooks/useBooking'
import { PACK_SIZE } from '../data/catalog'

const TABS: { id: Tab; label: string }[] = [
  { id: 'schedule', label: 'Schedule' },
  { id: 'mine', label: 'My classes' },
  { id: 'membership', label: 'Membership' },
]

interface Props {
  tab: Tab
  credits: number
  onTab: (t: Tab) => void
}

export function TopBar({ tab, credits, onTab }: Props) {
  return (
    <div className="wrap top">
      <div className="bar">
        <div className="brand">
          <span className="mark" aria-hidden="true">P</span>
          <b>Pulse</b>
        </div>
        <div className="tabs" role="tablist" aria-label="Sections">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              aria-controls={`v-${t.id}`}
              onClick={() => onTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="credit-chip" aria-label={`${credits} credits left`}>
          <b className="num">{credits}</b>
          <span className="cells" aria-hidden="true">
            {Array.from({ length: PACK_SIZE }, (_, i) => (
              <i key={i} className={i < Math.min(PACK_SIZE, credits) ? 'on' : undefined} />
            ))}
          </span>
        </div>
      </div>
    </div>
  )
}
