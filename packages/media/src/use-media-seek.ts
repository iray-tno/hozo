import { useEffect, useRef, useState } from 'react'
import { constrainSeek, interactiveSeekTarget, seekBounds } from './seek-policy.ts'
import type { MediaSeekProps } from './seek-types.ts'
import type { MediaHandle } from './types.ts'

type Scope = { player: MediaHandle | null; src: string | undefined }
type Draft = Scope & { seconds: number }
type Failure = Scope & { message: string }
const same = (a: Scope | null, b: Scope) => a?.player === b.player && a?.src === b.src

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
  const bounds = seekBounds(props.status)
  const duration = bounds?.duration ?? null
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
    if (observed.src !== scope.src || seekBounds(observed) === null) return null
    return observed
  }
  const change = (seconds: number) => {
    if (!Number.isFinite(seconds)) return
    try {
      const observed = read()
      if (!observed) return
      const target = interactiveSeekTarget(Math.max(0, seconds), observed)
      if (target !== null) setDraft({ ...scope, seconds: target })
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
      const target = interactiveSeekTarget(Math.max(0, seconds), observed)
      if (target === null) return
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

  const activeDraft =
    bounds && same(draft, scope) && !props.disabled && !same(pending, scope) ? draft : null
  const time = props.status?.currentTime ?? 0
  const previewValue = (value: number) =>
    props.status ? (interactiveSeekTarget(value, props.status) ?? value) : value
  return {
    /** Use as the Slider's React key, not a DOM id or a player command. */
    key,
    position: duration === null ? unavailable : position(time, duration),
    previewing: activeDraft !== null,
    // This may remain unknown while best-effort Native seeking is enabled.
    seekability: props.status?.seekability ?? {
      status: 'unknown' as const,
      reason: 'not-observed' as const,
    },
    error: props.status?.error?.message ?? (same(failure, scope) ? failure?.message : undefined),
    slider:
      !bounds || duration === null || !props.status
        ? null
        : {
            min: bounds.min,
            max: bounds.max,
            step,
            value: constrainSeek(activeDraft?.seconds ?? time, props.status) ?? bounds.min,
            disabled: !!props.disabled || !scope.player || same(pending, scope),
            accessibilityLabel: name,
            valueText: (value: number) =>
              activeDraft ? preview(previewValue(value), duration) : position(time, duration),
            onValueChange: change,
            onValueCommit: commit,
            onValueCancel: cancel,
          },
  }
}
