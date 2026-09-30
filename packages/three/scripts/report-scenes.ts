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

Both glTF/PBR fixtures intentionally demonstrate the current portable boundary: their assets load through Three.js's GLTFLoader, then MeshStandardMaterial is rejected with an explicit diagnostic instead of producing misleading flat output. The product-viewer fixture adds a node hierarchy, UVs, a punctual light, and an animation pose. Its glTF material binds a small texture; a fixture-specific raw-pixel decoder supplies identical pixels on Web and Native, exercising glTF texture binding and GPU upload without claiming that host-specific PNG decoding works.

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

This corpus establishes the portable runner and six scenario contracts. It does not yet claim GPU or Native-host scene compatibility. Environment workflows run these same fixtures; their results should drive implementation work rather than a larger row percentage.
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
