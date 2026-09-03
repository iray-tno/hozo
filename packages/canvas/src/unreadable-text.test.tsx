// Words drawn on a canvas that nobody will read.
//
// The SVG version of this question had a fix: `role="img"` was hiding
// children that could have been exposed, so the answer was a role that
// stops hiding them. Canvas text is pixels. No role exposes it, which
// makes `role="img"` right here and makes the defect something else
// entirely -- a surface that draws words, offers a name instead, and says
// nothing about the difference.
//
// So this is a warning, and the interesting half is when it stays quiet.
// Four things mean nothing was lost, and each is the author saying
// something different rather than one suppression spelled four ways.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import type { ReactNode } from 'react'

import { Canvas } from './index.tsx'

const require = createRequire(import.meta.url)
const testRenderer = require('react-test-renderer') as {
  create: (
    element: unknown,
    options?: { createNodeMock?: (e: { type: string }) => unknown },
  ) => void
  act(callback: () => void | Promise<void>): Promise<void>
}

function surface() {
  const context = new Proxy({ globalAlpha: 1 } as Record<string, unknown>, {
    get: (target, property) => (property in target ? target[property as string] : () => undefined),
    set: (target, property, value) => {
      target[property as string] = value
      return true
    },
  }) as unknown as CanvasRenderingContext2D
  return {
    getContext: () => context,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 100, height: 100 }),
    setPointerCapture: () => undefined,
  }
}

/** Renders one surface and returns whatever it warned about. */
async function warningsFor(element: ReactNode): Promise<string[]> {
  const warnings: string[] = []
  const original = console.warn
  console.warn = (message: string) => warnings.push(message)
  try {
    await testRenderer.act(async () => {
      testRenderer.create(element, {
        createNodeMock: (e) => (e.type === 'canvas' ? surface() : null),
      })
    })
  } finally {
    console.warn = original
  }
  return warnings.filter((message) => message.includes('no screen reader can read'))
}

/** Distinct words per test, since the report is once per distinct loss. */
let counter = 0
const unique = () => `Series ${(counter += 1)}`

test('a surface that draws words and offers only a name says so', async () => {
  const word = unique()
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Revenue by month">
      <Canvas.Text text={word} x={0} y={10} fontSize={12} />
    </Canvas>,
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', /accessibleFallback/)
  // The words themselves, so the message names what was lost rather than
  // asserting that something was.
  assert.match(warnings[0] ?? '', new RegExp(word))
})

test('an accessibleFallback is the fix, and stops it', async () => {
  // Whether the fallback really contains the data is not checkable from
  // here. Its presence is the honest signal, and saying so beats
  // pretending to verify a `ReactNode`.
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibleFallback={<table />}>
      <Canvas.Text text={unique()} x={0} y={10} fontSize={12} />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})

test('a decorative surface has already answered', async () => {
  const warnings = await warningsFor(
    <Canvas width={100} height={100} decorative>
      <Canvas.Text text={unique()} x={0} y={10} fontSize={12} />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})

test('decorative text is a claim about the drawing, not a silencer', async () => {
  // A watermark, a repeated glyph. The author is saying these particular
  // words carry no information, which is a different statement from the
  // surface carrying none.
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Revenue by month">
      <Canvas.Text text={unique()} x={0} y={10} fontSize={12} decorative />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})

test('a name that already contains the words loses nothing', async () => {
  // The badge and the counter: `accessibilityLabel="42"` over a drawn
  // `42`. Without this the warning would fire on the case it exists to
  // exclude.
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Unread: 42">
      <Canvas.Text text="42" x={0} y={10} fontSize={12} />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})

test('one word missing out of several is still a word missing', async () => {
  // The shape a chart takes: a name that describes the drawing and labels
  // that carry the data. Partly covered is not covered.
  const missing = unique()
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Jan and Feb">
      <Canvas.Text text="Jan" x={0} y={10} fontSize={12} />
      <Canvas.Text text={missing} x={0} y={30} fontSize={12} />
    </Canvas>,
  )
  assert.equal(warnings.length, 1)
  assert.match(warnings[0] ?? '', new RegExp(missing))
  assert.doesNotMatch(warnings[0] ?? '', /Jan/)
})

test('a drawing with no words is left alone', async () => {
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Search">
      <Canvas.Rect x={0} y={0} width={10} height={10} />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})

test('words inside a group are still words', async () => {
  const word = unique()
  const warnings = await warningsFor(
    <Canvas width={100} height={100} accessibilityLabel="Revenue">
      <Canvas.Group transform={{ translateX: 10 }}>
        <Canvas.Text text={word} x={0} y={10} fontSize={12} />
      </Canvas.Group>
    </Canvas>,
  )
  assert.equal(warnings.length, 1)
})

test('a label that covers the words in meaning is the author’s to assert', async () => {
  // "Revenue rose from 3,200 in January to 4,800 in March" covers a drawn
  // "Jan" and "4800" without containing either string, and no test of the
  // text could tell. `decorative` is the word used correctly here rather
  // than a warning suppressed: ARIA's "presentational" means "needs no
  // accessible representation of its own", and a thing already said
  // elsewhere needs none.
  const warnings = await warningsFor(
    <Canvas
      width={100}
      height={100}
      accessibilityLabel="Revenue rose from 3,200 in January to 4,800 in March"
    >
      <Canvas.Text text="Jan" x={0} y={10} fontSize={12} decorative />
      <Canvas.Text text="4800" x={0} y={30} fontSize={12} decorative />
    </Canvas>,
  )
  assert.deepEqual(warnings, [])
})
