import { createVideoPlayer, type VideoPlayer, VideoView } from 'expo-video'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { NativeVideoSession } from './native-session.ts'
import { type VideoProps, validateVideoProps } from './types.ts'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const [resource, setResource] = useState<VideoResource | null>(null)
  const [hasLayout, setHasLayout] = useState(false)
  const latest = useRef(props)
  latest.current = props
  const session = useRef<VideoResource | null>(null)

  function requireSession() {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current.controller
  }

  useLayoutEffect(() => {
    // Native resources belong to a committed host, never an abandoned render.
    // Effect replay gets a fresh resource instead of reusing a released player.
    const player = createVideoPlayer(null)
    const controller = new NativeVideoSession(player, props.src, () => latest.current)
    const resource: VideoResource = { player, controller, started: false, disposed: false, dispose }
    session.current = resource
    setResource(resource)
    function dispose() {
      if (resource.disposed) return
      resource.disposed = true
      if (session.current === resource) session.current = null
      try {
        controller.dispose()
      } finally {
        player.release()
      }
    }
    return dispose
  }, [props.src])

  useEffect(() => {
    if (!resource || !hasLayout || resource.disposed || resource.started) return
    // Preparing a paused player before its VideoView is attached/laid out can
    // lose the initial frame during Android SurfaceView replacement. Wait for
    // the host's layout event and the commit carrying this player, not a timer.
    resource.started = true
    try {
      resource.controller.start(latest.current)
    } catch (error) {
      resource.dispose()
      throw error
    }
  }, [resource, hasLayout])

  useImperativeHandle(props.ref, () => ({
    play: async () => requireSession().play(),
    pause: () => session.current?.controller.pause(),
    seekTo: (seconds) => requireSession().seekTo(seconds),
    getStatus: () => requireSession().getStatus(),
  }))

  useEffect(() => {
    session.current?.controller.setOptions({
      autoPlay: props.autoPlay,
      loop: props.loop,
      muted: props.muted,
    })
  }, [props.autoPlay, props.loop, props.muted])

  return (
    <VideoView
      player={resource?.player ?? null}
      onLayout={({ nativeEvent: { layout } }) =>
        setHasLayout(layout.width > 0 && layout.height > 0)
      }
      nativeControls={props.controls ?? true}
      contentFit={props.fit ?? 'contain'}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      style={{ width: '100%', height: 180, ...props.style }}
    />
  )
}

type VideoResource = {
  player: VideoPlayer
  controller: NativeVideoSession
  started: boolean
  disposed: boolean
  dispose(): void
}
