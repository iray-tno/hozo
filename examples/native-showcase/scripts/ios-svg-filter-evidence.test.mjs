import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNG } from 'pngjs'
import { parseIosNodes } from './ios-evidence.mjs'
import { iosSvgEvidence, iosSvgRegion, readIosScenario } from './ios-svg-filter-evidence.mjs'
import { exerciseSvgFilters, SVG_FILTER_KINDS, verifyNativeFilter } from './svg-filter-evidence.mjs'

// Deliberately synthetic: these certify Retina measurement and driver flow,
// not CoreImage rendering. CI must present the actual shared filter scenes.
function screenCapture(kind, enabled, scale, origin = [16, 32]) {
  const screen = { type: 'Application', rect: [0, 0, 144, 192] }
  const node = { rect: [origin[0], origin[1], origin[0] + 96, origin[1] + 96] }
  const png = new PNG({ width: 144 * scale, height: 192 * scale })
  png.data.fill(255)
  for (let y = 0; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const dx = (x + 0.5) / scale - origin[0]
      const dy = (y + 0.5) / scale - origin[1]
      let color = [255, 255, 255]
      if (
        enabled &&
        ['shadow', 'composition'].includes(kind) &&
        dx >= 36 &&
        dx < 76 &&
        dy >= 36 &&
        dy < 76
      )
        color = [220, 40, 40]
      if (enabled && kind === 'blur' && dx >= 18 && dx < 24 && dy >= 28 && dy < 60)
        color = [190, 200, 250]
      if (dx >= 24 && dx < 64 && dy >= 24 && dy < 64) {
        color = ['color', 'blend'].includes(kind) ? [220, 40, 40] : [40, 80, 220]
        if (enabled && kind === 'color') color = [100, 100, 100]
        if (enabled && kind === 'blend') color = [225, 100, 225]
      }
      png.data.set(color, (y * png.width + x) * 4)
    }
  }
  return { buffer: PNG.sync.write(png), node, screen }
}

test('iOS SVG pixels use AX points and Retina screen bounds for every shared effect', () => {
  for (const scale of [2, 3]) {
    for (const kind of SVG_FILTER_KINDS) {
      const off = screenCapture(kind, false, scale, [16.5, 32.5])
      const on = screenCapture(kind, true, scale, [16.5, 32.5])
      const control = iosSvgRegion(off.buffer, off.node, off.screen)
      const filtered = iosSvgRegion(on.buffer, on.node, on.screen)
      assert.ok(verifyNativeFilter(kind, control.image, filtered.image).changed > 32)
      assert.deepEqual(control.screenBounds, [0, 0, 144, 192])
      assert.equal(control.pixelBounds[0], Math.ceil(16.5 * scale))
      assert.ok(control.pixelBounds[2] > off.node.rect[2])
      assert.throws(
        () => verifyNativeFilter(kind, control.image, control.image),
        /no visible effect/,
      )
    }
  }
})

test('iOS SVG measurement refuses missing, clipped, oversized or incompatible screen geometry', () => {
  const { buffer, node, screen } = screenCapture('color', false, 3)
  assert.throws(() => iosSvgRegion(buffer, node, undefined), /screen bounds/)
  assert.throws(() => iosSvgRegion(buffer, {}, screen), /AX bounds/)
  for (const rect of [
    [-1, 32, 95, 128],
    [16, 32, 100, 128],
    [16, 32, 111, 128],
    [16, 32, 128, 144],
  ])
    assert.throws(() => iosSvgRegion(buffer, { rect }, screen))
  assert.throws(() => iosSvgRegion(buffer, node, { rect: [0, 0, 144, 180] }), /aspect ratio/)
  // A control's 96pt bounds cannot double as the entire screenshot's bounds.
  assert.throws(() => iosSvgRegion(buffer, node, node))
})

