// This measures the API/compiler boundary, not filter pixels. The external
// denominator includes upstream's stubs so adding backed exports cannot turn
// into "100% SVG filters". Native's smaller denominator is separately reviewed
// against installed upstream source; unknown implementations require review.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { compile, compileNative } from '@hozo/compiler'
import { transformHozoSource } from '@hozo/metro'
import { Svg } from '@hozo/svg'
import { createElement, type ElementType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

const require = createRequire(import.meta.url)
const svgEntry = require.resolve('@hozo/svg')
const svgRoot = path.resolve(path.dirname(svgEntry), '..')
const upstreamRoot = path.dirname(createRequire(svgEntry).resolve('react-native-svg/package.json'))

// Seven direct native primitives, one composed effect, and two structural
// elements. FeMergeNode renders null on purpose: FeMerge consumes its `in`.
const NATIVE_BACKED = new Set([
  'Filter',
  'FeBlend',
  'FeColorMatrix',
  'FeComposite',
  'FeDropShadow',
  'FeFlood',
  'FeGaussianBlur',
  'FeMerge',
  'FeMergeNode',
  'FeOffset',
])

export interface SvgFilterRow {
  name: string
  upstreamNative: 'backed' | 'stub'
  web: boolean
  native: boolean
}

// These are representative props, not a complete prop-parity inventory.
// Keep effect nodes inside a Filter and merge nodes inside a FeMerge: proving
// an element name on an invalid standalone tree would hide integration gaps.
const PROBE_PROPS: Record<string, Record<string, string | number>> = {
  Filter: { id: 'effect', x: '-20%', y: '-20%', width: '140%', height: '140%' },
  FeBlend: { in: 'SourceGraphic', in2: 'SourceAlpha', mode: 'multiply', result: 'effect' },
  FeColorMatrix: { in: 'SourceGraphic', type: 'saturate', values: '0', result: 'effect' },
  FeComposite: {
    in: 'SourceGraphic',
    in2: 'SourceAlpha',
    operator: 'arithmetic',
    k1: 0,
    k2: 1,
    k3: 0.5,
    k4: 0,
    result: 'effect',
  },
  FeDropShadow: {
    dx: 2,
    dy: 3,
    stdDeviation: '2',
    floodColor: 'black',
    floodOpacity: 0.5,
    result: 'effect',
  },
  FeFlood: { floodColor: '#2563eb', floodOpacity: 0.5, result: 'effect' },
  FeGaussianBlur: { in: 'SourceGraphic', stdDeviation: '2 3', result: 'effect' },
  FeMerge: { result: 'effect' },
  FeMergeNode: { in: 'SourceGraphic' },
  FeOffset: { in: 'SourceGraphic', dx: 2, dy: 3, result: 'effect' },
}

export function svgFilterInventory(): string[] {
  const source = readFileSync(path.join(upstreamRoot, 'src/elements.ts'), 'utf8')
  const exports = source.match(/export\s*\{([^}]+)\}/)?.[1]
  if (!exports) throw new Error('react-native-svg public element exports need review')
  const names = exports
    .split(',')
    .map((name) => name.trim())
    .filter((name) => /^(Filter|Fe[A-Z]\w*)$/.test(name))
  if (!names.includes('Filter') || new Set(names).size !== names.length) {
    throw new Error('react-native-svg filter inventory is incomplete or duplicated')
  }
  return names.sort()
}

