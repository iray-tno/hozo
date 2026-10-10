import { useVideoPlayer, VideoView } from 'expo-video'
import { useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { NativeVideoSession } from './native-session.ts'
import { type VideoProps, validateVideoProps } from './types.ts'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const player = useVideoPlayer(null)
  const latest = useRef(props)
  latest.current = props
  const session = useRef<NativeVideoSession | null>(null)

  function requireSession() {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current
  }

  useLayoutEffect(() => {
    const controller = new NativeVideoSession(player, props.src, () => latest.current)
    session.current = controller
    controller.start(latest.current)
    return () => {
      session.current = null
      controller.dispose()
    }
  }, [player, props.src])

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
