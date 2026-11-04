import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { DomVideoSession } from './dom-session.ts'
import { watchVideoFrame } from './dom-video-frame.ts'
import { type VideoHandle, type VideoProps, validateVideoProps, videoAspectRatio } from './types.ts'
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
  // The poster overlay is cleared by component state, which a page without
  // hydration never runs; there it would cover the video for good (#1674).
  // So the server markup carries only the `poster` attribute, and the
  // overlay joins once mounted, on top of the same image.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

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

  const aspectRatio = videoAspectRatio(props)
  return (
    <>
      {/* Keep the host's parent stable when a poster is added/removed. */}
      <div
        className={props.className}
        style={{
          position: 'relative',
          // Inline styles beat classes, so the defaults step aside for them.
          ...(props.className === undefined && { width: '100%' }),
          ...(props.className === undefined && aspectRatio === undefined && { height: 180 }),
          ...(aspectRatio !== undefined && { aspectRatio }),
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
          // Declarative too, so a page that never hydrates still plays and
          // shows its poster (#1674). The session still asks once when ready,
          // which is how a denial is observed.
          autoPlay={props.autoPlay}
          poster={props.poster}
          preload={props.preload ?? 'metadata'}
          width={props.width}
          height={props.height}
          id={props.nativeID}
          aria-label={props.accessibilityLabel}
          data-testid={props.testID}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: props.fit ?? 'contain',
          }}
        />
        {mounted && showingPoster && props.poster !== undefined && (
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
