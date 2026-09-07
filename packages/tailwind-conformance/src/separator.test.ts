// A rule, compiled and uncompiled, asked the same three questions.
//
// `<Separator>` has two props that are Hozo's words rather than the
// platform's -- `decorative` and `orientation` -- and until #309 neither
// backend modelled either. Both reached the output verbatim: `<hr
// decorative>` on the Web, `<View orientation="vertical">` on React
// Native, attributes nothing reads. What they are *for* went unsaid, so a
// decorative rule was announced as structure and a vertical one never said
// which way it ran.
//
// The compiled Native path was worse than unsaid. `<hr>` takes its line
// from the browser's user-agent stylesheet and React Native has no such
// thing, so the fallback in `@hozo/semantics` sets `height: 1` and
// `alignSelf: 'stretch'` by hand -- and the backend did not. A `View` with
// no size is zero pixels tall. **Turning the compiler on removed a visible
// divider**, which is the kind of difference the Web half hides completely:
// nothing about `<hr />` suggests the other platform is missing anything.
//
// Found by the census screen in #308, which put a `Separator` on a device
// for the first time.
//
// The fallback is the denominator here rather than a table of expected
// strings. It has been right about all of this from the beginning; what
// was missing was the compiler agreeing with it.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { compile, createCompiler } from '@hozo/compiler'

import './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}
const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => unknown }
  act: (callback: () => void) => void
}
const semantics = require('../../semantics/src/index.native.tsx') as { Separator: unknown }

/**
 * A compiler told the project ships a CSS reset, which is the browser the
 * fallback was written from.
 *
 * `hr` is 1px under Tailwind's Preflight and 2px under a bare user-agent
 * stylesheet, and since #315 the compiler follows whichever the project
 * has. The fallback is a plain React component with no build to ask, so it
 * has one number, and it is this one. The last test says what that costs.
 */
const reset = createCompiler({ colors: [], preflight: true })

/** The fallback's rendered props, which are what the compiler has to match. */
function fallback(props: Record<string, unknown>) {
  let root: { toJSON: () => unknown } | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(semantics.Separator, props))
  })
  return (root as { toJSON: () => { props: Record<string, unknown> } }).toJSON()
}

