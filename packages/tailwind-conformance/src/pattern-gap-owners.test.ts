// Real Native pattern sources with stand-in RN hosts; selected gap values are
// laid out by upstream Yoga, not a claim about widget/device pixels or events.
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
type Owner = {
  component: string
  classProp: string
  styleProp: string
  base?: Record<string, unknown>
  hosts?: number
}
const owners = [
  ['Chip', 'className', 'style'],
  ['Chip', 'removeClassName', 'removeStyle'],
  ['Listbox', 'className', 'style'],
  ['Listbox', 'optionClassName', 'optionStyle'],
  ['Menu', 'className', 'style'],
  ['Menu', 'triggerClassName', 'triggerStyle'],
  ['Menu', 'menuClassName', 'menuStyle'],
  ['Menu', 'itemClassName', 'itemStyle'],
  ['Combobox', 'className', 'style'],
  ['Combobox', 'inputClassName', 'inputStyle'],
  ['Combobox', 'listClassName', 'listStyle'],
  ['Combobox', 'optionClassName', 'optionStyle'],
  ['Tabs', 'className', 'style'],
  ['Tabs', 'tabListClassName', 'tabListStyle'],
  ['Tabs', 'tabClassName', 'tabStyle'],
  ['Tabs', 'panelClassName', 'panelStyle'],
  ['Pagination', 'className', 'style'],
  ['Pagination', 'itemClassName', 'itemStyle', undefined, 3],
  ['Pagination', 'currentItemClassName', 'currentItemStyle'],
  ['Pagination', 'disabledItemClassName', 'disabledItemStyle', undefined, 2],
  [
    'Pagination',
    'ellipsisClassName',
    'ellipsisStyle',
    { pageCount: 20, page: 10, siblingCount: 0 },
    2,
  ],
  ['Stepper', 'className', 'style'],
  ['Stepper', 'stepClassName', 'stepStyle'],
  ['Stepper', 'currentStepClassName', 'currentStepStyle'],
  [
    'Stepper',
    'completedStepClassName',
    'completedStepStyle',
    { steps: [{ label: 'Done', status: 'completed' }] },
  ],
  [
    'Stepper',
    'errorStepClassName',
    'errorStepStyle',
    { steps: [{ label: 'Error', status: 'error' }] },
  ],
  ['Stepper', 'indicatorClassName', 'indicatorStyle'],
  ['Stepper', 'currentIndicatorClassName', 'currentIndicatorStyle'],
  [
    'Stepper',
    'completedIndicatorClassName',
    'completedIndicatorStyle',
    { steps: [{ label: 'Done', status: 'completed' }] },
  ],
  [
    'Stepper',
    'errorIndicatorClassName',
    'errorIndicatorStyle',
    { steps: [{ label: 'Error', status: 'error' }] },
  ],
  ['Stepper', 'descriptionClassName', 'descriptionStyle'],
].map(([component, classProp, styleProp, base, hosts]) => ({
  component,
  classProp,
  styleProp,
  base,
  hosts,
})) as Owner[]
const source = `import {Chip,Listbox,Menu,Combobox,Tabs,Pagination,Stepper} from '@hozo/core'
export {Chip as RawChip,Listbox as RawListbox,Menu as RawMenu,Combobox as RawCombobox,Tabs as RawTabs,Pagination as RawPagination,Stepper as RawStepper} from '@hozo/core'
${owners
  .flatMap(({ component, classProp, styleProp }, index) =>
    ['Literal', 'Opaque', 'Spread'].map(
      (mode) =>
        `export function ${mode}${index}({base,own,runtimeNames}) {return <${component} {...${mode === 'Spread' ? `{...base,${styleProp}:own}` : 'base'}} ${classProp}=${mode === 'Opaque' ? '{runtimeNames}' : JSON.stringify(names)} ${mode === 'Spread' ? '' : `${styleProp}={own}`}/>}`,
    ),
  )
  .join('\n')}`
