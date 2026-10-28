import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareFinalTailwindContext } from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { nativeDisabledProps } from '../../primitives/src/native-disabled.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const names = [
  'p-4',
  'p-2',
  'aria-selected:p-6',
  'aria-checked:p-5',
  'not-aria-busy:p-3',
  'not-aria-checked:p-5',
  'not-aria-expanded:p-7',
  'not-aria-selected:p-8',
  'not-aria-[invalid=true]:p-9',
  'not-aria-disabled:p-11',
  'hover:not-aria-selected:p-12',
  'aria-checked:not-aria-selected:p-14',
  'not-aria-checked:not-aria-selected:p-16',
  'disabled:not-aria-selected:p-17',
]
const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
const flatten = (style: unknown) => Object.assign({}, ...[style].flat(Infinity).filter(Boolean))

test('negated boolean ARIA retains original order and polarity in static and dynamic Native owners', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('negative.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context)
  assert.match(plan.fingerprint, /^scalar-order-v8:/)
  for (const entry of plan.entries) {
    assert.ok(entry.groups.length > 0, entry.candidate)
    assert.ok(
      entry.groups.every((group) => group.orderable),
      entry.candidate,
    )
  }
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};hozoClasses`,
    { createClassResolver },
  )
  let observations = 0
  for (const ordered of [names, names.toReversed()])
    for (const dynamic of [false, true]) {
      const classes = ordered.join(' ')
      const source = `import {Button} from '@hozo/core';export const A=({state,invalid,blocked,names})=><Button accessibilityState={state} aria-invalid={invalid} disabled={blocked} className=${dynamic ? '{names}' : JSON.stringify(classes)}/>`
      const native = compiler.prepareNativeModule(source).emit(context).components[0]!
      assert.ok(
        native.diagnostics.every((d) => dynamic && d.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
        JSON.stringify(native.diagnostics),
      )
      const render = runInNewContext(
        transformSync(
          `const hozoStyles=${native.styles};((state,invalid,blocked,names)=>(${native.jsx}))`,
          { loader: 'tsx', jsxFactory: 'h' },
        ).code,
        {
          h: (_type: unknown, props: unknown) => props,
          Pressable: 'owner',
          HozoPressable: 'owner',
          nativeDisabledProps,
          hozoClasses: resolve,
        },
      )
      const observe = (
        state: Record<string, unknown> | null | undefined,
        invalid: unknown,
        blocked: boolean,
        hovered: boolean,
      ) => {
        const fields = ['busy', 'checked', 'expanded', 'selected', 'disabled']
        const disabled = Boolean(blocked || state?.disabled === true)
        const facts = {
          ...Object.fromEntries(fields.map((key) => [`aria-${key}`, state?.[key] === true])),
          'aria-disabled': disabled,
          'aria-invalid': String(invalid) === 'true',
          disabled,
          hovered,
          pressed: true,
        }
        const props = render(state, invalid, blocked, classes)
        const style = typeof props.style === 'function' ? props.style(facts) : props.style
        assert.deepEqual(
          JSON.parse(JSON.stringify(flatten(style))),
          JSON.parse(JSON.stringify(flatten(resolve(classes, facts)))),
        )
        assert.equal(Boolean(props.disabled), disabled)
      }
      for (let mask = 0; mask < 64; mask++)
        for (const blocked of [false, true])
          for (const hovered of [false, true]) {
            const state = Object.fromEntries(
              ['busy', 'checked', 'expanded', 'selected', 'disabled'].map((key, bit) => [
                key,
                Boolean(mask & (1 << bit)),
              ]),
            )
            observe(state, Boolean(mask & 32), blocked, hovered)
            observations++
          }
      for (const state of [undefined, null, { checked: 'mixed', selected: false, disabled: false }])
        observe(state, 'grammar', false, false)
    }
  assert.equal(observations, 1024)
})

test('negating a missing Native driver remains a diagnostic, not an unconditional style', async () => {
  const compiler = createCompiler()
  const classes = ['p-4', 'not-aria-selected:p-8']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), classes)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const native = compiler
    .prepareNativeModule(
      `import {View} from '@hozo/core';export const A=()=> <View className="${classes.join(' ')}"/>`,
    )
    .emit(context).components[0]!
  assert.ok(
    native.diagnostics.some((d) => /cannot be resolved/.test(d.message)),
    JSON.stringify(native.diagnostics),
  )
  const props = runInNewContext(
    transformSync(`const hozoStyles=${native.styles};(${native.jsx})`, {
      loader: 'tsx',
      jsxFactory: 'h',
    }).code,
    { h: (_type: unknown, props: unknown) => props, View: 'View' },
  )
  assert.notEqual(typeof props.style, 'function')
  assert.equal(flatten(props.style).paddingTop, 16)
})
