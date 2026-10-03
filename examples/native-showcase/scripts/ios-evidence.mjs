import assert from 'node:assert/strict'

// idb reports screen points, whereas simctl screenshots contain Retina pixels.
// Keep the original AX fields for diagnosis; descend through grouped children.
export function parseIosNodes(json) {
  const tree = JSON.parse(json)
  assert.ok(Array.isArray(tree) || (tree && typeof tree === 'object'), 'invalid AX tree')
  const nodes = []
  function visit(node) {
    if (Array.isArray(node)) return node.forEach(visit)
    if (!node || typeof node !== 'object') return
    const frame = node.frame
    let rect
    if (frame) rect = [frame.x, frame.y, frame.x + frame.width, frame.y + frame.height]
    else if (typeof node.AXFrame === 'string') {
      const numbers = node.AXFrame.match(/-?\d+(?:\.\d+)?/g)?.map(Number)
      if (numbers?.length === 4) {
        const [x, y, width, height] = numbers
        rect = [x, y, x + width, y + height]
      }
    }
    if (rect) {
      assert.ok(rect.every(Number.isFinite), 'invalid AX bounds')
      nodes.push({ ...node, rect })
    }
    visit(node.children)
  }
  visit(tree)
  return nodes
}

export function pixelBounds(rect, screenRect, image) {
  const [left, top, right, bottom] = screenRect
  assert.equal(left, 0, 'AX screen must start at x=0')
  assert.equal(top, 0, 'AX screen must start at y=0')
  assert.ok(right > 0 && bottom > 0, 'empty AX screen')
  const scaleX = image.width / right
  const scaleY = image.height / bottom
  assert.ok(Math.abs(scaleX - scaleY) < 0.01, 'AX screen/screenshot aspect ratio differs')
  assert.ok(rect[0] >= 0 && rect[1] >= 0 && rect[2] <= right && rect[3] <= bottom)
  assert.ok(rect[2] > rect[0] && rect[3] > rect[1], 'empty Canvas')
  // Round inward so neighboring labels cannot enter the measured GL region.
  return [
    Math.ceil(rect[0] * scaleX),
    Math.ceil(rect[1] * scaleY),
    Math.floor(rect[2] * scaleX),
    Math.floor(rect[3] * scaleY),
  ]
}

export function openShowcaseConfirmation(nodes) {
  // simctl openurl can go through the OS's external-app confirmation. Do not
  // approve arbitrary alerts (or another app's similarly named Open button).
  const prompt = nodes.some((node) => /^Open in [“"]Hozo Showcase[”"]\?$/.test(node.AXLabel ?? ''))
  return prompt
    ? nodes.find((node) => node.type === 'Button' && node.AXLabel === 'Open')
    : undefined
}

export function visualTextControl(boxes, text, screenRect) {
  // Vision can include Storybook's leading bullet in the same text box. Strip
  // only that observed decoration; keep exact wording and ambiguity checks.
  const matches = boxes.filter(
    (box) => box.text.replace(/^•\s+/, '') === text && box.confidence >= 0.8,
  )
  assert.ok(matches.length <= 1, `ambiguous visible text: ${text}`)
  if (!matches.length) return undefined
  const box = matches[0]
  const coordinates = [box.x, box.y, box.width, box.height]
  assert.ok(coordinates.every(Number.isFinite), 'invalid OCR bounds')
  assert.ok(box.x >= 0 && box.y >= 0 && box.width > 0 && box.height > 0)
  assert.ok(box.x + box.width <= 1 && box.y + box.height <= 1)
  const [left, top, right, bottom] = screenRect
  assert.ok(right > left && bottom > top)
  const width = right - left
  const height = bottom - top
  // Vision's normalized origin is bottom-left; HID's is top-left in points.
  return {
    rect: [
      left + box.x * width,
      top + (1 - box.y - box.height) * height,
      left + (box.x + box.width) * width,
      top + (1 - box.y) * height,
    ],
  }
}
