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
const fieldNames =
  'gap-y-[8px] gap-x-[2px] focus:gap-y-[6px] disabled:gap-x-[14px] read-only:gap-y-[10px]'
const fileNames =
  'gap-y-[8px] gap-x-[2px] hover:gap-x-[4px] active:gap-y-[12px] focus:gap-y-[6px] disabled:gap-x-[14px] aria-busy:gap-y-[18px]'
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
export {Form as RawForm,TextArea as RawTextArea,FileDropzone as RawFileDropzone,useFormSubmit as formSubmit} from '@hozo/form'
${owners
  .flatMap(([component, classProp, styleProp], index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}
${[
  ['TextArea', 'fieldClassName', 'fieldStyle', fieldNames],
  ['FileDropzone', 'className', 'style', fileNames],
]
  .flatMap(([component, classProp, styleProp, classes]) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function State${mode}${component}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(classes)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.form-gap-'))
const cache = openCandidateCache()
cache.scanFile('FormOwners.tsx', source, 1)
const choices = [...new Set(`${names} ${fieldNames} ${fileNames}`.split(' '))]
cache.scanFile('GapChoices.ts', JSON.stringify(choices), 1)
assert.deepEqual(
  cache
    .candidates()
    .filter((name) => choices.includes(name))
    .sort(),
  choices.sort(),
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

test('actual field and picker owners retain gap authors through interaction and editable facts', () => {
  const cases = [
    {
      component: 'TextArea',
      styleProp: 'fieldStyle',
      classProp: 'fieldClassName',
      host: 'TextInput',
      classes: fieldNames,
      frames: [
        { expected: [8, 2] },
        { event: 'onFocus', expected: [6, 2] },
        { event: 'onBlur', expected: [8, 2] },
        { patch: { disabled: true }, expected: [10, 14] },
        { patch: { disabled: false, readOnly: true }, expected: [10, 2] },
        { patch: { readOnly: false }, expected: [8, 2] },
      ],
    },
    {
      component: 'FileDropzone',
      styleProp: 'style',
      classProp: 'className',
      host: 'Pressable',
      classes: fileNames,
      frames: [
        { expected: [8, 2] },
        { event: 'onHoverIn', expected: [8, 4] },
        { event: 'onPressIn', expected: [12, 4] },
        { event: 'onPressOut', expected: [8, 4] },
        { event: 'onHoverOut', expected: [8, 2] },
        { event: 'onFocus', expected: [6, 2] },
        { event: 'onBlur', expected: [8, 2] },
        { patch: { disabled: true }, expected: [8, 14] },
        { patch: { disabled: false }, expected: [8, 2] },
      ],
    },
  ]
  let observations = 0
  for (const { component, styleProp, classProp, host, classes, frames } of cases)
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        let base = { ...baseProps[component] }
        const type = components[mode === 'Raw' ? `Raw${component}` : `State${mode}${component}`]
        const element = () =>
          react.createElement(
            type,
            mode === 'Raw'
              ? { ...base, [styleProp]: author.own, [classProp]: classes }
              : { base, own: author.own, runtimeNames: classes },
          )
        let view: ReturnType<typeof renderer.create>
        const target = () => view.root.findByType(host)
        try {
          renderer.act(() => {
            view = renderer.create(element())
          })
          for (const frame of frames) {
            if (frame.patch) {
              base = { ...base, ...frame.patch }
              renderer.act(() => view.update(element()))
            }
            if (frame.event) {
              assert.equal(typeof target().props[frame.event], 'function')
              renderer.act(() => target().props[frame.event]({ nativeEvent: {} }))
            }
            const expected = author.id === 'no-gap' ? frame.expected : author.expected
            for (const layout of gapLayouts) {
              assert.deepEqual(
                yogaGapGeometry(stub.StyleSheet.flatten(target().props.style), layout),
                expected,
                `${component}/${mode}/${author.id}/${frame.event ?? JSON.stringify(frame.patch)}`,
              )
              observations++
            }
            if (component === 'TextArea') {
              assert.equal(target().props.editable, !base.disabled && !base.readOnly)
              assert.equal(target().props.accessibilityState.disabled, Boolean(base.disabled))
              for (const node of [view.root.findByType('View'), view.root.findByType('Text')])
                for (const axis of ['gap', 'rowGap', 'columnGap'])
                  assert.equal(
                    stub.StyleSheet.flatten(node.props.style)?.[axis],
                    undefined,
                    'the wrapper/counter must not borrow the field author or interaction',
                  )
            } else assert.equal(target().props.disabled, Boolean(base.disabled))
          }
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  assert.equal(observations, 1440)
})

test('TextArea grows with its resolved field and leaves a hidden counter author unread', () => {
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    let counterVisible = false
    let gap = 16
    let counterReads = 0
    const field = Object.freeze({
      lineHeight: 20,
      paddingTop: 3,
      paddingBottom: 5,
      get gap() {
        return gap
      },
    })
    const counter = Object.freeze({
      get gap() {
        assert.equal(counterVisible, true, 'unmounted counter author was evaluated')
        counterReads++
        return gap + 4
      },
    })
    const type = components[mode === 'Raw' ? 'RawTextArea' : `${mode}2`]
    let base = {
      defaultValue: 'abc',
      className: names,
      style: Object.freeze({ gap: 12 }),
      countClassName: names,
      countStyle: counter,
      minRows: 2,
      maxRows: 5,
    }
    const element = () =>
      react.createElement(
        type,
        mode === 'Raw'
          ? { ...base, fieldClassName: names, fieldStyle: field }
          : { base, own: field, runtimeNames: names },
      )
    let view: ReturnType<typeof renderer.create>
    const input = () => view.root.findByType('TextInput')
    const check = (height: number) => {
      const style = stub.StyleSheet.flatten(input().props.style)
      assert.equal(style.height, height)
      assert.equal(style.textAlignVertical, 'top')
      for (const layout of gapLayouts) {
        assert.deepEqual(yogaGapGeometry(style, layout), [gap, gap])
        assert.deepEqual(
          yogaGapGeometry(
            stub.StyleSheet.flatten(view.root.findByType('View').props.style),
            layout,
          ),
          [12, 12],
        )
      }
    }
    try {
      renderer.act(() => {
        view = renderer.create(element())
      })
      check(48)
      assert.equal(counterReads, 0)
      gap = 24
      renderer.act(() =>
        input().props.onContentSizeChange({ nativeEvent: { contentSize: { height: 80 } } }),
      )
      check(88)
      renderer.act(() => input().props.onChangeText('abcde'))
      assert.equal(input().props.value, 'abcde')
      assert.equal(counterReads, 0)
      counterVisible = true
      base = { ...base, maxLength: 10 }
      renderer.act(() => view.update(element()))
      const count = view.root.findByType('Text')
      assert.equal(count.props.accessibilityElementsHidden, true)
      assert.equal(input().props.accessibilityHint, count.children.join(''))
      for (const layout of gapLayouts)
        assert.deepEqual(
          yogaGapGeometry(stub.StyleSheet.flatten(count.props.style), layout),
          [28, 28],
        )
      assert.ok(counterReads > 0)
      const visibleReads = counterReads
      counterVisible = false
      base = { ...base, maxLength: undefined }
      renderer.act(() => view.update(element()))
      assert.equal(view.root.findAllByType('Text').length, 0)
      assert.equal(counterReads, visibleReads)
      gap = 32
      renderer.act(() =>
        input().props.onContentSizeChange({ nativeEvent: { contentSize: { height: 160 } } }),
      )
      check(108)
      assert.equal(counterReads, visibleReads)
    } finally {
      renderer.act(() => view?.unmount())
    }
  }
})

test('Form keeps the public submit context and dismisses the keyboard before the callback', () => {
  const calls: string[] = []
  const dismiss = mock.method(stub.Keyboard, 'dismiss', () => calls.push('keyboard'))
  function Submit() {
    const submit = (components.formSubmit as () => () => void)()
    return react.createElement('Pressable', { onPress: submit })
  }
  try {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
      calls.length = 0
      const type = components[mode === 'Raw' ? 'RawForm' : `${mode}0`]
      const base = { children: react.createElement(Submit), onSubmit: () => calls.push('submit') }
      const own = Object.freeze({ gap: 16 })
      const props =
        mode === 'Raw'
          ? { ...base, className: names, style: own }
          : { base, own, runtimeNames: names }
      let view: ReturnType<typeof renderer.create>
      try {
        renderer.act(() => {
          view = renderer.create(react.createElement(type, props))
        })
        renderer.act(() => view.root.findByType('Pressable').props.onPress())
        assert.deepEqual(calls, ['keyboard', 'submit'])
        for (const layout of gapLayouts)
          assert.deepEqual(
            yogaGapGeometry(
              stub.StyleSheet.flatten(view.root.findByType('View').props.style),
              layout,
            ),
            [16, 16],
          )
      } finally {
        renderer.act(() => view?.unmount())
      }
    }
  } finally {
    dismiss.mock.restore()
  }
})

test('FileDropzone refreshes its actual box author across picker busy and completion', async () => {
  for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
    let gap = 16
    let reads = 0
    let picks = 0
    let resolvePick: (files: unknown[]) => void
    const selected: unknown[] = []
    const pickFiles = () => {
      picks++
      return new Promise<unknown[]>((resolve) => {
        resolvePick = resolve
      })
    }
    const own = Object.freeze({
      get gap() {
        reads++
        return gap
      },
    })
    const type = components[mode === 'Raw' ? 'RawFileDropzone' : `State${mode}FileDropzone`]
    const base = {
      ...baseProps.FileDropzone,
      pickFiles,
      onFilesSelected: (files) => selected.push(files),
    }
    const props =
      mode === 'Raw'
        ? { ...base, className: fileNames, style: own }
        : { base, own, runtimeNames: fileNames }
    let view: ReturnType<typeof renderer.create>
    const button = () => view.root.findByType('Pressable')
    const check = (busy: boolean) => {
      assert.equal(button().props.accessibilityState.busy, busy)
      for (const layout of gapLayouts)
        assert.deepEqual(yogaGapGeometry(stub.StyleSheet.flatten(button().props.style), layout), [
          gap,
          gap,
        ])
      for (const axis of ['gap', 'rowGap', 'columnGap'])
        assert.equal(
          stub.StyleSheet.flatten(button().findByType('Text').props.style)?.[axis],
          undefined,
        )
    }
    try {
      renderer.act(() => {
        view = renderer.create(react.createElement(type, props))
      })
      check(false)
      const initialReads = reads
      gap = 24
      let pending: Promise<void>
      renderer.act(() => {
        pending = button().props.onPress()
      })
      check(true)
      assert.ok(reads > initialReads)
      await renderer.act(async () => {
        await button().props.onPress()
      })
      assert.equal(picks, 1, 'busy activation cannot open a second picker')
      const busyReads = reads
      gap = 32
      const file = { name: 'notes.txt', size: 4, type: 'text/plain', uri: 'file:///notes.txt' }
      await renderer.act(async () => {
        resolvePick([file])
        await pending
      })
      check(false)
      assert.ok(reads > busyReads)
      assert.deepEqual(selected, [[file]])
    } finally {
      renderer.act(() => view?.unmount())
    }
  }
})
