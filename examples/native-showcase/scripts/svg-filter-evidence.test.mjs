import assert from 'node:assert/strict'
import test from 'node:test'
import { PNG } from 'pngjs'
import {
  exerciseSvgFilters,
  readAndroidScenario,
  SVG_FILTER_KINDS,
  svgImage,
  verifyNativeFilter,
  verifyRestored,
} from './svg-filter-evidence.mjs'

// Synthetic rasters test the measurement, not the Native renderer. Real device
// captures must pass the same gates before the workflow records Native evidence.
function raster(kind, enabled, scale = 1, inset = 8) {
  const size = 96 * scale
  const png = new PNG({ width: size + 2 * inset, height: size + 2 * inset })
  png.data.fill(255)
  const source = kind === 'color' || kind === 'blend' ? [220, 40, 40] : [40, 80, 220]
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x / scale
      const dy = y / scale
      let color = [255, 255, 255]
      if (enabled && ['shadow', 'composition'].includes(kind)) {
        if (dx >= 36 && dx < 76 && dy >= 36 && dy < 76) color = [220, 40, 40]
      }
      if (enabled && kind === 'blur' && dx >= 18 && dx < 24 && dy >= 28 && dy < 60) {
        color = [190, 200, 250]
      }
      if (dx >= 24 && dx < 64 && dy >= 24 && dy < 64) {
        color = enabled && kind === 'color' ? [100, 100, 100] : source
        if (enabled && kind === 'blend') color = [225, 100, 225]
      }
      const at = ((y + inset) * png.width + x + inset) * 4
      png.data.set(color, at)
    }
  }
  return { png, bounds: [inset, inset, inset + size, inset + size] }
}

function capture(kind, enabled, scale = 1) {
  const { png, bounds } = raster(kind, enabled, scale)
  return svgImage(PNG.sync.write(png), bounds)
}

test('all five effect gates work at device densities without reading outside the image', () => {
  for (const kind of SVG_FILTER_KINDS) {
    for (const scale of [1, 2, 2.625, 2.75, 3]) {
      const control = capture(kind, false, scale)
      const filtered = capture(kind, true, scale)
      assert.ok(verifyNativeFilter(kind, control, filtered).changed > 32)
      assert.equal(verifyRestored(control, capture(kind, false, scale)).maxDelta, 0)
      assert.throws(() => verifyNativeFilter(kind, control, control), /no visible effect/)
      assert.throws(() => verifyRestored(control, filtered), /did not restore/)
    }
  }
  const { png, bounds } = raster('color', false, 3)
  const before = svgImage(PNG.sync.write(png), bounds)
  png.data.fill(0, 0, png.width * 4)
  assert.deepEqual(svgImage(PNG.sync.write(png), bounds), before)
})

test('Native tolerance stays bounded and rejects blank, wrong-colour and wrong-position scenes', () => {
  const control = capture('composition', false)
  const filtered = capture('composition', true)
  const at = (48 * 96 + 48) * 4
  filtered.pixels[at] += 6
  assert.ok(verifyNativeFilter('composition', control, filtered))
  filtered.pixels[at] += 10
  assert.throws(() => verifyNativeFilter('composition', control, filtered), /merge order/)
  filtered.pixels.set([220, 40, 40], at)
  assert.throws(() => verifyNativeFilter('composition', control, filtered), /merge order/)
  const misplaced = capture('shadow', true)
  misplaced.pixels.set([255, 255, 255], (50 * 96 + 70) * 4)
  assert.throws(() => verifyNativeFilter('shadow', control, misplaced), /offset red shadow missing/)
  const blank = { ...control, pixels: new Uint8Array(control.pixels.length).fill(255) }
  assert.throws(() => verifyNativeFilter('composition', blank, blank), /source missing/)
  assert.throws(() => verifyNativeFilter('unknown', control, filtered))
})

test('bounds must describe a complete visible square, not a clipped or misplaced control', () => {
  const { png } = raster('color', false)
  const buffer = PNG.sync.write(png)
  for (const bounds of [
    undefined,
    [0, 0, 0, 0],
    [-1, 0, 96, 96],
    [0, 0, 113, 113],
    [0, 0, 96, 95],
    [0, 0, 96, 100],
    [0.5, 0, 96, 96],
  ]) {
    assert.throws(() => svgImage(buffer, bounds))
  }
  assert.equal(readAndroidScenario(), 'full')
  assert.equal(readAndroidScenario('svg-filters'), 'svg-filters')
  assert.throws(() => readAndroidScenario('typo'))
})

function fakeDriver(brokenKind) {
  let kind
  let enabled = false
  const events = []
  const driver = {
    async story(id, expected) {
      kind = id.split('--')[1]
      enabled = false
      assert.equal(expected, `SVG pixel probe: ${kind}`)
      events.push(id)
    },
    async waitFor(label) {
      if (label === 'SVG pixel scene') return { rect: [8, 8, 200, 200] }
      assert.equal(label, enabled ? 'Turn filter off' : 'Turn filter on')
    },
    async tap(label) {
      assert.equal(label, enabled ? 'Turn filter off' : 'Turn filter on')
      events.push(`${kind}: ${label}`)
      enabled = !enabled
    },
    screenshot(name) {
      events.push(name)
      return PNG.sync.write(raster(kind, enabled && kind !== brokenKind, 2).png)
    },
    async waitForImage(read, accept, description) {
      const image = await read()
      assert.ok(accept(image), description)
      return image
    },
    record(name) {
      events.push(name)
    },
  }
  return { driver, events }
}

test('driver toggles each actual scene once in each direction and records all five results', async () => {
  const evidence = {}
  const { driver, events } = fakeDriver()
  await exerciseSvgFilters(driver, evidence)
  assert.deepEqual(
    evidence.svgFilters.map(({ kind }) => kind),
    SVG_FILTER_KINDS,
  )
  assert.ok(evidence.svgFilters.every(({ passed, captures }) => passed && captures.length === 3))
  assert.equal(events.filter((event) => event.includes(': Turn filter')).length, 10)
})

test('a failed case is preserved and aborts the series, never rescued by later effects', async () => {
  const evidence = {}
  const { driver, events } = fakeDriver('blur')
  await assert.rejects(exerciseSvgFilters(driver, evidence), /blur filter effect/)
  assert.deepEqual(
    evidence.svgFilters.map(({ passed }) => passed),
    [true, false],
  )
  assert.match(evidence.svgFilters[1].observations[0].error, /no visible effect/)
  assert.ok(evidence.svgFilters[1].error)
  assert.ok(!events.some((event) => event.includes('--shadow')))
})
