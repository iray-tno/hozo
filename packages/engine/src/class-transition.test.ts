import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassTransitions } from './class-transition.ts'

const read = createClassTransitions({
  'transition-[inset-inline-start,background-color]': [
    null,
    { properties: ['inset-inline-start', 'background-color'] },
  ],
  'transition-colors': [null, { properties: ['color', 'background-color'] }],
  'transition-none': [null, { properties: ['none'] }],
  'duration-150': [null, { duration: 150 }],
  'duration-300': [null, { duration: 300 }],
  'ease-out': [null, { easing: 'ease-out' }],
  'motion-reduce:transition-colors': [
    'motion-reduce',
    { properties: ['color', 'background-color'] },
  ],
  'motion-safe:duration-300': ['motion-safe', { duration: 300 }],
})

const thumb =
  'absolute start-1 transition-[inset-inline-start,background-color] duration-150 ease-out motion-reduce:transition-colors'

test('a class string is read into one spec, later classes winning field by field', () => {
  assert.deepEqual(read(thumb, { reduceMotion: false }), {
    duration: 150,
    delay: undefined,
    easing: 'ease-out',
    properties: ['inset-inline-start', 'background-color'],
  })
  assert.equal(
    read('duration-150 duration-300 transition-colors', { reduceMotion: false })?.duration,
    300,
  )
})

test('motion-reduce and motion-safe parts follow the setting, as the media query does', () => {
  assert.deepEqual(read(thumb, { reduceMotion: true })?.properties, ['color', 'background-color'])
  assert.equal(
    read('transition-colors motion-safe:duration-300', { reduceMotion: false })?.duration,
    300,
  )
  assert.equal(
    read('transition-colors motion-safe:duration-300', { reduceMotion: true })?.duration,
    150,
  )
})

test('no transition-property is no transition, whatever else the string says', () => {
  assert.equal(read('duration-300 ease-out p-4', { reduceMotion: false }), undefined)
  assert.equal(read('transition-colors transition-none', { reduceMotion: false }), undefined)
  assert.equal(read('', { reduceMotion: false }), undefined)
  assert.equal(read(undefined, { reduceMotion: false }), undefined)
})
