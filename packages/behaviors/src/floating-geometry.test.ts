import assert from 'node:assert/strict'
import test from 'node:test'
import { computePosition, parsePlacement, type Rect, type Viewport } from './floating-geometry.ts'

const viewport: Viewport = { width: 1000, height: 800 }
// Default anchor: 100x40 at (400, 300)
const defaultAnchor: Rect = { x: 400, y: 300, width: 100, height: 40 }
// Default floating: 200x100
const defaultFloating: Rect = { x: 0, y: 0, width: 200, height: 100 }

test('parsePlacement: correctly parses base and alignment', () => {
  assert.deepEqual(parsePlacement('bottom'), { basePlacement: 'bottom', alignment: 'center' })
  assert.deepEqual(parsePlacement('top-start'), { basePlacement: 'top', alignment: 'start' })
  assert.deepEqual(parsePlacement('left-end'), { basePlacement: 'left', alignment: 'end' })
  assert.deepEqual(parsePlacement('right'), { basePlacement: 'right', alignment: 'center' })
})

test('computePosition: basic 4-direction placements with default offset=8', () => {
  // Bottom: anchor.y + 40 + 8 = 348. x centered: 400 + (100 - 200)/2 = 350
  const bottom = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom',
    offset: 8,
  })
  assert.equal(bottom.x, 350)
  assert.equal(bottom.y, 348)
  assert.equal(bottom.basePlacement, 'bottom')
  assert.equal(bottom.flipped, false)
  assert.equal(bottom.shifted, false)

  // Top: anchor.y - 100 - 8 = 192. x centered: 350
  const top = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'top',
    offset: 8,
  })
  assert.equal(top.x, 350)
  assert.equal(top.y, 192)
  assert.equal(top.basePlacement, 'top')

  // Right: anchor.x + 100 + 8 = 508. y centered: 300 + (40 - 100)/2 = 270
  const right = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'right',
    offset: 8,
  })
  assert.equal(right.x, 508)
  assert.equal(right.y, 270)
  assert.equal(right.basePlacement, 'right')

  // Left: anchor.x - 200 - 8 = 192. y centered: 270
  const left = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'left',
    offset: 8,
  })
  assert.equal(left.x, 192)
  assert.equal(left.y, 270)
  assert.equal(left.basePlacement, 'left')
})

test('computePosition: alignment start, center, and end for vertical placement', () => {
  // bottom-start: x = anchor.x = 400
  const start = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom-start',
  })
  assert.equal(start.x, 400)
  assert.equal(start.alignment, 'start')

  // bottom-end: x = anchor.x + 100 - 200 = 300
  const end = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom-end',
  })
  assert.equal(end.x, 300)
  assert.equal(end.alignment, 'end')
})

test('computePosition: alignment start, center, and end for horizontal placement', () => {
  // right-start: y = anchor.y = 300
  const start = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'right-start',
  })
  assert.equal(start.y, 300)
  assert.equal(start.alignment, 'start')

  // right-end: y = anchor.y + 40 - 100 = 240
  const end = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'right-end',
  })
  assert.equal(end.y, 240)
  assert.equal(end.alignment, 'end')
})

test('computePosition: applies crossAxisOffset and custom offset', () => {
  const res = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom-start',
    offset: 16,
    crossAxisOffset: 12,
  })
  // y = 300 + 40 + 16 = 356
  assert.equal(res.y, 356)
  // x = 400 + 12 = 412
  assert.equal(res.x, 412)
})

test('computePosition (Flip): flips from bottom to top when hitting viewport bottom', () => {
  // Anchor placed near bottom: y = 740, height = 40 (bottom at 780, only 20px space left)
  const nearBottomAnchor: Rect = { x: 400, y: 740, width: 100, height: 40 }

  const res = computePosition(nearBottomAnchor, defaultFloating, viewport, {
    placement: 'bottom',
    offset: 8,
  })
  assert.equal(res.flipped, true)
  assert.equal(res.basePlacement, 'top')
  assert.equal(res.placement, 'top')
  // Top: 740 - 100 - 8 = 632
  assert.equal(res.y, 632)
})

