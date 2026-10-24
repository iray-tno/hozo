// Evidence comes from the compile that emits the compared output. Never run
// an inspection parse first in a transform to synthesize a matching report.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { prepareTailwindOrder, tailwindPackageDir } from './theme.ts'

const base = tailwindPackageDir()
const css = readFileSync(path.join(base, 'theme.css'), 'utf8')
const capture = { tailwindPlan: true }
const emitted = (components) => components.map(({ tailwindPlan: _plan, ...output }) => output)
const emittedModule = ({ components, ...module }) => ({
  ...module,
  components: emitted(components),
})
const source = `import {Pressable, View, Text, Avatar, cx} from '@hozo/core';
const emoji='😀'; const base='p-2';
export const A=({ready,extra})=><Pressable className={cx(base, 'hover:p-4', ready && 'p-4', extra)}>
  <Avatar fallbackClassName="font-bold"/>
  {ready && <Text className="text-lg">Nested</Text>}
  <Unknown><View className="w-[23px]"/></Unknown>
  <View renderItem={()=> <Text className="font-bold">Prop</Text>}/>
</Pressable>;
export const B=()=> <View className="p-2"/>;`

test('actual Web and all Native compile routes consume the same module plan before emitting', async () => {
  const prepared = await prepareTailwindOrder(`${css}\n@utility p-2 { color:red; }`, base, [
    'p-2',
    'p-4',
    'hover:p-4',
    'font-bold',
    'text-lg',
  ])
  const compiler = createCompiler()
  const before = {
    web: compiler.compile(source),
    native: compiler.compileNative(source),
    module: compiler.compileNativeModule(source),
  }
  assert.ok(before.web.every((component) => !('tailwindPlan' in component)))
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  compiler.inspectTailwindOrder = () => {
    throw new Error('a transform must not invoke the inspection parser')
  }
  assert.deepEqual(
    compiler.compile(source),
    before.web,
    'ordinary prepared compilation omits evidence',
  )
  assert.deepEqual(compiler.compileNativeModule(source), before.module)
  const web = compiler.compile(source, undefined, capture)
  const native = compiler.compileNative(source, undefined, capture)
  const module = compiler.compileNativeModule(source, undefined, undefined, capture)
  assert.deepEqual(emitted(web), before.web)
  assert.deepEqual(emitted(native), before.native)
  assert.deepEqual(emittedModule(module), before.module)
  assert.deepEqual(
    web.map((component) => component.tailwindPlan),
    native.map((component) => component.tailwindPlan),
  )
  assert.deepEqual(
    native.map((component) => component.tailwindPlan),
    module.components.map((component) => component.tailwindPlan),
  )
  assert.equal(web.length, 2)
  const sites = web.flatMap((component) => {
    assert.equal(component.tailwindPlan?.fingerprint, prepared.snapshot.fingerprint)
    assert.equal(component.tailwindPlan.mode, 'passthrough')
    return component.tailwindPlan.sites
  })
  assert.equal(
    sites.length,
    9,
    'root/owned-root slot, secondary slot, carried child/prop nodes and second root each participate',
  )
  assert.equal(
    sites.find((site) => site.classProp === 'fallbackClassName')?.spanStart,
    source.indexOf('fallbackClassName'),
  )
  const blocks = sites.flatMap((site) => {
    assert.ok(site.spanStart >= 0 && site.spanEnd <= source.length)
    let cursor = 0
    for (const block of site.blocks) {
      assert.equal(block.start, cursor)
      assert.ok(block.end > block.start)
      cursor = block.end
      if (block.inputStart !== undefined)
        assert.match(source.slice(block.inputStart), /^className|^fallbackClassName/)
    }
    assert.equal(cursor, site.writeCount, 'each original write appears exactly once in the plan')
    return site.blocks
  })
  assert.ok(blocks.some((block) => block.guarded && block.candidate === 'p-4'))
  assert.ok(
    blocks.some((block) => block.candidate === 'w-[23px]' && block.status === 'uncollected'),
  )
  for (const block of blocks.filter((block) => block.candidate === 'p-2')) {
    assert.equal(block.status, 'described')
    assert.equal(block.candidateId, prepared.lookup('p-2')!.id)
    assert.deepEqual(
      block.ruleIds,
      prepared.lookup('p-2')!.rules.map((rule) => rule.id),
    )
    assert.equal(
      block.ruleIds.length,
      2,
      'do not pretend that all longhands belong to upstream rule zero',
    )
  }
  compiler.setTailwindOrder()
  assert.deepEqual(compiler.compile(source), before.web)
  assert.deepEqual(compiler.compileNative(source), before.native)
  assert.deepEqual(compiler.compileNativeModule(source), before.module)
})

test('StyleX boundaries and opaque guard evaluation stay outside Tailwind rule interpretation', async () => {
  const compiler = createCompiler()
  const input = `import {Pressable,cx} from '@hozo/core';import * as stylex from '@stylexjs/stylex';
    const styles=stylex.create({focus:{':focus':{backgroundColor:'green'}}});
    const el=<Pressable className={cx('p-2 active:bg-blue-500', check() && 'p-4', extra)} {...stylex.props(styles.focus)}/>`
  const webBefore = compiler.compile(input)
  const nativeBefore = compiler.compileNativeModule(input)
  const prepared = await prepareTailwindOrder(css, base, ['p-2', 'p-4', 'active:bg-blue-500'])
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const web = compiler.compile(input, undefined, capture),
    native = compiler.compileNativeModule(input, undefined, undefined, capture)
  assert.deepEqual(emitted(web), webBefore)
  assert.deepEqual(emittedModule(native), nativeBefore)
  const plan = web[0]!.tailwindPlan!
  assert.deepEqual(plan, native.components[0]!.tailwindPlan)
  const stylex = plan.sites
    .flatMap((site) => site.blocks)
    .filter((block) => block.source === 'stylex')
  assert.ok(stylex.length > 0)
  assert.ok(
    stylex.every(
      (block) =>
        block.status === 'stylex' && block.utilityId === undefined && !block.ruleIds.length,
    ),
  )
  assert.equal(
    web[0]!.jsx.split('check()').length - 1,
    webBefore[0]!.jsx.split('check()').length - 1,
  )
})

test('Native forwarding/text proofs use the already-parsed plan without changing their choice of ABI', async () => {
  const compiler = createCompiler()
  compiler.setTextForwarding([
    {
      module: 'labels',
      components: [{ name: 'Label', props: [], variants: [{ when: [], classes: 'text-lg' }] }],
    },
  ])
  const input = `import {Text} from '@hozo/core'; import {Label} from 'labels';
    export const A=()=> <Label><Text className="font-bold">Value</Text></Label>`
  const passive = `import {Text} from '@hozo/core';export const A=()=> <Text className="text-lg">Value</Text>`
  const before = compiler.compileNativeModule(input)
  const options = { textInheritance: true, textStatic: true }
  const staticBefore = compiler.compileNativeModule(passive, undefined, undefined, options)
  const prepared = await prepareTailwindOrder(css, base, ['text-lg', 'font-bold'])
  compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
  const after = compiler.compileNativeModule(input, undefined, undefined, capture)
  assert.deepEqual(emittedModule(after), before)
  assert.ok(after.components[0]!.tailwindPlan!.sites.some((site) => site.classProp === 'forwarded'))
  const staticAfter = compiler.compileNativeModule(passive, undefined, undefined, {
    ...options,
    ...capture,
  })
  assert.deepEqual(emittedModule(staticAfter), staticBefore)
  assert.equal(staticAfter.components[0]!.tailwindPlan?.mode, 'passthrough')
})