test('the SVG artifact keeps exact source and binary provenance without inheriting full-scenario success', () => {
  const parent = {
    platform: 'iOS',
    scenario: 'full',
    passed: true,
    checks: [{ passed: true }],
    binaryRun: '123',
    driverCommit: 'driver',
    jsBundleCommit: 'rebundled',
    axBackend: 'ax',
    diagnostic: false,
    simulator: { udid: 'exact' },
  }
  const source = Buffer.from('shared filter scene')
  const svg = iosSvgEvidence(parent, source, '15.15.4')
  assert.equal(svg.passed, false)
  assert.deepEqual(svg.checks, [])
  assert.notEqual(svg.checks, parent.checks)
  assert.equal(svg.parentScenario, 'full')
  assert.equal(svg.scenario, 'svg-filters')
  assert.equal(svg.binaryRun, '123')
  assert.equal(svg.driverCommit, 'driver')
  assert.equal(svg.jsBundleCommit, 'rebundled')
  assert.equal(svg.sceneSourceSha256, createHash('sha256').update(source).digest('hex'))
  assert.equal(svg.svgPeerVersion, '15.15.4')
  assert.equal(readIosScenario(), 'full')
  for (const scenario of ['full', 'svg-filters', 'canvas', 'gl-control'])
    assert.equal(readIosScenario(scenario), scenario)
  assert.throws(() => readIosScenario('typo'))
})

async function iosDriver(brokenKind) {
  let kind
  let enabled
  const taps = []
  const evidence = { checks: [] }
  const sample = () => screenCapture(kind, enabled && kind !== brokenKind, 3)
  const driver = {
    async story(id) {
      kind = id.split('--')[1]
      enabled = false
    },
    async waitFor(text) {
      if (text === 'SVG pixel scene') return sample().node
      assert.equal(text, enabled ? 'Turn filter off' : 'Turn filter on')
    },
    async tap(text) {
      assert.equal(text, enabled ? 'Turn filter off' : 'Turn filter on')
      taps.push(`${kind}:${text}`)
      enabled = !enabled
    },
    screenshot: () => sample().buffer,
    captureRegion: (buffer, node) => {
      const tree = parseIosNodes(
        JSON.stringify([{ type: 'Application', frame: { x: 0, y: 0, width: 144, height: 192 } }]),
      )
      return iosSvgRegion(buffer, node, tree[0])
    },
    async waitForImage(read, accept, description) {
      const image = read()
      assert.ok(accept(image), description)
      return image
    },
    record: (name, details) => evidence.checks.push({ name, ...details }),
  }
  let error
  try {
    await exerciseSvgFilters(driver, evidence)
  } catch (failure) {
    error = failure
  }
  return { evidence, taps, error }
}

test('the shared driver checks all five iOS effects and off/on/off pixels, not labels', async () => {
  const { evidence, taps, error } = await iosDriver()
  assert.equal(error, undefined)
  assert.equal(taps.length, 10)
  assert.equal(evidence.checks.length, 5)
  assert.ok(evidence.svgFilters.every((row) => row.passed && row.captures.length === 3))
  assert.deepEqual(evidence.svgFilters[0].bounds, [16, 32, 112, 128])
  assert.deepEqual(evidence.svgFilters[0].pixelBounds, [48, 96, 336, 384])
})

test('iOS failure stops at the failed effect despite correct toggle labels', async () => {
  const { evidence, taps, error } = await iosDriver('blur')
  assert.match(String(error), /blur filter effect/)
  assert.deepEqual(
    evidence.svgFilters.map((row) => row.passed),
    [true, false],
  )
  assert.equal(evidence.checks.length, 1)
  assert.equal(taps.length, 3)
  assert.match(evidence.svgFilters[1].observations[0].error, /no visible effect/)
})

test('normal iOS workflow includes SVG evidence without a second app launch or losing the full scenario', () => {
  const smoke = readFileSync(new URL('./ios-smoke.mjs', import.meta.url), 'utf8')
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(smoke, /if \(evidence\.scenario === 'svg-filters'\) \{\s*await svgFilters\(\)/)
  assert.match(
    smoke,
    /record\('shared dialog opens, cancels and confirms'\)[\s\S]*?await svgFilters\(\)[\s\S]*?const canvasRequestedAt/,
  )
  assert.equal([...smoke.matchAll(/launch\(app\)/g)].length, 1)
  assert.match(smoke, /captureRegion: \(buffer, node\) =>\s*iosSvgRegion/)
  assert.match(workflow, /options: \[full, svg-filters, canvas, gl-control\]/)
  assert.match(workflow, /name: hozo-native-showcase-ios-svg-evidence/)
  assert.match(workflow, /path: artifacts\/native-showcase-ios\/svg-filters/)
})
