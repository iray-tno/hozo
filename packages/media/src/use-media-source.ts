import { useCallback, useEffect, useMemo, useState } from 'react'
import type { MediaSourceError, MediaSourceOptions, MediaSourceResult } from './source-types.ts'
import { resolveMediaURI } from './source-uri.ts'

export function useMediaSource<T>({
  source,
  resolveSource,
  enabled = true,
}: MediaSourceOptions<T>): MediaSourceResult<T> {
  if (typeof resolveSource !== 'function') throw new TypeError('Media source requires a resolver')
  const [revision, setRevision] = useState(0)
  const reload = useCallback(() => setRevision((value) => value + 1), [])
  // Retire by request identity, including A -> B -> A and explicit refresh.
  // Checking in render hides the old URI before cleanup can run.
  const request = useMemo(
    () => ({ source, resolveSource, enabled, revision }),
    [source, resolveSource, enabled, revision],
  )
  const [settled, setSettled] = useState<{
    request: typeof request
    uri: string | null
    error: MediaSourceError<T> | null
  } | null>(null)

  useEffect(() => {
    if (!request.enabled || request.source === null) return
    const controller = new AbortController()
    let active = true
    const selected = request.source
    const resolve = async () => {
      try {
        const uri = await request.resolveSource(selected, controller.signal)
        if (!active) return
        setSettled({ request, uri: resolveMediaURI(uri), error: null })
      } catch (cause) {
        // Expo downloads cannot be canceled through this API. Late results
        // remain retired even when a custom resolver ignores the abort signal.
        if (!active) return
        setSettled({
          request,
          uri: null,
          error: {
            source: selected,
            operation: 'resolve',
            message: cause instanceof Error ? cause.message : String(cause),
          },
        })
      }
    }
    void resolve()
    return () => {
      active = false
      // Signal lifetime continues after success: custom resolvers may release
      // their owned temporary URI here. SDK caches/files are not ours to delete.
      controller.abort()
    }
  }, [request])

  const current = settled?.request === request ? settled : null
  return {
    source,
    status:
      !enabled || source === null
        ? 'idle'
        : current
          ? current.error
            ? 'error'
            : 'ready'
          : 'loading',
    uri: current?.uri ?? null,
    error: current?.error ? { ...current.error } : null,
    reload,
  }
}
