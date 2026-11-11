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
    'hozoAuthoredStyle',
    'classes',
    'style',
    `return (${result.jsx.slice(start, end)})`,
  )
  const compiled = new Function(`return (${result.styles})`)()
  return (resolver: ClassResolver, classes: string, hovered = false, style?: unknown) => {
    const value = evaluate(compiled, resolver, hozoShadowStyles, hozoAuthoredStyle, classes, style)
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
  const deferred = resolve(names, undefined, 'shadow')
  assert.notEqual(deferred, ordinary)
  assert.equal(resolve(names, undefined, 'shadow'), deferred)
  assert.equal(resolve(names), ordinary)
  assert.ok(deferred.every((style) => resolve.shadowSlots?.has(style)))
  assert.equal(ordinary.length, deferred.length + 1)
})
