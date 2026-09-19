import { PACK_SIZE, TYPES, type ClassType } from '../data/catalog'
import { MON } from '../lib/schedule'

interface Props {
  credits: number
  bookedCount: number
  waitlistCount: number
  favouriteType: ClassType | null
  today: Date
  onTopUp: () => void
  onPlanClick: () => void
}

const PLANS = [
  { size: '10', desc: 'classes · ₱3,200', note: 'Current', current: true },
  { size: '20', desc: 'classes · ₱5,600', note: 'Save 12%', current: false },
  { size: '∞', desc: 'monthly unlimited · ₱4,900', note: 'Popular', current: false },
]

export function Membership({ credits, bookedCount, waitlistCount, favouriteType, today, onTopUp, onPlanClick }: Props) {
  const used = Math.max(0, PACK_SIZE - credits)
  const extra = credits > PACK_SIZE ? credits - PACK_SIZE : 0
  const renews = `${MON[(today.getMonth() + 1) % 12]} 1`

  return (
    <>
      <div className="shead">
        <div>
          <h1>
            Your <span>membership</span>
          </h1>
          <p>Credits never expire while your pack is active.</p>
        </div>
      </div>
      <div className="mem">
        <div className="card lime">
          <div className="eyebrow">{PACK_SIZE}-class pack</div>
          <div className="big">
            <span className="num">{credits}</span> credits left
          </div>
          <div className="cells10" aria-hidden="true">
            {Array.from({ length: PACK_SIZE }, (_, i) => (
              <i key={i} className={i < Math.min(PACK_SIZE, credits) ? 'on' : undefined} />
            ))}
          </div>
          <div className="foot">
            <span>
              {used} used{extra ? ` · +${extra} extra` : ''}
            </span>
            <span>
              Renews <b>{renews}</b>
            </span>
          </div>
          <button type="button" className="btn" onClick={onTopUp}>
            Add another pack · ₱3,200
          </button>
        </div>
        <div className="card">
          <h4>Activity</h4>
          <div className="stat">
            <span>Booked this week</span>
            <b className="num">{bookedCount}</b>
          </div>
          <div className="stat">
            <span>On waitlists</span>
            <b className="num">{waitlistCount}</b>
          </div>
          <div className="stat">
            <span>Favourite type</span>
            <b>{favouriteType ? TYPES[favouriteType].label : '—'}</b>
          </div>
          <div className="stat">
            <span>Member since</span>
            <b>Mar 2026</b>
          </div>
          <h4 style={{ marginTop: 22 }}>Packs</h4>
          <div className="plans">
            {PLANS.map((p) => (
              <button
                key={p.size}
                type="button"
                className={p.current ? 'plan cur' : 'plan'}
                aria-current={p.current ? 'true' : undefined}
                onClick={p.current ? undefined : onPlanClick}
              >
                <b>{p.size}</b>
                <span>{p.desc}</span>
                <em>{p.note}</em>
              </button>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
