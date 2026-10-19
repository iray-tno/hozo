import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { createTextReference } from './text-inheritance-reference-core.ts'

const require = createRequire(import.meta.url)
const React = require('react')
const renderer = require('react-test-renderer')
globalThis.IS_REACT_ACT_ENVIRONMENT = true
const flatten = (style: unknown): Record<string, unknown> =>
  Array.isArray(style)
    ? Object.assign({}, ...style.map(flatten))
    : style && typeof style === 'object'
      ? { ...style }
      : {}

test('the portable reference has no runtime import, resolver, Node API or simulated host dependency', () => {
  const result = buildSync({
    entryPoints: [fileURLToPath(new URL('./text-inheritance-reference-core.ts', import.meta.url))],
    bundle: true,
    write: false,
    format: 'esm',
    metafile: true,
    platform: 'neutral',
  })
  assert.equal(Object.keys(result.metafile!.inputs).length, 1)
  assert.deepEqual(Object.values(result.metafile!.inputs)[0].imports, [])
  assert.doesNotMatch(
    result.outputFiles![0].text,
    /require\(|from ['"]|node:|projectedNativeAttributes/,
  )
})

test('injected contexts, counters and hosts are isolated; View normalization happens after publication', () => {
  const legacy = React.createContext(16)
  const interaction = React.createContext(null)
  const make = () =>
    createTextReference({
      react: React,
      Text: 'InjectedText',
      View: 'InjectedView',
      HozoPressable: 'InjectedPressable',
      HozoTextSizeContext: legacy,
      HozoInteractionContext: interaction,
      flattenStyle: flatten,
      renderViewStyle: (style) => ({ width: flatten(style).width }),
    })
  const a = make(),
    b = make()
  let size: unknown
  function Reader() {
    size = React.useContext(legacy)
    return null
  }
  let tree: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      tree = renderer.create(
        React.createElement(
          a.ReferenceView,
          {
            style: [{ width: 240 }, { color: '#123456', fontSize: 22 }],
          },
          React.createElement(a.ReferenceText, { testID: 'a' }, 'a'),
          React.createElement(b.ReferenceText, { testID: 'b' }, 'b'),
          React.createElement(Reader),
        ),
      )
    })
    const hosts = tree.root.findAll((node: { type: unknown }) => node.type === 'InjectedText')
    assert.equal(hosts.length, 2, 'no extra text host or wrapper host')
    assert.deepEqual(flatten(hosts[0].props.style), { color: '#123456', fontSize: 22 })
    assert.deepEqual(
      flatten(hosts[1].props.style),
      {},
      'factory B does not consume factory A frames',
    )
    assert.equal(size, 22, 'the existing legacy context is the injected singleton')
    assert.deepEqual(tree.root.findByType('InjectedView').props.style, { width: 240 })
    assert.equal(a.referenceExecutions().ReferenceText, 1)
    assert.equal(b.referenceExecutions().ReferenceText, 1)
    a.resetReferenceExecutions()
    assert.deepEqual(a.referenceExecutions(), {})
    assert.equal(b.referenceExecutions().ReferenceText, 1)
  } finally {
    renderer.act(() => tree?.unmount())
  }
})
