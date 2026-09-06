// What a compiled link announces itself as.
//
// `<Button href>` is a button that navigates, and both backends lower it
// the same way on purpose: `<a role="button">` on the Web, and on React
// Native `<HozoLink accessibilityRole="button">`. The native runtime
// component wrote `accessibilityRole="link"` after its prop spread, so
// the compiler's value was overwritten every time and the button
// announced itself as a link on that platform only.
//
// Nothing caught it because the Native backend's own test asserts on the
// emitted string -- `crates/hozo_native/src/native_tests/rendering.rs`
// checks that the JSX contains `accessibilityRole="button"`, which it
// always did. The prop was emitted and then discarded one layer down.
// Two implementations of one rule, and the test was looking at the first.
//
// So this one renders. `@hozo/core`'s hand-written native `Button` takes
// the same path through `HozoLink` for its `href` branch and is fixed by
// the same change; it is not exercised here because this package does not
// depend on `@hozo/core`.

import assert from 'node:assert/strict'
import { test } from 'node:test'

import { renderNative, type Tree } from './native-render.ts'

/** The first node in the tree with an `accessibilityRole`, in tree order. */
function firstRole(tree: Tree | string | null): unknown {
  if (tree === null || typeof tree === 'string') return undefined
  if (tree.props.accessibilityRole !== undefined) return tree.props.accessibilityRole
  for (const child of (tree.children ?? []) as (Tree | string)[]) {
    const found = firstRole(child)
    if (found !== undefined) return found
  }
  return undefined
}

test('a compiled Button with an href announces itself as a button', () => {
  const tree = renderNative(
    `
      import { Button } from '@hozo/core'
      export function Fixture() {
        return <Button href="https://example.com">Docs</Button>
      }
    `,
    'Fixture',
  )
  assert.equal(
    firstRole(tree),
    'button',
    'a button that navigates was announced as something else on React Native',
  )
})

test('a compiled Link is still a link', () => {
  // The default the fix turned a constant into. A change that made the
  // caller's value win by dropping the default would pass the test above
  // and break every ordinary link, so both directions are checked.
  const tree = renderNative(
    `
      import { Link } from '@hozo/core'
      export function Fixture() {
        return <Link href="https://example.com">Docs</Link>
      }
    `,
    'Fixture',
  )
  assert.equal(firstRole(tree), 'link')
})
