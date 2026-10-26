import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeClassesDrawnStatically, nativeClassReport, nativeClassVerdicts } from './index.ts'

// #1165. A class list handed to a pattern the compiler does not lower went
// to React Native's resolver unexamined; the report reads it on any element.
test('the report names the classes React Native cannot draw, on any element, through constants', () => {
  const source = `import { BottomSheet } from '@hozo/patterns'
const handle = 'flex h-6 before:block cursor-grab'
export function Sheet() {
  return <BottomSheet handleClassName={handle} className="p-4 hover:bg-red-500" />
}`
  assert.deepEqual(
    nativeClassReport(source).map(({ element, prop, className, kind }) => [
      element,
      prop,
      className,
      kind,
    ]),
    [
      ['BottomSheet', 'handleClassName', 'before:block', 'missing'],
      ['BottomSheet', 'handleClassName', 'cursor-grab', 'cosmetic'],
    ],
  )
})

test('loose class names get the same verdict, and null where React Native can draw them', () => {
  const [plain, marker, cursor] = nativeClassVerdicts([
    'p-4',
    'after:absolute',
    'cursor-not-allowed',
  ])
  assert.equal(plain, null)
  assert.equal(marker?.kind, 'missing')
  assert.equal(cursor?.kind, 'cosmetic')
})

// #1313. The verdict answers for a class string resolved on device; a class
// the static backend draws where it is written is left out of the report.
test('a class the backend draws on a Dialog is drawn, not reported', () => {
  const source = `import { cx, Dialog } from '@hozo/core'
const panel = 'max-h-[85vh] backdrop:bg-black/50 before:block'
export function Panel({ className, open, onClose }) {
  return <Dialog open={open} onClose={onClose} accessibilityLabel="x" className={cx(panel, className)} />
}`
  assert.deepEqual(
    nativeClassReport(source).map(({ className }) => className),
    ['before:block'],
  )
  assert.deepEqual(nativeClassesDrawnStatically(source), ['backdrop:bg-black/50', 'max-h-[85vh]'])
})
