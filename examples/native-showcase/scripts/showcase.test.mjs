import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../../../packages/compiler/src/index.ts'
import { transformHozoSource } from '../../../packages/metro/src/transform.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const require = createRequire(import.meta.url)

test('cold Native Storybook starts with a lightweight primitive, not implicit GPU work', () => {
  const { transformSync } = require('esbuild')
  const source = readFileSync(path.join(root, '.rnstorybook/index.tsx'), 'utf8')
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs' })
  const storage = { getItem() {}, setItem() {} }
  let options
  const view = {
    getStorybookUI(value) {
      options = value
      return 'Storybook'
    },
  }
  const module = { exports: {} }
  new Function('require', 'module', code)((name) => {
    if (name === '@react-native-async-storage/async-storage') return storage
    if (name === './storybook.requires') return { view }
    throw new Error(`Unexpected Storybook dependency: ${name}`)
  }, module)
  assert.equal(options.initialSelection, 'primitives-shared-showcase--buttons')
  assert.equal(options.storage.getItem, storage.getItem)
  assert.equal(module.exports.default, 'Storybook')
})

test('Native ThreeCanvas preserves GL host ancestry across responder/style updates', () => {
  const react = require('react')
  const { transformSync } = require('esbuild')
  const source = readFileSync(path.join(root, '../../packages/three/src/r3f-native.tsx'), 'utf8')
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' })
  const native = {
    View: 'NativeView',
    Text: 'NativeText',
    Pressable: 'NativePressable',
    StyleSheet: { create: (styles) => styles, absoluteFill: { position: 'absolute' } },
  }
  const module = { exports: {} }
  const load = (name) => {
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'react-native') return native
    if (name === '@react-three/fiber/native') return { Canvas: 'FiberCanvas' }
    if (name === '@hozo/engine/navigation') return { useHozoNavigation: () => undefined }
    if (name === './r3f-accessibility.ts') return {}
    throw new Error(`Unexpected Native ThreeCanvas dependency: ${name}`)
  }
  new Function('require', 'module', code)(load, module)
  const child = react.createElement('Animation')
  const onCreated = () => {}
  // Even an untyped caller cannot opt back into context-destroying flattening.
  const tree = module.exports.ThreeCanvas({
    accessibilityLabel: 'Assembly',
    frameloop: 'demand',
    onCreated,
    collapsable: true,
    children: child,
  })
  assert.equal(tree.type, native.View)
  assert.equal(tree.props.collapsable, false)
  const host = tree.props.children[0]
  assert.equal(host.props.collapsable, false)
  const canvas = react.Children.toArray(host.props.children).find(
    (node) => node.type === 'FiberCanvas',
  )
  assert.ok(canvas)
  assert.equal(canvas.props.collapsable, false)
  assert.equal(canvas.props.frameloop, 'demand')
  assert.equal(canvas.props.onCreated, onCreated)
  assert.equal(canvas.props.children, child)
})

test('Native Dialog isolates its modal without combining descendant controls', () => {
  // Inspect actual rendered props with inert hooks/native hosts. This guards
  // wiring, not VoiceOver behavior; the simulator run verifies the AX tree.
  const react = require('react')
  const { transformSync } = require('esbuild')
  const source = readFileSync(
    path.join(root, '../../packages/patterns/src/dialog.native.tsx'),
    'utf8',
  )
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' })
  const native = { Modal: 'NativeModal', View: 'NativeView' }
  const module = { exports: {} }
  const load = (name) => {
    if (name === 'react')
      return { ...react, useEffect: () => {}, useRef: (current) => ({ current }) }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'react-native') return native
    if (name === '@hozo/behaviors') return { shouldRestoreFocus: () => false }
    if (name === '@hozo/behaviors/native') return { moveAccessibilityFocus: () => {} }
    throw new Error(`Unexpected Native Dialog dependency: ${name}`)
  }
  new Function('require', 'module', code)(load, module)
  const controls = ['Confirm save', 'Cancel changes'].map((label) =>
    react.createElement('NativeButton', { key: label, accessibilityLabel: label }),
  )
  const onClose = () => {}
  const modal = module.exports.Dialog({
    open: true,
    onClose,
    accessibilityLabel: 'Save workspace changes',
    testID: 'confirmation',
    children: controls,
  })
  assert.equal(modal.type, native.Modal)
  assert.equal(modal.props.visible, true)
  assert.equal(modal.props.onRequestClose, onClose)
  const panel = modal.props.children
  assert.equal(panel.type, native.View)
  assert.equal(panel.props.accessible, false)
  assert.equal(panel.props.accessibilityViewIsModal, true)
  assert.equal(panel.props.accessibilityLabel, 'Save workspace changes')
  assert.equal(panel.props.testID, 'confirmation')
  assert.equal(panel.props.children, controls)
})

