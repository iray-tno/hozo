import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { compileNative, openCandidateCache } from './index.ts'
import { generatedRuntimeImports } from './lower.ts'

// Execute the emitted style expression, not just the presence of a helper
// name. This catches guarded entries whose slot metadata never reaches RN.
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

function compiledStyle(classes: string, component = 'View') {
  const source = `import { ${component} } from '@hozo/core'
export function C() { return <${component} ${component === 'Pressable' ? 'accessibilityRole="button"' : ''} className="${classes}" /> }`
  const result = compileNative(source)[0]
  assert.ok(result)
  assert.deepEqual(result.diagnostics, [], JSON.stringify(result.diagnostics))
  const styles = new Function(`return (${result.styles})`)()
  const evaluate = new Function(
    'hozoStyles',
    'hozoTransformStyles',
    '__hozoBp_md',
    '__hozoDark',
    `return (${styleExpression(result.jsx)})`,
  )
  return {
    result,
    value: (md = false, dark = false) => evaluate(styles, hozoTransformStyles, md, dark),
  }
}

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten))
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

test('compiled responsive resets preserve unrelated transforms and restore on condition changes', () => {
  for (const [reset, expected] of [
    ['rotate-none', [{ translateX: 8 }, { scaleX: 0.95 }, { scaleY: 0.95 }]],
    ['scale-none', [{ translateX: 8 }, { rotate: '45deg' }]],
    ['translate-none', [{ rotate: '45deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }]],
    [
      'transform-none',
      [{ translateX: 8 }, { rotate: '45deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }],
    ],
  ] as const) {
    const compiled = compiledStyle(`translate-x-2 rotate-45 scale-95 rotate-x-30 md:${reset}`)
    const off = flatten(compiled.value()).transform as object[]
    assert.equal(off.length, 5)
    assert.deepEqual(
      flatten(compiled.value(true)).transform,
      reset === 'transform-none' ? expected : [...expected, { rotateX: '30deg' }],
    )
    assert.deepEqual(flatten(compiled.value()).transform, off)
    assert.match(
      generatedRuntimeImports(compiled.result.runtimeImports),
      /import \{ hozoTransformStyles \} from '@hozo\/core\/generated\/transform-slots'/,
    )
  }
})

test('compiled stacked guards and Pressable callbacks keep their state-local reset', () => {
  const compiled = compiledStyle(
    'rotate-45 scale-95 md:hover:rotate-none pressed:scale-none',
    'Pressable',
  )
  const value = compiled.value(true) as (state: object) => unknown
  assert.equal(typeof value, 'function')
  assert.deepEqual(flatten(value({ hovered: true, focused: false, pressed: false })).transform, [
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.deepEqual(flatten(value({ hovered: false, focused: false, pressed: true })).transform, [
    { rotate: '45deg' },
  ])
  assert.deepEqual(flatten(value({ hovered: true, focused: false, pressed: true })).transform, [])
})

test('compiled scale resets retain Z registers but a later 2D scale does not apply Z', () => {
  const compiled = compiledStyle('scale-z-50 md:scale-x-75 hover:scale-none', 'Pressable')
  const normal = compiled.value() as (state: object) => unknown
  const wide = compiled.value(true) as (state: object) => unknown
  const matrix = { matrix: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 1] }
  assert.deepEqual(flatten(normal({ hovered: false })).transform, [matrix])
  assert.deepEqual(flatten(wide({ hovered: false })).transform, [{ scaleX: 0.75 }])
  assert.deepEqual(flatten(wide({ hovered: true })).transform, [])
  assert.deepEqual(flatten(normal({ hovered: false })).transform, [matrix])
})

test('compiled transform-cpu restores function registers without disturbing standalone rotate', () => {
  const compiled = compiledStyle('rotate-45 rotate-x-30 md:transform-none dark:transform-cpu')
  assert.deepEqual(flatten(compiled.value(true)).transform, [{ rotate: '45deg' }])
  assert.deepEqual(flatten(compiled.value(true, true)).transform, [
    { rotate: '45deg' },
    { rotateX: '30deg' },
  ])
})

test('unconditional controls stay ahead-of-time and GPU hints remain diagnosed', () => {
  const compiled = compiledStyle('rotate-45 rotate-none scale-95')
  assert.ok(!compiled.result.runtimeImports.includes('hozoTransformStyles'))
  assert.deepEqual(flatten(compiled.value()).transform, [{ scale: 0.95 }])
  const result = compileNative(
    `import { View } from '@hozo/core'; function C() { return <View className="transform-gpu" /> }`,
  )[0]
  assert.ok(result.diagnostics.some((d) => d.code === 'WEB_ONLY_PROPERTY_ON_NATIVE'))
})

test('generated dynamic candidate modules execute the same resets and restore axis registers', () => {
  const cache = openCandidateCache()
  cache.scanFile(
    'Dynamic.tsx',
    `const variants = ['rotate-45', 'scale-95', 'rotate-none', 'translate-y-3', 'translate-none', 'translate-x-2', 'transform-cpu']; const cx = () => variants.join(' ')`,
    1,
  )
  const module = cache.renderNativeModule()
  assert.match(module, /const transforms = new Map\(/)
  assert.match(module, /@hozo\/core\/generated\/transform-slots/)
  const executable = module.replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '')
  const resolve = new Function(
    'createClassResolver',
    'hozoTransformStyles',
    `${executable}\nreturn hozoClasses`,
  )(createClassResolver, hozoTransformStyles)
  assert.deepEqual(flatten(resolve('rotate-45 scale-95 rotate-none')).transform, [
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.deepEqual(flatten(resolve('translate-y-3 translate-none')).transform, [])
  assert.deepEqual(flatten(resolve('translate-y-3 translate-none translate-x-2')).transform, [
    { translateX: 8 },
    { translateY: 12 },
  ])
  assert.equal(resolve('rotate-45 scale-95 rotate-none'), resolve('rotate-45 scale-95 rotate-none'))
})

test('ordinary generated candidate maps do not import or run the slot composer', () => {
  const cache = openCandidateCache()
  cache.scanFile('Plain.tsx', `const variants = ['rotate-45', 'scale-95', 'p-4']`, 1)
  assert.doesNotMatch(cache.renderNativeModule(), /hozoTransformStyles|transform-slots/)
})