test('computePosition (Flip): flips from top to bottom when hitting viewport top', () => {
  // Anchor near top: y = 20, height = 40 (only 20px space above)
  const nearTopAnchor: Rect = { x: 400, y: 20, width: 100, height: 40 }

  const res = computePosition(nearTopAnchor, defaultFloating, viewport, {
    placement: 'top',
    offset: 8,
  })
  assert.equal(res.flipped, true)
  assert.equal(res.basePlacement, 'bottom')
  assert.equal(res.y, 20 + 40 + 8) // 68
})

test('computePosition (Flip): preserves alignment when flipping', () => {
  const nearBottomAnchor: Rect = { x: 400, y: 740, width: 100, height: 40 }
  const res = computePosition(nearBottomAnchor, defaultFloating, viewport, {
    placement: 'bottom-start',
  })
  assert.equal(res.flipped, true)
  assert.equal(res.placement, 'top-start')
  assert.equal(res.alignment, 'start')
  assert.equal(res.x, 400)
})

test('computePosition (Flip): stays on side with more space if neither fits completely', () => {
  const smallViewport: Viewport = { width: 500, height: 180 }
  // Anchor at y = 70, height = 40. Top space = 70, Bottom space = 180 - 110 = 70.
  // Anchor at y = 100: Top space = 100, Bottom space = 180 - 140 = 40.
  const anchor: Rect = { x: 100, y: 100, width: 100, height: 40 }
  const bigFloating: Rect = { x: 0, y: 0, width: 200, height: 150 }

  const res = computePosition(anchor, bigFloating, smallViewport, {
    placement: 'bottom',
  })
  // Bottom has 40px space, Top has 100px space -> flips to top because top has more space
  assert.equal(res.flipped, true)
  assert.equal(res.basePlacement, 'top')
})

test('computePosition (Flip): flip=false disables flipping', () => {
  const nearBottomAnchor: Rect = { x: 400, y: 740, width: 100, height: 40 }
  const res = computePosition(nearBottomAnchor, defaultFloating, viewport, {
    placement: 'bottom',
    flip: false,
  })
  assert.equal(res.flipped, false)
  assert.equal(res.basePlacement, 'bottom')
})

test('computePosition (Shift): shifts floating element when overflowing viewport horizontally', () => {
  // Anchor placed at right edge: x = 950, width = 40 (center is 970)
  const edgeAnchor: Rect = { x: 950, y: 300, width: 40, height: 40 }
  // defaultFloating is 200px wide. Without shift, centered at 950 + (40-200)/2 = 870.
  // bottom-start: x = 950 -> 950 + 200 = 1150 > viewport width 1000!
  const res = computePosition(edgeAnchor, defaultFloating, viewport, {
    placement: 'bottom-start',
    viewportPadding: 10,
  })
  assert.equal(res.shifted, true)
  // Shifted so max x = 1000 - 200 - 10 = 790
  assert.equal(res.x, 790)
})

test('computePosition (Shift): shifts floating element from left viewport edge', () => {
  // Anchor placed at left edge: x = 5, width = 40
  const edgeAnchor: Rect = { x: 5, y: 300, width: 40, height: 40 }
  // bottom-end: x = 5 + 40 - 200 = -155!
  const res = computePosition(edgeAnchor, defaultFloating, viewport, {
    placement: 'bottom-end',
    viewportPadding: 12,
  })
  assert.equal(res.shifted, true)
  // Shifted so min x = viewportPadding = 12
  assert.equal(res.x, 12)
})

test('computePosition (Shift): shift=false disables shifting', () => {
  const edgeAnchor: Rect = { x: 950, y: 300, width: 40, height: 40 }
  const res = computePosition(edgeAnchor, defaultFloating, viewport, {
    placement: 'bottom-start',
    shift: false,
  })
  assert.equal(res.shifted, false)
  assert.equal(res.x, 950) // stays unshifted at 950
})

