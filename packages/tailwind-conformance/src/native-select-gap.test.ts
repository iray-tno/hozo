// Actual public NativeSelect sources/candidate resolution. The logical Modal
// host mounts children only when visible; this does not model OS transitions.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, mock, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { gapLayouts, yogaGapGeometry } from './gap-alias-reference.ts'
import { loadNativeModule } from './native-render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const names = 'gap-y-[8px] gap-x-[4px]'
const owners = [
  ['className', 'style', 'Pressable', 1, false],
  ['className', 'style', 'Pressable', 1, true],
  ['sheetClassName', 'sheetStyle', 'View', 1, false],
  ['scrimClassName', 'scrimStyle', 'Pressable', 1, false],
  ['optionClassName', 'optionStyle', 'Pressable', 2, false],
] as const
// Keep the real Metro transform active without adding the opt-in form package
// to a semantic allowlist. Assert that these form wrappers stay passthrough.
const source = `import {View} from '@hozo/core'
import {NativeSelect} from '@hozo/form'
export {NativeSelect as RawSelect,NativeSelectProvider as SelectProvider} from '@hozo/form'
export function Anchor(){return <View/>}
${owners
  .flatMap(([classProp, styleProp], index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}) {return <NativeSelect {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.select-gap-'))
const cache = openCandidateCache()
cache.scanFile('SelectOwners.tsx', source, 1)
cache.scanFile('Choices.ts', JSON.stringify(names.split(' ')), 1)
assert.deepEqual(
  cache
    .candidates()
    .filter((name) => names.split(' ').includes(name))
    .sort(),
  ['gap-x-[4px]', 'gap-y-[8px]'],
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const native = path.join(project, 'native-host.mjs')
writeFileSync(
  native,
  `import {createElement} from 'react';export * from ${JSON.stringify(new URL('./react-native-stub.js', import.meta.url).href)};
export function Modal({children,...props}){return createElement('Modal',props,props.visible?children:null)}`,
)
const hook = registerHooks({
  resolve(specifier, context, next) {
    const file =
      specifier === '@hozo/form'
        ? path.join(root, 'packages/form/src/index.native.ts')
        : specifier === '@hozo/engine/project'
          ? sheet
          : specifier === 'react-native'
            ? native
            : undefined
    return file ? { url: pathToFileURL(file).href, shortCircuit: true } : next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const warnings = mock.method(console, 'warn', () => {})
const components = loadNativeModule(source, project, { root: project, compiler: createCompiler() })
warnings.mock.restore()
const baseProps = {
  accessibilityLabel: 'Delivery',
  defaultValue: 'a',
  options: [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', disabled: true },
  ],
}
const authors = [
  { id: 'no-gap', own: Object.freeze({ paddingBottom: 23 }), expected: [8, 4] },
  { id: 'generic', own: Object.freeze({ gap: 16, paddingBottom: 23 }), expected: [16, 16] },
  {
    id: 'nested-axis',
    own: [Object.freeze({ gap: 24, paddingBottom: 23 }), [false, Object.freeze({ rowGap: 6 })]],
    expected: [6, 24],
  },
]
const trigger = (view) => {
  const matches = view.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'combobox',
  )
  assert.equal(matches.length, 1, 'one actual select control')
  return matches[0]
}

test('NativeSelect projects public author gaps on the control and actual fallback chrome', () => {
  const platform = stub.Platform.OS
  stub.Platform.OS = 'android'
  let observations = 0
  const mismatches: unknown[] = []
  try {
    for (const [index, [classProp, styleProp, host, hosts, indicator]] of owners.entries())
      for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
        for (const author of authors) {
          const type = components[mode === 'Raw' ? 'RawSelect' : `${mode}${index}`]
          const base = { ...baseProps, indicatorClassName: indicator ? names : undefined }
          const props =
            mode === 'Raw'
              ? { ...base, [classProp]: names, [styleProp]: author.own }
              : { base, own: author.own, runtimeNames: names }
          if (mode !== 'Raw')
            assert.equal(
              (type as (props: unknown) => { type: unknown })(props).type,
              components.RawSelect,
            )
          const before = JSON.stringify(author.own)
          let view: ReturnType<typeof renderer.create>
          try {
            renderer.act(() => {
              view = renderer.create(react.createElement(type, props))
            })
            assert.equal(view.root.findByType('Modal').props.visible, false)
            assert.equal(trigger(view).props.accessibilityValue.text, 'Alpha')
            if (styleProp !== 'style') renderer.act(() => trigger(view).props.onPress())
            assert.equal(view.root.findByType('Modal').props.visible, styleProp !== 'style')
            const targets = view.root.findAll(
              (node) =>
                ['View', 'Pressable'].includes(node.type) &&
                stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
            )
            assert.equal(targets.length, hosts, `${styleProp}/${mode}: actual marked owners`)
            for (const target of targets) {
              assert.equal(target.type, host)
              if (styleProp === 'sheetStyle')
                assert.equal(target.props.accessibilityViewIsModal, true)
              if (styleProp === 'scrimStyle') {
                assert.equal(target.props.accessibilityElementsHidden, true)
                assert.equal(target.props.importantForAccessibility, 'no-hide-descendants')
              }
              if (styleProp === 'optionStyle')
                assert.equal(target.props.accessibilityRole, 'menuitem')
              if (styleProp !== 'scrimStyle')
                for (const label of target.findAllByType('Text'))
                  for (const axis of ['gap', 'rowGap', 'columnGap'])
                    assert.equal(stub.StyleSheet.flatten(label.props.style)?.[axis], undefined)
              for (const layout of gapLayouts) {
                const actual = yogaGapGeometry(stub.StyleSheet.flatten(target.props.style), layout)
                if (JSON.stringify(actual) !== JSON.stringify(author.expected))
                  mismatches.push({ styleProp, mode, author: author.id, indicator, layout, actual })
                observations++
              }
            }
            if (indicator) {
              const arrows = trigger(view).findAllByType('View')
              assert.equal(arrows.length, 1)
              assert.equal(arrows[0].props.accessibilityElementsHidden, true)
              assert.equal(arrows[0].props.pointerEvents, 'none')
              assert.equal(stub.StyleSheet.flatten(trigger(view).props.style).flexDirection, 'row')
            }
            assert.equal(JSON.stringify(author.own), before)
          } finally {
            renderer.act(() => view?.unmount())
          }
        }
  } finally {
    stub.Platform.OS = platform
  }
  assert.equal(observations, 576)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} NativeSelect gap differences`,
  )
})
