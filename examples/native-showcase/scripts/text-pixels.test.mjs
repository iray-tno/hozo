// Synthetic images test rejection/orchestration only. They are not RN glyphs.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { PNG } from 'pngjs'
import {
  exerciseTextInheritance,
  textDifference,
  textFrame,
  textImage,
  textInk,
  textState,
} from './text-pixels.mjs'

function image(changed = false) {
  const result = new PNG({ width: 120, height: changed ? 80 : 60 })
  result.data.fill(255)
  for (let y = 8; y < 28; y++)
    for (let x = 4; x < 84; x++) {
      const rgb = x < 24 ? (changed ? [124, 45, 18] : [17, 17, 17]) : [19, 85, 187]
      result.data.set([...rgb, 255], (y * result.width + x) * 4)
    }
  return result
}

test('Text crop and ink gates reject blanks, clipping, solids, missing nested paint and stale frames', () => {
  const source = image()
  const buffer = PNG.sync.write(source)
  assert.equal(textInk(source, false).valid, true)
  assert.equal(textInk(source, true).valid, false)
  assert.equal(textDifference(source, textImage(buffer, [0, 0, 120, 60])).equal, true)
  for (const bounds of [
    [-1, 0, 120, 60],
    [0, 0, 121, 60],
    [0, 0, 120, 61],
    [0, 0, 120, 0],
    [0, 0, 100.1, 60],
  ])
    assert.throws(() => textImage(buffer, bounds))
  const blank = image()
  blank.data.fill(255)
  assert.equal(textInk(blank, false).valid, false)
  for (let i = 0; i < blank.data.length; i += 4) blank.data.set([19, 85, 187, 255], i)
  assert.equal(textInk(blank, false).valid, false)
  const marker = new PNG({ width: 120, height: 60 })
  for (let i = 0; i < marker.data.length; i += 4) marker.data.set([223, 32, 32, 255], i)
  assert.equal(textFrame(PNG.sync.write(marker), [0, 0, 120, 60], 'ordinary').valid, true)
  assert.equal(textFrame(PNG.sync.write(marker), [0, 0, 120, 60], 'reference').valid, false)
  assert.throws(() => textFrame(buffer, [0, 0, 121, 60], 'ordinary'))
  const wrong = image()
  wrong.data[0]--
  assert.equal(
    textDifference(source, wrong).equal,
    false,
    'even one channel step is not silently blurred away',
  )
  assert.equal(textDifference(source, image(true)).boundsEqual, false)
})

function harness(mutate = () => {}) {
  const evidence = {},
    actions = [],
    captures = []
  let kind = 'static',
    changed = false,
    tick = 0,
    mode = 'ordinary',
    override = false
  const driver = {
    async story(id) {
      assert.equal(id, 'diagnostics-text-inheritance--comparison')
    },
    async tap(label) {
      actions.push(label)
      if (label === 'Use runtime fallback') kind = 'runtime'
      else if (label === 'Use static region') kind = 'static'
      else if (label === 'Use opaque boundary') kind = 'opaque'
      else if (label === 'Change ancestor') changed = !changed
      else if (label === 'Update label') tick++
      else if (label === 'Restore text fixture') {
        changed = false
        tick = 0
        override = false
      } else if (label === 'Apply local override') override = true
      else if (label === 'Remove local override') override = false
      else if (label.startsWith('Show ')) mode = label.slice(5)
      else assert.fail(label)
    },
    async waitFor(label) {
      assert.equal(label, textState(kind, changed, tick, mode, override))
    },
    async capture(name) {
      const rendered = image(kind !== 'static' && changed && !override)
      const captured = {
        name,
        image: rendered,
        label: `${mode} mount 1 tick ${tick}`,
        bounds: [0, 0, 120, rendered.height],
        frame: { valid: true, rgb: [0, 0, 0] },
      }
      mutate(captured, { kind, changed, tick, mode, override, actions })
      captures.push(name)
      return captured
    },
    async waitForImage(read, accept) {
      const value = await read()
      assert.ok(accept(value), 'no presented glyphs/frame')
      return value
    },
    record(name) {
      evidence.checks = [{ name, passed: true }]
    },
  }
  return { evidence, driver, actions, captures }
}

test('the driver measures all 70 states, comparisons and mount retention without self-certified callbacks', async () => {
  const { evidence, driver, actions } = harness()
  await exerciseTextInheritance(driver, evidence)
  assert.equal(evidence.textInheritance.passed, true)
  assert.equal(evidence.textInheritance.phases.length, 70)
  assert.equal(evidence.textInheritance.comparisons.length, 121)
  assert.equal(actions.length, 84)
  assert.deepEqual(evidence.textInheritance.modes, [
    'ordinary',
    'reference',
    'optimized',
    'production',
    'production-static',
  ])
  assert.ok(
    evidence.textInheritance.phases.every((phase) => phase.passed && phase.captures.length === 1),
  )
  assert.equal(actions.filter((label) => label === 'Change ancestor').length, 3)
  assert.equal(actions.filter((label) => label.startsWith('Show ')).length, 70)
  assert.equal(evidence.textInheritance.comparisons.filter((c) => c.equal).length, 111)
  assert.equal(evidence.textInheritance.comparisons.filter((c) => !c.equal).length, 10)
  assert.ok(
    evidence.textInheritance.comparisons.some(
      (comparison) =>
        comparison.subject === 'runtime/optimized visible change' && !comparison.equal,
    ),
  )
})

