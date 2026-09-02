import { createHash } from 'node:crypto'

import { transformSync } from '@babel/core'
import { compile, compileNative, createCompiler } from '@hozo/compiler'
import stylexPlugin from '@stylexjs/babel-plugin'

import { manifestEntry } from './stylex-surface.ts'

export interface StylexValueCase {
  property: string
  value: string | number
}

// Fixed, common-value corpus. Adding cases is expected; removing one moves
// the snapshot denominator and therefore needs an explicit review.
export const STYLEX_VALUE_CASES: readonly StylexValueCase[] = [
  { property: 'paddingTop', value: 16 },
  { property: 'paddingInlineStart', value: 12 },
  { property: 'marginLeft', value: -8 },
  { property: 'width', value: 240 },
  { property: 'height', value: '50%' },
  { property: 'minWidth', value: 0 },
  { property: 'maxHeight', value: 480 },
  { property: 'backgroundColor', value: '#123456' },
  { property: 'color', value: '#ffffff' },
  { property: 'opacity', value: 0.5 },
  { property: 'flexDirection', value: 'row' },
  { property: 'alignItems', value: 'center' },
  { property: 'justifyContent', value: 'space-between' },
  { property: 'rowGap', value: 12 },
  { property: 'borderTopLeftRadius', value: 8 },
  { property: 'borderTopWidth', value: 2 },
  { property: 'borderStyle', value: 'solid' },
  { property: 'fontSize', value: 16 },
  { property: 'fontWeight', value: 700 },
  { property: 'lineHeight', value: 1.5 },
  { property: 'letterSpacing', value: 0.25 },
  { property: 'overflow', value: 'hidden' },
  { property: 'textAlign', value: 'center' },
  { property: 'textDecorationLine', value: 'underline' },
  { property: 'transform', value: 'rotate(10deg)' },
  { property: 'transformOrigin', value: 'center' },
  { property: 'pointerEvents', value: 'none' },
  { property: 'userSelect', value: 'none' },
  { property: 'appearance', value: 'none' },
  { property: 'scrollSnapType', value: 'x mandatory' },
  { property: 'overflowX', value: 'auto' },
  { property: 'textIndent', value: 12 },
  { property: 'containerType', value: 'inline-size' },
  { property: 'gridTemplateColumns', value: '1fr 1fr' },
  { property: 'transitionDuration', value: '200ms' },
  { property: 'whiteSpace', value: 'nowrap' },
  { property: 'textOverflow', value: 'ellipsis' },
  { property: 'wordBreak', value: 'break-word' },
  { property: 'overflowWrap', value: 'anywhere' },
  { property: 'caretColor', value: '#123456' },
  { property: 'visibility', value: 'hidden' },
  { property: 'backgroundPosition', value: 'center' },
  { property: 'backgroundRepeat', value: 'no-repeat' },
  { property: 'backgroundSize', value: 'cover' },
  { property: 'objectPosition', value: 'center' },
  { property: 'justifySelf', value: 'center' },
  { property: 'placeItems', value: 'center' },
  { property: 'transitionDelay', value: '100ms' },
  { property: 'animationDuration', value: '200ms' },
  { property: 'fontKerning', value: 'normal' },
  { property: 'fontOpticalSizing', value: 'auto' },
  { property: 'fontStretch', value: 'condensed' },
  { property: 'fontSynthesisPosition', value: 'none' },
  { property: 'fontSynthesisSmallCaps', value: 'none' },
  { property: 'fontSynthesisStyle', value: 'none' },
  { property: 'fontSynthesisWeight', value: 'none' },
  { property: 'fontVariantCaps', value: 'small-caps' },
  { property: 'fontVariantLigatures', value: 'none' },
  { property: 'fontVariantNumeric', value: 'tabular-nums' },
  { property: 'fontVariantPosition', value: 'super' },
  { property: 'hyphens', value: 'auto' },
  { property: 'lineBreak', value: 'strict' },
  { property: 'textAlignLast', value: 'center' },
  { property: 'textDecorationSkipInk', value: 'all' },
  { property: 'textJustify', value: 'inter-word' },
  { property: 'textOrientation', value: 'upright' },
  { property: 'textWrap', value: 'balance' },
  { property: 'blockSize', value: 320 },
  { property: 'inlineSize', value: '50%' },
  { property: 'minBlockSize', value: 'auto' },
  { property: 'minInlineSize', value: '12rem' },
  { property: 'maxBlockSize', value: 'none' },
  { property: 'maxInlineSize', value: 'fit-content' },
  { property: 'justifyItems', value: 'center' },
  { property: 'placeSelf', value: 'center center' },
  { property: 'backgroundAttachment', value: 'fixed' },
  { property: 'backgroundBlendMode', value: 'multiply' },
  { property: 'backgroundClip', value: 'text' },
  { property: 'WebkitBackgroundClip', value: 'text' },
  { property: 'backgroundOrigin', value: 'padding-box' },
  { property: 'backgroundPositionX', value: 'left' },
  { property: 'backgroundPositionY', value: 'bottom' },
  { property: 'accentColor', value: '#123456' },
  { property: 'caretShape', value: 'bar' },
  { property: 'WebkitTextFillColor', value: 'currentColor' },
  { property: 'WebkitTextStrokeColor', value: '#abcdef' },
  { property: 'WebkitTapHighlightColor', value: 'transparent' },
  { property: 'MozOsxFontSmoothing', value: 'grayscale' },
  { property: 'WebkitFontSmoothing', value: 'antialiased' },
  { property: 'writingMode', value: 'vertical-rl' },
  { property: 'alignmentBaseline', value: 'middle' },
  { property: 'baselineShift', value: '2px' },
  { property: 'clipRule', value: 'evenodd' },
  { property: 'dominantBaseline', value: 'central' },
  { property: 'fill', value: '#123456' },
  { property: 'fillOpacity', value: 0.5 },
  { property: 'fillRule', value: 'nonzero' },
  { property: 'marker', value: 'url(#dot)' },
  { property: 'markerEnd', value: 'none' },
  { property: 'markerMid', value: 'url(#dot)' },
  { property: 'markerStart', value: 'url(#dot)' },
  { property: 'paintOrder', value: 'stroke fill markers' },
  { property: 'shapeRendering', value: 'crispEdges' },
  { property: 'stroke', value: 'currentColor' },
  { property: 'strokeDasharray', value: '5 3' },
  { property: 'strokeDashoffset', value: 2 },
  { property: 'strokeLinecap', value: 'round' },
  { property: 'strokeLinejoin', value: 'bevel' },
  { property: 'strokeMiterlimit', value: 4 },
  { property: 'strokeOpacity', value: 0.5 },
  { property: 'strokeWidth', value: '2px' },
  { property: 'textAnchor', value: 'middle' },
  { property: 'borderCollapse', value: 'collapse' },
  { property: 'borderSpacing', value: '8px 12px' },
  { property: 'captionSide', value: 'block-start' },
  { property: 'clip', value: 'rect(0 10px 10px 0)' },
  { property: 'columnCount', value: 3 },
  { property: 'columnFill', value: 'balance' },
  { property: 'columnRuleColor', value: '#123456' },
  { property: 'columnRuleStyle', value: 'dashed' },
  { property: 'columnRuleWidth', value: '2px' },
  { property: 'columnSpan', value: 'all' },
  { property: 'columnWidth', value: '16rem' },
  { property: 'contain', value: 'layout paint' },
  { property: 'contentVisibility', value: 'auto' },
  { property: 'displayInside', value: 'grid' },
  { property: 'displayList', value: 'list-item' },
  { property: 'displayOutside', value: 'inline-level' },
  { property: 'emptyCells', value: 'hide' },
  { property: 'listStyleImage', value: 'url(#marker)' },
  { property: 'listStylePosition', value: 'inside' },
  { property: 'listStyleType', value: 'decimal-leading-zero' },
  { property: 'tableLayout', value: 'fixed' },
  { property: 'columns', value: '16rem 3' },
  { property: 'columnRule', value: '2px dashed #123456' },
  { property: 'listStyle', value: 'url(#marker) outside square' },
  { property: 'scrollMargin', value: '8px 12px 16px 20px' },
  { property: 'scrollPadding', value: 8 },
  { property: 'scrollMarginBlock', value: '8px 12px' },
  { property: 'scrollMarginInline', value: -4 },
  { property: 'scrollPaddingBlock', value: 8 },
  { property: 'scrollPaddingInline', value: '8px 12px' },
] as const

function jsValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value)
}

function sourceFor({ property, value }: StylexValueCase): string {
  const textProperties = new Set([
    'color',
    'fontSize',
    'fontWeight',
    'lineHeight',
    'letterSpacing',
    'textAlign',
    'textDecorationLine',
    'textIndent',
    'whiteSpace',
    'textOverflow',
    'wordBreak',
    'overflowWrap',
    'fontKerning',
    'fontOpticalSizing',
    'fontStretch',
    'fontSynthesisPosition',
    'fontSynthesisSmallCaps',
    'fontSynthesisStyle',
    'fontSynthesisWeight',
    'fontVariantCaps',
    'fontVariantLigatures',
    'fontVariantNumeric',
    'fontVariantPosition',
    'hyphens',
    'lineBreak',
    'textAlignLast',
    'textDecorationSkipInk',
    'textJustify',
    'textOrientation',
    'textWrap',
  ])
  const component =
    property === 'caretColor'
      ? 'TextInput'
      : textProperties.has(property)
        ? 'Text'
        : property.startsWith('transition')
          ? 'Pressable'
          : 'View'
  const companions =
    property === 'gridTemplateColumns'
      ? "display: 'grid', "
      : property === 'transitionDuration'
        ? "transitionProperty: 'opacity', "
        : property === 'textOverflow'
          ? "whiteSpace: 'nowrap', "
          : property === 'lineHeight'
            ? 'fontSize: 16, '
            : ''
  const props =
    component === 'Pressable'
      ? ' accessibilityRole="button" className="opacity-100 hover:opacity-50"'
      : component === 'TextInput'
        ? ' accessibilityLabel="Field"'
        : ''
  return `import * as stylex from '@stylexjs/stylex'
import { ${component} } from '@hozo/core'
const styles = stylex.create({ root: { ${companions}${property}: ${jsValue(value)} } })
export const Probe = () => <${component}${props} {...stylex.props(styles.root)} />
`
}

