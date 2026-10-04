import assert from 'node:assert/strict'

export function sample(image, x, y) {
  assert.equal(image.pixels.length, image.width * image.height * 4, 'invalid pixel buffer')
  assert.ok(x >= 0 && x < image.width && y >= 0 && y < image.height, 'sample outside image')
  const offset = (y * image.width + x) * 4
  return image.pixels.slice(offset, offset + 3)
}

export function comparePixels(before, after) {
  assert.equal(before.width, after.width)
  assert.equal(before.height, after.height)
  assert.equal(before.pixels.length, after.pixels.length)
  let changed = 0
  let maxDelta = 0
  for (let offset = 0; offset < before.pixels.length; offset += 4) {
    let delta = 0
    for (let channel = 0; channel < 4; channel++) {
      delta = Math.max(
        delta,
        Math.abs(before.pixels[offset + channel] - after.pixels[offset + channel]),
      )
    }
    if (delta > 1) changed++
    maxDelta = Math.max(maxDelta, delta)
  }
  return { changed, maxDelta }
}

// Separate semantic assertions from parity: two identically broken renderings
// must fail even when their screenshot buffers are equal. Positions come from
// the shared 96x96 scene, not from text/status labels in a test-only component.
export function verifyEffect(kind, control, filtered) {
  assert.equal(control.width, 96)
  assert.equal(control.height, 96)
  const source = kind === 'color' || kind === 'blend' ? [220, 40, 40] : [40, 80, 220]
  assert.deepEqual(sample(control, 48, 48), source, `${kind}: unfiltered source missing`)
  assert.deepEqual(sample(control, 70, 50), [255, 255, 255], `${kind}: control has a shadow`)
  const difference = comparePixels(control, filtered)
  assert.ok(difference.changed > 32, `${kind}: filter had no visible effect`)
  const center = sample(filtered, 48, 48)
  const outside = sample(filtered, 20, 44)
  const shadow = sample(filtered, 70, 50)
  if (kind === 'color') {
    assert.ok(Math.max(...center) - Math.min(...center) <= 2, 'color: source is not gray')
    assert.ok(center[0] > 30 && center[0] < 200, 'color: gray source vanished')
  } else if (kind === 'blur') {
    assert.ok(outside[0] < 245 && outside[2] > outside[0], 'blur: no blue pixels outside source')
    assert.ok(center[2] > 180 && center[0] < 100, 'blur: source disappeared')
  } else if (kind === 'shadow' || kind === 'composition') {
    assert.ok(
      shadow[0] > 170 && shadow[1] < 100 && shadow[2] < 100,
      `${kind}: offset red shadow missing`,
    )
    assert.deepEqual(center, source, `${kind}: source must be above shadow (merge order)`)
  } else if (kind === 'blend') {
    assert.ok(center[0] > 180 && center[2] > 180, 'blend: red and blue did not screen to magenta')
  } else {
    assert.fail(`Unreviewed SVG effect: ${kind}`)
  }
  assert.deepEqual(
    sample(filtered, 4, 4),
    [255, 255, 255],
    `${kind}: filter escaped its useful region`,
  )
  return { ...difference, center, outside, shadow }
}
