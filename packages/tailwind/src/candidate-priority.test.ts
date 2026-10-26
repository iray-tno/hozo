// Build-time fallback evidence, not proof that static/device winners switched.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createCompiler, openCandidateCache, prepareTailwindContext } from '@hozo/compiler'
import { createClassResolver } from '../../engine/src/class-resolver.ts'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const names = [
  'p-2',
  'focus:p-4',
  'active:p-4',
  'hover:focus:p-4',
  'bg-red-500',
  'active:bg-blue-500',
  'hover:bg-red-500!',
  'rotate-45',
  'rtl:p-2',
  'sm:p-2',
]

function cacheFor(names: string[]) {
  const cache = openCandidateCache()
  cache.scanFile('entry.ts', `export const classes=${JSON.stringify(names.join(' '))}`, 1)
  return cache
}

test('actual candidate objects share original write priorities with static Web and Native plans', async () => {
  const cache = cacheFor(names)
  const prepared = await prepareTailwindOrder(css, base, cache.candidates())
  const context = prepareTailwindContext(JSON.stringify(prepared.snapshot))
  const plan = cache.renderNativeModulePlan(context)
  assert.equal(plan.code, cache.renderNativeModule())
  assert.equal(plan.schema, 1)
  assert.equal(plan.fingerprint, context.fingerprint)
  assert.deepEqual(
    plan.entries.map((entry) => entry.candidate),
    cache.candidates(),
  )
  const entries = new Map(plan.entries.map((entry) => [entry.candidate, entry]))
  // Execute the actual emitted data. This captures resolver arguments, not a
  // substitute resolver whose behavior is claimed to match device merging.
  const generated = runInNewContext(
    `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`,
    {
      createClassResolver: (styles, unsupported, _compose, states) => ({
        styles,
        unsupported,
        states,
      }),
      hozoTransformStyles: () => {
        throw new Error('generation must not resolve a class string')
      },
      I18nManager: { isRTL: false },
    },
  )
  const compiler = createCompiler()
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  compiler.inspectTailwindOrder = () => {
    throw new Error('no extra inspection parse')
  }
  for (const name of names) {
    const entry = entries.get(name)!
    assert.ok(entry, `candidate scan must retain ${name}; got ${cache.candidates().join(', ')}`)
    assert.equal(entry.candidateId, prepared.lookup(name)!.id)
    if (entry.kind === 'refused') {
      assert.ok(generated.unsupported[name])
      assert.ok(entry.reason)
      assert.equal(entry.groups.length, 0)
      assert.equal(generated.styles[name], undefined)
      assert.equal(generated.states[name], undefined)
      continue
    }
    assert.equal(entry.groups.length, 1)
    const group = entry.groups[0]!
    const object =
      entry.kind === 'style' ? generated.styles[name] : generated.states[name][group.index][1]
    assert.ok(object && Object.keys(object).length > 0)
    if (entry.kind === 'state')
      assert.deepEqual(group.stateKeys, Array.from(generated.states[name][group.index][0]))
    else assert.deepEqual(group.stateKeys, [])
    const source = `import {Pressable} from '@hozo/core';const el=<Pressable className=${JSON.stringify(name)}/>`
    const web = compiler.compile(source, undefined, { tailwindPlan: true })[0]!.tailwindPlan!
    const native = compiler.compileNativeModule(source, undefined, undefined, {
      tailwindPlan: true,
    }).components[0]!.tailwindPlan!
    assert.deepEqual(native, web)
    const writes = web.sites.flatMap((site) => site.blocks.flatMap((block) => block.writes))
    assert.deepEqual(group.writes, writes)
    const rank = group.writes[0]?.priorityRank
    if (
      group.writes.length &&
      group.writes.every((write) => write.priorityRank !== undefined && write.priorityRank === rank)
    ) {
      assert.equal(group.priorityRank, rank)
      assert.equal(group.reason, undefined)
    } else {
      assert.equal(group.priorityRank, undefined)
      assert.ok(group.reason)
    }
  }
  assert.equal(entries.get('rotate-45')!.groups[0]!.priorityRank, undefined)
  assert.equal(entries.get('rtl:p-2')!.groups[0]!.priorityRank, undefined)
  assert.deepEqual(entries.get('hover:focus:p-4')!.groups[0]!.stateKeys, ['hovered', 'focused'])
  assert.ok(
    entries.get('active:p-4')!.groups[0]!.priorityRank! <
      entries.get('hover:focus:p-4')!.groups[0]!.priorityRank!,
  )
  assert.equal(entries.get('hover:bg-red-500!')!.kind, 'refused')
  assert.equal(entries.get('hover:bg-red-500!')!.reason, 'important-not-lowered')
  plan.entries[0]!.groups[0]!.priorityRank = 999999
  assert.notEqual(cache.renderNativeModulePlan(context).entries[0]!.groups[0]!.priorityRank, 999999)
})

