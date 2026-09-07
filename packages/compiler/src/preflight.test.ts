// Whether a project ships a CSS reset, and whether the compiler is told.
//
// The Native backend has no user-agent stylesheet. Its defaults for the
// primitives that have one on the Web -- `hr`, `h1` -- are copied from a
// browser, and a browser under Tailwind's Preflight renders them
// differently from a bare one: an `hr` is 1px rather than 2px, and an `h1`
// is 16px/400 rather than 32px/700 (#315, measured in headless Chrome).
// So "which browser" is a real question, and the answer is the project's
// resolved `preflight` option.
//
// Two halves, and the second is the one that can silently never work. The
// resolution is arithmetic and easy to get right; the wiring -- option to
// `withHozo`, to `metro.json`, to a worker, to `createCompiler`, across
// the addon boundary -- is four hops through three processes, and every
// one of them would compile perfectly reasonable-looking output if the
// flag were dropped. So this asserts on compiled styles rather than on the
// theme object being passed along.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompiler } from './index.ts'
import { preflightEnabled } from './project.ts'

const SOURCE = `import { Heading, Separator } from '@hozo/core'
export function Rule() { return <Separator /> }
export function Title() { return <Heading level={1}>Title</Heading> }`

function styles(preflight: boolean | undefined) {
  const theme = preflight === undefined ? undefined : { colors: [], preflight }
  return createCompiler(theme)
    .compileNative(SOURCE)
    .map((component) => component.styles)
}

test('the resolved option is the option, and `auto` asks the project', () => {
  assert.equal(preflightEnabled(true, false), true)
  assert.equal(preflightEnabled(false, true), false)
  assert.equal(preflightEnabled('auto', true), true)
  assert.equal(preflightEnabled('auto', false), false)
  // Unset is `'auto'`: the default is inferred, not off.
  assert.equal(preflightEnabled(undefined, true), true)
  assert.equal(preflightEnabled(undefined, false), false)
})

test('a reset project compiles the reset browser', () => {
  const [rule, title] = styles(true)
  assert.match(rule, /height: 1,/)
  // Preflight gives a heading `font-size: inherit; font-weight: inherit`,
  // so the compiled one carries neither -- and still carries its role,
  // which is checked on the Rust side.
  assert.doesNotMatch(title, /fontSize/)
  assert.doesNotMatch(title, /fontWeight/)
})

test('and a project without one compiles the browser it actually renders in', () => {
  const [rule, title] = styles(false)
  assert.match(rule, /height: 2,/)
  assert.match(title, /fontSize: 28,/)
  assert.match(title, /fontWeight: '700',/)
})

test('a caller that has never heard of the question gets no reset', () => {
  // `compile` and a themeless `createCompiler` are used by tests, the
  // playground and anything inspecting output without a project. They get
  // the browser's own defaults, which is the answer that needs no
  // configuration to be true.
  assert.deepEqual(styles(undefined), styles(false))
})
