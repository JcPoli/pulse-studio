interface Props {
  message: string | null
}

export function Toast({ message }: Props) {
  return (
    <div className={message ? 'toast show' : 'toast'} role="status" aria-live="polite">
      {message}
    </div>
  )
}