test('multi-rule candidates retain each write and never borrow a first-rule object priority', async () => {
  // One candidate contributes both overlapping padding rules and disjoint
  // width/height rules. Original rule identities must survive as a sidecar.
  const cache = cacheFor(['p-2', 'size-4'])
  const prepared = await prepareTailwindOrder(
    `${css}
    @utility p-2 { padding: 99px; }
    @utility size-4 { width: 41px; }
    @utility size-4 { height: 42px; }`,
    base,
    cache.candidates(),
  )
  const plan = cache.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  assert.equal(plan.code, cache.renderNativeModule())
  for (const entry of plan.entries) {
    assert.equal(entry.kind, 'style')
    const group = entry.groups[0]!
    assert.equal(group.priorityRank, undefined)
    assert.ok(group.reason)
    assert.ok(group.writes.length > 0)
  }
  const padding = plan.entries.find((entry) => entry.candidate === 'p-2')!
  assert.ok(padding.groups[0]!.writes.every((write) => write.reason === 'ambiguous-property-owner'))
})

test('a sidecar refuses missing context facts before publishing code and retains empty output', async () => {
  const cache = cacheFor(['p-2', 'p-4'])
  const incomplete = await prepareTailwindOrder(css, base, ['p-2'])
  assert.throws(
    () => cache.renderNativeModulePlan(prepareTailwindContext(JSON.stringify(incomplete.snapshot))),
    /did not collect p-4/,
  )
  const empty = cacheFor([])
  const prepared = await prepareTailwindOrder(css, base, [])
  const plan = empty.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  assert.deepEqual(plan.entries, [])
  assert.equal(plan.code, empty.renderNativeModule())
  assert.doesNotMatch(plan.code, /priorityRank|fingerprint|ruleId/)
})

test('empty, small and 256-candidate maps keep all priority sidecar bytes off the device', async (t) => {
  for (const names of [[], ['p-2'], Array.from({ length: 256 }, (_, index) => `p-${index + 1}`)]) {
    const cache = cacheFor(names)
    assert.equal(cache.candidates().length, names.length)
    const prepared = await prepareTailwindOrder(css, base, cache.candidates())
    const plan = cache.renderNativeModulePlan(
      prepareTailwindContext(JSON.stringify(prepared.snapshot)),
    )
    assert.equal(plan.entries.length, names.length)
    assert.equal(plan.code, cache.renderNativeModule())
    assert.doesNotMatch(plan.code, /priorityRank|fingerprint|ruleId/)
    const { code, ...sidecar } = plan
    t.diagnostic(
      JSON.stringify({
        candidates: names.length,
        moduleBytes: Buffer.byteLength(code),
        buildTimeSidecarJsonBytes: Buffer.byteLength(JSON.stringify(sidecar)),
        additionalDeviceBytes: 0,
      }),
    )
  }
})

test('upstream important rules stay recognized facts but never acquire a drawable candidate object', async () => {
  const names = ['p-2!', '!p-2', 'hover:p-2!', 'hover:!p-2', 'bg-red-500!', 'w-[32px]!']
  const cache = cacheFor(names)
  assert.deepEqual(cache.candidates(), [...names].sort())
  const prepared = await prepareTailwindOrder(css, base, [...names, '!hover:p-2'])
  assert.equal(prepared.lookup('!hover:p-2')!.status, 'not-generated')
  for (const name of names) {
    const descriptor = prepared.lookup(name)!
    assert.equal(descriptor.status, 'described')
    assert.ok(descriptor.rules.length > 0)
    assert.ok(descriptor.rules.every((rule) => rule.important))
  }
  const plan = cache.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  assert.equal(plan.code, cache.renderNativeModule())
  assert.equal(plan.entries.length, names.length)
  assert.ok(
    plan.entries.every(
      (entry) =>
        entry.kind === 'refused' &&
        entry.reason === 'important-not-lowered' &&
        entry.groups.length === 0,
    ),
  )
})

