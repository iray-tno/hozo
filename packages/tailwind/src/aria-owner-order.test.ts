import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import {
  createCompiler,
  openCandidateCache,
  prepareFinalTailwindContext,
  prepareTailwindContext,
} from '@hozo/compiler'
import { transformSync } from 'esbuild'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { nativeDisabledProps } from '../../primitives/src/native-disabled.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const css = '@theme {--spacing:.25rem;} @tailwind utilities;'
const classes = [
  'p-4',
  'p-2',
  'aria-busy:p-3',
  'aria-checked:p-5',
  'aria-expanded:p-7',
  'aria-selected:p-8',
  'aria-[invalid=true]:p-9',
  'disabled:p-10',
  'aria-disabled:p-11',
  'hover:aria-disabled:p-13',
  'disabled:aria-disabled:p-15',
  'hover:aria-selected:p-12',
  'aria-checked:aria-selected:p-14',
]
const states = ['busy', 'checked', 'expanded', 'selected']

test('positive ARIA facts share original-rule priority in static and generated Native without conflating disabled or pointer state', async () => {
  const compiler = createCompiler()
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), classes)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('aria.ts', JSON.stringify(classes.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context)
  assert.ok(plan.ordering)
  for (const entry of plan.entries) {
    assert.ok(entry.groups.length > 0, entry.candidate)
    assert.ok(
      entry.groups.every((group) => group.orderable),
      entry.candidate,
    )
  }
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
    { createClassResolver },
  )
  let observations = 0
  for (const names of [classes, classes.toReversed()]) {
    const input = `import {Pressable} from '@hozo/core';export const A=({state,invalid,blocked})=> <Pressable accessibilityState={state} aria-invalid={invalid} disabled={blocked} className="${names.join(' ')}"/>`
    const native = compiler.prepareNativeModule(input).emit(context).components[0]!
    assert.equal(native.diagnostics.length, 0, JSON.stringify(native.diagnostics))
    const render = runInNewContext(
      transformSync(
        `const hozoStyles=${native.styles};((state,invalid,blocked)=>(${native.jsx}))`,
        {
          loader: 'tsx',
          jsxFactory: 'h',
        },
      ).code,
      {
        nativeDisabledProps,
        Pressable: 'owner',
        HozoPressable: 'owner',
        h: (_type: unknown, props: unknown) => props,
      },
    )
    for (let mask = 0; mask < 64; mask++) {
      const owner = Object.fromEntries(
        states.map((name, bit) => [name, Boolean(mask & (1 << bit))]),
      )
      owner.disabled = Boolean(mask & 32)
      const invalid = Boolean(mask & 16)
      for (const blocked of [false, true])
        for (const hovered of [false, true]) {
          const facts = {
            ...Object.fromEntries(states.map((name) => [`aria-${name}`, owner[name] === true])),
            'aria-invalid': invalid,
            disabled: blocked || owner.disabled,
            'aria-disabled': blocked || owner.disabled,
            hovered,
            pressed: true,
          }
          const props = render(owner, invalid, blocked)
          const style = typeof props.style === 'function' ? props.style(facts) : props.style
          const actual = Object.assign({}, ...[style].flat(Infinity).filter(Boolean))
          const expected = Object.assign({}, ...resolve(names.join(' '), facts))
          assert.deepEqual(
            JSON.parse(JSON.stringify(actual)),
            JSON.parse(JSON.stringify(expected)),
            `${mask}/${blocked}/${hovered}`,
          )
          observations++
        }
    }
    // Canonical unavailable delivery uses only a literal true state member,
    // not truthy strings. Selector identity remains distinct in assessment.
    for (const owner of [undefined, null, { checked: 'mixed', disabled: 'false' }]) {
      const props = render(owner, 'grammar', false)
      const style =
        typeof props.style === 'function' ? props.style({ hovered: false }) : props.style
      assert.equal(Object.assign({}, ...[style].flat(Infinity).filter(Boolean)).paddingTop, 16)
    }
  }
  assert.equal(observations, 512)
})

