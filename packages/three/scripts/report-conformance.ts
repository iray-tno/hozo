import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { REVISION } from 'three'

import {
  PORTABLE_GEOMETRY_CAPABILITIES,
  PORTABLE_MATERIAL_CAPABILITIES,
  PORTABLE_OBJECT_CAPABILITIES,
  PORTABLE_SCENE_CAPABILITIES,
  type PortableCapability,
  summarizePortableCapabilities,
} from './capabilities.ts'
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

function surfaceTable(cases: readonly ThreeConformanceCase[]): string {
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

function capabilityTable(capabilities: readonly PortableCapability[]): string {
  return [
    '| Owner | Capability | Status | Behaviour | Test |',
    '| --- | --- | --- | --- | --- |',
    ...capabilities.map((entry) => {
      const tests = entry.tests
        .map((reference) => `[test](${reference.file}) \`${escapeCell(reference.title)}\``)
        .join('<br>')
      return `| ${escapeCell(entry.owner)} | ${escapeCell(entry.capability)} | ${entry.status} | ${escapeCell(entry.detail)} | ${tests} |`
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
const materialCapabilities = summarizePortableCapabilities(PORTABLE_MATERIAL_CAPABILITIES)
const geometryCapabilities = summarizePortableCapabilities(PORTABLE_GEOMETRY_CAPABILITIES)
const objectCapabilities = summarizePortableCapabilities(PORTABLE_OBJECT_CAPABILITIES)
const sceneCapabilities = summarizePortableCapabilities(PORTABLE_SCENE_CAPABILITIES)
const capabilitySummaryRow = (
  label: string,
  summary: ReturnType<typeof summarizePortableCapabilities>,
) =>
  `| **${label}** | **${summary.exact}** | **${summary.approximate}** | **${summary.deferred}** | **${summary.feasible}** | **${summary.implemented}/${summary.feasible} (${pct(summary.implemented, summary.feasible)})** | **${summary.diagnostic}** | **${summary.silent}** |`

const markdown = `# Three.js coverage

Generated against Three.js r${REVISION}. Run \`pnpm --filter @hozo/three report\` to update this file and add \`--check\` to verify it without writing.

This report keeps three different questions separate:

1. **Portable capability coverage** asks which atomic behaviours can be implemented faithfully or approximately without a GPU.
2. **Three.js surface classification** asks what happens when an upstream class or public surface reaches the portable backend.
3. **Real-scene coverage** will measure representative applications and assets. That corpus is not published yet.

Neither table below is a claim that an arbitrary Three.js scene works. In particular, class-level surface rows and atomic capability rows have different denominators and must not be added together.

## Portable capability coverage

Capability status has stricter semantics than the class-level surface table:

- **Exact** reproduces the named atomic behaviour within its stated contract.
- **Approximate** is implemented and useful, with a documented rendering difference.
- **Deferred** appears feasible for the portable CPU/Canvas path but is not implemented yet.
- **Diagnostic** requires a GPU pipeline or is deliberately outside the portable contract and is safely rejected.
- **Silent** accepts the input while losing its semantics without a diagnostic. The target is zero.

### Inventoried categories

Material, geometry, objects, and scene composition are complete as independently owned capability categories. Cameras, interaction, animation, and other categories remain to be inventoried before an overall figure is valid. Cross-cutting colour, texture, transparency, and normal-shading behaviour belongs to material; geometry owns shape traversal, deformation, transforms, and clipping; objects own discovery, selection, routing, and source identity; scene owns traversal policy, composition, backgrounds, ordering, and fog. This prevents a future overall denominator from counting the same behaviour twice.

| Scope | Exact | Approximate | Deferred | Feasible | Implemented feasible | Diagnostic | Silent |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${capabilitySummaryRow('Material', materialCapabilities)}
${capabilitySummaryRow('Geometry', geometryCapabilities)}
${capabilitySummaryRow('Object', objectCapabilities)}
${capabilitySummaryRow('Scene', sceneCapabilities)}

Approximate capabilities count as implemented but remain visible rather than being folded into exact. These category percentages are not combined while the inventory is incomplete.

### Material capability details

${capabilityTable(PORTABLE_MATERIAL_CAPABILITIES)}

### Geometry capability details

${capabilityTable(PORTABLE_GEOMETRY_CAPABILITIES)}

### Object capability details

${capabilityTable(PORTABLE_OBJECT_CAPABILITIES)}

### Scene capability details

${capabilityTable(PORTABLE_SCENE_CAPABILITIES)}

## Three.js surface classification

This measures the version-audited upstream surface presented to the portable Hozo Canvas backend. It deliberately separates compatibility from safe refusal:

- **Exact** counts rows implemented without a named restriction.
- **Usable** adds partial implementations with documented restrictions.
- **Safe** adds unsupported inputs that produce a diagnostic instead of misleading output.
- **Silent** is a known semantic loss with no diagnostic. These are the highest-priority gaps.
- **Out of scope** is excluded from every percentage.

The rows are an unweighted API surface. The overall Three.js surface figure excludes Hozo's additional interaction contract, which remains visible as its own category. A later corpus report should weight the upstream rows by real scene usage; ordinary glTF scenes rely heavily on \`MeshStandardMaterial\`, so this table must not be read as a real-model success rate.

### Summary

| Category | Exact | Usable | Safe | Silent | Out of scope |
| --- | ---: | ---: | ---: | ---: | ---: |
${categoryRows.join('\n')}
| **Class-level surface** | **${overall.exact}/${overall.inScope} (${pct(overall.exact, overall.inScope)})** | **${overall.usable}/${overall.inScope} (${pct(overall.usable, overall.inScope)})** | **${overall.safe}/${overall.inScope} (${pct(overall.safe, overall.inScope)})** | **${overall.silent}** | **${overall.outOfScope}** |

### Detailed surface

${categories
  .map(
    (category) =>
      `#### ${category}\n\n${surfaceTable(THREE_CONFORMANCE_CASES.filter((entry) => entry.category === category))}`,
  )
  .join('\n\n')}

## Interpretation

Topology surface coverage can be complete while general Three.js compatibility remains low. The portable backend handles every core primitive topology and a deliberately constrained affine colour map, but general GPU materials, texture sampling, lighting, and per-pixel depth remain separate work. The capability inventory makes approximation and feasible-but-deferred work explicit; the surface table records safe rejection of upstream classes. The silent count stays visible in both models so that raising a percentage cannot hide accepted input whose semantics are lost.
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
