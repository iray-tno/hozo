import assert from 'node:assert/strict'
import test from 'node:test'
import { namespaceHozoIdentifiers, namespaceNativeJsx } from './native-source-evidence.ts'

test('Native identifier renaming shifts actual copy ranges without changing ordinary output', () => {
  const source = '😀hozo2 <Tools /> hozo31 <Tools /> hozo4'
  const ranges = [...source.matchAll(/<Tools \/>/g)].map((match) => ({
    spanStart: match.index,
    spanEnd: match.index + match[0].length,
    emittedStart: match.index,
    emittedEnd: match.index + match[0].length,
  }))
  const observed = namespaceNativeJsx(source, 12, ranges)
  assert.equal(observed.text, namespaceHozoIdentifiers(source, 12))
  assert.equal(observed.copies?.length, 2)
  for (const copy of observed.copies!)
    assert.equal(
      source.slice(copy.spanStart, copy.spanEnd),
      observed.text.slice(copy.emittedStart, copy.emittedEnd),
    )
  assert.ok(!Object.hasOwn(namespaceNativeJsx(source, 12), 'copies'))
})

test('renaming inside a carried fragment invalidates it without discarding untouched neighbors', () => {
  const source = '<Tools value={hozo0} />;<Tools />'
  const split = source.indexOf(';')
  const result = namespaceNativeJsx(source, 0, [
    { spanStart: 0, spanEnd: split, emittedStart: 0, emittedEnd: split },
    {
      spanStart: split + 1,
      spanEnd: source.length,
      emittedStart: split + 1,
      emittedEnd: source.length,
    },
  ])
  assert.equal(result.copies?.length, 1)
  const copy = result.copies![0]!
  assert.equal(result.text.slice(copy.emittedStart, copy.emittedEnd), '<Tools />')
  assert.equal(copy.spanStart, split + 1)
  assert.equal(result.text, namespaceHozoIdentifiers(source, 0))
})
