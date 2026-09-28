import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { runSceneCorpus, type SceneCorpusFixtureResult } from './scene-corpus.ts'

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const markdownOutput = path.join(packageRoot, 'scene-conformance.md')
const jsonOutput = path.join(packageRoot, 'scene-conformance.json')
const check = process.argv.includes('--check')
const escapeCell = (value: string) => value.replaceAll('|', '\\|').replaceAll('\n', ' ')

const report = await runSceneCorpus()
const json = `${JSON.stringify(report, null, 2)}\n`

function familyCell(
  fixture: SceneCorpusFixtureResult,
  family: keyof SceneCorpusFixtureResult['families'],
) {
  const result = fixture.families[family]
  return result.reason ? `${result.status} — ${result.reason}` : result.status
}

const markdown = `# Three.js real-scene coverage

Generated against ${report.generatedAgainst}. The machine-readable form is [scene-conformance.json](./scene-conformance.json).

This report executes representative, version-pinned scenes instead of treating an API inventory as an application success rate. A fixture is verified when its observed output and diagnostics match its pinned expectation. Renderer families are reported separately: **not-run is unknown, not success**.

## Summary

- Portable: **${report.summary.useful} useful**, **${report.summary.diagnostic} safely diagnostic**, **${report.summary.failed} failed** across ${report.fixtures.length} fixtures.
- Classic WebGL: **${report.summary.notRunByFamily['classic-webgl']} not run**.
- Modern WebGPU-family: **${report.summary.notRunByFamily['modern-webgpu']} not run**.
- Native host: **${report.summary.notRunByFamily['native-host']} not run**.

The checked-in report remains deterministic and therefore leaves driver-backed families as not-run. The separate \`test:gpu\` artifact executes these exact fixtures in Classic WebGL, Modern forced-WebGL 2, and native WebGPU when available on main, weekly, and on demand; its result is environment evidence rather than a value copied into this file.

The ordinary glTF/PBR fixture intentionally demonstrates the current portable boundary: the asset is loaded through Three.js's GLTFLoader, then its MeshStandardMaterial is rejected with an explicit diagnostic instead of producing misleading flat output.

## Fixtures

| Fixture | Source/version | Exercises | Portable | Classic WebGL | Modern WebGPU-family | Native host | Observation |
| --- | --- | --- | --- | --- | --- | --- | --- |
${report.fixtures
  .map(
    (fixture) =>
      `| ${escapeCell(fixture.archetype)} | ${escapeCell(`${fixture.source.location} (${fixture.source.version})`)} | ${escapeCell(fixture.exercises.join(', '))} | ${escapeCell(familyCell(fixture, 'portable'))} | ${escapeCell(familyCell(fixture, 'classic-webgl'))} | ${escapeCell(familyCell(fixture, 'modern-webgpu'))} | ${escapeCell(familyCell(fixture, 'native-host'))} | ${fixture.portableObservation.outputNodes} nodes; ${fixture.portableObservation.namedObjects} named objects; diagnostics: ${fixture.portableObservation.diagnosticCodes.join(', ') || 'none'} |`,
  )
  .join('\n')}

## Interpretation

This first corpus establishes the portable runner and five scenario contracts. It does not yet claim GPU or Native-host scene compatibility. Subsequent work should run these exact fixtures in each renderer family, then use named corpus failures—not a larger row percentage—to choose implementation work.
`

function checkFile(output: string, expected: string): boolean {
  try {
    return readFileSync(output, 'utf8') === expected
  } catch {
    return false
  }
}

if (check) {
  const current = checkFile(markdownOutput, markdown) && checkFile(jsonOutput, json)
  if (!current) {
    console.error('Three.js real-scene reports are stale. Run pnpm --filter @hozo/three report.')
    process.exit(1)
  }
  console.log(`${report.generatedAgainst} real-scene reports are current.`)
} else {
  writeFileSync(markdownOutput, markdown)
  writeFileSync(jsonOutput, json)
  console.log(`Wrote Three.js real-scene reports for ${report.generatedAgainst}.`)
}
