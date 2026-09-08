import { useEffect, useRef } from 'react'
import { Linking } from 'react-native'

import { type DeepLinkEvent, type DeepLinkSource, parseDeepLink } from './deep-link-event.ts'
import { subscribeToNativeDeepLinks } from './native-deep-link-subscription.ts'

export type { DeepLinkEvent, DeepLinkSource }
export { parseDeepLink }

export interface UseDeepLinkOptions {
  /** Deliver the cold-start URL when the application first mounts. Defaults to true. */
  initial?: boolean
}

/** Unifies React Native cold-start and foreground deep-link arrivals. */
export function useDeepLink(
  callback: (event: DeepLinkEvent) => void,
  { initial = true }: UseDeepLinkOptions = {},
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    return subscribeToNativeDeepLinks(Linking, (event) => callbackRef.current(event), initial)
  }, [initial])
}
