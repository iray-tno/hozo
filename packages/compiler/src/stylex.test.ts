import assert from 'node:assert/strict'
import { test } from 'node:test'

import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'

import { compile, compileNative } from './index.ts'

const source = `import * as stylex from '@stylexjs/stylex'
import { View, Text } from '@hozo/core'

const styles = stylex.create({
  root: {
    padding: 16,
    backgroundColor: '#ff0000',
    flexDirection: 'row',
  },
  selected: {
    opacity: 0.5,
  },
})

export function Card({ selected }: { selected: boolean }) {
  return (
    <View className="m-2" {...stylex.props(styles.root, selected && styles.selected)}>
      <Text>Card</Text>
    </View>
  )
}
`

test('same-file static StyleX joins Tailwind in the Web IR', () => {
  const component = compile(source)[0]
  assert.ok(component)
  assert.doesNotMatch(component.jsx, /stylex\.props/)
  assert.match(component.jsx, /data-hozo-cond-/)
  assert.match(component.css, /margin-top: 8px/)
  assert.match(component.css, /padding-top: 16px/)
  assert.match(component.css, /background-color: #ff0000/)
  assert.match(component.css, /flex-direction: row/)
  assert.match(component.css, /opacity: 0.5/)
})

test('the same StyleX IR lowers to React Native StyleSheet entries', () => {
  const component = compileNative(source)[0]
  assert.ok(component)
  assert.doesNotMatch(component.jsx, /stylex\.props/)
  assert.match(component.jsx, /selected\) && hozoStyles\.hozo0_cond_/)
  assert.match(component.styles, /marginTop: 8/)
  assert.match(component.styles, /paddingTop: 16/)
  assert.match(component.styles, /backgroundColor: '#ff0000'/)
  assert.match(component.styles, /flexDirection: 'row'/)
  assert.match(component.styles, /opacity: 0.5/)
})

