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
const controlNames =
  'gap-y-[8px] gap-x-[2px] hover:gap-x-[4px] active:gap-y-[12px] focus:gap-y-[6px] disabled:gap-x-[14px] read-only:opacity-50 aria-expanded:gap-x-[30px]'
const optionNames =
  'gap-y-[8px] gap-x-[2px] active:gap-y-[12px] disabled:gap-x-[14px] aria-selected:gap-x-[10px]'
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
  .join('\n')}
${['Literal', 'Opaque', 'Spread']
  .map(
    (mode) =>
      `export function State${mode}({base,own,runtimeNames}) {return <NativeSelect {...${mode === 'Spread' ? '{...base,style:own,optionStyle:own}' : 'base'}} className=${mode === 'Opaque' ? '{runtimeNames.control}' : JSON.stringify(controlNames)} optionClassName=${mode === 'Opaque' ? '{runtimeNames.option}' : JSON.stringify(optionNames)} ${mode === 'Spread' ? '' : 'style={own} optionStyle={own}'}/>}`,
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.select-gap-'))
const cache = openCandidateCache()
cache.scanFile('SelectOwners.tsx', source, 1)
const choices = [...new Set(`${names} ${controlNames} ${optionNames}`.split(' '))]
cache.scanFile('Choices.ts', JSON.stringify(choices), 1)
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
const rows = (view) =>
  view.root.findAll(
    (node) => node.type === 'Pressable' && node.props.accessibilityRole === 'menuitem',
  )
const selectionOptions = [...baseProps.options, { value: 'c', label: 'Gamma' }]

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

test('select control events and actual row snapshots preserve gap authors through selection changes', () => {
  const platform = stub.Platform.OS
  stub.Platform.OS = 'android'
  let observations = 0
  try {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        const changes: string[] = []
        let base = {
          ...baseProps,
          options: selectionOptions,
          onValueChange: (value: string) => changes.push(value),
        }
        const type = components[mode === 'Raw' ? 'RawSelect' : `State${mode}`]
        const element = () =>
          react.createElement(
            type,
            mode === 'Raw'
              ? {
                  ...base,
                  className: controlNames,
                  optionClassName: optionNames,
                  style: author.own,
                  optionStyle: author.own,
                }
              : {
                  base,
                  own: author.own,
                  runtimeNames: { control: controlNames, option: optionNames },
                },
          )
        let view: ReturnType<typeof renderer.create>
        const checkControl = (control: readonly number[]) => {
          const style = stub.StyleSheet.flatten(trigger(view).props.style)
          assert.equal(style.opacity, 0.5, 'a select remains read-only, not an editable input')
          for (const layout of gapLayouts) {
            assert.deepEqual(
              yogaGapGeometry(style, layout),
              author.id === 'no-gap' ? control : author.expected,
            )
            observations++
          }
        }
        const checkRows = (selected: string) => {
          assert.equal(rows(view).length, 3)
          for (const [index, row] of rows(view).entries()) {
            const option = selectionOptions[index]
            assert.equal(row.props.accessibilityState.selected, option.value === selected)
            assert.equal(Boolean(row.props.disabled), Boolean(option.disabled))
            // These are the existing RN style callbacks with supplied pressed
            // snapshots, not invented hover/focus events on fallback rows.
            for (const pressed of [false, true]) {
              const style = stub.StyleSheet.flatten(row.props.style({ pressed }))
              const expected =
                author.id === 'no-gap'
                  ? [
                      pressed && !option.disabled ? 12 : 8,
                      option.disabled ? 14 : option.value === selected ? 10 : 2,
                    ]
                  : author.expected
              for (const layout of gapLayouts) {
                assert.deepEqual(yogaGapGeometry(style, layout), expected)
                observations++
              }
            }
            for (const axis of ['gap', 'rowGap', 'columnGap'])
              assert.equal(
                stub.StyleSheet.flatten(row.findByType('Text').props.style)?.[axis],
                undefined,
              )
          }
        }
        try {
          renderer.act(() => {
            view = renderer.create(element())
          })
          for (const [event, expected] of [
            [undefined, [8, 2]],
            ['onHoverIn', [8, 4]],
            ['onPressIn', [12, 4]],
            ['onPressOut', [8, 4]],
            ['onHoverOut', [8, 2]],
            ['onFocus', [6, 2]],
            ['onBlur', [8, 2]],
            ['onFocus', [6, 2]],
          ] as const) {
            if (event) renderer.act(() => trigger(view).props[event]({ nativeEvent: {} }))
            checkControl(expected)
          }
          base = { ...base, disabled: true }
          renderer.act(() => view.update(element()))
          assert.equal(trigger(view).props.disabled, true)
          checkControl([8, 14])
          base = { ...base, disabled: false }
          renderer.act(() => view.update(element()))
          checkControl([8, 2])
          renderer.act(() => trigger(view).props.onPress())
          assert.equal(trigger(view).props.accessibilityState.expanded, true)
          const openControl = stub.StyleSheet.flatten(trigger(view).props.style)
          for (const layout of gapLayouts)
            assert.deepEqual(
              yogaGapGeometry(openControl, layout),
              author.id === 'no-gap' ? [8, 2] : author.expected,
              'Native expanded state must not invent a Web aria-expanded style predicate',
            )
          checkRows('a')
          renderer.act(() => rows(view)[2].props.onPress())
          assert.equal(view.root.findByType('Modal').props.visible, false)
          assert.equal(rows(view).length, 0)
          assert.equal(trigger(view).props.accessibilityValue.text, 'Gamma')
          assert.deepEqual(changes, ['c'])
          renderer.act(() => trigger(view).props.onPress())
          checkRows('c')
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  } finally {
    stub.Platform.OS = platform
  }
  assert.equal(observations, 2112)
})

test('fallback gap authors stay lazy while closed and fresh in the actual option callback', () => {
  const platform = stub.Platform.OS
  stub.Platform.OS = 'android'
  try {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
      let readable = false
      const gaps = [20, 28, 16, 24]
      const reads = [0, 0, 0, 0]
      const own = (at: number, extra = {}) =>
        Object.freeze({
          ...extra,
          get gap() {
            if (at > 0) assert.equal(readable, true, 'unused popup author was evaluated')
            reads[at]++
            return gaps[at]
          },
        })
      const base = {
        ...baseProps,
        options: selectionOptions,
        sheetClassName: names,
        sheetStyle: own(1, { color: '#334455', fontWeight: '600' }),
        scrimClassName: names,
        scrimStyle: own(2),
        optionClassName: names,
        optionStyle: own(3, { color: '#556677' }),
        textStyle: { color: '#778899', fontSize: 22 },
      }
      const control = own(0)
      const type = components[mode === 'Raw' ? 'RawSelect' : `${mode}0`]
      const props =
        mode === 'Raw'
          ? { ...base, className: names, style: control }
          : { base, own: control, runtimeNames: names }
      let view: ReturnType<typeof renderer.create>
      const check = () => {
        const sheet = view.root.findAll(
          (node) => node.type === 'View' && node.props.accessibilityViewIsModal,
        )
        const scrim = view.root.findAll(
          (node) => node.type === 'Pressable' && node.props.accessibilityElementsHidden,
        )
        assert.equal(sheet.length, 1)
        assert.equal(scrim.length, 1)
        assert.equal(rows(view).length, 3)
        for (const [node, gap] of [
          [trigger(view), gaps[0]],
          [sheet[0], gaps[1]],
          [scrim[0], gaps[2]],
          ...rows(view).map((row) => [row, gaps[3]]),
        ])
          for (const layout of gapLayouts)
            assert.deepEqual(yogaGapGeometry(stub.StyleSheet.flatten(node.props.style), layout), [
              gap,
              gap,
            ])
        const label = stub.StyleSheet.flatten(rows(view)[0].findByType('Text').props.style)
        assert.equal(label.color, '#778899')
        assert.equal(label.fontWeight, '600')
        assert.equal(label.fontSize, 22)
        for (const axis of ['gap', 'rowGap', 'columnGap']) assert.equal(label[axis], undefined)
      }
      try {
        renderer.act(() => {
          view = renderer.create(react.createElement(type, props))
        })
        assert.deepEqual(reads.slice(1), [0, 0, 0])
        assert.equal(rows(view).length, 0)
        readable = true
        renderer.act(() => trigger(view).props.onPress())
        check()
        const beforeSnapshot = [...reads]
        gaps[3] = 32
        const snapshot = stub.StyleSheet.flatten(rows(view)[2].props.style({ pressed: true }))
        for (const layout of gapLayouts)
          assert.deepEqual(yogaGapGeometry(snapshot, layout), [32, 32])
        assert.deepEqual(
          reads,
          [beforeSnapshot[0], beforeSnapshot[1], beforeSnapshot[2], beforeSnapshot[3] + 1],
          'the real row callback evaluates its author, not a parent-cached copy',
        )
        readable = false
        const beforeClose = reads.slice(1)
        renderer.act(() => view.root.findByType('Modal').props.onRequestClose())
        assert.deepEqual(reads.slice(1), beforeClose)
        assert.equal(rows(view).length, 0)
        gaps.splice(0, 4, 24, 32, 28, 36)
        readable = true
        renderer.act(() => trigger(view).props.onPress())
        check()
        const sheet = view.root.findAll(
          (node) => node.type === 'View' && node.props.accessibilityViewIsModal,
        )[0]
        readable = false
        const beforeEscape = reads.slice(1)
        renderer.act(() =>
          sheet.props.onAccessibilityAction({ nativeEvent: { actionName: 'escape' } }),
        )
        assert.equal(view.root.findByType('Modal').props.visible, false)
        assert.equal(rows(view).length, 0)
        assert.deepEqual(reads.slice(1), beforeEscape)
      } finally {
        renderer.act(() => view?.unmount())
      }
    }
  } finally {
    stub.Platform.OS = platform
  }
})

test('application and iOS picker routing never evaluates unused fallback gap authors', () => {
  const platform = stub.Platform.OS
  const actionSheets: { options: Record<string, unknown>; choose: (index: number) => void }[] = []
  const actionSheet = mock.method(
    stub.ActionSheetIOS,
    'showActionSheetWithOptions',
    (options, choose) => actionSheets.push({ options, choose }),
  )
  const unused = Object.freeze({
    get gap() {
      throw new Error('system/presenter fallback author was evaluated')
    },
  })
  try {
    for (const path of ['presenter-android', 'presenter-ios', 'system-ios'])
      for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
        stub.Platform.OS = path.endsWith('ios') ? 'ios' : 'android'
        actionSheets.length = 0
        const requests: {
          options: unknown[]
          value: string
          onSelect: (value: string) => void
          onCancel: () => void
        }[] = []
        const changes: string[] = []
        const base = {
          ...baseProps,
          options: selectionOptions,
          sheetClassName: names,
          sheetStyle: unused,
          scrimClassName: names,
          scrimStyle: unused,
          optionClassName: names,
          optionStyle: unused,
          onValueChange: (value: string) => changes.push(value),
        }
        const type = components[mode === 'Raw' ? 'RawSelect' : `${mode}0`]
        const own = Object.freeze({ gap: 16 })
        const element = (disabled = false) => {
          const child = react.createElement(
            type,
            mode === 'Raw'
              ? { ...base, disabled, className: names, style: own }
              : { base: { ...base, disabled }, own, runtimeNames: names },
          )
          return path.startsWith('presenter')
            ? react.createElement(
                components.SelectProvider,
                { presenter: { present: (request) => requests.push(request) } },
                child,
              )
            : child
        }
        let view: ReturnType<typeof renderer.create>
        try {
          renderer.act(() => {
            view = renderer.create(element())
          })
          renderer.act(() => trigger(view).props.onPress())
          if (path.startsWith('presenter')) {
            assert.equal(requests.length, 1)
            assert.equal(requests[0].options, selectionOptions)
            assert.equal(requests[0].value, 'a')
            assert.equal(
              actionSheets.length,
              0,
              'an application presenter takes precedence on iOS too',
            )
            renderer.act(() => requests[0].onCancel())
            assert.equal(trigger(view).props.accessibilityValue.text, 'Alpha')
            renderer.act(() => requests[0].onSelect('c'))
          } else {
            assert.equal(actionSheets.length, 1)
            assert.deepEqual(actionSheets[0].options, {
              title: 'Delivery',
              options: ['Alpha', 'Gamma', 'Cancel'],
              cancelButtonIndex: 2,
            })
            renderer.act(() => actionSheets[0].choose(2))
            assert.deepEqual(changes, [])
            renderer.act(() => trigger(view).props.onPress())
            renderer.act(() => actionSheets[1].choose(1))
          }
          assert.equal(trigger(view).props.accessibilityValue.text, 'Gamma')
          assert.deepEqual(changes, ['c'])
          assert.equal(view.root.findByType('Modal').props.visible, false)
          assert.equal(rows(view).length, 0)
          for (const layout of gapLayouts)
            assert.deepEqual(
              yogaGapGeometry(stub.StyleSheet.flatten(trigger(view).props.style), layout),
              [16, 16],
            )
          renderer.act(() => view.update(element(true)))
          const before = [requests.length, actionSheets.length]
          renderer.act(() => trigger(view).props.onPress())
          assert.deepEqual(
            [requests.length, actionSheets.length],
            before,
            'disabled controls do not invoke either transport',
          )
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  } finally {
    actionSheet.mock.restore()
    stub.Platform.OS = platform
  }
})
