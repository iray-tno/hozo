// A progress bar with a box, on the platform that supplies none.
//
// `<progress>` has an intrinsic size in every browser. A React Native
// `View` has none, so a compiled progress bar was zero pixels in both
// directions: invisible on screen, and absent from the accessibility tree
// as well, because Android does not report a zero-area view.
//
// The census screen in #308 found the second half first -- `gallery-Progress`
// was simply not in the dump -- and a second `Progress` with a height
// settled which of the two candidate causes it was. The sized one appeared
// and the bare one did not, so it was the area rather than the role (#309).
//
// The denominator is different here, and worth being explicit about.
// `Separator` had a fallback that already knew the answer, so the test
// read it off the fallback. `Progress` had no default on either side --
// nothing to copy. So the number is measured: headless Chrome, with this
// project's own preflight applied, which is the stylesheet a Hozo page
// actually renders under.
//
//     <progress> -> 160 x 16
//
// The width is as literal as the height, and that is the decision rather
// than an oversight. A fixed-width bar is an odd default for a React
// Native layout -- but it is what the Web half renders, an author who
// overrides one overrides both, and an author who overrides neither gets
// the same bar on both platforms. A nicer number would buy a divergence
// that is invisible exactly when nobody is looking at it.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { compile, compileNative } from '@hozo/compiler'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => unknown }
  act: (callback: () => void) => void
}
const semantics = require('../../semantics/src/index.native.tsx') as { Progress: unknown }

/** What the browser measured, and what both halves now have to render. */
const WEB_INTRINSIC = { width: 160, height: 16 }

/** A style prop as React Native resolves it: an array, flattened, last wins. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return (style ?? {}) as Record<string, unknown>
}

function fallback(props: Record<string, unknown>) {
  let root: { toJSON: () => unknown } | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(semantics.Progress, props))
  })
  return (root as { toJSON: () => { props: Record<string, unknown> } }).toJSON()
}

function compiledNative(attrs: string) {
  const source = `import { Progress } from '@hozo/core'\nexport function F() { return <Progress ${attrs}/> }`
  return compileNative(source, 'F.tsx')[0] as { jsx: string; styles: string }
}

test('the compiled bar has the box the browser gives it', () => {
  const { styles } = compiledNative('value={40} max={100} ')
  assert.match(styles, new RegExp(`width: ${WEB_INTRINSIC.width},`))
  assert.match(styles, new RegExp(`height: ${WEB_INTRINSIC.height},`))
})

test('and so does the fallback, which had none either', () => {
  // Both halves were zero-sized, so this one is not a case of the
  // compiler catching up with a fallback that was already right -- they
  // were wrong together, which is why nothing looked asymmetric.
  const rendered = flatten(fallback({ value: 40, max: 100 }).props.style)
  assert.equal(rendered.width, WEB_INTRINSIC.width)
  assert.equal(rendered.height, WEB_INTRINSIC.height)
})

test('an author who sizes it still wins, on both', () => {
  const { styles } = compiledNative('value={40} max={100} className="h-2 w-full" ')
  assert.match(styles, /height: 8,/)
  assert.match(styles, /width: '100%',/)
  assert.doesNotMatch(styles, /height: 16,/)

  const rendered = flatten(fallback({ value: 40, max: 100, style: { height: 8 } }).props.style)
  assert.equal(rendered.height, 8)
  // The width the author did not mention is still the default's.
  assert.equal(rendered.width, WEB_INTRINSIC.width)
})

test('the Web half is left to the browser', () => {
  // It emits a real `<progress>`, which is where the measured number came
  // from. Adding a style here would be Hozo overriding the thing it is
  // trying to match.
  const source = `import { Progress } from '@hozo/core'\nexport function F() { return <Progress value={40} max={100} /> }`
  assert.equal(
    (compile(source, 'F.tsx')[0] as { jsx: string }).jsx,
    '<progress value={40} max={100}></progress>',
  )
})

test('the value still reaches the platform that has no progress element', () => {
  // The size is the new half. The role and the value were already right,
  // and a size change must not quietly cost them.
  const { jsx } = compiledNative('value={40} max={100} ')
  assert.match(jsx, /role="progressbar"/)
  assert.match(jsx, /accessibilityValue=\{\{ min: 0, max: 100, now: 40 \}\}/)
})

test('and StyleX composes the same way a class does', () => {
  // Asked rather than assumed: the default is a `StyleDeclaration` the
  // backend prepends, and StyleX arrives as declarations too, so the two
  // meet in the same list and `dedupe_last_wins` gives the author the
  // last word. A `stylex.props` spread that reached the output as a
  // runtime prop instead would have overridden the whole style object,
  // defaults included, and nothing here would have said so.
  const source = [
    "import * as stylex from '@stylexjs/stylex'",
    "import { Progress } from '@hozo/core'",
    "const styles = stylex.create({ bar: { height: 8, backgroundColor: 'red' } })",
    'export function F() {',
    '  return <Progress value={40} max={100} {...stylex.props(styles.bar)} />',
    '}',
  ].join('\n')
  const { styles } = compileNative(source, 'F.tsx')[0] as { styles: string }

  // The author's height wins.
  assert.match(styles, /height: 8,/)
  assert.doesNotMatch(styles, /height: 16,/)
  // And the width they said nothing about is still the browser's.
  assert.match(styles, /width: 160,/)
})
