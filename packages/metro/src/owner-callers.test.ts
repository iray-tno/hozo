// Real Metro resolver/preflight and source worker, not a Metro app or device.
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test, { type TestContext } from 'node:test'
import { ownerMetroFixture } from '../fixtures/owner-metro-resolver.mjs'
import {
  metroStatePath,
  readMetroState,
  withHozo,
  withHozoOwnerCallers,
  withHozoPartialOwners,
} from './config.ts'
import { getCacheKey, transform } from './index.ts'
import { collectMetroOwnerPreflight } from './owner-manifest-preflight.ts'
import { MetroOwnerShadowSession } from './owner-manifest-shadow.ts'

const source = (name = 'Toolbar') => `import {${name} as Tools} from '@hozo/patterns';
export const A=()=> <Tools items={[]} style={author.value} className="p-2"/>`
function fixture(t: TestContext, platform: string) {
  const f = ownerMetroFixture(t)
  const filename = path.join(f.root, 'src', 'Row.tsx')
  mkdirSync(path.dirname(filename))
  writeFileSync(filename, source())
  writeFileSync(path.join(f.root, 'src', 'choices.ts'), `const choices=['p-2','hover:opacity-50'];`)
  const appFile = path.join(f.root, 'package.json')
  const app = JSON.parse(readFileSync(appFile, 'utf8'))
  for (const name of ['@hozo/patterns', '@hozo/core']) {
    const dir = path.join(f.root, 'node_modules', name)
    mkdirSync(dir, { recursive: true })
    f.roots.push(dir)
    app.dependencies[name] = '1'
    writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name,
        version: '1',
        main: './index.js',
        ...(name === '@hozo/patterns' ? { hozo: { manifest: 'owner.json' } } : {}),
      }),
    )
    writeFileSync(
      path.join(dir, 'index.js'),
      'export const Toolbar=null;export const HozoToolbar=null;export const View=null;',
    )
    if (name === '@hozo/patterns')
      writeFileSync(
        path.join(dir, 'owner.json'),
        readFileSync(new URL('../../patterns/hozo.manifest.json', import.meta.url)),
      )
  }
  writeFileSync(appFile, JSON.stringify(app))
  writeFileSync(path.join(f.root, 'global.css'), '@theme {--spacing:7px;} @tailwind utilities;')
  const upstream = path.join(f.root, 'upstream.cjs')
  writeFileSync(upstream, 'exports.transform=async p=>p.src;exports.getCacheKey=()=>"upstream";')
  const config = {
    projectRoot: f.root,
    resolver: { resolveRequest: f.delegate },
    transformer: { babelTransformerPath: upstream },
  }
  const options = { css: 'global.css', content: { packages: [] } }
  const preflight = collectMetroOwnerPreflight(f.context, f.delegate, {
    platform,
    epoch: 'explicit-toolbar',
    origins: [filename],
  })
  assert.equal(preflight.status, 'complete', JSON.stringify(preflight))
  return {
    ...f,
    filename,
    config,
    options,
    preflight,
    params: { src: source(), filename, options: { projectRoot: f.root, platform } },
  }
}

test('one explicitly selected captured Toolbar alias gets a full carrier, not an ordinary default', async (t) => {
  for (const platform of ['android', 'ios']) {
    const f = fixture(t, platform)
    await withHozo(f.config, f.options)
    const ordinary = await transform(f.params)
    const ordinaryKey = getCacheKey({ projectRoot: f.root })
    assert.doesNotMatch(String(ordinary), /hozoToolbarStyle=/)
    await withHozoOwnerCallers(f.config, f.preflight, 'Toolbar.root', f.options)
    assert.equal(readMetroState(f.root)?.ownerShadow?.target, 'Toolbar.root')
    assert.notEqual(getCacheKey({ projectRoot: f.root }), ordinaryKey)
    for (const imported of ['Toolbar', 'HozoToolbar']) {
      const output = String(await transform({ ...f.params, src: source(imported) }))
      assert.match(output, /hozoToolbarStyle=/)
      assert.doesNotMatch(output, /className="p-2"/)
      assert.match(output, /paddingTop:\s*14/)
      assert.equal(output.split('author.value').length - 1, 1)
    }
    const toolbarKey = getCacheKey({ projectRoot: f.root })
    await withHozoPartialOwners(f.config, f.preflight, f.options)
    assert.equal(readMetroState(f.root)?.ownerShadow?.target, 'BottomSheet.handle')
    assert.notEqual(getCacheKey({ projectRoot: f.root }), toolbarKey)
    assert.doesNotMatch(String(await transform(f.params)), /hozoToolbarStyle=/)
    await withHozo(f.config, f.options)
    assert.equal(readMetroState(f.root)?.ownerShadow, undefined)
    assert.equal(await transform(f.params), ordinary)
    assert.equal(getCacheKey({ projectRoot: f.root }), ordinaryKey)
  }
})

