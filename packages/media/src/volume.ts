/** Validate before touching an engine: no platform-dependent clamping/coercion. */
export function mediaVolume(volume: number | undefined): number {
  if (volume === undefined) return 1
  if (!Number.isFinite(volume) || volume < 0 || volume > 1) {
    throw new RangeError('Media volume must be a finite number between 0 and 1')
  }
  return volume
}
