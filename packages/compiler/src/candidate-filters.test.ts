import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClassResolver, hozoTextMetricStyles } from '../../engine/src/class-resolver.ts'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { compileNative, openCandidateCache } from './index.ts'

function fixture(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  const code = cache.renderNativeModule()
  let compositions = 0
  const execute = (compose = hozoFilterStyles) =>
    runInNewContext(
      `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
      {
        createClassResolver,
        hozoTextMetricStyles,
        hozoTransformStyles,
        hozoFilterStyles: (...args: Parameters<typeof hozoFilterStyles>) => {
          compositions++
          return compose(...args)
        },
      },
    ) as ReturnType<typeof createClassResolver>
  return { code, resolve: execute(), execute, count: () => compositions }
}
const flatten = (styles: object[]) => Object.assign({}, ...styles.flat(Infinity))

test('runtime filter candidates compose in either class order and preserve unconditional caching', () => {
  const { resolve, execute } = fixture(['blur-sm', 'sepia'])
  for (const names of ['blur-sm sepia', 'sepia blur-sm']) {
    assert.equal(flatten(resolve(names)).filter, 'blur(8px) sepia(100%)')
    assert.equal(resolve(names), resolve(names))
    assert.notEqual(
      flatten(execute((styles) => [...styles] as ReturnType<typeof hozoFilterStyles>)(names))
        .filter,
      'blur(8px) sepia(100%)',
    )
  }
})

test('state filters index their actual objects and restore the inactive chain', () => {
  const { code, resolve } = fixture([
    'blur-sm',
    'hover:blur-lg',
    'focus:sepia',
    'hover:focus:invert',
  ])
  assert.match(code, /states\["hover:blur-lg"\]\[0\]\[1\]/)
  const classes = 'blur-sm hover:blur-lg focus:sepia hover:focus:invert'
  assert.equal(flatten(resolve(classes, { hovered: false, focused: false })).filter, 'blur(8px)')
  assert.equal(flatten(resolve(classes, { hovered: true, focused: false })).filter, 'blur(16px)')
  assert.equal(
    flatten(resolve(classes, { hovered: false, focused: true })).filter,
    'blur(8px) sepia(100%)',
  )
  assert.equal(
    flatten(resolve(classes, { hovered: true, focused: true })).filter,
    'blur(16px) invert(100%) sepia(100%)',
  )
  assert.equal(flatten(resolve(classes, { hovered: false, focused: false })).filter, 'blur(8px)')
})

test('a state-only filter map imports composition but plain selected lists bypass it', () => {
  const { code, resolve, count } = fixture(['hover:sepia', 'focus:grayscale', 'p-4'])
  assert.match(code, /generated\/filter-slots/)
  const before = count()
  resolve('p-4')
  resolve('p-4 hover:sepia', { hovered: false })
  assert.equal(count(), before)
  assert.equal(
    flatten(resolve('hover:sepia focus:grayscale', { hovered: true, focused: true })).filter,
    'grayscale(100%) sepia(100%)',
  )
})

test('reset revival keeps registers, without altering other property composers', () => {
  const { resolve } = fixture([
    'blur-sm',
    'filter-none',
    'sepia',
    'translate-x-2',
    'translate-y-3',
    'text-sm',
    'leading-8',
  ])
  assert.equal(flatten(resolve('blur-sm filter-none')).filter, 'none')
  assert.equal(flatten(resolve('blur-sm filter-none sepia')).filter, 'blur(8px) sepia(100%)')
  const value = flatten(
    resolve('blur-sm filter-none sepia translate-x-2 translate-y-3 leading-8 text-sm'),
  )
  assert.equal(value.filter, 'blur(8px) sepia(100%)')
  assert.equal(value.lineHeight, 32)
  assert.equal(
    JSON.stringify(value.transform),
    JSON.stringify([{ translateX: 8 }, { translateY: 12 }]),
  )
})

test('a selected unassessed drop-shadow keeps the complete filter chain on its old path', () => {
  const { resolve, execute, count } = fixture([
    'blur-sm',
    'sepia',
    'drop-shadow-sm',
    'hover:drop-shadow-red-500',
  ])
  const old = execute((styles) => [...styles] as ReturnType<typeof hozoFilterStyles>)
  const before = count()
  for (const names of ['blur-sm drop-shadow-sm sepia', 'sepia drop-shadow-sm blur-sm']) {
    assert.equal(flatten(resolve(names)).filter, flatten(old(names)).filter)
    assert.equal(
      flatten(resolve(`${names} hover:drop-shadow-red-500`, { hovered: true })).filter,
      flatten(old(`${names} hover:drop-shadow-red-500`, { hovered: true })).filter,
    )
  }
  assert.equal(count(), before)
  // Merely scanning a drop-shadow must not disable ordinary selected chains.
  assert.equal(flatten(resolve('blur-sm sepia')).filter, 'blur(8px) sepia(100%)')
})

test('filter-free namespaces have no filter import or metadata', () => {
  assert.doesNotMatch(
    fixture(['p-4', 'bg-blue-500', 'hover:opacity-50']).code,
    /hozoFilterStyles|const filters|filter-slots/,
  )
})

test('single-function namespaces retain direct replacement, even across states and resets', () => {
  const { code, resolve, count } = fixture(['blur-sm', 'hover:blur-lg', 'filter-none'])
  assert.doesNotMatch(code, /hozoFilterStyles|const filters|filter-slots/)
  assert.equal(flatten(resolve('blur-sm hover:blur-lg', { hovered: true })).filter, 'blur(16px)')
  assert.equal(flatten(resolve('blur-sm hover:blur-lg', { hovered: false })).filter, 'blur(8px)')
  assert.equal(flatten(resolve('blur-sm filter-none')).filter, 'none')
  assert.equal(flatten(resolve('filter-none blur-sm')).filter, 'blur(8px)')
  assert.equal(count(), 0)
})

test('the real compiled dynamic Pressable callback receives the composed state chain', () => {
  const { resolve } = fixture(['blur-sm', 'hover:sepia'])
  const result = compileNative(
    `import {Pressable} from '@hozo/core';export const C=({classes})=> <Pressable className={classes}/>`,
  )[0]!
  assert.deepEqual(
    result.diagnostics.map((diagnostic) => diagnostic.code),
    ['DYNAMIC_CLASS_NAME_NOT_RESOLVED'],
  )
  const start = result.jsx.indexOf('style={') + 7
  assert.ok(start > 6, result.jsx)
  let end = start
  let depth = 1
  for (; end < result.jsx.length; end++) {
    if (result.jsx[end] === '{') depth++
    if (result.jsx[end] === '}' && --depth === 0) break
  }
  assert.equal(depth, 0, result.jsx)
  const expression = result.jsx.slice(start, end)
  const callback = new Function('hozoClasses', 'classes', `return (${expression})`)(
    resolve,
    'blur-sm hover:sepia',
  )
  assert.equal(
    flatten(callback({ hovered: true, pressed: false, focused: false })).filter,
    'blur(8px) sepia(100%)',
  )
  assert.equal(
    flatten(callback({ hovered: false, pressed: false, focused: false })).filter,
    'blur(8px)',
  )
})
