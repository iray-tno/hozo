import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { compile } from '@hozo/compiler'
import { loadNativeModule } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')

test('disabled destination HTML has one guarded anchor contract for each source primitive', () => {
  for (const name of ['Button', 'Link', 'Pressable']) {
    const [web] = compile(
      `import {${name}} from '@hozo/core'; const e = <${name} href="/docs" disabled={blocked}>Docs</${name}>`,
    )
    for (const blocked of [true, false]) {
      const [rendered] = renderWeb([{ name: 'C', jsx: web.jsx }], { blocked })
      assert.match(rendered.html, /^<a\b/)
      assert.doesNotMatch(rendered.html, /\sdisabled=/)
      assert.doesNotMatch(rendered.html, /role="button"/)
      assert.match(rendered.html, new RegExp(`aria-disabled="${blocked}"`))
      assert.equal(/tabindex="-1"/.test(rendered.html), blocked)
      assert.equal(/data-hozo-disabled=""/.test(rendered.html), blocked)
    }
  }
})

test('Native compiled and value-level destination hosts retain disabled and link role through transitions', () => {
  const fallback = require('@hozo/primitives')
  for (const name of ['Button', 'Link', 'Pressable']) {
    for (const enhanced of name === 'Pressable' ? [false, true] : [false]) {
      const { C } = loadNativeModule(`import {${name}} from '@hozo/core';
        export function C({blocked}) {return <${name} href="/docs" disabled={blocked} ${enhanced ? 'className="active:opacity-50"' : ''}>Docs</${name}>}`)
      for (const Host of [C, fallback[name]]) {
        let tree: ReturnType<typeof renderer.create>
        try {
          for (const disabled of [true, false, true]) {
            const element = React.createElement(
              Host,
              { blocked: disabled, disabled, href: '/docs' },
              'Docs',
            )
            renderer.act(() => {
              if (tree) tree.update(element)
              else tree = renderer.create(element)
            })
            const host = tree.root.findByType('Pressable')
            assert.equal(host.props.disabled, disabled)
            assert.equal(host.props.accessibilityRole, 'link')
          }
        } finally {
          renderer.act(() => tree?.unmount())
        }
      }
    }
  }
})