function cssComponents(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let depth = 0
  let quote = ''
  let escaped = false
  for (const character of value) {
    if (escaped) {
      current += character
      escaped = false
      continue
    }
    if (character === '\\' && quote) {
      current += character
      escaped = true
      continue
    }
    if (quote) {
      current += character
      if (character === quote) quote = ''
      continue
    }
    if (character === '"' || character === "'") quote = character
    if (character === '(') depth += 1
    if (character === ')') depth -= 1
    if (/\s/.test(character) && depth === 0) {
      if (current) parts.push(current)
      current = ''
    } else {
      current += character
    }
  }
  if (current) parts.push(current)
  return parts
}

function expandStylexShorthand(property: string, value: string): Array<[string, string]> {
  const parts = cssComponents(value)
  if (
    property === 'scroll-margin-block' ||
    property === 'scroll-margin-inline' ||
    property === 'scroll-padding-block' ||
    property === 'scroll-padding-inline'
  ) {
    const start = parts[0]
    if (!start) return [[property, value]]
    const end = parts[1] ?? start
    return [
      [`${property}-start`, start],
      [`${property}-end`, end],
    ]
  }
  if (property === 'scroll-margin' || property === 'scroll-padding') {
    const top = parts[0]
    if (!top) return [[property, value]]
    const right = parts[1] ?? top
    const bottom = parts[2] ?? top
    const left = parts[3] ?? right
    return [
      [`${property}-top`, top],
      [`${property}-right`, right],
      [`${property}-bottom`, bottom],
      [`${property}-left`, left],
    ]
  }
  if (property === 'columns') {
    const count = parts.find((part) => /^\d+$/.test(part)) ?? 'auto'
    const width = parts.find((part) => part !== count && part !== 'auto') ?? 'auto'
    return [
      ['column-width', width],
      ['column-count', count],
    ]
  }
  if (property === 'column-rule') {
    const styles = new Set([
      'none',
      'hidden',
      'dotted',
      'dashed',
      'solid',
      'double',
      'groove',
      'ridge',
      'inset',
      'outset',
    ])
    const widths =
      /^(?:0|[+-]?(?:\d+\.?\d*|\.\d+)(?:px|rem|em|ch|ex|cap|ic|lh|rlh|v[whib]|vmin|vmax|s[cv][wh]|l[cv][wh]|d[cv][wh]|cm|mm|q|in|pc|pt)|thin|medium|thick)$/
    const width = parts.find((part) => widths.test(part)) ?? 'medium'
    const style = parts.find((part) => styles.has(part)) ?? 'none'
    const color = parts.find((part) => part !== width && part !== style) ?? 'currentcolor'
    return [
      ['column-rule-width', width],
      ['column-rule-style', style],
      ['column-rule-color', color],
    ]
  }
  if (property === 'list-style') {
    const positions = new Set(['inside', 'outside'])
    const types = new Set([
      'none',
      'disc',
      'circle',
      'square',
      'decimal',
      'decimal-leading-zero',
      'lower-roman',
      'upper-roman',
      'lower-greek',
      'lower-latin',
      'upper-latin',
      'armenian',
      'georgian',
      'lower-alpha',
      'upper-alpha',
    ])
    if (parts.length === 1 && ['inherit', 'initial', 'revert', 'unset'].includes(parts[0])) {
      return [
        ['list-style-type', parts[0]],
        ['list-style-position', parts[0]],
        ['list-style-image', parts[0]],
      ]
    }
    const position = parts.find((part) => positions.has(part)) ?? 'outside'
    const type = parts.find((part) => types.has(part)) ?? 'disc'
    const image = parts.find((part) => part !== position && part !== type) ?? 'none'
    return [
      ['list-style-type', type],
      ['list-style-position', position],
      ['list-style-image', image],
    ]
  }
  return [[property, value]]
}