test('one planner owns binding inspection for all captured aliases', async (t) => {
  // Observe only this N-API operation in this isolated test worker, not all
  // compiler parses. Restore it even when a regression assertion fails.
  const native = createRequire(import.meta.url)('../../compiler/hozo_napi.node')
  const original = native.inspectOwnerClassSlots
  let calls = 0
  native.inspectOwnerClassSlots = (...args: unknown[]) => {
    calls++
    return original(...args)
  }
  t.after(() => {
    native.inspectOwnerClassSlots = original
  })
  for (const platform of ['android', 'ios']) {
    const f = fixture(t, platform)
    await withHozoOwnerCallers(f.config, f.preflight, 'Toolbar.root', f.options)
    const input = `import {Toolbar,HozoToolbar} from '@hozo/patterns';export const A=()=> <><Toolbar items={[]} className="p-2"/><HozoToolbar items={[]} className="p-2"/></>`
    calls = 0
    const output = String(await transform({ ...f.params, src: input }))
    assert.equal(output.match(/hozoToolbarStyle=/g)?.length, 2)
    assert.equal(
      calls,
      1,
      `${platform}: selector must not parse the same bindings before the planner`,
    )
  }
})

test('captured aliases share one plan while opaque recipes, foreign names, unproven scopes and uncaptured importers stay ordinary', async (t) => {
  const f = fixture(t, 'android')
  await withHozoOwnerCallers(f.config, f.preflight, 'Toolbar.root', f.options)
  for (const input of [
    source().replace('className="p-2"', 'className={names}'),
    source().replace('className="p-2"', 'className="p-2 hover:opacity-50"'),
    `import * as P from '@hozo/patterns';export const A=()=> <P.Toolbar items={[]} className="p-2"/>`,
    `/* @hozo/patterns */import {Toolbar} from 'kit';export const A=()=> <Toolbar className="p-2"/>`,
    `import {View} from '@hozo/core';${source().replace('<Tools', '<View className="@sm:p-2"><Tools').replace('/>', '/></View>')}`,
  ])
    assert.doesNotMatch(
      String(await transform({ ...f.params, src: input })),
      /hozoToolbarStyle=/,
      input,
    )
  const filename = path.join(f.root, 'src', 'Uncaptured.tsx')
  writeFileSync(filename, source())
  assert.doesNotMatch(String(await transform({ ...f.params, filename })), /hozoToolbarStyle=/)
  const input = `import {Toolbar as Tools,HozoToolbar as Alias} from '@hozo/patterns';
    export const A=()=> <><Tools items={[]} className="p-2" style={first.value}/>
    <Alias items={[]} className="p-2" style={second.value}/><Alias items={[]} className={opaque.value}/></>;
    function Shadow(Alias){return <Alias items={[]} className="p-2"/>}`
  const output = String(await transform({ ...f.params, src: input }))
  const names = [...output.matchAll(/hozoToolbarStyle=\{(\w+)\}/g)].map((m) => m[1])
  assert.equal(names.length, 2)
  assert.equal(names[0], names[1], 'both public aliases must use one plan')
  assert.equal(output.match(/\.create\(/g)?.length, 1)
  for (const value of ['first.value', 'second.value', 'opaque.value'])
    assert.equal(output.split(value).length - 1, 1)
  assert.match(
    output,
    /function Shadow\(Alias\)\{return <Alias items=\{\[\]\} className="p-2"\/>\}/,
  )
  assert.match(output, /className=\{opaque.value\}/)
})

test('invalid targets and inconsistent serialized modes fail before replacing configured state', async (t) => {
  const f = fixture(t, 'android')
  await withHozoOwnerCallers(f.config, f.preflight, 'Toolbar.root', f.options)
  const state = readMetroState(f.root)!.ownerShadow!
  const before = readFileSync(metroStatePath(f.root), 'utf8')
  await assert.rejects(
    withHozoOwnerCallers(f.config, f.preflight, 'Tabs.Tab' as never, f.options),
    /target/,
  )
  assert.equal(readFileSync(metroStatePath(f.root), 'utf8'), before)
  assert.throws(
    () => new MetroOwnerShadowSession({ ...state, target: undefined }, f.root),
    /target/,
  )
  assert.throws(
    () => new MetroOwnerShadowSession({ ...state, mode: 'assessment-only' }, f.root),
    /target/,
  )
})

test('mixed Native files prepare siblings and copied children but retain unproven scopes', async (t) => {
  for (const platform of ['android', 'ios']) {
    const f = fixture(t, platform)
    const input = `import {View} from '@hozo/core';${source()}
      export const Box=()=> <View className="p-2"/>;`
    await withHozo(f.config, f.options)
    const ordinary = String(await transform({ ...f.params, src: input }))
    assert.doesNotMatch(ordinary, /hozoToolbarStyle=/)
    await withHozoOwnerCallers(f.config, f.preflight, 'Toolbar.root', f.options)
    const output = String(await transform({ ...f.params, src: input }))
    assert.match(output, /hozoToolbarStyle=/)
    assert.doesNotMatch(output, /className="p-2"/)
    assert.match(output, /hozoStyles/)
    assert.match(output, /paddingTop:\s*14/)
    assert.equal(output.split('author.value').length - 1, 1)
    assert.equal(
      String(await transform({ ...f.params, src: input })),
      output,
      'warm output uses the same proven route',
    )
    const identityParent = input
      .replace('export const A=()=> <Tools', 'export const A=()=> <View><Tools')
      .replace('className="p-2"/>', 'className="p-2"/></View>')
    assert.match(
      String(await transform({ ...f.params, src: identityParent })),
      /hozoToolbarStyle=/,
      'an explicitly identical parent edit preserves its source range',
    )
    const mixed = identityParent.replace('<View><Tools', '<View className="p-2"><Tools')
    assert.match(String(await transform({ ...f.params, src: mixed })), /hozoToolbarStyle=/)
    const prop = input
      .replace(
        'export const A=()=> <Tools',
        'export const A=()=> <View className="p-2" content={() => <Tools',
      )
      .replace('className="p-2"/>', 'className="p-2"/>}/>')
    const deliveredProp = String(await transform({ ...f.params, src: prop }))
    assert.match(deliveredProp, /hozoToolbarStyle=/)
    assert.equal(deliveredProp.split('author.value').length - 1, 1)
    assert.equal(String(await transform({ ...f.params, src: prop })), deliveredProp)
    const grouped = `import {FlatList} from 'react-native';import {Toolbar} from '@hozo/patterns';
      export const A=()=> <FlatList data={rows} className="p-2" {...before}
        renderItem={({item})=><Toolbar items={item.actions} className="p-2" style={item.style}/>} {...after}/>`
    const deliveredGroup = String(await transform({ ...f.params, src: grouped }))
    assert.match(deliveredGroup, /hozoSpreadStyles/)
    assert.match(deliveredGroup, /hozoToolbarStyle=/)
    assert.equal(deliveredGroup.split('item.style').length - 1, 1)
    assert.equal(String(await transform({ ...f.params, src: grouped })), deliveredGroup)
    const unproven = mixed.replace(
      '<View className="p-2"><Tools',
      '<View className="@sm:p-2"><Tools',
    )
    assert.doesNotMatch(
      String(await transform({ ...f.params, src: unproven })),
      /hozoToolbarStyle=/,
    )
    await withHozo(f.config, f.options)
    assert.equal(
      String(await transform({ ...f.params, src: input })),
      ordinary,
      'ordinary restoration is byte-identical',
    )
  }
})
