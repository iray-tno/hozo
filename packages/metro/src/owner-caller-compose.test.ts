import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { createCompiler } from '@hozo/compiler'
import { SourceProvenance } from '@hozo/compiler/lower'
import { ownerFixtureShadow } from '../../../scripts/style-slots/owner-fixture.mjs'
import { previewOwnerLiteralCallers } from '../../compiler/src/owner-caller-plan.ts'
import { composeNativeOwnerCaller } from './owner-caller-compose.ts'
import { transformHozoSource } from './transform.ts'

function fixture(source: string, partial = false) {
  const compiler = createCompiler(),
    map = new SourceProvenance(source)
  const ordinary = transformHozoSource(
    source,
    path.resolve('Mixed.tsx'),
    path.resolve('.'),
    compiler,
    undefined,
    (input, edits) => map.apply(input, edits),
  )
  assert.ok(ordinary)
  assert.ok(map.matches(ordinary))
  const preview = previewOwnerLiteralCallers(source, compiler, {
    source: '@hozo/patterns',
    imported: partial ? 'BottomSheet' : ['Toolbar', 'HozoToolbar'],
    shadow: ownerFixtureShadow(partial ? 'BottomSheet.handle' : 'Toolbar.root'),
    experimentalNativePartial: partial,
  })
  assert.ok(preview.edits.length)
  assert.ok(preview.modulePrelude)
  assert.ok(preview.edits.includes(preview.modulePrelude))
  return { ordinary, map, preview }
}

test('exact unchanged siblings compose with Native output and an explicit module prelude', () => {
  for (const directive of ['', "'use client';\n"]) {
    const source = `${directive}import {View} from '@hozo/core';import {Toolbar,HozoToolbar} from '@hozo/patterns';
      export const Box=()=> <View className="p-2"/>;
      export const Tools=()=> <><Toolbar className="p-4" style={first.value}/><HozoToolbar className="p-4" style={second.value}/></>`
    const f = fixture(source)
    const code = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
    assert.notEqual(code, f.ordinary)
    assert.equal(code!.match(/hozoToolbarStyle=/g)?.length, 2)
    assert.match(code!, /hozoStyles/)
    assert.doesNotMatch(code!, /className="p-[24]"/)
    for (const value of ['first.value', 'second.value'])
      assert.equal(code!.split(value).length - 1, 1)
  }
})

test('partial Native carrier insertions keep the raw recipe while an unrelated primitive lowers', () => {
  const source = `import {View} from '@hozo/core';import {BottomSheet} from '@hozo/patterns';
    export const Box=()=> <View className="p-2"/>;
    export const Sheet=()=> <BottomSheet open handleClassName="p-2 hover:opacity-50"/>`
  const f = fixture(source, true)
  const code = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
  assert.notEqual(code, f.ordinary)
  assert.match(code!, /hozoInteractiveHandleStyle=/)
  assert.match(code!, /handleClassName="p-2 hover:opacity-50"/)
})

test('unmapped nested sites keep every owner ordinary even if a sibling site maps', () => {
  const source = `import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
    export const A=()=> <Toolbar className="p-4"/>;
    export const B=()=> <View className="@sm:p-2"><Toolbar className="p-4"/></View>`
  const f = fixture(source)
  assert.equal(composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview), f.ordinary)
})

test('actual copied children compose through regenerated Native parents without matching text', () => {
  const source = `// 😀 original UTF-16 spans
    import {View} from '@hozo/core';import {Toolbar,HozoToolbar} from '@hozo/patterns';
    export const A=()=> <View className="p-2"><Toolbar className="p-4" style={first.value}/><HozoToolbar className="p-4" style={second.value}/></View>`
  const f = fixture(source)
  const output = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
  assert.notEqual(output, f.ordinary)
  assert.equal(output!.match(/hozoToolbarStyle=/g)?.length, 2)
  assert.doesNotMatch(output!, /className="p-[24]"/)
  assert.equal(output!.split('first.value').length - 1, 1)
  assert.equal(output!.split('second.value').length - 1, 1)
})

test('missing, stale, overlapping or unmarked edits never produce a partly composed module', () => {
  const source = `import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
    export const Box=()=> <View className="p-2"/>;export const Tools=()=> <Toolbar className="p-4"/>`
  const f = fixture(source)
  assert.equal(
    composeNativeOwnerCaller(source, f.ordinary, new SourceProvenance(source), f.preview),
    f.ordinary,
  )
  for (const mutate of [
    (p) => {
      delete p.modulePrelude
    },
    (p) => {
      p.modulePrelude = { ...p.modulePrelude }
    },
    (p) => {
      p.edits.push({ ...p.edits.find((e) => e !== p.modulePrelude) })
    },
    (p) => {
      p.edits.push({ spanStart: -1, spanEnd: 0, replacement: 'bad' })
    },
  ]) {
    const preview = structuredClone(f.preview)
    mutate(preview)
    assert.equal(composeNativeOwnerCaller(source, f.ordinary, f.map, preview), f.ordinary)
  }
})

test('passthrough JSX props and render callbacks compose using actual Native copy ranges', () => {
  for (const expression of [
    '<Toolbar className="p-4" style={first.value}/>',
    '() => <Toolbar className="p-4" style={first.value}/>',
    '() => <View className="p-8"><Toolbar className="p-4" style={first.value}/></View>',
  ]) {
    const source = `// 😀 original UTF-16 spans
      import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
      export const A=()=> <View className="p-2" content={${expression}}/>`
    const f = fixture(source)
    const output = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
    assert.notEqual(output, f.ordinary)
    assert.equal(output!.match(/hozoToolbarStyle=/g)?.length, 1)
    assert.equal(output!.split('first.value').length - 1, 1)
    assert.doesNotMatch(output!, /className="p-[248]"/)
  }
})

test('one rewritten spread-group prop keeps the whole module on ordinary Native output', () => {
  const source = `import {View} from '@hozo/core';import {Toolbar} from '@hozo/patterns';
    export const A=()=> <Toolbar className="p-4"/>;
    export const B=()=> <View className="p-2" {...first} content={<Toolbar className="p-4"/>} {...last}/>`
  const f = fixture(source)
  assert.match(f.ordinary, /hozoSpreadStyles/)
  assert.equal(composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview), f.ordinary)
})

test('FlatList renderItem retains its authored callback scope while the Toolbar carrier composes', () => {
  const source = `import {FlatList} from 'react-native';import {Toolbar} from '@hozo/patterns';
    export const A=()=> <FlatList data={rows} className="p-2"
      renderItem={({item}) => <Toolbar items={item.actions} className="p-4" style={item.style}/>}/>`
  const f = fixture(source)
  const output = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
  assert.notEqual(output, f.ordinary)
  assert.match(output!, /HozoFlatList/)
  assert.match(output!, /hozoToolbarStyle=/)
  assert.equal(output!.split('item.actions').length - 1, 1)
  assert.equal(output!.split('item.style').length - 1, 1)
  assert.doesNotMatch(output!, /className="p-[24]"/)
})

test('a partial BottomSheet insertion also maps inside an untouched JSX prop', () => {
  const source = `import {View} from '@hozo/core';import {BottomSheet} from '@hozo/patterns';
    export const A=()=> <View className="p-4" content={<BottomSheet open handleClassName="p-2 hover:opacity-50"/>}/>`
  const f = fixture(source, true)
  const output = composeNativeOwnerCaller(source, f.ordinary, f.map, f.preview)
  assert.notEqual(output, f.ordinary)
  assert.match(output!, /hozoInteractiveHandleStyle=/)
  assert.match(output!, /handleClassName="p-2 hover:opacity-50"/)
})