const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.gap-owner-'))
const cache = openCandidateCache()
cache.scanFile('GapOwners.tsx', source, 1)
// The compiled literal owners do not need their classes in a fallback map.
// A separate data module supplies the choices opaque/raw callers can return.
cache.scanFile('GapChoices.ts', JSON.stringify(names), 1)
assert.deepEqual(
  cache
    .candidates()
    .filter((name) => names.split(' ').includes(name))
    .sort(),
  names.split(' ').sort(),
)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const hook = registerHooks({
  resolve(specifier, context, next) {
    return specifier === '@hozo/engine/project'
      ? { url: pathToFileURL(sheet).href, shortCircuit: true }
      : next(specifier, context)
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
  Chip: { defaultSelected: true, onRemove() {}, children: 'Token' },
  Listbox: { options: [{ value: 'a', label: 'A' }] },
  Menu: { trigger: 'Open', defaultOpen: true, items: [{ label: 'Action' }] },
  Combobox: { defaultOpen: true, options: [{ value: 'a', label: 'A' }], onValueChange() {} },
  Tabs: { tabs: [{ label: 'Tab', content: 'Panel' }] },
  Pagination: { pageCount: 1 },
  Stepper: { steps: [{ label: 'Step', description: 'Details' }], activeStep: 0, onStepPress() {} },
}
const authorInputs = [
  { id: 'no-gap-control', value: Object.freeze({ paddingBottom: 23 }), expected: [8, 4] },
  { id: 'generic', value: Object.freeze({ gap: 16, paddingBottom: 23 }), expected: [16, 16] },
  {
    id: 'nested-axis',
    value: [Object.freeze({ gap: 24, paddingBottom: 23 }), [false, Object.freeze({ rowGap: 6 })]],
    expected: [6, 24],
  },
]

test('raw patterns and compiled root/secondary slots project the author before composing class gap axes', () => {
  const mismatches: unknown[] = []
  let observations = 0
  for (const [index, { component, classProp, styleProp, base, hosts = 1 }] of owners.entries()) {
    for (const mode of ['Raw', 'Literal', 'Opaque', 'Spread']) {
      for (const author of authorInputs) {
        const type = components[mode === 'Raw' ? `Raw${component}` : `${mode}${index}`]
        const ownerProps = { ...baseProps[component], ...base }
        const props =
          mode === 'Raw'
            ? { ...ownerProps, [classProp]: names, [styleProp]: author.value }
            : { base: ownerProps, own: author.value, runtimeNames: names }
        let view: ReturnType<typeof renderer.create>
        renderer.act(() => {
          view = renderer.create(react.createElement(type, props))
        })
        try {
          const targets = view.root.findAll(
            (node) =>
              typeof node.type === 'string' &&
              ['View', 'Pressable', 'TextInput', 'ScrollView'].includes(node.type) &&
              stub.StyleSheet.flatten(node.props.style)?.paddingBottom === 23,
          )
          assert.equal(
            targets.length,
            hosts,
            `${component}.${styleProp}/${mode}: actual owner, not its label/ancestor`,
          )
          for (const target of targets) {
            const selected = stub.StyleSheet.flatten(target.props.style)
            for (const layout of gapLayouts) {
              const actual = yogaGapGeometry(selected, layout)
              if (JSON.stringify(actual) !== JSON.stringify(author.expected)) {
                mismatches.push({
                  component,
                  styleProp,
                  mode,
                  input: author.id,
                  layout,
                  expected: author.expected,
                  actual,
                })
              }
              observations++
            }
          }
        } finally {
          renderer.act(() => view.unmount())
        }
      }
    }
  }
  assert.equal(observations, 3360)
  assert.deepEqual(
    mismatches,
    [],
    `${mismatches.length}/${observations} owner gap observations differ`,
  )
})

test('Stepper does not inspect authored gap accessors on discarded status layers', () => {
  let reads = 0
  const inactive = Object.defineProperty({}, 'gap', {
    enumerable: true,
    get() {
      reads++
      throw new Error('an inactive status style was inspected')
    },
  })
  const props: Record<string, unknown> = {
    steps: [{ label: 'Next', status: 'upcoming' }],
    activeStep: 0,
    onStepPress() {},
  }
  for (const status of ['completed', 'current', 'error']) {
    props[`${status}StepStyle`] = inactive
    props[`${status}IndicatorStyle`] = inactive
  }
  let view: ReturnType<typeof renderer.create>
  try {
    renderer.act(() => {
      view = renderer.create(react.createElement(components.RawStepper, props))
    })
    const step = view.root.findByType('Pressable')
    stub.StyleSheet.flatten(step.props.style)
    assert.equal(reads, 0)
  } finally {
    renderer.act(() => view?.unmount())
  }
})
