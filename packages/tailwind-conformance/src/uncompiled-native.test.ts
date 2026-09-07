// The components a project gets when the compiler could not lower a file.
//
// `@hozo/core`'s native half is a fallback: it imitates what the compiled
// output would have been, so a file Hozo did not reach still behaves. That
// makes it the least-exercised code in the repository and the most likely
// to be wrong -- it runs only in the projects that are already having a
// bad time. Until now nothing had rendered it at all.
//
// What it caught: a `Pressable` is a View, and React Native throws on a
// bare string inside one. The compiled path never hands one over, because
// the backend wraps text children -- `<Button>Save</Button>` lowers to
// `<Pressable><Text>Save</Text></Pressable>`. The fallback passed the
// string straight through, so a label, which is the commonest thing a
// Button is given, crashed on the uncompiled path only.
//
// `@hozo/typography`'s `Link` already knew this and wrapped. It was a
// second implementation of `HozoLink` that also happened to be the more
// correct one; it delegates now, and the knowledge moved into the shared
// component.
//
// Rendered against the stub, so this does not prove React Native accepts
// the tree -- only a device does that. What it proves is the shape.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import './native-render.ts'

const require = createRequire(import.meta.url)

interface Tree {
  type: string
  props: Record<string, unknown>
  children: (Tree | string)[] | null
}

const renderer = require('react-test-renderer') as {
  create: (element: unknown) => { toJSON: () => Tree | null }
  act: (callback: () => void) => void
}
const react = require('react') as {
  createElement: (type: unknown, props?: unknown, ...children: unknown[]) => unknown
}

/** The stub renders every React Native component as a host node of its own name. */
function render(element: unknown): Tree {
  let root: { toJSON: () => Tree | null } | null = null
  renderer.act(() => {
    root = renderer.create(element)
  })
  const tree = (root as unknown as { toJSON: () => Tree | null }).toJSON()
  assert.ok(tree, 'the component rendered nothing')
  return tree
}

/** Every node type on the path from the root down to the given string. */
function pathToText(tree: Tree | string, needle: string, above: string[] = []): string[] | null {
  if (typeof tree === 'string') return tree === needle ? above : null
  for (const child of tree.children ?? []) {
    const found = pathToText(child, needle, [...above, tree.type])
    if (found) return found
  }
  return null
}

const core = require('../../core/src/index.native.ts') as Record<string, unknown>

test('a Button given a label puts it inside a Text', () => {
  const path = pathToText(render(react.createElement(core.Button, null, 'Save')), 'Save')
  assert.deepEqual(path, ['Pressable', 'Text'], 'the label was not wrapped')
})

test('a Button that navigates does the same, and is a link', () => {
  const tree = render(react.createElement(core.Button, { href: 'https://example.com' }, 'Docs'))
  assert.equal(tree.props.accessibilityRole, 'link')
  assert.deepEqual(pathToText(tree, 'Docs'), ['Pressable', 'Text'])
})

test('a Link given a label puts it inside a Text, and is a link', () => {
  const tree = render(react.createElement(core.Link, { href: 'https://example.com' }, 'Docs'))
  assert.equal(tree.props.accessibilityRole, 'link')
  assert.deepEqual(pathToText(tree, 'Docs'), ['Pressable', 'Text'])
})

test('an element child is left as it was written', () => {
  // The wrapping is for a lone string. Anything already inside a `Text`
  // must not gain a second one, which would change what a screen reader
  // reads and what the styles inherit.
  const label = react.createElement(core.Text, null, 'Save')
  const path = pathToText(render(react.createElement(core.Button, null, label)), 'Save')
  assert.deepEqual(path, ['Pressable', 'Text'])
})
