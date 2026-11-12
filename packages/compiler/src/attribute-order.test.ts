// An element's attribute values run once each, in the order they were
// written, on both backends (#1879). The backends write attributes grouped by
// kind and copy some values into several attributes, so an element whose
// values would otherwise run out of order, or twice, evaluates them first in
// its plan. These tests execute the generated JSX; a string match cannot tell
// a value read from the plan from one evaluated again.
import assert from 'node:assert/strict'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { transformSync } from 'esbuild'
import { createCompiler } from './index.ts'

const compiler = createCompiler()

const backends = {
  web: (source: string) => compiler.compile(source),
  native: (source: string) => compiler.compileNative(source),
} as const

/** Runs the first component's JSX; each named call records itself. */
function run(jsx: string, styles: string, calls: string[], values: Record<string, unknown> = {}) {
  const call =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(name)
      if (name in values) {
        const value = values[name]
        if (value instanceof Error) throw value
        return value
      }
      return args.length ? args[0] : name
    }
  const module = { exports: undefined as unknown }
  const code = transformSync(`const hozoStyles=${styles}; module.exports=(${jsx})`, {
    loader: 'tsx',
    jsxFactory: 'h',
  }).code
  runInNewContext(code, {
    module,
    h: (_type: unknown, props: unknown) => props ?? {},
    StyleSheet: { create: (value: unknown) => value },
    hozoClasses: () => ({}),
    hozoAuthoredStyle: (style: unknown) => style,
    hozoDomStyle: (style: unknown) => style,
    hozoViewDomProps: (props: unknown) => props,
    hozoGapSpreadStyles: (props: object, _: unknown, spread: object) => ({ ...props, ...spread }),
    hozoInteractive: () => ({}),
    nativeDisabledProps: (props: unknown) => props,
    View: 'View',
    Text: 'Text',
    Pressable: 'Pressable',
    HozoView: 'HozoView',
    HozoPressable: 'HozoPressable',
    HozoLink: 'HozoLink',
    before: call('before'),
    after: call('after'),
    opaque: call('opaque'),
    cond: call('cond'),
    spread: () => {
      calls.push('spread')
      return {}
    },
    disabled: call('disabled'),
    label: call('label'),
    id: call('id'),
    press: () => {
      calls.push('press')
      return () => {}
    },
    style: () => {
      calls.push('style')
      return {}
    },
  })
  return module.exports as Record<string, unknown>
}

const ORDERS: [string, string[]][] = [
  // The issue's case: the class list was written first and ran first.
  ['<View accessibilityLabel={before()} className={opaque()} />', ['before', 'opaque']],
  ["<View accessibilityLabel={before()} className={'p-4 ' + opaque()} />", ['before', 'opaque']],
  ["<View accessibilityLabel={before()} className={cond() ? 'p-4' : 'p-2'} />", ['before', 'cond']],
  ['<View {...spread()} className={opaque()} />', ['spread', 'opaque']],
  ['<View className={opaque()} accessibilityLabel={after()} />', ['opaque', 'after']],
  // Modeled props were written grouped by kind, not as authored.
  ['<View accessibilityLabel={label()} testID={id()} />', ['label', 'id']],
  ['<View testID={id()} accessibilityLabel={label()} />', ['id', 'label']],
  [
    '<Pressable onPress={press()} accessibilityLabel={label()} disabled={disabled()} />',
    ['press', 'label', 'disabled'],
  ],
  [
    '<View style={style()} accessibilityLabel={label()} className={opaque()} />',
    ['style', 'label', 'opaque'],
  ],
]

for (const [jsx, expected] of ORDERS)
  for (const [backend, compile] of Object.entries(backends))
    test(`${backend}: ${jsx} runs its values once each, as written`, () => {
      const source = `import { View, Pressable } from '@hozo/core'\nexport const A = () => ${jsx}\n`
      const output = compile(source)[0]!
      const calls: string[] = []
      run(output.jsx, backend === 'native' ? output.styles : '{}', calls)
      assert.deepEqual(calls, expected, output.jsx)
    })

