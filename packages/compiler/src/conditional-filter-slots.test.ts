import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { compileNative } from './index.ts'
import { generatedRuntimeImports } from './lower.ts'

function flatten(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.assign({}, ...value.map(flatten))
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

function compiled(
  classes: string,
  caller = '',
  component = 'Pressable',
  diagnosticCodes: string[] = [],
) {
  const result = compileNative(`import { ${component} } from '@hozo/core'
export function C() { return <${component} className="${classes}" ${caller} /> }`)[0]!
  assert.deepEqual(
    result.diagnostics.map(({ code }) => code),
    diagnosticCodes,
    JSON.stringify(result.diagnostics),
  )
  const start = result.jsx.indexOf('style={') + 7
  assert.ok(start > 6, result.jsx)
  let end = start
  let depth = 1
  for (; end < result.jsx.length; end++) {
    if (result.jsx[end] === '{') depth++
    if (result.jsx[end] === '}' && --depth === 0) break
  }
  const styles = new Function(`return (${result.styles})`)()
  const evaluate = new Function(
    'hozoStyles',
    'hozoFilterStyles',
    'hozoTransformStyles',
    '__hozoBp_md',
    '__hozoDark',
    `return (${result.jsx.slice(start, end)})`,
  )
  return {
    result,
    style(md = false, hovered = false, dark = false, composer = hozoFilterStyles, pressed = false) {
      const value = evaluate(styles, composer, hozoTransformStyles, md, dark)
      return flatten(
        typeof value === 'function' ? value({ hovered, pressed, focused: false }) : value,
      )
    },
  }
}

test('independently active Native filter conditions compose and restore', () => {
  for (const classes of ['md:blur-lg hover:sepia', 'hover:sepia md:blur-lg']) {
    const probe = compiled(classes)
    assert.equal(probe.style().filter, undefined)
    assert.equal(probe.style(true).filter, 'blur(16px)')
    assert.equal(probe.style(false, true).filter, 'sepia(100%)')
    assert.equal(probe.style(true, true).filter, 'blur(16px) sepia(100%)')
    assert.equal(probe.style(true).filter, 'blur(16px)')
    assert.notEqual(
      probe.style(true, true, false, (styles) => styles.flat(Infinity)).filter,
      'blur(16px) sepia(100%)',
    )
    assert.match(
      generatedRuntimeImports(probe.result.runtimeImports),
      /@hozo\/core\/generated\/filter-slots/,
    )
  }
})

test('a copied base cannot overwrite another active condition register', () => {
  const probe = compiled('blur-sm md:blur-lg hover:sepia')
  assert.equal(probe.style(false, true).filter, 'blur(8px) sepia(100%)')
  assert.equal(probe.style(true, true).filter, 'blur(16px) sepia(100%)')
})

test('unranked owner filter runs compose independent functions in authored order', () => {
  for (const [base, resting] of [
    ['blur-sm', 'blur(8px)'],
    ['filter-none', 'none'],
  ]) {
    const probe = compiled(
      `${base} hover:blur-lg active:blur-xl active:sepia-50 hover:sepia columns-(--layout)`,
      '',
      'Pressable',
      ['WEB_ONLY_PROPERTY_ON_NATIVE'],
    )
    assert.equal(probe.style().filter, resting, base)
    assert.equal(probe.style(false, true).filter, 'blur(16px) sepia(100%)', base)
    assert.equal(
      probe.style(false, false, false, undefined, true).filter,
      'blur(24px) sepia(50%)',
      base,
    )
    assert.equal(
      probe.style(false, true, false, undefined, true).filter,
      'blur(24px) sepia(100%)',
      base,
    )
    assert.equal(probe.style(false, true).filter, 'blur(16px) sepia(100%)', base)
    assert.equal(probe.style().filter, resting, base)
  }
})

test('whole-chain reset yields to later slot writes without losing registers', () => {
  const probe = compiled('blur-sm md:filter-none hover:sepia')
  assert.equal(probe.style(true).filter, 'none')
  assert.equal(probe.style(true, true).filter, 'blur(8px) sepia(100%)')
  assert.equal(probe.style().filter, 'blur(8px)')
})

test('a plain shadow can share authored owner runs without reordering filter writes', () => {
  const probe = compiled(
    'hover:blur-lg active:blur-xl active:sepia-50 hover:sepia hover:shadow-sm columns-(--layout)',
    '',
    'Pressable',
    ['WEB_ONLY_PROPERTY_ON_NATIVE'],
  )
  const both = probe.style(false, true, false, undefined, true)
  assert.equal(both.filter, 'blur(24px) sepia(100%)')
  assert.match(String(both.boxShadow), /^0 1px 3px 0 /)
  assert.equal(probe.style(false, false, false, undefined, true).boxShadow, undefined)
  assert.ok(!probe.result.runtimeImports.includes('hozoShadowStyles'))
})

test('plain box shadows can revisit a guard without loading a slot composer', () => {
  const probe = compiled(
    'shadow-sm hover:shadow-md active:shadow-sm hover:shadow-lg columns-(--layout)',
    '',
    'Pressable',
    ['WEB_ONLY_PROPERTY_ON_NATIVE'],
  )
  assert.match(String(probe.style(false, true, false, undefined, true).boxShadow), /^0 10px 15px /)
  assert.match(String(probe.style().boxShadow), /^0 1px 3px /)
  assert.ok(!probe.result.runtimeImports.includes('hozoShadowStyles'))
})

test('shadow modifiers keep the folded base shadow in the unranked path', () => {
  const probe = compiled(
    'shadow-sm hover:shadow-md active:opacity-50 hover:shadow-red-500 columns-(--layout)',
    '',
    'Pressable',
    ['WEB_ONLY_PROPERTY_ON_NATIVE'],
  )
  const both = probe.style(false, true, false, undefined, true)
  assert.match(String(both.boxShadow), /^0 4px 6px -1px #fb2c36/)
  assert.equal(both.opacity, 0.5)
  assert.ok(!probe.result.runtimeImports.includes('hozoShadowStyles'))
})

test('transform composition and caller style keep their own precedence', () => {
  const probe = compiled('blur-sm translate-x-2 md:sepia md:translate-y-3')
  assert.deepEqual(probe.style(true), {
    filter: 'blur(8px) sepia(100%)',
    transform: [{ translateX: 8 }, { translateY: 12 }],
  })
  const caller = compiled('blur-sm md:sepia', "style={{ filter: 'contrast(20%)', opacity: 0.5 }}")
  assert.equal(caller.style(true).filter, 'contrast(20%)')
  assert.equal(caller.style(true).opacity, 0.5)
})

test('same-function and unconditional filters retain their direct ahead-of-time path', () => {
  for (const classes of ['blur-sm sepia', 'blur-sm md:blur-lg', 'md:blur-lg hover:blur-sm']) {
    assert.ok(!compiled(classes).result.runtimeImports.includes('hozoFilterStyles'))
  }
})

test('drop-shadow colour and animation boundaries retain their existing paths', () => {
  for (const classes of [
    'drop-shadow-sm md:blur-lg hover:sepia',
    'drop-shadow-red-500 blur-sm md:sepia',
  ]) {
    assert.ok(!compiled(classes).result.runtimeImports.includes('hozoFilterStyles'))
  }
  const animated = compiled('transition bg-white dark:bg-black blur-sm md:sepia', '', 'View')
  assert.ok(animated.result.runtimeImports.includes('HozoAnimated'))
  assert.ok(!animated.result.runtimeImports.includes('hozoFilterStyles'))
})
