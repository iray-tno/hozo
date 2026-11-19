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
    TextInput: host('TextInput'),
    Modal: host('Modal'),
    ScrollView: host('ScrollView'),
    ActionSheetIOS: { showActionSheetWithOptions: () => {} },
    Platform: { OS: 'android' },
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
        useAnnounce: () => () => {},
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

test('Native Field and TextArea deliver prepared styles to every declared host without calling hozoClasses (#2045)', () => {
  const compiler = createCompiler()
  const source = `import { Field, TextArea } from '@hozo/form'
export function Screen({
  disabled,
  readOnly,
  invalid,
  required,
}: {
  disabled?: boolean
  readOnly?: boolean
  invalid?: boolean
  required?: boolean
}) {
  return (
    <Field
      label="Bio"
      required={required}
      description="Keep it short"
      error={invalid ? 'Invalid bio' : undefined}
      className="pt-2"
      labelClassName="text-[#112233] font-bold"
      requiredClassName="text-[#cc0000]"
      descriptionClassName="text-[#445566]"
      errorClassName="text-[#990000]"
    >
      {(control) => (
        <TextArea
          accessibilityLabel={control.accessibilityLabel}
          accessibilityLabelledBy={control.accessibilityLabelledBy}
          maxLength={40}
          disabled={disabled}
          readOnly={readOnly}
          aria-invalid={invalid}
          aria-required={required}
          className="pt-3"
          fieldClassName="pt-4 text-[16px] leading-[24px] bg-[#101010] focus:bg-[#202020] focus-visible:bg-[#303030] disabled:bg-[#404040] read-only:bg-[#505050] aria-[invalid=true]:bg-[#606060] aria-required:bg-[#707070]"
          countClassName="text-[#778899]"
        />
      )}
    </Field>
  )
}
export function Fallback({ dynamic }: { dynamic: string }) {
  return <TextArea fieldClassName="placeholder:text-[#888888]" className={dynamic} />
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoFieldStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoLabelStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoRequiredStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoDescriptionStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoErrorStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoTextAreaStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoCountStyle=\{__hozoOwner\d+_Plan\d+\}/)
  // Placeholder utility emits an extra host prop, so it stays on the fallback route rather than dropping.
  assert.match(transformed, /fieldClassName="placeholder:text-\[#888888\]"/)
  assert.match(transformed, /className=\{dynamic\}/)

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
    return { paddingBottom: 77 }
  }
  const fieldMod = loadNativeFormModule('field.native.tsx', { hozoClasses: spyHozoClasses })
  const textAreaMod = loadNativeFormModule('text-area.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = {
    exports: {} as {
      Screen: React.ComponentType<{
        disabled?: boolean
        readOnly?: boolean
        invalid?: boolean
        required?: boolean
      }>
    },
  }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/form')
        return { Field: fieldMod.exports.Field, TextArea: textAreaMod.exports.TextArea }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  renderToStaticMarkup(
    React.createElement(screenMod.exports.Screen, {
      required: true,
      invalid: true,
      readOnly: true,
    }),
  )
  assert.equal(
    classResolverCalls,
    0,
    'prepared Field and TextArea literals must bypass hozoClasses',
  )

  const fieldView = fieldMod.captured.find((entry) => entry.host === 'View')
  assert.ok(fieldView)
  assert.equal(flattenStyle(fieldView.props.style).paddingTop, 8)
  const fieldTexts = fieldMod.captured.filter((entry) => entry.host === 'Text')
  assert.equal(fieldTexts.length, 4)
  assert.equal(flattenStyle(fieldTexts[0]!.props.style).color, '#112233')
  assert.equal(flattenStyle(fieldTexts[0]!.props.style).fontWeight, '700')
  assert.equal(flattenStyle(fieldTexts[1]!.props.style).color, '#cc0000')
  assert.equal(flattenStyle(fieldTexts[2]!.props.style).color, '#990000')
  assert.equal(flattenStyle(fieldTexts[3]!.props.style).color, '#445566')

  const areaView = textAreaMod.captured.find((entry) => entry.host === 'View')
  assert.ok(areaView)
  assert.equal(flattenStyle(areaView.props.style).paddingTop, 12)
  const areaInput = textAreaMod.captured.find((entry) => entry.host === 'TextInput')
  assert.ok(areaInput)
  const inputStyle = flattenStyle(areaInput.props.style)
  assert.equal(inputStyle.paddingTop, 16)
  // Auto-grow reads lineHeight (24) and paddingTop (16) from the prepared style: 2 * 24 + 16 = 64.
  assert.equal(inputStyle.height, 64)
  assert.equal(inputStyle.backgroundColor, '#707070')
  const areaCount = textAreaMod.captured.find((entry) => entry.host === 'Text')
  assert.ok(areaCount)
  assert.equal(flattenStyle(areaCount.props.style).color, '#778899')

  // Reject dual carriers on every slot.
  for (const [classProp, preparedProp] of [
    ['className', 'hozoFieldStyle'],
    ['labelClassName', 'hozoLabelStyle'],
    ['requiredClassName', 'hozoRequiredStyle'],
    ['descriptionClassName', 'hozoDescriptionStyle'],
    ['errorClassName', 'hozoErrorStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            fieldMod.exports.Field as React.ComponentType<Record<string, unknown>>,
            {
              label: 'Name',
              [classProp]: 'pt-2',
              [preparedProp]: () => ({}),
              children: () => null,
            },
          ),
        ),
      new RegExp(`Prepared Field styles must consume ${classProp}`),
    )
  }
  for (const [classProp, preparedProp] of [
    ['className', 'hozoTextAreaStyle'],
    ['fieldClassName', 'hozoFieldStyle'],
    ['countClassName', 'hozoCountStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            textAreaMod.exports.TextArea as React.ComponentType<Record<string, unknown>>,
            { [classProp]: 'pt-2', [preparedProp]: () => ({}) },
          ),
        ),
      new RegExp(`Prepared TextArea styles must consume ${classProp}`),
    )
  }
})

test('Native NativeSelect delivers prepared root styles to Pressable and label Text without calling hozoClasses (#2045)', () => {
  const compiler = createCompiler()
  const source = `import { NativeSelect } from '@hozo/form'
export function Screen({
  disabled,
  invalid,
  required,
}: {
  disabled?: boolean
  invalid?: boolean
  required?: boolean
}) {
  return (
    <NativeSelect
      options={[{ value: 'a', label: 'Alpha' }]}
      value="a"
      disabled={disabled}
      aria-invalid={invalid}
      aria-required={required}
      className="pt-4 text-[#112233] bg-[#101010] disabled:bg-[#202020] aria-[invalid=true]:bg-[#303030] aria-required:bg-[#404040]"
      sheetClassName="p-2"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoSelectStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.doesNotMatch(transformed, /className="pt-4/)
  // Native-only fallback chrome slots remain untouched.
  assert.match(transformed, /sheetClassName="p-2"/)

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
    return { paddingBottom: 88 }
  }
  const selectMod = loadNativeFormModule('native-select.native.tsx', {
    hozoClasses: spyHozoClasses,
  })
  const screenMod = {
    exports: {} as {
      Screen: React.ComponentType<{ disabled?: boolean; invalid?: boolean; required?: boolean }>
    },
  }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/form') return { NativeSelect: selectMod.exports.NativeSelect }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  renderToStaticMarkup(React.createElement(screenMod.exports.Screen, { invalid: true }))
  assert.equal(classResolverCalls, 0, 'prepared NativeSelect root must bypass hozoClasses')

  const triggerHost = selectMod.captured.find((entry) => entry.host === 'Pressable')
  assert.ok(triggerHost)
  assert.equal(flattenStyle(triggerHost.props.style).paddingTop, 16)
  assert.equal(flattenStyle(triggerHost.props.style).backgroundColor, '#303030')
  const valueText = selectMod.captured.find((entry) => entry.host === 'Text')
  assert.ok(valueText)
  assert.equal(flattenStyle(valueText.props.style).color, '#112233')

  assert.throws(
    () =>
      renderToStaticMarkup(
        React.createElement(
          selectMod.exports.NativeSelect as React.ComponentType<Record<string, unknown>>,
          {
            options: [{ value: 'a', label: 'Alpha' }],
            className: 'pt-4',
            hozoSelectStyle: () => ({}),
          },
        ),
      ),
    /Prepared NativeSelect styles must consume className/,
  )
})

test('Native Calendar delivers prepared styles across all five slots without calling hozoClasses (#2045)', () => {
  const compiler = createCompiler()
  const source = `import { Calendar } from '@hozo/form'
export function Screen() {
  return (
    <Calendar
      range
      today={{ year: 2026, month: 9, day: 24 }}
      defaultMonth={{ year: 2026, month: 9 }}
      min={{ year: 2026, month: 9, day: 10 }}
      value={{ start: { year: 2026, month: 9, day: 12 }, end: { year: 2026, month: 9, day: 14 } }}
      locale="en-US"
      firstDayOfWeek={1}
      className="pt-2 text-[#112233]"
      headerClassName="pt-3 text-[#223344]"
      gridClassName="pt-4 text-[#334455]"
      monthButtonClassName="pt-5 bg-[#101010] disabled:bg-[#202020]"
      dayClassName="pt-1 bg-[#010101] data-[hozo-outside]:bg-[#121212] data-[hozo-disabled]:bg-[#232323] data-[hozo-range-start]:bg-[#343434] data-[hozo-range-end]:bg-[#454545] data-[hozo-in-range]:bg-[#565656]"
    />
  )
}
`
  const transformed = transformHozoSource(source, '/app/Screen.tsx', '/app', compiler)
  assert.ok(transformed)
  assert.match(transformed, /hozoCalendarStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoHeaderStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoGridStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoMonthButtonStyle=\{__hozoOwner\d+_Plan\d+\}/)
  assert.match(transformed, /hozoDayStyle=\{__hozoOwner\d+_Plan\d+\}/)

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
  const calendarMod = loadNativeFormModule('calendar.native.tsx', { hozoClasses: spyHozoClasses })
  const screenMod = { exports: {} as { Screen: React.ComponentType } }
  runInNewContext(code, {
    module: screenMod,
    exports: screenMod.exports,
    React,
    require: (specifier: string) => {
      if (specifier === 'react') return React
      if (specifier === 'react-native') return { StyleSheet: { create: <T>(styles: T) => styles } }
      if (specifier === '@hozo/form') return { Calendar: calendarMod.exports.Calendar }
      throw new Error(`Unexpected require: ${specifier}`)
    },
  })

  renderToStaticMarkup(React.createElement(screenMod.exports.Screen))
  assert.equal(classResolverCalls, 0, 'prepared Calendar literals must never call hozoClasses')

  const views = calendarMod.captured.filter((entry) => entry.host === 'View')
  assert.equal(flattenStyle(views[0]!.props.style).paddingTop, 8)
  assert.equal(flattenStyle(views[1]!.props.style).paddingTop, 12)
  assert.equal(flattenStyle(views[2]!.props.style).paddingTop, 16)

  const pressables = calendarMod.captured.filter((entry) => entry.host === 'Pressable')
  // Previous month button is disabled because min is Sept 10; next month button is enabled.
  assert.equal(flattenStyle(pressables[0]!.props.style).backgroundColor, '#202020')
  assert.equal(flattenStyle(pressables[1]!.props.style).backgroundColor, '#101010')
  // Day cells start at index 2 (42 cells).
  const dayByLabel = (part: string) =>
    pressables.find(
      (entry) =>
        typeof entry.props.accessibilityLabel === 'string' &&
        entry.props.accessibilityLabel.includes(part),
    )!
  assert.equal(flattenStyle(dayByLabel('August 31, 2026').props.style).backgroundColor, '#232323')
  assert.equal(flattenStyle(dayByLabel('October 1, 2026').props.style).backgroundColor, '#121212')
  assert.equal(
    flattenStyle(dayByLabel('September 12, 2026').props.style).backgroundColor,
    '#343434',
  )
  assert.equal(
    flattenStyle(dayByLabel('September 13, 2026').props.style).backgroundColor,
    '#565656',
  )
  assert.equal(
    flattenStyle(dayByLabel('September 14, 2026').props.style).backgroundColor,
    '#454545',
  )

  for (const [classProp, preparedProp] of [
    ['className', 'hozoCalendarStyle'],
    ['headerClassName', 'hozoHeaderStyle'],
    ['gridClassName', 'hozoGridStyle'],
    ['monthButtonClassName', 'hozoMonthButtonStyle'],
    ['dayClassName', 'hozoDayStyle'],
  ]) {
    assert.throws(
      () =>
        renderToStaticMarkup(
          React.createElement(
            calendarMod.exports.Calendar as React.ComponentType<Record<string, unknown>>,
            { [classProp]: 'pt-2', [preparedProp]: () => ({}) },
          ),
        ),
      new RegExp(`Prepared Calendar styles must consume ${classProp}`),
    )
  }
})
