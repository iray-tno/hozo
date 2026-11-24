import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import {
  createClassResolver,
  hozoMixedTextMetricStyles,
  hozoRelativeTextMetricStyles,
  hozoTextMetricStyles,
} from '../../engine/src/class-resolver.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

// #1230. Ratio leading (`leading-tight`) and em tracking (`tracking-wide`)
// had no ownership entry, so an input with one kept its authored order:
// `leading-tight leading-loose` took the loose line where Tailwind keeps
// `leading-tight`. Native turns the winner into pixels against the font size
// after ordering, as it did before.
const css = '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;'
const inputs = [
  ['text-lg', 'leading-tight', 'leading-loose'],
  ['text-lg', 'leading-tight', 'leading-6'],
  ['text-lg', 'leading-tight', 'leading-normal'],
  ['text-lg', 'leading-none', 'leading-snug'],
  ['text-lg', 'tracking-wide', 'tracking-tight'],
  ['text-lg', 'tracking-wide', 'tracking-[2px]'],
  ['text-lg', 'md:leading-loose', 'leading-tight'],
  ['text-sm', 'md:text-xl', 'leading-tight'],
]
const source = (classes: string) =>
  `import {Text} from '@hozo/core';export const A=()=> <Text className="${classes}">a</Text>`

async function context(names: string[]) {
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  return prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
}

test('relative leading and tracking settle in Tailwind order, whichever is written first', async () => {
  const compiler = createCompiler()
  const final = await context([...new Set(inputs.flat())])
  for (const input of inputs) {
    const web = [input, input.toReversed()].map(
      (names) => compiler.prepareWebModule(source(names.join(' '))).emit(final)[0]!,
    )
    assert.deepEqual(web[0]!.diagnostics, web[1]!.diagnostics, input.join(' '))
    assert.equal(web[0]!.css, web[1]!.css, input.join(' '))
    assert.equal(web[0]!.jsx, web[1]!.jsx, input.join(' '))
    const native = [input, input.toReversed()].map(
      (names) => compiler.prepareNativeModule(source(names.join(' '))).emit(final).components[0]!,
    )
    assert.deepEqual(native[0]!.diagnostics, native[1]!.diagnostics, input.join(' '))
    assert.equal(native[0]!.styles, native[1]!.styles, input.join(' '))
    assert.equal(native[0]!.jsx, native[1]!.jsx, input.join(' '))
  }
})

test('Native sizes the leading Web keeps against the font size', async () => {
  const compiler = createCompiler()
  const names = ['text-lg', 'leading-tight', 'leading-loose']
  const final = await context(names)
  for (const classes of [
    'text-lg leading-tight leading-loose',
    'text-lg leading-loose leading-tight',
  ]) {
    const web = compiler.prepareWebModule(source(classes)).emit(final)[0]!
    const ratio = Number(/line-height: ([\d.]+);/.exec(web.css)?.[1])
    assert.ok(ratio > 0, web.css)
    const native = compiler.prepareNativeModule(source(classes)).emit(final).components[0]!
    const fontSize = Number(/fontSize: ([\d.]+)/.exec(native.styles)?.[1])
    const lineHeight = Number(/lineHeight: ([\d.]+)/.exec(native.styles)?.[1])
    assert.ok(fontSize > 0, native.styles)
    assert.equal(lineHeight, fontSize * ratio, classes)
  }
})

test('Native Text resolves relative candidates against the final local size', async () => {
  const cases = [
    ['text-lg leading-tight tracking-wide', '{classes}'],
    ['text-xl leading-tight tracking-wide', '{classes}'],
    ['leading-tight tracking-wide', `\`text-lg \${classes}\``],
    ['text-lg leading-loose leading-tight tracking-wide tracking-tight', '{classes}'],
    ['tracking-[2px] tracking-wide leading-6 leading-tight text-lg', '{classes}'],
    ['text-xl leading-[1.25em] tracking-[0.1em]', '{classes}'],
  ]
  const names = cases
    .map(([classes]) => classes!)
    .join(' ')
    .split(' ')
  const final = await context([...new Set(names)])
  const theme = await loadTheme(css, tailwindPackageDir())
  const compiler = createCompiler(theme)
  const cache = openCandidateCache()
  cache.scanFile('candidates.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(final, theme)
  for (const [candidate, key] of [
    ['leading-tight', 'lineHeight'],
    ['tracking-wide', 'letterSpacing'],
    ['leading-[1.25em]', 'lineHeight'],
    ['tracking-[0.1em]', 'letterSpacing'],
  ]) {
    const entry = plan.entries.find((entry) => entry.candidate === candidate)
    assert.deepEqual(entry?.groups[0]?.nativeKeys, [])
    assert.deepEqual(entry?.groups[0]?.compositionKeys, [`relativeText:${key}`])
  }
  const hozoClasses = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
    { createClassResolver, hozoTextMetricStyles },
  )
  const render = (classes: string, attr: string) => {
    const result = compiler
      .prepareNativeModule(
        `import {Text} from '@hozo/core';export const A=({classes})=> <Text className=${attr}>a</Text>`,
      )
      .emit(final).components[0]!
    const style = runInNewContext(
      transformSync(`const hozoStyles=${result.styles};(${result.jsx})`, {
        loader: 'tsx',
        jsxFactory: 'h',
      }).code,
      {
        Text: 'Text',
        classes,
        hozoClasses,
        hozoMixedTextMetricStyles,
        hozoRelativeTextMetricStyles,
        h: (_type: unknown, props: { style: unknown }) => props.style,
      },
    )
    return { jsx: result.jsx, resolved: Object.assign({}, ...[style].flat(Infinity)) }
  }
  for (const [classes, attr] of cases) {
    const literal = attr === '{classes}' ? classes! : `text-lg ${classes}`
    const compiled = render('', JSON.stringify(literal))
    const runtime = render(classes!, attr!.startsWith('`') ? `{${attr}}` : attr!)
    assert.doesNotMatch(compiled.jsx, /hozoRelativeTextMetricStyles/)
    assert.match(runtime.jsx, /hozoRelativeTextMetricStyles/)
    for (const key of ['fontSize', 'lineHeight', 'letterSpacing'])
      assert.equal(runtime.resolved[key], compiled.resolved[key], `${literal} ${key}`)
  }
  assert.deepEqual(render(cases[0]![0]!, '{classes}').resolved, {
    fontSize: 18,
    lineHeight: 22.5,
    letterSpacing: 0.45,
  })
  const em = 'text-xl leading-[1.25em] tracking-[0.1em]'
  assert.deepEqual(render(em, '{classes}').resolved, {
    fontSize: 20,
    lineHeight: 25,
    letterSpacing: 2,
  })
  const web = compiler.prepareWebModule(source(em)).emit(final)[0]!
  assert.match(web.css, /line-height: 1\.25em;/)
  assert.match(web.css, /letter-spacing: 0\.1em;/)
})
