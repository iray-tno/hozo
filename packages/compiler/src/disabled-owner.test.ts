import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { hozoInteractive } from '../../engine/src/interactive.ts'
import { nativeDisabledProps } from '../../primitives/src/native-disabled.ts'
import { createCompiler, openCandidateCache } from './index.ts'

const classes = 'disabled:opacity-50 aria-disabled:p-4 aria-selected:mt-8'
const cache = openCandidateCache()
cache.scanFile('disabled.ts', JSON.stringify(classes), 0)
const module = cache.renderNativeModule()
const resolve = runInNewContext(
  `${module.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
  { createClassResolver },
)

function evaluate(code: string) {
  return runInNewContext(transformSync(code, { loader: 'tsx', jsxFactory: 'h' }).code, {
    h: (_type: unknown, props: unknown) => props,
    Pressable: 'Pressable',
    HozoPressable: 'Pressable',
    HozoLink: 'Link',
    Text: 'Text',
    hozoInteractive,
    hozoClasses: resolve,
    nativeDisabledProps,
  })
}

test('all compiled action/destination owners deliver one effective disabled fact to props, static styles and generated classes', () => {
  const compiler = createCompiler()
  let observations = 0
  for (const primitive of ['Pressable', 'Button', 'Link'])
    for (const handler of [false, true]) {
      for (const mode of ['both', 'state', 'flag'] as const)
        for (const dynamic of [false, true]) {
          const ownClasses = mode === 'flag' ? classes.replace(' aria-selected:mt-8', '') : classes
          const source = `import {${primitive}} from '@hozo/core';export const A=({blocked,state,dynamic,go})=><${primitive} ${primitive === 'Link' ? 'href="/docs"' : ''} ${handler ? `onPress={go} ${primitive === 'Pressable' ? 'accessibilityRole="button"' : ''}` : ''} ${mode !== 'state' ? 'disabled={blocked}' : ''} ${mode !== 'flag' ? 'accessibilityState={state}' : ''} className=${dynamic ? '{dynamic}' : `"${ownClasses}"`}/>`
          const web = compiler.compile(source)[0]!
          const native = compiler.compileNativeModule(source).components[0]!
          assert.ok(
            native.diagnostics.every(
              (d) => dynamic && d.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED',
            ),
            JSON.stringify(native.diagnostics),
          )
          assert.ok((native.jsx.match(/ accessibilityState=/g) ?? []).length <= 1, native.jsx)
          assert.ok((web.jsx.match(/ aria-disabled=/g) ?? []).length <= 1, web.jsx)
          const renderWeb = evaluate(`((blocked,state,dynamic,go)=>(${web.jsx}))`)
          const renderNative = evaluate(
            `const hozoStyles=${native.styles};((blocked,state,dynamic,go)=>(${native.jsx}))`,
          )
          for (const blocked of [undefined, false, true])
            for (const state of [
              undefined,
              null,
              { disabled: false, selected: true, checked: 'mixed' },
              { disabled: true, selected: true, checked: 'mixed' },
            ]) {
              const unavailable = Boolean(
                (mode !== 'state' && blocked) || (mode !== 'flag' && state?.disabled === true),
              )
              const w = renderWeb(blocked, state, ownClasses, () => {})
              const n = renderNative(blocked, state, ownClasses, () => {})
              assert.equal(
                Boolean(w['aria-disabled']),
                unavailable,
                `${primitive}/${handler}/${mode}/web`,
              )
              assert.equal(w['data-hozo-disabled'] !== undefined, unavailable)
              assert.equal(Boolean(n.disabled), unavailable, `${primitive}/${mode}/native`)
              assert.equal(Boolean(n.accessibilityState?.disabled), unavailable)
              if (mode !== 'flag') {
                assert.equal(n.accessibilityState?.selected, state?.selected)
                assert.equal(n.accessibilityState?.checked, state?.checked)
                assert.equal(w['aria-selected'], state?.selected)
              }
              const selected = Object.assign(
                {},
                ...[typeof n.style === 'function' ? n.style({}) : n.style]
                  .flat(Infinity)
                  .filter(Boolean),
              )
              assert.equal(selected.opacity, unavailable ? 0.5 : undefined)
              assert.equal(selected.paddingTop, unavailable ? 16 : undefined)
              assert.equal(selected.marginTop, mode !== 'flag' && state?.selected ? 32 : undefined)
              observations++
            }
        }
    }
  assert.equal(observations, 432)
})

test('Native metadata evaluates each authored state and flag once and preserves the cold path without state', () => {
  const compiler = createCompiler()
  for (const primitive of ['Pressable', 'Button', 'Link']) {
    const source = `import {${primitive}} from '@hozo/core';export const A=({readState,readFlag})=><${primitive} ${primitive === 'Link' ? 'href="/docs"' : ''} accessibilityState={readState()} disabled={readFlag()}/>`
    const output = compiler.compileNativeModule(source).components[0]!
    const render = evaluate(
      `const hozoStyles=${output.styles};((readState,readFlag)=>(${output.jsx}))`,
    )
    const calls: string[] = []
    const state = { disabled: false, selected: true }
    const props = render(
      () => {
        calls.push('state')
        return state
      },
      () => {
        calls.push('flag')
        return true
      },
    )
    assert.deepEqual(calls, ['state', 'flag'])
    assert.equal(props.disabled, true)
    assert.equal(props.accessibilityState.disabled, true)
    assert.equal(props.accessibilityState.selected, true)
    assert.equal(state.disabled, false)
  }
  const ordinary = compiler.compileNativeModule(
    "import {Pressable} from '@hozo/core';export const A=()=> <Pressable/> ",
  ).components[0]!
  assert.ok(!ordinary.runtimeImports.includes('nativeDisabledProps'))
})