test('wrong pixels, ignored changes, remounts and stale mode markers abort at the first failed observation', async () => {
  for (const mutate of [
    (sample, state) => {
      if (state.mode === 'optimized') sample.image.data[0]--
    },
    (sample, state) => {
      if (state.mode === 'production') sample.image.data[0]--
    },
    (sample, state) => {
      if (state.mode === 'production-static') sample.image.data[0]--
    },
    (sample, state) => {
      if (state.mode === 'production-static' && state.changed)
        sample.label = `${state.mode} mount 2 tick ${state.tick}`
    },
    (sample, state) => {
      if (state.mode === 'production-static') sample.frame.valid = false
    },
    (sample, state) => {
      if (state.kind === 'runtime' && state.changed) sample.image = image()
    },
    (sample, state) => {
      if (state.changed) sample.label = `${state.mode} mount 2 tick ${state.tick}`
    },
    (sample, state) => {
      if (state.mode === 'reference') sample.frame.valid = false
    },
    (sample, state) => {
      if (state.mode === 'reference') sample.bounds = [1, 0, 121, sample.image.height]
    },
  ]) {
    const { driver, evidence, actions } = harness(mutate)
    await assert.rejects(exerciseTextInheritance(driver, evidence))
    assert.equal(evidence.textInheritance.passed, false)
    assert.equal(evidence.checks, undefined)
    assert.equal(evidence.textInheritance.phases.at(-1).passed, false)
    assert.equal(evidence.textInheritance.phases.at(-1).captures.length, 1)
    assert.ok(actions.length < 84, 'no later phases or successful retries')
  }
  const failure = new Error('ambiguous tap')
  const state = harness()
  state.driver.tap = async () => {
    throw failure
  }
  await assert.rejects(
    exerciseTextInheritance(state.driver, state.evidence),
    (error) => error === failure,
  )
  assert.deepEqual(state.evidence.textInheritance.actions, [
    { label: 'Use static region', acknowledged: false },
  ])
})

test('Android text rendering is opt-in, source-bound and retained separately without weakening full/release coverage', () => {
  const workflow = readFileSync(
    new URL('../../../.github/workflows/native-showcase.yml', import.meta.url),
    'utf8',
  )
  assert.match(
    workflow,
    /options: \[full, svg-filters, audio-output, audio-settings, text-inheritance\]/,
  )
  assert.match(workflow, /name: hozo-native-showcase-android-text-evidence/)
  assert.match(workflow, /path: artifacts\/native-showcase-text/)
  const smoke = readFileSync(new URL('./android-smoke.mjs', import.meta.url), 'utf8')
  assert.match(smoke, /evidence\.binaryRun === process\.env\.GITHUB_RUN_ID/)
  assert.match(smoke, /evidence\.apkSha256 = createHash/)
  assert.match(smoke, /prepareTextDeviceFixture\(\)\.manifest/)
  assert.match(smoke, /textFrame\(buffer, frameNode\.rect, mode\)/)
  assert.match(smoke, /writeFileSync\(resolve\(output, 'logcat\.txt'\)/)
})

test('opaque-only missing inheritance, ignored overrides/removal and state loss cannot pass earlier successful cases', async () => {
  for (const mode of ['optimized', 'production', 'production-static']) {
    for (const [phase, mutate] of [
      [
        'ancestor',
        (sample, state) => {
          if (state.changed) sample.image = image()
        },
      ],
      [
        'override',
        (sample, state) => {
          if (state.override) sample.image = image(true)
        },
      ],
      [
        'unoverride',
        (sample, state) => {
          if (state.actions.includes('Remove local override')) sample.image = image()
        },
      ],
      [
        'ancestor',
        (sample, state) => {
          if (state.changed) sample.label = `${state.mode} mount 2 tick ${state.tick}`
        },
      ],
    ]) {
      const { driver, evidence, actions } = harness((sample, state) => {
        if (state.kind === 'opaque' && state.mode === mode) mutate(sample, state)
      })
      await assert.rejects(exerciseTextInheritance(driver, evidence))
      assert.ok(evidence.textInheritance.phases.slice(0, 40).every((item) => item.passed))
      assert.equal(evidence.textInheritance.phases.at(-1).kind, 'opaque')
      assert.equal(evidence.textInheritance.phases.at(-1).phase, phase)
      assert.equal(evidence.textInheritance.phases.at(-1).passed, false)
      assert.equal(evidence.textInheritance.passed, false)
      assert.equal(evidence.checks, undefined)
      assert.ok(actions.length < 84)
    }
  }
})
