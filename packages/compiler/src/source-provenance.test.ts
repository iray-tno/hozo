import assert from 'node:assert/strict'
import test from 'node:test'
import { SourceProvenance } from './source-provenance.ts'

test('insertion points require one surviving authored boundary, not a generated gap', () => {
  const map = new SourceProvenance('ab')
  assert.deepEqual(map.emittedInsertion('ab', 0), { spanStart: 0, spanEnd: 0 })
  map.apply('ab', [{ spanStart: 1, spanEnd: 1, replacement: 'XYZ' }])
  assert.deepEqual(map.emittedInsertion('aXYZb', 0), { spanStart: 0, spanEnd: 0 })
  assert.deepEqual(map.emittedInsertion('aXYZb', 2), { spanStart: 5, spanEnd: 5 })
  assert.equal(map.emittedInsertion('aXYZb', 1), undefined, 'both sides are plausible')
  for (const offset of [-1, 0.5, 3, NaN])
    assert.equal(map.emittedInsertion('aXYZb', offset), undefined)
  assert.equal(map.emittedInsertion('other', 0), undefined)
})

test('duplicated copies and invalid stage inputs cannot locate an insertion', () => {
  const map = new SourceProvenance('ab')
  map.apply('ab', [
    {
      spanStart: 0,
      spanEnd: 2,
      replacement: 'abab',
      copies: [
        { spanStart: 0, spanEnd: 2, emittedStart: 0, emittedEnd: 2 },
        { spanStart: 0, spanEnd: 2, emittedStart: 2, emittedEnd: 4 },
      ],
    },
  ])
  assert.equal(map.emittedInsertion('abab', 1), undefined)
  map.apply('wrong', [])
  assert.equal(map.emittedInsertion('abab', 0), undefined)
})
