import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { tabsProbeOwnerShadow } from '../../../scripts/style-slots/tabs-owner-shadow.mjs'
import { createCompiler } from './index.ts'
import { previewOwnerLiteralCallers } from './owner-caller-plan.ts'
import { parseOwnerContractShadow } from './owner-contract.ts'

const compiler = createCompiler()

test('explicit Native partial preview keeps the original classes and refuses ambiguous sites', () => {
  const shadow = JSON.parse(
    readFileSync(
      new URL('../../../scripts/style-slots/owner-shadow.json', import.meta.url),
      'utf8',
    ),
  )
  shadow.contracts = [shadow.contracts[0]]
  const [handle] = shadow.contracts
  handle.shapes[0].inputs = { facts: [], splitText: false }
  handle.abi.nativePartial = { prop: 'hozoInteractiveHandleStyle', shape: 'resizable' }
  const handleOptions = {
    source: '@hozo/patterns',
    imported: 'BottomSheet',
    shadow: JSON.stringify(shadow),
  }
  const call = (attrs: string) =>
    `import {BottomSheet} from '@hozo/patterns'; export const A=()=> <BottomSheet ${attrs}/>`
  const recipe = 'handleClassName="p-2 opacity-100 hover:opacity-50"'
  const input = call(`handleStyle={author.value} ${recipe}`)
  const enabled = { ...handleOptions, experimentalNativePartial: true }
  const preview = (source: string) => previewOwnerLiteralCallers(source, compiler, enabled)
  assert.equal(previewOwnerLiteralCallers(input, compiler, handleOptions).code, input)
  const output = preview(input)
  assert.equal(output.findings[0]?.disposition, 'prepared-partial', JSON.stringify(output.findings))
  assert.ok(
    output.code.includes(`handleStyle={author.value} ${recipe} hozoInteractiveHandleStyle=`),
  )
  assert.equal(output.code.split('author.value').length, 2)
  assert.equal(output.code.split('.create(').length, 2)
  assert.equal(preview(output.code).code, output.code)
  for (const attrs of [
    `{...props} ${recipe}`,
    `${recipe} hozoHandleStyle={own}`,
    `${recipe} hozoInteractiveHandleStyle={own}`,
    'handleClassName={dynamic}',
  ]) {
    const source = call(attrs)
    assert.equal(preview(source).code, source)
  }
})
const options = { source: '@hozo/patterns', imported: 'Tabs', shadow: tabsProbeOwnerShadow }
const caller = (props: string) =>
  `import {Tabs as Choices} from '@hozo/patterns';export const A=()=> <Choices tabs={items} ${props}/>`
const classes =
  'p-2 text-[#112233] aria-selected:text-[#223344] disabled:opacity-50 hover:tracking-[1px]'
type TestShape = {
  inputs?: Record<string, unknown>
  events: unknown
  nativeHost: unknown
  webHost: unknown
}

test('an explicit full snapshot and split destination admit a stateful literal caller, not a nested callback', () => {
  const input = caller(`tabStyle={input.value} tabClassName="${classes}"`)
  const result = previewOwnerLiteralCallers(input, compiler, options)
  assert.deepEqual(result.diagnostics, [])
  assert.equal(result.findings[0]!.disposition, 'prepared-literal')
  assert.doesNotMatch(result.code, /tabClassName=/)
  assert.match(result.code, /tabStyle=\{input.value\} hozoTabStyle=\{__hozoOwnerPlan\d+\}/)
  assert.equal(result.code.split('input.value').length - 1, 1)
  assert.equal(result.code.split('.create(').length - 1, 1)
  assert.deepEqual(previewOwnerLiteralCallers(result.code, compiler, options).code, result.code)
})

test('missing destination or semantic inputs and contradictory shapes retain the whole original caller', () => {
  const input = caller(`tabClassName="${classes}"`)
  for (const change of [
    (shape: TestShape) => {
      delete shape.inputs
    },
    (shape: TestShape) => {
      shape.inputs!.splitText = false
    },
    (shape: TestShape) => {
      shape.inputs!.facts = ['disabled']
    },
  ]) {
    const shadow = JSON.parse(tabsProbeOwnerShadow)
    change(shadow.contracts[0].shapes[0])
    const result = previewOwnerLiteralCallers(input, compiler, {
      ...options,
      shadow: JSON.stringify(shadow),
    })
    assert.equal(result.code, input)
    assert.equal(result.findings[0]!.reason, 'shape-unassessed')
  }
  const shadow = JSON.parse(tabsProbeOwnerShadow)
  const other = structuredClone(shadow.contracts[0].shapes[0])
  other.id = 'other'
  delete other.inputs
  shadow.contracts[0].shapes.push(other)
  assert.equal(
    previewOwnerLiteralCallers(input, compiler, { ...options, shadow: JSON.stringify(shadow) })
      .code,
    input,
  )
  for (const props of [
    '{...base} tabClassName="p-2"',
    'tabClassName={input.value}',
    'tabClassName="p-2" hozoTabStyle={own}',
  ]) {
    const source = caller(props)
    assert.equal(previewOwnerLiteralCallers(source, compiler, options).code, source)
  }
})

test('state-input declarations are bounded symbolic data and require a complete actual control snapshot', () => {
  for (const change of [
    (shape: TestShape) => {
      shape.inputs!.facts = ['aria-checked']
    },
    (shape: TestShape) => {
      shape.inputs!.facts = ['disabled', 'disabled']
    },
    (shape: TestShape) => {
      shape.inputs!.splitText = 'true'
    },
    (shape: TestShape) => {
      shape.inputs!.evaluate = 'state => state'
    },
    (shape: TestShape) => {
      shape.events = ['pressed']
    },
    (shape: TestShape) => {
      shape.nativeHost = 'View'
      shape.webHost = 'div'
      shape.events = []
    },
  ]) {
    const shadow = JSON.parse(tabsProbeOwnerShadow)
    change(shadow.contracts[0].shapes[0])
    assert.throws(() => parseOwnerContractShadow(JSON.stringify(shadow)), /Invalid owner shadow/)
  }
})