/** A style prop as React Native resolves it: an array, flattened, last wins. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return (style ?? {}) as Record<string, unknown>
}

function compiledNative(attrs: string) {
  const source = `import { Separator } from '@hozo/core'\nexport function F() { return <Separator ${attrs}/> }`
  const [out] = reset.compileNative(source)
  return out as { jsx: string; styles: string }
}

function compiledWeb(attrs: string) {
  const source = `import { Separator } from '@hozo/core'\nexport function F() { return <Separator ${attrs}/> }`
  return (compile(source, 'F.tsx')[0] as { jsx: string }).jsx
}

test('the compiled rule has a rule to draw', () => {
  // The visible half, and the reason this is not only an accessibility
  // fix. React Native draws nothing for a `View` with no size.
  const { styles } = compiledNative('')
  assert.match(styles, /height: 1,/)
  assert.match(styles, /alignSelf: 'stretch',/)

  // The same numbers the fallback has always used, read off it rather
  // than copied into this file.
  const rendered = flatten(fallback({}).props.style)
  assert.equal(rendered.height, 1)
  assert.equal(rendered.alignSelf, 'stretch')
})

test('a vertical rule is one pixel the other way', () => {
  const { styles } = compiledNative('orientation="vertical" ')
  assert.match(styles, /width: 1,/)
  assert.doesNotMatch(styles, /height: 1,/)

  const rendered = flatten(fallback({ orientation: 'vertical' }).props.style)
  assert.equal(rendered.width, 1)
})

test('an author who styles it still wins', () => {
  // The default is a default. It goes in first so a `bg-*` or a thicker
  // rule composes over it, which is how the fallback merges too --
  // `style: [defaultStyle, style]`.
  const { styles } = compiledNative('className="bg-slate-300" ')
  assert.match(styles, /height: 1,/)
  assert.match(styles, /backgroundColor: '#cad5e2',/)
  assert.ok(
    styles.indexOf('height') < styles.indexOf('backgroundColor'),
    'the default has to come first, or it overrides what the author wrote',
  )
})

test('a decorative rule is silent on both platforms', () => {
  // The role half. A rule drawn to look like a line is not structure, and
  // announcing it as a separator is announcing something the author said
  // it was not.
  assert.match(compiledWeb('decorative '), /role="none"/)
  assert.match(compiledWeb('decorative '), /aria-hidden=\{true\}/)

  const { jsx } = compiledNative('decorative ')
  assert.match(jsx, /role="none"/)
  assert.match(jsx, /accessibilityRole="none"/)

  // And the fallback agrees, which is where the rule came from.
  assert.equal(fallback({ decorative: true }).props.accessibilityRole, 'none')
})

test('a plain rule still says it is one, as far as the platform allows', () => {
  assert.match(compiledNative('').jsx, /role="separator"/)
  assert.equal(fallback({}).props.role, 'separator')
  // `<hr>` has an implicit separator role, so the Web output says nothing
  // and means the same thing.
  assert.equal(compiledWeb(''), '<hr />')
})

test('neither prop reaches the output as itself', () => {
  // They are Hozo's spellings. `<hr decorative>` and
  // `<View orientation="vertical">` are attributes the platforms have no
  // meaning for, and both were being emitted.
  // The attribute itself, not the substring: `aria-orientation` is the
  // correct output for the vertical case and contains the word. A word
  // boundary matched it and failed this test, which is the assertion being
  // sloppy rather than the compiler being wrong.
  const leaks = /\s(decorative|orientation)[=\s/>]/
  for (const attrs of ['decorative ', 'orientation="vertical" ']) {
    assert.doesNotMatch(compiledWeb(attrs), leaks)
    assert.doesNotMatch(compiledNative(attrs).jsx, leaks)
  }
})

test('StyleX composes with the default the same way a class does', () => {
  // The same question as the `className` case above, through the other
  // styling frontend. Both arrive as declarations, so both compose; a
  // `stylex.props` spread landing as a runtime prop would have replaced
  // the style object wholesale and taken the rule with it.
  const source = [
    "import * as stylex from '@stylexjs/stylex'",
    "import { Separator } from '@hozo/core'",
    "const styles = stylex.create({ rule: { height: 8, backgroundColor: 'red' } })",
    'export function F() { return <Separator {...stylex.props(styles.rule)} /> }',
  ].join('\n')
  const { styles } = reset.compileNative(source)[0] as { styles: string }

  assert.match(styles, /height: 8,/)
  assert.doesNotMatch(styles, /height: 1,/)
  // `alignSelf` is the compiler's and the author never mentioned it.
  assert.match(styles, /alignSelf: 'stretch',/)
})

test('a project without a reset gets the other browser, and the fallback cannot follow', () => {
  // The residue of #315, asserted rather than left to be discovered.
  //
  // The compiled half tracks the project: no reset means the user-agent
  // stylesheet, and a bare `hr` is 2px. The fallback is a component in
  // `@hozo/semantics` with no build to ask, so it stays at 1px and a
  // non-Tailwind project renders its compiled rules one pixel thicker
  // than its uncompiled ones.
  //
  // Small, and the alternative was worse: matching the fallback here
  // would mean the compiled Native rule disagreeing with the project's
  // own Web rule, which is the parity Hozo exists for. If the fallbacks
  // are ever handed the resolved flag -- the generated candidate module
  // is already per-project and already reaches the device -- this test is
  // the one to delete.
  const bare = createCompiler({ colors: [] })
  const source = `import { Separator } from '@hozo/core'
export function F() { return <Separator /> }`
  const { styles } = bare.compileNative(source)[0] as { styles: string }
  assert.match(styles, /height: 2,/)
  assert.equal(flatten(fallback({}).props.style).height, 1)
})
