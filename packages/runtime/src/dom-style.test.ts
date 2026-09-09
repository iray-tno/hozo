import assert from 'node:assert/strict'
import { test } from 'node:test'

import { type HozoDomStyle, hozoDomProps, hozoDomStyle } from './dom-style.ts'

test('recursively flattens arrays with React Native last-wins semantics', () => {
  assert.deepEqual(
    hozoDomStyle([
      { display: 'flex', padding: 4 },
      false,
      [{ padding: 8 }, null, undefined],
      { opacity: 0.5 },
    ]),
    { display: 'flex', padding: 8, opacity: 0.5 },
  )
})

test('converts ordered React Native transforms and array-valued CSS fields', () => {
  assert.deepEqual(
    hozoDomStyle({
      transform: [{ translateX: 4 }, { rotate: '15deg' }, { scale: 0.5 }],
      transformOrigin: [10, '25%', 0],
      fontVariant: ['small-caps', 'tabular-nums'],
      resizeMode: 'stretch',
    }),
    {
      transform: 'translateX(4px) rotate(15deg) scale(0.5)',
      transformOrigin: '10px 25% 0px',
      fontVariant: 'small-caps tabular-nums',
      objectFit: 'fill',
    },
  )
})

test('omits unsupported native-only properties with an actionable warning', () => {
  const messages: string[] = []
  const original = console.warn
  console.warn = (message) => messages.push(String(message))
  try {
    assert.deepEqual(hozoDomStyle({ padding: 4, elevation: 3 }), { padding: 4 })
  } finally {
    console.warn = original
  }
  assert.equal(messages.length, 1)
  assert.match(messages[0] as string, /elevation.*omitted on Web/)
})

test('leaves ordinary prop spreads alone and normalizes a spread style', () => {
  const plain = { id: 'row' }
  assert.equal(hozoDomProps(plain), plain)
  assert.deepEqual(hozoDomProps({ id: 'row', style: [{ padding: 2 }, { padding: 6 }] }), {
    id: 'row',
    style: { padding: 6 },
  })
})

test('reads a spread style accessor once and ignores inherited style', () => {
  let reads = 0
  const props = {
    get style() {
      reads += 1
      return [{ opacity: 0.25 }]
    },
  }
  assert.deepEqual(hozoDomProps(props), { style: { opacity: 0.25 } })
  assert.equal(reads, 1)

  const inherited = Object.create({ style: [{ opacity: 0 }] }) as { style: HozoDomStyle }
  assert.equal(hozoDomProps(inherited), inherited)
})
