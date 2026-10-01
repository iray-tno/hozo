import assert from 'node:assert/strict'
import { PNG } from 'pngjs'

function unescapeXml(value) {
  return value.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[\da-f]+);/gi, (entity) => {
    const named = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" }
    if (named[entity]) return named[entity]
    const hex = entity.startsWith('&#x')
    return String.fromCodePoint(Number.parseInt(entity.slice(hex ? 3 : 2, -1), hex ? 16 : 10))
  })
}

export function parseNodes(xml) {
  assert.ok(xml.includes('<hierarchy'), 'uiautomator did not return a hierarchy')
  return [...xml.matchAll(/<node\b([^>]*)>/g)].map(([, attributes]) => {
    const node = Object.fromEntries(
      [...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [
        name,
        unescapeXml(value),
      ]),
    )
    const bounds = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(node.bounds ?? '')
    return { ...node, rect: bounds ? bounds.slice(1).map(Number) : undefined }
  })
}

export function matchLabel(node, label) {
  return node.text === label || node['content-desc'] === label
}

export function centre(node) {
  assert.ok(node.rect, 'control has no bounds')
  const [left, top, right, bottom] = node.rect
  assert.ok(right > left && bottom > top, 'control has empty bounds')
  return [Math.floor((left + right) / 2), Math.floor((top + bottom) / 2)]
}

export function imageRegion(buffer, bounds) {
  const image = PNG.sync.read(buffer)
  const [left, top, right, bottom] = bounds
  assert.ok(
    left >= 0 && top >= 0 && right <= image.width && bottom <= image.height,
    'image bounds outside screenshot',
  )
  assert.ok(right > left && bottom > top, 'empty image region')
  const pixels = []
  const colours = new Set()
  const step = Math.max(1, Math.floor(Math.min(right - left, bottom - top) / 200))
  for (let y = top; y < bottom; y += step) {
    for (let x = left; x < right; x += step) {
      const at = (y * image.width + x) * 4
      const rgb = Array.from(image.data.subarray(at, at + 3))
      pixels.push(rgb)
      colours.add(rgb.map((value) => value >> 3).join(','))
    }
  }
  return { width: right - left, height: bottom - top, pixels, colours: colours.size }
}

export function changedFraction(before, after) {
  assert.equal(before.width, after.width)
  assert.equal(before.height, after.height)
  assert.equal(before.pixels.length, after.pixels.length)
  let changed = 0
  for (let index = 0; index < before.pixels.length; index++) {
    const difference = before.pixels[index].reduce(
      (sum, value, channel) => sum + Math.abs(value - after.pixels[index][channel]),
      0,
    )
    if (difference > 24) changed++
  }
  return changed / before.pixels.length
}
