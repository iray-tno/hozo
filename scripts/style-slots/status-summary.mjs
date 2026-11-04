import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const cell = (value) =>
  String(value ?? '—')
    .replaceAll('|', '\\|')
    .replace(/\r?\n/g, ' ')

export function renderStylingFactSummary(report) {
  if (report?.schema !== 1 || !Array.isArray(report.scopedDenominators))
    throw new Error('Expected a styling fact status report with scoped denominators')
  const lines = [
    '## RFC 010 styling evidence',
    '',
    `Source: \`${cell(report.sourceCommit)}\`${report.trackedChanges ? ' (tracked changes)' : ''}`,
    '',
    '| Scope | Platform | Unit | Verified | Expected | Status |',
    '| --- | --- | --- | ---: | ---: | --- |',
    ...report.scopedDenominators.map(
      (row) =>
        `| ${[row.id, row.platform, row.unit, row.verified, row.expected, row.status].map(cell).join(' | ')} |`,
    ),
    '',
    'These are separate fixture denominators. Do not sum rows or interpret them as coverage percentages.',
    'A dash means no verified count. Native host models are not device observations.',
    '',
    'Global coverage, fidelity, diagnostic completeness and contract audit are not established by this report.',
    '',
  ]
  const bundle = report.scopedDenominators.find(({ id }) => id === 'native-component-bundle')
  if (bundle?.status === 'measured') {
    const observation = report.observations.find((row) => row.scope === bundle.scope)
    lines.push(
      `External-peer component bundle delta (prepared minus opaque): ${observation.delta.bytes} bytes, ${observation.delta.gzipBytes} gzip bytes. Not an app bundle budget.`,
      '',
    )
  }
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input || process.argv.length !== 3)
    throw new Error('Usage: status-summary.mjs <status.json>')
  console.log(renderStylingFactSummary(JSON.parse(readFileSync(input, 'utf8'))))
}
