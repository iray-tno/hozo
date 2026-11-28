import assert from 'node:assert/strict'
import test from 'node:test'
import { compareNativeCandidate } from './native.ts'

test('marker: lowers on ListItem contexts and stacks with ambient/relational variants', () => {
  for (const candidate of [
    'marker:bg-blue-500',
    'marker:p-4',
    'marker:flex',
    'dark:marker:bg-blue-500',
    'group-hover:marker:bg-blue-500',
    'peer-hover:marker:p-4',
    'first:marker:bg-blue-500',
    '*:marker:bg-blue-500',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${JSON.stringify(result)}`)
  }
})

test('required:, invalid:, and user-invalid: lower on driven TextInput contexts', () => {
  for (const candidate of [
    'required:p-4',
    'invalid:bg-blue-500',
    'user-invalid:p-4',
    'not-invalid:p-4',
    'required:focus:p-4',
    'invalid:focus-visible:bg-blue-500',
    'user-invalid:dark:p-4',
    'required:invalid:bg-blue-500',
    '*:required:p-4',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${JSON.stringify(result)}`)
  }
})

test('first-letter: lowers inline text properties and refuses box/layout properties', () => {
  for (const candidate of [
    'first-letter:bg-blue-500',
    'dark:first-letter:bg-blue-500',
    'group-hover:first-letter:bg-blue-500',
    'peer-hover:first-letter:bg-blue-500',
    '*:first-letter:bg-blue-500',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${JSON.stringify(result)}`)
  }
  for (const candidate of ['first-letter:flex', 'first-letter:p-4']) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'REFUSED', `${candidate}: ${JSON.stringify(result)}`)
  }
})

test('before: and after: lower on box containers and refuse invalid double pseudos', () => {
  for (const candidate of [
    'before:flex',
    'before:bg-blue-500',
    'after:p-4',
    'hover:before:bg-blue-500',
    'group-hover:after:p-4',
    'peer-hover:before:bg-blue-500',
    'empty:before:bg-blue-500',
    '*:before:bg-blue-500',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${JSON.stringify(result)}`)
  }
  for (const candidate of ['before:after:flex', 'before:marker:bg-blue-500']) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'REFUSED', `${candidate}: ${JSON.stringify(result)}`)
  }
})

test('supports-[...]: evaluates statically against Native capability without silent drops', () => {
  for (const candidate of [
    'supports-[display:flex]:p-4',
    'supports-[gap:1px]:flex',
    'not-supports-[display:grid]:bg-blue-500',
    'supports-[not_(display:grid)]:p-4',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'COVERED', `${candidate}: ${JSON.stringify(result)}`)
  }
  for (const candidate of [
    'supports-[display:grid]:flex',
    'md:supports-[display:grid]:p-4',
    'supports-[selector(:has(*))]:p-4',
  ]) {
    const result = compareNativeCandidate(candidate)
    assert.equal(result.verdict, 'REFUSED', `${candidate}: ${JSON.stringify(result)}`)
  }
})
