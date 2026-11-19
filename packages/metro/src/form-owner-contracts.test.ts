import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'
import { createCompiler } from '@hozo/compiler'
import { TailwindProjectSession } from '@hozo/compiler/project'
import * as esbuild from 'esbuild'
import { transformHozoSource, transformHozoSourceOrPrepare } from './transform.ts'

const formRequire = createRequire(new URL('../../form/package.json', import.meta.url))
const React = formRequire('react') as typeof import('react')
const { renderToStaticMarkup } = formRequire(
  'react-dom/server',
) as typeof import('react-dom/server')

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

function flattenStyle(style: unknown): Record<string, unknown> {
  if (!style) return {}
  if (Array.isArray(style)) return Object.assign({}, ...style.map(flattenStyle))
  if (typeof style === 'object') return { ...(style as Record<string, unknown>) }
  return {}
}

function loadNativeFormModule(
  relativeFile: string,
  options: { hozoClasses: (value?: string, facts?: unknown) => unknown },
) {
  const fullPath = path.join(root, 'packages/form/src', relativeFile)
  const source = readFileSync(fullPath, 'utf8')
  const { code } = esbuild.transformSync(source, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: fullPath,
  })
  const captured: { host: string; props: Record<string, unknown> }[] = []
  const host = (name: string) => (props: Record<string, unknown>) => {
    captured.push({ host: name, props })
    return React.createElement(`rn-${name.toLowerCase()}`, null, props.children as React.ReactNode)
  }
  const rn = {
    View: host('View'),
    Pressable: host('Pressable'),
    Text: host('Text'),
    StyleSheet: {
      create: <T>(styles: T) => styles,
      flatten: flattenStyle,
    },
    Keyboard: { dismiss: () => {} },
    AccessibilityInfo: { announceForAccessibility: () => {} },
  }
  let interactionState = { hovered: false, pressed: false, focused: false, focusVisible: false }
  const cache = new Map<string, unknown>()
  const localRequire = (specifier: string): unknown => {
    if (specifier === 'react') return React
    if (specifier === 'react-native') return rn
    if (specifier === '@hozo/engine/project') return { hozoClasses: options.hozoClasses }
    if (specifier === '@hozo/engine/generated/gap-styles')
      return { hozoAuthoredStyle: (s: unknown) => s }
    if (specifier === '@hozo/engine') {
      return {
        hozoSplitTextStyle: (style: Record<string, unknown>) => {
          const textKeys = new Set([
            'color',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'letterSpacing',
            'textAlign',
            'textTransform',
          ])
          const box: Record<string, unknown> = {}
          const text: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(style ?? {})) {
            if (textKeys.has(k)) text[k] = v
            else box[k] = v
          }
          return [box, text]
        },
      }
    }
    if (specifier === '@hozo/behaviors') {
      return {
        hozoTextChildren: (children: React.ReactNode, style: Record<string, unknown>) =>
          typeof children === 'string'
            ? React.createElement(rn.Text as unknown as React.ComponentType, { style }, children)
            : children,
        useHozoMessage: () => (key: string) => key,
        useHozoI18n: () => ({ locale: 'en-US' }),
      }
    }
    if (specifier === '@hozo/behaviors/pressable-interaction') {
      return {
        usePressableInteraction: () => ({
          state: interactionState,
          handlers: {
            hoverIn: () => {},
            hoverOut: () => {},
            focus: () => {},
            blur: () => {},
            pressIn: () => {},
            pressOut: () => {},
            pointerDown: () => {},
            keyDown: () => {},
          },
        }),
      }
    }
    if (specifier.startsWith('.')) {
      const target = path.resolve(path.dirname(fullPath), specifier)
      if (!cache.has(target)) {
        const sub = esbuild.transformSync(readFileSync(target, 'utf8'), {
          loader: target.endsWith('.tsx') ? 'tsx' : 'ts',
          format: 'cjs',
          jsx: 'transform',
          jsxFactory: 'React.createElement',
          jsxFragment: 'React.Fragment',
          sourcefile: target,
        })
        const mod = { exports: {} as Record<string, unknown> }
        runInNewContext(sub.code, {
          module: mod,
          exports: mod.exports,
          require: localRequire,
          React,
        })
        cache.set(target, mod.exports)
      }
      return cache.get(target)
    }
    throw new Error(`Unexpected require in Native form harness: ${specifier}`)
  }
  const mod = { exports: {} as Record<string, unknown> }
  runInNewContext(code, {
    module: mod,
    exports: mod.exports,
    require: localRequire,
    React,
    console,
  })
  return {
    exports: mod.exports,
    captured,
    setInteraction: (next: typeof interactionState) => {
      interactionState = next
    },
  }
}

