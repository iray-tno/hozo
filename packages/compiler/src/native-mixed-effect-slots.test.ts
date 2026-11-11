import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { hozoAuthoredStyle } from '../../engine/src/authored-gap.ts'
import { type ClassResolver, createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'
import { hozoShadowStyles } from '../../engine/src/shadow-slots.ts'
import { compileNative, openCandidateCache } from './index.ts'

function moduleFor(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  const code = cache.renderNativeModule()
  const resolve = runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoGradientStyles, hozoShadowStyles },
  ) as ClassResolver
  return { resolve, code }
}

function fixture(tag: 'View' | 'Pressable', literal: string, spread = '') {
  return compileNative(
    `import {${tag}} from '@hozo/core';import clsx from 'clsx';export const C=({classes,style,props})=> <${tag} className={clsx('${literal}', classes)} ${spread} style={style}/>`,
  )[0]!
}

function selected(tag: 'View' | 'Pressable', literal: string) {
  const result = fixture(tag, literal)
  assert.deepEqual(
    result.diagnostics.map((entry) => entry.code),
    ['DYNAMIC_CLASS_NAME_NOT_RESOLVED'],
  )
  const start = result.jsx.indexOf('style={') + 7
  assert.ok(start > 6, result.jsx)
  let depth = 1
  let end = start
  for (; end < result.jsx.length; end++) {
    if (result.jsx[end] === '{') depth++
    if (result.jsx[end] === '}' && --depth === 0) break
  }
  const evaluate = new Function(
    'hozoStyles',
    'hozoClasses',
    'hozoShadowStyles',
    'hozoGradientStyles',
    'hozoAuthoredStyle',
    'classes',
    'style',
    `return (${result.jsx.slice(start, end)})`,
  )
  const compiled = new Function(`return (${result.styles})`)()
  return (resolver: ClassResolver, classes: string, hovered = false, style?: unknown) => {
    const value = evaluate(
      compiled,
      resolver,
      hozoShadowStyles,
      hozoGradientStyles,
      hozoAuthoredStyle,
      classes,
      style,
    )
    return [
      typeof value === 'function' ? value({ hovered, pressed: false, focused: false }) : value,
    ].flat(Infinity)
  }
}

