// Field's labels and wrappers are non-controls on the Web. They must not
// borrow the callback child's disabled state; RN hosts here are stand-ins.
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire, registerHooks } from 'node:module'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createCompiler, openCandidateCache } from '@hozo/compiler'
import { loadNativeModule } from './native-render.ts'

const root = fileURLToPath(new URL('../../../', import.meta.url))
const project = mkdtempSync(path.join(root, 'packages/tailwind-conformance/.field-slots-'))
const names = 'read-only:opacity-50 disabled:mt-8 enabled:mb-8 aria-checked:ml-8'
const props = [
  'className',
  'labelClassName',
  'requiredClassName',
  'descriptionClassName',
  'errorClassName',
]
const source = `
  import {View} from '@hozo/core'
  import {Field} from '@hozo/form'
  export const Anchor = () => <View/>
  export const Literal = ({base}) => <Field {...base} ${props.map((name) => `${name}="${names}"`).join(' ')}/>
  export const Opaque = ({base, classes}) => <Field {...base} ${props.map((name) => `${name}={classes()}`).join(' ')}/>
`
const cache = openCandidateCache()
cache.scanFile('Field.tsx', source, 1)
const sheet = path.join(project, 'node_modules/.hozo/candidates.native.js')
mkdirSync(path.dirname(sheet), { recursive: true })
writeFileSync(sheet, cache.renderNativeModule())
const hook = registerHooks({
  resolve(specifier, context, next) {
    if (specifier === '@hozo/engine/project')
      return { url: pathToFileURL(sheet).href, shortCircuit: true }
    if (specifier === '@hozo/form')
      return {
        url: new URL('../../form/src/index.native.ts', import.meta.url).href,
        shortCircuit: true,
      }
    return next(specifier, context)
  },
})
after(() => {
  hook.deregister()
  rmSync(project, { recursive: true, force: true })
})
const require = createRequire(import.meta.url)
const react = require('react')
const renderer = require('react-test-renderer')
const { StyleSheet } = require('react-native')
const components = loadNativeModule(source, project, { root: project, compiler: createCompiler() })

for (const mode of ['Literal', 'Opaque']) {
  test(`Field ${mode} keeps all five styling owners read-only, not the disabled child`, () => {
    let view: ReturnType<typeof renderer.create>
    renderer.act(() => {
      view = renderer.create(
        react.createElement(components[mode], {
          base: {
            label: 'Name',
            required: true,
            description: 'Description',
            error: 'Error',
            children: (control) =>
              react.createElement('TextInput', { ...control, editable: false }),
          },
          classes: () => names,
        }),
      )
    })
    try {
      const hosts = view.root.findAll((node) => ['View', 'Text'].includes(node.type))
      assert.equal(hosts.length, 5)
      for (const host of hosts)
        assert.deepEqual(StyleSheet.flatten(host.props.style), { opacity: 0.5 })
      const input = view.root.findByType('TextInput')
      assert.equal(input.props.accessibilityLabel, 'Name')
      assert.match(input.props.accessibilityHint, /Error.*Description/)
      assert.equal(input.props.editable, false)
    } finally {
      renderer.act(() => view.unmount())
    }
  })
}
