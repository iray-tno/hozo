import assert from 'node:assert/strict'
import test from 'node:test'
import {
  prepareOrderSubjects,
  projectOrderNative,
  summarizeOrderCells,
} from './tailwind-order-baseline.ts'
import { orderCases } from './tailwind-order-corpus.ts'

test('baseline captures actual static and candidate output for every source order, including diagnostics', async () => {
  const report = await prepareOrderSubjects()
  assert.equal(report.subjects.length, orderCases.length * 2)
  assert.ok(report.defaultCss.length && report.orderedCss.length && report.nativeModule.length)
  for (const subject of report.subjects) {
    assert.ok(subject.web.jsx && subject.web.css)
    assert.ok(subject.native.diagnostics)
    assert.ok(Object.keys(subject.native.selected).length, `${subject.id}: Native style lost`)
    assert.ok(Object.keys(subject.fallback).length, `${subject.id}: candidate style lost`)
  }
})

test('native projection keeps logical-edge priority explicit instead of hiding the px/side discrepancy', () => {
  const style = { paddingLeft: 4, paddingRight: 4, paddingStart: 32, paddingEnd: 16 }
  assert.deepEqual(projectOrderNative(style, ['paddingLeft', 'paddingRight'], 'ltr'), {
    paddingLeft: '32px',
    paddingRight: '16px',
  })
  assert.deepEqual(projectOrderNative(style, ['paddingLeft', 'paddingRight'], 'rtl'), {
    paddingLeft: '16px',
    paddingRight: '32px',
  })
  assert.deepEqual(projectOrderNative({}, ['color'], 'ltr'), { color: null })
})

test('the baseline observer counts a deliberately wrong value as a mismatch, never a skipped class', () => {
  assert.deepEqual(
    summarizeOrderCells([
      { route: 'staticWeb', expected: { width: '40px' }, actual: { width: '40px' } },
      { route: 'staticWeb', expected: { width: '40px' }, actual: { width: '8px' } },
      { route: 'staticNative', expected: { width: '40px' }, actual: { width: null } },
    ]),
    { staticWeb: { matched: 1, mismatched: 1 }, staticNative: { matched: 0, mismatched: 1 } },
  )
})
