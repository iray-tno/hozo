// Synthetic screenshots establish geometry and rejection behavior, not CoreText.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNG } from 'pngjs'
import { readIosScenario } from './ios-svg-filter-evidence.mjs'
import { iosTextCapture, iosTextProvenance } from './ios-text-evidence.mjs'
import { exerciseTextInheritance, textDifference, textInk, textState } from './text-pixels.mjs'

function capture(scale, mode = 'ordinary', changed = false) {
  const screen = { type: 'Application', rect: [0, 0, 300, 260] }
  const node = { rect: [16.5, 80.5, 256.5, changed ? 200.5 : 176.5] }
  const marker = { rect: [16.5, 55.5, 48.5, 67.5] }
  const png = new PNG({ width: 300 * scale, height: 260 * scale })
  png.data.fill(255)
  const markerColor = {
    ordinary: [223, 32, 32],
    reference: [32, 160, 64],
    optimized: [48, 64, 223],
  }[mode]
  for (let y = 0; y < png.height; y++)
    for (let x = 0; x < png.width; x++) {
      const px = (x + 0.5) / scale,
        py = (y + 0.5) / scale
      let rgb
      if (px >= 16.5 && px < 48.5 && py >= 55.5 && py < 67.5) rgb = markerColor
      if (py >= 90.5 && py < 110.5 && px >= 20.5 && px < 100.5)
        rgb = px < 40.5 ? (changed ? [124, 45, 18] : [17, 17, 17]) : [19, 85, 187]
      if (rgb) png.data.set([...rgb, 255], (y * png.width + x) * 4)
    }
  return { buffer: PNG.sync.write(png), node, marker, screen }
}

test('iOS keeps AX points and Retina pixels separate without normalizing glyph images', () => {
  for (const scale of [2, 3]) {
    const initial = capture(scale)
    const ordinary = iosTextCapture(
      initial.buffer,
      initial.node,
      initial.marker,
      initial.screen,
      'ordinary',
    )
    // Inward rounding keeps neighboring pixels out at half-point origins;
    // at 3x that deliberately removes one boundary pixel, without resampling.
    assert.equal(ordinary.image.width, Math.floor(256.5 * scale) - Math.ceil(16.5 * scale))
    assert.equal(ordinary.image.height, Math.floor(176.5 * scale) - Math.ceil(80.5 * scale))
    assert.deepEqual(ordinary.pointBounds, initial.node.rect)
    assert.equal(ordinary.bounds[0], Math.ceil(16.5 * scale))
    assert.equal(ordinary.frame.valid, true)
    assert.equal(textInk(ordinary.image, false).valid, true)
    for (const mode of ['reference', 'optimized']) {
      const next = capture(scale, mode)
      const actual = iosTextCapture(next.buffer, next.node, next.marker, next.screen, mode)
      assert.equal(actual.frame.valid, true)
      assert.equal(textDifference(ordinary.image, actual.image).equal, true)
      assert.equal(
        iosTextCapture(initial.buffer, initial.node, initial.marker, initial.screen, mode).frame
          .valid,
        false,
      )
    }
  }
})

test('iOS rejects missing, clipped and inconsistent screen/marker/Text geometry rather than guessing scale', () => {
  const { buffer, node, marker, screen } = capture(3)
  assert.throws(() => iosTextCapture(buffer, node, marker, undefined, 'ordinary'), /screen bounds/)
  assert.throws(() => iosTextCapture(buffer, {}, marker, screen, 'ordinary'), /measured AX/)
  for (const rect of [
    [-1, 80, 239, 176],
    [16, 80, 255, 176],
    [16, 80, 256, 281],
  ])
    assert.throws(() => iosTextCapture(buffer, { rect }, marker, screen, 'ordinary'))
  assert.throws(
    () => iosTextCapture(buffer, node, { rect: [0, 0, 31, 12] }, screen, 'ordinary'),
    /marker is clipped/,
  )
  assert.throws(
    () => iosTextCapture(buffer, node, marker, { rect: [0, 0, 300, 250] }, 'ordinary'),
    /aspect ratio/,
  )
  assert.throws(() => iosTextCapture(buffer, node, marker, node, 'ordinary'))
})

