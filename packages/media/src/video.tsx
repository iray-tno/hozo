import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { DomVideoSession } from './dom-session.ts'
import { type VideoProps, validateVideoProps } from './types.ts'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const element = useRef<HTMLVideoElement>(null)
  const session = useRef<DomVideoSession | null>(null)
  const latest = useRef(props)
  latest.current = props

  function requireSession() {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current
  }

  // Initialize before publishing the ref: a present handle is usable even
  // in a parent's layout effect, not only after passive effects have run.
  useLayoutEffect(() => {
    if (!element.current) return
    const controller = new DomVideoSession(element.current, props.src, () => latest.current)
    session.current = controller
    controller.start(latest.current)
    return () => {
      session.current = null
      controller.dispose()
    }
  }, [props.src])

  useImperativeHandle(props.ref, () => ({
    play: async () => requireSession().play(),
    pause: () => session.current?.pause(),
    seekTo: (seconds) => requireSession().seekTo(seconds),
    getStatus: () => requireSession().getStatus(),
  }))

  useEffect(() => {
    session.current?.setOptions({ autoPlay: props.autoPlay, loop: props.loop, muted: props.muted })
  }, [props.autoPlay, props.loop, props.muted])

  return (
    <video
      ref={element}
      src={props.src}
      controls={props.controls ?? true}
      playsInline={props.playsInline ?? true}
      loop={props.loop}
      muted={props.muted}
      preload="metadata"
      aria-label={props.accessibilityLabel}
      data-testid={props.testID}
      style={{ width: '100%', height: 180, ...props.style, objectFit: props.fit ?? 'contain' }}
    />
  )
}
