// A disclosure that discloses.
//
// The compiled output used to be a `View` holding a `Pressable` with a
// button role and then the body, always: no handler on the button, and
// the body visible whether it was open or not. `<details>` on the Web
// does all of it for free, so the divergence was invisible from there --
// the same source, one platform collapsing and the other not.
//
// The component in `@hozo/semantics` had the second half of the same bug
// and now shares this implementation, which is why there is one test.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { test } from 'node:test'

import { loadNativeModule, type Tree } from './native-render.ts'

const require = createRequire(import.meta.url)

interface Instance {
  type: string
  props: Record<string, unknown>
}

interface Root {
  toJSON: () => Tree
  root: { findAll: (predicate: (node: Instance) => boolean) => Instance[] }
}

const renderer = require('react-test-renderer') as {
  create: (element: unknown) => Root
  act: (callback: () => void) => void
}
const react = require('react') as { createElement: (type: unknown) => unknown }

const SOURCE = `
  import { Details, Summary, Paragraph } from '@hozo/core'
  export function Disclosure() {
    return (
      <Details>
        <Summary>More</Summary>
        <Paragraph>Body</Paragraph>
      </Details>
    )
  }
`

/** Every string in the rendered tree, so "is the body there" is answerable. */
function text(tree: Tree | string | null): string {
  if (tree === null) return ''
  if (typeof tree === 'string') return tree
  return ((tree.children ?? []) as (Tree | string)[]).map(text).join('')
}

test('a compiled disclosure starts closed, opens on press, and closes again', () => {
  const exports = loadNativeModule(SOURCE)
  let root: Root | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(exports.Disclosure))
  })
  assert.ok(root)
  const mounted = root

  const trigger = () => {
    const found = mounted.root.findAll((node) => typeof node.props.onPress === 'function')
    assert.equal(found.length, 1, 'the summary is the one thing that can be pressed')
    return found[0] as Instance
  }

  assert.equal(text(mounted.toJSON()), 'More', 'the body was visible while closed')
  assert.deepEqual(
    trigger().props.accessibilityState,
    { expanded: false },
    'the trigger did not say it was collapsed',
  )

  renderer.act(() => {
    ;(trigger().props.onPress as () => void)()
  })
  assert.equal(text(mounted.toJSON()), 'MoreBody', 'pressing did not open it')
  assert.deepEqual(trigger().props.accessibilityState, { expanded: true })

  renderer.act(() => {
    ;(trigger().props.onPress as () => void)()
  })
  assert.equal(text(mounted.toJSON()), 'More', 'pressing again did not close it')
})

test('the summary is what survives being closed, wherever it was written', () => {
  // HTML requires the summary to come first and Hozo does not check it, so
  // the trigger is recognised by what it is rather than by where it is. A
  // body written above it would otherwise be the thing that stayed.
  const exports = loadNativeModule(`
    import { Details, Summary, Paragraph } from '@hozo/core'
    export function Disclosure() {
      return (
        <Details>
          <Paragraph>Body</Paragraph>
          <Summary>More</Summary>
        </Details>
      )
    }
  `)
  let root: Root | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(exports.Disclosure))
  })
  assert.ok(root)
  assert.equal(text(root.toJSON()), 'More')
})
