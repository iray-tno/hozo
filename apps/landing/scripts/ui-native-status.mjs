// What React Native makes of each @hozo/ui component's look, for the line
// under each /docs/components/ preview (#1165).
//
// The compiler answers it, not this script. `nativeClassReport` reads every
// `className` and `*ClassName` prop in a component's source -- including the
// class lists handed to patterns such as `BottomSheet`, which it does not
// lower -- and says which classes React Native cannot draw. It reads a value
// as far as the file spells it out, which stops at a lookup object
// (`own.track`, `ROOT[edge]`) and at a look module's constants
// (`calendar-look.ts`). So every string literal in the component's file and
// in the look modules it imports also goes through `nativeClassVerdicts`,
// the same verdict for loose class names. In @hozo/ui's sources the string
// literals are the class lists; a label or a path resolves to no utility.
//
// `dev`, `build` and `test:build` run it before Astro and write
// `src/data/ui-native-status.json`, which git ignores. It used to be
// committed and checked, and then a change to a component's Native half
// (in `@hozo/form`, say) and a landing change could each pass CI and still
// leave main with a stale file once both merged. Generating it from the
// source being built has nothing to fall behind.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  nativeClassesDrawnStatically,
  nativeClassReport,
  nativeClassVerdicts,
} from '@hozo/compiler'
import ts from 'typescript'
import { unappliedOnNative } from './ui-native-unapplied.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const landing = path.resolve(here, '..')
const ui = path.resolve(landing, '../../packages/ui/src')
const pages = path.join(landing, 'src/content/docs/docs/components')
const out = path.join(landing, 'src/data/ui-native-status.json')

// A page's component lives in the file of the same name, except these. An
// `element` narrows a file that draws two components to the one the page is
// about; such a file keeps to the report, which knows which element a class
// is on, where the literals cannot say.
const SOURCES = {
  'resizable-pane': [{ file: 'splitter.tsx' }],
  checkbox: [{ file: 'toggle.tsx', element: 'CheckboxPattern' }],
  switch: [{ file: 'toggle.tsx', element: 'SwitchPattern' }],
  'radio-group': [{ file: 'radio.tsx' }],
  alert: [{ file: 'status.tsx', element: 'AlertPattern' }],
  badge: [{ file: 'status.tsx', element: 'Badge' }],
  form: [{ file: 'form.tsx' }, { file: 'field.tsx' }],
}

/** Every string literal and template piece in a module, comments excluded. */
function stringLiterals(file, source) {
  const found = []
  const visit = (node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node)
    ) {
      found.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX))
  return found
}

function verdicts(file, source) {
  const names = [
    ...new Set(
      stringLiterals(file, source)
        .flatMap((list) => list.split(/\s+/))
        .filter(Boolean),
    ),
  ]
  return nativeClassVerdicts(names).flatMap((verdict, at) =>
    verdict ? [{ prop: file, className: names[at], ...verdict }] : [],
  )
}

function findings(file, element) {
  const source = readFileSync(path.join(ui, file), 'utf8')
  const found = nativeClassReport(source)
    .filter((finding) => !element || finding.element === element)
    .map(({ prop, className, kind, reason }) => ({ prop, className, kind, reason }))
  // The report already left out what the compiler draws where it is written
  // (`max-h-[85vh]`, `backdrop:` on a Dialog, #1313); the loose literals
  // carry the same classes and must not put them back.
  const drawn = new Set(nativeClassesDrawnStatically(source))
  if (!element) found.push(...verdicts(file, source).filter((entry) => !drawn.has(entry.className)))
  for (const [, local] of source.matchAll(/from '\.\/([^']+\.ts)'/g)) {
    found.push(...verdicts(local, readFileSync(path.join(ui, local), 'utf8')))
  }
  return found
}

const status = {}
for (const page of readdirSync(pages)
  .map((name) => name.replace(/\.mdx?$/, ''))
  .filter((name) => name !== 'index')
  .sort()) {
  const all = (SOURCES[page] ?? [{ file: `${page}.tsx` }]).flatMap(({ file, element }) =>
    findings(file, element),
  )
  const unique = all.filter(
    (finding, at) => all.findIndex((other) => other.className === finding.className) === at,
  )
  const of = (kind) =>
    unique
      .filter((finding) => finding.kind === kind)
      .map(({ className, reason }) => ({ className, reason }))
  // The other way a look goes missing: class props the pattern's Native half
  // accepts and does not apply (`ui-native-unapplied.mjs`).
  const unapplied = [
    ...new Set(
      (SOURCES[page] ?? [{ file: `${page}.tsx` }]).flatMap(({ file, element }) =>
        unappliedOnNative(path.resolve(ui, '../../..'), path.join(ui, file), element).map(
          (entry) => entry.prop,
        ),
      ),
    ),
  ]
  status[page] = { missing: of('missing'), cosmetic: of('cosmetic'), unapplied }
}

// `src/data/` holds only generated files, so a fresh checkout has no such
// directory.
mkdirSync(path.dirname(out), { recursive: true })
writeFileSync(out, `${JSON.stringify(status, null, 2)}\n`)
console.log(`UI native status: wrote ${Object.keys(status).length} pages`)
