import { useEffect, useRef, useState } from 'react'
import type { MediaSeekProps } from './seek-types.ts'
import type { MediaHandle, MediaStatus } from './types.ts'

type Scope = { player: MediaHandle | null; src: string | undefined }
type Draft = Scope & { seconds: number }
type Failure = Scope & { message: string }
const same = (a: Scope | null, b: Scope) => a?.player === b.player && a?.src === b.src

function durationOf(status: MediaStatus | null) {
  if (
    !status ||
    (status.status !== 'ready' && status.status !== 'ended') ||
    status.duration === null ||
    !Number.isFinite(status.duration) ||
    status.duration <= 0 ||
    !Number.isFinite(status.currentTime) ||
    status.currentTime < 0
  )
    return null
  return status.duration
}

function clock(seconds: number) {
  const whole = Math.floor(seconds)
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}

/** Bind a Slider to observations; a drag previews, a commit requests one seek. */
export function useMediaSeek(props: MediaSeekProps) {
  const step = props.step ?? 1
  if (!Number.isFinite(step) || step <= 0)
    throw new RangeError('Seek step must be positive and finite')
  const name = props.accessibilityLabel ?? 'Playback position'
  const unavailable = props.labels?.unavailable ?? 'Seek unavailable'
  if (!name.trim() || !unavailable.trim()) throw new TypeError('Seek labels must be nonempty')
  const position = props.labels?.position ?? ((time, end) => `${clock(time)} / ${clock(end)}`)
  const preview = props.labels?.preview ?? ((time, end) => `Seek to ${position(time, end)}`)
  const latest = useRef(props)
  latest.current = props
  const mounted = useRef(false)
  const scope: Scope = { player: props.player.current, src: props.status?.src }
  const identities = useRef({ players: new WeakMap<MediaHandle, number>(), next: 0 })
  if (scope.player && !identities.current.players.has(scope.player))
    identities.current.players.set(scope.player, ++identities.current.next)
  // A replacement player at the same URI still needs a fresh gesture owner.
  const key = `${scope.player ? identities.current.players.get(scope.player) : 0}:${scope.src ?? ''}`
  const [draft, setDraft] = useState<Draft | null>(null)
  const [failure, setFailure] = useState<Failure | null>(null)
  const [pending, setPending] = useState<Scope | null>(null)
  const inFlight = useRef<Scope | null>(null)
  const duration = durationOf(props.status)
  const boundPlayer = scope.player
  const boundSource = scope.src
  useEffect(() => {
    setDraft((value) =>
      props.disabled || duration === null || !same(value, { player: boundPlayer, src: boundSource })
        ? null
        : value,
    )
  }, [props.disabled, duration, boundPlayer, boundSource])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const current = () =>
    mounted.current &&
    latest.current.player.current === scope.player &&
    latest.current.status?.src === scope.src
  const report = (error: unknown) => {
    if (current())
      setFailure({ ...scope, message: error instanceof Error ? error.message : String(error) })
  }
  const read = () => {
    if (!current() || !scope.player || latest.current.disabled || same(inFlight.current, scope))
      return null
    const observed = scope.player.getStatus()
    const duration = durationOf(observed)
    if (observed.src !== scope.src || duration === null) return null
    return { ...observed, duration }
  }
  const change = (seconds: number) => {
    if (!Number.isFinite(seconds)) return
    try {
      const observed = read()
      if (!observed) return
      setDraft({ ...scope, seconds: Math.max(0, Math.min(seconds, observed.duration)) })
    } catch (error) {
      report(error)
    }
  }
  const cancel = () => {
    // An old gesture cannot clear a new source's preview.
    if (current()) setDraft((value) => (same(value, scope) ? null : value))
  }
  const commit = (seconds: number) => {
    if (!Number.isFinite(seconds)) return
    cancel()
    try {
      const observed = read()
      if (!observed || !scope.player) return
      setFailure(null)
      const target = Math.max(0, Math.min(seconds, observed.duration))
      const result = scope.player.seekTo(target)
      if (result && typeof result.then === 'function') {
        const request = { ...scope }
        inFlight.current = request
        setPending(request)
        void result.catch(report).finally(() => {
          if (inFlight.current === request) inFlight.current = null
          if (current()) setPending((value) => (value === request ? null : value))
        })
      }
    } catch (error) {
      report(error)
    }
  }

  const activeDraft = same(draft, scope) && !props.disabled && !same(pending, scope) ? draft : null
  const time = props.status?.currentTime ?? 0
  return {
    /** Use as the Slider's React key, not a DOM id or a player command. */
    key,
    position: duration === null ? unavailable : position(time, duration),
    previewing: activeDraft !== null,
    error: props.status?.error?.message ?? (same(failure, scope) ? failure?.message : undefined),
    slider:
      duration === null
        ? null
        : {
            min: 0,
            max: duration,
            step,
            value: Math.min(duration, activeDraft?.seconds ?? time),
            disabled: !!props.disabled || !scope.player || same(pending, scope),
            accessibilityLabel: name,
            valueText: (value: number) =>
              activeDraft ? preview(value, duration) : position(time, duration),
            onValueChange: change,
            onValueCommit: commit,
            onValueCancel: cancel,
          },
  }
}
