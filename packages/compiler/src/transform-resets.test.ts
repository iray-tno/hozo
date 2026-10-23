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
    `const variants = 'rotate-45 scale-95 rotate-none translate-y-3 translate-none translate-x-2 transform-cpu'`,
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

test('transform-free generated candidate maps do not import or run the slot composer', () => {
  const cache = openCandidateCache()
  cache.scanFile('Plain.tsx', `const variants = 'p-4 bg-blue-500 hover:opacity-50'`, 1)
  assert.doesNotMatch(cache.renderNativeModule(), /hozoTransformStyles|transform-slots/)
})

function candidateResolver(classes: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('States.tsx', `const classes = ${JSON.stringify(classes.join(' '))}`, 1)
  const module = cache.renderNativeModule()
  for (const name of classes) assert.ok(module.includes(`${JSON.stringify(name)}:`), module)
  const executable = module.replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '')
  let compositions = 0
  const resolve = new Function(
    'createClassResolver',
    'hozoTransformStyles',
    `${executable}\nreturn hozoClasses`,
  )(createClassResolver, (...args: Parameters<typeof hozoTransformStyles>) => {
    compositions++
    return hozoTransformStyles(...args)
  })
  return { module, resolve, compositions: () => compositions }
}

test('generated state transforms preserve other CSS families without needing a reset candidate', () => {
  const { resolve } = candidateResolver([
    'rotate-3',
    'active:scale-95',
    'hover:translate-x-2',
    'hover:active:rotate-6',
  ])
  const classes = 'rotate-3 active:scale-95 hover:translate-x-2 hover:active:rotate-6'
  const rest = resolve(classes, { pressed: false, hovered: false })
  assert.deepEqual(flatten(rest).transform, [{ rotate: '3deg' }])
  assert.deepEqual(flatten(resolve(classes, { pressed: true })).transform, [
    { rotate: '3deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.deepEqual(flatten(resolve(classes, { hovered: true })).transform, [
    { translateX: 8 },
    { rotate: '3deg' },
  ])
  assert.deepEqual(flatten(resolve(classes, { pressed: true, hovered: true })).transform, [
    { translateX: 8 },
    { rotate: '6deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.equal(resolve(classes, { pressed: false }), rest, 'inactive state reuses the cached base')
  assert.deepEqual(
    flatten(rest).transform,
    [{ rotate: '3deg' }],
    'state composition did not mutate it',
  )
})

test('conditional candidate resets clear only their family and restore on release', () => {
  const { resolve } = candidateResolver([
    'translate-x-2',
    'rotate-3',
    'scale-95',
    'rotate-x-30',
    'active:scale-none',
    'hover:rotate-none',
    'disabled:transform-none',
  ])
  const classes =
    'translate-x-2 rotate-3 scale-95 rotate-x-30 active:scale-none hover:rotate-none disabled:transform-none'
  const base = resolve(classes, {})
  assert.deepEqual(flatten(base).transform, [
    { translateX: 8 },
    { rotate: '3deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
    { rotateX: '30deg' },
  ])
  assert.deepEqual(flatten(resolve(classes, { pressed: true })).transform, [
    { translateX: 8 },
    { rotate: '3deg' },
    { rotateX: '30deg' },
  ])
  assert.deepEqual(
    flatten(resolve(classes, { pressed: true, hovered: true, disabled: true })).transform,
    [{ translateX: 8 }],
  )
  assert.equal(resolve(classes, {}), base)
})

test('a state-only transform receives slot metadata and a transform-free string bypasses composition', () => {
  const { resolve, compositions } = candidateResolver([
    'active:scale-95',
    'p-4',
    'hover:opacity-50',
  ])
  const plain = resolve('p-4')
  assert.equal(resolve('p-4', { pressed: true }), plain)
  assert.equal(flatten(resolve('p-4 hover:opacity-50', { hovered: true })).opacity, 0.5)
  assert.equal(compositions(), 0, 'unrelated class strings must not allocate a slot composer')
  assert.deepEqual(flatten(resolve('active:scale-95', { pressed: true })).transform, [
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.equal(compositions(), 1)
})

test('unconditional candidate transforms compose once and keep the cached array', () => {
  const { resolve, compositions } = candidateResolver(['rotate-3', 'scale-95', 'p-4'])
  const first = resolve('p-4 rotate-3 scale-95')
  assert.deepEqual(flatten(first).transform, [
    { rotate: '3deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
  assert.equal(resolve('p-4 rotate-3 scale-95'), first)
  assert.equal(compositions(), 1)
  assert.equal(flatten(first).paddingTop, 16)
})

test('composition does not silently admit arbitrary transform lists that remain unsupported on Native', () => {
  const classes = 'rotate-3 transform-[translateX(4px)_rotate(20deg)] active:transform-[scale(.5)]'
  const { resolve, module } = candidateResolver(classes.split(' '))
  const warnings: string[] = []
  const original = console.warn
  console.warn = (message: string) => warnings.push(message)
  try {
    assert.deepEqual(flatten(resolve(classes, { pressed: true })).transform, [{ rotate: '3deg' }])
    assert.equal(warnings.length, 2)
    assert.ok(warnings.some((message) => message.includes('Web-only')))
    assert.ok(warnings.some((message) => message.includes('active:transform-')))
    assert.doesNotMatch(module, /\[states\["active:transform-/)
  } finally {
    console.warn = original
  }
})

test('hover transform-cpu restores registers but active transform-none outranks that restore', () => {
  const classes = 'rotate-3 rotate-x-30 active:transform-none hover:transform-cpu'
  const { resolve } = candidateResolver(classes.split(' '))
  const resting = resolve(classes, {})
  assert.deepEqual(flatten(resting).transform, [{ rotate: '3deg' }, { rotateX: '30deg' }])
  assert.deepEqual(flatten(resolve(classes, { pressed: true })).transform, [{ rotate: '3deg' }])
  assert.deepEqual(flatten(resolve(classes, { pressed: true, hovered: true })).transform, [
    { rotate: '3deg' },
  ])
  assert.deepEqual(flatten(resolve(classes, { pressed: false, hovered: true })).transform, [
    { rotate: '3deg' },
    { rotateX: '30deg' },
  ])
  assert.equal(resolve(classes, {}), resting)
})

test('the compiled dynamic Pressable callback consumes the generated state-transform result', () => {
  const { resolve } = candidateResolver(['rotate-3', 'active:scale-95'])
  const source = `import { Pressable } from '@hozo/core'
export function C({ classes }) { return <Pressable accessibilityRole="button" className={classes} /> }`
  const [output] = compileNative(source)
  assert.ok(output)
  assert.ok(!output.diagnostics.some((diagnostic) => diagnostic.severity === 'error'))
  const style = new Function('hozoClasses', 'classes', `return (${styleExpression(output.jsx)})`)(
    resolve,
    'rotate-3 active:scale-95',
  )
  assert.equal(typeof style, 'function')
  assert.deepEqual(flatten(style({ pressed: true })).transform, [
    { rotate: '3deg' },
    { scaleX: 0.95 },
    { scaleY: 0.95 },
  ])
})
