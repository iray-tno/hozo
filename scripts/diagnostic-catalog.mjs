// The diagnostic catalog `hozo explain` reads (RFC 011 §5), shipped as
// `@hozo/compiler/diagnostics.json`.
//
// Each code the compiler declares gets three things, none of them written
// here:
//   - `summary`: the doc comment on its `DiagnosticCode` variant in
//     `crates/hozo_ir`, which is where the reason for the check is kept;
//   - `example`: the source the conformance report provokes it with (#1548);
//   - `emitted`: what the compiler actually says about that source, which
//     is the message a user sees and says what to change.
// So the catalog is a view of the compiler and the conformance cases, and
// it goes stale only when one of them changes without regenerating it.
// `packages/tailwind-conformance/src/diagnostics.test.ts` fails then.
//
//   node scripts/diagnostic-catalog.mjs          # write
//   node scripts/diagnostic-catalog.mjs --check  # exit 1 when stale
//
// It compiles each example, so the native addon must be built.

import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const catalogFile = path.join(root, 'packages', 'compiler', 'diagnostics.json')

/** Each variant's doc comment, keyed by the code `as_str` spells it as. */
function summaries() {
  const source = readFileSync(path.join(root, 'crates', 'hozo_ir', 'src', 'lib.rs'), 'utf8')
  const enumBody = source.match(/pub enum DiagnosticCode \{\n([\s\S]*?)\n\}/)?.[1]
  if (!enumBody) throw new Error('`pub enum DiagnosticCode` not found in hozo_ir')
  const docs = new Map()
  let comment = []
  for (const line of enumBody.split('\n')) {
    const doc = line.match(/^\s*\/\/\/ ?(.*)$/)
    if (doc) comment.push(doc[1])
    else if (/^\s*(\w+),\s*$/.test(line)) {
      docs.set(line.trim().slice(0, -1), comment)
      comment = []
    } else if (line.trim() && !line.trim().startsWith('//')) comment = []
  }
  const codes = new Map()
  for (const [, variant, code] of source.matchAll(/DiagnosticCode::(\w+)\s*=>\s*"([A-Z0-9_]+)"/g))
    codes.set(code, variant)
  // Paragraphs stay paragraphs; the lines inside one are rejoined.
  const prose = (lines) =>
    lines
      .join('\n')
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.replace(/\s*\n\s*/g, ' ').trim())
      .filter(Boolean)
      .join('\n\n')
  return new Map([...codes].map(([code, variant]) => [code, prose(docs.get(variant) ?? [])]))
}

export async function buildCatalog() {
  const { declaredDiagnosticCodes, diagnosticExample } = await import(
    '../packages/tailwind-conformance/src/diagnostics.ts'
  )
  const summary = summaries()
  const codes = {}
  for (const code of declaredDiagnosticCodes()) {
    const example = diagnosticExample(code)
    codes[code] = {
      summary: summary.get(code) ?? '',
      ...(example && 'unreachable' in example
        ? { unreachable: example.unreachable }
        : example
          ? {
              example: {
                ...(example.module ? { module: example.module } : { jsx: example.jsx }),
                backend: example.backend,
              },
              emitted: example.emitted,
            }
          : {}),
    }
  }
  return `${JSON.stringify({ schemaVersion: 1, codes }, null, 2)}\n`
}

if (import.meta.filename === process.argv[1]) {
  const text = await buildCatalog()
  const shown = path.relative(root, catalogFile)
  if (process.argv.includes('--check')) {
    let current
    try {
      current = readFileSync(catalogFile, 'utf8')
    } catch {}
    if (current !== text) {
      console.error(`${shown} is out of date. Run: node scripts/diagnostic-catalog.mjs`)
      process.exit(1)
    }
    console.log(`${shown} is current`)
  } else {
    writeFileSync(catalogFile, text)
    console.log(`wrote ${shown}`)
  }
}
