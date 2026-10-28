import assert from 'node:assert/strict'
import test from 'node:test'
import { gapLayouts, prepareGapAliasSubjects, yogaGapGeometry } from './gap-alias-reference.ts'

test('real Yoga axis gutters defeat a later generic gutter regardless of setter order', () => {
  let observations = 0
  for (const layout of gapLayouts) {
    for (const style of [
      { rowGap: 8, columnGap: 4, gap: 16 },
      { gap: 16, columnGap: 4, rowGap: 8 },
    ]) {
      assert.deepEqual(yogaGapGeometry(style, layout), [8, 4])
      observations++
    }
  }
  assert.equal(observations, 16)
})

test('static and opaque-class outputs retain the measured gap alias boundary, not claimed parity', async () => {
  const subjects = await prepareGapAliasSubjects()
  let observations = 0
  let mismatches = 0
  for (const subject of subjects) {
    for (const layout of gapLayouts) {
      for (const [kind, style] of [
        ['static', subject.selected],
        ['dynamic', subject.dynamic],
      ] as const) {
        const measured = yogaGapGeometry(style, layout)
        assert.deepEqual(
          measured,
          subject.native,
          `${subject.id}/${kind}/${JSON.stringify(layout)}`,
        )
        if (JSON.stringify(measured) !== JSON.stringify(subject.web)) mismatches++
        observations++
      }
    }
  }
  assert.equal(observations, 320)
  assert.equal(
    mismatches,
    128,
    'known divergence must remain visible until a paired fix replaces this boundary test',
  )
})

test('expanding the compiled generic gap alone still loses the caller inline generic gap', () => {
  for (const layout of gapLayouts) {
    // A compile-time-only expansion is not a fix: the remaining authored
    // shorthand loses to the generated axes even when it is composed last.
    assert.deepEqual(yogaGapGeometry({ rowGap: 16, columnGap: 16, gap: 24 }, layout), [16, 16])
    // Experimental all-axis control, not production normalization. A real
    // implementation must preserve each source's own semantics before merge.
    assert.deepEqual(yogaGapGeometry({ rowGap: 24, columnGap: 24 }, layout), [24, 24])
  }
})
