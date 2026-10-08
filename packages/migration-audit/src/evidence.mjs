import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { getCompilerBindingIdentity } from '@hozo/compiler'

const require = createRequire(import.meta.url)

export function sha256(contents) {
  return createHash('sha256').update(contents).digest('hex')
}

export function toolchainEvidence() {
  const binding = getCompilerBindingIdentity()
  const themeRequire = createRequire(require.resolve('@hozo/tailwind/package.json'))
  const compilerRequire = createRequire(require.resolve('@hozo/compiler/package.json'))
  return {
    auditVersion: JSON.parse(readFileSync(new URL('../package.json', import.meta.url))).version,
    compilerVersion: require('@hozo/compiler/package.json').version,
    themeLoaderVersion: themeRequire('@hozo/tailwind/package.json').version,
    tailwindVersion: themeRequire('tailwindcss/package.json').version,
    cssParserVersion: themeRequire('postcss/package.json').version,
    configParserVersion: compilerRequire('jsonc-parser/package.json').version,
    nodeVersion: process.version,
    binding: { ...binding, sha256: sha256(readFileSync(binding.path)) },
  }
}

export function recordAnalysis(report, analysis, file, source, platform) {
  if (Object.values(analysis.targets).some((target) => target.status === 'failed')) {
    report._compileFailures.add(file)
  }
  report.files.push({
    file,
    platform,
    sourceSha256: sha256(source),
    bindingsStatus: analysis.bindings ? 'completed' : 'failed',
    reactNativeUsage: analysis.reactNativeUsage ?? { status: 'failed', bindings: [] },
    targets: Object.fromEntries(
      Object.entries(analysis.targets).map(([target, { code: _code, ...outcome }]) => [
        target,
        outcome,
      ]),
    ),
    stages: analysis.stages,
  })
  // Count compiler-resolved authored references, not spelling matches or
  // dependency survival. Import movement will be a separate compiler fact.
  const usage = analysis.reactNativeUsage
  const census = (report.reactNativeUsage ??= {
    mode: 'authored-esm-symbols',
    rewriteDecisions: 'not-assessed',
    limitations: [
      'CommonJS require, dynamic import, TS import-equals, and indirect wrapper modules are not inventoried.',
      'No alias/data-flow propagation beyond the directly imported symbol.',
      'Observed members are not adapter compatibility, build, dependency-removal, or runtime evidence.',
    ],
    filesAssessed: 0,
    filesNotAssessed: 0,
    importBindings: 0,
    explicitTypeImports: 0,
    importsUsedOnlyAsTypes: 0,
    unusedValueImports: 0,
    runtimeReferences: 0,
    typeReferences: 0,
    dynamicMemberReferences: 0,
    runtimeReexports: 0,
    typeReexports: 0,
    sideEffectImports: 0,
  })
  if (usage?.status === 'completed') {
    census.filesAssessed += 1
    for (const binding of usage.bindings) {
      const runtime = binding.references.filter((reference) => reference.kind === 'runtime')
      const types = binding.references.filter((reference) => reference.kind === 'type')
      census.runtimeReferences += runtime.length
      census.typeReferences += types.length
      census.dynamicMemberReferences += runtime.filter(
        (reference) => reference.access === 'dynamic-member',
      ).length
      if (binding.kind === 'reexport')
        census[binding.typeOnly ? 'typeReexports' : 'runtimeReexports'] += 1
      else if (binding.kind === 'side-effect') census.sideEffectImports += 1
      else {
        census.importBindings += 1
        if (binding.typeOnly) census.explicitTypeImports += 1
        else if (runtime.length === 0 && types.length > 0) census.importsUsedOnlyAsTypes += 1
        else if (runtime.length === 0) census.unusedValueImports += 1
      }
    }
  } else census.filesNotAssessed += 1
  for (const stage of analysis.stages) {
    const key = `${stage.backend}:${stage.stage}`
    report.analysis.stageDurationMs[key] =
      (report.analysis.stageDurationMs[key] ?? 0) + stage.durationMs
    if (stage.status === 'failed') report._compileFailures.add(file)
  }
  for (const finding of analysis.findings) {
    // This is a content hint for later baseline matching, not a unique ID.
    // Identical findings can intentionally share it; location is display data.
    const fingerprint = sha256(
      JSON.stringify([file, finding.backend, finding.code, finding.message, finding.subject]),
    )
    report.findings.push({ file, ...finding, fingerprint })
    const { code, severity } = finding
    report.diagnostics.byCode[code] = (report.diagnostics.byCode[code] ?? 0) + 1
    report.diagnostics.bySeverity[severity] = (report.diagnostics.bySeverity[severity] ?? 0) + 1
    if (severity === 'error') report._filesWithErrors.add(file)
    else if (severity === 'warning') report._filesWithWarnings.add(file)
    const samples = (report.samples[`diagnostic:${code}`] ??= [])
    if (samples.length < 12 && !samples.includes(file)) samples.push(file)
    if (code === 'ANALYSIS_FAILED') {
      const failures = (report.samples.parseOrCompileFailures ??= [])
      if (failures.length < 12)
        failures.push(`${file} [${finding.backend}]: ${finding.message.split('\n')[0]}`)
    }
  }
}

function escapeMarkdown(text) {
  return String(text).replace(/[\\`*_{}[\]<>()#!|]/g, '\\$&')
}

export function findingDetails(report, details) {
  const findings = report.findings ?? []
  if (!details) {
    return `${findings.length} complete finding records are available in JSON. Use --details to expand Markdown findings.`
  }
  return (
    findings
      .map((finding) => {
        const { location } = finding
        const where =
          location.status === 'authored'
            ? `${finding.file}:${location.line}:${location.column}`
            : `${finding.file} (${location.status === 'file' ? 'module-wide' : 'authored location unmapped'})`
        return `- ${escapeMarkdown(where)} — ${finding.backend}/${finding.stage}, ${finding.severity}, ${escapeMarkdown(finding.code)}: ${escapeMarkdown(finding.message).replace(/\r?\n/g, ' ')}${finding.subject?.snippet ? `\n  - Authored evidence: ${escapeMarkdown(finding.subject.snippet)}` : ''}`
      })
      .join('\n') || 'No findings.'
  )
}
