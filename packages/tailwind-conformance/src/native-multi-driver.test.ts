import assert from 'node:assert/strict'
import test from 'node:test'
import { compareNativeCandidate } from './native.ts'

test('multi-driver stacked Native variants lower in realistic contextual probes', () => {
  for (const candidate of [
    'hover:disabled:p-4',
    'hover:aria-checked:p-4',
    'hover:data-open:p-4',
    'hover:group-hover:p-4',
    'hover:peer-hover:p-4',
    'group-hover:peer-hover:p-4',
    'focus-within:hover:p-4',
    'has-hover:disabled:p-4',
    'even:empty:p-4',
    'nth-3:has-hover:p-4',
    'focus:read-only:p-4',
    'read-only:placeholder-shown:p-4',
    'group-hover:selection:bg-blue-500',
    'peer-hover:selection:bg-blue-500',
    'group-hover:backdrop:p-4',
    'peer-hover:backdrop:p-4',
    'data-open:backdrop:p-4',
    'group-hover:starting:bg-blue-500',
    'peer-hover:starting:bg-blue-500',
    '*:peer-hover:p-4',
    '**:peer-hover:p-4',
    '*:backdrop:p-4',
    '*:starting:bg-blue-500',
    '*:read-only:p-4',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${result.detail}`)
    assert.ok(result.restrictedTo && result.restrictedTo.length > 0, `${candidate} is contextual`)
  }
})

test('unwired and logically impossible variant combinations remain honestly refused', () => {
  for (const candidate of [
    'first:peer-hover:p-4',
    'only:peer-hover:p-4',
    'empty:has-hover:p-4',
    'empty:*:p-4',
    'hover:starting:bg-blue-500',
    'max-[40rem]:p-4',
    'contrast-less:p-4',
    'placeholder:flex',
    'selection:flex',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'REFUSED', `${candidate}: got ${result.verdict}`)
  }
})

test('multi-driver gating leaves bare and ambient utilities unrestricted', () => {
  for (const candidate of ['p-4', 'md:p-4', 'dark:md:bg-blue-500']) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${result.detail}`)
    assert.equal(result.restrictedTo, undefined, `${candidate} should not be restricted`)
  }
})
