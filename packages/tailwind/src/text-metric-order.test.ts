import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { createClassResolver, hozoTextMetricStyles } from '../../engine/src/class-resolver.ts'
import { hozoTransformStyles } from '../../engine/src/transform-slots.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = `${readFileSync(path.join(base, 'theme.css'), 'utf8')}\n@tailwind utilities;`
const groups = [
  ['text-xl', 'text-lg'],
  ['text-lg', 'leading-6'],
  ['text-lg', 'hover:text-xl', 'focus:leading-6', 'active:text-2xl'],
  ['text-lg', 'focus:leading-6', 'active:leading-8', 'hover:focus:text-3xl'],
  ['text-lg', 'tracking-[2px]', 'tracking-[1px]'],
]

test('absolute text metrics use one shared order and preserve explicit leading across font-default state changes', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const names = [...new Set([...groups.flat(), 'p-4', 'p-2'])]
  const prepared = await prepareTailwindOrder(css, base, names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context, theme)
  assert.ok(
    plan.entries.every((entry) => entry.groups.every((group) => group.orderable)),
    JSON.stringify(plan.entries),
  )
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
    { createClassResolver, hozoTextMetricStyles },
  )
  for (const [index, group] of groups.entries()) {
    for (const classes of [
      [...group, 'p-4', 'p-2'],
      ['p-2', 'p-4', ...group.toReversed()],
    ].map((names) => names.join(' '))) {
      const source = `import {Pressable} from '@hozo/core';export const A=()=> <Pressable className="${classes}"/>`
      const native = compiler.prepareNativeModule(source).emit(context).components[0]!
      const props = runInNewContext(
        transformSync(`const hozoStyles=${native.styles};(${native.jsx})`, {
          loader: 'tsx',
          jsxFactory: 'h',
        }).code,
        {
          Pressable: 'owner',
          HozoPressable: 'owner',
          h: (_type: unknown, props: Record<string, unknown>) => props,
        },
      )
      for (const hovered of [false, true])
        for (const focused of [false, true])
          for (const pressed of [false, true]) {
            const state = { hovered, focused, pressed }
            const style = typeof props.style === 'function' ? props.style(state) : props.style
            const label =
              typeof props.hozoTextStyle === 'function'
                ? props.hozoTextStyle(state)
                : props.hozoTextStyle
            const selected = Object.assign({}, ...[style, label].flat(Infinity).filter(Boolean))
            const dynamic = Object.assign({}, ...resolve(classes, state))
            assert.deepEqual(
              JSON.parse(JSON.stringify(selected)),
              JSON.parse(JSON.stringify(dynamic)),
              `${index}/${classes}/${JSON.stringify(state)}`,
            )
            assert.equal(selected.paddingTop, 16)
            if (index === 2 && focused) assert.equal(selected.lineHeight, 24)
            if (index === 3 && (focused || pressed))
              assert.equal(selected.lineHeight, pressed ? 32 : 24)
          }
    }
  }
})

test('secondary and nested text owners share the same absolute-metric plan and explicit style remains outside it', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const classes = 'text-lg text-xl leading-6'
  const prepared = await prepareTailwindOrder(css, base, classes.split(' '))
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const source = `import {View,Text,Avatar} from '@hozo/core';export const A=()=> <View><Avatar fallbackClassName="${classes}"/><Text className="${classes}" style={{lineHeight:41}}>Label</Text></View>`
  const native = compiler.prepareNativeModule(source).emit(context).components[0]!
  assert.equal(native.diagnostics.length, 0)
  const owners: Record<string, Record<string, unknown>> = {}
  runInNewContext(
    transformSync(`const hozoStyles=${native.styles};(${native.jsx})`, {
      loader: 'tsx',
      jsxFactory: 'h',
    }).code,
    {
      View: 'View',
      Text: 'Text',
      HozoAvatar: 'Avatar',
      h: (type: string, props: Record<string, unknown>) => (owners[type] = props),
    },
  )
  assert.equal((owners.Avatar!.fallbackStyle as Record<string, unknown>).fontSize, 20)
  assert.equal((owners.Avatar!.fallbackStyle as Record<string, unknown>).lineHeight, 24)
  const selected = Object.assign({}, ...[owners.Text!.style].flat(Infinity).filter(Boolean))
  assert.equal(selected.fontSize, 20)
  assert.equal(selected.lineHeight, 41)
  const web = compiler.prepareWebModule(source).emit(context)[0]!
  assert.match(web.css, /font-size: 20px/)
  assert.match(web.css, /--tw-leading: 24px/)
})

test('font-default composition coexists with transform slots on the legacy barrier path', async () => {
  const theme = await loadTheme(css, base)
  const cache = openCandidateCache()
  cache.scanFile('runtime.ts', '"text-lg leading-6 rotate-45"', 0)
  const code = cache.renderNativeModule(theme)
  const resolve = runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
    { createClassResolver, hozoTextMetricStyles, hozoTransformStyles },
  )
  for (const classes of ['text-lg leading-6 rotate-45', 'rotate-45 leading-6 text-lg']) {
    const actual = Object.assign({}, ...resolve(classes))
    assert.equal(actual.fontSize, 18)
    assert.equal(actual.lineHeight, 24)
    assert.ok(actual.transform)
  }
})

test('semantic and unrelated StyleX defaults do not reweight an already canonical metric input', async () => {
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const classes = 'text-lg focus:leading-6 hover:focus:text-3xl'
  const prepared = await prepareTailwindOrder(css, base, classes.split(' '))
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  for (const mixed of [0, 1, 2]) {
    const value = mixed === 2 ? classes.replace('focus:leading-6 ', '') : classes
    const source = `import {Pressable,Strong} from '@hozo/core';${mixed ? `import * as stylex from '@stylexjs/stylex';const styles=stylex.create({own:{color:'red',${mixed === 2 ? "lineHeight:{default:'32px',':focus':'24px'}" : ''}}});` : ''}export const A=()=> <Pressable><Strong ${mixed ? '{...stylex.props(styles.own)}' : ''} className="${value}">Label</Strong></Pressable>`
    const native = compiler.prepareNativeModule(source).emit(context).components[0]!
    assert.equal(native.diagnostics.length, 0, JSON.stringify(native.diagnostics))
    const tree = runInNewContext(
      transformSync(`const hozoStyles=${native.styles};(${native.jsx})`, {
        loader: 'tsx',
        jsxFactory: 'h',
      }).code,
      {
        Pressable: 'owner',
        HozoPressable: 'owner',
        Text: 'text',
        HozoText: 'text',
        h: (type: unknown, props: Record<string, unknown>, ...children: unknown[]) => ({
          type,
          props,
          children,
        }),
      },
    )
    const label = tree.children.find((child: { type?: string }) => child.type === 'text')
    assert.ok(label, native.jsx)
    const style =
      typeof label.props.style === 'function'
        ? label.props.style({ hovered: true, focused: true, pressed: false, focusVisible: false })
        : label.props.style
    const actual = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
    assert.equal(actual.fontSize, 30)
    assert.equal(actual.lineHeight, 24)
    assert.equal(actual.fontWeight, '700')
  }
})

test('projects without an emitted default/explicit leading conflict keep the tiny factory without metric metadata', async () => {
  const theme = await loadTheme(css, base)
  for (const classes of [
    'text-lg text-xl focus:text-2xl',
    'leading-6 p-2',
    'text-lg md:leading-6',
  ]) {
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', JSON.stringify(classes), 0)
    const code = cache.renderNativeModule(theme)
    assert.doesNotMatch(code, /fontDefaults|hozoTextMetricStyles/)
  }
})
