// How much of this repository's own Tailwind is ranked by the shared plan
// (RFC 007, #1230), and why the rest keeps its authored order.
//
// An input -- one `className` or slot class list -- is ranked only when every
// write in it can be: one barrier keeps the whole input on the old path. This
// counts inputs with at least two Tailwind writes (a single write has nothing
// to order) and attributes each one on the old path to the first barrier the
// planner reports. Read-only: it compiles, it does not write files.
//
//   node scripts/tailwind-order-coverage.mjs [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createCompiler } = await import('../packages/compiler/src/index.ts')
const { prepareTailwindOrder, tailwindPackageDir } = await import(
  '../packages/tailwind/src/theme.ts'
)

const corpus = ['packages/ui/src', 'packages/patterns/src', 'examples']
const skip =
  /(^|[\\/])(node_modules|dist|build|\.expo|android|ios|generated)([\\/]|$)|\.test\.|\.stories\./
function walk(dir, out) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    if (skip.test(path.relative(root, file))) continue
    if (statSync(file).isDirectory()) walk(file, out)
    else if (/\.tsx$/.test(name)) out.push(file)
  }
  return out
}
const files = corpus.flatMap((dir) => walk(path.join(root, dir), []))

// The parser's own utility table per module: every name a static or
// runtime class list hands it, which is what the plan binds.
const compiler = createCompiler()
const sources = new Map()
const names = new Set()
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  sources.set(file, source)
  for (const { candidate } of compiler.inspectTailwindOrder(source, undefined, file).candidates)
    names.add(candidate)
}
// Tailwind's own theme plus @hozo/ui's tokens, which most of the corpus is
// written against, plus the colour names the examples' own `@theme` blocks
// add (`bg-brand`). Only the names matter here: a descriptor never reads a
// value, so the first spelling of each name is enough.
const exampleColors = new Map()
for (const example of readdirSync(path.join(root, 'examples'))) {
  for (const entry of ['global.css', 'src/theme.css']) {
    const file = path.join(root, 'examples', example, entry)
    let text
    try {
      text = readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const [declaration, name] of text.matchAll(/(--color-[\w-]+)\s*:[^;]+;/g))
      if (!exampleColors.has(name)) exampleColors.set(name, declaration)
  }
}
const css = `@import "tailwindcss/theme.css" layer(theme); ${readFileSync(path.join(root, 'packages/ui/src/theme.css'), 'utf8')} @theme { ${[...exampleColors.values()].join(' ')} } @tailwind utilities;`
const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [...names])
compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))

let inputs = 0
let ranked = 0
let failedFiles = 0
const reasons = new Map()
const examples = new Map()
for (const source of sources.values()) {
  let compiled
  try {
    compiled = compiler.compile(source, undefined, { tailwindPlan: true })
  } catch {
    failedFiles++
    continue
  }
  for (const component of compiled) {
    for (const site of component.tailwindPlan?.sites ?? []) {
      const byInput = new Map()
      for (const block of site.blocks) {
        if (block.source !== 'tailwind') continue
        const list = byInput.get(block.inputStart) ?? []
        list.push(block)
        byInput.set(block.inputStart, list)
      }
      for (const blocks of byInput.values()) {
        const writes = blocks.reduce((sum, block) => sum + (block.end - block.start), 0)
        if (writes < 2) continue
        inputs++
        const barrier = blocks.find((block) => block.barrier)
        if (!barrier) {
          ranked++
          continue
        }
        reasons.set(barrier.barrier, (reasons.get(barrier.barrier) ?? 0) + 1)
        const seen = examples.get(barrier.barrier) ?? new Map()
        seen.set(barrier.candidate, (seen.get(barrier.candidate) ?? 0) + 1)
        examples.set(barrier.barrier, seen)
      }
    }
  }
}

const report = {
  files: files.length,
  failedFiles,
  candidates: names.size,
  inputs,
  ranked,
  authoredOrder: inputs - ranked,
  rankedPercent: inputs ? Math.round((ranked / inputs) * 1000) / 10 : 0,
  barriers: [...reasons]
    .sort((a, b) => b[1] - a[1])
    .map(([reason, count]) => ({
      reason,
      inputs: count,
      top: [...examples.get(reason)]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([candidate, n]) => `${candidate} (${n})`),
    })),
}
if (process.argv.includes('--json')) console.log(JSON.stringify(report, null, 2))
else {
  console.log(
    `${report.ranked} of ${report.inputs} multi-write Tailwind inputs ranked (${report.rankedPercent}%) across ${report.files} files; ${report.failedFiles} files did not compile standalone.`,
  )
  for (const { reason, inputs: count, top } of report.barriers)
    console.log(`  ${reason}: ${count} -- ${top.join(', ')}`)
}
