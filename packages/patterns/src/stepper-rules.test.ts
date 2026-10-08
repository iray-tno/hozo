import assert from 'node:assert/strict'
import { test } from 'node:test'
import { stepMark, stepStatus } from './stepper-rules.ts'

test('position gives the status unless the step says otherwise', () => {
  const steps = [
    { label: 'A' },
    { label: 'B' },
    { label: 'C', status: 'error' as const },
    { label: 'D' },
  ]
  assert.deepEqual(
    steps.map((step, index) => stepStatus(step, index, 1)),
    ['completed', 'current', 'error', 'upcoming'],
  )
})

test('the mark is the number, a check when done, and a bang when wrong', () => {
  assert.equal(stepMark(0, 'current'), '1')
  assert.equal(stepMark(2, 'upcoming'), '3')
  assert.equal(stepMark(0, 'completed'), '✓')
  assert.equal(stepMark(1, 'error'), '!')
})
