// Web carrier evidence, not browser computed-style/event or Native pixel proof.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { BottomSheet } from '@hozo/patterns'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { classesDefinedIn, renderWeb } from './render.ts'

const contract = JSON.parse(
  readFileSync(new URL('./fixtures/bottom-sheet-handle-contract.json', import.meta.url), 'utf8'),
)

test('existing Web class carrier delivers compiler-owned classes to each real handle shape', () => {
  assert.equal(contract.audit, 'unknown', 'a transport probe is not a complete contract audit')
  assert.equal(contract.abi.webClassProp, 'handleClassName')
  const compiler = createCompiler()
  for (const shape of contract.shapes) {
    const tag = shape.id === 'resizable' ? 'Pressable' : 'View'
    const names =
      shape.id === 'resizable'
        ? 'p-[8px] opacity-100 hover:opacity-50 focus:p-[12px] active:bg-[#ff0000]'
        : 'p-[8px] opacity-100 bg-[#ffffff]'
    const compiled = compiler.compile(
      `import {${tag}} from '@hozo/core'; export function Plan(){return <${tag} className="${names}"/>}`,
    )
    assert.equal(compiled.length, 1)
    assert.deepEqual(compiled[0].diagnostics, [])
    const emitted = renderWeb([{ name: 'Plan', jsx: compiled[0].jsx }])[0]
    const carried = [...emitted.classes].join(' ')
    const html = renderToStaticMarkup(
      createElement(
        BottomSheet,
        {
          open: true,
          portal: false,
          detents: shape.id === 'resizable' ? [0.5, 1] : [1],
          handleClassName: carried,
          handleBarClassName: 'handle-bar',
          accessibilityLabel: 'Sheet',
        },
        'Body',
      ),
    )
    const hosts = [...html.matchAll(/<(button|div)\b[^>]*class="([^"]+)"[^>]*>/g)].filter(
      (match) => match[2] === carried,
    )
    assert.equal(
      hosts.length,
      1,
      'compiled classes must reach one actual handle, not just an output string',
    )
    assert.equal(hosts[0][1], shape.webHost)
    const defined = classesDefinedIn(compiled[0].css)
    assert.ok(defined.size > 0)
    for (const name of defined)
      assert.ok(emitted.classes.has(name), `CSS class ${name} absent on owner`)
    if (shape.id === 'resizable') assert.match(hosts[0][0], /data-hozo-pressable=""/)
    else assert.match(hosts[0][0], /aria-hidden="true"/)
    assert.match(html, /class="handle-bar"/)
    assert.match(html, /role="dialog"/)
  }
})

test('ordinary Web callers retain their opaque class carrier and closed owner gate', () => {
  for (const detents of [[1], [0.5, 1]]) {
    const open = renderToStaticMarkup(
      createElement(
        BottomSheet,
        { open: true, portal: false, detents, handleClassName: 'opaque-handle' },
        'Body',
      ),
    )
    assert.match(open, /class="opaque-handle"/)
    const closed = renderToStaticMarkup(
      createElement(
        BottomSheet,
        { open: false, portal: false, detents, handleClassName: 'opaque-handle' },
        'Body',
      ),
    )
    assert.equal(closed, '')
  }
})
