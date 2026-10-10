import { type CSSProperties, useEffect, useRef } from 'react'

export interface HozoWebMessage {
  /** What the page posted: as sent on the Web, parsed from JSON when it can be on React Native. */
  data: unknown
  /** The sender's origin on the Web; `undefined` on React Native, where the WebView is the sender. */
  origin?: string
}

export interface HozoWebViewProps {
  /** The page to show. */
  src?: string
  /** Inline HTML, instead of `src`. */
  srcDoc?: string
  /**
   * The frame's name: "Payment form", "Terms of service". Required -- WCAG
   * 4.1.2 asks every frame for one, and a reader that lands on a frame with
   * none says "frame" and nothing else, before the person has decided to go
   * in.
   */
  title: string
  /** Messages the page posts: `window.parent.postMessage` on the Web, `window.ReactNativeWebView.postMessage` on Native. */
  onMessage?: (message: HozoWebMessage) => void
  onLoad?: () => void
  onError?: () => void
  /** The iframe `sandbox` tokens. Web only. */
  sandbox?: string
  /** The iframe `allow` feature policy. Web only. */
  allow?: string
  /** The iframe `referrerpolicy`. Web only. */
  referrerPolicy?: React.HTMLAttributeReferrerPolicy
  className?: string
  style?: CSSProperties
  testID?: string
}

/**
 * Web content inside the application (#160): an `<iframe>` on the Web.
 *
 * It is named, because a frame without a name is one a reader cannot decide
 * whether to enter. It loads lazily, because a frame below the fold is a
 * page's worth of work for something nobody may scroll to.
 *
 * `onMessage` hears only the frame it belongs to: a message is delivered
 * when its `source` is this iframe's own window, so another frame on the
 * page, or another tab, cannot speak through it. Which origin to trust inside
 * the frame is the application's to check, on `message.origin`.
 */
export function HozoWebView({
  src,
  srcDoc,
  title,
  onMessage,
  onLoad,
  onError,
  sandbox,
  allow,
  referrerPolicy,
  className,
  style,
  testID,
}: HozoWebViewProps) {
  const frame = useRef<HTMLIFrameElement>(null)
  const latest = useRef(onMessage)
  latest.current = onMessage

  useEffect(() => {
    if (typeof window === 'undefined') return
    const listen = (event: MessageEvent) => {
      if (event.source === null || event.source !== frame.current?.contentWindow) return
      latest.current?.({ data: event.data, origin: event.origin })
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [])

  return (
    <iframe
      ref={frame}
      src={src}
      srcDoc={srcDoc}
      title={title}
      loading="lazy"
      sandbox={sandbox}
      allow={allow}
      referrerPolicy={referrerPolicy}
      className={className}
      style={style}
      data-testid={testID}
      onLoad={onLoad}
      onError={onError}
    />
  )
}

export { HozoWebView as WebView, type HozoWebViewProps as WebViewProps }
