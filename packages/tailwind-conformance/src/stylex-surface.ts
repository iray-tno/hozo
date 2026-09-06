// StyleX property coverage is read from a deterministic checked-in manifest.
// The generator remains the place that knows how to inspect upstream types
// and Rust lowering arms; ordinary reports never infer a claim from source
// formatting. A sync test makes either upstream or implementation drift fail.

import { readFileSync } from 'node:fs'

import type {
  StylexDisposition,
  StylexLane,
  StylexManifest,
  StylexManifestProperty,
} from './stylex-manifest-generate.ts'

let cachedManifest: StylexManifest | undefined

export function stylexManifest(): StylexManifest {
  cachedManifest ??= JSON.parse(
    readFileSync(new URL('../stylex-manifest.json', import.meta.url), 'utf8'),
  ) as StylexManifest
  return cachedManifest
}

export function stylexVersion(): string {
  return stylexManifest().sources.stylex
}

export function officialStylexProperties(): Set<string> {
  return new Set(stylexManifest().properties.map(({ name }) => name))
}

export function mappedHozoStylexProperties(): Set<string> {
  return new Set(
    stylexManifest()
      .properties.filter(({ status }) => status === 'mapped')
      .map(({ name }) => name),
  )
}

function propertiesIn(lane: StylexLane, mappedOnly = false): Set<string> {
  return new Set(
    stylexManifest()
      .properties.filter(
        (property) => property.lane === lane && (!mappedOnly || property.status === 'mapped'),
      )
      .map(({ name }) => name),
  )
}

function propertiesWithDisposition(...dispositions: StylexDisposition[]): Set<string> {
  const accepted = new Set(dispositions)
  return new Set(
    stylexManifest()
      .properties.filter(({ disposition }) => accepted.has(disposition))
      .map(({ name }) => name),
  )
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
  compilerRelevant: Set<string>
  mappedCompilerRelevant: Set<string>
  productRelevant: Set<string>
  mappedProductRelevant: Set<string>
  nonActionable: Set<string>
}

export function stylexSurface(): StylexSurface {
  const official = officialStylexProperties()
  const mapped = mappedHozoStylexProperties()
  const native = propertiesIn('universal')
  const mappedNative = propertiesIn('universal', true)
  const adapter = propertiesIn('adapter')
  const nonActionable = propertiesWithDisposition(
    'upstream-rejected',
    'descriptor-only',
    'obsolete-or-nonstandard',
  )
  const productRelevant = new Set([...official].filter((name) => !nonActionable.has(name)))
  const compilerRelevant = new Set([...productRelevant].filter((name) => !adapter.has(name)))
  return {
    official,
    native,
    mapped,
    mappedNative,
    missingNative: new Set([...native].filter((name) => !mappedNative.has(name))),
    contextual: propertiesIn('contextual'),
    mappedContextual: propertiesIn('contextual', true),
    adapter,
    mappedAdapter: propertiesIn('adapter', true),
    webOnly: propertiesIn('web-only'),
    mappedWebOnly: propertiesIn('web-only', true),
    compilerRelevant,
    mappedCompilerRelevant: new Set([...compilerRelevant].filter((name) => mapped.has(name))),
    productRelevant,
    mappedProductRelevant: new Set([...productRelevant].filter((name) => mapped.has(name))),
    nonActionable,
  }
}

export function manifestEntry(name: string): StylexManifestProperty | undefined {
  return stylexManifest().properties.find((property) => property.name === name)
}
