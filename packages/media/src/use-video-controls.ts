import { useEffect, useRef, useState } from 'react'
import { videoControlLabels, videoControlState } from './control-state.ts'
import type { VideoControlsProps } from './control-types.ts'
import type { VideoHandle } from './types.ts'

/** One command/observation policy; platform files only own rendering and names. */
export function useVideoControls(props: VideoControlsProps) {
  const { name, labels } = videoControlLabels(props)
  const state = videoControlState(props.status, props.disabled)
  const latest = useRef(props)
  latest.current = props
  const mounted = useRef(false)
  const [failure, setFailure] = useState<{
    player: VideoHandle
    src: string
    message: string
  } | null>(null)
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  function request(command: 'toggle' | 'backward' | 'forward') {
    const current = latest.current
    const player = current.player.current
    if (!player || !current.status || current.disabled) return
    const src = current.status.src
    const report = (error: unknown) => {
      // A rejected request from a retired source must not label its replacement.
      if (
        !mounted.current ||
        latest.current.player.current !== player ||
        latest.current.status?.src !== src
      )
        return
      setFailure({ player, src, message: error instanceof Error ? error.message : String(error) })
    }
    try {
      const observed = player.getStatus()
      if (observed.src !== src) return
      const live = videoControlState(observed, current.disabled)
      if (
        (command === 'toggle' && live.toggleDisabled) ||
        (command === 'backward' && live.backwardDisabled) ||
        (command === 'forward' && live.forwardDisabled)
      )
        return
      setFailure(null)
      if (command === 'toggle') {
        if (observed.playing) player.pause()
        else {
          if (observed.status === 'ended') player.seekTo(0)
          void player.play().catch(report)
        }
      } else {
        // Use the handle's current clock, not a potentially old render snapshot.
        const step = current.seekStep ?? 10
        const target = Math.max(0, observed.currentTime + (command === 'backward' ? -step : step))
        player.seekTo(observed.duration === null ? target : Math.min(target, observed.duration))
      }
    } catch (error) {
      report(error)
    }
  }

  return {
    name,
    state,
    position: labels.position(props.status?.currentTime ?? 0, props.status?.duration ?? null),
    error:
      props.status?.error?.message ??
      (failure?.player === props.player.current && failure?.src === props.status?.src
        ? failure?.message
        : undefined),
    toggle: {
      key: 'toggle',
      label: state.playing ? labels.pause : labels.play,
      disabled: state.toggleDisabled,
      activate: () => request('toggle'),
    },
    backward: {
      key: 'backward',
      label: labels.backward,
      disabled: state.backwardDisabled,
      activate: () => request('backward'),
    },
    forward: {
      key: 'forward',
      label: labels.forward,
      disabled: state.forwardDisabled,
      activate: () => request('forward'),
    },
  }
}
