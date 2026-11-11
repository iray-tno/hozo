import assert from 'node:assert/strict'
import test from 'node:test'
import { hozoShadowStyles } from '../../engine/src/shadow-slots.ts'
import { compileNative } from './index.ts'

function flat(style: unknown): Record<string, unknown> {
  return Array.isArray(style)
    ? Object.assign({}, ...style.map(flat))
    : style && typeof style === 'object'
      ? (style as Record<string, unknown>)
      : {}
}

function compile(classes: string, caller = '') {
  const result = compileNative(
    `import {Pressable} from '@hozo/core';export const C=()=> <Pressable className="${classes}" ${caller}/>`,
  )[0]!
  assert.deepEqual(result.diagnostics, [])
  return result
}

function selected(classes: string, caller = '') {
  const result = compile(classes, caller)
  const start = result.jsx.indexOf('style={') + 7
  assert.ok(start > 6, result.jsx)
  let depth = 1
  let end = start
  for (; end < result.jsx.length; end++) {
    if (result.jsx[end] === '{') depth++
    if (result.jsx[end] === '}' && --depth === 0) break
  }
  const styles = new Function(`return (${result.styles})`)()
  const evaluate = new Function(
    'hozoStyles',
    'hozoShadowStyles',
    '__hozoBp_md',
    `return (${result.jsx.slice(start, end)})`,
  )
  return (md: boolean, hovered: boolean, composer = hozoShadowStyles) => {
    const value = evaluate(styles, composer, md)
    return flat(
      typeof value === 'function' ? value({ hovered, pressed: false, focused: false }) : value,
    )
  }
}

test('independently active shadow colour and ring width compose in both input orders', () => {
  for (const classes of [
    'shadow-sm md:ring-2 hover:shadow-red-500',
    'hover:shadow-red-500 md:ring-2 shadow-sm',
  ]) {
    const read = selected(classes)
    const base = selected('shadow-sm')(false, false).boxShadow
    assert.equal(read(false, false).boxShadow, base)
    assert.equal(read(true, false).boxShadow, selected('shadow-sm ring-2')(false, false).boxShadow)
    assert.equal(
      read(false, true).boxShadow,
      selected('shadow-sm shadow-red-500')(false, false).boxShadow,
    )
    assert.equal(
      read(true, true).boxShadow,
      selected('shadow-sm ring-2 shadow-red-500')(false, false).boxShadow,
    )
    assert.notEqual(
      read(true, true, (styles) => [...styles] as ReturnType<typeof hozoShadowStyles>).boxShadow,
      read(true, true).boxShadow,
    )
    assert.equal(read(false, false).boxShadow, base)
  }
})

test('shadow reset clears only the outer layer, not an independently selected ring or inset', () => {
  const read = selected('shadow-sm inset-shadow-sm md:ring-2 hover:shadow-none')
  assert.equal(
    read(true, true).boxShadow,
    selected('inset-shadow-sm ring-2 shadow-none')(false, false).boxShadow,
  )
  assert.equal(
    read(true, false).boxShadow,
    selected('inset-shadow-sm ring-2 shadow-sm')(false, false).boxShadow,
  )
})

test('modifier-only state has no paint and an explicit caller shadow retains precedence', () => {
  assert.equal(selected('md:shadow-sm hover:shadow-red-500')(false, true).boxShadow, undefined)
  assert.equal(
    selected('shadow-sm md:ring-2 hover:shadow-red-500', "style={{boxShadow:'none'}}")(true, true)
      .boxShadow,
    'none',
  )
})

test('no helper for the literal, single-condition, or same-field replacement path', () => {
  for (const classes of [
    'shadow-sm',
    'shadow-sm hover:ring-2',
    'shadow-sm md:shadow-lg hover:shadow-none',
  ]) {
    assert.ok(!compile(classes).runtimeImports.includes('hozoShadowStyles'), classes)
  }
})