function declarationMap(css: string): Map<string, string> {
  const declarations = new Map<string, string>()
  for (const block of css.matchAll(/\{([^{}]*)\}/g)) {
    for (const declaration of block[1].split(';')) {
      const split = declaration.indexOf(':')
      if (split === -1) continue
      const property = declaration.slice(0, split).trim()
      if (!property) continue
      let value = declaration.slice(split + 1).trim()
      value = value
        .replace(/^(-?)\.(\d)/, '$10.$2')
        .replace(/,\s+/g, ',')
        .replace(/^(-?0)(?:px|rem|em|%)$/, '$1')
        .replace(/^(-?\d*\.?\d+)s$/, (_match, seconds: string) => `${Number(seconds) * 1000}ms`)
      const expanded =
        property === 'border-style'
          ? [
              'border-top-style',
              'border-right-style',
              'border-bottom-style',
              'border-left-style',
            ].map((name) => [name, value] as [string, string])
          : expandStylexShorthand(property, value)
      for (const [name, expandedValue] of expanded) declarations.set(name, expandedValue)
    }
  }
  return declarations
}

function officialCss(source: string): string {
  const output = transformSync(source, {
    filename: '/app/stylex-practical.tsx',
    babelrc: false,
    configFile: false,
    parserOpts: { sourceType: 'module', plugins: ['typescript', 'jsx'] },
    plugins: [[stylexPlugin, { runtimeInjection: false }]],
  })
  const metadata = output?.metadata as { stylex?: [string, { ltr: string }, number][] }
  return (metadata.stylex ?? []).map(([, css]) => css.ltr).join('\n')
}

export interface StylexValueResult extends StylexValueCase {
  covered: boolean
  silent: boolean
}

export function compareStylexValue(testCase: StylexValueCase): StylexValueResult {
  const source = sourceFor(testCase)
  const expected = declarationMap(officialCss(source))
  const web = compile(source)[0]
  const native = compileNative(source)[0]
  if (!web || !native) return { ...testCase, covered: false, silent: true }

  const actual = declarationMap(web.css)
  const cssMatches =
    expected.size > 0 && [...expected].every(([property, value]) => actual.get(property) === value)
  const webConsumed = !web.jsx.includes('stylex.props')
  const entry = manifestEntry(testCase.property)
  const nativePolicyMatches =
    entry?.lane === 'web-only'
      ? native.diagnostics.some(({ code }) => code === 'WEB_ONLY_PROPERTY_ON_NATIVE') &&
        !native.jsx.includes('stylex.props')
      : native.diagnostics.length === 0 && !native.jsx.includes('stylex.props')
  const covered = cssMatches && web.diagnostics.length === 0 && webConsumed && nativePolicyMatches
  const explicitlyPreserved =
    web.diagnostics.length > 0 || native.diagnostics.length > 0 || web.jsx.includes('stylex.props')
  return {
    ...testCase,
    covered,
    silent: !covered && !explicitlyPreserved,
  }
}

interface StylexConstructCase {
  name: string
  expression: string
  definitions?: string
}

