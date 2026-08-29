import { transformSync } from '@babel/core'
import stylexPlugin from '@stylexjs/babel-plugin'
import { compile, compileNative } from '@hozo/compiler'

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
] as const

function jsValue(value: string | number): string {
  return typeof value === 'number' ? String(value) : JSON.stringify(value)
}

function sourceFor({ property, value }: StylexValueCase): string {
  const textProperties = new Set([
    'color', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
    'textDecorationLine', 'textIndent', 'whiteSpace', 'textOverflow', 'wordBreak',
    'overflowWrap',
  ])
  const component = property === 'caretColor'
    ? 'TextInput'
    : textProperties.has(property)
    ? 'Text'
    : property.startsWith('transition')
      ? 'Pressable'
      : 'View'
  const companions = property === 'gridTemplateColumns'
    ? "display: 'grid', "
    : property === 'transitionDuration'
      ? "transitionProperty: 'opacity', "
      : property === 'textOverflow'
        ? "whiteSpace: 'nowrap', "
      : property === 'lineHeight'
        ? 'fontSize: 16, '
        : ''
  const props = component === 'Pressable'
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
      const expanded = property === 'border-style'
        ? ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style']
        : [property]
      for (const name of expanded) declarations.set(name, value)
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
  const cssMatches = expected.size > 0
    && [...expected].every(([property, value]) => actual.get(property) === value)
  const webConsumed = !web.jsx.includes('stylex.props')
  const entry = manifestEntry(testCase.property)
  const nativePolicyMatches = entry?.lane === 'web-only'
    ? native.diagnostics.some(({ code }) => code === 'WEB_ONLY_PROPERTY_ON_NATIVE')
      && !native.jsx.includes('stylex.props')
    : native.diagnostics.length === 0 && !native.jsx.includes('stylex.props')
  const covered = cssMatches && web.diagnostics.length === 0 && webConsumed && nativePolicyMatches
  const explicitlyPreserved = web.diagnostics.length > 0
    || native.diagnostics.length > 0
    || web.jsx.includes('stylex.props')
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
  { name: 'nested pseudo-class', expression: 'styles.pseudo', definitions: "pseudo: { ':hover': { opacity: 0.5 } }," },
  { name: 'nested media query', expression: 'styles.media', definitions: "media: { '@media (min-width: 600px)': { padding: 24 } }," },
  { name: 'rule object spread', expression: 'styles.spread', definitions: 'spread: { ...shared, padding: 16 },' },
  { name: 'firstThatWorks', expression: 'styles.fallback', definitions: "fallback: { display: stylex.firstThatWorks('grid', 'flex') }," },
  { name: 'defineVars value', expression: 'styles.variable', definitions: 'variable: { color: tokens.accent },' },
  { name: 'function style', expression: 'styles.dynamic(0.5)', definitions: 'dynamic: (value) => ({ opacity: value }),' },
  { name: 'cross-file sheet', expression: 'external.root' },
] as const

function constructSource(testCase: StylexConstructCase): string {
  const alias = testCase.name === 'aliased namespace import' ? 'sx' : 'stylex'
  const prefix = testCase.name === 'cross-file sheet'
    ? "import { styles as external } from './external.stylex'\n"
    : ''
  const shared = testCase.name === 'rule object spread' ? 'const shared = { opacity: 0.5 }\n' : ''
  const tokens = testCase.name === 'defineVars value'
    ? "const tokens = stylex.defineVars({ accent: '#123456' })\n"
    : ''
  return `import * as ${alias} from '@stylexjs/stylex'
import { View } from '@hozo/core'
${prefix}${shared}${tokens}const styles = ${alias}.create({
  root: { padding: 16 },
  active: { opacity: 0.5 },
  ${testCase.definitions ?? ''}
})
export const Probe = ({ active }) => <View {...${alias}.props(${testCase.expression})} />
`
}

export interface StylexConstructResult {
  name: string
  covered: boolean
  silent: boolean
}

export function compareStylexConstruct(testCase: StylexConstructCase): StylexConstructResult {
  const native = compileNative(constructSource(testCase))[0]
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
  typography: STYLEX_VALUE_CASES.filter(({ property }) => [
    'color', 'fontSize', 'fontWeight', 'lineHeight', 'letterSpacing', 'textAlign',
    'textDecorationLine', 'whiteSpace', 'textOverflow', 'wordBreak', 'overflowWrap',
  ].includes(property)),
  input: STYLEX_VALUE_CASES.filter(({ property }) => [
    'paddingTop', 'backgroundColor', 'color', 'borderTopWidth', 'borderStyle',
    'caretColor', 'appearance', 'opacity',
  ].includes(property)),
  scroll: STYLEX_VALUE_CASES.filter(({ property }) => [
    'overflow', 'overflowX', 'scrollSnapType', 'textIndent', 'visibility',
  ].includes(property)),
  motion: STYLEX_VALUE_CASES.filter(({ property }) => [
    'transform', 'transformOrigin', 'transitionDuration', 'transitionDelay',
    'animationDuration', 'opacity',
  ].includes(property)),
  grid: STYLEX_VALUE_CASES.filter(({ property }) => [
    'gridTemplateColumns', 'containerType', 'rowGap', 'justifySelf', 'placeItems',
  ].includes(property)),
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
    silent: [...valueResults, ...constructResults, ...corpusResults]
      .filter(({ silent }) => silent).length,
  }
}
