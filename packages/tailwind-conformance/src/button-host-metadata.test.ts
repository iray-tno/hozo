import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mock, test } from 'node:test'
import { compile, compileNative } from '@hozo/compiler'
import { loadNativeModule } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')

test('compiled Button IDs and localized metadata reach a static Web host, not a wrapper', () => {
  for (const href of ['', ' href="/docs"']) {
    const [web] = compile(
      `import {Button} from '@hozo/core'; const e = <Button${href} nativeID="copy" ${href ? '' : 'disabled'} data-copy-label="コピー" data-copied-label="完了">Copy</Button>`,
    )
    assert.deepEqual(web.diagnostics, [])
    const [rendered] = renderWeb([{ name: 'C', jsx: web.jsx }])
    assert.match(rendered.html, href ? /^<a\b/ : /^<button\b/)
    assert.match(rendered.html, /id="copy"/)
    assert.match(rendered.html, /data-copy-label="コピー"/)
    assert.match(rendered.html, /data-copied-label="完了"/)
    if (!href) assert.match(rendered.html, /disabled=""/)
  }
})

test('Native IDs survive compilation and value rendering; DOM metadata is diagnosed even through opaque spreads', () => {
  const warn = mock.method(console, 'warn', () => {})
  const { Button: Fallback } = require('@hozo/primitives')
  try {
    const [native] = compileNative(
      `import {Button} from '@hozo/core'; const e = <Button nativeID="copy" data-copy-label="Copy">Copy</Button>`,
    )
    assert.ok(
      native.diagnostics.some(
        (item) => item.code === 'WEB_ONLY_PROPERTY_ON_NATIVE' && item.severity === 'warning',
      ),
    )
    const [plain] = compileNative(
      `import {Button} from '@hozo/core'; const e = <Button nativeID="copy">Copy</Button>`,
    )
    assert.deepEqual(plain.diagnostics, [])
    assert.ok(!plain.jsx.includes('hozoButtonProps'), 'ordinary static Buttons need no helper')
    // Destination shape is explicit, not hidden inside an opaque spread.
    const { Action, Navigation } = loadNativeModule(`import {Button} from '@hozo/core';
      export function Action(props) {return <Button { ... props } />}
      export function Navigation(props) {return <Button { ... props } href="/docs"/>}`)
    for (const native of [false, true]) {
      for (const href of [undefined, '/docs']) {
        const C = native ? (href ? Navigation : Action) : Fallback
        let tree: ReturnType<typeof renderer.create>
        renderer.act(() => {
          tree = renderer.create(
            react.createElement(
              C,
              { nativeID: 'copy', href, disabled: true, 'data-copy-label': 'Copy' },
              'Copy',
            ),
          )
        })
        try {
          const host = tree.root.findByType('Pressable')
          assert.equal(host.props.nativeID, 'copy')
          assert.equal(host.props.disabled, true)
          assert.equal(host.props.accessibilityRole, href ? 'link' : 'button')
          assert.equal(
            host.props.accessibilityLabel,
            undefined,
            'metadata is not an accessible name',
          )
        } finally {
          renderer.act(() => tree.unmount())
        }
      }
    }
    assert.ok(warn.mock.calls.some((call) => String(call.arguments[0]).includes('Web DOM dataset')))
  } finally {
    warn.mock.restore()
  }
})

// #1704: a menu trigger's open state, compiled or not, named or spread.
test('a Button carries accessibilityState to the Native host, and drops aria-controls', () => {
  const { Button: Fallback } = require('@hozo/primitives')
  const { Named, Spread } = loadNativeModule(`import {Button} from '@hozo/core';
    export function Named({ open }) {return <Button accessibilityState={{ expanded: open }} aria-controls="menu">Open</Button>}
    export function Spread(props) {return <Button { ... props } />}`)
  const host = (element: unknown) => {
    let tree: ReturnType<typeof renderer.create>
    renderer.act(() => {
      tree = renderer.create(element as never)
    })
    try {
      return tree.root.findByType('Pressable').props
    } finally {
      renderer.act(() => tree.unmount())
    }
  }
  const trigger = { accessibilityState: { expanded: true }, 'aria-controls': 'menu' }
  for (const C of [Fallback, Spread]) {
    const props = host(react.createElement(C, trigger, 'Open'))
    assert.equal(props.accessibilityState.expanded, true)
    assert.equal(props.accessibilityRole, 'button')
  }
  assert.equal(host(react.createElement(Named, { open: true })).accessibilityState.expanded, true)
  assert.equal(
    host(react.createElement(Fallback, trigger, 'Open'))['aria-controls'],
    undefined,
    'React Native has nothing to put it in',
  )
  const off = host(
    react.createElement(Fallback, { accessibilityState: { disabled: true } }, 'Save'),
  )
  assert.equal(off.disabled, true)
  assert.equal(off.accessibilityState.disabled, true)
})
