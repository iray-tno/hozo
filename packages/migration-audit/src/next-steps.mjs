// What to do first, read off the evidence the rest of the report already holds.
//
// The report is a measurement, and its sections say carefully what each count
// does not prove. That is right for a measurement and leaves someone who wants
// to migrate scrolling past a dozen caveated tables to find the three things
// they should touch first. This section is the ordering, and nothing more: it
// computes no new fact, and each step names the count and the files it came
// from, so it can be checked against the section below that holds it.
//
// Order is by what blocks what. A file that does not parse produces no other
// evidence, an error stops the build, the compat package is one install that
// clears a warning per file, and the remaining steps are review work that can
// go in any order. Warnings are grouped by code and counted by file rather
// than by occurrence: shared files are lowered for both backends, so an
// occurrence count would double most of them.

import { escapeMarkdown } from './evidence.mjs'

const LIMIT = 10
const FILE_SAMPLES = 3

/** The first sentence: enough to recognise the finding; the rest is below. */
function firstSentence(text) {
  const line = String(text ?? '').split('\n')[0]
  return line.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? line
}

/**
 * A code span. Escapes are literal inside one, so `escapeMarkdown` would
 * print its backslashes; only a table's `|` needs one, which GFM honours
 * there, and a backtick in the text takes a longer fence.
 */
function code(text) {
  const inner = String(text).replace(/\r?\n/g, ' ').replaceAll('|', '\\|')
  return inner.includes('`') ? `\`\` ${inner} \`\`` : `\`${inner}\``
}

function fileList(files) {
  const shown = files.slice(0, FILE_SAMPLES).map(code)
  const more = files.length - shown.length
  return more > 0 ? `${shown.join(', ')} and ${more} more` : shown.join(', ')
}

function plural(count, one, many = `${one}s`) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`
}

/** Findings of the given severities, one row per code, most files first. */
function byCode(findings, keep) {
  const codes = new Map()
  for (const finding of findings) {
    if (!keep(finding)) continue
    const entry = codes.get(finding.code) ?? {
      code: finding.code,
      files: new Set(),
      backends: new Set(),
      message: finding.message,
    }
    entry.files.add(finding.file)
    entry.backends.add(finding.backend)
    codes.set(finding.code, entry)
  }
  return [...codes.values()]
    .map((entry) => ({ ...entry, files: [...entry.files].sort(), backends: [...entry.backends] }))
    .sort((a, b) => b.files.length - a.files.length || a.code.localeCompare(b.code))
}

function codeTable(rows) {
  const shown = rows.slice(0, LIMIT)
  const lines = shown.map(
    (row) =>
      `| ${code(row.code)} | ${row.files.length} | ${row.backends.sort().join(', ')} | ${escapeMarkdown(firstSentence(row.message))} | ${fileList(row.files)} |`,
  )
  const rest = rows.length - shown.length
  return `| Code | Files | Backends | Example message | Where |
|---|---:|---|---|---|
${lines.join('\n')}${rest > 0 ? `\n\n${plural(rest, 'more code')} in Diagnostics below.` : ''}`
}

function memberTable(rows) {
  const shown = rows.slice(0, LIMIT)
  const lines = shown.map(
    (row) =>
      `| ${code(`${row.imported}.${row.member ?? '(dynamic)'}`)} | ${row.references} | ${row.files} | ${escapeMarkdown(row.memberContract?.nextAction ?? 'Review the actual API; no member verdict is inferred.')} |`,
  )
  const rest = rows.length - shown.length
  return `| API | References | Files | What to do |
|---|---:|---:|---|
${lines.join('\n')}${rest > 0 ? `\n\n${plural(rest, 'more API')} in the value decisions below.` : ''}`
}

/** The steps that apply to this report, in the order to take them. */
export function nextSteps(report) {
  const findings = report.findings ?? []
  const steps = []

  const failures = report.lowering?.parseOrCompileFailures ?? 0
  if (failures > 0) {
    const samples = report.samples?.parseOrCompileFailures ?? []
    steps.push(
      `**Make ${plural(failures, 'file')} parse.** A file that fails to parse or compile yields no other evidence, so every count below is missing it.${samples.length ? `\n\n${samples.map((sample) => `- ${code(sample)}`).join('\n')}` : ''}`,
    )
  }

  const residue = Object.entries(report.reactNativeJsxResidueImports ?? {})
  if (residue.length > 0) {
    steps.push(
      `**Replace the React Native components left in Web output.** ${plural(report.lowering.filesWithDirectReactNativeJsxResidueOnWeb ?? 0, 'file')} still render ${residue.map(([name, count]) => `${code(name)} (${count})`).join(', ')} from \`react-native\` after lowering. Use the \`@hozo/core\` primitive, or keep the file platform-specific.`,
    )
  }

  const errors = byCode(findings, (finding) => finding.severity === 'error')
  if (errors.length > 0) {
    steps.push(
      `**Fix the errors.** These stop a build that uses the same settings.\n\n${codeTable(errors)}`,
    )
  }

  const compat = byCode(findings, (finding) => finding.code === 'RN_COMPAT_NOT_INSTALLED')[0]
  if (compat) {
    steps.push(
      `**Add \`@hozo/rn-compat\` to the application's dependencies.** Hozo moves React Native APIs such as \`Platform\` and \`Keyboard\` to it in ${plural(compat.files.length, 'file')}, and it is not installed, so those imports would not resolve.`,
    )
  }

  const retained = (report.reactNativeValueDecisions?.inventory ?? []).filter(
    (row) => row.disposition === 'remains-react-native',
  )
  if (retained.length > 0) {
    steps.push(
      `**Decide what replaces the APIs still on React Native.** Hozo does not rewrite these, so on the Web they still need React Native Web or a replacement.\n\n${memberTable(retained)}`,
    )
  }

  const warnings = byCode(
    findings,
    (finding) => finding.severity === 'warning' && finding.code !== 'RN_COMPAT_NOT_INSTALLED',
  )
  if (warnings.length > 0) {
    steps.push(
      `**Review the warnings, most widespread first.** Each is a place where the output may not look or read as the source intends.\n\n${codeTable(warnings)}`,
    )
  }

  const adapted = (report.reactNativeValueDecisions?.inventory ?? []).filter(
    (row) => row.disposition !== 'remains-react-native' && row.memberContract?.nextAction,
  )
  if (adapted.length > 0) {
    steps.push(
      `**Check the APIs Hozo moved to its own adapters.** Each adapter implements a declared subset; confirm the app relies only on that.\n\n${memberTable(adapted)}`,
    )
  }

  return steps
}

export function nextStepsMarkdown(report) {
  const steps = nextSteps(report)
  const body =
    steps.length > 0
      ? steps
          .map((step, index) => `${index + 1}. ${step.replace(/\n(?=.)/g, '\n   ')}`)
          .join('\n\n')
      : 'Nothing in this audit asks for a change. That is the absence of findings, not proof the app renders correctly; see Wrong-output boundary below.'
  return `## Next steps

The order to work in, taken from the sections below; it adds no new measurement.

${body}`
}