test('the compact Rust contract drives a rank-free cached template over the actual generated scalar maps', async () => {
  const names = [
    'p-2',
    'p-4',
    'bg-[#110000]',
    'focus:bg-[#220000]',
    'active:bg-[#330000]',
    'hover:focus:bg-[#440000]',
    'gap-2',
  ]
  const cache = cacheFor(names)
  const prepared = await prepareTailwindOrder(css, base, cache.candidates())
  const plan = cache.renderNativeModulePlan(
    prepareTailwindContext(JSON.stringify(prepared.snapshot)),
  )
  assert.ok(plan.ordering)
  assert.equal(plan.ordering.schema, 1)
  assert.equal(plan.ordering.ranks['gap-2'], undefined)
  const code = `${plan.code.replace(/^import .*$/gm, '').replaceAll('export const ', 'const ')}; hozoClasses`
  const generated = runInNewContext(code, {
    createClassResolver: (styles, unsupported, compose, states, ambient) => ({
      styles,
      unsupported,
      compose,
      states,
      ambient,
    }),
  })
  const legacy = createClassResolver(
    generated.styles,
    generated.unsupported,
    generated.compose,
    generated.states,
    generated.ambient,
  )
  // Exercise the future factory call with real Rust metadata and the exact
  // emitted objects. The production generator/adapters are NOT switched yet.
  const resolve = createClassResolver({ schema: 1, ...generated, ordering: plan.ordering! })
  const flatten = (styles: object[]) => Object.assign({}, ...styles)
  for (const list of [
    'active:bg-[#330000] p-4 focus:bg-[#220000] bg-[#110000] p-2 hover:focus:bg-[#440000]',
    'hover:focus:bg-[#440000] p-2 bg-[#110000] focus:bg-[#220000] p-4 active:bg-[#330000]',
  ]) {
    for (let bits = 0; bits < 8; bits++) {
      const state = { focused: !!(bits & 1), pressed: !!(bits & 2), hovered: !!(bits & 4) }
      const style = flatten(resolve(list, state))
      assert.equal(style.paddingTop, 16)
      assert.equal(
        style.backgroundColor,
        state.focused && state.hovered
          ? '#440000'
          : state.pressed
            ? '#330000'
            : state.focused
              ? '#220000'
              : '#110000',
      )
      assert.deepEqual(
        resolve(`${list} gap-2`, state),
        legacy(`${list} gap-2`, state),
        'unranked Native shorthand freezes this string, not just the unknown group',
      )
    }
  }
  assert.notDeepEqual(
    flatten(resolve('p-4 p-2')),
    flatten(legacy('p-4 p-2')),
    'control must expose the old string-order winner',
  )
})

test('conflict-free maps carry no order payload and compact conflicting maps omit descriptor provenance', async (t) => {
  for (const names of [
    [],
    ['p-2'],
    ['p-2', 'bg-red-500'],
    Array.from({ length: 256 }, (_, index) => `p-${index + 1}`),
  ]) {
    const cache = cacheFor(names)
    const prepared = await prepareTailwindOrder(css, base, cache.candidates())
    const plan = cache.renderNativeModulePlan(
      prepareTailwindContext(JSON.stringify(prepared.snapshot)),
    )
    assert.equal(plan.code, cache.renderNativeModule())
    if (names.length < 3) assert.equal(plan.ordering, undefined)
    else {
      const compact = JSON.stringify(plan.ordering)
      assert.equal(
        compact,
        JSON.stringify(
          cache.renderNativeModulePlan(prepareTailwindContext(JSON.stringify(prepared.snapshot)))
            .ordering,
        ),
        'compact publication is deterministic, not hash-map insertion order',
      )
      assert.equal(Object.keys(plan.ordering!.ranks).length, 256)
      assert.doesNotMatch(
        compact,
        /fingerprint|candidateId|ruleId|cssProperty|specificity|nativeKeys/,
      )
      t.diagnostic(
        JSON.stringify({
          candidates: 256,
          compactJsonBytes: Buffer.byteLength(compact),
          descriptorJsonBytes: Buffer.byteLength(JSON.stringify(plan.entries)),
        }),
      )
    }
  }
})
