import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef } from 'react'
import { DomVideoSession } from './dom-session.ts'
import { watchVideoFrame } from './dom-video-frame.ts'
import { type VideoHandle, type VideoProps, validateVideoProps } from './types.ts'
import { useVideoPresentation } from './use-video-presentation.ts'
import { VideoControls } from './video-controls.tsx'
import { VideoPoster } from './video-poster.tsx'

export function Video(props: VideoProps) {
  validateVideoProps(props)
  return <SourceVideo key={props.src} {...props} />
}

function SourceVideo(props: VideoProps) {
  const element = useRef<HTMLVideoElement>(null)
  const session = useRef<DomVideoSession | null>(null)
  const player = useRef<VideoHandle>(null)
  const { create, retire, beginViewing, status, showingPoster } = useVideoPresentation(props)
  const latest = useRef(props)
  latest.current = props

  const requireSession = useCallback(() => {
    if (!session.current) throw new Error('Video is not mounted')
    return session.current
  }, [])

  // Initialize before publishing the ref: a present handle is usable even
  // in a parent's layout effect, not only after passive effects have run.
  useLayoutEffect(() => {
    if (!element.current) return
    const owner = create()
    const controller = new DomVideoSession(element.current, props.src, () => ({
      ...latest.current,
      onStatusChange: (observed) => {
        owner.observe(observed)
        latest.current.onStatusChange?.(observed)
      },
    }))
    const stopFrames = watchVideoFrame(element.current, () => owner.frame())
    session.current = controller
    controller.start(latest.current)
    return () => {
      stopFrames()
      retire(owner)
      session.current = null
      controller.dispose()
    }
  }, [props.src, create, retire])

  // Observations update props, not the source-owned command identity.
  const commands = useCallback(
    () => ({
      play: async () => requireSession().play(),
      pause: () => session.current?.pause(),
      seekTo: (seconds: number) => {
        requireSession().seekTo(seconds)
        beginViewing()
      },
      getStatus: () => requireSession().getStatus(),
    }),
    [requireSession, beginViewing],
  )
  useImperativeHandle(player, commands, [commands])
  useImperativeHandle(props.ref, commands, [commands])

  useEffect(() => {
    session.current?.setOptions({
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
      {/* Keep the host's parent stable when a poster is added/removed. */}
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: 180,
          ...props.style,
          overflow: 'hidden',
        }}
      >
        <video
          ref={element}
          src={props.src}
          controls={props.poster === undefined && (props.controls ?? true)}
          playsInline={props.playsInline ?? true}
          loop={props.loop}
          muted={props.muted}
          preload="metadata"
          aria-label={props.accessibilityLabel}
          data-testid={props.testID}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: props.fit ?? 'contain',
          }}
        />
        {showingPoster && props.poster !== undefined && (
          <VideoPoster key={props.poster} {...props} poster={props.poster} />
        )}
      </div>
      {props.poster !== undefined && (props.controls ?? true) && (
        <div style={{ width: props.style?.width ?? '100%' }}>
          <VideoControls
            player={player}
            status={status}
            accessibilityLabel={`${props.accessibilityLabel} playback controls`}
          />
        </div>
      )}
    </>
  )
}