test('Storybook composes with the Hozo transformer and host singleton resolver', async () => {
  const config = await require('../metro.config.js')
  assert.equal(config.transformer.babelTransformerPath, require.resolve('@hozo/metro'))
  assert.equal(config.transformer.unstable_allowRequireContext, true)
  const context = {
    originModulePath: path.join(root, 'App.tsx'),
    resolveRequest: (_context, request) => ({ type: 'sourceFile', filePath: request }),
  }
  for (const platform of ['android', 'ios']) {
    const project = config.resolver.resolveRequest(context, '@hozo/engine/project', platform)
    assert.match(project.filePath, /\.hozo[/\\]candidates\.native\.js$/)
    for (const request of ['react', 'react-native', '@react-three/fiber/native', 'three']) {
      const resolved = config.resolver.resolveRequest(context, request, platform)
      assert.equal(resolved.filePath, require.resolve(request))
    }
  }
})

test('shared patterns keep platform-neutral bodies and lower their primitive children', () => {
  const file = path.join(root, '../showcase/src/patterns.tsx')
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /from ['"](?:react-native|@storybook\/[^'"]+)['"]|\b(?:window|document)\./,
  )
  const transformed = transformHozoSource(source, file)
  assert.ok(transformed)
  assert.doesNotMatch(transformed, /className=|<(?:Text|View|Heading|Paragraph)\b[^>]*className=/)
  assert.match(transformed, /restoreFocusTo=\{opener\}/)
  assert.match(transformed, /onCheckedChange=\{setNotifications\}/)
  assert.match(transformed, /onIndexChange=\{setSelected\}/)
  assert.match(transformed, /StyleSheet\.create/)
  for (const [, module] of transformed.matchAll(/from ['"](@hozo\/[^'"]+)['"]/g)) {
    assert.ok(
      createRequire(file).resolve(module),
      `shared source must declare generated dependency ${module}`,
    )
  }
})

