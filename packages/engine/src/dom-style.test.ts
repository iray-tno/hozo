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

test('inline gap axes retain Native priority in either object order and across nested arrays', () => {
  for (const style of [
    { rowGap: 8, gap: 24 },
    { gap: 24, rowGap: 8 },
    [{ rowGap: 8 }, [false, null, { gap: 24 }]],
    [[{ gap: 24 }], { rowGap: 8 }],
  ]) {
    assert.deepEqual(hozoDomStyle(style), { rowGap: 8, columnGap: 24 })
  }
  assert.deepEqual(hozoDomStyle({ columnGap: 0, gap: 16 }), { rowGap: 16, columnGap: 0 })
  assert.deepEqual(hozoDomStyle([{ rowGap: 8, gap: 16 }, { rowGap: undefined }]), {
    rowGap: 16,
    columnGap: 16,
  })
  assert.deepEqual(hozoDomStyle({ rowGap: null, columnGap: undefined, gap: '25%' }), {
    rowGap: '25%',
    columnGap: '25%',
  })
})

test('gap normalization does not mutate frozen styles or evaluate authored accessors twice', () => {
  const reads: string[] = []
  const own = Object.freeze({
    get gap() {
      reads.push('gap')
      return 24
    },
    get rowGap() {
      reads.push('rowGap')
      return 8
    },
    get opacity() {
      reads.push('opacity')
      return 0.5
    },
  })
  assert.deepEqual(hozoDomStyle([own]), { rowGap: 8, columnGap: 24, opacity: 0.5 })
  assert.deepEqual(reads, ['gap', 'rowGap', 'opacity'])
  assert.equal(Object.hasOwn(own, 'gap'), true)
})

test('CSS-only and invalid generic gaps are not reinterpreted as Native values', () => {
  for (const gap of [
    '8px 16px',
    'var(--spacing)',
    'calc(2px + 1%)',
    'normal',
    -1,
    NaN,
    Infinity,
    null,
    undefined,
  ]) {
    assert.deepEqual(hozoDomStyle({ rowGap: 8, gap }), { rowGap: 8, gap })
  }
  assert.deepEqual(hozoDomStyle({ opacity: 0.5, rowGap: 8 }), { opacity: 0.5, rowGap: 8 })
})
