// `hozo init`'s config edit (RFC 013 §4): insertions at offsets the
// compiler's parser reports, into shapes this module knows, and nothing
// else. Everything not inserted stays as the project wrote it.
//
// A shape this module does not know is not edited: it throws `InitError`
// with the lines to add, and `init` exits 2. A wrong edit to a config fails
// at build time in a file the project did not ask `init` to understand,
// which is worse than no edit.

import { configShape } from '@hozo/compiler/analysis'

export class InitError extends Error {
  constructor(message, code) {
    super(message)
    this.code = code
  }
}

/** The node tree `configShape` reports flat, with children attached. */
function tree(shape) {
  const nodes = shape.nodes.map((node) => ({ ...node, children: [] }))
  for (const node of nodes) if (node.parent >= 0) nodes[node.parent].children.push(node)
  return nodes
}

const property = (object, key) => object?.children.find((child) => child.key === key)

/** The file's own quote: the one its imports use, or a single quote. */
function quoteOf(text, shape) {
  const first = shape.imports[0]
  if (!first) return "'"
  const statement = text.slice(first.spanStart, first.spanEnd)
  return /(['"])[^'"]*\1\s*\)?;?\s*$/.exec(statement)?.[1] ?? "'"
}

/** Whether the file ends its statements with semicolons, read from its imports. */
function semicolons(text, shape) {
  const last = shape.imports.at(-1) ?? null
  if (last) return text.slice(last.spanStart, last.spanEnd).trimEnd().endsWith(';')
  return text.slice(shape.exportStart, shape.exportEnd).trimEnd().endsWith(';')
}

/** The indentation of the line `offset` is on. */
function indentAt(text, offset) {
  const start = text.lastIndexOf('\n', offset - 1) + 1
  return /^[ \t]*/.exec(text.slice(start))[0]
}

/** The indentation step the file uses, from its first indented line. */
function stepOf(text) {
  return /^([ \t]+)\S/m.exec(text)?.[1] ?? '  '
}

/**
 * The insertion that puts `value` first in the array `array`, laid out as
 * the array already is: on its own line in a multi-line array, inline in
 * one on a single line.
 */
function firstInArray(text, array, value) {
  const [first] = array.children
  if (!first) return { start: array.spanStart + 1, end: array.spanEnd - 1, replacement: value }
  const between = text.slice(array.spanStart + 1, first.spanStart)
  if (between.includes('\n'))
    return {
      start: first.spanStart,
      end: first.spanStart,
      replacement: `${value},\n${indentAt(text, first.spanStart)}`,
    }
  return { start: first.spanStart, end: first.spanStart, replacement: `${value}, ` }
}

/** The insertion that adds `key: value` to the object `object`, first. */
function firstInObject(text, object, key, value) {
  const [first] = object.children
  if (!first) {
    const base = indentAt(text, object.spanStart)
    return {
      start: object.spanStart + 1,
      end: object.spanEnd - 1,
      replacement: `\n${base}${stepOf(text)}${key}: ${value},\n${base}`,
    }
  }
  const keyStart = first.propertyStart
  const between = text.slice(object.spanStart + 1, keyStart)
  if (between.includes('\n'))
    return {
      start: keyStart,
      end: keyStart,
      replacement: `${key}: ${value},\n${indentAt(text, keyStart)}`,
    }
  return { start: keyStart, end: keyStart, replacement: `${key}: ${value}, ` }
}

/** The insertion of `statement` after the file's last import, or at its top. */
function importInsertion(shape, statement) {
  const last = shape.imports.at(-1)
  if (last) return { start: last.spanEnd, end: last.spanEnd, replacement: `\n${statement}` }
  return { start: 0, end: 0, replacement: `${statement}\n` }
}

function apply(text, edits) {
  let updated = text
  for (const edit of [...edits].sort((a, b) => b.start - a.start))
    updated = updated.slice(0, edit.start) + edit.replacement + updated.slice(edit.end)
  return updated
}

/** The object a config exports: `defineConfig({…})`, `{…}`, or a bound one. */
function exportedObject(nodes, shape) {
  if (shape.exportNode === undefined) return undefined
  let node = nodes[shape.exportNode]
  if (node.kind === 'identifier') {
    const binding = shape.bindings.find((item) => item.name === node.name)
    node = binding && nodes[binding.node]
  }
  if (node?.kind === 'call' && node.name === 'defineConfig' && node.children.length === 1)
    node = node.children[0]
  return node?.kind === 'object' ? node : undefined
}

/** The options object Hozo's adapter is called with, as source. */
export function optionsSource(quote, { css, preflight }) {
  const entries = [`css: ${quote}${css}${quote}`]
  if (preflight === false) entries.push('preflight: false')
  return `{ ${entries.join(', ')} }`
}

/**
 * The edit that adds `@hozo/vite` to a Vite, TanStack Start or Astro config:
 * `{ updated }`, or `{ same: true }` when it already calls `hozo()`.
 * `stack` is `vite` or `astro`; `options` are `hozo()`'s.
 */
export function viteConfigEdit(text, file, stack, options) {
  const shape = configShape(text, file)
  const manual = (why) => {
    const quote = shape.diagnostics.length ? "'" : quoteOf(text, shape)
    const call = `hozo(${optionsSource(quote, options)})`
    const where =
      stack === 'astro'
        ? `add ${call} first in vite.plugins`
        : `add ${call} first in plugins, before any other plugin`
    return new InitError(
      `${file}: ${why}, so init does not edit it; import { hozo } from '@hozo/vite' and ${where} (https://iray-tno.github.io/hozo/docs/getting-started/${stack === 'astro' ? 'astro' : 'vite'}/)`,
      'config-not-editable',
    )
  }
  if (shape.diagnostics.length) throw manual('it does not parse')
  const nodes = tree(shape)
  const imported = shape.imports.find((item) => item.source === '@hozo/vite')
  if (imported && nodes.some((node) => node.kind === 'call' && imported.locals.includes(node.name)))
    return { same: true }
  if (imported) throw manual('it imports @hozo/vite without calling it')
  const object = exportedObject(nodes, shape)
  if (!object) throw manual('its export is not defineConfig({ … }) or an object')
  const quote = quoteOf(text, shape)
  const call = `hozo(${optionsSource(quote, options)})`
  const edits = [
    importInsertion(
      shape,
      `import { hozo } from ${quote}@hozo/vite${quote}${semicolons(text, shape) ? ';' : ''}`,
    ),
  ]
  let host = object
  if (stack === 'astro') {
    const vite = property(object, 'vite')
    if (!vite) edits.push(firstInObject(text, object, 'vite', `{ plugins: [${call}] }`))
    else if (vite.kind !== 'object') throw manual('its vite option is not an object')
    host = vite
  }
  if (!(stack === 'astro' && !property(object, 'vite'))) {
    const plugins = property(host, 'plugins')
    if (!plugins) edits.push(firstInObject(text, host, 'plugins', `[${call}]`))
    else if (plugins.kind !== 'array') throw manual('its plugins option is not an array')
    else edits.push(firstInArray(text, plugins, call))
  }
  return { updated: apply(text, edits) }
}

/** The adapter each wrapped stack takes, and the guide that shows it by hand. */
const WRAPPERS = {
  next: { module: '@hozo/next', guide: 'next' },
  metro: { module: '@hozo/metro/config', guide: 'metro' },
}

/**
 * The edit that wraps what a Next.js or Metro config exports in
 * `withHozo(…, options)`: `{ updated }`, or `{ same: true }` when it already
 * calls `withHozo`. The exported expression is left as written inside the
 * call, so `mergeConfig(getDefaultConfig(__dirname), config)` and a
 * `nextConfig` binding are both kept.
 */
export function wrapConfigEdit(text, file, stack, options) {
  const { module, guide } = WRAPPERS[stack]
  const shape = configShape(text, file)
  const quote = shape.diagnostics.length ? "'" : quoteOf(text, shape)
  const manual = (why) =>
    new InitError(
      `${file}: ${why}, so init does not edit it; import { withHozo } from '${module}' and export withHozo(<your config>, ${optionsSource(quote, options)}) (https://iray-tno.github.io/hozo/docs/getting-started/${guide}/)`,
      'config-not-editable',
    )
  if (shape.diagnostics.length) throw manual('it does not parse')
  const nodes = tree(shape)
  const imported = shape.imports.find((item) => item.source === module)
  if (
    imported &&
    nodes.some((node) => node.kind === 'call' && imported.locals.includes('withHozo'))
  )
    return { same: true }
  if (imported) throw manual(`it imports ${module} without calling withHozo`)
  if (shape.exportNode === undefined) throw manual('it has no export default or module.exports')
  const exported = nodes[shape.exportNode]
  if (!['object', 'call', 'identifier'].includes(exported.kind))
    throw manual('its export is not a config object, a call or a name')
  const cjs = shape.exportKind === 'cjs'
  const semi = semicolons(text, shape) ? ';' : ''
  const statement = cjs
    ? `const { withHozo } = require(${quote}${module}${quote})${semi}`
    : `import { withHozo } from ${quote}${module}${quote}${semi}`
  return {
    updated: apply(text, [
      importInsertion(shape, statement),
      { start: exported.spanStart, end: exported.spanStart, replacement: 'withHozo(' },
      {
        start: exported.spanEnd,
        end: exported.spanEnd,
        replacement: `, ${optionsSource(quote, options)})`,
      },
    ]),
  }
}

/** A new `metro.config.js` for an Expo project, which ships none (RFC 013 §2). */
export function expoMetroConfig(options) {
  return `const { getDefaultConfig } = require('expo/metro-config')
const { withHozo } = require('@hozo/metro/config')

module.exports = withHozo(getDefaultConfig(__dirname), ${optionsSource("'", options)})
`
}

/** The insertion that puts `value` last in the array `array`, as it is laid out. */
function lastInArray(text, array, value) {
  const last = array.children.at(-1)
  if (!last) return { start: array.spanStart + 1, end: array.spanEnd - 1, replacement: value }
  const after = text.slice(last.spanEnd, array.spanEnd - 1)
  const comma = /^\s*,/.exec(after)
  if (after.includes('\n')) {
    const indent = indentAt(text, last.spanStart)
    // A trailing comma stays one: the new element goes after it, with its own.
    if (comma) {
      const at = last.spanEnd + comma[0].length
      return { start: at, end: at, replacement: `\n${indent}${value},` }
    }
    return { start: last.spanEnd, end: last.spanEnd, replacement: `,\n${indent}${value}` }
  }
  return { start: last.spanEnd, end: last.spanEnd, replacement: `, ${value}` }
}

/** The framework a Storybook config names, from `framework: 'x'` or `{ name: 'x' }`. */
function frameworkOf(object) {
  const framework = property(object, 'framework')
  if (framework?.kind === 'string') return framework.name
  if (framework?.kind === 'object') return property(framework, 'name')?.name
  return undefined
}

/**
 * The edit that adds `@hozo/storybook` to `.storybook/main.*`, last in
 * `addons`, with Hozo's options: `{ updated }`, or `{ same: true }` when
 * it is already there. Only a Vite-based framework runs the addon.
 */
export function storybookConfigEdit(text, file, options) {
  const shape = configShape(text, file)
  const quote = shape.diagnostics.length ? "'" : quoteOf(text, shape)
  const addon = `{ name: ${quote}@hozo/storybook${quote}, options: ${optionsSource(quote, options)} }`
  const manual = (why) =>
    new InitError(
      `${file}: ${why}, so init does not edit it; add ${addon} to addons (https://iray-tno.github.io/hozo/docs/getting-started/storybook/)`,
      'config-not-editable',
    )
  if (shape.diagnostics.length) throw manual('it does not parse')
  const nodes = tree(shape)
  const object = exportedObject(nodes, shape)
  if (!object) throw manual('its export is not an object or a name bound to one')
  const framework = frameworkOf(object)
  if (framework && !/vite/.test(framework))
    throw new InitError(
      `${file}: Storybook's framework is ${framework}, which does not build with Vite, so @hozo/storybook would not run; switch to a Vite framework (@storybook/react-vite, @storybook/nextjs-vite) first`,
      'storybook-not-vite',
    )
  const addons = property(object, 'addons')
  const listed = (node) =>
    (node.kind === 'string' && node.name === '@hozo/storybook') ||
    (node.kind === 'object' && property(node, 'name')?.name === '@hozo/storybook')
  if (addons?.kind === 'array' && addons.children.some(listed)) return { same: true }
  if (addons && addons.kind !== 'array') throw manual('its addons option is not an array')
  return {
    updated: apply(text, [
      addons
        ? lastInArray(text, addons, addon)
        : firstInObject(text, object, 'addons', `[${addon}]`),
    ]),
  }
}
