import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createClassResolver, hozoTextMetricStyles } from '../../engine/src/class-resolver.ts'
import { hozoFilterStyles } from '../../engine/src/filter-slots.ts'
import { hozoGradientStyles } from '../../engine/src/gradient-slots.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { compileNative, openCandidateCache } from './index.ts'

function fixture(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 1)
  const code = cache.renderNativeModule()
  let calls = 0
  const execute = (compose = hozoGradientStyles) =>
    runInNewContext(
      `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
      {
        createClassResolver,
        hozoTextMetricStyles,
        hozoFilterStyles,
        hozoTransformStyles,
        hozoGradientStyles: (...args: Parameters<typeof hozoGradientStyles>) => {
          calls++
          return compose(...args)
        },
      },
    ) as ReturnType<typeof createClassResolver>
  return { code, resolve: execute(), execute, count: () => calls }
}
const flat = (styles: object[]) => Object.assign({}, ...styles.flat(Infinity))

test('candidate colour and position writes survive as independent gradient registers', () => {
  const names = ['bg-linear-to-r', 'from-red-500', 'from-25%', 'to-blue-500', 'to-80%']
  const { resolve, execute } = fixture(names)
  const expected = compileNative(
    `import {View} from '@hozo/core';export const C=()=> <View className="${names.join(' ')}"/>`,
  )[0]!
  const image = flat(Object.values(new Function(`return (${expected.styles})`)())).backgroundImage
  for (const classes of [names, names.toReversed()]) {
    assert.equal(flat(resolve(classes.join(' '))).backgroundImage, image)
    assert.equal(resolve(classes.join(' ')), resolve(classes.join(' ')))
    assert.notEqual(
      flat(
        execute((styles) => [...styles] as ReturnType<typeof hozoGradientStyles>)(
          classes.join(' '),
        ),
      ).backgroundImage,
      image,
    )
  }
})

test('state-only constructors combine with selected stop writers and restore inactive results', () => {
  const { code, resolve } = fixture([
    'hover:bg-radial',
    'focus:from-red-500',
    'hover:focus:to-blue-500',
  ])
  assert.match(code, /states\["focus:from-red-500"\]\[0\]\[1\]/)
  const names = 'hover:bg-radial focus:from-red-500 hover:focus:to-blue-500'
  assert.equal(flat(resolve(names, { hovered: false, focused: true })).backgroundImage, undefined)
  assert.match(
    flat(resolve(names, { hovered: true, focused: true })).backgroundImage,
    /radial-gradient\(.*#fb2c36.*#2b7fff/,
  )
  assert.match(
    flat(resolve(names, { hovered: true, focused: false })).backgroundImage,
    /#0000 0%, #0000 100%/,
  )
  assert.equal(flat(resolve(names, { hovered: false, focused: true })).backgroundImage, undefined)
})

test('none images and via-none retain independent registers for later constructors', () => {
  const { resolve } = fixture([
    'bg-linear-to-r',
    'hover:bg-radial',
    'from-red-500',
    'via-green-500',
    'focus:via-none',
    'bg-none',
  ])
  assert.equal(flat(resolve('bg-linear-to-r from-red-500 bg-none')).backgroundImage, 'none')
  const image = flat(
    resolve('from-red-500 via-green-500 bg-none focus:via-none hover:bg-radial', {
      hovered: true,
      focused: true,
    }),
  ).backgroundImage
  assert.match(image, /radial-gradient\(.*#fb2c36.*#0000 100%/)
  assert.doesNotMatch(image, /50%/)
})

test('gradient composition preserves filter, transform and text metadata identities', () => {
  const { resolve } = fixture([
    'bg-linear-to-r',
    'from-red-500',
    'blur-sm',
    'sepia',
    'translate-x-2',
    'translate-y-3',
    'text-sm',
    'leading-8',
  ])
  const value = flat(
    resolve(
      'bg-linear-to-r from-red-500 blur-sm sepia translate-x-2 translate-y-3 leading-8 text-sm',
    ),
  )
  assert.match(value.backgroundImage, /#fb2c36/)
  assert.equal(value.filter, 'blur(8px) sepia(100%)')
  assert.equal(
    JSON.stringify(value.transform),
    JSON.stringify([{ translateX: 8 }, { translateY: 12 }]),
  )
  assert.equal(value.lineHeight, 32)
})

test('plain selected strings bypass composition and constructor-only maps keep their direct path', () => {
  const { resolve, count } = fixture(['p-4', 'bg-linear-to-r', 'from-red-500'])
  resolve('p-4')
  assert.equal(count(), 0)
  for (const names of [['p-4'], ['bg-linear-to-r', 'bg-radial']])
    assert.doesNotMatch(fixture(names).code, /gradient-slots|const gradients/)
  assert.equal(flat(fixture(['from-red-500']).resolve('from-red-500')).backgroundImage, undefined)
})

test('the real dynamic Pressable callback consumes the composed candidate result', () => {
  const { resolve } = fixture(['bg-linear-to-r', 'hover:from-red-500'])
  const result = compileNative(
    `import {Pressable} from '@hozo/core';export const C=({classes})=> <Pressable className={classes}/>`,
  )[0]!
  assert.deepEqual(
    result.diagnostics.map((d) => d.code),
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
  const expression = result.jsx.slice(start, end)
  const callback = new Function('hozoClasses', 'classes', `return (${expression})`)(
    resolve,
    'bg-linear-to-r hover:from-red-500',
  )
  assert.match(flat(callback({ hovered: true })).backgroundImage, /#fb2c36/)
  assert.doesNotMatch(flat(callback({ hovered: false })).backgroundImage, /#fb2c36/)
})

test('responsive, dark, conic and raw CSS image candidates retain their refusal boundary', () => {
  const { code } = fixture([
    'md:from-red-500',
    'dark:from-red-500',
    'bg-conic',
    'bg-[url(test.png)]',
  ])
  assert.match(code, /"md:from-red-500": .*conditional/)
  assert.match(code, /"dark:from-red-500": .*conditional/)
  assert.match(code, /"bg-conic": .*Web-only/)
  assert.match(code, /"bg-\[url\(test.png\)\]": .*Web-only/)
  assert.doesNotMatch(code, /gradient-slots/)
})
