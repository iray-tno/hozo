// Regenerates `crates/hozo_ir/src/tailwind_builtin_data.rs` from the installed
// Tailwind (#1230, RFC 007).
//
// A compile with no project CSS -- the standalone API, WASM, tests -- has no
// captured Tailwind to rank its classes against, so it keeps authored order.
// Tailwind's own order is a comparison, not a table: variant order, then the
// position of each declared property in Tailwind's property list, then the
// declaration count, then the class name compared numerically. What that
// comparison reads per class depends only on the utility's root (and, for a
// few roots such as `text`, on whether the value is a size or a colour), and
// per variant on its wrapper. So this records, from Tailwind itself:
//
// - every utility root with the rule body shape(s) it compiles to, and that
//   body's property sort (indices into Tailwind's property list) and count;
// - every named variant instance (`hover`, `md`, `aria-checked`,
//   `group-hover`, ...) with its wrapper shape and its position in Tailwind's
//   variant order.
//
// Shapes are what the existing descriptor assessment reads: selectors,
// at-rules and declaration names, never values. `@property` registration
// blocks are left out because the assessment ignores them. Arbitrary
// variants (`data-[...]`, `min-[...]`) cannot be enumerated and are absent;
// a class using one is simply not described, which keeps its input on the
// authored-order path rather than guessing.
//
//   node scripts/generate-tailwind-builtin-order.mjs [--check]
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(root, 'crates/hozo_ir/src/tailwind_builtin_data.rs')
const require = createRequire(path.join(root, 'packages/tailwind/package.json'))
const tailwindDir = path.dirname(require.resolve('tailwindcss/package.json'))
const { __unstable__loadDesignSystem } = await import(
  pathToFileURL(path.join(tailwindDir, 'dist/lib.mjs')).href
)
const version = JSON.parse(readFileSync(path.join(tailwindDir, 'package.json'), 'utf8')).version
const theme = readFileSync(path.join(tailwindDir, 'theme.css'), 'utf8')
const design = await __unstable__loadDesignSystem(
  '@import "tailwindcss/theme.css"; @tailwind utilities;',
  {
    base: tailwindDir,
    loadStylesheet: async () => ({ path: 'theme.css', base: tailwindDir, content: theme }),
  },
)

const rust = (value) => JSON.stringify(value)
function node(n, slot) {
  switch (n.kind) {
    case 'declaration':
      if (slot && n.property === 'display') return 'N::S'
      return `N::D(${rust(n.property)}, ${n.important ? 'true' : 'false'})`
    case 'rule':
      return `N::R(${rust(n.selector)}, &[${nodes(n.nodes, slot)}])`
    case 'at-rule':
      return `N::A(${rust(n.name)}, ${rust(n.params)}, &[${nodes(n.nodes, slot)}])`
    case 'at-root':
    case 'comment':
      return null
    default:
      throw new Error(`unexpected ${n.kind}`)
  }
}
const nodes = (list, slot = false) =>
  list
    .map((n) => node(n, slot))
    .filter(Boolean)
    .join(', ')

// CSS.escape, as Tailwind escapes a class name into its selector.
function cssEscape(value) {
  let out = ''
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i)
    const ch = value[i]
    if (c === 0) out += '�'
    else if ((c >= 1 && c <= 31) || c === 127 || (i === 0 && c >= 48 && c <= 57))
      out += `\\${c.toString(16)} `
    else if (i === 0 && c === 45 && value.length === 1) out += `\\${ch}`
    else if (
      c >= 128 ||
      c === 45 ||
      c === 95 ||
      (c >= 48 && c <= 57) ||
      (c >= 65 && c <= 90) ||
      (c >= 97 && c <= 122)
    )
      out += ch
    else out += `\\${ch}`
  }
  return out
}

// Utility roots.
const forms = new Map()
for (const [name] of design.getClassList()) {
  const compiled = design
    .parseCandidate(name)
    .map((candidate) => ({ candidate, rules: design.compileAstNodes(candidate) }))
    .filter(({ rules }) => rules.length)
  assert.equal(compiled.length, 1, `${name}: one compiling parse`)
  const [{ candidate, rules }] = compiled
  assert.equal(rules.length, 1, `${name}: one rule`)
  const [{ node: rule, propertySort }] = rules
  const body = `Form { nodes: &[${nodes(rule.nodes)}], order: &[${[...propertySort.order].join(', ')}], count: ${propertySort.count} }`
  const list = forms.get(candidate.root) ?? []
  if (!list.includes(body)) list.push(body)
  forms.set(candidate.root, list)
}

// Named variant instances, each wrapping a probe `flex`.
const instances = []
for (const variant of design.getVariants()) {
  if (!variant.values?.length) instances.push(variant.name)
  else
    for (const value of variant.values)
      instances.push(`${variant.name}${variant.hasDash ? '-' : ''}${value}`)
}
const wrappers = new Map()
for (const instance of [...new Set(instances)]) {
  const [candidate] = design.parseCandidate(`${instance}:flex`)
  if (candidate?.variants.length !== 1) continue
  const rules = design.compileAstNodes(candidate)
  // A variant that rewrites the class's own selector (`*:`) or splits it
  // into several rules is not a wrapper; leave it out.
  if (rules.length !== 1 || rules[0].node.selector !== `.${cssEscape(`${instance}:flex`)}`) continue
  wrappers.set(instance, {
    variant: candidate.variants[0],
    template: nodes(rules[0].node.nodes, true),
  })
}
// Positions are only meaningful relative to each other, so ask once the
// whole enumerated set is parsed.
const order = design.getVariantOrder()
const variants = [...wrappers]
  .map(([instance, { variant, template }]) => ({
    instance,
    position: order.get(variant),
    template,
  }))
  .filter(({ position }) => position !== undefined)

const byName = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const source = `// Generated by scripts/generate-tailwind-builtin-order.mjs from tailwindcss@${version}. Do not edit.
//
// What Tailwind's own class order reads, for a compile with no project CSS:
// each utility root's rule body shape, property sort and declaration count,
// and each named variant's wrapper and position. See the script for why
// this is per root and per variant rather than per class.
use super::{Form, N};

pub(crate) const TAILWIND_VERSION: &str = ${rust(version)};

/// Utility roots, sorted, each with every body shape its classes compile to.
pub(crate) static ROOTS: &[(&str, &[Form])] = &[
${[...forms]
  .sort(([a], [b]) => byName(a, b))
  .map(([name, list]) => `    (${rust(name)}, &[${list.join(', ')}]),`)
  .join('\n')}
];

/// Named variant instances, sorted, with their position in Tailwind's variant
/// order and their wrapper around the class's nodes (\`N::S\`).
pub(crate) static VARIANTS: &[(&str, u16, &[N])] = &[
${variants
  .sort((a, b) => byName(a.instance, b.instance))
  .map(
    ({ instance, position, template }) => `    (${rust(instance)}, ${position}, &[${template}]),`,
  )
  .join('\n')}
];
`
if (process.argv.includes('--check'))
  assert.equal(readFileSync(output, 'utf8'), source, 'regenerate tailwind_builtin_data.rs')
else writeFileSync(output, source)
console.log(`${forms.size} roots, ${variants.length} variants from tailwindcss@${version}`)
