export interface Drag1DOptions {
  axis: 'x' | 'y'
  disabled?: boolean
  /** Native can wait for movement so a Pressable still receives ordinary taps. */
  nativeActivationDistance?: number
  /** Validate measured geometry before starting a session. */
  canStart?: () => boolean
  /** Horizontal deltas follow the platform's writing direction. */
  onStart?: () => void
  onMove?: (delta: number, details: Drag1DDetails) => void
  onEnd?: (delta: number, details: Drag1DDetails) => void
  onCancel?: () => void
}

export interface Drag1DDetails {
  /** Pixels per millisecond along the same logical axis as delta. */
  velocity: number
}

/** Shared lifecycle: moves are coalesced, but release always flushes its final delta. */
export function createDrag1DSession(
  options: () => Drag1DOptions,
  schedule: (callback: () => void) => number,
  unschedule: (id: number) => void,
) {
  let active = false
  let pending: number | undefined
  let delta = 0
  let delivered = 0
  let details: Drag1DDetails = { velocity: 0 }
  const flush = () => {
    if (pending !== undefined) unschedule(pending)
    pending = undefined
    if (active && delta !== delivered) {
      delivered = delta
      options().onMove?.(delta, details)
    }
  }
  const cancel = () => {
    if (!active) return
    active = false
    if (pending !== undefined) unschedule(pending)
    pending = undefined
    options().onCancel?.()
  }
  return {
    get active() {
      return active
    },
    start() {
      if (active || options().disabled || options().canStart?.() === false) return false
      active = true
      delta = delivered = 0
      details = { velocity: 0 }
      options().onStart?.()
      return active
    },
    move(next: number, sample: Drag1DDetails = { velocity: 0 }) {
      if (!active) return
      if (options().disabled) return cancel()
      delta = next
      details = sample
      if (pending === undefined) pending = schedule(flush)
    },
    end(next: number, sample: Drag1DDetails = details) {
      if (!active) return
      if (options().disabled) return cancel()
      delta = next
      details = sample
      flush()
      if (!active) return
      active = false
      options().onEnd?.(delta, details)
    },
    cancel,
  }
}
