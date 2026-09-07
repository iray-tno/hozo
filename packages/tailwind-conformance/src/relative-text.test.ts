// Relative text sizes, end to end: compiled by the real backend, then
// rendered.
//
// `crates/hozo_native` pins what it emits and `packages/typography` pins
// that the two ratio tables agree. Neither can say what actually reaches
// the screen when the compiler hands the ratio to a component, because
// that needs the component to run.
//
// The blind case is the point. React Native gives nothing to size text
// against the text around it -- `fontSize` is a number of points, a
// nested `Text` cannot read what it inherited, and `TextAncestorContext`
// is a boolean -- so an author's `style={{ fontSize: 20 }}` is a size
// that exists only once React Native has evaluated it. `HozoTextSize`
// publishes it and `HozoRelativeText` reads it.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { createCompiler } from '@hozo/compiler'

import { renderNative, type Tree } from './native-render.ts'

function children(tree: Tree): Tree[] {
  return ((tree?.children ?? []) as (Tree | string)[]).filter(
    (child): child is Tree => typeof child === 'object' && child !== null,
  )
}

/** A style prop as React Native resolves it: an array, flattened, last wins. */
function flatten(style: unknown): Record<string, unknown> {
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flatten))
  return (style ?? {}) as Record<string, unknown>
}

/** Every `fontSize` in a tree, outermost first. */
function sizes(tree: Tree): number[] {
  const size = flatten(tree?.props.style).fontSize
  const own = typeof size === 'number' ? [size] : []
  return [...own, ...children(tree).flatMap(sizes)]
}

test('a size the compiler can read costs nothing at runtime', () => {
  const tree = renderNative(
    `
    import { View, Text, RubyText } from '@hozo/core'
    export function Label() {
      return <View className="text-xl"><Text>漢<RubyText>かん</RubyText></Text></View>
    }
    `,
    'Label',
  )
  // A plain host `Text`, not a Hozo component: the number was resolved at
  // build time and put in a stylesheet.
  const [text] = children(tree)
  assert.equal(text.type, 'Text')
  assert.deepEqual(sizes(tree), [20, 10])
})

test('a size only React Native can resolve is resolved by the components', () => {
  // The style prop is a number Hozo never sees. Scaling against what it
  // can see would scale from the wrong base, so the ratio travels instead.
  const tree = renderNative(
    `
    import { Text, RubyText } from '@hozo/core'
    export function Label() {
      return <Text style={{ fontSize: 20 }}>漢<RubyText>かん</RubyText></Text>
    }
    `,
    'Label',
  )
  // Both render a host `Text`; what matters is the size that came out.
  assert.deepEqual(sizes(tree), [20, 10])
})

test('the base the pair falls back to is React Native’s own', () => {
  // Nothing names a size anywhere, so 14 -- which is what React Native
  // would have drawn at, from `RCTFont.mm`.
  const tree = renderNative(
    `
    import { Text, Small } from '@hozo/core'
    export function Label() {
      return <Text {...rest}>a<Small>s</Small></Text>
    }
    `,
    'Label',
    { rest: {} },
  )
  assert.deepEqual(sizes(tree), [12])
})

test('a relative size inside a relative size compounds', () => {
  // `small small` compounds in a browser, and the runtime half has to do
  // the same as the compiled half: 20 → 17 → 14.
  const tree = renderNative(
    `
    import { Text, Small } from '@hozo/core'
    export function Label() {
      return <Text style={{ fontSize: 20 }}><Small>a<Small>b</Small></Small></Text>
    }
    `,
    'Label',
  )
  assert.deepEqual(sizes(tree), [20, 17, 14])
})

test('an explicit size on the relative element still wins', () => {
  // It is later in the style array, which is how React Native resolves
  // the two, and it is what the author asked for most specifically.
  const tree = renderNative(
    `
    import { Text, Small } from '@hozo/core'
    export function Label() {
      return <Text style={{ fontSize: 20 }}><Small style={{ fontSize: 9 }}>a</Small></Text>
    }
    `,
    'Label',
  )
  assert.deepEqual(sizes(tree), [20, 9])
})

test('a compiled class survives an inline style beside it', () => {
  // Two `style` attributes on one element: JSX keeps the last, so every
  // compiled class on it was dropped. Silently, and only on the elements
  // where someone reached for an inline style.
  const tree = renderNative(
    `
    import { Text } from '@hozo/core'
    export function Label() {
      return <Text className="text-xl" style={{ color: 'red' }}>a</Text>
    }
    `,
    'Label',
  )
  const style = flatten(tree?.props.style)
  assert.equal(style.fontSize, 20, 'the compiled class was dropped')
  assert.equal(style.color, 'red')
})

test('the ratio is the one the project’s own browser applies', () => {
  // Preflight sets `sub`/`sup` to 75% and `small` to 80%; the bare user
  // agent makes all three `smaller`, which Chrome resolves as a division
  // by 1.2. Measured at bases 16, 20 and 32, with and without this
  // repository's generated preflight (#315).
  //
  // The compiler had one table for both, and it was not either browser's:
  // `small` at 0.85 draws 13.6 from a base of 16, and 13.6 is a size no
  // browser renders `<small>` at.
  const source = `import { Text, Small, Sub } from '@hozo/core'
export function Label() {
  return <Text className="text-base">a<Small>s</Small><Sub>2</Sub></Text>
}`
  const compiled = (preflight: boolean) =>
    createCompiler({ colors: [], preflight }).compileNative(source)[0] as { styles: string }

  // 16 * 0.8 = 12.8 -> 13, and 16 * 0.75 = 12.
  const reset = compiled(true).styles
  assert.match(reset, /fontSize: 13,/)
  assert.match(reset, /fontSize: 12,/)

  // 16 / 1.2 = 13.33 -> 13, for both.
  const bare = compiled(false).styles
  assert.match(bare, /fontSize: 13,/)
  assert.doesNotMatch(bare, /fontSize: 12,/)
})

test('a reset heading does not scale at runtime either', () => {
  // The half the static fix in #315 missed. An opaque parent sends the
  // ratio to `HozoRelativeText` instead of resolving it, and that path
  // read the user agent's table whatever the project shipped: a level-1
  // heading under `style={{ fontSize: 20 }}` drew at 40 on the phone
  // while the browser -- `font-size: inherit` under preflight -- drew it
  // at 20.
  const source = `import { Text, Heading } from '@hozo/core'
export function Label() {
  return <Text style={{ fontSize: 20 }}>t<Heading level={1}>T</Heading></Text>
}`
  const { jsx } = createCompiler({ colors: [], preflight: true }).compileNative(source)[0] as {
    jsx: string
  }
  assert.doesNotMatch(jsx, /hozoRelative/)
  // And no publisher above it, since nothing below is relative any more.
  assert.doesNotMatch(jsx, /HozoTextSize/)
  assert.match(jsx, /accessibilityRole="header"/)
})
