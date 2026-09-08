import { useEffect, useRef } from 'react'

import {
  createDeepLinkDispatcher,
  type DeepLinkEvent,
  type DeepLinkSource,
  parseDeepLink,
} from './deep-link-event.ts'

export type { DeepLinkEvent, DeepLinkSource }
export { parseDeepLink }

export interface UseDeepLinkOptions {
  /** Deliver the URL present when the application first mounts. Defaults to true. */
  initial?: boolean
}

/** Observes browser URL ingress without taking ownership of application routing. */
export function useDeepLink(
  callback: (event: DeepLinkEvent) => void,
  { initial = true }: UseDeepLinkOptions = {},
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (typeof window === 'undefined') return
    const dispatch = createDeepLinkDispatcher((event) => callbackRef.current(event))
    const onLocation = () => dispatch(window.location.href, 'event')

    if (initial) dispatch(window.location.href, 'initial')
    window.addEventListener('popstate', onLocation)
    window.addEventListener('hashchange', onLocation)
    return () => {
      window.removeEventListener('popstate', onLocation)
      window.removeEventListener('hashchange', onLocation)
    }
  }, [initial])
}
