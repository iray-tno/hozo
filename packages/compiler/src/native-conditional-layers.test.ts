import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { compileNative } from './index.ts'

// #1230. Each condition's Native style object carried one whole `boxShadow`
// and one whole `filter`, and the later object replaced the earlier, so
// `md:blur-sm grayscale` lost the grayscale at md. The base writes are now
// folded into the conditional object.
function styleExpression(jsx: string): string {
  const start = jsx.indexOf('style={') + 'style={'.length
  assert.ok(start >= 'style={'.length, jsx)
  let depth = 1
  for (let index = start; index < jsx.length; index++) {
    if (jsx[index] === '{') depth++
    if (jsx[index] === '}' && --depth === 0) return jsx.slice(start, index)
  }
  throw new Error(`Missing style expression: ${jsx}`)
}

function compiled(classes: string) {
  const result = compileNative(`import { View } from '@hozo/core'
export function C() { return <View className="${classes}" /> }`)[0]!
  assert.deepEqual(result.diagnostics, [], JSON.stringify(result.diagnostics))
  const styles = new Function(`return (${result.styles})`)()
  const evaluate = new Function(
    'hozoStyles',
    'hozoTransformStyles',
    'hozoFilterStyles',
    '__hozoBp_md',
    `return (${styleExpression(result.jsx)})`,
  )
  const flat = (value: unknown): Record<string, unknown> =>
    Array.isArray(value)
      ? Object.assign({}, ...value.map(flat))
      : value && typeof value === 'object'
        ? (value as Record<string, unknown>)
        : {}
  return (md: boolean) => flat(evaluate(styles, undefined, hozoFilterStyles, md))
}

test('a conditional filter keeps the base functions', () => {
  const style = compiled('md:blur-sm grayscale')
  assert.equal(style(false).filter, 'grayscale(100%)')
  assert.equal(style(true).filter, 'blur(8px) grayscale(100%)')
})

test('a conditional ring keeps the base shadow, and a conditional colour repaints it', () => {
  const ring = compiled('md:ring-2 shadow-sm')
  assert.doesNotMatch(String(ring(false).boxShadow), /0 0 0 2px/)
  assert.match(String(ring(true).boxShadow), /0 0 0 2px/)
  assert.match(String(ring(true).boxShadow), /0 1px 3px 0/)
  const color = compiled('md:shadow-red-500 shadow-lg')
  assert.match(String(color(true).boxShadow), /0 10px 15px -3px/)
  assert.notEqual(color(true).boxShadow, color(false).boxShadow)
})

test('a condition overriding the same function still wins', () => {
  const style = compiled('md:blur-lg blur-sm')
  assert.equal(style(false).filter, 'blur(8px)')
  assert.equal(style(true).filter, 'blur(16px)')
})

test('a conditional gradient constructor keeps the base stops, and a conditional stop the base constructor', () => {
  const direction = compiled('md:bg-linear-to-b bg-linear-to-r from-red-500')
  assert.match(String(direction(false).backgroundImage), /^linear-gradient\(to right/)
  assert.match(String(direction(true).backgroundImage), /^linear-gradient\(to bottom/)
  assert.match(String(direction(true).backgroundImage), /oklch|#|rgb/)
  const stop = compiled('md:from-blue-500 bg-linear-to-r from-red-500')
  assert.match(String(stop(true).backgroundImage), /^linear-gradient\(to right/)
  assert.notEqual(stop(true).backgroundImage, stop(false).backgroundImage)
  const none = compiled('md:bg-none bg-linear-to-r from-red-500')
  assert.equal(none(true).backgroundImage, 'none')
})
