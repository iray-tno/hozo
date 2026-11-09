import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { createCompiler, prepareFinalTailwindContext } from '@hozo/compiler'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// `shadow-<name>` is a shadow when the theme names one, before a colour of the
// same name -- Tailwind's precedence. The parser has no theme and read
// `shadow-hozo-surface` as the colour `hozo-surface`, so @hozo/ui's Card,
// BottomSheet, Calendar and CodeBlock drew no shadow on either platform.
const uiTheme = readFileSync(new URL('../../ui/src/theme.css', import.meta.url), 'utf8')
const css = `@import "tailwindcss/theme.css" layer(theme); ${uiTheme} @tailwind utilities;`
const source = (classes: string) =>
  `import {View} from '@hozo/core';export const A=()=> <View className="${classes}"/>`
const small = /0 1px 3px 0 rgb\(0 0 0 \/ 0\.1\)/

test('a theme shadow token draws its shadow on Web and Native', async () => {
  const compiler = createCompiler(await loadTheme(css, tailwindPackageDir()))
  const web = compiler.compile(source('shadow-hozo-surface'))[0]!
  assert.match(web.css, /box-shadow: 0 1px 3px 0/)
  const native = compiler.compileNative(source('shadow-hozo-surface'))[0]!
  assert.match(native.styles, /boxShadow: '0 1px 3px 0/)
  // A colour token with no shadow of its name is still a colour.
  const colour = compiler.compile(source('shadow-lg shadow-hozo-accent'))[0]!
  assert.doesNotMatch(colour.css, small)
  assert.match(colour.css, /box-shadow: 0 10px 15px -3px/)
})

test('a theme shadow and a scale shadow settle in Tailwind order', async () => {
  const names = ['shadow-hozo-surface', 'shadow-lg', 'p-2', 'p-4']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const final = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const compiler = createCompiler(await loadTheme(css, tailwindPackageDir()))
  for (const pair of [
    ['shadow-hozo-surface', 'shadow-lg'],
    ['p-4', 'p-2', 'shadow-hozo-surface'],
  ]) {
    const web = [pair, pair.toReversed()].map(
      (order) => compiler.prepareWebModule(source(order.join(' '))).emit(final)[0]!.css,
    )
    assert.equal(web[0], web[1], pair.join(' '))
    const native = [pair, pair.toReversed()].map(
      (order) =>
        compiler.prepareNativeModule(source(order.join(' '))).emit(final).components[0]!.styles,
    )
    assert.equal(native[0], native[1], pair.join(' '))
  }
})
