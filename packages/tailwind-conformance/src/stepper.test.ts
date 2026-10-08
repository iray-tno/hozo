// `Stepper` (#150) on both platforms from the same source: each step's
// position and status said in words, the current one marked, the status
// styled by class lists the pattern applies. The Native half renders against
// the RN stub, not a device.

import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import test from 'node:test'
import { loadNativeModule, type Tree } from './native-render.ts'
import { renderWeb } from './render.ts'

const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const stub = require('react-native')
const { compile } = require('@hozo/compiler') as {
  compile: (source: string, filename?: string) => { jsx: string; css: string }[]
}
const webStepper = require('../../patterns/dist/stepper.js') as { HozoStepper: unknown }
const flat = (node: { props: Record<string, unknown> } | undefined) =>
  stub.StyleSheet.flatten([node?.props.style].flat(Infinity))

const STEPS = [
  { label: 'Account', description: 'Email and password' },
  { label: 'Profile' },
  { label: 'Payment', status: 'error' },
  { label: 'Confirm' },
]

const SOURCE = `
  import { Stepper } from '@hozo/core'
  export function C({ steps, onStepPress }) {
    return <Stepper steps={steps} activeStep={1} onStepPress={onStepPress}
      className="gap-2" stepClassName="px-2" currentStepClassName="bg-blue-50 text-blue-900"
      indicatorClassName="size-6 border" completedIndicatorClassName="bg-blue-600 text-white"
      currentIndicatorClassName="border-blue-600" errorIndicatorClassName="bg-red-600"
      descriptionClassName="text-xs" />
  }`

test('on the Web: an ordered list whose steps say where they stand, in words', () => {
  const [out] = compile(SOURCE, 'C.tsx')
  assert.ok(out, 'the Web compiler lowered nothing')
  const [{ html }] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoStepper: webStepper.HozoStepper,
    steps: STEPS,
    onStepPress: undefined,
  })
  assert.match(html, /^<ol aria-label="Progress" class="hozo-0" style="list-style:none">/, html)
  for (const sentence of [
    'Step 1 of 4: Account, completed',
    'Step 2 of 4: Profile, current',
    'Step 3 of 4: Payment, has an error',
    'Step 4 of 4: Confirm, not started',
  ]) {
    assert.ok(html.includes(sentence), `${sentence} is not in:\n${html}`)
  }
  // The current step is marked and gets its status class; the marks are hidden.
  assert.match(
    html,
    /<li aria-current="step" class="hozo-1 hozo-2" data-hozo-state="current">/,
    html,
  )
  assert.match(html, /<span aria-hidden="true" class="hozo-3 hozo-4">✓<\/span>/, html)
  assert.match(html, /<span aria-hidden="true" class="hozo-3 hozo-6">!<\/span>/, html)
  assert.doesNotMatch(html, /<button/, html)
})

test('on the Web with onStepPress: each step is a button carrying its class lists', () => {
  const [out] = compile(SOURCE, 'C.tsx')
  const [{ html }] = renderWeb([{ name: 'C', jsx: out.jsx }], {
    HozoStepper: webStepper.HozoStepper,
    steps: STEPS,
    onStepPress: () => {},
  })
  assert.match(
    html,
    /<li aria-current="step" data-hozo-state="current"><button type="button" class="hozo-1 hozo-2" data-hozo-state="current">/,
    html,
  )
})

function mount(props: Record<string, unknown>) {
  const { C } = loadNativeModule(SOURCE)
  let root: ReturnType<typeof renderer.create> | undefined
  renderer.act(() => {
    root = renderer.create(react.createElement(C, { steps: STEPS, ...props }))
  })
  return root
}

test('on Native: each step is one element named with its position and status, styled by status', () => {
  const root = mount({})
  const steps = root.root.findAll(
    (node: Tree) => node.type === 'View' && node.props.accessible === true,
  )
  assert.deepEqual(
    steps.map((node: Tree) => node.props.accessibilityLabel),
    [
      'Step 1 of 4: Account, completed',
      'Step 2 of 4: Profile, current',
      'Step 3 of 4: Payment, has an error',
      'Step 4 of 4: Confirm, not started',
    ],
  )
  assert.equal(steps[0].props.accessibilityHint, 'Email and password')
  assert.deepEqual(steps[1].props.accessibilityState, { selected: true })
  assert.ok(flat(steps[1]).backgroundColor, 'currentStepClassName missed the current step')
  assert.equal(flat(steps[0]).backgroundColor, undefined)
  const [, currentLabel] = steps[1].findAll((node: Tree) => node.type === 'Text')
  assert.ok(flat(currentLabel).color, "the current step's text colour missed its label")
  const indicator = (step: Tree) => step.findAll((node: Tree) => node.type === 'View')[1]
  assert.ok(flat(indicator(steps[0])).backgroundColor, 'completedIndicatorClassName missed it')
  assert.ok(flat(indicator(steps[2])).backgroundColor, 'errorIndicatorClassName missed it')
  assert.equal(flat(indicator(steps[3])).backgroundColor, undefined)
  renderer.act(() => root.unmount())
})

test('on Native with onStepPress: buttons, and a press says which step', () => {
  const pressed: number[] = []
  const root = mount({ onStepPress: (index: number) => pressed.push(index) })
  const buttons = root.root.findAll((node: Tree) => node.type === 'Pressable')
  assert.equal(buttons.length, 4)
  assert.equal(buttons[0].props.accessibilityRole, 'button')
  renderer.act(() => (buttons[0].props.onPress as () => void)())
  assert.deepEqual(pressed, [0])
  renderer.act(() => root.unmount())
})
