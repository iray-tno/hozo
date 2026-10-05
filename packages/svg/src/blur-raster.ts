export interface RasterScale {
  x: number
  y: number
}

export function svgRasterScale(
  width: unknown,
  height: unknown,
  viewBox: string | undefined,
  preserveAspectRatio: string | undefined,
  density: number,
): RasterScale {
  const base = { x: density, y: density }
  if (!viewBox || typeof width !== 'number' || typeof height !== 'number') return base
  const values = viewBox
    .trim()
    .split(/[\s,]+/)
    .map(Number)
  const boxWidth = values[2] ?? 0
  const boxHeight = values[3] ?? 0
  if (
    values.length !== 4 ||
    values.some((value) => !Number.isFinite(value)) ||
    boxWidth <= 0 ||
    boxHeight <= 0 ||
    width <= 0 ||
    height <= 0
  )
    return base
  const x = width / boxWidth
  const y = height / boxHeight
  const aspect = preserveAspectRatio?.trim().split(/\s+/) ?? []
  if (aspect.includes('none')) return { x: density * x, y: density * y }
  const scale = aspect.includes('slice') ? Math.max(x, y) : Math.min(x, y)
  return { x: density * scale, y: density * scale }
}

// react-native-svg Android passes min(2 * max(stdDeviation), 25) to
// ScriptIntrinsicBlur. AOSP uses sigma = 0.4 * radius + 0.6, in bitmap
// pixels, not SVG units. Invert that mapping after the root raster scale.
// https://android.googlesource.com/platform/frameworks/rs/+/refs/tags/android-13.0.0_r52/cpu_ref/rsCpuIntrinsicBlur.cpp
// Keep a positive tiny blur positive; zero itself must remain a true bypass.
// Upstream's 25px cap and isotropic max(X,Y) are not removed by this adapter.
export function androidBlurDeviation(
  value: number | string | ReadonlyArray<number | string> | undefined,
  scale: RasterScale,
): number[] | undefined {
  if (value === undefined) return undefined
  const values = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.trim().split(/[\s,]+/)
      : [value]
  const x = Number(values[0]) || 0
  const y = values.length > 1 ? Number(values[1]) || 0 : x
  const encode = (sigma: number) => (sigma > 0 ? Math.max((sigma - 0.6) / 0.8, 0.000001) : 0)
  return [encode(x * scale.x), encode(y * scale.y)]
}
