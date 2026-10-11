import type { MediaCaptionsProps, MediaCue } from './caption-types.ts'

interface IndexedCue extends MediaCue {
  prefixEnd: number
}

export function prepareCues(cues: readonly MediaCue[]): readonly IndexedCue[] {
  let previousStart = 0
  let prefixEnd = 0
  return cues.map(({ start, end, text }) => {
    if (!Number.isFinite(start) || start < 0 || !Number.isFinite(end) || end <= start)
      throw new Error('MediaCaptions cues require finite times with 0 <= start < end')
    if (start < previousStart) throw new Error('MediaCaptions cues must be ordered by start time')
    if (typeof text !== 'string' || !text.trim())
      throw new Error('MediaCaptions cues require nonempty plain text')
    previousStart = start
    prefixEnd = Math.max(prefixEnd, end)
    // Snapshot once per immutable cue list, not on every decoder clock tick.
    return { start, end, text, prefixEnd }
  })
}

export function activeCaption(props: MediaCaptionsProps, cues: readonly IndexedCue[]): string {
  for (const [name, value] of [
    ['src', props.src],
    ['accessibilityLabel', props.accessibilityLabel],
  ])
    if (typeof value !== 'string' || !value.trim())
      throw new Error(`MediaCaptions ${name} must be nonempty`)
  const status = props.status
  if (
    props.enabled === false ||
    !status ||
    status.src !== props.src ||
    status.status === 'loading' ||
    status.status === 'error' ||
    !Number.isFinite(status.currentTime) ||
    status.currentTime < 0
  )
    return ''
  const time = status.currentTime
  let low = 0
  let high = cues.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (cues[middle]!.start <= time) low = middle + 1
    else high = middle
  }
  const text: string[] = []
  // A prefix's latest end lets expired history fall out without scanning the
  // whole transcript. Long overlapping cues can still require a prefix scan.
  for (let index = low - 1; index >= 0; index--) {
    const cue = cues[index]!
    if (cue.prefixEnd <= time) break
    if (time < cue.end) text.push(cue.text)
  }
  return text.reverse().join('\n')
}