test('a value that throws stops the values written after it, as the source would', () => {
  for (const [backend, compile] of Object.entries(backends)) {
    const source = `import { View } from '@hozo/core'\nexport const A = () => <View accessibilityLabel={before()} className={opaque()} testID={after()} />\n`
    const output = compile(source)[0]!
    const calls: string[] = []
    assert.throws(
      () =>
        run(output.jsx, backend === 'native' ? output.styles : '{}', calls, {
          before: new Error('stop'),
        }),
      /stop/,
    )
    assert.deepEqual(calls, ['before'], `${backend}: ${output.jsx}`)
  }
})

test('one value alone, read once wherever a backend writes it', () => {
  for (const [backend, compile] of Object.entries(backends)) {
    // `disabled` is Web's `aria-disabled` and `data-hozo-disabled`, and
    // Native's `disabled` and `accessibilityState`.
    const source = `import { Pressable } from '@hozo/core'\nexport const A = () => <Pressable disabled={disabled()} />\n`
    const output = compile(source)[0]!
    const calls: string[] = []
    run(output.jsx, backend === 'native' ? output.styles : '{}', calls, { disabled: true })
    assert.deepEqual(calls, ['disabled'], `${backend}: ${output.jsx}`)
  }
})

test('one plain value alone is left where it was written', () => {
  for (const compile of Object.values(backends)) {
    const output = compile(
      `import { View } from '@hozo/core'\nexport const A = () => <View accessibilityLabel={label()} />\n`,
    )[0]!
    assert.doesNotMatch(output.jsx, /__hozoClassPlan/)
  }
})

// Every modeled prop on every primitive, with a call as its value: the call
// is written once. A prop a backend copies into several attributes has to be
// in the parser's `WRITTEN_MORE_THAN_ONCE`, and this is what says so.
const PRIMITIVES =
  'ActivityIndicator Address Article Aside Avatar Badge Button Chip Code ColorPicker Combobox CommandPalette Description Details Dialog Emphasis Fieldset Figcaption Figure FlatList Footer Header Heading Image Legend Link List ListItem Listbox Main Mark Menu Meter Modal Nav NoBreak OtpInput Pagination Paragraph Preformatted Pressable Progress RefreshControl Ruby RubyText ScrollView Search Section Separator Skeleton Small Stepper Strikethrough Strong Sub Summary Sup Table TableBody TableCaption TableCell TableFooter TableHead TableHeader TableRow Term TermList Text TextInput Time TouchableOpacity TouchableWithoutFeedback Underline View'.split(
    ' ',
  )
const PROPS =
  'accessibilityHint accessibilityLabel accessibilityLiveRegion accessibilityRole accessibilityState accessibilityValue alt aria-description aria-invalid aria-label autoCorrect defaultSource disabled editable focusable horizontal inputMode keyboardType level multiline nativeID numberOfLines onChangeText onClose onLayout onPress onScroll open ordered placeholder pointerEvents readOnly role secureTextEntry src testID external target href replace prefetch value checked selected onValueChange hitSlop tabIndex style id hidden aria-hidden aria-disabled aria-live aria-valuenow onLongPress refreshing onRefresh keyboardShouldPersistTaps scrollEventThrottle showsVerticalScrollIndicator showsHorizontalScrollIndicator label items options min max dateTime title'.split(
    ' ',
  )

test('no prop of any primitive is written with its call twice', () => {
  const twice: string[] = []
  for (const primitive of PRIMITIVES)
    for (const prop of PROPS)
      for (const [backend, compile] of Object.entries(backends)) {
        const source = `import { ${primitive} } from '@hozo/core'\nexport const A = () => <${primitive} ${prop}={f()} />\n`
        const jsx = compile(source)
          .map((output) => output.jsx)
          .join('\n')
        if (jsx.split('f()').length - 1 > 1) twice.push(`${backend} <${primitive} ${prop}>: ${jsx}`)
      }
  assert.deepEqual(twice, [])
})
