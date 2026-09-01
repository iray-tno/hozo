import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

import { reactNativeStyleKeys, reactNativeVersion } from './native-surface.ts'

const require = createRequire(import.meta.url)

export type StylexLane = 'universal' | 'contextual' | 'adapter' | 'web-only'
export type StylexStatus = 'mapped' | 'unmapped'
export type StylexBasis =
  | 'shared-typed-ir'
  | 'contextual-runtime'
  | 'optional-adapter'
  | 'exact-web-native-refusal'
  | 'contextual-candidate'
  | 'adapter-candidate'
  | 'not-yet-lowered'

export interface StylexManifestProperty {
  name: string
  lane: StylexLane
  status: StylexStatus
  basis: StylexBasis
}

export interface StylexManifest {
  schemaVersion: 1
  sources: { stylex: string; reactNative: string }
  properties: StylexManifestProperty[]
}

const CONTEXTUAL_PROPERTIES = new Set([
  'caretColor', 'containerName', 'containerType', 'gridColumn', 'gridColumnEnd', 'gridColumnStart',
  'gridRow', 'gridRowEnd', 'gridRowStart', 'gridTemplateColumns', 'gridTemplateRows',
  'textOverflow', 'transitionDuration', 'transitionProperty', 'transitionTimingFunction',
  'whiteSpace',
])

const ADAPTER_PROPERTIES = new Set(['backdropFilter'])

function repoRoot(): string {
  return path.resolve(import.meta.dirname, '../../..')
}

function stylexDir(): string {
  return path.dirname(require.resolve('@stylexjs/stylex/package.json'))
}

function packageVersion(packagePath: string): string {
  return (JSON.parse(readFileSync(packagePath, 'utf8')) as { version: string }).version
}

export function officialStylexPropertiesFromTypes(): Set<string> {
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

/** Source inspection is confined to manifest generation and drift checking. */
export function mappedHozoStylexPropertiesFromRust(): Set<string> {
  const source = readFileSync(path.join(repoRoot(), 'crates/hozo_parser/src/stylex.rs'), 'utf8')
  const start = source.indexOf('fn token_for(')
  const end = source.indexOf('\nfn canonical_property(', start)
  if (start === -1 || end === -1) throw new Error('Hozo StyleX property mapper was not found')

  const properties = new Set<string>()
  for (const match of source.slice(start, end).matchAll(/^ {8}"([A-Za-z][A-Za-z0-9]*)"\s*=>/gm)) {
    properties.add(match[1])
  }

  // Web-only properties live outside direct_properties so their explicit
  // grammar table can be shared by future property families. They are still
  // implementation-backed mappings, not hand-maintained coverage claims.
  const webStart = source.indexOf('fn web_only_keyword_spec(')
  const webEnd = source.indexOf('\nfn web_only_property(', webStart)
  if (webStart === -1 || webEnd === -1) throw new Error('Hozo Web value grammar table was not found')
  for (const match of source.slice(webStart, webEnd).matchAll(/^ {8}"([A-Za-z][A-Za-z0-9]*)"\s*=>/gm)) {
    properties.add(match[1])
  }
  if (properties.size === 0) throw new Error('Hozo StyleX property mapper was empty')
  return properties
}

function laneFor(name: string, native: Set<string>): StylexLane {
  if (native.has(name)) return 'universal'
  if (CONTEXTUAL_PROPERTIES.has(name)) return 'contextual'
  if (ADAPTER_PROPERTIES.has(name)) return 'adapter'
  return 'web-only'
}

function basisFor(lane: StylexLane, mapped: boolean): StylexBasis {
  if (!mapped) {
    if (lane === 'contextual') return 'contextual-candidate'
    if (lane === 'adapter') return 'adapter-candidate'
    return 'not-yet-lowered'
  }
  if (lane === 'universal') return 'shared-typed-ir'
  if (lane === 'contextual') return 'contextual-runtime'
  if (lane === 'adapter') return 'optional-adapter'
  return 'exact-web-native-refusal'
}

export function generateStylexManifest(): StylexManifest {
  const official = officialStylexPropertiesFromTypes()
  const mapped = mappedHozoStylexPropertiesFromRust()
  const native = reactNativeStyleKeys()

  for (const name of mapped) {
    if (!official.has(name)) {
      throw new Error(`Hozo maps ${name}, but StyleX does not publish that property`)
    }
  }

  return {
    schemaVersion: 1,
    sources: {
      stylex: packageVersion(path.join(stylexDir(), 'package.json')),
      reactNative: reactNativeVersion(),
    },
    properties: [...official].sort().map((name) => {
      const lane = laneFor(name, native)
      const isMapped = mapped.has(name)
      return {
        name,
        lane,
        status: isMapped ? 'mapped' : 'unmapped',
        basis: basisFor(lane, isMapped),
      }
    }),
  }
}
