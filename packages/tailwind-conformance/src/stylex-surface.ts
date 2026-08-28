// A denominator for Hozo's experimental StyleX frontend.
//
// StyleX publishes the property names accepted by `stylex.create` in its
// own declarations. Reading that list keeps the denominator outside Hozo:
// a property we forget cannot quietly disappear from the report. React
// Native's declarations provide a second, more useful denominator for this
// universal compiler -- the properties both systems can express by name.
//
// The numerator is deliberately labelled "mapped", not "supported". A
// property can accept a much wider value language than Hozo's static slice,
// and syntax such as themes and nested conditions is measured separately.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { reactNativeStyleKeys } from './native-surface.ts'

const require = createRequire(import.meta.url)

function repoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')
}

function stylexDir(): string {
  return path.dirname(require.resolve('@stylexjs/stylex/package.json'))
}

export function stylexVersion(): string {
  const pkg = JSON.parse(readFileSync(path.join(stylexDir(), 'package.json'), 'utf8'))
  return pkg.version as string
}

/** Every property accepted by StyleX's published `CSSProperties` type. */
export function officialStylexProperties(): Set<string> {
  const source = readFileSync(
    path.join(stylexDir(), 'lib/es/types/StyleXCSSTypes.d.ts'),
    'utf8',
  )
  const start = source.indexOf('export type CSSProperties = Readonly<{')
  if (start === -1) throw new Error('StyleX CSSProperties declaration was not found')
  const end = source.indexOf('\n}>;', start)
  if (end === -1) throw new Error('StyleX CSSProperties declaration was not closed')

  const properties = new Set<string>()
  for (const match of source.slice(start, end).matchAll(/^  ([A-Za-z][A-Za-z0-9]*)\?:/gm)) {
    properties.add(match[1])
  }
  if (properties.size === 0) throw new Error('StyleX CSSProperties declaration was empty')
  return properties
}

/** Property names with an explicit lowering arm in the Rust frontend. */
export function mappedHozoStylexProperties(): Set<string> {
  const source = readFileSync(path.join(repoRoot(), 'crates/hozo_parser/src/stylex.rs'), 'utf8')
  const start = source.indexOf('fn token_for(')
  const end = source.indexOf('\nfn priority_family(', start)
  if (start === -1 || end === -1) throw new Error('Hozo StyleX property mapper was not found')

  const properties = new Set<string>()
  for (const match of source.slice(start, end).matchAll(/^\s+"([A-Za-z][A-Za-z0-9]*)"\s*=>/gm)) {
    properties.add(match[1])
  }
  if (properties.size === 0) throw new Error('Hozo StyleX property mapper was empty')
  return properties
}

export interface StylexSurface {
  official: Set<string>
  native: Set<string>
  mapped: Set<string>
  mappedNative: Set<string>
  missingNative: Set<string>
  contextual: Set<string>
  mappedContextual: Set<string>
  adapter: Set<string>
  mappedAdapter: Set<string>
  webOnly: Set<string>
  mappedWebOnly: Set<string>
}

// Property names beyond React Native's direct StyleSheet surface that have
// an existing Hozo semantic/runtime destination. They are candidates, not
// claims of StyleX support: a name enters `mappedContextual` only when the
// StyleX frontend actually reaches that typed IR variant.
const CONTEXTUAL_PROPERTIES = new Set([
  'containerName',
  'containerType',
  'gridColumn',
  'gridColumnEnd',
  'gridColumnStart',
  'gridRow',
  'gridRowEnd',
  'gridRowStart',
  'gridTemplateColumns',
  'gridTemplateRows',
  'transitionDuration',
  'transitionProperty',
  'transitionTimingFunction',
])

// Optional integration candidates are separate from contextual support so
// installing Expo/Reanimated/Skia can never inflate the core Native claim.
const ADAPTER_PROPERTIES = new Set(['backdropFilter'])

export function stylexSurface(): StylexSurface {
  const official = officialStylexProperties()
  const reactNative = reactNativeStyleKeys()
  const native = new Set([...official].filter((name) => reactNative.has(name)))
  const mapped = mappedHozoStylexProperties()
  const mappedNative = new Set([...mapped].filter((name) => native.has(name)))
  const missingNative = new Set([...native].filter((name) => !mapped.has(name)))
  const contextual = new Set(
    [...CONTEXTUAL_PROPERTIES].filter((name) => official.has(name) && !native.has(name)),
  )
  const mappedContextual = new Set([...mapped].filter((name) => contextual.has(name)))
  const adapter = new Set(
    [...ADAPTER_PROPERTIES].filter(
      (name) => official.has(name) && !native.has(name) && !contextual.has(name),
    ),
  )
  const mappedAdapter = new Set([...mapped].filter((name) => adapter.has(name)))
  const webOnly = new Set(
    [...official].filter(
      (name) => !native.has(name) && !contextual.has(name) && !adapter.has(name),
    ),
  )
  const mappedWebOnly = new Set([...mapped].filter((name) => webOnly.has(name)))
  return {
    official,
    native,
    mapped,
    mappedNative,
    missingNative,
    contextual,
    mappedContextual,
    adapter,
    mappedAdapter,
    webOnly,
    mappedWebOnly,
  }
}
