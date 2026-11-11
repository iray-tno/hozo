// Which of Tailwind's own classes and variants Hozo ranks in Tailwind's
// order (RFC 007, #1230), grouped by the six domains of the progress scale
// posted on #1230, so stage 5 ("every Native-supported value ranks; only
// Native-refused or arbitrary/passthrough writes remain") is counted, not
// judged.
//
// Every default class (no arbitrary values) is compiled beside `p-1`,
// ordered by Tailwind's own theme as a captured project would be. The planner reports whether the class's block is ranked or which
// barrier keeps it in authored order. A class is then one of:
//
// - `ranked`;
// - `native-refused`: a barrier, but React Native refuses one of its writes
//   anyway, so ranking it would change only Web;
// - `gap`: a barrier on a value Native can express -- what stage 5 counts;
// - `unparsed`: Hozo has no write for it at all, an ordering non-question.
//
// Variants are probed as `<variant>:p-2` on a `Pressable`; one is a `gap`
// when it is a barrier and Native lowers it without an error.
//
// Read-only. `--json` prints every row instead of the summary.
//
//   node scripts/tailwind-order-inventory.mjs [--json]
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createCompiler, tailwindClassesNativeRefusal } = await import(
  '../packages/compiler/src/index.ts'
)
const { prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)
const require = createRequire(path.join(root, 'packages/tailwind/package.json'))
const tailwindDir = path.dirname(require.resolve('tailwindcss/package.json'))
const { __unstable__loadDesignSystem } = await import(
  pathToFileURL(path.join(tailwindDir, 'dist/lib.mjs')).href
)
const theme = readFileSync(path.join(tailwindDir, 'theme.css'), 'utf8')
const design = await __unstable__loadDesignSystem(
  '@import "tailwindcss/theme.css"; @tailwind utilities;',
  {
    base: tailwindDir,
    loadStylesheet: async () => ({ path: 'theme.css', base: tailwindDir, content: theme }),
  },
)

// The domain a class belongs to, from the properties Tailwind's own rule
// declares, not from its name: `border-2` and `border-dashed` share a root
// and not a domain.
const REGISTER =
  /^(translate|scale|rotate|transform|perspective|filter|backdrop-filter|box-shadow|background-image|text-shadow|mask(-.*)?|--tw-(translate|scale|rotate|skew|shadow|inset-shadow|ring|inset-ring|gradient|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|drop-shadow|backdrop|border-style|outline-style|mask|text-shadow).*)$/
const TYPOGRAPHY = /^(font-size|line-height|letter-spacing|--tw-leading|--tw-tracking)$/
const SHORTHAND =
  /^(padding.*|margin.*|gap|column-gap|row-gap|inset.*|top|right|bottom|left|border(-(top|right|bottom|left|inline|block|inline-start|inline-end|block-start|block-end|start|end))?-(width|color)|border-.*radius|scroll-(margin|padding).*)$/
function domain(css) {
  const body = css.replace(/@property[^{]*\{[^}]*\}/g, '')
  const properties = [...body.matchAll(/([-\w]+)\s*:[^;{}]*;/g)].map((match) => match[1])
  if (properties.some((property) => REGISTER.test(property))) return 3
  if (properties.some((property) => TYPOGRAPHY.test(property))) return 1
  if (body.includes(':not(:last-child)') || properties.some((p) => SHORTHAND.test(p))) return 2
  return 4
}

const compiler = createCompiler()
// These real resets compile but are not in Tailwind's completion list.
const classes = [
  ...new Set([
    ...design.getClassList().map(([name]) => name),
    'filter-none',
    'backdrop-filter-none',
  ]),
]
const instances = []
for (const variant of design.getVariants()) {
  if (!variant.values?.length) instances.push(variant.name)
  else
    for (const value of variant.values)
      instances.push(`${variant.name}${variant.hasDash ? '-' : ''}${value}`)
}
const variants = [...new Set(instances)].map((instance) => `${instance}:p-2`)
const prepared = await prepareTailwindOrder(
  '@import "tailwindcss/theme.css" layer(theme); @tailwind utilities;',
  tailwindPackageDir(),
  [...classes, ...variants, 'p-1'],
)
compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))
// Many probes per compile; each class's own block is found by name.
function barriers(probes, element) {
  const found = new Map()
  for (let start = 0; start < probes.length; start += 400) {
    const chunk = probes.slice(start, start + 400)
    const source = `import {${element}} from '@hozo/core';export const A=()=> <>${chunk
      .map((name) => `<${element} className="p-1 ${name}"/>`)
      .join('')}</>`
    for (const component of compiler.compile(source, undefined, { tailwindPlan: true }))
      for (const site of component.tailwindPlan?.sites ?? [])
        for (const block of site.blocks)
          if (block.source === 'tailwind' && block.candidate !== 'p-1')
            found.set(block.candidate, block.barrier ?? null)
  }
  return found
}

const css = design.candidatesToCss(classes)
const blocked = barriers(classes, 'View')
const refusals = tailwindClassesNativeRefusal(classes)
const rows = classes.map((name, index) => {
  const barrier = blocked.get(name)
  const refusal = refusals[index]
  return {
    name,
    domain: domain(css[index] ?? ''),
    barrier: barrier ?? null,
    refusal,
    status:
      barrier === undefined
        ? 'unparsed'
        : barrier === null
          ? 'ranked'
          : refusal
            ? 'native-refused'
            : 'gap',
  }
})

const variantBarriers = barriers(variants, 'Pressable')
for (const name of variants) {
  const barrier = variantBarriers.get(name)
  let refusal = null
  if (barrier) {
    const native = compiler.compileNative(
      `import {Pressable} from '@hozo/core';export const A=()=> <Pressable accessibilityLabel="x" className="${name}"/>`,
    )
    const diagnostics = (Array.isArray(native) ? native : [native]).flatMap(
      (output) => output.diagnostics ?? output.components?.flatMap((c) => c.diagnostics) ?? [],
    )
    refusal = diagnostics.find((entry) => entry.severity === 'error')?.message ?? null
  }
  rows.push({
    name,
    domain: 5,
    barrier: barrier ?? null,
    refusal,
    status:
      barrier === undefined
        ? 'unparsed'
        : barrier === null
          ? 'ranked'
          : refusal
            ? 'native-refused'
            : 'gap',
  })
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(rows, null, 2))
} else {
  const names = [
    '',
    'Compound typography',
    'Shorthands / logical / gap',
    'Registers / transforms',
    'Remaining supported properties',
    'Supported conditions',
  ]
  // A gap is reported by its root, the class name before its value, with
  // the barrier the planner gave.
  const rootOf = (name) =>
    name.endsWith(':p-2') ? name.slice(0, -4) : name.replace(/-[^-]*$/, '') || name
  for (const index of [1, 2, 3, 4, 5]) {
    const own = rows.filter((row) => row.domain === index)
    const count = (status) => own.filter((row) => row.status === status).length
    console.log(
      `${index}. ${names[index]}: ${count('ranked')} ranked, ${count('gap')} gap, ${count('native-refused')} native-refused, ${count('unparsed')} unparsed`,
    )
    const groups = new Map()
    for (const row of own.filter((row) => row.status === 'gap')) {
      const key = `${rootOf(row.name)} (${row.barrier})`
      groups.set(key, (groups.get(key) ?? 0) + 1)
    }
    const top = [...groups].sort((a, b) => b[1] - a[1]).slice(0, 12)
    if (top.length) console.log(`   gap: ${top.map(([key, n]) => `${key} ${n}`).join(', ')}`)
  }
}
