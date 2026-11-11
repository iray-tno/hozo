// What the ordering outside the shared plan still decides in this
// repository (RFC 007, #1230): the remaining Native condition-weight sort.
//
// Every file of the coverage corpus is compiled twice, for Web and Native,
// with the Native sort on and off (`setLegacyOrderingForMeasurement`), in
// the same Tailwind context as `tailwind-order-coverage.mjs`. A component
// whose output differs is one the old path still decides; the report names
// it with the class lists of the node that changed. The runtime state rank
// is not switched here: it lives in the generated resolver. Web output
// no longer depends on the switch; its reported differences are a control.
//
// Read-only. `--json` prints every difference.
//
//   node scripts/tailwind-order-old-path.mjs [--json]
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { createCompiler, setLegacyOrderingForMeasurement } = await import(
  '../packages/compiler/src/index.ts'
)
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

const compiler = createCompiler()
const sources = new Map()
const names = new Set()
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  sources.set(file, source)
  for (const { candidate } of compiler.inspectTailwindOrder(source, undefined, file).candidates)
    names.add(candidate)
}
// The same measured CSS as the coverage script: Tailwind's theme, @hozo/ui's
// tokens, and the colour names of the examples' own `@theme` blocks.
const exampleColors = new Map()
for (const example of readdirSync(path.join(root, 'examples'))) {
  for (const entry of ['global.css', 'src/theme.css']) {
    let text
    try {
      text = readFileSync(path.join(root, 'examples', example, entry), 'utf8')
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

function compileAll(legacy) {
  setLegacyOrderingForMeasurement(legacy)
  const out = new Map()
  for (const [file, source] of sources) {
    let web
    let native
    try {
      web = compiler.compile(source, undefined, { tailwindPlan: true })
    } catch {
      web = null
    }
    try {
      native = compiler.compileNativeModule(source, undefined, file)
    } catch {
      native = null
    }
    out.set(file, { web, native })
  }
  return out
}
const on = compileAll(true)
const off = compileAll(false)
setLegacyOrderingForMeasurement(true)

const differences = []
for (const file of files) {
  const a = on.get(file)
  const b = off.get(file)
  const rel = path.relative(root, file).replaceAll('\\', '/')
  for (const [index, component] of (a.web ?? []).entries()) {
    const other = b.web?.[index]
    if (!other || other.css === component.css) continue
    // The class lists of the component's sites, to see what the old path
    // decided; with the barrier that kept each one off the plan.
    const sites = (component.tailwindPlan?.sites ?? []).map((site) =>
      site.blocks.map((block) => `${block.candidate}${block.barrier ? `(${block.barrier})` : ''}`),
    )
    differences.push({ file: rel, backend: 'web', component: index, sites })
  }
  const nativeA = a.native?.components ?? []
  const nativeB = b.native?.components ?? []
  for (const [index, component] of nativeA.entries()) {
    const other = nativeB[index]
    if (!other || (other.styles === component.styles && other.jsx === component.jsx)) continue
    differences.push({ file: rel, backend: 'native', component: index })
  }
}

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(differences, null, 2))
} else {
  const count = (backend) => differences.filter((d) => d.backend === backend).length
  // What was compiled, so a zero is a measurement and not a failure to run.
  const webComponents = [...on.values()].reduce((sum, { web }) => sum + (web?.length ?? 0), 0)
  const nativeComponents = [...on.values()].reduce(
    (sum, { native }) => sum + (native?.components.length ?? 0),
    0,
  )
  const failed = [...on.values()].filter(({ web, native }) => !web || !native).length
  console.log(
    `${files.length} files (${webComponents} Web and ${nativeComponents} Native components, ${failed} files failed to compile); the ordering outside the plan changes ${count('web')} Web and ${count('native')} Native components.`,
  )
  for (const difference of differences.slice(0, 20))
    console.log(
      `  ${difference.backend} ${difference.file}#${difference.component}${difference.sites ? ` ${JSON.stringify(difference.sites).slice(0, 200)}` : ''}`,
    )
}
