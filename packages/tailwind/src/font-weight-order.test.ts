import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { loadTheme, prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const source = (classes: string, primitive = 'Text') =>
  `import {${primitive}} from '@hozo/core';export const A=()=> <${primitive} className="${classes}"/>`
const cssFor = (bold: string) =>
  `@theme {--spacing:.25rem;--app-bold:${bold};--font-weight-bold:var(--app-bold);--font-weight-normal:300;} @tailwind utilities;`
function resolve(code: string) {
  return runInNewContext(
    `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}\nhozoClasses`,
    { createClassResolver },
  )
}

test('named font weights resolve the captured theme without rewriting explicit StyleX or semantic weights', async () => {
  const theme = await loadTheme(cssFor('900'), base)
  assert.deepEqual(
    theme.fontWeights?.find(({ name }) => name === 'bold'),
    { name: 'bold', value: '900' },
  )
  const compiler = createCompiler(theme)
  assert.match(compiler.compile(source('font-bold'))[0]!.css, /font-weight: 900/)
  assert.match(
    compiler.compileNativeModule(source('font-bold')).components[0]!.styles,
    /fontWeight: '900'/,
  )
  const stylex = `import * as stylex from '@stylexjs/stylex';import {Text} from '@hozo/core';const s=stylex.create({label:{fontWeight:700}});export const A=()=> <Text {...stylex.props(s.label)}/>`
  assert.match(compiler.compileNativeModule(stylex).components[0]!.styles, /fontWeight: '700'/)
  assert.match(
    compiler.compileNativeModule(`import {Strong} from '@hozo/core';export const A=()=> <Strong/>`)
      .components[0]!.styles,
    /fontWeight: '700'/,
  )
})

test('font registrations are not owner declarations, and static/generated maps share their actual font winners', async () => {
  const names = [
    'font-bold',
    'font-normal',
    'focus:font-normal',
    'active:font-bold',
    'hover:focus:font-normal',
    'p-4',
    'p-2',
  ]
  for (const bold of ['700', '900']) {
    const css = cssFor(bold)
    const theme = await loadTheme(css, base)
    const prepared = await prepareTailwindOrder(css, base, names)
    const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
    const plan = cache.renderNativeModulePlan(context, theme)
    assert.ok(plan.entries.every((entry) => entry.groups.every((group) => group.orderable)))
    for (const entry of plan.entries)
      for (const group of entry.groups) {
        for (const write of group.writes)
          assert.ok(write.cssProperty !== 'syntax' && write.cssProperty !== 'inherits')
      }
    const resolver = resolve(plan.code)
    assert.equal(Object.assign({}, ...resolver('font-bold')).fontWeight, bold)
    assert.equal(
      Object.assign(
        {},
        ...resolver('focus:font-normal active:font-bold', { focused: true, pressed: true }),
      ).fontWeight,
      bold,
    )
    assert.equal(
      Object.assign(
        {},
        ...resolver('active:font-bold hover:focus:font-normal', {
          hovered: true,
          focused: true,
          pressed: true,
        }),
      ).fontWeight,
      '300',
    )
    const compiler = createCompiler(theme)
    for (const classes of ['font-bold font-normal p-4 p-2', 'p-2 p-4 font-normal font-bold']) {
      const web = compiler.prepareWebModule(source(classes)).emit(context)[0]!
      assert.match(web.css, /font-weight: 300/)
      assert.match(web.css, /padding-top: 16px/)
      const native = compiler.prepareNativeModule(source(classes)).emit(context).components[0]!
      assert.match(native.styles, /fontWeight: '300'/)
      assert.match(native.styles, /paddingTop: 16/)
    }
  }
})

test('equivalent CSS numeric and keyword spellings normalize to valid Native weights without rounding', async () => {
  for (const [value, expected] of [
    ['900.0', '900'],
    ['9e2', '900'],
    ['bold', '700'],
    ['normal', '400'],
  ]) {
    const compiler = createCompiler(await loadTheme(cssFor(value!), base))
    const native = compiler.compileNativeModule(source('font-bold')).components[0]!
    assert.equal(native.diagnostics.length, 0)
    assert.ok(native.styles.includes(`fontWeight: '${expected}'`))
  }
})

test('unrepresentable theme weights remain correct CSS but are diagnosed for actual Native owners and fallback maps', async () => {
  for (const value of ['650', 'var(--missing)']) {
    const theme = await loadTheme(cssFor(value), base)
    const compiler = createCompiler(theme)
    assert.ok(compiler.compile(source('font-bold'))[0]!.css.includes(`font-weight: ${value}`))
    const native = compiler.compileNativeModule(source('font-bold')).components[0]!
    assert.ok(
      native.diagnostics.some(
        (entry) => entry.message.includes('font-weight') && entry.message.includes(value),
      ),
    )
    assert.doesNotMatch(native.styles, /fontWeight:/)
    const slot = compiler.compileNativeModule(
      `import {Avatar} from '@hozo/core';export const A=()=> <Avatar fallbackClassName="font-bold"/>`,
    ).components[0]!
    assert.ok(
      slot.diagnostics.some(
        (entry) => entry.message.includes('font-weight') && entry.message.includes(value),
      ),
    )
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', '"font-bold"', 0)
    const code = cache.renderNativeModule(theme)
    const generated = runInNewContext(
      `${code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\n({styles,unsupported})`,
      { createClassResolver: () => {} },
    )
    assert.equal(generated.styles['font-bold'], undefined)
    assert.match(generated.unsupported['font-bold'], /font-weight/)
  }
})

test('unknown hoisted CSS is still a whole-input barrier, not treated as a property registration', async () => {
  const css = cssFor('700')
  const theme = await loadTheme(css, base)
  const compiler = createCompiler(theme)
  const names = ['font-bold', 'font-normal', 'p-4', 'p-2']
  const prepared = await prepareTailwindOrder(css, base, names)
  for (const mode of ['rule', 'descriptor']) {
    const data = structuredClone(prepared.snapshot)
    const rule = data.candidates.find((entry) => entry.candidate === 'font-bold')!.rules[0]!
    assert.equal(rule.shape.kind, 'rule')
    if (rule.shape.kind !== 'rule') throw new Error('expected actual utility rule')
    const registration = rule.shape.nodes.find((node) => node.kind === 'at-root')!
    if (registration.kind !== 'at-root') throw new Error('expected actual hoisted definition')
    if (mode === 'rule')
      registration.nodes.push({
        kind: 'rule',
        selector: 'body',
        nodes: [{ kind: 'declaration', property: 'color', important: false }],
      })
    else {
      const definition = registration.nodes[0]!
      if (definition.kind !== 'at-rule') throw new Error('expected property definition')
      definition.nodes.push({ kind: 'declaration', property: 'color', important: false })
    }
    const context = prepareFinalTailwindContext(JSON.stringify(data))
    const result = compiler
      .prepareWebModule(source('font-bold font-normal p-4 p-2'))
      .emit(context)[0]!
    assert.match(result.css, /padding-top: 8px/)
    const cache = openCandidateCache()
    cache.scanFile('runtime.ts', JSON.stringify(names.join(' ')), 0)
    const plan = cache.renderNativeModulePlan(context, theme)
    assert.ok(
      plan.entries
        .find((entry) => entry.candidate === 'font-bold')!
        .groups.every((group) => !group.orderable),
    )
  }
})
