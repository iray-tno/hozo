import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import {
  createCompiler,
  openCandidateCache,
  prepareAuthoredTailwindContext,
  prepareBuiltinTailwindContext,
} from './index.ts'

function fixture(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  return cache
}

function resolver(code: string) {
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    { createClassResolver, hozoFilterStyles },
  ) as ReturnType<typeof createClassResolver>
}

const flatten = (styles: object[]) => Object.assign({}, ...styles)

test('ordinary runtime maps use the same built-in ranks as static compiles', () => {
  const names = ['p-2', 'p-4', 'w-2', 'w-4', 'hover:p-2', 'focus:p-4']
  const cache = fixture(names)
  const code = cache.renderNativeModule()
  const final = prepareBuiltinTailwindContext(cache.candidates())
  assert.equal(code, cache.renderNativeModulePlan(final).code)
  const resolve = resolver(code)
  for (const classes of ['p-4 p-2 w-4 w-2', 'w-2 w-4 p-2 p-4']) {
    const actual = flatten(resolve(classes))
    assert.equal(actual.paddingTop, 16, classes)
    assert.equal(actual.width, 16, classes)
    const native = createCompiler().compileNativeModule(
      `import {View} from '@hozo/core';const el=<View className="${classes}"/>`,
    ).components[0]!
    assert.match(native.styles, /paddingTop: 16/)
    assert.match(native.styles, /width: 16/)
  }
  for (const classes of ['focus:p-4 hover:p-2', 'hover:p-2 focus:p-4'])
    assert.equal(flatten(resolve(classes, { focused: true, hovered: true })).paddingTop, 16)
  assert.doesNotMatch(code, /propertyOrder|specificity|fingerprint|scalar-order-v/)
  const theme = { colors: [], spacingPx: 7 }
  assert.equal(flatten(resolver(cache.renderNativeModule(theme))('p-4 p-2')).paddingTop, 28)
})

test('filter-none does not send competing owner states down the authored path', () => {
  const cache = fixture(['active:p-2', 'hover:p-4', 'filter-none'])
  const resolve = resolver(cache.renderNativeModule())
  for (const classes of ['active:p-2 hover:p-4 filter-none', 'hover:p-4 active:p-2 filter-none']) {
    const style = flatten(resolve(classes, { pressed: true, hovered: true }))
    assert.equal(style.paddingTop, 8, classes)
    assert.equal(style.filter, 'none', classes)
  }
})

test('the authored negative control remains distinct from default runtime output', () => {
  const cache = fixture(['p-2', 'p-4'])
  // Use the existing authored test capability, not a new production flag.
  const authored = prepareAuthoredTailwindContext(
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'authored-control',
      fingerprint: 'a'.repeat(64),
      stylesheets: [],
      candidates: cache.candidates().map((candidate, id) => ({
        id,
        candidate,
        status: 'not-generated',
        firstRuleRank: null,
        rules: [],
      })),
    }),
  )
  const reference = resolver(cache.renderNativeModulePlan(authored).code)
  const ordinary = resolver(cache.renderNativeModule())
  assert.equal(flatten(reference('p-4 p-2')).paddingTop, 8)
  assert.equal(flatten(ordinary('p-4 p-2')).paddingTop, 16)
})
