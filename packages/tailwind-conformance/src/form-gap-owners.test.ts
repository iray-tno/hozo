// Public form sources and actual Metro/candidate output, with stand-in RN
// hosts. Yoga checks the selected styles, not device focus/picker delivery.
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
  ['Form', 'className', 'style', 'View'],
  ['TextArea', 'className', 'style', 'View'],
  ['TextArea', 'fieldClassName', 'fieldStyle', 'TextInput'],
  ['TextArea', 'countClassName', 'countStyle', 'Text'],
  ['FileDropzone', 'className', 'style', 'Pressable'],
] as const
// Form is an opt-in package, not a default semantic lowering source. A real
// primitive keeps Metro's transform active; the form imports must remain
// untouched. These caller shapes do not claim ahead-of-time form lowering.
const source = `import {View} from '@hozo/core'
import {Form,TextArea,FileDropzone} from '@hozo/form'
export function NativeAnchor(){return <View/>}
export {Form as RawForm,TextArea as RawTextArea,FileDropzone as RawFileDropzone} from '@hozo/form'
${owners
  .flatMap(([component, classProp, styleProp], index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.form-gap-'))
const cache = openCandidateCache()
cache.scanFile('FormOwners.tsx', source, 1)
cache.scanFile('GapChoices.ts', JSON.stringify(names.split(' ')), 1)
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
const hook = registerHooks({
  resolve(specifier, context, next) {
    // The general Native harness does not select the form package's source
    // entry. Match Metro here without substituting any form implementation.
    const file =
      specifier === '@hozo/form'
        ? path.join(root, 'packages/form/src/index.native.ts')
        : specifier === '@hozo/engine/project'
          ? sheet
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
  Form: { accessibilityLabel: 'Form', children: react.createElement('Text', null, 'Fields') },
  TextArea: { defaultValue: 'abc', maxLength: 20, accessibilityLabel: 'Notes' },
  FileDropzone: {
    accessibilityLabel: 'Attachments',
    children: 'Choose files',
    pickFiles: async () => null,
  },
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

test('public form owners project each authored contribution before class gap axes', () => {
  const mismatches: unknown[] = []
  let observations = 0
  for (const [index, [component, classProp, styleProp, host]] of owners.entries())
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `${mode}${index}`]
        assert.notEqual(type, undefined, `${component}/${mode}: actual public export`)
        const props =
          mode === 'Raw'
            ? { ...baseProps[component], [classProp]: names, [styleProp]: author.own }
            : { base: baseProps[component], own: author.own, runtimeNames: names }
        if (mode !== 'Raw')
          assert.equal(
            (type as (props: unknown) => { type: unknown })(props).type,
            components[`Raw${component}`],
            'Metro preserves the opt-in form implementation rather than lowering it',
          )
        const before = JSON.stringify(author.own)
        let view: ReturnType<typeof renderer.create>
        try {
          renderer.act(() => {
            view = renderer.create(react.createElement(type, props))
          })
          const targets = view.root.findAll(
            (node) =>
              ['View', 'TextInput', 'Text', 'Pressable'].includes(node.type) &&
              stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
          )
          assert.equal(targets.length, 1, `${component}.${styleProp}/${mode}: exactly one owner`)
          const target = targets[0]
          assert.equal(target.type, host)
          if (component === 'Form') assert.equal(target.props.accessibilityLabel, 'Form')
          if (styleProp === 'fieldStyle') {
            assert.equal(target.props.multiline, true)
            assert.equal(target.props.editable, true)
            assert.equal(target.props.value, 'abc')
          }
          if (styleProp === 'countStyle') {
            assert.equal(target.props.accessibilityElementsHidden, true)
            assert.equal(target.props.importantForAccessibility, 'no')
          }
          if (component === 'FileDropzone') {
            assert.equal(target.props.accessibilityRole, 'button')
            assert.equal(target.props.accessibilityState.disabled, false)
            const labels = target.findAllByType('Text')
            assert.equal(labels.length, 1)
            for (const axis of ['gap', 'rowGap', 'columnGap'])
              assert.equal(stub.StyleSheet.flatten(labels[0].props.style)?.[axis], undefined)
          }
          for (const layout of gapLayouts) {
            const actual = yogaGapGeometry(stub.StyleSheet.flatten(target.props.style), layout)
            if (JSON.stringify(actual) !== JSON.stringify(author.expected))
              mismatches.push({ component, styleProp, mode, author: author.id, layout, actual })
            observations++
          }
          assert.equal(JSON.stringify(author.own), before, 'the authored input is unchanged')
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  assert.equal(observations, 480)
  assert.deepEqual(mismatches, [], `${mismatches.length}/${observations} form gap differences`)
})
