import type { ToastState } from '../hooks/useBooking'

interface Props {
  toast: ToastState | null
}

export function Toast({ toast }: Props) {
  return (
    <div className={toast ? 'toast show' : 'toast'} role="status" aria-live="polite">
      {toast?.message}
      {toast?.undo && (
        <button type="button" className="undo" onClick={toast.undo}>
          Undo
        </button>
      )}
    </div>
  )
}