test('ordinary Native transform compiles Form, SubmitButton and FileDropzone literals to prepared props by default', () => {
  const compiler = createCompiler()
  const source = `import { View } from '@hozo/core'
import { Form, SubmitButton, FileDropzone } from '@hozo/form'
export function Screen({ dynamic, extra }: { dynamic: string; extra: Record<string, unknown> }) {
  return (
    <View className="p-2">
      <Form className="pt-3 gap-4">
        <FileDropzone accessibilityLabel="Upload" className="p-4 hover:bg-[#223344] disabled:opacity-50" activeClassName="border-red-500">
          Drop
        </FileDropzone>
        <SubmitButton className="px-4 py-2 text-[#ffffff] disabled:bg-[#556677]">Save</SubmitButton>
        <SubmitButton className={dynamic}>Dyn</SubmitButton>
        <SubmitButton {...extra} className="p-6">Spread</SubmitButton>
      </Form>
    </View>
  )
}
`
  const output = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(output)
  assert.match(output, /hozoFormStyle=\{__hozoOwner0_Plan\d+\}/)
  assert.match(output, /hozoSubmitButtonStyle=\{__hozoOwner1_Plan\d+\}/)
  assert.match(output, /hozoFileDropzoneStyle=\{__hozoOwner2_Plan\d+\}/)
  assert.doesNotMatch(output, /className="pt-3 gap-4"/)
  assert.doesNotMatch(output, /className="p-4 hover:bg-\[#223344\] disabled:opacity-50"/)
  assert.doesNotMatch(output, /className="px-4 py-2 text-\[#ffffff\] disabled:bg-\[#556677\]"/)
  assert.match(output, /activeClassName="border-red-500"/)
  assert.match(output, /className=\{dynamic\}/)
  assert.match(output, /\{\.\.\.extra\} className="p-6"/)
})

