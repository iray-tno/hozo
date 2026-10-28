import assert from 'node:assert/strict'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { buildSync } from 'esbuild'
import { hozoAuthoredStyle } from './authored-gap.ts'
import { hozoGapSpreadStyles } from './gap-styles.ts'

test('author contribution keeps its axes before composing above class axes', () => {
  const classes = { rowGap: 8 }
  const own = Object.freeze({ gap: 16 })
  const resolved = hozoAuthoredStyle(own)
  assert.deepEqual(Object.assign({}, classes, resolved), { rowGap: 16, columnGap: 16 })
  assert.deepEqual(own, { gap: 16 })
  assert.deepEqual(hozoAuthoredStyle([{ rowGap: 4 }, [false, null, { gap: 16 }]]), {
    rowGap: 4,
    columnGap: 16,
  })
})

test('no-gap author objects retain identity and opaque values are not interpreted', () => {
  const own = Object.freeze({ opacity: 0.5 })
  assert.equal(hozoAuthoredStyle(own), own)
  const callback = () => ({ gap: 16 })
  for (const input of [callback, false, null, undefined, 42]) {
    assert.equal(hozoAuthoredStyle(input), input)
  }
})

test('flattening an author reads each accessor once and never caches mutable style contents', () => {
  const reads: string[] = []
  const own = {
    get gap() {
      reads.push('gap')
      return 16
    },
    get rowGap() {
      reads.push('row')
      return 4
    },
  }
  assert.deepEqual(hozoAuthoredStyle([own]), { rowGap: 4, columnGap: 16 })
  assert.deepEqual(reads, ['gap', 'row'])
  const mutable = { gap: 8 }
  assert.deepEqual(hozoAuthoredStyle(mutable), { rowGap: 8, columnGap: 8 })
  mutable.gap = 24
  assert.deepEqual(hozoAuthoredStyle(mutable), { rowGap: 24, columnGap: 24 })
})

test('spread composition normalizes only the resolved author, not compiled styles', () => {
  const classes = new Proxy(
    { rowGap: 8 },
    {
      ownKeys() {
        throw new Error('compiled styles must not be scanned')
      },
    },
  )
  let calls = 0
  const state = { pressed: true }
  const props = hozoGapSpreadStyles({ style: classes }, [], {
    style(received: unknown) {
      assert.equal(received, state)
      calls++
      return [{ gap: 16 }, { columnGap: 4 }]
    },
  })
  const selected = (props.style as (value: unknown) => unknown[])(state)
  assert.equal(selected[0], classes)
  assert.deepEqual(selected[1], { rowGap: 16, columnGap: 4 })
  assert.equal(calls, 1)
  assert.deepEqual(
    hozoGapSpreadStyles({ optionStyle: { rowGap: 8 } }, [], { optionStyle: { gap: 16 } })
      .optionStyle,
    [{ rowGap: 8 }, { rowGap: 16, columnGap: 16 }],
  )
})

test('gap-aware composition keeps generated-before-authored callback evaluation order', () => {
  const calls: string[] = []
  const props = hozoGapSpreadStyles(
    {
      style: () => {
        calls.push('compiled')
        return { rowGap: 8 }
      },
    },
    [],
    {
      style: () => {
        calls.push('author')
        return { gap: 16 }
      },
    },
  )
  const selected = (props.style as (state: unknown) => unknown[])(false)
  assert.deepEqual(calls, ['compiled', 'author'])
  assert.deepEqual(selected, [{ rowGap: 8 }, { rowGap: 16, columnGap: 16 }])
})

test('ordinary generated spread imports do not retain the gap projection module', () => {
  const inputs = (leaf: string) =>
    Object.keys(
      buildSync({
        entryPoints: [fileURLToPath(new URL(`./generated/${leaf}.ts`, import.meta.url))],
        bundle: true,
        format: 'esm',
        platform: 'node',
        write: false,
        metafile: true,
      }).metafile!.inputs,
    ).map((file) => file.replaceAll('\\', '/'))
  assert.equal(
    inputs('spread-styles').some((file) => file.endsWith('/authored-gap.ts')),
    false,
  )
  assert.equal(
    inputs('gap-styles').some((file) => file.endsWith('/authored-gap.ts')),
    true,
  )
})
