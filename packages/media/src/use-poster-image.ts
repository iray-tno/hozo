import { useLayoutEffect, useRef, useState } from 'react'
import type { VideoPosterError } from './types.ts'

/** The keyed image, not the decoder, owns failure and late-image-event retirement. */
export function usePosterImage(
  src: string,
  poster: string,
  onError: ((error: VideoPosterError) => void) | undefined,
) {
  const active = useRef(false)
  const failed = useRef(false)
  const latest = useRef(onError)
  latest.current = onError
  const [hidden, setHidden] = useState(false)
  useLayoutEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  return {
    hidden,
    fail(message: string) {
      if (!active.current || failed.current) return
      failed.current = true
      setHidden(true)
      latest.current?.({ src, poster, message })
    },
  }
}