test('canonical disabled ordering survives actual static/dynamic action and destination owner delivery', async () => {
  const names = [
    'p-4',
    'p-2',
    'disabled:p-10',
    'aria-disabled:p-11',
    'hover:aria-disabled:p-13',
    'disabled:aria-disabled:p-15',
  ]
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  const cache = openCandidateCache()
  cache.scanFile('disabled-order.ts', JSON.stringify(names.join(' ')), 0)
  const plan = cache.renderNativeModulePlan(context)
  assert.match(plan.fingerprint!, /^scalar-order-v7:/)
  assert.ok(plan.entries.every((entry) => entry.groups.every((group) => group.orderable)))
  const resolve = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')};\nhozoClasses`,
    { createClassResolver },
  )
  const compiler = createCompiler()
  let observations = 0
  for (const primitive of ['Button', 'Pressable', 'Link'])
    for (const ordered of [names, names.toReversed()])
      for (const dynamic of [false, true]) {
        const className = ordered.join(' ')
        const source = `import {${primitive}} from '@hozo/core';export const A=({state,blocked,names})=><${primitive} ${primitive === 'Link' ? 'href="/docs"' : ''} accessibilityState={state} disabled={blocked} className=${dynamic ? '{names}' : JSON.stringify(className)}/>`
        const output = compiler.prepareNativeModule(source).emit(context).components[0]!
        assert.ok(
          output.diagnostics.every((d) => dynamic && d.code === 'DYNAMIC_CLASS_NAME_NOT_RESOLVED'),
          JSON.stringify(output.diagnostics),
        )
        const render = runInNewContext(
          transformSync(
            `const hozoStyles=${output.styles};((state,blocked,names)=>(${output.jsx}))`,
            { loader: 'tsx', jsxFactory: 'h' },
          ).code,
          {
            h: (_type: unknown, props: unknown) => props,
            Pressable: 'owner',
            HozoPressable: 'owner',
            HozoLink: 'owner',
            nativeDisabledProps,
            hozoClasses: resolve,
          },
        )
        for (const blocked of [undefined, false, true])
          for (const state of [
            undefined,
            null,
            { disabled: false, selected: true },
            { disabled: true, selected: true },
          ])
            for (const hovered of [false, true]) {
              const disabled = Boolean(blocked || state?.disabled === true)
              const props = render(state, blocked, className)
              assert.equal(Boolean(props.disabled), disabled)
              assert.equal(Boolean(props.accessibilityState?.disabled), disabled)
              assert.equal(props.accessibilityState?.selected, state?.selected)
              const facts = { disabled, 'aria-disabled': disabled, hovered, pressed: true }
              const actual = Object.assign(
                {},
                ...[typeof props.style === 'function' ? props.style(facts) : props.style]
                  .flat(Infinity)
                  .filter(Boolean),
              )
              const expected = Object.assign({}, ...resolve(className, facts))
              assert.deepEqual(
                JSON.parse(JSON.stringify(actual)),
                JSON.parse(JSON.stringify(expected)),
                `${primitive}/${dynamic}/${blocked}/${state?.disabled}/${hovered}`,
              )
              observations++
            }
      }
  assert.equal(observations, 288)
})

test('unassessed ARIA selectors preserve the complete old input, not guessed priorities', async () => {
  const compiler = createCompiler()
  for (const neighbor of [
    'not-aria-selected:p-8',
    'aria-hidden:p-8',
    'aria-pressed:p-8',
    'not-aria-disabled:p-8',
  ]) {
    const names = ['p-4', 'p-2', neighbor]
    const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
    const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
    const legacy = prepareTailwindContext(JSON.stringify(prepared.snapshot))
    const source = `import {Pressable} from '@hozo/core';export const A=({state})=><Pressable accessibilityState={state} className="${names.join(' ')}"/>`
    assert.deepEqual(
      compiler.prepareWebModule(source).emit(context),
      compiler.prepareWebModule(source).emit(legacy),
    )
    assert.deepEqual(
      compiler.prepareNativeModule(source).emit(context),
      compiler.prepareNativeModule(source).emit(legacy),
    )
    const cache = openCandidateCache()
    cache.scanFile('aria.ts', JSON.stringify(names.join(' ')), 0)
    const entry = cache
      .renderNativeModulePlan(context)
      .entries.find((entry) => entry.candidate === neighbor)!
    assert.ok(
      entry.groups.every((group) => !group.orderable),
      neighbor,
    )
  }
})

test('ARIA ordering creates no callback without readable events and explicit authored style remains last', async () => {
  const compiler = createCompiler()
  const names = ['p-4', 'p-2', 'aria-selected:p-8', 'hover:p-12']
  const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), names)
  const context = prepareFinalTailwindContext(JSON.stringify(prepared.snapshot))
  for (const [primitive, classes, explicit] of [
    ['Pressable', 'p-4 p-2 aria-selected:p-8', false],
    ['View', 'p-4 p-2 aria-selected:p-8 hover:p-12', false],
    ['Pressable', 'p-4 p-2 aria-selected:p-8 hover:p-12', true],
  ] as const) {
    const source = `import {${primitive}} from '@hozo/core';export const A=({state})=><${primitive} accessibilityState={state} className="${classes}" ${explicit ? 'style={{paddingTop:91}}' : ''}/>`
    const native = compiler.prepareNativeModule(source).emit(context).components[0]!
    const render = runInNewContext(
      transformSync(`const hozoStyles=${native.styles};((state)=>(${native.jsx}))`, {
        loader: 'tsx',
        jsxFactory: 'h',
      }).code,
      {
        View: 'View',
        Pressable: 'owner',
        HozoPressable: 'owner',
        nativeDisabledProps,
        h: (_type: unknown, props: unknown) => props,
      },
    )
    for (const selected of [false, true]) {
      const props = render({ selected })
      assert.equal(typeof props.style === 'function', explicit)
      const style = typeof props.style === 'function' ? props.style({ hovered: true }) : props.style
      assert.equal(
        Object.assign({}, ...[style].flat(Infinity).filter(Boolean)).paddingTop,
        explicit ? 91 : selected ? 32 : 16,
      )
    }
    if (primitive === 'View')
      assert.ok(
        native.diagnostics.some((entry) => /no readable interaction state/.test(entry.message)),
      )
    else assert.equal(native.diagnostics.length, 0)
  }
})
