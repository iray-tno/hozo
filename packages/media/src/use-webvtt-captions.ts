import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MediaCue } from './caption-types.ts'
import { parsePlainTextWebVTT, WebVTTParseError } from './webvtt.ts'
import type {
  WebVTTCaptionsOptions,
  WebVTTCaptionsResult,
  WebVTTTextLoader,
} from './webvtt-loading-types.ts'

const emptyCues: readonly MediaCue[] = Object.freeze([])

const fetchText: WebVTTTextLoader = async (src, signal) => {
  const response = await fetch(src, { signal })
  // fetch resolves for HTTP errors too; never parse an error page as a track.
  if (!response.ok) throw new Error(`Caption request failed (HTTP ${response.status})`)
  return response.text()
}

export function useWebVTTCaptions({
  mediaSrc,
  trackSrc,
  enabled = true,
  loadText = fetchText,
}: WebVTTCaptionsOptions): WebVTTCaptionsResult {
  if (!mediaSrc.trim()) throw new TypeError('Caption loading requires a nonempty mediaSrc')
  if (trackSrc !== null && !trackSrc.trim())
    throw new TypeError('Caption loading requires a nonempty trackSrc or null')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  // Identity, not just URL equality: A -> B -> A and retries are fresh requests.
  // Checking during render also hides old cues before effect cleanup can run.
  const request = useMemo(
    () => ({ mediaSrc, trackSrc, enabled, loadText, revision }),
    [mediaSrc, trackSrc, enabled, loadText, revision],
  )
  const [settled, setSettled] = useState<{
    request: typeof request
    result: WebVTTCaptionsResult
  } | null>(null)

  useEffect(() => {
    if (!request.enabled || request.trackSrc === null) return
    const controller = new AbortController()
    let active = true
    const track = request.trackSrc
    const read = async () => {
      let operation: 'load' | 'parse' = 'load'
      try {
        const text = await request.loadText(track, controller.signal)
        if (!active) return
        operation = 'parse'
        const cues = parsePlainTextWebVTT(text)
        setSettled({
          request,
          result: {
            mediaSrc: request.mediaSrc,
            trackSrc: track,
            status: 'ready',
            cues,
            error: null,
            reload,
          },
        })
      } catch (cause) {
        // Abortion is an optimization, not our correctness mechanism: custom
        // loaders and some transports can still complete after cancellation.
        if (!active) return
        setSettled({
          request,
          result: {
            mediaSrc: request.mediaSrc,
            trackSrc: track,
            status: 'error',
            cues: emptyCues,
            error: {
              mediaSrc: request.mediaSrc,
              trackSrc: track,
              operation,
              message: cause instanceof Error ? cause.message : String(cause),
              code: operation === 'parse' && cause instanceof WebVTTParseError ? cause.code : null,
              line: operation === 'parse' && cause instanceof WebVTTParseError ? cause.line : null,
            },
            reload,
          },
        })
      }
    }
    void read()
    return () => {
      active = false
      controller.abort()
    }
  }, [request, reload])

  if (settled?.request === request) return settled.result
  return {
    mediaSrc,
    trackSrc,
    status: enabled && trackSrc !== null ? 'loading' : 'idle',
    cues: emptyCues,
    error: null,
    reload,
  }
}