test('computePosition (Arrow): calculates center alignment and clamps within padding', () => {
  // Centered anchor: x = 400, width = 100 -> anchor center is 450
  // Floating x is 350. Arrow relative x = 450 - 350 = 100 (exact center of 200px floating)
  const centered = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom',
  })
  assert.equal(centered.arrow?.x, 100)

  // Floating element shifted far to the left:
  // Anchor at x = 950, width = 40 (center 970). Floating width = 200.
  // With shift, floating.x = 792 (1000 - 200 - 8).
  // Raw arrow relative x = 970 - 792 = 178.
  // With arrowPadding=10, max arrow x = 200 - 10 = 190. 178 is clamped or within padding.
  const shifted = computePosition(
    { x: 950, y: 300, width: 40, height: 40 },
    defaultFloating,
    viewport,
    { placement: 'bottom-start', arrowPadding: 10 },
  )
  assert.ok(shifted.arrow?.x !== undefined)
  assert.ok(shifted.arrow.x >= 10 && shifted.arrow.x <= 190)

  // Horizontal placement: arrow has y coordinate
  const horiz = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'right',
  })
  // Anchor y = 300, height = 40 -> center = 320. Floating y = 270 (320 - 50).
  // Arrow relative y = 320 - 270 = 50 (exact center of 100px floating height)
  assert.equal(horiz.arrow?.y, 50)
})

test('computePosition: anchor larger than floating element', () => {
  const giantAnchor: Rect = { x: 200, y: 200, width: 500, height: 300 }
  const smallFloating: Rect = { x: 0, y: 0, width: 80, height: 40 }

  const res = computePosition(giantAnchor, smallFloating, viewport, {
    placement: 'bottom',
    offset: 10,
  })
  // x = 200 + (500 - 80) / 2 = 410
  assert.equal(res.x, 410)
  // y = 200 + 300 + 10 = 510
  assert.equal(res.y, 510)
  // Arrow centered to giant anchor: anchor center 450 - floating.x 410 = 40 (center of 80px floating)
  assert.equal(res.arrow?.x, 40)
})

test('computePosition: calculates availableDimensions for dropdown scroll containment', () => {
  // Anchor at (400, 300), height 40. Viewport height 800.
  // Bottom: availableHeight = 800 - (300 + 40) - 8 (offset) - 8 (padding) = 444
  const bottomRes = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'bottom',
    offset: 8,
    viewportPadding: 8,
  })
  assert.equal(bottomRes.availableDimensions.height, 444)
  // Cross axis width: 1000 - 2 * 8 = 984
  assert.equal(bottomRes.availableDimensions.width, 984)

  // Top: availableHeight = 300 - 8 (offset) - 8 (padding) = 284
  const topRes = computePosition(defaultAnchor, defaultFloating, viewport, {
    placement: 'top',
    offset: 8,
    viewportPadding: 8,
  })
  assert.equal(topRes.availableDimensions.height, 284)
})

test('computePosition: matchAnchorWidth forces floating width to match anchor', () => {
  const customAnchor: Rect = { x: 100, y: 100, width: 320, height: 48 }
  const smallFloating: Rect = { x: 0, y: 0, width: 150, height: 200 }

  const res = computePosition(customAnchor, smallFloating, viewport, {
    placement: 'bottom-start',
    matchAnchorWidth: true,
  })
  assert.equal(res.anchorWidth, 320)
  assert.equal(res.x, 100)
  // When matchAnchorWidth is true, right side is also aligned with anchor
  assert.equal(res.x + res.anchorWidth, 420)
})

test('computePosition: referenceHidden detects when anchor scrolled outside viewport', () => {
  // Inside viewport
  const visibleRes = computePosition(defaultAnchor, defaultFloating, viewport)
  assert.equal(visibleRes.referenceHidden, false)

  // Scrolled above top edge: y + height < 0
  const scrolledAbove: Rect = { x: 400, y: -50, width: 100, height: 40 }
  const hiddenTop = computePosition(scrolledAbove, defaultFloating, viewport)
  assert.equal(hiddenTop.referenceHidden, true)

  // Scrolled below bottom edge: y > 800
  const scrolledBelow: Rect = { x: 400, y: 850, width: 100, height: 40 }
  const hiddenBottom = computePosition(scrolledBelow, defaultFloating, viewport)
  assert.equal(hiddenBottom.referenceHidden, true)
})
