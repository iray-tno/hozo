import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nativeClassReport, nativeClassVerdicts } from './index.ts'

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
