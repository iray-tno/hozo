import assert from 'node:assert/strict'
import test from 'node:test'

import { compareCanvasCandidate } from './canvas.ts'

test('Canvas paint lowers palette alpha modifiers on both Web and Native', () => {
  const web = compareCanvasCandidate('fill-blue-500/50', false)
  assert.equal(web.verdict, 'COVERED')
  assert.equal(web.replacement, 'fill="oklch(62.3% 0.214 259.815 / 0.5)"')

  const native = compareCanvasCandidate('fill-blue-500/50', true)
  assert.equal(native.verdict, 'COVERED')
  assert.equal(native.replacement, 'fill="rgba(43, 127, 255, 0.5)"')
})

test('Canvas paint refuses unknown tokens and CSS-inherited colour keywords', () => {
  for (const candidate of [
    'fill-unknown-999',
    'stroke-brand/50',
    'fill-current',
    'fill-inherit',
    'stroke-current',
    'stroke-inherit',
  ]) {
    for (const native of [false, true]) {
      const result = compareCanvasCandidate(candidate, native)
      assert.equal(result.verdict, 'REFUSED', `${candidate} (native=${native})`)
    }
  }
})

test('Canvas conformance probes RoundedRect, Text, and Group shape-specific utilities', () => {
  for (const [candidate, restrictedTo, expectedNative] of [
    ['rounded-lg', 'Canvas.RoundedRect', 'radius={8}'],
    ['text-blue-500', 'Canvas.Text', 'fill="#2b7fff"'],
    ['text-lg', 'Canvas.Text', 'fontSize={18} lineHeight={1.555556}'],
    ['font-mono', 'Canvas.Text', 'fontFamily="monospace"'],
    ['font-bold', 'Canvas.Text', 'fontWeight="700"'],
    ['italic', 'Canvas.Text', 'fontStyle="italic"'],
    ['text-center', 'Canvas.Text', 'textAlign="center"'],
    ['leading-tight', 'Canvas.Text', 'lineHeight={1.25}'],
    ['max-w-xs', 'Canvas.Text', 'maxWidth={320}'],
    ['translate-x-4', 'Canvas.Group', 'transform={{ translateX: 16 }}'],
    ['scale-110', 'Canvas.Group', 'transform={{ scaleX: 1.1, scaleY: 1.1 }}'],
    ['rotate-45', 'Canvas.Group', 'transform={{ rotate: 45 }}'],
  ] as const) {
    const native = compareCanvasCandidate(candidate, true)
    assert.equal(native.verdict, 'COVERED', candidate)
    assert.equal(native.restrictedTo, restrictedTo, candidate)
    assert.equal(native.replacement, expectedNative, candidate)

    const web = compareCanvasCandidate(candidate, false)
    assert.equal(web.verdict, 'COVERED', candidate)
    assert.equal(web.restrictedTo, restrictedTo, candidate)
  }

  for (const refused of [
    'rounded-t-lg',
    'rounded-[50%]',
    'text-justify',
    'leading-6',
    'max-w-full',
    'translate-x-1/2',
    'skew-x-6',
    'scale-z-50',
    'rotate-x-45',
  ]) {
    for (const native of [false, true]) {
      const result = compareCanvasCandidate(refused, native)
      assert.equal(result.verdict, 'REFUSED', `${refused} (native=${native})`)
    }
  }
})
