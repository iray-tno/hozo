import assert from 'node:assert/strict'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. A class behind a JS guard (`on && 'p-2'`) had its write's
// condition checked as a selector, found none in Tailwind's plain rule, and
// kept the whole class list in authored order. A guard decides presence, not
// selection: when it holds, Tailwind's order decides between the classes, so
// `cx('p-4', on && 'p-2')` is 16px either way, as `p-4 p-2` is.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const names = ['p-4', 'p-2', 'px-3', 'px-4', 'text-sm', 'bg-red-500', 'bg-blue-500']

async function setup() {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return {
    final: prepareFinalTailwindContext(JSON.stringify(prepared.snapshot)),
    compiler: createCompiler(),
  }
}
const source = (args: string) => `import {View, cx} from '@hozo/core'
export const A = ({ on }: { on: boolean }) => <View className={cx(${args})} />`

test('a guarded class settles against its unguarded neighbours in Tailwind order', async () => {
  const { final, compiler } = await setup()
  for (const [a, b] of [
    ["'p-4'", "on && 'p-2'"],
    ["'bg-red-500 px-4'", "on && 'bg-blue-500 px-3 text-sm'"],
  ]) {
    const web = [`${a}, ${b}`, `${b}, ${a}`].map(
      (args) => compiler.prepareWebModule(source(args)).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, [], a)
    // Only the guard's class name differs: it carries the guard's source offset.
    const plain = (css: string) => css.replace(/hozo-[\w-]+/g, '')
    assert.equal(plain(web[0]!.css), plain(web[1]!.css), a)
    const native = [`${a}, ${b}`, `${b}, ${a}`].map(
      (args) => compiler.prepareNativeModule(source(args)).emit(final).components[0]!,
    )
    const named = (styles: string) => styles.replace(/_cond_\d+_\d+/g, '_cond')
    assert.equal(named(native[0]!.styles), named(native[1]!.styles), a)
  }
})

test('the unguarded p-4 is emitted after the guarded p-2, so it wins when both apply', async () => {
  const { final, compiler } = await setup()
  const web = compiler.prepareWebModule(source("on && 'p-2', 'p-4'")).emit(final)[0]!
  const guarded = web.css.indexOf('padding-top: 8px')
  const plain = web.css.indexOf('padding-top: 16px')
  assert.ok(guarded >= 0 && plain > guarded, web.css)
  assert.match(web.css.slice(0, plain), /:where\(\./)
  // Native's style array: the guarded object first, so the base replaces it.
  const native = compiler.prepareNativeModule(source("'p-4', on && 'p-2'")).emit(final)
    .components[0]!
  const array = /style=\{\[([^\]]*)\]\}/.exec(native.jsx)?.[1] ?? native.jsx
  assert.ok(
    array.indexOf('_cond') >= 0 && array.indexOf('_cond') < array.lastIndexOf('hozo0'),
    array,
  )
})
