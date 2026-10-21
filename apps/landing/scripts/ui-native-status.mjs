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
//     node scripts/ui-native-status.mjs           write src/data/ui-native-status.json
//     node scripts/ui-native-status.mjs --check   fail if it is out of date

import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { nativeClassReport, nativeClassVerdicts } from '@hozo/compiler'
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
  if (!element) found.push(...verdicts(file, source))
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

const text = `${JSON.stringify(status, null, 2)}\n`
if (process.argv.includes('--check')) {
  // Compared as data: `pnpm lint:fix` formats the JSON file its own way.
  let current = ''
  try {
    current = JSON.stringify(JSON.parse(readFileSync(out, 'utf8')))
  } catch {}
  if (current !== JSON.stringify(status)) {
    console.error('ui-native-status.json is out of date: run node scripts/ui-native-status.mjs')
    process.exit(1)
  }
  console.log(`UI native status: current for ${Object.keys(status).length} pages`)
} else {
  writeFileSync(out, text)
  console.log(`UI native status: wrote ${Object.keys(status).length} pages`)
}
