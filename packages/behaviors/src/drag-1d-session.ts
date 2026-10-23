export interface Drag1DOptions {
  axis: 'x' | 'y'
  disabled?: boolean
  /** Horizontal deltas follow the platform's writing direction. */
  onStart?: () => void
  onMove?: (delta: number) => void
  onEnd?: (delta: number) => void
  onCancel?: () => void
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
  const flush = () => {
    if (pending !== undefined) unschedule(pending)
    pending = undefined
    if (active && delta !== delivered) {
      delivered = delta
      options().onMove?.(delta)
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
      if (active || options().disabled) return false
      active = true
      delta = delivered = 0
      options().onStart?.()
      return true
    },
    move(next: number) {
      if (!active) return
      if (options().disabled) return cancel()
      delta = next
      if (pending === undefined) pending = schedule(flush)
    },
    end(next: number) {
      if (!active) return
      if (options().disabled) return cancel()
      delta = next
      flush()
      active = false
      options().onEnd?.(delta)
    },
    cancel,
  }
}