test('fresh Simulator provenance rejects old/changed archives, rebundles, diagnostic runs and empty bundles', () => {
  const archive = Buffer.from('synthetic archive'),
    bundle = Buffer.from('synthetic JS bundle')
  const parent = {
    scenario: 'text-inheritance',
    driverCommit: 'a'.repeat(40),
    binaryRun: '123',
    diagnostic: false,
  }
  const build = {
    run: '123',
    commit: parent.driverCommit,
    archiveSha256: createHash('sha256').update(archive).digest('hex'),
  }
  const result = iosTextProvenance(parent, '123', build, archive, bundle)
  assert.equal(result.simulatorArchive.verifiedSha256, build.archiveSha256)
  assert.equal(result.jsBundleSha256, createHash('sha256').update(bundle).digest('hex'))
  for (const changes of [
    { binaryRun: '122' },
    { driverCommit: 'b'.repeat(40) },
    { diagnostic: true },
    { scenario: 'full' },
    { jsBundleCommit: parent.driverCommit },
  ])
    assert.throws(() => iosTextProvenance({ ...parent, ...changes }, '123', build, archive, bundle))
  assert.throws(() => iosTextProvenance(parent, undefined, build, archive, bundle))
  assert.throws(() => iosTextProvenance(parent, '123', { ...build, run: '122' }, archive, bundle))
  assert.throws(() => iosTextProvenance(parent, '123', build, Buffer.from('changed'), bundle))
  assert.throws(() => iosTextProvenance(parent, '123', build, archive, Buffer.alloc(0)))
})

test('the shared 42-state driver consumes Retina crops and preserves failed iOS observations', async () => {
  for (const broken of [false, true]) {
    let kind = 'static',
      changed = false,
      tick = 0,
      mode = 'ordinary',
      override = false
    const evidence = { platform: 'iOS' }
    const driver = {
      async story(id) {
        assert.equal(id, 'diagnostics-text-inheritance--comparison')
      },
      async tap(action) {
        if (action === 'Use runtime fallback') kind = 'runtime'
        else if (action === 'Use opaque boundary') kind = 'opaque'
        else if (action === 'Change ancestor') changed = !changed
        else if (action === 'Update label') tick++
        else if (action === 'Restore text fixture') {
          changed = false
          tick = 0
          override = false
        } else if (action === 'Apply local override') override = true
        else if (action === 'Remove local override') override = false
        else if (action.startsWith('Show ')) mode = action.slice(5)
        else assert.equal(action, 'Use static region')
      },
      async waitFor(label) {
        assert.equal(label, textState(kind, changed, tick, mode, override))
      },
      async capture(name) {
        const c = capture(3, mode, kind !== 'static' && changed && !override)
        const actual = iosTextCapture(c.buffer, c.node, c.marker, c.screen, mode)
        if (broken && mode === 'optimized') actual.image.data[0]--
        return { name, label: `${mode} mount 1 tick ${tick}`, ...actual }
      },
      async waitForImage(read, accept) {
        const image = await read()
        assert.ok(accept(image))
        return image
      },
      record() {
        evidence.checked = true
      },
    }
    if (broken) {
      await assert.rejects(exerciseTextInheritance(driver, evidence), /Text differs/)
      assert.equal(evidence.textInheritance.passed, false)
      assert.equal(evidence.textInheritance.phases.length, 3)
      assert.equal(evidence.textInheritance.phases.at(-1).passed, false)
      assert.equal(evidence.checked, undefined)
    } else {
      await exerciseTextInheritance(driver, evidence)
      assert.equal(evidence.textInheritance.phases.length, 42)
      assert.ok(
        evidence.textInheritance.phases.every(
          (phase) => phase.captures[0].screenBounds && phase.captures[0].pointBounds,
        ),
      )
      assert.equal(evidence.textInheritance.passed, true)
    }
  }
})

test('iOS text scenario is isolated and uses the same comparator, fresh fingerprints and original failure/syslog capture', () => {
  assert.equal(readIosScenario(), 'full')
  assert.equal(readIosScenario('text-inheritance'), 'text-inheritance')
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(workflow, /options: \[full, svg-filters, canvas, gl-control, text-inheritance\]/)
  assert.match(workflow, /HOZO_IOS_SCENARIO: \$\{\{ inputs.ios-scenario \|\| 'full' \}\}/)
  const source = readFileSync(new URL('./ios-smoke.mjs', import.meta.url), 'utf8')
  assert.match(source, /from '\.\/text-pixels.mjs'/)
  assert.match(source, /iosTextCapture\(buffer, node, marker, screen, mode\)/)
  assert.match(source, /iosTextProvenance\(/)
  assert.match(source, /ios\/HozoShowcase-simulator.zip/)
  assert.match(source, /logger\?\.kill\(\)/)
  assert.match(source, /screenshot\('failure'\)/)
})
