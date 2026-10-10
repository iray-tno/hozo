import { createVideoPlayer, type VideoPlayer, VideoView } from 'expo-video'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react'
import { NativeVideoSession } from './native-session.ts'
import { type VideoProps, validateVideoProps } from './types.ts'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const [player, setPlayer] = useState<VideoPlayer | null>(null)
  const latest = useRef(props)
  latest.current = props
  const session = useRef<NativeVideoSession | null>(null)

  function requireSession() {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current
  }

  useLayoutEffect(() => {
    // Native resources belong to a committed host, never an abandoned render.
    // Effect replay gets a fresh resource instead of reusing a released player.
    const player = createVideoPlayer(null)
    const controller = new NativeVideoSession(player, props.src, () => latest.current)
    session.current = controller
    setPlayer(player)
    const dispose = () => {
      session.current = null
      try {
        controller.dispose()
      } finally {
        player.release()
      }
    }
    try {
      controller.start(latest.current)
    } catch (error) {
      dispose()
      throw error
    }
    return dispose
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
    <VideoView
      player={player}
      nativeControls={props.controls ?? true}
      contentFit={props.fit ?? 'contain'}
      accessibilityLabel={props.accessibilityLabel}
      testID={props.testID}
      style={{ width: '100%', height: 180, ...props.style }}
    />
  )
}
