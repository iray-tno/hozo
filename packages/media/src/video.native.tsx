import { createVideoPlayer, type VideoPlayer, VideoView } from 'expo-video'
import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { View } from 'react-native'
import { NativeVideoSession } from './native-session.ts'
import { type VideoHandle, type VideoProps, validateVideoProps } from './types.ts'
import { useVideoPresentation } from './use-video-presentation.ts'
import { VideoControls } from './video-controls.native.tsx'
import { VideoPoster } from './video-poster.native.tsx'
import type { VideoPresentation } from './video-presentation.ts'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const [resource, setResource] = useState<VideoResource | null>(null)
  const [laidOutResource, setLaidOutResource] = useState<VideoResource | null>(null)
  const nextViewKey = useRef(0)
  const latest = useRef(props)
  latest.current = props
  const session = useRef<VideoResource | null>(null)
  const playerRef = useRef<VideoHandle>(null)
  const { create, retire, beginViewing, status, showingPoster } = useVideoPresentation(props)

  const requireSession = useCallback(() => {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current.controller
  }, [])

  useLayoutEffect(() => {
    // Native resources belong to a committed host, never an abandoned render.
    // Effect replay gets a fresh resource instead of reusing a released player.
    const player = createVideoPlayer(null)
    const presentation = create()
    const controller = new NativeVideoSession(player, props.src, () => ({
      ...latest.current,
      onStatusChange: (observed) => {
        presentation.observe(observed)
        latest.current.onStatusChange?.(observed)
      },
    }))
    const resource: VideoResource = {
      player,
      controller,
      presentation,
      // Replayed players need distinct native event targets, not a new callback
      // on the old view whose queued first-frame event could arrive later.
      viewKey: ++nextViewKey.current,
      started: false,
      disposed: false,
      dispose,
    }
    session.current = resource
    setResource(resource)
    function dispose() {
      if (resource.disposed) return
      resource.disposed = true
      retire(presentation)
      if (session.current === resource) session.current = null
      try {
        controller.dispose()
      } finally {
        player.release()
      }
    }
    return dispose
  }, [props.src, create, retire])

  useEffect(() => {
    if (!resource || laidOutResource !== resource || resource.disposed || resource.started) return
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
  }, [resource, laidOutResource])

  // Observations update props, not the source-owned command identity.
  const commands = useCallback(
    () => ({
      play: async () => requireSession().play(),
      pause: () => session.current?.controller.pause(),
      seekTo: (seconds: number) => {
        requireSession().seekTo(seconds)
        beginViewing()
      },
      getStatus: () => requireSession().getStatus(),
    }),
    [requireSession, beginViewing],
  )
  useImperativeHandle(playerRef, commands, [commands])
  useImperativeHandle(props.ref, commands, [commands])

  useEffect(() => {
    session.current?.controller.setOptions({
      autoPlay: props.autoPlay,
      loop: props.loop,
      muted: props.muted,
      volume: props.volume,
      playbackRate: props.playbackRate,
      preservesPitch: props.preservesPitch,
    })
  }, [
    props.autoPlay,
    props.loop,
    props.muted,
    props.volume,
    props.playbackRate,
    props.preservesPitch,
  ])

  return (
    <>
      <View
        accessible={false}
        style={{ width: '100%', height: 180, ...props.style, overflow: 'hidden' }}
      >
        <VideoView
          key={resource?.viewKey ?? 0}
          player={resource?.player ?? null}
          onLayout={({ nativeEvent: { layout } }) => {
            if (!resource || resource.disposed || session.current !== resource) return
            setLaidOutResource(layout.width > 0 && layout.height > 0 ? resource : null)
          }}
          onFirstFrameRender={() => resource?.presentation.frame()}
          nativeControls={props.poster === undefined && (props.controls ?? true)}
          contentFit={props.fit ?? 'contain'}
          accessibilityLabel={props.accessibilityLabel}
          testID={props.testID}
          style={{ width: '100%', height: '100%' }}
        />
        {showingPoster && props.poster !== undefined && (
          <VideoPoster key={props.poster} {...props} poster={props.poster} />
        )}
      </View>
      {props.poster !== undefined && (props.controls ?? true) && (
        <View accessible={false} style={{ width: props.style?.width ?? '100%' }}>
          <VideoControls
            player={playerRef}
            status={status}
            accessibilityLabel={`${props.accessibilityLabel} playback controls`}
          />
        </View>
      )}
    </>
  )
}

type VideoResource = {
  player: VideoPlayer
  controller: NativeVideoSession
  presentation: VideoPresentation
  viewKey: number
  started: boolean
  disposed: boolean
  dispose(): void
}