test('a single drawable candidate can join a static shadow without a candidate composer import', () => {
  const { resolve, code } = moduleFor(['ring-2'])
  const read = selected('View', 'shadow-sm')
  assert.doesNotMatch(code, /generated\/shadow-slots/)
  assert.match(
    Object.assign({}, ...read(resolve, 'ring-2')).boxShadow,
    /^0 0 0 2px currentcolor, 0 1px 3px 0 rgb\(/,
  )
  assert.equal(Object.assign({}, ...resolve('ring-2')).boxShadow, '0 0 0 2px currentcolor')
  assert.equal(
    Object.assign({}, ...read(resolve, 'ring-2', false, { boxShadow: 'none' })).boxShadow,
    'none',
  )
  const opaque = read(resolve, 'ring-2', false, 42)
  assert.equal(opaque.at(-1), 42)
  assert.match(Object.assign({}, ...opaque).boxShadow, /^0 0 0 2px currentcolor, 0 1px/)
})

test('mixed shadow composition preserves owner-state tiers and unrelated dynamic gradients', () => {
  const { resolve } = moduleFor([
    'ring-2',
    'shadow-blue-500',
    'hover:shadow-green-500',
    'bg-linear-to-r',
    'from-red-500',
  ])
  const read = selected('Pressable', 'shadow-sm hover:shadow-red-500')
  const dynamic = 'ring-2 shadow-blue-500 hover:shadow-green-500 bg-linear-to-r from-red-500'
  const rest = Object.assign({}, ...read(resolve, dynamic))
  assert.match(rest.boxShadow, /^0 0 0 2px currentcolor, 0 1px 3px 0 #2b7fff,/)
  const active = Object.assign({}, ...read(resolve, dynamic, true))
  assert.match(active.boxShadow, /^0 0 0 2px currentcolor, 0 1px 3px 0 #fb2c36,/)
  assert.match(active.backgroundImage, /^linear-gradient\(to right, #fb2c36/)
  assert.deepEqual(Object.assign({}, ...read(resolve, dynamic)), rest)
  assert.doesNotMatch(
    Object.assign({}, ...resolve(dynamic, { hovered: false })).boxShadow,
    /1px 3px/,
  )
})

test('static modifiers can paint dynamic constructors; unrelated literals and spreads do not defer', () => {
  const { resolve } = moduleFor(['shadow-sm'])
  const read = selected('View', 'shadow-red-500')
  assert.equal(Object.assign({}, ...read(resolve, '')).boxShadow, undefined)
  assert.match(Object.assign({}, ...read(resolve, 'shadow-sm')).boxShadow, /#fb2c36/)
  assert.doesNotMatch(fixture('View', 'p-4').jsx, /shadowSlots|'shadow'/)
  assert.doesNotMatch(fixture('View', 'shadow-sm', '{...props}').jsx, /shadowSlots|'shadow'/)
})

test('deferred cached base retains original identities and does not mutate the normal result', () => {
  const { resolve } = moduleFor(['shadow-sm', 'shadow-red-500', 'ring-2'])
  const names = 'shadow-sm shadow-red-500 ring-2'
  const ordinary = resolve(names)
  const deferred = resolve(names, undefined, 1)
  assert.notEqual(deferred, ordinary)
  assert.equal(resolve(names, undefined, 1), deferred)
  assert.equal(resolve(names), ordinary)
  assert.ok(deferred.every((style) => resolve.shadowSlots?.has(style)))
  assert.equal(ordinary.length, deferred.length + 1)
})

test('mixed gradients read static and dynamic constructors and stops in either direction', () => {
  const dynamicStops = moduleFor(['to-blue-500', 'to-80%'])
  const staticImage = selected('View', 'bg-linear-to-r from-red-500 from-25%')
  assert.equal(
    Object.assign({}, ...staticImage(dynamicStops.resolve, 'to-blue-500 to-80%')).backgroundImage,
    'linear-gradient(to right, #fb2c36 25%, #2b7fff 80%)',
  )
  const dynamicImage = moduleFor(['bg-linear-to-r'])
  assert.doesNotMatch(dynamicImage.code, /generated\/gradient-slots/)
  const staticStops = selected('View', 'from-red-500 to-blue-500')
  assert.equal(
    Object.assign({}, ...staticStops(dynamicImage.resolve, 'bg-linear-to-r')).backgroundImage,
    'linear-gradient(to right, #fb2c36 0%, #2b7fff 100%)',
  )
  assert.equal(
    Object.assign(
      {},
      ...staticStops(dynamicImage.resolve, 'bg-linear-to-r', false, { backgroundImage: 'none' }),
    ).backgroundImage,
    'none',
  )
})

test('shadow and gradient can defer together while preserving owner states and ordinary caches', () => {
  const names = [
    'ring-2',
    'hover:shadow-green-500',
    'bg-linear-to-r',
    'hover:bg-linear-to-b',
    'to-blue-500',
  ]
  const { resolve } = moduleFor(names)
  const read = selected('Pressable', 'shadow-sm bg-linear-to-r from-red-500')
  const classes = names.join(' ')
  const rest = Object.assign({}, ...read(resolve, classes))
  assert.match(rest.boxShadow, /^0 0 0 2px currentcolor, 0 1px 3px 0 rgb\(/)
  assert.equal(rest.backgroundImage, 'linear-gradient(to right, #fb2c36 0%, #2b7fff 100%)')
  const active = Object.assign({}, ...read(resolve, classes, true))
  assert.match(active.boxShadow, /^0 0 0 2px currentcolor, 0 1px 3px 0 #00c950,/)
  assert.equal(active.backgroundImage, 'linear-gradient(to bottom, #fb2c36 0%, #2b7fff 100%)')
  const premature = Object.assign(
    (value: unknown, state: Parameters<ClassResolver>[1]) => resolve(value, state),
    resolve,
  )
  assert.notEqual(
    Object.assign({}, ...read(premature, classes, true)).backgroundImage,
    active.backgroundImage,
  )
  assert.deepEqual(Object.assign({}, ...read(resolve, classes)), rest)
  const idle = { hovered: false }
  const ordinary = resolve(classes, idle)
  const deferred = resolve(classes, idle, 3)
  assert.notEqual(deferred, ordinary)
  assert.equal(resolve(classes, idle, 3), deferred)
  assert.equal(resolve(classes, idle), ordinary)
})
