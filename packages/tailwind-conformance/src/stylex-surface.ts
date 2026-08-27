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
}

export function stylexSurface(): StylexSurface {
  const official = officialStylexProperties()
  const reactNative = reactNativeStyleKeys()
  const native = new Set([...official].filter((name) => reactNative.has(name)))
  const mapped = mappedHozoStylexProperties()
  const mappedNative = new Set([...mapped].filter((name) => native.has(name)))
  const missingNative = new Set([...native].filter((name) => !mapped.has(name)))
  return { official, native, mapped, mappedNative, missingNative }
}