test('shared bodies lower into Native styles, accessible controls and nested Text', () => {
  const file = path.join(root, '../showcase/src/index.tsx')
  const source = readFileSync(file, 'utf8')
  assert.doesNotMatch(
    source,
    /from ['"](?:react-native|@storybook\/[^'"]+)['"]|\b(?:window|document)\./,
  )
  const transformed = transformHozoSource(source, file)
  assert.ok(transformed)
  assert.doesNotMatch(
    transformed,
    /className=|from ['"]@hozo\/(?:primitives|typography)['"]|<(?:Button|Heading|Paragraph|Strong|Emphasis)\b/,
  )
  assert.match(transformed, /StyleSheet\.create/)
  assert.match(transformed, /accessibilityRole="header"/)
  assert.match(transformed, /accessibilityRole="button"/)
  assert.match(transformed, /accessibilityState=\{\{ disabled: Boolean\(disabled\) \}\}/)
  assert.match(transformed, /onChangeText=\{setName\}/)
  assert.match(transformed, /autoCorrect=\{false\}/)
  assert.match(transformed, /spellCheck=\{false\}/)
  assert.match(transformed, /fontStyle: 'italic'/)
  assert.match(transformed, /<Text[^>]+>strong text<\/Text>/)
  for (const [, module] of transformed.matchAll(/from ['"](@hozo\/[^'"]+)['"]/g)) {
    assert.ok(
      createRequire(file).resolve(module),
      `generated dependency ${module} must be installed beside its source package`,
    )
  }
})

test('the actual shared name field disables dictionary corrections without bypassing controlled input', () => {
  const react = require('react')
  const { transformSync } = require('esbuild')
  const file = path.join(root, '../showcase/src/index.tsx')
  const source = transformHozoSource(readFileSync(file, 'utf8'), file)
  const { code } = transformSync(source, { loader: 'tsx', format: 'cjs', jsx: 'automatic' })
  const module = { exports: {} }
  const states = ['', '']
  let stateIndex = 0
  const load = (name) => {
    if (name === 'react')
      return {
        ...react,
        useState: () => {
          const index = stateIndex++
          return [
            states[index],
            (value) => {
              states[index] = value
            },
          ]
        },
      }
    if (name === 'react/jsx-runtime') return require(name)
    if (name === 'react-native')
      return {
        View: 'View',
        Text: 'Text',
        TextInput: 'TextInput',
        Pressable: 'Pressable',
        StyleSheet: { create: (styles) => styles },
      }
    if (name === '@hozo/core/generated/pressable') return { HozoPressable: 'Pressable' }
    if (name === '@hozo/core/generated/text-input') return { HozoTextInput: 'TextInput' }
    if (name === './patterns.tsx') return {}
    throw new Error(`Unexpected form dependency: ${name}`)
  }
  new Function('require', 'module', code)(load, module)
  const render = () => {
    stateIndex = 0
    return react.Children.toArray(module.exports.FormDemo().props.children)
  }
  const input = render().find((child) => child.type === 'TextInput')
  assert.ok(input)
  assert.equal(input.props.autoCorrect, false)
  assert.equal(input.props.spellCheck, false)
  assert.equal(input.props.value, '')
  input.props.onChangeText('Hozo')
  const updated = render()
  assert.equal(updated.find((child) => child.type === 'TextInput').props.value, 'Hozo')
  const save = updated.find((child) => child.props.accessibilityRole === 'button')
  assert.ok(save)
  save.props.onPress()
  assert.equal(states[1], 'Hozo')
})

test('compiled Web autocorrection evaluates dynamic values once and keeps the platform default', () => {
  const { transformSync } = require('esbuild')
  const { renderToStaticMarkup } = require('react-dom/server')
  const compiler = createCompiler()
  for (const multiline of [false, true]) {
    const source = `import { TextInput } from '@hozo/primitives'
const field = <TextInput accessibilityLabel="Name" ${multiline ? 'multiline' : ''}
  autoCorrect={getCorrection()} />`
    const [web] = compiler.compile(source)
    const [native] = compiler.compileNative(source)
    assert.match(native.jsx, /autoCorrect=\{getCorrection\(\)\}/)
    assert.equal(native.jsx.match(/getCorrection\(\)/g).length, 1)
    const { code } = transformSync(`module.exports = (getCorrection) => (${web.jsx})`, {
      loader: 'jsx',
      format: 'cjs',
      jsx: 'automatic',
    })
    const module = { exports: {} }
    new Function('require', 'module', code)((name) => {
      if (name === 'react/jsx-runtime') return require(name)
      throw new Error(`Unexpected compiled field dependency: ${name}`)
    }, module)
    for (const value of [false, true, undefined]) {
      let calls = 0
      const html = renderToStaticMarkup(
        module.exports(() => {
          calls++
          return value
        }),
      )
      assert.equal(calls, 1)
      if (value === undefined) assert.doesNotMatch(html, /autoCorrect=/)
      else assert.match(html, new RegExp(`autoCorrect="${value ? 'on' : 'off'}"`))
    }
  }
})
