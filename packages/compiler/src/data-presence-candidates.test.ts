import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { openCandidateCache } from './index.ts'

function candidateResolver(names: string[], rtl = false) {
  const cache = openCandidateCache()
  cache.scanFile('Data.tsx', `const classes = ${JSON.stringify(names)}`, 1)
  const module = cache.renderNativeModule()
  const resolve = new Function(
    'createClassResolver',
    'hozoTransformStyles',
    'I18nManager',
    `${module.replace(/^import[^\n]*\n/gm, '').replace(/\bexport /g, '')}\nreturn hozoClasses`,
  )(createClassResolver, hozoTransformStyles, { isRTL: rtl })
  return {
    module,
    resolve,
    flat: (classes: string, facts: object) => Object.assign({}, ...resolve(classes, facts)),
  }
}

test('data presence candidates use explicit owner booleans and keep missing distinct from false', () => {
  const classes = 'p-2 data-[hozo-range-start]:p-4'
  const { flat, resolve } = candidateResolver(classes.split(' '))
  const warnings: string[] = []
  const warn = console.warn
  console.warn = (message) => warnings.push(String(message))
  try {
    assert.equal(flat(classes, { 'data-hozo-range-start': false }).paddingTop, 8)
    assert.equal(warnings.length, 0)
    assert.equal(flat(classes, { 'data-hozo-range-start': true }).paddingTop, 16)
    assert.equal(flat(classes, {}).paddingTop, 8)
    assert.equal(warnings.length, 1)
    assert.match(warnings[0]!, /needs state \(data-hozo-range-start\)/)
    flat(classes, {})
    assert.equal(warnings.length, 1, 'one warning per candidate, not per cell/render')
    assert.equal(resolve('p-2'), resolve('p-2'), 'plain strings retain cached arrays')
  } finally {
    console.warn = warn
  }
})

test('data presence stacks with hover, ARIA, ambient direction and transform composition', () => {
  const classes =
    'rotate-3 data-open:active:scale-95 data-open:aria-selected:border-2 rtl:data-open:p-4'
  for (const rtl of [false, true]) {
    const { flat } = candidateResolver(classes.split(' '), rtl)
    const facts = { 'data-open': true, pressed: true, 'aria-selected': true }
    const active = flat(classes, facts)
    assert.equal(active.borderTopWidth, 2)
    assert.equal(active.paddingTop, rtl ? 16 : undefined)
    assert.deepEqual(active.transform, [{ rotate: '3deg' }, { scaleX: 0.95 }, { scaleY: 0.95 }])
    assert.equal(flat(classes, { ...facts, 'data-open': false }).borderTopWidth, undefined)
    const hover = candidateResolver(['data-[hozo-disabled]:hover:opacity-50'])
    assert.equal(
      hover.flat('data-[hozo-disabled]:hover:opacity-50', {
        'data-hozo-disabled': true,
        hovered: false,
      }).opacity,
      undefined,
    )
    assert.equal(
      hover.flat('data-[hozo-disabled]:hover:opacity-50', {
        'data-hozo-disabled': true,
        hovered: true,
      }).opacity,
      0.5,
    )
  }
})

test('data equality, relations, negation and environment conditions still diagnose instead of guessing', () => {
  const names = [
    'data-[state=closed]:opacity-0',
    'not-data-open:p-4',
    'group-data-open:p-4',
    'md:data-open:p-4',
  ]
  const { module } = candidateResolver(names)
  for (const name of names) {
    assert.ok(module.includes(`${JSON.stringify(name)}: "\`${name}\` is conditional`), module)
  }
})
