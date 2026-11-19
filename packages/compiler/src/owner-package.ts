// The package channels of a manifest: v2's top-level fields, the v1
// envelope's experimental `package` field, or the internal shadow form.
// Reading a channel is not trusted primitive lowering; nothing in the
// compiler lowers from `exports[].primitive` yet (#2044).
import type { HozoManifest, TextForwardingEntry } from './manifest.ts'
import { type OwnerContractShadow, parseOwnerContractShadow } from './owner-contract.ts'

export const OWNER_PACKAGE_SCHEMA = 'rfc010-package-shadow-0'
/** RFC 010 §4.1's manifest version that carries the package channels. */
export const PACKAGE_MANIFEST_VERSION = 2
export interface PackageExport {
  name: string
  owners: string[]
  /** The compiler primitive a trusted import of this export lowers to. */
  primitive?: string
}
/** An export that renders its string children inside a `View`, and whether
 * its pressable shares its state with a Text inside it (`PATTERN_HOSTS`). */
export interface TextPublication {
  name: string
  sharesState: boolean
}
export interface OwnerPackageShadow {
  schema: typeof OWNER_PACKAGE_SCHEMA
  owners: OwnerContractShadow | null
  exports: PackageExport[]
  textPublish: TextPublication[]
  candidates: string[]
  helpers: string[]
  compiledByConsumer: boolean
  /** Kept readable by the existing v1 converter, not a text-erasure proof. */
  textForwarding: HozoManifest
}
/** Manifest v2: the package channels at the top level, beside the text
 * forwarding that v1 readers know, stored once.
 */
export interface HozoPackageManifest extends HozoManifest {
  version: typeof PACKAGE_MANIFEST_VERSION
  exports: PackageExport[]
  owners: OwnerContractShadow | null
  textPublish: TextPublication[]
  candidates: string[]
  helpers: string[]
  compiledByConsumer: boolean
}
const V2_FIELDS = [
  'version',
  'exports',
  'owners',
  'textPublish',
  'textForwarding',
  'candidates',
  'helpers',
  'compiledByConsumer',
]
function fail(at: string): never {
  throw new Error(`Invalid owner package: ${at}`)
}
function object(
  value: unknown,
  required: string[],
  optional: string[] = [],
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('object')
  const row = value as Record<string, unknown>
  if (
    !required.every((key) => Object.hasOwn(row, key)) ||
    Object.keys(row).some((key) => ![...required, ...optional].includes(key))
  )
    fail('fields')
  return row
}
function list(value: unknown, max: number): unknown[] {
  if (!Array.isArray(value) || value.length > max) fail('list budget')
  return value
}
function string(value: unknown, max = 512): string {
  if (typeof value !== 'string' || value.length > max || value.includes('\0')) fail('string')
  return value
}
function name(value: unknown): string {
  const text = string(value, 80)
  if (
    !/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(text) ||
    ['__proto__', 'constructor', 'prototype'].includes(text)
  )
    fail('identifier')
  return text
}
function unique(values: string[]) {
  if (new Set(values).size !== values.length) fail('duplicate')
  return values
}
function forwarding(input: unknown, exported: Set<string>): HozoManifest {
  const root = object(input, ['version', 'textForwarding'])
  if (root.version !== 1 && root.version !== PACKAGE_MANIFEST_VERSION) fail('legacy version')
  const entries = root.textForwarding
  if (
    !entries ||
    typeof entries !== 'object' ||
    Array.isArray(entries) ||
    Object.keys(entries).length > 128
  )
    fail('text entries')
  const pairs = Object.entries(entries).map(([key, value]): [string, TextForwardingEntry] => {
    if (!exported.has(name(key))) fail('text export')
    const entry = object(value, ['props', 'variants'], ['disabledProp', 'hostStates'])
    const props = list(entry.props, 8).map((value) => {
      const prop = object(value, ['name', 'values'], ['default'])
      const values = unique(list(prop.values, 32).map((value) => string(value, 80)))
      if (!values.length) fail('prop values')
      const fallback = Object.hasOwn(prop, 'default') ? string(prop.default, 80) : undefined
      if (fallback !== undefined && !values.includes(fallback)) fail('prop default')
      return {
        name: name(prop.name),
        values,
        ...(fallback === undefined ? {} : { default: fallback }),
      }
    })
    unique(props.map((prop) => prop.name))
    const variants = list(entry.variants, 128).map((value) => {
      const variant = object(value, ['when', 'classes'])
      const when = list(variant.when, 8).map((value) => string(value, 80))
      if (
        when.length !== props.length ||
        when.some((value, i) => !props[i]!.values.includes(value))
      )
        fail('variant condition')
      return { when, classes: string(variant.classes, 4096) }
    })
    unique(variants.map((variant) => JSON.stringify(variant.when)))
    if (Object.hasOwn(entry, 'hostStates') && entry.hostStates !== true) fail('host states')
    return [
      key,
      {
        props,
        variants,
        ...(Object.hasOwn(entry, 'disabledProp') ? { disabledProp: name(entry.disabledProp) } : {}),
        ...(entry.hostStates === true ? { hostStates: true as const } : {}),
      },
    ]
  })
  return { version: root.version as number, textForwarding: Object.fromEntries(pairs) }
}

