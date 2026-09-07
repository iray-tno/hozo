// What a compiled destination announces itself as, verified after the
// generated `HozoLink` has rendered rather than only in its emitted JSX.
// `Button` chooses presentation. Once it carries an `href`, its function
// is navigation and both platforms expose the link role.

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

test('a compiled Button with an href announces itself as a link', () => {
  const tree = renderNative(
    `
      import { Button } from '@hozo/core'
      export function Fixture() {
        return <Button href="https://example.com">Docs</Button>
      }
    `,
    'Fixture',
  )
  assert.equal(firstRole(tree), 'link')
})

test('a compiled Link is still a link', () => {
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
