// Decision 013's corpus count: what the route changes in this repository's
// own Native components, against ordinary lowering. Run from the repository
// root: `node packages/tailwind-conformance/src/text-inheritance-unified-corpus.ts`.
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createCompiler } from '../../compiler/src/index.ts'

const ROOTS = [
  'packages/ui/src',
  'packages/patterns/src',
  'packages/form/src',
  'packages/typography/src',
  'examples',
  'apps/landing/src',
]

// Tracked files only: a build or test run leaves generated `.tsx` behind.
const files = execFileSync('git', ['ls-files', '--', ...ROOTS.map((root) => `${root}/*.tsx`)], {
  encoding: 'utf8',
})
  .split('\n')
  .filter((file) => file && !/\.(test|stories|web)\.tsx$/.test(file))

const compiler = createCompiler()
const count = {
  files: 0,
  components: 0,
  unchanged: 0,
  withReader: 0,
  withScope: 0,
  readers: 0,
  opaqueReaders: 0,
  scopes: 0,
  plainTextsKept: 0,
  errorsAdded: 0,
}
const occurrences = (text: string, pattern: RegExp) => text.match(pattern)?.length ?? 0
const output = (c: { jsx: string; styles: string; runtimeImports: string[] }) =>
  JSON.stringify([c.jsx, c.styles, c.runtimeImports])
const errors = (c: { diagnostics: { severity: string; message: string }[] }) =>
  c.diagnostics.filter((d) => d.severity === 'error').map((d) => d.message)

for (const file of files.sort()) {
  const source = readFileSync(file, 'utf8')
  let ordinary: ReturnType<typeof compiler.compileNativeModule>
  try {
    ordinary = compiler.compileNativeModule(source, undefined, file)
  } catch {
    continue
  }
  const unified = compiler.compileNativeModule(source, undefined, file, { textUnified: true })
  count.files++
  unified.components.forEach((component, index) => {
    const before = ordinary.components[index]!
    count.components++
    if (output(component) === output(before)) count.unchanged++
    const readers = occurrences(component.jsx, /<HozoInheritedLeafText[\s>]/g)
    const scopes = occurrences(component.jsx, /<HozoInheritedScope[\s>]/g)
    count.readers += readers
    count.opaqueReaders += occurrences(component.jsx, /<HozoInheritedLeafText[^>]* hozoOpaque/g)
    count.scopes += scopes
    if (readers) count.withReader++
    if (scopes) count.withScope++
    count.plainTextsKept += occurrences(component.jsx, /<Text[\s>]/g)
    if (errors(component).length > errors(before).length) count.errorsAdded++
  })
}
console.log(JSON.stringify(count, null, 2))
