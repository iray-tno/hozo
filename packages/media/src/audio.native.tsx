import { createAudioPlayer } from 'expo-audio'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AudioControls } from './audio-controls.native.tsx'
import { type AudioProps, type AudioStatus, validateAudioProps } from './audio-types.ts'
import { NativeAudioSession } from './native-audio-session.ts'
import { useAudioHandle } from './use-audio-handle.ts'

export function Audio(props: AudioProps) {
  validateAudioProps(props)
  return <SourceAudio key={props.src} {...props} />
}
function SourceAudio(props: AudioProps) {
  const session = useRef<NativeAudioSession | null>(null)
  const latest = useRef(props)
  latest.current = props
  const [status, setStatus] = useState<AudioStatus | null>(null)
  useLayoutEffect(() => {
    const resource = createAudioPlayer(null, { updateInterval: 250 })
    const controller = new NativeAudioSession(resource, props.src, () => ({
      ...latest.current,
      onStatusChange: (observed) => {
        setStatus(observed)
        latest.current.onStatusChange?.(observed)
      },
    }))
    session.current = controller
    const dispose = () => {
      session.current = null
      try {
        controller.dispose()
      } finally {
        resource.release()
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
  const player = useAudioHandle(session, props.ref)
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
  return (props.controls ?? true) ? (
    <AudioControls
      player={player}
      status={status}
      accessibilityLabel={`${props.accessibilityLabel} playback controls`}
    />
  ) : null
}