test('nested StyleX media keeps its base cascade on Web and uses the viewport hook on Native', () => {
  const mediaSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    '@media (min-width: 600px)': { padding: 24 },
    padding: 4,
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const official = transformSync(mediaSource, {
    filename: '/app/NestedMedia.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  assert.deepEqual(
    (metadata.stylex ?? []).map(([, , priority]) => priority),
    [1200, 1000],
  )

  const web = compile(mediaSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  assert.match(web.css, /padding-top: 4px/)
  assert.match(web.css, /@media \(width >= 600px\)/)
  assert.match(web.css, /padding-top: 24px/)
  assert.ok(web.css.indexOf('padding-top: 4px') < web.css.indexOf('padding-top: 24px'))

  const native = compileNative(mediaSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.prelude.join('\n'), /useHozoWidthAtLeast\(600\)/)
  assert.match(native.jsx, /__hozoWidth_600 && hozoStyles\./)
  assert.match(native.styles, /paddingTop: 4/)
  assert.match(native.styles, /paddingTop: 24/)
})

test('nested StyleX interaction pseudos preserve priority and reuse Pressable state', () => {
  const pseudoSource = `import * as stylex from '@stylexjs/stylex'
import { Pressable } from '@hozo/core'
const styles = stylex.create({
  root: {
    opacity: 1,
    ':hover': { opacity: 0.5 },
    ':active': { transform: 'scale(0.95)' },
  },
})
export const Card = () => (
  <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
)
`
  const official = transformSync(pseudoSource, {
    filename: '/app/NestedPseudos.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  assert.deepEqual(
    (metadata.stylex ?? []).map(([, , priority]) => priority),
    [3000, 3130, 3170],
  )

  const web = compile(pseudoSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  assert.match(web.css, /@media \(hover: hover\)/)
  assert.match(web.css, /\.hozo-0:hover/)
  assert.match(web.css, /\.hozo-0:active/)

  const native = compileNative(pseudoSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.jsx, /hovered && hozoStyles\.hozo0_hover/)
  assert.match(native.jsx, /pressed && hozoStyles\.hozo0_pressed/)
  assert.match(native.styles, /opacity: 0.5/)
  assert.match(native.styles, /transform: \[\{ scale: 0.95 \}\]/)
})

test('local unthemeable StyleX variables lower to their static defaults', () => {
  const variableSource = `import * as stylex from '@stylexjs/stylex'
import { Text } from '@hozo/core'
const tokens = stylex.defineVars({ accent: '#123456', space: 12 })
const styles = stylex.create({
  root: { color: tokens.accent, padding: tokens.space },
})
export const Card = () => <Text {...stylex.props(styles.root)}>Card</Text>
`

  const web = compile(variableSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  assert.match(web.css, /color: #123456/)
  assert.match(web.css, /padding-top: 12px/)

  const native = compileNative(variableSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.styles, /color: '#123456'/)
  assert.match(native.styles, /paddingTop: 12/)
})

test('themeable StyleX variables remain with the official transform', () => {
  const themedSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const tokens = stylex.defineVars({ accent: '#123456' })
const dark = stylex.createTheme(tokens, { accent: '#abcdef' })
const styles = stylex.create({ root: { color: tokens.accent } })
export const Card = () => <View {...stylex.props(dark, styles.root)} />
`

  for (const component of [compile(themedSource)[0], compileNative(themedSource)[0]]) {
    assert.ok(component)
    assert.match(component.jsx, /stylex\.props/)
    assert.equal(component.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
  }
})

test('statically called StyleX function styles lower without runtime parsing', () => {
  const functionSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  dynamic: (value) => ({ opacity: value, padding: 8 }),
})
export const Card = () => <View {...stylex.props(styles.dynamic(0.5))} />
`

  const web = compile(functionSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  assert.match(web.css, /opacity: 0.5/)
  assert.match(web.css, /padding-top: 8px/)

  const native = compileNative(functionSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.styles, /opacity: 0.5/)
  assert.match(native.styles, /paddingTop: 8/)
})

test('runtime StyleX function arguments remain with the official transform', () => {
  const functionSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ dynamic: (value) => ({ opacity: value }) })
export const Card = ({ value }) => <View {...stylex.props(styles.dynamic(value))} />
`

  for (const component of [compile(functionSource)[0], compileNative(functionSource)[0]]) {
    assert.ok(component)
    assert.match(component.jsx, /stylex\.props\(styles\.dynamic\(value\)\)/)
    assert.equal(component.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
    assert.match(component.diagnostics[0]?.message ?? '', /runtime argument/)
  }
})

test('unsupported StyleX remains available to the official compiler and is named', () => {
  const unsupported = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { transform: 'translateX(calc(100% - 2px))' } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const component = compile(unsupported)[0]
  assert.ok(component)
  assert.match(component.jsx, /\.\.\.stylex\.props\(styles\.root\)/)
  assert.equal(component.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
})

test('mixed StyleX rules lower supported declarations and isolate the residual', () => {
  const mixed = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: { padding: 16, scrollbarColor: 'red blue' },
  active: { opacity: 0.5, quotes: '"“" "”"' },
})
export const Card = ({ active }) => (
  <View {...stylex.props(styles.root, active && styles.active)} />
)
`
  const web = compile(mixed)[0]
  assert.ok(web)
  assert.match(web.css, /padding-top: 16px/)
  assert.match(web.css, /opacity: 0.5/)
  assert.match(web.jsx, /stylex\.create\(\{ __hozo0: \{ scrollbarColor: 'red blue' \} \}\)/)
  assert.match(web.jsx, /active\) && stylex\.create\(\{ __hozo1: \{ quotes: '"“" "”"' \} \}\)/)
  assert.match(web.jsx, /\.className\]\.filter\(Boolean\)\.join\(' '\)/)
  assert.doesNotMatch(web.jsx, /styles\.root|styles\.active/)
  assert.equal(web.diagnostics.length, 2)
  assert.ok(web.diagnostics.every((diagnostic) => diagnostic.code === 'STYLEX_NOT_LOWERED'))

  const native = compileNative(mixed)[0]
  assert.ok(native)
  assert.match(native.styles, /paddingTop: 16/)
  assert.match(native.styles, /opacity: 0.5/)
  assert.match(native.jsx, /^<View \{\.\.\.\(stylex\.props\(stylex\.create/)
  assert.ok(native.jsx.indexOf('{...(stylex.props') < native.jsx.indexOf(' style='))
  assert.match(native.jsx, /style=\{\[hozoStyles\.hozo0,/)
  assert.doesNotMatch(native.jsx, /styles\.root|styles\.active/)
  assert.equal(native.diagnostics.length, 2)
})

function declarationMap(declarations: string[]): Map<string, string> {
  const result = new Map<string, string>()
  for (const declaration of declarations.flatMap((value) => value.split(';'))) {
    if (!declaration.trim()) continue
    const split = declaration.indexOf(':')
    const property = declaration.slice(0, split).trim()
    // Hozo keeps Safari's still-useful mirror beside the standard value.
    // StyleX emits only the standard declaration; compare the shared CSS
    // meaning rather than treating the compatibility copy as a mismatch.
    if (property === '-webkit-user-select') continue
    let value = declaration.slice(split + 1).trim()
    value = value.replace(
      /^(-?)\.(\d)/,
      (_match, sign: string, digit: string) => `${sign}0.${digit}`,
    )
    if (property === 'flex') {
      value =
        value === '1 1 auto'
          ? 'auto'
          : value === '0 1 auto'
            ? 'initial'
            : value === '0 0 auto'
              ? 'none'
              : value
    }
    if (property === 'flex') {
      const parts =
        value === 'auto'
          ? ['1', '1', 'auto']
          : value === 'initial'
            ? ['0', '1', 'auto']
            : value === 'none'
              ? ['0', '0', 'auto']
              : value === '1'
                ? ['1', '1', '0%']
                : undefined
      assert.ok(parts, `unrecognized flex oracle value: ${value}`)
      result.set('flex-grow', parts[0])
      result.set('flex-shrink', parts[1])
      result.set('flex-basis', parts[2])
      continue
    }
    if (property === 'gap') {
      result.set('row-gap', value)
      result.set('column-gap', value)
      continue
    }
    const expanded = (() => {
      if (property === 'padding') {
        return ['padding-top', 'padding-right', 'padding-bottom', 'padding-left']
      }
      if (property === 'border-radius') {
        return [
          'border-top-left-radius',
          'border-top-right-radius',
          'border-bottom-right-radius',
          'border-bottom-left-radius',
        ]
      }
      if (property === 'border-color') {
        return [
          'border-top-color',
          'border-right-color',
          'border-bottom-color',
          'border-left-color',
        ]
      }
      if (property === 'border-width') {
        return [
          'border-top-width',
          'border-right-width',
          'border-bottom-width',
          'border-left-width',
        ]
      }
      if (property === 'border-style') {
        return [
          'border-top-style',
          'border-right-style',
          'border-bottom-style',
          'border-left-style',
        ]
      }
      if (property === 'border-block-color') {
        return ['border-top-color', 'border-bottom-color']
      }
      if (property === 'inset') {
        return ['top', 'right', 'bottom', 'left']
      }
      if (property === 'inset-block') {
        return ['top', 'bottom']
      }
      if (property === 'inset-inline') {
        return ['inset-inline-start', 'inset-inline-end']
      }
      if (property === 'margin-block') {
        return ['margin-top', 'margin-bottom']
      }
      if (property === 'margin-inline') {
        return ['margin-inline-start', 'margin-inline-end']
      }
      if (property === 'padding-block') {
        return ['padding-top', 'padding-bottom']
      }
      if (property === 'padding-inline') {
        return ['padding-inline-start', 'padding-inline-end']
      }
      return [property]
    })()
    for (const name of expanded) result.set(name, value)
  }
  return result
}

test('the supported static property slice agrees with the official StyleX CSS oracle', () => {
  const oracleSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    position: 'relative',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    marginTop: -2,
    gap: 12,
    width: 240,
    minHeight: 48,
    top: 4,
    backgroundColor: '#ff0000',
    color: '#ffffff',
    opacity: 0.5,
    zIndex: 2,
    borderRadius: 8,
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.5,
    letterSpacing: 0.25,
    overflow: 'hidden',
    textAlign: 'center',
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const official = transformSync(oracleSource, {
    filename: '/app/Oracle.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const officialDeclarations = (metadata.stylex ?? []).map(([, css]) => {
    const body = css.ltr.slice(css.ltr.indexOf('{') + 1, -1)
    return body
  })

  const web = compile(oracleSource)[0]
  assert.ok(web)
  const rule = web.css.match(/\.hozo-0 \{\n([\s\S]*?)\n\}/)?.[1]
  assert.ok(rule)
  const hozoDeclarations = rule
    .split(';')
    .map((value) => value.trim())
    .filter(Boolean)

  assert.deepEqual(
    Object.fromEntries(declarationMap(hozoDeclarations)),
    Object.fromEntries(declarationMap(officialDeclarations)),
  )
})

const atomicPrioritySource = (
  argumentsSource: string,
) => `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  all: { padding: 16, gap: 12, borderRadius: 8, flex: 'auto' },
  specific: { paddingTop: 4, rowGap: 6, borderTopLeftRadius: 2, flexGrow: 2 },
})
export const Card = () => <View {...stylex.props(${argumentsSource})} />
`

test('StyleX atomic property priority is preserved on Web and Native', () => {
  const official = transformSync(atomicPrioritySource('styles.specific, styles.all'), {
    filename: '/app/AtomicPriority.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  assert.deepEqual(
    [...new Set((metadata.stylex ?? []).map(([, , priority]) => priority))].sort(),
    [1000, 2000, 3000, 4000],
  )

  for (const argumentsSource of ['styles.specific, styles.all', 'styles.all, styles.specific']) {
    const input = atomicPrioritySource(argumentsSource)
    const web = compile(input)[0]
    assert.ok(web)
    assert.equal(web.diagnostics.length, 0)
    assert.match(web.css, /padding-top: 4px/)
    assert.match(web.css, /padding-right: 16px/)
    assert.match(web.css, /row-gap: 6px/)
    assert.match(web.css, /column-gap: 12px/)
    assert.match(web.css, /border-top-left-radius: 2px/)
    assert.match(web.css, /border-top-right-radius: 8px/)
    assert.match(web.css, /flex-grow: 2/)
    assert.match(web.css, /flex-shrink: 1/)
    assert.match(web.css, /flex-basis: auto/)
    assert.doesNotMatch(web.css, /padding-top: 16px/)

    const native = compileNative(input)[0]
    assert.ok(native)
    assert.equal(native.diagnostics.length, 0)
    assert.match(native.styles, /paddingTop: 4/)
    assert.match(native.styles, /paddingRight: 16/)
    assert.match(native.styles, /rowGap: 6/)
    assert.match(native.styles, /columnGap: 12/)
    assert.match(native.styles, /borderTopLeftRadius: 2/)
    assert.match(native.styles, /borderTopRightRadius: 8/)
    assert.match(native.styles, /flexGrow: 2/)
    assert.match(native.styles, /flexShrink: 1/)
    assert.match(native.styles, /flexBasis: 'auto'/)
    assert.doesNotMatch(native.styles, /paddingTop: 16/)
  }
})

test('StyleX atomic priority remains correct across conditional arguments', () => {
  const higherBase = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ all: { padding: 16 }, top: { paddingTop: 4 } })
export const Card = ({ active }) => (
  <View {...stylex.props(styles.top, active && styles.all)} />
)
`
  const higherBaseWeb = compile(higherBase)[0]
  assert.ok(higherBaseWeb)
  assert.equal(higherBaseWeb.diagnostics.length, 0)
  assert.match(higherBaseWeb.css, /padding-top: 4px/)
  assert.match(higherBaseWeb.css, /data-hozo-cond-[^{]+\{[^}]*padding-right: 16px/)
  assert.doesNotMatch(higherBaseWeb.css, /data-hozo-cond-[^{]+\{[^}]*padding-top:/)

  const higherBaseNative = compileNative(higherBase)[0]
  assert.ok(higherBaseNative)
  assert.equal(higherBaseNative.diagnostics.length, 0)
  assert.match(higherBaseNative.styles, /hozo0: \{\s+paddingTop: 4/)
  assert.match(higherBaseNative.styles, /hozo0_cond_[^{]+\{[^}]*paddingRight: 16/)
  assert.doesNotMatch(higherBaseNative.styles, /hozo0_cond_[^{]+\{[^}]*paddingTop:/)

  const higherConditional = higherBase.replace(
    'styles.top, active && styles.all',
    'styles.all, active && styles.top',
  )
  const higherConditionalWeb = compile(higherConditional)[0]
  assert.ok(higherConditionalWeb)
  assert.equal(higherConditionalWeb.diagnostics.length, 0)
  assert.match(higherConditionalWeb.css, /\.hozo-0 \{[\s\S]*padding-top: 16px/)
  assert.match(higherConditionalWeb.css, /data-hozo-cond-[^{]+\{[\s\S]*padding-top: 4px/)

  const higherConditionalNative = compileNative(higherConditional)[0]
  assert.ok(higherConditionalNative)
  assert.equal(higherConditionalNative.diagnostics.length, 0)
  assert.match(higherConditionalNative.styles, /hozo0: \{[\s\S]*paddingTop: 16/)
  assert.match(higherConditionalNative.styles, /hozo0_cond_[^{]+\{[\s\S]*paddingTop: 4/)
})

test('StyleX props recursively lower arrays and ternary branches on both backends', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: { padding: 16 },
  active: { opacity: 0.5 },
  inactive: { opacity: 1 },
})
export const Card = ({ active }) => (
  <View {...stylex.props([styles.root, [active ? styles.active : styles.inactive]])} />
)
`
  for (const lower of [compile, compileNative]) {
    const output = lower(source)[0]
    assert.ok(output)
    assert.equal(output.diagnostics.length, 0)
    assert.doesNotMatch(output.jsx, /stylex\.props/)
    assert.match(output.jsx, /active/)
  }
})

test('StyleX create flattens module const object spreads on both backends', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const shared = { padding: 16, opacity: 0.5 }
const styles = stylex.create({ root: { ...shared, opacity: 0.75 } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /padding-top: 16px/)
  assert.match(web.css, /opacity: 0.75/)
  assert.doesNotMatch(web.css, /opacity: 0.5/)
  assert.doesNotMatch(web.jsx, /stylex\.props/)

  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.match(native.styles, /paddingTop: 16/)
  assert.match(native.styles, /opacity: 0.75/)
  assert.doesNotMatch(native.styles, /opacity: 0.5/)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
})

test('StyleX firstThatWorks keeps CSS fallback order and selects a Native value', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: { display: stylex.firstThatWorks('grid', 'flex') },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const official = transformSync(source, {
    filename: '/app/FirstThatWorks.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const expected = (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')
  assert.match(expected, /display:flex;display:grid/)

  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /display: flex;\s+display: grid;/)
  assert.doesNotMatch(web.jsx, /stylex\.props/)

  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.match(native.jsx, /<HozoGrid/)
  assert.doesNotMatch(native.styles, /display: 'grid'/)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
})

test('StyleX grid reuses the contextual Web and Native grid lowerings', () => {
  const gridSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gridTemplateRows: '80px 1fr',
    gap: 12,
  },
  span: {
    gridColumn: 'span 2 / span 2',
    gridRow: 'span 2 / span 2',
  },
  lines: {
    gridColumnStart: 2,
    gridColumnEnd: -1,
    gridRowStart: 2,
    gridRowEnd: -1,
  },
})
export const Grid = () => (
  <View {...stylex.props(styles.grid)}>
    <View {...stylex.props(styles.span)} />
    <View {...stylex.props(styles.lines)} />
  </View>
)
`
  const official = transformSync(gridSource, {
    filename: '/app/Grid.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const officialDeclarations = (metadata.stylex ?? []).map(([, css]) =>
    css.ltr.slice(css.ltr.indexOf('{') + 1, -1),
  )

  const web = compile(gridSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  const hozoDeclarations = [...web.css.matchAll(/^\s+([a-z-]+): ([^;]+);$/gm)].map(
    ([, property, value]) => `${property}: ${value}`,
  )
  const expected = declarationMap(officialDeclarations)
  const actual = new Map(
    [...declarationMap(hozoDeclarations)].filter(([property]) => expected.has(property)),
  )
  assert.deepEqual(Object.fromEntries(actual), Object.fromEntries(expected))

  const native = compileNative(gridSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.deepEqual(new Set(native.runtimeImports), new Set(['HozoGrid', 'HozoGridItem']))
  assert.match(
    native.jsx,
    /tracks=\{\[\{ kind: 'fr', value: 1 \}, \{ kind: 'fr', value: 1 \}, \{ kind: 'fr', value: 1 \}\]\}/,
  )
  assert.match(
    native.jsx,
    /rowTracks=\{\[\{ kind: 'points', value: 80 \}, \{ kind: 'fr', value: 1 \}\]\}/,
  )
  assert.match(native.jsx, /columnGap=\{12\}/)
  assert.match(native.jsx, /rowGap=\{12\}/)
  assert.match(native.jsx, /HozoGridItem columnSpan=\{2\} rowSpan=\{2\}/)
  assert.match(native.jsx, /HozoGridItem columnSpan=\{2\} columnStart=\{1\} rowStart=\{1\}/)
})

test('the expanded RN-portable StyleX property slice agrees with the official CSS oracle', () => {
  const samples = [
    ['alignContent', `'center'`],
    ['aspectRatio', `'1 / 1'`],
    ['backfaceVisibility', `'hidden'`],
    ['backgroundImage', `'linear-gradient(90deg, #123456, #abcdef)'`],
    ['boxShadow', `'inset 0 1px 2px #123456, 0 2px 4px #00000080'`],
    ['borderStartStartRadius', '6'],
    ['borderStartEndRadius', '6'],
    ['borderEndStartRadius', '6'],
    ['borderEndEndRadius', '6'],
    ['borderColor', `'#123456'`],
    ['borderTopColor', `'#123456'`],
    ['borderRightColor', `'#123456'`],
    ['borderBottomColor', `'#123456'`],
    ['borderLeftColor', `'#123456'`],
    ['borderWidth', '2'],
    ['borderTopWidth', '2'],
    ['borderRightWidth', '2'],
    ['borderBottomWidth', '2'],
    ['borderLeftWidth', '2'],
    ['borderStyle', `'solid'`],
    ['boxSizing', `'border-box'`],
    ['direction', `'rtl'`],
    ['flex', `'auto'`],
    ['filter', `'sepia(60%) hue-rotate(20deg)'`],
    ['fontFamily', `'Inter'`],
    ['fontStyle', `'italic'`],
    ['fontVariant', `'small-caps tabular-nums'`],
    ['isolation', `'isolate'`],
    ['mixBlendMode', `'multiply'`],
    ['outlineColor', `'#123456'`],
    ['outlineOffset', '2'],
    ['outlineStyle', `'solid'`],
    ['outlineWidth', '2'],
    ['pointerEvents', `'none'`],
    ['textDecorationColor', `'#123456'`],
    ['textDecorationLine', `'underline'`],
    ['textDecorationStyle', `'dotted'`],
    ['transform', `'translateX(12px) rotate(10deg) scale(0.9)'`],
    ['transformOrigin', `'left top'`],
    ['userSelect', `'none'`],
    ['verticalAlign', `'top'`],
    ['borderBlockColor', `'#123456'`],
    ['borderBlockStartColor', `'#123456'`],
    ['borderBlockEndColor', `'#123456'`],
    ['start', '4'],
    ['end', '4'],
    ['inset', '4'],
    ['insetBlock', '4'],
    ['insetBlockStart', '4'],
    ['insetBlockEnd', '4'],
    ['insetInline', '4'],
    ['insetInlineStart', '4'],
    ['insetInlineEnd', '4'],
    ['marginBlock', '4'],
    ['marginBlockStart', '4'],
    ['marginBlockEnd', '4'],
    ['marginInline', '4'],
    ['paddingBlock', '4'],
    ['paddingBlockStart', '4'],
    ['paddingBlockEnd', '4'],
    ['paddingInline', '4'],
  ] as const

  for (const [property, value] of samples) {
    const propertySource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { ${property}: ${value} } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
    const official = transformSync(propertySource, {
      filename: `/app/${property}.tsx`,
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
      plugins: [[stylexPlugin, { runtimeInjection: false }]],
    })
    const metadata = official?.metadata as {
      stylex?: [string, { ltr: string }, number][]
    }
    const officialDeclarations = (metadata.stylex ?? []).map(([, css]) =>
      css.ltr.slice(css.ltr.indexOf('{') + 1, -1),
    )

    const web = compile(propertySource)[0]
    assert.ok(web, property)
    assert.equal(web.diagnostics.length, 0, `${property}: ${JSON.stringify(web.diagnostics)}`)
    const rule = web.css.match(/\.hozo-0 \{\n([\s\S]*?)\n\}/)?.[1]
    assert.ok(rule, `${property}: ${web.css}`)
    const hozoDeclarations = rule
      .split(';')
      .map((declaration) => declaration.trim())
      .filter(Boolean)

    assert.deepEqual(
      Object.fromEntries(declarationMap(hozoDeclarations)),
      Object.fromEntries(declarationMap(officialDeclarations)),
      property,
    )

    const native = compileNative(propertySource)[0]
    assert.ok(native, property)
    assert.equal(native.diagnostics.length, 0, `${property}: ${JSON.stringify(native.diagnostics)}`)
    assert.doesNotMatch(native.jsx, /stylex\.props/, property)
    assert.notEqual(native.styles.trim(), '', property)
    if (property === 'boxShadow') {
      assert.match(
        native.styles,
        /boxShadow: 'inset 0 1px 2px #123456,0 2px 4px #00000080'/,
        property,
      )
    }
    if (property === 'backgroundImage') {
      assert.match(
        native.styles,
        /backgroundImage: 'linear-gradient\(90deg,#123456,#abcdef\)'/,
        property,
      )
    }
    if (property === 'filter') {
      assert.match(native.styles, /filter: 'sepia\(60%\) hue-rotate\(20deg\)'/, property)
    }
    if (property === 'fontVariant') {
      assert.match(native.styles, /fontVariant: \['small-caps', 'tabular-nums'\]/, property)
    }
    if (property === 'direction') {
      assert.match(native.styles, /direction: 'rtl'/, property)
    }
    if (property === 'fontFamily') {
      assert.match(native.styles, /fontFamily: 'Inter'/, property)
    }
  }
})

test('closed-keyword Web-only StyleX properties match the official CSS and fail explicitly on Native', () => {
  const samples = [
    ['appearance', `'none'`],
    ['WebkitAppearance', `'textfield'`],
    ['colorScheme', `'light dark'`],
    ['forcedColorAdjust', `'none'`],
    ['imageRendering', `'pixelated'`],
    ['overflowAnchor', `'none'`],
    ['overscrollBehavior', `'contain'`],
    ['overscrollBehaviorBlock', `'none'`],
    ['overscrollBehaviorInline', `'contain'`],
    ['overscrollBehaviorX', `'none'`],
    ['overscrollBehaviorY', `'contain'`],
    ['printColorAdjust', `'exact'`],
    ['resize', `'horizontal'`],
    ['scrollSnapAlign', `'center'`],
    ['scrollSnapStop', `'always'`],
    ['scrollSnapType', `'x mandatory'`],
    ['scrollbarGutter', `'stable both-edges'`],
    ['scrollbarWidth', `'thin'`],
    ['textRendering', `'optimizeLegibility'`],
    ['touchAction', `'manipulation'`],
    ['wordBreak', `'break-word'`],
    ['overflowWrap', `'anywhere'`],
    ['visibility', `'hidden'`],
    ['backgroundPosition', `'center'`],
    ['backgroundRepeat', `'no-repeat'`],
    ['backgroundSize', `'cover'`],
    ['objectPosition', `'center'`],
    ['justifySelf', `'center'`],
    ['placeItems', `'center'`],
    ['transitionDelay', `'100ms'`],
    ['animationDuration', `'200ms'`],
    ['animationComposition', `'add'`],
    ['animationDelay', `'100ms'`],
    ['animationDelay', `'-100ms'`],
    ['animationDirection', `'alternate-reverse'`],
    ['animationFillMode', `'both'`],
    ['animationIterationCount', '2.5'],
    ['animationPlayState', `'paused'`],
    ['animationTimingFunction', `'ease-in-out'`],
    ['animationTimingFunction', `'cubic-bezier(0.4, 0, 0.2, 1)'`],
    ['animationTimingFunction', `'steps(2, jump-none)'`],
    ['clipPath', `'polygon(0 0, 100% 0, 50% 100%)'`],
    ['perspective', `'800px'`],
    ['perspectiveOrigin', `'25% 75%'`],
    ['transformBox', `'fill-box'`],
    ['transformStyle', `'preserve-3d'`],
    ['willChange', `'opacity, transform'`],
    ['WebkitMaskImage', `'url(mask.svg)'`],
    ['maskImage', `'linear-gradient(black, transparent)'`],
    ['maskMode', `'luminance'`],
    ['maskRepeat', `'no-repeat'`],
    ['maskPosition', `'center top'`],
    ['maskSize', `'cover'`],
    ['maskOrigin', `'border-box'`],
    ['maskClip', `'no-clip'`],
    ['maskComposite', `'exclude'`],
    ['maskType', `'alpha'`],
    ['float', `'left'`],
    ['clear', `'both'`],
    ['offsetAnchor', `'left top'`],
    ['offsetDistance', `'25%'`],
    ['offsetPath', `'path("M 0 0 L 100 100")'`],
    ['offsetPosition', `'center top'`],
    ['offsetRotate', `'auto 45deg'`],
    ['shapeImageThreshold', '0.5'],
    ['shapeMargin', `'1rem'`],
    ['shapeOutside', `'circle(50%)'`],
    ['borderImageSource', `'linear-gradient(red, blue)'`],
    ['borderImageSlice', `'30% fill'`],
    ['borderImageWidth', `'1 2 3 4'`],
    ['borderImageOutset', `'4px 8px'`],
    ['borderImageRepeat', `'round stretch'`],
    ['gridAutoColumns', `'minmax(100px, 1fr)'`],
    ['gridAutoRows', `'48px auto'`],
    ['gridAutoFlow', `'column dense'`],
    ['gridTemplateAreas', `'"header header" "main aside"'`],
  ] as const

  for (const [property, value] of samples) {
    const propertySource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { ${property}: ${value} } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
    const official = transformSync(propertySource, {
      filename: `/app/web-only-${property}.tsx`,
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
      plugins: [[stylexPlugin, { runtimeInjection: false }]],
    })
    const metadata = official?.metadata as {
      stylex?: [string, { ltr: string }, number][]
    }
    const expected = (metadata.stylex ?? []).map(([, css]) =>
      css.ltr.slice(css.ltr.indexOf('{') + 1, -1),
    )

    const web = compile(propertySource)[0]
    assert.ok(web, property)
    assert.equal(web.diagnostics.length, 0, property)
    const rule = web.css.match(/\.hozo-0 \{\n([\s\S]*?)\n\}/)?.[1]
    assert.ok(rule, `${property}: ${web.css}`)
    const actual = [...rule.matchAll(/^\s*(-?[a-z-]+): ([^;]+);$/gm)].map(
      ([, name, declaration]) => `${name}: ${declaration}`,
    )
    assert.deepEqual(
      Object.fromEntries(declarationMap(actual)),
      Object.fromEntries(declarationMap(expected)),
      property,
    )

    const native = compileNative(propertySource)[0]
    assert.ok(native, property)
    assert.equal(native.diagnostics.length, 1, property)
    assert.equal(native.diagnostics[0]?.code, 'WEB_ONLY_PROPERTY_ON_NATIVE', property)
    assert.match(native.diagnostics[0]?.message ?? '', /StyleX's Web surface/, property)
    assert.doesNotMatch(native.jsx, /stylex\.props/, property)
  }
})

test('static StyleX keyframes are hoisted once and animationName fails explicitly on Native', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const fade = stylex.keyframes({
  from: { opacity: 0, transform: 'translateY(8px)' },
  '50%': { opacity: 0.5 },
  to: { opacity: 1, transform: 'translateY(0px)' },
})
const styles = stylex.create({
  root: { animationName: fade, animationDuration: '200ms' },
  child: { animationName: fade },
})
export const Card = () => <View {...stylex.props(styles.root)}>
  <View {...stylex.props(styles.child)} />
</View>
`

  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0, JSON.stringify(web.diagnostics))
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  const animationName = web.css.match(/animation-name: (hozo-kf-[a-f0-9]+);/)?.[1]
  assert.ok(animationName, web.css)
  assert.equal(web.css.match(new RegExp(`@keyframes ${animationName}`, 'g'))?.length, 1)
  assert.match(web.css, /from \{[\s\S]*opacity: 0;[\s\S]*transform: translateY\(8px\)/)
  assert.match(web.css, /50% \{[\s\S]*opacity: 0\.5/)
  assert.match(web.css, /to \{[\s\S]*opacity: 1;[\s\S]*transform: translateY\(0px\)/)
  assert.match(web.css, /animation-duration: 0\.2s/)

  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 3, JSON.stringify(native.diagnostics))
  assert.ok(native.diagnostics.every(({ code }) => code === 'WEB_ONLY_PROPERTY_ON_NATIVE'))
  assert.equal(
    native.diagnostics.filter(({ message }) => /animationName.*keyframes/.test(message)).length,
    2,
  )
  assert.doesNotMatch(native.jsx, /stylex\.props/)
})

test('static StyleX keyframe fallbacks preserve official declaration order', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const fadeIn = stylex.keyframes({ from: { opacity: 0 }, to: { opacity: 1 } })
const fadeOut = stylex.keyframes({ from: { opacity: 1 }, to: { opacity: 0 } })
const styles = stylex.create({
  preferredFirst: { animationName: stylex.firstThatWorks(fadeIn, fadeOut) },
  preferredLast: { animationName: [fadeIn, fadeOut] },
})
export const Card = () => <View {...stylex.props(styles.preferredFirst)}>
  <View {...stylex.props(styles.preferredLast)} />
</View>
`
  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0, JSON.stringify(web.diagnostics))
  assert.doesNotMatch(web.jsx, /stylex\.props/)
  const names = [...web.css.matchAll(/@keyframes (hozo-kf-[a-f0-9]+)/g)].map(([, name]) => name)
  assert.equal(names.length, 2, web.css)
  const declarations = [...web.css.matchAll(/animation-name: (hozo-kf-[a-f0-9]+);/g)].map(
    ([, name]) => name,
  )
  assert.deepEqual(declarations, [names[1], names[0], names[0], names[1]])

  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 2, JSON.stringify(native.diagnostics))
  assert.ok(native.diagnostics.every(({ code }) => code === 'WEB_ONLY_PROPERTY_ON_NATIVE'))
  assert.doesNotMatch(native.jsx, /stylex\.props/)
})

test('unsupported StyleX keyframe bodies stay with the official transform', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const dynamic = stylex.keyframes({ from: { opacity: start }, to: { opacity: 1 } })
const styles = stylex.create({ root: { animationName: dynamic } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const web = compile(source)[0]
  assert.ok(web)
  assert.match(web.jsx, /stylex\.props\(styles\.root\)/)
  assert.doesNotMatch(web.css, /@keyframes/)
})

test('practical text StyleX values use typed and contextual Native lowering', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { Text, TextInput } from '@hozo/core'
const styles = stylex.create({
  label: { fontWeight: 700, whiteSpace: 'nowrap' },
  clipped: { whiteSpace: 'nowrap', textOverflow: 'ellipsis' },
  input: { caretColor: stylex.firstThatWorks('#123456', '#654321') },
})
export const Card = () => <>
  <Text {...stylex.props(styles.label)}>Label</Text>
  <Text {...stylex.props(styles.clipped)}>Long text</Text>
  <TextInput accessibilityLabel="Name" {...stylex.props(styles.input)} />
</>
`
  const web = compile(source)
  assert.equal(web.length, 3)
  assert.ok(web.every(({ diagnostics }) => diagnostics.length === 0))
  const css = web.map(({ css }) => css).join('\n')
  assert.match(css, /font-weight: 700/)
  assert.match(css, /white-space: nowrap/)
  assert.match(css, /text-overflow: ellipsis/)
  assert.match(css, /caret-color: #654321;\s+caret-color: #123456/)

  const native = compileNative(source)
  assert.equal(native.length, 3)
  assert.ok(native.every(({ diagnostics }) => diagnostics.length === 0))
  const styles = native.map(({ styles }) => styles).join('\n')
  const jsx = native.map(({ jsx }) => jsx).join('\n')
  assert.match(styles, /fontWeight: '700'/)
  assert.match(jsx, /cursorColor=\{'#123456'\}/)
  assert.match(jsx, /numberOfLines=\{1\}/)
  assert.match(jsx, /ellipsizeMode="clip"/)
  assert.equal((jsx.match(/ellipsizeMode="clip"/g) ?? []).length, 1)
  assert.doesNotMatch(jsx, /stylex\.props/)
})

test('unsupported values inside the Web-only lanes stay with official StyleX', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { touchAction: 'pan-x pinch-zoom' } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
  assert.match(web.jsx, /stylex\.props\(styles\.root\)/)

  const typedSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { order: 1.5, scrollMarginTop: 'calc(1px + 1%)' } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const typedWeb = compile(typedSource)[0]
  assert.ok(typedWeb)
  assert.equal(typedWeb.diagnostics.length, 1)
  assert.equal(typedWeb.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
  assert.match(typedWeb.jsx, /stylex\.props\(styles\.root\)/)
})

test('existing typed Web-only longhands match official StyleX and retain Native refusals', () => {
  const samples = [
    ['order', '3'],
    ['overflowX', `'auto'`],
    ['overflowY', `'clip'`],
    ['scrollBehavior', `'smooth'`],
    ['scrollMarginTop', '4'],
    ['scrollMarginRight', '5'],
    ['scrollMarginBottom', '6'],
    ['scrollMarginLeft', '7'],
    ['scrollMarginBlockStart', '8'],
    ['scrollMarginBlockEnd', '9'],
    ['scrollMarginInlineStart', '10'],
    ['scrollMarginInlineEnd', '11'],
    ['scrollPaddingTop', '12'],
    ['scrollPaddingRight', '13'],
    ['scrollPaddingBottom', '14'],
    ['scrollPaddingLeft', '15'],
    ['scrollPaddingBlockStart', '16'],
    ['scrollPaddingBlockEnd', '17'],
    ['scrollPaddingInlineStart', '18'],
    ['scrollPaddingInlineEnd', '19'],
    ['textIndent', `'12%'`],
  ] as const

  for (const [property, value] of samples) {
    const propertySource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { ${property}: ${value} } })
export const Card = () => <View {...stylex.props(styles.root)} />
`
    const official = transformSync(propertySource, {
      filename: `/app/web-only-typed-${property}.tsx`,
      babelrc: false,
      configFile: false,
      parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
      plugins: [[stylexPlugin, { runtimeInjection: false }]],
    })
    const metadata = official?.metadata as {
      stylex?: [string, { ltr: string }, number][]
    }
    const expected = (metadata.stylex ?? []).map(([, css]) =>
      css.ltr.slice(css.ltr.indexOf('{') + 1, -1),
    )

    const web = compile(propertySource)[0]
    assert.ok(web, property)
    assert.equal(web.diagnostics.length, 0, property)
    const rule = web.css.match(/\.hozo-0 \{\n([\s\S]*?)\n\}/)?.[1]
    assert.ok(rule, `${property}: ${web.css}`)
    const actual = [...rule.matchAll(/^\s*(-?[a-z-]+): ([^;]+);$/gm)].map(
      ([, name, declaration]) => `${name}: ${declaration}`,
    )
    assert.deepEqual(
      Object.fromEntries(declarationMap(actual)),
      Object.fromEntries(declarationMap(expected)),
      property,
    )

    const native = compileNative(propertySource)[0]
    assert.ok(native, property)
    assert.equal(native.diagnostics.length, 1, property)
    assert.equal(native.diagnostics[0]?.code, 'WEB_ONLY_PROPERTY_ON_NATIVE', property)
    assert.doesNotMatch(native.jsx, /stylex\.props/, property)
  }
})

test('StyleX transition configuration drives the existing Native interaction runtime', () => {
  const transitionSource = `import * as stylex from '@stylexjs/stylex'
import { Pressable } from '@hozo/core'
const styles = stylex.create({
  motion: {
    transitionProperty: 'opacity, transform',
    transitionDuration: '200ms',
    transitionTimingFunction: 'ease-in-out',
  },
})
export const Card = () => (
  <Pressable
    accessibilityRole="button"
    className="opacity-100 hover:opacity-50"
    {...stylex.props(styles.motion)}
  />
)
`
  const official = transformSync(transitionSource, {
    filename: '/app/contextual-transition.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const officialCss = (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')

  const web = compile(transitionSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /transition-property: opacity,transform/)
  assert.match(web.css, /transition-duration: 200ms/)
  assert.match(web.css, /transition-timing-function: ease-in-out/)
  assert.match(officialCss, /transition-property:opacity,transform/)
  assert.match(officialCss, /transition-duration:\.2s/)
  assert.match(officialCss, /transition-timing-function:ease-in-out/)

  const native = compileNative(transitionSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.jsx, /HozoPressable/)
  assert.match(
    native.jsx,
    /hozoTransition=\{\{ duration: 200, easing: 'ease-in-out', opacity: true, transform: false, colors: false \}\}/,
  )
})

test('StyleX transition values outside the Native runtime subset stay official', () => {
  const transitionSource = `import * as stylex from '@stylexjs/stylex'
import { Pressable } from '@hozo/core'
const styles = stylex.create({
  motion: {
    transitionProperty: 'filter',
    transitionDuration: '0.5ms',
    transitionTimingFunction: 'steps(2, jump-none)',
  },
})
export const Card = () => <Pressable {...stylex.props(styles.motion)} />
`
  const web = compile(transitionSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 1)
  assert.ok(web.diagnostics.every((diagnostic) => diagnostic.code === 'STYLEX_NOT_LOWERED'))
  assert.match(web.jsx, /stylex\.props/)
})

test('StyleX container metadata reuses the existing contextual container runtime', () => {
  const containerSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    containerName: 'card',
    containerType: 'inline-size',
  },
  normal: {
    containerName: 'ignored',
    containerType: 'normal',
  },
})
export const Card = () => (
  <View {...stylex.props(styles.root)}>
    <View {...stylex.props(styles.normal)} />
  </View>
)
`
  const official = transformSync(containerSource, {
    filename: '/app/contextual-container.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as {
    stylex?: [string, { ltr: string }, number][]
  }
  const officialCss = (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')

  const web = compile(containerSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /container-name: card/)
  assert.match(web.css, /container-type: inline-size/)
  assert.match(web.css, /container-type: normal/)
  assert.match(officialCss, /container-name:card/)
  assert.match(officialCss, /container-type:inline-size/)
  assert.match(officialCss, /container-type:normal/)

  const native = compileNative(containerSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.doesNotMatch(native.jsx, /stylex\.props/)
  assert.match(native.jsx, /HozoContainer/)
  assert.match(native.jsx, /hozoContainerName="card"/)
  assert.doesNotMatch(native.jsx, /hozoContainerName="ignored"/)
  assert.deepEqual(native.runtimeImports, ['HozoContainer'])
})

test('StyleX container names outside the single-name runtime stay official', () => {
  const containerSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    padding: 8,
    containerName: 'main secondary',
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const web = compile(containerSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 1)
  assert.equal(web.diagnostics[0]?.code, 'STYLEX_NOT_LOWERED')
  assert.match(web.css, /padding-top: 8px/)
  assert.match(web.css, /padding-right: 8px/)
  assert.match(web.jsx, /stylex\.props/)
})

test('StyleX transform order is preserved on Web and Native', () => {
  const transformSource = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    transform: 'scale(0.9) translateX(12px) rotate(10deg)',
    transformOrigin: 'left top',
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const web = compile(transformSource)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /transform: scale\(\.9\) translateX\(12px\) rotate\(10deg\)/)
  assert.match(web.css, /transform-origin: left top/)

  const native = compileNative(transformSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.match(
    native.styles,
    /transform: \[\{ scale: 0\.9 \}, \{ translateX: 12 \}, \{ rotate: '10deg' \}\]/,
  )
  assert.match(native.styles, /transformOrigin: 'left top'/)
})

test('StyleX standalone transforms match official CSS and compose on Native', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({
  root: {
    scale: '0.9 110%',
    rotate: '10deg',
    translate: '12px 25%',
  },
})
export const Card = () => <View {...stylex.props(styles.root)} />
`
  const official = transformSync(source, {
    filename: '/app/StandaloneTransforms.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = official?.metadata as { stylex?: [string, { ltr: string }, number][] }
  const officialCss = (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')
  assert.match(officialCss, /scale:\.9 110%/)
  assert.match(officialCss, /rotate:10deg/)
  assert.match(officialCss, /translate:12px 25%/)

  const web = compile(source)[0]
  assert.ok(web)
  assert.equal(web.diagnostics.length, 0)
  assert.match(web.css, /scale: 0\.9 110%/)
  assert.match(web.css, /rotate: 10deg/)
  assert.match(web.css, /translate: 12px 25%/)

  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.match(
    native.styles,
    /transform: \[\{ translateX: 12 \}, \{ translateY: '25%' \}, \{ rotate: '10deg' \}, \{ scaleX: 0\.9 \}, \{ scaleY: 1\.1 \}\]/,
  )
})

test('conditional StyleX standalone transforms reuse the Native transition runtime', () => {
  const source = `import * as stylex from '@stylexjs/stylex'
import { Pressable } from '@hozo/core'
const styles = stylex.create({
  root: {
    transitionProperty: 'transform',
    ':hover': { scale: 0.95, translate: '4px 0px' },
  },
})
export const Card = () => (
  <Pressable accessibilityRole="button" {...stylex.props(styles.root)} />
)
`
  const native = compileNative(source)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.match(native.jsx, /HozoPressable/)
  assert.match(native.jsx, /transform: true/)
  assert.match(native.jsx, /hovered && hozoStyles\.hozo0_hover/)
  assert.match(
    native.styles,
    /transform: \[\{ translateX: 4 \}, \{ translateY: 0 \}, \{ scale: 0\.95 \}\]/,
  )
})

test('StyleX and Tailwind standalone scale retain JSX last-wins order', () => {
  const component = (attributes: string, native = false) => {
    const input = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { scale: 0.9 } })
export const Card = () => <View ${attributes} />
`
    return (native ? compileNative(input) : compile(input))[0]
  }

  const stylexWeb = component(`className="scale-50" {...stylex.props(styles.root)}`)
  assert.ok(stylexWeb)
  assert.match(stylexWeb.css, /scale: 0\.9/)
  assert.doesNotMatch(stylexWeb.css, /scale: 50% 50%/)

  const tailwindWeb = component(`{...stylex.props(styles.root)} className="scale-50"`)
  assert.ok(tailwindWeb)
  assert.match(tailwindWeb.css, /scale: 50% 50%/)
  assert.doesNotMatch(tailwindWeb.css, /scale: 0\.9/)

  const stylexNative = component(`className="scale-50" {...stylex.props(styles.root)}`, true)
  assert.ok(stylexNative)
  assert.match(stylexNative.styles, /transform: \[\{ scale: 0\.9 \}\]/)
  assert.doesNotMatch(stylexNative.styles, /scale: 0\.5/)

  const tailwindNative = component(`{...stylex.props(styles.root)} className="scale-50"`, true)
  assert.ok(tailwindNative)
  assert.match(tailwindNative.styles, /transform: \[\{ scale: 0\.5 \}\]/)
  assert.doesNotMatch(tailwindNative.styles, /scale: 0\.9/)
})

test('StyleX and Tailwind transform declarations retain JSX last-wins order', () => {
  const component = (attributes: string, native = false) => {
    const input = `import * as stylex from '@stylexjs/stylex'
import { View } from '@hozo/core'
const styles = stylex.create({ root: { transform: 'rotate(10deg)' } })
export const Card = () => <View ${attributes} />
`
    return (native ? compileNative(input) : compile(input))[0]
  }

  const stylexWeb = component(`className="skew-x-3" {...stylex.props(styles.root)}`)
  assert.ok(stylexWeb)
  assert.match(stylexWeb.css, /transform: rotate\(10deg\)/)
  assert.doesNotMatch(stylexWeb.css, /transform: skewX/)

  const tailwindWeb = component(`{...stylex.props(styles.root)} className="skew-x-3"`)
  assert.ok(tailwindWeb)
  assert.match(tailwindWeb.css, /transform: skewX\(3deg\)/)
  assert.doesNotMatch(tailwindWeb.css, /transform: rotate\(10deg\)/)

  const stylexNative = component(`className="skew-x-3" {...stylex.props(styles.root)}`, true)
  assert.ok(stylexNative)
  assert.match(stylexNative.styles, /transform: \[\{ rotate: '10deg' \}\]/)
  assert.doesNotMatch(stylexNative.styles, /skewX/)

  const tailwindNative = component(`{...stylex.props(styles.root)} className="skew-x-3"`, true)
  assert.ok(tailwindNative)
  assert.match(tailwindNative.styles, /transform: \[\{ skewX: '3deg' \}\]/)
  assert.doesNotMatch(tailwindNative.styles, /rotate:/)
})
