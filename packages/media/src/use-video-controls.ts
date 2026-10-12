import { useEffect, useRef, useState } from 'react'
import { videoControlLabels, videoControlState } from './control-state.ts'
import type { VideoControlsProps } from './control-types.ts'
import { stepSeekTarget } from './seek-policy.ts'
import type { MediaHandle } from './types.ts'

/** One command/observation policy; platform files only own rendering and names. */
export function useVideoControls(props: VideoControlsProps) {
  const { name, labels } = videoControlLabels(props)
  const state = videoControlState(props.status, props.disabled)
  const latest = useRef(props)
  latest.current = props
  const mounted = useRef(false)
  const [failure, setFailure] = useState<{
    player: MediaHandle
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
    const isCurrent = () =>
      mounted.current &&
      latest.current.player.current === player &&
      latest.current.status?.src === src
    const report = (error: unknown) => {
      // A rejected request from a retired source must not label its replacement.
      if (!isCurrent()) return
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
          const play = () => {
            if (isCurrent()) return player.play()
          }
          const rewind = observed.status === 'ended' ? player.seekTo(0) : undefined
          // Audio seeks are asynchronous. Do not replay before the rewind, or
          // restart a retired/re-disabled player when that request completes.
          if (rewind && typeof rewind.then === 'function') {
            void rewind
              .then(() => {
                if (!isCurrent() || latest.current.disabled) return
                const after = player.getStatus()
                if (
                  after.src === src &&
                  !after.playing &&
                  !videoControlState(after, latest.current.disabled).toggleDisabled
                )
                  return play()
              })
              .catch(report)
          } else void play()?.catch(report)
        }
      } else {
        // Use the handle's current clock, not a potentially old render snapshot.
        const step = current.seekStep ?? 10
        const target = stepSeekTarget(observed, command === 'backward' ? -step : step)
        if (target === null) return
        const seek = player.seekTo(target)
        if (seek && typeof seek.then === 'function') void seek.catch(report)
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
