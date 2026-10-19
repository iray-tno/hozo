// Same device/position/renderer comparison, not a CSS or native-span oracle.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { PNG } from 'pngjs'

export function textImage(buffer, bounds) {
  const screen = PNG.sync.read(buffer)
  assert.ok(Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isInteger))
  const [left, top, right, bottom] = bounds
  assert.ok(
    left >= 0 && top >= 0 && right <= screen.width && bottom <= screen.height,
    'Text is clipped or outside the screenshot',
  )
  const width = right - left,
    height = bottom - top
  assert.ok(width >= 96 && height >= 24 && width * height <= 2_000_000, 'invalid Text region')
  const image = new PNG({ width, height })
  PNG.bitblt(screen, image, left, top, width, height, 0, 0)
  return image
}

export function textInk(image, changed) {
  const root = changed ? [124, 45, 18] : [17, 17, 17]
  const nested = [19, 85, 187]
  const counts = { root: 0, nested: 0, white: 0 }
  const near = (index, color) =>
    color.every((channel, at) => Math.abs(image.data[index + at] - channel) <= 8)
  for (let i = 0; i < image.data.length; i += 4) {
    if (near(i, root)) counts.root++
    if (near(i, nested)) counts.nested++
    if (near(i, [255, 255, 255])) counts.white++
  }
  return {
    ...counts,
    valid:
      counts.root >= 20 && counts.nested >= 40 && counts.white > (image.width * image.height) / 4,
  }
}

export function textSignature(image) {
  return {
    width: image.width,
    height: image.height,
    rgbaSha256: createHash('sha256').update(image.data).digest('hex'),
  }
}

export function textFrame(buffer, bounds, mode) {
  const image = PNG.sync.read(buffer)
  assert.ok(Array.isArray(bounds) && bounds.length === 4 && bounds.every(Number.isInteger))
  const [left, top, right, bottom] = bounds
  assert.ok(
    left >= 0 &&
      top >= 0 &&
      right <= image.width &&
      bottom <= image.height &&
      right > left &&
      bottom > top,
  )
  const x = Math.floor((left + right) / 2),
    y = Math.floor((top + bottom) / 2)
  const rgb = Array.from(
    image.data.subarray((y * image.width + x) * 4, (y * image.width + x) * 4 + 3),
  )
  const expected = { ordinary: [223, 32, 32], reference: [32, 160, 64], optimized: [48, 64, 223] }[
    mode
  ]
  assert.ok(expected)
  return {
    bounds,
    rgb,
    expected,
    valid: rgb.every((channel, i) => Math.abs(channel - expected[i]) <= 2),
  }
}

export function textDifference(a, b) {
  if (a.width !== b.width || a.height !== b.height)
    return { equal: false, boundsEqual: false, before: textSignature(a), after: textSignature(b) }
  let maxChannelDelta = 0,
    changedPixels = 0
  for (let i = 0; i < a.data.length; i += 4) {
    let delta = 0
    for (let c = 0; c < 4; c++) delta = Math.max(delta, Math.abs(a.data[i + c] - b.data[i + c]))
    maxChannelDelta = Math.max(maxChannelDelta, delta)
    if (delta) changedPixels++
  }
  return {
    equal: changedPixels === 0,
    boundsEqual: true,
    maxChannelDelta,
    changedPixels,
    comparedPixels: a.width * a.height,
  }
}

export const textState = (kind, changed, tick, mode) =>
  `Text probe state: ${kind} ${changed ? 'changed' : 'rest'} tick ${tick} mode ${mode}`

