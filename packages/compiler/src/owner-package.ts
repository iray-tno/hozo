// Package-channel shadow, not MANIFEST_VERSION=2 or trusted primitive lowering.
import type { HozoManifest, TextForwardingEntry } from './manifest.ts'
import { type OwnerContractShadow, parseOwnerContractShadow } from './owner-contract.ts'

export const OWNER_PACKAGE_SCHEMA = 'rfc010-package-shadow-0'
export interface OwnerPackageShadow {
  schema: typeof OWNER_PACKAGE_SCHEMA
  owners: OwnerContractShadow | null
  exports: { name: string; owners: string[] }[]
  candidates: string[]
  helpers: string[]
  compiledByConsumer: boolean
  /** Kept readable by the existing v1 converter, not a text-erasure proof. */
  textForwarding: HozoManifest
}
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
  if (root.version !== 1) fail('legacy version')
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
  return { version: 1, textForwarding: Object.fromEntries(pairs) }
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
  const root = object(parsed, [
    'schema',
    'owners',
    'exports',
    'candidates',
    'helpers',
    'compiledByConsumer',
    'textForwarding',
  ])
  if (root.schema !== OWNER_PACKAGE_SCHEMA) fail('schema')
  const owners = root.owners === null ? null : parseOwnerContractShadow(JSON.stringify(root.owners))
  const declared = new Set(owners?.contracts.map((contract) => contract.owner) ?? [])
  const exports = list(root.exports, 128).map((value) => {
    const row = object(value, ['name', 'owners'])
    const refs = unique(list(row.owners, 32).map((value) => string(value, 161)))
    if (!refs.every((ref) => declared.has(ref))) fail('owner reference')
    return { name: name(row.name), owners: refs }
  })
  const exported = new Set(unique(exports.map((entry) => entry.name)))
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
    candidates,
    helpers,
    compiledByConsumer: root.compiledByConsumer,
    textForwarding: forwarding(root.textForwarding, exported),
  }
}
