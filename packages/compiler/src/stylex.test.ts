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
  root: { padding: 16, scrollbarWidth: 'thin' },
  active: { opacity: 0.5, scrollbarColor: 'red blue' },
})
export const Card = ({ active }) => (
  <View {...stylex.props(styles.root, active && styles.active)} />
)
`
  const web = compile(mixed)[0]
  assert.ok(web)
  assert.match(web.css, /padding-top: 16px/)
  assert.match(web.css, /opacity: 0.5/)
  assert.match(web.jsx, /stylex\.create\(\{ __hozo0: \{ scrollbarWidth: 'thin' \} \}\)/)
  assert.match(web.jsx, /active\) && stylex\.create\(\{ __hozo1: \{ scrollbarColor: 'red blue' \} \}\)/)
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
    value = value.replace(/^(-?)\.(\d)/, (_match, sign: string, digit: string) => `${sign}0.${digit}`)
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
        return ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color']
      }
      if (property === 'border-width') {
        return ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width']
      }
      if (property === 'border-style') {
        return ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']
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

const atomicPrioritySource = (argumentsSource: string) => `import * as stylex from '@stylexjs/stylex'
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

  for (const argumentsSource of [
    'styles.specific, styles.all',
    'styles.all, styles.specific',
  ]) {
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
  assert.deepEqual(
    Object.fromEntries(actual),
    Object.fromEntries(expected),
  )

  const native = compileNative(gridSource)[0]
  assert.ok(native)
  assert.equal(native.diagnostics.length, 0)
  assert.deepEqual(new Set(native.runtimeImports), new Set(['HozoGrid', 'HozoGridItem']))
  assert.match(
    native.jsx,
    /tracks=\{\[\{ kind: 'fr', value: 1 \}, \{ kind: 'fr', value: 1 \}, \{ kind: 'fr', value: 1 \}\]\}/,
  )
  assert.match(native.jsx, /rowTracks=\{\[\{ kind: 'points', value: 80 \}, \{ kind: 'fr', value: 1 \}\]\}/)
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
      assert.match(native.styles, /backgroundImage: 'linear-gradient\(90deg,#123456,#abcdef\)'/, property)
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

  const stylexNative = component(
    `className="skew-x-3" {...stylex.props(styles.root)}`,
    true,
  )
  assert.ok(stylexNative)
  assert.match(stylexNative.styles, /transform: \[\{ rotate: '10deg' \}\]/)
  assert.doesNotMatch(stylexNative.styles, /skewX/)

  const tailwindNative = component(
    `{...stylex.props(styles.root)} className="skew-x-3"`,
    true,
  )
  assert.ok(tailwindNative)
  assert.match(tailwindNative.styles, /transform: \[\{ skewX: '3deg' \}\]/)
  assert.doesNotMatch(tailwindNative.styles, /rotate:/)
})
