import assert from 'node:assert/strict'
import test from 'node:test'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { compileNative } from './index.ts'

function flat(value: unknown): Record<string, unknown> {
  return Array.isArray(value)
    ? Object.assign({}, ...value.map(flat))
    : value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {}
}

function compiled(classes: string, caller = '') {
  const result = compileNative(
    `import {Pressable} from '@hozo/core';export const C=()=> <Pressable className="${classes}" ${caller}/>`,
  )[0]!
  assert.deepEqual(result.diagnostics, [])
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
    'hozoGradientStyles',
    'hozoFilterStyles',
    'hozoTransformStyles',
    '__hozoBp_md',
    '__hozoDark',
    `return (${result.jsx.slice(start, end)})`,
  )
  const styles = new Function(`return (${result.styles})`)()
  return {
    result,
    value(md = false, hovered = false, composer = hozoGradientStyles) {
      const output = evaluate(styles, composer, hozoFilterStyles, hozoTransformStyles, md, false)
      return flat(
        typeof output === 'function'
          ? output({ hovered, focused: false, pressed: false, focusVisible: false })
          : output,
      )
    },
  }
}

function literal(classes: string): string {
  const result = compileNative(
    `import {View} from '@hozo/core';export const C=()=> <View className="${classes}"/>`,
  )[0]!
  assert.deepEqual(result.diagnostics, [])
  const styles = new Function(`return (${result.styles})`)()
  return Object.assign({}, ...Object.values(styles)).backgroundImage
}

test('independent direction and colour conditions compose without reviving a copied base', () => {
  const base = 'bg-linear-to-r from-red-500 to-blue-500'
  for (const suffix of [
    'md:bg-linear-to-b hover:from-green-500',
    'hover:from-green-500 md:bg-linear-to-b',
  ]) {
    const probe = compiled(`${base} ${suffix}`)
    assert.equal(probe.value().backgroundImage, literal(base))
    assert.equal(
      probe.value(true).backgroundImage,
      literal('bg-linear-to-b from-red-500 to-blue-500'),
    )
    assert.equal(
      probe.value(false, true).backgroundImage,
      literal('bg-linear-to-r from-green-500 to-blue-500'),
    )
    assert.equal(
      probe.value(true, true).backgroundImage,
      literal('bg-linear-to-b from-green-500 to-blue-500'),
    )
    assert.equal(probe.value().backgroundImage, literal(base))
    assert.notEqual(
      probe.value(true, true, (styles) => [...styles] as ReturnType<typeof hozoGradientStyles>)
        .backgroundImage,
      probe.value(true, true).backgroundImage,
    )
  }
})

test('positions and via reset remain independent from a constructor change', () => {
  const base = 'bg-radial from-red-500 via-green-500 to-blue-500'
  const probe = compiled(`${base} md:from-25% hover:via-none`)
  assert.equal(
    probe.value(true, true).backgroundImage,
    literal('bg-radial from-red-500 from-25% to-blue-500'),
  )
  assert.equal(probe.value(true).backgroundImage, literal(`${base} from-25%`))
  assert.equal(probe.value().backgroundImage, literal(base))
})

test('stop-only conditions wait for a constructor instead of inventing an image', () => {
  const probe = compiled('md:bg-linear-to-r hover:from-red-500')
  assert.equal(probe.value(false, true).backgroundImage, undefined)
  assert.equal(probe.value(true, true).backgroundImage, literal('bg-linear-to-r from-red-500'))
})

test('caller image wins while independent filter and transform registers still compose', () => {
  const classes =
    'bg-linear-to-r from-red-500 md:bg-linear-to-b hover:to-blue-500 blur-sm md:sepia translate-x-2 md:translate-y-3'
  const probe = compiled(classes)
  assert.equal(
    probe.value(true, true).backgroundImage,
    literal('bg-linear-to-b from-red-500 to-blue-500'),
  )
  assert.equal(probe.value(true, true).filter, 'blur(8px) sepia(100%)')
  assert.deepEqual(probe.value(true, true).transform, [{ translateX: 8 }, { translateY: 12 }])
  assert.equal(
    compiled(classes, "style={{backgroundImage:'caller'}}").value(true, true).backgroundImage,
    'caller',
  )
})

test('a single conditional group keeps the direct base-folding path', () => {
  for (const classes of [
    'bg-linear-to-r from-red-500',
    'bg-linear-to-r from-red-500 hover:to-blue-500',
    'bg-linear-to-r md:bg-linear-to-b hover:bg-radial',
  ]) {
    assert.ok(!compiled(classes).result.runtimeImports.includes('hozoGradientStyles'))
  }
})

test('animation endpoints and conic gradients retain their existing boundaries', () => {
  const animated = compileNative(
    'import {View} from \'@hozo/core\';export const C=()=> <View className="transition bg-white dark:bg-black bg-linear-to-r md:from-red-500 dark:to-blue-500"/>',
  )[0]!
  assert.ok(animated.runtimeImports.includes('HozoAnimated'))
  assert.ok(!animated.runtimeImports.includes('hozoGradientStyles'))
  const conic = compileNative(
    'import {Pressable} from \'@hozo/core\';export const C=()=> <Pressable className="bg-conic md:from-red-500 hover:to-blue-500"/>',
  )[0]!
  assert.ok(
    conic.diagnostics.some((diagnostic) => diagnostic.code === 'WEB_ONLY_PROPERTY_ON_NATIVE'),
  )
  assert.ok(!conic.runtimeImports.includes('hozoGradientStyles'))
})