function nativeAvailability(name: string): SvgFilterRow['upstreamNative'] {
  const filename = /^FeFunc[ABGR]$/.test(name) ? 'FeComponentTransferFunction' : name
  const source = readFileSync(
    path.join(upstreamRoot, `src/elements/filters/${filename}.tsx`),
    'utf8',
  )
  if (/warnUnimplementedFilter\(\)/.test(source)) {
    if (NATIVE_BACKED.has(name)) throw new Error(`${name} lost its upstream implementation`)
    return 'stub'
  }
  if (!NATIVE_BACKED.has(name))
    throw new Error(`${name} upstream Native implementation needs review`)
  if (name === 'FeDropShadow') {
    if (!/<FeGaussianBlur\b/.test(source) || !/<FeMerge\b/.test(source)) {
      throw new Error('FeDropShadow native composition needs review')
    }
  } else if (name === 'FeMergeNode') {
    const extract = readFileSync(
      path.join(upstreamRoot, 'src/lib/extract/extractFilter.ts'),
      'utf8',
    )
    if (!/export const extractFeMerge\b/.test(extract) || !/nodes\.push\(in1/.test(extract)) {
      throw new Error('FeMergeNode native consumption needs review')
    }
  } else if (!new RegExp(`<RNSVG${name}\\b`).test(source)) {
    throw new Error(`${name} no longer delegates to its reviewed native component`)
  }
  return 'backed'
}

export function svgFilterScorecard() {
  const names = svgFilterInventory()
  for (const name of NATIVE_BACKED) {
    if (!names.includes(name)) throw new Error(`${name} disappeared from upstream's public API`)
  }
  const nativeFacade = readFileSync(path.join(svgRoot, 'src/index.native.tsx'), 'utf8')
  const namespace = Svg as unknown as Record<string, ElementType | undefined>
  const rows: SvgFilterRow[] = names.map((name) => {
    const upstreamNative = nativeAvailability(name)
    const component = namespace[name]
    if (!component) return { name, upstreamNative, web: false, native: false }
    const props = PROBE_PROPS[name]
    if (!props) throw new Error(`${name} needs a reviewed SVG filter probe`)
    const tag = name[0].toLowerCase() + name.slice(1)
    const attrs = Object.entries(props).map(
      ([key, value]) =>
        `${key}=${typeof value === 'string' ? JSON.stringify(value) : `{${value}}`}`,
    )
    const children = name === 'FeMerge' ? '<Svg.FeMergeNode in="SourceGraphic" />' : ''
    let effect = `<Svg.${name} ${attrs.join(' ')}>${children}</Svg.${name}>`
    let fallback = createElement(
      component,
      props,
      name === 'FeMerge' ? createElement(Svg.FeMergeNode, { in: 'SourceGraphic' }) : undefined,
    )
    if (name === 'FeMergeNode') {
      effect = `<Svg.FeMerge>${effect}</Svg.FeMerge>`
      fallback = createElement(Svg.FeMerge, {}, fallback)
    }
    if (name !== 'Filter') {
      effect = `<Svg.Filter id="effect">${effect}</Svg.Filter>`
      fallback = createElement(Svg.Filter, { id: 'effect' }, fallback)
    }
    const source = `import { Svg } from '@hozo/svg'
export function Effect() { return <Svg><Svg.Defs>${effect}</Svg.Defs><Svg.Rect filter="url(#effect)" /></Svg> }`
    const webOutput = compile(source)[0]?.jsx ?? ''
    const nativeOutput = compileNative(source)[0]
    const metroOutput = transformHozoSource(source, 'Effect.tsx') ?? ''
    const markup = renderToStaticMarkup(
      createElement(
        Svg,
        {},
        createElement(Svg.Defs, {}, fallback),
        createElement(Svg.Rect, { filter: 'url(#effect)' }),
      ),
    )
    const marker =
      name === 'Filter'
        ? 'id="effect"'
        : name === 'FeMergeNode'
          ? 'in="SourceGraphic"'
          : 'result="effect"'
    const webTag = webOutput.match(new RegExp(`<${tag}\\b[^>]*>`))?.[0] ?? ''
    const nativeTag = nativeOutput?.jsx.match(new RegExp(`<${name}\\b[^>]*>`))?.[0] ?? ''
    const web =
      attrs.every((attr) => webTag.includes(attr)) &&
      new RegExp(`<${tag}\\b[^>]*${marker}`).test(markup) &&
      webOutput.includes('filter="url(#effect)"') &&
      markup.includes('filter="url(#effect)"')
    const native =
      upstreamNative === 'backed' &&
      nativeOutput?.runtimeImports.includes(name) === true &&
      attrs.every((attr) => nativeTag.includes(attr)) &&
      nativeOutput.jsx.includes('filter="url(#effect)"') &&
      new RegExp(`import \\{[^}]*\\b${name}\\b[^}]*\\} from '@hozo/svg'`).test(metroOutput) &&
      new RegExp(`export const ${name} = withClassName\\(NativeSvg\\.${name}\\)`).test(
        nativeFacade,
      ) &&
      new RegExp(`\\b${name},`).test(nativeFacade.split('Object.assign')[1] ?? '')
    return { name, upstreamNative, web, native }
  })
  return {
    version: JSON.parse(readFileSync(path.join(upstreamRoot, 'package.json'), 'utf8'))
      .version as string,
    rows,
    web: { total: rows.length, covered: rows.filter((row) => row.web).length },
    native: {
      total: rows.filter((row) => row.upstreamNative === 'backed').length,
      covered: rows.filter((row) => row.native).length,
      upstreamStubs: rows.filter((row) => row.upstreamNative === 'stub').length,
    },
  }
}
