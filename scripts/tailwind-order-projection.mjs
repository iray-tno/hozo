// Read-only parity receipt for ordinary Web/Native lowering (#1230).
// Run this script with a freshly built addon before and after an ordering
// change, on the same source corpus. A compile failure is not a zero delta.
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCompiler } from '../packages/compiler/src/index.ts'
import { prepareTailwindOrder, tailwindPackageDir } from '../packages/tailwind/src/theme.ts'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const corpus = ['packages/ui/src', 'packages/patterns/src', 'examples']
const skip =
  /(^|[\\/])(node_modules|dist|build|\.expo|android|ios|generated)([\\/]|$)|\.test\.|\.stories\./
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name)
    if (skip.test(path.relative(root, file)) || name === 'text-inheritance-generated.tsx') continue
    if (statSync(file).isDirectory()) walk(file, out)
    else if (file.endsWith('.tsx')) out.push(file)
  }
  return out
}
const files = corpus.flatMap((dir) => walk(path.join(root, dir))).sort()
const compiler = createCompiler()
const sources = new Map()
const names = new Set()
for (const file of files) {
  const source = readFileSync(file, 'utf8')
  sources.set(file, source)
  for (const { candidate } of compiler.inspectTailwindOrder(source, undefined, file).candidates)
    names.add(candidate)
}

const exampleColors = new Map()
for (const example of readdirSync(path.join(root, 'examples'))) {
  for (const entry of ['global.css', 'src/theme.css']) {
    let text
    try {
      text = readFileSync(path.join(root, 'examples', example, entry), 'utf8')
    } catch (error) {
      if (error.code !== 'ENOENT') throw error
      continue
    }
    for (const [declaration, name] of text.matchAll(/(--color-[\w-]+)\s*:[^;]+;/g))
      if (!exampleColors.has(name)) exampleColors.set(name, declaration)
  }
}
const css = `@import "tailwindcss/theme.css" layer(theme); ${readFileSync(path.join(root, 'packages/ui/src/theme.css'), 'utf8')} @theme { ${[...exampleColors.values()].join(' ')} } @tailwind utilities;`
const prepared = await prepareTailwindOrder(css, tailwindPackageDir(), [...names])
compiler.setTailwindOrder(JSON.stringify(prepared.snapshot))

const digest = createHash('sha256')
let web = 0
let native = 0
for (const [file, source] of sources) {
  const webParts = compiler.compile(source)
  const nativeParts = compiler.compileNativeModule(source, undefined, file).components
  web += webParts.length
  native += nativeParts.length
  digest.update(
    JSON.stringify([
      path.relative(root, file).replaceAll('\\', '/'),
      webParts.map(({ jsx, css, diagnostics }) => [jsx, css, diagnostics]),
      nativeParts.map(({ jsx, styles, diagnostics }) => [jsx, styles, diagnostics]),
    ]),
  )
}
console.log(JSON.stringify({ files: files.length, web, native, sha256: digest.digest('hex') }))