const STYLEX_CONSTRUCT_CASES: readonly StylexConstructCase[] = [
  { name: 'flat create', expression: 'styles.root' },
  { name: 'logical condition', expression: 'styles.root, active && styles.active' },
  { name: 'falsy arguments', expression: 'null, false, styles.root' },
  { name: 'multiple rules', expression: 'styles.root, styles.active' },
  { name: 'aliased namespace import', expression: 'styles.root' },
  { name: 'recursive array', expression: '[styles.root, active && styles.active]' },
  { name: 'ternary argument', expression: 'active ? styles.active : styles.root' },
  {
    name: 'nested pseudo-class',
    expression: 'styles.pseudo',
    definitions: "pseudo: { ':hover': { opacity: 0.5 } },",
  },
  {
    name: 'nested media query',
    expression: 'styles.media',
    definitions: "media: { '@media (min-width: 600px)': { padding: 24 } },",
  },
  {
    name: 'rule object spread',
    expression: 'styles.spread',
    definitions: 'spread: { ...shared, padding: 16 },',
  },
  {
    name: 'firstThatWorks',
    expression: 'styles.fallback',
    definitions: "fallback: { display: stylex.firstThatWorks('grid', 'flex') },",
  },
  {
    name: 'defineVars value',
    expression: 'styles.variable',
    definitions: 'variable: { color: tokens.accent },',
  },
  {
    name: 'static function style',
    expression: 'styles.dynamic(0.5)',
    definitions: 'dynamic: (value) => ({ opacity: value }),',
  },
  { name: 'cross-file sheet', expression: 'external.root' },
] as const

function constructSource(testCase: StylexConstructCase): string {
  const alias = testCase.name === 'aliased namespace import' ? 'sx' : 'stylex'
  const component =
    testCase.name === 'nested pseudo-class'
      ? 'Pressable'
      : testCase.name === 'defineVars value'
        ? 'Text'
        : 'View'
  const componentProps =
    testCase.name === 'nested pseudo-class' ? ' accessibilityRole="button"' : ''
  const prefix =
    testCase.name === 'cross-file sheet'
      ? "import { styles as external } from './external.stylex'\n"
      : ''
  const shared = testCase.name === 'rule object spread' ? 'const shared = { opacity: 0.5 }\n' : ''
  const tokens =
    testCase.name === 'defineVars value'
      ? "const tokens = stylex.defineVars({ accent: '#123456' })\n"
      : ''
  return `import * as ${alias} from '@stylexjs/stylex'
import { Pressable, Text, View } from '@hozo/core'
${prefix}${shared}${tokens}const styles = ${alias}.create({
  root: { padding: 16 },
  active: { opacity: 0.5 },
  ${testCase.definitions ?? ''}
})
export const Probe = ({ active }) => <${component}${componentProps} {...${alias}.props(${testCase.expression})} />
`
}

export interface StylexConstructResult {
  name: string
  covered: boolean
  silent: boolean
}

const EXTERNAL_STYLEX_ID = '/app/external.stylex.ts'
const EXTERNAL_STYLEX_SOURCE = `import * as stylex from '@stylexjs/stylex'
export const styles = stylex.create({ root: { padding: 16 } })
`

function compileStylexConstruct(testCase: StylexConstructCase) {
  const source = constructSource(testCase)
  if (testCase.name !== 'cross-file sheet') return compileNative(source)[0]

  // A cross-file sheet does not exist to the parser in isolation. This is
  // the same hand-off the bundler integrations perform after their own
  // resolver has selected the module: register its source once, then bind
  // the import spelling in this consumer to that registry id.
  const compiler = createCompiler()
  compiler.setStylexModules([
    {
      id: EXTERNAL_STYLEX_ID,
      contentHash: createHash('sha256').update(EXTERNAL_STYLEX_SOURCE).digest('hex'),
      source: EXTERNAL_STYLEX_SOURCE,
      links: [],
    },
  ])
  return compiler.compileNative(source, [
    { specifier: './external.stylex', moduleId: EXTERNAL_STYLEX_ID },
  ])[0]
}

export function compareStylexConstruct(testCase: StylexConstructCase): StylexConstructResult {
  const native = compileStylexConstruct(testCase)
  if (!native) return { name: testCase.name, covered: false, silent: true }
  const consumed = !native.jsx.includes('.props(')
  const diagnosed = native.diagnostics.some(({ code }) => code === 'STYLEX_NOT_LOWERED')
  return {
    name: testCase.name,
    covered: consumed && !diagnosed,
    silent: !consumed && !diagnosed,
  }
}

