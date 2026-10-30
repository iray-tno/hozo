// Public Native form sources and real project candidates. Stand-in hosts and
// fixed Yoga layouts establish composition, not device/picker geometry.
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
  ['Calendar', 'className', 'style', { View: 1 }],
  ['Calendar', 'headerClassName', 'headerStyle', { View: 1 }],
  ['Calendar', 'dayClassName', 'dayStyle', { Pressable: 42 }],
  ['Calendar', 'monthButtonClassName', 'monthButtonStyle', { Pressable: 2 }],
  ['TimePicker', 'className', 'style', { View: 1 }],
  ['TimePicker', 'fieldClassName', 'fieldStyle', { View: 2, Pressable: 1 }],
  ['TimePicker', 'periodClassName', 'fieldStyle', { View: 2, Pressable: 1 }],
  ['TimePicker', 'stepClassName', 'stepStyle', { Pressable: 4 }],
] as const
// Form is opt-in passthrough, not a default semantic lowering source. The
// independent primitive activates actual Metro without replacing form APIs.
const source = `import {View} from '@hozo/core'
import {Calendar,TimePicker} from '@hozo/form'
export {Calendar as RawCalendar,TimePicker as RawTimePicker} from '@hozo/form'
export function Anchor(){return <View/>}
${owners
  .flatMap(([component, classProp, styleProp], index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}){return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.calendar-gap-'))
const cache = openCandidateCache()
cache.scanFile('Owners.tsx', source, 1)
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
const hook = registerHooks({
  resolve(specifier, context, next) {
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
  Calendar: {
    defaultMonth: { year: 2026, month: 10 },
    today: { year: 2026, month: 10, day: 15 },
    value: { year: 2026, month: 10, day: 15 },
    weeks: 6,
    firstDayOfWeek: 0,
    locale: 'en-US',
    accessibilityLabel: 'Date',
  },
  TimePicker: {
    defaultValue: { hour: 9, minute: 30 },
    hour12: true,
    locale: 'en-US',
    accessibilityLabel: 'Time',
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

test('Calendar and TimePicker public owners compose authored gap axes without borrowing sibling classes', () => {
  let observations = 0
  const mismatches: unknown[] = []
  for (const [index, [component, classProp, styleProp, hostCounts]] of owners.entries())
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread'])
      for (const author of authors) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `${mode}${index}`]
        assert.notEqual(type, undefined)
        const props =
          mode === 'Raw'
            ? { ...baseProps[component], [classProp]: names, [styleProp]: author.own }
            : { base: baseProps[component], own: author.own, runtimeNames: names }
        if (mode !== 'Raw')
          assert.equal(
            (type as (props: unknown) => { type: unknown })(props).type,
            components[`Raw${component}`],
          )
        let view: ReturnType<typeof renderer.create>
        const before = JSON.stringify(author.own)
        try {
          renderer.act(() => {
            view = renderer.create(react.createElement(type, props))
          })
          const targets = view.root.findAll(
            (node) =>
              ['View', 'Pressable'].includes(node.type) &&
              stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
          )
          assert.equal(
            targets.length,
            Object.values(hostCounts).reduce((a, b) => a + b, 0),
            `${component}.${styleProp}/${classProp}/${mode}: all actual owners`,
          )
          for (const [host, count] of Object.entries(hostCounts))
            assert.equal(targets.filter((node) => node.type === host).length, count)
          for (const target of targets) {
            if (styleProp === 'dayStyle') {
              assert.equal(target.props.accessibilityRole, 'button')
              assert.equal(typeof target.props.accessibilityState.selected, 'boolean')
            }
            if (styleProp === 'monthButtonStyle' || styleProp === 'stepStyle')
              assert.equal(target.props.accessibilityRole, 'button')
            if (
              component === 'TimePicker' &&
              styleProp === 'fieldStyle' &&
              target.type === 'Pressable'
            )
              assert.equal(target.props.accessibilityLabel, 'AM or PM')
            if (component === 'Calendar' && styleProp === 'style')
              assert.equal(target.props.accessibilityRole, 'grid')
            for (const label of target.findAllByType('Text'))
              for (const axis of ['gap', 'rowGap', 'columnGap'])
                assert.equal(stub.StyleSheet.flatten(label.props.style)?.[axis], undefined)
            // fieldStyle is deliberately shared with the period, but the field
            // group and period class lists belong to different Web owners.
            const unclassed =
              component === 'TimePicker' &&
              styleProp === 'fieldStyle' &&
              ((classProp === 'fieldClassName' && target.type === 'Pressable') ||
                (classProp === 'periodClassName' && target.type === 'View'))
            const expected = author.id === 'no-gap' && unclassed ? [0, 0] : author.expected
            for (const layout of gapLayouts) {
              const actual = yogaGapGeometry(stub.StyleSheet.flatten(target.props.style), layout)
              if (JSON.stringify(actual) !== JSON.stringify(expected))
                mismatches.push({
                  component,
                  classProp,
                  mode,
                  author: author.id,
                  host: target.type,
                  layout,
                  expected,
                  actual,
                })
              observations++
            }
          }
          assert.equal(JSON.stringify(author.own), before)
        } finally {
          renderer.act(() => view?.unmount())
        }
      }
  assert.equal(observations, 5472)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} calendar/time gap differences`,
  )
})
