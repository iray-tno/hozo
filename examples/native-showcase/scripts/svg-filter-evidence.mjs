import assert from 'node:assert/strict'
import { PNG } from 'pngjs'
import { comparePixels, verifyEffect } from '../../showcase/scripts/svg-filter-pixels.mjs'

export const SVG_FILTER_KINDS = ['color', 'blur', 'shadow', 'composition', 'blend']

export function readAndroidScenario(value = 'full') {
  assert.ok(['full', 'svg-filters'].includes(value), `Unknown Android scenario: ${value}`)
  return value
}

// AX bounds on Android are screenshot pixels, not dp. Normalize only the
// measured image region; changing controls outside it must never satisfy a gate.
// Web keeps its exact comparison. Native shares the semantic checks, with a
// bounded colour tolerance, rather than asserting rasterizer pixel equality.
export function svgImage(buffer, bounds) {
  const image = PNG.sync.read(buffer)
  assert.ok(Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isInteger))
  const [left, top, right, bottom] = bounds
  const width = right - left
  const height = bottom - top
  assert.ok(left >= 0 && top >= 0 && right <= image.width && bottom <= image.height)
  assert.ok(width >= 96 && height >= 96, 'SVG region is empty, clipped or too small')
  assert.ok(Math.abs(width - height) <= 1, 'SVG region must be the complete square scene')
  const pixels = new Uint8Array(96 * 96 * 4)
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const at =
        (Math.floor(top + ((y + 0.5) * height) / 96) * image.width +
          Math.floor(left + ((x + 0.5) * width) / 96)) *
        4
      pixels.set(image.data.subarray(at, at + 4), (y * 96 + x) * 4)
    }
  }
  return { width: 96, height: 96, pixels }
}

export function verifyNativeFilter(kind, control, filtered) {
  assert.ok(SVG_FILTER_KINDS.includes(kind))
  return verifyEffect(kind, control, filtered, { colorTolerance: 8 })
}

export function verifyRestored(control, restored) {
  const difference = comparePixels(control, restored)
  assert.ok(difference.maxDelta <= 8, `filter off did not restore source: ${difference.maxDelta}`)
  return difference
}

// Each interaction is sent once. Only screenshots are polled for presentation;
// every failed observation remains in evidence and no failing case is skipped.
export async function exerciseSvgFilters(driver, evidence) {
  const { story, waitFor, tap, screenshot, waitForImage, record } = driver
  const captureRegion =
    driver.captureRegion ??
    ((buffer, node) => ({ image: svgImage(buffer, node.rect), pixelBounds: node.rect }))
  for (const kind of SVG_FILTER_KINDS) {
    const result = { kind, passed: false, observations: [] }
    evidence.svgFilters ??= []
    evidence.svgFilters.push(result)
    try {
      await story(`svg-filter-pixels--${kind}`, `SVG pixel probe: ${kind}`)
      await waitFor('Turn filter on')
      const node = await waitFor('SVG pixel scene')
      result.bounds = node.rect
      result.captures = []
      const capture = (state) => {
        const name = `svg-${kind}-${state}-${result.captures.length + 1}`
        result.captures.push(name)
        const region = captureRegion(screenshot(name), node)
        if (result.pixelBounds) assert.deepEqual(region.pixelBounds, result.pixelBounds)
        result.pixelBounds = region.pixelBounds
        if (region.screenBounds) result.screenBounds = region.screenBounds
        return region.image
      }
      // An unfiltered pair still needs a source and white background. Using the
      // shared color assertion with itself would reject its missing effect, so
      // wait for the control's actual centre before activating the filter.
      const source = kind === 'color' || kind === 'blend' ? [220, 40, 40] : [40, 80, 220]
      const started = Date.now()
      const control = await waitForImage(
        () => capture('off'),
        (image) => {
          const offset = (48 * 96 + 48) * 4
          return source.every(
            (value, channel) => Math.abs(image.pixels[offset + channel] - value) <= 8,
          )
        },
        `${kind} unfiltered source`,
      )
      result.controlWaitMs = Date.now() - started
      await tap('Turn filter on')
      await waitFor('Turn filter off')
      let metrics
      const enabledAt = Date.now()
      await waitForImage(
        () => capture('on'),
        (image) => {
          try {
            metrics = verifyNativeFilter(kind, control, image)
            result.observations.push({ passed: true, ...metrics })
            return true
          } catch (error) {
            result.observations.push({ passed: false, error: String(error) })
            return false
          }
        },
        `${kind} filter effect`,
      )
      result.effectWaitMs = Date.now() - enabledAt
      result.metrics = metrics
      await tap('Turn filter off')
      await waitFor('Turn filter on')
      const restoredAt = Date.now()
      await waitForImage(
        () => capture('restored'),
        (image) => {
          try {
            verifyRestored(control, image)
            return true
          } catch {
            return false
          }
        },
        `${kind} filter removed`,
      )
      result.restoreWaitMs = Date.now() - restoredAt
      result.passed = true
      record(`SVG ${kind} renders its effect and restores unfiltered pixels`, result)
    } catch (error) {
      result.error = error.stack
      throw error
    }
  }
}