export const STYLEX_REAL_SOURCE_FIXTURES = {
  card: STYLEX_VALUE_CASES.slice(0, 14),
  typography: STYLEX_VALUE_CASES.filter(({ property }) =>
    [
      'color',
      'fontSize',
      'fontWeight',
      'lineHeight',
      'letterSpacing',
      'textAlign',
      'textDecorationLine',
      'whiteSpace',
      'textOverflow',
      'wordBreak',
      'overflowWrap',
      'fontKerning',
      'fontOpticalSizing',
      'fontStretch',
      'fontSynthesisPosition',
      'fontSynthesisSmallCaps',
      'fontSynthesisStyle',
      'fontSynthesisWeight',
      'fontVariantCaps',
      'fontVariantLigatures',
      'fontVariantNumeric',
      'fontVariantPosition',
      'hyphens',
      'lineBreak',
      'textAlignLast',
      'textDecorationSkipInk',
      'textJustify',
      'textOrientation',
      'textWrap',
    ].includes(property),
  ),
  input: STYLEX_VALUE_CASES.filter(({ property }) =>
    [
      'paddingTop',
      'backgroundColor',
      'color',
      'borderTopWidth',
      'borderStyle',
      'caretColor',
      'appearance',
      'opacity',
    ].includes(property),
  ),
  scroll: STYLEX_VALUE_CASES.filter(({ property }) =>
    [
      'overflow',
      'overflowX',
      'scrollSnapType',
      'textIndent',
      'visibility',
      'scrollMarginBlock',
      'scrollMarginInline',
      'scrollPaddingBlock',
      'scrollPaddingInline',
    ].includes(property),
  ),
  motion: STYLEX_VALUE_CASES.filter(({ property }) =>
    [
      'transform',
      'transformOrigin',
      'transitionDuration',
      'transitionDelay',
      'animationDuration',
      'opacity',
    ].includes(property),
  ),
  grid: STYLEX_VALUE_CASES.filter(({ property }) =>
    ['gridTemplateColumns', 'containerType', 'rowGap', 'justifySelf', 'placeItems'].includes(
      property,
    ),
  ),
  browser: STYLEX_VALUE_CASES.filter(({ property }) =>
    [
      'blockSize',
      'inlineSize',
      'minBlockSize',
      'minInlineSize',
      'maxBlockSize',
      'maxInlineSize',
      'justifyItems',
      'placeSelf',
      'backgroundAttachment',
      'backgroundBlendMode',
      'backgroundClip',
      'WebkitBackgroundClip',
      'backgroundOrigin',
      'backgroundPositionX',
      'backgroundPositionY',
      'accentColor',
      'caretShape',
      'WebkitTextFillColor',
      'WebkitTextStrokeColor',
      'WebkitTapHighlightColor',
      'MozOsxFontSmoothing',
      'WebkitFontSmoothing',
      'writingMode',
    ].includes(property),
  ),
} as const

export interface StylexPracticalScorecard {
  values: { total: number; covered: number }
  constructs: { total: number; covered: number }
  corpus: { total: number; covered: number }
  silent: number
}

export function stylexPracticalScorecard(): StylexPracticalScorecard {
  const cache = new Map<string, StylexValueResult>()
  const compare = (testCase: StylexValueCase) => {
    const key = `${testCase.property}:${JSON.stringify(testCase.value)}`
    const existing = cache.get(key)
    if (existing) return existing
    const result = compareStylexValue(testCase)
    cache.set(key, result)
    return result
  }
  const valueResults = STYLEX_VALUE_CASES.map(compare)
  const constructResults = STYLEX_CONSTRUCT_CASES.map(compareStylexConstruct)
  const corpusResults = Object.values(STYLEX_REAL_SOURCE_FIXTURES).flat().map(compare)
  return {
    values: {
      total: valueResults.length,
      covered: valueResults.filter(({ covered }) => covered).length,
    },
    constructs: {
      total: constructResults.length,
      covered: constructResults.filter(({ covered }) => covered).length,
    },
    corpus: {
      total: corpusResults.length,
      covered: corpusResults.filter(({ covered }) => covered).length,
    },
    silent: [...valueResults, ...constructResults, ...corpusResults].filter(({ silent }) => silent)
      .length,
  }
}