/** @internal Bounded data only. Missing channels are errors, not empty facts.
 * Export ownership never authorizes rewriting a custom component as a builtin.
 */
export function parseOwnerPackageShadow(text: string): OwnerPackageShadow {
  if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > 65_536) fail('size')
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    fail('JSON')
  }
  // Every transport form uses the same channel validator. In particular the
  // envelope cannot hide a second, contradictory copy of the text summary.
  if (
    parsed &&
    typeof parsed === 'object' &&
    (parsed as { version?: unknown }).version === PACKAGE_MANIFEST_VERSION
  ) {
    const { version, textForwarding, ...channels } = object(parsed, V2_FIELDS)
    parsed = {
      schema: OWNER_PACKAGE_SCHEMA,
      ...channels,
      textForwarding: { version, textForwarding },
    }
  } else if (parsed && typeof parsed === 'object' && Object.hasOwn(parsed, 'package')) {
    const envelope = object(parsed, ['version', 'textForwarding', 'package'])
    const channels = object(envelope.package, [
      'schema',
      'owners',
      'exports',
      'candidates',
      'helpers',
      'compiledByConsumer',
    ])
    parsed = {
      ...channels,
      textForwarding: { version: envelope.version, textForwarding: envelope.textForwarding },
    }
  }
  const root = object(
    parsed,
    [
      'schema',
      'owners',
      'exports',
      'candidates',
      'helpers',
      'compiledByConsumer',
      'textForwarding',
    ],
    ['textPublish'],
  )
  if (root.schema !== OWNER_PACKAGE_SCHEMA) fail('schema')
  const owners = root.owners === null ? null : parseOwnerContractShadow(JSON.stringify(root.owners))
  const declared = new Set(owners?.contracts.map((contract) => contract.owner) ?? [])
  const exports = list(root.exports, 128).map((value): PackageExport => {
    const row = object(value, ['name', 'owners'], ['primitive'])
    const refs = unique(list(row.owners, 32).map((value) => string(value, 161)))
    if (!refs.every((ref) => declared.has(ref))) fail('owner reference')
    return {
      name: name(row.name),
      owners: refs,
      ...(Object.hasOwn(row, 'primitive') ? { primitive: name(row.primitive) } : {}),
    }
  })
  const exported = new Set(unique(exports.map((entry) => entry.name)))
  const textPublish = list(root.textPublish ?? [], 128).map((value) => {
    const row = object(value, ['name', 'sharesState'])
    if (!exported.has(name(row.name))) fail('text publication export')
    if (typeof row.sharesState !== 'boolean') fail('text publication state')
    return { name: row.name as string, sharesState: row.sharesState }
  })
  unique(textPublish.map((row) => row.name))
  const referenced = new Set(exports.flatMap((entry) => entry.owners))
  if ([...declared].some((owner) => !referenced.has(owner))) fail('unpublished owner')
  const candidates = unique(
    list(root.candidates, 512).map((value) => {
      const token = string(value)
      if (!token || /\s/.test(token)) fail('candidate token')
      return token
    }),
  )
  const helpers = unique(list(root.helpers, 64).map(name))
  if (!helpers.every((helper) => exported.has(helper))) fail('helper export')
  if (typeof root.compiledByConsumer !== 'boolean') fail('source policy')
  return {
    schema: OWNER_PACKAGE_SCHEMA,
    owners,
    exports,
    textPublish,
    candidates,
    helpers,
    compiledByConsumer: root.compiledByConsumer,
    textForwarding: forwarding(root.textForwarding, exported),
  }
}