// No resize, translation, blur or selected-success sampling. The fixture
// reveals each already-mounted label at the same position for this reason.
export async function exerciseTextInheritance(driver, evidence) {
  const modes = ['ordinary', 'reference', 'optimized']
  const result = {
    scope:
      'bounded same-device Native text pixels, not individual-property/AT/performance conformance',
    passed: false,
    phases: [],
    actions: [],
    comparisons: [],
  }
  evidence.textInheritance = result
  const same = (a, b, subject) => {
    const measurement = textDifference(a, b)
    result.comparisons.push({ subject, ...measurement })
    assert.ok(measurement.equal, `${subject}: rendered Text differs`)
  }
  const tap = async (label) => {
    result.actions.push({ label, acknowledged: false })
    await driver.tap(label)
    result.actions.at(-1).acknowledged = true
  }
  await driver.story('diagnostics-text-inheritance--comparison', 'Show ordinary')
  for (const kind of ['static', 'runtime']) {
    await tap(kind === 'static' ? 'Use static region' : 'Use runtime fallback')
    const mounts = {},
      initial = {},
      previous = {}
    for (const [phase, changed, tick, action] of [
      ['initial', false, 0],
      ['ancestor', true, 0, 'Change ancestor'],
      ['label', true, 1, 'Update label'],
      ['restore', false, 0, 'Restore text fixture'],
    ]) {
      if (action) await tap(action)
      const positions = {}
      for (const mode of modes) {
        await tap(`Show ${mode}`)
        await driver.waitFor(textState(kind, changed, tick, mode))
        const observation = { kind, phase, mode, changed, tick, passed: false, captures: [] }
        result.phases.push(observation)
        const image = await driver
          .waitForImage(
            async () => {
              const captured = await driver.capture(
                `${kind}-${phase}-${mode}-${observation.captures.length + 1}`,
                mode,
                tick,
              )
              const ink = textInk(captured.image, kind === 'runtime' && changed)
              const measured = {
                name: captured.name,
                label: captured.label,
                bounds: captured.bounds,
                ink,
                frame: captured.frame,
                ...(captured.pointBounds
                  ? {
                      pointBounds: captured.pointBounds,
                      markerPointBounds: captured.markerPointBounds,
                      screenBounds: captured.screenBounds,
                    }
                  : {}),
                ...textSignature(captured.image),
              }
              observation.captures.push(measured)
              assert.match(captured.label, new RegExp(`^${mode} mount ([1-9]\\d*) tick ${tick}$`))
              const mount = Number(captured.label.match(/mount (\d+)/)[1])
              mounts[mode] ??= mount
              assert.equal(mount, mounts[mode], `${kind}/${mode} remounted within the case`)
              measured.mount = mount
              return { image: captured.image, frame: captured.frame }
            },
            ({ image, frame }) =>
              frame.valid && textInk(image, kind === 'runtime' && changed).valid,
            `${kind}/${phase}/${mode} glyphs`,
          )
          .then(({ image }) => image)
        observation.image = textSignature(image)
        const bounds = observation.captures.at(-1).bounds
        if (mode !== 'ordinary')
          assert.deepEqual(
            bounds,
            positions.ordinary,
            'Text bindings must occupy the same measured position',
          )
        positions[mode] = bounds
        if (phase === 'initial') initial[mode] = image
        if (kind === 'static' || phase === 'restore')
          same(initial[mode], image, `${kind}/${phase}/${mode} shield or restore`)
        if (kind === 'runtime' && phase === 'ancestor') {
          const difference = textDifference(initial[mode], image)
          result.comparisons.push({ subject: `runtime/${mode} visible change`, ...difference })
          assert.equal(difference.equal, false, 'runtime change only updated labels, not glyphs')
          assert.ok(
            image.height > initial[mode].height,
            'runtime metrics did not increase Text bounds',
          )
        }
        if (mode !== 'ordinary')
          same(previous.ordinary, image, `${kind}/${phase}/ordinary vs ${mode}`)
        if (phase === 'label')
          same(previous[`${mode}-ancestor`], image, `${kind}/${mode} label update keeps pixels`)
        previous[mode] = image
        if (phase === 'ancestor') previous[`${mode}-ancestor`] = image
        observation.passed = true
      }
    }
  }
  result.passed = true
  driver.record(
    'static and runtime Text retain mount identity, same-device pixels and restoration',
    { observations: result.phases.length },
  )
}