test('transformHozoSourceOrPrepare collects audited form owner candidates and emits prepared props', async () => {
  const compiler = createCompiler()
  const source = `import { Form, SubmitButton } from '@hozo/form'
export function Screen() {
  return (
    <Form className="pt-3">
      <SubmitButton className="p-4">Go</SubmitButton>
    </Form>
  )
}
`
  const attempt = transformHozoSourceOrPrepare(source, '/app/Screen.tsx', '/app', compiler)
  assert.equal(attempt.kind, 'prepared')
  assert.ok(attempt.module.candidates.includes('pt-3'))
  assert.ok(attempt.module.candidates.includes('p-4'))
  const session = new TailwindProjectSession(compiler, async (names) =>
    JSON.stringify({
      schema: 1,
      policy: 'tailwind-rule-signatures-v1',
      tailwindVersion: 'owner-lifecycle-test',
      fingerprint: 'a'.repeat(64),
      stylesheets: [],
      candidates: names.map((candidate, id) => ({
        id,
        candidate,
        status: 'described',
        firstRuleRank: null,
        rules: [
          {
            id,
            candidateId: id,
            variantOrder: '0',
            important: false,
            propertyOrder: [270],
            declarationCount: 1,
            shape: {
              kind: 'rule',
              selector: `.${candidate}`,
              nodes: [{ kind: 'declaration', property: 'padding', important: false }],
            },
          },
        ],
      })),
    }),
  )
  const [emitted] = await session.emit(
    '/app/Screen.tsx',
    [() => attempt.module],
    attempt.module.candidates,
  )
  assert.ok(emitted)
  assert.match(emitted, /hozoFormStyle=\{/)
  assert.match(emitted, /hozoSubmitButtonStyle=\{/)
})

test('Native Form, SubmitButton and FileDropzone deliver prepared marker styles to their declared hosts without calling hozoClasses (#2045)', () => {
  const compiler = createCompiler()
  const source = `import { Form, SubmitButton, FileDropzone } from '@hozo/form'
export function Screen({ disabled }: { disabled?: boolean }) {
  return (
    <Form className="pt-3">
      <SubmitButton disabled={disabled} className="pt-5 text-[#112233] disabled:bg-[#556677]">
        Save
      </SubmitButton>
      <FileDropzone
        accessibilityLabel="Upload"
        pickFiles={async () => null}
        disabled={disabled}
        className="pt-6 text-[#223344] disabled:bg-[#667788]"
      >
        Drop
      </FileDropzone>
    </Form>
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  const { code } = esbuild.transformSync(transformed, {
    loader: 'tsx',
    format: 'cjs',
    jsx: 'transform',
    jsxFactory: 'React.createElement',
    jsxFragment: 'React.Fragment',
    sourcefile: '/app/Screen.tsx',
  })

  let classResolverCalls = 0
  const spyHozoClasses = () => {
    classResolverCalls++
    return { paddingBottom: 99 }
  }
  const formMod = loadNativeFormModule('form.native.tsx', { hozoClasses: spyHozoClasses })
  const submitMod = loadNativeFormModule('submit-button.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const dropzoneMod = loadNativeFormModule('file-dropzone.native.tsx', {
    hozoClasses: spyHozoClasses,
  })

  const screenMod = { exports: {} as { Screen: React.ComponentType<{ disabled?: boolean }> } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') {
        return { StyleSheet: { create: <T>(styles: T) => styles } }
      }
      if (specifier === '@hozo/form') {
        return {
          Form: formMod.exports.Form,
          SubmitButton: submitMod.exports.SubmitButton,
          FileDropzone: dropzoneMod.exports.FileDropzone,
        }
      }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { disabled: true }))
  assert.equal(classResolverCalls, 0, 'prepared literals must never call hozoClasses at the owner')

  const formHost = formMod.captured.find((entry) => entry.host === 'View')
  assert.ok(formHost)
  assert.equal(flattenStyle(formHost.props.style).paddingTop, 12)

  const submitHost = submitMod.captured.find((entry) => entry.host === 'Pressable')
  assert.ok(submitHost)
  assert.equal(flattenStyle(submitHost.props.style).paddingTop, 20)
  assert.equal(flattenStyle(submitHost.props.style).backgroundColor, '#556677')
  const submitLabel = submitMod.captured.find((entry) => entry.host === 'Text')
  assert.ok(submitLabel)
  assert.equal(flattenStyle(submitLabel.props.style).color, '#112233')

  const dropzoneHost = dropzoneMod.captured.find((entry) => entry.host === 'Pressable')
  assert.ok(dropzoneHost)
  assert.equal(flattenStyle(dropzoneHost.props.style).paddingTop, 24)
  assert.equal(flattenStyle(dropzoneHost.props.style).backgroundColor, '#667788')
  const dropzoneLabel = dropzoneMod.captured.find((entry) => entry.host === 'Text')
  assert.ok(dropzoneLabel)
  assert.equal(flattenStyle(dropzoneLabel.props.style).color, '#223344')

  // Reject both carriers at once, and keep opaque className working through hozoClasses.
  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(formMod.exports.Form as React.ComponentType<Record<string, unknown>>, {
          className: 'pt-3',
          hozoFormStyle: () => ({}),
        }),
      ),
    /Prepared Form styles must consume className/,
  )
  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(
          submitMod.exports.SubmitButton as React.ComponentType<Record<string, unknown>>,
          { className: 'pt-5', hozoSubmitButtonStyle: () => ({}) },
        ),
      ),
    /Prepared SubmitButton styles must consume className/,
  )
  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(
          dropzoneMod.exports.FileDropzone as React.ComponentType<Record<string, unknown>>,
          {
            accessibilityLabel: 'Upload',
            pickFiles: async () => null,
            className: 'pt-6',
            hozoFileDropzoneStyle: () => ({}),
          },
        ),
      ),
    /Prepared FileDropzone styles must consume className/,
  )

  formMod.captured.length = 0
  renderToStaticMarkup(
    React.createElement(formMod.exports.Form as React.ComponentType<Record<string, unknown>>, {
      className: 'opaque',
    }),
  )
  assert.equal(classResolverCalls, 1)
  assert.equal(flattenStyle(formMod.captured[0]?.props.style).paddingBottom, 99)
})
