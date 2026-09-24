import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { REVISION } from 'three'

import {
  summarizeThreeConformance,
  THREE_CONFORMANCE_CASES,
  type ThreeConformanceCase,
} from './conformance.ts'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const output = path.join(packageRoot, 'conformance.md')
const check = process.argv.includes('--check')
const pct = (value: number, total: number) =>
  total === 0 ? '—' : `${((value / total) * 100).toFixed(1)}%`
const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')

function table(cases: readonly ThreeConformanceCase[]): string {
  return [
    '| Feature | Status | Behaviour | Test |',
    '| --- | --- | --- | --- |',
    ...cases.map((entry) => {
      const tests =
        entry.tests
          ?.map((reference) => `[test](${reference.file}) \`${escapeCell(reference.title)}\``)
          .join('<br>') ?? '—'
      return `| ${escapeCell(entry.feature)} | ${entry.status} | ${escapeCell(entry.detail)} | ${tests} |`
    }),
  ].join('\n')
}

const categories = [...new Set(THREE_CONFORMANCE_CASES.map((entry) => entry.category))]
const overall = summarizeThreeConformance(
  THREE_CONFORMANCE_CASES.filter((entry) => entry.category !== 'interaction'),
)
const categoryRows = categories.map((category) => {
  const summary = summarizeThreeConformance(
    THREE_CONFORMANCE_CASES.filter((entry) => entry.category === category),
  )
  return `| ${category} | ${summary.exact}/${summary.inScope} (${pct(summary.exact, summary.inScope)}) | ${summary.usable}/${summary.inScope} (${pct(summary.usable, summary.inScope)}) | ${summary.safe}/${summary.inScope} (${pct(summary.safe, summary.inScope)}) | ${summary.silent} | ${summary.outOfScope} |`
})

const markdown = `# Three.js portable conformance

Generated against Three.js r${REVISION}. Run \`pnpm --filter @hozo/three report\` to update this file and add \`--check\` to verify it without writing.

This measures the portable Hozo Canvas backend, not Three.js as a whole. It deliberately separates compatibility from safe refusal:

- **Exact** counts rows implemented without a named restriction.
- **Usable** adds partial implementations with documented restrictions.
- **Safe** adds unsupported inputs that produce a diagnostic instead of misleading output.
- **Silent** is a known semantic loss with no diagnostic. These are the highest-priority gaps.
- **Out of scope** is excluded from every percentage.

The rows are an unweighted API surface. The overall Three.js figure excludes Hozo's additional interaction contract, which remains visible as its own category. A later corpus report should weight the upstream rows by real scene usage; ordinary glTF scenes rely heavily on \`MeshStandardMaterial\`, so this table must not be read as a real-model success rate.

## Summary

| Category | Exact | Usable | Safe | Silent | Out of scope |
| --- | ---: | ---: | ---: | ---: | ---: |
${categoryRows.join('\n')}
| **Three.js surface** | **${overall.exact}/${overall.inScope} (${pct(overall.exact, overall.inScope)})** | **${overall.usable}/${overall.inScope} (${pct(overall.usable, overall.inScope)})** | **${overall.safe}/${overall.inScope} (${pct(overall.safe, overall.inScope)})** | **${overall.silent}** | **${overall.outOfScope}** |

## Detailed surface

${categories
  .map(
    (category) =>
      `### ${category}\n\n${table(THREE_CONFORMANCE_CASES.filter((entry) => entry.category === category))}`,
  )
  .join('\n\n')}

## Interpretation

Topology coverage can be complete while general Three.js compatibility remains low. The portable backend handles every core primitive topology, but GPU materials, textures, lighting, skinning, instancing, and per-pixel depth remain separate work. The silent count is intentionally visible: raising the usable percentage must not hide accepted input whose semantics are lost.
`

if (!check && process.env.CI) {
  console.error('Refusing to rewrite the Three.js conformance report in CI; pass --check.')
  process.exit(1)
}

if (check) {
  let existing = ''
  try {
    existing = readFileSync(output, 'utf8')
  } catch {
    console.error(
      `Missing ${path.relative(process.cwd(), output)}. Run the report without --check.`,
    )
    process.exit(1)
  }
  if (existing !== markdown) {
    console.error(
      `${path.relative(process.cwd(), output)} is stale. Run pnpm --filter @hozo/three report and commit the result.`,
    )
    process.exit(1)
  }
  console.log(`Three.js r${REVISION} conformance report is current.`)
} else {
  writeFileSync(output, markdown)
  console.log(`Wrote ${path.relative(process.cwd(), output)} for Three.js r${REVISION}.`)
}
