import { TYPES, TYPE_KEYS, type ClassType } from '../data/catalog'

export type TypeFilter = ClassType | 'all'

interface Props {
  value: TypeFilter
  onChange: (t: TypeFilter) => void
}

export function Legend({ value, onChange }: Props) {
  return (
    <div className="legend" role="group" aria-label="Filter by class type">
      <button type="button" aria-pressed={value === 'all'} onClick={() => onChange('all')}>
        All
      </button>
      {TYPE_KEYS.map((k) => (
        <button key={k} type="button" aria-pressed={value === k} onClick={() => onChange(k)}>
          <i style={{ background: TYPES[k].fg }} aria-hidden="true" />
          {TYPES[k].label}
        </button>
      ))}
    </div>
  )
}
