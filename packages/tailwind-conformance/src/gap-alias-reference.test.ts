import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { hozoAuthoredStyle } from '../../engine/src/authored-gap.ts'
import { hozoGapSpreadStyles } from '../../engine/src/gap-styles.ts'
import { hozoSpreadStyles } from '../../engine/src/spread-styles.ts'
import { gapLayouts, prepareGapAliasSubjects, yogaGapGeometry } from './gap-alias-reference.ts'
import { executeOrderModule, flattenOrderStyle } from './tailwind-order-baseline.ts'

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

test('static and opaque-class outputs match the reviewed browser gap composition contract', async () => {
  const subjects = await prepareGapAliasSubjects()
  let observations = 0
  let mismatches = 0
  for (const subject of subjects) {
    for (const layout of gapLayouts) {
      for (const [kind, style] of [
        ['static', subject.selected],
        ['dynamic', subject.dynamic],
        ['spread', subject.spread],
        ['dynamic-spread', subject.dynamicSpread],
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
  assert.equal(observations, 640)
  assert.equal(mismatches, 0, 'the formerly measured class/inline discrepancy must not return')
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

test('an actual compiled Pressable spread resolves its style callback once before gap composition', () => {
  const source = `import {Pressable} from '@hozo/core';const el=<Pressable className="gap-y-[8px]" {...rest}/>`
  const output = createCompiler().compileNativeModule(source).components[0]
  assert.deepEqual(
    output.diagnostics.map((finding) => finding.code),
    ['UNSAFE_PROP_SPREAD_AFTER_STYLE'],
  )
  let reads = 0
  let calls = 0
  let expectedState: unknown
  const props = executeOrderModule(
    `const hozoStyles=${output.styles};module.exports=(${output.jsx})`,
    {
      Pressable: 'owner',
      HozoPressable: 'owner',
      h: (_type, props) => props,
      hozoSpreadStyles,
      hozoGapSpreadStyles,
      hozoAuthoredStyle,
      rest: {
        get style() {
          reads++
          return (state: { pressed: boolean }) => {
            assert.equal(state, expectedState)
            calls++
            return [{ gap: state.pressed ? 24 : 16 }, { columnGap: 4 }]
          }
        },
      },
    },
  ) as { style: (state: unknown) => unknown }
  assert.equal(reads, 1)
  assert.equal(typeof props.style, 'function')
  for (const pressed of [false, true]) {
    const state = { pressed }
    expectedState = state
    const selected = flattenOrderStyle(props.style(state))
    for (const layout of gapLayouts) {
      assert.deepEqual(yogaGapGeometry(selected, layout), [pressed ? 24 : 16, 4])
    }
  }
  assert.equal(calls, 2)
  assert.equal(reads, 1)
})
