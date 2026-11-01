// Web carrier evidence, not browser computed-style/event or Native pixel proof.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { BottomSheet } from '@hozo/patterns'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { parseOwnerContractShadow, selectOwnerShape } from '../../compiler/src/owner-contract.ts'
import { classesDefinedIn } from './render.ts'

const contract = parseOwnerContractShadow(
  readFileSync(new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url), 'utf8'),
).contracts[0]!

test('backend Web class carriers reach both real handle shapes without generated JSX extraction', () => {
  assert.equal(contract.audit, 'unknown', 'a transport probe is not a complete contract audit')
  assert.equal(contract.abi.webClassProp, 'handleClassName')
  const compiler = createCompiler()
  for (const shape of contract.shapes) {
    const selected = selectOwnerShape(contract, {
      present: true,
      resizable: shape.id === 'resizable',
    })
    assert.equal(selected.status, 'selected')
    if (selected.status === 'selected') assert.equal(selected.shape.id, shape.id)
    const tag = shape.id === 'resizable' ? 'Pressable' : 'View'
    const names =
      shape.id === 'resizable'
        ? 'p-[8px] opacity-100 hover:opacity-50 focus:p-[12px] active:bg-[#ff0000]'
        : 'p-[8px] opacity-100 bg-[#ffffff]'
    const retained = compiler.prepareWebModule(
      `import {${tag}} from '@hozo/core'; export function Plan(){return <${tag} className="${names}"/>}`,
      undefined,
      { ownerClass: true },
    )
    const compiled = (() => {
      try {
        return retained.preview()
      } finally {
        retained.dispose()
      }
    })()
    assert.equal(compiled.length, 1)
    assert.deepEqual(compiled[0].diagnostics, [])
    const carrier = compiled[0].ownerClass
    assert.ok(carrier)
    const carried = carrier.className
    assert.doesNotMatch(carried, /hozo-view/)
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
    const defined = classesDefinedIn(carrier.css)
    assert.ok(defined.size > 0)
    for (const name of defined)
      assert.ok(carried.split(' ').includes(name), `CSS class ${name} absent on owner`)
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
