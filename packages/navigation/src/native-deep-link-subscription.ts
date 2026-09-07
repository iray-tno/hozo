import { createDeepLinkDispatcher, type DeepLinkEvent } from './deep-link-event.ts'

export interface NativeLinkingSubscription {
  remove(): void
}

export interface NativeLinkingLike {
  getInitialURL(): Promise<string | null | undefined>
  addEventListener(
    event: 'url',
    listener: (event: { url: string }) => void,
  ): NativeLinkingSubscription
}

/** Installs the hot listener before beginning the asynchronous cold-start read. */
export function subscribeToNativeDeepLinks(
  linking: NativeLinkingLike,
  callback: (event: DeepLinkEvent) => void,
  initial: boolean,
): () => void {
  let active = true
  let receivedEvent = false
  const dispatch = createDeepLinkDispatcher(callback)
  const subscription = linking.addEventListener('url', ({ url }) => {
    if (!active) return
    receivedEvent = true
    dispatch(url, 'event')
  })

  if (initial) {
    void linking
      .getInitialURL()
      .then((url) => {
        if (active && !receivedEvent && url) dispatch(url, 'initial')
      })
      .catch(() => {})
  }

  return () => {
    active = false
    subscription.remove()
  }
}
