import { COACHES, TYPES, TYPE_KEYS, type CoachName } from '../data/catalog'
import { SLOTS, SLOT_KEYS, isEmptyFilter, toggleIn, type ClassFilter } from '../lib/filter'

interface Props {
  value: ClassFilter
  onChange: (f: ClassFilter) => void
}

const COACH_KEYS = Object.keys(COACHES) as CoachName[]

/**
 * Three chip rows over one filter object. The type row doubles as the board's colour key, which
 * is why it keeps the `.legend` class and stays first — it was the legend before it was a filter.
 */
export function Filters({ value, onChange }: Props) {
  const empty = isEmptyFilter(value)

  return (
    <div className="filters">
      <div className="legend" role="group" aria-label="Filter by class type">
        {/* "All" is the absence of a filter rather than a value in it, so it clears the row it
            belongs to and leaves the other two alone. */}
        <button type="button" aria-pressed={value.types.length === 0} onClick={() => onChange({ ...value, types: [] })}>
          All
        </button>
        {TYPE_KEYS.map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={value.types.includes(k)}
            onClick={() => onChange({ ...value, types: toggleIn(value.types, k) })}
          >
            <i style={{ background: TYPES[k].fg }} aria-hidden="true" />
            {TYPES[k].label}
          </button>
        ))}
      </div>

      <div className="legend" role="group" aria-label="Filter by time of day and coach">
        {SLOT_KEYS.map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={value.slots.includes(s)}
            onClick={() => onChange({ ...value, slots: toggleIn(value.slots, s) })}
          >
            {SLOTS[s].label}
          </button>
        ))}
        <span className="sep" aria-hidden="true" />
        {COACH_KEYS.map((n) => (
          <button
            key={n}
            type="button"
            className="coachchip"
            // One coach at a time, so pressing the pressed one clears it rather than adding.
            aria-pressed={value.coach === n}
            onClick={() => onChange({ ...value, coach: value.coach === n ? null : n })}
          >
            <i style={{ background: COACHES[n].color }} aria-hidden="true" />
            {n}
          </button>
        ))}
        {/* Only rendered while it would do something: a permanent dead Clear is noise. */}
        {!empty && (
          <button type="button" className="clearchip" onClick={() => onChange({ types: [], slots: [], coach: null })}>
            Clear
          </button>
        )}
      </div>
    </div>
  )
}
