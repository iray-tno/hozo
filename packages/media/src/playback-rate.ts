import type { VideoOptions } from './types.ts'

/** Portable audible range: Expo Audio tops out at 2; Gecko mutes below .25. */
export function mediaPlaybackOptions(options: VideoOptions) {
  const playbackRate = options.playbackRate === undefined ? 1 : options.playbackRate
  if (!Number.isFinite(playbackRate) || playbackRate < 0.25 || playbackRate > 2) {
    throw new RangeError('Media playbackRate must be a finite number from 0.25 to 2')
  }
  const preservesPitch = options.preservesPitch === undefined ? true : options.preservesPitch
  if (typeof preservesPitch !== 'boolean') {
    throw new TypeError('Media preservesPitch must be a boolean')
  }
  return { playbackRate, preservesPitch }
}

/** Native rates are Float32. Readback is acceptance, not clock/pitch evidence. */
export function samePlaybackRate(actual: number, requested: number) {
  return Number.isFinite(actual) && Math.abs(actual - requested) <= 0.000001
}
