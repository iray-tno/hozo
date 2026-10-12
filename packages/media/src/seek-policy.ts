import type { MediaSeekability, MediaSeekRange, MediaStatus } from './types.ts'

export function copySeekability(value: MediaSeekability): MediaSeekability {
  return value.status === 'available'
    ? { ...value, ranges: value.ranges.map((range) => ({ ...range })) }
    : { ...value }
}

/** Read only the host's seekable timeline, never infer it from buffered/duration. */
export function domSeekability(element: HTMLMediaElement): MediaSeekability {
  try {
    const observed = element.seekable
    if (!observed) return { status: 'unknown', reason: 'not-exposed' }
    const ranges: MediaSeekRange[] = []
    for (let index = 0; index < observed.length; index++) {
      const start = observed.start(index)
      const end = observed.end(index)
      if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start)
        return { status: 'unknown', reason: 'not-observed' }
      ranges.push({ start, end })
    }
    return ranges.length
      ? { status: 'available', origin: 'engine', ranges }
      : { status: 'unavailable', origin: 'engine', reason: 'empty-ranges' }
  } catch {
    // A failed observation is not evidence that the resource is unseekable.
    return { status: 'unknown', reason: 'not-observed' }
  }
}

function rangesOf(status: MediaStatus) {
  if (status.seekability?.status !== 'available') return []
  const ranges: MediaSeekRange[] = []
  for (const range of status.seekability.ranges) {
    const end = status.duration === null ? range.end : Math.min(range.end, status.duration)
    if (
      Number.isFinite(range.start) &&
      Number.isFinite(end) &&
      range.start >= 0 &&
      end > range.start
    )
      ranges.push({ start: range.start, end })
  }
  return ranges
}

/** Nearest legal point; a gap tie chooses the earlier endpoint deterministically. */
export function constrainSeek(seconds: number, status: MediaStatus): number | null {
  if (status.seekability?.status === 'unavailable') return null
  if (status.seekability?.status !== 'available')
    return status.duration === null ? seconds : Math.min(seconds, status.duration)
  let target: number | null = null
  let distance = Infinity
  for (const { start, end } of rangesOf(status)) {
    const candidate = Math.max(start, Math.min(seconds, end))
    const gap = Math.abs(candidate - seconds)
    if (gap < distance || (gap === distance && (target === null || candidate < target))) {
      target = candidate
      distance = gap
    }
  }
  return target
}

/** A continuous Slider still needs a finite duration; live-window UI is a separate contract. */
export function seekBounds(status: MediaStatus | null) {
  if (
    !status ||
    (status.status !== 'ready' && status.status !== 'ended') ||
    status.duration === null ||
    !Number.isFinite(status.duration) ||
    status.duration <= 0 ||
    !Number.isFinite(status.currentTime) ||
    status.currentTime < 0 ||
    status.seekability?.status === 'unavailable'
  )
    return null
  if (status.seekability?.status !== 'available')
    return { min: 0, max: status.duration, duration: status.duration }
  const ranges = rangesOf(status)
  if (!ranges.length) return null
  return {
    min: Math.min(...ranges.map((range) => range.start)),
    max: Math.max(...ranges.map((range) => range.end)),
    duration: status.duration,
  }
}

/** A step must move in its requested direction, including across discontinuous ranges. */
export function stepSeekTarget(status: MediaStatus, delta: number): number | null {
  if (status.seekability?.status === 'unavailable') return null
  const requested = Math.max(0, status.currentTime + delta)
  if (status.seekability?.status !== 'available') {
    const target = constrainSeek(requested, status)
    return target !== null &&
      (delta < 0 ? target < status.currentTime : target > status.currentTime)
      ? target
      : null
  }
  let best: number | null = null
  let distance = Infinity
  for (const { start, end } of rangesOf(status)) {
    const target = Math.max(start, Math.min(requested, end))
    if (delta < 0 ? target >= status.currentTime : target <= status.currentTime) continue
    const gap = Math.abs(target - requested)
    if (gap < distance) {
      best = target
      distance = gap
    }
  }
  return best
}

/** Do not trap keyboard/AX steps on the near side of a gap. No engine probe is needed. */
export function interactiveSeekTarget(seconds: number, status: MediaStatus): number | null {
  const nearest = constrainSeek(seconds, status)
  if (nearest === status.currentTime && seconds !== status.currentTime)
    return stepSeekTarget(status, seconds - status.currentTime) ?? nearest
  return nearest
}
