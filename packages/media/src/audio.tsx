import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioControls } from './audio-controls.tsx'
import { type AudioProps, type AudioStatus, validateAudioProps } from './audio-types.ts'
import { DomMediaSession } from './dom-session.ts'
import { useAudioHandle } from './use-audio-handle.ts'

export function Audio(props: AudioProps) {
  validateAudioProps(props)
  return <SourceAudio key={props.src} {...props} />
}

function SourceAudio(props: AudioProps) {
  const element = useRef<HTMLAudioElement>(null)
  const session = useRef<DomMediaSession | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [status, setStatus] = useState<AudioStatus | null>(null)
  useLayoutEffect(() => {
    if (!element.current) return
    const controller = new DomMediaSession(element.current, props.src, () => ({
      ...latest.current,
      onStatusChange: (observed) => {
        setStatus(observed)
        latest.current.onStatusChange?.(observed)
      },
    }))
    session.current = controller
    controller.start(latest.current)
    return () => {
      session.current = null
      controller.dispose()
    }
  }, [props.src])
  const player = useAudioHandle(session, props.ref)
  useEffect(() => {
    session.current?.setOptions({
      autoPlay: props.autoPlay,
      loop: props.loop,
      muted: props.muted,
      volume: props.volume,
    })
  }, [props.autoPlay, props.loop, props.muted, props.volume])
  return (
    <>
      <audio
        ref={element}
        src={props.src}
        preload="metadata"
        aria-label={props.accessibilityLabel}
        loop={props.loop}
        muted={props.muted}
        controls={false}
      />
      {(props.controls ?? true) && (
        <AudioControls
          player={player}
          status={status}
          accessibilityLabel={`${props.accessibilityLabel} playback controls`}
        />
      )}
    </>
  )
}
