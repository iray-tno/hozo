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

/** The options object `hozo(…)` is called with, as source. */
export function pluginOptions(quote, { css, preflight }) {
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
    const call = `hozo(${pluginOptions(quote, options)})`
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
  const call = `hozo(${pluginOptions(quote, options)})`
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
