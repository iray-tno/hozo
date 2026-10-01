import assert from 'node:assert/strict'
import test from 'node:test'
import { PNG } from 'pngjs'
import { centre, changedFraction, imageRegion, matchLabel, parseNodes } from './device-evidence.mjs'

test('device XML decoding and measured control bounds', () => {
  const [node] = parseNodes(
    '<hierarchy><node text="Save &amp; close" content-desc="name&#10;label" bounds="[2,4][22,44]" enabled="true" /></hierarchy>',
  )
  assert.ok(matchLabel(node, 'Save & close'))
  assert.ok(matchLabel(node, 'name\nlabel'))
  assert.deepEqual(centre(node), [12, 24])
  assert.throws(() => parseNodes('ERROR: idle timeout'))
  assert.throws(() => centre({ rect: [0, 0, 0, 0] }))
})

test('pixels are measured only inside the actual Canvas bounds', () => {
  const image = new PNG({ width: 4, height: 4 })
  image.data.fill(255)
  const before = imageRegion(PNG.sync.write(image), [0, 0, 2, 2])
  // A UI label changing outside the Canvas must not count as GPU evidence.
  image.data.fill(0, (3 * 4 + 3) * 4, (3 * 4 + 3) * 4 + 3)
  const outsideOnly = imageRegion(PNG.sync.write(image), [0, 0, 2, 2])
  assert.equal(changedFraction(before, outsideOnly), 0)
  image.data.fill(0, 0, 3)
  const inside = imageRegion(PNG.sync.write(image), [0, 0, 2, 2])
  assert.equal(changedFraction(before, inside), 0.25)
  assert.equal(before.colours, 1)
  assert.throws(() => imageRegion(PNG.sync.write(image), [0, 0, 5, 4]))
})
