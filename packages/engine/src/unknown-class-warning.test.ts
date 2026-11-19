// #2073: in development, a name the map lacks warns once, unless the project
// declared it a marker. Without the bundler's call, the resolver stays silent
// about unknown names, as it always was.
import assert from 'node:assert/strict'
import test from 'node:test'
import { createClassResolver } from './class-resolver.ts'

const map = () => createClassResolver({ 'p-4': { padding: 16 } })

test('an unknown name is silent until the bundler switches the warning on', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const hozoClasses = map()
  assert.deepEqual(hozoClasses('p-4 bg-foo-500'), [{ padding: 16 }])
  assert.equal(warn.mock.callCount(), 0)
})

test('a missing name warns once, and declared or Tailwind markers never do', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const hozoClasses = map()
  // Resolved before the call: the cache must not keep it quiet afterwards.
  hozoClasses('p-4 bg-foo-500')
  hozoClasses.warnUnknownClasses?.(['card-title', 'js-*'])
  for (let render = 0; render < 3; render++)
    hozoClasses('p-4 bg-foo-500 card-title js-row group group/item peer')
  hozoClasses('bg-foo-500 m-2')
  assert.deepEqual(
    warn.mock.calls.map((call) => String(call.arguments[0]).match(/`([^`]+)`/)?.[1]),
    ['bg-foo-500', 'm-2'],
  )
  assert.match(String(warn.mock.calls[0]!.arguments[0]), /markerClasses/)
})

test('a name the compiler refused keeps its own reason, not the missing-class one', (t) => {
  const warn = t.mock.method(console, 'warn', () => {})
  const hozoClasses = createClassResolver({}, { 'md:p-4': '`md:p-4` is Web-only.' })
  hozoClasses.warnUnknownClasses?.([])
  hozoClasses('md:p-4')
  assert.deepEqual(
    warn.mock.calls.map((call) => call.arguments[0]),
    ['[hozo] `md:p-4` is Web-only.'],
  )
})
