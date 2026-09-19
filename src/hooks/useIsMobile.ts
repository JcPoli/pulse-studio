import { useEffect, useState } from 'react'

/** Matches the 980px breakpoint where .panel stops being a sticky aside and becomes a modal sheet. */
export const MOBILE_QUERY = '(max-width: 980px)'

export const isMobile = (): boolean => window.matchMedia(MOBILE_QUERY).matches

/** Reactive version, for the bits of markup that differ between the aside and the sheet. */
export function useIsMobile(): boolean {
  const [mobile, setMobile] = useState(isMobile)
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY)
    const onChange = () => setMobile(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return mobile
}
